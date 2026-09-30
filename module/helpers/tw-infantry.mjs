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
import { writeDoc } from "./gm-relay.mjs";
import { skillSource } from "./tw-skills.mjs";
import { shieldPlatoon } from "./tw-shield.mjs";

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
  return skillSource(actor, 'antiMech').rating;
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
export async function resolveBattleArmorDamage(target, groupSizes, rolls, { areaEffect = false } = {}) {
  const troopers = baTroopers(target);
  const before = troopers.map(t => ({ ...t }));
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
  const applied = await writeDoc(target, { 'system.troopers': troopersForWrite(troopers) });
  const remaining = troopers.filter(t => t.alive).length;
  const locChanges = troopers.filter((t, i) => t.damage !== before[i].damage).map(t => ({
    code: `#${t.n}`, label: `Trooper #${t.n}`, armor: [before[t.n - 1].armor, t.armor],
    soldier: before[t.n - 1].alive && !t.alive, destroyed: before[t.n - 1].alive && !t.alive
  }));
  return {
    ba: true, groups, applied, hasTarget: true, targetName: target.name,
    killed: groups.filter(g => g.killed).length, remaining, squad: troopers.length,
    destroyed: remaining === 0, locChanges
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

/* ------------------------------------------------------------------ */
/*  Swarming and riding (attached infantry)                             */
/* ------------------------------------------------------------------ */

/**
 * Infantry attached to another unit keep `system.attached` = { uuid, mode, key }:
 * the carrier's actor uuid, 'swarm' (an enemy swarm attack) or 'ride'
 * (mechanized battle armor on a friendly unit), and the turn it attached.
 */
export function attachment(actor) {
  const a = actor?.system?.attached;
  return a?.uuid && (a.mode === 'swarm' || a.mode === 'ride') ? a : null;
}

/** The unit an infantry unit is attached to (swarming or riding), or null. */
export function attachedCarrier(actor) {
  const a = attachment(actor);
  if (!a) return null;
  try { return fromUuidSync(a.uuid) ?? null; } catch { return null; }
}

/** Every actor in the world and on the viewed scene (unlinked tokens), once each. */
export function allUnitActors() {
  const out = new Map();
  for (const a of game.actors ?? []) if (a?.uuid) out.set(a.uuid, a);
  for (const t of canvas?.tokens?.placeables ?? []) if (t.actor?.uuid) out.set(t.actor.uuid, t.actor);
  return [...out.values()];
}

/** Live infantry units attached to a carrier in a mode ('swarm' / 'ride'). */
export function attachedInfantry(carrier, mode) {
  if (!carrier?.uuid) return [];
  return allUnitActors().filter(a => isInfantry(a) && attachment(a)?.uuid === carrier.uuid && attachment(a).mode === mode && liveTroopers(a) > 0);
}
export const swarmersOf = (carrier) => attachedInfantry(carrier, 'swarm');
export const ridersOf = (carrier) => attachedInfantry(carrier, 'ride');

/** Can't be targeted: swarming units, and mechanized battle armor riding a unit. */
export function untargetableReason(actor) {
  const a = attachment(actor);
  if (!a) return null;
  return a.mode === 'swarm'
    ? `${actor.name} is swarming a unit and can't be targeted (hits on the swarmed unit may strike it).`
    : `${actor.name} is riding a unit and can't be targeted (hits on the carrier may strike it).`;
}

export const DETACHED = { uuid: '', mode: '', key: '' };

/**
 * Damage an infantry unit takes "as if from an infantry attack": battle armor
 * in 2-point groups on random troopers; conventional infantry take it all
 * (each point is a trooper, two for mechanized platoons).
 */
export async function infantryAttackDamage(actor, total, rolls) {
  if (actor?.type === 'infantry') return applyPlatoonDamage(actor, total);
  return resolveBattleArmorDamage(actor, twoGroups(total), rolls);
}

/**
 * Damage to every trooper (e.g. shaken off a jumping 'Mech: 1 per Jump MP each).
 * A platoon loses that many points per trooper.
 */
export async function perTrooperDamage(actor, each, rolls) {
  if (each <= 0) return null;
  if (actor?.type === 'infantry') return applyPlatoonDamage(actor, each * liveTroopers(actor));
  return resolveBattleArmorDamage(actor, [each], rolls, { areaEffect: true });
}

/**
 * Conventional platoon damage: each point kills a trooper (mechanized troopers
 * take two points each, round the kills down while one point is carried).
 */
export async function applyPlatoonDamage(actor, points) {
  const sys = actor.system || {};
  const before = Math.max(0, num(sys.troopers?.value));
  const mech = sys.platoonType === 'mechanized';
  const carried = mech ? num(sys.troopers?.wound) : 0;
  const pts = Math.max(0, num(points)) + carried;
  const killed = Math.min(before, mech ? Math.floor(pts / 2) : pts);
  const after = before - killed;
  const upd = { 'system.troopers': { ...(sys.troopers || {}), value: after, wound: mech && after > 0 ? pts % 2 : 0 } };
  const applied = await writeDoc(actor, upd);
  return { platoon: true, damage: num(points), killed, before, remaining: after, destroyed: after <= 0, applied, hasTarget: true, targetName: actor.name };
}

/** Detach an infantry unit from its carrier. */
export async function detach(actor) {
  return writeDoc(actor, { 'system.attached': { ...DETACHED } });
}

/**
 * Knock attached infantry off a carrier (fall, shaken off, …): detaches each
 * and applies the damage — `{ dice: '2d6' }` or `{ damage: n }` as one
 * infantry-attack hit, or `{ perTrooper: n }` to every trooper. Returns chat lines.
 */
export async function knockOff(units, { dice = null, damage = 0, perTrooper = 0, why = 'knocked off' } = {}, rolls) {
  const lines = [];
  for (const u of units) {
    await detach(u);
    let dmgText = 'no damage';
    let res = null;
    if (dice) {
      const r = await new Roll(dice).evaluate();
      rolls.push(r);
      res = await infantryAttackDamage(u, r.total, rolls);
      dmgText = `${dice.toUpperCase()} = ${r.total} damage`;
    } else if (damage > 0) {
      res = await infantryAttackDamage(u, damage, rolls);
      dmgText = `${damage} damage`;
    } else if (perTrooper > 0) {
      res = await perTrooperDamage(u, perTrooper, rolls);
      dmgText = `${perTrooper} damage to each trooper`;
    }
    const left = res ? ` — ${res.remaining} trooper${res.remaining === 1 ? '' : 's'} left${res.destroyed ? ' (DESTROYED)' : ''}` : '';
    lines.push(`${u.name} ${why}: ${dmgText}${left}. It can't move or fire for the rest of the turn.`);
  }
  return lines;
}

/**
 * Attacks against a swarmed unit may strike the swarmers: on a hit to a
 * 'Mech's torso (front or rear) or any location of a vehicle, roll 1D6 per
 * swarming unit; on 5–6 a random battle armor trooper absorbs damage up to its
 * capacity and the rest carries on to the location (a platoon takes it all).
 * `cache` collects the infantry changes for one write at the end.
 * @returns {{ remaining: number, lines: string[] }}
 */
export async function swarmerIntercept(carrier, loc, amount, rolls, cache) {
  const lines = [];
  let remaining = num(amount);
  const hitsSwarmers = carrier.type === 'mech' ? ['ct', 'lt', 'rt'].includes(loc) : true;
  if (!hitsSwarmers || remaining <= 0) return { remaining, lines };
  for (const u of cache.swarmers) {
    if (remaining <= 0) break;
    const r = await new Roll("1d6").evaluate();
    rolls.push(r);
    if (r.total <= 4) { lines.push(`Swarmers ${u.name}: 1D6 ${r.total} — not hit`); continue; }
    remaining = await absorbInto(u, remaining, rolls, cache, lines, `Swarmers ${u.name}: 1D6 ${r.total} — hit`, true);
  }
  return { remaining, lines };
}

/**
 * Let an attached infantry unit absorb damage: a random live battle armor
 * trooper (or, for `trooperIndex`, that trooper) takes up to its capacity; a
 * platoon (swarming) takes the whole group. Returns what passes through.
 */
export async function absorbInto(u, amount, rolls, cache, lines, prefix, platoonTakesAll, trooperIndex = null) {
  const entry = cacheEntry(cache, u);
  if (u.type === 'infantry') {
    entry.platoonPoints += platoonTakesAll ? amount : 0;
    entry.dirty = true;
    lines.push(`${prefix}: the platoon takes ${amount}`);
    return platoonTakesAll ? 0 : amount;
  }
  let idx = trooperIndex;
  if (idx === null) {
    const pick = await rollRandomTrooper(entry.troopers, rolls);
    if (!pick) return amount;
    idx = pick.index;
  }
  const t = entry.troopers[idx];
  if (!t?.alive) return amount;
  const res = damageTrooper(t, amount);
  entry.dirty = true;
  lines.push(`${prefix}: trooper #${t.n} takes ${res.dealt}${res.killed ? ' — KILLED' : ''}${amount - res.dealt > 0 ? `, ${amount - res.dealt} carries on to the carrier` : ''}`);
  return amount - res.dealt;
}

function cacheEntry(cache, u) {
  if (!cache.units.has(u.uuid)) cache.units.set(u.uuid, { actor: u, troopers: u.type === 'battle_armor' ? baTroopers(u) : null, platoonPoints: 0, dirty: false });
  return cache.units.get(u.uuid);
}

/** A fresh interception cache for one attack against a carrier. */
export function interceptCache(carrier) {
  if (!carrier) return { swarmers: [], riders: [], units: new Map(), detach: new Set() };
  return { swarmers: swarmersOf(carrier), riders: ridersOf(carrier), units: new Map(), detach: new Set() };
}

/** Save the infantry changes an attack caused (damage, then units that came off). */
export async function flushIntercepts(cache) {
  for (const { actor, troopers, platoonPoints, dirty } of cache.units.values()) {
    if (!dirty) continue;
    if (troopers) await writeDoc(actor, { 'system.troopers': troopersForWrite(troopers) });
    if (platoonPoints > 0) await applyPlatoonDamage(actor, platoonPoints);
  }
  for (const u of cache.detach) await detach(u);
}

/** 'Mech torso locations / vehicle sides occupied by live mechanized troopers. */
export function riderLocations(carrier) {
  const out = new Set();
  for (const u of ridersOf(carrier)) {
    baTroopers(u).forEach((t, i) => {
      const p = TRANSPORT_POSITIONS[i];
      if (t.alive && p) out.add(carrier.type === 'mech' ? p.mech : p.vehicle);
    });
  }
  return out;
}

const TORSO_WORD = { ct: 'center torso', lt: 'left torso', rt: 'right torso' };

/** Troopers riding on 'Mech torso locations destroyed by this attack die (front and rear). */
export function killRidersOn(locs, cache, lines) {
  if (!locs.length) return;
  for (const u of cache.riders) {
    const entry = cacheEntry(cache, u);
    (entry.troopers || []).forEach((t, i) => {
      const p = TRANSPORT_POSITIONS[i];
      if (!t.alive || !p || !locs.includes(p.mech)) return;
      t.damage = t.capacity; t.alive = false; entry.dirty = true;
      lines.push(`${u.name} trooper #${t.n}, riding on the destroyed ${TORSO_WORD[p.mech]}, is killed`);
    });
  }
}

/**
 * The carrier was destroyed: each riding unit survives on 1D6 1–2 (except
 * troopers on destroyed locations) and is otherwise destroyed; swarmers drop
 * off — from a VTOL / WiGE with 1 damage per elevation to each trooper (none
 * for jump- or VTOL-capable infantry). All of them come off the carrier.
 */
export async function carrierDestroyed(carrier, cache, rolls, lines) {
  for (const u of cache.riders) {
    const entry = cacheEntry(cache, u);
    const r = await new Roll("1d6").evaluate();
    rolls.push(r);
    if (r.total <= 2) lines.push(`${u.name} survives its carrier's destruction (1D6 ${r.total}): placed in the hex, it moves and fires normally next turn`);
    else {
      (entry.troopers || []).forEach(t => { t.damage = t.capacity; t.alive = false; });
      entry.dirty = true;
      lines.push(`${u.name} is destroyed with its carrier (1D6 ${r.total})`);
    }
    cache.detach.add(u);
  }
  const airborne = carrier.type === 'ground_vehicle' && ['vtol', 'wige'].includes(carrier.system?.movementType) ? num(carrier.system?.elevation) : 0;
  for (const u of cache.swarmers) {
    const entry = cacheEntry(cache, u);
    const flies = num(u.system?.movement?.jump) > 0 || num(u.system?.movement?.vtol) > 0;
    const each = airborne && !flies ? airborne : 0;
    if (each) {
      if (entry.troopers) entry.troopers.forEach(t => { if (t.alive) damageTrooper(t, each); });
      else entry.platoonPoints += each * liveTroopers(u);
      entry.dirty = true;
    }
    lines.push(`${u.name} drops off the destroyed ${carrier.name}${each ? ` (${each} damage to each trooper)` : ''}`);
    cache.detach.add(u);
  }
}

/**
 * Battle Armor Transport Position Table: where each numbered trooper rides on
 * a 'Mech (location, rear?) or a vehicle (side).
 */
export const TRANSPORT_POSITIONS = [
  { mech: 'rt', rear: false, vehicle: 'right' },
  { mech: 'lt', rear: false, vehicle: 'right' },
  { mech: 'rt', rear: true, vehicle: 'left' },
  { mech: 'lt', rear: true, vehicle: 'left' },
  { mech: 'ct', rear: true, vehicle: 'rear' },
  { mech: 'ct', rear: false, vehicle: 'rear' }
];

/** Does trooper `index` (0-based) of a riding unit sit where this hit landed? */
export function riderAt(carrier, index, { loc = null, rear = false, facing = null } = {}) {
  const p = TRANSPORT_POSITIONS[index];
  if (!p) return false;
  if (carrier?.type === 'mech') return p.mech === loc && p.rear === !!rear;
  return p.vehicle === facing;
}

/**
 * Attached infantry that may take a hit on a carrier before it does: each
 * surviving mechanized trooper riding in the struck location (1D6 each, 5–6),
 * then the swarming unit (see swarmerIntercept). Returns what passes through.
 * @param {object} where  { loc, rear } for a 'Mech, { facing } for a vehicle
 */
export async function interceptAt(carrier, where, amount, rolls, cache) {
  const lines = [];
  let remaining = num(amount);
  for (const u of cache.riders) {
    const entry = cacheEntry(cache, u);
    for (let i = 0; i < (entry.troopers || []).length && remaining > 0; i++) {
      if (!entry.troopers[i].alive || !riderAt(carrier, i, where)) continue;
      const r = await new Roll("1d6").evaluate();
      rolls.push(r);
      if (r.total <= 4) { lines.push(`${u.name} trooper #${i + 1} riding here: 1D6 ${r.total} — not hit`); continue; }
      remaining = await absorbInto(u, remaining, rolls, cache, lines, `${u.name} trooper #${i + 1} riding here: 1D6 ${r.total} — hit`, false, i);
    }
  }
  if (remaining > 0 && cache.swarmers.length) {
    const s = await swarmerIntercept(carrier, where.loc, remaining, rolls, cache);
    remaining = s.remaining;
    lines.push(...s.lines);
  }
  return { remaining, lines };
}

/* ------------------------------------------------------------------ */
/*  Conventional infantry platoons (TW pp. 213–217)                      */
/* ------------------------------------------------------------------ */

export const PLATOON_TYPES = {
  foot: 'Foot',
  motorized: 'Motorized',
  jump: 'Jump',
  mechanized: 'Mechanized'
};
export const MECHANIZED_TYPES = { hover: 'Hover', wheeled: 'Wheeled', tracked: 'Tracked' };

/**
 * Generic Conventional Infantry Units Table: per platoon (and mechanized
 * vehicle) type and weapon — [ground MP, jump MP, troopers IS, troopers Clan].
 */
const GENERIC_PLATOONS = {
  foot: { rifleBallistic: [1, 0, 28, 25], rifleEnergy: [1, 0, 28, 25], mg: [0, 0, 28, 25], srm: [0, 0, 24, 25], lrm: [0, 0, 20, 25], flamer: [0, 0, 28, 25] },
  motorized: { rifleBallistic: [3, 0, 28, 25], rifleEnergy: [3, 0, 28, 25], mg: [2, 0, 28, 25], srm: [2, 0, 24, 25], lrm: [2, 0, 20, 25], flamer: [2, 0, 28, 25] },
  jump: { rifleBallistic: [1, 3, 21, 20], rifleEnergy: [1, 3, 21, 20], mg: [1, 2, 21, 20], srm: [1, 2, 18, 20], lrm: [1, 2, 15, 15], flamer: [1, 2, 21, 20] },
  hover: { rifleBallistic: [5, 0, 20, 20], rifleEnergy: [5, 0, 20, 20], mg: [4, 0, 20, 20], srm: [4, 0, 16, 15], lrm: [4, 0, 12, 15], flamer: [4, 0, 20, 20] },
  wheeled: { rifleBallistic: [4, 0, 24, 25], rifleEnergy: [4, 0, 24, 25], mg: [3, 0, 24, 25], srm: [3, 0, 20, 20], lrm: [3, 0, 16, 15], flamer: [3, 0, 24, 25] },
  tracked: { rifleBallistic: [3, 0, 28, 25], rifleEnergy: [3, 0, 28, 25], mg: [3, 0, 28, 25], srm: [3, 0, 24, 25], lrm: [3, 0, 20, 20], flamer: [3, 0, 28, 25] }
};

/** The generic platoon for the actor's type / weapon / tech base: { ground, jump, troopers }. */
export function genericPlatoon(sys) {
  const key = sys?.platoonType === 'mechanized' ? (sys.mechanizedType || 'tracked') : (sys?.platoonType || 'foot');
  const row = GENERIC_PLATOONS[key]?.[sys?.weaponType || 'rifleBallistic'];
  if (!row) return null;
  return { ground: row[0], jump: row[1], troopers: sys?.techBase === 'clan' ? row[3] : row[2] };
}

/** The platoon's single attack as a weapon entry, so it goes through the normal fire flow. */
export function platoonWeapon(actor) {
  const type = actor.system?.weaponType || 'rifleBallistic';
  return { id: 'platoon', name: `${CI_WEAPONS[type] || 'Rifle'} platoon`, ciType: type, damage: 0, location: '' };
}

/**
 * A platoon's attack damage: the Cluster Hits Table for its active troopers
 * (one trooper always hits; columns above 30 use 30) gives the troopers that
 * hit, cross-referenced on the Generic Conventional Infantry Damage Table.
 */
export async function platoonAttackDamage(actor, rolls, clusterHits) {
  const troopers = liveTroopers(actor);
  const type = actor.system?.weaponType || 'rifleBallistic';
  let hits = troopers, roll = null, dice = [];
  if (troopers > 1) {
    const r = await new Roll("2d6").evaluate();
    rolls.push(r);
    roll = r.total;
    dice = r.dice?.[0]?.results?.map(x => x.result) ?? [];
    hits = clusterHits(Math.min(30, troopers), r.total);
  }
  const total = ciDamage(type, hits);
  return {
    kind: 'platoon', troopers, hits, total, groups: twoGroups(total),
    columns: [{ size: Math.min(30, troopers), hits, roll, dice, auto: troopers <= 1 }],
    note: `${hits} of ${troopers} troopers hit → ${CI_WEAPONS[type]} column: ${total}`
  };
}

/* ---- Damage against conventional infantry ---- */

/** Categories on the Non-Infantry Weapon Damage Against Infantry Table. */
export const INFANTRY_DAMAGE_CLASSES = {
  auto: 'auto',
  direct: 'Direct fire',
  clusterBallistic: 'Cluster (ballistic)',
  pulse: 'Pulse',
  clusterMissile: 'Cluster (missile)',
  burst: 'Burst-fire',
  ae: 'Area-effect'
};

/** Burst-Fire Weapon Damage vs. Conventional Infantry: dice by weapon name. */
const BURST_MECH = [
  [/\bap gauss/i, '2d6'], [/light machine gun|\blmg\b/i, '1d6'], [/heavy machine gun|\bhmg\b/i, '3d6'],
  [/machine gun|\bmg\b/i, '2d6'], [/(small|micro)[\s-]*(x-)?pulse/i, '2d6'], [/flamer/i, '4d6']
];
const BURST_BA = [
  [/light machine gun|\blmg\b/i, '1d6/2'], [/heavy machine gun|\bhmg\b/i, '2d6'], [/machine gun|\bmg\b/i, '1d6'],
  [/flamer/i, '3d6'], [/light recoilless/i, '1d6'], [/medium recoilless/i, '2d6'], [/heavy recoilless/i, '2d6'],
  [/light mortar/i, '1d6'], [/heavy mortar/i, '1d6'], [/automatic grenade|\bagl\b/i, '1d6/2'], [/heavy grenade/i, '1d6']
];

/** Burst-fire dice against conventional infantry for a weapon, or null. */
export function burstDice(weapon, attacker) {
  if (weapon?.burst) return weapon.burst;
  const name = weapon?.name || '';
  if (attacker?.type === 'battle_armor') {
    const ba = BURST_BA.find(([re]) => re.test(name));
    if (ba) return ba[1];
  }
  return BURST_MECH.find(([re]) => re.test(name))?.[1] ?? null;
}

/**
 * A weapon's row on the Non-Infantry Weapon Damage Against Infantry Table:
 * the weapon's own `infClass` when set, else guessed from its name and
 * cluster size (burst-fire weapons, pulse lasers, LB-X / Ultra / Rotary
 * autocannon, missile launchers).
 */
export function infantryDamageClass(weapon, attacker) {
  if (weapon?.infClass && weapon.infClass !== 'auto') return weapon.infClass;
  const name = weapon?.name || '';
  if (burstDice(weapon, attacker)) return 'burst';
  if (/pulse/i.test(name)) return 'pulse';
  if (/\blb[\s-]?\d+[\s-]?x|\bultra|\buac|\brotary|\brac\b/i.test(name)) return 'clusterBallistic';
  if (num(weapon?.clusterSize) > 0) return /\blb|\bac\b|autocannon/i.test(name) ? 'clusterBallistic' : 'clusterMissile';
  return 'direct';
}

/**
 * Troopers eliminated by a non-infantry weapon: Damage Value / 10 (direct fire,
 * physical), / 10 + 1 (cluster ballistic), / 10 + 2 (pulse), / 5 (cluster
 * missile), / 0.5 (area effect) — fractions round up.
 */
export function nonInfantryTroopersHit(cls, dv) {
  const d = Math.max(0, num(dv));
  if (d <= 0) return 0;
  switch (cls) {
    case 'clusterBallistic': return Math.ceil(d / 10) + 1;
    case 'pulse': return Math.ceil(d / 10) + 2;
    case 'clusterMissile': return Math.ceil(d / 5);
    case 'ae': return Math.ceil(d / 0.5);
    default: return Math.ceil(d / 10);
  }
}

/** Kill troopers outright (non-infantry weapons). */
async function killPlatoonTroopers(actor, n) {
  const sys = actor.system || {};
  const before = Math.max(0, num(sys.troopers?.value));
  const killed = Math.min(before, Math.max(0, n));
  const after = before - killed;
  const applied = await writeDoc(actor, { 'system.troopers': { ...(sys.troopers || {}), value: after, wound: after > 0 ? num(sys.troopers?.wound) : 0 } });
  return { killed, before, remaining: after, destroyed: after <= 0, applied };
}

/**
 * Resolve one successful attack against a conventional infantry platoon.
 * @param {object} hit
 *   - `infantryDamage`: damage from an infantry attack (another platoon, battle
 *     armor AP weapons, punches pulling swarmers off …): one trooper per point
 *     (two per mechanized trooper);
 *   - `burst`: dice rolled per hit on the Burst-Fire table (same marking);
 *   - otherwise `dv` and `cls`: troopers eliminated per the Non-Infantry
 *     Weapon Damage table — `hits` separate hits (battle armor) each count —
 *     doubled against mechanized infantry.
 *   - `clear`: the platoon stands in Clear terrain (no terrain to-hit
 *     modifier) and takes double damage.
 */
export async function resolvePlatoonHit(target, { infantryDamage = null, burst = null, hits = 1, dv = 0, cls = 'direct', clear = false } = {}, rolls = []) {
  const mech = target.system?.platoonType === 'mechanized';
  const lines = [];
  let res;
  if (infantryDamage !== null || burst) {
    let points = num(infantryDamage);
    if (burst) {
      const [formula, half] = burst.split('/');
      for (let i = 0; i < Math.max(1, hits); i++) {
        const r = await new Roll(formula).evaluate();
        rolls.push(r);
        const pts = half ? Math.ceil(r.total / 2) : r.total;
        points += pts;
        lines.push(`Burst-fire ${burst.toUpperCase()}: ${pts}`);
      }
    }
    if (clear) { lines.push(`Clear terrain: ×2 (${points} → ${points * 2})`); points *= 2; }
    // Inside a building: it takes its share first (tw-buildings.mjs).
    const sh = shieldPlatoon(target, points, burst ? Math.max(1, hits) : 1);
    if (sh.line) { lines.push(sh.line); points = sh.points; }
    if (mech) lines.push('Mechanized troopers take 2 points each');
    res = await applyPlatoonDamage(target, points);
    lines.push(`${points} damage: ${res.killed} trooper${res.killed === 1 ? '' : 's'} eliminated`);
  } else {
    const per = nonInfantryTroopersHit(cls, dv);
    let n = per * Math.max(1, hits);
    lines.push(`${INFANTRY_DAMAGE_CLASSES[cls] || 'Direct fire'} ${num(dv)}${cls === 'ae' ? ' / 0.5' : cls === 'clusterMissile' ? ' / 5' : ' / 10'}${cls === 'clusterBallistic' ? ' + 1' : cls === 'pulse' ? ' + 2' : ''} = ${per}${hits > 1 ? ` × ${hits} hits` : ''}`);
    if (mech) { n *= 2; lines.push('Mechanized infantry: ×2'); }
    if (clear) { n *= 2; lines.push('Clear terrain: ×2'); }
    const sh = shieldPlatoon(target, n, cls === 'ae' ? 1 : Math.max(1, hits));
    if (sh.line) { lines.push(sh.line); n = sh.points; }
    res = await killPlatoonTroopers(target, n);
    lines.push(`${res.killed} trooper${res.killed === 1 ? '' : 's'} eliminated`);
  }
  const locChanges = res.killed > 0 ? [{ code: 'Troopers', label: 'Troopers', count: [res.before, res.remaining], destroyed: res.destroyed }] : [];
  return { platoon: true, lines, ...res, locChanges, hasTarget: true, targetName: target.name };
}
