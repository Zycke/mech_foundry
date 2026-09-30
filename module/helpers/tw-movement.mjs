/**
 * Total Warfare movement tracking and the Attack Modifiers Table (TW pp. 117–118).
 *
 * Each unit keeps a per-turn movement record in the actor flag
 * `mech-foundry.moved` = { key, hexes, mode, modeSet }. `hexes` accumulates
 * automatically as the token is moved during a running combat; `mode`
 * (stationary / walked / ran / jumped) is inferred from the hexes against the
 * unit's Walk/Cruise MP until the owner picks it on the sheet (jumping must
 * always be picked — it can't be told apart from walking on the map).
 * A record from another turn reads as stationary / 0 hexes.
 */
import { currentTurnKey } from "./tw-turn.mjs";
import { concealmentMods, isInfantry, ridersOf } from "./tw-infantry.mjs";
import { catalogToHit } from "./megamek-import.mjs";
import { crewConditionMods } from "./tw-skills.mjs";
import { GROUND_HEX_M, formatMeters, measureMeters, metersToHexes } from "./tw-scale.mjs";
import { facingRotation, hexsideTurns, pathFacing, tokenFacing, turnsCostMP } from "./tw-facing.mjs";
import { pathTerrain, terrainPartsText, terrainRegions } from "./tw-terrain.mjs";
import { queuePSR } from "./tw-psr.mjs";

const num = (v) => Number(v) || 0;

/** Actor types whose movement is tracked (ground units). */
const TRACKED_TYPES = new Set(['mech', 'ground_vehicle', 'battle_armor', 'infantry']);

export const MOVE_MODES = [
  { key: 'stationary', label: 'Stationary', vlabel: 'Stationary', mod: 0 },
  { key: 'walked', label: 'Walked', vlabel: 'Cruised', mod: 1 },
  { key: 'ran', label: 'Ran', vlabel: 'Flanked', mod: 2 },
  { key: 'jumped', label: 'Jumped', vlabel: 'Jumped', mod: 3 }
];
const MODE_MOD = Object.fromEntries(MOVE_MODES.map(m => [m.key, m.mod]));

/**
 * A 'Mech's current MP after damage and heat (TW 'Mech Critical Hit Effects):
 * one hip hit halves Walking MP (round up) and two leave 0; each upper / lower
 * leg or foot actuator on a leg without a hip hit is −1; a destroyed leg leaves
 * 1 Walking MP and no running; heat takes −1 per 5 points; each destroyed jump
 * jet slot is −1 Jumping MP. Running = Walking × 1.5, rounded up.
 */
export function mechEffectiveMP(actor) {
  const sys = actor?.system || {};
  const base = num(sys.movement?.walk), jumpBase = num(sys.movement?.jump);
  const notes = [];
  let hips = 0, legActs = 0, legsGone = 0;
  for (const leg of ['ll', 'rl']) {
    if (locationDestroyed(actor, leg)) { legsGone++; continue; }
    const a = actuatorsInSlots(sys.critSlots?.[leg]);
    if (a.hip) hips++;
    else legActs += a.upperLeg + a.lowerLeg + a.foot;
  }
  let walk = base;
  if (hips === 1) { walk = Math.ceil(walk / 2); notes.push('hip ½'); }
  if (hips >= 2) { walk = 0; notes.push('both hips'); }
  if (legActs) { walk = Math.max(0, walk - legActs); notes.push(`leg actuators −${legActs}`); }
  const heatMP = Math.min(5, Math.floor(num(sys.heat?.value) / 5));
  if (heatMP) { walk = Math.max(0, walk - heatMP); notes.push(`heat −${heatMP}`); }
  if (clampedRiders(actor)) { walk = Math.max(0, walk - 1); notes.push('carrying battle armor −1'); }
  let run = Math.ceil(walk * 1.5);
  if (legsGone) { walk = Math.min(walk, legsGone >= 2 ? 0 : 1); run = walk; notes.push(legsGone >= 2 ? 'no legs' : 'leg destroyed: 1 MP, no running'); }
  const jets = Object.values(sys.critSlots || {}).flat().filter(x => x?.type === 'jumpJet' && x.hit).length;
  const jump = Math.max(0, jumpBase - jets);
  if (jets) notes.push(`jump jets −${jets}`);
  return { walk, run, jump, notes, reduced: walk !== base || jump !== jumpBase };
}

/** Walking/cruising MP for inferring the movement mode from hexes moved. */
/**
 * A vehicle's Cruising MP after motive damage: −1 per moderate result (and rotor
 * hit), then halved (round up) per heavy result; 0 once engine-hit or immobile.
 */
export function vehicleEffectiveCruise(actor) {
  const sys = actor?.system || {};
  if (sys.crits?.engineHit || sys.conditions?.immobile) return 0;
  let cruise = Math.max(0, num(sys.movement?.cruise) - num(sys.crits?.motiveHits));
  for (let i = 0; i < num(sys.crits?.motiveHalvings); i++) cruise = Math.ceil(cruise / 2);
  if (clampedRiders(actor)) cruise = Math.max(0, cruise - 1);
  return cruise;
}

/** A non-Omni unit carrying battle armor on magnetic clamps loses 1 Walking / Cruising MP. */
function clampedRiders(actor) {
  return !actor?.system?.omni && ridersOf(actor).length > 0;
}

function walkMP(actor) {
  const mv = actor?.system?.movement || {};
  if (actor?.type === 'ground_vehicle') return vehicleEffectiveCruise(actor);
  if (actor?.type === 'mech') return mechEffectiveMP(actor).walk;
  if (isInfantry(actor)) return num(mv.ground);
  return num(mv.walk);
}

/**
 * Movement-phase Piloting Skill Rolls (rolled at the end of movement): a 'Mech
 * that ran with a damaged hip or gyro, or jumped with a damaged gyro, hip, leg
 * or foot actuators or a destroyed leg. Reasons carry no extra modifier — the
 * damage is already in every PSR's standing modifiers.
 */
export function movementPSRReasons(actor) {
  if (actor?.type !== 'mech' || actor.system?.conditions?.prone) return [];
  const mv = movedThisTurn(actor);
  const sys = actor.system;
  const gyro = num(sys.systemHits?.gyro) === 1;
  let hip = false, legDamage = false;
  for (const leg of ['ll', 'rl']) {
    if (locationDestroyed(actor, leg)) { legDamage = true; continue; }
    const a = actuatorsInSlots(sys.critSlots?.[leg]);
    if (a.hip) hip = true;
    if (a.hip || a.upperLeg || a.lowerLeg || a.foot) legDamage = true;
  }
  if (mv.mode === 'ran' && (gyro || hip)) return [{ key: 'ranDamaged', label: `Ran with a damaged ${gyro ? 'gyro' : 'hip'}`, mod: 0 }];
  if (mv.mode === 'jumped' && (gyro || legDamage)) return [{ key: 'jumpedDamaged', label: `Jumped with a damaged ${gyro ? 'gyro' : 'leg'}`, mod: 0 }];
  return [];
}

/** Infer a movement mode from hexes moved (plus facing changes and terrain MP). */
export function inferMode(actor, hexes, turns = 0, terrain = 0) {
  // Facing changes spend MP too ('Mechs and ground vehicles): turning in place is walking.
  const mp = hexes + (turnsCostMP(actor) ? num(turns) : 0) + num(terrain);
  if (mp <= 0) return 'stationary';
  // Infantry don't run: moving past their ground MP means they jumped.
  if (isInfantry(actor)) return hexes > walkMP(actor) && num(actor.system?.movement?.jump) > 0 ? 'jumped' : 'walked';
  return mp <= walkMP(actor) ? 'walked' : 'ran';
}

/**
 * This turn's movement: { hexes, meters, mode, modeSet }. Stationary outside
 * combat or before moving. On metric scenes the record holds the metres moved
 * and hexes are derived from them (30 m hexes, any part of a hex counts).
 */
export function movedThisTurn(actor) {
  const rec = actor?.flags?.['mech-foundry']?.moved;
  const key = currentTurnKey();
  if (!key || !rec || rec.key !== key) return { hexes: 0, meters: 0, turns: 0, backward: 0, terrain: 0, terrainParts: {}, mp: 0, mode: 'stationary', modeSet: false };
  const meters = rec.meters == null ? null : Math.max(0, num(rec.meters));
  const hexes = meters == null ? Math.max(0, num(rec.hexes)) : metersToHexes(meters, GROUND_HEX_M, { sameHex: false });
  const turns = Math.max(0, num(rec.turns)), backward = Math.max(0, num(rec.backward));
  const rawTerrain = Math.max(0, num(rec.terrain));
  const mode = rec.modeSet && MODE_MOD[rec.mode] !== undefined ? rec.mode : inferMode(actor, hexes, turns, rawTerrain);
  // MP spent: hexes plus hexside turns ('Mechs / ground vehicles, not when
  // jumping) plus terrain and level changes from the map (not when jumping).
  const terrain = mode === 'jumped' ? 0 : rawTerrain;
  const mp = hexes + (turnsCostMP(actor, mode) ? turns : 0) + terrain;
  return { hexes, meters: meters ?? hexes * GROUND_HEX_M, turns, backward, terrain, terrainParts: terrain ? (rec.terrainParts ?? {}) : {}, mp, mode, modeSet: !!rec.modeSet };
}

/**
 * Record this turn's movement (from the sheet or token moves). Partial updates
 * merge. `meters` (token moves on a metric scene) sets the hexes; hexes typed
 * on the sheet replace the metres.
 */
export async function setMovement(actor, { hexes, meters, mode, turns, backward, terrain, terrainParts } = {}) {
  const key = currentTurnKey();
  if (!actor || !key) return;
  const cur = movedThisTurn(actor);
  const prev = actor.flags?.['mech-foundry']?.moved;
  const same = prev?.key === key;
  const rec = { key, hexes: cur.hexes, meters: cur.meters, turns: cur.turns, backward: cur.backward, mode: cur.mode, modeSet: cur.modeSet,
    terrain: same ? Math.max(0, num(prev.terrain)) : 0, terrainParts: same ? (prev.terrainParts ?? {}) : {} };
  if (meters != null) { rec.meters = Math.max(0, num(meters)); rec.hexes = metersToHexes(rec.meters, GROUND_HEX_M, { sameHex: false }); }
  else if (hexes != null) { rec.hexes = Math.max(0, num(hexes)); rec.meters = rec.hexes * GROUND_HEX_M; }
  if (turns != null) rec.turns = Math.max(0, num(turns));
  if (backward != null) rec.backward = Math.max(0, num(backward));
  if (terrain != null) rec.terrain = Math.max(0, num(terrain));
  if (terrainParts != null) rec.terrainParts = terrainParts;
  if (mode !== undefined) {
    rec.modeSet = mode !== 'auto';
    rec.mode = mode === 'auto' ? inferMode(actor, rec.hexes, rec.turns, rec.terrain) : mode;
  } else if (!rec.modeSet) rec.mode = inferMode(actor, rec.hexes, rec.turns, rec.terrain);
  await actor.update({ 'flags.mech-foundry.moved': rec });
}

/**
 * MP spent this turn, spelled out: "7 MP: 4 hexes + 1 turn + terrain 2 (light woods +2)",
 * or just "4 hexes" when nothing but hexes was spent.
 */
export function mpBreakdown(mv) {
  const h = `${mv.hexes} hex${mv.hexes === 1 ? '' : 'es'}`;
  const turns = mv.mp - mv.hexes - num(mv.terrain);
  if (mv.mp <= mv.hexes) return h;
  const bits = [h];
  if (turns > 0) bits.push(`${turns} turn${turns === 1 ? '' : 's'}`);
  if (num(mv.terrain) > 0) bits.push(`terrain ${mv.terrain}${Object.keys(mv.terrainParts ?? {}).length ? ` (${terrainPartsText(mv.terrainParts)})` : ''}`);
  return `${mv.mp} MP: ${bits.join(' + ')}`;
}

/** "4 hexes (95 m)" */
function hexText(mv) {
  return `${mv.hexes} hex${mv.hexes === 1 ? '' : 'es'}${mv.meters && mv.meters !== mv.hexes * GROUND_HEX_M ? ` (${formatMeters(mv.meters)})` : ''}`;
}

/** Target movement modifier from hexes moved (Attack Modifiers Table). */
export function targetMoveMod(hexes) {
  const h = num(hexes);
  if (h <= 2) return 0;
  if (h <= 4) return 1;
  if (h <= 6) return 2;
  if (h <= 9) return 3;
  if (h <= 17) return 4;
  if (h <= 24) return 5;
  return 6;
}

/* ------------------------------------------------------------------ */
/*  Token movement hooks                                                */
/* ------------------------------------------------------------------ */

function centerOf(doc, pos) {
  const size = canvas?.grid?.size || 100;
  return { x: num(pos.x) + (num(doc.width) || 1) * size / 2, y: num(pos.y) + (num(doc.height) || 1) * size / 2 };
}

/** Distance along a path of top-left token positions: { meters } or { hexes } (hex-unit scenes). */
function pathDistance(doc, positions) {
  if (positions.length < 2) return null;
  return measureMeters(positions.map(p => centerOf(doc, p)));
}

/**
 * Accumulate distance moved while a combat is running (metres → 30 m hexes). Measured on the moving
 * user's client in preUpdateToken (old → waypoints → new position) and saved
 * to the actor's movement record after the update lands.
 */
export function registerMovementTracking() {
  Hooks.on("preUpdateToken", (doc, changes, options, userId) => {
    if (userId !== game.user.id || options.mfSystem) return;
    const actor = doc.actor;
    const moved = 'x' in changes || 'y' in changes;
    const rotated = 'rotation' in changes;
    if (!FACING_TYPES.has(actor?.type) || (!moved && !rotated)) return;
    const tracking = !!currentTurnKey() && TRACKED_TYPES.has(actor.type);
    const startFacing = tokenFacing(doc._source);
    if (!moved) {
      // Turning in place (Q / E, the HUD or the rotation handle).
      if (tracking) options.mfTurns = hexsideTurns(startFacing, tokenFacing({ rotation: changes.rotation }));
      return;
    }
    const from = { x: doc._source.x, y: doc._source.y };
    const to = { x: changes.x ?? from.x, y: changes.y ?? from.y };
    const waypoints = options.movement?.[doc.id]?.waypoints;
    const path = Array.isArray(waypoints) && waypoints.length
      ? [from, ...waypoints.map(w => ({ x: w.x ?? from.x, y: w.y ?? from.y }))]
      : [from, to];
    const last = path[path.length - 1];
    if (last.x !== to.x || last.y !== to.y) path.push(to);
    // Auto-facing: the unit turns to its direction of travel along the path
    // (a leg straight back is backing up). Alt keeps its facing.
    const keep = !autoFacing() || game.keyboard?.isModifierActive?.('Alt');
    const pf = keep ? pathFacing(startFacing, path, { hold: true }) : pathFacing(startFacing, path);
    if (rotated) options.mfTurns = hexsideTurns(startFacing, tokenFacing({ rotation: changes.rotation }));
    else {
      if (!keep && pf.facing !== startFacing) changes.rotation = facingRotation(pf.facing);
      options.mfTurns = keep ? 0 : pf.turns;
    }
    options.mfBackward = pf.backward;
    if (!tracking) { delete options.mfTurns; delete options.mfBackward; return; }
    const d = pathDistance(doc, path);
    if (d?.meters > 0) options.mfMovedMeters = d.meters;
    else if (d?.hexes > 0) options.mfMovedHexes = d.hexes;
    // Terrain along the path (the map's terrain regions): extra MP, prohibited
    // terrain, Piloting Skill Rolls, facing changes on pavement.
    const regions = terrainRegions(doc.parent ?? canvas?.scene);
    if (regions.length && d?.meters > 0) {
      const cur = movedThisTurn(actor);
      const t = pathTerrain(actor, path.map(p => centerOf(doc, p)), { regions, mode: cur.modeSet ? cur.mode : '', startFacing: keep ? null : startFacing, priorHexes: cur.hexes });
      if (t.mp || t.prohibited.length || t.psr.length || t.notes.length || t.skidTurns || t.walls.length) options.mfTerrain = t;
    }
  });

  Hooks.on("updateToken", async (doc, changes, options, userId) => {
    if (userId !== game.user.id || !(options.mfMovedMeters || options.mfMovedHexes || options.mfTurns || options.mfBackward)) return;
    const actor = doc.actor;
    if (!actor || !(actor.isOwner || game.user.isGM) || !currentTurnKey()) return;
    const cur = movedThisTurn(actor);
    const upd = { turns: cur.turns + num(options.mfTurns), backward: cur.backward + num(options.mfBackward) };
    if (options.mfMovedMeters) upd.meters = cur.meters + options.mfMovedMeters;
    else if (options.mfMovedHexes) upd.hexes = cur.hexes + options.mfMovedHexes;
    const t = options.mfTerrain;
    if (t?.mp) {
      const rec = actor.flags?.['mech-foundry']?.moved;
      const parts = { ...(rec?.key === currentTurnKey() ? rec.terrainParts ?? {} : {}) };
      for (const [k, v] of Object.entries(t.parts)) parts[k] = (parts[k] ?? 0) + v;
      upd.terrain = (rec?.key === currentTurnKey() ? num(rec.terrain) : 0) + t.mp;
      upd.terrainParts = parts;
    }
    await setMovement(actor, upd);
    if (t) await terrainAftermath(actor, t, { backward: num(options.mfBackward) > 0 });
  });
}

/**
 * After a move through terrain: queue the 'Mech's Piloting Skill Rolls
 * (rubble, water) and tell the mover (and the GM) what's owed.
 */
async function terrainAftermath(actor, t, { backward = false } = {}) {
  // Building walls passed: rolled now (a failure is damage, not a fall).
  if (t.walls?.length) {
    const { resolveBuildingWalls } = await import("./tw-buildings.mjs");
    await resolveBuildingWalls(actor, t.walls, { backward });
  }
  const notes = [];
  if (t.psr?.length && actor.type === 'mech' && !actor.system?.conditions?.prone) {
    await actor.update({ 'flags.mech-foundry.psr': queuePSR(actor, t.psr) });
    notes.push(`${t.psr.length === 1 ? 'a Piloting Skill Roll' : `${t.psr.length} Piloting Skill Rolls`} pending (${t.psr.map(r => `${r.label}${r.mod ? ` ${r.mod > 0 ? '+' : '−'}${Math.abs(r.mod)}` : ''}`).join('; ')}) — roll from the sheet or the GM checklist`);
  }
  if (t.skidTurns && movedThisTurn(actor).mode === 'ran') notes.push(`turned on pavement / ice while ${actor.type === 'mech' ? 'running' : 'flanking'} — make a Skid check from the sheet`);
  for (const n of t.notes ?? []) notes.push(n);
  if (!notes.length) return;
  const text = `${actor.name}: ${notes.join('; ')}.`;
  ui.notifications?.info?.(text);
  const gms = game.users?.filter?.(u => u.isGM).map(u => u.id) ?? [];
  await ChatMessage.create({ whisper: [...new Set([game.user.id, ...gms])], speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="mech-foundry tw-phase-psr"><i class="fas fa-mountain"></i> ${text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</div>` });
}

/** Unit types whose tokens face (and auto-face) on the map. */
const FACING_TYPES = new Set(['mech', 'ground_vehicle', 'battle_armor', 'infantry', 'aerospace_fighter', 'small_craft']);

/** World setting: turn unit tokens to face their direction of travel. */
function autoFacing() {
  try { return game.settings.get("mech-foundry", "autoFaceUnits") !== false; } catch { return true; }
}

/* ------------------------------------------------------------------ */
/*  Attack Modifiers Table                                              */
/* ------------------------------------------------------------------ */

/** Map a weapon's free-text location to a mech arm key ('la' / 'ra'), if any. */
export function weaponArm(weapon) {
  const loc = String(weapon?.location ?? '').trim().toLowerCase();
  if (['la', 'left arm', 'l arm', 'larm'].includes(loc)) return 'la';
  if (['ra', 'right arm', 'r arm', 'rarm'].includes(loc)) return 'ra';
  return null;
}

const VEHICLE_LOC_WORDS = {
  front: ['front', 'f', 'fr', 'nose'], rear: ['rear', 'rr', 'back', 'aft'],
  left: ['left', 'l', 'ls', 'left side', 'lside'], right: ['right', 'r', 'rs', 'right side', 'rside'],
  turret: ['turret', 't', 'tur'], rotor: ['rotor'], body: ['body', 'hull']
};

/** A vehicle weapon's location key from its free-text Loc. */
export function vehicleWeaponLocation(weapon) {
  const raw = String(weapon?.location ?? '').trim().toLowerCase();
  for (const [key, words] of Object.entries(VEHICLE_LOC_WORDS)) if (words.includes(raw)) return key;
  return null;
}

/**
 * Standing Driving Skill Roll modifiers for a vehicle: motive damage (+1 / +2 /
 * +3, each once), driver or VTOL pilot hit +2, commander hit +1, VTOL flight
 * stabilizer hit +3.
 */
export function vehicleDrivingMods(actor) {
  const sys = actor?.system || {};
  const mods = [];
  const m = num(sys.crits?.motiveDriving);
  if (m) mods.push({ label: 'Motive damage', value: m });
  if (sys.crew?.driverHit) mods.push({ label: sys.movementType === 'vtol' ? 'Pilot hit' : 'Driver hit', value: 2 });
  if (sys.crew?.commanderHit) mods.push({ label: 'Commander hit', value: 1 });
  if (sys.crits?.flightStabilizer) mods.push({ label: 'Flight stabilizer', value: 3 });
  return mods;
}

/** Destroyed actuators in a mech location, by kind. */
export function destroyedActuators(actor, loc) {
  return actuatorsInSlots(actor?.system?.critSlots?.[loc]);
}

/** Count destroyed actuators, by kind, in a location's critical-slot list. */
export function actuatorsInSlots(slots = []) {
  const out = { shoulder: 0, upperArm: 0, lowerArm: 0, hand: 0, hip: 0, upperLeg: 0, lowerLeg: 0, foot: 0 };
  for (const s of slots || []) {
    if (!s?.hit || s.type !== 'actuator') continue;
    const n = String(s.name || '').toLowerCase();
    if (n.includes('shoulder')) out.shoulder++;
    else if (n.includes('upper arm')) out.upperArm++;
    else if (n.includes('lower arm')) out.lowerArm++;
    else if (n.includes('hand')) out.hand++;
    else if (n.includes('hip')) out.hip++;
    else if (n.includes('upper leg')) out.upperLeg++;
    else if (n.includes('lower leg')) out.lowerLeg++;
    else if (n.includes('foot')) out.foot++;
  }
  return out;
}

/** Is a location destroyed (structure reduced to 0 on a configured location)? */
export function locationDestroyed(actor, loc) {
  const st = actor?.system?.structure?.[loc];
  return !!st && num(st.max) > 0 && num(st.value) <= 0;
}

/** Linked pilot/crew character of a unit, if any. */
export function linkedCrew(actor) {
  const crew = actor?.system?.pilot || actor?.system?.crew || {};
  return crew.actorId ? game.actors?.get(crew.actorId) ?? null : null;
}

/** Is the unit's warrior unconscious (sheet pilot, or the linked character)? */
export function pilotUnconscious(actor) {
  const crew = actor?.system?.pilot || actor?.system?.crew || {};
  const linked = linkedCrew(actor);
  if (linked) return !!linked.system?.unconscious;
  return !!crew.unconscious || num(crew.hits) >= 6;
}

/** Immobile target: shut down, unconscious warrior, or a vehicle marked immobile. */
export function isImmobile(actor) {
  if (!actor) return false;
  const c = actor.system?.conditions || {};
  if (c.shutdown || c.immobile) return true;
  if (['mech', 'ground_vehicle'].includes(actor.type) && pilotUnconscious(actor)) return true;
  return false;
}

/**
 * Automatic modifiers for a weapon attack (everything the sheet data can
 * determine). Range-dependent ones (range bracket, minimum range, prone target)
 * are applied after the dialog from the entered range — see rangeDependentMods.
 * @returns {Array<{key, label, value, hint}>}
 */
export function autoAttackMods(attacker, weapon, targetActor) {
  const mods = [];
  const add = (key, label, value, hint = '') => mods.push({ key, label, value, hint });

  // Attacker movement (ground units only; infantry never add it).
  if (TRACKED_TYPES.has(attacker?.type) && !isInfantry(attacker)) {
    const mv = movedThisTurn(attacker);
    const m = MOVE_MODES.find(x => x.key === mv.mode);
    const lbl = attacker.type === 'ground_vehicle' ? m.vlabel : m.label;
    add('attackerMove', `Attacker ${lbl.toLowerCase()}`, MODE_MOD[mv.mode], `${mv.hexes ? `${hexText(mv)}, ` : ''}${lbl}${mv.modeSet ? '' : currentTurnKey() ? ' (auto)' : ''}`);
  }
  // The linked warrior's A Time of War injury / fatigue (see tw-skills.mjs).
  for (const m of crewConditionMods(attacker)) add(m.key, m.label, m.value, m.hint);
  if (attacker?.type === 'mech' && attacker.system?.conditions?.prone) add('attackerProne', 'Attacker prone', 2, '');
  // Skidding (TW p. 63): +1 to a skidding unit's attacks, +2 to attacks against it, that turn.
  const skidded = (a) => !!currentTurnKey() && a?.flags?.['mech-foundry']?.skid?.key === currentTurnKey();
  if (skidded(attacker)) add('attackerSkid', 'Attacker skidded', 1, '');

  // The weapon's own to-hit modifier (pulse lasers −2 …).
  if (weapon) {
    const th = weaponOwnToHit(weapon, attacker);
    if (th) add('weaponMod', /pulse/i.test(weapon.name || '') ? 'Pulse laser' : 'Weapon modifier', th, weapon.name || '');
  }

  // Attacker 'Mech damage (weapon attacks only).
  if (attacker?.type === 'mech') {
    if (num(attacker.system?.systemHits?.sensors) > 0) add('sensors', 'Sensor hit', 2, '');
    const arm = weaponArm(weapon);
    if (arm) {
      const a = destroyedActuators(attacker, arm);
      if (a.shoulder) add('actuators', 'Shoulder hit', 4, `weapon in ${arm.toUpperCase()}`);
      else if (a.upperArm + a.lowerArm) add('actuators', 'Arm actuators', a.upperArm + a.lowerArm, `weapon in ${arm.toUpperCase()}`);
    }
  }
  if (attacker?.type === 'ground_vehicle') {
    const crits = attacker.system?.crits || {};
    if (num(crits.sensorHits) > 0) add('sensors', 'Sensor hits', num(crits.sensorHits), 'vehicle crits');
    if (attacker.system?.crew?.commanderHit) add('commander', 'Commander hit', 1, '');
    if (attacker.system?.crew?.coPilotHit) add('coPilot', 'Co-pilot hit', 1, '');
    if (crits.flightStabilizer) add('flightStab', 'Flight stabilizer hit', 1, '');
    // Stabilizer hit: double the attacker movement modifier for weapons in that location.
    const stab = { front: 'stabFront', rear: 'stabRear', left: 'stabLeft', right: 'stabRight', turret: 'stabTurret' }[vehicleWeaponLocation(weapon)];
    if (weapon && stab && crits[stab]) add('stabilizer', 'Stabilizer hit', MODE_MOD[movedThisTurn(attacker).mode] ?? 0, `weapon in the ${vehicleWeaponLocation(weapon)}`);
  }

  // Target.
  if (targetActor) {
    if (isImmobile(targetActor)) add('immobile', 'Target immobile', -4, '');
    else if (TRACKED_TYPES.has(targetActor.type)) {
      const mv = movedThisTurn(targetActor);
      const v = targetMoveMod(mv.hexes) + (mv.mode === 'jumped' ? 1 : 0);
      add('targetMove', `Target moved ${mv.hexes} hex${mv.hexes === 1 ? '' : 'es'}${mv.mode === 'jumped' ? ', jumped' : ''}`, v, hexText(mv));
    }
    // Battle armor's spread-out formation: +1 for non-infantry attackers.
    if (targetActor.type === 'battle_armor' && !isInfantry(attacker)) add('battleArmor', 'Battle armor target', 1, '');
    for (const m of concealmentMods(targetActor, movedThisTurn(targetActor).hexes)) add(m.key, m.label, m.value, m.hint);
    // Airborne VTOL: an additional +1 target movement modifier (TW p. 197).
    if (targetActor.type === 'ground_vehicle' && targetActor.system?.movementType === 'vtol' && num(targetActor.system?.elevation) >= 1) add('airborneVTOL', 'Airborne VTOL', 1, `elevation ${num(targetActor.system.elevation)}`);
    if (skidded(targetActor)) add('targetSkid', 'Target skidded', 2, '');
  }
  return mods;
}

/**
 * A weapon's own to-hit modifier: the sheet's "To-Hit" value when set (imported
 * weapons carry it), otherwise looked up in the equipment catalog by name.
 */
export function weaponOwnToHit(weapon, attacker = null) {
  if (weapon?.toHit !== undefined && weapon.toHit !== null && weapon.toHit !== '') return num(weapon.toHit);
  const clan = /clan/i.test(attacker?.system?.techBase || '') || /\bclan\b|\(c\)|^cl/i.test(weapon?.name || '');
  return catalogToHit(weapon?.name, { clan, ba: attacker?.type === 'battle_armor' });
}

/** Range-dependent modifiers: minimum range and a prone target (−2 adjacent / +1 otherwise). */
export function rangeDependentMods(weapon, targetActor, range) {
  const mods = [];
  const min = num(weapon?.rangeMin);
  if (range != null && min > 0 && range <= min) {
    mods.push({ label: `Minimum range (${min})`, value: min - range + 1 });
  }
  if (targetActor?.type === 'mech' && targetActor.system?.conditions?.prone && range != null) {
    mods.push({ label: 'Target prone', value: range <= 1 ? -2 : 1 });
  }
  return mods;
}

/** Terrain / cover / secondary-target modifiers from the dialog inputs. */
export function terrainMods({ lightWoods = 0, heavyWoods = 0, targetWoods = 'none', partialCover = false, secondary = 'none' } = {}) {
  const mods = [];
  if (lightWoods > 0) mods.push({ label: `Light woods/smoke between ×${lightWoods}`, value: lightWoods });
  if (heavyWoods > 0) mods.push({ label: `Heavy woods/smoke between ×${heavyWoods}`, value: 2 * heavyWoods });
  if (targetWoods === 'light') mods.push({ label: 'Target in light woods/smoke', value: 1 });
  if (targetWoods === 'heavy') mods.push({ label: 'Target in heavy woods/smoke', value: 2 });
  if (partialCover) mods.push({ label: 'Partial cover', value: 1 });
  if (secondary === 'front') mods.push({ label: 'Secondary target (front arc)', value: 1 });
  if (secondary === 'side') mods.push({ label: 'Secondary target (side/rear)', value: 2 });
  return mods;
}
