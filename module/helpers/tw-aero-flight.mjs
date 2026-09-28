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
import { pilotingFor } from "./tw-falls.mjs";
import { aeroTurnState, isAero } from "./tw-aero.mjs";
import { firedThisTurn } from "./tw-combat.mjs";

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
  const content = await foundry.applications.handlebars.renderTemplate("systems/mech-foundry/templates/chat/tw-psr.hbs", { title: flavor, ...ctx });
  await ChatMessage.create({ flags: { 'mech-foundry': endRecording() }, speaker: ChatMessage.getSpeaker({ actor }), flavor, content, rolls });
}

/**
 * Roll one Control Roll: Piloting + standing modifiers + the situation's own.
 * An unconscious pilot fails automatically.
 */
async function controlRoll(actor, label, extra = [], rolls = []) {
  const mods = [{ label: 'Piloting', value: pilotingFor(actor) }, ...controlRollMods(actor), ...extra.filter(m => m.value)];
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

  let r = preset;
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
  const content = await foundry.applications.handlebars.renderTemplate("systems/mech-foundry/templates/chat/tw-heat.hbs", {
    aero: true, lines, newHeat, effects: { toHit, shutdown: '', ammo: '' }, notes, warriorLines
  });
  await ChatMessage.create({ flags: { 'mech-foundry': endRecording() }, speaker: ChatMessage.getSpeaker({ actor }), flavor: 'Heat Phase', content, rolls });
  return { newHeat, notes, conditions };
}
