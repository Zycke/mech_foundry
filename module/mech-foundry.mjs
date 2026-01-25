/**
 * Mech Foundry - A mech-based TTRPG system for Foundry VTT
 * Inspired by A Time of War and the BattleTech universe
 */

// Import document classes
import { MechFoundryActor } from "./documents/actor.mjs";

// Import sheet classes
import { MechFoundryActorSheet } from "./sheets/actor-sheet.mjs";

// Import helper/utility classes
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', function() {
  console.log("Mech Foundry | Initializing Mech Foundry System");

  // Add custom constants for configuration
  game.mechfoundry = {
    MechFoundryActor,
    rollSkillCheck
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = MechFoundryActor;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("mech-foundry", MechFoundryActorSheet, {
    makeDefault: true,
    label: "MECHFOUNDRY.SheetActor"
  });

  // Preload Handlebars templates
  preloadHandlebarsTemplates();

  // Register Handlebars helpers
  _registerHandlebarsHelpers();
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function() {
  console.log("Mech Foundry | System Ready");
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

function _registerHandlebarsHelpers() {
  // Helper to check equality
  Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });

  // Helper for 2d6 roll display
  Handlebars.registerHelper('roll2d6', function(modifier) {
    return `2d6 + ${modifier}`;
  });

  // Helper to get attribute modifier
  Handlebars.registerHelper('attrMod', function(value) {
    return Math.floor((value - 5) / 2);
  });
}

/* -------------------------------------------- */
/*  Skill Check Roll Function                   */
/* -------------------------------------------- */

/**
 * Perform a 2d6 skill check
 * @param {number} skillLevel - The skill level
 * @param {number} attributeMod - The linked attribute modifier
 * @param {number} targetNumber - The target number to meet or exceed
 * @param {object} options - Additional roll options
 */
async function rollSkillCheck(skillLevel, attributeMod, targetNumber = 7, options = {}) {
  const rollFormula = `2d6 + ${skillLevel} + ${attributeMod}`;
  const roll = new Roll(rollFormula);
  await roll.evaluate();

  const success = roll.total >= targetNumber;
  const marginOfSuccess = roll.total - targetNumber;

  // Create chat message
  const messageData = {
    speaker: options.speaker || ChatMessage.getSpeaker(),
    flavor: options.flavor || "Skill Check",
    content: `
      <div class="mech-foundry roll-result">
        <div class="dice-result">
          <strong>Roll:</strong> ${roll.total}
          <span class="target">(Target: ${targetNumber})</span>
        </div>
        <div class="result ${success ? 'success' : 'failure'}">
          ${success ? 'Success' : 'Failure'}
          <span class="margin">(${marginOfSuccess >= 0 ? '+' : ''}${marginOfSuccess})</span>
        </div>
      </div>
    `
  };

  roll.toMessage(messageData);
  return { roll, success, marginOfSuccess };
}
