/**
 * Vehicle Actor Sheet - Placeholder for future expansion
 * @extends {ActorSheet}
 */
export class MechFoundryVehicleActorSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mech-foundry", "sheet", "actor", "vehicle-actor-sheet"],
      width: 600,
      height: 400,
      tabs: []
    });
  }

  /** @override */
  get template() {
    return "systems/mech-foundry/templates/actor/actor-vehicle_actor-sheet.hbs";
  }

  /** @override */
  async getData() {
    const context = await super.getData();
    const actorData = this.document.toObject(false);
    context.system = actorData.system;
    context.flags = actorData.flags;
    context.owner = this.document.isOwner;
    context.editable = this.isEditable;

    context.enrichedBiography = await TextEditor.enrichHTML(
      this.actor.system.biography || "",
      { async: true }
    );

    return context;
  }
}
