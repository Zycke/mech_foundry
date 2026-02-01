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
    // ensure itemEffects and embeddedActiveEffects are always arrays
    const itemTypesWithEffects = ['weapon', 'armor', 'electronics', 'healthcare', 'prosthetics'];
    if (itemTypesWithEffects.includes(this.item.type) && context.system) {
      context.system.itemEffects = Array.isArray(context.system.itemEffects)
        ? context.system.itemEffects
        : [];
      context.system.embeddedActiveEffects = Array.isArray(context.system.embeddedActiveEffects)
        ? context.system.embeddedActiveEffects
        : [];
    }

    // Add config data
    context.config = game.mechfoundry?.config || {};

    // IMPORTANT: Ensure owner and editable are set for editor helper
    context.owner = this.document.isOwner;
    context.editable = this.isEditable;

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

      // Embedded Active Effects handlers
      // Add embedded effect button
      html.on('click', '.add-embedded-effect', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Gather current form data to preserve unsaved changes
        const formElement = html[0].closest('form');
        const effects = this._gatherEmbeddedEffectsFromForm(formElement);

        // Add new effect with default values
        effects.push({
          id: foundry.utils.randomID(),
          name: 'New Effect',
          active: true,
          attachedItemOnly: false,
          modifiers: [],
          description: ''
        });

        await this.item.update({ 'system.embeddedActiveEffects': effects });
      });

      // Remove embedded effect button
      html.on('click', '.remove-embedded-effect', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Gather current form data to preserve unsaved changes
        const formElement = html[0].closest('form');
        const effects = this._gatherEmbeddedEffectsFromForm(formElement);

        const index = parseInt(event.currentTarget.dataset.index);
        if (index >= 0 && index < effects.length) {
          effects.splice(index, 1);
          await this.item.update({ 'system.embeddedActiveEffects': effects });
        }
      });

      // Add modifier to embedded effect
      html.on('click', '.add-embedded-modifier', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const effectIndex = parseInt(event.currentTarget.dataset.effectIndex);

        // Gather current form data to preserve unsaved changes
        const formElement = html[0].closest('form');
        const effects = this._gatherEmbeddedEffectsFromForm(formElement);

        if (effectIndex >= 0 && effectIndex < effects.length) {
          if (!effects[effectIndex].modifiers) {
            effects[effectIndex].modifiers = [];
          }

          effects[effectIndex].modifiers.push({
            targetType: 'attribute',
            target: 'str',
            operation: 'add',
            value: 0
          });

          await this.item.update({ 'system.embeddedActiveEffects': effects });
        }
      });

      // Remove modifier from embedded effect
      html.on('click', '.remove-embedded-modifier', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const effectIndex = parseInt(event.currentTarget.dataset.effectIndex);
        const modifierIndex = parseInt(event.currentTarget.dataset.modifierIndex);

        // Gather current form data to preserve unsaved changes
        const formElement = html[0].closest('form');
        const effects = this._gatherEmbeddedEffectsFromForm(formElement);

        if (effectIndex >= 0 && effectIndex < effects.length) {
          if (effects[effectIndex].modifiers && modifierIndex >= 0 && modifierIndex < effects[effectIndex].modifiers.length) {
            effects[effectIndex].modifiers.splice(modifierIndex, 1);
            await this.item.update({ 'system.embeddedActiveEffects': effects });
          }
        }
      });

      // Modifier target type change - update target field options
      html.on('change', '.embedded-modifier-target-type', async (event) => {
        event.stopPropagation();

        // Gather current form data to preserve unsaved changes
        const formElement = html[0].closest('form');
        const effects = this._gatherEmbeddedEffectsFromForm(formElement);

        const modifierRow = event.currentTarget.closest('.modifier-row');
        const effectRow = event.currentTarget.closest('.embedded-effect-row');
        const effectIndex = parseInt(effectRow.dataset.index);
        const modifierIndex = parseInt(modifierRow.dataset.modifierIndex);
        const targetType = event.currentTarget.value;

        if (effectIndex >= 0 && effectIndex < effects.length &&
            effects[effectIndex].modifiers &&
            modifierIndex >= 0 && modifierIndex < effects[effectIndex].modifiers.length) {

          // Set default target based on type
          let defaultTarget = '';
          if (targetType === 'attribute') defaultTarget = 'str';
          else if (targetType === 'movement') defaultTarget = 'walk';
          else if (targetType === 'combat') defaultTarget = 'ranged_attack';

          effects[effectIndex].modifiers[modifierIndex].targetType = targetType;
          effects[effectIndex].modifiers[modifierIndex].target = defaultTarget;

          await this.item.update({ 'system.embeddedActiveEffects': effects });
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

      // Handle embeddedActiveEffects
      if (expanded.system?.embeddedActiveEffects && !Array.isArray(expanded.system.embeddedActiveEffects)) {
        // Convert object with numeric keys to array, preserving nested modifiers
        const effectsObj = expanded.system.embeddedActiveEffects;
        const effectsArray = [];
        const keys = Object.keys(effectsObj).sort((a, b) => parseInt(a) - parseInt(b));
        for (const key of keys) {
          const effect = effectsObj[key];
          // Convert modifiers from object to array if needed
          if (effect.modifiers && !Array.isArray(effect.modifiers)) {
            const modifiersObj = effect.modifiers;
            const modifiersArray = [];
            const modKeys = Object.keys(modifiersObj).sort((a, b) => parseInt(a) - parseInt(b));
            for (const modKey of modKeys) {
              modifiersArray.push(modifiersObj[modKey]);
            }
            effect.modifiers = modifiersArray;
          }
          effectsArray.push(effect);
        }
        // Update formData with the array
        // First, delete all the old dot-notation keys
        for (const key of Object.keys(formData)) {
          if (key.startsWith('system.embeddedActiveEffects.')) {
            delete formData[key];
          }
        }
        // Set the array directly
        formData['system.embeddedActiveEffects'] = effectsArray;
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
   * Gather embedded Active Effect data from form inputs to preserve unsaved changes
   * @param {HTMLElement} formElement The form element
   * @returns {Array} Array of embedded effect objects
   */
  _gatherEmbeddedEffectsFromForm(formElement) {
    const effects = [];
    const rows = formElement.querySelectorAll('.embedded-effect-row');

    rows.forEach((row, index) => {
      const idAttr = row.dataset.effectId;
      const nameInput = row.querySelector(`[name="system.embeddedActiveEffects.${index}.name"]`);
      const activeCheckbox = row.querySelector(`[name="system.embeddedActiveEffects.${index}.active"]`);
      const attachedOnlyCheckbox = row.querySelector(`[name="system.embeddedActiveEffects.${index}.attachedItemOnly"]`);
      const descriptionInput = row.querySelector(`[name="system.embeddedActiveEffects.${index}.description"]`);

      // Gather modifiers
      const modifiers = [];
      const modifierRows = row.querySelectorAll('.modifier-row');
      modifierRows.forEach((modRow, modIndex) => {
        const targetTypeSelect = modRow.querySelector(`[name="system.embeddedActiveEffects.${index}.modifiers.${modIndex}.targetType"]`);
        const targetInput = modRow.querySelector(`[name="system.embeddedActiveEffects.${index}.modifiers.${modIndex}.target"]`);
        const operationSelect = modRow.querySelector(`[name="system.embeddedActiveEffects.${index}.modifiers.${modIndex}.operation"]`);
        const valueInput = modRow.querySelector(`[name="system.embeddedActiveEffects.${index}.modifiers.${modIndex}.value"]`);

        if (targetTypeSelect) {
          modifiers.push({
            targetType: targetTypeSelect.value,
            target: targetInput?.value || '',
            operation: operationSelect?.value || 'add',
            value: parseFloat(valueInput?.value) || 0
          });
        }
      });

      effects.push({
        id: idAttr || foundry.utils.randomID(),
        name: nameInput?.value || 'Effect',
        active: activeCheckbox?.checked ?? true,
        attachedItemOnly: attachedOnlyCheckbox?.checked || false,
        modifiers: modifiers,
        description: descriptionInput?.value || ''
      });
    });

    return effects;
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
        // Light emission fields
        brightRadius: parseFloat(brightRadiusInput?.value) || 0,
        dimRadius: parseFloat(dimRadiusInput?.value) || 0,
        lightColor: lightColorInput?.value || '#ffffff'
      });
    });

    return effects;
  }
}
