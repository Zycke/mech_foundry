/**
 * Total Warfare combat automation — shared logic for mech / ground vehicle /
 * aerospace / small-craft unit sheets. Covers the full weapon-fire sequence:
 * a GATOR to-hit dialog (2d6 vs. an assembled target number), then, on a hit,
 * the target-type hit-location table, damage through armor→structure(/SI) with
 * transfer, cluster grouping, motive damage and criticals (mech determining-
 * crits resolved against the per-location critical-slot model), plus the mech
 * heat phase and Scene-Region area attacks. Rules verified against Total Warfare
 * and the A Time of War conversion (see atow-conversion.mjs).
 */
import {
  actorSkillRating, applyCrewDamage, CREW_DAMAGE,
  MECH_GUNNERY_SKILLS, VEHICLE_GUNNERY_SKILLS, AERO_GUNNERY_SKILLS
} from "./atow-conversion.mjs";
import { beginRecording, endRecording, writeDoc } from "./gm-relay.mjs";
import { currentTurnKey } from "./tw-turn.mjs";
import { autoAttackMods, movedThisTurn, pilotUnconscious, rangeDependentMods, terrainMods } from "./tw-movement.mjs";
import { damagePSRUpdate, queuePSR, standsThisTurn, warriorDamage } from "./tw-psr.mjs";

const { DialogV2 } = foundry.applications.api;

const num = (v) => Number(v) || 0;

/** Heat-based to-hit penalty (mech/aero): +1@8, +2@13, +3@17, +4@24. */
export function heatToHitMod(actor) {
  const h = num(actor?.system?.heat?.value);
  return [8, 13, 17, 24].filter(t => h >= t).length;
}

/* ------------------------------------------------------------------ */
/*  Fired-weapon tracking (per turn)                                    */
/* ------------------------------------------------------------------ */

export { currentTurnKey };

/**
 * Weapons an actor has fired this turn, as { weaponId: heat }. Stored in the
 * actor flag `mech-foundry.fired` = { key, list: [{id, heat}] } — a list, not a
 * keyed object, because Foundry merges object updates and would carry last
 * turn's entries forward. A record from another turn reads as empty.
 */
export function firedThisTurn(actor) {
  const rec = actor?.flags?.['mech-foundry']?.fired;
  if (!rec || rec.key !== currentTurnKey()) return {};
  return Object.fromEntries((rec.list || []).map(e => [e.id, num(e.heat)]));
}

/** Does this weapon draw from ammunition? (Energy weapons leave Ammo Type blank.) */
export function usesAmmo(weapon) {
  return String(weapon?.ammoType ?? '').trim() !== '';
}

/**
 * Damage per hit-location group for a cluster weapon: 5-point groups (LRM, MRM,
 * ATM, rockets) or each missile / pellet on its own (SRM, Streak SRM, LB-X
 * cluster). `clusterGroup` on the weapon: 'five', 'each', or blank = by name.
 */
export function clusterGroupSize(weapon) {
  const each = Math.max(1, num(weapon?.damage));
  if (weapon?.clusterGroup === 'each') return each;
  if (weapon?.clusterGroup === 'five') return 5;
  return /\bsrm\b|\blb[\s-]?\d+[\s-]?x\b/i.test(weapon?.name || '') ? each : 5;
}

/** Split damage into groups of `size` (the last may be smaller). */
export function groupDamage(total, size = 5) {
  const out = [];
  let t = Math.max(0, num(total));
  while (t > 0) { out.push(Math.min(size, t)); t -= size; }
  return out;
}

/** Resolve the crew Gunnery rating, deriving from a linked character when present. */
export function gunneryFor(actor) {
  const crew = actor.system.pilot || actor.system.crew || {};
  const linked = crew.actorId ? game.actors.get(crew.actorId) : null;
  if (linked) {
    const cands = actor.type === 'mech' ? MECH_GUNNERY_SKILLS
      : actor.type === 'ground_vehicle' ? VEHICLE_GUNNERY_SKILLS
        : AERO_GUNNERY_SKILLS;
    const r = actorSkillRating(linked, cands);
    if (r) return r.rating;
  }
  return num(crew.gunnery ?? 4);
}

/** Distance in hexes (grid spaces) between two tokens, or null. */
export function measureHexes(a, b) {
  if (!a || !b || !canvas?.grid) return null;
  try {
    const r = canvas.grid.measurePath([a.center, b.center]);
    return Math.round(r.spaces ?? r.distance ?? 0);
  } catch {
    return null;
  }
}

/** Range bracket + modifier from a weapon's short/medium/long (in hexes). */
export function rangeBracket(distance, weapon) {
  const s = num(weapon.rangeS ?? weapon.short);
  const m = num(weapon.rangeM ?? weapon.medium);
  const l = num(weapon.rangeL ?? weapon.long);
  const e = num(weapon.rangeE ?? weapon.ext); // aerospace / capital Extreme bracket
  if (distance == null) return { bracket: '—', mod: 0, inRange: true, unknown: true };
  // No ranges entered on the weapon: don't auto-miss; let the player's roll stand.
  if (!s && !m && !l && !e) return { bracket: 'ranges not set', mod: 0, inRange: true, unknown: true };
  if (s && distance <= s) return { bracket: 'Short', mod: 0, inRange: true };
  if (m && distance <= m) return { bracket: 'Medium', mod: 2, inRange: true };
  if (l && distance <= l) return { bracket: 'Long', mod: 4, inRange: true };
  if (e && distance <= e) return { bracket: 'Extreme', mod: 6, inRange: true };
  return { bracket: 'Out of range', mod: 0, inRange: false };
}

/* ------------------------------------------------------------------ */
/*  Hit location + damage (Total Warfare 'Mech Hit Location Table)      */
/* ------------------------------------------------------------------ */

/** Attack directions offered in the dialog (rear uses the Front column + rear armor). */
export const ATTACK_DIRECTIONS = [
  { key: 'front', label: 'Front' },
  { key: 'left', label: 'Left Side' },
  { key: 'right', label: 'Right Side' },
  { key: 'rear', label: 'Rear' }
];

/** 'Mech Hit Location Table (biped), by die roll and attack side. */
const MECH_HIT_LOCATION = {
  left:  { 2: 'lt', 3: 'll', 4: 'la', 5: 'la', 6: 'll', 7: 'lt', 8: 'ct', 9: 'rt', 10: 'ra', 11: 'rl', 12: 'head' },
  front: { 2: 'ct', 3: 'ra', 4: 'ra', 5: 'rl', 6: 'rt', 7: 'ct', 8: 'lt', 9: 'll', 10: 'la', 11: 'la', 12: 'head' },
  right: { 2: 'rt', 3: 'rl', 4: 'ra', 5: 'ra', 6: 'rl', 7: 'rt', 8: 'ct', 9: 'lt', 10: 'la', 11: 'll', 12: 'head' }
};

/** Damage transfer: destroyed location → where excess flows (null = terminal). */
const MECH_TRANSFER = { la: 'lt', ra: 'rt', ll: 'lt', rl: 'rt', lt: 'ct', rt: 'ct', ct: null, head: null };

export const MECH_LOC_LABEL = {
  head: 'Head', ct: 'Center Torso', lt: 'Left Torso', rt: 'Right Torso',
  la: 'Left Arm', ra: 'Right Arm', ll: 'Left Leg', rl: 'Right Leg'
};

export const REAR_ARMOR_KEY = { ct: 'ctRear', lt: 'ltRear', rt: 'rtRear' };

/**
 * Apply a block of damage to in-memory mech state ({armor, structure}), starting
 * at a rolled location and transferring inward through destroyed locations.
 * Pure: mutates `state` only. Callers accumulate every damage group for an
 * attack and save once (see resolveDamageAgainst).
 */
export function applyMechDamageToState(state, startLoc, amount, { rear = false, internal = false, contain = false } = {}) {
  const { armor, structure } = state;
  const events = [];
  const structureHits = [];
  let loc = startLoc;
  let remaining = amount;
  let destroyed = false;
  let useRear = rear;
  let skipArmor = internal; // ammo explosions strike the first location's structure directly
  let vented = 0;
  let guard = 0;

  while (remaining > 0 && loc && guard++ < 12) {
    // Armor (rear on the initially-struck torso only).
    const rearKey = useRear ? REAR_ARMOR_KEY[loc] : null;
    const armorSlot = rearKey ? armor[rearKey] : armor[loc];
    if (!skipArmor && armorSlot && armorSlot.value > 0) {
      const a = Math.min(armorSlot.value, remaining);
      armorSlot.value -= a; remaining -= a;
    }
    skipArmor = false;
    if (remaining <= 0) break;

    // Internal structure. A location with no structure record or zero max is
    // treated as absent (unconfigured mech) and stops the transfer.
    const st = structure[loc];
    if (!st || (Number(st.max) || 0) <= 0) break;
    if (st.value > 0) {
      const a = Math.min(st.value, remaining);
      st.value -= a; remaining -= a; structureHits.push(loc);
      if (st.value > 0) break; // absorbed without destroying the location
      events.push(`${MECH_LOC_LABEL[loc]} destroyed`);
    }
    // Structure is gone (destroyed now or already) and damage remains → transfer
    // (unless CASE contains an explosion: the rest is vented).
    if (loc === 'ct') { destroyed = true; loc = null; }
    else if (contain) { vented = remaining; remaining = 0; loc = null; }
    else { loc = MECH_TRANSFER[loc]; useRear = false; }
  }

  return {
    destroyed, events, structureHits, vented,
    overflow: remaining > 0 && !destroyed ? remaining : 0
  };
}

/**
 * Apply a single block of damage to a mech actor and save it (directly, or via
 * the GM relay when this user doesn't own the target).
 */
export async function applyMechDamage(target, startLoc, amount, opts = {}) {
  const state = {
    armor: foundry.utils.deepClone(target.system.armor || {}),
    structure: foundry.utils.deepClone(target.system.structure || {})
  };
  const result = applyMechDamageToState(state, startLoc, amount, opts);
  const applied = await writeDoc(target, { 'system.armor': state.armor, 'system.structure': state.structure });
  return { ...result, applied };
}

/** Zero a location's armor + structure in memory (limb/head blown off). Returns true if the head. */
function blowOffLocationState(state, loc) {
  const { armor, structure } = state;
  if (armor[loc]) armor[loc].value = 0;
  const rearKey = REAR_ARMOR_KEY[loc];
  if (rearKey && armor[rearKey]) armor[rearKey].value = 0;
  if (structure[loc]) structure[loc].value = 0;
  return loc === 'head';
}

const MECH_TORSO = new Set(['ct', 'lt', 'rt']);

/* ------------------------------------------------------------------ */
/*  Mech critical slots                                                 */
/* ------------------------------------------------------------------ */

/** Component types selectable for a critical slot, with effect semantics. */
export const SLOT_TYPES = [
  { key: 'empty', label: '— empty —' },
  { key: 'engine', label: 'Engine' },
  { key: 'gyro', label: 'Gyro' },
  { key: 'sensors', label: 'Sensors' },
  { key: 'lifeSupport', label: 'Life Support' },
  { key: 'cockpit', label: 'Cockpit' },
  { key: 'actuator', label: 'Actuator' },
  { key: 'weapon', label: 'Weapon' },
  { key: 'ammo', label: 'Ammunition' },
  { key: 'heatSink', label: 'Heat Sink' },
  { key: 'case', label: 'CASE' },
  { key: 'equipment', label: 'Equipment' }
];

/** Build the standard biped critical-slot layout (fixed components + empties). */
export function standardMechSlots() {
  const empty = (n) => Array.from({ length: n }, () => ({ name: '', type: 'empty', hit: false }));
  const c = (name, type) => ({ name, type, hit: false });
  const actu = (name) => c(name, 'actuator');
  return {
    head: [c('Life Support', 'lifeSupport'), c('Sensors', 'sensors'), c('Cockpit', 'cockpit'), ...empty(1), c('Sensors', 'sensors'), c('Life Support', 'lifeSupport')],
    ct: [c('Engine', 'engine'), c('Engine', 'engine'), c('Engine', 'engine'), c('Gyro', 'gyro'), c('Gyro', 'gyro'), c('Gyro', 'gyro'), c('Gyro', 'gyro'), c('Engine', 'engine'), c('Engine', 'engine'), c('Engine', 'engine'), ...empty(2)],
    lt: empty(12),
    rt: empty(12),
    la: [actu('Shoulder'), actu('Upper Arm Actuator'), actu('Lower Arm Actuator'), actu('Hand Actuator'), ...empty(8)],
    ra: [actu('Shoulder'), actu('Upper Arm Actuator'), actu('Lower Arm Actuator'), actu('Hand Actuator'), ...empty(8)],
    ll: [actu('Hip'), actu('Upper Leg Actuator'), actu('Lower Leg Actuator'), actu('Foot Actuator'), ...empty(2)],
    rl: [actu('Hip'), actu('Upper Leg Actuator'), actu('Lower Leg Actuator'), actu('Foot Actuator'), ...empty(2)]
  };
}

/** Roll which critical slot is struck in a location (1d6, or 1d6/1d6 for 12-slot). */
async function rollCritSlotIndex(count, rolls) {
  if (count <= 6) {
    const r = await new Roll("1d6").evaluate(); rolls.push(r);
    return r.total;
  }
  const g = await new Roll("1d6").evaluate(); rolls.push(g);
  const s = await new Roll("1d6").evaluate(); rolls.push(s);
  return (g.total <= 3 ? 0 : 6) + s.total;
}

/** Apply a struck slot's effect to the mutable combat state. Returns effect text. */
function applyMechCritSlotEffect(slot, systemHits, heatSinks, weapons, crew, state) {
  switch (slot.type) {
    case 'engine':
      systemHits.engine = Math.min(3, (Number(systemHits.engine) || 0) + 1);
      if (systemHits.engine >= 3) { state.destroyed = true; return 'Engine (3rd hit) — DESTROYED'; }
      return 'Engine hit (+heat)';
    case 'gyro':
      systemHits.gyro = Math.min(2, (Number(systemHits.gyro) || 0) + 1);
      return systemHits.gyro >= 2 ? 'Gyro destroyed (falls / immobile)' : 'Gyro hit (+piloting)';
    case 'sensors':
      systemHits.sensors = Math.min(2, (Number(systemHits.sensors) || 0) + 1);
      return 'Sensors hit';
    case 'lifeSupport':
      systemHits.lifeSupport = Math.min(2, (Number(systemHits.lifeSupport) || 0) + 1);
      return 'Life Support hit';
    case 'cockpit':
      // The mech is out of action either way. A linked pilot (a character
      // actor) is knocked unconscious rather than killed — house ruling for
      // now; an unlinked sheet-only pilot is marked killed on the hit ladder.
      state.destroyed = true;
      if (crew.actorId) { state.pilotUnconscious = true; return 'Cockpit — pilot knocked unconscious'; }
      crew.hits = 6;
      return 'Cockpit — PILOT KILLED';
    case 'actuator': return `${slot.name || 'Actuator'} destroyed`;
    case 'weapon': {
      // Linked slot → that weapon; otherwise the first intact weapon of the same name.
      const w = slot.weaponId ? weapons.find(x => x.id === slot.weaponId)
        : weapons.find(x => !x.destroyed && slot.name && x.name === slot.name);
      if (w) w.destroyed = true;
      return `${slot.name || w?.name || 'Weapon'} destroyed`;
    }
    case 'ammo': return `${slot.name || 'Ammunition'} hit`; // the explosion resolves after this crit
    case 'heatSink': heatSinks.count = Math.max(0, (Number(heatSinks.count) || 0) - 1); return 'Heat Sink destroyed';
    default: return `${slot.name || 'Equipment'} destroyed`;
  }
}

/**
 * An ammunition bin's explosion: the weapon it feeds (the slot's link, else the
 * weapon whose Ammo Type appears in the slot name), the shots in the bin (one
 * ton: Shots/Ton, or everything left if that's unset) and damage = shots ×
 * damage per shot (a full salvo for cluster weapons). Null if nothing matches.
 */
export function ammoExplosionDamage(slot, weapons) {
  const w = (slot?.weaponId && weapons.find(x => x.id === slot.weaponId))
    || weapons.find(x => usesAmmo(x) && slot?.name && slot.name.includes(String(x.ammoType).trim()));
  if (!w) return null;
  const left = Math.max(0, num(w.ammo));
  const shots = num(w.shotsPerTon) > 0 ? Math.min(left, num(w.shotsPerTon)) : left;
  const perShot = num(w.damage) * Math.max(1, num(w.clusterSize));
  return { weapon: w, shots, perShot, damage: shots * perShot };
}

/**
 * Roll the Determining Critical Hits Table for a struck location.
 * @param {string} loc  Location key (drives torso vs limb/head handling on a 12).
 */
export async function rollDeterminingCrit(loc) {
  const roll = await new Roll("2d6").evaluate();
  const t = roll.total;
  const isTorso = MECH_TORSO.has(loc);
  let count = 0, blowOff = false, text = 'No critical hit';
  if (t >= 8 && t <= 9) { count = 1; text = '1 critical hit'; }
  else if (t >= 10 && t <= 11) { count = 2; text = '2 critical hits'; }
  else if (t === 12) {
    if (isTorso) { count = 3; text = '3 critical hits'; }
    else { blowOff = true; text = (loc === 'head' ? 'Head' : 'Limb') + ' Blown Off'; }
  }
  return { roll, total: t, dice: roll.dice[0]?.results?.map(r => r.result) ?? [], count, blowOff, text, loc };
}

/* ------------------------------------------------------------------ */
/*  Cluster Hits Table (Total Warfare)                                  */
/* ------------------------------------------------------------------ */

const CLUSTER_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 40];
const CLUSTER_TABLE = {
  2:  [1, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 9, 9, 10, 10, 12],
  3:  [1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 9, 9, 10, 10, 12],
  4:  [1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 18],
  5:  [1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 24],
  6:  [1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 24],
  7:  [1, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 24],
  8:  [2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 24],
  9:  [2, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 11, 12, 13, 14, 14, 15, 16, 17, 18, 19, 20, 21, 21, 22, 23, 23, 24, 32],
  10: [2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 11, 12, 13, 14, 14, 15, 16, 17, 18, 19, 20, 21, 21, 22, 23, 23, 24, 32],
  11: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 40],
  12: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 40]
};

/** Number of sub-munitions that hit for a given launcher size and 2d6 roll. */
export function clusterHits(size, roll2d6) {
  const r = Math.max(2, Math.min(12, roll2d6));
  // Snap to the nearest defined column.
  let col = CLUSTER_SIZES.indexOf(size);
  if (col < 0) {
    let best = 0, bestDiff = Infinity;
    CLUSTER_SIZES.forEach((s, i) => { const d = Math.abs(s - size); if (d < bestDiff) { bestDiff = d; best = i; } });
    col = best;
  }
  return CLUSTER_TABLE[r][col];
}

/** Roll 2d6 for a mech hit location given attack direction. */
export async function rollMechLocation(direction) {
  const dir = direction === 'rear' ? 'front' : direction;
  const map = MECH_HIT_LOCATION[dir] || MECH_HIT_LOCATION.front;
  const roll = await new Roll("2d6").evaluate();
  const loc = map[roll.total];
  return {
    roll, total: roll.total,
    dice: roll.dice[0]?.results?.map(r => r.result) ?? [],
    loc, label: MECH_LOC_LABEL[loc] || loc,
    crit: roll.total === 2,
    rear: direction === 'rear' && loc in REAR_ARMOR_KEY
  };
}

/* ------------------------------------------------------------------ */
/*  Ground / VTOL Combat Vehicle combat (Total Warfare)                 */
/* ------------------------------------------------------------------ */

// Ground Combat Vehicle Hit Location Table. Tokens: front/rear/turret literal;
// 'side' = the side actually attacked; left/right = literal sides.
const VEHICLE_HIT_LOCATION = {
  front: { 2: ['front', 'C'], 3: ['front', 'M'], 4: ['front', 'M'], 5: ['right', 'M'], 6: ['front'], 7: ['front'], 8: ['front'], 9: ['left', 'M'], 10: ['turret'], 11: ['turret'], 12: ['turret', 'C'] },
  rear:  { 2: ['rear', 'C'], 3: ['rear', 'M'], 4: ['rear', 'M'], 5: ['left', 'M'], 6: ['rear'], 7: ['rear'], 8: ['rear'], 9: ['right', 'M'], 10: ['turret'], 11: ['turret'], 12: ['turret', 'C'] },
  side:  { 2: ['side', 'C'], 3: ['side', 'M'], 4: ['side', 'M'], 5: ['front', 'M'], 6: ['side'], 7: ['side'], 8: ['side', 'C'], 9: ['rear', 'M'], 10: ['turret'], 11: ['turret'], 12: ['turret', 'C'] }
};

// VTOL Combat Vehicle Hit Location Table (TW p.196). Flags: C = critical,
// M = motive-system roll, R = rotor hit (damage ÷ 10 rounded up, −1 Cruise MP).
const VTOL_HIT_LOCATION = {
  front: { 2: ['front', 'C'], 3: ['rotor', 'R'], 4: ['rotor', 'R'], 5: ['right'], 6: ['front'], 7: ['front'], 8: ['front'], 9: ['left'], 10: ['rotor', 'R'], 11: ['rotor', 'R'], 12: ['rotor', 'RC'] },
  rear:  { 2: ['rear', 'C'], 3: ['rotor', 'R'], 4: ['rotor', 'R'], 5: ['left'], 6: ['rear'], 7: ['rear'], 8: ['rear'], 9: ['right'], 10: ['rotor', 'R'], 11: ['rotor', 'R'], 12: ['rotor', 'RC'] },
  side:  { 2: ['side', 'C'], 3: ['rotor', 'R'], 4: ['rotor', 'R'], 5: ['front'], 6: ['side'], 7: ['side'], 8: ['side', 'C'], 9: ['rear'], 10: ['rotor', 'R'], 11: ['rotor', 'R'], 12: ['rotor', 'RC'] }
};

const VEHICLE_FACING_LABEL = { front: 'Front', rear: 'Rear', left: 'Left Side', right: 'Right Side', turret: 'Turret', rotor: 'Rotor' };

// Motive System Damage Table (2d6 + direction + vehicle-type modifiers).
const MOTIVE_TYPE_MOD = { tracked: 0, naval: 0, submarine: 0, wheeled: 2, hover: 3, hydrofoil: 3, wige: 4, vtol: 0 };
function motiveEffect(total) {
  if (total <= 5) return { level: 0, mp: 0, text: 'No effect' };
  if (total <= 7) return { level: 1, mp: 0, text: 'Minor: +1 to Driving Skill Rolls' };
  if (total <= 9) return { level: 2, mp: 1, text: 'Moderate: −1 Cruise MP, +2 Driving' };
  if (total <= 11) return { level: 3, mp: 2, text: 'Heavy: half Cruise MP, +3 Driving' };
  return { level: 4, mp: 0, text: 'Major: immobile for the rest of the game' };
}

// Ground Combat Vehicle Critical Hits Table (by facing column).
const GROUND_VEHICLE_CRITS = {
  front:  { 6: 'Driver Hit', 7: 'Weapon Malfunction', 8: 'Stabilizer', 9: 'Sensors', 10: 'Commander Hit', 11: 'Weapon Destroyed', 12: 'Crew Killed' },
  side:   { 6: 'Cargo/Infantry Hit', 7: 'Weapon Malfunction', 8: 'Crew Stunned', 9: 'Stabilizer', 10: 'Weapon Destroyed', 11: 'Engine Hit', 12: 'Fuel Tank' },
  rear:   { 6: 'Weapon Malfunction', 7: 'Cargo/Infantry Hit', 8: 'Stabilizer', 9: 'Weapon Destroyed', 10: 'Engine Hit', 11: 'Ammunition', 12: 'Fuel Tank' },
  turret: { 6: 'Stabilizer', 7: 'Turret Jam', 8: 'Weapon Malfunction', 9: 'Turret Locks', 10: 'Weapon Destroyed', 11: 'Ammunition', 12: 'Turret Blown Off' }
};
const VTOL_VEHICLE_CRITS = {
  front:  { 6: 'Co-Pilot Hit', 7: 'Weapon Malfunction', 8: 'Stabilizer', 9: 'Sensors', 10: 'Pilot Hit', 11: 'Weapon Destroyed', 12: 'Crew Killed' },
  side:   { 6: 'Weapon Malfunction', 7: 'Cargo/Infantry Hit', 8: 'Stabilizer', 9: 'Weapon Destroyed', 10: 'Engine Damage', 11: 'Ammunition', 12: 'Fuel Tank' },
  rear:   { 6: 'Cargo/Infantry Hit', 7: 'Weapon Malfunction', 8: 'Stabilizer', 9: 'Weapon Destroyed', 10: 'Sensors', 11: 'Engine Damage', 12: 'Fuel Tank' },
  rotor:  { 6: 'Rotor Damage', 7: 'Rotor Damage', 8: 'Rotor Damage', 9: 'Flight Stabilizer Hit', 10: 'Flight Stabilizer Hit', 11: 'Rotors Destroyed', 12: 'Rotors Destroyed' }
};

/** Resolve a hit-location token to a concrete armor facing. */
function resolveVehicleFacing(token, direction, hasTurret) {
  const attacked = direction === 'left' ? 'left' : direction === 'right' ? 'right' : direction === 'rear' ? 'rear' : 'front';
  if (token === 'side') return attacked;
  // No turret: a turret hit strikes the armor on the side attacked (TW p.193).
  if (token === 'turret') return hasTurret ? 'turret' : attacked;
  return token; // front / rear / left / right / rotor literal
}

/** The crit-table column for a facing. */
function vehicleCritColumn(facing) {
  if (facing === 'turret') return 'turret';
  if (facing === 'rotor') return 'rotor';
  if (facing === 'front') return 'front';
  if (facing === 'rear') return 'rear';
  return 'side'; // left/right
}

/**
 * Resolve a full attack against a Combat Vehicle: per damage group, roll hit
 * location, apply armor→structure damage, and roll motive/critical effects as
 * the location table dictates. Mutates and saves the target once.
 */
export async function resolveVehicleAttack(target, direction, groupSizes, rolls, { forceMotive = false } = {}) {
  const armor = foundry.utils.deepClone(target.system.armor || {});
  const structure = foundry.utils.deepClone(target.system.structure || { value: 0, max: 0 });
  const crits = foundry.utils.deepClone(target.system.crits || {});
  const conditions = foundry.utils.deepClone(target.system.conditions || {});
  const crew = foundry.utils.deepClone(target.system.crew || {});
  const isVTOL = target.system.movementType === 'vtol';
  const hasTurret = !!target.system.hasTurret;
  const isICE = /\bice\b|internal combustion/i.test(target.system.engineType || '');
  const carriesAmmo = (target.system.weapons || []).some(w => String(w.ammoType || '').trim() && (Number(w.ammo) || 0) > 0);
  const col = direction === 'left' || direction === 'right' ? 'side' : direction === 'rear' ? 'rear' : 'front';

  const groups = [], motives = [], critResults = [], crewEvents = [];
  let destroyed = false;

  const hitTable = isVTOL ? VTOL_HIT_LOCATION : VEHICLE_HIT_LOCATION;
  // One roll on the Motive System Damage Table (2d6 + attack direction + motive type).
  const rollMotive = async () => {
    const mRoll = await new Roll("2d6").evaluate();
    rolls.push(mRoll);
    const dirMod = direction === 'rear' ? 1 : (direction === 'left' || direction === 'right') ? 2 : 0;
    const typeMod = MOTIVE_TYPE_MOD[target.system.movementType] ?? 0;
    const eff = motiveEffect(mRoll.total + dirMod + typeMod);
    motives.push({ roll: mRoll.total + dirMod + typeMod, text: eff.text });
    if (eff.level === 4) conditions.immobile = true;
    else if (eff.mp > 0) crits.motiveHits = Math.min(3, (Number(crits.motiveHits) || 0) + eff.mp);
  };

  for (const g of groupSizes) {
    const locRoll = await new Roll("2d6").evaluate();
    rolls.push(locRoll);
    const [token, flags = ''] = hitTable[col][locRoll.total];
    const facing = resolveVehicleFacing(token, direction, hasTurret);

    // VTOL rotor hit (†): the rotors take Damage Value ÷ 10 (round up), and each
    // hit costs 1 Cruising MP (tracked via motiveHits; Flank is re-derived).
    const rotorHit = flags.includes('R');
    const dealt = rotorHit ? Math.ceil(g / 10) : g;
    if (rotorHit) crits.motiveHits = (Number(crits.motiveHits) || 0) + 1;

    // Damage: armor then single internal structure pool.
    let remaining = dealt, structureHit = false;
    const slot = armor[facing];
    if (slot && slot.value > 0) { const a = Math.min(slot.value, remaining); slot.value -= a; remaining -= a; }
    if (remaining > 0) { structure.value = Math.max(0, (structure.value || 0) - remaining); structureHit = true; if (structure.value <= 0) destroyed = true; }
    groups.push({
      damage: g, rotorDamage: rotorHit ? dealt : null,
      facingLabel: VEHICLE_FACING_LABEL[facing] || facing, dice: locRoll.dice[0]?.results?.map(r => r.result) ?? [], structureHit
    });

    // Motive system damage (†, ground vehicles).
    if (flags.includes('M')) await rollMotive();

    // Critical hit: the table's marked results (2/12, or 8 on side attacks)
    // AND any hit that penetrates to internal structure. The penetration crit
    // is an intentional house rule (confirmed by the user) beyond the vehicle
    // tables' footnotes -- do not remove it to "match the book".
    if (flags.includes('C') || structureHit) {
      const cRoll = await new Roll("2d6").evaluate();
      rolls.push(cRoll);
      const table = isVTOL ? VTOL_VEHICLE_CRITS : GROUND_VEHICLE_CRITS;
      let effect = table[vehicleCritColumn(facing)]?.[cRoll.total] || 'No Critical Hit';
      // Table footnotes: Fuel Tank applies to ICE engines only (otherwise Engine
      // Hit); Ammunition with no ammo aboard becomes Weapon Destroyed.
      let note = '';
      if (effect === 'Fuel Tank' && !isICE) { effect = 'Engine Hit'; note = 'non-ICE engine: Fuel Tank → Engine Hit'; }
      else if (effect === 'Ammunition' && !carriesAmmo) { effect = 'Weapon Destroyed'; note = 'no ammunition: → Weapon Destroyed'; }
      critResults.push({ facingLabel: VEHICLE_FACING_LABEL[facing] || facing, roll: cRoll.total, effect, note });
      if (applyVehicleCrit(effect, facing, direction, crits, conditions, structure, crew)) destroyed = true;
      if (['Driver Hit', 'Commander Hit', 'Co-Pilot Hit', 'Pilot Hit'].includes(effect)) crewEvents.push(CREW_DAMAGE.vehicleCrewHit);
      else if (effect === 'Crew Stunned') crewEvents.push(CREW_DAMAGE.vehicleStunned);
      else if (effect === 'Crew Killed') crewEvents.push(CREW_DAMAGE.vehicleKilled);
    }
  }

  // Charges force a motive roll on any vehicle involved (TW charging rules).
  if (forceMotive) await rollMotive();

  // Cruising MP can't drop below 0: cap the MP loss at the vehicle's cruise
  // (never below the 3-hit motive track the sheet already shows).
  const cruise = Number(target.system.movement?.cruise) || 0;
  crits.motiveHits = Math.min(Math.max(3, cruise), Number(crits.motiveHits) || 0);

  const applied = await writeDoc(target, { 'system.armor': armor, 'system.structure': structure, 'system.crits': crits, 'system.conditions': conditions, 'system.crew': crew });

  // Apply crew damage to a linked crew actor.
  const linked = target.system.crew?.actorId ? game.actors.get(target.system.crew.actorId) : null;
  if (applied && linked) for (const ev of crewEvents) await applyCrewDamage(linked, ev);

  return {
    vehicle: true, applied, hasTarget: true, targetName: target.name,
    groups, motives, critResults, destroyed
  };
}

/** Apply a vehicle critical effect to the mutable crit/condition state. Returns true if destroyed. */
function applyVehicleCrit(effect, facing, direction, crits, conditions, structure, crew) {
  const stabKey = { front: 'stabFront', rear: 'stabRear', left: 'stabLeft', right: 'stabRight', turret: 'stabTurret' }[facing];
  switch (effect) {
    case 'Driver Hit': case 'Pilot Hit': crew.driverHit = true; break;
    case 'Commander Hit': case 'Co-Pilot Hit': crew.commanderHit = true; break;
    case 'Sensors': crits.sensorHits = Math.min(4, (Number(crits.sensorHits) || 0) + 1); break;
    case 'Stabilizer': case 'Flight Stabilizer Hit': if (stabKey) crits[stabKey] = true; break;
    case 'Turret Jam': conditions.turretJammed = true; break;
    case 'Turret Locks': crits.turretLocked = true; break;
    case 'Turret Blown Off': crits.turretLocked = true; break;
    case 'Engine Hit': case 'Engine Damage': crits.engineHit = true; break;
    case 'Rotor Damage': crits.motiveHits = (Number(crits.motiveHits) || 0) + 1; break; // clamped after the loop
    case 'Rotors Destroyed': conditions.immobile = true; break;
    case 'Ammunition': case 'Fuel Tank': case 'Crew Killed':
      structure.value = 0; conditions.immobile = true; return true;
    default: break; // Weapon Malfunction / Weapon Destroyed / Cargo-Infantry / Crew Stunned handled elsewhere
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Aerospace / Small Craft combat (Total Warfare)                      */
/* ------------------------------------------------------------------ */

// Aerospace Units Hit Location Table. Each cell = [facingToken, system].
// Facing tokens: nose/aft/leftWing/rightWing/wing(=attacked side)/side(=attacked side).
const AERO_HIT_FIGHTER = {
  nose: { 2: ['nose', 'Weapon'], 3: ['nose', 'Sensors'], 4: ['rightWing', 'Heat Sink'], 5: ['rightWing', 'Weapon'], 6: ['nose', 'Avionics'], 7: ['nose', 'Control'], 8: ['nose', 'FCS'], 9: ['leftWing', 'Weapon'], 10: ['leftWing', 'Heat Sink'], 11: ['nose', 'Gear'], 12: ['nose', 'Weapon'] },
  aft:  { 2: ['aft', 'Weapon'], 3: ['aft', 'Heat Sink'], 4: ['rightWing', 'Fuel'], 5: ['rightWing', 'Weapon'], 6: ['aft', 'Engine'], 7: ['aft', 'Control'], 8: ['aft', 'Engine'], 9: ['leftWing', 'Weapon'], 10: ['leftWing', 'Fuel'], 11: ['aft', 'Heat Sink'], 12: ['aft', 'Weapon'] },
  side: { 2: ['nose', 'Weapon'], 3: ['wing', 'Gear'], 4: ['nose', 'Sensors'], 5: ['nose', 'Crew'], 6: ['wing', 'Weapon'], 7: ['wing', 'Avionics'], 8: ['wing', 'Bomb'], 9: ['aft', 'Control'], 10: ['aft', 'Engine'], 11: ['wing', 'Gear'], 12: ['aft', 'Weapon'] }
};
const AERO_HIT_DROPSHIP = {
  nose: { 2: ['nose', 'Crew'], 3: ['nose', 'Avionics'], 4: ['rightWing', 'Weapon'], 5: ['rightWing', 'Thruster'], 6: ['nose', 'FCS'], 7: ['nose', 'Weapon'], 8: ['nose', 'Control'], 9: ['leftWing', 'Thruster'], 10: ['leftWing', 'Weapon'], 11: ['nose', 'Sensors'], 12: ['nose', 'K-F Boom'] },
  aft:  { 2: ['aft', 'Life Support'], 3: ['aft', 'Control'], 4: ['rightWing', 'Weapon'], 5: ['rightWing', 'Door'], 6: ['aft', 'Engine'], 7: ['aft', 'Weapon'], 8: ['aft', 'Docking Collar'], 9: ['leftWing', 'Door'], 10: ['leftWing', 'Weapon'], 11: ['aft', 'Gear'], 12: ['aft', 'Fuel'] },
  side: { 2: ['nose', 'Weapon'], 3: ['nose', 'FCS'], 4: ['nose', 'Sensors'], 5: ['side', 'Thruster'], 6: ['side', 'Cargo'], 7: ['side', 'Weapon'], 8: ['side', 'Door'], 9: ['side', 'Thruster'], 10: ['aft', 'Avionics'], 11: ['aft', 'Engine'], 12: ['aft', 'Weapon'] }
};
const AERO_FACING_LABEL = { nose: 'Nose', aft: 'Aft', leftWing: 'Left Wing', rightWing: 'Right Wing' };

function resolveAeroFacing(token, direction) {
  if (token === 'wing' || token === 'side') return direction === 'right' ? 'rightWing' : 'leftWing';
  return token; // nose / aft / leftWing / rightWing
}

/** Apply an aero critical system effect to the mutable crit/crew state. */
function applyAeroCrit(system, crits, conditions, crew, crewEvents) {
  switch (system) {
    case 'Sensors': crits.sensors = Math.min(3, (Number(crits.sensors) || 0) + 1); break;
    case 'Engine': crits.engine = Math.min(3, (Number(crits.engine) || 0) + 1); break;
    case 'Avionics': crits.avionics = Math.min(3, (Number(crits.avionics) || 0) + 1); break;
    case 'FCS': crits.fcs = Math.min(3, (Number(crits.fcs) || 0) + 1); break;
    case 'Gear': crits.landingGear = true; break;
    case 'Life Support': crits.lifeSupport = true; break;
    case 'Control': conditions.outOfControl = true; break;
    case 'Crew': crewEvents.push(CREW_DAMAGE.pilotHit); break; // hit ladder + consciousness after the loop
    default: break; // Weapon / Heat Sink / Fuel / Bomb / Thruster / Door / Cargo / Docking Collar / K-F Boom — reported only
  }
}

/**
 * Resolve a full attack against an Aerospace Fighter or Small Craft: per damage
 * group roll hit location, apply damage to the struck facing's armor then to
 * Structural Integrity, and roll a system critical when the group's damage meets
 * the facing threshold or penetrates to SI. Mutates and saves the target once.
 */
export async function resolveAeroAttack(target, direction, groupSizes, rolls) {
  const armor = foundry.utils.deepClone(target.system.armor || {});
  const si = foundry.utils.deepClone(target.system.structuralIntegrity || { value: 0, max: 0 });
  const crits = foundry.utils.deepClone(target.system.crits || {});
  const conditions = foundry.utils.deepClone(target.system.conditions || {});
  const crew = foundry.utils.deepClone(target.system.crew || {});
  const table = target.type === 'small_craft' ? AERO_HIT_DROPSHIP : AERO_HIT_FIGHTER;
  const col = direction === 'left' || direction === 'right' ? 'side' : direction === 'rear' ? 'aft' : 'nose';

  const groups = [], critResults = [], crewEvents = [];
  let destroyed = false;

  for (const g of groupSizes) {
    const locRoll = await new Roll("2d6").evaluate();
    rolls.push(locRoll);
    const [token, system] = table[col][locRoll.total];
    const facing = resolveAeroFacing(token, direction);
    const slot = armor[facing];

    let remaining = g, siHit = false;
    const threshold = Number(slot?.threshold) || 0;
    if (slot && slot.value > 0) { const a = Math.min(slot.value, remaining); slot.value -= a; remaining -= a; }
    if (remaining > 0) { si.value = Math.max(0, (si.value || 0) - remaining); siHit = true; if (si.value <= 0) destroyed = true; }
    groups.push({ damage: g, facingLabel: AERO_FACING_LABEL[facing] || facing, dice: locRoll.dice[0]?.results?.map(r => r.result) ?? [], siHit });

    // Threshold or SI-penetration critical on the indicated system.
    if ((threshold > 0 && g >= threshold) || siHit) {
      applyAeroCrit(system, crits, conditions, crew, crewEvents);
      critResults.push({ facingLabel: AERO_FACING_LABEL[facing] || facing, system });
    }
  }

  // Crew hits: advance the hit ladder; a sheet-only pilot rolls consciousness,
  // and an unconscious pilot's craft goes out of control.
  const linked = crew.actorId ? game.actors.get(crew.actorId) : null;
  const warriorLines = [];
  for (let i = 0; i < crewEvents.length; i++) {
    warriorLines.push(...await warriorDamage(crew, 1, { linked: !!linked, rolls, source: 'crew hit' }));
  }
  if (!linked && crew.unconscious) conditions.outOfControl = true;

  const applied = await writeDoc(target, { 'system.armor': armor, 'system.structuralIntegrity': si, 'system.crits': crits, 'system.conditions': conditions, 'system.crew': crew });
  if (applied && linked) for (const ev of crewEvents) await applyCrewDamage(linked, ev);

  return { aero: true, applied, hasTarget: true, targetName: target.name, groups, critResults, destroyed, warriorLines };
}

/* ------------------------------------------------------------------ */
/*  Heat phase (Total Warfare Heat Point Table)                         */
/* ------------------------------------------------------------------ */

const HEAT_MOVE = { stationary: 0, walked: 1, ran: 2, jumped: 0 };

/** Full mech heat-scale effects for the end-of-turn report. */
function mechHeatEffects(h) {
  const mp = Math.min(5, Math.floor(h / 5));
  const toHit = [8, 13, 17, 24].filter(t => h >= t).length;
  const pick = (rows) => { let hit = null; for (const r of rows) if (h >= r.at) hit = r; return hit; };
  const sd = pick([{ at: 14, text: 'avoid 4+' }, { at: 18, text: 'avoid 6+' }, { at: 22, text: 'avoid 8+' }, { at: 26, text: 'avoid 10+' }, { at: 30, text: 'automatic' }]);
  const ammo = pick([{ at: 19, text: 'avoid 4+' }, { at: 23, text: 'avoid 6+' }, { at: 28, text: 'avoid 8+' }]);
  return { mp, toHit, shutdown: sd?.text || '—', ammo: ammo?.text || '—', auto: h >= 30 };
}

/**
 * End-of-turn heat resolution for a mech: prompt for this turn's heat sources,
 * net them against heat-sink dissipation, update system.heat, auto-shutdown at
 * 30+, and post a breakdown card. Heat Point Table (Total Warfare p. 159).
 */
export async function resolveMechHeat(actor) {
  if (!actor) return;
  const sys = actor.system;
  const current = num(sys.heat?.value);
  const sinks = sys.heatSinks || { count: 0, type: 'single' };
  const dissipation = num(sinks.count) * (sinks.type === 'double' ? 2 : 1);
  const engineHits = num(sys.systemHits?.engine);
  const engineHeat = engineHits >= 2 ? 10 : engineHits === 1 ? 5 : 0;
  // Only weapons actually fired this turn (via their Attack buttons) generate heat.
  const fired = firedThisTurn(actor);
  const firedCount = Object.keys(fired).length;
  const weaponsHeatTotal = Object.values(fired).reduce((s, h) => s + num(h), 0);

  // Movement defaults to this turn's record (token moves / the sheet's selector).
  const moved = movedThisTurn(actor);
  const stands = standsThisTurn(actor);
  const moveOpts = [['stationary', 'Stationary'], ['walked', 'Walked (+1)'], ['ran', 'Ran (+2)'], ['jumped', 'Jumped (+1/hex, min 3)']]
    .map(([k, l]) => `<option value="${k}"${k === moved.mode ? ' selected' : ''}>${l}</option>`).join('');

  const content = `
    <div class="tw-attack-dialog">
      <div class="form-group"><label>Movement</label><select name="move">${moveOpts}</select></div>
      <div class="form-group"><label>Jump hexes</label><input type="number" name="hexes" value="${moved.mode === 'jumped' ? moved.hexes : 0}" /></div>
      <div class="form-group"><label>Stand attempts</label><input type="number" name="stand" value="${stands}" /></div>
      <div class="form-group"><label>Weapons heat <span class="tw-hint">${firedCount} fired this turn</span></label><input type="number" name="weapons" value="${weaponsHeatTotal}" /></div>
      <div class="form-group"><label>Engine-hit heat</label><input type="number" name="engine" value="${engineHeat}" /></div>
      <div class="form-group"><label>Heat-sink dissipation</label><input type="number" name="sinks" value="${dissipation}" /></div>
    </div>`;

  const r = await DialogV2.wait({
    window: { title: "Resolve Heat", icon: "fa-solid fa-fire" },
    content,
    buttons: [
      {
        action: "resolve", label: "Resolve", icon: "fa-solid fa-fire", default: true,
        callback: (ev, b) => ({
          move: b.form.elements.move.value,
          hexes: num(b.form.elements.hexes.value),
          stand: num(b.form.elements.stand.value),
          weapons: num(b.form.elements.weapons.value),
          engine: num(b.form.elements.engine.value),
          sinks: num(b.form.elements.sinks.value)
        })
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!r || r === "cancel") return;

  const moveHeat = r.move === 'jumped' ? Math.max(3, r.hexes) : (HEAT_MOVE[r.move] || 0);
  const standHeat = Math.max(0, r.stand);
  const gain = moveHeat + standHeat + r.weapons + r.engine;
  const newHeat = Math.max(0, current + gain - r.sinks);
  const effects = mechHeatEffects(newHeat);

  beginRecording();
  // Shutdown: automatic at 30+, otherwise an avoid roll from 14+ (Heat Scale).
  // A reactor shutdown forces a Piloting Skill Roll at +3 that phase. A 'Mech
  // already shut down tries to restart instead: automatic below 14 heat,
  // otherwise a roll against the same avoid number (never at 30+, and not
  // with an unconscious warrior).
  const heatRolls = [];
  let shutdownCheck = null, shutsDown = false, startupCheck = null, restarts = false;
  const avoidAt = (h) => [[26, 10], [22, 8], [18, 6], [14, 4]].find(([t]) => h >= t)?.[1] ?? null;
  if (sys.conditions?.shutdown) {
    if (num(sys.systemHits?.engine) >= 3) startupCheck = { text: 'engine destroyed — cannot restart' };
    else if (pilotUnconscious(actor)) startupCheck = { text: 'warrior unconscious — cannot restart' };
    else if (newHeat >= 30) startupCheck = { text: 'heat 30+ — stays shut down' };
    else if (newHeat < 14) { restarts = true; startupCheck = { text: 'heat below 14 — restarts automatically' }; }
    else {
      const need = avoidAt(newHeat);
      const sr = await new Roll("2d6").evaluate();
      heatRolls.push(sr);
      restarts = sr.total >= need;
      startupCheck = { text: `startup roll ${sr.total} vs ${need}+: ${restarts ? 'restarts' : 'stays shut down'}` };
    }
  } else {
    if (effects.auto) shutsDown = true;
    else if (newHeat >= 14) {
      const avoid = avoidAt(newHeat);
      const sr = await new Roll("2d6").evaluate();
      heatRolls.push(sr);
      shutsDown = sr.total < avoid;
      shutdownCheck = { total: sr.total, avoid, shutsDown };
    }
  }

  // Heat is resolved: this turn's fired-weapon record is spent.
  const update = { 'system.heat.value': newHeat, 'flags.mech-foundry.fired': { key: currentTurnKey(), list: [] } };
  let psrNote = '';
  if (shutsDown) {
    update['system.conditions.shutdown'] = true;
    if (!sys.conditions?.prone) {
      update['flags.mech-foundry.psr'] = queuePSR(actor, [{ key: 'shutdown', label: 'Reactor shut down', mod: 3 }]);
      psrNote = 'Piloting Skill Roll required (reactor shut down, +3) — roll it from the sheet';
    }
  }
  if (restarts) update['system.conditions.shutdown'] = false;
  if (actor.isOwner || game.user.isGM) await writeDoc(actor, update);

  // Ammunition explosion avoid roll at 19+ (4+ / 6+ at 23 / 8+ at 28): on a
  // failure the bin that would do the most damage explodes.
  let ammoCheck = null, ammoFrag = null;
  if (newHeat >= 19) {
    const need = newHeat >= 28 ? 8 : newHeat >= 23 ? 6 : 4;
    const bins = [];
    for (const [loc, slots] of Object.entries(sys.critSlots || {})) {
      (slots || []).forEach((slot, index) => {
        if (slot?.type !== 'ammo' || slot.hit) return;
        const ex = ammoExplosionDamage(slot, sys.weapons || []);
        if (ex?.damage > 0) bins.push({ loc, index, damage: ex.damage, name: slot.name });
      });
    }
    if (bins.length) {
      const ar = await new Roll("2d6").evaluate();
      heatRolls.push(ar);
      const explodes = ar.total < need;
      ammoCheck = { total: ar.total, avoid: need, explodes };
      if (explodes) {
        const bin = bins.sort((a, b) => b.damage - a.damage)[0];
        ammoFrag = await resolveDamageAgainst(actor, 'front', [], heatRolls, actor.name, { explode: { loc: bin.loc, index: bin.index } });
      }
    } else ammoCheck = { none: true };
  }

  // Overheating with Life Support damaged injures the warrior: 1 point at 15+,
  // 2 at 25+ (hit ladder + consciousness); a linked pilot also takes the AToW
  // damage from the MechWarrior/Pilot/Crew Damage Table (0E/2D*, 0E/4D*).
  let pilotDamage = '';
  let warriorLines = [];
  if (num(sys.systemHits?.lifeSupport) > 0 && newHeat >= 15) {
    const ev = newHeat >= 25 ? CREW_DAMAGE.overheat25 : CREW_DAMAGE.overheat15;
    const linked = sys.pilot?.actorId ? game.actors.get(sys.pilot.actorId) : null;
    const crew = foundry.utils.deepClone(actor.system.pilot || {}); // fresh: an ammo explosion may have hurt them
    warriorLines = await warriorDamage(crew, newHeat >= 25 ? 2 : 1, { linked: !!linked, rolls: heatRolls, source: 'life support' });
    await writeDoc(actor, { 'system.pilot': crew });
    if (linked) {
      pilotDamage = (await applyCrewDamage(linked, ev)) ? `${linked.name} takes ${ev.bd} damage (${ev.label})`
        : `${linked.name} takes ${ev.bd} damage (${ev.label}) — apply manually`;
    }
  }

  const lines = [
    { label: 'Start of turn', value: current },
    { label: r.move === 'jumped' ? `Jump (${r.hexes} hex)` : `Movement (${r.move})`, value: moveHeat },
    { label: 'Stand attempts', value: standHeat },
    { label: 'Weapons fire', value: r.weapons },
    { label: 'Engine hits', value: r.engine },
    { label: 'Heat sinks', value: -r.sinks }
  ].filter(l => l.value !== 0 || l.label === 'Start of turn');

  const cardContent = await foundry.applications.handlebars.renderTemplate(
    "systems/mech-foundry/templates/chat/tw-heat.hbs",
    { lines, newHeat, effects, autoShutdown: effects.auto && shutsDown, shutdownCheck, startupCheck, restarts, ammoCheck, ammoFrag, psrNote, pilotDamage, warriorLines }
  );
  await ChatMessage.create({
    flags: { 'mech-foundry': endRecording() },
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: "Heat Phase",
    content: cardContent,
    rolls: heatRolls
  });
}

/**
 * Apply an already-grouped damage total to a target of any unit type, rolling
 * the appropriate hit-location / motive / critical tables. Returns a chat-card
 * fragment (without the cluster/total wrapper the caller adds).
 */
export async function resolveDamageAgainst(targetActor, direction, groupSizes, rolls, targetName = '', {
  noPSR = false, locationRoller = null, extraPSR = [], forceMotive = false, partialCover = false, explode = null
} = {}) {
  const tt = targetActor?.type;
  if (tt === 'mech') {
    const groups = [];
    const critChecks = [];
    const critSlots = foundry.utils.deepClone(targetActor.system.critSlots || {});
    const systemHits = foundry.utils.deepClone(targetActor.system.systemHits || {});
    const heatSinks = foundry.utils.deepClone(targetActor.system.heatSinks || { count: 0, type: 'single' });
    const weapons = foundry.utils.deepClone(targetActor.system.weapons || []);
    const crew = foundry.utils.deepClone(targetActor.system.pilot || {});
    // All damage for this attack accumulates here and is saved in one write.
    const dmgState = {
      armor: foundry.utils.deepClone(targetActor.system.armor || {}),
      structure: foundry.utils.deepClone(targetActor.system.structure || {})
    };
    const state = { destroyed: false, pilotUnconscious: false };
    const newCrits = [];   // actuator crits this attack (leg ones trigger PSRs)
    let headHits = 0;      // every hit on the head injures the warrior
    const explosions = []; // struck ammunition bins, exploded after the crits: { loc, slot }
    const explosionLines = [];
    let explosionCount = 0;
    let totalDamage = groupSizes.reduce((a, b) => a + b, 0);
    const ensureSlots = (loc) => {
      if (!Array.isArray(critSlots[loc]) || critSlots[loc].length === 0) critSlots[loc] = standardMechSlots()[loc];
      return critSlots[loc];
    };

    // Determining Critical Hits for each location whose structure was struck.
    const critCheck = async (checkLocs) => {
      for (const cl of checkLocs) {
        const cc = await rollDeterminingCrit(cl);
        rolls.push(cc.roll);
        if (cc.blowOff) {
          if (blowOffLocationState(dmgState, cl)) state.destroyed = true;
          critChecks.push({ locLabel: MECH_LOC_LABEL[cl] || cl, total: cc.total, text: cc.text, slots: [] });
          continue;
        }
        if (cc.count > 0) {
          const slots = ensureSlots(cl);
          const slotResults = [];
          for (let i = 0; i < cc.count; i++) {
            const idx = await rollCritSlotIndex(slots.length, rolls);
            const slot = slots[idx - 1];
            if (!slot || slot.type === 'empty') { slotResults.push({ index: idx, text: 'no critical (empty slot)' }); continue; }
            if (slot.hit) { slotResults.push({ index: idx, text: `${slot.name || slot.type} (already destroyed)` }); continue; }
            slot.hit = true;
            if (slot.type === 'actuator') newCrits.push({ loc: cl, name: slot.name });
            if (slot.type === 'ammo') explosions.push({ loc: cl, slot });
            slotResults.push({ index: idx, text: applyMechCritSlotEffect(slot, systemHits, heatSinks, weapons, crew, state) });
          }
          critChecks.push({ locLabel: MECH_LOC_LABEL[cl] || cl, total: cc.total, text: cc.text, slots: slotResults });
        }
      }
    };

    for (const g of groupSizes) {
      const locRoll = locationRoller ? await locationRoller(direction) : await rollMechLocation(direction);
      rolls.push(locRoll.roll);
      // Partial cover: leg hits strike the cover instead.
      if (partialCover && (locRoll.loc === 'll' || locRoll.loc === 'rl')) {
        groups.push({ damage: g, locLabel: `${locRoll.label} — hits the cover`, locDice: locRoll.dice, crit: false, events: [], covered: true });
        totalDamage -= g;
        continue;
      }
      if (locRoll.loc === 'head') headHits++;
      const dmg = applyMechDamageToState(dmgState, locRoll.loc, g, { rear: locRoll.rear });
      groups.push({
        damage: g, locLabel: locRoll.label + (locRoll.rear ? ' (rear)' : ''),
        locDice: locRoll.dice, crit: locRoll.crit,
        events: dmg.events, destroyed: dmg.destroyed, overflow: dmg.overflow
      });
      const checkLocs = new Set(dmg.structureHits);
      if (locRoll.crit) checkLocs.add(locRoll.loc);
      await critCheck(checkLocs);
    }

    // A heat-induced explosion names its bin up front.
    if (explode) {
      const slot = ensureSlots(explode.loc)[explode.index];
      if (slot && !slot.hit) { slot.hit = true; explosions.push({ loc: explode.loc, slot }); }
    }

    // Ammunition explosions: the bin's shots × damage per shot, straight into the
    // location's internal structure, transferring onward unless CASE contains it.
    // Their structure damage can cause further criticals (and further explosions).
    let guard = 0;
    while (explosions.length && guard++ < 20) {
      const { loc, slot } = explosions.shift();
      const ex = ammoExplosionDamage(slot, weapons);
      const where = MECH_LOC_LABEL[loc] || loc;
      if (!ex) { explosionLines.push(`${slot.name || 'Ammunition'} (${where}): not linked to a weapon — resolve the explosion manually`); continue; }
      if (ex.damage <= 0) { explosionLines.push(`${slot.name || 'Ammunition'} (${where}): bin empty — no explosion`); continue; }
      ex.weapon.ammo = Math.max(0, num(ex.weapon.ammo) - ex.shots);
      explosionCount++;
      totalDamage += ex.damage;
      const contained = (critSlots[loc] || []).some(x => x.type === 'case');
      const res = applyMechDamageToState(dmgState, loc, ex.damage, { internal: true, contain: contained });
      explosionLines.push(`AMMUNITION EXPLOSION — ${slot.name || ex.weapon.ammoType} (${where}): ${ex.shots} shot${ex.shots === 1 ? '' : 's'} × ${ex.perShot} = ${ex.damage} internal damage`);
      for (const ev of res.events) explosionLines.push(ev);
      if (res.vented) explosionLines.push(`CASE vents the remaining ${res.vented}`);
      if (res.destroyed) state.destroyed = true;
      await critCheck(new Set(res.structureHits));
    }

    // Warrior damage: 1 per head hit, 2 for an ammunition explosion. A linked
    // pilot takes the matching A Time of War damage after the save.
    const linkedPilot = crew.actorId ? game.actors.get(crew.actorId) : null;
    const crewEvents = [];
    const warriorLines = [];
    for (let i = 0; i < headHits; i++) {
      warriorLines.push(...await warriorDamage(crew, 1, { linked: !!linkedPilot, rolls, source: 'head hit' }));
      if (linkedPilot) crewEvents.push(CREW_DAMAGE.pilotHit);
    }
    for (let i = 0; i < explosionCount; i++) {
      warriorLines.push(...await warriorDamage(crew, 2, { linked: !!linkedPilot, rolls, source: 'ammo explosion' }));
      if (linkedPilot) crewEvents.push(CREW_DAMAGE.ammoExplosion);
    }

    // Piloting Skill Rolls this damage forces (queued on the target, rolled from its sheet).
    let psr = { updates: {}, reasons: [] };
    if (!noPSR && !state.destroyed) {
      psr = damagePSRUpdate(targetActor, { structure: dmgState.structure, systemHits }, newCrits, totalDamage, extraPSR);
    }

    const applied = await writeDoc(targetActor, {
      'system.armor': dmgState.armor, 'system.structure': dmgState.structure,
      'system.critSlots': critSlots, 'system.systemHits': systemHits,
      'system.heatSinks': heatSinks, 'system.weapons': weapons, 'system.pilot': crew,
      ...psr.updates
    });
    if (applied && linkedPilot) for (const ev of crewEvents) await applyCrewDamage(linkedPilot, ev);
    // Cockpit crit: knock a linked pilot unconscious (same pattern the system
    // uses when fatigue drops a character).
    let pilotNote = '';
    if (state.pilotUnconscious) {
      const linked = game.actors.get(crew.actorId);
      if (linked && await writeDoc(linked, { 'system.unconscious': true })) {
        ui.notifications.warn(`${linked.name} has fallen unconscious!`);
        pilotNote = `${linked.name} is unconscious`;
      } else if (linked) {
        pilotNote = `${linked.name} is unconscious — couldn't update them, mark manually`;
      }
    }
    return {
      isMech: true, groups, critChecks, destroyedByCrit: state.destroyed, ammoExplosion: explosionCount > 0, explosionLines, pilotNote,
      warriorLines, psrReasons: psr.reasons.map(r => r.label),
      applied, hasTarget: true, targetName: targetActor.name
    };
  } else if (tt === 'ground_vehicle') {
    return await resolveVehicleAttack(targetActor, direction, groupSizes, rolls, { forceMotive });
  } else if (tt === 'aerospace_fighter' || tt === 'small_craft') {
    return await resolveAeroAttack(targetActor, direction, groupSizes, rolls);
  }
  return {
    isMech: false, groups: groupSizes.map(g => ({ damage: g })),
    applied: false, hasTarget: !!targetActor, targetName: targetActor?.name || targetName
  };
}

/* ------------------------------------------------------------------ */
/*  Weapon fire: to-hit preview, the fire dialog, and resolving shots   */
/* ------------------------------------------------------------------ */

const TWO_D6_WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

/** Chance (whole percent) of rolling tn or better on 2D6. */
export function hitChance(tn) {
  if (tn <= 2) return 100;
  if (tn > 12) return 0;
  let ways = 0;
  for (let t = tn; t <= 12; t++) ways += TWO_D6_WAYS[t];
  return Math.round((ways / 36) * 100);
}

/** Why a weapon can't fire right now, or null. */
export function weaponBlock(actor, weapon) {
  const wName = weapon?.name || 'Weapon';
  if (actor?.system?.conditions?.shutdown) return `${actor.name} is shut down and can't fire.`;
  if (weapon?.destroyed) return `${wName} is destroyed and can't fire.`;
  if (usesAmmo(weapon) && num(weapon.ammo) <= 0) return `${wName} is out of ammunition (set its Rds on the Combat tab to reload).`;
  if (currentTurnKey() && firedThisTurn(actor)[weapon.id] !== undefined) return `${wName} has already fired this turn.`;
  return null;
}

/** Per-weapon data the target-number preview needs (browser and server share previewTN). */
function weaponPreviewRow(actor, weapon, targetActor) {
  const fixed = autoAttackMods(actor, weapon, null).filter(m => m.key === 'actuators').reduce((t, m) => t + m.value, 0);
  return {
    id: weapon.id, fixed,
    s: num(weapon.rangeS ?? weapon.short), m: num(weapon.rangeM ?? weapon.medium),
    l: num(weapon.rangeL ?? weapon.long), e: num(weapon.rangeE ?? weapon.ext),
    min: num(weapon.rangeMin),
    prone: targetActor?.type === 'mech' && !!targetActor.system?.conditions?.prone
  };
}

/**
 * Target number for one weapon from the dialog's shared values.
 * @returns {{tn:number, oor:boolean, bracket:string, chance:number}}
 */
export function previewTN(v, row) {
  const rb = rangeBracket(v.range, { rangeS: row.s, rangeM: row.m, rangeL: row.l, rangeE: row.e });
  let tn = num(v.gunnery) + num(v.autoSum) + num(v.heat) + num(v.other) + num(v.terrain) + row.fixed + rb.mod;
  if (v.range != null && row.min > 0 && v.range <= row.min) tn += row.min - v.range + 1;
  if (row.prone && v.range != null) tn += v.range <= 1 ? -2 : 1;
  return { tn, oor: !rb.inRange, bracket: rb.bracket, chance: rb.inRange ? hitChance(tn) : 0 };
}

/** Sum of the terrain / cover / secondary-target modifiers. */
function terrainSum(t) { return terrainMods(t).reduce((a, m) => a + m.value, 0); }

/**
 * To-hit preview for every weapon against the user's current target, for the
 * weapon rows on the sheet: { weaponId: {text, title, oor} }. Terrain isn't
 * known here, so it assumes open ground; the fire dialog adds it.
 */
export function weaponToHitPreview(actor) {
  const target = [...(game.user?.targets ?? [])][0] || null;
  const targetActor = target?.actor || null;
  if (!targetActor || targetActor === actor) return {};
  const attackerToken = actor.getActiveTokens?.()[0] || null;
  const range = attackerToken ? measureHexes(attackerToken, target) : null;
  const shared = autoAttackMods(actor, null, targetActor);
  const v = { gunnery: gunneryFor(actor), autoSum: shared.reduce((t, m) => t + m.value, 0), heat: heatToHitMod(actor), range, other: 0, terrain: 0 };
  const out = {};
  for (const w of actor.system.weapons || []) {
    const row = weaponPreviewRow(actor, w, targetActor);
    const p = previewTN(v, row);
    const parts = [`Gunnery ${v.gunnery}`, ...shared.map(m => `${m.label} ${m.value >= 0 ? '+' : ''}${m.value}`)];
    if (row.fixed) parts.push(`Actuators +${row.fixed}`);
    if (v.heat) parts.push(`Heat +${v.heat}`);
    parts.push(range == null ? 'range unknown (no token on the map)' : `Range ${range} (${p.bracket})`);
    out[w.id] = p.oor
      ? { text: 'OOR', oor: true, title: `Out of range vs ${target.name} (${range} hexes)` }
      : { text: `${p.tn}+`, oor: false, title: `vs ${target.name}: needs ${p.tn}+ (${p.chance}%) · ${parts.join(' · ')} · terrain not included` };
  }
  return out;
}

/**
 * Open the GATOR to-hit dialog for one weapon (a fire group of one).
 * @param {Actor} actor   The attacking unit.
 * @param {object} weapon The weapon entry from the actor's system.weapons.
 */
export async function weaponAttack(actor, weapon) {
  if (!actor || !weapon) return;
  return fireWeapons(actor, [weapon.id]);
}

/**
 * The fire dialog: shared modifiers once, a checklist of the weapons able to
 * fire with each one's live target number, then every checked weapon is rolled
 * and resolved in turn and posted as one chat card. Total Warfare declares all
 * of a unit's shots together; this is that declaration.
 * @param {Actor} actor
 * @param {string[]} preselect  weapon ids checked when the dialog opens
 */
export async function fireWeapons(actor, preselect = []) {
  if (!actor) return;
  const all = actor.system.weapons || [];
  if (preselect.length === 1) {
    const why = weaponBlock(actor, all.find(w => w.id === preselect[0]));
    if (why) { ui.notifications.warn(why); return; }
  }
  if (actor.system?.conditions?.shutdown) { ui.notifications.warn(`${actor.name} is shut down and can't fire.`); return; }
  const ready = all.filter(w => !weaponBlock(actor, w));
  if (!ready.length) { ui.notifications.warn(`${actor.name} has no weapons able to fire.`); return; }

  const gunnery = gunneryFor(actor);
  const heatMod = heatToHitMod(actor);
  const attackerToken = actor.getActiveTokens?.()[0] || null;
  const target = [...(game.user?.targets ?? [])][0] || null;
  const targetName = target?.name || '';
  const targetActor = target?.actor || null;
  const autoDist = attackerToken && target ? measureHexes(attackerToken, target) : null;
  const shared = autoAttackMods(actor, null, targetActor);
  const rows = ready.map(w => weaponPreviewRow(actor, w, targetActor));

  const esc = (t) => foundry.utils.escapeHTML?.(String(t)) ?? String(t);
  const dirOpts = ATTACK_DIRECTIONS.map(d => `<option value="${d.key}">${d.label}</option>`).join('');
  const modRows = shared.map(x => `
      <div class="form-group"><label>${esc(x.label)}${x.hint ? ` <span class="tw-hint">${esc(x.hint)}</span>` : ''}</label><input type="number" name="auto_${x.key}" value="${x.value}" /></div>`).join('');
  const v0 = { gunnery, autoSum: shared.reduce((t, m) => t + m.value, 0), heat: heatMod, range: autoDist, other: 0, terrain: 0 };
  const weaponRows = ready.map((w, i) => {
    const p = previewTN(v0, rows[i]);
    const r = rows[i];
    const ranges = `${r.min ? `Min ${r.min} · ` : ''}${r.s}/${r.m}/${r.l}${r.e ? `/${r.e}` : ''}`;
    return `<tr>
        <td><input type="checkbox" name="w_${w.id}" ${preselect.includes(w.id) ? 'checked' : ''} /></td>
        <td class="tw-fw-name">${esc(w.name || 'Weapon')}<span class="tw-hint">${esc(w.location || w.arc || '')} · ${ranges}${usesAmmo(w) ? ` · ${num(w.ammo)} rds` : ''}</span></td>
        <td class="tw-fw-heat">${num(w.heat) ? `${num(w.heat)}H` : ''}</td>
        <td class="tw-fw-tn" data-wid="${w.id}">${p.oor ? 'OOR' : `${p.tn}+ <span class="tw-hint">${p.chance}%</span>`}</td>
      </tr>`;
  }).join('');

  const content = `
    <div class="tw-attack-dialog tw-fire-dialog">
      <p class="tw-atk-target">${targetName ? `Target: <strong>${esc(targetName)}</strong>` : 'No target selected — enter range manually.'}</p>
      <table class="tw-fire-weapons"><thead><tr><th></th><th>Weapon</th><th>Heat</th><th>To-hit</th></tr></thead><tbody>${weaponRows}</tbody></table>
      <p class="tw-fire-heat">Heat from checked weapons: <strong class="tw-fire-heatsum">${ready.filter(w => preselect.includes(w.id)).reduce((t, w) => t + num(w.heat), 0)}</strong></p>
      <div class="form-group"><label>Gunnery Skill</label><input type="number" name="gunnery" value="${gunnery}" /></div>
      <div class="form-group"><label>Range (hexes)</label><input type="number" name="range" value="${autoDist ?? ''}" /></div>
      ${modRows}
      <div class="form-group"><label>Heat</label><input type="number" name="heat" value="${heatMod}" /></div>
      <fieldset class="tw-terrain"><legend>Terrain &amp; target</legend>
        <div class="form-group"><label>Light woods hexes between</label><input type="number" name="lightWoods" value="0" min="0" /></div>
        <div class="form-group"><label>Heavy woods hexes between</label><input type="number" name="heavyWoods" value="0" min="0" /></div>
        <div class="form-group"><label>Target standing in</label><select name="targetWoods"><option value="none">Open</option><option value="light">Light woods (+1)</option><option value="heavy">Heavy woods (+2)</option></select></div>
        <div class="form-group"><label>Partial cover (+1; leg hits strike the cover)</label><input type="checkbox" name="partialCover" /></div>
        <div class="form-group"><label>Secondary target</label><select name="secondary"><option value="none">No (primary)</option><option value="front">Yes, front arc (+1)</option><option value="side">Yes, side/rear arc (+2)</option></select></div>
      </fieldset>
      <div class="form-group"><label>Other Mod</label><input type="number" name="other" value="0" /></div>
      <div class="form-group"><label>Attack Direction</label><select name="direction">${dirOpts}</select></div>
    </div>`;

  const read = (f) => ({
    gunnery: num(f.gunnery.value),
    auto: shared.map(x => ({ label: x.label, value: num(f[`auto_${x.key}`]?.value) })),
    range: f.range.value === '' ? null : num(f.range.value),
    heat: num(f.heat.value),
    terrain: {
      lightWoods: Math.max(0, num(f.lightWoods.value)),
      heavyWoods: Math.max(0, num(f.heavyWoods.value)),
      targetWoods: f.targetWoods.value,
      partialCover: !!f.partialCover.checked,
      secondary: f.secondary.value
    },
    other: num(f.other.value),
    direction: f.direction.value,
    ids: ready.filter(w => f[`w_${w.id}`]?.checked).map(w => w.id)
  });

  // Live preview: recompute every weapon's target number (and the checked
  // weapons' heat) as the form changes. Best-effort; the static values above
  // stand if the dialog doesn't expose its element.
  const wire = (root) => {
    const form = root?.querySelector?.('form') ?? root;
    if (!form?.querySelectorAll) return;
    const refresh = () => {
      const r = read(form.elements);
      const v = { gunnery: r.gunnery, autoSum: r.auto.reduce((t, m) => t + m.value, 0), heat: r.heat, range: r.range, other: r.other, terrain: terrainSum(r.terrain) };
      rows.forEach(row => {
        const cell = form.querySelector(`.tw-fw-tn[data-wid="${row.id}"]`);
        if (!cell) return;
        const p = previewTN(v, row);
        cell.innerHTML = p.oor ? 'OOR' : `${p.tn}+ <span class="tw-hint">${p.chance}%</span>`;
      });
      const heat = ready.filter(w => r.ids.includes(w.id)).reduce((t, w) => t + num(w.heat), 0);
      const hs = form.querySelector('.tw-fire-heatsum');
      if (hs) hs.textContent = String(heat);
    };
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    refresh();
  };

  const result = await DialogV2.wait({
    window: { title: `Fire Weapons — ${actor.name}`, icon: "fa-solid fa-crosshairs" },
    content,
    render: (event, dialog) => wire(dialog?.element ?? event?.target?.element ?? (dialog instanceof HTMLElement ? dialog : null)),
    buttons: [
      { action: "roll", label: "Fire", icon: "fa-solid fa-dice", default: true, callback: (ev, button) => read(button.form.elements) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return;
  const ids = result.ids ?? preselect;
  if (!ids.length) { ui.notifications.info("No weapons checked."); return; }

  const rolls = [];
  const cards = [];
  beginRecording();
  for (const id of ids) {
    const weapon = (actor.system.weapons || []).find(w => w.id === id);
    if (!weapon || weaponBlock(actor, weapon)) continue;
    const ctx = await resolveWeaponShot(actor, weapon, target, result, rolls);
    cards.push(await foundry.applications.handlebars.renderTemplate("systems/mech-foundry/templates/chat/tw-attack.hbs", ctx));
  }
  const recorded = endRecording();
  if (!cards.length) return;
  const names = ids.map(id => all.find(w => w.id === id)?.name || 'Weapon');
  await ChatMessage.create({
    flags: { 'mech-foundry': recorded },
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: cards.length === 1 ? `${names[0]} Attack` : `Weapons Fire — ${cards.length} weapons${targetName ? ` at ${targetName}` : ''}`,
    content: cards.length === 1 ? cards[0] : `<div class="mech-foundry tw-fire-group">${cards.join('')}</div>`,
    rolls
  });
}

/**
 * Roll and resolve one weapon's shot with the fire dialog's values: spends
 * ammunition and records the shot for the heat phase, then on a hit rolls the
 * cluster table and hit locations. Returns the tw-attack.hbs context.
 */
async function resolveWeaponShot(actor, weapon, target, result, rolls) {
  const targetName = target?.name || '';
  const targetActor = target?.actor || null;
  const rb = rangeBracket(result.range, weapon);
  const actuators = autoAttackMods(actor, weapon, null).filter(m => m.key === 'actuators').map(m => ({ label: m.label, value: m.value }));
  const mods = [
    { label: "Gunnery", value: result.gunnery },
    ...(result.auto || []),
    ...actuators,
    { label: `Range (${rb.bracket})`, value: rb.mod },
    ...rangeDependentMods(weapon, targetActor, result.range),
    { label: "Heat", value: result.heat },
    ...terrainMods(result.terrain),
    { label: "Other", value: result.other }
  ].filter(m => m.value !== 0 || m.label === "Gunnery");
  const tn = mods.reduce((t, x) => t + x.value, 0);

  const roll = await new Roll("2d6").evaluate();
  rolls.push(roll);
  const dice = roll.dice[0]?.results?.map(r => r.result) ?? [];
  const hit = rb.inRange && roll.total >= tn;
  const margin = roll.total - tn;

  // The weapon fired (an out-of-range shot can't be declared, so it doesn't
  // count): spend one shot of ammunition and record it for the heat phase.
  let ammoLine = null;
  if (rb.inRange) {
    const upd = {};
    if (usesAmmo(weapon)) {
      const weapons = foundry.utils.deepClone(actor.system.weapons || []);
      const w = weapons.find(x => x.id === weapon.id);
      if (w) {
        const before = num(w.ammo);
        w.ammo = Math.max(0, before - 1);
        ammoLine = `${w.ammoType}: ${before} → ${w.ammo} shots left`;
        upd['system.weapons'] = weapons;
      }
    }
    const list = Object.entries(firedThisTurn(actor)).map(([id, heat]) => ({ id, heat }));
    list.push({ id: weapon.id, heat: num(weapon.heat) });
    upd['flags.mech-foundry.fired'] = { key: currentTurnKey(), list };
    if (actor.isOwner || game.user.isGM) await writeDoc(actor, upd);
  }

  // On a hit: cluster weapons roll the Cluster Hits Table for the number of
  // sub-munitions, then group damage by the weapon's type (5-point groups or
  // each missile); each group rolls its own hit location.
  let hitResult = null;
  const perHit = num(weapon.damage);
  const clusterSize = num(weapon.clusterSize);
  if (hit && perHit > 0) {
    let clusterInfo = null;
    let total = perHit;
    if (clusterSize > 0) {
      const cRoll = await new Roll("2d6").evaluate();
      rolls.push(cRoll);
      const missiles = clusterHits(clusterSize, cRoll.total);
      total = missiles * perHit;
      clusterInfo = { size: clusterSize, missiles, perHit, total, rollTotal: cRoll.total, dice: cRoll.dice[0]?.results?.map(r => r.result) ?? [] };
    }
    const groupSizes = clusterSize > 0 ? groupDamage(total, clusterGroupSize(weapon)) : [total];
    const frag = await resolveDamageAgainst(targetActor, result.direction, groupSizes, rolls, targetName, {
      partialCover: !!result.terrain?.partialCover && targetActor?.type === 'mech'
    });
    hitResult = { cluster: clusterSize > 0, clusterInfo, total, ...frag };
  }

  return {
    weaponName: weapon.name || 'Weapon',
    location: weapon.location || weapon.arc || '',
    targetName, mods, tn, dice, rollTotal: roll.total,
    hit, margin: Math.abs(margin), outOfRange: !rb.inRange,
    damage: perHit, ammoLine, hitResult
  };
}

/* ------------------------------------------------------------------ */
/*  Area-effect attacks via Scene Regions (v14; MeasuredTemplate gone)  */
/* ------------------------------------------------------------------ */

/**
 * Fire an area attack centred on the targeted (or selected) token: prompt for
 * damage / radius, drop a circular Scene Region for the blast, and apply damage
 * to every unit whose token centre falls inside it. GM tool.
 */
export async function areaAttack() {
  const anchor = [...(game.user?.targets ?? [])][0] || canvas.tokens?.controlled?.[0];
  if (!anchor) { ui.notifications.warn("Target or select a token to mark the blast centre."); return; }

  const r = await DialogV2.wait({
    window: { title: "Area Attack", icon: "fa-solid fa-burst" },
    content: `
      <div class="tw-attack-dialog">
        <p class="tw-atk-target">Blast centred on <strong>${foundry.utils.escapeHTML?.(anchor.name) ?? anchor.name}</strong></p>
        <div class="form-group"><label>Damage (per unit)</label><input type="number" name="damage" value="5" /></div>
        <div class="form-group"><label>Radius (hexes)</label><input type="number" name="radius" value="1" /></div>
        <div class="form-group"><label>Cluster size (0 = direct)</label><input type="number" name="cluster" value="0" /></div>
      </div>`,
    buttons: [
      { action: "fire", label: "Fire", icon: "fa-solid fa-burst", default: true, callback: (e, b) => ({ damage: num(b.form.elements.damage.value), radius: num(b.form.elements.radius.value), cluster: num(b.form.elements.cluster.value) }) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!r || r === "cancel" || r.damage <= 0) return;

  const gridSize = canvas.grid?.size || 100;
  const cx = anchor.center.x, cy = anchor.center.y;
  const radiusPx = (r.radius + 0.5) * gridSize; // include the centre hex

  // Drop a Scene Region to visualise the blast (best-effort; v14 API).
  let region = null;
  try {
    const created = await canvas.scene.createEmbeddedDocuments("Region", [{
      name: `Blast (${r.damage})`,
      color: "#f2a53a",
      shapes: [{ type: "circle", x: cx, y: cy, radius: radiusPx, hole: false }]
    }]);
    region = created?.[0] ?? null;
  } catch (e) { /* region is cosmetic; continue without it */ }

  // Units whose token centre lies within the blast.
  const affected = (canvas.tokens?.placeables ?? []).filter(t => t.actor && Math.hypot(t.center.x - cx, t.center.y - cy) <= radiusPx);

  const rolls = [];
  const lines = [];
  for (const t of affected) {
    const groupSizes = [];
    if (r.cluster > 0) {
      const cRoll = await new Roll("2d6").evaluate(); rolls.push(cRoll);
      let tot = clusterHits(r.cluster, cRoll.total) * r.damage;
      while (tot > 0) { groupSizes.push(Math.min(5, tot)); tot -= 5; }
    } else groupSizes.push(r.damage);
    const frag = await resolveDamageAgainst(t.actor, 'front', groupSizes, rolls, t.name);
    lines.push({ name: t.name, destroyed: !!(frag.destroyed || frag.destroyedByCrit), applied: frag.applied });
  }

  const body = lines.length
    ? lines.map(l => `<div class="tw-hl-event">▸ ${foundry.utils.escapeHTML?.(l.name) ?? l.name}: hit${l.destroyed ? ' — DESTROYED' : ''}${l.applied ? '' : ' (apply manually)'}</div>`).join('')
    : '<div class="tw-atk-dmg">No units in the blast.</div>';
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    flavor: "Area Attack",
    content: `<div class="mech-foundry tw-attack-card"><header class="tw-atk-head"><i class="fas fa-burst"></i> Area Attack — ${r.damage} dmg, radius ${r.radius}</header>${body}</div>`,
    rolls
  });

  return region;
}
