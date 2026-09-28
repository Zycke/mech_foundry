/**
 * Infantry rules (Total Warfare, Infantry pp. 213–229): battle armor units and
 * conventional infantry platoons. Each actor is a whole unit — a battle armor
 * Squad / Point of 1–6 troopers with individual damage tracks, or a platoon
 * counted in troopers.
 *
 * Battle armor
 *  - Organization: Inner Sphere 4, Clan 5, ComStar / Word of Blake 6 troopers.
 *  - Each trooper's damage capacity is its Armor Value + 1 (the soldier).
 *  - Attacks against battle armor: +1 to hit for non-infantry attackers; each
 *    damage group strikes a random live trooper (1D6, re-rolled when invalid);
 *    excess damage from a group is wasted; area-effect damage hits every trooper.
 *  - Its attacks: all troopers fire the same weapon. Non-missile weapons roll
 *    the Cluster Hits Table for the number of live troopers (one trooper always
 *    hits); missiles roll it for troopers × launcher size (split over the fewest
 *    columns); anti-personnel weapons use the Rifle, Ballistic column of the
 *    Generic Conventional Infantry Damage Table. Each hit rolls its own location.
 */
import { currentTurnKey } from "./tw-turn.mjs";
import { actorSkillRating, BATTLESUIT_ANTIMECH_SKILLS } from "./atow-conversion.mjs";

const num = (v) => Number(v) || 0;

export const INFANTRY_TYPES = new Set(['battle_armor', 'infantry']);
export const isInfantry = (actor) => INFANTRY_TYPES.has(actor?.type);
export const isBattleArmor = (actor) => actor?.type === 'battle_armor';

/* ------------------------------------------------------------------ */
/*  Battle armor organization                                           */
/* ------------------------------------------------------------------ */

/** Battle Armor Organization/Weight Table: troopers per unit by tech base. */
export const BA_TECH = {
  is: { label: 'Inner Sphere', troopers: 4 },
  clan: { label: 'Clan', troopers: 5 },
  comstar: { label: 'ComStar / WoB', troopers: 6 }
};

export const BA_WEIGHTS = {
  pal: 'PA(L) / Exoskeleton',
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  assault: 'Assault'
};

/** Manipulators (Other Combat Weapons and Equipment, TW pp. 228–229). */
export const MANIPULATORS = {
  none: 'None',
  armoredGlove: 'Armored Glove',
  basic: 'Basic Manipulator',
  battleClaw: 'Battle Claw',
  heavyClaw: 'Heavy Battle Claw',
  vibroClaw: 'Vibro-Claw',
  magneticClaw: 'Magnetic Claw',
  cargoLifter: 'Cargo Lifter'
};

/** Stealth armor to-hit modifiers at short / medium / long range. */
export const STEALTH_TYPES = {
  none: { label: 'None', mods: [0, 0, 0] },
  basic: { label: 'Basic Stealth', mods: [0, 1, 2] },
  prototype: { label: 'Prototype Stealth', mods: [0, 1, 2] },
  standard: { label: 'Standard Stealth', mods: [1, 1, 2] },
  improved: { label: 'Improved Stealth', mods: [1, 2, 3] }
};

/** Troopers in the unit (the record sheet's squad size; tech-base default when unset). */
export function squadSize(actor) {
  const sys = actor?.system || {};
  const n = num(sys.squadSize) || BA_TECH[sys.techBase]?.troopers || 4;
  return Math.max(1, Math.min(6, n));
}

/** A trooper's damage capacity: Armor Value + 1. */
export function trooperCapacity(actor) {
  return Math.max(0, num(actor?.system?.armorValue)) + 1;
}

/**
 * The unit's troopers as [{ n, damage, capacity, armor, alive }], one per
 * squad slot (missing entries are undamaged).
 */
export function baTroopers(actor) {
  const cap = trooperCapacity(actor);
  const list = actor?.system?.troopers || [];
  return Array.from({ length: squadSize(actor) }, (_, i) => {
    const damage = Math.max(0, Math.min(cap, num(list[i]?.damage)));
    return { n: i + 1, damage, capacity: cap, armor: Math.max(0, cap - 1 - damage), alive: damage < cap };
  });
}

/** Number of troopers still in action. */
export function liveTroopers(actor) {
  if (actor?.type === 'infantry') return Math.max(0, num(actor.system?.troopers?.value));
  return baTroopers(actor).filter(t => t.alive).length;
}

/** Troopers in their stored shape ({ damage }) for a write. */
export const troopersForWrite = (troopers) => troopers.map(t => ({ damage: num(t.damage) }));

/** The unit's Anti-'Mech Skill Rating (from a linked character's Piloting/Battlesuit when present). */
export function antiMechFor(actor) {
  const crew = actor?.system?.crew || {};
  const linked = crew.actorId ? game.actors?.get(crew.actorId) : null;
  if (linked && actor.type === 'battle_armor') {
    const r = actorSkillRating(linked, BATTLESUIT_ANTIMECH_SKILLS);
    if (r) return r.rating;
  }
  return num(crew.antiMech ?? 5);
}

/** Count the manipulators of a kind on the suit (0–2). */
export function manipulatorCount(actor, ...kinds) {
  const m = actor?.system?.manipulators || {};
  return ['left', 'right'].filter(side => kinds.includes(m[side])).length;
}

/** Vibro-claw bonus to leg / swarm damage: +1 with one claw, +2 with two. */
export const vibroBonus = (actor) => manipulatorCount(actor, 'vibroClaw');

/* ------------------------------------------------------------------ */
/*  Damage against battle armor                                         */
/* ------------------------------------------------------------------ */

/** Roll 1D6 until it names a live trooper; returns { index, dice } or null. */
export async function rollRandomTrooper(troopers, rolls) {
  if (!troopers.some(t => t.alive)) return null;
  const dice = [];
  for (let guard = 0; guard < 40; guard++) {
    const r = await new Roll("1d6").evaluate();
    rolls.push(r);
    dice.push(r.total);
    const t = troopers[r.total - 1];
    if (t?.alive) return { index: r.total - 1, dice };
  }
  // Pathological dice: take the first live trooper rather than loop forever.
  return { index: troopers.findIndex(t => t.alive), dice };
}

/** Put damage on one trooper; returns { dealt, wasted, killed }. */
export function damageTrooper(trooper, amount) {
  const room = Math.max(0, trooper.capacity - trooper.damage);
  const dealt = Math.min(room, Math.max(0, num(amount)));
  trooper.damage += dealt;
  trooper.armor = Math.max(0, trooper.capacity - 1 - trooper.damage);
  const killed = trooper.alive && trooper.damage >= trooper.capacity;
  if (killed) trooper.alive = false;
  return { dealt, wasted: num(amount) - dealt, killed };
}

/**
 * Apply grouped damage to a battle armor unit and save it (via writeDoc, so a
 * player's attack on the GM's unit is relayed). Area-effect damage hits every
 * live trooper for its full value.
 * @returns a chat fragment { ba: true, groups, killed, remaining, destroyed, applied }
 */
export async function resolveBattleArmorDamage(target, groupSizes, rolls, { areaEffect = false, writeDoc } = {}) {
  const troopers = baTroopers(target);
  const groups = [];
  if (areaEffect) {
    const total = groupSizes.reduce((a, b) => a + num(b), 0);
    for (const t of troopers.filter(x => x.alive)) {
      const r = damageTrooper(t, total);
      groups.push({ damage: total, trooper: t.n, dice: [], ...r, area: true });
    }
  } else {
    for (const g of groupSizes) {
      const pick = await rollRandomTrooper(troopers, rolls);
      if (!pick) { groups.push({ damage: g, trooper: null, dice: [], dealt: 0, wasted: g, killed: false }); continue; }
      const t = troopers[pick.index];
      groups.push({ damage: g, trooper: t.n, dice: pick.dice, ...damageTrooper(t, g) });
    }
  }
  const applied = writeDoc ? await writeDoc(target, { 'system.troopers': troopersForWrite(troopers) }) : false;
  const remaining = troopers.filter(t => t.alive).length;
  return {
    ba: true, groups, applied, hasTarget: true, targetName: target.name,
    killed: groups.filter(g => g.killed).length, remaining, squad: troopers.length,
    destroyed: remaining === 0
  };
}

/* ------------------------------------------------------------------ */
/*  Conventional infantry tables                                        */
/* ------------------------------------------------------------------ */

/** Conventional infantry weapon types (Generic Conventional Infantry tables). */
export const CI_WEAPONS = {
  rifleBallistic: 'Rifle, Ballistic',
  rifleEnergy: 'Rifle, Energy',
  mg: 'Machine Gun',
  srm: 'SRM',
  lrm: 'LRM',
  flamer: 'Flamer'
};
const CI_COLUMNS = ['rifleBallistic', 'rifleEnergy', 'mg', 'srm', 'lrm', 'flamer'];

/** Generic Conventional Infantry Damage Table: damage by troopers hitting (1–30). */
const CI_DAMAGE_ROWS = [
  [1, 0, 1, 0, 0, 0], [1, 1, 1, 1, 1, 1], [2, 1, 2, 1, 1, 1], [2, 1, 2, 2, 2, 2], [3, 1, 3, 2, 2, 2],
  [3, 2, 3, 3, 3, 3], [4, 2, 4, 3, 3, 3], [4, 2, 4, 4, 3, 4], [5, 3, 5, 4, 4, 4], [5, 3, 6, 5, 4, 5],
  [6, 3, 6, 5, 5, 5], [6, 3, 7, 6, 5, 6], [7, 4, 7, 6, 6, 6], [7, 4, 8, 7, 6, 7], [8, 4, 8, 7, 6, 7],
  [8, 4, 9, 8, 7, 8], [9, 5, 10, 8, 7, 8], [9, 5, 10, 9, 8, 9], [10, 5, 11, 9, 8, 9], [10, 6, 11, 10, 9, 10],
  [11, 6, 12, 10, 9, 10], [11, 6, 12, 11, 9, 11], [12, 6, 13, 11, 10, 11], [12, 7, 13, 12, 10, 12], [13, 7, 14, 12, 11, 12],
  [14, 7, 15, 13, 11, 12], [14, 8, 15, 13, 11, 13], [15, 8, 16, 14, 12, 13], [15, 8, 16, 14, 12, 14], [16, 8, 17, 15, 13, 14]
];

/** Damage for a number of conventional troopers (or battle armor AP hits) striking. */
export function ciDamage(weaponType, troopersHit) {
  const col = CI_COLUMNS.indexOf(weaponType);
  const n = Math.max(0, Math.min(30, Math.floor(num(troopersHit))));
  if (col < 0 || n <= 0) return 0;
  return CI_DAMAGE_ROWS[n - 1][col];
}

/** Conventional Infantry Range Modifier Table: to-hit modifier by range 0–9 (null = out of range). */
const CI_RANGE_ROWS = {
  rifleBallistic: [-2, 0, 2, 4],
  rifleEnergy: [-2, 0, 0, 2, 2, 4, 4],
  mg: [-2, 0, 2, 4],
  srm: [-1, 0, 0, 2, 2, 4, 4],
  lrm: [-1, 0, 0, 0, 2, 2, 2, 4, 4, 4],
  flamer: [-1, 0, 2, 4]
};

/** Range bracket for a conventional-infantry-style attack: { bracket, mod, inRange }. */
export function ciRangeBracket(weaponType, distance) {
  const row = CI_RANGE_ROWS[weaponType] || CI_RANGE_ROWS.rifleBallistic;
  if (distance == null) return { bracket: '—', mod: 0, inRange: true, unknown: true };
  const d = Math.max(0, Math.floor(num(distance)));
  if (d >= row.length) return { bracket: 'Out of range', mod: 0, inRange: false };
  return { bracket: `${d} hex${d === 1 ? '' : 'es'}`, mod: row[d], inRange: true };
}

/** Split damage into 2-point groups (infantry damage); a lone point is its own group. */
export function twoGroups(total) {
  const out = [];
  let t = Math.max(0, num(total));
  while (t > 0) { out.push(Math.min(2, t)); t -= 2; }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Battle armor weapon attacks                                         */
/* ------------------------------------------------------------------ */

/** 'ap' (anti-personnel), 'missile' (a launcher size is set) or 'direct'. */
export function baWeaponKind(weapon) {
  if (weapon?.ap) return 'ap';
  if (num(weapon?.clusterSize) > 0) return 'missile';
  return 'direct';
}

/**
 * Cluster Hits Table columns for a battle armor missile volley: the fewest
 * columns (30 or fewer missiles each, as even as possible) totalling the
 * missiles fired — e.g. 54 → 27 + 27.
 */
export function missileColumns(total) {
  const t = Math.max(0, Math.floor(num(total)));
  if (t <= 0) return [];
  if (t <= 30 || t === 40) return [t];
  const k = Math.ceil(t / 30);
  const base = Math.floor(t / k);
  return Array.from({ length: k }, (_, i) => base + (i < t % k ? 1 : 0));
}

/**
 * Roll a battle armor attack's hits. `clusterHits(size, roll)` is the Cluster
 * Hits Table lookup (passed in to avoid a module cycle).
 * @returns {{kind, troopers, columns, hits, total, groups, note}}
 */
export async function baAttackHits(actor, weapon, rolls, clusterHits) {
  const kind = baWeaponKind(weapon);
  const troopers = liveTroopers(actor);
  const perHit = num(weapon.damage);
  const columns = [];
  const rollColumn = async (size) => {
    if (size <= 1) { columns.push({ size, hits: size, auto: true }); return size; }
    const r = await new Roll("2d6").evaluate();
    rolls.push(r);
    const hits = clusterHits(size, r.total);
    columns.push({ size, hits, roll: r.total, dice: r.dice?.[0]?.results?.map(x => x.result) ?? [] });
    return hits;
  };

  if (kind === 'missile') {
    const missiles = troopers * num(weapon.clusterSize);
    let hits = 0;
    for (const c of missileColumns(missiles)) hits += await rollColumn(c);
    const total = hits * perHit;
    // Each missile hit rolls its own location (SRM: 2-point groups); a weapon
    // set to 5-point grouping keeps it.
    const groups = weapon.clusterGroup === 'five'
      ? Array.from({ length: Math.ceil(total / 5) }, (_, i) => Math.min(5, total - 5 * i))
      : Array(hits).fill(perHit).filter(d => d > 0);
    return { kind, troopers, missiles, columns, hits, total, groups, note: `${troopers} troopers × ${num(weapon.clusterSize)} = ${missiles} missiles` };
  }
  const hits = await rollColumn(troopers);
  if (kind === 'ap') {
    const total = ciDamage('rifleBallistic', hits);
    return { kind, troopers, columns, hits, total, groups: twoGroups(total), note: `${hits} trooper${hits === 1 ? '' : 's'} hit → Rifle, Ballistic column: ${total}` };
  }
  return { kind, troopers, columns, hits, total: hits * perHit, groups: Array(hits).fill(perHit).filter(d => d > 0), note: `${hits} of ${troopers} troopers hit` };
}

/** Has this unit already made its one anti-personnel attack this turn? */
export function apFiredThisTurn(actor, firedMap) {
  if (!currentTurnKey()) return false;
  return (actor?.system?.weapons || []).some(w => w.ap && firedMap[w.id] !== undefined);
}

/* ------------------------------------------------------------------ */
/*  Attacks against infantry                                            */
/* ------------------------------------------------------------------ */

/**
 * Stealth armor modifier on a battle armor target for a range bracket label
 * ('Short' / 'Medium' / 'Long'). Conventional infantry attackers ignore it.
 */
export function stealthMod(targetActor, bracket, attacker) {
  if (!isBattleArmor(targetActor) || attacker?.type === 'infantry') return 0;
  const s = STEALTH_TYPES[targetActor.system?.equipment?.stealth] || STEALTH_TYPES.none;
  const i = ['Short', 'Medium', 'Long'].indexOf(String(bracket || '').split(' ')[0]);
  return i < 0 ? 0 : s.mods[i];
}

/** Stealth mods as [short, medium, long] for the to-hit preview. */
export function stealthRow(targetActor, attacker) {
  if (!isBattleArmor(targetActor) || attacker?.type === 'infantry') return [0, 0, 0];
  return (STEALTH_TYPES[targetActor.system?.equipment?.stealth] || STEALTH_TYPES.none).mods;
}

/** Mimetic armor (+3/+2/+1 for 0/1/2 hexes moved) and camo system (+2/+1 for 0/1). */
export function concealmentMods(targetActor, hexesMoved) {
  const eq = targetActor?.system?.equipment || {};
  const h = Math.max(0, num(hexesMoved));
  const mods = [];
  if (eq.mimetic && h <= 2) mods.push({ key: 'mimetic', label: 'Mimetic armor', value: 3 - h, hint: `target moved ${h}` });
  if (eq.camo && h <= 1) mods.push({ key: 'camo', label: 'Camo system', value: 2 - h, hint: `target moved ${h}` });
  return mods;
}
