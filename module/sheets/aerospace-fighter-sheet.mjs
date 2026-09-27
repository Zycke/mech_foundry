import { MechFoundryUnitSheet } from "./unit-sheet.mjs";

/** Aerospace Fighter Actor Sheet (ApplicationV2). @extends {MechFoundryUnitSheet} */
export class MechFoundryAerospaceFighterSheet extends MechFoundryUnitSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet", "aerospace-fighter-sheet"]
  };
}
