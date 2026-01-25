/**
 * Mech Foundry - A mech-based TTRPG system for Foundry VTT
 * Based on A Time of War mechanics from the BattleTech universe
 *
 * Core Mechanics:
 * - 2d6 + modifiers vs Target Number
 * - 8 Attributes: STR, BOD, RFL, DEX, INT, WIL, CHA, EDG
 * - Link Attribute Modifiers: 1=-2, 2-3=-1, 4-6=+0, 7-9=+1, 10=+2
 * - Skills have TN, Complexity (S/C), Linked Attributes, and Skill Level
 */

// Import document classes
import { MechFoundryActor } from "./documents/actor.mjs";

// Import sheet classes
import { MechFoundryActorSheet } from "./sheets/actor-sheet.mjs";
import { MechFoundryItemSheet } from "./sheets/item-sheet.mjs";

// Import helper/utility classes
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', function() {
  console.log("Mech Foundry | Initializing A Time of War System");

  // Add custom constants for configuration
  game.mechfoundry = {
    MechFoundryActor,
    config: MECHFOUNDRY
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = MechFoundryActor;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("mech-foundry", MechFoundryActorSheet, {
    makeDefault: true,
    label: "MECHFOUNDRY.SheetActor"
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("mech-foundry", MechFoundryItemSheet, {
    makeDefault: true,
    label: "MECHFOUNDRY.SheetItem"
  });

  // Preload Handlebars templates
  preloadHandlebarsTemplates();

  // Register Handlebars helpers
  _registerHandlebarsHelpers();

  // Register system settings
  _registerSystemSettings();
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function() {
  console.log("Mech Foundry | System Ready");
});

/* -------------------------------------------- */
/*  System Configuration                        */
/* -------------------------------------------- */

const MECHFOUNDRY = {
  attributes: {
    str: "MECHFOUNDRY.AttributeStr",
    bod: "MECHFOUNDRY.AttributeBod",
    rfl: "MECHFOUNDRY.AttributeRfl",
    dex: "MECHFOUNDRY.AttributeDex",
    int: "MECHFOUNDRY.AttributeInt",
    wil: "MECHFOUNDRY.AttributeWil",
    cha: "MECHFOUNDRY.AttributeCha",
    edg: "MECHFOUNDRY.AttributeEdg"
  },
  skillComplexity: {
    S: "MECHFOUNDRY.ComplexitySimple",
    C: "MECHFOUNDRY.ComplexityComplex"
  },
  traitTypes: {
    positive: "MECHFOUNDRY.TraitPositive",
    negative: "MECHFOUNDRY.TraitNegative"
  },
  weaponTypes: {
    melee: "MECHFOUNDRY.WeaponMelee",
    ranged: "MECHFOUNDRY.WeaponRanged",
    thrown: "MECHFOUNDRY.WeaponThrown"
  },
  // Target Numbers
  targetNumbers: {
    skillCheck: 7, // Default, varies by skill
    singleAttribute: 12,
    doubleAttribute: 18,
    consciousness: 7
  },
  // Range modifiers for ranged combat
  rangeModifiers: {
    pointBlank: 1,
    short: 0,
    medium: -2,
    long: -4,
    extreme: -6
  },
  // Cover modifiers
  coverModifiers: {
    light: -1,
    moderate: -2,
    heavy: -3,
    full: -4
  },
  // Size modifiers
  sizeModifiers: {
    monstrous: 5,
    veryLarge: 3,
    large: 1,
    medium: 0,
    small: -1,
    verySmall: -2,
    extremelySmall: -3,
    tiny: -4
  }
};

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

function _registerHandlebarsHelpers() {
  // Equality check
  Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });

  // Greater than or equal
  Handlebars.registerHelper('gte', function(a, b) {
    return a >= b;
  });

  // Less than
  Handlebars.registerHelper('lt', function(a, b) {
    return a < b;
  });

  // Less than or equal
  Handlebars.registerHelper('lte', function(a, b) {
    return a <= b;
  });

  // Greater than
  Handlebars.registerHelper('gt', function(a, b) {
    return a > b;
  });

  // Calculate Link Attribute Modifier from value
  Handlebars.registerHelper('linkMod', function(value) {
    if (value <= 1) return -2;
    if (value <= 3) return -1;
    if (value <= 6) return 0;
    if (value <= 9) return 1;
    return 2;
  });

  // Format modifier with sign
  Handlebars.registerHelper('formatMod', function(value) {
    if (value >= 0) return `+${value}`;
    return `${value}`;
  });

  // Calculate damage capacity from BOD
  Handlebars.registerHelper('damageCapacity', function(bod) {
    return bod * 2;
  });

  // Calculate fatigue capacity from WIL
  Handlebars.registerHelper('fatigueCapacity', function(wil) {
    return wil * 2;
  });

  // Calculate walk movement
  Handlebars.registerHelper('walkMovement', function(str, rfl) {
    return str + rfl;
  });

  // Calculate run movement
  Handlebars.registerHelper('runMovement', function(str, rfl) {
    return 10 + str + rfl;
  });

  // Math operations
  Handlebars.registerHelper('add', function(a, b) {
    return a + b;
  });

  Handlebars.registerHelper('subtract', function(a, b) {
    return a - b;
  });

  Handlebars.registerHelper('multiply', function(a, b) {
    return a * b;
  });

  Handlebars.registerHelper('divide', function(a, b) {
    return Math.floor(a / b);
  });

  // Percentage calculation
  Handlebars.registerHelper('percentage', function(current, max) {
    if (max === 0) return 0;
    return Math.round((current / max) * 100);
  });

  // Repeat helper for damage/fatigue bubbles
  Handlebars.registerHelper('times', function(n, block) {
    let result = '';
    for (let i = 0; i < n; i++) {
      result += block.fn(i);
    }
    return result;
  });
}

/* -------------------------------------------- */
/*  System Settings                             */
/* -------------------------------------------- */

function _registerSystemSettings() {
  // Whether to show roll details in chat
  game.settings.register("mech-foundry", "showRollDetails", {
    name: "MECHFOUNDRY.SettingShowRollDetails",
    hint: "MECHFOUNDRY.SettingShowRollDetailsHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  // Default difficulty modifier
  game.settings.register("mech-foundry", "defaultDifficulty", {
    name: "MECHFOUNDRY.SettingDefaultDifficulty",
    hint: "MECHFOUNDRY.SettingDefaultDifficultyHint",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    choices: {
      3: "Very Easy (+3)",
      1: "Easy (+1)",
      0: "Average (+0)",
      "-1": "Difficult (-1)",
      "-3": "Very Difficult (-3)",
      "-5": "Extremely Difficult (-5)"
    }
  });
}

/* -------------------------------------------- */
/*  Combat Hooks                                */
/* -------------------------------------------- */

// Override initiative formula
Hooks.once("init", function() {
  CONFIG.Combat.initiative = {
    formula: "2d6",
    decimals: 2
  };
});

// Custom initiative handling for Combat Sense trait
Hooks.on("preCreateCombatant", async (combatant, data, options, userId) => {
  const actor = combatant.actor;
  if (!actor) return;

  // Check for Combat Sense trait
  const hasCombatSense = actor.items.some(i =>
    i.type === 'trait' &&
    i.name.toLowerCase().includes('combat sense')
  );

  if (hasCombatSense) {
    // Roll 3d6 and keep highest 2
    const roll = await new Roll("3d6kh2").evaluate();
    combatant.updateSource({ initiative: roll.total });
  }
});

// Initiative tiebreaker by RFL
Hooks.on("combatStart", (combat) => {
  // Sort combatants with same initiative by RFL
  const turns = combat.turns.sort((a, b) => {
    if (a.initiative === b.initiative) {
      const rflA = a.actor?.system.attributes.rfl?.value || 0;
      const rflB = b.actor?.system.attributes.rfl?.value || 0;
      return rflB - rflA;
    }
    return b.initiative - a.initiative;
  });
});
