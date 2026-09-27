import { MechFoundryUnitSheet } from "./unit-sheet.mjs";

/** Ground Vehicle Actor Sheet (ApplicationV2). @extends {MechFoundryUnitSheet} */
export class MechFoundryGroundVehicleSheet extends MechFoundryUnitSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet", "ground-vehicle-sheet"]
  };
}
