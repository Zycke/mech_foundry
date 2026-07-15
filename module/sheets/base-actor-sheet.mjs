const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Shared ApplicationV2 base for Mech Foundry actor sheets (Foundry v14).
 *
 * Provides the common window/form options, an image-edit action, and a base
 * `_prepareContext` with the enriched biography. Subclasses supply their own
 * `classes` and `PARTS`, and may extend `_prepareContext`.
 *
 * @extends {ActorSheetV2}
 */
export class MechFoundryActorSheetV2 extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor"],
    position: { width: 600, height: 400 },
    tag: "form",
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
    actions: {
      editImage: MechFoundryActorSheetV2._onEditImage
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = {
      editable: this.isEditable,
      owner: this.document.isOwner,
      actor: this.actor,
      system: this.actor.system,
      flags: this.actor.flags
    };

    // v14: TextEditor moved to foundry.applications.ux.TextEditor
    context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.actor.system.biography ?? "",
      { secrets: this.document.isOwner, relativeTo: this.actor }
    );

    return context;
  }

  /**
   * Action handler: open a FilePicker to change the actor image.
   * Invoked with `this` bound to the sheet instance.
   * @param {PointerEvent} event
   * @param {HTMLElement} target The clicked element (carries data-edit)
   */
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
}
