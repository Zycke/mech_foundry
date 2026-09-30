/**
 * Buildings on the map (Total Warfare pp. 166–177; checked against MegaMek's
 * building handling). A building is a terrain region of type "building" with a
 * class, a Construction Factor (CF), a height in levels and the damage taken
 * so far. One region is one building (TW tracks CF per hex: draw a region per
 * building block).
 *
 * - Entering a building costs MP by class (light 1, medium 2, heavy 3,
 *   hardened 4; tw-terrain hexCost).
 * - Passing a building wall (entering or leaving; 'Mechs and vehicles): a
 *   Piloting / Driving roll, + light 0 / medium 1 / heavy 2 / hardened 5, +
 *   hexes moved this turn (3–4 +1, 5–6 +2, 7–9 +3, 10–17 +4, 18–24 +5, 25+ +6).
 *   A failure: the unit takes CF ÷ 10 (round up) damage (front, or rear when
 *   backing). Either way the building takes the unit's tonnage ÷ 10.
 * - A unit inside a building (below its roof) is shielded from attacks from
 *   outside it: every hit loses CF ÷ 10 (round up) damage, which the building
 *   takes instead — for conventional infantry, off the damage the platoon takes
 *   (troopers). An attacker inside the same building gets no such shield in
 *   the way, except fire at conventional infantry on another floor: the building
 *   takes a share (heavy ¼, hardened ½; light / medium none — TW p. 175).
 * - At CF 0 the building collapses into rubble: every unit inside takes
 *   CF (before the collapse) × floors above it ÷ 10 (round up; infantry ×3,
 *   battle armor ×2) in 5-point groups (Punch Location Table for 'Mechs
 *   inside), and units above the ground floor fall.
 */
import { beginRecording, endRecording, writeDoc } from "./gm-relay.mjs";
import { hexAt, regionHas, terrainRegions, tokenCenter, unitElevation } from "./tw-terrain.mjs";
import { resolveDamageAgainst } from "./tw-combat.mjs";
import { fiveGroups, postCard, resolveFall } from "./tw-falls.mjs";
import { pilotingMods } from "./tw-skills.mjs";
import { psrDamageMods } from "./tw-psr.mjs";
import { pilotUnconscious, vehicleDrivingMods } from "./tw-movement.mjs";
import { rollPunchLocation } from "./tw-physical.mjs";
import { activeShield, setShield } from "./tw-shield.mjs";

export { shieldGroups, shieldPlatoon } from "./tw-shield.mjs";

const num = (v) => Number(v) || 0;
const sum = (mods) => mods.reduce((t, m) => t + num(m.value), 0);
const diceOf = (roll) => roll?.dice?.[0]?.results?.map(r => r.result) ?? [];

/** Building classes: label, the wall-roll modifier, the share it absorbs of fire at infantry between its floors. */
export const BUILDING_CLASSES = {
  light: { label: "Light", psr: 0, inside: 0 },
  medium: { label: "Medium", psr: 1, inside: 0 },
  heavy: { label: "Heavy", psr: 2, inside: 0.25 },
  hardened: { label: "Hardened", psr: 5, inside: 0.5 }
};

/** A building region's current CF. */
export function currentCF(rec) {
  return Math.max(0, num(rec?.cf) - num(rec?.damage));
}

/** Damage a building soaks up from each hit on a unit inside it. */
export function absorption(rec) {
  return Math.ceil(currentCF(rec) / 10);
}

/** Wall-roll modifier for hexes moved this turn (MegaMek rollMovementInBuilding). */
export function buildingDistanceMod(hexes) {
  const h = num(hexes);
  if (h >= 25) return 6;
  if (h >= 18) return 5;
  if (h >= 10) return 4;
  if (h >= 7) return 3;
  if (h >= 5) return 2;
  if (h >= 3) return 1;
  return 0;
}

/** The current terrain record of a building behaviour (by uuid), fresh from the scene. */
export function buildingRecord(uuid, scene = globalThis.canvas?.scene) {
  return terrainRegions(scene).find(r => r.terrain === "building" && r.behavior?.uuid === uuid) ?? null;
}

/** The building a token is inside (below its roof), or null. */
export function buildingAround(actor, token) {
  if (!token) return null;
  const doc = token.document ?? token;
  const rec = hexAt(token.center ?? tokenCenter(doc), terrainRegions(doc.parent ?? globalThis.canvas?.scene)).buildingRec;
  return rec && unitElevation(actor, doc) < rec.height ? rec : null;
}

/**
 * Damage a building: CF lost (capped at 0). A building at 0 collapses into
 * rubble. Returns { before, after, collapsed }.
 */
export async function damageBuilding(rec, amount) {
  const before = currentCF(rec);
  const dmg = Math.min(before, Math.max(0, Math.round(num(amount))));
  if (!rec?.behavior || dmg <= 0) return { before, after: before, collapsed: false, dealt: 0 };
  const after = before - dmg;
  const upd = { "system.damage": num(rec.damage) + dmg };
  if (after <= 0) upd["system.terrain"] = "rubble";
  await writeDoc(rec.behavior, upd);
  rec.damage = num(rec.damage) + dmg;
  return { before, after, collapsed: after <= 0, dealt: dmg };
}

/* -------------------------------------------- */
/*  Moving through buildings                    */
/* -------------------------------------------- */

/**
 * Resolve the wall checks from a move (tw-terrain pathTerrain walls):
 * a roll for each, damage to the unit on a failure, damage to the building
 * either way; one card. Collapses follow on their own card.
 * @param {Actor} actor
 * @param {object[]} walls  [{ uuid, name, entering, distance }]
 * @param {object} opts     { backward, scene }
 */
export async function resolveBuildingWalls(actor, walls, { backward = false, scene = globalThis.canvas?.scene } = {}) {
  if (!actor || !walls?.length) return null;
  beginRecording();
  const rolls = [], results = [], frags = [], notes = [];
  const collapsed = [];
  const isMech = actor.type === "mech";
  const base = isMech ? [...pilotingMods(actor), ...psrDamageMods(actor.system).filter(m => !m.gyroDestroyed)]
    : [...pilotingMods(actor), ...vehicleDrivingMods(actor)];
  const toBldg = Math.ceil(num(actor.system?.tonnage) / 10);
  for (const w of walls) {
    const rec = buildingRecord(w.uuid, scene);
    if (!rec) continue;
    const cls = BUILDING_CLASSES[rec.buildingClass] ?? BUILDING_CLASSES.medium;
    const mods = [...base, { label: `${cls.label} building (${w.entering ? "entering" : "leaving"})`, value: cls.psr }];
    const dm = buildingDistanceMod(w.distance);
    if (dm) mods.push({ label: `Moved ${w.distance} hexes this turn`, value: dm });
    const res = { label: `${w.entering ? "Enter" : "Leave"} ${rec.region?.name || "building"}`, mods, tn: sum(mods) };
    if (pilotUnconscious(actor)) { res.auto = "warrior unconscious — automatic failure"; res.success = false; }
    else {
      const roll = await new Roll("2d6").evaluate();
      rolls.push(roll);
      Object.assign(res, { total: roll.total, dice: diceOf(roll), success: roll.total >= res.tn });
    }
    results.push(res);
    const cfNow = currentCF(rec);
    if (!res.success) {
      const dmg = Math.ceil(cfNow / 10);
      if (dmg > 0) {
        frags.push(await resolveDamageAgainst(actor, backward ? "rear" : "front", [dmg], rolls, actor.name, { noIntercept: true }));
        notes.push(`${actor.name} crashes through the wall: ${dmg} damage (CF ${cfNow} ÷ 10)`);
      }
    }
    if (toBldg > 0 && cfNow > 0) {
      const d = await damageBuilding(rec, toBldg);
      notes.push(`${rec.region?.name || "The building"} takes ${d.dealt} (${actor.name}'s ${num(actor.system?.tonnage)} tons ÷ 10): CF ${d.before} → ${d.after}`);
      if (d.collapsed) collapsed.push({ uuid: w.uuid, cfBefore: d.before, name: rec.region?.name });
    }
  }
  if (!results.length) { endRecording(); return null; }
  await postCard(actor, "Moving Through Buildings", { results, frags, notes }, rolls);
  for (const c of collapsed) await collapseBuilding(c.uuid, { cfBefore: c.cfBefore, scene });
  return { results, frags, notes, collapsed };
}

/* -------------------------------------------- */
/*  Attacks on units inside buildings           */
/* -------------------------------------------- */


/**
 * How a building shields a target from an attacker, or null:
 * { rec, mode: 'outside' (absorbs `absorb` per hit) | 'inside' (absorbs `share` of an
 * infantry attack on infantry), absorb, share }.
 */
export function shieldFor(targetActor, targetToken, attacker = null, attackerToken = null) {
  if (!targetActor || !targetToken) return null;
  const rec = buildingAround(targetActor, targetToken);
  if (!rec) return null;
  const inSame = attackerToken && buildingAround(attacker, attackerToken)?.behavior === rec.behavior;
  if (inSame) {
    // Inside the same building: only infantry on infantry across floors.
    const share = BUILDING_CLASSES[rec.buildingClass]?.inside ?? 0;
    const floors = unitElevation(attacker, attackerToken.document ?? attackerToken) !== unitElevation(targetActor, targetToken.document ?? targetToken);
    return targetActor.type === "infantry" && floors && share > 0 ? { rec, mode: "inside", share, absorb: 0 } : null;
  }
  const absorb = absorption(rec);
  return absorb > 0 ? { rec, mode: "outside", absorb, share: 0 } : null;
}

/**
 * Start shielding a target inside a building for one attack (volley): every
 * damage group (or platoon hit) applied to it loses the building's share.
 * Returns the shield or null.
 */
export function beginShield(targetActor, targetToken, attacker = null, attackerToken = null) {
  const sf = shieldFor(targetActor, targetToken, attacker, attackerToken);
  return setShield(sf ? { uuid: targetActor.uuid, ...sf, absorbed: 0, cfBefore: currentCF(sf.rec) } : null);
}

/**
 * Finish the shield: the building takes what it absorbed. Returns
 * { alert, collapse } for the card (or null when nothing was absorbed).
 */
export async function endShield() {
  const sh = activeShield();
  setShield(null);
  if (!sh || sh.absorbed <= 0) return null;
  const d = await damageBuilding(sh.rec, sh.absorbed);
  const name = sh.rec.region?.name || "The building";
  return {
    alert: { tag: "BUILDING", text: `${name} absorbs ${sh.absorbed} damage (${sh.mode === "outside" ? `${sh.absorb} per hit` : `${Math.round(sh.share * 100)}% between floors`}): CF ${d.before} → ${d.after}${d.collapsed ? " — it collapses" : ""}`, red: d.collapsed },
    collapse: d.collapsed ? { uuid: sh.rec.behavior?.uuid, cfBefore: sh.cfBefore } : null
  };
}

/* -------------------------------------------- */
/*  Collapse                                    */
/* -------------------------------------------- */

/**
 * A building has collapsed: damage every unit inside (CF before the collapse
 * × floors above it ÷ 10), units above the ground floor fall. Posts a card.
 */
export async function collapseBuilding(uuid, { cfBefore = 0, scene = globalThis.canvas?.scene } = {}) {
  const region = (scene?.regions ?? []).find(r => (r.behaviors ?? []).some(b => b.uuid === uuid));
  const behavior = (region?.behaviors ?? []).find(b => b.uuid === uuid);
  if (!region || !behavior) return null;
  const floors = Math.max(1, num(behavior.system?.height) || 2);
  beginRecording();
  const rolls = [], frags = [], notes = [`${region.name || "The building"} collapses into rubble.`];
  let first = null;
  for (const doc of scene?.tokens ?? []) {
    const actor = doc.actor;
    if (!actor || !["mech", "ground_vehicle", "battle_armor", "infantry"].includes(actor.type)) continue;
    if (!regionHas(region, doc.center ?? tokenCenter(doc))) continue;
    const elev = unitElevation(actor, doc);
    if (elev > floors) continue; // above the roof
    const floor = Math.min(elev, floors - 1);
    let dmg = Math.ceil((num(cfBefore) * (floors - floor)) / 10);
    if (actor.type === "infantry") dmg *= 3;
    else if (actor.type === "battle_armor") dmg *= 2;
    if (dmg > 0) {
      const groups = actor.type === "infantry" ? [dmg] : fiveGroups(dmg);
      frags.push(await resolveDamageAgainst(actor, "front", groups, rolls, doc.name || actor.name, {
        noIntercept: true, locationRoller: actor.type === "mech" && elev < floors ? rollPunchLocation : null
      }));
      notes.push(`${doc.name || actor.name}: ${dmg} damage from the collapse (CF ${cfBefore} × ${floors - floor} floor${floors - floor === 1 ? "" : "s"} above ÷ 10)`);
    }
    if (actor.type === "mech" && elev > 0) {
      const fall = await resolveFall(actor, { levels: elev, rolls });
      notes.push(`${doc.name || actor.name} falls ${elev} level${elev === 1 ? "" : "s"} with it (${fall.damage} damage)`);
      if (fall.frag) frags.push(fall.frag);
    }
    first ??= actor;
  }
  await postCard(first, "Building Collapse", { results: [], frags, notes }, rolls);
  return { frags, notes };
}
