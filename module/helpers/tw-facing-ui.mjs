/**
 * Facing controls and display for unit tokens:
 * - Q / E turn the selected units one hexside (rebindable; counted as MP and
 *   held to the Movement Phase like any move), Shift+Q / Shift+E twist a
 *   'Mech's torso one hexside for this turn;
 * - the same four controls on the token HUD;
 * - a facing marker on 'Mech, vehicle and aerospace tokens, a torso-twist
 *   marker, and (client setting) the firing arcs of the selected unit.
 */
import { currentTurnKey } from "./tw-turn.mjs";
import { arcSectors, facingRotation, torsoTwist, tokenFacing } from "./tw-facing.mjs";
import { pixelsPerMeter, GROUND_HEX_M } from "./tw-scale.mjs";

const TURNING = new Set(['mech', 'ground_vehicle', 'battle_armor', 'infantry', 'aerospace_fighter', 'small_craft']);
const MARKED = new Set(['mech', 'ground_vehicle', 'aerospace_fighter', 'small_craft']);

const setting = (key, fallback) => { try { return game.settings.get("mech-foundry", key); } catch { return fallback; } };

/** Turn the selected unit tokens one hexside (−1 left, +1 right). */
export async function turnSelected(dir, tokens = canvas?.tokens?.controlled ?? []) {
  const units = tokens.filter(t => TURNING.has(t.actor?.type) && t.document?.isOwner);
  for (const t of units) {
    const f = (tokenFacing(t.document) + dir + 6) % 6;
    await t.document.update({ rotation: facingRotation(f) });
  }
  return units.length > 0;
}

/** Twist the selected 'Mechs' torsos one hexside (−1 left, +1 right) for this turn. */
export async function twistSelected(dir, tokens = canvas?.tokens?.controlled ?? []) {
  const mechs = tokens.filter(t => t.actor?.type === 'mech' && t.actor.isOwner);
  for (const t of mechs) {
    const cur = torsoTwist(t.actor, currentTurnKey());
    if (!await setTorsoTwist(t.actor, cur + dir)) continue;
    drawFacing(t);
  }
  return mechs.length > 0;
}

/**
 * Set a 'Mech's torso twist for this turn: −1 left, 0 straight, +1 right.
 * Returns true when it changed.
 */
export async function setTorsoTwist(actor, dir) {
  const key = currentTurnKey();
  if (actor?.type !== 'mech') return false;
  if (!key) { ui.notifications.info("Torso twists last for a combat turn: start the combat first."); return false; }
  const next = Math.max(-1, Math.min(1, Math.trunc(Number(dir) || 0)));
  const cur = torsoTwist(actor, key);
  if (next !== 0 && actor.system?.conditions?.prone) { ui.notifications.warn(`${actor.name} is prone and can't twist its torso.`); return false; }
  if (next === cur) {
    if (Math.abs(Number(dir)) > 1) ui.notifications.info(`${actor.name}'s torso is already twisted as far as it goes (one hexside).`);
    return false;
  }
  await actor.update({ 'flags.mech-foundry.twist': { key, dir: next } });
  return true;
}

/** "twisted right" / "twisted left" / "" for this turn. */
export function twistText(actor, short = false) {
  const t = actor?.type === 'mech' ? torsoTwist(actor, currentTurnKey()) : 0;
  if (!t) return '';
  return short ? `twisted ${t > 0 ? 'R' : 'L'}` : `twisted ${t > 0 ? 'right' : 'left'}`;
}

/** Keybindings (call during init). */
export function registerFacingKeys() {
  const kb = (name, label, key, shift, fn) => game.keybindings.register("mech-foundry", name, {
    name: label, editable: [{ key, modifiers: shift ? ["Shift"] : [] }],
    onDown: () => { fn(); return (canvas?.tokens?.controlled?.length ?? 0) > 0; },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
  kb("turnLeft", "Turn unit left one hexside", "KeyQ", false, () => turnSelected(-1));
  kb("turnRight", "Turn unit right one hexside", "KeyE", false, () => turnSelected(1));
  kb("twistLeft", "Twist 'Mech torso left", "KeyQ", true, () => twistSelected(-1));
  kb("twistRight", "Twist 'Mech torso right", "KeyE", true, () => twistSelected(1));
}

/** Token HUD buttons (turn left / right, and torso twist for 'Mechs). */
function addHudButtons(hud, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const token = hud.object;
  if (!root || !TURNING.has(token?.actor?.type) || root.querySelector('.mf-facing-hud')) return;
  const col = root.querySelector('.col.right') ?? root;
  const wrap = document.createElement('div');
  wrap.className = 'mf-facing-hud';
  const btn = (cls, icon, title) => `<button type="button" class="control-icon ${cls}" title="${title}" aria-label="${title}"><i class="fas ${icon}"></i></button>`;
  const now = token.actor.type === 'mech' ? ` — torso now ${twistText(token.actor) || 'straight'}` : '';
  wrap.innerHTML = btn('mf-turn-l', 'fa-rotate-left', 'Turn left one hexside (Q)') + btn('mf-turn-r', 'fa-rotate-right', 'Turn right one hexside (E)')
    + (token.actor.type === 'mech' ? btn('mf-twist-l', 'fa-arrow-rotate-left', `Twist torso left (Shift+Q)${now}`) + btn('mf-twist-r', 'fa-arrow-rotate-right', `Twist torso right (Shift+E)${now}`) : '');
  col.append(wrap);
  const on = (sel, fn) => wrap.querySelector(sel)?.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); });
  on('.mf-turn-l', () => turnSelected(-1, [token]));
  on('.mf-turn-r', () => turnSelected(1, [token]));
  on('.mf-twist-l', () => twistSelected(-1, [token]));
  on('.mf-twist-r', () => twistSelected(1, [token]));
}

/* ------------------------------------------------------------------ */
/*  Drawing                                                             */
/* ------------------------------------------------------------------ */

const rad = (bearingDeg) => (bearingDeg - 90) * Math.PI / 180; // bearing (clockwise from up) → PIXI angle
// Arc fills: forward (the torso's facing) amber, both sides blue-grey, rear red.
const SECTOR_STYLE = { forward: [0xf2a53a, 0.22], side: [0x6f9fd8, 0.16], rear: [0xe0443a, 0.2] };
const SECTOR_LABEL = { forward: 'F', side: 'S', rear: 'R' };
const SECTOR_ORDER = { side: 0, rear: 1, forward: 2 }; // forward drawn last so its edges stay crisp
const LEGS = 0xf2a53a;   // amber: the legs / hull (the token's rotation)
const TORSO = 0x5fd3e6;  // cyan: a 'Mech's torso when twisted
const OUTLINE = 0x14181c;

/** The marker container on a token: { root, g (graphics), arcLabels (F / S / S / R) }. */
function markerParts(token) {
  let m = token.mfFacing;
  if (!m || m.root?.destroyed) {
    const root = new PIXI.Container();
    root.eventMode = 'none';
    const g = root.addChild(new PIXI.Graphics());
    // One letter per arc (F / S / S / R) at its outer edge.
    const arcLabels = [0, 1, 2, 3].map(() => root.addChild(new PIXI.Text('', { fontFamily: 'Roboto Condensed, Signika, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xffffff, stroke: OUTLINE, strokeThickness: 3 })));
    token.addChild(root);
    m = token.mfFacing = { root, g, arcLabels };
  }
  return m;
}

/**
 * Draw (or clear) a unit token's markers. The solid amber wedge is where the
 * legs (hull) face — the token's rotation, which sets the hit table. A 'Mech's
 * twisted torso adds a matching cyan wedge where the torso faces. When the unit
 * is selected its firing arcs are shaded from the torso's facing.
 */
export function drawFacing(token) {
  try {
    const actor = token?.actor;
    const show = MARKED.has(actor?.type) && setting('showFacing', true) !== false;
    if (!show) { const m = token?.mfFacing; if (m && !m.root?.destroyed) { m.g.clear(); for (const t of m.arcLabels) t.text = ''; } return; }
    const { root, g, arcLabels } = markerParts(token);
    g.clear();
    for (const t of arcLabels) t.text = '';
    const w = token.w, h = token.h, r = Math.max(w, h) / 2;
    root.position.set(w / 2, h / 2);
    const legs = tokenFacing(token.document) * 60;
    const twist = actor.type === 'mech' ? torsoTwist(actor, currentTurnKey()) : 0;
    const torso = legs + twist * 60;
    // Firing arcs of the selected unit (about three hexes out), all from the torso.
    if (token.controlled && setting('showFiringArcs', true) !== false) {
      const R = Math.max(r * 2, pixelsPerMeter() * GROUND_HEX_M * 3);
      const sectors = [...arcSectors(actor)].sort((a, b) => SECTOR_ORDER[a.kind] - SECTOR_ORDER[b.kind]);
      sectors.forEach((sct, i) => {
        const [color, alpha] = SECTOR_STYLE[sct.kind];
        g.beginFill(color, alpha).lineStyle(2, color, 0.9);
        g.moveTo(0, 0).arc(0, 0, R, rad(torso + sct.from), rad(torso + sct.to)).lineTo(0, 0);
        g.endFill();
        // Its letter just inside the outer edge, on the arc's centre line.
        const t = arcLabels[i];
        if (!t) return;
        const mid = rad(torso + (sct.from + sct.to) / 2);
        t.text = SECTOR_LABEL[sct.kind];
        t.style.fill = color;
        t.position.set(Math.cos(mid) * R * 0.86 - t.width / 2, Math.sin(mid) * R * 0.86 - t.height / 2);
      });
      g.lineStyle(0);
    }
    // A notched arrowhead on the token's edge, pointing along a bearing (narrow and
    // notched so it reads the right way at any of the six facings).
    const wedge = (deg, color) => {
      const a = rad(deg), px = Math.cos(a), py = Math.sin(a), qx = -py, qy = px;
      const tip = r + Math.max(10, r * 0.36), back = r - 4, notch = back + Math.max(4, r * 0.12), half = Math.max(6, r * 0.2);
      g.beginFill(color, 0.95).lineStyle(1, OUTLINE, 0.9);
      g.drawPolygon([px * tip, py * tip, px * back + qx * half, py * back + qy * half, px * notch, py * notch, px * back - qx * half, py * back - qy * half]);
      g.endFill();
    };
    // Legs: amber; a twisted torso: the same arrow in cyan.
    wedge(legs, LEGS);
    if (twist) wedge(torso, TORSO);
  } catch (err) {
    console.warn("mech-foundry | facing marker", err);
  }
}

/** Hooks for the HUD and the markers. */
export function registerFacingDisplay() {
  Hooks.on("renderTokenHUD", addHudButtons);
  Hooks.on("refreshToken", (token) => drawFacing(token));
  Hooks.on("controlToken", (token) => drawFacing(token));
  // A torso twist (actor flag) redraws the unit's tokens.
  Hooks.on("updateActor", (actor, changes) => {
    if (!foundry.utils.hasProperty(changes, "flags.mech-foundry.twist")) return;
    for (const t of actor.getActiveTokens?.() ?? []) drawFacing(t);
  });
}
