/**
 * Map scale for unit-scale (Total Warfare) play on gridless / metric scenes.
 *
 * Scenes use real distances (the system default is 1 grid unit = 1 m, shared
 * with character-scale play). Total Warfare counts hexes, so distances are
 * converted: one ground hex is 30 m, one aerospace hex on the low-altitude map
 * is 500 m. Scenes measured in other units (km, ft, …) convert through metres;
 * a scene whose units are "hex" / "hexes" is read as hexes directly.
 */

export const GROUND_HEX_M = 30;
export const AERO_HEX_M = 500;

const num = (v) => Number(v) || 0;

const UNIT_METERS = {
  m: 1, meter: 1, meters: 1, metre: 1, metres: 1,
  km: 1000, kilometer: 1000, kilometers: 1000, kilometre: 1000, kilometres: 1000,
  ft: 0.3048, foot: 0.3048, feet: 0.3048, yd: 0.9144, yard: 0.9144, yards: 0.9144,
  mi: 1609.344, mile: 1609.344, miles: 1609.344
};

/** Metres per scene distance unit, 'hex' for hex-unit scenes, or null when unknown. */
export function sceneUnitMeters(units = globalThis.canvas?.scene?.grid?.units) {
  const u = String(units ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!u) return 1; // no units set: the system default is metres
  if (/^hex(es)?$/.test(u)) return 'hex';
  return UNIT_METERS[u] ?? null;
}

/**
 * Hexes spanned by a distance in metres. Any part of a hex counts (91 m is 4
 * hexes), with a little slack for token placement. With `sameHex`, distances
 * under half a hex are 0 (units sharing a hex).
 */
export function metersToHexes(meters, hexMeters = GROUND_HEX_M, { sameHex = true } = {}) {
  const m = Math.max(0, num(meters));
  if (m <= 0) return 0;
  if (sameHex && m < hexMeters / 2) return 0;
  return Math.max(1, Math.ceil(m / hexMeters - 0.05));
}

/**
 * Convert a canvas.grid.measurePath result to metres (or to hexes when the
 * scene is measured in hexes / an unknown unit: returns { hexes }).
 */
function measured(r) {
  const per = sceneUnitMeters();
  if (per === 'hex' || per === null) return { hexes: Math.round(r.spaces ?? r.distance ?? 0) };
  return { meters: num(r.distance) * per };
}

/** Metres between two points or tokens' centres, or null. `hexes` when the scene counts hexes. */
export function measureMeters(points) {
  if (!globalThis.canvas?.grid || points.length < 2) return null;
  try {
    return measured(canvas.grid.measurePath(points));
  } catch {
    return null;
  }
}

/** Distance in Total Warfare hexes between two tokens (30 m ground hexes, or 500 m for aerospace). */
export function measureHexes(a, b, hexMeters = GROUND_HEX_M) {
  if (!a || !b) return null;
  const r = measureMeters([a.center, b.center]);
  if (!r) return null;
  return r.meters === undefined ? r.hexes : metersToHexes(r.meters, hexMeters);
}

/** Canvas pixels per metre on the current scene (for area-effect radii). */
export function pixelsPerMeter() {
  const grid = globalThis.canvas?.grid;
  const per = sceneUnitMeters();
  const perUnit = per === 'hex' ? GROUND_HEX_M : per ?? 1;
  return num(grid?.size) / Math.max(1e-6, num(grid?.distance || 1) * perUnit);
}

/** "95 m" / "1.2 km" for hints. */
export function formatMeters(m) {
  const v = num(m);
  return v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${Math.round(v)} m`;
}
