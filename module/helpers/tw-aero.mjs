/**
 * Aerospace combat rules (Total Warfare): the Aerospace Weapon Range Table
 * (p. 235), Aerospace Attack Modifiers (p. 237), Evasive Action Modifiers
 * (p. 77) and the Air-to-Ground Attack Modifier Table (p. 243).
 *
 * Aerospace fighters and small craft fight each other on their own map with
 * range brackets by hexes (standard / capital scale); against ground targets
 * they make strafing, striking or bombing attacks (air-to-ground).
 *
 * Per-turn aerospace state lives in the actor flag `mech-foundry.aeroTurn`
 * = { key, evading, airToGround, thrust } and reads as empty on another turn.
 */
import { currentTurnKey } from "./tw-turn.mjs";

const num = (v) => Number(v) || 0;

export const AERO_TYPES = new Set(['aerospace_fighter', 'small_craft']);
export const isAero = (actor) => AERO_TYPES.has(actor?.type);

/* ------------------------------------------------------------------ */
/*  Range                                                               */
/* ------------------------------------------------------------------ */

const BRACKETS = ['short', 'medium', 'long', 'extreme'];
const BRACKET_LABEL = { short: 'Short', medium: 'Medium', long: 'Long', extreme: 'Extreme' };
const BRACKET_MOD = { short: 0, medium: 2, long: 4, extreme: 6 };
/** Aerospace Weapon Range Table: upper hex of each bracket. */
const AERO_RANGE = {
  standard: { short: 6, medium: 12, long: 20, extreme: 25 },
  capital: { short: 12, medium: 24, long: 40, extreme: 50 }
};

/**
 * A weapon's longest aerospace range bracket: its "Range" pick on the aero
 * sheet, else the longest of its S / M / L / E entries that is set.
 */
export function aeroMaxBracket(weapon) {
  if (BRACKETS.includes(weapon?.aeroRange)) return weapon.aeroRange;
  if (num(weapon?.rangeE)) return 'extreme';
  if (num(weapon?.rangeL)) return 'long';
  if (num(weapon?.rangeM)) return 'medium';
  return 'short';
}

/** Range bracket on the aerospace map: { bracket, mod, inRange }. */
export function aeroRangeBracket(distance, weapon) {
  if (distance == null) return { bracket: '—', mod: 0, inRange: true, unknown: true };
  const table = weapon?.capital ? AERO_RANGE.capital : AERO_RANGE.standard;
  const at = BRACKETS.find(b => distance <= table[b]);
  if (!at) return { bracket: 'Out of range', mod: 0, inRange: false };
  const max = aeroMaxBracket(weapon);
  if (BRACKETS.indexOf(at) > BRACKETS.indexOf(max)) return { bracket: `${BRACKET_LABEL[at]} (beyond ${BRACKET_LABEL[max]})`, mod: 0, inRange: false };
  return { bracket: BRACKET_LABEL[at], mod: BRACKET_MOD[at], inRange: true };
}

/* ------------------------------------------------------------------ */
/*  Per-turn state                                                      */
/* ------------------------------------------------------------------ */

/** This turn's aerospace state: { evading, airToGround, thrust }. */
export function aeroTurnState(actor) {
  const rec = actor?.flags?.['mech-foundry']?.aeroTurn;
  const key = currentTurnKey();
  const fresh = { evading: false, airToGround: false, thrust: num(actor?.system?.flight?.thrustSpent) };
  if (!key || !rec || rec.key !== key) return fresh;
  return { ...fresh, ...rec, thrust: rec.thrust ?? fresh.thrust };
}

/** Merge into this turn's aerospace state (no-op outside combat). */
export async function setAeroTurn(actor, patch) {
  const key = currentTurnKey();
  if (!actor || !key) return;
  const cur = aeroTurnState(actor);
  await actor.update({ 'flags.mech-foundry.aeroTurn': { ...cur, ...patch, key } });
}

/* ------------------------------------------------------------------ */
/*  Attack modifiers                                                    */
/* ------------------------------------------------------------------ */

/** Evasive Action Modifiers: target's modifier by unit type. */
function targetEvasiveMod(actor) {
  if (actor?.type === 'aerospace_fighter') return 3;
  if (actor?.type === 'small_craft') return 2;
  return 0;
}

/** Why an aerospace unit can't fire right now, or null. */
export function aeroFireBlock(actor) {
  if (!isAero(actor)) return null;
  // Evasive Action: fighters and small craft have no attacker modifier ("N/A") —
  // an evading fighter or small craft makes no attacks.
  if (aeroTurnState(actor).evading) return `${actor.name} is taking evasive action this turn and can't attack.`;
  return null;
}

/**
 * Aerospace Attack Modifiers that don't depend on the chosen attack direction
 * or range, as {key, label, value, hint}.
 */
export function aeroAttackMods(attacker, targetActor) {
  const mods = [];
  const add = (key, label, value, hint = '') => { if (value) mods.push({ key, label, value, hint }); };
  if (isAero(attacker)) {
    const sys = attacker.system || {};
    const crits = sys.crits || {};
    add('aeroPilot', 'Pilot/crew damage', num(sys.crew?.hits), '+1 per box');
    add('aeroFCS', 'FCS damage', 2 * num(crits.fcs), '+2 per box');
    const sensors = num(crits.sensors);
    add('aeroSensors', sensors >= 3 ? 'Sensors destroyed' : 'Sensor damage', sensors >= 3 ? 5 : sensors, sensors >= 3 ? '' : '+1 per box');
    const t = aeroTurnState(attacker);
    if (t.thrust > num(sys.thrust?.safe) && num(sys.thrust?.safe) > 0) add('aeroThrust', 'Exceeded Safe Thrust', 2, `${t.thrust} thrust`);
    if (sys.conditions?.outOfControl) add('aeroOOC', 'Attacker out of control', 2);
    if (num(sys.flight?.altitude) === 1 && isAero(targetActor)) add('aeroNOE', 'Attacker at NOE (altitude 1)', sys.omni ? 1 : 2, sys.omni ? 'OmniFighter' : '');
  }
  if (isAero(targetActor)) {
    const tsys = targetActor.system || {};
    if (num(tsys.flight?.velocity) === 0) add('targetVel0', 'Target at 0 velocity', -2);
    const tt = aeroTurnState(targetActor);
    if (tt.evading) add('targetEvading', 'Target evading', targetEvasiveMod(targetActor));
    if (tt.airToGround) add('targetA2G', 'Target made an air-to-ground attack', -3);
  }
  return mods;
}

/** Angle of Attack (aerospace target): aft +0, nose +1, side +2. */
export function aeroAngleMod(targetActor, direction) {
  if (!isAero(targetActor)) return null;
  if (direction === 'front') return { label: 'Angle: nose', value: 1 };
  if (direction === 'left' || direction === 'right') return { label: 'Angle: side', value: 2 };
  return null; // aft, above / below
}

/** Weapon-specific aerospace modifier: a capital weapon against a unit under 500 tons (+5). */
export function aeroWeaponMods(weapon, targetActor) {
  if (weapon?.capital && targetActor && num(targetActor.system?.tonnage) < 500) {
    return [{ key: 'capitalSmall', label: 'Capital weapon vs. <500 t', value: 5 }];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Air-to-ground                                                       */
/* ------------------------------------------------------------------ */

export const AIR_TO_GROUND = {
  strafe: { label: 'Strafing', mod: 4 },
  strike: { label: 'Striking', mod: 2 },
  bomb: { label: 'Bombing', mod: 2 }
};

/**
 * Air-to-Ground Attack Modifier Table: strafing +4 (+2 more at NOE altitude 1),
 * striking +2, bombing +2 (+ the attacker's altitude). Terrain and target
 * movement modifiers (including −4 immobile) don't apply to bombing.
 */
export function airToGroundMods(attacker, attackType) {
  const a = AIR_TO_GROUND[attackType];
  if (!a) return [];
  const mods = [{ label: a.label, value: a.mod }];
  const alt = num(attacker?.system?.flight?.altitude);
  if (attackType === 'strafe' && alt === 1) mods.push({ label: 'Strafing at NOE (altitude 1)', value: 2 });
  if (attackType === 'bomb' && alt > 0) mods.push({ label: `Altitude bombing (altitude ${alt})`, value: alt });
  return mods;
}

/** Is this an air-to-ground attack (aerospace attacker, ground target)? */
export function isAirToGround(attacker, targetActor) {
  return isAero(attacker) && !!targetActor && !isAero(targetActor);
}
