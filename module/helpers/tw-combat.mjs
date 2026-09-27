/**
 * Total Warfare combat automation — shared logic for mech / vehicle / aerospace
 * unit sheets. This first phase implements the GATOR to-hit sequence: a weapon's
 * Attack button opens a modifier dialog, rolls 2d6 against the assembled target
 * number, and posts a chat card. Hit-location, cluster-hit and damage resolution
 * are layered on in later phases (their tables are verified from Total Warfare
 * before shipping).
 */
import {
  actorSkillRating,
  MECH_GUNNERY_SKILLS, VEHICLE_GUNNERY_SKILLS, AERO_GUNNERY_SKILLS
} from "./atow-conversion.mjs";

const { DialogV2 } = foundry.applications.api;

/** GATOR — attacker movement modifiers (Total Warfare, Attack Modifiers table). */
export const ATTACKER_MOVE_MODS = [
  { key: 'stationary', label: 'Stationary', mod: 0 },
  { key: 'walked', label: 'Walked / Cruised', mod: 1 },
  { key: 'ran', label: 'Ran / Flanked', mod: 2 },
  { key: 'jumped', label: 'Jumped', mod: 3 }
];

const num = (v) => Number(v) || 0;

/** Heat-based to-hit penalty (mech/aero): +1@8, +2@13, +3@17, +4@24. */
export function heatToHitMod(actor) {
  const h = num(actor?.system?.heat?.value);
  return [8, 13, 17, 24].filter(t => h >= t).length;
}

/** Resolve the crew Gunnery rating, deriving from a linked character when present. */
export function gunneryFor(actor) {
  const crew = actor.system.pilot || actor.system.crew || {};
  const linked = crew.actorId ? game.actors.get(crew.actorId) : null;
  if (linked) {
    const cands = actor.type === 'mech' ? MECH_GUNNERY_SKILLS
      : actor.type === 'ground_vehicle' ? VEHICLE_GUNNERY_SKILLS
        : AERO_GUNNERY_SKILLS;
    const r = actorSkillRating(linked, cands);
    if (r) return r.rating;
  }
  return num(crew.gunnery ?? 4);
}

/** Distance in hexes (grid spaces) between two tokens, or null. */
export function measureHexes(a, b) {
  if (!a || !b || !canvas?.grid) return null;
  try {
    const r = canvas.grid.measurePath([a.center, b.center]);
    return Math.round(r.spaces ?? r.distance ?? 0);
  } catch {
    return null;
  }
}

/** Range bracket + modifier from a weapon's short/medium/long (in hexes). */
export function rangeBracket(distance, weapon) {
  const s = num(weapon.rangeS ?? weapon.short);
  const m = num(weapon.rangeM ?? weapon.medium);
  const l = num(weapon.rangeL ?? weapon.long);
  if (distance == null) return { bracket: '—', mod: 0, inRange: true, unknown: true };
  if (s && distance <= s) return { bracket: 'Short', mod: 0, inRange: true };
  if (m && distance <= m) return { bracket: 'Medium', mod: 2, inRange: true };
  if (l && distance <= l) return { bracket: 'Long', mod: 4, inRange: true };
  return { bracket: 'Out of range', mod: 0, inRange: false };
}

/**
 * Open the GATOR to-hit dialog for a weapon, roll 2d6, and post a chat card.
 * @param {Actor} actor   The attacking unit.
 * @param {object} weapon The weapon entry from the actor's system.weapons.
 */
export async function weaponAttack(actor, weapon) {
  if (!actor || !weapon) return;

  const gunnery = gunneryFor(actor);
  const heatMod = heatToHitMod(actor);
  const attackerToken = actor.getActiveTokens?.()[0] || null;
  const target = [...(game.user?.targets ?? [])][0] || null;
  const targetName = target?.name || '';
  const autoDist = attackerToken && target ? measureHexes(attackerToken, target) : null;

  const moveOpts = ATTACKER_MOVE_MODS
    .map(m => `<option value="${m.mod}">${m.label} (+${m.mod})</option>`).join('');
  const s = num(weapon.rangeS ?? weapon.short), m = num(weapon.rangeM ?? weapon.medium), l = num(weapon.rangeL ?? weapon.long);
  const rangeHint = `S ${s} / M ${m} / L ${l}`;

  const content = `
    <div class="tw-attack-dialog">
      <p class="tw-atk-target">${targetName ? `Target: <strong>${foundry.utils.escapeHTML?.(targetName) ?? targetName}</strong>` : 'No target selected — enter range manually.'}</p>
      <div class="form-group"><label>Gunnery Skill</label><input type="number" name="gunnery" value="${gunnery}" /></div>
      <div class="form-group"><label>Attacker Movement</label><select name="attackerMove">${moveOpts}</select></div>
      <div class="form-group"><label>Target Movement Mod</label><input type="number" name="targetMove" value="0" /></div>
      <div class="form-group"><label>Range (hexes) <span class="tw-hint">${rangeHint}</span></label><input type="number" name="range" value="${autoDist ?? ''}" /></div>
      <div class="form-group"><label>Heat Mod</label><input type="number" name="heat" value="${heatMod}" /></div>
      <div class="form-group"><label>Other Mod</label><input type="number" name="other" value="0" /></div>
    </div>`;

  const result = await DialogV2.wait({
    window: { title: `Attack — ${weapon.name || 'Weapon'}`, icon: "fa-solid fa-crosshairs" },
    content,
    buttons: [
      {
        action: "roll", label: "Roll Attack", icon: "fa-solid fa-dice", default: true,
        callback: (ev, button) => {
          const f = button.form.elements;
          return {
            gunnery: num(f.gunnery.value),
            attackerMove: num(f.attackerMove.value),
            targetMove: num(f.targetMove.value),
            range: f.range.value === '' ? null : num(f.range.value),
            heat: num(f.heat.value),
            other: num(f.other.value)
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return;

  const rb = rangeBracket(result.range, weapon);
  const tn = result.gunnery + result.attackerMove + result.targetMove + rb.mod + result.heat + result.other;

  const roll = await new Roll("2d6").evaluate();
  const dice = roll.dice[0]?.results?.map(r => r.result) ?? [];
  const hit = rb.inRange && roll.total >= tn;
  const margin = roll.total - tn;

  const mods = [
    { label: "Gunnery", value: result.gunnery },
    { label: "Attacker move", value: result.attackerMove },
    { label: "Target move", value: result.targetMove },
    { label: `Range (${rb.bracket})`, value: rb.mod },
    { label: "Heat", value: result.heat },
    { label: "Other", value: result.other }
  ].filter(m => m.value !== 0 || m.label === "Gunnery");

  const content2 = await foundry.applications.handlebars.renderTemplate(
    "systems/mech-foundry/templates/chat/tw-attack.hbs",
    {
      weaponName: weapon.name || 'Weapon',
      location: weapon.location || weapon.arc || '',
      targetName,
      mods, tn,
      dice, rollTotal: roll.total,
      hit, margin: Math.abs(margin),
      outOfRange: !rb.inRange,
      damage: num(weapon.damage)
    }
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${weapon.name || 'Weapon'} Attack`,
    content: content2,
    rolls: [roll]
  });
}
