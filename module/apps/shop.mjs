import { availableShopTabs } from '../data/shop-catalog.mjs';
import { SocketHandler } from '../helpers/socket-handler.mjs';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * shop.mjs
 * --------
 * The equipment shop (ApplicationV2). Browses the equipment compendia one tab
 * per type (driven by the shop-catalog registry), lets the user build a cart
 * with quantities, and on checkout deducts the total from the bound actor's
 * C-bills and adds the purchased items to their inventory.
 *
 * Money model: purchases are blocked unless the actor can afford the cart. A GM
 * "free" toggle bypasses the cost (gifts / GM-placed loot). Search is applied
 * client-side (no re-render) so the field keeps focus while typing; cart
 * mutations re-render the whole application.
 *
 * GM approval: a non-GM shopper cannot check out until a GM approves the current
 * cart. "Request GM Approval" broadcasts the cart to online GMs, who get a
 * confirmation popup; an approval re-enables the Buy button. Any change to the
 * cart (or a completed purchase) invalidates the approval.
 *
 * Hover stats: hovering a catalog row shows a floating card with the item's
 * description and key statistics so the player can see what it does.
 */
export class ShopApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Actor|null} the actor being outfitted */
  #actor = null;
  /** @type {string|null} active tab id */
  #activeTab = null;
  /** @type {string} live search string (client-side filter only) */
  #search = '';
  /** @type {boolean} GM cost-bypass */
  #free = false;
  /** @type {Map<string,{name:string,cost:number,qty:number}>} cart keyed by item uuid */
  #cart = new Map();
  /** @type {Map<string,Array>} per-tab catalog cache */
  #catalogCache = new Map();
  /** @type {Map<string,Item>} resolved-document cache for hover stats */
  #itemCache = new Map();
  /** @type {HTMLElement|null} floating hover-stats card */
  #hoverCard = null;

  /** Approval lifecycle: 'idle' | 'pending' | 'approved' | 'denied'. */
  #approvalState = 'idle';
  /** Monotonic counter used to build unique, invalidatable request ids. */
  #approvalSeq = 0;
  /** The request id currently awaiting a GM response (null when none). */
  #pendingRequestId = null;

  /** Socket event names for the GM-approval handshake. */
  static SHOP_EVENTS = {
    REQUEST: 'shopApprovalRequest',
    RESPONSE: 'shopApprovalResponse'
  };

  /** Open shop instances on this client, so socket responses can find them. */
  static #openInstances = new Set();

  constructor(options = {}) {
    super(options);
    this.#actor = options.actor ?? null;
    ShopApplication.#openInstances.add(this);
  }

  static DEFAULT_OPTIONS = {
    id: 'mf-shop',
    classes: ['mech-foundry', 'mech-foundry-shop'],
    position: { width: 920, height: 720 },
    window: { title: 'Equipment Shop', icon: 'fa-solid fa-cart-shopping', resizable: true },
    actions: {
      selectTab: ShopApplication.#onSelectTab,
      addToCart: ShopApplication.#onAddToCart,
      incCart: ShopApplication.#onIncCart,
      decCart: ShopApplication.#onDecCart,
      removeCart: ShopApplication.#onRemoveCart,
      clearCart: ShopApplication.#onClearCart,
      toggleFree: ShopApplication.#onToggleFree,
      requestApproval: ShopApplication.#onRequestApproval,
      checkout: ShopApplication.#onCheckout
    }
  };

  static PARTS = {
    body: {
      template: 'systems/mech-foundry/templates/apps/shop.hbs',
      scrollable: ['.shop-catalog', '.shop-cart-lines']
    }
  };

  /** @override */
  get title() {
    return this.#actor ? `Equipment Shop — ${this.#actor.name}` : 'Equipment Shop';
  }

  /** @override */
  async close(options) {
    ShopApplication.#openInstances.delete(this);
    this.#hoverCard?.remove();
    this.#hoverCard = null;
    return super.close(options);
  }

  /* ---------------------------------------------------------------------- */
  /*  Socket wiring (GM approval)                                            */
  /* ---------------------------------------------------------------------- */

  /** Register the shop's socket listener. Call once from the `ready` hook. */
  static initSocket() {
    game.socket.on(SocketHandler.SOCKET_NAME, (data) => {
      if (!data || typeof data !== 'object') return;
      if (data.eventType === ShopApplication.SHOP_EVENTS.REQUEST) {
        ShopApplication.#onApprovalRequestReceived(data);
      } else if (data.eventType === ShopApplication.SHOP_EVENTS.RESPONSE) {
        ShopApplication.#onApprovalResponseReceived(data);
      }
    });
  }

  static #emit(eventType, payload) {
    game.socket.emit(SocketHandler.SOCKET_NAME, { eventType, ...payload });
  }

  /** GM side: a player asked to buy — show an approve/deny popup. */
  static async #onApprovalRequestReceived(data) {
    if (!game.user.isGM) return;
    const esc = foundry.utils.escapeHTML;
    const rows = (data.lines || []).map(l =>
      `<tr><td>${esc(String(l.name))}</td><td class="mf-ap-qty">${l.qty}</td>`
      + `<td class="mf-ap-cost">${Number(l.lineCost).toLocaleString()} C</td></tr>`).join('');
    const content = `
      <div class="mf-approval">
        <p><strong>${esc(String(data.fromUserName || 'A player'))}</strong> requests approval to purchase
        equipment for <strong>${esc(String(data.actorName || 'a character'))}</strong>.</p>
        <table class="mf-approval-table">
          <thead><tr><th>Item</th><th class="mf-ap-qty">Qty</th><th class="mf-ap-cost">Cost</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="2">Total</td><td class="mf-ap-cost">${Number(data.subtotal).toLocaleString()} C</td></tr></tfoot>
        </table>
      </div>`;
    let approved = false;
    try {
      approved = await DialogV2.confirm({
        window: { title: 'Purchase Approval', icon: 'fa-solid fa-cart-shopping' },
        content,
        yes: { label: 'Approve', icon: 'fa-solid fa-check' },
        no: { label: 'Deny', icon: 'fa-solid fa-xmark' },
        rejectClose: false,
        modal: false
      }) === true;
    } catch (_e) { approved = false; }
    ShopApplication.#emit(ShopApplication.SHOP_EVENTS.RESPONSE, {
      requestId: data.requestId,
      toUserId: data.fromUserId,
      approved,
      gmId: game.user.id,
      gmName: game.user.name
    });
  }

  /** Shopper side: the GM responded. First response for a request id wins. */
  static #onApprovalResponseReceived(data) {
    if (data.toUserId !== game.user.id) return;
    // Only trust a response that genuinely came from a GM account.
    if (!game.users.get(data.gmId)?.isGM) return;
    for (const app of ShopApplication.#openInstances) {
      if (app.#approvalState !== 'pending' || app.#pendingRequestId !== data.requestId) continue;
      app.#approvalState = data.approved ? 'approved' : 'denied';
      app.#pendingRequestId = null;
      if (data.approved) {
        ui.notifications.info(`${data.gmName} approved this purchase — you may now buy.`);
      } else {
        ui.notifications.warn(`${data.gmName} denied this purchase.`);
      }
      app.render();
    }
  }

  /** Reset any approval whenever the cart changes so Buy re-locks. */
  #invalidateApproval() {
    this.#approvalState = 'idle';
    this.#pendingRequestId = null;
  }

  /* ---------------------------------------------------------------------- */
  /*  Catalog                                                                */
  /* ---------------------------------------------------------------------- */

  /** Build (and cache) the browsable item list for a tab, grouped-ready. */
  async #buildCatalog(tab) {
    if (this.#catalogCache.has(tab.id)) return this.#catalogCache.get(tab.id);
    const pack = game.packs.get(tab.pack);
    if (!pack) return [];
    const index = await pack.getIndex({ fields: ['type', 'system.cost', 'system.basePrice', 'system.mass'] });

    // Map each folder id to a "Parent › Child" display label.
    const folderLabel = new Map();
    for (const f of pack.folders) {
      const parentId = f.folder?.id ?? f.folder ?? null;
      const parentName = parentId ? pack.folders.get(parentId)?.name : null;
      folderLabel.set(f.id, parentName ? `${parentName} › ${f.name}` : f.name);
    }

    const items = [];
    for (const e of index) {
      if (tab.types && !tab.types.includes(e.type)) continue;
      items.push({
        uuid: `Compendium.${tab.pack}.${e._id}`,
        name: e.name,
        nameKey: e.name.toLowerCase(),
        img: e.img,
        // Most items price via system.cost; drugs/poisons use system.basePrice.
        cost: Number(e.system?.cost) || Number(e.system?.basePrice) || 0,
        mass: Number(e.system?.mass) || 0,
        group: e.folder ? (folderLabel.get(e.folder) ?? 'Other') : 'Other'
      });
    }
    items.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    this.#catalogCache.set(tab.id, items);
    return items;
  }

  /* ---------------------------------------------------------------------- */
  /*  Context                                                                */
  /* ---------------------------------------------------------------------- */

  /** Cart lines + subtotal (single source of truth for context and requests). */
  #cartSummary() {
    const lines = [];
    let subtotal = 0;
    for (const [uuid, l] of this.#cart) {
      const lineCost = l.cost * l.qty;
      subtotal += lineCost;
      lines.push({ uuid, name: l.name, qty: l.qty, unitCost: l.cost, lineCost });
    }
    lines.sort((a, b) => a.name.localeCompare(b.name));
    return { lines, subtotal };
  }

  /** @override */
  async _prepareContext() {
    const tabs = await availableShopTabs();
    if (!tabs.some(t => t.id === this.#activeTab)) this.#activeTab = tabs[0]?.id ?? null;
    const tabDef = tabs.find(t => t.id === this.#activeTab) || null;

    // Grouped catalog for the active tab (all items — search filters in the DOM).
    let groups = [];
    if (tabDef) {
      const catalog = await this.#buildCatalog(tabDef);
      const byGroup = new Map();
      for (const i of catalog) {
        const row = { ...i, inCart: this.#cart.get(i.uuid)?.qty || 0 };
        if (!byGroup.has(i.group)) byGroup.set(i.group, []);
        byGroup.get(i.group).push(row);
      }
      groups = [...byGroup.entries()].map(([name, items]) => ({ name, items }));
    }

    // Cart summary.
    const { lines, subtotal } = this.#cartSummary();

    const isGM = game.user.isGM;
    const free = this.#free && isGM;
    const cbills = Number(this.#actor?.system?.cbills) || 0;
    const after = cbills - (free ? 0 : subtotal);
    const affordable = free || after >= 0;

    // Approval gating. GMs never need approval; players do.
    const needsApproval = !isGM;
    const approved = isGM || this.#approvalState === 'approved';
    const hasCart = lines.length > 0;
    const canRequest = needsApproval && hasCart && affordable && !!this.#actor?.isOwner
      && this.#approvalState !== 'pending' && this.#approvalState !== 'approved';
    const canBuy = hasCart && affordable && !!this.#actor?.isOwner && approved;

    return {
      hasActor: !!this.#actor,
      actorName: this.#actor?.name ?? '',
      editable: !!this.#actor?.isOwner,
      tabs: tabs.map(t => ({ ...t, active: t.id === this.#activeTab })),
      hasTabs: tabs.length > 0,
      groups,
      hasCatalog: groups.length > 0,
      search: this.#search,
      lines,
      hasCart,
      cartCount: lines.reduce((n, l) => n + l.qty, 0),
      cbills,
      subtotal,
      after,
      affordable,
      isGM,
      free,
      needsApproval,
      approvalState: this.#approvalState,
      approvalPending: this.#approvalState === 'pending',
      approvalDenied: this.#approvalState === 'denied',
      approved,
      canRequest,
      canBuy
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Render: client-side search filter (keeps focus) + hover stats          */
  /* ---------------------------------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const search = this.element.querySelector('.shop-search');
    if (search) {
      search.value = this.#search;
      search.addEventListener('input', (ev) => {
        this.#search = ev.target.value;
        this.#applyFilter();
      });
    }
    this.#applyFilter();
    this.#wireHoverStats();
  }

  /** Show/hide catalog rows to match the search string without re-rendering. */
  #applyFilter() {
    const q = this.#search.trim().toLowerCase();
    for (const group of this.element.querySelectorAll('.shop-group')) {
      let any = false;
      for (const row of group.querySelectorAll('.shop-item')) {
        const match = !q || (row.dataset.name || '').includes(q);
        row.classList.toggle('hidden', !match);
        if (match) any = true;
      }
      group.classList.toggle('hidden', !any);
    }
    const empty = this.element.querySelector('.shop-empty');
    if (empty) empty.classList.toggle('hidden', !!this.element.querySelector('.shop-item:not(.hidden)'));
  }

  /* ---------------------------------------------------------------------- */
  /*  Hover stats card                                                       */
  /* ---------------------------------------------------------------------- */

  #wireHoverStats() {
    // One reusable floating card appended to the app root.
    if (!this.#hoverCard || !this.#hoverCard.isConnected) {
      this.#hoverCard = document.createElement('div');
      this.#hoverCard.className = 'shop-hovercard hidden';
      this.element.appendChild(this.#hoverCard);
    }
    for (const row of this.element.querySelectorAll('.shop-item')) {
      row.addEventListener('mouseenter', (ev) => this.#showHoverCard(ev.currentTarget));
      row.addEventListener('mousemove', (ev) => this.#positionHoverCard(ev));
      row.addEventListener('mouseleave', () => this.#hideHoverCard());
    }
  }

  #hideHoverCard() {
    this.#hoverCard?.classList.add('hidden');
  }

  #positionHoverCard(ev) {
    const card = this.#hoverCard;
    if (!card || card.classList.contains('hidden')) return;
    const pad = 14;
    const w = card.offsetWidth || 300;
    const h = card.offsetHeight || 160;
    let x = ev.clientX + pad;
    let y = ev.clientY + pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
    if (y < 8) y = 8;
    card.style.left = `${Math.max(8, x)}px`;
    card.style.top = `${y}px`;
  }

  async #showHoverCard(row) {
    const uuid = row.querySelector('[data-uuid]')?.dataset.uuid || row.dataset.uuid;
    if (!uuid) return;
    const card = this.#hoverCard;
    if (!card) return;
    // Resolve (and cache) the full item so we can read all its stats.
    let item = this.#itemCache.get(uuid);
    if (!item) {
      try { item = await fromUuid(uuid); } catch (_e) { item = null; }
      if (item) this.#itemCache.set(uuid, item);
    }
    if (!item) return;
    // The pointer may have left while we awaited; only show if still hovered.
    if (!row.matches(':hover')) return;
    card.innerHTML = this.#hoverCardHTML(item);
    card.classList.remove('hidden');
  }

  /** Build the inner HTML for the hover card from an item document. */
  #hoverCardHTML(item) {
    const esc = foundry.utils.escapeHTML;
    const sys = item.system ?? {};
    const stats = this.#statLines(item, sys);
    const statHTML = stats.length
      ? `<dl class="shop-hc-stats">${stats.map(s =>
          `<dt>${esc(s.label)}</dt><dd>${esc(String(s.value))}</dd>`).join('')}</dl>`
      : '';
    const desc = String(sys.description || sys.notes || '').trim();
    const descHTML = desc ? `<div class="shop-hc-desc">${desc}</div>` : '';
    const typeLabel = this.#typeLabel(item.type);
    return `
      <header class="shop-hc-head">
        <img src="${esc(item.img || '')}" alt=""/>
        <div><span class="shop-hc-name">${esc(item.name)}</span>
        <span class="shop-hc-type">${esc(typeLabel)}</span></div>
      </header>
      ${statHTML}
      ${descHTML || (statHTML ? '' : '<div class="shop-hc-desc"><em>No description recorded.</em></div>')}`;
  }

  #typeLabel(type) {
    const map = { weapon: 'Weapon', armor: 'Armor', ammunition: 'Ammunition',
      equipment: 'Equipment', supplies: 'Field Gear', drugpoison: 'Drug / Poison' };
    return map[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Item');
  }

  /** Curated stat lines per item type; only non-empty values are shown. */
  #statLines(item, sys) {
    const out = [];
    const num = (v) => (Number(v) ? Number(v).toLocaleString() : null);

    if (item.type === 'weapon') {
      if (sys.weaponType) out.push({ label: 'Class', value: this.#pretty(sys.weaponType) });
      const ap = `${sys.ap ?? 0}${sys.apFactor ? sys.apFactor : ''}`;
      const bd = `${sys.bd ?? 0}${sys.bdFactor ? sys.bdFactor : ''}`;
      if (sys.ap || sys.apFactor) out.push({ label: 'AP Damage', value: ap });
      if (sys.bd || sys.bdFactor) out.push({ label: 'BD Damage', value: bd });
      const r = sys.range || {};
      const range = [r.pointBlank, r.short, r.medium, r.long, r.extreme].filter(v => v !== '' && v != null);
      if (range.length) out.push({ label: 'Range (PB/S/M/L/E)', value: range.join(' / ') });
      if (Number(sys.burstRating)) out.push({ label: 'Burst', value: sys.burstRating });
      if (Number(sys.recoil)) out.push({ label: 'Recoil', value: sys.recoil });
      if (Number(sys.ammo?.max)) out.push({ label: 'Ammo', value: sys.ammo.max });
      if (sys.skill) out.push({ label: 'Skill', value: sys.skill });
    } else if (item.type === 'armor') {
      if (sys.armorType) out.push({ label: 'Type', value: this.#pretty(sys.armorType) });
      const b = sys.bar || {};
      const bar = [b.m, b.b, b.e, b.x];
      if (bar.some(v => Number(v))) out.push({ label: 'BAR (M/B/E/X)', value: bar.map(v => Number(v) || 0).join(' / ') });
      const cov = Object.entries(sys.coverage || {}).filter(([, v]) => v).map(([k]) => this.#pretty(k));
      if (cov.length) out.push({ label: 'Coverage', value: cov.join(', ') });
      if (Number(sys.patchCost)) out.push({ label: 'Patch cost', value: `${num(sys.patchCost)} C` });
    } else if (item.type === 'supplies') {
      if (sys.supplyType) out.push({ label: 'Type', value: this.#pretty(sys.supplyType) });
      if (Number(sys.quantity)) out.push({ label: 'Quantity', value: sys.quantity });
      if (Number(sys.powerUse)) out.push({ label: 'Power use', value: sys.powerUse });
    }

    // Universal footer stats.
    const cost = Number(sys.cost) || Number(sys.basePrice) || 0;
    if (cost) out.push({ label: 'Cost', value: `${cost.toLocaleString()} C` });
    if (Number(sys.mass)) out.push({ label: 'Mass', value: `${num(sys.mass)} kg` });
    if (sys.equipmentRating) out.push({ label: 'Rating (T/A/L)', value: sys.equipmentRating });
    if (sys.affiliation) out.push({ label: 'Affiliation', value: sys.affiliation });
    return out;
  }

  #pretty(s) {
    return String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /* ---------------------------------------------------------------------- */
  /*  Actions                                                                */
  /* ---------------------------------------------------------------------- */

  static #onSelectTab(event, target) {
    const id = target.dataset.tab;
    if (id && id !== this.#activeTab) {
      this.#activeTab = id;
      this.#search = '';
      this.render();
    }
  }

  static #onAddToCart(event, target) {
    const uuid = target.dataset.uuid;
    // The active tab's catalog was cached during the last _prepareContext.
    const cache = this.#catalogCache.get(this.#activeTab) || [];
    const row = cache.find(i => i.uuid === uuid);
    if (!row) return;
    const cur = this.#cart.get(uuid);
    if (cur) cur.qty += 1;
    else this.#cart.set(uuid, { name: row.name, cost: row.cost, qty: 1 });
    this.#invalidateApproval();
    this.render();
  }

  static #onIncCart(event, target) {
    const l = this.#cart.get(target.dataset.uuid);
    if (l) { l.qty += 1; this.#invalidateApproval(); this.render(); }
  }

  static #onDecCart(event, target) {
    const uuid = target.dataset.uuid;
    const l = this.#cart.get(uuid);
    if (!l) return;
    l.qty -= 1;
    if (l.qty <= 0) this.#cart.delete(uuid);
    this.#invalidateApproval();
    this.render();
  }

  static #onRemoveCart(event, target) {
    this.#cart.delete(target.dataset.uuid);
    this.#invalidateApproval();
    this.render();
  }

  static #onClearCart() {
    if (!this.#cart.size) return;
    this.#cart.clear();
    this.#invalidateApproval();
    this.render();
  }

  static #onToggleFree() {
    if (!game.user.isGM) return;
    this.#free = !this.#free;
    this.render();
  }

  /** Player: broadcast the current cart to online GMs for approval. */
  static #onRequestApproval() {
    if (!this.#actor || !this.#cart.size) return;
    if (!this.#actor.isOwner) {
      ui.notifications.warn('You do not have permission to modify this character.');
      return;
    }
    const gms = game.users.filter(u => u.isGM && u.active);
    if (!gms.length) {
      ui.notifications.warn('No GM is online to approve this purchase.');
      return;
    }
    const { lines, subtotal } = this.#cartSummary();
    this.#approvalSeq += 1;
    // randomID keeps ids unique even if two shop windows are open at once.
    const requestId = `${game.user.id}:${this.#approvalSeq}:${foundry.utils.randomID(8)}`;
    this.#pendingRequestId = requestId;
    this.#approvalState = 'pending';
    ShopApplication.#emit(ShopApplication.SHOP_EVENTS.REQUEST, {
      requestId,
      fromUserId: game.user.id,
      fromUserName: game.user.name,
      actorId: this.#actor.id,
      actorName: this.#actor.name,
      lines: lines.map(l => ({ name: l.name, qty: l.qty, lineCost: l.lineCost })),
      subtotal
    });
    ui.notifications.info('Approval request sent to the GM.');
    this.render();
  }

  static async #onCheckout() {
    if (!this.#actor) return;
    if (!this.#actor.isOwner) {
      ui.notifications.warn('You do not have permission to modify this character.');
      return;
    }
    if (!this.#cart.size) {
      ui.notifications.warn('Your cart is empty.');
      return;
    }
    // Non-GM shoppers must have a live GM approval for the current cart.
    if (!game.user.isGM && this.#approvalState !== 'approved') {
      ui.notifications.warn('This purchase needs GM approval before you can buy.');
      return;
    }
    const free = this.#free && game.user.isGM;
    let subtotal = 0;
    for (const l of this.#cart.values()) subtotal += l.cost * l.qty;
    const cbills = Number(this.#actor.system?.cbills) || 0;
    if (!free && subtotal > cbills) {
      ui.notifications.error(`Not enough C-bills: this order costs ${subtotal.toLocaleString()}, but ${this.#actor.name} has ${cbills.toLocaleString()}.`);
      return;
    }

    // Resolve each cart line into concrete item documents (one per quantity).
    const docs = [];
    for (const [uuid, line] of this.#cart) {
      const item = await fromUuid(uuid);
      if (!item) { console.warn(`mech-foundry | Shop: could not resolve ${uuid}`); continue; }
      for (let n = 0; n < line.qty; n++) {
        const data = item.toObject();
        delete data._id;
        data.system = data.system || {};
        data.system.carryStatus = 'carried';
        data.flags = data.flags || {};
        data.flags['mech-foundry'] = { ...(data.flags['mech-foundry'] || {}), fromShop: true };
        docs.push(data);
      }
    }
    if (!docs.length) {
      ui.notifications.error('None of the cart items could be purchased (see console).');
      return;
    }

    await this.#actor.createEmbeddedDocuments('Item', docs);
    if (!free && subtotal > 0) {
      await this.#actor.update({ 'system.cbills': cbills - subtotal });
    }
    ui.notifications.info(`Purchased ${docs.length} item(s) for ${free ? '0 (GM gift)' : subtotal.toLocaleString()} C-bills.`);
    this.#cart.clear();
    this.#invalidateApproval();
    this.render();
  }
}
