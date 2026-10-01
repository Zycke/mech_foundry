/**
 * Weapon-fire animations for unit-scale attacks ('Mechs, vehicles, fighters,
 * battle armor). Purely visual: nothing here changes a roll or the card.
 *
 * Each weapon on a unit sheet can name a Sequencer animation (a JB2A path such
 * as "jb2a.lasershot.red", with a delay between projectiles and a travel
 * time), the same way personal-scale weapon items do. A weapon without one is
 * handed to the Automated Animations module when it is active, which matches it
 * by name in its Automatic Recognition menu ("Medium Laser", "LRM" …) — unit
 * weapons are sheet rows, not Items, so they can't carry A-A's own item flags.
 *
 * Per weapon (Sequencer only): an impact effect played on the target for each
 * projectile that hits, a number of shots to draw (-1 = the rules count below)
 * and a size multiplier.
 *
 * What flies: one projectile per missile / pellet / Ultra or Rotary shot (the
 * Cluster Hits Table result decides how many land on the target), one for any
 * other weapon. Misses land just outside the target token's edge.
 * Out-of-range, jammed and Streak-no-lock shots don't animate.
 */

const num = (v) => Number(v) || 0;

/** Most projectiles drawn for one weapon (an LRM 20 draws all 20). */
const MAX_PROJECTILES = 20;
/** Most projectiles a weapon's own "Shots" setting may ask for. */
const MAX_SETTING_SHOTS = 50;
/** Pause between one weapon's animation and the next in a volley (ms). */
const WEAPON_STAGGER = 250;

/** Is the Sequencer module active? */
export function sequencerActive() {
  return typeof globalThis.Sequence !== 'undefined' && !!game.modules?.get?.('sequencer')?.active;
}

/** Is the Automated Animations module active with its API? */
export function automatedAnimationsActive() {
  return !!game.modules?.get?.('autoanimations')?.active && typeof globalThis.AutomatedAnimations?.playAnimation === 'function';
}

/**
 * How a fired shot animates: { count, hits } projectiles, or null when the
 * weapon didn't fire (out of range, jammed, a Streak without a lock).
 */
export function shotProjectiles(weapon, shot) {
  if (!shot || shot.outOfRange || shot.jammed) return null;
  if (weapon?.streak && !shot.hit) return null;
  const hr = shot.hitResult;
  const ci = hr?.clusterInfo;
  if (ci) return { count: Math.min(MAX_PROJECTILES, num(ci.size) || 1), hits: Math.min(MAX_PROJECTILES, num(ci.missiles)) };
  if (hr?.baFire) {
    const b = hr.baFire;
    const count = num(b.kind === 'missile' ? b.missiles : b.troopers) || 1;
    return { count: Math.min(MAX_PROJECTILES, count), hits: Math.min(MAX_PROJECTILES, num(b.hits)) };
  }
  const n = Math.min(MAX_PROJECTILES, Math.max(1, num(weapon?.clusterSize) || 1));
  return { count: n, hits: shot.hit ? n : 0 };
}

/**
 * Where a missed projectile lands: just outside the target token's edge — 15–50 %
 * of its radius beyond it — at a random angle, never on a line that would
 * cross the token (a shot "through" the target would read as a hit), so it
 * flies past a side or falls short.
 * @param {{x,y}} from     the attacker's centre
 * @param {{x,y}} to       the target's centre
 * @param {number} radius  the target token's radius in pixels
 */
export function missPoint(from, to, radius, rand = Math.random) {
  const R = Math.max(1, num(radius));
  const clear = (p) => segDist(to, from, p) > R;
  for (let tries = 0; tries < 24; tries++) {
    const angle = rand() * 2 * Math.PI;
    const d = R * (1.15 + 0.35 * rand());
    const p = { x: to.x + Math.cos(angle) * d, y: to.y + Math.sin(angle) * d };
    if (clear(p)) return p;
  }
  // Fallback: square to the line of fire, off one side.
  const base = Math.atan2(to.y - from.y, to.x - from.x) + (rand() < 0.5 ? 1 : -1) * Math.PI / 2;
  return { x: to.x + Math.cos(base) * R * 1.3, y: to.y + Math.sin(base) * R * 1.3 };
}

/** Distance from point p to the segment a–b. */
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The target's radius in pixels: half the larger side of its token, or half a
 * 30 m hex for a building's wall point (no token).
 */
export function targetRadius(target, pxPerMeter = 1) {
  const size = num(globalThis.canvas?.grid?.size) || 100;
  const w = num(target?.w) || num(target?.document?.width) * size;
  const h = num(target?.h) || num(target?.document?.height) * size;
  return Math.max(w, h) > 0 ? Math.max(w, h) / 2 : 15 * pxPerMeter;
}

/** Pixels per metre on the current scene (tw-scale.mjs, imported lazily to keep this leaf light). */
async function pxPerMeter() {
  try { return (await import("./tw-scale.mjs")).pixelsPerMeter() || 1; } catch { return 1; }
}

/** A real canvas token (not a building's wall point, which is only a location). */
const isToken = (t) => t?.document?.documentName === 'Token';

/**
 * The projectile count after the weapon's "Shots" setting: -1 (or blank) keeps
 * the rules count; a positive number replaces it, with the same share landing on
 * the target (at least one when anything hit, none on a miss).
 */
export function plannedProjectiles(proj, shotsSetting) {
  const n = Math.trunc(num(shotsSetting));
  if (!proj || shotsSetting === undefined || shotsSetting === '' || n <= 0) return proj;
  const count = Math.min(MAX_SETTING_SHOTS, n);
  if (!proj.hits) return { count, hits: 0 };
  return { count, hits: Math.min(count, Math.max(1, Math.round(count * proj.hits / proj.count))) };
}

/** The weapon's animation size multiplier (1 = as drawn). */
export function animationSize(weapon) {
  const v = Number(weapon?.animationSize);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/**
 * One weapon's Sequencer animation: each projectile flies (hits to the target,
 * misses just past its edge), and on a hit the impact effect plays on the
 * target as that projectile arrives. Each projectile is its own sequence, so
 * its impact waits for it alone.
 */
async function playSequencer(source, target, weapon, shot, proj, startDelay, ppm) {
  const gap = weapon.animationDelay === undefined || weapon.animationDelay === '' ? 50 : num(weapon.animationDelay);
  const size = animationSize(weapon);
  const impact = String(weapon.animationImpact ?? '').trim();
  const hitSet = new Set();
  while (hitSet.size < proj.hits) hitSet.add(Math.floor(Math.random() * proj.count));
  const to = target.center ?? target;
  const radius = targetRadius(target, ppm);
  const runs = [];
  for (let i = 0; i < proj.count; i++) {
    const hit = hitSet.has(i);
    const dest = !hit ? missPoint(source.center, to, radius) : isToken(target) ? target : to;
    const seq = new globalThis.Sequence();
    let fx = seq.effect().file(weapon.animation).atLocation(source).stretchTo(dest).delay(startDelay + i * gap);
    if (num(weapon.animationDuration) > 0) fx = fx.duration(num(weapon.animationDuration));
    if (size !== 1) fx = fx.scale(size);
    if (hit && impact) {
      // The impact starts just before the projectile's end, on the target.
      fx.waitUntilFinished(-100);
      const im = seq.effect().file(impact).atLocation(dest);
      if (isToken(target)) im.scaleToObject(size); else if (size !== 1) im.scale(size);
    }
    runs.push(seq.play());
  }
  await Promise.all(runs);
}

/**
 * Animate a resolved volley. `fired`: [{ weapon, shot }] in firing order
 * (shot = the resolveWeaponShot context). Never throws.
 */
export async function animateVolley(attackerToken, target, fired = []) {
  if (!attackerToken?.center || !(target?.center ?? (target?.x !== undefined ? target : null))) return;
  const seq = sequencerActive();
  const aa = automatedAnimationsActive();
  if (!seq && !aa) return;
  const ppm = await pxPerMeter();
  const jobs = [];
  let slot = 0;
  for (const { weapon, shot } of fired) {
    const proj = plannedProjectiles(shotProjectiles(weapon, shot), weapon.animationShots);
    if (!proj) continue;
    const startDelay = slot++ * WEAPON_STAGGER;
    try {
      if (seq && String(weapon.animation ?? '').trim()) {
        jobs.push(playSequencer(attackerToken, target, weapon, shot, proj, startDelay, ppm).catch(e => console.warn('mech-foundry | weapon animation failed', e)));
      } else if (aa && isToken(target)) {
        // A-A needs real target tokens (not a building's wall point).
        const item = { name: weapon.name, flags: {} };
        const run = () => globalThis.AutomatedAnimations.playAnimation(attackerToken, item, {
          targets: [target], hitTargets: proj.hits > 0 ? [target] : [], playOnMiss: true
        });
        jobs.push(new Promise(res => setTimeout(res, startDelay)).then(run).catch(e => console.warn('mech-foundry | Automated Animations failed', e)));
      }
    } catch (e) {
      console.warn('mech-foundry | weapon animation failed', e);
    }
  }
  await Promise.all(jobs);
}
