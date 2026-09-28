/**
 * Total Warfare physical attacks: punch, kick, club, push, physical weapons,
 * charge and death from above (TW pp. 144–151; Physical Attack Modifiers,
 * Punch / Kick Location, Physical Weapon Attacks tables; the physical rows of
 * the Attack Modifiers Table).
 *
 * To-hit is the attacker's Piloting + the attack's modifier + the shared
 * movement / target / terrain modifiers (never heat or sensors) + actuator
 * damage. Level differences aren't modelled (the map has no elevation data):
 * the rules here assume both units stand at the same level.
 */
import { currentTurnKey } from "./tw-turn.mjs";
import { beginRecording, endRecording, writeDoc } from "./gm-relay.mjs";
import {
  autoAttackMods, destroyedActuators, locationDestroyed, movedThisTurn,
  pilotUnconscious, terrainMods, weaponArm
} from "./tw-movement.mjs";
import { queuePSR } from "./tw-psr.mjs";
import { untargetableReason } from "./tw-infantry.mjs";
import { fiveGroups, pilotingFor, postCard, resolveFall } from "./tw-falls.mjs";
import {
  ATTACK_DIRECTIONS, MECH_LOC_LABEL, REAR_ARMOR_KEY, firedThisTurn, locationGone, measureHexes, resolveDamageAgainst
} from "./tw-combat.mjs";

const { DialogV2 } = foundry.applications.api;
const num = (v) => Number(v) || 0;
const sum = (mods) => mods.reduce((t, m) => t + num(m.value), 0);
// Actuator damage halves punch / kick damage, rounding down (TW p. 127).
const halve = (n, times) => { let d = n; for (let i = 0; i < times; i++) d = Math.floor(d / 2); return d; };

/** Physical Attack Modifiers Table. */
export const PHYSICAL_TYPES = {
  punchL: { label: 'Punch (left arm)', mod: 0 },
  punchR: { label: 'Punch (right arm)', mod: 0 },
  kick: { label: 'Kick', mod: -2 },
  club: { label: 'Club', mod: -1 },
  push: { label: 'Push', mod: -1 },
  weapon: { label: 'Physical weapon', mod: 0 },
  charge: { label: 'Charge', mod: 0 },
  dfa: { label: 'Death from above', mod: 0 }
};

/**
 * Physical Weapon Attacks Table. `halves`: damage is halved by upper/lower arm
 * actuator damage (to-hit is always affected). `table: 'punch'` resolves on the
 * Punch Location Table. `ignoresHand`: hand actuator damage doesn't matter.
 */
export const PHYSICAL_WEAPONS = {
  backhoe: { label: 'Backhoe', mod: 1, dmg: () => 6, halves: true },
  chainsaw: { label: 'Chainsaw', mod: 0, dmg: () => 5 },
  combine: { label: 'Combine', mod: -2, dmg: () => 3 },
  dualSaw: { label: 'Dual Saw', mod: 0, dmg: () => 7 },
  hatchet: { label: 'Hatchet', mod: -1, dmg: (t) => Math.ceil(t / 5), halves: true },
  pileDriver: { label: 'Heavy-Duty Pile Driver', mod: 2, dmg: () => 9, forward: true },
  miningDrill: { label: 'Mining Drill', mod: -1, dmg: () => 4 },
  retractableBlade: { label: 'Retractable Blade', mod: -2, dmg: (t) => Math.ceil(t / 10), halves: true, ignoresHand: true },
  rockCutter: { label: 'Rock Cutter', mod: 1, dmg: () => 5 },
  spotWelder: { label: 'Spot Welder', mod: 0, dmg: () => 5, table: 'punch' },
  sword: { label: 'Sword', mod: -2, dmg: (t) => Math.ceil(t / 10) + 1, halves: true },
  wreckingBall: { label: 'Wrecking Ball', mod: 1, dmg: () => 8, forward: true }
};

/* ------------------------------------------------------------------ */
/*  Punch / Kick Location Tables (biped)                                */
/* ------------------------------------------------------------------ */

const PUNCH_LOCATION = {
  left: { 1: 'lt', 2: 'lt', 3: 'ct', 4: 'la', 5: 'la', 6: 'head' },
  front: { 1: 'la', 2: 'lt', 3: 'ct', 4: 'rt', 5: 'ra', 6: 'head' },
  right: { 1: 'rt', 2: 'rt', 3: 'ct', 4: 'ra', 5: 'ra', 6: 'head' }
};
const KICK_LOCATION = {
  left: { low: 'll', high: 'll' },
  front: { low: 'rl', high: 'll' },
  right: { low: 'rl', high: 'rl' }
};

function d6Location(direction, pick) {
  return async (dir = direction) => {
    const col = dir === 'rear' ? 'front' : (dir in PUNCH_LOCATION ? dir : 'front');
    const r = await new Roll("1d6").evaluate();
    const loc = pick(col, r.total);
    return {
      roll: r, total: r.total, dice: [r.total], loc, label: MECH_LOC_LABEL[loc] || loc,
      crit: false, rear: dir === 'rear' && loc in REAR_ARMOR_KEY
    };
  };
}
/** 1D6 on the 'Mech Punch Location Table (rear attacks use Front/Rear + rear armor). */
export const rollPunchLocation = d6Location('front', (col, n) => PUNCH_LOCATION[col][n]);
/** 1D6 on the 'Mech Kick Location Table. */
export const rollKickLocation = d6Location('front', (col, n) => (n <= 3 ? KICK_LOCATION[col].low : KICK_LOCATION[col].high));

/* ------------------------------------------------------------------ */
/*  Legality + modifiers                                                */
/* ------------------------------------------------------------------ */

/** Physical attacks made this turn, as a list of type keys. */
export function physicalThisTurn(actor) {
  const rec = actor?.flags?.['mech-foundry']?.physical;
  return rec && rec.key === currentTurnKey() ? (rec.list || []) : [];
}

/** Did any weapon in this arm fire this turn? */
function armFired(actor, arm) {
  const fired = firedThisTurn(actor);
  return (actor.system.weapons || []).some(w => fired[w.id] !== undefined && weaponArm(w) === arm);
}

/**
 * Why this physical attack can't be made (or null if it can).
 * @param {Actor} actor
 * @param {string} type      PHYSICAL_TYPES key
 * @param {object} opts      { arm, weaponKey, target }
 */
export function physicalBlock(actor, type, { arm = null, weaponKey = null, target = null } = {}) {
  const sys = actor.system;
  const isMech = actor.type === 'mech';
  if (!isMech && !(actor.type === 'ground_vehicle' && type === 'charge')) return 'Only BattleMechs make physical attacks (vehicles may charge).';
  if (actor.type === 'ground_vehicle' && ['vtol', 'wige'].includes(sys.movementType)) return 'VTOLs and WiGEs cannot charge.';
  if (sys.conditions?.shutdown || sys.conditions?.immobile) return `${actor.name} is shut down or immobile.`;
  if (pilotUnconscious(actor)) return `${actor.name}'s warrior is unconscious.`;

  const done = physicalThisTurn(actor);
  const bothPunches = done.length === 1 && ['punchL', 'punchR'].includes(done[0]) && ['punchL', 'punchR'].includes(type) && done[0] !== type;
  if (done.length && !bothPunches) return `${actor.name} has already made a physical attack this turn (only two punches can combine).`;

  const tt = target?.type;
  if (tt && ['aerospace_fighter', 'small_craft', 'naval_ship'].includes(tt)) return 'Aerospace units cannot be targeted by physical attacks.';
  if (target && untargetableReason(target)) return untargetableReason(target);
  const lowTarget = tt === 'ground_vehicle' || tt === 'battle_armor';

  if (type === 'punchL' || type === 'punchR' || type === 'weapon') {
    const a = type === 'punchL' ? 'la' : type === 'punchR' ? 'ra' : arm;
    if (!a) return 'Choose the arm.';
    const act = destroyedActuators(actor, a);
    if (locationGone(actor, a)) return `The ${a.toUpperCase()} is destroyed.`;
    if (act.shoulder) return `Shoulder hit: no ${type === 'weapon' ? 'physical weapon attacks' : 'punching'} with the ${a.toUpperCase()}.`;
    if (type === 'weapon' && act.hand && !PHYSICAL_WEAPONS[weaponKey]?.ignoresHand) return `Hand actuator hit: no physical weapon attacks with the ${a.toUpperCase()}.`;
    if (armFired(actor, a)) return `A weapon in the ${a.toUpperCase()} fired this turn.`;
    if (lowTarget) return "A 'Mech can't punch, club or swing at vehicles or infantry on the same level.";
  }
  if (type === 'kick') {
    if (locationDestroyed(actor, 'll') || locationDestroyed(actor, 'rl')) return 'A leg is destroyed: no kicking.';
    if (destroyedActuators(actor, 'll').hip || destroyedActuators(actor, 'rl').hip) return 'Hip actuator hit: no kicking attacks.';
  }
  if (type === 'club' || type === 'push') {
    for (const a of ['la', 'ra']) {
      if (locationGone(actor, a)) return `The ${a.toUpperCase()} is destroyed.`;
      if (armFired(actor, a)) return `A weapon in the ${a.toUpperCase()} fired this turn.`;
      const act = destroyedActuators(actor, a);
      if (type === 'club' && (act.shoulder || act.hand)) return `Shoulder or hand actuator hit in the ${a.toUpperCase()}: no clubbing.`;
    }
    if (type === 'club' && lowTarget) return "A 'Mech can't club vehicles or infantry on the same level.";
    if (type === 'push' && tt && tt !== 'mech') return "Only 'Mechs can be pushed.";
  }
  if (type === 'charge' || type === 'dfa') {
    if (Object.keys(firedThisTurn(actor)).length) return `${actor.name} fired weapons this turn: no ${type === 'dfa' ? 'death from above' : 'charge'}.`;
    const mv = movedThisTurn(actor);
    if (type === 'charge' && mv.mode === 'jumped') return 'A unit that jumped this turn cannot charge.';
    if (type === 'dfa' && mv.mode !== 'jumped') return "Death from above needs a jump this turn (set the sheet's movement to Jumped).";
    if (type === 'charge' && tt === 'battle_armor') return 'Infantry cannot be charged.';
    if (type === 'charge' && isMech && tt === 'ground_vehicle') return "Vehicles may not be charged by 'Mechs.";
    if (type === 'charge' && tt === 'mech' && target.system?.conditions?.prone) return 'The target has fallen: the charge cannot be made.';
  }
  return null;
}

/** Actuator modifiers and damage halvings for a physical attack. */
export function actuatorEffects(actor, type, arm, weaponKey) {
  const mods = [];
  let halvings = 0;
  if (actor.type !== 'mech') return { mods, halvings };
  if (type === 'punchL' || type === 'punchR' || type === 'weapon') {
    const a = type === 'punchL' ? 'la' : type === 'punchR' ? 'ra' : arm;
    const act = destroyedActuators(actor, a);
    const n = act.upperArm + act.lowerArm;
    if (n) mods.push({ label: `Arm actuators ×${n}`, value: 2 * n });
    if (type !== 'weapon' && act.hand) mods.push({ label: 'Hand actuator', value: 1 });
    if (type !== 'weapon' || PHYSICAL_WEAPONS[weaponKey]?.halves) halvings = n;
  } else if (type === 'kick') {
    const l = destroyedActuators(actor, 'll'), r = destroyedActuators(actor, 'rl');
    const n = l.upperLeg + l.lowerLeg + r.upperLeg + r.lowerLeg;
    const f = l.foot + r.foot;
    if (n) mods.push({ label: `Leg actuators ×${n}`, value: 2 * n });
    if (f) mods.push({ label: `Foot actuator${f > 1 ? 's' : ''}`, value: f });
    halvings = n;
  } else if (type === 'club') {
    const n = ['la', 'ra'].reduce((t, a) => { const x = destroyedActuators(actor, a); return t + x.upperArm + x.lowerArm; }, 0);
    if (n) mods.push({ label: `Arm actuators ×${n}`, value: 2 * n });
  } else if (type === 'push') {
    const n = ['la', 'ra'].reduce((t, a) => t + destroyedActuators(actor, a).shoulder, 0);
    if (n) mods.push({ label: `Shoulder hit${n > 1 ? 's' : ''}`, value: 2 * n });
  }
  return { mods, halvings };
}

/** Damage to the target for a successful physical attack (before 5-point grouping). */
export function physicalDamage(actor, type, { weaponKey = null, hexes = 0, halvings = 0 } = {}) {
  const t = num(actor.system.tonnage);
  switch (type) {
    case 'punchL': case 'punchR': return halve(Math.ceil(t / 10), halvings);
    case 'kick': return halve(Math.ceil(t / 5), halvings);
    case 'club': return Math.ceil(t / 5);
    case 'weapon': return halve(PHYSICAL_WEAPONS[weaponKey]?.dmg(t) ?? 0, halvings);
    case 'charge': return Math.ceil((t / 10) * Math.max(0, num(hexes)));
    case 'dfa': return Math.ceil((t / 10) * 3);
    default: return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  The attack                                                          */
/* ------------------------------------------------------------------ */

/** Open the physical attack dialog for a unit, roll, and resolve both sides. */
export async function physicalAttack(actor) {
  if (!actor) return;
  const target = [...(game.user?.targets ?? [])][0] || null;
  const targetActor = target?.actor || null;
  const attackerToken = actor.getActiveTokens?.()[0] || null;
  const dist = attackerToken && target ? measureHexes(attackerToken, target) : null;
  const esc = (t) => foundry.utils.escapeHTML?.(String(t)) ?? String(t);

  const types = actor.type === 'mech' ? Object.entries(PHYSICAL_TYPES) : [['charge', PHYSICAL_TYPES.charge]];
  const typeOpts = types.map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  const wpnOpts = Object.entries(PHYSICAL_WEAPONS).map(([k, w]) => `<option value="${k}">${w.label} (${w.mod >= 0 ? '+' : ''}${w.mod})</option>`).join('');
  const auto = autoAttackMods(actor, null, targetActor).filter(m => ['attackerMove', 'attackerProne', 'attackerSkid', 'targetMove', 'immobile', 'battleArmor', 'targetSkid'].includes(m.key));
  const modRows = auto.map(x => `
      <div class="form-group"><label>${esc(x.label)}${x.hint ? ` <span class="tw-hint">${esc(x.hint)}</span>` : ''}</label><input type="number" name="auto_${x.key}" value="${x.value}" /></div>`).join('');
  const dirOpts = ATTACK_DIRECTIONS.map(d => `<option value="${d.key}">${d.label}</option>`).join('');

  const content = `
    <div class="tw-attack-dialog">
      <p class="tw-atk-target">${target ? `Target: <strong>${esc(target.name)}</strong>${dist != null ? ` · ${dist} hex${dist === 1 ? '' : 'es'}` : ''}` : 'No target selected.'}</p>
      <div class="form-group"><label>Attack</label><select name="type">${typeOpts}</select></div>
      ${actor.type === 'mech' ? `
      <div class="form-group"><label>Physical weapon <span class="tw-hint">if attacking with one</span></label><select name="weaponKey">${wpnOpts}</select></div>
      <div class="form-group"><label>Weapon arm</label><select name="arm"><option value="ra">Right arm</option><option value="la">Left arm</option></select></div>` : ''}
      <div class="form-group"><label>Piloting</label><input type="number" name="piloting" value="${pilotingFor(actor)}" /></div>
      ${modRows}
      <div class="form-group"><label>Charge: hexes moved <span class="tw-hint">not counting the target's hex</span></label><input type="number" name="hexes" value="${movedThisTurn(actor).hexes}" min="0" /></div>
      <fieldset class="tw-terrain"><legend>Terrain (not used for death from above)</legend>
        <div class="form-group"><label>Light woods hexes between</label><input type="number" name="lightWoods" value="0" min="0" /></div>
        <div class="form-group"><label>Heavy woods hexes between</label><input type="number" name="heavyWoods" value="0" min="0" /></div>
        <div class="form-group"><label>Target standing in</label><select name="targetWoods"><option value="none">Open</option><option value="light">Light woods (+1)</option><option value="heavy">Heavy woods (+2)</option></select></div>
        <div class="form-group"><label>Partial cover (+1)</label><input type="checkbox" name="partialCover" /></div>
      </fieldset>
      <div class="form-group"><label>Other Mod</label><input type="number" name="other" value="0" /></div>
      <div class="form-group"><label>Attack Direction</label><select name="direction">${dirOpts}</select></div>
    </div>`;

  const r = await DialogV2.wait({
    window: { title: `Physical Attack — ${actor.name}`, icon: "fa-solid fa-hand-fist" },
    content,
    buttons: [
      {
        action: "roll", label: "Roll Attack", icon: "fa-solid fa-dice", default: true,
        callback: (ev, button) => {
          const f = button.form.elements;
          return {
            type: f.type.value,
            weaponKey: f.weaponKey?.value ?? null,
            arm: f.arm?.value ?? null,
            piloting: num(f.piloting.value),
            auto: auto.map(x => ({ label: x.label, value: num(f[`auto_${x.key}`]?.value) })),
            hexes: Math.max(0, num(f.hexes.value)),
            terrain: {
              lightWoods: Math.max(0, num(f.lightWoods.value)),
              heavyWoods: Math.max(0, num(f.heavyWoods.value)),
              targetWoods: f.targetWoods.value,
              partialCover: !!f.partialCover.checked
            },
            other: num(f.other.value),
            direction: f.direction.value
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!r || r === "cancel") return;
  return resolvePhysicalAttack(actor, target, r);
}

/**
 * Roll and resolve a physical attack from dialog values. Exposed for tests.
 * @param {Actor} actor
 * @param {Token|null} target
 * @param {object} r  dialog result
 */
export async function resolvePhysicalAttack(actor, target, r) {
  const targetActor = target?.actor || null;
  const { type, weaponKey, arm } = r;
  const block = physicalBlock(actor, type, { arm, weaponKey, target: targetActor });
  if (block) { ui.notifications.warn(block); return null; }

  const spec = PHYSICAL_TYPES[type];
  const pw = type === 'weapon' ? PHYSICAL_WEAPONS[weaponKey] : null;
  const act = actuatorEffects(actor, type, arm, weaponKey);
  const mods = [
    { label: 'Piloting', value: r.piloting },
    { label: pw ? pw.label : spec.label, value: pw ? pw.mod : spec.mod },
    ...r.auto,
    ...act.mods
  ];
  if (targetActor?.type === 'mech' && targetActor.system?.conditions?.prone) mods.push({ label: 'Target prone (adjacent)', value: -2 });
  if ((type === 'charge' || type === 'dfa') && targetActor && targetActor.type !== 'battle_armor') {
    const diff = r.piloting - pilotingFor(targetActor);
    if (diff) mods.push({ label: 'Relative Piloting', value: diff });
  }
  if ((type === 'kick' || type === 'dfa') && targetActor?.type === 'battle_armor') mods.push({ label: 'Infantry target', value: 3 });
  if (type !== 'dfa') mods.push(...terrainMods(r.terrain));
  if (r.other) mods.push({ label: 'Other', value: r.other });
  const shown = mods.filter(m => m.value !== 0 || m.label === 'Piloting');
  const tn = sum(mods);

  beginRecording();
  const roll = await new Roll("2d6").evaluate();
  const rolls = [roll];
  const hit = roll.total >= tn;
  const dice = roll.dice[0]?.results?.map(x => x.result) ?? [];

  // Record the attack (one per turn; two punches may combine).
  const key = currentTurnKey();
  if (key && (actor.isOwner || game.user.isGM)) {
    await writeDoc(actor, { 'flags.mech-foundry.physical': { key, list: [...physicalThisTurn(actor), type] } });
  }

  const notes = [];
  let hitResult = null, selfResult = null, fall = null;
  const tType = targetActor?.type;
  const tStanding = tType === 'mech' && !targetActor.system?.conditions?.prone;

  if (hit) {
    const damage = physicalDamage(actor, type, { weaponKey, hexes: r.hexes, halvings: act.halvings });
    let opts = {};
    let groups = [damage];
    let direction = r.direction;
    if (type === 'punchL' || type === 'punchR' || pw?.table === 'punch') opts.locationRoller = rollPunchLocation;
    else if (type === 'kick' && tType === 'mech') opts.locationRoller = rollKickLocation;
    if (type === 'charge') {
      groups = fiveGroups(damage);
      if (actor.type === 'ground_vehicle' && tStanding) opts.locationRoller = rollKickLocation;
      if (tType === 'mech') opts.extraPSR = [{ key: 'charged', label: 'Successfully charged', mod: 2 }];
      if (tType === 'ground_vehicle') opts.forceMotive = true;
    }
    if (type === 'dfa') {
      groups = fiveGroups(damage);
      if (tType === 'ground_vehicle') direction = 'front';
      else if (tType === 'mech' && !tStanding) direction = 'rear';
      else opts.locationRoller = rollPunchLocation;
      if (tType === 'mech') opts.extraPSR = [{ key: 'dfa', label: 'Hit by death from above', mod: 2 }];
    }
    if (type === 'kick' && tType === 'mech') opts.extraPSR = [{ key: 'kicked', label: 'Was kicked', mod: 0 }];

    if (type === 'push') {
      if (targetActor && !targetActor.system?.conditions?.prone) {
        await writeDoc(targetActor, { 'flags.mech-foundry.psr': queuePSR(targetActor, [{ key: 'pushed', label: 'Was pushed', mod: 0 }]) });
      }
      notes.push(`${target?.name || 'Target'} is pushed one hex directly away — move the token; it must make a Piloting Skill Roll`);
    } else if (damage > 0) {
      const frag = await resolveDamageAgainst(targetActor, direction, groups, rolls, target?.name || '', opts);
      hitResult = { total: damage, ...frag };
    }

    // The attacker's side of charges and death from above.
    if (type === 'charge') {
      const back = Math.ceil(num(targetActor?.system?.tonnage) / 10);
      if (back > 0) selfResult = await resolveDamageAgainst(actor, 'front', fiveGroups(back), rolls, actor.name, {
        noIntercept: true,
        extraPSR: actor.type === 'mech' ? [{ key: 'charging', label: 'Made a successful charge', mod: 2 }] : [],
        forceMotive: actor.type === 'ground_vehicle'
      });
      notes.push(`${actor.name} advances into the target's hex; ${target?.name || 'the target'} is pushed one hex away — move both tokens`);
    }
    if (type === 'dfa') {
      selfResult = await resolveDamageAgainst(actor, 'front', fiveGroups(Math.ceil(num(actor.system.tonnage) / 5)), rolls, actor.name, {
        noIntercept: true,
        locationRoller: rollKickLocation,
        extraPSR: [{ key: 'dfaMade', label: 'Made death from above', mod: 4 }]
      });
      notes.push(`${actor.name} lands in the target's hex; ${target?.name || 'the target'} is pushed one hex away from the attack — move both tokens`);
    }
  } else {
    if (type === 'kick') {
      await writeDoc(actor, { 'flags.mech-foundry.psr': queuePSR(actor, [{ key: 'missedKick', label: 'Missed a kick', mod: 0 }]) });
      notes.push(`${actor.name} missed a kick: Piloting Skill Roll required`);
    }
    if (type === 'charge') notes.push(`${actor.name} misses: place it in the hex to the right or left of its forward arc`);
    if (type === 'dfa') {
      notes.push(`${actor.name} misses and crashes down (falls 2 levels, rear hit locations); ${target?.name || 'the target'} moves to an adjacent hex of its choice`);
      fall = await resolveFall(actor, { levels: 2, rearOnly: true, rolls });
    }
  }
  if (hit && (type === 'kick' || type === 'charge' || type === 'dfa') && tType === 'mech' && tStanding) {
    notes.push(`${target?.name || 'Target'} must make a Piloting Skill Roll`);
  }
  if (hit && (type === 'charge' || type === 'dfa') && actor.type === 'mech') notes.push(`${actor.name} must make a Piloting Skill Roll`);

  const cardContent = await foundry.applications.handlebars.renderTemplate(
    "systems/mech-foundry/templates/chat/tw-attack.hbs",
    {
      weaponName: pw ? pw.label : spec.label,
      location: pw ? (arm || '').toUpperCase() : '',
      targetName: target?.name || '',
      attackerName: actor.name,
      mods: shown, tn, dice, rollTotal: roll.total, hit, margin: Math.abs(roll.total - tn),
      outOfRange: false, damage: hit ? physicalDamage(actor, type, { weaponKey, hexes: r.hexes, halvings: act.halvings }) : 0,
      hitResult, selfResult, notes
    }
  );
  await ChatMessage.create({ flags: { 'mech-foundry': endRecording() }, speaker: ChatMessage.getSpeaker({ actor }), flavor: `${spec.label}`, content: cardContent, rolls });
  if (fall) await postCard(actor, 'Death From Above — Missed', { results: [], fall }, []);
  return { hit, tn, mods: shown, hitResult, selfResult, notes, fall };
}
