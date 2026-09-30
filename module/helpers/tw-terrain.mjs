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
        depth: new NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0, max: 20 })
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

/** The scene's terrain regions: [{ region, terrain, level, depth }]. */
export function terrainRegions(scene = globalThis.canvas?.scene) {
  const out = [];
  for (const region of scene?.regions ?? []) {
    for (const b of region.behaviors ?? []) {
      if (b.type !== TERRAIN_BEHAVIOR || b.disabled) continue;
      const s = b.system ?? {};
      out.push({ region, terrain: TERRAIN_TYPES[s.terrain] ? s.terrain : "clear", level: num(s.level), depth: Math.max(0, num(s.depth)) });
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
  const hex = { terrains: [], woods: null, smoke: null, depth: 0, level: 0, water: false };
  const levels = [];
  for (const r of regions) {
    if (!regionHas(r.region, p)) continue;
    if (!hex.terrains.includes(r.terrain)) hex.terrains.push(r.terrain);
    if (r.terrain === "heavyWoods") hex.woods = "heavy";
    else if (r.terrain === "lightWoods" && hex.woods !== "heavy") hex.woods = "light";
    if (r.terrain === "heavySmoke") hex.smoke = "heavy";
    else if (r.terrain === "lightSmoke" && hex.smoke !== "heavy") hex.smoke = "light";
    if (r.terrain === "water") { hex.water = true; hex.depth = Math.max(hex.depth, r.depth); }
    if (r.level) levels.push(r.level);
  }
  // Ground level: the highest hill level here, else the deepest hollow (0 when none is set).
  if (levels.length) hex.level = levels.some(l => l > 0) ? Math.max(...levels) : Math.min(...levels);
  for (const k of ["building", "rough", "rubble", "swamp", "paved", "ice"]) hex[k] = hex.terrains.includes(k);
  return hex;
}

/** "Heavy woods · Level 1", "Water (depth 1)", "Clear". */
export function describeHex(hex) {
  const parts = hex.terrains.filter(t => t !== "clear").map(t => t === "water" ? `Water (depth ${hex.depth})` : TERRAIN_TYPES[t].label);
  if (!parts.length) parts.push("Clear");
  if (hex.level) parts.push(`Level ${hex.level}`);
  return parts.join(" · ");
}

/** Hexes a stretch of `px` counts as: whole hexes, rounding half a hex (15 m) up. */
export function stretchHexes(px, pxPerHex) {
  return Math.floor(px / pxPerHex + 0.5 + 1e-9);
}

/**
 * Woods and smoke between two points, not counting either end hex:
 * { lightWoods, heavyWoods, lightSmoke, heavySmoke, points, blocked }.
 */
export function lineTerrain(from, to, { regions = terrainRegions(), pxPerHex = pixelsPerMeter() * GROUND_HEX_M } = {}) {
  const out = { lightWoods: 0, heavyWoods: 0, lightSmoke: 0, heavySmoke: 0, points: 0, blocked: false };
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const start = pxPerHex / 2, end = d - pxPerHex / 2;
  if (!regions.length || !(pxPerHex > 0) || end <= start) return out;
  const step = Math.max(pxPerHex / GROUND_HEX_M, (end - start) / 4000); // ~1 m
  const runs = { woods: [null, 0], smoke: [null, 0] };
  const close = (k) => {
    const [cls, len] = runs[k];
    if (cls) out[`${cls}${k === "woods" ? "Woods" : "Smoke"}`] += stretchHexes(len, pxPerHex);
    runs[k] = [null, 0];
  };
  for (let t = start + step / 2; t < end; t += step) {
    const f = t / d;
    const hex = hexAt({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }, regions);
    const seg = Math.min(step, end - (t - step / 2));
    for (const k of ["woods", "smoke"]) {
      if (runs[k][0] !== hex[k]) close(k);
      if (hex[k]) runs[k] = [hex[k], runs[k][1] + seg];
    }
  }
  close("woods"); close("smoke");
  out.points = out.lightWoods + out.lightSmoke + 2 * (out.heavyWoods + out.heavySmoke);
  out.blocked = out.points >= 3;
  return out;
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
 *   partialCover, inOpen, line, attackerHex, targetHex, attackerSubmerged,
 *   targetSubmerged, attackerDepth, summary[] }.
 */
export function mapAttackTerrain(actor, targetActor, from, to, opts = {}) {
  if (!from || !to) return null;
  const regions = opts.regions ?? terrainRegions();
  if (!regions.length) return null;
  const line = lineTerrain(from, to, { regions, pxPerHex: opts.pxPerHex ?? pixelsPerMeter() * GROUND_HEX_M });
  const attackerHex = hexAt(from, regions), targetHex = hexAt(to, regions);
  const mech = (a) => a?.type === "mech";
  const cover = (h) => (h.woods === "heavy" || h.smoke === "heavy") ? "heavy" : (h.woods || h.smoke) ? "light" : "none";
  const res = {
    line, attackerHex, targetHex,
    lightWoods: line.lightWoods + line.lightSmoke,
    heavyWoods: line.heavyWoods + line.heavySmoke,
    targetWoods: cover(targetHex),
    partialCover: mech(targetActor) && targetHex.water && targetHex.depth === 1,
    inOpen: inTheOpen(targetHex),
    attackerDepth: mech(actor) && attackerHex.water ? attackerHex.depth : 0,
    attackerSubmerged: mech(actor) && attackerHex.water && attackerHex.depth >= 2,
    targetSubmerged: mech(targetActor) && targetHex.water && targetHex.depth >= 2
  };
  const s = [];
  const between = [
    line.lightWoods && `${line.lightWoods} light woods`, line.heavyWoods && `${line.heavyWoods} heavy woods`,
    line.lightSmoke && `${line.lightSmoke} light smoke`, line.heavySmoke && `${line.heavySmoke} heavy smoke`
  ].filter(Boolean);
  s.push(between.length ? `${between.join(", ")} between` : "open ground between");
  s.push(`target in ${describeHex(targetHex).toLowerCase()}`);
  if (res.partialCover) s.push("partial cover (depth 1 water)");
  if (line.blocked) s.push(`line of sight blocked (${line.points} woods / smoke points; 3 block)`);
  res.summary = s;
  return res;
}

/** Why the map stops this weapon firing ('' when it doesn't). */
export function terrainRowBlock(map, actor, weapon) {
  if (!map) return "";
  if (map.attackerSubmerged && !map.targetSubmerged) return `${actor?.name ?? "The attacker"} is submerged (depth ${map.attackerDepth} water)`;
  if (map.targetSubmerged && !map.attackerSubmerged) return `the target is submerged (depth ${map.targetHex.depth} water)`;
  if (map.line.blocked && !(map.attackerSubmerged && map.targetSubmerged)) return `no line of sight (${map.line.points} woods / smoke points between; 3 block)`;
  if (map.attackerDepth === 1 && LEG_LOC.test(String(weapon?.location ?? "").trim().toLowerCase())) return "leg weapons can't fire from depth 1 water";
  return "";
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
