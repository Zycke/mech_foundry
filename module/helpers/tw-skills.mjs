/**
 * Unit-scale skill ratings and the linked warrior's condition.
 *
 * Total Warfare adds the warrior's skill *rating* to the target number (lower
 * is better); A Time of War adds the skill *level* to the dice. A linked
 * character's level converts as rating = skill Base TN − level (AToW pp. 42–43),
 * which gives the same odds. These helpers label the rating with where it came
 * from ("Gunnery (Lvl 5 → 8 − 5)") so the number reads correctly to players
 * used to either system, and turn the linked character's A Time of War injury
 * and fatigue modifiers into Total Warfare target-number modifiers.
 */
import {
  actorSkillRating, AERO_GUNNERY_SKILLS, AERO_PILOTING_SKILLS, BATTLESUIT_ANTIMECH_SKILLS, BATTLESUIT_GUNNERY_SKILLS,
  INFANTRY_GUNNERY_SKILLS, INFANTRY_SKILL_BASE_TN, MECH_GUNNERY_SKILLS, MECH_PILOTING_SKILLS, MECH_SKILL_BASE_TN,
  VEHICLE_DRIVING_SKILLS, VEHICLE_GUNNERY_SKILLS
} from "./atow-conversion.mjs";

const num = (v) => Number(v) || 0;

/** The unit's crew record (pilot for 'Mechs, crew for everything else). */
function crewOf(actor) {
  return actor?.system?.pilot || actor?.system?.crew || {};
}

/** The linked A Time of War character, if any. */
export function linkedCharacter(actor) {
  const id = crewOf(actor).actorId;
  return id ? globalThis.game?.actors?.get(id) ?? null : null;
}

/** Skill names (most specific first), Base TN and sheet field for a unit type and kind. */
function skillSpec(actor, kind) {
  const t = actor?.type;
  if (kind === 'gunnery') {
    if (t === 'infantry') return { names: INFANTRY_GUNNERY_SKILLS, base: INFANTRY_SKILL_BASE_TN, field: 'gunnery', label: 'Gunnery' };
    const names = t === 'mech' ? MECH_GUNNERY_SKILLS : t === 'ground_vehicle' ? VEHICLE_GUNNERY_SKILLS
      : t === 'battle_armor' ? BATTLESUIT_GUNNERY_SKILLS : AERO_GUNNERY_SKILLS;
    return { names, base: MECH_SKILL_BASE_TN, field: 'gunnery', label: 'Gunnery' };
  }
  if (kind === 'antiMech') return { names: t === 'battle_armor' ? BATTLESUIT_ANTIMECH_SKILLS : [], base: MECH_SKILL_BASE_TN, field: 'antiMech', label: "Anti-'Mech", fallback: 5 };
  if (t === 'ground_vehicle') return { names: VEHICLE_DRIVING_SKILLS, base: MECH_SKILL_BASE_TN, field: 'driving', label: 'Driving' };
  return { names: t === 'mech' ? MECH_PILOTING_SKILLS : AERO_PILOTING_SKILLS, base: MECH_SKILL_BASE_TN, field: 'piloting', label: 'Piloting' };
}

/**
 * Where a unit's skill rating comes from:
 * { rating, label, level?, base?, skillName?, linkedName? }.
 * @param {Actor} actor
 * @param {'gunnery'|'piloting'|'antiMech'} kind  piloting = Driving for vehicles
 */
export function skillSource(actor, kind) {
  const spec = skillSpec(actor, kind);
  const linked = linkedCharacter(actor);
  if (linked && spec.names.length) {
    const r = actorSkillRating(linked, spec.names, spec.base);
    if (r) return { rating: r.rating, label: spec.label, level: r.level, base: spec.base, skillName: r.skillName, linkedName: linked.name };
  }
  const crew = crewOf(actor);
  const raw = crew[spec.field] ?? (spec.field === 'piloting' ? crew.driving : undefined);
  return { rating: num(raw ?? spec.fallback ?? (kind === 'gunnery' ? 4 : 5)), label: spec.label };
}

/** "Lvl 5 → 8 − 5" for a converted linked skill, else "". */
export function conversionText(src) {
  return src.level === undefined ? '' : `Lvl ${src.level} → ${src.base} − ${src.level}`;
}

/**
 * The skill as a target-number modifier with a self-explaining label:
 * "Gunnery (Lvl 5 → 8 − 5)" for a linked character, "Gunnery rating" for a
 * sheet value. Pass `value` when the player edited the rating in a dialog.
 */
export function skillMod(actor, kind, value = undefined) {
  const src = skillSource(actor, kind);
  const edited = value !== undefined && num(value) !== src.rating;
  const label = edited ? `${src.label} rating (entered)`
    : src.level !== undefined ? `${src.label} (${conversionText(src)})` : `${src.label} rating`;
  return { key: kind, label, value: edited ? num(value) : src.rating };
}

/** Dialog hint for a skill input: where the default came from. */
export function skillHint(actor, kind) {
  const src = skillSource(actor, kind);
  const how = src.level !== undefined ? `${src.linkedName}: ${src.skillName} Lvl ${src.level} → ${src.base} − ${src.level} = ${src.rating}` : 'from the sheet';
  return `Total Warfare rating, added to the target number (lower is better) · ${how}`;
}

/**
 * The linked character's A Time of War injury and fatigue modifiers as Total
 * Warfare target-number modifiers (an AToW −1 to the roll is +1 to the target).
 * Only a linked character carries them; a sheet-only warrior uses the unit's
 * own pilot-hit rules.
 * @returns {Array<{key, label, value, hint}>}
 */
export function crewConditionMods(actor) {
  const c = linkedCharacter(actor);
  if (!c) return [];
  const mods = [];
  const injury = -num(c.system?.injuryModifier);
  const fatigue = -num(c.system?.fatigueModifier);
  if (injury > 0) mods.push({ key: 'crewInjury', label: `${c.name} injured`, value: injury, hint: `A Time of War injury modifier −${injury}` });
  if (fatigue > 0) mods.push({ key: 'crewFatigue', label: `${c.name} fatigued`, value: fatigue, hint: `A Time of War fatigue modifier −${fatigue}` });
  return mods;
}

/** A Piloting / Driving roll's opening modifiers: the rating plus the linked warrior's condition. */
export function pilotingMods(actor) {
  return [skillMod(actor, 'piloting'), ...crewConditionMods(actor)];
}
