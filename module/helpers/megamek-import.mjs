/**
 * Record-sheet importer: reads MegaMek unit files — `.mtf` ('Mechs) and `.blk`
 * (combat vehicles and VTOLs, aerospace fighters, small craft, battle armor,
 * conventional infantry) — into this system's unit actor data.
 *
 * Pure parsing (no Foundry document calls), so it runs under plain Node for
 * tests: `parseUnitFile(text, fileName)` → { type, name, system, warnings }.
 * Weapon statistics come from the generated catalog in data/tw-equipment.mjs.
 * Values the files don't carry are derived at import time: 'Mech internal
 * structure from the Internal Structure Table, vehicle structure (⌈t/10⌉),
 * fighter Structural Integrity (the higher of ⌊t/10⌋ and Safe Thrust) and
 * armor thresholds (⌈armor/10⌉).
 */
import { AMMO_ROWS, WEAPON_ROWS } from "../data/tw-equipment.mjs";
import { CI_WEAPONS, genericPlatoon } from "./tw-infantry.mjs";
import { guidable } from "./tw-weapons.mjs";
import { gearFromNames } from "./tw-gear.mjs";

const num = (v) => Number(v) || 0;
const rid = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 18);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s\-_]+/g, '');

/* ------------------------------------------------------------------ */
/*  Equipment catalog                                                   */
/* ------------------------------------------------------------------ */

let CATALOG = null;

function catalog() {
  if (CATALOG) return CATALOG;
  const weapons = new Map(), ammo = new Map();
  const add = (map, key, obj) => { const k = norm(key); if (!map.has(k)) map.set(k, []); map.get(k).push(obj); };
  for (const [name, keys, heat, damage, cluster, min, s, m, l, e, family, inf, flags, slots, aeroRange, toHit] of WEAPON_ROWS) {
    const w = { name, heat, damage, cluster, min, s, m, l, e, family, inf, slots: slots || 1, aeroRange, toHit: toHit || 0,
      streak: flags.includes('st'), ba: flags.includes('ba'), oneShot: flags.includes('os'), clan: flags.includes('cl') };
    for (const k of keys.split('|')) add(weapons, k, w);
  }
  for (const [name, shortName, keys, shots, rack, family, clan] of AMMO_ROWS) {
    const a = { name, shortName, shots, rack, family, clan: !!clan };
    for (const k of keys.split('|')) add(ammo, k, a);
  }
  CATALOG = { weapons, ammo };
  return CATALOG;
}

/** Best catalog match: same battle-armor-ness first, then the unit's tech base. */
function pick(list, { clan = false, ba = false } = {}) {
  if (!list?.length) return null;
  const score = (x) => (x.ba === ba ? 2 : 0) + (x.clan === clan ? 1 : 0);
  return [...list].sort((a, b) => score(b) - score(a))[0];
}

/** Look up a weapon by any MegaMek name (display, internal or lookup). */
export function findWeapon(name, opts = {}) {
  return pick(catalog().weapons.get(norm(name)), opts);
}

/**
 * A weapon's own to-hit modifier (pulse lasers −2, Clan ER pulse −1, heavy
 * lasers +1 …) from the catalog, by the weapon's name; 0 when unknown.
 */
export function catalogToHit(name, opts = {}) {
  const raw = String(name ?? '').trim();
  const hit = findWeapon(raw, opts) ?? findWeapon(cleanEquipmentName(raw).name, opts)
    ?? findWeapon(raw.replace(/^(IS|Clan|CL)\s+/i, ''), opts);
  return hit?.toHit || 0;
}

/** Look up ammunition; munition variants ("… Artemis-capable", "… (Clan) Swarm") fall back to the base bin. */
export function findAmmo(name, opts = {}) {
  const words = String(name ?? '').trim().split(/\s+/);
  for (let n = words.length; n >= 1; n--) {
    const hit = pick(catalog().ammo.get(norm(words.slice(0, n).join(' '))), opts);
    if (hit) return hit;
  }
  // Munition variants named in one word ("ISArrowIVHomingAmmo") → the standard bin.
  const base = String(name ?? '').replace(/(Homing|Cluster|Illumination|Smoke|Inferno|Swarm\w*|Thunder\w*|Fragmentation|Precision|ArmorPiercing|Flechette|Tracer|Incendiary|DeadFire|Tandem\w*|Artemis\w*|Narc\w*|Semiguided|ADA|Laser\w*)(?=\s*Ammo)/i, '');
  return base !== name ? findAmmo(base, opts) : null;
}

/** Strip MegaMek mounting suffixes: (R) rear, (T) turret, (OMNIPOD), (ARMORED), … */
export function cleanEquipmentName(raw) {
  let name = String(raw ?? '').trim();
  const out = { rear: false, turret: false, omnipod: false, armored: false };
  const pre = name.match(/^\((R|T)\)\s*/i);
  if (pre) { out[pre[1].toUpperCase() === 'R' ? 'rear' : 'turret'] = true; name = name.slice(pre[0].length); }
  for (let guard = 0; guard < 6; guard++) {
    const m = name.match(/\s*\((R|T|OMNIPOD|ARMORED|FL|FR|RL|RR|ST|SPONSON|RS|LS)\)\s*$/i);
    if (!m) break;
    const tag = m[1].toUpperCase();
    if (tag === 'R') out.rear = true;
    if (tag === 'T') out.turret = true;
    if (tag === 'OMNIPOD') out.omnipod = true;
    if (tag === 'ARMORED') out.armored = true;
    name = name.slice(0, m.index).trim();
  }
  return { name, ...out };
}

/** Our weapon entry from a catalog weapon. */
function weaponEntry(w, location, extra = {}) {
  const entry = {
    id: rid(), name: w.name, location, heat: w.heat, damage: w.damage ?? 0,
    clusterSize: w.cluster || 0, rangeMin: w.min, rangeS: w.s, rangeM: w.m, rangeL: w.l,
    ammoType: '', ammo: 0, shotsPerTon: 0, ...extra
  };
  if (w.streak) entry.streak = true;
  if (w.oneShot) entry.oneShot = true;
  if (w.aeroRange) entry.aeroRange = w.aeroRange;
  if (w.toHit) entry.toHit = w.toHit;
  if (w.inf?.startsWith('burst:')) { entry.infClass = 'burst'; entry.burst = w.inf.slice(6); }
  else if (w.inf && w.inf !== 'direct') entry.infClass = w.inf;
  return entry;
}

/** Ammo label for the Logistics roll-up: "LRM 20 Ammo [Half]" → "LRM 20". */
const ammoLabel = (a) => a.name.replace(/\s*\[[^\]]*\]\s*$/, '').replace(/\s+Ammo\b.*$/i, '').trim() || a.shortName || a.family;

/**
 * Hand ammunition bins to the weapons that fire them (same family, and rack
 * size / damage where known): shots are pooled per weapon type and split evenly
 * between the weapons sharing them. Returns the weapon id each bin feeds.
 */
function assignAmmo(weapons, bins, catalogOf, warnings) {
  const feeds = new Map();
  const groups = new Map();
  for (const bin of bins) {
    const a = bin.ammo;
    const users = weapons.filter(w => {
      const cw = catalogOf.get(w.id);
      if (!cw || cw.family !== a.family) return false;
      const size = cw.cluster || cw.damage;
      return !a.rack || !size || a.rack === size;
    });
    const fallback = users.length ? users : weapons.filter(w => catalogOf.get(w.id)?.family === a.family);
    if (!fallback.length) { warnings.push(`Ammunition "${bin.raw}" doesn't match any weapon.`); continue; }
    // LB-X cluster rounds are counted apart from slugs; Narc-capable missiles mark the launcher.
    const cluster = a.family === 'AC_LBX' && /cluster/i.test(bin.raw);
    if (/narc/i.test(bin.raw) && ['LRM', 'SRM', 'MML', 'LRM_IMP', 'SRM_IMP'].includes(a.family)) {
      for (const w of fallback) if (!w.guidance) w.guidance = 'narc';
    }
    const key = fallback.map(w => w.id).join('+') + (cluster ? ':cluster' : '');
    if (!groups.has(key)) groups.set(key, { users: fallback, shots: 0, perTon: 0, label: ammoLabel(a), cluster });
    const g = groups.get(key);
    g.shots += bin.shots ?? a.shots;
    g.perTon = Math.max(g.perTon, a.name.includes('[Half]') ? a.shots * 2 : a.shots);
    feeds.set(bin, fallback[0].id);
  }
  for (const g of groups.values()) {
    const each = Math.floor(g.shots / g.users.length);
    g.users.forEach((w, i) => {
      const n = each + (i < g.shots % g.users.length ? 1 : 0);
      if (g.cluster) { w.clusterAmmo = n; if (!w.ammoType) { w.ammoType = g.label.replace(/\s*cluster/i, ''); w.ammo = 0; } return; }
      w.ammo = n;
      w.shotsPerTon = g.perTon;
      w.ammoType = g.label;
    });
  }
  for (const w of weapons) {
    const cw = catalogOf.get(w.id);
    if (cw?.family && !['NA', 'AMS'].includes(cw.family) && !w.ammoType && !cw.oneShot) {
      w.ammoType = cw.name;
      warnings.push(`${w.name} (${w.location}) has no ammunition in the file.`);
    }
  }
  return feeds;
}

/** Artemis IV / V fire-control units named in a location, in order. */
function artemisOf(names) {
  const out = [];
  let v5 = 0;
  for (const n of names) {
    if (/artemis\s*-?\s*iv/i.test(n)) out.push('artemis4');
    else if (/artemis\s*-?\s*v\b|artemisv/i.test(n)) { if (v5++ % 2 === 0) out.push('artemis5'); } // 2 slots each
  }
  return out;
}

/** Link each location's Artemis units to its LRM / SRM / MML launchers, in order. */
function linkArtemis(weapons, byLocation) {
  for (const [loc, list] of Object.entries(byLocation)) {
    const launchers = weapons.filter(w => w.location === loc && guidable(w));
    list.forEach((g, i) => { if (launchers[i]) launchers[i].guidance = g; });
  }
}

/* ------------------------------------------------------------------ */
/*  'Mech (.mtf)                                                        */
/* ------------------------------------------------------------------ */

/** Internal Structure Table: tonnage → [head, CT, side torso, arm, leg]. */
const IS_TABLE = {
  10: [3, 4, 3, 1, 2], 15: [3, 5, 4, 2, 3], 20: [3, 6, 5, 3, 4], 25: [3, 8, 6, 4, 6], 30: [3, 10, 7, 5, 7],
  35: [3, 11, 8, 6, 8], 40: [3, 12, 10, 6, 10], 45: [3, 14, 11, 7, 11], 50: [3, 16, 12, 8, 12], 55: [3, 18, 13, 9, 13],
  60: [3, 20, 14, 10, 14], 65: [3, 21, 15, 10, 15], 70: [3, 22, 15, 11, 15], 75: [3, 23, 16, 12, 16], 80: [3, 25, 17, 13, 17],
  85: [3, 27, 18, 14, 18], 90: [3, 29, 19, 15, 19], 95: [3, 30, 20, 16, 20], 100: [3, 31, 21, 17, 21],
  105: [4, 32, 22, 17, 22], 110: [4, 33, 23, 18, 23], 115: [4, 35, 24, 19, 24], 120: [4, 36, 25, 20, 25],
  125: [4, 38, 26, 21, 26], 130: [4, 39, 27, 21, 27], 135: [4, 41, 28, 22, 28], 140: [4, 42, 29, 23, 29]
};

export function mechInternalStructure(tons) {
  const t = Math.min(140, Math.max(10, Math.round(num(tons) / 5) * 5));
  const [head, ct, side, arm, leg] = IS_TABLE[t];
  return { head, ct, lt: side, rt: side, la: arm, ra: arm, ll: leg, rl: leg };
}

export function mechWeightClass(tons) {
  const t = num(tons);
  return t >= 80 ? 'Assault' : t >= 60 ? 'Heavy' : t >= 40 ? 'Medium' : 'Light';
}

const MTF_LOCATIONS = {
  'left arm': 'la', 'right arm': 'ra', 'left torso': 'lt', 'right torso': 'rt', 'center torso': 'ct', 'head': 'head',
  'left leg': 'll', 'right leg': 'rl',
  // Quads: front legs in the arm locations, rear legs in the leg locations.
  'front left leg': 'la', 'front right leg': 'ra', 'rear left leg': 'll', 'rear right leg': 'rl'
};
const LOC_CODE = { la: 'LA', ra: 'RA', lt: 'LT', rt: 'RT', ct: 'CT', head: 'HD', ll: 'LL', rl: 'RL' };
const ARMOR_KEYS = {
  'hd armor': 'head', 'ct armor': 'ct', 'lt armor': 'lt', 'rt armor': 'rt', 'la armor': 'la', 'ra armor': 'ra',
  'll armor': 'll', 'rl armor': 'rl', 'rtc armor': 'ctRear', 'rtl armor': 'ltRear', 'rtr armor': 'rtRear',
  'fll armor': 'la', 'frl armor': 'ra', 'rll armor': 'll', 'rrl armor': 'rl'
};
const ACTUATORS = new Set(['shoulder', 'upper arm actuator', 'lower arm actuator', 'hand actuator', 'hip', 'upper leg actuator', 'lower leg actuator', 'foot actuator']);
// Structure / armor slots: "roll again" results — kept as named empty slots.
const STRUCTURAL = /endo[\s-]?steel|endo[\s-]?composite|ferro[\s-]?(fibrous|lamellor)|stealth|reactive|reflective|hardened|reinforced|impact[\s-]?resistant|ballistic[\s-]?reinforced|anti[\s-]?penetrative|heat[\s-]?dissipating|composite|light ferro|heavy ferro/i;
const titleCase = (s) => s.replace(/\b\w/g, c => c.toUpperCase());

/** Classify one crit slot name: { type, name, weapon?, ammo? }. */
function classifyMechSlot(raw, clan) {
  const c = cleanEquipmentName(raw);
  const n = c.name.toLowerCase();
  if (!n || n === '-empty-' || n === 'empty') return { ...c, type: 'empty', name: '' };
  if (ACTUATORS.has(n)) return { ...c, type: 'actuator', name: titleCase(c.name) };
  if (/engine/i.test(n)) return { ...c, type: 'engine', name: 'Engine' };
  if (/gyro/i.test(n)) return { ...c, type: 'gyro', name: 'Gyro' };
  if (n === 'life support') return { ...c, type: 'lifeSupport', name: 'Life Support' };
  if (n === 'sensors') return { ...c, type: 'sensors', name: 'Sensors' };
  if (/cockpit/i.test(n)) return { ...c, type: 'cockpit', name: 'Cockpit' };
  if (/heat\s*sink|heatsink/i.test(n)) return { ...c, type: 'heatSink', name: /double|laser/i.test(n) ? 'Double Heat Sink' : 'Heat Sink' };
  if (/jump\s*jet|jumpjet|jump booster/i.test(n)) return { ...c, type: 'jumpJet', name: 'Jump Jet' };
  if (/^(is|cl|clan)?\s*case(\s*ii)?$/i.test(c.name)) return { ...c, type: 'case', name: /ii$/i.test(c.name) ? 'CASE II' : 'CASE' };
  if (STRUCTURAL.test(n)) return { ...c, type: 'empty', name: c.name, structural: true };
  const ammo = /ammo|pods/i.test(n) ? findAmmo(c.name, { clan }) : null;
  if (ammo || /ammo|pods/i.test(n)) return { ...c, type: 'ammo', name: c.name, ammo };
  const weapon = findWeapon(c.name, { clan });
  if (weapon) return { ...c, type: 'weapon', name: weapon.name, weapon };
  return { ...c, type: 'equipment', name: c.name };
}

/** Split an .mtf into key:value lines and location blocks. */
function readMtf(text) {
  const kv = {}, blocks = {}, weaponList = [];
  const lines = String(text).replace(/\r/g, '').split('\n');
  let block = null, weaponsLeft = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) { block = null; continue; }
    const loc = MTF_LOCATIONS[line.replace(/:$/, '').toLowerCase()];
    if (line.endsWith(':') && loc) { block = loc; blocks[block] = []; continue; }
    if (block) { blocks[block].push(line); continue; }
    if (weaponsLeft > 0) { weaponList.push(line); weaponsLeft--; continue; }
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), value = line.slice(i + 1).trim();
    if (key === 'weapons') { weaponsLeft = num(value); continue; }
    if (!(key in kv)) kv[key] = value;
  }
  return { kv, blocks, weaponList };
}

/** Biography HTML from the fluff fields. */
function fluffHtml(sections) {
  return sections.filter(([, t]) => t && t.trim())
    .map(([h, t]) => `<h3>${h}</h3>${/^\s*</.test(t) ? t : `<p>${t}</p>`}`).join('');
}

/** Parse a MegaMek .mtf 'Mech file. */
export function parseMtf(text) {
  const warnings = [];
  const { kv, blocks, weaponList } = readMtf(text);
  const tons = num(kv.mass);
  const config = kv.config || 'Biped';
  const clan = /clan/i.test(kv.techbase || '') && !/mixed \(is/i.test(kv.techbase || '');
  if (/quad/i.test(config)) warnings.push("Quad 'Mech: the front legs are stored as the arm locations and the rear legs as the legs (four-legged rules aren't automated).");
  if (/lam|tripod/i.test(config)) warnings.push(`${config} configuration isn't modelled; imported as a biped.`);
  if (!tons) warnings.push('No tonnage (mass) found.');

  // Armor and internal structure.
  const armor = {}, structure = {};
  for (const k of ['head', 'ct', 'ctRear', 'lt', 'ltRear', 'rt', 'rtRear', 'la', 'ra', 'll', 'rl']) armor[k] = { value: 0, max: 0 };
  for (const [key, loc] of Object.entries(ARMOR_KEYS)) {
    if (kv[key] !== undefined) { const v = num(kv[key]); armor[loc] = { value: v, max: v }; }
  }
  const is = mechInternalStructure(tons);
  for (const [loc, v] of Object.entries(is)) structure[loc] = { value: v, max: v };

  // Critical slots → our slot model; weapons are built from runs of their slots
  // (which also tells rear-mounted weapons apart).
  const critSlots = {}, weapons = [], catalogOf = new Map(), bins = [];
  const hsCounter = { n: 0 };
  for (const loc of ['head', 'ct', 'lt', 'rt', 'la', 'ra', 'll', 'rl']) {
    const lines = [...(blocks[loc] || [])];
    const size = ['head', 'll', 'rl'].includes(loc) ? 6 : 12;
    // Heads and legs carry 6 slots; .mtf pads them to 12 with empties.
    while (lines.length > size && /^-?empty-?$/i.test(lines[lines.length - 1])) lines.pop();
    if (lines.length > size) warnings.push(`${LOC_CODE[loc]} lists ${lines.length} slots (expected ${size}).`);
    let run = null;
    critSlots[loc] = lines.map((raw) => {
      const c = classifyMechSlot(raw, clan);
      const slot = { name: c.name, type: c.type, hit: false };
      if (c.type === 'weapon') {
        const key = `${c.weapon.name}|${c.rear}`;
        if (!run || run.key !== key || run.count >= c.weapon.slots) {
          const entry = weaponEntry(c.weapon, `${LOC_CODE[loc]}${c.rear ? ' (R)' : ''}`);
          weapons.push(entry);
          catalogOf.set(entry.id, c.weapon);
          run = { key, count: 0, id: entry.id };
        }
        run.count++;
        slot.weaponId = run.id;
      } else run = null;
      if (c.type === 'heatSink') slot._hs = true;
      if (c.type === 'ammo') {
        if (c.ammo) bins.push({ raw, ammo: c.ammo, slot });
        else warnings.push(`Unknown ammunition "${raw}" (${LOC_CODE[loc]}).`);
      }
      if (c.type === 'equipment') slot.name = c.name;
      return slot;
    });
    // Name each multi-slot double heat sink individually so it's lost once, not per slot.
    let prev = null;
    for (const s of critSlots[loc]) {
      if (s._hs && s.name === 'Double Heat Sink') {
        if (!(prev && prev.base === 'Double Heat Sink' && prev.count < (clan ? 2 : 3))) { hsCounter.n++; prev = { base: 'Double Heat Sink', count: 0, label: `Double Heat Sink #${hsCounter.n}` }; }
        prev.count++;
        s.name = prev.label;
      } else if (!s._hs) prev = null;
      delete s._hs;
    }
  }
  // Split weapons: a run shorter than the weapon's slot count continues in the
  // adjacent location (arm ↔ side torso, side torso ↔ center torso, leg ↔ side
  // torso). Merge the two halves into one weapon, listed in the torso.
  const ADJ = { la: 'lt', ra: 'rt', ll: 'lt', rl: 'rt', lt: 'ct', rt: 'ct' };
  const runLen = (id, loc) => (critSlots[loc] || []).filter(x => x.weaponId === id).length;
  for (const w of [...weapons]) {
    const cw = catalogOf.get(w.id);
    const loc = Object.keys(LOC_CODE).find(k => LOC_CODE[k] === w.location.slice(0, 2));
    if (!cw || !loc || runLen(w.id, loc) >= cw.slots) continue;
    for (const other of [ADJ[loc], ...Object.keys(ADJ).filter(k => ADJ[k] === loc)].filter(Boolean)) {
      const mate = weapons.find(x => x !== w && x.name === w.name && catalogOf.get(x.id) === cw && x.location.slice(0, 2) === LOC_CODE[other] && runLen(x.id, other) < cw.slots);
      if (!mate || runLen(w.id, loc) + runLen(mate.id, other) !== cw.slots) continue;
      const keep = ['la', 'ra', 'll', 'rl'].includes(loc) ? mate : w, drop = keep === w ? mate : w;
      for (const sl of Object.values(critSlots).flat()) if (sl.weaponId === drop.id) sl.weaponId = keep.id;
      weapons.splice(weapons.indexOf(drop), 1);
      break;
    }
  }

  // Artemis fire control: each location's units link to its launchers.
  linkArtemis(weapons, Object.fromEntries(Object.entries(critSlots).map(([loc, sl]) => [LOC_CODE[loc], artemisOf(sl.filter(x => x.type === 'equipment').map(x => x.name))])));

  // Record-sheet order: arms, torsos, head, legs.
  const ORDER = ['LA', 'RA', 'LT', 'RT', 'CT', 'HD', 'LL', 'RL'];
  weapons.sort((x, y) => ORDER.indexOf(x.location.slice(0, 2)) - ORDER.indexOf(y.location.slice(0, 2)));
  const feeds = assignAmmo(weapons, bins, catalogOf, warnings);
  for (const bin of bins) if (feeds.has(bin)) bin.slot.weaponId = feeds.get(bin);

  // Cross-check against the file's weapon list.
  const listed = weaponList.filter(l => l.includes(',')).length;
  if (listed && listed !== weapons.length) warnings.push(`The file lists ${listed} weapons; ${weapons.length} were found in the critical slots.`);
  const equipNames = Object.values(critSlots).flat().filter(s => s.type === 'equipment' && !/artemis/i.test(s.name)).map(s => s.name);
  const known = gearFromNames(equipNames).used; // MASC, TSM, ECM, probes, C3: read from the slots (tw-gear.mjs)
  const unknown = equipNames.filter(n => !known.includes(n));
  if (unknown.length) warnings.push(`Other equipment (no automated effect): ${[...new Set(unknown)].join(', ')}.`);

  // Heat sinks: "20 Single" / "17 Clan Double" / "10 IS Double".
  const hs = String(kv['heat sinks'] || '').match(/(\d+)\s*(.*)/);
  const engine = String(kv.engine || '').match(/(\d+)\s*(.*?)\s*Engine/i);
  const name = [kv.chassis, kv.model].filter(Boolean).join(' ');
  return {
    type: 'mech', name: kv.clanname ? `${name} (${kv.clanname})` : name, warnings,
    system: {
      tonnage: tons, weightClass: mechWeightClass(tons), techBase: kv.techbase || '', omni: /omni/i.test(config), era: kv.era || '',
      movement: { walk: num(kv['walk mp']), jump: num(kv['jump mp']) },
      engineType: engine ? engine[2] || 'Fusion' : (kv.engine || ''), engineRating: engine ? num(engine[1]) : 0,
      heatSinks: { count: hs ? num(hs[1]) : 10, type: /double|laser/i.test(hs?.[2] || '') ? 'double' : 'single' },
      armor, structure, critSlots, weapons,
      biography: fluffHtml([['Overview', kv.overview], ['Capabilities', kv.capabilities], ['Deployment', kv.deployment], ['History', kv.history]])
    }
  };
}

/* ------------------------------------------------------------------ */
/*  .blk (vehicles, aerospace, battle armor, infantry)                  */
/* ------------------------------------------------------------------ */

/** Read the <tag> … </tag> blocks of a .blk file into { tag: [lines] }. */
export function readBlk(text) {
  const out = {};
  const re = /<([^/>][^>]*)>\s*\n?([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(String(text).replace(/\r/g, '')))) {
    out[m[1].trim()] = m[2].split('\n').map(s => s.trim()).filter(s => s.length);
  }
  return out;
}
const first = (b, k) => b[k]?.[0] ?? '';

/** Load a location's equipment lines into weapons / ammo bins. */
function loadEquipment(lines, location, { clan, ba = false }, weapons, catalogOf, bins, other, fcs = null) {
  for (const raw of lines || []) {
    const c = cleanEquipmentName(raw.split(':')[0]);
    if (fcs && /artemis/i.test(c.name)) { (fcs[location] ??= []).push(c.name); continue; }
    if (/ammo|pods/i.test(c.name)) {
      const a = findAmmo(c.name, { clan });
      if (a) bins.push({ raw, ammo: a });
      else other.push(c.name);
      continue;
    }
    const w = findWeapon(c.name, { clan, ba });
    if (w) {
      const entry = weaponEntry(w, c.turret && location !== 'Turret' ? 'Turret' : location);
      weapons.push(entry);
      catalogOf.set(entry.id, w);
    } else other.push(c.name);
  }
}

const blkClan = (b) => /clan/i.test(first(b, 'type'));
const blkName = (b) => [first(b, 'Name'), first(b, 'Model')].filter(Boolean).join(' ');
const blkBio = (b) => fluffHtml([['Overview', b.overview?.join(' ')], ['Capabilities', b.capabilities?.join(' ')], ['Deployment', b.deployment?.join(' ')], ['History', b.history?.join(' ')]]);
const ENGINE_CODES = { 0: 'Fusion', 1: 'ICE', 2: 'XL', 3: 'XXL', 4: 'Light', 5: 'Compact', 6: 'Fuel Cell', 7: 'Fission', 8: 'None' };

function parseVehicle(b, warnings) {
  const clan = blkClan(b);
  const tons = num(first(b, 'tonnage'));
  const unitType = first(b, 'UnitType');
  const motion = first(b, 'motion_type').toLowerCase();
  const movementType = unitType === 'VTOL' || motion === 'vtol' ? 'vtol' : ({ tracked: 'tracked', wheeled: 'wheeled', hover: 'hover', naval: 'naval', hydrofoil: 'hydrofoil', submarine: 'submarine', wige: 'wige' }[motion] || 'tracked');
  const armorVals = (b.armor || []).map(num);
  const vtol = movementType === 'vtol';
  const hasTurret = vtol ? armorVals.length >= 6 : armorVals.length >= 5;
  if (/super|large/i.test(unitType) || armorVals.length > (vtol ? 6 : 5)) warnings.push('Superheavy / dual-turret layouts aren\'t modelled; extra locations were dropped.');
  const av = (i) => ({ value: armorVals[i] ?? 0, max: armorVals[i] ?? 0 });
  const armor = { front: av(0), right: av(1), left: av(2), rear: av(3), turret: { value: 0, max: 0 }, rotor: { value: 0, max: 0 } };
  if (vtol) { armor.rotor = av(4); if (hasTurret) armor.turret = av(5); } else if (hasTurret) armor.turret = av(4);
  const weapons = [], catalogOf = new Map(), bins = [], other = [], fcs = {};
  for (const [tag, loc] of [['Front Equipment', 'Front'], ['Right Equipment', 'Right'], ['Left Equipment', 'Left'], ['Rear Equipment', 'Rear'], ['Turret Equipment', 'Turret'], ['Rotor Equipment', 'Rotor'], ['Body Equipment', 'Body']]) {
    loadEquipment(b[tag], loc, { clan }, weapons, catalogOf, bins, other, fcs);
  }
  assignAmmo(weapons, bins, catalogOf, warnings);
  linkArtemis(weapons, Object.fromEntries(Object.entries(fcs).map(([k, v]) => [k, artemisOf(v)])));
  // Special equipment (MASC, supercharger, ECM, probes, C3) goes to the unit's gear record.
  const { gear, used } = gearFromNames(other);
  const extras = other.filter(n => !/^(is|cl|clan)?\s*case(\s*ii)?$/i.test(n) && !used.includes(n));
  if (extras.length) warnings.push(`Other equipment (no automated effect): ${[...new Set(extras)].join(', ')}.`);
  const structure = Math.ceil(tons / 10);
  warnings.push(`Internal structure set to ${structure} (⌈tonnage / 10⌉, the per-location value) for the sheet's single structure pool.`);
  return {
    type: 'ground_vehicle', name: blkName(b), warnings,
    system: {
      tonnage: tons, weightClass: tons >= 80 ? 'Assault' : tons >= 60 ? 'Heavy' : tons >= 40 ? 'Medium' : 'Light',
      techBase: clan ? 'Clan' : 'Inner Sphere', omni: first(b, 'omni') === '1' || /omni/i.test(first(b, 'UnitType')), era: first(b, 'year'),
      movementType, movement: { cruise: num(first(b, 'cruiseMP')), flank: Math.ceil(num(first(b, 'cruiseMP')) * 1.5) },
      engineType: ENGINE_CODES[num(first(b, 'engine_type'))] ?? '', hasTurret, armor,
      structure: { value: structure, max: structure },
      hasCASE: other.some(n => /case/i.test(n)), weapons, gear, biography: blkBio(b)
    }
  };
}

function parseAero(b, warnings, type) {
  const clan = blkClan(b);
  const tons = num(first(b, 'tonnage'));
  const safe = num(first(b, 'SafeThrust'));
  const armorVals = (b.armor || []).map(num);
  const loc = (i) => ({ value: armorVals[i] ?? 0, max: armorVals[i] ?? 0, threshold: Math.ceil((armorVals[i] ?? 0) / 10) });
  const si = num(first(b, 'structural_integrity')) || Math.max(Math.floor(tons / 10), safe);
  const weapons = [], catalogOf = new Map(), bins = [], other = [], fcs = {};
  for (const [tag, where] of [['Nose Equipment', 'Nose'], ['Left Wing Equipment', 'Left Wing'], ['Right Wing Equipment', 'Right Wing'], ['Aft Equipment', 'Aft'], ['Fuselage Equipment', 'Fuselage'],
    ['Left Side Equipment', 'Left Wing'], ['Right Side Equipment', 'Right Wing']]) {
    loadEquipment(b[tag], where, { clan }, weapons, catalogOf, bins, other, fcs);
  }
  assignAmmo(weapons, bins, catalogOf, warnings);
  linkArtemis(weapons, Object.fromEntries(Object.entries(fcs).map(([k, v]) => [k, artemisOf(v)])));
  const extras = other.filter(n => !/^(is|cl|clan)?\s*case(\s*ii)?$/i.test(n));
  if (extras.length) warnings.push(`Other equipment (no automated effect): ${[...new Set(extras)].join(', ')}.`);
  if (first(b, 'UnitType') === 'ConvFighter') warnings.push('Conventional fighter imported as an aerospace fighter.');
  return {
    type, name: blkName(b), warnings,
    system: {
      tonnage: tons, weightClass: tons >= 75 ? 'Heavy' : tons >= 50 ? 'Medium' : 'Light', techBase: clan ? 'Clan' : 'Inner Sphere',
      era: first(b, 'year'), omni: first(b, 'omni') === '1',
      thrust: { safe, max: Math.ceil(safe * 1.5) }, structuralIntegrity: { value: si, max: si },
      engineType: ENGINE_CODES[num(first(b, 'engine_type'))] ?? '',
      heatSinks: { count: num(first(b, 'heatsinks')), type: num(first(b, 'sink_type')) === 1 ? 'double' : 'single' },
      fuel: num(first(b, 'fuel')),
      armor: { nose: loc(0), leftWing: loc(1), rightWing: loc(2), aft: loc(3) },
      hasCASE: other.some(n => /case/i.test(n)), weapons, biography: blkBio(b)
    }
  };
}

const BA_WEIGHT = { 0: 'pal', 1: 'light', 2: 'medium', 3: 'heavy', 4: 'assault' };
const BA_ARMOR = { 31: 'basic', 32: 'standard', 33: 'improved', 34: 'prototype' };
const MANIPULATOR_NAMES = [
  [/heavy\s*battle\s*claw/i, 'heavyClaw'], [/vibro/i, 'vibroClaw'], [/magnet/i, 'magneticClaw'], [/battle\s*claw/i, 'battleClaw'],
  [/armored\s*glove/i, 'armoredGlove'], [/cargo\s*lifter/i, 'cargoLifter'], [/basic\s*manipulator|manipulator/i, 'basic']
];

function parseBattleArmor(b, warnings) {
  const clan = blkClan(b);
  const troopers = num(first(b, 'Trooper Count')) || (clan ? 5 : 4);
  const motion = first(b, 'motion_type').toLowerCase();
  const jumpish = num(first(b, 'jumpingMP'));
  const lines = [...(b['Point Equipment'] || []), ...(b['Squad Equipment'] || [])];
  const weapons = [], manipulators = { left: 'none', right: 'none' };
  const equipment = { stealth: BA_ARMOR[num(first(b, 'armor_type'))] || 'none', mimetic: num(first(b, 'armor_type')) === 36, camo: false,
    fireResistant: num(first(b, 'armor_type')) === 35, magneticClamps: false, bodyMissiles: false, missilesJettisoned: false };
  const other = [];
  let apDone = false;
  for (const raw of lines) {
    const [nameRaw, locRaw = '', ...mods] = raw.split(':');
    const name = cleanEquipmentName(nameRaw).name;
    const loc = locRaw.toUpperCase();
    const manip = MANIPULATOR_NAMES.find(([re]) => re.test(name));
    if (manip && /manipulator|claw|glove|lifter/i.test(name)) {
      if (loc === 'LA') manipulators.left = manip[1];
      else if (loc === 'RA') manipulators.right = manip[1];
      else if (manipulators.left === 'none') manipulators.left = manip[1]; else manipulators.right = manip[1];
      continue;
    }
    if (/magnetic\s*clamp/i.test(name)) { equipment.magneticClamps = true; continue; }
    if (/camo/i.test(name)) { equipment.camo = true; continue; }
    if (/stealth|mimetic|fire[\s-]?resist/i.test(name) || /APMount|AP Mount|jump\s*jet|mechanical jump|partial wing|vtol|umu/i.test(name)) continue;
    if (/ammo/i.test(name)) {
      // "BA-SRM2 Ammo:Body:Shots2#" → the launcher's shots.
      const shots = num((raw.match(/Shots(\d+)/i) || [])[1]);
      const a = findAmmo(name, { clan, ba: true });
      const w = weapons.find(x => x._family === a?.family && !x._ammoSet && x.clusterSize);
      if (w) { w.ammo = shots || a?.shots || 0; w.ammoType = ammoLabel(a); w._ammoSet = true; }
      else other.push(name);
      continue;
    }
    // Anti-personnel weapons ride an AP mount ("…:APM:LA"): one AP attack per turn.
    if (loc === 'APM' || /^Infantry/i.test(name)) {
      if (!apDone) weapons.push({ id: rid(), name: name.replace(/^Infantry/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || 'Anti-personnel weapon', location: 'arm', ap: true, heat: 0, damage: 0, clusterSize: 0, rangeMin: 0, rangeS: 0, rangeM: 0, rangeL: 0, ammoType: '', ammo: 0 });
      apDone = true;
      continue;
    }
    const w = findWeapon(name, { clan, ba: true });
    if (!w) { other.push(name); continue; }
    const where = loc === 'LA' || loc === 'RA' ? 'arm' : loc === 'TURRET' || /turret/i.test(mods.join(':')) ? 'turret' : 'body';
    const entry = weaponEntry(w, where);
    entry._family = w.family;
    weapons.push(entry);
    if (w.cluster && where === 'body' && !clan) equipment.bodyMissiles = true;
  }
  for (const w of weapons) { delete w._family; delete w._ammoSet; }
  if (other.length) warnings.push(`Other equipment (no automated effect): ${[...new Set(other)].join(', ')}.`);
  if (equipment.bodyMissiles) warnings.push('Inner Sphere body-mounted missile launchers: marked as not yet jettisoned (no jumping or anti-\'Mech attacks until they are).');
  return {
    type: 'battle_armor', name: blkName(b), warnings,
    system: {
      squadSize: troopers, techBase: clan ? 'clan' : 'is', weightClass: BA_WEIGHT[num(first(b, 'weightclass'))] || 'medium',
      chassis: /quad/i.test(first(b, 'chassis')) ? 'quad' : 'humanoid', armorValue: num(first(b, 'armor')), troopers: [],
      movement: { ground: num(first(b, 'cruiseMP')), jump: motion === 'jump' ? jumpish : 0, vtol: motion === 'vtol' ? jumpish : 0, umu: motion === 'umu' ? jumpish : 0 },
      manipulators, equipment, era: first(b, 'year'), weapons, biography: blkBio(b)
    }
  };
}

/** Classify a platoon's weapon for the generic tables. */
function platoonWeaponType(name) {
  const n = String(name || '').toLowerCase();
  if (/lrm/.test(n)) return 'lrm';
  if (/srm/.test(n)) return 'srm';
  if (/flamer/.test(n)) return 'flamer';
  if (/machine\s*gun|\bmg\b/.test(n)) return 'mg';
  if (/laser|pulse|energy|ppc|plasma|blazer|particle/.test(n)) return 'rifleEnergy';
  return 'rifleBallistic';
}

function parseInfantry(b, warnings) {
  const clan = blkClan(b);
  const motion = first(b, 'motion_type').toLowerCase();
  const platoonType = motion === 'jump' ? 'jump' : motion === 'motorized' ? 'motorized' : ['tracked', 'wheeled', 'hover'].includes(motion) ? 'mechanized' : 'foot';
  if (!['leg', 'jump', 'motorized', 'tracked', 'wheeled', 'hover'].includes(motion)) warnings.push(`Movement "${motion}" imported as foot infantry.`);
  const troopers = (num(first(b, 'squad_size')) * num(first(b, 'squadn'))) || 28;
  const secondary = num(first(b, 'secondn')) > 0 ? first(b, 'Secondary') : '';
  const weaponType = platoonWeaponType(secondary || first(b, 'Primary'));
  const sys = { techBase: clan ? 'clan' : 'is', platoonType, mechanizedType: platoonType === 'mechanized' ? motion : 'tracked', weaponType };
  const g = genericPlatoon(sys);
  warnings.push(`Platoon imported with the generic ${CI_WEAPONS[weaponType]} damage and range tables (from ${secondary ? `secondary "${secondary}"` : `primary "${first(b, 'Primary')}"`}); MP from the Generic Conventional Infantry Units Table.`);
  if (b['Field Guns Equipment']?.length) warnings.push('Field guns aren\'t modelled.');
  return {
    type: 'infantry', name: blkName(b), warnings,
    system: {
      ...sys, troopers: { value: troopers, max: troopers, wound: 0 },
      movement: { ground: g?.ground ?? 1, jump: g?.jump ?? 0 }, era: first(b, 'year'), biography: blkBio(b)
    }
  };
}

/** Parse a MegaMek .blk unit file. */
export function parseBlk(text) {
  const b = readBlk(text);
  const unitType = first(b, 'UnitType');
  const warnings = [];
  switch (unitType) {
    case 'Tank': case 'VTOL': case 'SupportTank': case 'SupportVTOL': case 'LargeSupportTank': case 'Naval':
      if (/support/i.test(unitType)) warnings.push('Support vehicle imported as a combat vehicle (BAR and support rules aren\'t modelled).');
      return parseVehicle(b, warnings);
    case 'AeroSpaceFighter': case 'Aero': case 'ConvFighter':
      return parseAero(b, warnings, 'aerospace_fighter');
    case 'SmallCraft':
      return parseAero(b, warnings, 'small_craft');
    case 'BattleArmor':
      return parseBattleArmor(b, warnings);
    case 'Infantry':
      return parseInfantry(b, warnings);
    default:
      throw new Error(`Unsupported unit type "${unitType || 'unknown'}" (DropShips, JumpShips, WarShips, ProtoMechs and space stations aren't supported).`);
  }
}

/** Parse either format by file name / content. */
export function parseUnitFile(text, fileName = '') {
  const isBlk = /\.blk$/i.test(fileName) || /<UnitType>/i.test(text);
  return isBlk ? parseBlk(text) : parseMtf(text);
}
