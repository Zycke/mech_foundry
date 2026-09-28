/**
 * Rolling Piloting Skill Rolls, falls, standing up and waking up
 * (Total Warfare: Piloting/Driving Skill Roll Table p. 60, Falling pp. 68–69,
 * Facing After Fall Table, Consciousness Rolls).
 */
import {
  actorSkillRating, applyCrewDamage, CREW_DAMAGE,
  MECH_PILOTING_SKILLS, VEHICLE_DRIVING_SKILLS, AERO_PILOTING_SKILLS
} from "./atow-conversion.mjs";
import { beginRecording, endRecording, writeDoc } from "./gm-relay.mjs";
import { currentTurnKey } from "./tw-turn.mjs";
import { isImmobile, linkedCrew, pilotUnconscious } from "./tw-movement.mjs";
import { consciousnessNumber, pendingPSR, phaseDamageSoFar, psrDamageMods, standsThisTurn, warriorDamage } from "./tw-psr.mjs";
import { resolveDamageAgainst } from "./tw-combat.mjs";

const { DialogV2 } = foundry.applications.api;
const num = (v) => Number(v) || 0;
const sum = (mods) => mods.reduce((t, m) => t + num(m.value), 0);
const diceOf = (roll) => roll?.dice?.[0]?.results?.map(r => r.result) ?? [];

/** Facing After Fall Table (1D6): hexside turn, and the hit-location column used. */
export const FACING_AFTER_FALL = {
  1: { turn: 0, label: 'Same direction', dir: 'front', loc: 'Front' },
  2: { turn: 1, label: '1 hexside right', dir: 'right', loc: 'Right Side' },
  3: { turn: 2, label: '2 hexsides right', dir: 'right', loc: 'Right Side' },
  4: { turn: 3, label: 'Opposite direction', dir: 'rear', loc: 'Rear' },
  5: { turn: -2, label: '2 hexsides left', dir: 'left', loc: 'Left Side' },
  6: { turn: -1, label: '1 hexside left', dir: 'left', loc: 'Left Side' }
};

/** The unit warrior's Piloting (or Driving) rating, from a linked character when present. */
export function pilotingFor(actor) {
  const crew = actor?.system?.pilot || actor?.system?.crew || {};
  const linked = linkedCrew(actor);
  if (linked) {
    const cands = actor.type === 'mech' ? MECH_PILOTING_SKILLS
      : actor.type === 'ground_vehicle' ? VEHICLE_DRIVING_SKILLS : AERO_PILOTING_SKILLS;
    const r = actorSkillRating(linked, cands);
    if (r) return r.rating;
  }
  return num(crew.piloting ?? crew.driving ?? 5);
}

/** Split damage into 5-point groups plus one smaller remainder group. */
export function fiveGroups(total) {
  const groups = [];
  let t = Math.max(0, num(total));
  while (t > 0) { groups.push(Math.min(5, t)); t -= 5; }
  return groups;
}

export async function postCard(actor, flavor, ctx, rolls) {
  const content = await foundry.applications.handlebars.renderTemplate("systems/mech-foundry/templates/chat/tw-psr.hbs", { title: flavor, ...ctx });
  await ChatMessage.create({ flags: { 'mech-foundry': endRecording() }, speaker: ChatMessage.getSpeaker({ actor }), flavor, content, rolls });
}

/**
 * A 'Mech falls: 1 point per 10 tons (round up) × (levels + 1), in 5-point
 * groups on the Facing After Fall column; it ends prone and rotated; then the
 * warrior rolls Piloting to avoid 1 point of damage (+1 per level above 1;
 * automatic damage when unconscious, immobile or the target number is over 12).
 * @param {object} opts
 * @param {number} opts.levels     levels fallen (0 for a fall in place / after jumping)
 * @param {boolean} opts.rearOnly  hit location is always Rear (failed death from above)
 * @param {boolean} opts.plus20    +1 for having taken 20+ damage this phase
 */
export async function resolveFall(actor, { levels = 0, rearOnly = false, rolls = [], plus20 = false } = {}) {
  levels = Math.max(0, num(levels));
  const damage = Math.ceil(num(actor.system.tonnage) / 10) * (levels + 1);
  const fr = await new Roll("1d6").evaluate();
  rolls.push(fr);
  const f = FACING_AFTER_FALL[fr.total] || FACING_AFTER_FALL[1];
  const dir = rearOnly ? 'rear' : f.dir;

  const groups = fiveGroups(damage);
  const frag = groups.length ? await resolveDamageAgainst(actor, dir, groups, rolls, '', { noPSR: true }) : null;
  await writeDoc(actor, { 'system.conditions': { ...(actor.system.conditions || {}), prone: true } });

  // Turn the token to its new facing (hex maps; clockwise = right).
  if (f.turn && canvas?.grid?.isHexagonal) {
    for (const t of actor.getActiveTokens?.() ?? []) {
      if (t.document?.isOwner) await t.document.update({ rotation: (num(t.document.rotation) + 60 * f.turn + 360) % 360 });
    }
  }

  // Warrior damage roll (a destroyed gyro counts +6 here instead of forcing the fall).
  const mods = [{ label: 'Piloting', value: pilotingFor(actor) }, ...psrDamageMods(actor.system)];
  if (levels > 1) mods.push({ label: `Fell ${levels} levels`, value: levels - 1 });
  if (plus20) mods.push({ label: '20+ damage this phase', value: 1 });
  const tn = sum(mods);
  const warrior = { tn, mods };
  if (pilotUnconscious(actor)) warrior.auto = 'warrior unconscious — automatic damage';
  else if (isImmobile(actor)) warrior.auto = "'Mech immobile — automatic damage";
  else if (tn > 12) warrior.auto = 'target over 12 — automatic damage';
  if (warrior.auto) warrior.success = false;
  else {
    const r = await new Roll("2d6").evaluate();
    rolls.push(r);
    Object.assign(warrior, { total: r.total, dice: diceOf(r), success: r.total >= tn });
  }

  let warriorLines = [];
  if (!warrior.success) {
    const crew = foundry.utils.deepClone(actor.system.pilot || {});
    const linked = linkedCrew(actor);
    warriorLines = await warriorDamage(crew, 1, { linked: !!linked, rolls, source: 'fall' });
    await writeDoc(actor, { 'system.pilot': crew });
    if (linked) await applyCrewDamage(linked, CREW_DAMAGE.falling);
  }

  return {
    damage, levels, facingRoll: fr.total, facing: f.label, dir,
    location: rearOnly ? 'Rear' : f.loc, frag, warrior, warriorLines
  };
}

/** Roll every Piloting Skill Roll queued on a 'Mech, in order; the first failure falls. */
export async function rollPendingPSR(actor) {
  const p = pendingPSR(actor);
  if (!p) { ui.notifications.info(`${actor.name} has no Piloting Skill Roll pending.`); return; }
  beginRecording();
  const rolls = [], results = [];
  const base = psrDamageMods(actor.system).filter(m => !m.gyroDestroyed);
  const piloting = pilotingFor(actor);
  const unconscious = pilotUnconscious(actor);
  const shutdown = !!actor.system.conditions?.shutdown;
  const prone = !!actor.system.conditions?.prone;
  let fell = false;

  for (const r of p.reasons) {
    if (prone) { results.push({ label: r.label, auto: 'already prone — no roll needed', success: true }); continue; }
    const mods = [{ label: 'Piloting', value: piloting }, ...base];
    if (r.mod) mods.push({ label: r.label, value: r.mod });
    if (p.plus20 && r.key !== 'dmg20') mods.push({ label: '20+ damage this phase', value: 1 });
    const res = { label: r.label, mods, tn: sum(mods) };
    if (r.auto) res.auto = 'automatic fall';
    else if (unconscious) res.auto = 'warrior unconscious — automatic failure';
    else if (shutdown && r.key !== 'shutdown') res.auto = 'reactor shut down — automatic fall';
    if (res.auto) res.success = false;
    else {
      const roll = await new Roll("2d6").evaluate();
      rolls.push(roll);
      Object.assign(res, { total: roll.total, dice: diceOf(roll), success: roll.total >= res.tn });
    }
    results.push(res);
    if (!res.success) { fell = true; break; }
  }

  await writeDoc(actor, { 'flags.mech-foundry.psr': { reasons: [], plus20: false } });
  const fall = fell ? await resolveFall(actor, { levels: 0, rolls, plus20: p.plus20 }) : null;
  await postCard(actor, 'Piloting Skill Roll', { results, fall, stays: !fell && !prone }, rolls);
  return { results, fall };
}

/** Attempt to stand a prone 'Mech (PSR, +1 heat per attempt); failure is another fall in place. */
export async function standUp(actor) {
  const sys = actor.system;
  if (!sys.conditions?.prone) { ui.notifications.info(`${actor.name} isn't prone.`); return; }
  if (num(sys.systemHits?.gyro) >= 2) { ui.notifications.warn(`${actor.name} has a destroyed gyro and can't stand.`); return; }
  if (sys.conditions?.shutdown) { ui.notifications.warn(`${actor.name} is shut down and can't stand.`); return; }
  if (pilotUnconscious(actor)) { ui.notifications.warn(`${actor.name}'s warrior is unconscious.`); return; }

  beginRecording();
  const rolls = [];
  const key = currentTurnKey();
  const update = key ? { 'flags.mech-foundry.stands': { key, count: standsThisTurn(actor) + 1 } } : {};
  const plus20 = phaseDamageSoFar(actor) >= 20;
  const mods = [{ label: 'Piloting', value: pilotingFor(actor) }, ...psrDamageMods(sys).filter(m => !m.gyroDestroyed)];
  if (plus20) mods.push({ label: '20+ damage this phase', value: 1 });
  const res = { label: 'Attempt to stand', mods, tn: sum(mods) };
  const roll = await new Roll("2d6").evaluate();
  rolls.push(roll);
  Object.assign(res, { total: roll.total, dice: diceOf(roll), success: roll.total >= res.tn });
  if (res.success) update['system.conditions'] = { ...(sys.conditions || {}), prone: false };
  if (Object.keys(update).length) await writeDoc(actor, update);
  const fall = res.success ? null : await resolveFall(actor, { levels: 0, rolls, plus20 });
  await postCard(actor, 'Stand Up', { results: [res], fall, stood: res.success }, rolls);
  return { res, fall };
}

/** GM/owner tool: resolve a fall of N levels (e.g. a failed roll while moving into a lower hex). */
export async function manualFall(actor) {
  const r = await DialogV2.wait({
    window: { title: `Fall — ${actor.name}`, icon: "fa-solid fa-person-falling" },
    content: `
      <div class="tw-attack-dialog">
        <div class="form-group"><label>Levels fallen <span class="tw-hint">0 = in place; a 'Mech that jumped this turn counts 0</span></label><input type="number" name="levels" value="0" min="0" /></div>
      </div>`,
    buttons: [
      { action: "fall", label: "Fall", icon: "fa-solid fa-person-falling", default: true, callback: (e, b) => ({ levels: num(b.form.elements.levels.value) }) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!r || r === "cancel") return;
  beginRecording();
  const rolls = [];
  const fall = await resolveFall(actor, { levels: r.levels, rolls, plus20: phaseDamageSoFar(actor) >= 20 });
  await postCard(actor, 'Fall', { results: [], fall }, rolls);
}

/**
 * Consciousness recovery roll for a sheet-only warrior: 2D6 ≥ the consciousness
 * number for current damage wakes them. With `auto`, skips warriors knocked out
 * this turn (End Phase of a later turn only). Linked characters recover under
 * A Time of War instead.
 */
export async function wakeRoll(actor, { auto = false } = {}) {
  const path = actor.system.pilot ? 'system.pilot' : 'system.crew';
  const crew = foundry.utils.deepClone(actor.system.pilot || actor.system.crew || {});
  if (linkedCrew(actor) || !crew.unconscious) return null;
  if (num(crew.hits) >= 6) return null;
  if (auto && crew.unconsciousKey && crew.unconsciousKey === currentTurnKey()) return null;
  const tn = consciousnessNumber(crew.hits);
  beginRecording();
  const roll = await new Roll("2d6").evaluate();
  const success = roll.total >= tn;
  if (success) { crew.unconscious = false; crew.unconsciousKey = ''; await writeDoc(actor, { [path]: crew }); }
  await postCard(actor, 'Consciousness Recovery', {
    results: [{ label: `${crew.name || 'Warrior'} (${num(crew.hits)} hits) wakes on ${tn}+`, mods: [], tn, total: roll.total, dice: diceOf(roll), success }],
    woke: success
  }, [roll]);
  return success;
}

/** End Phase: every unconscious sheet-only warrior in the combat rolls to wake. GM client only. */
export async function endPhaseRecovery(combat) {
  if (!game.user.isGM) return;
  const seen = new Set();
  for (const c of combat?.combatants ?? []) {
    const a = c.actor;
    if (!a || seen.has(a.uuid) || !['mech', 'aerospace_fighter', 'small_craft'].includes(a.type)) continue;
    seen.add(a.uuid);
    await wakeRoll(a, { auto: true });
  }
}
