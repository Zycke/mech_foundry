/**
 * Aerospace flight: Control Rolls (TW p. 93 Control Roll Table, p. 249
 * Atmospheric Control Modifiers), out-of-control random movement (p. 93), and
 * the aerospace fighter / small craft heat phase (TW p. 161: Heat Point Table,
 * random movement, shutdown, ammunition explosions, damage to warriors).
 *
 * Pending Control Rolls share the unit's pending-roll queue with 'Mech PSRs
 * (flag `mech-foundry.psr`), so the same sheet banner, chat button and token
 * icon apply.
 */
import { applyCrewDamage, CREW_DAMAGE } from "./atow-conversion.mjs";
import { beginRecording, endRecording, writeDoc } from "./gm-relay.mjs";
import { currentTurnKey } from "./tw-turn.mjs";
import { linkedCrew, pilotUnconscious } from "./tw-movement.mjs";
import { pendingPSR, queuePSR, warriorDamage } from "./tw-psr.mjs";
import { aeroTurnState, isAero } from "./tw-aero.mjs";
import { firedThisTurn } from "./tw-combat.mjs";
import { heatCard, rollCard, roundLabel } from "./tw-cards.mjs";
import { pilotingMods } from "./tw-skills.mjs";

const { DialogV2 } = foundry.applications.api;
const num = (v) => Number(v) || 0;
const sum = (mods) => mods.reduce((t, m) => t + num(m.value), 0);
const diceOf = (roll) => roll?.dice?.[0]?.results?.map(r => r.result) ?? [];

/* ------------------------------------------------------------------ */
/*  Control Rolls                                                       */
/* ------------------------------------------------------------------ */

/**
 * Standing Control Roll modifiers: pilot / crew damage +1 per box, avionics
 * damage +1 per box, life support damage +1, atmospheric operations +2 (and
 * −1 for a fighter / small craft in atmosphere), above Safe Thrust +1, and +1
 * per point above 2× Safe Thrust (thrust spent this turn).
 */
export function controlRollMods(actor) {
  const sys = actor?.system || {};
  const mods = [];
  const add = (label, value) => { if (value) mods.push({ label, value }); };
  add('Pilot/crew damage', num(sys.crew?.hits));
  add('Avionics damage', num(sys.crits?.avionics));
  add('Life support damage', sys.crits?.lifeSupport ? 1 : 0);
  if (sys.flight?.inAtmosphere) {
    add('Atmospheric operations', 2);
    if (isAero(actor)) add('Fighter / small craft in atmosphere', -1);
  }
  const safe = num(sys.thrust?.safe);
  const thrust = aeroTurnState(actor).thrust;
  if (safe > 0 && thrust > safe) add('Above Safe Thrust', 1);
  if (safe > 0 && thrust > 2 * safe) add('Above 2× Safe Thrust', thrust - 2 * safe);
  return mods;
}

/** Queue a Control Roll reason on an aerospace unit. Returns the flag update. */
export function controlRollUpdate(actor, reasons) {
  return { 'flags.mech-foundry.psr': queuePSR(actor, reasons) };
}

/** Random Movement Table (1D6). */
export const RANDOM_MOVEMENT = {
  1: 'Forward 1 hex, turn left 2 hexsides', 2: 'Forward 1 hex, turn left 1 hexside',
  3: 'Forward 1 hex', 4: 'Forward 1 hex',
  5: 'Forward 1 hex, turn right 1 hexside', 6: 'Forward 1 hex, turn right 2 hexsides'
};

async function postCard(actor, flavor, ctx, rolls) {
  const card = rollCard({ title: flavor, icon: 'fa-plane', round: roundLabel(), ...ctx }, actor?.name || '');
  const content = await foundry.applications.handlebars.renderTemplate("systems/mech-foundry/templates/chat/tw-psr.hbs", card);
  await ChatMessage.create({ flags: { 'mech-foundry': endRecording() }, speaker: ChatMessage.getSpeaker({ actor }), flavor, content, rolls });
}

/**
 * Roll one Control Roll: Piloting + standing modifiers + the situation's own.
 * An unconscious pilot fails automatically.
 */
async function controlRoll(actor, label, extra = [], rolls = []) {
  const mods = [...pilotingMods(actor), ...controlRollMods(actor), ...extra.filter(m => m.value)];
  const res = { label, mods, tn: sum(mods) };
  if (pilotUnconscious(actor)) { res.auto = 'pilot unconscious — automatic failure'; res.success = false; return res; }
  const roll = await new Roll("2d6").evaluate();
  rolls.push(roll);
  return Object.assign(res, { total: roll.total, dice: diceOf(roll), success: roll.total >= res.tn, mof: res.tn - roll.total });
}

/** Roll every queued Control Roll; the first failure puts the unit out of control. */
export async function rollPendingControl(actor) {
  const p = pendingPSR(actor);
  if (!p) { ui.notifications.info(`${actor.name} has no Control Roll pending.`); return null; }
  beginRecording();
  const rolls = [], results = [];
  let failed = false;
  for (const r of p.reasons) {
    const res = await controlRoll(actor, r.label, r.mod ? [{ label: r.label, value: r.mod }] : [], rolls);
    results.push(res);
    if (!res.success) { failed = true; break; }
  }
  const update = { 'flags.mech-foundry.psr': { reasons: [], plus20: false } };
  if (failed) update['system.conditions'] = { ...(actor.system.conditions || {}), outOfControl: true };
  await writeDoc(actor, update);
  const notes = failed
    ? [`${actor.name} goes OUT OF CONTROL: next turn it can't spend thrust voluntarily and moves randomly (Random Movement on the sheet); +2 to its attacks. A Control Roll in the End Phase brings it back.`]
    : [`${actor.name} stays in control.`];
  await postCard(actor, 'Control Roll', { results, notes }, rolls);
  return { results, failed };
}

/** Out-of-control random movement: 1D6 on the Random Movement Table. */
export async function randomMovement(actor) {
  const roll = await new Roll("1d6").evaluate();
  beginRecording();
  await postCard(actor, 'Random Movement', { results: [], notes: [`1D6 = ${roll.total}: ${RANDOM_MOVEMENT[roll.total]} — move the token.`] }, [roll]);
  return roll.total;
}

/** End Phase: an out-of-control aerospace unit rolls to regain control. */
export async function regainControl(actor) {
  if (!isAero(actor) || !actor.system.conditions?.outOfControl) return null;
  beginRecording();
  const rolls = [];
  const res = await controlRoll(actor, 'Regain control', [], rolls);
  if (res.success) await writeDoc(actor, { 'system.conditions': { ...(actor.system.conditions || {}), outOfControl: false } });
  await postCard(actor, 'Control Roll', { results: [res], notes: [res.success ? `${actor.name} is back under control.` : `${actor.name} stays out of control.`] }, rolls);
  return res.success;
}

/** End Phase for all aerospace units in a combat (GM client). */
export async function endPhaseAero(combat) {
  if (!game.user.isGM) return;
  const seen = new Set();
  for (const c of combat?.combatants ?? []) {
    const a = c.actor;
    if (!a || seen.has(a.uuid) || !isAero(a)) continue;
    seen.add(a.uuid);
    await regainControl(a);
  }
}

/* ------------------------------------------------------------------ */
/*  Heat phase                                                          */
/* ------------------------------------------------------------------ */

/**
 * Aerospace heat-scale avoid numbers (Aerospace Fighter / Small Craft record
 * sheet): random movement at 5 / 10 / 15 / 20 / 25, pilot damage at 21 / 27,
 * shutdown and ammunition as for 'Mechs.
 */
export const AERO_HEAT = {
  randomMovement: [[25, 10], [20, 8], [15, 7], [10, 6], [5, 5]],
  pilotDamage: [[27, 9], [21, 6]],
  shutdown: [[26, 10], [22, 8], [18, 6], [14, 4]],
  ammo: [[28, 8], [23, 6], [19, 4]]
};
const avoidFor = (table, heat) => table.find(([at]) => heat >= at)?.[1] ?? null;

/** Per-shot damage of a weapon's ammunition (a full salvo for cluster weapons). */
const perShot = (w) => num(w.damage) * Math.max(1, num(w.clusterSize));

/**
 * End-of-turn heat for an aerospace fighter or small craft: weapons fired,
 * +2 per engine hit, heat-causing weapons, minus heat sinks (no movement heat).
 * Then the avoid rolls: random movement (5+), shutdown (14+, automatic at 30;
 * a shut-down unit restarts at 13 or less, or on the avoid roll), ammunition
 * explosion (19+: the most damaging ammo per shot × rounds / 10 to SI, / 20
 * with CASE, minimum 1; the pilot takes 1) and pilot damage (21+).
 */
export async function resolveAeroHeat(actor, preset = null) {
  if (!isAero(actor)) return null;
  const sys = actor.system;
  const current = num(sys.heat?.value);
  const sinks = sys.heatSinks || { count: 0, type: 'single' };
  const dissipation = num(sinks.count) * (sinks.type === 'double' ? 2 : 1);
  const fired = firedThisTurn(actor);
  const weaponsHeat = Object.values(fired).reduce((t, h) => t + num(h), 0);
  const engineHeat = 2 * num(sys.crits?.engine);

  // preset === true: resolve with the defaults (the Heat Phase does this for every unit).
  let r = preset === true ? { weapons: weaponsHeat, engine: engineHeat, external: 0, sinks: dissipation } : preset;
  if (!r) {
    r = await DialogV2.wait({
      window: { title: `Resolve Heat — ${actor.name}`, icon: "fa-solid fa-fire" },
      content: `
        <div class="tw-attack-dialog">
          <div class="form-group"><label>Weapons heat <span class="tw-hint">${Object.keys(fired).length} fired this turn</span></label><input type="number" name="weapons" value="${weaponsHeat}" /></div>
          <div class="form-group"><label>Engine damage (+2 per hit)</label><input type="number" name="engine" value="${engineHeat}" /></div>
          <div class="form-group"><label>Heat-causing weapons hitting it</label><input type="number" name="external" value="0" /></div>
          <div class="form-group"><label>Heat-sink dissipation</label><input type="number" name="sinks" value="${dissipation}" /></div>
        </div>`,
      buttons: [
        { action: "resolve", label: "Resolve", icon: "fa-solid fa-fire", default: true, callback: (e, b) => ({ weapons: num(b.form.elements.weapons.value), engine: num(b.form.elements.engine.value), external: num(b.form.elements.external.value), sinks: num(b.form.elements.sinks.value) }) },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!r || r === "cancel") return null;
  }

  beginRecording();
  const rolls = [];
  const newHeat = Math.max(0, current + r.weapons + r.engine + r.external - r.sinks);
  const notes = [];
  const conditions = { ...(sys.conditions || {}) };
  const roll2 = async () => { const x = await new Roll("2d6").evaluate(); rolls.push(x); return x.total; };

  // Shutdown / restart.
  if (conditions.shutdown) {
    if (newHeat <= 13) { conditions.shutdown = false; notes.push('Heat 13 or less: the power plant restarts automatically.'); }
    else if (newHeat < 30) {
      const need = avoidFor(AERO_HEAT.shutdown, newHeat);
      const t = await roll2();
      if (t >= need) conditions.shutdown = false;
      notes.push(`Restart roll ${t} vs ${need}+: ${t >= need ? 'restarts' : 'stays shut down'}.`);
    } else notes.push('Heat 30+: stays shut down.');
  } else if (newHeat >= 30) {
    conditions.shutdown = true; notes.push('AUTOMATIC SHUTDOWN (30+).');
  } else if (newHeat >= 14) {
    const need = avoidFor(AERO_HEAT.shutdown, newHeat);
    const t = await roll2();
    if (t < need) conditions.shutdown = true;
    notes.push(`Shutdown avoid roll ${t} vs ${need}+: ${t < need ? 'SHUTS DOWN (drifts on its heading; in atmosphere it may stall)' : 'avoided'}.`);
  }

  // Random movement.
  if (newHeat >= 5) {
    const need = avoidFor(AERO_HEAT.randomMovement, newHeat);
    const t = await roll2();
    if (t < need) {
      conditions.outOfControl = true;
      notes.push(`Random movement avoid roll ${t} vs ${need}+: FAILS — next turn it can't spend thrust voluntarily and moves randomly; a Control Roll in that turn's End Phase regains control.`);
    } else notes.push(`Random movement avoid roll ${t} vs ${need}+: avoided.`);
  }

  // Ammunition explosion.
  const weapons = foundry.utils.deepClone(sys.weapons || []);
  const si = { ...(sys.structuralIntegrity || { value: 0, max: 0 }) };
  const crew = foundry.utils.deepClone(sys.crew || {});
  const linked = linkedCrew(actor);
  const crewEvents = [];
  const warriorLines = [];
  if (newHeat >= 19) {
    const loaded = weapons.filter(w => String(w.ammoType || '').trim() && num(w.ammo) > 0 && !/gauss/i.test(w.name || '') && !/gauss/i.test(w.ammoType || ''));
    if (loaded.length) {
      const need = avoidFor(AERO_HEAT.ammo, newHeat);
      const t = await roll2();
      if (t < need) {
        const w = loaded.sort((a, b) => perShot(b) - perShot(a))[0];
        const damage = Math.max(1, Math.floor((perShot(w) * num(w.ammo)) / (sys.hasCASE ? 20 : 10)));
        si.value = Math.max(0, num(si.value) - damage);
        notes.push(`Ammunition explosion avoid roll ${t} vs ${need}+: ${w.ammoType} EXPLODES — ${perShot(w)} × ${num(w.ammo)} rounds / ${sys.hasCASE ? '20 (CASE)' : '10'} = ${damage} to SI${si.value <= 0 ? ' — DESTROYED' : ''}.`);
        w.ammo = 0;
        warriorLines.push(...await warriorDamage(crew, 1, { linked: !!linked, rolls, source: 'ammo explosion' }));
        if (linked) crewEvents.push(CREW_DAMAGE.pilotHit);
      } else notes.push(`Ammunition explosion avoid roll ${t} vs ${need}+: avoided.`);
    }
  }

  // Damage to warriors.
  if (newHeat >= 21) {
    const need = avoidFor(AERO_HEAT.pilotDamage, newHeat);
    const t = await roll2();
    if (t < need) {
      notes.push(`Pilot heat damage avoid roll ${t} vs ${need}+: the pilot takes 1 damage.`);
      warriorLines.push(...await warriorDamage(crew, 1, { linked: !!linked, rolls, source: 'heat' }));
      if (linked) crewEvents.push(CREW_DAMAGE.pilotHit);
    } else notes.push(`Pilot heat damage avoid roll ${t} vs ${need}+: avoided.`);
  }
  if (!linked && crew.unconscious) conditions.outOfControl = true;

  await writeDoc(actor, {
    'system.heat.value': newHeat, 'system.conditions': conditions, 'system.structuralIntegrity': si,
    'flags.mech-foundry.heatDone': { key: currentTurnKey() },
    'system.weapons': weapons, 'system.crew': crew, 'flags.mech-foundry.fired': { key: currentTurnKey(), list: [] }
  });
  if (linked) for (const ev of crewEvents) await applyCrewDamage(linked, ev);

  const lines = [
    { label: 'Start of turn', value: current },
    { label: 'Weapons fire', value: r.weapons },
    { label: 'Engine damage', value: r.engine },
    { label: 'Heat-causing weapons', value: r.external },
    { label: 'Heat sinks', value: -r.sinks }
  ].filter(l => l.value !== 0 || l.label === 'Start of turn');
  const toHit = [8, 13, 17, 24].filter(t => newHeat >= t).length;
  const content = await foundry.applications.handlebars.renderTemplate("systems/mech-foundry/templates/chat/tw-heat.hbs", heatCard({
    aero: true, round: roundLabel(), lines, newHeat, effects: { toHit, shutdown: '', ammo: '' }, notes, warriorLines
  }, actor.name));
  await ChatMessage.create({ flags: { 'mech-foundry': endRecording() }, speaker: ChatMessage.getSpeaker({ actor }), flavor: 'Heat Phase', content, rolls });
  return { newHeat, notes, conditions };
}

/* ------------------------------------------------------------------ */
/*  Maneuvering                                                         */
/* ------------------------------------------------------------------ */

/** Changing Facing Cost Table (TW p. 77): thrust per facing change by current velocity. */
export function facingCost(velocity) {
  const v = Math.max(0, num(velocity));
  if (v <= 2) return 1;
  if (v <= 5) return 2;
  if (v <= 7) return 3;
  if (v <= 9) return 4;
  if (v === 10) return 5;
  return v - 5; // 11 → 6, then +1 per point
}

/**
 * Minimum straight movement between facing changes (TW p. 84; p. 92 on ground
 * maps, aerodyne craft — velocity capped at 12 there).
 */
export function straightMinimum(actor, velocity, groundMap = false) {
  const v = Math.max(0, num(velocity));
  const small = actor?.type === 'small_craft';
  if (groundMap) {
    const t = { fighter: [8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52], small: [8, 14, 20, 26, 32, 38, 44, 50, 56, 62, 68, 74] };
    if (v < 1) return 0;
    return (small ? t.small : t.fighter)[Math.min(12, v) - 1];
  }
  const rows = [[3, 1, 1], [6, 1, 2], [9, 2, 3], [12, 3, 4], [15, 4, 5], [Infinity, 5, 6]];
  if (v < 1) return 0;
  const row = rows.find(([max]) => v <= max);
  return small ? row[2] : row[1];
}

/** Special Maneuvers Table (TW p. 85). `thrust` may depend on velocity. */
export const SPECIAL_MANEUVERS = {
  loop: { label: 'Loop', minVel: 4, thrust: () => 4, control: 1, effect: 'Spends its first 4 points of velocity in the loop (velocity unchanged), ends in the hex where it started, then spends the rest of its velocity normally.' },
  immelmann: { label: 'Immelmann', minVel: 3, thrust: () => 4, control: 1, effect: 'Gains two altitudes and ends facing any hexside. Velocity drops by 2; the remainder is spent normally.' },
  splitS: { label: 'Split-S', minVel: 0, thrust: () => 2, control: 2, effect: 'Loses two altitudes and ends facing any hexside. Velocity increases by 1.' },
  hammerhead: { label: 'Hammerhead', minVel: 0, thrust: (v) => v, control: 3, effect: 'Stays in its hex and turns 180 degrees.' },
  halfRoll: { label: 'Half-roll', minVel: 0, thrust: () => 1, control: -1, effect: 'Rolls 180 degrees, reversing left/right sides and up/down facings.' },
  barrelRoll: { label: 'Barrel roll', minVel: 2, thrust: () => 1, control: 0, effect: 'Rolls 360 degrees, ending with the same facing. Velocity drops by 1.' },
  sideSlip: { label: 'Side-slip', minVel: 0, thrust: () => 1, control: 0, effect: 'Moves into the front-left or front-right hex instead of straight ahead, without changing facing (on ground maps: 8 hexes to the front-left / front-right, then 8 straight ahead).' },
  viff: { label: 'VIFF (VSTOL only)', minVel: 0, thrust: (v) => v + 2, control: 2, effect: 'Halts its forward momentum and gains one altitude (VSTOL units only).' }
};

/**
 * Declare this turn's aerospace movement: thrust spent, facing changes,
 * special maneuver, evasive action and hazards. Records thrust / evasion for
 * the attack modifiers, updates velocity, and rolls every Control Roll the
 * move requires (Control Roll Table, Movement situations).
 * @param {object} [preset]  dialog values (tests)
 */
export async function aeroManeuver(actor, preset = null) {
  if (!isAero(actor)) return null;
  const sys = actor.system;
  const vel = num(sys.flight?.velocity);
  const safe = num(sys.thrust?.safe), max = num(sys.thrust?.max) || Math.ceil(safe * 1.5);
  let r = preset;
  if (!r) {
    const opts = Object.entries(SPECIAL_MANEUVERS).map(([k, m]) => `<option value="${k}">${m.label} (${m.minVel ? `vel ${m.minVel}+, ` : ''}control ${m.control >= 0 ? '+' : ''}${m.control})</option>`).join('');
    r = await DialogV2.wait({
      window: { title: `Maneuver — ${actor.name}`, icon: "fa-solid fa-plane" },
      content: `
        <div class="tw-attack-dialog">
          <p class="tw-hint">Velocity ${vel} · Safe Thrust ${safe} / Max ${max} · facing change costs ${facingCost(vel)} thrust · move at least ${straightMinimum(actor, vel)} hex(es) straight between facing changes (${straightMinimum(actor, vel, true)} on ground maps)</p>
          <div class="form-group"><label>Thrust for velocity changes</label><input type="number" name="accel" value="0" min="0" /></div>
          <div class="form-group"><label>Facing changes</label><input type="number" name="facings" value="0" min="0" /></div>
          <div class="form-group"><label>Special maneuver</label><select name="maneuver"><option value="">None</option>${opts}</select></div>
          <div class="form-group"><label>New velocity</label><input type="number" name="velocity" value="${vel}" min="0" /></div>
          <div class="form-group"><label>Altitudes descended this turn</label><input type="number" name="descended" value="0" min="0" /></div>
          <div class="form-group"><label>Rolls (half / barrel) this turn</label><input type="number" name="rolls" value="0" min="0" /></div>
          <div class="form-group"><label>Stalled</label><input type="checkbox" name="stalled" /></div>
          <div class="form-group"><label>Exceeded the operational ceiling</label><input type="checkbox" name="ceiling" /></div>
          <div class="form-group"><label>Evasive action this turn</label><input type="checkbox" name="evading" /></div>
        </div>`,
      buttons: [
        { action: "go", label: "Declare", icon: "fa-solid fa-plane", default: true, callback: (e, b) => { const f = b.form.elements; return {
          accel: num(f.accel.value), facings: num(f.facings.value), maneuver: f.maneuver.value, velocity: num(f.velocity.value),
          descended: num(f.descended.value), rolls: num(f.rolls.value), stalled: !!f.stalled.checked, ceiling: !!f.ceiling.checked, evading: !!f.evading.checked
        }; } },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!r || r === "cancel") return null;
  }
  const m = SPECIAL_MANEUVERS[r.maneuver] || null;
  const thrust = num(r.accel) + num(r.facings) * facingCost(vel) + (m ? m.thrust(vel) : 0);
  const notes = [`Thrust spent: ${thrust} (Safe ${safe}, Max ${max})${thrust > max ? ' — MORE THAN MAX THRUST' : ''}.`];
  if (m) {
    if (vel < m.minVel) notes.push(`${m.label} needs velocity ${m.minVel}+ (current ${vel}).`);
    notes.push(`${m.label}: ${m.effect}`);
  }
  if (r.evading) notes.push('Evasive action: attacks against it are harder; it can\'t attack this turn.');

  // Movement situations requiring a Control Roll.
  const reasons = [];
  if (m) reasons.push({ key: 'maneuver', label: m.label, mod: m.control });
  if (num(r.rolls) > 1) reasons.push({ key: 'rolls', label: 'Rolled more than once', mod: 0 });
  if (thrust > num(sys.structuralIntegrity?.value)) reasons.push({ key: 'thrustSI', label: 'Thrust above current SI', mod: 0 });
  if (sys.flight?.inAtmosphere && num(r.velocity) > 2 * safe) reasons.push({ key: 'fastAtmo', label: 'Velocity over 2× Safe Thrust in atmosphere', mod: 0 });
  if (r.stalled) reasons.push({ key: 'stall', label: 'Stalling', mod: 0 });
  if (num(r.descended) >= 3) reasons.push({ key: 'descend', label: `Descended ${num(r.descended)} altitudes`, mod: 0 });
  if (r.ceiling) reasons.push({ key: 'ceiling', label: 'Exceeded operational ceiling', mod: 0 });

  const update = { 'system.flight.velocity': num(r.velocity), 'system.flight.thrustSpent': thrust };
  if (currentTurnKey()) update['flags.mech-foundry.aeroTurn'] = { ...aeroTurnState(actor), thrust, evading: !!r.evading, key: currentTurnKey() };
  if (reasons.length) update['flags.mech-foundry.psr'] = queuePSR(actor, reasons);
  beginRecording();
  await writeDoc(actor, update);
  await postCard(actor, 'Maneuver', { results: [], notes: [...notes, reasons.length ? `Control Roll${reasons.length > 1 ? 's' : ''} required: ${reasons.map(x => x.label).join(', ')}.` : 'No Control Roll needed.'] }, []);
  const control = reasons.length ? await rollPendingControl(actor) : null;
  return { thrust, reasons, control, notes };
}

/* ------------------------------------------------------------------ */
/*  Landing                                                             */
/* ------------------------------------------------------------------ */

/** Landing terrain modifiers (TW p. 86): only the highest applies; halved for vertical landings. */
export const LANDING_TERRAIN = {
  friendlyManned: { label: 'Manned friendly airfield', mod: -2 },
  friendlyUnmanned: { label: 'Unmanned friendly airfield', mod: -1 },
  paved: { label: 'Road or paved hex', mod: 0 },
  unfriendly: { label: 'Unfriendly airfield', mod: 1 },
  clear: { label: 'Clear hex', mod: 2 },
  water: { label: 'Water hex', mod: 3 },
  rough: { label: 'Rough or rubble hex (landing gear loses a box)', mod: 3 },
  elevated: { label: 'Elevated hex (non-vertical)', mod: 3 },
  building: { label: 'Building hex (non-vertical)', mod: 3 },
  lightWoods: { label: 'Light woods', mod: 4 },
  heavyWoods: { label: 'Heavy woods', mod: 5 }
};

/** Landing Modifiers Table (TW p. 86) for a landing attempt. */
export function landingMods(actor, { vertical = false, damagedThrusters = false, thrustHalved = false, noThrust = false, shortRunway = false, terrain = 'clear' } = {}) {
  const sys = actor?.system || {};
  const vel = num(sys.flight?.velocity);
  const mods = [];
  const add = (label, value) => { if (value) mods.push({ label, value }); };
  add('Damaged thrusters', damagedThrusters ? 4 : 0);
  if (vertical) add(`Vertical landing: velocity ${vel}`, Math.max(0, vel - 1));
  else add(`Horizontal landing: velocity ${vel}`, Math.max(0, vel - 2));
  add('Landing gear damaged', sys.crits?.landingGear ? 5 : 0);
  const nose = sys.armor?.nose;
  add('Nose armor destroyed', nose && num(nose.max) > 0 && num(nose.value) <= 0 ? 2 : 0);
  add('Thrust at 50% or less of starting', thrustHalved ? 2 : 0);
  add('No thrust available (aerodyne)', noThrust ? 4 : 0);
  add('Runway too short', !vertical && shortRunway ? 2 : 0);
  if (vertical) add('Aerospace fighter / small craft vertical landing', sys.flight?.inAtmosphere ? 2 : 0);
  const t = LANDING_TERRAIN[terrain];
  if (t) add(`${t.label}${vertical ? ' (halved)' : ''}`, vertical ? Math.trunc(t.mod / 2) : t.mod);
  return mods;
}

/** Failed Braking Maneuver Table (TW p. 87), by margin of failure. */
export function failedBraking(mof) {
  if (mof <= 4) return { text: 'The landing needs its full distance: it may land normally, or abort, circle and try again in a later turn.', damage: 0 };
  if (mof === 5) return { text: 'It must land, and becomes harder to control: +1 to the landing Control Roll.', damage: 0, plus: 1 };
  return { text: 'It must land and needs 20 hexes of runway regardless of type; it takes 20 damage on the nose and its landing gear is damaged: +2 to the landing Control Roll.', damage: 20, plus: 2 };
}

/**
 * Landing: a Control Roll with the Landing Modifiers (an out-of-control unit
 * fails automatically, margin of failure 10). A horizontal failure uses the
 * Failed Braking Maneuver Table (6+: 20 damage to the nose, gear damaged).
 * Success sets altitude and velocity to 0.
 */
export async function aeroLanding(actor, preset = null) {
  if (!isAero(actor)) return null;
  let r = preset;
  if (!r) {
    const terrainOpts = Object.entries(LANDING_TERRAIN).map(([k, t]) => `<option value="${k}"${k === 'clear' ? ' selected' : ''}>${t.label} (${t.mod >= 0 ? '+' : ''}${t.mod})</option>`).join('');
    r = await DialogV2.wait({
      window: { title: `Landing — ${actor.name}`, icon: "fa-solid fa-plane-arrival" },
      content: `
        <div class="tw-attack-dialog">
          <div class="form-group"><label>Landing</label><select name="kind"><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></div>
          <div class="form-group"><label>Terrain (highest that applies)</label><select name="terrain">${terrainOpts}</select></div>
          <div class="form-group"><label>Damaged thrusters (+4)</label><input type="checkbox" name="damagedThrusters" /></div>
          <div class="form-group"><label>Thrust at 50% or less of starting (+2)</label><input type="checkbox" name="thrustHalved" /></div>
          <div class="form-group"><label>No thrust available (+4)</label><input type="checkbox" name="noThrust" /></div>
          <div class="form-group"><label>Runway too short (+2)</label><input type="checkbox" name="shortRunway" /></div>
        </div>`,
      buttons: [
        { action: "land", label: "Land", icon: "fa-solid fa-plane-arrival", default: true, callback: (e, b) => { const f = b.form.elements; return {
          vertical: f.kind.value === 'vertical', terrain: f.terrain.value, damagedThrusters: !!f.damagedThrusters.checked,
          thrustHalved: !!f.thrustHalved.checked, noThrust: !!f.noThrust.checked, shortRunway: !!f.shortRunway.checked
        }; } },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!r || r === "cancel") return null;
  }
  beginRecording();
  const rolls = [];
  const extra = landingMods(actor, r);
  let res;
  if (actor.system.conditions?.outOfControl) {
    const mods = [...pilotingMods(actor), ...controlRollMods(actor), ...extra];
    res = { label: 'Landing', mods, tn: sum(mods), auto: 'out of control — automatic failure (margin 10)', success: false, mof: 10 };
  } else res = await controlRoll(actor, r.vertical ? 'Vertical landing' : 'Horizontal landing', extra, rolls);
  const notes = [];
  const update = {};
  if (res.success) {
    update['system.flight.altitude'] = 0; update['system.flight.velocity'] = 0;
    notes.push(`${actor.name} lands.`);
  } else if (r.vertical) {
    notes.push(`Vertical landing fails (margin ${res.mof}): the craft crashes — resolve the crash per the rules for your map.`);
  } else {
    const fb = failedBraking(res.mof);
    notes.push(`Failed braking (margin ${res.mof}): ${fb.text}`);
    if (fb.damage) {
      const armor = foundry.utils.deepClone(actor.system.armor || {});
      const si = { ...(actor.system.structuralIntegrity || { value: 0, max: 0 }) };
      let left = fb.damage;
      if (armor.nose) { const a = Math.min(num(armor.nose.value), left); armor.nose.value = num(armor.nose.value) - a; left -= a; }
      if (left > 0) si.value = Math.max(0, num(si.value) - left);
      update['system.armor'] = armor; update['system.structuralIntegrity'] = si;
      update['system.crits'] = { ...(actor.system.crits || {}), landingGear: true };
    }
  }
  if (Object.keys(update).length) await writeDoc(actor, update);
  await postCard(actor, 'Landing', { results: [res], notes }, rolls);
  return { res, notes };
}
