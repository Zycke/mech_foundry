/**
 * Arming MASC or a supercharger for a turn (see tw-gear.mjs for the rules):
 * the 2D6 roll against the failure number, the failure's damage, and the card.
 */
import { beginRecording, writeDoc } from "./gm-relay.mjs";
import { currentTurnKey } from "./tw-turn.mjs";
import { boostArmed, boostLevel, boostTarget, superchargerHits, unitGear } from "./tw-gear.mjs";
import { resolveDamageAgainst } from "./tw-combat.mjs";
import { postCard } from "./tw-falls.mjs";

const LABEL = { masc: 'MASC', supercharger: 'Supercharger' };
const diceOf = (roll) => roll?.dice?.[0]?.results?.map(r => r.result) ?? [];

/**
 * Arm MASC ('masc') or the supercharger ('supercharger') for this turn.
 * @returns {Promise<{success:boolean}|null>} null when it can't be armed
 */
export async function engageBoost(actor, which) {
  const label = LABEL[which];
  const key = currentTurnKey();
  if (!actor || !label) return null;
  if (!key) { ui.notifications.warn(`${label} is armed turn by turn during combat.`); return null; }
  const g = unitGear(actor)[which];
  if (!g?.has) { ui.notifications.warn(`${actor.name} has no ${label}.`); return null; }
  if (!g.working) { ui.notifications.warn(`${actor.name}'s ${label} is destroyed.`); return null; }
  const state = actor.flags?.['mech-foundry']?.boost;
  if (boostArmed(actor, which, key)) { ui.notifications.info(`${actor.name}'s ${label} is already armed this turn.`); return null; }
  if (state?.key === key && state.failed?.[which]) { ui.notifications.warn(`${actor.name}'s ${label} failed this turn.`); return null; }

  beginRecording();
  const rolls = [], notes = [], frags = [];
  const level = boostLevel(actor, which, key);
  const tn = boostTarget(actor, which, key);
  const roll = await new Roll("2d6").evaluate();
  rolls.push(roll);
  const success = roll.total >= tn;
  const same = state?.key === key ? state : { key };
  const levels = { ...(actor.flags?.['mech-foundry']?.boostLevels ?? {}), [which]: { level: level + 1, key } };
  await writeDoc(actor, {
    'flags.mech-foundry.boost': { ...same, key, [which]: success, failed: { ...(same.failed ?? {}), [which]: !success } },
    'flags.mech-foundry.boostLevels': levels
  });
  if (success) {
    notes.push(`${label} armed: Running MP is now ${actor.type === 'ground_vehicle' ? 'Flanking' : 'Running'} ${boostArmed(actor, which === 'masc' ? 'supercharger' : 'masc', key) ? 'Walking × 2.5' : 'Walking × 2'} this turn.`);
    notes.push(`Next turn's failure number: ${boostTarget(actor, which, nextKey(key))} if used again.`);
  } else if (which === 'masc') {
    notes.push('MASC fails: a critical hit on each leg; it can\'t be used this turn.');
    if (actor.type === 'mech') {
      frags.push(await resolveDamageAgainst(actor, 'front', [], rolls, actor.name, {
        noIntercept: true, forceCrits: [{ loc: 'll', count: 1, text: 'MASC failure' }, { loc: 'rl', count: 1, text: 'MASC failure' }]
      }));
    }
  } else {
    const r2 = await new Roll("2d6").evaluate();
    rolls.push(r2);
    const hits = superchargerHits(r2.total);
    notes.push(`Supercharger fails: damage roll ${r2.total} — ${hits ? `${hits} ${actor.type === 'mech' ? 'engine' : 'motive'} hit${hits === 1 ? '' : 's'}` : 'no damage'}; it can't be used this turn.`);
    if (hits) frags.push(await resolveDamageAgainst(actor, 'front', [], rolls, actor.name,
      actor.type === 'mech' ? { noIntercept: true, engineHits: hits } : { noIntercept: true, motiveSteps: hits }));
  }
  const res = { label: `Arm ${label}`, mods: [{ label: `Failure number (level ${level})`, value: tn }], tn, total: roll.total, dice: diceOf(roll), success };
  await postCard(actor, `${label} ${success ? 'Armed' : 'Failure'}`, { results: [res], frags, notes }, rolls);
  return { success };
}

/** The next round's turn key (for the "next turn" note). */
function nextKey(key) {
  const i = String(key).lastIndexOf(':');
  return `${String(key).slice(0, i)}:${Number(String(key).slice(i + 1)) + 1}`;
}
