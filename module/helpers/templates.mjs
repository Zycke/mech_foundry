/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function() {
  return loadTemplates([
    // Actor sheets
    "systems/mech-foundry/templates/actor/actor-character-sheet.hbs",
    "systems/mech-foundry/templates/actor/actor-npc-sheet.hbs",

    // Item sheets
    "systems/mech-foundry/templates/item/item-skill-sheet.hbs",
    "systems/mech-foundry/templates/item/item-trait-sheet.hbs",
    "systems/mech-foundry/templates/item/item-weapon-sheet.hbs",
    "systems/mech-foundry/templates/item/item-armor-sheet.hbs",
    "systems/mech-foundry/templates/item/item-vehicle-sheet.hbs",
    "systems/mech-foundry/templates/item/item-fuel-sheet.hbs",
    "systems/mech-foundry/templates/item/item-electronics-sheet.hbs",
    "systems/mech-foundry/templates/item/item-powerpack-sheet.hbs",
    "systems/mech-foundry/templates/item/item-healthcare-sheet.hbs",
    "systems/mech-foundry/templates/item/item-prosthetics-sheet.hbs",
    "systems/mech-foundry/templates/item/item-drugpoison-sheet.hbs",

    // Chat partials
    "systems/mech-foundry/templates/chat/skill-roll.hbs",
    "systems/mech-foundry/templates/chat/weapon-attack.hbs"
  ]);
};
