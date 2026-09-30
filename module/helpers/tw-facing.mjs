/**
 * Facing, firing arcs and attack direction on gridless (metric) scenes.
 *
 * A unit's facing is one of six hexside directions (0 = the token art's "up",
 * then clockwise in 60° steps), read from the token's rotation. Geometry follows
 * MegaMek's ComputeArc / Entity.sideTable, with angles measured clockwise from
 * straight ahead:
 *
 * - Firing arcs: forward 300–60°; left arm 240–60°, right arm 300–120°; rear
 *   120–240°; vehicle sides 60–120° (right) and 240–300° (left); aerospace nose
 *   300–60°, left wing 300–0°, right wing 0–60°, aft 120–240°; turrets, battle
 *   armor and infantry all round (a locked turret fires forward).
 * - Attack direction on a 'Mech: front 270–90°, right 90–150°, rear 150–210°,
 *   left 210–270°. On vehicles and aerospace units: front 330–30°, right
 *   30–150°, rear 150–210°, left 210–330°.
 * - A 'Mech may twist its torso one hexside left or right in the Weapon Attack
 *   Phase: torso and arm weapons (not leg weapons) turn with it.
 * - Facing changes cost 1 MP per hexside for 'Mechs and ground vehicles (not
 *   when jumping); infantry and battle armor turn freely.
 */

const num = (v) => Number(v) || 0;
export const HEXSIDE = 60;

/** Degrees the token art faces at rotation 0 (world setting: 0 = up, 90 = right …). */
export function artOffset() {
  try { return num(game.settings.get("mech-foundry", "tokenFacingOffset")); } catch { return 0; }
}

/** Bearing from one point to another: degrees clockwise from straight up (screen north). */
export function bearing(from, to) {
  const d = Math.atan2(num(to.x) - num(from.x), -(num(to.y) - num(from.y))) * 180 / Math.PI;
  return (d + 360) % 360;
}

/** The nearest of the six facings (0–5) to a bearing. */
export function snapFacing(deg) {
  return ((Math.round(((num(deg) % 360) + 360) % 360 / HEXSIDE) % 6) + 6) % 6;
}

/** A token's facing (0–5) from its rotation. */
export function tokenFacing(doc, offset = artOffset()) {
  return snapFacing(num(doc?.rotation) + offset);
}

/** The token rotation for a facing. */
export function facingRotation(facing, offset = artOffset()) {
  return (((num(facing) * HEXSIDE - offset) % 360) + 360) % 360;
}

/** Hexsides turned between two facings (0–3). */
export function hexsideTurns(from, to) {
  const d = (((num(to) - num(from)) % 6) + 6) % 6;
  return Math.min(d, 6 - d);
}

/** Do facing changes cost this unit MP? ('Mechs and ground vehicles; not when jumping.) */
export function turnsCostMP(actor, mode = '') {
  return ['mech', 'ground_vehicle'].includes(actor?.type) && mode !== 'jumped';
}

/**
 * Facing changes along a movement path of points (canvas px): each leg faces
 * its direction of travel; a leg straight back is backing up (facing kept).
 * Legs shorter than `minPx` (jitter) are ignored.
 * @returns {{ turns: number, backward: number, facing: number }} backward = legs backed up
 */
export function pathFacing(startFacing, points, { minPx = 4, hold = false } = {}) {
  let facing = startFacing, turns = 0, backward = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) < minPx) continue;
    const dir = snapFacing(bearing(a, b));
    if (dir === (facing + 3) % 6) { backward++; continue; }
    if (hold) continue; // facing kept (Alt): no turns
    turns += hexsideTurns(facing, dir);
    facing = dir;
  }
  return { turns, backward, facing };
}

/** Angle of `to` as seen from `from` with the given facing: 0 = dead ahead, clockwise. */
export function relativeAngle(from, facing, to) {
  return (((bearing(from, to) - num(facing) * HEXSIDE) % 360) + 360) % 360;
}

const ARC_TEST = {
  all: () => true,
  forward: (fa) => fa >= 300 || fa <= 60,
  leftArm: (fa) => fa >= 240 || fa <= 60,
  rightArm: (fa) => fa >= 300 || fa <= 120,
  rear: (fa) => fa > 120 && fa < 240,
  leftSide: (fa) => fa >= 240 && fa < 300,
  rightSide: (fa) => fa > 60 && fa <= 120,
  nose: (fa) => fa > 300 || fa < 60,
  leftWing: (fa) => fa > 300 || fa <= 0,
  rightWing: (fa) => fa >= 0 && fa < 60,
  // A push: only the hex directly ahead of the feet (±30° gridless).
  ahead: (fa) => fa >= 330 || fa <= 30
};
const ARC_LABEL = {
  all: 'all round', forward: 'forward arc', leftArm: 'left-arm arc', rightArm: 'right-arm arc', rear: 'rear arc',
  leftSide: 'left-side arc', rightSide: 'right-side arc', nose: 'nose arc', leftWing: 'left-wing arc', rightWing: 'right-wing arc',
  ahead: 'hex directly ahead of its feet'
};

/** Is an angle (relativeAngle) inside a firing arc? */
export function inArc(arc, fa) {
  return (ARC_TEST[arc] || ARC_TEST.all)(((num(fa) % 360) + 360) % 360);
}

/** Where the target lies relative to a unit, in words ("left side", "rear" …). */
export function whereIs(fa, mech = true) {
  return attackSideFromAngle(fa, mech);
}

/**
 * A weapon's firing arc and whether it turns with the torso:
 * { arc, twists }. Locations as the sheets write them.
 */
export function weaponArc(actor, weapon) {
  const loc = String(weapon?.location ?? weapon?.arc ?? '').trim().toLowerCase();
  const t = actor?.type;
  if (t === 'battle_armor' || t === 'infantry') return { arc: 'all', twists: false };
  if (t === 'mech') {
    const rear = /\(r\)|rear/.test(loc) || !!weapon?.rear;
    if (/^(ll|rl|left leg|right leg)\b/.test(loc)) return { arc: rear ? 'rear' : 'forward', twists: false };
    if (rear) return { arc: 'rear', twists: true };
    if (/^(la|left arm)\b/.test(loc)) return { arc: 'leftArm', twists: true };
    if (/^(ra|right arm)\b/.test(loc)) return { arc: 'rightArm', twists: true };
    return { arc: 'forward', twists: true };
  }
  if (t === 'ground_vehicle') {
    if (/^(t|tur|turret)/.test(loc)) return { arc: actor.system?.crits?.turretLocked ? 'forward' : 'all', twists: false };
    if (/^(rear|rr|back|aft)$/.test(loc)) return { arc: 'rear', twists: false };
    if (/^(left|l|ls|left side|lside)$/.test(loc)) return { arc: 'leftSide', twists: false };
    if (/^(right|r|rs|right side|rside)$/.test(loc)) return { arc: 'rightSide', twists: false };
    if (/^(body|hull|rotor)$/.test(loc)) return { arc: 'all', twists: false };
    return { arc: 'forward', twists: false };
  }
  if (t === 'aerospace_fighter' || t === 'small_craft') {
    if (/aft|rear/.test(loc)) return { arc: 'rear', twists: false };
    if (/left\s*wing|^lw$/.test(loc)) return { arc: 'leftWing', twists: false };
    if (/right\s*wing|^rw$/.test(loc)) return { arc: 'rightWing', twists: false };
    return { arc: 'nose', twists: false };
  }
  return { arc: 'all', twists: false };
}

/** This turn's torso twist (−1 left, 0, +1 right). */
export function torsoTwist(actor, turnKey) {
  const rec = actor?.flags?.['mech-foundry']?.twist;
  return turnKey && rec?.key === turnKey ? Math.max(-1, Math.min(1, num(rec.dir))) : 0;
}

/**
 * Can this weapon bear on the target? { ok, arc, label, why }.
 * @param {object} o  { actor, weapon, from (attacker centre), facing, to (target centre), twist }
 */
export function arcCheck({ actor, weapon, from, facing, to, twist = 0 }) {
  const { arc, twists } = weaponArc(actor, weapon);
  if (arc === 'all') return { ok: true, arc, label: ARC_LABEL.all, why: '' };
  const f = (facing + (twists ? twist : 0) + 6) % 6;
  const fa = relativeAngle(from, f, to);
  const ok = inArc(arc, fa);
  return { ok, arc, label: ARC_LABEL[arc], why: ok ? '' : `target is in the ${arcZone(fa)}, outside the weapon's ${ARC_LABEL[arc]}` };
}

/** The firing-arc zone an angle falls in: forward, right-side, rear or left-side arc. */
export function arcZone(fa) {
  const a = ((num(fa) % 360) + 360) % 360;
  if (a >= 300 || a <= 60) return 'forward arc';
  if (a <= 120) return 'right-side arc';
  if (a < 240) return 'rear arc';
  return 'left-side arc';
}

/** Attack direction from the angle of the attacker as seen by the target ('Mech or vehicle table). */
export function attackSideFromAngle(fa, mech = true) {
  const a = ((num(fa) % 360) + 360) % 360;
  if (mech) {
    if (a > 90 && a <= 150) return 'right';
    if (a > 150 && a < 210) return 'rear';
    if (a >= 210 && a < 270) return 'left';
    return 'front';
  }
  if (a > 30 && a <= 150) return 'right';
  if (a > 150 && a < 210) return 'rear';
  if (a >= 210 && a < 330) return 'left';
  return 'front';
}

/**
 * Attack direction against a target: which side of it the attacker is on,
 * from the target's facing. Infantry have no sides (front).
 */
export function attackSide(targetActor, targetFacing, targetPos, attackerPos) {
  if (!targetActor || ['infantry', 'battle_armor'].includes(targetActor.type)) return 'front';
  const fa = relativeAngle(targetPos, targetFacing, attackerPos);
  return attackSideFromAngle(fa, targetActor.type === 'mech');
}

/** Arc sectors to draw for a unit: [{ from, to, kind }] in degrees relative to facing (clockwise). */
export function arcSectors(actor) {
  switch (actor?.type) {
    case 'mech': return [{ from: 300, to: 420, kind: 'forward' }, { from: 240, to: 300, kind: 'side' }, { from: 60, to: 120, kind: 'side' }, { from: 120, to: 240, kind: 'rear' }];
    case 'ground_vehicle': return [{ from: 300, to: 420, kind: 'forward' }, { from: 240, to: 300, kind: 'side' }, { from: 60, to: 120, kind: 'side' }, { from: 120, to: 240, kind: 'rear' }];
    case 'aerospace_fighter': case 'small_craft': return [{ from: 300, to: 420, kind: 'forward' }, { from: 120, to: 240, kind: 'rear' }];
    default: return [];
  }
}

/**
 * A 'Mech physical attack's arc (MegaMek Punch / Kick / Club / Push attack
 * actions): { arc, twists } — twists: measured from the torso (a twist turns
 * it) rather than the legs. Charges and death from above have none (null).
 * @param {string} type       punchL, punchR, kick, club, push, weapon, charge, dfa
 * @param {object} opts       { arm: 'la' | 'ra', forward: a two-handed / forward-only physical weapon }
 */
export function physicalArc(type, { arm = null, forward = false } = {}) {
  switch (type) {
    case 'punchL': return { arc: 'leftArm', twists: true };
    case 'punchR': return { arc: 'rightArm', twists: true };
    case 'club': return { arc: 'forward', twists: true };
    case 'weapon': return forward ? { arc: 'forward', twists: true } : { arc: arm === 'la' ? 'leftArm' : 'rightArm', twists: true };
    case 'kick': return { arc: 'forward', twists: false };
    case 'push': return { arc: 'ahead', twists: false };
    default: return null;
  }
}

/**
 * Can this physical attack reach the target? { ok, arc, label, why }.
 * @param {object} o  { type, arm, forward, from, facing (legs), to, twist }
 */
export function physicalArcCheck({ type, arm = null, forward = false, from, facing, to, twist = 0 }) {
  const pa = physicalArc(type, { arm, forward });
  if (!pa || !from || !to) return { ok: true, arc: pa?.arc ?? 'all', label: '', why: '' };
  const f = (num(facing) + (pa.twists ? num(twist) : 0) + 6) % 6;
  const fa = relativeAngle(from, f, to);
  const ok = inArc(pa.arc, fa);
  const from2 = pa.twists ? (twist ? "the torso's" : 'its') : "its legs'";
  return { ok, arc: pa.arc, label: ARC_LABEL[pa.arc],
    why: ok ? '' : `the target is in the ${arcZone(fa)} (${from2} facing), outside the ${ARC_LABEL[pa.arc]}` };
}
