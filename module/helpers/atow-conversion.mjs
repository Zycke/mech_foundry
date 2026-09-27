/**
 * A Time of War → Total Warfare conversion helpers.
 *
 * Source: *A Time of War*, "A Time of War vs. Total Warfare" (pp. 42-43).
 * Skill conversion is a formula, not a lookup table:
 *
 *   TW Skill Rating = (skill's Base Target Number) − (AToW Skill Level)
 *
 * ...floored at 0 ("superhuman" skills clamp to 0, since Total Warfare does not
 * recognise a TN below 0). Base Target Numbers come from the Basic Action Check
 * Table by the skill's complexity code.
 */

/** Base Target Numbers by skill complexity code (Basic Action Check Table). */
export const BASE_TN_BY_COMPLEXITY = { SB: 7, SA: 8, CB: 8, CA: 9 };

/** Gunnery/'Mech and Piloting/'Mech are both 8/SA → Base TN 8. */
export const MECH_SKILL_BASE_TN = 8;

/** Skill Item names (by their `name/subskill` key) that hold a mech pilot's ratings. */
export const MECH_GUNNERY_SKILLS = ["Gunnery/'Mech", "Gunnery"];
export const MECH_PILOTING_SKILLS = ["Piloting/'Mech", "Piloting"];

/**
 * Convert an AToW skill Level to a Total Warfare Skill Rating.
 * @param {number} level    The AToW skill Level.
 * @param {number} [baseTN] The skill's Base Target Number (default: mech 8).
 * @returns {number} Rating clamped to a minimum of 0.
 */
export function skillLevelToRating(level, baseTN = MECH_SKILL_BASE_TN) {
  const lvl = Number(level) || 0;
  return Math.max(0, baseTN - lvl);
}

/**
 * Find the first matching skill Item on an actor (by exact name, trying each
 * candidate in order) and return its Total Warfare rating.
 * @param {Actor} actor
 * @param {string[]} candidateNames  Skill names to try, most specific first.
 * @param {number} [baseTN]
 * @returns {{rating:number, skillName:string, level:number}|null} null if none found.
 */
export function actorSkillRating(actor, candidateNames, baseTN = MECH_SKILL_BASE_TN) {
  if (!actor) return null;
  for (const name of candidateNames) {
    const skill = actor.items.find(i => i.type === 'skill' && i.name === name);
    if (skill) {
      const level = Number(skill.system?.level) || 0;
      return { rating: skillLevelToRating(level, baseTN), skillName: name, level };
    }
  }
  return null;
}
