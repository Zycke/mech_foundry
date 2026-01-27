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
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }

  /** @override */
  get template() {
    return `systems/mech-foundry/templates/item/item-${this.item.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const context = super.getData();

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
  }
}
