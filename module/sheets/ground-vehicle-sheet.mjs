import { MechFoundryActorSheetV2 } from "./base-actor-sheet.mjs";

/**
 * Ground Vehicle Actor Sheet (ApplicationV2) - placeholder for future expansion.
 * @extends {MechFoundryActorSheetV2}
 */
export class MechFoundryGroundVehicleSheet extends MechFoundryActorSheetV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "ground-vehicle-sheet"]
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/mech-foundry/templates/actor/actor-ground_vehicle-sheet.hbs" }
  };
}
