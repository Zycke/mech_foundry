/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function() {
  return loadTemplates([
    // Actor partials
    "systems/mech-foundry/templates/actor/parts/actor-attributes.hbs",
    "systems/mech-foundry/templates/actor/parts/actor-skills.hbs",
    "systems/mech-foundry/templates/actor/parts/actor-items.hbs",
    "systems/mech-foundry/templates/actor/parts/actor-biography.hbs"
  ]);
};
