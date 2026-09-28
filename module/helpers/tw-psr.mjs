/**
 * Total Warfare warrior damage, Consciousness Rolls and Piloting Skill Roll
 * bookkeeping (TW p. 60 Piloting/Driving Skill Roll Table; Consciousness Rolls).
 *
 * Pure-ish helpers used while resolving damage: they mutate the in-memory crew
 * / pending-PSR state the damage resolver saves in its single write. Rolling a
 * pending PSR and resolving falls lives in tw-falls.mjs.
 *
 * Linked pilots: the hit ladder still advances, but consciousness is the linked
 * character's A Time of War condition (the crew-damage events apply AToW
 * damage), so the Total Warfare Consciousness Table is only rolled for
 * sheet-only pilots.
 */
import { currentTurnKey, currentPhaseKey } from "./tw-turn.mjs";
import { actuatorsInSlots } from "./tw-movement.mjs";

const num = (v) => Number(v) || 0;

/** Warrior Consciousness Table: total damage → consciousness number (6 = dead). */
export const CONSCIOUSNESS_TN = { 1: 3, 2: 5, 3: 7, 4: 10, 5: 11 };

/** Consciousness number for a warrior's current damage (a 0-hit unconscious pilot wakes on 3+). */
export function consciousnessNumber(hits) {
  return CONSCIOUSNESS_TN[Math.max(1, Math.min(5, num(hits)))];
}

/**
 * Inflict warrior damage on in-memory crew state (`system.pilot` / `system.crew`).
 * Each point advances the hit ladder; an unlinked warrior then rolls the
 * Consciousness Table (skipped once unconscious). 6 points kills.
 * @returns {Promise<string[]>} card lines
 */
export async function warriorDamage(crew, points, { linked = false, rolls = [], source = '' } = {}) {
  const lines = [];
  const who = crew.name || 'Pilot';
  for (let i = 0; i < points; i++) {
    if (num(crew.hits) >= 6) break;
    crew.hits = num(crew.hits) + 1;
    const tag = source ? ` (${source})` : '';
    if (crew.hits >= 6) {
      crew.unconscious = true;
      lines.push(`${who} takes damage${tag}: 6 hits — KILLED`);
      break;
    }
    if (linked) { lines.push(`${who} takes damage${tag}: ${crew.hits} hit${crew.hits > 1 ? 's' : ''} (A Time of War damage applied)`); continue; }
    if (crew.unconscious) { lines.push(`${who} takes damage${tag}: ${crew.hits} hits (already unconscious)`); continue; }
    const tn = CONSCIOUSNESS_TN[crew.hits];
    const r = await new Roll("2d6").evaluate();
    rolls.push(r);
    if (r.total >= tn) {
      lines.push(`${who} takes damage${tag}: ${crew.hits} hit${crew.hits > 1 ? 's' : ''} — consciousness ${r.total} vs ${tn}, stays conscious`);
    } else {
      crew.unconscious = true;
      crew.unconsciousKey = currentTurnKey() ?? '';
      lines.push(`${who} takes damage${tag}: ${crew.hits} hit${crew.hits > 1 ? 's' : ''} — consciousness ${r.total} vs ${tn}, knocked UNCONSCIOUS`);
    }
  }
  return lines;
}

/**
 * Standing Piloting Skill Roll modifiers from damage (Preexisting Damage):
 * destroyed leg +5 (ignore that leg's actuators), hip +2 (ignore that leg's
 * other crits), leg/foot actuators +1 each, gyro hit +3. A destroyed gyro is
 * an automatic fall, or +6 on the roll to avoid warrior damage in that fall.
 * The same values serve as the "Damage to 'Mech" trigger modifiers, so a
 * trigger adds nothing on top (no double counting).
 */
export function psrDamageMods(sys) {
  const mods = [];
  for (const [leg, label] of [['ll', 'Left leg'], ['rl', 'Right leg']]) {
    const st = sys?.structure?.[leg];
    if (st && num(st.max) > 0 && num(st.value) <= 0) { mods.push({ label: `${label} destroyed`, value: 5 }); continue; }
    const a = actuatorsInSlots(sys?.critSlots?.[leg]);
    if (a.hip) { mods.push({ label: `${label} hip actuator`, value: 2 }); continue; }
    const n = a.upperLeg + a.lowerLeg + a.foot;
    if (n) mods.push({ label: `${label} actuator${n > 1 ? 's' : ''} ×${n}`, value: n });
  }
  const g = num(sys?.systemHits?.gyro);
  if (g >= 2) mods.push({ label: 'Gyro destroyed', value: 6, gyroDestroyed: true });
  else if (g === 1) mods.push({ label: 'Gyro hit', value: 3 });
  return mods;
}

/** Pending Piloting Skill Rolls on a unit: { reasons: [{key, label, mod, auto}], plus20 }. */
export function pendingPSR(actor) {
  const p = actor?.flags?.['mech-foundry']?.psr;
  return p?.reasons?.length ? p : null;
}

/** Damage taken so far this phase (resets each phase; per attack outside combat). */
export function phaseDamageSoFar(actor) {
  const rec = actor?.flags?.['mech-foundry']?.phaseDamage;
  const key = currentPhaseKey();
  return key && rec?.key === key ? num(rec.total) : 0;
}

/**
 * Work out the PSRs a block of damage triggers on a 'Mech and merge them into
 * its pending list. Returns the flag updates to save with the damage.
 * @param {Actor} actor           the target, before this damage was saved
 * @param {object} after          { structure, systemHits } after this damage
 * @param {object[]} newCrits     actuator crits this attack: [{ loc, name }]
 * @param {number} damage         total damage this attack
 * @param {object[]} extra        further reasons from the attack itself (e.g. kicked, charged)
 */
export function damagePSRUpdate(actor, after, newCrits, damage, extra = []) {
  const key = currentPhaseKey();
  const before = phaseDamageSoFar(actor);
  const total = before + num(damage);
  const updates = key ? { 'flags.mech-foundry.phaseDamage': { key, total } } : {};
  if (actor.system?.conditions?.prone) return { updates, reasons: [] }; // already down

  const reasons = [...extra];
  const plus20 = total >= 20;
  if (plus20 && before < 20) reasons.push({ key: 'dmg20', label: '20+ damage this phase', mod: 1 });

  const gBefore = num(actor.system?.systemHits?.gyro), gAfter = num(after.systemHits?.gyro);
  if (gAfter >= 2 && gBefore < 2) reasons.push({ key: 'gyroDestroyed', label: 'Gyro destroyed', mod: 0, auto: true });
  else if (gAfter > gBefore) reasons.push({ key: 'gyro', label: 'Gyro hit', mod: 0 });

  for (const leg of ['ll', 'rl']) {
    const b = actor.system?.structure?.[leg], a = after.structure?.[leg];
    const label = leg === 'll' ? 'Left' : 'Right';
    if (a && num(a.max) > 0 && num(a.value) <= 0 && num(b?.value) > 0) {
      reasons.push({ key: `legDestroyed_${leg}`, label: `${label} leg destroyed`, mod: 0, auto: true });
      continue;
    }
    for (const c of newCrits.filter(x => x.loc === leg)) {
      const n = String(c.name || '').toLowerCase();
      if (n.includes('hip')) reasons.push({ key: `hip_${leg}`, label: `${label} hip actuator destroyed`, mod: 0 });
      else if (n.includes('leg') || n.includes('foot')) reasons.push({ key: `act_${leg}`, label: `${label} ${c.name || 'leg actuator'} destroyed`, mod: 0 });
    }
  }
  if (!reasons.length) {
    // Still carry the +1 for any PSR already pending this phase.
    const pend = pendingPSR(actor);
    if (pend && plus20 && !pend.plus20) updates['flags.mech-foundry.psr'] = { ...pend, plus20: true };
    return { updates, reasons };
  }
  updates['flags.mech-foundry.psr'] = queuePSR(actor, reasons, plus20);
  return { updates, reasons };
}

/** Merge new reasons into a unit's pending PSR list. */
export function queuePSR(actor, reasons, plus20 = false) {
  const pend = pendingPSR(actor) || { reasons: [], plus20: false };
  return { reasons: [...pend.reasons, ...reasons], plus20: !!(pend.plus20 || plus20) };
}

/** Stand-up attempts this turn (each costs +1 heat). */
export function standsThisTurn(actor) {
  const rec = actor?.flags?.['mech-foundry']?.stands;
  return rec && rec.key === currentTurnKey() ? num(rec.count) : 0;
}
