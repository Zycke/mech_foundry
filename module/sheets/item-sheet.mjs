/**
 * Extend the basic ItemSheet for Mech Foundry items
 * @extends {ItemSheet}
 */
export class MechFoundryItemSheet extends ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mech-foundry", "sheet", "item"],
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }]
    });
  }

  /** @override */
  get template() {
    return `systems/mech-foundry/templates/item/item-${this.item.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const context = await super.getData();

    // Use a safe clone of the item data for further operations
    const itemData = this.document.toObject(false);

    context.system = itemData.system;
    context.flags = itemData.flags;

    // For activeEffect items, ensure persistentModifiers is always an array
    if (this.item.type === 'activeEffect' && context.system) {
      context.system.persistentModifiers = Array.isArray(context.system.persistentModifiers)
        ? context.system.persistentModifiers
        : [];
    }

    // For items with effects (weapon, armor, electronics, healthcare, prosthetics),
    // ensure itemEffects is always an array
    const itemTypesWithEffects = ['weapon', 'armor', 'electronics', 'healthcare', 'prosthetics'];
    if (itemTypesWithEffects.includes(this.item.type) && context.system) {
      context.system.itemEffects = Array.isArray(context.system.itemEffects)
        ? context.system.itemEffects
        : [];
    }

    // For weapons, ensure ammoCompatibility is always an array
    if (this.item.type === 'weapon' && context.system) {
      context.system.ammoCompatibility = Array.isArray(context.system.ammoCompatibility)
        ? context.system.ammoCompatibility
        : [];
    }

    // For ammo items, ensure arrays are initialized and prepare special effects options
    if (this.item.type === 'ammo' && context.system) {
      context.system.weaponCompatibility = Array.isArray(context.system.weaponCompatibility)
        ? context.system.weaponCompatibility
        : [];
      context.system.specialEffects = Array.isArray(context.system.specialEffects)
        ? context.system.specialEffects
        : [];

      // Prepare special effects checkboxes
      const allEffects = [
        { value: 'continuous', label: game.i18n.localize('MECHFOUNDRY.EffectContinuous') },
        { value: 'splash', label: game.i18n.localize('MECHFOUNDRY.EffectSplash') },
        { value: 'incendiary', label: game.i18n.localize('MECHFOUNDRY.EffectIncendiary') },
        { value: 'tagged', label: game.i18n.localize('MECHFOUNDRY.EffectTagged') },
        { value: 'half-ap-barriers', label: game.i18n.localize('MECHFOUNDRY.EffectHalfAPBarriers') },
        { value: 'no-ap-barriers', label: game.i18n.localize('MECHFOUNDRY.EffectNoAPBarriers') },
        { value: 'ignore-cover', label: game.i18n.localize('MECHFOUNDRY.EffectIgnoreCover') },
        { value: 'tracer', label: game.i18n.localize('MECHFOUNDRY.EffectTracer') },
        { value: 'guided', label: game.i18n.localize('MECHFOUNDRY.EffectGuided') },
        { value: 'illumination', label: game.i18n.localize('MECHFOUNDRY.EffectIllumination') },
        { value: 'flash', label: game.i18n.localize('MECHFOUNDRY.EffectFlash') }
      ];
      context.specialEffectOptions = allEffects.map(effect => ({
        ...effect,
        checked: context.system.specialEffects.includes(effect.value)
      }));
    }

    // Add config data
    context.config = game.mechfoundry?.config || {};

    // IMPORTANT: Ensure owner and editable are set for editor helper
    context.owner = this.document.isOwner;
    context.editable = this.isEditable;

    // Add GM status for GM-only fields (like armor damage editing)
    context.isGM = game.user.isGM;

    // Enrich description for editor
    context.enrichedDescription = await TextEditor.enrichHTML(
      this.item.system.description,
      { async: true }
    );

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Burst fire field visibility toggle (weapon sheets)
    html.on('change', '.bd-factor-select', (event) => {
      const burstFields = html.find('.burst-fire-fields');
      if (event.currentTarget.value === 'B') {
        burstFields.show();
      } else {
        burstFields.hide();
      }
    });

    // Weapon ammo compatibility tag handlers
    if (this.item.type === 'weapon') {
      // Add ammo compatibility tag
      html.on('click', '.add-ammo-tag', async (event) => {
        event.preventDefault();
        const tags = this._gatherAmmoCompatibilityTagsFromForm(html[0].closest('form'));
        tags.push('');
        await this.item.update({ 'system.ammoCompatibility': tags });
      });

      // Remove ammo compatibility tag
      html.on('click', '.remove-ammo-tag', async (event) => {
        event.preventDefault();
        const index = parseInt(event.currentTarget.dataset.index);
        const tags = this._gatherAmmoCompatibilityTagsFromForm(html[0].closest('form'));
        if (index >= 0 && index < tags.length) {
          tags.splice(index, 1);
          await this.item.update({ 'system.ammoCompatibility': tags });
        }
      });
    }

    // Active Effect specific handlers
    if (this.item.type === 'activeEffect') {
      // Effect type toggle - show/hide relevant sections
      html.on('change', '.effect-type-select', (event) => {
        const effectType = event.currentTarget.value;
        if (effectType === 'continuous_damage') {
          html.find('.continuous-damage-section').removeClass('hidden');
          html.find('.persistent-effect-section').addClass('hidden');
        } else {
          html.find('.continuous-damage-section').addClass('hidden');
          html.find('.persistent-effect-section').removeClass('hidden');
        }
      });

      // Add modifier button
      html.on('click', '.add-modifier', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Gather current form data manually to preserve unsaved changes
        const formElement = html[0].closest('form');
        const modifiers = this._gatherModifiersFromForm(formElement);

        // Add new modifier
        modifiers.push({
          targetType: 'attribute',
          target: 'str',
          operation: 'add',
          value: 0
        });

        await this.item.update({ 'system.persistentModifiers': modifiers });
      });

      // Remove modifier button
      html.on('click', '.remove-modifier', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Gather current form data manually to preserve unsaved changes
        const formElement = html[0].closest('form');
        const modifiers = this._gatherModifiersFromForm(formElement);

        const index = parseInt(event.currentTarget.dataset.index);
        if (index >= 0 && index < modifiers.length) {
          modifiers.splice(index, 1);
          await this.item.update({ 'system.persistentModifiers': modifiers });
        }
      });

      // Target type change - update target field accordingly
      html.on('change', '.modifier-target-type', async (event) => {
        event.stopPropagation();

        // Gather current form data manually to preserve unsaved changes
        const formElement = html[0].closest('form');
        const modifiers = this._gatherModifiersFromForm(formElement);

        const row = event.currentTarget.closest('.modifier-row');
        const index = parseInt(row.dataset.index);
        const targetType = event.currentTarget.value;

        if (index >= 0 && index < modifiers.length) {
          // Set default target based on type
          let defaultTarget = '';
          if (targetType === 'attribute') defaultTarget = 'str';
          else if (targetType === 'movement') defaultTarget = 'walk';
          else defaultTarget = ''; // skill - user enters name

          modifiers[index].targetType = targetType;
          modifiers[index].target = defaultTarget;
          await this.item.update({ 'system.persistentModifiers': modifiers });
        }
      });
    }

    // Ammo item specific handlers
    if (this.item.type === 'ammo') {
      // Ammo category change - show/hide relevant sections
      html.on('change', '.ammo-category-select', (event) => {
        const category = event.currentTarget.value;
        html.find('.ammo-ballistics-section').toggleClass('hidden', category !== 'ballistics');
        html.find('.ammo-energy-section').toggleClass('hidden', category !== 'energy');
        html.find('.ammo-ordnance-section').toggleClass('hidden', category !== 'ordnance');
      });

      // Add compatibility tag
      html.on('click', '.add-tag', async (event) => {
        event.preventDefault();
        const tags = this._gatherCompatibilityTagsFromForm(html[0].closest('form'));
        tags.push('');
        await this.item.update({ 'system.weaponCompatibility': tags });
      });

      // Remove compatibility tag
      html.on('click', '.remove-tag', async (event) => {
        event.preventDefault();
        const index = parseInt(event.currentTarget.dataset.index);
        const tags = this._gatherCompatibilityTagsFromForm(html[0].closest('form'));
        if (index >= 0 && index < tags.length) {
          tags.splice(index, 1);
          await this.item.update({ 'system.weaponCompatibility': tags });
        }
      });
    }

    // Item Effects handlers (for weapon, armor, electronics, healthcare, prosthetics)
    const itemTypesWithEffects = ['weapon', 'armor', 'electronics', 'healthcare', 'prosthetics'];
    if (itemTypesWithEffects.includes(this.item.type)) {
      // Add item effect button
      html.on('click', '.add-item-effect', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Gather current form data to preserve unsaved changes
        const formElement = html[0].closest('form');
        const effects = this._gatherItemEffectsFromForm(formElement);

        // Add new effect with default values
        effects.push({
          name: '',
          effectType: 'ranged_attack_bonus',
          value: 0,
          target: '',
          attachedItemOnly: false,
          description: ''
        });

        await this.item.update({ 'system.itemEffects': effects });
      });

      // Remove item effect button
      html.on('click', '.remove-item-effect', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Gather current form data to preserve unsaved changes
        const formElement = html[0].closest('form');
        const effects = this._gatherItemEffectsFromForm(formElement);

        const index = parseInt(event.currentTarget.dataset.index);
        if (index >= 0 && index < effects.length) {
          effects.splice(index, 1);
          await this.item.update({ 'system.itemEffects': effects });
        }
      });

      // Effect type change - update related fields
      html.on('change', '.effect-type-select', async (event) => {
        event.stopPropagation();

        // Gather current form data to preserve unsaved changes
        const formElement = html[0].closest('form');
        const effects = this._gatherItemEffectsFromForm(formElement);

        const row = event.currentTarget.closest('.effect-row');
        const index = parseInt(row.dataset.index);
        const effectType = event.currentTarget.value;

        if (index >= 0 && index < effects.length) {
          effects[index].effectType = effectType;

          // Set default target based on effect type
          if (effectType === 'attribute_bonus') {
            effects[index].target = 'str';
          } else if (effectType === 'movement_bonus') {
            effects[index].target = 'walk';
          } else if (effectType === 'skill_bonus') {
            effects[index].target = '';
          } else {
            effects[index].target = '';
          }

          await this.item.update({ 'system.itemEffects': effects });
        }
      });
    }
  }

  /** @override */
  async _updateObject(event, formData) {
    const expanded = foundry.utils.expandObject(formData);

    // Handle persistentModifiers - Foundry converts array notation to object with numeric keys
    // We need to convert it back to a proper array before saving
    if (this.item.type === 'activeEffect') {
      if (expanded.system?.persistentModifiers && !Array.isArray(expanded.system.persistentModifiers)) {
        // Convert object with numeric keys to array
        const modifiersObj = expanded.system.persistentModifiers;
        const modifiersArray = [];
        const keys = Object.keys(modifiersObj).sort((a, b) => parseInt(a) - parseInt(b));
        for (const key of keys) {
          modifiersArray.push(modifiersObj[key]);
        }
        // Update formData with the array
        // First, delete all the old dot-notation keys
        for (const key of Object.keys(formData)) {
          if (key.startsWith('system.persistentModifiers.')) {
            delete formData[key];
          }
        }
        // Set the array directly
        formData['system.persistentModifiers'] = modifiersArray;
      }
    }

    // Handle itemEffects for items with effects
    const itemTypesWithEffects = ['weapon', 'armor', 'electronics', 'healthcare', 'prosthetics'];
    if (itemTypesWithEffects.includes(this.item.type)) {
      if (expanded.system?.itemEffects && !Array.isArray(expanded.system.itemEffects)) {
        // Convert object with numeric keys to array
        const effectsObj = expanded.system.itemEffects;
        const effectsArray = [];
        const keys = Object.keys(effectsObj).sort((a, b) => parseInt(a) - parseInt(b));
        for (const key of keys) {
          effectsArray.push(effectsObj[key]);
        }
        // Update formData with the array
        // First, delete all the old dot-notation keys
        for (const key of Object.keys(formData)) {
          if (key.startsWith('system.itemEffects.')) {
            delete formData[key];
          }
        }
        // Set the array directly
        formData['system.itemEffects'] = effectsArray;
      }

    }

    // Handle ammo item arrays
    if (this.item.type === 'ammo') {
      // Handle weaponCompatibility array
      if (expanded.system?.weaponCompatibility && !Array.isArray(expanded.system.weaponCompatibility)) {
        const tagsObj = expanded.system.weaponCompatibility;
        const tagsArray = [];
        const keys = Object.keys(tagsObj).sort((a, b) => parseInt(a) - parseInt(b));
        for (const key of keys) {
          if (tagsObj[key]) tagsArray.push(tagsObj[key]); // Skip empty tags
        }
        for (const key of Object.keys(formData)) {
          if (key.startsWith('system.weaponCompatibility.')) {
            delete formData[key];
          }
        }
        formData['system.weaponCompatibility'] = tagsArray;
      }

      // Handle specialEffects checkboxes - collect all checked values
      const specialEffects = [];
      for (const key of Object.keys(formData)) {
        if (key === 'system.specialEffects') {
          const value = formData[key];
          if (Array.isArray(value)) {
            specialEffects.push(...value);
          } else if (value) {
            specialEffects.push(value);
          }
        }
      }
      formData['system.specialEffects'] = specialEffects;
    }

    // Handle weapon ammoCompatibility array
    if (this.item.type === 'weapon') {
      if (expanded.system?.ammoCompatibility && !Array.isArray(expanded.system.ammoCompatibility)) {
        const tagsObj = expanded.system.ammoCompatibility;
        const tagsArray = [];
        const keys = Object.keys(tagsObj).sort((a, b) => parseInt(a) - parseInt(b));
        for (const key of keys) {
          if (tagsObj[key]) tagsArray.push(tagsObj[key]); // Skip empty tags
        }
        for (const key of Object.keys(formData)) {
          if (key.startsWith('system.ammoCompatibility.')) {
            delete formData[key];
          }
        }
        formData['system.ammoCompatibility'] = tagsArray;
      }
    }

    return super._updateObject(event, formData);
  }

  /**
   * Gather modifier data from form inputs to preserve unsaved changes
   * @param {HTMLElement} formElement The form element
   * @returns {Array} Array of modifier objects
   */
  _gatherModifiersFromForm(formElement) {
    const modifiers = [];
    const rows = formElement.querySelectorAll('.modifier-row');

    rows.forEach((row, index) => {
      const targetTypeSelect = row.querySelector(`[name="system.persistentModifiers.${index}.targetType"]`);
      const targetInput = row.querySelector(`[name="system.persistentModifiers.${index}.target"]`);
      const operationSelect = row.querySelector(`[name="system.persistentModifiers.${index}.operation"]`);
      const valueInput = row.querySelector(`[name="system.persistentModifiers.${index}.value"]`);

      if (targetTypeSelect && targetInput && operationSelect && valueInput) {
        modifiers.push({
          targetType: targetTypeSelect.value,
          target: targetInput.value,
          operation: operationSelect.value,
          value: parseFloat(valueInput.value) || 0
        });
      }
    });

    return modifiers;
  }

  /**
   * Gather item effect data from form inputs to preserve unsaved changes
   * @param {HTMLElement} formElement The form element
   * @returns {Array} Array of effect objects
   */
  _gatherItemEffectsFromForm(formElement) {
    const effects = [];
    const rows = formElement.querySelectorAll('.effect-row');

    rows.forEach((row, index) => {
      const nameInput = row.querySelector(`[name="system.itemEffects.${index}.name"]`);
      const effectTypeSelect = row.querySelector(`[name="system.itemEffects.${index}.effectType"]`);
      const valueInput = row.querySelector(`[name="system.itemEffects.${index}.value"]`);
      const targetInput = row.querySelector(`[name="system.itemEffects.${index}.target"]`);
      const attachedOnlyCheckbox = row.querySelector(`[name="system.itemEffects.${index}.attachedItemOnly"]`);
      const descriptionInput = row.querySelector(`[name="system.itemEffects.${index}.description"]`);

      // Toggleable fields
      const toggleableCheckbox = row.querySelector(`[name="system.itemEffects.${index}.toggleable"]`);
      const activeCheckbox = row.querySelector(`[name="system.itemEffects.${index}.active"]`);

      // Light emission fields
      const brightRadiusInput = row.querySelector(`[name="system.itemEffects.${index}.brightRadius"]`);
      const dimRadiusInput = row.querySelector(`[name="system.itemEffects.${index}.dimRadius"]`);
      const lightColorInput = row.querySelector(`[name="system.itemEffects.${index}.lightColor"]`);

      effects.push({
        name: nameInput?.value || '',
        effectType: effectTypeSelect?.value || 'ranged_attack_bonus',
        value: parseFloat(valueInput?.value) || 0,
        target: targetInput?.value || '',
        attachedItemOnly: attachedOnlyCheckbox?.checked || false,
        description: descriptionInput?.value || '',
        // Toggleable fields
        toggleable: toggleableCheckbox?.checked || false,
        active: activeCheckbox?.checked ?? true, // Default to true if not set
        // Light emission fields
        brightRadius: parseFloat(brightRadiusInput?.value) || 0,
        dimRadius: parseFloat(dimRadiusInput?.value) || 0,
        lightColor: lightColorInput?.value || '#ffffff'
      });
    });

    return effects;
  }

  /**
   * Gather compatibility tags from form inputs to preserve unsaved changes
   * @param {HTMLElement} formElement The form element
   * @returns {Array} Array of tag strings
   */
  _gatherCompatibilityTagsFromForm(formElement) {
    const tags = [];
    const tagInputs = formElement.querySelectorAll('.tag-item input[name^="system.weaponCompatibility"]');

    tagInputs.forEach((input) => {
      if (input.value) tags.push(input.value);
    });

    return tags;
  }

  /**
   * Gather ammo compatibility tags from weapon form inputs
   * @param {HTMLElement} formElement The form element
   * @returns {Array} Array of tag strings
   */
  _gatherAmmoCompatibilityTagsFromForm(formElement) {
    const tags = [];
    const tagInputs = formElement.querySelectorAll('.tag-item input[name^="system.ammoCompatibility"]');

    tagInputs.forEach((input) => {
      if (input.value) tags.push(input.value);
    });

    return tags;
  }
}
