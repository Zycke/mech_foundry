import { MechFoundryUnitSheet } from "./unit-sheet.mjs";

/** Battle Armor Actor Sheet (ApplicationV2). @extends {MechFoundryUnitSheet} */
export class MechFoundryBattleArmorSheet extends MechFoundryUnitSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet", "battle-armor-sheet"]
  };
}
