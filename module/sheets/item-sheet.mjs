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
}
