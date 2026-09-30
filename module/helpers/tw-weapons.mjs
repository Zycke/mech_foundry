/**
 * Per-weapon special rules (Total Warfare; details checked against MegaMek's
 * weapon handlers):
 *
 * - Ultra autocannon: single or double rate. Double rate spends 2 shots and 2×
 *   heat; on a hit the Cluster Hits Table's 2 column gives 1 or 2 hits, each its
 *   own hit location. A natural 2 on the to-hit roll at double rate jams it for
 *   the rest of the game.
 * - Rotary autocannon: 1–6 shots (ammo and heat per shot), cluster column = shots.
 *   Jams on a natural to-hit roll of 2 (2–3 shots), ≤3 (4–5) or ≤4 (6). A jammed
 *   RAC can be unjammed instead of attacking: 2D6 ≥ Gunnery + 3.
 * - LB-X autocannon: slug (a normal autocannon) or cluster ammunition: −1 to-hit,
 *   Cluster Hits Table by the cannon's size, 1 point per pellet.
 * - Artemis IV / V fire control: +2 / +3 on the cluster roll (LRM, SRM, MML).
 *   Narc-capable missiles: +2 against a target carrying a Narc pod.
 * - Anti-missile system: automatically engages the first missile attack against
 *   its unit each turn (one attack per AMS): −4 on the cluster roll (a Streak
 *   rolls as 11 − 4 = 7), 1 shot of ammo and its heat.
 * - Flamer (against a unit that tracks heat): damage, or heat mode — the target
 *   gains heat equal to the damage (ER flamers half, minimum 1) instead.
 *   External heat is capped at 15 per turn.
 * - Narc / iNarc: a hit attaches a pod (no damage). TAG: a hit designates the
 *   target for this turn.
 * - One-shot weapons fire once, then are spent.
 * - Special munitions, each counted apart from the weapon's standard rounds
 *   (a blank count = none carried; MegaMek's rules):
 *   - Inferno SRM: no damage. Each missile that hits (cluster roll) adds 2 heat
 *     to a 'Mech or fighter (external heat, 15 a turn at most); against a
 *     vehicle each missile rolls on the critical hits table at −2; battle armor
 *     takes 1 damage per 3 missiles; conventional infantry lose 3 troopers per
 *     missile (every missile hits); a building takes 2 per missile.
 *   - Semi-guided LRM: against a target TAG-designated this turn, the target
 *     movement modifier doesn't apply.
 *   - Precision AC: the target movement modifier is reduced by up to 2.
 *   - Armor-piercing AC: +1 to-hit; a hit the armor stops still rolls for a
 *     critical hit, at −4 (AC/2), −3 (AC/5), −2 (AC/10) or −1 (AC/20).
 * The cluster roll is clamped to 2–12 after modifiers.
 */

const num = (v) => Number(v) || 0;

/** Rules family of a weapon, by name. */
export function weaponKind(w) {
  const n = String(w?.name ?? '');
  if (/\brotary\b|\bRAC\s*\/?\s*\d/i.test(n)) return 'rotary';
  if (/\bultra\b|\bUAC\s*\/?\s*\d/i.test(n)) return 'ultra';
  if (/\bLB\s*-?\s*\d+\s*-?\s*X\b/i.test(n)) return 'lbx';
  if (/anti-?missile|\bAMS\b/i.test(n)) return 'ams';
  if (/flamer/i.test(n)) return 'flamer';
  if (/narc/i.test(n) && !/capable/i.test(n)) return 'narc';
  if (/\bTAG\b/.test(n)) return 'tag';
  return 'plain';
}

/** Missile launchers that take Artemis / Narc guidance (LRM, SRM, MML — not Streak, ATM, MRM). */
export function guidable(w) {
  const n = String(w?.name ?? '');
  return num(w?.clusterSize) > 0 && !w?.streak && /\b(LRM|SRM|MML)\b|\bLR[MT]\s*\d|\bSR[MT]\s*\d/i.test(n) && !/streak/i.test(n);
}

/** Missile attacks an anti-missile system can engage (cluster missiles, incl. Streak; not LB-X or mortars). */
export function isMissileAttack(w) {
  const kind = weaponKind(w);
  if (['lbx', 'ultra', 'rotary', 'narc', 'tag', 'ams', 'flamer'].includes(kind)) return false;
  return num(w?.clusterSize) > 0 && !/mortar|rocket launcher|\bRL\b/i.test(String(w?.name ?? ''));
}

/** LB-X size (its cluster column): "LB 10-X AC" → 10. */
export function lbxSize(w) {
  const m = String(w?.name ?? '').match(/LB\s*-?\s*(\d+)/i);
  return m ? num(m[1]) : num(w?.damage);
}

/**
 * Fire-dialog modes for a weapon: [{ value, label }] (first is the default),
 * or [] when it has only one way to fire.
 */
export function fireModes(w, targetActor = null) {
  switch (weaponKind(w)) {
    case 'ultra': return [{ value: '1', label: 'Single' }, { value: '2', label: 'Double rate (2 shots)' }];
    case 'rotary': return [1, 2, 3, 4, 5, 6].map(n => ({ value: String(n), label: `${n} shot${n === 1 ? '' : 's'}` }));
    case 'lbx': return [{ value: 'slug', label: 'Slug' }, { value: 'cluster', label: 'Cluster (−1)' }];
    case 'flamer': return tracksHeat(targetActor) || !targetActor ? [{ value: 'damage', label: 'Damage' }, { value: 'heat', label: 'Heat' }] : [];
    default: return munitionModes(w);
  }
}

/* -------------------------------------------- */
/*  Special munitions                           */
/* -------------------------------------------- */

const isSRM = (n) => /\bSRM\s*-?\s*\d|\bSRM\b|\bMML\b/i.test(n) && !/streak|torpedo|\bSRT/i.test(n);
const isLRM = (n) => /\bLRM\s*-?\s*\d|\bLRM\b|\bMML\b/i.test(n) && !/streak|torpedo|\bLRT/i.test(n);
// Standard, light and ProtoMech autocannons (not Ultra / Rotary / LB-X / hyper-velocity).
const isStandardAC = (w) => weaponKind(w) === 'plain' && /\bAC\s*\/?\s*\d|autocannon|\bLAC\b|\bPAC\b/i.test(String(w?.name ?? ''))
  && !/hyper|\bHVAC|ultra|rotary|\bLB\b/i.test(String(w?.name ?? ''));

/** Special munitions: the weapon field holding its shots, and which weapons fire it. */
export const MUNITIONS = {
  inferno: { field: 'infernoAmmo', label: 'Inferno', short: 'Inf', applies: (w) => guidable(w) && isSRM(String(w?.name ?? '')) },
  semiguided: { field: 'sgAmmo', label: 'Semi-guided', short: 'SG', applies: (w) => guidable(w) && isLRM(String(w?.name ?? '')) },
  precision: { field: 'precisionAmmo', label: 'Precision', short: 'Prec', applies: isStandardAC },
  ap: { field: 'apAmmo', label: 'Armor-piercing', short: 'AP', applies: isStandardAC }
};

/** Munitions this weapon can fire: [key]. */
export function munitionKeys(w) {
  return Object.keys(MUNITIONS).filter(k => MUNITIONS[k].applies(w));
}

/** Shots of a special munition the weapon carries, or null when it carries none (blank). */
export function munitionShots(w, key) {
  const v = w?.[MUNITIONS[key]?.field];
  return v === undefined || v === null || String(v).trim() === '' ? null : num(v);
}

/** The munition a fire mode selects ('inferno' …), or null for standard rounds. */
export function munitionOf(w, mode) {
  return MUNITIONS[mode] && MUNITIONS[mode].applies(w) ? mode : null;
}

/**
 * Fire-dialog choices for a weapon carrying special munitions with shots left:
 * standard rounds (while they last) first, then each munition.
 */
function munitionModes(w) {
  const special = munitionKeys(w).filter(k => num(munitionShots(w, k)) > 0)
    .map(k => ({ value: k, label: `${MUNITIONS[k].label}${k === 'ap' ? ' (+1)' : ''} (${munitionShots(w, k)})` }));
  if (!special.length) return [];
  return num(w?.ammo) > 0 ? [{ value: 'std', label: `Standard (${num(w.ammo)})` }, ...special] : special;
}

/** Any ammunition left for the weapon (standard, LB-X cluster or a special munition)? */
export function hasAnyAmmo(w) {
  if (num(w?.ammo) > 0) return true;
  if (weaponKind(w) === 'lbx' && num(w?.clusterAmmo) > 0) return true;
  return munitionKeys(w).some(k => num(munitionShots(w, k)) > 0);
}

/** Armor-piercing critical roll modifier by autocannon size (−4 AC/2 … −1 AC/20). */
export function apCritMod(w) {
  const m = String(w?.name ?? '').match(/(\d+)/);
  const size = m ? num(m[1]) : num(w?.damage);
  if (size <= 2) return -4;
  if (size <= 6) return -3;
  if (size <= 15) return -2;
  return -1;
}

/**
 * To-hit changes from the munition: armor-piercing +1; precision takes up to 2
 * off the target movement modifier; semi-guided cancels it against a TAG-designated target.
 * @param {number} targetMove  the target movement modifier in the attack
 */
export function munitionToHit(w, mode, { targetMove = 0, tagged = false } = {}) {
  const m = munitionOf(w, mode);
  if (m === 'ap') return [{ label: 'Armor-piercing ammunition', value: 1 }];
  if (m === 'precision' && targetMove > 0) return [{ label: 'Precision ammunition', value: -Math.min(2, targetMove) }];
  if (m === 'semiguided' && tagged && targetMove > 0) return [{ label: 'Semi-guided vs TAG', value: -targetMove }];
  return [];
}

/** Shots a firing spends (ammo and heat multiply by this). */
export function shotsFor(w, mode) {
  const kind = weaponKind(w);
  if (kind === 'ultra' || kind === 'rotary') return Math.max(1, Math.min(kind === 'ultra' ? 2 : 6, num(mode) || 1));
  return 1;
}

/** Does the attack jam the weapon? (natural = the unmodified 2D6 to-hit roll) */
export function jams(w, mode, natural) {
  const kind = weaponKind(w);
  const shots = shotsFor(w, mode);
  if (kind === 'ultra') return shots === 2 && natural === 2;
  if (kind === 'rotary') return natural <= racJamThreshold(shots);
  return false;
}

/** Rotary AC jam threshold by shots fired (MegaMek RACHandler). */
export function racJamThreshold(shots) {
  return shots >= 6 ? 4 : shots >= 4 ? 3 : shots >= 2 ? 2 : 0;
}

/** Target number to unjam a Rotary AC (MegaMek: Gunnery + 3). */
export function unjamTarget(gunnery) {
  return num(gunnery) + 3;
}

/** The weapon's to-hit modifier from its mode / ammunition (LB-X cluster −1). */
export function modeToHit(w, mode) {
  return weaponKind(w) === 'lbx' && mode === 'cluster' ? -1 : 0;
}

/** Does this unit track heat (flamer heat mode, external heat)? */
export function tracksHeat(actor) {
  return ['mech', 'aerospace_fighter', 'small_craft'].includes(actor?.type);
}

/** Heat a flamer in heat mode adds (ER flamers half, minimum 1). */
export function flamerHeat(w) {
  const d = num(w?.damage);
  return /\bER\b/i.test(String(w?.name ?? '')) ? Math.max(1, Math.floor(d / 2)) : d;
}

export const EXTERNAL_HEAT_CAP = 15;

/**
 * Cluster-roll modifiers for a missile launcher: Artemis IV +2 / V +3 and
 * Narc-capable +2 against a Narc-tagged target — unless enemy ECM stops them
 * (`ew`: { artemisECM, narcECM } from the fire dialog; tw-ecm.mjs).
 * @returns {Array<{label, value}>}
 */
export function guidanceMods(w, targetActor, ew = null) {
  if (!guidable(w)) return [];
  const g = w?.guidance || '';
  if (g === 'artemis4' && !ew?.artemisECM) return [{ label: 'Artemis IV', value: 2 }];
  if (g === 'artemis5' && !ew?.artemisECM) return [{ label: 'Artemis V', value: 3 }];
  if (g === 'narc' && narcPods(targetActor).length && !ew?.narcECM) return [{ label: 'Narc pod on target', value: 2 }];
  return [];
}

/** The card note when enemy ECM cancels a launcher's guidance bonus, or ''. */
export function guidanceLost(w, targetActor, ew = null) {
  if (!guidable(w)) return '';
  const g = w?.guidance || '';
  if (/^artemis/.test(g) && ew?.artemisECM) return `Enemy ECM on the line of fire: no ${g === 'artemis5' ? 'Artemis V' : 'Artemis IV'} bonus.`;
  if (g === 'narc' && narcPods(targetActor).length && ew?.narcECM) return 'Enemy ECM covers the target: no Narc bonus.';
  return '';
}

/** Cluster roll after modifiers, clamped to 2–12. */
export function clusterRollTotal(roll, mods = []) {
  return Math.max(2, Math.min(12, num(roll) + mods.reduce((t, m) => t + num(m.value), 0)));
}

/** Narc pods attached to a unit: [{ by, loc }]. */
export function narcPods(actor) {
  const list = actor?.flags?.['mech-foundry']?.narc;
  return Array.isArray(list) ? list : [];
}

/** Is the unit TAG-designated this turn? */
export function taggedThisTurn(actor, turnKey) {
  return !!turnKey && actor?.flags?.['mech-foundry']?.tagged?.key === turnKey;
}

/** AMS ids already used this turn. */
export function amsUsedThisTurn(actor, turnKey) {
  const rec = actor?.flags?.['mech-foundry']?.amsUsed;
  return rec && rec.key === turnKey ? (rec.ids || []) : [];
}

/**
 * The target's anti-missile system able to engage now: working, with ammunition
 * (laser AMS needs none) and not yet used this turn. Null if none.
 */
export function readyAMS(targetActor, turnKey) {
  if (!targetActor || targetActor.system?.conditions?.shutdown) return null;
  const used = amsUsedThisTurn(targetActor, turnKey);
  return (targetActor.system?.weapons || []).find(w => weaponKind(w) === 'ams' && !w.destroyed && !used.includes(w.id)
    && (/laser/i.test(w.name || '') || !String(w.ammoType || '').trim() || num(w.ammo) > 0)) || null;
}

/** External heat already taken this turn. */
export function externalHeat(actor, turnKey) {
  const rec = actor?.flags?.['mech-foundry']?.externalHeat;
  return rec && rec.key === turnKey ? num(rec.value) : 0;
}
