/**
 * The building shield for the attack being resolved (see tw-buildings.mjs,
 * which starts and ends it): a leaf module so the damage code (tw-combat,
 * tw-infantry) can apply it without importing the building / combat stack.
 * shield: { uuid (target actor), rec, mode: 'outside' | 'inside', absorb, share, absorbed, cfBefore }
 */
const num = (v) => Number(v) || 0;
let shield = null;

/** The shield in force (or null). */
export function activeShield() {
  return shield;
}

/** Start (or clear, with null) the shield. */
export function setShield(s) {
  shield = s;
  return shield;
}

/** Damage groups after the shielding building takes its share (unchanged if not shielded). */
export function shieldGroups(targetActor, groups) {
  if (!shield || shield.mode !== "outside" || !targetActor || targetActor.uuid !== shield.uuid) return groups;
  const out = [];
  for (const g of groups) {
    const a = Math.min(shield.absorb, num(g));
    shield.absorbed += a;
    if (num(g) - a > 0) out.push(num(g) - a);
  }
  return out;
}

/**
 * Damage to a conventional infantry platoon after the shielding building
 * takes its share: { points, absorbed, line } (points unchanged if not shielded).
 * @param {number} points  damage to the platoon (troopers), `hits` separate hits
 */
export function shieldPlatoon(targetActor, points, hits = 1) {
  const p = Math.max(0, num(points));
  if (!shield || !targetActor || targetActor.uuid !== shield.uuid || p <= 0) return { points: p, absorbed: 0, line: "" };
  const name = shield.rec.region?.name || "the building";
  const absorbed = shield.mode === "outside" ? Math.min(p, shield.absorb * Math.max(1, hits)) : Math.min(p, Math.round(p * shield.share));
  shield.absorbed += absorbed;
  const line = !absorbed ? "" : shield.mode === "outside"
    ? `Inside ${name}: it absorbs ${absorbed} (${shield.absorb} per hit): ${p} → ${p - absorbed}`
    : `Firing between floors of ${name}: it absorbs ${Math.round(shield.share * 100)}% (${absorbed}): ${p} → ${p - absorbed}`;
  return { points: p - absorbed, absorbed, line };
}

/* -------------------------------------------- */
/*  Missed shots at a unit inside a building    */
/* -------------------------------------------- */

/**
 * A missed attack on the shielded unit that hits the building instead (TW
 * p. 171: weapon fire from an adjacent hex at a non-infantry unit; any missed
 * physical attack). Returns the damage taken by the building (0 if not shielded).
 */
export function shieldMiss(targetActor, damage) {
  const d = Math.max(0, Math.round(num(damage)));
  if (!shield || !targetActor || targetActor.uuid !== shield.uuid || d <= 0) return 0;
  shield.missed = num(shield.missed) + d;
  return d;
}

/* -------------------------------------------- */
/*  A building as the target                    */
/* -------------------------------------------- */

let buildingTarget = null;

/** The building being attacked this volley: { rec, name, attacks: [damage per attack] } or null. */
export function activeBuildingTarget() {
  return buildingTarget;
}

/** Start (or clear, with null) attacking a building. */
export function setBuildingTarget(t) {
  buildingTarget = t ? { attacks: [], ...t } : null;
  return buildingTarget;
}

/**
 * Damage groups from one attack on the building target: the building takes
 * them all. Returns a damage fragment for the card (no unit hit).
 */
export function buildingTargetHit(groups) {
  const total = (groups || []).reduce((t, g) => t + Math.max(0, num(g)), 0);
  if (buildingTarget && total > 0) buildingTarget.attacks.push(total);
  return { building: true, hasTarget: false, applied: true, total, groups: (groups || []).map(d => ({ damage: num(d) })), targetName: buildingTarget?.name ?? '' };
}
