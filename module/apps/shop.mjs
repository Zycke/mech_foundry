import { availableShopTabs } from '../data/shop-catalog.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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

  constructor(options = {}) {
    super(options);
    this.#actor = options.actor ?? null;
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
    const lines = [];
    let subtotal = 0;
    for (const [uuid, l] of this.#cart) {
      const lineCost = l.cost * l.qty;
      subtotal += lineCost;
      lines.push({ uuid, name: l.name, qty: l.qty, unitCost: l.cost, lineCost });
    }
    lines.sort((a, b) => a.name.localeCompare(b.name));

    const isGM = game.user.isGM;
    const free = this.#free && isGM;
    const cbills = Number(this.#actor?.system?.cbills) || 0;
    const after = cbills - (free ? 0 : subtotal);
    const affordable = free || after >= 0;

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
      hasCart: lines.length > 0,
      cartCount: lines.reduce((n, l) => n + l.qty, 0),
      cbills,
      subtotal,
      after,
      affordable,
      isGM,
      free
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Render: client-side search filter (keeps focus)                        */
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
    this.render();
  }

  static #onIncCart(event, target) {
    const l = this.#cart.get(target.dataset.uuid);
    if (l) { l.qty += 1; this.render(); }
  }

  static #onDecCart(event, target) {
    const uuid = target.dataset.uuid;
    const l = this.#cart.get(uuid);
    if (!l) return;
    l.qty -= 1;
    if (l.qty <= 0) this.#cart.delete(uuid);
    this.render();
  }

  static #onRemoveCart(event, target) {
    this.#cart.delete(target.dataset.uuid);
    this.render();
  }

  static #onClearCart() {
    if (!this.#cart.size) return;
    this.#cart.clear();
    this.render();
  }

  static #onToggleFree() {
    if (!game.user.isGM) return;
    this.#free = !this.#free;
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
    this.render();
  }
}
