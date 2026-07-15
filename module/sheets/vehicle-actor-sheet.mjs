import { MechFoundryActorSheetV2 } from "./base-actor-sheet.mjs";

/**
 * Vehicle Actor Sheet (ApplicationV2) - placeholder for future expansion.
 * @extends {MechFoundryActorSheetV2}
 */
export class MechFoundryVehicleActorSheet extends MechFoundryActorSheetV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "vehicle-actor-sheet"]
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/mech-foundry/templates/actor/actor-vehicle_actor-sheet.hbs" }
  };
}
