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
      removeItemEffect: MechFoundryItemSheet._onRemoveItemEffect,
      addAmmoTag: MechFoundryItemSheet._onAddAmmoTag,
      removeAmmoTag: MechFoundryItemSheet._onRemoveAmmoTag,
      addWeaponTag: MechFoundryItemSheet._onAddWeaponTag,
      removeWeaponTag: MechFoundryItemSheet._onRemoveWeaponTag
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
      context.system.ammoCompatibility = this._asArray(item.system.ammoCompatibility);
    }
    if (item.type === 'ammo') {
      context.system.weaponCompatibility = this._asArray(item.system.weaponCompatibility);
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

    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      item.system.description ?? "",
      { relativeTo: item }
    );

    return context;
  }

  /** @override */
  _onRender(context, options) {
    // Apply the per-type class the CSS targets (e.g. .ammo-sheet, .activeeffect-sheet)
    this.element.classList.add(`${this.item.type.toLowerCase()}-sheet`);
    this._activateTabs();
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
    if (type === 'weapon') this._objectToArray(data, "system.ammoCompatibility", true);
    if (type === 'ammo') {
      this._objectToArray(data, "system.weaponCompatibility", true);
      // Special-effect checkboxes: collect all checked values (empty when none)
      const checked = Array.from(form.querySelectorAll('input[name="system.specialEffects"]:checked'))
        .map(el => el.value);
      foundry.utils.setProperty(data, "system.specialEffects", checked);
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

  static async _onAddAmmoTag(event, target) {
    const tags = this._asArray(this.item.system.ammoCompatibility).slice();
    tags.push('');
    await this.item.update({ 'system.ammoCompatibility': tags });
  }

  static async _onRemoveAmmoTag(event, target) {
    const tags = this._asArray(this.item.system.ammoCompatibility).slice();
    const i = Number(target.dataset.index);
    if (i >= 0 && i < tags.length) {
      tags.splice(i, 1);
      await this.item.update({ 'system.ammoCompatibility': tags });
    }
  }

  static async _onAddWeaponTag(event, target) {
    const tags = this._asArray(this.item.system.weaponCompatibility).slice();
    tags.push('');
    await this.item.update({ 'system.weaponCompatibility': tags });
  }

  static async _onRemoveWeaponTag(event, target) {
    const tags = this._asArray(this.item.system.weaponCompatibility).slice();
    const i = Number(target.dataset.index);
    if (i >= 0 && i < tags.length) {
      tags.splice(i, 1);
      await this.item.update({ 'system.weaponCompatibility': tags });
    }
  }
}
