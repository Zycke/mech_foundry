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

const { DialogV2 } = foundry.applications.api;

/** GATOR — attacker movement modifiers (Total Warfare, Attack Modifiers table). */
export const ATTACKER_MOVE_MODS = [
  { key: 'stationary', label: 'Stationary', mod: 0 },
  { key: 'walked', label: 'Walked / Cruised', mod: 1 },
  { key: 'ran', label: 'Ran / Flanked', mod: 2 },
  { key: 'jumped', label: 'Jumped', mod: 3 }
];

const num = (v) => Number(v) || 0;

/** Heat-based to-hit penalty (mech/aero): +1@8, +2@13, +3@17, +4@24. */
export function heatToHitMod(actor) {
  const h = num(actor?.system?.heat?.value);
  return [8, 13, 17, 24].filter(t => h >= t).length;
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
  if (distance == null) return { bracket: '—', mod: 0, inRange: true, unknown: true };
  if (s && distance <= s) return { bracket: 'Short', mod: 0, inRange: true };
  if (m && distance <= m) return { bracket: 'Medium', mod: 2, inRange: true };
  if (l && distance <= l) return { bracket: 'Long', mod: 4, inRange: true };
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

const MECH_LOC_LABEL = {
  head: 'Head', ct: 'Center Torso', lt: 'Left Torso', rt: 'Right Torso',
  la: 'Left Arm', ra: 'Right Arm', ll: 'Left Leg', rl: 'Right Leg'
};

const REAR_ARMOR_KEY = { ct: 'ctRear', lt: 'ltRear', rt: 'rtRear' };

/**
 * Apply a block of damage to a mech, starting at a rolled location and
 * transferring inward through destroyed locations. Mutates and saves the actor.
 * @returns {object} summary for the chat card.
 */
export async function applyMechDamage(target, startLoc, amount, { rear = false } = {}) {
  const armor = foundry.utils.deepClone(target.system.armor || {});
  const structure = foundry.utils.deepClone(target.system.structure || {});
  const events = [];
  const structureHits = [];
  let loc = startLoc;
  let remaining = amount;
  let destroyed = false;
  let useRear = rear;
  let guard = 0;

  while (remaining > 0 && loc && guard++ < 12) {
    // Armor (rear on the initially-struck torso only).
    const rearKey = useRear ? REAR_ARMOR_KEY[loc] : null;
    const armorSlot = rearKey ? armor[rearKey] : armor[loc];
    if (armorSlot && armorSlot.value > 0) {
      const a = Math.min(armorSlot.value, remaining);
      armorSlot.value -= a; remaining -= a;
    }
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
    // Structure is gone (destroyed now or already) and damage remains → transfer.
    if (loc === 'ct') { destroyed = true; loc = null; }
    else { loc = MECH_TRANSFER[loc]; useRear = false; }
  }

  const update = { 'system.armor': armor, 'system.structure': structure };
  const applied = (target.isOwner || game.user.isGM);
  if (applied) await target.update(update);

  return {
    applied, destroyed,
    startLabel: MECH_LOC_LABEL[startLoc] || startLoc,
    events, structureHits,
    overflow: remaining > 0 && !destroyed ? remaining : 0
  };
}

/** Zero a mech location's armor + structure (limb/head blown off). Returns true if the head. */
export async function blowOffMechLocation(target, loc) {
  const armor = foundry.utils.deepClone(target.system.armor || {});
  const structure = foundry.utils.deepClone(target.system.structure || {});
  if (armor[loc]) armor[loc].value = 0;
  const rearKey = REAR_ARMOR_KEY[loc];
  if (rearKey && armor[rearKey]) armor[rearKey].value = 0;
  if (structure[loc]) structure[loc].value = 0;
  if (target.isOwner || game.user.isGM) await target.update({ 'system.armor': armor, 'system.structure': structure });
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
      state.destroyed = true; state.pilotKilled = true;
      crew.hits = 6;
      return 'Cockpit — PILOT KILLED';
    case 'actuator': return `${slot.name || 'Actuator'} destroyed`;
    case 'weapon': {
      const w = weapons.find(x => !x.destroyed && slot.name && x.name === slot.name);
      if (w) w.destroyed = true;
      return `${slot.name || 'Weapon'} destroyed`;
    }
    case 'ammo': state.ammo = true; return `${slot.name || 'Ammunition'} — EXPLOSION (resolve)`;
    case 'heatSink': heatSinks.count = Math.max(0, (Number(heatSinks.count) || 0) - 1); return 'Heat Sink destroyed';
    default: return `${slot.name || 'Equipment'} destroyed`;
  }
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
  7:  [1, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 18, 24],
  8:  [2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 24],
  9:  [2, 2, 3, 4, 5, 5, 6, 6, 7, 8, 9, 10, 11, 11, 12, 13, 14, 14, 15, 16, 17, 18, 19, 20, 21, 21, 22, 23, 23, 32],
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
function resolveVehicleFacing(token, direction, hasTurret, isVTOL) {
  const attacked = direction === 'left' ? 'left' : direction === 'right' ? 'right' : direction === 'rear' ? 'rear' : 'front';
  if (token === 'side') return direction === 'left' ? 'left' : direction === 'right' ? 'right' : attacked;
  if (token === 'turret') {
    if (isVTOL) return 'rotor';
    if (hasTurret) return 'turret';
    return direction === 'left' ? 'left' : direction === 'right' ? 'right' : direction === 'rear' ? 'rear' : 'front';
  }
  return token; // front/rear/left/right literal
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
export async function resolveVehicleAttack(target, direction, groupSizes, rolls) {
  const armor = foundry.utils.deepClone(target.system.armor || {});
  const structure = foundry.utils.deepClone(target.system.structure || { value: 0, max: 0 });
  const crits = foundry.utils.deepClone(target.system.crits || {});
  const conditions = foundry.utils.deepClone(target.system.conditions || {});
  const crew = foundry.utils.deepClone(target.system.crew || {});
  const isVTOL = target.system.movementType === 'vtol';
  const hasTurret = !!target.system.hasTurret;
  const col = direction === 'left' || direction === 'right' ? 'side' : direction === 'rear' ? 'rear' : 'front';

  const groups = [], motives = [], critResults = [], crewEvents = [];
  let destroyed = false;

  for (const g of groupSizes) {
    const locRoll = await new Roll("2d6").evaluate();
    rolls.push(locRoll);
    const [token, flag] = VEHICLE_HIT_LOCATION[col][locRoll.total];
    const facing = resolveVehicleFacing(token, direction, hasTurret, isVTOL);

    // Damage: armor then single internal structure pool.
    let remaining = g, structureHit = false;
    const slot = armor[facing];
    if (slot && slot.value > 0) { const a = Math.min(slot.value, remaining); slot.value -= a; remaining -= a; }
    if (remaining > 0) { structure.value = Math.max(0, (structure.value || 0) - remaining); structureHit = true; if (structure.value <= 0) destroyed = true; }
    groups.push({ damage: g, facingLabel: VEHICLE_FACING_LABEL[facing] || facing, dice: locRoll.dice[0]?.results?.map(r => r.result) ?? [], structureHit });

    // Motive system damage (†).
    if (flag === 'M') {
      const mRoll = await new Roll("2d6").evaluate();
      rolls.push(mRoll);
      const dirMod = direction === 'rear' ? 1 : (direction === 'left' || direction === 'right') ? 2 : 0;
      const typeMod = MOTIVE_TYPE_MOD[target.system.movementType] ?? 0;
      const eff = motiveEffect(mRoll.total + dirMod + typeMod);
      motives.push({ roll: mRoll.total + dirMod + typeMod, text: eff.text });
      if (eff.level === 4) conditions.immobile = true;
      else if (eff.mp > 0) crits.motiveHits = Math.min(3, (Number(crits.motiveHits) || 0) + eff.mp);
    }

    // Critical hit (2/12, side-8, or structure penetrated).
    if (flag === 'C' || structureHit) {
      const cRoll = await new Roll("2d6").evaluate();
      rolls.push(cRoll);
      const table = isVTOL ? VTOL_VEHICLE_CRITS : GROUND_VEHICLE_CRITS;
      const effect = table[vehicleCritColumn(facing)]?.[cRoll.total] || 'No Critical Hit';
      critResults.push({ facingLabel: VEHICLE_FACING_LABEL[facing] || facing, roll: cRoll.total, effect });
      if (applyVehicleCrit(effect, facing, direction, crits, conditions, structure, crew)) destroyed = true;
      if (['Driver Hit', 'Commander Hit', 'Co-Pilot Hit', 'Pilot Hit'].includes(effect)) crewEvents.push(CREW_DAMAGE.vehicleCrewHit);
      else if (effect === 'Crew Stunned') crewEvents.push(CREW_DAMAGE.vehicleStunned);
      else if (effect === 'Crew Killed') crewEvents.push(CREW_DAMAGE.vehicleKilled);
    }
  }

  const applied = target.isOwner || game.user.isGM;
  if (applied) await target.update({ 'system.armor': armor, 'system.structure': structure, 'system.crits': crits, 'system.conditions': conditions, 'system.crew': crew });

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
    case 'Rotor Damage': crits.motiveHits = Math.min(3, (Number(crits.motiveHits) || 0) + 1); break;
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
    case 'Crew': crew.hits = Math.min(6, (Number(crew.hits) || 0) + 1); crewEvents.push(CREW_DAMAGE.pilotHit); break;
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

  const applied = target.isOwner || game.user.isGM;
  if (applied) await target.update({ 'system.armor': armor, 'system.structuralIntegrity': si, 'system.crits': crits, 'system.conditions': conditions, 'system.crew': crew });
  const linked = crew.actorId ? game.actors.get(crew.actorId) : null;
  if (applied && linked) for (const ev of crewEvents) await applyCrewDamage(linked, ev);

  return { aero: true, applied, hasTarget: true, targetName: target.name, groups, critResults, destroyed };
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
  const weaponsHeatTotal = (sys.weapons || []).reduce((s, w) => s + num(w.heat), 0);

  const moveOpts = [['stationary', 'Stationary'], ['walked', 'Walked (+1)'], ['ran', 'Ran (+2)'], ['jumped', 'Jumped (+1/hex, min 3)']]
    .map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

  const content = `
    <div class="tw-attack-dialog">
      <div class="form-group"><label>Movement</label><select name="move">${moveOpts}</select></div>
      <div class="form-group"><label>Jump hexes</label><input type="number" name="hexes" value="0" /></div>
      <div class="form-group"><label>Stand attempts</label><input type="number" name="stand" value="0" /></div>
      <div class="form-group"><label>Weapons heat</label><input type="number" name="weapons" value="${weaponsHeatTotal}" /></div>
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

  const update = { 'system.heat.value': newHeat };
  if (effects.auto) update['system.conditions.shutdown'] = true;
  if (actor.isOwner || game.user.isGM) await actor.update(update);

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
    { lines, newHeat, effects, autoShutdown: effects.auto }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: "Heat Phase",
    content: cardContent
  });
}

/**
 * Apply an already-grouped damage total to a target of any unit type, rolling
 * the appropriate hit-location / motive / critical tables. Returns a chat-card
 * fragment (without the cluster/total wrapper the caller adds).
 */
export async function resolveDamageAgainst(targetActor, direction, groupSizes, rolls, targetName = '') {
  const tt = targetActor?.type;
  if (tt === 'mech') {
    const groups = [];
    const critChecks = [];
    const critSlots = foundry.utils.deepClone(targetActor.system.critSlots || {});
    const systemHits = foundry.utils.deepClone(targetActor.system.systemHits || {});
    const heatSinks = foundry.utils.deepClone(targetActor.system.heatSinks || { count: 0, type: 'single' });
    const weapons = foundry.utils.deepClone(targetActor.system.weapons || []);
    const crew = foundry.utils.deepClone(targetActor.system.pilot || {});
    const state = { destroyed: false, pilotKilled: false, ammo: false };
    const ensureSlots = (loc) => {
      if (!Array.isArray(critSlots[loc]) || critSlots[loc].length === 0) critSlots[loc] = standardMechSlots()[loc];
      return critSlots[loc];
    };
    for (const g of groupSizes) {
      const locRoll = await rollMechLocation(direction);
      rolls.push(locRoll.roll);
      const dmg = await applyMechDamage(targetActor, locRoll.loc, g, { rear: locRoll.rear });
      groups.push({
        damage: g, locLabel: locRoll.label + (locRoll.rear ? ' (rear)' : ''),
        locDice: locRoll.dice, crit: locRoll.crit,
        events: dmg.events, destroyed: dmg.destroyed, overflow: dmg.overflow
      });
      const checkLocs = new Set(dmg.structureHits);
      if (locRoll.crit) checkLocs.add(locRoll.loc);
      for (const cl of checkLocs) {
        const cc = await rollDeterminingCrit(cl);
        rolls.push(cc.roll);
        if (cc.blowOff) {
          const wasHead = await blowOffMechLocation(targetActor, cl);
          if (wasHead) state.destroyed = true;
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
            slotResults.push({ index: idx, text: applyMechCritSlotEffect(slot, systemHits, heatSinks, weapons, crew, state) });
          }
          critChecks.push({ locLabel: MECH_LOC_LABEL[cl] || cl, total: cc.total, text: cc.text, slots: slotResults });
        }
      }
    }
    if (targetActor.isOwner || game.user.isGM) {
      await targetActor.update({
        'system.critSlots': critSlots, 'system.systemHits': systemHits,
        'system.heatSinks': heatSinks, 'system.weapons': weapons, 'system.pilot': crew
      });
    }
    return {
      isMech: true, groups, critChecks, destroyedByCrit: state.destroyed, ammoExplosion: state.ammo,
      applied: targetActor.isOwner || game.user.isGM, hasTarget: true, targetName: targetActor.name
    };
  } else if (tt === 'ground_vehicle') {
    return await resolveVehicleAttack(targetActor, direction, groupSizes, rolls);
  } else if (tt === 'aerospace_fighter' || tt === 'small_craft') {
    return await resolveAeroAttack(targetActor, direction, groupSizes, rolls);
  }
  return {
    isMech: false, groups: groupSizes.map(g => ({ damage: g })),
    applied: false, hasTarget: !!targetActor, targetName: targetActor?.name || targetName
  };
}

/**
 * Open the GATOR to-hit dialog for a weapon, roll 2d6, and post a chat card.
 * @param {Actor} actor   The attacking unit.
 * @param {object} weapon The weapon entry from the actor's system.weapons.
 */
export async function weaponAttack(actor, weapon) {
  if (!actor || !weapon) return;

  const gunnery = gunneryFor(actor);
  const heatMod = heatToHitMod(actor);
  const attackerToken = actor.getActiveTokens?.()[0] || null;
  const target = [...(game.user?.targets ?? [])][0] || null;
  const targetName = target?.name || '';
  const autoDist = attackerToken && target ? measureHexes(attackerToken, target) : null;

  const moveOpts = ATTACKER_MOVE_MODS
    .map(m => `<option value="${m.mod}">${m.label} (+${m.mod})</option>`).join('');
  const dirOpts = ATTACK_DIRECTIONS.map(d => `<option value="${d.key}">${d.label}</option>`).join('');
  const s = num(weapon.rangeS ?? weapon.short), m = num(weapon.rangeM ?? weapon.medium), l = num(weapon.rangeL ?? weapon.long);
  const rangeHint = `S ${s} / M ${m} / L ${l}`;

  const content = `
    <div class="tw-attack-dialog">
      <p class="tw-atk-target">${targetName ? `Target: <strong>${foundry.utils.escapeHTML?.(targetName) ?? targetName}</strong>` : 'No target selected — enter range manually.'}</p>
      <div class="form-group"><label>Gunnery Skill</label><input type="number" name="gunnery" value="${gunnery}" /></div>
      <div class="form-group"><label>Attacker Movement</label><select name="attackerMove">${moveOpts}</select></div>
      <div class="form-group"><label>Target Movement Mod</label><input type="number" name="targetMove" value="0" /></div>
      <div class="form-group"><label>Range (hexes) <span class="tw-hint">${rangeHint}</span></label><input type="number" name="range" value="${autoDist ?? ''}" /></div>
      <div class="form-group"><label>Heat Mod</label><input type="number" name="heat" value="${heatMod}" /></div>
      <div class="form-group"><label>Other Mod</label><input type="number" name="other" value="0" /></div>
      <div class="form-group"><label>Attack Direction</label><select name="direction">${dirOpts}</select></div>
    </div>`;

  const result = await DialogV2.wait({
    window: { title: `Attack — ${weapon.name || 'Weapon'}`, icon: "fa-solid fa-crosshairs" },
    content,
    buttons: [
      {
        action: "roll", label: "Roll Attack", icon: "fa-solid fa-dice", default: true,
        callback: (ev, button) => {
          const f = button.form.elements;
          return {
            gunnery: num(f.gunnery.value),
            attackerMove: num(f.attackerMove.value),
            targetMove: num(f.targetMove.value),
            range: f.range.value === '' ? null : num(f.range.value),
            heat: num(f.heat.value),
            other: num(f.other.value),
            direction: f.direction.value
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return;

  const rb = rangeBracket(result.range, weapon);
  const tn = result.gunnery + result.attackerMove + result.targetMove + rb.mod + result.heat + result.other;

  const roll = await new Roll("2d6").evaluate();
  const dice = roll.dice[0]?.results?.map(r => r.result) ?? [];
  const hit = rb.inRange && roll.total >= tn;
  const margin = roll.total - tn;

  const mods = [
    { label: "Gunnery", value: result.gunnery },
    { label: "Attacker move", value: result.attackerMove },
    { label: "Target move", value: result.targetMove },
    { label: `Range (${rb.bracket})`, value: rb.mod },
    { label: "Heat", value: result.heat },
    { label: "Other", value: result.other }
  ].filter(m => m.value !== 0 || m.label === "Gunnery");

  // On a hit, resolve damage. Cluster weapons (clusterSize > 0) roll the Cluster
  // Hits Table for the number of sub-munitions, then apply damage in 5-point
  // groups, each rolling its own hit location. Direct-fire weapons are one group.
  const rolls = [roll];
  let hitResult = null;
  const targetActor = target?.actor || null;
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
      clusterInfo = {
        size: clusterSize, missiles, perHit, total,
        rollTotal: cRoll.total, dice: cRoll.dice[0]?.results?.map(r => r.result) ?? []
      };
    }

    const groupSizes = [];
    if (clusterSize > 0) { let t = total; while (t > 0) { groupSizes.push(Math.min(5, t)); t -= 5; } }
    else groupSizes.push(total);

    const frag = await resolveDamageAgainst(targetActor, result.direction, groupSizes, rolls, targetName);
    hitResult = { cluster: clusterSize > 0, clusterInfo, total, ...frag };
  }

  const content2 = await foundry.applications.handlebars.renderTemplate(
    "systems/mech-foundry/templates/chat/tw-attack.hbs",
    {
      weaponName: weapon.name || 'Weapon',
      location: weapon.location || weapon.arc || '',
      targetName,
      mods, tn,
      dice, rollTotal: roll.total,
      hit, margin: Math.abs(margin),
      outOfRange: !rb.inRange,
      damage,
      hitResult
    }
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${weapon.name || 'Weapon'} Attack`,
    content: content2,
    rolls
  });
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
