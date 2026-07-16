/**
 * xp-math.mjs
 * -----------
 * Pure A Time of War XP / progression math with NO Foundry dependency, so it can
 * be shared by the Actor document, the sheets, and the character-creation engine
 * — and unit-tested in isolation. MechFoundryActor re-exposes these as static
 * members for its historical call sites; do not fork these tables elsewhere.
 */

/** Cumulative XP thresholds for skill levels 0-10 (ATOW p.60). */
export const SKILL_XP_COSTS = [20, 30, 50, 80, 120, 170, 230, 300, 380, 470, 570];

/** XP cost per attribute point; attribute scores are linear (ATOW p.60). */
export const ATTRIBUTE_XP_PER_POINT = 100;

/**
 * Link Attribute Modifier from an attribute total (ATOW Link Modifier table).
 * @param {number} value
 * @returns {number}
 */
export function getLinkModifier(value) {
  const v = Number(value) || 0;
  if (v <= 0) return -4;
  if (v === 1) return -2;
  if (v <= 3) return -1;
  if (v <= 6) return 0;
  if (v <= 9) return 1;
  if (v === 10) return 2;
  return Math.min(5, Math.floor(v / 3));
}

/**
 * Skill level (0-10) from accumulated XP; -1 = untrained (below level 0).
 * @param {number} xp
 * @returns {number}
 */
export function getSkillLevelFromXP(xp) {
  const x = Number(xp) || 0;
  for (let i = SKILL_XP_COSTS.length - 1; i >= 0; i--) {
    if (x >= SKILL_XP_COSTS[i]) return i;
  }
  return -1;
}

/**
 * Total XP needed to reach the next skill level from the current one.
 * @param {number} currentLevel
 * @returns {number}
 */
export function getSkillNextCost(currentLevel) {
  const lvl = Number(currentLevel);
  if (!Number.isFinite(lvl) || lvl >= 10) return 0;
  return SKILL_XP_COSTS[lvl + 1] ?? 0;
}

/** Cumulative XP required for a given attribute score. */
export function getAttributeXPCost(score) {
  const s = Math.max(0, Number(score) || 0);
  return s * ATTRIBUTE_XP_PER_POINT;
}

/** Attribute score derived from accumulated XP (0 below one full point). */
export function getAttributeScoreFromXP(xp) {
  const x = Number(xp) || 0;
  if (x < ATTRIBUTE_XP_PER_POINT) return 0;
  return Math.floor(x / ATTRIBUTE_XP_PER_POINT);
}

/**
 * XP to raise an attribute one point from its current score.
 * @param {number} currentScore
 * @param {number} [max=Infinity]  Optional phenotype cap; 0 when at/over cap.
 * @returns {number}
 */
export function getAttributeNextCost(currentScore, max = Infinity) {
  const s = Math.max(0, Number(currentScore) || 0);
  if (s >= max) return 0;
  return ATTRIBUTE_XP_PER_POINT;
}
