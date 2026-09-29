/**
 * Condensed combat chat cards: turns the detailed results of attacks, rolls
 * and damage into an outcome-first summary — a tally, alerts for anything that
 * changes the fight, damage by location on each unit hit, and one line per
 * weapon or roll — while the full breakdown stays in collapsible details.
 *
 * Pure functions (no Foundry calls) so they run in tests. Damage fragments
 * from resolveDamageAgainst carry `locChanges` (before / after per location).
 */

import { currentTurnKey } from "./tw-turn.mjs";

const num = (v) => Number(v) || 0;
const foundry_clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ */
/*  Location changes (built by the damage code)                         */
/* ------------------------------------------------------------------ */

const MECH_CODES = { head: 'HD', ct: 'CT', lt: 'LT', rt: 'RT', la: 'LA', ra: 'RA', ll: 'LL', rl: 'RL' };
const BODY_ORDER = ['HD', 'CT', 'LT', 'RT', 'LA', 'RA', 'LL', 'RL'];
const MECH_REAR = { ct: 'ctRear', lt: 'ltRear', rt: 'rtRear' };
const LABEL_CODE = {
  'Head': 'HD', 'Center Torso': 'CT', 'Left Torso': 'LT', 'Right Torso': 'RT',
  'Left Arm': 'LA', 'Right Arm': 'RA', 'Left Leg': 'LL', 'Right Leg': 'RL'
};

/** 'Mech locations whose armor (front / rear) or internal structure changed. */
export function mechLocChanges(armorBefore, structureBefore, after) {
  const out = [];
  for (const [k, code] of Object.entries(MECH_CODES)) {
    const armor = [num(armorBefore?.[k]?.value), num(after.armor?.[k]?.value)];
    const rk = MECH_REAR[k];
    const rear = rk ? [num(armorBefore?.[rk]?.value), num(after.armor?.[rk]?.value)] : null;
    const is = [num(structureBefore?.[k]?.value), num(after.structure?.[k]?.value)];
    if (armor[0] === armor[1] && (!rear || rear[0] === rear[1]) && is[0] === is[1]) continue;
    out.push({ code, armor, rear: rear && rear[0] !== rear[1] ? rear : null, is, destroyed: is[0] > 0 && is[1] <= 0 });
  }
  return out;
}

/** Facing armor changes (vehicles / aerospace). */
export function facingChanges(before, after, labels = {}) {
  return Object.keys(after || {})
    .filter(k => num(before?.[k]?.value) !== num(after?.[k]?.value))
    .map(k => ({ code: labels[k] || k, armor: [num(before?.[k]?.value), num(after?.[k]?.value)] }));
}

/** A single structure pool (vehicle structure, aerospace SI). */
export function poolChange(code, before, after) {
  return num(before) === num(after) ? [] : [{ code, pool: [num(before), num(after)], destroyed: num(before) > 0 && num(after) <= 0 }];
}

/** Merge location changes from several attacks: first "before", last "after". */
export function mergeLocChanges(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const c of list || []) {
      const cur = map.get(c.code);
      if (!cur) { map.set(c.code, foundry_clone(c)); continue; }
      for (const f of ['armor', 'rear', 'is', 'pool', 'count']) {
        if (!c[f]) continue;
        cur[f] = cur[f] ? [cur[f][0], c[f][1]] : [...c[f]];
      }
      cur.destroyed = cur.destroyed || c.destroyed;
      cur.soldier = cur.soldier || c.soldier;
    }
  }
  return [...map.values()];
}

/**
 * Damage-by-location rows: { code, damage, hurt, plain } sorted by damage.
 * `hurt` holds the serious part (armor gone, internal damage, destroyed).
 */
export function locationRows(changes) {
  const rows = changes.map(c => {
    const lost = (p) => (p ? Math.max(0, p[0] - p[1]) : 0);
    const hurt = [], plain = [];
    let damage = lost(c.armor) + lost(c.rear) + lost(c.is) + lost(c.pool);
    if (c.count) {
      damage = lost(c.count);
      (c.destroyed ? hurt : plain).push(c.destroyed ? 'platoon eliminated' : `${c.count[0]} → ${c.count[1]}`);
    } else if (c.code.startsWith('#')) {
      if (c.destroyed) hurt.push('KILLED');
      else plain.push(`armor ${c.armor[0]} → ${c.armor[1]}`);
    } else if (c.pool) {
      (c.destroyed ? hurt : plain).push(c.destroyed ? `${c.pool[0]} → 0 · DESTROYED` : `${c.pool[0]} → ${c.pool[1]}`);
    } else {
      if (c.armor && c.armor[0] !== c.armor[1]) (c.armor[1] <= 0 ? hurt : plain).push(c.armor[1] <= 0 ? 'armor gone' : `armor ${c.armor[0]} → ${c.armor[1]}`);
      if (c.rear) (c.rear[1] <= 0 ? hurt : plain).push(c.rear[1] <= 0 ? 'rear armor gone' : `rear ${c.rear[0]} → ${c.rear[1]}`);
      if (c.destroyed) hurt.push('DESTROYED');
      else if (lost(c.is)) { hurt.push(`${lost(c.is)} internal`); plain.push(`${c.is[1]} IS left`); }
    }
    return { code: c.code, damage, hurt: hurt.join(', '), plain: plain.join(' · '), destroyed: !!c.destroyed };
  });
  const at = (code) => { const i = BODY_ORDER.indexOf(code.replace(/\(R\)$/, '')); return i < 0 ? BODY_ORDER.length : i; };
  return rows.sort((a, b) => b.damage - a.damage || at(a.code) - at(b.code));
}

/* ------------------------------------------------------------------ */
/*  Alerts                                                              */
/* ------------------------------------------------------------------ */

const alert = (tag, text, red = false) => ({ tag, text, red });

/** Alerts from one damage fragment (resolveDamageAgainst result). */
export function fragAlerts(frag, unitName = frag?.targetName || '') {
  const out = [];
  if (!frag) return out;
  for (const c of frag.critChecks || []) {
    if (/blown off/i.test(c.text)) out.push(alert('CRIT', `${c.locLabel}: ${c.text}`, true));
    for (const s of c.slots || []) {
      if (/no critical|already destroyed/i.test(s.text)) continue;
      out.push(alert('CRIT', `${c.locLabel}: ${s.text}`, /DESTROYED|explodes|KILLED/.test(s.text)));
    }
  }
  for (const g of frag.groups || []) {
    for (const e of g.events || []) if (/ destroyed$/.test(e)) out.push(alert('DESTROYED', e, true));
  }
  for (const l of frag.explosionLines || []) out.push(alert(/EXPLOSION/.test(l) ? 'AMMO' : 'DAMAGE', l, true));
  for (const m of frag.motives || []) if (!/no effect/i.test(m.text)) out.push(alert('MOTIVE', m.text));
  if (frag.vehicle || frag.aero) {
    for (const c of frag.critResults || []) {
      const text = frag.aero ? c.system : c.effect;
      if (!text || /no critical/i.test(text)) continue;
      out.push(alert('CRIT', `${c.facingLabel}: ${text}${c.note ? ` (${c.note})` : ''}`, /destroy|killed|explo/i.test(text)));
    }
  }
  for (const w of frag.warriorLines || []) out.push(alert('PILOT', w, true));
  if (frag.pilotNote) out.push(alert('PILOT', frag.pilotNote, true));
  for (const l of frag.infantryLines || []) if (/— hit|KILLED|killed|survives|destroyed|drops off/.test(l)) out.push(alert('INFANTRY', l));
  if (frag.ba) for (const g of frag.groups || []) if (g.killed) out.push(alert('KILLED', `${unitName} trooper #${g.trooper} killed`, true));
  if (frag.destroyedByCrit || frag.destroyed || (frag.groups || []).some(g => g.destroyed === true && frag.isMech)) {
    out.push(alert('DESTROYED', frag.platoon ? `${unitName} eliminated` : `${unitName} destroyed`, true));
  }
  if (frag.hasTarget && frag.applied === false) out.push(alert('APPLY', `Changes to ${unitName} couldn't be saved (no GM online) — the GM can use Apply damage.`, true));
  return out;
}

/** Alerts for several fragments against one unit, with Piloting / Control Rolls merged into one line. */
export function unitAlerts(frags, unitName) {
  const out = [], seen = new Set();
  const psr = new Set(), control = new Set();
  for (const f of frags) {
    for (const a of fragAlerts(f, unitName)) {
      const key = `${a.tag}|${a.text}`;
      if (a.tag === 'DESTROYED' && seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    for (const r of f?.psrReasons || []) (f.controlRoll ? control : psr).add(r);
  }
  if (psr.size) out.push(alert('PSR', `${unitName} must roll Piloting (${[...psr].join(', ')})`, true));
  if (control.size) out.push(alert('CONTROL', `${unitName} must make a Control Roll (${[...control].join(', ')})`, true));
  // Crits before everything else, then destruction, pilot, rolls.
  const order = ['DESTROYED', 'AMMO', 'CRIT', 'KILLED', 'PILOT', 'DAMAGE', 'MOTIVE', 'INFANTRY', 'PSR', 'CONTROL', 'APPLY'];
  return out.sort((a, b) => order.indexOf(a.tag) - order.indexOf(b.tag));
}

/** Damage summary for one unit: { name, rows, alerts, total }. */
export function unitOutcome(frags, unitName) {
  const list = frags.filter(Boolean);
  const rows = locationRows(mergeLocChanges(list.map(f => f.locChanges)));
  return { name: unitName, rows, alerts: unitAlerts(list, unitName), total: rows.reduce((t, r) => t + r.damage, 0) };
}

/* ------------------------------------------------------------------ */
/*  One line per weapon                                                 */
/* ------------------------------------------------------------------ */

/** Short code for where a damage group landed. */
function groupWhere(g, frag) {
  if (frag.ba) return g.trooper ? `#${g.trooper}` : '—';
  if (frag.isMech) {
    const base = String(g.locLabel || '').replace(/\s+—.*$/, '');
    const rear = /\(rear\)/.test(base);
    const code = LABEL_CODE[base.replace(/\s*\(rear\)/, '')] || base;
    return `${code}${rear ? '(R)' : ''}`;
  }
  return String(g.facingLabel || '').replace(/\s+—.*$/, '') || '—';
}

/** "RT 5, LA 5, RL 2" — or "LT, CT, RT, RA" when every group is the same size. */
function whereList(frag) {
  const groups = (frag?.groups || []).filter(g => num(g.damage) > 0);
  if (!groups.length) return '';
  const sums = new Map();
  for (const g of groups) { const w = groupWhere(g, frag); sums.set(w, (sums.get(w) || 0) + num(g.damage)); }
  // One location, or equal groups each on its own location: the codes say it all.
  const bare = sums.size === 1 || (groups.every(g => g.damage === groups[0].damage) && sums.size === groups.length);
  return [...sums.entries()].map(([w, d]) => (bare ? w : `${w} ${d}`)).join(', ');
}

/**
 * The collapsed line for one shot (a tw attack context): hit / miss mark,
 * name, location, "7+ · 8" and an outcome HTML string.
 */
export function shotLine(ctx) {
  const hr = ctx.hitResult;
  const line = {
    ok: !!ctx.hit, name: ctx.weaponName, at: ctx.location || '',
    roll: ctx.automatic ? 'auto' : ctx.outOfRange ? 'OOR' : `${ctx.tn}+ · <b>${esc(ctx.rollTotal)}</b>`
  };
  if (ctx.fireMode) line.at = [line.at, ctx.fireMode].filter(Boolean).join(' · ');
  if (ctx.outOfRange) line.out = 'out of range';
  else if (ctx.jammed) line.out = '<b>JAMMED</b>';
  else if (!ctx.hit) line.out = `missed by ${esc(ctx.margin)}`;
  else if (!hr) line.out = ctx.damage ? `<b>${esc(ctx.damage)}</b> damage` : 'hit';
  else if (hr.special) line.out = hr.special === 'heat' ? `<b>+${esc(hr.heat)}</b> heat` : hr.special === 'narc' ? 'Narc pod attached' : 'target designated';
  else {
    const parts = [];
    const ci = hr.clusterInfo;
    if (ci) parts.push(ci.streak ? `all ${ci.size} ${ci.noun || 'missiles'}` : `${ci.missiles} of ${ci.size} ${ci.noun || 'missiles'}`);
    if (hr.baFire) parts.push(esc(hr.baFire.kind === 'platoon' ? `${hr.baFire.hits} of ${hr.baFire.troopers} troopers hit` : hr.baFire.kind === 'missile' ? `${hr.baFire.hits} of ${hr.baFire.missiles} missiles` : `${hr.baFire.hits} of ${hr.baFire.troopers} troopers hit`));
    if (hr.platoon) parts.push(`<b>${esc(hr.killed)}</b> trooper${hr.killed === 1 ? '' : 's'} eliminated`);
    else {
      const where = whereList(hr);
      const total = (hr.groups || []).reduce((t, g) => t + num(g.damage), 0) || num(hr.total);
      parts.push(`<b>${esc(total)}</b>${where ? ` → ${esc(where)}` : ''}`);
    }
    const crit = (hr.critChecks || []).some(c => (c.slots || []).some(s => !/no critical|already destroyed/i.test(s.text)) || /blown off/i.test(c.text))
      || (hr.critResults || []).some(c => (hr.aero ? c.system : c.effect) && !/no critical/i.test(hr.aero ? c.system : c.effect));
    if (crit) parts.push('crit');
    if (hr.destroyedByCrit || hr.destroyed) parts.push('<b>destroyed</b>');
    line.out = parts.join(' · ');
  }
  return line;
}

/* ------------------------------------------------------------------ */
/*  Cards                                                               */
/* ------------------------------------------------------------------ */

/** "Round 3 · Weapon Attack" while a combat is running, else ''. */
export function roundLabel(combat = globalThis.game?.combat) {
  if (!combat?.started) return '';
  return [`Round ${combat.round}`, combat.phaseName].filter(Boolean).join(' · ');
}

/** "Ammo: LRM 20 11 · SRM 6 14" for the shots that spent ammunition. */
export function ammoFooter(shots) {
  const left = shots.filter(s => s.ammoLeft != null).map(s => `${s.weaponName} ${s.ammoLeft}`);
  return left.length ? `Ammo: ${left.join(' · ')}` : '';
}

const sumMods = (mods) => (mods || []).reduce((t, m) => t + num(m.value), 0);

/**
 * Context for tw-volley.hbs: one attack declaration (a weapons volley, or a
 * single physical / anti-'Mech attack) against one target.
 * @param {object} o
 *   title, icon, attackerName, targetName, ctxLine (range / arc), round,
 *   baseMods (shared to-hit modifiers), shots (attack contexts), heat (or null),
 *   notes (instructions), selfFrags + selfName (damage the attacker took),
 *   footer (e.g. ammo left)
 */
export function volleyCard(o) {
  const shots = o.shots || [];
  const fired = shots.filter(s => !s.outOfRange);
  const hitFrags = shots.map(s => s.hitResult).filter(h => h?.hasTarget);
  const target = hitFrags.length ? unitOutcome(hitFrags, o.targetName) : null;
  // Damage dealt by the hits (troopers eliminated against a conventional platoon).
  const platoon = hitFrags.some(h => h.platoon);
  const damage = shots.filter(s => s.hit).reduce((t, s) => {
    const h = s.hitResult;
    if (!h) return t + num(s.damage);
    if (h.platoon) return t + num(h.killed);
    return t + ((h.groups || []).reduce((a, g) => a + num(g.damage), 0) || num(h.total));
  }, 0);
  const self = o.selfFrags?.length ? unitOutcome(o.selfFrags, o.selfName) : null;
  // Weapon events on either side: jams, the target's AMS, Narc / TAG / flamer heat.
  const shotAlerts = [];
  for (const s of shots) {
    if (s.jammed) shotAlerts.push(alert('JAM', `${o.attackerName}'s ${s.weaponName} jammed`, true));
    for (const n of s.notes || []) if (/ engages: /.test(n)) shotAlerts.push(alert('AMS', n));
    const sp = s.hitResult?.special;
    if (sp) shotAlerts.push(alert(sp === 'heat' ? 'HEAT' : sp.toUpperCase(), s.hitResult.note));
  }
  return {
    title: o.title || 'Weapons Fire', icon: o.icon || 'fa-crosshairs', round: o.round || '',
    attackerName: o.attackerName, targetName: o.targetName || '', ctxLine: o.ctxLine || '',
    baseTN: o.baseMods?.length ? sumMods(o.baseMods) : null, baseMods: o.baseMods || [],
    tally: {
      hits: shots.filter(s => s.hit).length, shots: shots.length,
      damage, damageLabel: platoon ? 'troopers lost' : 'damage',
      heat: o.heat ?? null, hasHeat: o.heat != null, many: shots.length > 1
    },
    alerts: [...(target?.alerts || []), ...shotAlerts, ...(o.alerts || [])],
    rows: target?.rows || [],
    lines: shots.map(s => ({ ...shotLine(s), ctx: s })),
    notes: o.notes || [], footer: o.footer || '',
    self, single: shots.length === 1
  };
}

/** A collapsible roll line: { ok, name, roll (HTML), out (HTML), r }. */
export function rollLine(r, { pass = 'pass', fail = null } = {}) {
  return {
    ok: !!r.success, name: r.label,
    roll: r.auto ? 'auto' : `${esc(r.tn)}+ · <b>${esc(r.total)}</b>`,
    out: r.auto ? esc(r.auto) : r.success ? esc(pass) : esc(fail ?? `failed by ${num(r.tn) - num(r.total)}`),
    r
  };
}

/** Damage outcomes grouped by the unit that took them. */
function outcomesByUnit(frags, fallback) {
  const byName = new Map();
  for (const f of frags) {
    const n = f.targetName || fallback;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(f);
  }
  return [...byName.entries()].map(([n, list]) => unitOutcome(list, n));
}

/**
 * Context for tw-psr.hbs: a roll card (Piloting / Driving / Control rolls,
 * falls, skids, crashes, consciousness, building checks …).
 * @param {object} ctx  title, results [{label, tn, mods, total, dice, success, auto}],
 *   fall, skidFrag, frags, notes, stays / stood / woke …
 */
export function rollCard(ctx, unitName = '') {
  const results = ctx.results || [];
  const all = [ctx.fall?.frag, ctx.skidFrag, ...(ctx.frags || [])].filter(Boolean);
  const units = outcomesByUnit(all.filter(f => f.hasTarget || f.locChanges), unitName);
  const alerts = units.flatMap(u => u.alerts);
  if (ctx.fall) {
    alerts.unshift(alert('FALL', `Falls${ctx.fall.levels ? ` ${ctx.fall.levels} level${ctx.fall.levels === 1 ? '' : 's'}` : ''}: ${ctx.fall.damage} damage on the ${ctx.fall.location} column — now prone (${ctx.fall.facing})`, true));
    for (const w of ctx.fall.warriorLines || []) alerts.push(alert('PILOT', w, true));
    for (const l of ctx.fall.infantryLines || []) alerts.push(alert('INFANTRY', l));
  }
  const passed = results.filter(r => r.success).length;
  let verdict = null;
  if (results.length === 1) verdict = { ok: !!results[0].success, text: results[0].success ? 'PASSED' : 'FAILED', roll: rollLine(results[0]).roll };
  else if (results.length > 1) verdict = { ok: passed === results.length, text: `${passed} / ${results.length}`, roll: 'passed' };
  const lines = results.map(r => rollLine(r));
  if (ctx.fall?.warrior) lines.push(rollLine({ ...ctx.fall.warrior, label: 'Avoid warrior damage' }, { pass: 'no injury', fail: 'injured' }));
  const damage = units.reduce((t, u) => t + u.total, 0);
  return {
    ...ctx, unitName, verdict, lines, alerts, units,
    damage, hasDamage: damage > 0, hasFrags: all.length > 0 || !!ctx.fall, hasTally: !!verdict || damage > 0
  };
}

/** An avoid roll (shutdown, ammunition …) as a roll line. */
function avoidLine(name, check, failText) {
  const failed = check.shutsDown ?? check.explodes;
  return rollLine({ label: name, tn: check.avoid, total: check.total, dice: check.dice || [], mods: [], success: !failed }, { pass: 'avoided', fail: failText });
}

/**
 * Context for tw-heat.hbs: the heat phase for one unit, outcome first.
 * @param {object} ctx  lines (heat sources, first = start of turn), newHeat, effects,
 *   aero, autoShutdown, shutdownCheck, startupCheck, restarts, ammoCheck, ammoFrag,
 *   psrNote, pilotDamage, warriorLines, notes (aerospace roll results)
 */
export function heatCard(ctx, unitName = '') {
  const start = num(ctx.lines?.[0]?.value);
  const change = num(ctx.newHeat) - start;
  const out = [];
  if (ctx.autoShutdown) out.push(alert('SHUTDOWN', `${unitName} shuts down automatically (heat 30+)`, true));
  else if (ctx.shutdownCheck?.shutsDown) out.push(alert('SHUTDOWN', `${unitName}'s reactor shuts down`, true));
  if (ctx.startupCheck) {
    out.push(ctx.restarts ? alert('RESTART', `${unitName} is back online (${ctx.startupCheck.text})`)
      : alert('SHUTDOWN', `${unitName} stays shut down (${ctx.startupCheck.text})`, true));
  }
  if (ctx.ammoCheck?.explodes) out.push(alert('AMMO', 'Heat sets off an ammunition bin', true));
  const outcome = ctx.ammoFrag ? unitOutcome([ctx.ammoFrag], unitName) : null;
  out.push(...(outcome?.alerts || []));
  for (const w of ctx.warriorLines || []) out.push(alert('PILOT', w, true));
  if (ctx.pilotDamage) out.push(alert('PILOT', `Life support: ${ctx.pilotDamage}`, true));
  if (ctx.psrNote) out.push(alert('PSR', ctx.psrNote, true));
  // Aerospace notes: failed / notable results stay visible, avoided rolls fold away.
  const quiet = (ctx.notes || []).filter(n => /avoided\.?$/.test(n));
  const notes = (ctx.notes || []).filter(n => !quiet.includes(n));
  if (ctx.ammoCheck?.none) quiet.push('Ammunition explosion check: no loaded bins linked to weapons.');
  const rollLines = [];
  if (ctx.shutdownCheck) rollLines.push(avoidLine('Shutdown avoid', ctx.shutdownCheck, 'shuts down'));
  if (ctx.ammoCheck && !ctx.ammoCheck.none) rollLines.push(avoidLine('Ammunition explosion avoid', ctx.ammoCheck, 'explodes'));
  return {
    ...ctx, unitName, start, change: `${change >= 0 ? '+' : '−'}${Math.abs(change)}`,
    alerts: out, notes, quiet, rows: outcome?.rows || [], rollLines
  };
}

/* ------------------------------------------------------------------ */
/*  Round-summary records (stored on each card's chat message)          */
/* ------------------------------------------------------------------ */

const NOTABLE = ['DESTROYED', 'AMMO', 'CRIT', 'KILLED', 'PILOT', 'MOTIVE'];

/** Up to four short effects for a unit: notable alerts, then serious location damage. */
function effectsOf(alerts = [], rows = []) {
  const out = alerts.filter(a => NOTABLE.includes(a.tag)).map(a => a.text.replace(/^[^:]+: /, ''));
  for (const r of rows) if (r.hurt) out.push(`${r.code} ${r.hurt}`);
  return [...new Set(out)].slice(0, 4);
}

/**
 * The round-summary record for an attack card (volleyCard output).
 * @param {object} card   volleyCard(...) result
 * @param {object} o      { turn, phase, kind: 'fire'|'physical'|'antimech'|'swarm', attacker, target } (actors)
 */
export function volleySummary(card, o) {
  const crits = card.alerts.filter(a => a.tag === 'CRIT').length;
  return {
    turn: o.turn, phase: o.phase || '', kind: o.kind, title: card.title,
    attacker: o.attacker?.uuid || '', attackerName: card.attackerName,
    target: o.target?.uuid || '', targetName: card.targetName,
    hits: card.tally.hits, shots: card.tally.shots, damage: card.tally.damage, crits,
    destroyed: card.alerts.some(a => a.tag === 'DESTROYED' && /destroyed$|eliminated$/.test(a.text) && a.text.startsWith(card.targetName)),
    effects: effectsOf(card.alerts, card.rows),
    selfDamage: card.self?.total || 0, selfEffects: card.self ? effectsOf(card.self.alerts, card.self.rows) : []
  };
}

/** The round-summary record for a roll card (rollCard output) or a heat card (heatCard output). */
export function rollSummary(card, o) {
  const heat = o.kind === 'heat';
  return {
    turn: o.turn, phase: o.phase || '', kind: o.kind || 'roll', title: heat ? 'Heat' : card.title,
    unit: o.actor?.uuid || '', unitName: o.actor?.name || card.unitName || '',
    ok: heat ? !card.alerts?.some(a => a.red) : !!card.verdict?.ok, verdict: heat ? `heat ${card.newHeat}` : card.verdict?.text || '',
    damage: heat ? (card.rows || []).reduce((t, r) => t + r.damage, 0) : num(card.damage),
    crits: (card.alerts || []).filter(a => a.tag === 'CRIT').length,
    effects: effectsOf(card.alerts, card.rows),
    fell: !heat && !!card.fall
  };
}

/** The chat-message flags for a card: the relay's recording plus the round-summary record. */
export function withSummary(recorded, summary) {
  return summary?.turn ? { ...recorded, summary } : recorded;
}

/** This turn's key and phase name for a summary record (no turn outside a running combat). */
export function summaryContext() {
  return { turn: currentTurnKey(), phase: globalThis.game?.combat?.phaseName || '' };
}
