/**
 * Map terrain on gridless (metric) scenes, drawn as Scene Regions carrying the
 * system's "Mech Foundry Terrain" region behaviour: a terrain type, a ground
 * level (hills; 1 level = 6 m) and a water depth.
 *
 * - The hex a unit stands in is the terrain under its token's centre. Where
 *   regions overlap their features combine (woods on a level-2 hill).
 * - Terrain along a line is measured in 30 m hexes: each continuous stretch of
 *   a feature counts as round(length ÷ 30 m) hexes, so one counts once the line
 *   is at least half a hex (15 m) inside it. The attacker's and target's own
 *   hexes (the first and last 15 m) are not "between".
 * - Line of sight (Total Warfare; MegaMek LosEffects): intervening light woods
 *   and light smoke count 1 point per hex, heavy woods and heavy smoke 2; 3 or
 *   more points block it. Each hex also adds its points to the to-hit number.
 * - A 'Mech standing in depth 1 water has partial cover and can't fire its leg
 *   weapons; in depth 2+ it is submerged and can't fire at, or be fired at by,
 *   units above the surface.
 * - Conventional infantry are in the open unless they stand in woods, rough,
 *   rubble, swamp or a building (MegaMek infantryInOpen).
 */

import { GROUND_HEX_M, pixelsPerMeter } from "./tw-scale.mjs";

const num = (v) => Number(v) || 0;

export const TERRAIN_BEHAVIOR = "mech-foundry.terrain";
export const LEVEL_M = 6;

/** Terrain types: label and region colour. */
export const TERRAIN_TYPES = {
  clear: { label: "Clear", color: "#9cc47a" },
  paved: { label: "Paved / road", color: "#9a9a9a" },
  rough: { label: "Rough", color: "#b08457" },
  rubble: { label: "Rubble", color: "#7d6b5d" },
  lightWoods: { label: "Light woods", color: "#5a9a42" },
  heavyWoods: { label: "Heavy woods", color: "#2e5e26" },
  water: { label: "Water", color: "#3d7fc4" },
  swamp: { label: "Swamp", color: "#5f7550" },
  ice: { label: "Ice", color: "#cfe8f5" },
  building: { label: "Building", color: "#8a5a44" },
  lightSmoke: { label: "Light smoke", color: "#bdbdbd" },
  heavySmoke: { label: "Heavy smoke", color: "#6e6e6e" }
};

/** The region behaviour's data model (null outside Foundry). */
export function defineTerrainBehavior() {
  const Base = globalThis.foundry?.data?.regionBehaviors?.RegionBehaviorType;
  const fields = globalThis.foundry?.data?.fields;
  if (!Base || !fields) return null;
  const { StringField, NumberField } = fields;
  return class TerrainRegionBehaviorType extends Base {
    static LOCALIZATION_PREFIXES = ["MFTERRAIN"];
    static defineSchema() {
      return {
        terrain: new StringField({ required: true, initial: "lightWoods",
          choices: Object.fromEntries(Object.entries(TERRAIN_TYPES).map(([k, t]) => [k, t.label])) }),
        level: new NumberField({ required: true, nullable: false, initial: 0, integer: true, min: -20, max: 50 }),
        depth: new NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0, max: 20 }),
        height: new NumberField({ required: true, nullable: false, initial: 2, integer: true, min: 1, max: 30 }),
        buildingClass: new StringField({ required: true, initial: "medium",
          choices: { light: "Light (CF up to 15)", medium: "Medium (CF 16–40)", heavy: "Heavy (CF 41–90)", hardened: "Hardened (CF 91–150)" } }),
        cf: new NumberField({ required: true, nullable: false, initial: 40, integer: true, min: 1, max: 1000 }),
        damage: new NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0, max: 1000 })
      };
    }
  };
}

/** Register the behaviour type (init). */
export function registerTerrainBehavior() {
  const T = defineTerrainBehavior();
  if (!T || !globalThis.CONFIG?.RegionBehavior) return;
  CONFIG.RegionBehavior.dataModels[TERRAIN_BEHAVIOR] = T;
  if (CONFIG.RegionBehavior.typeIcons) CONFIG.RegionBehavior.typeIcons[TERRAIN_BEHAVIOR] = "fa-solid fa-tree";
}

/** The scene's terrain regions: [{ region, behavior, terrain, level, depth, height, buildingClass, cf, damage (buildings) }]. */
export function terrainRegions(scene = globalThis.canvas?.scene) {
  const out = [];
  for (const region of scene?.regions ?? []) {
    for (const b of region.behaviors ?? []) {
      if (b.type !== TERRAIN_BEHAVIOR || b.disabled) continue;
      const s = b.system ?? {};
      out.push({ region, behavior: b, terrain: TERRAIN_TYPES[s.terrain] ? s.terrain : "clear", level: num(s.level), depth: Math.max(0, num(s.depth)),
        height: Math.max(1, num(s.height) || 2), buildingClass: ["light", "medium", "heavy", "hardened"].includes(s.buildingClass) ? s.buildingClass : "medium",
        cf: Math.max(1, num(s.cf) || 40), damage: Math.max(0, num(s.damage)) });
    }
  }
  return out;
}

function regionElevation(region) {
  const e = region?.elevation ?? {};
  if (Number.isFinite(e.bottom)) return e.bottom;
  if (Number.isFinite(e.top)) return e.top;
  return 0;
}

/** Is a canvas point inside a region's area (ignoring its elevation band)? */
export function regionHas(region, p) {
  try {
    const tree = region?.polygonTree;
    if (tree?.testPoint) return !!tree.testPoint(p);
  } catch { /* fall through */ }
  const elevation = regionElevation(region);
  try { return !!region.testPoint({ x: p.x, y: p.y, elevation }); } catch { /* older signature */ }
  try { return !!region.testPoint({ x: p.x, y: p.y }, elevation); } catch { return false; }
}

/**
 * What stands at a point: { terrains: string[], woods, smoke ('light'|'heavy'|null),
 * depth (water), level (ground), building, rough, rubble, swamp, paved, ice }.
 */
export function hexAt(p, regions = terrainRegions()) {
  const hex = { terrains: [], woods: null, smoke: null, depth: 0, level: 0, water: false, buildingHeight: 0, buildingRec: null };
  const levels = [];
  for (const r of regions) {
    if (!regionHas(r.region, p)) continue;
    if (!hex.terrains.includes(r.terrain)) hex.terrains.push(r.terrain);
    if (r.terrain === "heavyWoods") hex.woods = "heavy";
    else if (r.terrain === "lightWoods" && hex.woods !== "heavy") hex.woods = "light";
    if (r.terrain === "heavySmoke") hex.smoke = "heavy";
    else if (r.terrain === "lightSmoke" && hex.smoke !== "heavy") hex.smoke = "light";
    if (r.terrain === "water") { hex.water = true; hex.depth = Math.max(hex.depth, r.depth); }
    if (r.terrain === "building" && r.height >= hex.buildingHeight) { hex.buildingHeight = r.height; hex.buildingRec = r; }
    if (r.level) levels.push(r.level);
  }
  // Ground level: the highest hill level here, else the deepest hollow (0 when none is set).
  if (levels.length) hex.level = levels.some(l => l > 0) ? Math.max(...levels) : Math.min(...levels);
  for (const k of ["building", "rough", "rubble", "swamp", "paved", "ice"]) hex[k] = hex.terrains.includes(k);
  return hex;
}

/** "Heavy woods · Level 1", "Water (depth 1)", "Clear". */
export function describeHex(hex) {
  const b = hex.buildingRec;
  const parts = hex.terrains.filter(t => t !== "clear").map(t => t === "water" ? `Water (depth ${hex.depth})`
    : t === "building" && b ? `${b.buildingClass[0].toUpperCase()}${b.buildingClass.slice(1)} building (CF ${Math.max(0, b.cf - b.damage)}, ${b.height} level${b.height === 1 ? "" : "s"})`
    : TERRAIN_TYPES[t].label);
  if (!parts.length) parts.push("Clear");
  if (hex.level) parts.push(`Level ${hex.level}`);
  return parts.join(" · ");
}

/** Hexes a stretch of `px` counts as: whole hexes, rounding half a hex (15 m) up. */
export function stretchHexes(px, pxPerHex) {
  return Math.floor(px / pxPerHex + 0.5 + 1e-9);
}

/**
 * What lies between two units, not counting either end hex (MegaMek
 * LosEffects, non-diagram rules). Heights are absolute levels: a unit's
 * ground level (+ its elevation) + its height (a standing 'Mech 1, others 0).
 * - A hill or building blocks line of sight where its top is higher than both
 *   units, or higher than the unit it stands next to.
 * - Woods and smoke rise 2 levels above their ground: they only count (and
 *   only add to the to-hit number) where that top would block by the same test.
 *   3+ points of woods / smoke (light 1, heavy 2) block line of sight.
 * - Partial cover: terrain in the hex next to a 'Mech exactly as high as the
 *   'Mech's hip line (its ground + 1) when the other unit is no higher. For the
 *   target that is +1 to-hit (leg hits strike the cover); an attacker with it
 *   can't fire its leg weapons.
 * - Units inside the same building (`sameBuilding`, its behaviour) aren't
 *   blocked by it.
 * Each continuous stretch counts round(length ÷ 30 m) hexes (half a hex counts).
 * @returns {{ lightWoods, heavyWoods, lightSmoke, heavySmoke, points, woodsBlocked,
 *   heightBlocked, blockedBy, blocked, targetCover, attackerCover }}
 */
export function lineTerrain(from, to, { regions = terrainRegions(), pxPerHex = pixelsPerMeter() * GROUND_HEX_M,
  attackerAbs = 1, targetAbs = 1, attackerMech = false, targetMech = false, sameBuilding = null } = {}) {
  const out = { lightWoods: 0, heavyWoods: 0, lightSmoke: 0, heavySmoke: 0, points: 0, woodsBlocked: false,
    heightBlocked: false, blockedBy: "", blocked: false, targetCover: false, attackerCover: false };
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const start = pxPerHex / 2, end = d - pxPerHex / 2;
  if (!regions.length || !(pxPerHex > 0) || end <= start) return out;
  const step = Math.max(pxPerHex / GROUND_HEX_M, (end - start) / 4000); // ~1 m
  const maxAbs = Math.max(attackerAbs, targetAbs);
  // Stretches: [class, length] per feature.
  const runs = { woods: [null, 0], smoke: [null, 0], wall: [null, 0], tcover: [null, 0], acover: [null, 0] };
  const close = (k) => {
    const [cls, len] = runs[k];
    const n = cls ? stretchHexes(len, pxPerHex) : 0;
    if (n) {
      if (k === "woods" || k === "smoke") out[`${cls}${k === "woods" ? "Woods" : "Smoke"}`] += n;
      else if (k === "wall") { out.heightBlocked = true; out.blockedBy ||= cls; }
      else if (k === "tcover") out.targetCover = true;
      else out.attackerCover = true;
    }
    runs[k] = [null, 0];
  };
  const track = (k, cls, seg) => {
    if (runs[k][0] !== cls) close(k);
    if (cls) runs[k] = [cls, runs[k][1] + seg];
  };
  for (let t = start + step / 2; t < end; t += step) {
    const f = t / d;
    const hex = hexAt({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }, regions);
    const seg = Math.min(step, end - (t - step / 2));
    const nextToAttacker = t < pxPerHex * 1.5, nextToTarget = t > d - pxPerHex * 1.5;
    const affects = (el) => el > maxAbs || (nextToAttacker && el > attackerAbs) || (nextToTarget && el > targetAbs);
    // Units inside the same building see each other through it (MegaMek thruBldg).
    const walls = hex.building && !(sameBuilding && hex.buildingRec?.behavior === sameBuilding);
    const top = hex.level + (walls ? hex.buildingHeight : 0);
    track("wall", affects(top) ? (walls ? "building" : "hill") : null, seg);
    const foliage = affects(hex.level + 2);
    track("woods", foliage ? hex.woods : null, seg);
    track("smoke", foliage ? hex.smoke : null, seg);
    track("tcover", targetMech && nextToTarget && top === targetAbs && attackerAbs <= targetAbs ? "cover" : null, seg);
    track("acover", attackerMech && nextToAttacker && top === attackerAbs && attackerAbs >= targetAbs ? "cover" : null, seg);
  }
  for (const k of Object.keys(runs)) close(k);
  out.points = out.lightWoods + out.lightSmoke + 2 * (out.heavyWoods + out.heavySmoke);
  out.woodsBlocked = out.points >= 3;
  out.blocked = out.woodsBlocked || out.heightBlocked;
  if (out.heightBlocked) out.targetCover = out.attackerCover = false;
  return out;
}

/* -------------------------------------------- */
/*  Unit heights                                */
/* -------------------------------------------- */

/** A unit's height above its own ground, in levels (a standing 'Mech is 2 levels tall: 1). */
export function unitHeight(actor) {
  return actor?.type === "mech" && !actor.system?.conditions?.prone ? 1 : 0;
}

/** Levels a unit is above the ground: a VTOL / WiGE's elevation, else the token's elevation (6 m a level). */
export function unitElevation(actor, tokenDoc = null) {
  if (actor?.type === "ground_vehicle" && ["vtol", "wige"].includes(actor.system?.movementType)) return Math.max(0, num(actor.system?.elevation));
  return Math.max(0, Math.floor(num(tokenDoc?.elevation) / LEVEL_M));
}

/** A token's centre on the canvas for a top-left position (default: where it is). */
export function tokenCenter(doc, pos = doc) {
  const size = num(globalThis.canvas?.grid?.size) || 100;
  return { x: num(pos?.x) + (num(doc?.width) || 1) * size / 2, y: num(pos?.y) + (num(doc?.height) || 1) * size / 2 };
}

/** The level a unit stands on: ground level + elevation; a 'Mech wading in water stands on the bottom. */
export function unitBase(actor, hex, elevation = 0) {
  const wading = actor?.type === "mech" && hex?.water && hex.depth > 0 && !hex.ice && !elevation;
  return num(hex?.level) + elevation - (wading ? hex.depth : 0);
}

/** Is conventional infantry in this hex in the open (double damage)? */
export function inTheOpen(hex) {
  return !hex?.woods && !hex?.rough && !hex?.rubble && !hex?.swamp && !hex?.building;
}

const LEG_LOC = /^(ll|rl|left leg|right leg)\b/;

/**
 * Terrain for a ground attack from the map, or null when the scene has no
 * terrain regions or a token is missing:
 * { lightWoods, heavyWoods (intervening woods + smoke), targetWoods ('none'|'light'|'heavy'),
 *   partialCover, coverWhy, inOpen, line, attackerHex, targetHex, attackerBase, targetBase,
 *   levelDiff (target − attacker), attackerSubmerged, targetSubmerged, attackerDepth, summary[] }.
 * opts: { regions, pxPerHex, attackerElevation, targetElevation } (levels above ground).
 */
export function mapAttackTerrain(actor, targetActor, from, to, opts = {}) {
  if (!from || !to) return null;
  const regions = opts.regions ?? terrainRegions();
  if (!regions.length) return null;
  const attackerHex = hexAt(from, regions), targetHex = hexAt(to, regions);
  const mech = (a) => a?.type === "mech";
  const attackerBase = unitBase(actor, attackerHex, num(opts.attackerElevation));
  const targetBase = unitBase(targetActor, targetHex, num(opts.targetElevation));
  const inside = (hex, elev) => hex.buildingRec && num(elev) < hex.buildingRec.height ? hex.buildingRec : null;
  const tIn = inside(targetHex, opts.targetElevation), aIn = inside(attackerHex, opts.attackerElevation);
  const sameBuilding = !!tIn && tIn === aIn;
  const line = lineTerrain(from, to, { regions, pxPerHex: opts.pxPerHex ?? pixelsPerMeter() * GROUND_HEX_M,
    attackerAbs: attackerBase + unitHeight(actor), targetAbs: targetBase + unitHeight(targetActor),
    attackerMech: mech(actor) && unitHeight(actor) > 0, targetMech: mech(targetActor) && unitHeight(targetActor) > 0,
    sameBuilding: sameBuilding ? tIn.behavior : null });
  const cover = (h) => (h.woods === "heavy" || h.smoke === "heavy") ? "heavy" : (h.woods || h.smoke) ? "light" : "none";
  const waterCover = mech(targetActor) && targetHex.water && targetHex.depth === 1 && !targetHex.ice;
  const res = {
    line, attackerHex, targetHex, attackerBase, targetBase, levelDiff: targetBase - attackerBase,
    lightWoods: line.lightWoods + line.lightSmoke,
    heavyWoods: line.heavyWoods + line.heavySmoke,
    targetWoods: cover(targetHex),
    partialCover: waterCover || line.targetCover,
    coverWhy: waterCover ? "depth 1 water" : line.targetCover ? "terrain in front of it" : "",
    attackerCover: line.attackerCover,
    inOpen: inTheOpen(targetHex),
    targetBuilding: tIn, sameBuilding,
    attackerDepth: mech(actor) && attackerHex.water && !attackerHex.ice ? attackerHex.depth : 0,
    attackerSubmerged: mech(actor) && attackerHex.water && !attackerHex.ice && attackerHex.depth >= 2,
    targetSubmerged: mech(targetActor) && targetHex.water && !targetHex.ice && targetHex.depth >= 2
  };
  const s = [];
  const between = [
    line.lightWoods && `${line.lightWoods} light woods`, line.heavyWoods && `${line.heavyWoods} heavy woods`,
    line.lightSmoke && `${line.lightSmoke} light smoke`, line.heavySmoke && `${line.heavySmoke} heavy smoke`
  ].filter(Boolean);
  s.push(between.length ? `${between.join(", ")} between` : "open ground between");
  s.push(`target in ${describeHex(targetHex).toLowerCase()}`);
  if (res.levelDiff) s.push(`target ${Math.abs(res.levelDiff)} level${Math.abs(res.levelDiff) === 1 ? "" : "s"} ${res.levelDiff > 0 ? "higher" : "lower"}`);
  if (res.partialCover) s.push(`partial cover (${res.coverWhy})`);
  if (res.targetBuilding && !sameBuilding) {
    const cf = Math.max(0, res.targetBuilding.cf - res.targetBuilding.damage);
    s.push(`target inside a ${res.targetBuilding.buildingClass} building: it absorbs ${Math.ceil(cf / 10)} of each hit (CF ${cf})`);
  } else if (sameBuilding) {
    const share = { heavy: 25, hardened: 50 }[tIn.buildingClass] ?? 0;
    const floors = num(opts.attackerElevation) !== num(opts.targetElevation);
    s.push(targetActor?.type === "infantry" && floors && share ? `both inside the same ${tIn.buildingClass} building, on different floors: it absorbs ${share}% of the damage to the infantry`
      : "both inside the same building: it neither blocks nor shields");
  }
  if (res.attackerCover) s.push("attacker in partial cover (leg weapons can't fire)");
  if (line.heightBlocked) s.push(`line of sight blocked by a ${line.blockedBy}`);
  else if (line.woodsBlocked) s.push(`line of sight blocked (${line.points} woods / smoke points; 3 block)`);
  res.summary = s;
  return res;
}

/** Why the map stops this weapon firing ('' when it doesn't). */
export function terrainRowBlock(map, actor, weapon) {
  if (!map) return "";
  if (map.attackerSubmerged && !map.targetSubmerged) return `${actor?.name ?? "The attacker"} is submerged (depth ${map.attackerDepth} water)`;
  if (map.targetSubmerged && !map.attackerSubmerged) return `the target is submerged (depth ${map.targetHex.depth} water)`;
  const underwater = map.attackerSubmerged && map.targetSubmerged;
  if (map.line.heightBlocked && !underwater) return `no line of sight (a ${map.line.blockedBy} between is too high)`;
  if (map.line.woodsBlocked && !underwater) return `no line of sight (${map.line.points} woods / smoke points between; 3 block)`;
  const leg = LEG_LOC.test(String(weapon?.location ?? "").trim().toLowerCase());
  if (leg && map.attackerDepth === 1) return "leg weapons can't fire from depth 1 water";
  if (leg && map.attackerCover) return "leg weapons can't fire from partial cover";
  return "";
}

/**
 * Level difference for a physical attack between adjacent units (target −
 * attacker, in levels), or null without terrain regions.
 */
export function physicalLevelDiff(actor, targetActor, from, to, opts = {}) {
  if (!from || !to) return null;
  const regions = opts.regions ?? terrainRegions();
  if (!regions.length) return null;
  return unitBase(targetActor, hexAt(to, regions), num(opts.targetElevation)) - unitBase(actor, hexAt(from, regions), num(opts.attackerElevation));
}

/* -------------------------------------------- */
/*  Movement: terrain costs along a path        */
/* -------------------------------------------- */

/** How a unit moves over terrain: mech, tracked, wheeled, hover, vtol, wige, naval, hydrofoil, submarine, infantry, umu, aero. */
export function motiveOf(actor) {
  const t = actor?.type;
  if (t === "mech") return "mech";
  if (t === "ground_vehicle") return actor.system?.movementType || "tracked";
  if (t === "infantry" || t === "battle_armor") return num(actor.system?.movement?.umu) > 0 ? "umu" : "infantry";
  return "aero";
}

/** MP to enter a building by class (MegaMek BuildingType.getTypeValue). */
const BUILDING_MP = { light: 1, medium: 2, heavy: 3, hardened: 4 };

/** Motive types that fly over terrain (no terrain costs). */
const AIRBORNE = new Set(["vtol", "wige", "aero"]);
const NAVAL = new Set(["naval", "hydrofoil", "submarine"]);

/**
 * Entering one hex (Total Warfare Movement Costs Table; MegaMek Terrain /
 * MoveStep / Tank.isLocationProhibited): { mp, parts: [[label, mp]], prohibited }.
 * A road (paved) through woods, rough or rubble removes their cost and ban.
 */
export function hexCost(motive, hex, { mechanized = false } = {}) {
  const out = { mp: 0, parts: [], prohibited: "" };
  if (AIRBORNE.has(motive)) return out;
  const add = (label, mp) => { if (mp > 0) { out.mp += mp; out.parts.push([label, mp]); } };
  const ban = (why) => { if (!out.prohibited) out.prohibited = why; };
  const road = !!hex.paved;
  const water = hex.water && hex.depth > 0 && !hex.ice;
  if (NAVAL.has(motive)) { if (!water) ban(`${motive} vessels can't leave the water`); return out; }
  if (hex.woods && !road) {
    add(`${hex.woods} woods`, hex.woods === "heavy" ? 2 : 1);
    if (motive === "wheeled" || motive === "hover") ban(`${motive} vehicles can't enter woods`);
    if (motive === "tracked" && hex.woods === "heavy") ban("tracked vehicles can't enter heavy woods");
  }
  if (hex.rough && !road) {
    add("rough", 1);
    if (motive === "wheeled") ban("wheeled vehicles can't enter rough");
  }
  if (hex.rubble && !road) {
    add("rubble", 1);
    if (motive === "wheeled") ban("wheeled vehicles can't enter rubble");
  }
  if (hex.swamp && motive !== "hover") add("swamp", motive === "mech" ? 1 : 2);
  // Entering a building: 'Mechs and vehicles pay by its class (light 1 … hardened 4); infantry don't (mechanized 1).
  if (hex.building && !["infantry", "umu"].includes(motive)) add(`${hex.buildingRec?.buildingClass ?? "medium"} building`, BUILDING_MP[hex.buildingRec?.buildingClass] ?? 2);
  else if (hex.building && mechanized) add("building (mechanized)", 1);
  if (hex.ice && motive !== "hover") add("ice", 1);
  if (water) {
    if (motive === "mech") add(`depth ${hex.depth} water`, hex.depth >= 2 ? 3 : 1);
    else if (motive === "tracked" || motive === "wheeled") ban(`${motive} vehicles can't enter water`);
    else if (motive === "infantry") ban("infantry can't enter water (without UMU)");
  }
  return out;
}

/** Point `d` pixels along a polyline. */
function pointAlong(points, d) {
  let left = d;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len && len > 0) return { x: a.x + (b.x - a.x) * left / len, y: a.y + (b.y - a.y) * left / len };
    left -= len;
  }
  return points[points.length - 1];
}

/**
 * Terrain along a move (canvas points, centre to centre), hex by hex (each 30 m
 * travelled enters the next hex; the last is where the unit stops):
 * { hexes, mp, parts: {label: mp}, levels, prohibited: [], psr: [{key, label, mod}], notes: [], skidTurns }.
 * - extra MP for terrain and for level changes ('Mechs 1 per level, at most 2
 *   per hex; vehicles and infantry 2 per level, at most 1);
 * - prohibited terrain for the unit's motive type (a warning, not a block);
 * - 'Mech Piloting Skill Rolls for entering rubble (+0) or water (depth 1 −1,
 *   2 +0, 3+ +1), each hex entered; a jump only checks where it lands (rubble);
 * - skidTurns: facing changes made on pavement or ice (for a skid check when running).
 * Jumping and flying units pay no terrain costs.
 */
export function pathTerrain(actor, points, { regions = terrainRegions(), pxPerHex = pixelsPerMeter() * GROUND_HEX_M, mode = "", startFacing = null, priorHexes = 0 } = {}) {
  const out = { hexes: 0, mp: 0, parts: {}, levels: 0, prohibited: [], psr: [], notes: [], skidTurns: 0, walls: [] };
  if (!regions.length || !(pxPerHex > 0) || !points?.length) return out;
  const motive = motiveOf(actor);
  let L = 0;
  for (let i = 1; i < points.length; i++) L += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const N = L < pxPerHex / 2 ? 0 : Math.max(1, Math.ceil(L / pxPerHex - 0.05));
  out.hexes = N;
  const jumped = mode === "jumped";
  const mech = motive === "mech";
  const ban = (why) => { if (why && !out.prohibited.includes(why)) out.prohibited.push(why); };
  let prev = hexAt(points[0], regions);
  for (let k = 1; k <= N; k++) {
    const hex = hexAt(k === N ? points[points.length - 1] : pointAlong(points, k * pxPerHex), regions);
    // Passing a building wall: entering one, leaving one ('Mechs and vehicles; MegaMek passBuildingWall).
    if (!jumped && !AIRBORNE.has(motive) && !["infantry", "umu"].includes(motive) && !NAVAL.has(motive)) {
      // (plain data: this rides in the token update's options)
      const w = (rec, entering) => out.walls.push({ uuid: rec.behavior?.uuid ?? "", name: rec.region?.name ?? "building", entering, distance: priorHexes + k - 1 });
      if (hex.buildingRec && hex.buildingRec.behavior !== prev.buildingRec?.behavior) w(hex.buildingRec, true);
      else if (prev.buildingRec && !hex.buildingRec) w(prev.buildingRec, false);
    }
    if (jumped || AIRBORNE.has(motive)) {
      if (jumped && k === N && mech && hex.rubble && !hex.paved) out.psr.push({ key: "rubble", label: "Landed in rubble", mod: 0 });
      prev = hex; continue;
    }
    const c = hexCost(motive, hex, { mechanized: actor?.type === "infantry" && actor.system?.platoonType === "mechanized" });
    out.mp += c.mp;
    for (const [label, mp] of c.parts) out.parts[label] = (out.parts[label] ?? 0) + mp;
    ban(c.prohibited);
    const delta = Math.abs(hex.level - prev.level);
    if (delta && !NAVAL.has(motive)) {
      const per = mech ? 1 : 2, max = mech ? 2 : 1;
      out.levels += delta * per;
      out.mp += delta * per;
      out.parts["level changes"] = (out.parts["level changes"] ?? 0) + delta * per;
      if (delta > max) ban(`${mech ? "'Mechs" : "vehicles and infantry"} can't climb or drop more than ${max} level${max === 1 ? "" : "s"} in one hex (${delta} here)`);
    }
    if (mech && hex.rubble && !hex.paved) out.psr.push({ key: "rubble", label: "Entered rubble", mod: 0 });
    if (mech && hex.water && hex.depth > 0 && !hex.ice) {
      const mod = hex.depth === 1 ? -1 : hex.depth === 2 ? 0 : 1;
      out.psr.push({ key: "water", label: `Entered depth ${hex.depth} water`, mod });
    }
    prev = hex;
  }
  // Facing changes on pavement or ice: where each turn happens along the path.
  if (startFacing != null && !jumped && ["mech", "tracked", "wheeled", "hover"].includes(motive)) {
    let facing = startFacing;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 4) continue;
      const dir = ((Math.round((((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI) + 360) % 360) / 60) % 6) + 6) % 6;
      if (dir === (facing + 3) % 6) continue; // backing up
      if (dir !== facing) {
        const h = hexAt(a, regions);
        if (h.paved || h.ice) out.skidTurns++;
        facing = dir;
      }
    }
  }
  return out;
}

/** "light woods +2, level changes +2" */
export function terrainPartsText(parts) {
  return Object.entries(parts ?? {}).map(([label, mp]) => `${label} +${mp}`).join(", ");
}

/* -------------------------------------------- */
/*  Canvas: region colours and hover readout    */
/* -------------------------------------------- */

const DEFAULT_NAME = /^(region|new region)?\s*\d*$/i;

async function styleRegion(behavior) {
  const region = behavior?.parent;
  const t = TERRAIN_TYPES[behavior?.system?.terrain];
  if (!region || !t) return;
  const labels = Object.values(TERRAIN_TYPES).map(x => x.label);
  const upd = { color: t.color };
  if (DEFAULT_NAME.test(String(region.name ?? "").trim()) || labels.includes(region.name)) upd.name = t.label;
  await region.update(upd);
}

function hoverLabel(token, hovered) {
  try {
    let label = token.mfTerrain;
    if (!hovered) { if (label && !label.destroyed) label.visible = false; return; }
    const regions = terrainRegions(token.scene ?? globalThis.canvas?.scene);
    if (!regions.length) return;
    if (!label || label.destroyed) {
      label = token.mfTerrain = token.addChild(new PIXI.Text("", {
        fontFamily: "Roboto Condensed, Signika, sans-serif", fontSize: 14, fontWeight: "700",
        fill: 0xffffff, stroke: 0x111111, strokeThickness: 3
      }));
      label.eventMode = "none";
    }
    label.text = describeHex(hexAt(token.center, regions));
    label.position.set((token.w - label.width) / 2, token.h + 4);
    label.visible = true;
  } catch (err) {
    console.warn("mech-foundry | terrain label", err);
  }
}

/** Hooks: colour / name new terrain regions; show the terrain under a hovered token. */
export function registerTerrainDisplay() {
  Hooks.on("createRegionBehavior", (behavior, options, userId) => {
    if (behavior.type === TERRAIN_BEHAVIOR && userId === game.user.id) styleRegion(behavior);
  });
  Hooks.on("updateRegionBehavior", (behavior, changes, options, userId) => {
    if (behavior.type === TERRAIN_BEHAVIOR && userId === game.user.id && foundry.utils.hasProperty(changes, "system.terrain")) styleRegion(behavior);
  });
  Hooks.on("hoverToken", hoverLabel);
}
