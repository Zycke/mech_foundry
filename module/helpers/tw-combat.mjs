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

/* ------------------------------------------------------------------ */
/*  Hit location + damage (Total Warfare 'Mech Hit Location Table)      */
/* ------------------------------------------------------------------ */

/** Attack directions offered in the dialog (rear uses the Front column + rear armor). */
export const ATTACK_DIRECTIONS = [
  { key: 'front', label: 'Front' },
  { key: 'left', label: 'Left Side' },
  { key: 'right', label: 'Right Side' },
  { key: 'rear', label: 'Rear' }
];

/** 'Mech Hit Location Table (biped), by die roll and attack side. */
const MECH_HIT_LOCATION = {
  left:  { 2: 'lt', 3: 'll', 4: 'la', 5: 'la', 6: 'll', 7: 'lt', 8: 'ct', 9: 'rt', 10: 'ra', 11: 'rl', 12: 'head' },
  front: { 2: 'ct', 3: 'ra', 4: 'ra', 5: 'rl', 6: 'rt', 7: 'ct', 8: 'lt', 9: 'll', 10: 'la', 11: 'la', 12: 'head' },
  right: { 2: 'rt', 3: 'rl', 4: 'ra', 5: 'ra', 6: 'rl', 7: 'rt', 8: 'ct', 9: 'lt', 10: 'la', 11: 'll', 12: 'head' }
};

/** Damage transfer: destroyed location → where excess flows (null = terminal). */
const MECH_TRANSFER = { la: 'lt', ra: 'rt', ll: 'lt', rl: 'rt', lt: 'ct', rt: 'ct', ct: null, head: null };

const MECH_LOC_LABEL = {
  head: 'Head', ct: 'Center Torso', lt: 'Left Torso', rt: 'Right Torso',
  la: 'Left Arm', ra: 'Right Arm', ll: 'Left Leg', rl: 'Right Leg'
};

const REAR_ARMOR_KEY = { ct: 'ctRear', lt: 'ltRear', rt: 'rtRear' };

/**
 * Apply a block of damage to a mech, starting at a rolled location and
 * transferring inward through destroyed locations. Mutates and saves the actor.
 * @returns {object} summary for the chat card.
 */
export async function applyMechDamage(target, startLoc, amount, { rear = false } = {}) {
  const armor = foundry.utils.deepClone(target.system.armor || {});
  const structure = foundry.utils.deepClone(target.system.structure || {});
  const events = [];
  let loc = startLoc;
  let remaining = amount;
  let destroyed = false;
  let useRear = rear;
  let guard = 0;

  while (remaining > 0 && loc && guard++ < 12) {
    let absorbedThisLoc = false;
    // Armor (rear on the initially-struck torso only).
    const rearKey = useRear ? REAR_ARMOR_KEY[loc] : null;
    const armorSlot = rearKey ? armor[rearKey] : armor[loc];
    if (armorSlot && armorSlot.value > 0) {
      const a = Math.min(armorSlot.value, remaining);
      armorSlot.value -= a; remaining -= a; absorbedThisLoc = true;
    }
    if (remaining <= 0) break;
    // Internal structure.
    const st = structure[loc];
    if (st && st.value > 0) {
      const a = Math.min(st.value, remaining);
      st.value -= a; remaining -= a; absorbedThisLoc = true;
      if (st.value <= 0) {
        events.push(`${MECH_LOC_LABEL[loc]} destroyed`);
        if (loc === 'ct') { destroyed = true; loc = null; }
        else { loc = MECH_TRANSFER[loc]; useRear = false; }
        continue;
      }
    }
    if (!absorbedThisLoc) break; // nothing here to absorb (unconfigured location)
    break; // structure absorbed the rest without being destroyed
  }

  const update = { 'system.armor': armor, 'system.structure': structure };
  const applied = (target.isOwner || game.user.isGM);
  if (applied) await target.update(update);

  return {
    applied, destroyed,
    startLabel: MECH_LOC_LABEL[startLoc] || startLoc,
    events,
    overflow: remaining > 0 && !destroyed ? remaining : 0
  };
}

/* ------------------------------------------------------------------ */
/*  Cluster Hits Table (Total Warfare)                                  */
/* ------------------------------------------------------------------ */

const CLUSTER_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 40];
const CLUSTER_TABLE = {
  2:  [1, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 9, 9, 10, 10, 12],
  3:  [1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 9, 9, 10, 10, 12],
  4:  [1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 18],
  5:  [1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 24],
  6:  [1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 24],
  7:  [1, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 18, 24],
  8:  [2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 24],
  9:  [2, 2, 3, 4, 5, 5, 6, 6, 7, 8, 9, 10, 11, 11, 12, 13, 14, 14, 15, 16, 17, 18, 19, 20, 21, 21, 22, 23, 23, 32],
  10: [2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 11, 12, 13, 14, 14, 15, 16, 17, 18, 19, 20, 21, 21, 22, 23, 23, 24, 32],
  11: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 40],
  12: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 40]
};

/** Number of sub-munitions that hit for a given launcher size and 2d6 roll. */
export function clusterHits(size, roll2d6) {
  const r = Math.max(2, Math.min(12, roll2d6));
  // Snap to the nearest defined column.
  let col = CLUSTER_SIZES.indexOf(size);
  if (col < 0) {
    let best = 0, bestDiff = Infinity;
    CLUSTER_SIZES.forEach((s, i) => { const d = Math.abs(s - size); if (d < bestDiff) { bestDiff = d; best = i; } });
    col = best;
  }
  return CLUSTER_TABLE[r][col];
}

/** Roll 2d6 for a mech hit location given attack direction. */
export async function rollMechLocation(direction) {
  const dir = direction === 'rear' ? 'front' : direction;
  const map = MECH_HIT_LOCATION[dir] || MECH_HIT_LOCATION.front;
  const roll = await new Roll("2d6").evaluate();
  const loc = map[roll.total];
  return {
    roll, total: roll.total,
    dice: roll.dice[0]?.results?.map(r => r.result) ?? [],
    loc, label: MECH_LOC_LABEL[loc] || loc,
    crit: roll.total === 2,
    rear: direction === 'rear' && loc in REAR_ARMOR_KEY
  };
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
  const dirOpts = ATTACK_DIRECTIONS.map(d => `<option value="${d.key}">${d.label}</option>`).join('');
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
      <div class="form-group"><label>Attack Direction</label><select name="direction">${dirOpts}</select></div>
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
            other: num(f.other.value),
            direction: f.direction.value
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

  // On a hit, resolve damage. Cluster weapons (clusterSize > 0) roll the Cluster
  // Hits Table for the number of sub-munitions, then apply damage in 5-point
  // groups, each rolling its own hit location. Direct-fire weapons are one group.
  const rolls = [roll];
  let hitResult = null;
  const targetActor = target?.actor || null;
  const perHit = num(weapon.damage);
  const clusterSize = num(weapon.clusterSize);
  if (hit && perHit > 0) {
    let clusterInfo = null;
    let total = perHit;
    if (clusterSize > 0) {
      const cRoll = await new Roll("2d6").evaluate();
      rolls.push(cRoll);
      const missiles = clusterHits(clusterSize, cRoll.total);
      total = missiles * perHit;
      clusterInfo = {
        size: clusterSize, missiles, perHit, total,
        rollTotal: cRoll.total, dice: cRoll.dice[0]?.results?.map(r => r.result) ?? []
      };
    }

    const groupSizes = [];
    if (clusterSize > 0) { let t = total; while (t > 0) { groupSizes.push(Math.min(5, t)); t -= 5; } }
    else groupSizes.push(total);

    const isMech = targetActor?.type === 'mech';
    const groups = [];
    for (const g of groupSizes) {
      if (isMech) {
        const locRoll = await rollMechLocation(result.direction);
        rolls.push(locRoll.roll);
        const dmg = await applyMechDamage(targetActor, locRoll.loc, g, { rear: locRoll.rear });
        groups.push({
          damage: g, locLabel: locRoll.label + (locRoll.rear ? ' (rear)' : ''),
          locDice: locRoll.dice, crit: locRoll.crit,
          events: dmg.events, destroyed: dmg.destroyed, overflow: dmg.overflow
        });
      } else {
        groups.push({ damage: g });
      }
    }
    hitResult = {
      cluster: clusterSize > 0, clusterInfo,
      total, groups, isMech,
      applied: isMech && (targetActor.isOwner || game.user.isGM),
      hasTarget: !!targetActor,
      targetName: targetActor?.name || targetName
    };
  }

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
      damage,
      hitResult
    }
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${weapon.name || 'Weapon'} Attack`,
    content: content2,
    rolls
  });
}
