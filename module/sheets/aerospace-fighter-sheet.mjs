import { MechFoundryActorSheetV2 } from "./base-actor-sheet.mjs";

/**
 * Aerospace Fighter Actor Sheet (ApplicationV2) - placeholder for future expansion.
 * @extends {MechFoundryActorSheetV2}
 */
export class MechFoundryAerospaceFighterSheet extends MechFoundryActorSheetV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "aerospace-fighter-sheet"]
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/mech-foundry/templates/actor/actor-aerospace_fighter-sheet.hbs" }
  };
}
