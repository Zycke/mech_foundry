/**
 * Anti-'Mech attacks (Total Warfare pp. 220–223): leg attacks and swarm attacks
 * by infantry, swarm damage in later turns, and the ways a swarmed unit fights
 * the infantry off (arms, jumping, dropping prone, erratic maneuvers, take-off).
 *
 * Anti-'Mech attacks replace the unit's weapon attack in the Weapon Attack
 * Phase. Base to-hit is the unit's Anti-'Mech Skill + the Leg / Swarm Attacks
 * Table modifier for its active troopers, plus target movement, terrain, a
 * prone (−2) or immobile (−4) target, −2 for vehicles and −1 for magnetic
 * claws (swarm), and the Swarm Attack Modifiers Table when the target carries
 * friendly mechanized battle armor. A swarming unit sets `system.attached`
 * (mode 'swarm') and damages the unit from the next turn on.
 */
import { beginRecording, endRecording, writeDoc } from "./gm-relay.mjs";
import { currentTurnKey } from "./tw-turn.mjs";
import {
  autoAttackMods, destroyedActuators, movedThisTurn, pilotUnconscious, vehicleDrivingMods, weaponArm
} from "./tw-movement.mjs";
import { phaseDamageSoFar, psrDamageMods } from "./tw-psr.mjs";
import { postCard, resolveFall } from "./tw-falls.mjs";
import { roundLabel, summaryContext, volleyCard, volleySummary, withSummary } from "./tw-cards.mjs";
import { MECH_LOC_LABEL, clusterHits, firedThisTurn, locationGone, measureHexes, resolveDamageAgainst } from "./tw-combat.mjs";
import { actuatorEffects, physicalDamage, physicalThisTurn, rollKickLocation, rollPunchLocation } from "./tw-physical.mjs";
import { isAero } from "./tw-aero.mjs";
import {
  BA_WEIGHTS, TRANSPORT_POSITIONS, attachedCarrier, attachment, baTroopers, baWeaponKind, infantryAttackDamage, isInfantry, knockOff, liveTroopers, manipulatorCount, platoonAttackDamage, ridersOf, swarmersOf, vibroBonus
} from "./tw-infantry.mjs";
import { crewConditionMods, pilotingMods, skillMod } from "./tw-skills.mjs";
import { hexAt, terrainRegions } from "./tw-terrain.mjs";

const { DialogV2 } = foundry.applications.api;
const num = (v) => Number(v) || 0;
const sum = (mods) => mods.reduce((t, m) => t + num(m.value), 0);
const diceOf = (roll) => roll?.dice?.[0]?.results?.map(r => r.result) ?? [];
const esc = (t) => foundry.utils.escapeHTML?.(String(t)) ?? String(t);

/* ------------------------------------------------------------------ */
/*  Tables                                                              */
/* ------------------------------------------------------------------ */

/** Leg Attacks Table modifier for the unit's active troopers (null = no attack possible). */
export function legAttackMod(actor) {
  const n = liveTroopers(actor);
  if (actor?.type === 'battle_armor') return n >= 4 ? 0 : n === 3 ? 2 : n === 2 ? 5 : n === 1 ? 7 : null;
  return n >= 22 ? 0 : n >= 16 ? 2 : n >= 10 ? 5 : n >= 5 ? 7 : null;
}

/** Swarm Attacks Table modifier (null = no attack possible). */
export function swarmAttackMod(actor) {
  const n = liveTroopers(actor);
  if (actor?.type === 'battle_armor') return n >= 4 ? 2 : n >= 1 ? 5 : null;
  return n >= 22 ? 2 : n >= 16 ? 5 : null;
}

// Swarm Attack Modifiers Table: rows by attacking troopers (battle armor 6..1 /
// platoon 28–30, 24–27, 21–23, 18–20, 16–17), columns by friendly mechanized
// battle armor troopers active (1–6).
const SWARM_RIDER_ROWS = [
  [0, 0, 0, 0, 1, 2], [0, 0, 0, 1, 2, 3], [0, 0, 1, 2, 3, 4],
  [0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 7]
];

/** Swarm Attack Modifiers Table value: attackers vs defending mechanized troopers. */
export function swarmRiderMod(attacker, defenders) {
  const d = Math.min(6, Math.max(0, num(defenders)));
  if (!d) return 0;
  const n = liveTroopers(attacker);
  const row = attacker?.type === 'battle_armor'
    ? 6 - Math.max(1, Math.min(6, n))
    : n >= 28 ? 1 : n >= 24 ? 2 : n >= 21 ? 3 : n >= 18 ? 4 : 5;
  return SWARM_RIDER_ROWS[row][d - 1];
}

/** Swarm Attacks Hit Location Table (biped), 2D6 → [location, rear]. */
const SWARM_LOCATION = {
  2: ['head', false], 3: ['ct', true], 4: ['rt', true], 5: ['rt', false], 6: ['ra', false], 7: ['ct', false],
  8: ['la', false], 9: ['lt', false], 10: ['lt', true], 11: ['ct', true], 12: ['head', false]
};

/** 2D6 on the Swarm Attacks Hit Location Table (a locationRoller for resolveDamageAgainst). */
export async function rollSwarmLocation() {
  const r = await new Roll("2d6").evaluate();
  const [loc, rear] = SWARM_LOCATION[r.total] || SWARM_LOCATION[7];
  return { roll: r, total: r.total, dice: diceOf(r), loc, label: MECH_LOC_LABEL[loc] || loc, crit: false, rear };
}

/* ------------------------------------------------------------------ */
/*  Legality                                                            */
/* ------------------------------------------------------------------ */

const turnFlag = (actor, name) => !!currentTurnKey() && actor?.flags?.['mech-foundry']?.[name]?.key === currentTurnKey();

/** Did the unit make an anti-'Mech attack (or swarm damage) this turn? */
export const antiMechThisTurn = (actor) => turnFlag(actor, 'antiMech');

/**
 * Can this unit make anti-'Mech attacks at all? Battle armor: humanoid PA(L) /
 * light / medium suits with two basic manipulators, at least one battle claw
 * (vibro- and magnetic claws count), or — light / PA(L) — two armored gloves;
 * Inner Sphere body-mounted launchers must be jettisoned first. Mechanized
 * conventional infantry can't.
 */
export function antiMechCapability(actor) {
  if (actor?.type === 'infantry') return actor.system?.platoonType === 'mechanized' ? "Mechanized infantry cannot make anti-'Mech attacks." : null;
  const sys = actor?.system || {};
  if (sys.chassis === 'quad') return "Quad battle armor cannot make anti-'Mech attacks.";
  if (['heavy', 'assault'].includes(sys.weightClass)) return `${BA_WEIGHTS[sys.weightClass]} battle armor cannot make anti-'Mech attacks.`;
  const light = ['pal', 'light'].includes(sys.weightClass);
  const claws = manipulatorCount(actor, 'battleClaw', 'heavyClaw', 'vibroClaw', 'magneticClaw');
  const ok = claws >= 1 || manipulatorCount(actor, 'basic') === 2 || (light && manipulatorCount(actor, 'armoredGlove') === 2);
  if (!ok) return `Anti-'Mech attacks need two basic manipulators or a battle claw${light ? ' (or two armored gloves)' : ''} — set them on the Details tab.`;
  if (sys.equipment?.bodyMissiles && !sys.equipment?.missilesJettisoned) return "Body-mounted missile launchers must be jettisoned before anti-'Mech attacks.";
  return null;
}

/** Why this leg / swarm attack can't be made, or null. */
export function antiMechBlock(actor, type, targetActor, distance = null) {
  if (!isInfantry(actor)) return "Only infantry make anti-'Mech attacks.";
  if (liveTroopers(actor) <= 0) return `${actor.name} has no troopers left.`;
  const cap = antiMechCapability(actor);
  if (cap) return cap;
  if (attachment(actor)) return `${actor.name} is ${attachment(actor).mode === 'swarm' ? 'already swarming a unit' : 'riding a unit'}.`;
  if (currentTurnKey() && Object.keys(firedThisTurn(actor)).length) return `${actor.name} fired weapons this turn — an anti-'Mech attack replaces its weapon attack.`;
  if (antiMechThisTurn(actor)) return `${actor.name} has already made an anti-'Mech attack this turn.`;
  if ((type === 'leg' ? legAttackMod(actor) : swarmAttackMod(actor)) === null) return `Too few troopers for a ${type} attack.`;
  if (!targetActor) return 'Target the unit to attack (same hex).';
  if (distance != null && distance > 0) return 'Anti-\'Mech attacks need the target in the same hex.';
  const tt = targetActor.type, tsys = targetActor.system || {};
  if (type === 'leg') {
    if (tt !== 'mech') return "Leg attacks can only target 'Mechs.";
    if (turnFlag(targetActor, 'legAttacked')) return `${targetActor.name} has already been the target of a leg attack this turn.`;
  } else {
    if (!['mech', 'ground_vehicle', 'aerospace_fighter', 'small_craft'].includes(tt)) return "Only 'Mechs, vehicles and landed aerospace units can be swarmed.";
    if (tt === 'ground_vehicle' && ['vtol', 'wige'].includes(tsys.movementType) && num(tsys.elevation) > 0) return 'VTOLs and WiGEs can only be swarmed when landed.';
    if (isAero(targetActor) && num(tsys.flight?.altitude) > 0) return 'Aerospace units can only be swarmed when landed.';
    if (swarmersOf(targetActor).length) return `${targetActor.name} is already swarmed.`;
    if (turnFlag(targetActor, 'swarmAttacked')) return `${targetActor.name} has already been the target of a swarm attack this turn.`;
  }
  return null;
}

/** Live troopers of the friendly mechanized battle armor riding a unit. */
const riderTroopers = (carrier) => ridersOf(carrier).reduce((t, u) => t + liveTroopers(u), 0);

/** The attack's modifiers (everything but terrain and "other"). */
export function antiMechMods(actor, type, targetActor) {
  const table = type === 'leg' ? legAttackMod(actor) : swarmAttackMod(actor);
  const n = liveTroopers(actor);
  const mods = [
    skillMod(actor, 'antiMech'),
    ...crewConditionMods(actor),
    { label: `${type === 'leg' ? 'Leg' : 'Swarm'} Attacks Table (${n} trooper${n === 1 ? '' : 's'})`, value: table ?? 0 }
  ];
  if (!targetActor) return mods;
  for (const m of autoAttackMods(actor, null, targetActor)) {
    if (['targetMove', 'immobile', 'targetSkid'].includes(m.key)) mods.push({ label: m.label, value: m.value, key: m.key });
  }
  if (targetActor.type === 'mech' && targetActor.system?.conditions?.prone) mods.push({ label: "'Mech prone", value: -2 });
  if (type === 'swarm') {
    if (targetActor.type === 'ground_vehicle') mods.push({ label: 'Vehicle', value: -2 });
    if (actor.type === 'battle_armor' && manipulatorCount(actor, 'magneticClaw')) mods.push({ label: 'Magnetic claws', value: -1 });
    const riders = riderTroopers(targetActor);
    if (riders) mods.push({ label: `Mechanized battle armor on the target (${riders})`, value: swarmRiderMod(actor, riders) });
  }
  return mods;
}

/* ------------------------------------------------------------------ */
/*  The attack                                                          */
/* ------------------------------------------------------------------ */

/** Anti-'Mech attack dialog: leg or swarm against the targeted unit. */
export async function antiMechAttack(actor) {
  if (!actor) return;
  const target = [...(game.user?.targets ?? [])][0] || null;
  const targetActor = target?.actor || null;
  const token = actor.getActiveTokens?.()[0] || null;
  const dist = token && target ? measureHexes(token, target) : null;
  const legOk = !antiMechBlock(actor, 'leg', targetActor, dist);
  const swarmOk = !antiMechBlock(actor, 'swarm', targetActor, dist);
  if (!legOk && !swarmOk) {
    ui.notifications.warn(antiMechBlock(actor, targetActor?.type === 'mech' ? 'leg' : 'swarm', targetActor, dist));
    return;
  }
  const row = (type) => {
    const mods = antiMechMods(actor, type, targetActor);
    return `${mods.map(m => `${esc(m.label)} ${m.value >= 0 ? '+' : ''}${m.value}`).join(' · ')} = ${sum(mods)}`;
  };
  // Woods under the target, from the map's terrain regions ('' without any).
  const regions = target?.center ? terrainRegions() : [];
  const mapWoods = regions.length ? (hexAt(target.center, regions).woods || 'none') : '';
  const opts = [legOk ? `<option value="leg">Leg attack (${row('leg')})</option>` : '', swarmOk ? `<option value="swarm">Swarm attack (${row('swarm')})</option>` : ''].join('');
  const r = await DialogV2.wait({
    window: { title: `Anti-'Mech Attack — ${actor.name}`, icon: "fa-solid fa-person-rifle" },
    content: `
      <div class="tw-attack-dialog">
        <p class="tw-atk-target">Target: <strong>${esc(target?.name || '')}</strong> (same hex)</p>
        <div class="form-group"><label>Attack</label><select name="type">${opts}</select></div>
        <div class="form-group"><label>Target standing in${mapWoods ? ' <span class="tw-hint">(from map)</span>' : ''}</label><select name="targetWoods">${[['none', 'Open'], ['light', 'Light woods (+1)'], ['heavy', 'Heavy woods (+2)']].map(([k, l]) => `<option value="${k}"${k === (mapWoods || 'none') ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="form-group"><label>Other modifier <span class="tw-hint">+ harder, − easier (e.g. −1 vs an IndustrialMech)</span></label><input type="number" name="other" value="0" /></div>
      </div>`,
    buttons: [
      { action: "roll", label: "Roll", icon: "fa-solid fa-dice", default: true, callback: (e, b) => ({ type: b.form.elements.type.value, targetWoods: b.form.elements.targetWoods.value, other: num(b.form.elements.other.value) }) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!r || r === "cancel") return;
  return resolveAntiMech(actor, target, r);
}

/**
 * Roll and resolve a leg or swarm attack. A leg attack does 4 damage (+1 / +2
 * with one / two vibro-claws) on the front column of the Kick Location Table
 * plus an automatic Determining Critical Hits roll; a successful swarm attaches
 * the unit (no damage this turn). A 'Mech takes one leg attack and one swarm
 * attack per turn.
 */
export async function resolveAntiMech(actor, target, { type = 'leg', targetWoods = 'none', other = 0 } = {}) {
  const targetActor = target?.actor || null;
  const why = antiMechBlock(actor, type, targetActor);
  if (why) { ui.notifications.warn(why); return null; }
  const mods = antiMechMods(actor, type, targetActor);
  if (targetWoods === 'light') mods.push({ label: 'Target in light woods', value: 1 });
  if (targetWoods === 'heavy') mods.push({ label: 'Target in heavy woods', value: 2 });
  if (other) mods.push({ label: 'Other', value: other });
  const tn = sum(mods);

  beginRecording();
  const rolls = [];
  const roll = await new Roll("2d6").evaluate();
  rolls.push(roll);
  const hit = roll.total >= tn;
  const key = currentTurnKey();
  if (key) {
    await writeDoc(actor, { 'flags.mech-foundry.antiMech': { key, type } });
    await writeDoc(targetActor, { [`flags.mech-foundry.${type === 'leg' ? 'legAttacked' : 'swarmAttacked'}`]: { key } });
  }

  const notes = [];
  let hitResult = null, damage = 0;
  if (hit && type === 'leg') {
    damage = 4 + (actor.type === 'battle_armor' ? vibroBonus(actor) : 0);
    const frag = await resolveDamageAgainst(targetActor, 'front', [damage], rolls, target?.name || '', { locationRoller: rollKickLocation, autoCrit: true });
    hitResult = { total: damage, ...frag };
    notes.push('Plus one automatic roll on the Determining Critical Hits Table for the struck leg.');
  }
  if (hit && type === 'swarm') {
    await writeDoc(actor, { 'system.attached': { uuid: targetActor.uuid, mode: 'swarm', key: key || '' } });
    notes.push(`${actor.name} swarms ${targetActor.name}: no damage this turn. From the next Weapon Attack Phase it attacks with Swarm Attack on its sheet; it can't be targeted, and moves with the unit.`);
  }
  const title = type === 'leg' ? 'Leg Attack' : 'Swarm Attack';
  const card = volleyCard({
    title, icon: 'fa-person-rifle', attackerName: actor.name, targetName: target?.name || '',
    round: roundLabel(), baseMods: mods,
    shots: [{
      weaponName: title, location: '', targetName: target?.name || '', attackerName: actor.name,
      mods, weaponMods: [], tn, dice: diceOf(roll), rollTotal: roll.total, hit, margin: Math.abs(roll.total - tn), outOfRange: false,
      damage, hitResult, notes: type === 'leg' ? notes : []
    }],
    notes: type === 'swarm' ? notes : []
  });
  const content = await foundry.applications.handlebars.renderTemplate("systems/mech-foundry/templates/chat/tw-volley.hbs", card);
  await ChatMessage.create({ flags: { 'mech-foundry': withSummary(endRecording(), volleySummary(card, { ...summaryContext(), kind: 'antimech', attacker: actor, target: targetActor })) }, speaker: ChatMessage.getSpeaker({ actor }), flavor: title, content, rolls });
  return { hit, tn, mods, hitResult, notes };
}

/* ------------------------------------------------------------------ */
/*  Swarm damage                                                        */
/* ------------------------------------------------------------------ */

/**
 * Swarm damage for battle armor: the unit's arm-mounted, non-missile weapons
 * (not anti-personnel) × active troopers, plus 1 / 2 for one / two vibro-claws.
 */
export function baSwarmDamage(actor) {
  const n = liveTroopers(actor);
  const arm = (actor.system?.weapons || []).filter(w => !w.destroyed && (w.location || 'arm') === 'arm' && baWeaponKind(w) === 'direct');
  const base = arm.reduce((t, w) => t + num(w.damage), 0) * n;
  return { damage: base > 0 ? base + vibroBonus(actor) : 0, weapons: arm.map(w => w.name || 'Weapon'), troopers: n };
}

/** Why a swarming unit can't do swarm damage now, or null. */
export function swarmDamageBlock(actor) {
  const a = attachment(actor);
  if (a?.mode !== 'swarm') return `${actor.name} isn't swarming a unit.`;
  if (!attachedCarrier(actor)) return `${actor.name}'s swarmed unit wasn't found — release the swarm.`;
  if (currentTurnKey() && a.key === currentTurnKey()) return 'Swarm damage starts the turn after a successful swarm attack.';
  if (antiMechThisTurn(actor)) return `${actor.name} has already attacked this turn.`;
  if (currentTurnKey() && Object.keys(firedThisTurn(actor)).length) return `${actor.name} fired weapons this turn.`;
  if (liveTroopers(actor) <= 0) return `${actor.name} has no troopers left.`;
  return null;
}

/**
 * Swarm damage (Weapon Attack Phase, turns after the swarm): an automatic hit.
 * Battle armor put everything in one group; a 'Mech rolls the Swarm Attacks Hit
 * Location Table plus one automatic Determining Critical Hits roll; a vehicle
 * or grounded aerospace unit uses a random side column (1D6: 1–2 front, 3 left,
 * 4 right, 5–6 rear). Conventional platoons deal their standard damage
 * (Cluster Hits roll → damage table) in 2-point groups, with no automatic crit.
 */
export async function swarmAttack(actor) {
  const why = swarmDamageBlock(actor);
  if (why) { ui.notifications.warn(why); return null; }
  const carrier = attachedCarrier(actor);
  beginRecording();
  const rolls = [];
  const notes = [];
  let groups;
  if (actor.type === 'battle_armor') {
    const sd = baSwarmDamage(actor);
    if (!sd.damage) { ui.notifications.warn(`${actor.name} has no working arm-mounted non-missile weapons for swarm damage.`); return null; }
    groups = [sd.damage];
    notes.push(`${sd.weapons.join(' + ')} × ${sd.troopers} trooper${sd.troopers === 1 ? '' : 's'}${vibroBonus(actor) ? ` + ${vibroBonus(actor)} vibro-claw` : ''} = ${sd.damage}, one group`);
  } else {
    const pd = await platoonAttackDamage(actor, rolls, clusterHits);
    groups = pd.groups;
    notes.push(`${pd.note}, in 2-point groups`);
  }
  let direction = 'front';
  const opts = { noIntercept: true };
  if (carrier.type === 'mech') {
    opts.locationRoller = rollSwarmLocation;
    if (actor.type === 'battle_armor') { opts.autoCrit = true; notes.push('Plus one automatic Determining Critical Hits roll.'); }
  } else {
    const side = await new Roll("1d6").evaluate();
    rolls.push(side);
    direction = side.total <= 2 ? 'front' : side.total === 3 ? 'left' : side.total === 4 ? 'right' : 'rear';
    notes.push(`Random side column (1D6 ${side.total}): ${direction}`);
  }
  const frag = groups.length ? await resolveDamageAgainst(carrier, direction, groups, rolls, carrier.name, opts) : null;
  if (currentTurnKey()) await writeDoc(actor, { 'flags.mech-foundry.antiMech': { key: currentTurnKey(), type: 'swarmDamage' } });
  const total = groups.reduce((a, b) => a + b, 0);
  const card = volleyCard({
    title: 'Swarm Damage', icon: 'fa-person-rifle', attackerName: actor.name, targetName: carrier.name,
    ctxLine: 'Automatic hit', round: roundLabel(),
    shots: [{
      weaponName: 'Swarm Damage', location: '', targetName: carrier.name, attackerName: actor.name,
      mods: [], weaponMods: [], tn: 0, dice: [], rollTotal: 0, hit: true, margin: 0, outOfRange: false, damage: total,
      hitResult: frag ? { total, ...frag } : null, notes, automatic: true
    }]
  });
  const content = await foundry.applications.handlebars.renderTemplate("systems/mech-foundry/templates/chat/tw-volley.hbs", card);
  await ChatMessage.create({ flags: { 'mech-foundry': withSummary(endRecording(), volleySummary(card, { ...summaryContext(), kind: 'swarm', attacker: actor, target: carrier })) }, speaker: ChatMessage.getSpeaker({ actor }), flavor: 'Swarm Damage', content, rolls });
  return { frag, groups, notes };
}

/** The swarming unit lets go (any later Weapon Attack Phase): it drops into the hex. */
export async function releaseSwarm(actor) {
  const carrier = attachedCarrier(actor);
  beginRecording();
  await writeDoc(actor, { 'system.attached': { uuid: '', mode: '', key: '' } });
  await postCard(actor, 'Swarm Ended', { results: [], notes: [`${actor.name} ends its swarm${carrier ? ` of ${carrier.name}` : ''} and is placed in its hex.`] }, []);
}

/* ------------------------------------------------------------------ */
/*  Fighting off swarms                                                 */
/* ------------------------------------------------------------------ */

const magneticSwarmers = (units) => units.some(u => u.type === 'battle_armor' && manipulatorCount(u, 'magneticClaw'));

/** Why an arm can't be used to pull off swarmers (punch restrictions), or null. */
export function armRemovalBlock(mech, arm) {
  if (locationGone(mech, arm)) return `the ${arm.toUpperCase()} is destroyed`;
  if (destroyedActuators(mech, arm).shoulder) return `shoulder hit in the ${arm.toUpperCase()}`;
  const fired = firedThisTurn(mech);
  if ((mech.system.weapons || []).some(w => fired[w.id] !== undefined && weaponArm(w) === arm)) return `a weapon in the ${arm.toUpperCase()} fired this turn`;
  return null;
}

/** A PSR result row: Piloting + standing damage mods + extras (20+ damage this phase adds +1). */
async function psrRow(actor, label, extra, rolls) {
  const mods = [...pilotingMods(actor), ...psrDamageMods(actor.system).filter(m => !m.gyroDestroyed), ...extra];
  if (phaseDamageSoFar(actor) >= 20) mods.push({ label: '20+ damage this phase', value: 1 });
  const res = { label, mods, tn: sum(mods) };
  if (pilotUnconscious(actor)) { res.auto = 'warrior unconscious — automatic failure'; res.success = false; return res; }
  const r = await new Roll("2d6").evaluate();
  rolls.push(r);
  return Object.assign(res, { total: r.total, dice: diceOf(r), success: r.total >= res.tn });
}

/**
 * Physical Attack Phase: a swarmed 'Mech tries to pull the infantry off with
 * one or both arms instead of a physical attack — a Piloting roll per arm at
 * +4 plus punch modifiers (+1 against magnetic claws). A success knocks them
 * off with punch damage (full, as from an infantry attack); a failure hits the
 * 'Mech with that punch on the Front column of the Punch Location Table. Both
 * declared attempts are resolved.
 */
export async function removeSwarmers(mech, { arms = null } = {}) {
  const swarmers = swarmersOf(mech);
  if (!swarmers.length) { ui.notifications.info(`${mech.name} isn't swarmed.`); return null; }
  if (physicalThisTurn(mech).length) { ui.notifications.warn(`${mech.name} has already made a physical attack this turn.`); return null; }
  if (mech.system.conditions?.shutdown) { ui.notifications.warn(`${mech.name} is shut down.`); return null; }
  const usable = ['la', 'ra'].filter(a => !armRemovalBlock(mech, a));
  if (!usable.length) { ui.notifications.warn(`Neither arm can be used: ${['la', 'ra'].map(a => armRemovalBlock(mech, a)).join('; ')}.`); return null; }
  if (arms === null) {
    const r = await DialogV2.wait({
      window: { title: `Remove Swarming Infantry — ${mech.name}`, icon: "fa-solid fa-hand" },
      content: `<div class="tw-attack-dialog">
        <p>Piloting Skill Roll per arm (+4, plus punch modifiers). Replaces this turn's physical attack; both declared attempts are rolled.</p>
        ${['la', 'ra'].map(a => {
          const why = armRemovalBlock(mech, a);
          return `<div class="form-group"><label>${a === 'la' ? 'Left arm' : 'Right arm'}${why ? ` <span class="tw-hint">${esc(why)}</span>` : ''}</label><input type="checkbox" name="${a}" ${why ? 'disabled' : 'checked'} /></div>`;
        }).join('')}
        <p class="tw-hint">An arm mounting a physical attack weapon can't be used — leave it unchecked.</p>
      </div>`,
      buttons: [
        { action: "roll", label: "Roll", icon: "fa-solid fa-dice", default: true, callback: (e, b) => ['la', 'ra'].filter(a => b.form.elements[a]?.checked && !b.form.elements[a]?.disabled) },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!r || r === "cancel") return null;
    arms = r;
  }
  arms = arms.filter(a => usable.includes(a));
  if (!arms.length) return null;

  beginRecording();
  const rolls = [], results = [], notes = [], frags = [];
  const magnetic = magneticSwarmers(swarmers);
  let off = false;
  for (const arm of arms) {
    const type = arm === 'la' ? 'punchL' : 'punchR';
    const act = actuatorEffects(mech, type, arm);
    const extra = [{ label: 'Removing swarming infantry', value: 4 }, ...act.mods];
    if (magnetic) extra.push({ label: 'Magnetic claws', value: 1 });
    const res = await psrRow(mech, `${arm === 'la' ? 'Left' : 'Right'} arm`, extra, rolls);
    results.push(res);
    const punch = physicalDamage(mech, type, { halvings: act.halvings });
    if (res.success) {
      if (!off) {
        notes.push(...await knockOff(swarmers, { damage: punch, why: `is pulled off (${punch} punch damage)` }, rolls));
        off = true;
      } else notes.push(`${arm === 'la' ? 'Left' : 'Right'} arm succeeds — the infantry is already off.`);
    } else if (punch > 0) {
      const frag = await resolveDamageAgainst(mech, 'front', [punch], rolls, mech.name, { locationRoller: rollPunchLocation, noIntercept: true });
      frags.push({ title: `${mech.name} punches itself (${arm === 'la' ? 'left' : 'right'} arm, ${punch})`, total: punch, ...frag });
    }
  }
  if (currentTurnKey()) await writeDoc(mech, { 'flags.mech-foundry.physical': { key: currentTurnKey(), list: [...physicalThisTurn(mech), 'removeSwarm'] } });
  if (!off) notes.push('The infantry stays attached.');
  await postCard(mech, 'Remove Swarming Infantry', { results, notes, frags }, rolls);
  return { results, notes, frags, off };
}

/**
 * A jump-capable 'Mech that jumped tries to shake off swarmers on landing:
 * Piloting +4 (+1 against magnetic claws). Success: they fall off and each
 * trooper takes 1 damage per Jump MP used. Failure: they stay; no fall.
 */
export async function jumpShakeOff(mech, { jumpMP = null } = {}) {
  const swarmers = swarmersOf(mech);
  if (!swarmers.length) { ui.notifications.info(`${mech.name} isn't swarmed.`); return null; }
  if (jumpMP === null) {
    const r = await DialogV2.wait({
      window: { title: `Shake Off Swarmers (jump) — ${mech.name}`, icon: "fa-solid fa-person-falling" },
      content: `<div class="tw-attack-dialog"><div class="form-group"><label>Jump MP used this phase</label><input type="number" name="mp" value="${movedThisTurn(mech).hexes}" min="1" /></div></div>`,
      buttons: [
        { action: "roll", label: "Roll", icon: "fa-solid fa-dice", default: true, callback: (e, b) => Math.max(1, num(b.form.elements.mp.value)) },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!r || r === "cancel") return null;
    jumpMP = r;
  }
  beginRecording();
  const rolls = [];
  const extra = [{ label: 'Shaking off swarmers', value: 4 }];
  if (magneticSwarmers(swarmers)) extra.push({ label: 'Magnetic claws', value: 1 });
  const res = await psrRow(mech, 'Shake off swarming infantry after the jump', extra, rolls);
  const notes = res.success
    ? await knockOff(swarmers, { perTrooper: jumpMP, why: `falls off (jumped ${jumpMP} MP)` }, rolls)
    : ['The infantry stays attached; the \'Mech does not fall.'];
  await postCard(mech, 'Shake Off Swarmers', { results: [res], notes }, rolls);
  return { res, notes };
}

/**
 * Drop prone to shake off swarmers: a Piloting roll. Failure: the 'Mech goes
 * prone but keeps the infantry. Success: they fall off (2D6 each, as for a
 * fall) and the 'Mech takes an accidental fall, with its pilot damage roll.
 */
export async function dropProneShakeOff(mech) {
  const swarmers = swarmersOf(mech);
  if (!swarmers.length) { ui.notifications.info(`${mech.name} isn't swarmed.`); return null; }
  if (mech.system.conditions?.prone) { ui.notifications.warn(`${mech.name} is already prone.`); return null; }
  beginRecording();
  const rolls = [];
  const res = await psrRow(mech, 'Drop prone to shake off swarming infantry', [], rolls);
  let fall = null;
  const notes = [];
  if (res.success) {
    fall = await resolveFall(mech, { levels: 0, rolls, plus20: phaseDamageSoFar(mech) >= 20 });
  } else {
    await writeDoc(mech, { 'system.conditions': { ...(mech.system.conditions || {}), prone: true } });
    notes.push(`${mech.name} goes prone but the infantry holds on.`);
  }
  await postCard(mech, 'Drop Prone (Shake Off Swarmers)', { results: [res], fall, notes }, rolls);
  return { res, fall, notes };
}

/**
 * Erratic maneuvers (end of a swarmed vehicle's movement): Driving + its
 * driving modifiers + 4 (+2 instead with VTOL MP). Success shakes the swarmers
 * off: each trooper takes 1 damage, or 1 per elevation for a VTOL / WiGE (none
 * for jump- or VTOL-capable infantry).
 */
export async function vehicleShakeOff(vehicle) {
  const swarmers = swarmersOf(vehicle);
  if (!swarmers.length) { ui.notifications.info(`${vehicle.name} isn't swarmed.`); return null; }
  beginRecording();
  const rolls = [];
  const vtol = vehicle.system.movementType === 'vtol';
  const airborne = ['vtol', 'wige'].includes(vehicle.system.movementType);
  const mods = [...pilotingMods(vehicle), ...vehicleDrivingMods(vehicle), { label: vtol ? 'Erratic maneuvers (VTOL)' : 'Erratic maneuvers', value: vtol ? 2 : 4 }];
  const res = { label: 'Shake off swarming infantry', mods, tn: sum(mods) };
  if (pilotUnconscious(vehicle) || vehicle.system.conditions?.crewKilled) { res.auto = 'crew out — automatic failure'; res.success = false; }
  else {
    const r = await new Roll("2d6").evaluate();
    rolls.push(r);
    Object.assign(res, { total: r.total, dice: diceOf(r), success: r.total >= res.tn });
  }
  const notes = [];
  if (res.success) {
    const elev = num(vehicle.system.elevation);
    for (const u of swarmers) {
      const flies = num(u.system?.movement?.jump) > 0 || num(u.system?.movement?.vtol) > 0;
      const each = airborne ? (flies ? 0 : elev) : 1;
      notes.push(...await knockOff([u], { perTrooper: each, why: 'is shaken loose' }, rolls));
    }
  } else notes.push('The infantry holds on.');
  notes.push('Erratic maneuvers: the vehicle counts as flanking this turn but spends only Cruising MP; +1 to its Driving rolls this turn.');
  await postCard(vehicle, 'Erratic Maneuvers', { results: [res], notes }, rolls);
  return { res, notes };
}

/** An aerospace unit taking off automatically shakes off swarmers: one 4D6 hit each. */
export async function takeOffShakeOff(craft) {
  const swarmers = swarmersOf(craft);
  if (!swarmers.length) { ui.notifications.info(`${craft.name} isn't swarmed.`); return null; }
  beginRecording();
  const rolls = [];
  const notes = await knockOff(swarmers, { dice: '4d6', why: 'is thrown off by the take-off' }, rolls);
  notes.push('Place the infantry in the first hex where the craft left the ground.');
  await postCard(craft, 'Take-Off (Swarmers Thrown)', { results: [], notes }, rolls);
  return { notes };
}

/** Sheet summary of the infantry on a unit: { swarmers: [...], riders: [...] } as name / trooper counts. */
export function attachedSummary(carrier) {
  const fmt = (u) => ({ name: u.name, uuid: u.uuid, troopers: liveTroopers(u), magnetic: u.type === 'battle_armor' && manipulatorCount(u, 'magneticClaw') > 0 });
  return { swarmers: swarmersOf(carrier).map(fmt), riders: ridersOf(carrier).map(fmt) };
}

/** Trooper positions of a riding battle armor unit (for the sheet): [{ n, alive, where }]. */
export function riderPositions(actor, carrier) {
  const side = { right: 'Right Side', left: 'Left Side', rear: 'Rear' };
  return baTroopers(actor).map((t, i) => {
    const p = TRANSPORT_POSITIONS[i];
    const where = carrier?.type === 'mech' ? `${MECH_LOC_LABEL[p.mech]}${p.rear ? ' (rear)' : ''}` : side[p.vehicle];
    return { n: t.n, alive: t.alive, where };
  });
}

/* ------------------------------------------------------------------ */
/*  Mechanized battle armor (TW p. 227)                                 */
/* ------------------------------------------------------------------ */

/**
 * Can this battle armor ride other units? Humanoid suits up to heavy with at
 * least one basic manipulator or battle claw (vibro- / magnetic claws count),
 * or light / PA(L) suits with two armored gloves.
 */
export function mountCapability(actor) {
  if (actor?.type !== 'battle_armor') return 'Only battle armor rides as mechanized battle armor.';
  const sys = actor.system || {};
  if (sys.chassis === 'quad') return 'Quad battle armor cannot ride other units.';
  if (sys.weightClass === 'assault') return 'Assault battle armor cannot ride other units.';
  const light = ['pal', 'light'].includes(sys.weightClass);
  const ok = manipulatorCount(actor, 'basic', 'battleClaw', 'heavyClaw', 'vibroClaw', 'magneticClaw') >= 1
    || (light && manipulatorCount(actor, 'armoredGlove') === 2);
  return ok ? null : 'Riding needs a basic manipulator or battle claw (or two armored gloves on light / PA(L) suits).';
}

/** Why this battle armor can't mount that unit now, or null. */
export function mountBlock(actor, carrier, distance = null) {
  const cap = mountCapability(actor);
  if (cap) return cap;
  if (liveTroopers(actor) <= 0) return `${actor.name} has no troopers left.`;
  if (attachment(actor)) return `${actor.name} is already ${attachment(actor).mode === 'ride' ? 'riding' : 'swarming'} a unit.`;
  if (!carrier) return 'Target the friendly unit to mount (same hex).';
  if (distance != null && distance > 0) return 'The carrier must be in the same hex.';
  if (!['mech', 'ground_vehicle'].includes(carrier.type)) return "Mechanized battle armor rides 'Mechs and vehicles only.";
  if (carrier.type === 'ground_vehicle' && ['vtol', 'wige', 'submarine'].includes(carrier.system?.movementType)) return 'A vehicle carrying mechanized battle armor may not use VTOL, WiGE or UMU movement.';
  if (!carrier.system?.omni && !actor.system?.equipment?.magneticClamps) return `${carrier.name} isn't an Omni unit: riding it needs magnetic clamps.`;
  if (ridersOf(carrier).length) return `${carrier.name} already carries a battle armor unit.`;
  return null;
}

/**
 * Mount a friendly 'Mech or vehicle (Movement Phase, at the end of the
 * carrier's move). A swarmed carrier can only be mounted with a successful
 * swarm-style roll, with its Swarm Attack Modifiers Table value (swarmers vs
 * mounting troopers) as a negative modifier.
 */
export async function mountCarrier(actor, target = [...(game.user?.targets ?? [])][0] || null) {
  const carrier = target?.actor || null;
  const token = actor.getActiveTokens?.()[0] || null;
  const dist = token && target ? measureHexes(token, target) : null;
  const why = mountBlock(actor, carrier, dist);
  if (why) { ui.notifications.warn(why); return null; }
  beginRecording();
  const rolls = [];
  const notes = [];
  const results = [];
  let ok = true;
  const swarmers = swarmersOf(carrier);
  if (swarmers.length) {
    const mods = antiMechMods(actor, 'swarm', carrier).filter(m => !/^Mechanized battle armor/.test(m.label));
    const enemy = swarmers[0];
    mods.push({ label: `Swarm Attack Modifiers (${liveTroopers(enemy)} swarming vs ${liveTroopers(actor)} mounting), negated`, value: -swarmRiderMod(enemy, liveTroopers(actor)) });
    const res = { label: `Mount the swarmed ${carrier.name}`, mods, tn: sum(mods) };
    const r = await new Roll("2d6").evaluate();
    rolls.push(r);
    Object.assign(res, { total: r.total, dice: diceOf(r), success: r.total >= res.tn });
    results.push(res);
    ok = res.success;
    if (ok) notes.push(`Next turn ${actor.name} may attack ${enemy.name} directly, ignoring target movement and terrain.`);
  }
  if (ok) {
    await writeDoc(actor, { 'system.attached': { uuid: carrier.uuid, mode: 'ride', key: currentTurnKey() || '' } });
    const lost = carrier.system?.omni ? '' : ` ${carrier.name} (not Omni) loses 1 ${carrier.type === 'mech' ? 'Walking' : 'Cruising'} MP while carrying it.`;
    notes.push(`${actor.name} mounts ${carrier.name}.${lost} Weapons in locations with a trooper riding on them can't fire (turrets can).`);
  } else notes.push(`${actor.name} fails to mount ${carrier.name}.`);
  await postCard(actor, 'Mount Carrier', { results, notes }, rolls);
  return { ok, results, notes };
}

/** Dismount (Movement Phase, end of the carrier's move): the unit can't move or attack this turn. */
export async function dismountCarrier(actor) {
  const a = attachment(actor);
  if (a?.mode !== 'ride') { ui.notifications.info(`${actor.name} isn't riding a unit.`); return null; }
  const carrier = attachedCarrier(actor);
  beginRecording();
  await writeDoc(actor, { 'system.attached': { uuid: '', mode: '', key: '' } });
  await postCard(actor, 'Dismount', { results: [], notes: [`${actor.name} dismounts${carrier ? ` from ${carrier.name}` : ''} into its hex: it can't move or attack this turn; attacks against it count it as having moved 0 hexes.`] }, []);
  return true;
}

/**
 * A unit carrying battle armor enters a building hex: 1D6 per riding unit —
 * 1–3 one hit of 1D6 damage and it stays on; 4–6 it falls off with 2D6 damage
 * (infantry-attack damage, can't move or shoot this turn). An accidental entry
 * (e.g. a skid) always counts as 4–6.
 */
export async function riderBuildingCheck(carrier, { accidental = null } = {}) {
  const riders = ridersOf(carrier);
  if (!riders.length) { ui.notifications.info(`${carrier.name} isn't carrying battle armor.`); return null; }
  if (accidental === null) {
    const r = await DialogV2.wait({
      window: { title: `Building Hex — ${carrier.name}`, icon: "fa-solid fa-building" },
      content: `<div class="tw-attack-dialog"><div class="form-group"><label>Accidental entry (e.g. a skid): the riders always fall off</label><input type="checkbox" name="accidental" /></div></div>`,
      buttons: [
        { action: "roll", label: "Roll", icon: "fa-solid fa-dice", default: true, callback: (e, b) => ({ accidental: !!b.form.elements.accidental.checked }) },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!r || r === "cancel") return null;
    accidental = r.accidental;
  }
  beginRecording();
  const rolls = [];
  const notes = [];
  for (const u of riders) {
    let fallsOff = accidental;
    if (!accidental) {
      const r = await new Roll("1d6").evaluate();
      rolls.push(r);
      fallsOff = r.total >= 4;
      notes.push(`${u.name}: 1D6 ${r.total}`);
    }
    if (fallsOff) notes.push(...await knockOff([u], { dice: '2d6', why: 'falls off into the building hex' }, rolls));
    else {
      const d = await new Roll("1d6").evaluate();
      rolls.push(d);
      const res = await infantryAttackDamage(u, d.total, rolls);
      notes.push(`${u.name} is scraped against the building (${d.total} damage, ${res.remaining} troopers left) but holds on; it can't move or shoot this turn.`);
    }
  }
  await postCard(carrier, 'Building Hex — Riding Battle Armor', { results: [], notes }, rolls);
  return { notes };
}
