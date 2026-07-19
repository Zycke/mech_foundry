/**
 * Mech Foundry - A mech-based TTRPG system for Foundry VTT
 * Based on A Time of War mechanics from the BattleTech universe
 *
 * Core Mechanics:
 * - 2d6 + modifiers vs Target Number
 * - 8 Attributes: STR, BOD, RFL, DEX, INT, WIL, CHA, EDG
 * - Link Attribute Modifiers: 0=-4, 1=-2, 2-3=-1, 4-6=+0, 7-9=+1, 10=+2, 11+=floor(score/3) max +5
 * - Skills have TN, Complexity (S/C), Linked Attributes, and Skill Level
 */

// Import document classes
import { MechFoundryActor } from "./documents/actor.mjs";
import { MechFoundryItem } from "./documents/item.mjs";
import { MechFoundryCombat } from "./documents/combat.mjs";

// Import sheet classes
import { MechFoundryActorSheet } from "./sheets/actor-sheet.mjs";
import { MechFoundryItemSheet } from "./sheets/item-sheet.mjs";
import { MechFoundryCompanySheet } from "./sheets/company-sheet.mjs";
import { MechFoundryNavalShipSheet } from "./sheets/naval-ship-sheet.mjs";
import { MechFoundryMechSheet } from "./sheets/mech-sheet.mjs";
import { MechFoundryGroundVehicleSheet } from "./sheets/ground-vehicle-sheet.mjs";
import { MechFoundryAerospaceFighterSheet } from "./sheets/aerospace-fighter-sheet.mjs";
import { MechFoundryBattleArmorSheet } from "./sheets/battle-armor-sheet.mjs";
import { MechFoundryInstallationSheet } from "./sheets/installation-sheet.mjs";

// Import helper/utility classes
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { registerSeederSettings, seedLifeModules } from "./helpers/life-module-seeder.mjs";
import { seedReferenceCompendia, rebuildReferenceConfig, registerReferenceSeederSettings } from "./helpers/reference-seeder.mjs";
import { seedWeapons } from "./helpers/weapon-seeder.mjs";
import { seedAmmo } from "./helpers/ammo-seeder.mjs";
import { seedArmor } from "./helpers/armor-seeder.mjs";
import { makeFolderedSeeder } from "./helpers/pack-seeder.mjs";
import { ELECTRONICS_SEED } from "./data/electronics.mjs";
import { FIELD_GEAR_SEED } from "./data/field-gear.mjs";
import { MEDICAL_SEED } from "./data/medical.mjs";
import { VEHICLE_SEED } from "./data/vehicles.mjs";

const seedElectronics = makeFolderedSeeder("mech-foundry.electronics", () => ELECTRONICS_SEED, "Electronics");
const seedFieldGear = makeFolderedSeeder("mech-foundry.gear", () => FIELD_GEAR_SEED, "Field Gear");
const seedMedical = makeFolderedSeeder("mech-foundry.medical", () => MEDICAL_SEED, "Medical");
const seedVehicles = makeFolderedSeeder("mech-foundry.vehicles", () => VEHICLE_SEED, "Vehicles");
import { CharacterWizard } from "./apps/character-wizard.mjs";
import { ShopApplication } from "./apps/shop.mjs";
import { ATOW_SKILLS, ATOW_TRAITS, ATOW_TRAIT_DESCRIPTIONS } from "./data/atow-lists.mjs";
import { woundDescription, conditionDescription } from "./data/status-descriptions.mjs";
import { SocketHandler, SOCKET_EVENTS } from "./helpers/socket-handler.mjs";
import { OpposedRollHelper } from "./helpers/opposed-rolls.mjs";
import { DiceMechanics } from "./helpers/dice-mechanics.mjs";
import { ItemEffectsHelper, EFFECT_CATEGORIES, getEffectTypeOptions } from "./helpers/effects-helper.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', function() {
  console.log("Mech Foundry | Initializing A Time of War System");

  // Add custom constants for configuration
  game.mechfoundry = {
    MechFoundryActor,
    MechFoundryItem,
    DiceMechanics,
    ItemEffectsHelper,
    EFFECT_CATEGORIES,
    getEffectTypeOptions,
    CharacterWizard,
    /** Open the character-creation wizard, optionally bound to an actor. */
    openCharacterWizard: (actor = null) => new CharacterWizard({ actor }).render(true),
    /** Open the equipment shop bound to an actor (defaults to the selected token/character). */
    openShop: (actor = null) => new ShopApplication({
      actor: actor ?? game.user?.character ?? canvas?.tokens?.controlled?.[0]?.actor ?? null
    }).render(true),
    ShopApplication,
    /** Manually (re)seed the Life Modules compendium, adding any missing starters. */
    reseedLifeModules: () => seedLifeModules({ force: true }),
    /** Manually (re)seed the Skills/Traits reference compendia, then refresh config. */
    reseedReferences: () => seedReferenceCompendia({ force: true }).then(rebuildReferenceConfig),
    /** Manually (re)seed the Weapons compendium, adding any missing entries. */
    reseedWeapons: () => seedWeapons({ force: true }),
    /** Overwrite already-seeded weapons with the current seed data (pushes data
     *  corrections; discards GM edits to those weapons). */
    refreshWeapons: () => seedWeapons({ refresh: true }),
    /** Manually (re)seed the Ammunition compendium, adding any missing entries. */
    reseedAmmo: () => seedAmmo({ force: true }),
    /** Overwrite already-seeded ammo with the current seed data (pushes data
     *  corrections; discards GM edits to those items). */
    refreshAmmo: () => seedAmmo({ refresh: true }),
    /** Manually (re)seed the Armor compendium, adding any missing entries. */
    reseedArmor: () => seedArmor({ force: true }),
    /** Overwrite already-seeded armor with the current seed data (pushes data
     *  corrections; discards GM edits to those items). */
    refreshArmor: () => seedArmor({ refresh: true }),
    /** Manually (re)seed the Electronics compendium, adding any missing entries. */
    reseedElectronics: () => seedElectronics({ force: true }),
    refreshElectronics: () => seedElectronics({ refresh: true }),
    /** Manually (re)seed the Field Gear compendium, adding any missing entries. */
    reseedFieldGear: () => seedFieldGear({ force: true }),
    refreshFieldGear: () => seedFieldGear({ refresh: true }),
    /** Manually (re)seed the Medical compendium, adding any missing entries. */
    reseedMedical: () => seedMedical({ force: true }),
    refreshMedical: () => seedMedical({ refresh: true }),
    /** Manually (re)seed the Vehicles compendium, adding any missing entries. */
    reseedVehicles: () => seedVehicles({ force: true }),
    refreshVehicles: () => seedVehicles({ refresh: true }),
    config: MECHFOUNDRY
  };

  // Canonical A Time of War skill / trait reference lists (wizard dropdowns +
  // trait tooltips). On config so a module or GM can override them.
  MECHFOUNDRY.skillsList = ATOW_SKILLS;
  MECHFOUNDRY.traitsList = ATOW_TRAITS;
  MECHFOUNDRY.traitDescriptions = ATOW_TRAIT_DESCRIPTIONS;

  // Define custom Document classes
  CONFIG.Actor.documentClass = MechFoundryActor;
  CONFIG.Item.documentClass = MechFoundryItem;
  CONFIG.Combat.documentClass = MechFoundryCombat;

  // Register sheet application classes (v14: use the namespaced document
  // collections and the appv1 core sheet classes rather than bare globals).
  const ActorsCollection = foundry.documents.collections.Actors;
  const ItemsCollection = foundry.documents.collections.Items;

  ActorsCollection.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  ActorsCollection.registerSheet("mech-foundry", MechFoundryActorSheet, {
    makeDefault: true,
    types: ["character", "npc"],
    label: "MECHFOUNDRY.SheetActor"
  });
  ActorsCollection.registerSheet("mech-foundry", MechFoundryCompanySheet, {
    types: ["company"],
    makeDefault: true,
    label: "MECHFOUNDRY.SheetCompany"
  });
  ActorsCollection.registerSheet("mech-foundry", MechFoundryNavalShipSheet, {
    types: ["naval_ship"],
    makeDefault: true,
    label: "MECHFOUNDRY.SheetNavalShip"
  });
  ActorsCollection.registerSheet("mech-foundry", MechFoundryMechSheet, {
    types: ["mech"],
    makeDefault: true,
    label: "MECHFOUNDRY.SheetMech"
  });
  ActorsCollection.registerSheet("mech-foundry", MechFoundryGroundVehicleSheet, {
    types: ["ground_vehicle"],
    makeDefault: true,
    label: "MECHFOUNDRY.SheetGroundVehicle"
  });
  ActorsCollection.registerSheet("mech-foundry", MechFoundryAerospaceFighterSheet, {
    types: ["aerospace_fighter"],
    makeDefault: true,
    label: "MECHFOUNDRY.SheetAerospaceFighter"
  });
  ActorsCollection.registerSheet("mech-foundry", MechFoundryBattleArmorSheet, {
    types: ["battle_armor"],
    makeDefault: true,
    label: "MECHFOUNDRY.SheetBattleArmor"
  });
  ActorsCollection.registerSheet("mech-foundry", MechFoundryInstallationSheet, {
    types: ["installation"],
    makeDefault: true,
    label: "MECHFOUNDRY.SheetInstallation"
  });

  ItemsCollection.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  ItemsCollection.registerSheet("mech-foundry", MechFoundryItemSheet, {
    makeDefault: true,
    label: "MECHFOUNDRY.SheetItem"
  });

  // Preload Handlebars templates
  preloadHandlebarsTemplates();

  // Register Handlebars helpers
  _registerHandlebarsHelpers();

  // Register system settings
  _registerSystemSettings();

  // Register the one-time life-module seed tracking flag
  registerSeederSettings();
  // Register the reference-compendia version marker (version-change reseeding)
  registerReferenceSeederSettings();
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', async function() {
  console.log("Mech Foundry | System Ready");

  // Seed the character-creation compendia on first load (GM only, idempotent).
  // When the system version changes, reconcile the code-generated packs: add any
  // entries introduced since (by name) without disturbing existing/GM-edited
  // items. Then rebuild the runtime skill/trait lists FROM the compendia so GM
  // edits flow through to the wizard.
  if (game.user?.isGM) {
    const lastSeeded = game.settings.get('mech-foundry', 'referenceSeedVersion') || '';
    const current = game.system.version;
    const reconcile = lastSeeded !== current; // new deploy (or first run)
    let added = 0;
    added += await seedLifeModules({ force: reconcile, quiet: reconcile });
    added += await seedReferenceCompendia({ force: reconcile, quiet: reconcile });
    added += await seedWeapons({ force: reconcile, quiet: reconcile });
    added += await seedAmmo({ force: reconcile, quiet: reconcile });
    added += await seedArmor({ force: reconcile, quiet: reconcile });
    added += await seedElectronics({ force: reconcile, quiet: reconcile });
    added += await seedFieldGear({ force: reconcile, quiet: reconcile });
    added += await seedMedical({ force: reconcile, quiet: reconcile });
    added += await seedVehicles({ force: reconcile, quiet: reconcile });
    if (reconcile) {
      await game.settings.set('mech-foundry', 'referenceSeedVersion', current);
      if (added > 0) {
        ui.notifications?.info(`Mech Foundry: updated compendia for v${current} — added ${added} new entr${added === 1 ? 'y' : 'ies'}.`);
      }
    }
  }
  await rebuildReferenceConfig();

  // Initialize socket handler for cross-player communication
  SocketHandler.initialize();
  ShopApplication.initSocket();

  // Make OpposedRollHelper available globally
  game.mechfoundry.OpposedRollHelper = OpposedRollHelper;
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
  // Ammunition families. A weapon and an ammo item are compatible when their
  // `ammoType` matches (and, for ordnance families, their ordnance class too).
  // Weapons get their ammoType automatically from the seed; the field is an
  // editable dropdown so a GM can override it.
  ammoTypes: {
    "": "None / single-use",
    ballistic: "Ballistic (slug rounds)",
    flechette: "Flechette / shotgun / needler",
    gauss: "Gauss slugs",
    gyrojet: "Gyrojet rockets",
    "power-pack": "Power pack (energy)",
    grenade: "Grenade (ordnance)",
    mortar: "Mortar (ordnance)",
    missile: "Missile (ordnance)",
    recoilless: "Recoilless (ordnance)",
    mine: "Mine (ordnance)",
    ordnance: "Ordnance (generic, by class)"
  },
  // Ordnance families require a matching class letter (A-E) between weapon & ammo.
  ordnanceAmmoTypes: ["grenade", "mortar", "missile", "recoilless", "mine"],
  ordnanceClasses: ["", "A", "B", "C", "D", "E"],
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
  },
  // Phenotype configurations (A Time of War p.116)
  phenotypes: {
    normal: {
      label: "Normal Human",
      modifiers: { str: 0, bod: 0, dex: 0, rfl: 0, int: 0, wil: 0, cha: 0, edg: 0 },
      maxValues: { str: 8, bod: 8, dex: 8, rfl: 8, int: 8, wil: 8, cha: 9, edg: 9 },
      bonusTraits: []
    },
    aerospace: {
      label: "Aerospace",
      clanOnly: true,
      modifiers: { str: -1, bod: -1, dex: 2, rfl: 2, int: 0, wil: 0, cha: 0, edg: 0 },
      maxValues: { str: 7, bod: 7, dex: 9, rfl: 9, int: 8, wil: 8, cha: 9, edg: 8 },
      bonusTraits: ["G-Tolerance", "Glass Jaw", "Field Aptitude: Clan Fighter Pilot"]
    },
    elemental: {
      label: "Elemental",
      clanOnly: true,
      modifiers: { str: 2, bod: 1, dex: -1, rfl: 0, int: 1, wil: 0, cha: 0, edg: 0 },
      maxValues: { str: 9, bod: 9, dex: 7, rfl: 8, int: 9, wil: 8, cha: 9, edg: 8 },
      bonusTraits: ["Toughness", "Field Aptitude: Elemental"]
    },
    mechwarrior: {
      label: "MechWarrior",
      clanOnly: true,
      modifiers: { str: 0, bod: 0, dex: 1, rfl: 1, int: 0, wil: 0, cha: 0, edg: 0 },
      maxValues: { str: 8, bod: 8, dex: 9, rfl: 9, int: 8, wil: 8, cha: 9, edg: 8 },
      bonusTraits: ["Field Aptitude: Clan MechWarrior"]
    }
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

  // Calculate Link Attribute Modifier from value (single source of truth)
  Handlebars.registerHelper('linkMod', function(value) {
    return MechFoundryActor.getLinkModifier(value);
  });

  // Format modifier with sign
  Handlebars.registerHelper('formatMod', function(value) {
    if (value >= 0) return `+${value}`;
    return `${value}`;
  });

  // Hover-tooltip text for a wound type / medical condition (combat tab).
  Handlebars.registerHelper('woundDescription', function(type) {
    return woundDescription(type);
  });
  Handlebars.registerHelper('conditionDescription', function(key) {
    return conditionDescription(key);
  });

  // Thousands-separated number (e.g. 1000000 -> "1,000,000"), used for C-bill and
  // other large-number displays. Overrides Foundry's core `numberFormat` as a
  // safe superset: adds comma grouping while still honouring the `decimals` and
  // `sign` hash options and preserving precision when no decimals are requested.
  Handlebars.registerHelper('numberFormat', function(value, options) {
    const hash = (options && options.hash) || {};
    const n = Number(value);
    if (!Number.isFinite(n)) return value ?? '';
    const opts = { useGrouping: true };
    if (Number.isInteger(hash.decimals)) {
      opts.minimumFractionDigits = hash.decimals;
      opts.maximumFractionDigits = hash.decimals;
    } else {
      opts.maximumFractionDigits = 20; // don't lose precision when unspecified
    }
    let str = n.toLocaleString('en-US', opts);
    if (hash.sign && n >= 0) str = `+${str}`;
    return str;
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

  // Absolute value
  Handlebars.registerHelper('abs', function(value) {
    return Math.abs(value);
  });

  // Uppercase a string (e.g. attribute keys shown in the Links column)
  Handlebars.registerHelper('upper', function(value) {
    return String(value ?? '').toUpperCase();
  });

  // Not equal
  Handlebars.registerHelper('ne', function(a, b) {
    return a !== b;
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

  /* ---- Character creation (GM-tunable) --------------------------------- */

  // Starting XP pool for the character-creation wizard (ATOW default 5000).
  game.settings.register("mech-foundry", "creationStartingXP", {
    name: "MECHFOUNDRY.SettingCreationStartingXP",
    hint: "MECHFOUNDRY.SettingCreationStartingXPHint",
    scope: "world",
    config: true,
    type: Number,
    default: 5000
  });

  // How strictly the wizard enforces prerequisites / phenotype caps / stages.
  game.settings.register("mech-foundry", "creationStrictness", {
    name: "MECHFOUNDRY.SettingCreationStrictness",
    hint: "MECHFOUNDRY.SettingCreationStrictnessHint",
    scope: "world",
    config: true,
    type: String,
    default: "permissive",
    choices: {
      permissive: "MECHFOUNDRY.SettingCreationStrictnessPermissive",
      strict: "MECHFOUNDRY.SettingCreationStrictnessStrict"
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
Hooks.on("preCreateCombatant", (combatant, data, options, userId) => {
  const actor = combatant.actor;
  if (!actor) return;

  // Check for Combat Sense trait
  const hasCombatSense = actor.items.some(i =>
    i.type === 'trait' &&
    i.name.toLowerCase().includes('combat sense')
  );

  if (hasCombatSense) {
    // preCreate hooks are NOT awaited by Foundry, so the roll must be evaluated
    // synchronously for updateSource to affect the persisted document.
    // Roll 3d6 and keep the highest 2.
    const roll = new Roll("3d6kh2").evaluateSync();
    combatant.updateSource({ initiative: roll.total });
  }
});

// Initiative ties are broken by RFL in MechFoundryCombat#_sortCombatants
// (see documents/combat.mjs) — sorting the derived combat.turns array here
// would have no persistent effect.

// Reset firstAidUsedThisCombat when combat ends
Hooks.on("deleteCombat", async (combat) => {
  // Only run for the GM to prevent duplicate processing
  if (!game.user.isGM) return;

  // Reset first aid flag for all actors that were in combat
  for (const combatant of combat.combatants) {
    let actor = combatant.actor;
    if (!actor) continue;

    if (actor.system.firstAidUsedThisCombat) {
      await actor.update({ "system.firstAidUsedThisCombat": false });
    }
  }
});

// Apply bleeding and continuous damage effects at end of round (when "Next Round" is pressed)
Hooks.on("combatRound", async (combat, updateData, updateOptions) => {
  // Only run for the GM to prevent duplicate processing
  if (!game.user.isGM) return;

  // Process each combatant
  for (const combatant of combat.combatants) {
    // Get the actor - for tokens, this gets the correct token actor
    let actor = combatant.actor;
    if (!actor) continue;

    // Apply bleeding damage (1 standard damage per round)
    if (actor.system.bleeding) {
      const currentDmg = actor.system.damage?.value || 0;
      const maxDamage = actor.system.damageCapacity || 10;
      const newDamage = Math.min(currentDmg + 1, maxDamage);

      await actor.update({ "system.damage.value": newDamage });

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `<div class="mech-foundry bleeding-damage">
          <i class="fas fa-tint"></i> <strong>${actor.name}</strong> takes 1 standard damage from <strong>Bleeding</strong> (${currentDmg} → ${newDamage})
        </div>`
      });

      // Check for death after bleeding damage
      if (newDamage >= maxDamage) {
        ui.notifications.error(`${actor.name} has died!`);
      }
    }

    // Find all active continuous damage effects
    const continuousDamageEffects = actor.items.filter(i =>
      i.type === 'activeEffect' &&
      i.system.active &&
      i.system.effectType === 'continuous_damage'
    );

    if (continuousDamageEffects.length === 0) continue;

    // Calculate total continuous damage
    let totalStandardDamage = 0;
    let totalFatigueDamage = 0;
    const effectNames = [];

    for (const effect of continuousDamageEffects) {
      const stdDmg = Number(effect.system.continuousDamage?.standardDamage) || 0;
      const fatDmg = Number(effect.system.continuousDamage?.fatigueDamage) || 0;

      if (stdDmg > 0 || fatDmg > 0) {
        totalStandardDamage += stdDmg;
        totalFatigueDamage += fatDmg;
        effectNames.push(effect.name);
      }
    }

    // Apply damage if any
    if (totalStandardDamage > 0 || totalFatigueDamage > 0) {
      // Capture current damage values for the chat message
      const currentStdDmg = actor.system.damage?.value || 0;
      const currentFatDmg = actor.system.fatigue?.value || 0;

      // Apply damage directly via update to ensure it takes effect
      const updateData = {};

      if (totalStandardDamage > 0) {
        const maxDamage = actor.system.damageCapacity || 10;
        const newDamage = Math.min(currentStdDmg + totalStandardDamage, maxDamage);
        updateData["system.damage.value"] = newDamage;
      }

      if (totalFatigueDamage > 0) {
        const maxFatigue = actor.system.fatigueCapacity || 10;
        const newFatigue = Math.min(currentFatDmg + totalFatigueDamage, maxFatigue);
        updateData["system.fatigue.value"] = newFatigue;
      }

      // Perform the update
      await actor.update(updateData);

      // Calculate new values for chat message
      const newStdDmg = actor.system.damage?.value || 0;
      const newFatDmg = actor.system.fatigue?.value || 0;

      // Send chat message with before/after values
      const damageMsg = [];
      if (totalStandardDamage > 0) {
        damageMsg.push(`${totalStandardDamage} standard damage (${currentStdDmg} → ${newStdDmg})`);
      }
      if (totalFatigueDamage > 0) {
        damageMsg.push(`${totalFatigueDamage} fatigue damage (${currentFatDmg} → ${newFatDmg})`);
      }

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `<div class="mech-foundry continuous-damage">
          <strong>${actor.name}</strong> takes ${damageMsg.join(' and ')} from continuous effects:
          <em>${effectNames.join(', ')}</em>
        </div>`
      });

      // Check for death/unconsciousness after applying damage
      if (updateData["system.damage.value"] !== undefined) {
        const maxDamage = actor.system.damageCapacity || 10;
        if (updateData["system.damage.value"] >= maxDamage) {
          ui.notifications.error(`${actor.name} has died!`);
        }
      }

      if (updateData["system.fatigue.value"] !== undefined) {
        const maxFatigue = actor.system.fatigueCapacity || 10;
        if (updateData["system.fatigue.value"] >= maxFatigue) {
          ui.notifications.warn(`${actor.name} has fallen unconscious!`);
          await actor.update({ "system.unconscious": true });
        }
      }
    }
  }
});

/* -------------------------------------------- */
/*  Chat Message Hooks                          */
/* -------------------------------------------- */

// Handle Apply Damage buttons and Defender Choice buttons in chat messages
Hooks.on('renderChatMessage', (message, html, data) => {
  // Apply Damage button handler
  html.find('.apply-damage').click(async (event) => {
    event.preventDefault();
    const button = event.currentTarget;

    // Get data from button attributes
    const targetId = button.dataset.targetId;
    const tokenId = button.dataset.tokenId || null;
    const sceneId = button.dataset.sceneId || null;
    const standardDamage = parseInt(button.dataset.standard) || 0;
    const fatigueDamage = parseInt(button.dataset.fatigue) || 0;
    const isSubduing = button.dataset.subduing === 'true';
    const isExplosive = button.dataset.explosive === 'true';
    const rawDamage = parseInt(button.dataset.rawDamage) || standardDamage;
    const location = button.dataset.location || null;
    const woundType = button.dataset.woundType || null;

    // Get the target actor - prefer token actor for unlinked token support
    let target = null;
    if (tokenId && sceneId) {
      const scene = game.scenes.get(sceneId);
      const tokenDoc = scene?.tokens.get(tokenId);
      if (tokenDoc) target = tokenDoc.actor;
    }
    // Fall back to base actor if no token reference
    if (!target) target = game.actors.get(targetId);
    if (!target) {
      ui.notifications.error("Target actor not found!");
      return;
    }

    // Check if user has permission to modify this actor
    if (!target.isOwner && !game.user.isGM) {
      ui.notifications.warn("You do not have permission to apply damage to this actor.");
      return;
    }

    // Apply the damage (pass raw damage for knockdown check, isExplosive flag)
    if (isSubduing) {
      // Subduing damage - apply fatigue damage (no knockdown check for subduing)
      await target.applyDamage(fatigueDamage, 0, 'm', location, true, false, null);
    } else {
      // Standard damage - damage is already armor-reduced from chat template calculation
      // Pass rawDamage separately for knockdown check
      await target.applyDamage(standardDamage, 0, 'm', location, false, isExplosive, rawDamage);
    }

    // Apply wound effect if present (from critical hit - doubles on attack)
    // Valid wound types: dazed, deafened, blinded, internalDamage, shatteredLimb
    // Knockdown is not a wound, just a status effect
    if (woundType && woundType !== 'knockdown') {
      await target.inflictWound(woundType, location, 'Critical Hit');
    }

    // Disable the button and update text
    button.disabled = true;
    button.textContent = "Damage Applied";
    button.classList.add('disabled');

    // Show notification of damage applied
    ui.notifications.info(`Applied ${isSubduing ? fatigueDamage + ' fatigue' : standardDamage + ' standard'} damage to ${target.name}`);
  });

  // Defender Choice button handlers (Block vs Mutual Damage)
  html.find('.defender-choice-btn').click(async (event) => {
    event.preventDefault();
    const button = event.currentTarget;
    const rollId = button.dataset.rollId;
    const choice = button.dataset.choice;

    // Send choice via socket for cross-player communication
    SocketHandler.emit(SOCKET_EVENTS.DEFENDER_CHOICE, {
      rollId: rollId,
      choice: choice,
      attackerUserId: message.user.id
    });

    // Also resolve locally if this is a pending choice
    const pendingChoice = game.mechfoundry.pendingDefenderChoices?.[rollId];
    if (pendingChoice) {
      pendingChoice.resolve(choice);
      delete game.mechfoundry.pendingDefenderChoices[rollId];
    }

    // Disable all choice buttons
    html.find('.defender-choice-btn').each((i, btn) => {
      btn.disabled = true;
      btn.classList.add('disabled');
    });

    // Update the choice section to show selection and reveal damage buttons if mutual
    const choiceSection = html.find('.defender-choice-section');
    if (choice === 'block') {
      choiceSection.html(`<div class="choice-made">Defender chose to block!</div>`);
    } else {
      // Mutual damage - show both Apply Damage buttons
      choiceSection.html(`<div class="choice-made">Both combatants deal damage!</div>`);
      // Show the hidden damage application buttons
      html.find('.apply-attacker-damage').show();
      html.find('.apply-defender-damage').show();
    }
  });
});

/* -------------------------------------------- */
/*  Vision Effect Hooks                         */
/* -------------------------------------------- */

/**
 * Apply vision and light effects from equipped items to tokens
 * This integrates with Foundry's vision and lighting system
 *
 * Vision Modes (Foundry built-in):
 * - basic: Standard default vision
 * - darkvision: Desaturated vision in darkness, colors in lit areas
 * - monochromatic: No colors regardless of light source
 * - tremorsense: Radar-sweep visual effect
 * - lightAmplification: Night-vision goggles effect (green-tinted)
 */
async function applyVisionEffects(token, actor) {
  if (!token || !actor) return;

  // Calculate vision effects fresh from items (don't rely on cached actor.system.visionEffects
  // as it may not have been recalculated yet after an item update)
  const visionEffects = ItemEffectsHelper.getVisionEffects(actor);
  if (!visionEffects) return;

  const { vision, light } = visionEffects;
  const updates = {};

  // Get current token settings for comparison
  const currentDoc = token.document;
  const hasActiveVisionEffect = vision?.visionMode && vision.visionRange > 0;
  const hasActiveLightEffect = light?.brightRadius > 0 || light?.dimRadius > 0;

  // Apply vision mode if present, or reset to defaults if no vision effects
  if (hasActiveVisionEffect) {
    updates['sight.range'] = vision.visionRange;
    updates['sight.visionMode'] = vision.visionMode;
    updates['sight.enabled'] = true;
  } else {
    // Reset vision to defaults if currently using a non-basic mode from item effects
    // Only reset if the current mode suggests it came from an item effect
    const currentMode = currentDoc.sight?.visionMode;
    if (currentMode && currentMode !== 'basic') {
      updates['sight.visionMode'] = 'basic';
      updates['sight.range'] = 0;
    }
  }

  // Apply light emission if present, or reset if no light effects
  if (hasActiveLightEffect) {
    updates['light.bright'] = light.brightRadius || 0;
    updates['light.dim'] = light.dimRadius || 0;
    updates['light.angle'] = 360; // Full circle light

    if (light.lightColor) {
      updates['light.color'] = light.lightColor;
    }
  } else {
    // Reset light to off if currently emitting light
    const currentBright = currentDoc.light?.bright || 0;
    const currentDim = currentDoc.light?.dim || 0;
    if (currentBright > 0 || currentDim > 0) {
      updates['light.bright'] = 0;
      updates['light.dim'] = 0;
    }
  }

  // Apply any updates
  if (Object.keys(updates).length > 0 && token.document) {
    await token.document.update(updates);
  }
}

// Update token vision when a token is created
Hooks.on('createToken', async (tokenDocument, options, userId) => {
  if (game.user.id !== userId) return;

  const actor = tokenDocument.actor;
  if (!actor) return;

  // Delay to ensure token is fully created
  setTimeout(async () => {
    const token = canvas.tokens?.get(tokenDocument.id);
    if (token) {
      await applyVisionEffects(token, actor);
    }
  }, 100);
});

// Update token vision when actor items change (equip/unequip or effect toggle)
Hooks.on('updateItem', async (item, changes, options, userId) => {
  if (game.user.id !== userId) return;

  // Check if carryStatus changed (equip/unequip) or itemEffects changed (toggle)
  if (!changes.system?.carryStatus && !changes.system?.equipped && !changes.system?.itemEffects) return;

  const actor = item.parent;
  if (!actor) return;

  // Find all tokens for this actor and update their vision
  const tokens = actor.getActiveTokens();
  for (const token of tokens) {
    await applyVisionEffects(token, actor);
  }
});

// Update token vision when actor is updated (in case effects change)
Hooks.on('updateActor', async (actor, changes, options, userId) => {
  if (game.user.id !== userId) return;

  // Find all tokens for this actor and update their vision
  const tokens = actor.getActiveTokens();
  for (const token of tokens) {
    await applyVisionEffects(token, actor);
  }
});
