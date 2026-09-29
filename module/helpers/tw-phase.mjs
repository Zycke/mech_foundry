/**
 * Turn-phase discipline for unit-scale combat:
 * - movement limits: a warning when a unit's movement this turn goes past what
 *   its (current, damage- and heat-reduced) MP allow;
 * - phase enforcement: players can't move their units' tokens outside the
 *   Movement Phase (the GM can; a physical attack that displaces units lets the
 *   units involved move once that turn; a world setting turns it off);
 * - the GM phase checklist in the combat tracker: what each unit has done in the
 *   current phase, what's still pending, with a manual "done" tick per unit.
 */
import { currentPhaseKey, currentTurnKey } from "./tw-turn.mjs";
import { MOVE_MODES, mechEffectiveMP, movedThisTurn, vehicleEffectiveCruise } from "./tw-movement.mjs";
import { firedThisTurn, heatResolvedThisTurn } from "./tw-combat.mjs";
import { physicalThisTurn } from "./tw-physical.mjs";
import { pendingPSR } from "./tw-psr.mjs";
import { isAero } from "./tw-aero.mjs";
import { unitDestroyed } from "./tw-status.mjs";
import { GROUND_HEX_M } from "./tw-scale.mjs";

const num = (v) => Number(v) || 0;
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Unit types that follow the Total Warfare turn phases. */
export const PHASED_TYPES = new Set(['mech', 'ground_vehicle', 'aerospace_fighter', 'small_craft', 'battle_armor', 'infantry']);

/**
 * What a unit may move this turn, in hexes:
 * { walk, run, jump, limit, limitLabel } — `limit` is for the declared mode
 * (jumping uses Jumping MP), otherwise the most it can move on the ground.
 */
export function movementLimit(actor, mode = movedThisTurn(actor).mode) {
  const mv = actor?.system?.movement || {};
  let walk = 0, run = 0, jump = 0, walkLabel = 'Walking', runLabel = 'Running';
  if (actor?.type === 'mech') {
    const e = mechEffectiveMP(actor);
    ({ walk, run, jump } = e);
  } else if (actor?.type === 'ground_vehicle') {
    walk = vehicleEffectiveCruise(actor);
    run = Math.ceil(walk * 1.5);
    walkLabel = 'Cruising'; runLabel = 'Flanking';
  } else if (actor?.type === 'infantry' || actor?.type === 'battle_armor') {
    walk = run = Math.max(num(mv.ground), num(mv.vtol), num(mv.umu));
    jump = num(mv.jump);
    walkLabel = runLabel = 'Ground';
  } else return null;
  if (mode === 'jumped') return { walk, run, jump, limit: jump, limitLabel: 'Jumping' };
  return { walk, run, jump, limit: run, limitLabel: runLabel, walkLabel };
}

/**
 * A warning when a move takes the unit past its limit this turn, or null.
 * @param {Actor} actor
 * @param {number} hexes  total hexes moved this turn after the move
 */
export function movementWarning(actor, hexes) {
  const mv = movedThisTurn(actor);
  const lim = movementLimit(actor, mv.mode);
  if (!lim) return null;
  // A declared walk (cruise) is held to Walking MP.
  if (mv.modeSet && mv.mode === 'walked' && hexes > lim.walk && hexes <= lim.limit) {
    return `${actor.name} is set to ${lim.walkLabel.toLowerCase()} but has moved ${hexes} hexes — more than its ${lim.walkLabel} MP of ${lim.walk}. Set its movement to Auto or ${lim.runLabel === 'Flanking' ? 'Flanked' : 'Ran'} on the sheet.`;
  }
  if (hexes <= lim.limit) return null;
  const over = `${actor.name} has moved ${hexes} hex${hexes === 1 ? '' : 'es'} (${hexes * GROUND_HEX_M} m) this turn — more than its ${lim.limitLabel} MP of ${lim.limit}`;
  // Moving past Running MP but within Jumping MP: probably a jump that wasn't declared.
  if (mv.mode !== 'jumped' && lim.jump >= hexes) return `${over}. If it jumped, set "Jumped" on its sheet.`;
  return `${over}.`;
}

/** Is the phase rule on? (world setting; on by default) */
function enforcing() {
  try { return game.settings.get("mech-foundry", "enforceMovementPhase") !== false; }
  catch { return true; }
}

/** Is this token's unit in the running combat? */
function inCombat(doc) {
  const c = game.combat;
  if (!c?.started) return false;
  return (c.combatants ?? []).some(x => (doc.id && x.tokenId === doc.id) || (doc.actor && x.actor === doc.actor));
}

/** A physical attack that displaces units lets them move once this turn. */
export function mayMoveOutOfPhase(actor) {
  const key = currentTurnKey();
  return !!key && actor?.flags?.['mech-foundry']?.mayMove?.key === key;
}

/**
 * Why a player can't move this token now, or null. Only units in a running
 * combat are held to the Movement Phase; the GM is never blocked.
 */
export function moveBlockReason(doc, user = game.user) {
  if (user?.isGM || !enforcing()) return null;
  const actor = doc?.actor;
  if (!PHASED_TYPES.has(actor?.type) || !inCombat(doc)) return null;
  const phase = game.combat.phaseName;
  if (phase === 'Movement' || mayMoveOutOfPhase(actor)) return null;
  return `${actor.name} can only move in the Movement Phase (now: ${phase} Phase). Ask the GM to move it.`;
}

/* ------------------------------------------------------------------ */
/*  GM phase checklist                                                  */
/* ------------------------------------------------------------------ */

/** Manually ticked combatants for the current phase. */
function ticked(combat) {
  const rec = combat?.getFlag?.('mech-foundry', 'checklist');
  return rec && rec.key === currentPhaseKey() ? (rec.ids || []) : [];
}

/** Toggle a combatant's "done" tick for the current phase (GM). */
export async function toggleChecklist(combat, combatantId) {
  const ids = new Set(ticked(combat));
  if (ids.has(combatantId)) ids.delete(combatantId); else ids.add(combatantId);
  await combat.setFlag('mech-foundry', 'checklist', { key: currentPhaseKey(), ids: [...ids] });
}

/**
 * One row per unit combatant for the current phase:
 * { id, name, status, done, warn, pending }.
 */
export function checklistRows(combat) {
  const phase = combat?.phaseName;
  const manual = ticked(combat);
  const seen = new Set();
  const rows = [];
  for (const c of combat?.combatants ?? []) {
    const a = c.actor;
    if (!a || !PHASED_TYPES.has(a.type) || seen.has(c.id)) continue;
    seen.add(c.id);
    const row = { id: c.id, name: c.name || a.name, status: '', done: false, warn: '', pending: '' };
    if (unitDestroyed(a)) { rows.push({ ...row, status: 'destroyed', done: true }); continue; }
    const psr = pendingPSR(a);
    if (psr?.reasons?.length) row.pending = `${isAero(a) ? 'Control Roll' : 'Piloting'}: ${psr.reasons.map(r => r.label).join(', ')}`;
    if (phase === 'Initiative') {
      row.done = Number.isFinite(c.initiative);
      row.status = row.done ? `initiative ${c.initiative}` : 'not rolled';
    } else if (phase === 'Movement') {
      const mv = movedThisTurn(a);
      const lim = movementLimit(a, mv.mode);
      const mode = MOVE_MODES.find(m => m.key === mv.mode);
      const label = a.type === 'ground_vehicle' ? mode?.vlabel : mode?.label;
      row.done = mv.hexes > 0 || mv.modeSet;
      row.status = row.done ? `${label}, ${mv.hexes} hex${mv.hexes === 1 ? '' : 'es'}${lim ? ` of ${lim.limit}` : ''}` : isAero(a) ? 'moves by velocity' : 'not moved';
      if (lim && mv.hexes > lim.limit) row.warn = `over ${lim.limitLabel} MP ${lim.limit}`;
    } else if (phase === 'Weapon Attack') {
      const fired = Object.keys(firedThisTurn(a)).length;
      const unjam = a.flags?.['mech-foundry']?.unjam?.key === currentTurnKey();
      const antiMech = a.flags?.['mech-foundry']?.antiMech?.key === currentTurnKey();
      row.done = fired > 0 || unjam || antiMech;
      row.status = unjam ? 'unjamming' : antiMech ? "anti-'Mech attack" : fired ? `${fired} weapon${fired === 1 ? '' : 's'} fired` : 'no attacks yet';
    } else if (phase === 'Physical Attack') {
      const list = physicalThisTurn(a);
      row.done = list.length > 0;
      row.status = list.length ? list.join(', ') : (['mech', 'ground_vehicle'].includes(a.type) ? 'no physical attack' : '—');
      if (!['mech', 'ground_vehicle'].includes(a.type)) row.done = true;
    } else if (phase === 'Heat') {
      const tracks = a.type === 'mech' || isAero(a);
      row.done = !tracks || heatResolvedThisTurn(a);
      row.status = !tracks ? '—' : row.done ? `heat ${num(a.system?.heat?.value)}` : 'heat not resolved';
    } else {
      row.done = !row.pending;
      row.status = row.pending ? 'rolls pending' : 'ready';
    }
    if (manual.includes(c.id)) row.done = true;
    rows.push(row);
  }
  return rows;
}

/** The checklist panel for the combat tracker (GM only). */
export function checklistHTML(combat) {
  const rows = checklistRows(combat);
  if (!rows.length) return '';
  const done = rows.filter(r => r.done).length;
  const phase = combat.phaseName;
  const items = rows.map(r => `
    <li class="${r.done ? 'done' : ''}${r.warn ? ' warn' : ''}">
      <a class="tw-check-tick" data-combatant-id="${esc(r.id)}" title="Mark done / not done for this phase"><i class="far ${r.done ? 'fa-square-check' : 'fa-square'}"></i></a>
      <span class="n">${esc(r.name)}</span>
      <span class="s">${esc(r.status)}${r.warn ? ` · <b>${esc(r.warn)}</b>` : ''}</span>
      ${r.pending ? `<span class="p" title="${esc(r.pending)}"><i class="fas fa-person-falling"></i></span>` : ''}
    </li>`).join('');
  const heatBtn = phase === 'Heat' && rows.some(r => !r.done)
    ? '<button type="button" class="tw-check-heat"><i class="fas fa-fire"></i> Resolve heat for all</button>' : '';
  return `<details class="tw-phase-checklist" open>
    <summary>${esc(phase)} checklist · ${done} / ${rows.length} done</summary>
    <ul>${items}</ul>${heatBtn}
  </details>`;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                               */
/* ------------------------------------------------------------------ */

/**
 * Register after registerMovementTracking(): its preUpdateToken measures the
 * move (options.mfMovedMeters / mfMovedHexes), which this one reads.
 */
export function registerPhaseEnforcement() {
  Hooks.on("preUpdateToken", (doc, changes, options, userId) => {
    if (userId !== game.user.id) return;
    if (!('x' in changes) && !('y' in changes)) return;
    const why = moveBlockReason(doc);
    if (why) { ui.notifications.warn(why); return false; }
    const actor = doc.actor;
    if (!actor || !currentTurnKey() || !(options.mfMovedMeters || options.mfMovedHexes)) return;
    const cur = movedThisTurn(actor);
    const hexes = options.mfMovedMeters
      ? Math.max(1, Math.ceil((cur.meters + options.mfMovedMeters) / GROUND_HEX_M - 0.05))
      : cur.hexes + options.mfMovedHexes;
    const warn = movementWarning(actor, hexes);
    if (!warn) return;
    ui.notifications.warn(warn);
    const gms = game.users?.filter(u => u.isGM).map(u => u.id) ?? [];
    if (!game.user.isGM && gms.length) {
      ChatMessage.create({ whisper: gms, speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="mech-foundry tw-phase-psr"><i class="fas fa-shoe-prints"></i> ${esc(warn)}</div>` });
    }
  });
  // A displacing physical attack's move is used up once the token moves.
  Hooks.on("updateToken", (doc, changes, options, userId) => {
    if (userId !== game.user.id || (!('x' in changes) && !('y' in changes))) return;
    const actor = doc.actor;
    if (!actor || game.combat?.phaseName === 'Movement' || !mayMoveOutOfPhase(actor)) return;
    if (actor.isOwner) actor.update({ 'flags.mech-foundry.mayMove': null });
  });
  // Keep the GM checklist current as units move, fire and resolve heat.
  let pending = null;
  Hooks.on("updateActor", (actor) => {
    if (!game.user.isGM || !game.combat?.started || !PHASED_TYPES.has(actor.type)) return;
    clearTimeout(pending);
    pending = setTimeout(() => ui.combat?.render?.(), 150);
  });
}
