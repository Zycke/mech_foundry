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
import { getSkillLevelFromXP } from "./xp-math.mjs";
import { registerRelayHandler, relayRequest } from "./gm-relay.mjs";


/** Base Target Numbers by skill complexity code (Basic Action Check Table). */
export const BASE_TN_BY_COMPLEXITY = { SB: 7, SA: 8, CB: 8, CA: 9 };

/** Gunnery/'Mech and Piloting/'Mech are both 8/SA → Base TN 8. */
export const MECH_SKILL_BASE_TN = 8;

/**
 * Skill Item names (by their `name/subskill` key) that hold a crew member's
 * ratings, per unit type. Listed most-specific first; the base skill is a
 * fallback. All of these are 8/SA in the skills list, so Base TN 8 applies.
 */
export const MECH_GUNNERY_SKILLS = ["Gunnery/'Mech", "Gunnery"];
export const MECH_PILOTING_SKILLS = ["Piloting/'Mech", "Piloting"];
export const VEHICLE_GUNNERY_SKILLS = ["Gunnery/Ground Vehicle", "Gunnery"];
export const VEHICLE_DRIVING_SKILLS = ["Driving/Ground Vehicles", "Driving/Ground Vehicle", "Driving"];
export const AERO_GUNNERY_SKILLS = ["Gunnery/Aerospace", "Gunnery"];
export const AERO_PILOTING_SKILLS = ["Piloting/Aerospace", "Piloting"];

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
 * MechWarrior / Pilot / Crew Damage Table (A Time of War ↔ Total Warfare
 * conversion, p. 218). Each entry is AToW combat damage as {ap, bd, type,
 * ignoresArmor}: `bd` = Base Damage, `ap` = Armor Penetration, `type` = damage
 * type code, `ignoresArmor` true for rows marked "*" (damage unaffected by
 * armor). `subduing` rows apply to Fatigue and Stun rather than the wound track.
 */
export const CREW_DAMAGE = {
  pilotHit:       { ap: 1,  bd: 3,  type: 'b', ignoresArmor: false, label: "Crew Hit / Cockpit damage" },
  falling:        { ap: 1,  bd: 3,  type: 'm', ignoresArmor: false, label: "Damage from Falling" },
  ammoExplosion:  { ap: 0,  bd: 4,  type: 'e', ignoresArmor: true,  label: "Internal Ammunition Explosion" },
  ctArtillery:    { ap: 10, bd: 20, type: 'x', ignoresArmor: false, label: "Center Torso Destroyed by Artillery" },
  overheat15:     { ap: 0,  bd: 2,  type: 'e', ignoresArmor: true,  label: "Overheat 15+ (Life Support Damage)" },
  overheat25:     { ap: 0,  bd: 4,  type: 'e', ignoresArmor: true,  label: "Overheat 25+ (Life Support Damage)" },
  vehicleCrewHit: { ap: 5,  bd: 4,  type: 'b', ignoresArmor: false, label: "Commander / Driver Hit" },
  vehicleStunned: { ap: 0,  bd: 5,  type: 'm', ignoresArmor: true,  subduing: true, label: "Crew Stunned" },
  vehicleKilled:  { ap: 5,  bd: 10, type: 'b', ignoresArmor: false, label: "Crew Killed" }
};

/**
 * Apply one crew-damage event to a linked character via its own applyDamage().
 * Returns false (and warns) when the current user cannot modify the actor.
 * @param {Actor} actor
 * @param {object} event  An entry from CREW_DAMAGE.
 */
export async function applyCrewDamage(actor, event) {
  if (!actor || !event) return false;
  if (actor.isOwner || game.user.isGM) {
    await applyCrewDamageDirect(actor, event);
    return true;
  }
  // Not ours to modify (e.g. an attack injuring the GM's crew): ask the GM to
  // apply it. Only the event's table key is sent; the GM looks the values up.
  const key = Object.keys(CREW_DAMAGE).find(k => CREW_DAMAGE[k] === event);
  const ok = key ? await relayRequest('crewDamage', { uuid: actor.uuid, key }) : false;
  if (!ok) ui.notifications.warn(`Couldn't apply damage to ${actor.name}: no permission and no GM available to relay it.`);
  return ok;
}

/** Apply a crew-damage event through the character's own applyDamage(). */
async function applyCrewDamageDirect(actor, event) {
  // For armor-ignoring events, pass rawDamageForKnockdown so applyDamage skips
  // the BAR reduction step (the value is then applied directly).
  const raw = event.ignoresArmor ? event.bd : null;
  await actor.applyDamage(event.bd, event.ap, event.type, null, !!event.subduing, false, raw);
}

// GM side of the relay: apply a crew-damage event by table key to a character/NPC.
registerRelayHandler('crewDamage', async (payload) => {
  const actor = await fromUuid(payload?.uuid);
  const event = CREW_DAMAGE[payload?.key];
  if (!actor || actor.documentName !== 'Actor' || !['character', 'npc'].includes(actor.type)) {
    throw new Error("Crew damage target must be a character or NPC");
  }
  if (!event) throw new Error(`Unknown crew damage event "${payload?.key}"`);
  await applyCrewDamageDirect(actor, event);
  return true;
});

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
      // Skill Level is XP-derived everywhere in this system (system.level is a
      // display-only value that is never persisted), so derive it the same way.
      // -1 means untrained (XP below Level 0): skip so a trained fallback skill
      // — or the sheet's manually entered rating — is used instead.
      const level = Number(getSkillLevelFromXP(skill.system?.xp));
      if (!Number.isFinite(level) || level < 0) continue;
      return { rating: skillLevelToRating(level, baseTN), skillName: name, level };
    }
  }
  return null;
}
