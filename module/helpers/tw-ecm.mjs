/**
 * Electronic warfare on the map (Total Warfare; details checked against MegaMek
 * ComputeECM / ComputeC3Spotter / ComputeTerrainMods): ECM suites, active
 * probes and C3 networks. What a unit carries comes from tw-gear.mjs.
 *
 * Sides: Foundry token disposition. Units are enemies when their dispositions
 * differ (a secret token counts as hostile).
 *
 * - ECM suite: a 6-hex bubble around the unit (not while shut down or destroyed).
 *   Against an enemy's attack, an ECM bubble over any hex on the line from the
 *   attacker to the target cancels Artemis IV / V; one over the target's hex
 *   cancels the Narc-capable missile bonus. A unit inside an enemy ECM bubble
 *   drops out of its C3 network, and an active probe can't see through one.
 * - Active probe (Beagle 4, Clan 5, Bloodhound 8, light 3 hexes): −1 to-hit
 *   against a target in or behind woods within the probe's range (a C3
 *   network mate's probe counts too).
 * - C3: units sharing a network name on their sheets (and a side) fire with the
 *   range bracket of the member closest to the target that can see it — the
 *   attacker's own distance still sets the minimum range modifier and whether
 *   the target is in range at all. A standard network needs a working C3
 *   master; a C3i network is C3i units only. A member inside an enemy ECM
 *   bubble, or whose link to the master crosses one, is cut off.
 */
import { unitGear } from "./tw-gear.mjs";
import { GROUND_HEX_M, pixelsPerMeter } from "./tw-scale.mjs";
import { mapAttackTerrain, unitElevation } from "./tw-terrain.mjs";
import { unitDestroyed } from "./tw-status.mjs";

const num = (v) => Number(v) || 0;

/** A token's side from its disposition: hostile and secret both count as hostile. */
export function sideOf(token) {
  const d = token?.document?.disposition ?? token?.disposition ?? 0;
  return d === -2 ? -1 : num(d);
}

/** Are two tokens on opposing sides? */
export const opposed = (a, b) => sideOf(a) !== sideOf(b);

const centerOf = (t) => t?.center ?? null;
const sceneTokens = () => globalThis.canvas?.tokens?.placeables ?? [];
const pxHex = () => pixelsPerMeter() * GROUND_HEX_M;

/** Can this unit's electronics work now (not shut down or destroyed)? */
function operating(actor) {
  return !!actor && !actor.system?.conditions?.shutdown && !unitDestroyed(actor);
}

/** Working ECM suites on the scene: [{ token, name, range (hexes), side }]. */
export function ecmSources(tokens = sceneTokens()) {
  const out = [];
  for (const t of tokens) {
    const a = t?.actor;
    if (!a || !centerOf(t) || !operating(a)) continue;
    const ecm = unitGear(a).ecm;
    if (ecm?.working) out.push({ token: t, name: a.name, range: num(ecm.range) || 6, side: sideOf(t) });
  }
  return out;
}

/** Distance from point p to the segment a–b (pixels). */
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The enemy ECM (to `side`) covering any hex on the line from a to b — a single
 * hex when b is omitted — or null. A hex is covered within the suite's range
 * (hex distances round like the rest of the system's map measurement).
 */
export function enemyECM(side, a, b = a, { sources = ecmSources(), pxPerHex = pxHex() } = {}) {
  if (!a || !b || !(pxPerHex > 0)) return null;
  for (const s of sources) {
    if (s.side === side) continue;
    if (segDist(centerOf(s.token), a, b) / pxPerHex < s.range + 0.5) return s;
  }
  return null;
}

/** Hex distance between two tokens. */
function hexDist(a, b, pxPerHex = pxHex()) {
  const p = centerOf(a), q = centerOf(b);
  return p && q && pxPerHex > 0 ? Math.floor(Math.hypot(q.x - p.x, q.y - p.y) / pxPerHex + 0.5 + 1e-9) : null;
}

/**
 * The C3 network a unit belongs to right now: { role, name, members: [token] }
 * (members include the unit itself), or null when it has no working link.
 */
export function c3Network(token, { tokens = sceneTokens(), sources = ecmSources(tokens), pxPerHex = pxHex() } = {}) {
  const actor = token?.actor;
  const own = actor && operating(actor) ? unitGear(actor).c3 : null;
  if (!own?.working || !own.network) return null;
  const side = sideOf(token);
  const all = tokens.filter(t => {
    if (!t?.actor || !centerOf(t) || sideOf(t) !== side || !operating(t.actor)) return false;
    const c3 = unitGear(t.actor).c3;
    return c3?.working && c3.network === own.network && (c3.role === 'c3i') === (own.role === 'c3i');
  });
  if (!all.some(t => t === token)) all.push(token);
  // Standard C3 needs a working master; every member links to it.
  const master = own.role === 'c3i' ? null : all.find(t => unitGear(t.actor).c3.role === 'master');
  if (own.role !== 'c3i' && !master) return null;
  const linked = (t) => !enemyECM(side, centerOf(t), undefined, { sources, pxPerHex })
    && (!master || t === master || !enemyECM(side, centerOf(t), centerOf(master), { sources, pxPerHex }));
  if (!linked(token)) return null;
  const members = all.filter(linked);
  // Network sizes: a master and 3 slaves (a company with more masters); C3i 6 units.
  return { role: own.role, name: own.network, members, master: master ?? null, full: own.role === 'c3i' ? members.length > 6 : false };
}

/**
 * The network mate that lends its range: the closest (to the target) linked
 * member with line of sight, closer than the attacker. { token, name, range } or null.
 */
export function c3Spotter(attackerToken, targetToken, opts = {}) {
  const net = c3Network(attackerToken, opts);
  if (!net || !targetToken) return null;
  const pxPerHex = opts.pxPerHex ?? pxHex();
  const own = hexDist(attackerToken, targetToken, pxPerHex);
  let best = null;
  for (const t of net.members) {
    if (t === attackerToken || t === targetToken) continue;
    const d = hexDist(t, targetToken, pxPerHex);
    if (d == null || d >= (best?.range ?? own ?? Infinity)) continue;
    // Line of sight from the spotter, levels included (no terrain regions: clear).
    const map = mapAttackTerrain(t.actor, targetToken.actor, centerOf(t), centerOf(targetToken), {
      pxPerHex, attackerElevation: unitElevation(t.actor, t.document), targetElevation: unitElevation(targetToken.actor, targetToken.document) });
    if (map?.line?.blocked) continue;
    best = { token: t, name: t.actor?.name ?? t.name ?? '', range: d };
  }
  return best;
}

/**
 * A working active probe that reaches the target (the attacker's, or a C3
 * network mate's), not looking through enemy ECM: { name, owner } or null.
 */
export function probeReaching(attackerToken, targetToken, opts = {}) {
  if (!attackerToken?.actor || !targetToken) return null;
  const sources = opts.sources ?? ecmSources(opts.tokens);
  const pxPerHex = opts.pxPerHex ?? pxHex();
  const net = c3Network(attackerToken, { ...opts, sources, pxPerHex });
  const candidates = [attackerToken, ...(net?.members ?? []).filter(t => t !== attackerToken)];
  for (const t of candidates) {
    if (!operating(t.actor)) continue;
    const p = unitGear(t.actor).probe;
    if (!p?.working) continue;
    const d = hexDist(t, targetToken, pxPerHex);
    if (d == null || d > num(p.range)) continue;
    if (enemyECM(sideOf(t), centerOf(t), centerOf(targetToken), { sources, pxPerHex })) continue;
    return { name: p.name || 'Active probe', owner: t.actor.name, range: p.range };
  }
  return null;
}

/**
 * Everything the fire dialog needs for one attacker → target pair:
 * { artemisECM, narcECM, probe, c3 } (the ECM entries name the suite, or '').
 */
export function electronicWarfare(attackerToken, targetToken, opts = {}) {
  const tokens = opts.tokens ?? sceneTokens();
  const sources = opts.sources ?? ecmSources(tokens);
  const pxPerHex = opts.pxPerHex ?? pxHex();
  const o = { tokens, sources, pxPerHex };
  const side = sideOf(attackerToken);
  const a = centerOf(attackerToken), b = centerOf(targetToken);
  const line = a && b ? enemyECM(side, a, b, o) : null;
  const atTarget = b ? enemyECM(side, b, b, o) : null;
  return {
    artemisECM: line ? line.name : '',
    narcECM: atTarget ? atTarget.name : '',
    probe: probeReaching(attackerToken, targetToken, o),
    c3: c3Spotter(attackerToken, targetToken, o)
  };
}
