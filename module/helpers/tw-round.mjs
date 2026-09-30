/**
 * End-of-round summary for the GM (combat tracker, End Phase).
 *
 * Every combat card stores a compact record of what it resolved on its chat
 * message (`flags.mech-foundry.summary`, built by tw-cards volleySummary /
 * rollSummary). At the End Phase the GM's tracker reads this turn's records and
 * the units' current state: round totals, what still needs doing before the next
 * round (pending rolls, over-limit moves, unresolved heat), what was resolved
 * automatically, and a card per unit — movement, attacks, damage taken, heat,
 * conditions.
 */
import { currentTurnKey } from "./tw-turn.mjs";
import { MOVE_MODES, movedThisTurn, pilotUnconscious } from "./tw-movement.mjs";
import { heatResolvedThisTurn } from "./tw-combat.mjs";
import { pendingPSR } from "./tw-psr.mjs";
import { isAero } from "./tw-aero.mjs";
import { unitDestroyed } from "./tw-status.mjs";
import { attachedCarrier, attachment, isInfantry, liveTroopers, squadSize, swarmersOf } from "./tw-infantry.mjs";
import { narcPods } from "./tw-weapons.mjs";
import { PHASED_TYPES, movementLimit } from "./tw-phase.mjs";

const num = (v) => Number(v) || 0;
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** This turn's summary records, oldest first. */
export function turnRecords(turn = currentTurnKey(), messages = game.messages) {
  if (!turn) return [];
  const list = messages?.contents ?? [...(messages ?? [])];
  return list.map(m => m.flags?.['mech-foundry']?.summary).filter(s => s?.turn === turn);
}

/** Warnings the GM has dismissed this turn (actor ids). */
function acknowledged(combat) {
  const rec = combat?.getFlag?.('mech-foundry', 'acked');
  return rec && rec.key === currentTurnKey() ? (rec.ids || []) : [];
}

/** Dismiss a warning for this turn (GM). */
export async function acknowledge(combat, id) {
  await combat.setFlag('mech-foundry', 'acked', { key: currentTurnKey(), ids: [...new Set([...acknowledged(combat), id])] });
}

/** The warrior's name for a unit: linked character, else the sheet's pilot / crew. */
function warriorName(actor) {
  const crew = actor?.system?.pilot || actor?.system?.crew || {};
  const linked = crew.actorId ? game.actors?.get(crew.actorId) : null;
  return linked?.name || crew.name || '';
}

/** Heat effects shown on the unit card (the Heat Point Table's firing / movement penalties). */
function heatChips(actor) {
  const h = num(actor.system?.heat?.value);
  const out = [];
  const toHit = [8, 13, 17, 24].filter(t => h >= t).length;
  if (toHit) out.push({ text: `+${toHit} to-hit (heat)` });
  if (actor.type === 'mech' && h >= 5) out.push({ text: `−${Math.min(5, Math.floor(h / 5))} MP (heat)` });
  return out;
}

/**
 * The summary data: { round, totals, todo, done, units }.
 * todo: [{ id, tag, text, action, actorId }] — action 'roll' | 'ack' | 'heat'.
 */
export function roundSummary(combat, records = turnRecords()) {
  const acked = acknowledged(combat);
  const actors = [];
  const seen = new Set();
  for (const c of combat?.combatants ?? []) {
    const a = c.actor;
    if (!a || !PHASED_TYPES.has(a.type) || seen.has(a.uuid)) continue;
    seen.add(a.uuid);
    actors.push(a);
  }
  const attacks = records.filter(r => ['fire', 'physical', 'antimech', 'swarm'].includes(r.kind));
  const rolls = records.filter(r => r.kind === 'roll' || r.kind === 'heat');

  const todo = [], done = [];
  const units = actors.map(a => {
    const uuid = a.uuid;
    const unit = { id: a.id, name: a.name, warrior: warriorName(a), lines: [], chips: [], heat: null, heatHot: false, troopers: '', destroyed: false, destroyedBy: '' };
    // Destroyed this round (or earlier).
    if (unitDestroyed(a)) {
      unit.destroyed = true;
      const by = attacks.find(r => r.target === uuid && r.destroyed);
      unit.destroyedBy = by ? `by ${by.attackerName}` : '';
      const eff = attacks.filter(r => r.target === uuid).flatMap(r => r.effects).find(e => /destroyed/i.test(e));
      if (eff) unit.destroyedBy = `${eff}${by ? ` · ${by.attackerName}` : ''}`;
      return unit;
    }
    // Movement / flight.
    if (isAero(a)) {
      const v = num(a.system?.flight?.velocity);
      unit.lines.push({ k: 'Flight', v: `Velocity ${v}${num(a.system?.flight?.altitude) ? ` · altitude ${num(a.system.flight.altitude)}` : ''}` });
    } else {
      const mv = movedThisTurn(a);
      const lim = movementLimit(a, mv.mode);
      const m = MOVE_MODES.find(x => x.key === mv.mode);
      const label = a.type === 'ground_vehicle' ? m?.vlabel : m?.label;
      const over = lim && mv.mp > lim.limit;
      const spent = mv.mp > mv.hexes ? `${mv.hexes} hexes + ${mv.mp - mv.hexes} turns = ${mv.mp} of ${lim ? lim.limit : '?'} MP` : `${mv.hexes} of ${lim ? lim.limit : '?'} hexes`;
      unit.lines.push({ k: 'Moved', v: mv.mp || mv.modeSet ? `${label} · ${spent}` : 'Stationary', warn: over });
      if (over && !acked.includes(a.id)) todo.push({ id: `move-${a.id}`, tag: 'MOVE', text: `${a.name} spent ${mv.mp} MP — ${lim.limitLabel} MP is ${lim.limit}`, action: 'ack', actorId: a.id });
    }
    // Weapon fire.
    const fire = attacks.filter(r => r.attacker === uuid && r.kind === 'fire');
    if (fire.length) {
      const hits = fire.reduce((t, r) => t + r.hits, 0), shots = fire.reduce((t, r) => t + r.shots, 0);
      const dmg = fire.reduce((t, r) => t + r.damage, 0);
      const targets = [...new Set(fire.map(r => r.targetName).filter(Boolean))];
      unit.lines.push({ k: 'Fired', v: `${hits} of ${shots} hit${dmg ? ` · ${dmg} damage` : ''}${targets.length ? ` to ${targets.join(', ')}` : ''}` });
    }
    for (const r of attacks.filter(x => x.attacker === uuid && x.kind === 'physical')) {
      unit.lines.push({ k: 'Physical', v: r.hits ? `${r.title} hit${r.targetName ? ` ${r.targetName}` : ''}${r.damage ? ` · ${r.damage}` : ''}` : `${r.title} missed` });
    }
    for (const r of attacks.filter(x => x.attacker === uuid && (x.kind === 'antimech' || x.kind === 'swarm'))) {
      unit.lines.push({ k: 'Attack', v: `${r.title} on ${r.targetName}${r.hits ? (r.damage ? ` · ${r.damage}` : ' — hit') : ' — missed'}` });
    }
    // Damage taken: attacks on it, its own charge / DFA damage, falls, skids, ammo explosions.
    const struck = attacks.filter(r => r.target === uuid);
    const self = attacks.filter(r => r.attacker === uuid && r.selfDamage);
    const own = rolls.filter(r => r.unit === uuid && r.damage);
    const took = struck.reduce((t, r) => t + r.damage, 0) + self.reduce((t, r) => t + r.selfDamage, 0) + own.reduce((t, r) => t + r.damage, 0);
    const effects = [...new Set([...struck.flatMap(r => r.effects), ...self.flatMap(r => r.selfEffects), ...own.flatMap(r => r.effects)])].slice(0, 3);
    if (took || effects.length) unit.lines.push({ k: 'Took', v: `${took}${effects.length ? ` · ${effects.join(', ')}` : ''}` });
    // Heat.
    if (a.type === 'mech' || isAero(a)) {
      unit.heat = num(a.system?.heat?.value);
      unit.heatHot = unit.heat >= 14;
      unit.chips.push(...heatChips(a));
      if (!heatResolvedThisTurn(a)) todo.push({ id: `heat-${a.id}`, tag: 'HEAT', text: `${a.name}'s heat hasn't been resolved`, action: 'heat', actorId: a.id });
    }
    if (isInfantry(a)) unit.troopers = a.type === 'battle_armor' ? `${liveTroopers(a)} of ${squadSize(a)} troopers` : `${liveTroopers(a)} troopers`;
    // Conditions.
    const c = a.system?.conditions || {};
    if (c.prone) unit.chips.push({ text: 'PRONE', red: true });
    if (c.shutdown) unit.chips.push({ text: 'SHUT DOWN', red: true });
    if (c.outOfControl) unit.chips.push({ text: 'OUT OF CONTROL', red: true });
    if (c.immobile) unit.chips.push({ text: 'IMMOBILE', red: true });
    if (!isInfantry(a) && pilotUnconscious(a)) unit.chips.push({ text: 'Warrior unconscious', red: true });
    else {
      const hits = num((a.system?.pilot || a.system?.crew || {}).hits);
      if (hits) unit.chips.push({ text: `Pilot ${plural(hits, 'hit')}`, warn: true });
    }
    const swarmers = swarmersOf(a);
    if (swarmers.length) unit.chips.push({ text: `Swarmed by ${swarmers.map(s => s.name).join(', ')}`, warn: true });
    const att = attachment(a);
    if (att) unit.chips.push({ text: `${att.mode === 'swarm' ? 'Swarming' : 'Riding'} ${attachedCarrier(a)?.name || 'a unit'}`, warn: true });
    if (narcPods(a).length) unit.chips.push({ text: 'Narc pod', warn: true });
    // Rolls still owed.
    const psr = pendingPSR(a);
    if (psr?.reasons?.length) {
      const what = isAero(a) ? 'Control Roll' : 'Piloting Skill Roll';
      unit.chips.push({ text: `${what} pending`, red: true });
      todo.push({ id: `roll-${a.id}`, tag: 'ROLL', text: `${a.name} — ${what} (${psr.reasons.map(r => r.label).join(', ')})`, action: 'roll', actorId: a.id });
    }
    return unit;
  });

  // Rolls resolved automatically at the end of the turn (consciousness, out-of-control recovery …).
  for (const r of rolls.filter(x => x.phase === 'End' && x.kind === 'roll')) {
    done.push({ text: `${r.unitName} — ${r.title}: ${r.verdict || (r.ok ? 'passed' : 'failed')}` });
  }

  // Rolls first (they can change the board), then heat, then movement notes.
  const ORDER = { roll: 0, heat: 1, ack: 2 };
  todo.sort((x, y) => ORDER[x.action] - ORDER[y.action]);

  const destroyedNow = new Set(attacks.filter(r => r.destroyed).map(r => r.target));
  const damage = attacks.reduce((t, r) => t + r.damage + r.selfDamage, 0) + rolls.reduce((t, r) => t + r.damage, 0);
  const crits = records.reduce((t, r) => t + num(r.crits), 0);
  return {
    round: num(combat?.round), totals: { damage, crits, destroyed: destroyedNow.size, todo: todo.length },
    todo, done, units: [...units.filter(u => !u.destroyed), ...units.filter(u => u.destroyed)], count: units.length
  };
}

/** The End Phase panel for the combat tracker (GM). */
export function roundSummaryHTML(combat, data = roundSummary(combat)) {
  const stat = (v, k, cls = '') => `<div><span class="v ${cls}">${v}</span><span class="k">${k}</span></div>`;
  const todo = data.todo.map(t => `
    <li class="tw-rs-todo ${t.action === 'roll' ? 'red' : 'amber'}">
      <span class="tag">${esc(t.tag)}</span><span class="t">${esc(t.text)}</span>
      <button type="button" class="tw-rs-act" data-action="${t.action}" data-actor-id="${esc(t.actorId)}" data-id="${esc(t.id)}">${t.action === 'roll' ? 'Roll' : t.action === 'heat' ? 'Resolve' : 'OK'}</button>
    </li>`).join('');
  const done = data.done.map(d => `<li class="tw-rs-todo muted"><span class="tag">DONE</span><span class="t">${esc(d.text)}</span></li>`).join('');
  const units = data.units.map(u => u.destroyed
    ? `<li class="tw-rs-unit destroyed"><span class="nm">${esc(u.name)}</span><span class="by">${esc(u.destroyedBy)}</span><span class="dead">DESTROYED</span></li>`
    : `<li class="tw-rs-unit">
        <div class="hd"><span class="nm">${esc(u.name)}</span>${u.warrior ? `<span class="who">${esc(u.warrior)}</span>` : ''}${u.heat !== null ? `<span class="heat${u.heatHot ? ' hot' : ''}">heat ${u.heat}</span>` : u.troopers ? `<span class="tr">${esc(u.troopers)}</span>` : ''}</div>
        <dl>${u.lines.map(l => `<dt>${esc(l.k)}</dt><dd${l.warn ? ' class="warn"' : ''}>${esc(l.v)}</dd>`).join('')}</dl>
        ${u.chips.length ? `<div class="chips">${u.chips.map(c => `<span class="chip${c.red ? ' red' : c.warn ? ' amber' : ''}">${esc(c.text)}</span>`).join('')}</div>` : ''}
      </li>`).join('');
  return `<section class="tw-round-summary">
    <div class="tw-rs-box">
      <div class="tw-rs-title"><span>Round ${data.round} summary</span><span class="n">${plural(data.count, 'unit')}</span></div>
      <div class="tw-rs-tally">${stat(data.totals.damage, 'damage')}${stat(data.totals.crits, 'crits')}${stat(data.totals.destroyed, 'destroyed', data.totals.destroyed ? 'red' : '')}${stat(data.totals.todo, 'to do', data.totals.todo ? 'amber' : '')}</div>
      ${todo || done ? `<div class="tw-rs-sec">Before the next round</div><ul class="tw-rs-list">${todo}${done}</ul>` : '<div class="tw-rs-clear">Nothing outstanding — ready for the next round.</div>'}
    </div>
    <div class="tw-rs-sec">Units this round</div>
    <ul class="tw-rs-units">${units}</ul>
    <p class="tw-rs-note">Starting round ${data.round + 1} clears everyone's initiative and returns to the Initiative Phase.</p>
  </section>`;
}
