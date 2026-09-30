/**
 * A unit's special equipment (Total Warfare; details checked against MegaMek):
 * MASC, superchargers, Triple-Strength Myomer, ECM suites, active probes and C3.
 *
 * Where it comes from: a 'Mech's critical slots (by name — imported units keep
 * MegaMek's names such as "ISMASC", "Guardian ECM Suite", "Beagle Active
 * Probe", "C3 Slave") plus the C3 master computer in its weapons; and, for any
 * unit, the `system.gear` record on its sheet (vehicles' equipment from the
 * importer, or set by hand). Equipment with a destroyed critical slot, or
 * marked destroyed in `system.gear.destroyed`, doesn't work.
 *
 * MASC / supercharger: armed for a turn before moving with a 2D6 roll — a
 * result below the failure number (3, 5, 7, 11, 13, rising each consecutive
 * turn of use and falling again when rested) fails. Armed, Running MP becomes
 * Walking × 2 (× 2.5, rounded up, with both). A MASC failure puts a critical
 * hit on each leg; a supercharger failure rolls 2D6 for engine damage (8–9: 1
 * hit, 10–11: 2, 12: 3; motive damage steps on a vehicle). Either way the
 * system can't be used that turn.
 * TSM: at heat 9+ it adds 2 Walking MP (not with a destroyed leg) and doubles
 * punch, kick and club / hatchet / sword damage.
 */
import { currentTurnKey } from "./tw-turn.mjs";

const num = (v) => Number(v) || 0;

/** Failure numbers by consecutive-use level (MegaMek TWRulesEquipment). */
export const BOOST_FAILURE = [3, 5, 7, 11, 13, 13, 13];

// MegaMek names run together ("ISMASC", "ISTSM", "ISGuardianECM", "CLECMSuite"), so no word boundaries.
const SLOT_MATCH = {
  masc: (n) => /MASC/i.test(n) && !/supercharger/i.test(n),
  supercharger: (n) => /supercharger/i.test(n),
  tsm: (n) => /TSM|triple[\s-]?strength/i.test(n) && !/industrial/i.test(n),
  ecm: (n) => /ECM/i.test(n) && !/pods?\b/i.test(n),
  probe: (n) => /active\s*probe|activeprobe|beagle|bloodhound|\bBAP\b/i.test(n),
  c3: (n) => /\bC3\b|C3i|C3Slave|C3Master|improved\s*C3|C3\s*(slave|master|computer|boosted)/i.test(n) && !/remote sensor/i.test(n)
};

/** ECM kind from a name: angel / guardian / clan / watchdog. */
export function ecmKind(n = '') {
  if (/angel/i.test(n)) return 'angel';
  if (/watchdog/i.test(n)) return 'watchdog';
  if (/^CL|clan/i.test(n)) return 'clan';
  return 'guardian';
}

/** Active probe kind and its range in hexes: Beagle 4, Clan 5, Bloodhound 8, light 3. */
export function probeKind(n = '') {
  if (/bloodhound/i.test(n)) return 'bloodhound';
  if (/light/i.test(n)) return 'light';
  if (/^CL|clan/i.test(n)) return 'clan';
  return 'beagle';
}
export const PROBE_RANGE = { beagle: 4, clan: 5, bloodhound: 8, light: 3 };
export const ECM_RANGE = { guardian: 6, angel: 6, clan: 6, watchdog: 6 };

/** C3 role from a name: master / slave / c3i. */
export function c3Role(n = '') {
  if (/C3i|improved/i.test(n)) return 'c3i';
  if (/master|computer/i.test(n)) return 'master';
  return 'slave';
}

/**
 * What a unit carries and whether it works:
 * { masc, supercharger, tsm, ecm, probe, c3 } — each { has, working, name, kind?, range?, role?, network? }.
 */
export function unitGear(actor) {
  const sys = actor?.system ?? {};
  const g = sys.gear ?? {};
  const destroyed = g.destroyed ?? {};
  const out = {};
  const slots = actor?.type === 'mech' ? Object.values(sys.critSlots ?? {}).flat().filter(x => x && x.type !== 'empty') : [];
  for (const key of Object.keys(SLOT_MATCH)) {
    const found = slots.filter(x => SLOT_MATCH[key](String(x.name ?? '')));
    // C3 masters are weapons (a zero-damage "C3 Master" entry).
    const cw = key === 'c3' ? (sys.weapons ?? []).filter(w => /C3\s*(boosted\s*)?master|C3\s*computer|C3Master/i.test(String(w.name ?? ''))) : [];
    const manual = key === 'ecm' || key === 'probe' || key === 'c3' ? String(g[key] ?? '') : !!g[key];
    const has = found.length > 0 || cw.length > 0 || !!manual;
    const name = found[0]?.name || cw[0]?.name || (typeof manual === 'string' ? manual : '') || '';
    const working = has && !destroyed[key] && !found.some(x => x.hit) && !cw.some(w => w.destroyed);
    const rec = { has, working, name };
    if (key === 'ecm' && has) { rec.kind = typeof manual === 'string' && manual && !found.length ? manual : ecmKind(name); rec.range = ECM_RANGE[rec.kind] ?? 6; }
    if (key === 'probe' && has) { rec.kind = typeof manual === 'string' && manual && !found.length ? manual : probeKind(name); rec.range = PROBE_RANGE[rec.kind] ?? 4; }
    if (key === 'c3' && has) { rec.role = cw.length ? 'master' : typeof manual === 'string' && ['master', 'slave', 'c3i'].includes(manual) && !found.length ? manual : c3Role(name); rec.network = String(g.c3Network ?? '').trim(); }
    out[key] = rec;
  }
  return out;
}

/* -------------------------------------------- */
/*  MASC and superchargers                      */
/* -------------------------------------------- */

/** Combat round of a turn key ("combatId:round"), or null. */
function roundOf(key) {
  const r = Number(String(key ?? '').split(':').pop());
  return Number.isFinite(r) ? r : null;
}

/**
 * The failure level of MASC / a supercharger for the current turn: +1 for each
 * consecutive turn of use, falling when rested (MegaMek: two steps the first
 * turn after use, then one per turn).
 */
export function boostLevel(actor, which, turnKey = currentTurnKey()) {
  const rec = actor?.flags?.['mech-foundry']?.boostLevels?.[which];
  if (!rec || !turnKey) return 0;
  const now = roundOf(turnKey), then = roundOf(rec.key);
  if (now == null || then == null || String(rec.key).split(':')[0] !== String(turnKey).split(':')[0]) return 0;
  const n = now - then; // rounds since it was last used
  if (n <= 0) return Math.max(0, num(rec.level) - 1); // this turn: the level it was rolled at
  if (n === 1) return num(rec.level);
  return Math.max(0, num(rec.level) - n);
}

/** The failure number for arming MASC / a supercharger now. */
export function boostTarget(actor, which, turnKey = currentTurnKey()) {
  return BOOST_FAILURE[Math.min(BOOST_FAILURE.length - 1, boostLevel(actor, which, turnKey))];
}

/** Is MASC / the supercharger armed this turn? */
export function boostArmed(actor, which, turnKey = currentTurnKey()) {
  const b = actor?.flags?.['mech-foundry']?.boost;
  return !!turnKey && b?.key === turnKey && !!b[which];
}

/** Running (flanking) MP with the armed boosters: Walking × 2, or × 2.5 (round up) with both. */
export function boostedRun(walk, masc, supercharger) {
  if (masc && supercharger) return Math.ceil(num(walk) * 2.5);
  if (masc || supercharger) return num(walk) * 2;
  return null;
}

/** Supercharger failure: 2D6 for hits (8–9: 1, 10–11: 2, 12: 3). */
export function superchargerHits(total) {
  const t = num(total);
  return t >= 12 ? 3 : t >= 10 ? 2 : t >= 8 ? 1 : 0;
}

/** Is TSM working now (heat 9+, no destroyed leg)? */
export function tsmActive(actor) {
  if (actor?.type !== 'mech' || !unitGear(actor).tsm.working) return false;
  return num(actor.system?.heat?.value) >= 9;
}

/**
 * A `system.gear` record from equipment names (the importer, for units without
 * critical slots): { gear, used: names it recognised }.
 */
export function gearFromNames(names = []) {
  const gear = { masc: false, supercharger: false, tsm: false, ecm: '', probe: '', c3: '', c3Network: '', destroyed: {} };
  const used = [];
  for (const n of names) {
    const s = String(n ?? '');
    if (SLOT_MATCH.masc(s)) { gear.masc = true; used.push(n); }
    else if (SLOT_MATCH.supercharger(s)) { gear.supercharger = true; used.push(n); }
    else if (SLOT_MATCH.tsm(s)) { gear.tsm = true; used.push(n); }
    else if (SLOT_MATCH.ecm(s)) { gear.ecm = ecmKind(s); used.push(n); }
    else if (SLOT_MATCH.probe(s)) { gear.probe = probeKind(s); used.push(n); }
    else if (SLOT_MATCH.c3(s)) { gear.c3 = c3Role(s); used.push(n); }
  }
  return { gear, used };
}
