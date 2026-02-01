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
import { MechFoundryItem } from "./documents/item.mjs";

// Import sheet classes
import { MechFoundryActorSheet } from "./sheets/actor-sheet.mjs";
import { MechFoundryItemSheet } from "./sheets/item-sheet.mjs";

// Import helper/utility classes
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
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
    config: MECHFOUNDRY
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = MechFoundryActor;
  CONFIG.Item.documentClass = MechFoundryItem;

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

  // Initialize socket handler for cross-player communication
  SocketHandler.initialize();

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
      modifiers: { str: -1, bod: -1, dex: 2, rfl: 2, int: 0, wil: 0, cha: 0, edg: 0 },
      maxValues: { str: 7, bod: 7, dex: 9, rfl: 9, int: 8, wil: 8, cha: 9, edg: 8 },
      bonusTraits: ["G-Tolerance", "Glass Jaw", "Field Aptitude: Clan Fighter Pilot"]
    },
    elemental: {
      label: "Elemental",
      modifiers: { str: 2, bod: 1, dex: -1, rfl: 0, int: 1, wil: 0, cha: 0, edg: 0 },
      maxValues: { str: 9, bod: 9, dex: 7, rfl: 8, int: 9, wil: 8, cha: 9, edg: 8 },
      bonusTraits: ["Toughness", "Field Aptitude: Elemental"]
    },
    mechwarrior: {
      label: "MechWarrior",
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

  // Absolute value
  Handlebars.registerHelper('abs', function(value) {
    return Math.abs(value);
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
  // Sort combatants with same initiative by RFL (using total including modifiers)
  const turns = combat.turns.sort((a, b) => {
    if (a.initiative === b.initiative) {
      const rflA = a.actor?.system.attributes.rfl?.total || 0;
      const rflB = b.actor?.system.attributes.rfl?.total || 0;
      return rflB - rflA;
    }
    return b.initiative - a.initiative;
  });
});

// Apply continuous damage effects at end of round (when "Next Round" is pressed)
Hooks.on("combatRound", async (combat, updateData, updateOptions) => {
  // Only run for the GM to prevent duplicate processing
  if (!game.user.isGM) return;

  // Process each combatant
  for (const combatant of combat.combatants) {
    // Get the actor - for tokens, this gets the correct token actor
    let actor = combatant.actor;
    if (!actor) continue;

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
    const standardDamage = parseInt(button.dataset.standard) || 0;
    const fatigueDamage = parseInt(button.dataset.fatigue) || 0;
    const isSubduing = button.dataset.subduing === 'true';
    const location = button.dataset.location || null;

    // Get the target actor
    const target = game.actors.get(targetId);
    if (!target) {
      ui.notifications.error("Target actor not found!");
      return;
    }

    // Check if user has permission to modify this actor
    if (!target.isOwner && !game.user.isGM) {
      ui.notifications.warn("You do not have permission to apply damage to this actor.");
      return;
    }

    // Apply the damage
    if (isSubduing) {
      // Subduing damage - apply fatigue damage
      await target.applyDamage(fatigueDamage, 0, 'm', location, true);
    } else {
      // Standard damage - apply standard damage (fatigue is added automatically)
      await target.applyDamage(standardDamage, 0, 'm', location, false);
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

  const visionEffects = actor.system.visionEffects;
  if (!visionEffects) return;

  const { vision, light } = visionEffects;
  const updates = {};

  // Apply vision mode if present
  if (vision?.visionMode && vision.visionRange > 0) {
    updates['sight.range'] = vision.visionRange;
    updates['sight.visionMode'] = vision.visionMode;
    updates['sight.enabled'] = true;
  }

  // Apply light emission if present
  if (light?.brightRadius > 0 || light?.dimRadius > 0) {
    updates['light.bright'] = light.brightRadius || 0;
    updates['light.dim'] = light.dimRadius || 0;
    updates['light.angle'] = 360; // Full circle light

    if (light.lightColor) {
      updates['light.color'] = light.lightColor;
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

// Update token vision when actor items change (equip/unequip)
Hooks.on('updateItem', async (item, changes, options, userId) => {
  if (game.user.id !== userId) return;

  // Check if carryStatus changed (equip/unequip)
  if (!changes.system?.carryStatus && !changes.system?.equipped) return;

  const actor = item.parent;
  if (!actor) return;

  // Find all tokens for this actor and update their vision
  const tokens = actor.getActiveTokens();
  for (const token of tokens) {
    await applyVisionEffects(token, actor);
  }

  // Handle embedded Active Effects transfer on equip/unequip
  if (MechFoundryItem.EQUIPPABLE_TYPES.includes(item.type)) {
    const wasEquipped = !item.isEquipped; // Old state (before change)
    const isNowEquipped = item.isEquipped; // New state (after change)

    // Only process if there's an actual change
    if (wasEquipped !== isNowEquipped) {
      await item.onEquipmentStatusChange(isNowEquipped);
    }
  }
});

// Handle item creation - sync embedded effects to actor
Hooks.on('createItem', async (item, options, userId) => {
  if (game.user.id !== userId) return;
  if (!item.parent) return;

  // Sync embedded Active Effects to actor
  if (MechFoundryItem.EQUIPPABLE_TYPES.includes(item.type) && item.isEquipped) {
    await item.syncEffectsToActor();
  }
});

// Handle item deletion - clean up transferred effects
Hooks.on('preDeleteItem', async (item, options, userId) => {
  if (game.user.id !== userId) return;
  if (!item.parent) return;

  // Clean up transferred Active Effects from actor
  if (MechFoundryItem.EQUIPPABLE_TYPES.includes(item.type)) {
    await item.cleanupTransferredEffects();
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
