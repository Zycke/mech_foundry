import { MechFoundryActorSheetV2 } from "./base-actor-sheet.mjs";

/**
 * Ship Actor Sheet (ApplicationV2) - placeholder for future expansion.
 * @extends {MechFoundryActorSheetV2}
 */
export class MechFoundryShipSheet extends MechFoundryActorSheetV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "ship-sheet"]
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/mech-foundry/templates/actor/actor-ship-sheet.hbs" }
  };
}
