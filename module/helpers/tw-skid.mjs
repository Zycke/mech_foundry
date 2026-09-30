/**
 * Skidding, sideslipping and VTOL / WiGE crashes (Total Warfare pp. 62–63, 67;
 * Skid modifiers from the Piloting/Driving Skill Roll Table, p. 60).
 *
 * The map doesn't know about pavement or facing changes, so these are checks
 * the controlling player starts from the unit sheet when the situation arises
 * (a running 'Mech / flanking vehicle turning on pavement, or a flanking hover /
 * VTOL / WiGE turning), with the hexes moved so far pre-filled from the turn's
 * movement record.
 */
import { beginRecording, writeDoc } from "./gm-relay.mjs";
import { currentTurnKey } from "./tw-turn.mjs";
import { movedThisTurn, pilotUnconscious, setMovement, vehicleDrivingMods } from "./tw-movement.mjs";
import { phaseDamageSoFar, psrDamageMods } from "./tw-psr.mjs";
import { fiveGroups, postCard, resolveFall } from "./tw-falls.mjs";
import { resolveDamageAgainst } from "./tw-combat.mjs";
import { pilotingMods } from "./tw-skills.mjs";

const { DialogV2 } = foundry.applications.api;
const num = (v) => Number(v) || 0;
const sum = (mods) => mods.reduce((t, m) => t + num(m.value), 0);
const diceOf = (roll) => roll?.dice?.[0]?.results?.map(r => r.result) ?? [];

/** Skid modifier by hexes moved in the turn so far. */
export function skidModifier(hexes) {
  const h = num(hexes);
  if (h <= 2) return -1;
  if (h <= 4) return 0;
  if (h <= 7) return 1;
  if (h <= 10) return 2;
  if (h <= 17) return 4;
  if (h <= 24) return 5;
  return 6;
}

/** Vehicle movement types that sideslip instead of skidding. */
export function sideslips(actor) {
  return actor?.type === 'ground_vehicle' && ['hover', 'vtol', 'wige'].includes(actor.system?.movementType);
}

/** Did this unit skid this turn? (+1 to its attacks, +2 to attacks against it.) */
export function skiddedThisTurn(actor) {
  const key = currentTurnKey();
  return !!key && actor?.flags?.['mech-foundry']?.skid?.key === key;
}

/** Did this VTOL / WiGE crash this turn? (It may not attack.) */
export function crashedThisTurn(actor) {
  const key = currentTurnKey();
  return !!key && actor?.flags?.['mech-foundry']?.crashed?.key === key;
}

const drivingMods = (actor) => vehicleDrivingMods(actor);

async function askHexes(title, hint, extra = '') {
  const r = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-road" },
    content: `
      <div class="tw-attack-dialog">
        <div class="form-group"><label>${hint}</label><input type="number" name="hexes" value="${extra}" min="0" /></div>
        <div class="form-group"><label>Other modifier <span class="tw-hint">+ makes the roll harder, − easier</span></label><input type="number" name="other" value="0" /></div>
      </div>`,
    buttons: [
      { action: "roll", label: "Roll", icon: "fa-solid fa-dice", default: true, callback: (e, b) => ({ hexes: Math.max(0, num(b.form.elements.hexes.value)), other: num(b.form.elements.other.value) }) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  return !r || r === "cancel" ? null : r;
}

/**
 * Skid check: a running 'Mech or flanking ground vehicle (not hover / VTOL /
 * WiGE) turned on pavement and is entering a new hex. Piloting / Driving roll
 * + the skid modifier; a failure skids ⌈hexes / 2⌉ hexes in the old direction
 * of travel and ends its movement. A 'Mech falls first (normal falling damage),
 * then takes half its falling damage per hex skidded, in 5-point groups on the
 * fall's column. A vehicle rolls once on the Motive System Damage Table.
 */
export async function skidCheck(actor, { hexes = null, other = 0 } = {}) {
  if (!actor) return null;
  if (sideslips(actor)) { ui.notifications.warn(`${actor.name} sideslips rather than skids — use Sideslip.`); return null; }
  if (hexes === null) {
    const r = await askHexes(`Skid Check — ${actor.name}`, 'Hexes moved this turn so far', movedThisTurn(actor).hexes);
    if (!r) return null;
    ({ hexes, other } = r);
  }
  beginRecording();
  const rolls = [];
  const isMech = actor.type === 'mech';
  const plus20 = isMech && phaseDamageSoFar(actor) >= 20;
  const mods = [...pilotingMods(actor)];
  if (isMech) mods.push(...psrDamageMods(actor.system).filter(m => !m.gyroDestroyed));
  else mods.push(...drivingMods(actor));
  mods.push({ label: `Skid (${hexes} hex${hexes === 1 ? '' : 'es'})`, value: skidModifier(hexes) });
  if (plus20) mods.push({ label: '20+ damage this phase', value: 1 });
  if (other) mods.push({ label: 'Other', value: other });
  const res = { label: 'Avoid skidding', mods, tn: sum(mods) };
  if (pilotUnconscious(actor)) { res.auto = 'warrior unconscious — automatic failure'; res.success = false; }
  else {
    const roll = await new Roll("2d6").evaluate();
    rolls.push(roll);
    Object.assign(res, { total: roll.total, dice: diceOf(roll), success: roll.total >= res.tn });
  }

  const ctx = { results: [res] };
  if (res.success) {
    ctx.notes = [`${actor.name} holds the turn and may continue moving.`];
  } else {
    const skid = Math.ceil(hexes / 2);
    await writeDoc(actor, { 'flags.mech-foundry.skid': { key: currentTurnKey() } });
    ctx.notes = [`${actor.name} SKIDS ${skid} hex${skid === 1 ? '' : 'es'} in its direction of travel before the turn — move the token; its movement ends.`,
      'This turn: +1 to its attacks, +2 to attacks against it.'];
    if (isMech) {
      const fall = await resolveFall(actor, { levels: 0, rolls, plus20 });
      ctx.fall = fall;
      const perHex = Math.ceil(fall.damage / 2);
      const total = perHex * skid;
      if (total > 0) {
        ctx.skidFrag = await resolveDamageAgainst(actor, fall.dir, fiveGroups(total), rolls, actor.name, { noPSR: true, noIntercept: true });
        ctx.notes.push(`Skid damage: ${skid} hex${skid === 1 ? '' : 'es'} × ${perHex} = ${total}, on the ${fall.location} column`);
      }
    } else {
      ctx.skidFrag = await resolveDamageAgainst(actor, 'front', [], rolls, actor.name, { forceMotive: true, noIntercept: true });
      ctx.notes.push('Loses control: one roll on the Motive System Damage Table. No other damage unless it hits something or drops more than one level.');
    }
  }
  await postCard(actor, 'Skid Check', ctx, rolls);
  return { res, ...ctx };
}

/**
 * Sideslip check: a flanking hover vehicle, VTOL or WiGE changed facing and is
 * entering a new hex. Driving roll; on a failure it sideslips hexes equal to
 * the Margin of Failure (at most one less than the hexes entered this turn)
 * toward the hex it would have entered without the turn. No damage unless it
 * runs into something; the slipped hexes count toward its target movement.
 */
export async function sideslipCheck(actor, { hexes = null, other = 0 } = {}) {
  if (!actor) return null;
  if (!sideslips(actor)) { ui.notifications.warn(`Only hover vehicles, VTOLs and WiGEs sideslip — use Skid.`); return null; }
  if (hexes === null) {
    const r = await askHexes(`Sideslip Check — ${actor.name}`, 'Hexes entered this turn before the turn', movedThisTurn(actor).hexes);
    if (!r) return null;
    ({ hexes, other } = r);
  }
  beginRecording();
  const rolls = [];
  const mods = [...pilotingMods(actor), ...drivingMods(actor)];
  if (other) mods.push({ label: 'Other', value: other });
  const res = { label: 'Avoid sideslipping', mods, tn: sum(mods) };
  if (pilotUnconscious(actor)) { res.auto = 'crew unconscious — automatic failure'; res.success = false; res.total = 0; }
  else {
    const roll = await new Roll("2d6").evaluate();
    rolls.push(roll);
    Object.assign(res, { total: roll.total, dice: diceOf(roll), success: roll.total >= res.tn });
  }
  const ctx = { results: [res] };
  if (res.success) ctx.notes = [`${actor.name} follows its course.`];
  else {
    const mof = res.tn - num(res.total);
    const slip = Math.max(0, Math.min(mof, hexes - 1));
    if (slip > 0 && currentTurnKey()) await setMovement(actor, { hexes: movedThisTurn(actor).hexes + slip });
    ctx.notes = [slip
      ? `${actor.name} SIDESLIPS ${slip} hex${slip === 1 ? '' : 'es'} (margin of failure ${mof}) toward the hex it would have entered without turning — move the token. No MP cost; the hexes count for its target movement modifier. It may then continue in its new facing.`
      : `${actor.name} fails but has no room to sideslip (only ${hexes} hex${hexes === 1 ? '' : 'es'} entered).`];
    if (actor.system.movementType !== 'hover' && slip) ctx.notes.push('If the slip runs into terrain or a unit at or above its elevation it crashes — use Crash on the sheet.');
  }
  await postCard(actor, 'Sideslip Check', ctx, rolls);
  return { res, ...ctx };
}

/**
 * A sideslipping VTOL or WiGE crashes: damage = hexes moved this turn × tonnage
 * / 10 (round up) in 5-point groups on the side that struck, via the VTOL
 * (or ground vehicle, for WiGE) hit-location table. It can't attack this turn.
 */
export async function vehicleCrash(actor, { hexes = null, side = null } = {}) {
  if (!actor || actor.type !== 'ground_vehicle' || !['vtol', 'wige'].includes(actor.system?.movementType)) {
    ui.notifications.warn('Only VTOLs and WiGEs crash this way.');
    return null;
  }
  if (hexes === null || side === null) {
    const r = await DialogV2.wait({
      window: { title: `Crash — ${actor.name}`, icon: "fa-solid fa-helicopter" },
      content: `
        <div class="tw-attack-dialog">
          <div class="form-group"><label>Hexes moved this turn</label><input type="number" name="hexes" value="${movedThisTurn(actor).hexes}" min="0" /></div>
          <div class="form-group"><label>Side that hit the terrain</label><select name="side"><option value="front">Front</option><option value="left">Left</option><option value="right">Right</option><option value="rear">Rear</option></select></div>
        </div>`,
      buttons: [
        { action: "crash", label: "Crash", icon: "fa-solid fa-burst", default: true, callback: (e, b) => ({ hexes: Math.max(0, num(b.form.elements.hexes.value)), side: b.form.elements.side.value }) },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!r || r === "cancel") return null;
    ({ hexes, side } = r);
  }
  beginRecording();
  const rolls = [];
  const damage = Math.ceil((hexes * num(actor.system.tonnage)) / 10);
  if (currentTurnKey()) await writeDoc(actor, { 'flags.mech-foundry.crashed': { key: currentTurnKey() } });
  const frag = damage > 0 ? await resolveDamageAgainst(actor, side, fiveGroups(damage), rolls, actor.name, { noIntercept: true }) : null;
  // VTOL Explosions (TW p. 198): any crash damage to internal structure blows it up.
  let exploded = false;
  if (actor.system.movementType === 'vtol' && frag?.groups?.some(g => g.structureHit) && num(actor.system.structure?.value) > 0) {
    await writeDoc(actor, { 'system.structure': { ...actor.system.structure, value: 0 } });
    exploded = true;
  }
  await postCard(actor, 'Crash', {
    results: [],
    skidFrag: frag,
    notes: [`${actor.name} crashes: ${hexes} hexes × ${num(actor.system.tonnage)} t / 10 = ${damage} damage on its ${side} side.`,
      exploded ? 'Crash damage reached its internal structure: the VTOL EXPLODES and is destroyed.' : 'It may not attack this turn. If it survives and could land in this hex it has landed; otherwise it is destroyed.']
  }, rolls);
  return { damage, frag };
}
