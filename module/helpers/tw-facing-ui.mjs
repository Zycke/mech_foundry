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
  const key = currentTurnKey();
  for (const t of mechs) {
    const actor = t.actor;
    if (!key) { ui.notifications.info("Torso twists last for a combat turn: start the combat first."); return true; }
    if (actor.system?.conditions?.prone) { ui.notifications.warn(`${actor.name} is prone and can't twist its torso.`); continue; }
    const cur = torsoTwist(actor, key);
    const next = Math.max(-1, Math.min(1, cur + dir));
    if (next === cur) { ui.notifications.info(`${actor.name}'s torso is already twisted as far as it goes (one hexside).`); continue; }
    await actor.update({ 'flags.mech-foundry.twist': { key, dir: next } });
    drawFacing(t);
  }
  return mechs.length > 0;
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
  wrap.innerHTML = btn('mf-turn-l', 'fa-rotate-left', 'Turn left one hexside (Q)') + btn('mf-turn-r', 'fa-rotate-right', 'Turn right one hexside (E)')
    + (token.actor.type === 'mech' ? btn('mf-twist-l', 'fa-arrow-rotate-left', 'Twist torso left (Shift+Q)') + btn('mf-twist-r', 'fa-arrow-rotate-right', 'Twist torso right (Shift+E)') : '');
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
const SECTOR_STYLE = { forward: [0xf2a53a, 0.14], side: [0x8b98a3, 0.08], rear: [0xd9483b, 0.12] };

/** Draw (or clear) a unit token's facing marker, torso twist and — when selected — firing arcs. */
export function drawFacing(token) {
  try {
    const actor = token?.actor;
    const show = MARKED.has(actor?.type) && setting('showFacing', true) !== false;
    let g = token.mfFacing;
    if (!show) { if (g && !g.destroyed) g.clear(); return; }
    if (!g || g.destroyed) {
      g = new PIXI.Graphics();
      g.eventMode = 'none';
      token.mfFacing = token.addChild(g);
    }
    g.clear();
    const w = token.w, h = token.h, r = Math.max(w, h) / 2;
    g.position.set(w / 2, h / 2);
    const facing = tokenFacing(token.document) * 60;
    const twist = actor.type === 'mech' ? torsoTwist(actor, currentTurnKey()) : 0;
    // Firing arcs of the selected unit (about three hexes out).
    if (token.controlled && setting('showFiringArcs', true) !== false) {
      const R = Math.max(r * 2, pixelsPerMeter() * GROUND_HEX_M * 3);
      for (const s of arcSectors(actor)) {
        const base = s.kind === 'rear' ? facing : facing + twist * 60;
        const [color, alpha] = SECTOR_STYLE[s.kind];
        g.beginFill(color, alpha).lineStyle(1, color, alpha * 3);
        g.moveTo(0, 0).arc(0, 0, R, rad(base + s.from), rad(base + s.to)).lineTo(0, 0);
        g.endFill();
      }
    }
    // Facing marker: a wedge on the token's front edge.
    const tri = (deg, len, half, color, alpha) => {
      const a = rad(deg), px = Math.cos(a), py = Math.sin(a), qx = -py, qy = px;
      g.beginFill(color, alpha).lineStyle(1, 0x14181c, 0.9);
      g.drawPolygon([px * (r + len), py * (r + len), px * (r - 2) + qx * half, py * (r - 2) + qy * half, px * (r - 2) - qx * half, py * (r - 2) - qy * half]);
      g.endFill();
    };
    tri(facing, Math.max(8, r * 0.28), Math.max(6, r * 0.22), 0xf2a53a, 0.95);
    if (twist) tri(facing + twist * 60, Math.max(5, r * 0.18), Math.max(4, r * 0.14), 0xffcf7a, 0.8);
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
