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
 * What flies: one projectile per missile / pellet / Ultra or Rotary shot (the
 * Cluster Hits Table result decides how many land on the target), one for any
 * other weapon. Misses land off to the side, farther for a bigger miss.
 * Out-of-range, jammed and Streak-no-lock shots don't animate.
 */

const num = (v) => Number(v) || 0;

/** Most projectiles drawn for one weapon (an LRM 20 draws all 20). */
const MAX_PROJECTILES = 20;
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
 * Where a missed projectile lands: past or beside the target, 15 m plus 10 m
 * for each point it missed by (at most 60 m), within 60° of straight on.
 */
export function missPoint(from, to, margin = 1, pxPerMeter = 1, rand = Math.random) {
  const meters = Math.min(60, 15 + 10 * Math.max(0, num(margin)));
  const base = Math.atan2(to.y - from.y, to.x - from.x);
  const angle = base + (rand() * 2 - 1) * Math.PI / 3;
  const d = meters * (0.6 + 0.4 * rand()) * pxPerMeter;
  return { x: to.x + Math.cos(angle) * d, y: to.y + Math.sin(angle) * d };
}

/** Pixels per metre on the current scene (tw-scale.mjs, imported lazily to keep this leaf light). */
async function pxPerMeter() {
  try { return (await import("./tw-scale.mjs")).pixelsPerMeter() || 1; } catch { return 1; }
}

/** A real canvas token (not a building's wall point, which is only a location). */
const isToken = (t) => t?.document?.documentName === 'Token';

/** One weapon's Sequencer animation: every projectile, hits to the target, misses scattered. */
async function playSequencer(source, target, weapon, shot, proj, startDelay, ppm) {
  const seq = new globalThis.Sequence();
  const gap = weapon.animationDelay === undefined || weapon.animationDelay === '' ? 50 : num(weapon.animationDelay);
  const hitSet = new Set();
  while (hitSet.size < proj.hits) hitSet.add(Math.floor(Math.random() * proj.count));
  const to = target.center ?? target;
  for (let i = 0; i < proj.count; i++) {
    const dest = !hitSet.has(i) ? missPoint(source.center, to, shot.margin, ppm) : isToken(target) ? target : to;
    let fx = seq.effect().file(weapon.animation).atLocation(source).stretchTo(dest).delay(startDelay + i * gap);
    if (num(weapon.animationDuration) > 0) fx = fx.duration(num(weapon.animationDuration));
  }
  await seq.play();
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
    const proj = shotProjectiles(weapon, shot);
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
