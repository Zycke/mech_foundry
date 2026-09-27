import { MechFoundryUnitSheet } from "./unit-sheet.mjs";

/** Mech Actor Sheet (ApplicationV2). @extends {MechFoundryUnitSheet} */
export class MechFoundryMechSheet extends MechFoundryUnitSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet", "mech-sheet"]
  };
}
