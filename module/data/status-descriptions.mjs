/**
 * status-descriptions.mjs
 * -----------------------
 * Plain-language, hover-tooltip descriptions for the combat tab's wounds and
 * medical conditions. Kept in one place so the sheet (and any future chat card)
 * can share a single source of truth. Wording matches the homebrew wound system
 * implemented in `documents/actor.mjs` (see the "Intentional rules divergences"
 * note in CLAUDE.md) — do NOT re-align these to the rulebook's Specific Wound
 * Effects table without explicit direction.
 */

/** Wound type key → what the wound does and how it is healed. */
export const WOUND_DESCRIPTIONS = {
  dazed:
    'Dazed — locks 1 standard-damage box (−1 damage capacity) while it lasts. '
    + 'Heal: reduce its severity to 0 with Surgery.',
  concussion:
    'Concussion — locks 1 standard-damage box and imposes −2 INT and −2 WIL. '
    + 'Heal: reduce its severity to 0 with Surgery.',
  hemorrhage:
    'Hemorrhage — locks 1 standard-damage box and causes ongoing Bleeding. '
    + 'Heal: remove it with Surgery, which also stops the bleeding if no other hemorrhage remains.',
  traumaticImpact:
    'Traumatic Impact — locks 1 standard-damage box (−1 damage capacity). '
    + 'Heal: reduce its severity to 0 with Surgery.',
  nerveDamage:
    'Nerve Damage — locks 1 standard-damage box and imposes −2 DEX and −2 RFL. '
    + 'Heal: reduce its severity to 0 with Surgery.',
  severeStrain:
    'Severe Strain — locks 1 standard-damage box and halves the character’s movement. '
    + 'Heal: reduce its severity to 0 with Surgery.',
  severelyWounded:
    'Severely Wounded — locks 3 standard-damage boxes and can stack with further instances. '
    + 'Heal: reduce its severity to 0 with Surgery.'
};

/** Condition/status key → what the condition does and how it is cleared. */
export const CONDITION_DESCRIPTIONS = {
  bleeding:
    'Bleeding — an open wound the character keeps losing blood from. Applied automatically when '
    + 'standard damage reaches half Body (rounded up) and a Body check is failed, or by a Hemorrhage '
    + 'wound. Heal: use Stabilize (or First Aid) to stop it; a hemorrhage-caused bleed also stops when '
    + 'that wound is removed by Surgery.',
  stun:
    'Stunned — a jarring, disorienting blow (often from subduing or impact damage) leaves the character '
    + 'rattled and acting at a disadvantage. Heal: use Clear Stun, a Simple Action, to shake it off.',
  unconscious:
    'Unconscious — the character has been knocked out (standard damage or fatigue exceeding capacity, '
    + 'or a failed consciousness check) and cannot act. Heal: bring damage/fatigue back below capacity '
    + 'with First Aid or Recover Fatigue, and stabilize any dying state.',
  criticallyInjured:
    'Critically Injured — standard damage has reached a critical threshold. The character is gravely '
    + 'hurt and risks dying if they take more. Heal: reduce standard damage with First Aid/Surgery and '
    + 'keep them stable.',
  stabilized:
    'Stabilized — active bleeding and the immediate risk of death have been halted (the goal of the '
    + 'Stabilize action). This holds the character steady but does not itself restore lost damage.',
  dying:
    'Dying — standard damage has exceeded the character’s effective capacity; they will deteriorate '
    + 'without help. Heal: apply Stabilize immediately to stop the decline, then treat the damage with '
    + 'First Aid/Surgery.'
};

/** Look up a wound description by type (empty string when unknown). */
export function woundDescription(type) {
  return WOUND_DESCRIPTIONS[type] || '';
}

/** Look up a condition description by key (empty string when unknown). */
export function conditionDescription(key) {
  return CONDITION_DESCRIPTIONS[key] || '';
}
