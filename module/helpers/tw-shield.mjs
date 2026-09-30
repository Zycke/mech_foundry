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
