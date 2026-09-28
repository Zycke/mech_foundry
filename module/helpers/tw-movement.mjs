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

const num = (v) => Number(v) || 0;

/** Actor types whose movement is tracked (ground units). */
const TRACKED_TYPES = new Set(['mech', 'ground_vehicle', 'battle_armor']);

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
  return cruise;
}

function walkMP(actor) {
  const mv = actor?.system?.movement || {};
  if (actor?.type === 'ground_vehicle') return vehicleEffectiveCruise(actor);
  if (actor?.type === 'mech') return mechEffectiveMP(actor).walk;
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

/** Infer a movement mode from hexes moved. */
export function inferMode(actor, hexes) {
  if (hexes <= 0) return 'stationary';
  return hexes <= walkMP(actor) ? 'walked' : 'ran';
}

/** This turn's movement: { hexes, mode, modeSet }. Stationary outside combat or before moving. */
export function movedThisTurn(actor) {
  const rec = actor?.flags?.['mech-foundry']?.moved;
  const key = currentTurnKey();
  if (!key || !rec || rec.key !== key) return { hexes: 0, mode: 'stationary', modeSet: false };
  const hexes = Math.max(0, num(rec.hexes));
  const mode = rec.modeSet && MODE_MOD[rec.mode] !== undefined ? rec.mode : inferMode(actor, hexes);
  return { hexes, mode, modeSet: !!rec.modeSet };
}

/** Record this turn's movement (from the sheet or token moves). Partial updates merge. */
export async function setMovement(actor, { hexes, mode } = {}) {
  const key = currentTurnKey();
  if (!actor || !key) return;
  const cur = movedThisTurn(actor);
  const rec = { key, hexes: hexes ?? cur.hexes, mode: cur.mode, modeSet: cur.modeSet };
  if (mode !== undefined) {
    rec.modeSet = mode !== 'auto';
    rec.mode = mode === 'auto' ? inferMode(actor, rec.hexes) : mode;
  }
  await actor.update({ 'flags.mech-foundry.moved': rec });
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

/** Hexes (grid spaces) along a path of top-left token positions. */
function pathSpaces(doc, positions) {
  if (!canvas?.grid || positions.length < 2) return 0;
  try {
    const r = canvas.grid.measurePath(positions.map(p => centerOf(doc, p)));
    return Math.round(r.spaces ?? (r.distance / (canvas.scene?.grid?.distance || 1)) ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Accumulate hexes moved while a combat is running. Measured on the moving
 * user's client in preUpdateToken (old → waypoints → new position) and saved
 * to the actor's movement record after the update lands.
 */
export function registerMovementTracking() {
  Hooks.on("preUpdateToken", (doc, changes, options, userId) => {
    if (userId !== game.user.id || !currentTurnKey()) return;
    if (!('x' in changes) && !('y' in changes)) return;
    if (!TRACKED_TYPES.has(doc.actor?.type)) return;
    const from = { x: doc._source.x, y: doc._source.y };
    const to = { x: changes.x ?? from.x, y: changes.y ?? from.y };
    const waypoints = options.movement?.[doc.id]?.waypoints;
    const path = Array.isArray(waypoints) && waypoints.length
      ? [from, ...waypoints.map(w => ({ x: w.x ?? from.x, y: w.y ?? from.y }))]
      : [from, to];
    const last = path[path.length - 1];
    if (last.x !== to.x || last.y !== to.y) path.push(to);
    const spaces = pathSpaces(doc, path);
    if (spaces > 0) options.mfMovedHexes = spaces;
  });

  Hooks.on("updateToken", async (doc, changes, options, userId) => {
    if (userId !== game.user.id || !options.mfMovedHexes) return;
    const actor = doc.actor;
    if (!actor || !(actor.isOwner || game.user.isGM)) return;
    const cur = movedThisTurn(actor);
    await setMovement(actor, { hexes: cur.hexes + options.mfMovedHexes });
  });
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

  // Attacker movement (ground units only).
  if (TRACKED_TYPES.has(attacker?.type)) {
    const mv = movedThisTurn(attacker);
    const m = MOVE_MODES.find(x => x.key === mv.mode);
    const lbl = attacker.type === 'ground_vehicle' ? m.vlabel : m.label;
    add('attackerMove', 'Attacker movement', MODE_MOD[mv.mode], `${lbl}${mv.hexes ? `, ${mv.hexes} hex` : ''}${mv.modeSet ? '' : currentTurnKey() ? ' (auto)' : ''}`);
  }
  if (attacker?.type === 'mech' && attacker.system?.conditions?.prone) add('attackerProne', 'Attacker prone', 2, '');
  // Skidding (TW p. 63): +1 to a skidding unit's attacks, +2 to attacks against it, that turn.
  const skidded = (a) => !!currentTurnKey() && a?.flags?.['mech-foundry']?.skid?.key === currentTurnKey();
  if (skidded(attacker)) add('attackerSkid', 'Attacker skidded', 1, '');

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
      add('targetMove', 'Target movement', v, `${mv.hexes} hex${mv.mode === 'jumped' ? ', jumped' : ''}`);
    }
    if (targetActor.type === 'battle_armor') add('battleArmor', 'Battle armor target', 1, '');
    if (skidded(targetActor)) add('targetSkid', 'Target skidded', 2, '');
  }
  return mods;
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
  if (lightWoods > 0) mods.push({ label: `Light woods ×${lightWoods}`, value: lightWoods });
  if (heavyWoods > 0) mods.push({ label: `Heavy woods ×${heavyWoods}`, value: 2 * heavyWoods });
  if (targetWoods === 'light') mods.push({ label: 'Target in light woods', value: 1 });
  if (targetWoods === 'heavy') mods.push({ label: 'Target in heavy woods', value: 2 });
  if (partialCover) mods.push({ label: 'Partial cover', value: 1 });
  if (secondary === 'front') mods.push({ label: 'Secondary target (front arc)', value: 1 });
  if (secondary === 'side') mods.push({ label: 'Secondary target (side/rear)', value: 2 });
  return mods;
}
