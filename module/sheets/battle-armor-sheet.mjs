import { MechFoundryActorSheetV2 } from "./base-actor-sheet.mjs";

/**
 * Battle Armor Actor Sheet (ApplicationV2) - placeholder for future expansion.
 * @extends {MechFoundryActorSheetV2}
 */
export class MechFoundryBattleArmorSheet extends MechFoundryActorSheetV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "battle-armor-sheet"]
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/mech-foundry/templates/actor/actor-battle_armor-sheet.hbs" }
  };
}
