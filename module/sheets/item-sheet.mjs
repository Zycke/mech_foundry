const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ITEM_TYPES_WITH_EFFECTS = ['weapon', 'armor', 'electronics', 'healthcare', 'prosthetics'];

/**
 * Item sheet for Mech Foundry (Foundry v14 ApplicationV2).
 *
 * Uses a dynamic per-type template via _configureRenderParts. Array-valued
 * system fields (persistentModifiers, itemEffects, ammo/weapon compatibility,
 * special effects) are round-tripped from the form's numeric-keyed objects back
 * into arrays in _processFormData. Add/remove controls are `actions` that mutate
 * the item's stored arrays directly — with submitOnChange the stored data is
 * already current, so no manual form-scraping is needed.
 *
 * @extends {ItemSheetV2}
 */
export class MechFoundryItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "item", "item-sheet"],
    position: { width: 520, height: 480 },
    tag: "form",
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
    actions: {
      editImage: MechFoundryItemSheet._onEditImage,
      addModifier: MechFoundryItemSheet._onAddModifier,
      removeModifier: MechFoundryItemSheet._onRemoveModifier,
      addItemEffect: MechFoundryItemSheet._onAddItemEffect,
      removeItemEffect: MechFoundryItemSheet._onRemoveItemEffect
    }
  };

  /** Placeholder; the real template is chosen per item type in _configureRenderParts. */
  static PARTS = {
    form: { template: "systems/mech-foundry/templates/item/item-skill-sheet.hbs" }
  };

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.form = { template: `systems/mech-foundry/templates/item/item-${this.item.type}-sheet.hbs` };
    return parts;
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const item = this.item;
    const context = {
      editable: this.isEditable,
      owner: item.isOwner,
      isGM: game.user.isGM,
      item,
      // Clone so the array-normalization below never mutates the live document
      system: foundry.utils.deepClone(item.system),
      flags: item.flags,
      config: game.mechfoundry?.config || {}
    };

    // Ensure array-valued fields are always arrays for the template
    if (item.type === 'activeEffect') {
      context.system.persistentModifiers = this._asArray(item.system.persistentModifiers);
    }
    if (ITEM_TYPES_WITH_EFFECTS.includes(item.type)) {
      context.system.itemEffects = this._asArray(item.system.itemEffects);
    }
    if (item.type === 'weapon') {
      this._addAmmoTypeContext(context, item.system);
      const modes = this._asArray(item.system.modes);
      context.system.modes = modes;
      context.hasModes = modes.length > 0;
      const active = Math.max(0, Math.min(Number(item.system.activeMode) || 0, modes.length - 1));
      context.modeOptions = modes.map((m, i) => ({
        value: i,
        label: m.name || `Mode ${i + 1}`,
        selected: i === active,
        ap: m.ap ?? '', apFactor: m.apFactor ?? '', bd: m.bd ?? '', bdFactor: m.bdFactor ?? '',
        range: m.range || {}, shots: m.shots ?? '', pps: m.pps ?? '',
        burst: m.burst ?? '', recoil: m.recoil ?? '', switchAction: m.switchAction || '', notes: m.notes || ''
      }));
    }
    if (item.type === 'ammo') {
      this._addAmmoTypeContext(context, item.system);
      const special = this._asArray(item.system.specialEffects);
      const allEffects = [
        { value: 'continuous', label: 'MECHFOUNDRY.EffectContinuous' },
        { value: 'splash', label: 'MECHFOUNDRY.EffectSplash' },
        { value: 'incendiary', label: 'MECHFOUNDRY.EffectIncendiary' },
        { value: 'tagged', label: 'MECHFOUNDRY.EffectTagged' },
        { value: 'half-ap-barriers', label: 'MECHFOUNDRY.EffectHalfAPBarriers' },
        { value: 'no-ap-barriers', label: 'MECHFOUNDRY.EffectNoAPBarriers' },
        { value: 'ignore-cover', label: 'MECHFOUNDRY.EffectIgnoreCover' },
        { value: 'tracer', label: 'MECHFOUNDRY.EffectTracer' },
        { value: 'guided', label: 'MECHFOUNDRY.EffectGuided' },
        { value: 'illumination', label: 'MECHFOUNDRY.EffectIllumination' },
        { value: 'flash', label: 'MECHFOUNDRY.EffectFlash' }
      ];
      context.specialEffectOptions = allEffects.map(e => ({
        value: e.value,
        label: game.i18n.localize(e.label),
        checked: special.includes(e.value)
      }));
    }

    if (item.type === 'lifeModule') {
      const sys = item.system;
      context.stageOptions = [0, 1, 2, 3, 4].map(n => ({
        value: n, label: game.i18n.localize(`MECHFOUNDRY.LifeStage${n}`)
      }));
      context.moduleTypeOptions = ['affiliation', 'childhood', 'education', 'reallife', 'field']
        .map(v => ({ value: v, label: game.i18n.localize(`MECHFOUNDRY.ModuleType.${v}`) }));
      context.restrictedCSV = this._asArray(sys.restrictedToAffiliations).join(', ');
      // Structured sub-objects are edited as pretty-printed JSON (GM power-user
      // fields); _processFormData parses them back with a guard.
      context.jsonFields = {
        prerequisites: this._stringifyField(sys.prerequisites, { attributes: {}, skills: {}, traits: {} }),
        fixedXP: this._stringifyField(sys.fixedXP, { attributes: {}, skills: [], traits: [] }),
        flexibleXP: this._stringifyField(sys.flexibleXP, [])
      };
    }

    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      item.system.description ?? "",
      { relativeTo: item }
    );

    return context;
  }

  /** Pretty-print a structured field for the JSON editors, tolerating nulls. */
  _stringifyField(value, fallback) {
    try {
      return JSON.stringify(value ?? fallback, null, 2);
    } catch (_e) {
      return JSON.stringify(fallback, null, 2);
    }
  }

  /** Build the ammo-family (ammoType) and ordnance-class dropdown context shared
   *  by the weapon and ammo sheets. `isOrdnance` gates the class dropdown. */
  _addAmmoTypeContext(context, sys) {
    const cfg = game.mechfoundry?.config || {};
    const types = cfg.ammoTypes || {};
    const current = sys.ammoType || '';
    context.ammoTypeOptions = Object.entries(types).map(([value, label]) => ({
      value, label, selected: value === current
    }));
    const ordnance = cfg.ordnanceAmmoTypes || ['grenade', 'mortar', 'missile', 'recoilless'];
    // Ordnance weapons use a launcher family (grenade/mortar/…); ordnance ammo
    // uses the generic 'ordnance' family — both take an ordnance class.
    context.isOrdnance = current === 'ordnance' || ordnance.includes(current);
    const curClass = sys.ordnanceClass || '';
    context.ordnanceClassOptions = (cfg.ordnanceClasses || ['', 'A', 'B', 'C', 'D', 'E']).map(v => ({
      value: v, label: v || '—', selected: v === curClass
    }));
  }

  /** @override */
  _onRender(context, options) {
    // Apply the per-type class the CSS targets (e.g. .ammo-sheet, .activeeffect-sheet)
    this.element.classList.add(`${this.item.type.toLowerCase()}-sheet`);
    this._activateTabs();
    // Multi-mode weapons drive their combat stats from the active firing mode, so
    // the base stat inputs are read-only (edit per-mode values instead).
    if (this.item.type === 'weapon' && this._asArray(this.item.system.modes).length) {
      const names = ['system.ap', 'system.apFactor', 'system.bd', 'system.bdFactor', 'system.recoil',
        'system.burstRating', 'system.pps', 'system.ammo.max', 'system.subduing',
        'system.range.pointBlank', 'system.range.short', 'system.range.medium', 'system.range.long', 'system.range.extreme'];
      for (const n of names) {
        const el = this.element.querySelector(`[name="${n}"]`);
        if (el) el.disabled = true;
      }
    }
  }

  /* -------------------------------------------- */
  /*  Tabs (manual — mirrors the V1 behaviour the CSS expects)                    */
  /* -------------------------------------------- */

  _activateTabs() {
    const navs = this.element.querySelectorAll(".sheet-tabs .item[data-tab]");
    const bodies = this.element.querySelectorAll(".sheet-body .tab[data-tab]");
    if (!navs.length || !bodies.length) return;

    const activate = (tab) => {
      for (const n of navs) n.classList.toggle("active", n.dataset.tab === tab);
      for (const b of bodies) b.classList.toggle("active", b.dataset.tab === tab);
    };

    for (const n of navs) {
      n.addEventListener("click", (ev) => { ev.preventDefault(); activate(n.dataset.tab); });
    }

    const current = this.element.querySelector(".sheet-body .tab.active[data-tab]")?.dataset.tab
      || bodies[0]?.dataset.tab;
    if (current) activate(current);
  }

  /* -------------------------------------------- */
  /*  Form submission — array round-tripping                                      */
  /* -------------------------------------------- */

  /** @override */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const type = this.item.type;

    if (type === 'activeEffect') this._objectToArray(data, "system.persistentModifiers");
    if (ITEM_TYPES_WITH_EFFECTS.includes(type)) this._objectToArray(data, "system.itemEffects");
    if (type === 'ammo') {
      // Special-effect checkboxes: collect all checked values (empty when none)
      const checked = Array.from(form.querySelectorAll('input[name="system.specialEffects"]:checked'))
        .map(el => el.value);
      foundry.utils.setProperty(data, "system.specialEffects", checked);
    }
    if (type === 'lifeModule') {
      // Comma-separated affiliation restrictions -> array.
      const csv = foundry.utils.getProperty(data, "system.restrictedToAffiliations");
      if (typeof csv === 'string') {
        foundry.utils.setProperty(data, "system.restrictedToAffiliations",
          csv.split(',').map(s => s.trim()).filter(Boolean));
      }
      // Guarded JSON parse for the structured sub-objects. On malformed input,
      // restore the previously-stored value so the bad text is not saved, and warn.
      for (const path of ["system.prerequisites", "system.fixedXP", "system.flexibleXP"]) {
        const raw = foundry.utils.getProperty(data, path);
        if (typeof raw !== 'string') continue;
        try {
          foundry.utils.setProperty(data, path, JSON.parse(raw));
        } catch (_e) {
          // Malformed JSON: keep the previously-stored value and warn.
          foundry.utils.setProperty(data, path, foundry.utils.getProperty(this.item, path));
          ui.notifications?.warn(`Life module: invalid JSON in ${path.split('.').pop()}; change was not saved.`);
        }
      }
    }

    return data;
  }

  /**
   * Convert a numeric-keyed object (from array-notation form fields) back into an
   * array at the given path within `data`.
   * @param {object} data
   * @param {string} path
   * @param {boolean} [dropEmpty] Drop empty-string entries (for tag lists)
   */
  _objectToArray(data, path, dropEmpty = false) {
    const val = foundry.utils.getProperty(data, path);
    if (!val || typeof val !== "object" || Array.isArray(val)) return;
    let arr = Object.keys(val).sort((a, b) => Number(a) - Number(b)).map(k => val[k]);
    if (dropEmpty) arr = arr.filter(v => v);
    foundry.utils.setProperty(data, path, arr);
  }

  _asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  /* -------------------------------------------- */
  /*  Action handlers (read/write the item's stored arrays)                       */
  /* -------------------------------------------- */

  static async _onEditImage(event, target) {
    const attr = target.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.document, attr);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: (path) => this.document.update({ [attr]: path })
    });
    return fp.browse();
  }

  static async _onAddModifier(event, target) {
    const mods = this._asArray(this.item.system.persistentModifiers).slice();
    mods.push({ targetType: 'attribute', target: 'str', operation: 'add', value: 0 });
    await this.item.update({ 'system.persistentModifiers': mods });
  }

  static async _onRemoveModifier(event, target) {
    const mods = this._asArray(this.item.system.persistentModifiers).slice();
    const i = Number(target.dataset.index);
    if (i >= 0 && i < mods.length) {
      mods.splice(i, 1);
      await this.item.update({ 'system.persistentModifiers': mods });
    }
  }

  static async _onAddItemEffect(event, target) {
    const effects = this._asArray(this.item.system.itemEffects).slice();
    effects.push({
      name: '', effectType: 'ranged_attack_bonus', value: 0, target: '',
      attachedItemOnly: false, description: '', toggleable: false, active: true,
      brightRadius: 0, dimRadius: 0, lightColor: '#ffffff'
    });
    await this.item.update({ 'system.itemEffects': effects });
  }

  static async _onRemoveItemEffect(event, target) {
    const effects = this._asArray(this.item.system.itemEffects).slice();
    const i = Number(target.dataset.index);
    if (i >= 0 && i < effects.length) {
      effects.splice(i, 1);
      await this.item.update({ 'system.itemEffects': effects });
    }
  }
}
