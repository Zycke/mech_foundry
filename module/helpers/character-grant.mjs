import { ATTRIBUTE_KEYS } from './character-builder.mjs';
import { ATOW_SKILLS, ATOW_TRAITS, computeStartingWealth } from '../data/atow-lists.mjs';

/**
 * character-grant.mjs
 * -------------------
 * Turns a finished character-builder result into a real Actor (milestone M5).
 * This is the single write path the wizard uses on Finish; keeping it here means
 * any future "apply a module" button can reuse it.
 *
 * The grant is idempotent: items it creates are flagged `fromWizard`, so
 * re-running the wizard on the same actor removes the previous wizard items and
 * recreates them rather than duplicating. Manually-added items are left alone.
 */

const FLAG_SCOPE = 'mech-foundry';

/** Look up a master skill by its ROOT name (before any "/subskill"). */
function skillMeta(rootName) {
  const list = game.mechfoundry?.config?.skillsList || ATOW_SKILLS;
  return list.find(s => s.name.toLowerCase() === rootName.toLowerCase()) || null;
}

/** Look up a master trait by its BASE name (before any "/descriptor"). */
function traitMeta(baseName) {
  const list = game.mechfoundry?.config?.traitsList || ATOW_TRAITS;
  return list.find(t => t.name.toLowerCase() === baseName.toLowerCase()) || null;
}

/** Parse a "INT+WIL" links string into [linkedAttribute1, linkedAttribute2]. */
function parseLinks(links) {
  const parts = String(links || '').split('+').map(s => s.trim().toLowerCase()).filter(Boolean);
  const valid = parts.filter(p => ATTRIBUTE_KEYS.includes(p));
  return [valid[0] || 'int', valid[1] || ''];
}

/** Parse a "8/SA" TN/Complexity code into { targetNumber, complexity }. */
function parseTNC(tnc) {
  const [tn, code] = String(tnc || '').split('/');
  const targetNumber = Number(tn) || 7;
  const complexity = /^C/i.test((code || '').trim()) ? 'C' : 'S';
  return { targetNumber, complexity };
}

/** Build the Item creation data for a granted skill. */
function buildSkillItem(key, xp) {
  const root = key.split('/')[0].trim();
  const meta = skillMeta(root);
  const [linkedAttribute1, linkedAttribute2] = parseLinks(meta?.links);
  const { targetNumber, complexity } = parseTNC(meta?.tnc);
  return {
    name: key,
    type: 'skill',
    system: { xp, linkedAttribute1, linkedAttribute2, targetNumber, complexity },
    flags: { [FLAG_SCOPE]: { fromWizard: true } }
  };
}

/** Build the Item creation data for a granted trait. */
function buildTraitItem(name, xp) {
  const base = name.split('/')[0].trim();
  const meta = traitMeta(base);
  // Flexible traits (Wealth, Reputation) take their sign from the awarded XP.
  let traitType = meta?.type || 'positive';
  if (traitType === 'flexible') traitType = xp < 0 ? 'negative' : 'positive';
  return {
    name,
    type: 'trait',
    // Each Trait Point costs 100 XP (ATOW p.66).
    system: { xp, cost: xp / 100, traitType, purchased: true, description: meta ? (meta.longDesc || `<p>${meta.desc}</p>`) : '' },
    flags: { [FLAG_SCOPE]: { fromWizard: true } }
  };
}

/**
 * Apply a completed build to an actor.
 * @param {Actor} actor
 * @param {object} args
 * @param {object} args.state     the builder state
 * @param {object} args.derived   CharacterBuilder.derive(state, phenotype)
 * @param {object} args.choices   the wizard's { name, player, ... } choices
 * @param {string} [args.phenotypeKey]
 * @returns {Promise<Actor>}
 */
export async function grantCharacter(actor, { state, derived, choices, phenotypeKey }) {
  // 1. Attribute + core system data.
  const system = { attributes: {}, xp: {} };
  for (const k of ATTRIBUTE_KEYS) {
    const a = derived.attributes[k];
    system.attributes[k] = { value: a.value, xp: a.xp, modifier: a.modifier };
  }
  system.xp.value = derived.remaining;
  system.xp.spent = derived.spent;
  system.affiliation = state.affiliation || '';
  system.phenotype = phenotypeKey || state.phenotype || '';
  if (choices?.player) system.personalData = { player: choices.player };

  // Starting cash from the Wealth Trait (ATOW p.128; default 1,000). The player
  // buys gear from this via the normal inventory; any unspent C-bills remain.
  const wealth = computeStartingWealth(state.traits, { isClan: !!state.isClan });
  system.cbills = wealth.cbills;

  // Languages: mirror any "Language/<name>" skills into system.languages so the
  // sheet's Languages list is populated (they remain skills too — Language is a
  // skill in ATOW). English is treated as a secondary tongue, the rest primary.
  const languages = {};
  for (const key of Object.keys(state.skills)) {
    const m = /^language\/(.+)$/i.exec(key);
    if (!m) continue;
    const name = m[1].trim();
    languages[foundry.utils.randomID()] = {
      name,
      type: /^english$/i.test(name) ? 'secondary' : 'primary'
    };
  }
  system.languages = languages;

  // 2. Wipe previous wizard-created items so re-running does not duplicate.
  const oldWizardItems = actor.items.filter(i => i.getFlag(FLAG_SCOPE, 'fromWizard')).map(i => i.id);
  if (oldWizardItems.length) await actor.deleteEmbeddedDocuments('Item', oldWizardItems);

  // 3. Build skill + trait items.
  const items = [];
  for (const [key, xp] of Object.entries(state.skills)) {
    if (!xp) continue;
    items.push(buildSkillItem(key, xp));
  }
  for (const [name, xp] of Object.entries(state.traits)) {
    if (!xp) continue;
    items.push(buildTraitItem(name, xp));
  }

  // 4. Write the actor: name/system update, then create items.
  const update = { system };
  if (choices?.name && choices.name !== actor.name) update.name = choices.name;
  await actor.update(update);
  if (items.length) await actor.createEmbeddedDocuments('Item', items);

  // 5. Record a creation snapshot for the sheet summary + wizard re-open.
  await actor.setFlag(FLAG_SCOPE, 'creation', {
    created: true,
    affiliation: state.affiliation || '',
    subAffiliation: state.subAffiliation || '',
    phenotype: phenotypeKey || '',
    age: derived.age,
    spent: derived.spent,
    remaining: derived.remaining,
    cbills: wealth.cbills,
    equipmentRating: wealth.rating,
    modules: state.modules.map(m => ({ stage: m.stage, name: m.name })),
    choices
  });

  return actor;
}
