/**
 * armor.mjs
 * ---------
 * Canonical seed data for the Armor compendium, transcribed from the A Time of
 * War Personal Armor table (EQUIPMENT chapter, p.287-288). The seeder
 * (helpers/armor-seeder.mjs) imports these into `mech-foundry.armor` as editable
 * `armor` Items, foldered under Personal Armor by armor type.
 *
 * In the book each armor TYPE (Flak, Ablative, …) carries a shared Equipment
 * Rating and a four-value BAR (Melee/Ballistic/Energy/eXplosive); the individual
 * garments (Vest/Jacket/Pants/Suit/…) differ only in cost, mass and coverage.
 * We therefore define types with their garments and expand to one item per
 * garment. Concealed variants are derived from a base garment by applying the
 * table's cost/mass multipliers and the concealed BAR/rating.
 */

const IMG_ARMOR = 'icons/equipment/chest/breastplate-layered-leather-brown.webp';

/** Garment → covered body locations (drives the Hit Location coverage flags). */
const COVERAGE = {
  'Vest': ['torso'],
  'Jacket': ['torso', 'arms'],
  'Jacket (Unhooded)': ['torso', 'arms'],
  'Jacket (Hooded)': ['torso', 'arms', 'head'],
  'Pants': ['legs'],
  'Shorts/Skirt/Kilt': ['legs'],
  'Suit': ['torso', 'arms', 'legs']
};

/** Build a coverage object from a location list. The system tracks four hit
 *  locations (head/torso/arms/legs), so hands→arms and feet→legs. */
function coverageFromLocs(locs) {
  if ((locs || []).includes('full')) return { head: true, torso: true, arms: true, legs: true };
  const n = (locs || []).map(l => (l === 'hands' ? 'arms' : l === 'feet' ? 'legs' : l));
  return { head: n.includes('head'), torso: n.includes('torso'), arms: n.includes('arms'), legs: n.includes('legs') };
}

function coverageObj(garment) {
  return coverageFromLocs(COVERAGE[garment] || []);
}

const SHORTS_NOTE = "+1 to the attacker's AP";

/**
 * Base armor types. `bar` is [Melee, Ballistic, Energy, eXplosive]. Each garment
 * carries its own cost / patch cost / mass; `note` is a per-garment extra.
 */
const ARMOR_TYPES = [
  {
    type: 'Flak', ar: 'C/A-A-A/B', bar: [1, 5, 1, 3], note: '', garments: [
      { g: 'Jacket', cost: 100, patch: 10, mass: 3.5 },
      { g: 'Pants', cost: 75, patch: 10, mass: 5.5 },
      { g: 'Shorts/Skirt/Kilt', cost: 100, patch: 10, mass: 3.5, note: SHORTS_NOTE },
      { g: 'Suit', cost: 150, patch: 10, mass: 8.6 },
      { g: 'Vest', cost: 50, patch: 10, mass: 2.8 }
    ]
  },
  {
    type: 'Ablative', ar: 'D/A-B-A/C', bar: [3, 1, 6, 1], note: '', garments: [
      { g: 'Jacket', cost: 750, patch: 10, mass: 2.6 },
      { g: 'Pants', cost: 500, patch: 10, mass: 4 },
      { g: 'Shorts/Skirt/Kilt', cost: 750, patch: 20, mass: 2.5, note: SHORTS_NOTE },
      { g: 'Suit', cost: 1000, patch: 20, mass: 6.3 },
      { g: 'Vest', cost: 400, patch: 20, mass: 2.1 }
    ]
  },
  {
    type: 'Ablative/Flak', ar: 'D/B-C-B/C', bar: [2, 4, 5, 2], note: '', garments: [
      { g: 'Jacket', cost: 600, patch: 15, mass: 4.1 },
      { g: 'Pants', cost: 400, patch: 15, mass: 6.3 },
      { g: 'Shorts/Skirt/Kilt', cost: 750, patch: 20, mass: 4.2, note: SHORTS_NOTE },
      { g: 'Suit', cost: 800, patch: 15, mass: 9.8 },
      { g: 'Vest', cost: 300, patch: 15, mass: 3.2 }
    ]
  },
  {
    type: 'Ballistic Plate', ar: 'D/C-C-C/D', bar: [4, 6, 5, 4], note: 'Cannot be patched if any BAR is reduced below half.', garments: [
      { g: 'Suit', cost: 1600, patch: 50, mass: 22, note: 'Encumbering' },
      { g: 'Vest', cost: 600, patch: 50, mass: 8.8 }
    ]
  },
  {
    type: 'Neo-Chain', ar: 'D/X-X-C/D', bar: [3, 3, 2, 2], note: 'Concealable.', garments: [
      { g: 'Jacket (Unhooded)', cost: 700, patch: 17, mass: 1.9 },
      { g: 'Jacket (Hooded)', cost: 830, patch: 17, mass: 2.1 },
      { g: 'Pants', cost: 450, patch: 17, mass: 2.8 },
      { g: 'Shorts/Skirt/Kilt', cost: 375, patch: 17, mass: 1.8, note: SHORTS_NOTE },
      { g: 'Suit', cost: 920, patch: 17, mass: 4.7 },
      { g: 'Vest', cost: 375, patch: 17, mass: 1.7 }
    ]
  },
  {
    type: 'Myomer', ar: 'E/X-X-E/E', bar: [3, 5, 4, 5], aff: 'LA',
    note: 'Concealable; requires an HC micro-power pack (0.5 points/minute when active); half BAR when inactive (round down).', garments: [
      { g: 'Suit', cost: 5800, patch: 150, mass: 18, note: 'Encumbering' },
      { g: 'Vest', cost: 1800, patch: 150, mass: 7.5 }
    ]
  }
];

/** Concealed armor variants — derived from a base type's garments by applying
 *  the table's cost/mass multipliers and the concealed BAR / Equipment Rating. */
const CONCEALED_NOTE = 'Concealable; -4 to Perception and -2 to Sensor Operations checks to spot when worn under clothing. Not available to Clan characters.';
const CONCEALED = [
  { type: 'Concealed Flak', base: 'Flak', ar: 'D/D-C-B/C', bar: [1, 4, 1, 2], costMult: 1.5, massMult: 0.75, garments: ['Vest', 'Jacket', 'Pants', 'Suit'], note: '' },
  { type: 'Concealed Ablative', base: 'Ablative', ar: 'E/E-D-B/D', bar: [2, 1, 4, 1], costMult: 1.5, massMult: 0.75, garments: ['Vest', 'Jacket', 'Pants', 'Suit'], note: '' },
  { type: 'Concealed Ablative/Flak', base: 'Ablative/Flak', ar: 'E/F-D-C/D', bar: [2, 3, 3, 2], costMult: 1.75, massMult: 0.80, garments: ['Vest', 'Jacket', 'Pants', 'Suit'], note: '' },
  { type: 'Concealed Ballistic Plate', base: 'Ballistic Plate', ar: 'E/X-F-D/D', bar: [3, 4, 4, 3], costMult: 1.8, massMult: 0.75, garments: ['Vest', 'Suit'], note: '+1 to Detection rolls against the wearer.' }
];

/** Flatten the base types into per-garment records. */
function expandBase() {
  const out = [];
  for (const t of ARMOR_TYPES) {
    for (const gm of t.garments) {
      const notes = [t.note, gm.note].filter(Boolean).join(' ');
      out.push({
        armorType: t.type, subfolder: t.type, name: `${t.type} ${gm.g}`,
        ar: t.ar, bar: t.bar, aff: t.aff || '', cost: gm.cost, patch: gm.patch,
        massKg: gm.mass, garment: gm.g, coverage: coverageObj(gm.g), notes
      });
    }
  }
  return out;
}

const BASE_RECORDS = expandBase();

/** Derive concealed records from the base garments. */
function expandConcealed() {
  const byTypeGarment = new Map(BASE_RECORDS.map(r => [`${r.armorType}/${r.garment}`, r]));
  const out = [];
  for (const c of CONCEALED) {
    for (const g of c.garments) {
      const base = byTypeGarment.get(`${c.base}/${g}`);
      if (!base) continue;
      const notes = [CONCEALED_NOTE, c.note].filter(Boolean).join(' ');
      out.push({
        armorType: c.type, subfolder: 'Concealed', name: `${c.type} ${g}`,
        ar: c.ar, bar: c.bar, aff: '',
        cost: Math.round(base.cost * c.costMult),
        patch: Math.round(base.patch * c.costMult),
        massKg: Math.round(base.massKg * c.massMult * 100) / 100,
        garment: g, coverage: coverageObj(g), notes
      });
    }
  }
  return out;
}

/** Expand a raw armor record into a seed entry { folder, subfolder, item }. */
export function toArmorSeed(r) {
  const folder = r.folder || 'Personal Armor';
  return {
    folder,
    subfolder: r.subfolder || '',
    item: {
      name: r.name,
      img: r.img || IMG_ARMOR,
      type: 'armor',
      system: {
        description: r.description || '',
        equipmentRating: r.ar || '',
        cost: r.cost ?? 0,
        affiliation: r.aff || '',
        mass: r.massKg ?? 0,
        notes: r.notes || '',
        carryStatus: 'carried',
        itemEffects: [],
        armorType: r.armorType || '',
        bar: { m: r.bar[0] ?? 0, b: r.bar[1] ?? 0, e: r.bar[2] ?? 0, x: r.bar[3] ?? 0 },
        armorDamage: 0,
        patchCost: r.patch ?? 0,
        coverage: r.coverage || { head: false, torso: false, arms: false, legs: false },
        equipped: false
      },
      flags: { 'mech-foundry': { folder, subfolder: r.subfolder || '' } }
    }
  };
}

export const ARMOR_BASE = BASE_RECORDS;
export const ARMOR_CONCEALED = expandConcealed();

/**
 * Combat Armor Accessories (ATOW p.288). Helmets, gloves, boots, shields,
 * load-bearing gear and gripper/climbing gear — all worn `armor` items carrying
 * a BAR (M/B/E/X). Foldered separately from Personal Armor. hands→arms and
 * feet→legs for the four-location coverage model. Items whose printed BAR is "—"
 * (microhook gear, grapple rod) provide no protection (BAR 0) but are catalogued
 * here with the rest of the table.
 */
const ACC_FOLDER = 'Combat Armor Accessories';
function acc(sub, name, ar, bar, cost, patch, massKg, locs, notes, aff = '') {
  return { folder: ACC_FOLDER, subfolder: sub, armorType: sub, name, ar, bar, aff, cost, patch, massKg, coverage: coverageFromLocs(locs), notes };
}
export const ARMOR_ACCESSORIES = [
  // Helmets
  acc('Helmets', 'Flak Helmet', 'C/A-A-A/B', [1, 5, 1, 3], 25, 10, 1, ['head'], '+0 to Perception; BAR 2 vs. flash'),
  acc('Helmets', 'Ablative Helmet', 'D/A-B-A/C', [3, 1, 6, 1], 200, 20, 0.8, ['head'], '+0 to Perception; BAR 3 vs. flash'),
  acc('Helmets', 'Ablative/Flak Helmet', 'D/B-C-B/C', [2, 4, 5, 2], 150, 15, 0.8, ['head'], '+0 to Perception; BAR 3 vs. flash'),
  acc('Helmets', 'Standard Combat Helmet', 'C/A-A-A/B', [3, 4, 3, 1], 100, 15, 3, ['head'], '-2 to Perception; BAR 3 vs. flash'),
  acc('Helmets', 'Advanced Combat Helmet', 'D/D-C-B/C', [5, 6, 5, 2], 200, 25, 2, ['head'], '-1 to Perception; BAR 7 vs. flash; includes military comm'),
  // Gloves & Boots
  acc('Gloves & Boots', 'Heavy Combat Gloves', 'E/D-F-E/C', [3, 4, 4, 3], 125, 15, 1, ['hands'], '-1 to DEX-related rolls'),
  acc('Gloves & Boots', 'Combat Boots', 'B/A-A-A/A', [2, 3, 3, 1], 48, 10, 2, ['feet'], ''),
  acc('Gloves & Boots', 'Plasteel Boots', 'D/D-F-C/A', [4, 6, 4, 4], 175, 50, 3, ['feet'], ''),
  // Shields (barriers — no worn coverage)
  acc('Shields', 'Riot Shield', 'C/B-B-B/B', [2, 2, 2, 2], 100, 0, 2, [], 'Barrier: provides full cover when crouched; Barrier Integrity 5'),
  acc('Shields', 'Bullet Shield', 'D/B-B-B/B', [4, 4, 4, 4], 300, 0, 4, [], 'Barrier: provides full cover when crouched; Barrier Integrity 8'),
  acc('Shields', 'Heavy Shield', 'D/C-C-C/C', [6, 6, 6, 6], 500, 0, 6, [], 'Barrier: provides full cover when crouched; Encumbering; Barrier Integrity 12'),
  // Load-bearing equipment (STR carry bonus; max 1 worn)
  acc('Load-Bearing', 'Load-Bearing Vest', 'B/A-A-A/A', [1, 3, 1, 1], 20, 0, 0.4, ['torso'], '+1 STR (carry/encumbrance only). Max 1 load-bearing item worn at a time'),
  acc('Load-Bearing', 'Load-Bearing Pack', 'B/A-A-A/A', [0, 0, 0, 0], 10, 0, 0.1, ['torso'], '+1 STR (carry/encumbrance only); Simple Action to detach, Complex Action to attach'),
  acc('Load-Bearing', 'Load-Bearing Packframe', 'C/A-A-A/A', [0, 0, 0, 0], 45, 0, 1, ['torso'], '+2 STR (carry/encumbrance only); Complex Action to attach/detach'),
  // Gripper / climbing gear
  acc('Gripper Gear', 'Gripper Boots', 'E/E-E-E/B', [2, 2, 1, 2], 600, 0, 5, ['feet'], '+2 to Climbing (+4 with gripper gloves); requires a standard power pack (1 PP/minute)', 'LA'),
  acc('Gripper Gear', 'Gripper Gloves', 'E/E-E-E/C', [2, 2, 1, 2], 1000, 0, 1, ['hands'], '+3 to Climbing (+4 with gripper boots); -2 to all other DEX rolls; +3 to STR rolls where grip matters; requires a standard power pack (1 PP/minute)', 'LA'),
  acc('Gripper Gear', 'Microhook Boots', 'D/D-F-D/B', [0, 0, 0, 0], 90, 0, 2, ['feet'], 'No armor protection. +1 to Climbing (+3 with microhook gloves); ineffective on smooth surfaces'),
  acc('Gripper Gear', 'Microhook Gloves', 'D/D-F-C/B', [0, 0, 0, 0], 100, 0, 0.4, ['hands'], 'No armor protection. +2 to Climbing (+3 with microhook boots); ineffective on smooth surfaces'),
  acc('Gripper Gear', 'Grapple Rod', 'D/C-D-A/B', [0, 0, 0, 0], 500, 0, 3, [], 'Max range 20 m; fire as a support weapon (no range modifier in range); on a hit, +3 Climbing to ascend 20 m in one turn; one-shot (50 C-bills to reset)')
];

/**
 * Worn kits & apparel (ATOW pp.290-296): faction armor kits, MechWarrior/pilot
 * kits, hostile-environment gear, stealth gear and non-combat clothing. All are
 * worn `armor` items sharing the armor table structure (rating, BAR, coverage),
 * so they live in the Armor compendium foldered by their table. `wearable()`
 * takes an explicit folder + sub-folder; BAR "—" becomes [0,0,0,0].
 */
function wearable(folder, sub, name, ar, bar, cost, patch, massKg, locs, notes, aff = '') {
  return {
    folder, subfolder: sub, armorType: sub, name, ar,
    bar: bar || [0, 0, 0, 0], aff, cost, patch, massKg,
    coverage: coverageFromLocs(locs), notes
  };
}

/** Adapt a raw {name, ar, bar, cost, patch, massKg, coverage, notes, aff} row. */
function fromRaw(folder, sub, r, extraNote = '') {
  const notes = [r.notes, extraNote].filter(Boolean).join(' ');
  return wearable(folder, sub, r.name, r.ar, r.bar, r.cost, r.patch || 0, r.massKg, r.coverage, notes, r.aff || '');
}

// Hostile-environment gear + stealth gear (ATOW p.296). BAR "—" → 0.
const ENV_RAW = [
  { group: 'Masks & Respirators', name: 'Filter Mask', ar: 'C/A-A-A/A', bar: null, cost: 5, massKg: 0.42, coverage: [], notes: 'Reload 2 per 5 filters (change every 72 h); BAR 5 vs. inhaled toxins/poisons' },
  { group: 'Masks & Respirators', name: 'Respirator', ar: 'C/A-A-A/A', bar: null, cost: 50, massKg: 2.5, coverage: [], notes: '4 hours of air per tank (max 3 tanks; tank cost 2); BAR 10 vs. inhaled toxins/poisons as a filter' },
  { group: 'Masks & Respirators', name: 'Humidifier Mask', ar: 'C/A-A-A/A', bar: null, cost: 10, massKg: 0.5, coverage: [], notes: '8 hours of comfortable breathing in arid climates; 10 min to refill at a water source' },
  { group: 'Weather Gear', name: 'Heat Suit', ar: 'D/C-C-C/A', bar: [0, 0, 1, 0], cost: 100, massKg: 3, coverage: ['full'], notes: 'Desert survival; includes filter mask and protective goggles; requires a power pack (1 PP/day)' },
  { group: 'Weather Gear', name: 'Parka', ar: 'C/A-A-A/A', bar: [1, 0, 0, 0], cost: 48, massKg: 2, coverage: ['head', 'torso', 'arms'], notes: 'Cold-weather gear; Encumbering' },
  { group: 'Weather Gear', name: 'Snow Suit', ar: 'C/A-A-A/A', bar: [1, 0, 0, 0], cost: 72, massKg: 4, coverage: ['full'], notes: 'Cold-weather gear; Encumbering' },
  { group: 'Weather Gear', name: 'Wetsuit (Scuba Suit)', ar: 'B/A-A-A/A', bar: [1, 0, 0, 0], cost: 55, massKg: 5.5, coverage: ['full'], notes: 'Underwater; 4 h life support (reload 2); immune vs. inhaled toxins; max depth 150 m (75 m if breached); Encumbering on land' },
  { group: 'Weather Gear', name: 'Underwater Operations Gear', ar: 'C/A-B-A/A', bar: [1, 1, 1, 1], cost: 125, massKg: 30, coverage: ['full'], notes: 'Underwater; 8 h life support (reload 4); immune vs. inhaled toxins; max depth 360 m; Encumbering on land' },
  { group: 'Environment Suits', name: 'Engineering Suit', ar: 'D/D-E-D/C', bar: [1, 4, 2, 3], cost: 7500, patch: 10, massKg: 14, coverage: ['full'], notes: 'Encumbering; includes civilian comm., intercom link, polarized goggles, 36 h life support; -2 to DEX rolls' },
  { group: 'Environment Suits', name: 'Environment Suit (Heavy)', ar: 'D/C-E-C/B', bar: [5, 4, 3, 3], cost: 10000, patch: 75, massKg: 18, coverage: ['full'], notes: 'Encumbering; BAR 5 vs. flash; includes military comm. and 6 h life support' },
  { group: 'Environment Suits', name: 'Environment Suit (Light)', ar: 'C/B-C-B/B', bar: [4, 1, 3, 1], cost: 200, patch: 35, massKg: 5, coverage: ['full'], notes: 'Encumbering; includes 6 h life support' },
  { group: 'Environment Suits', name: 'Space Suit', ar: 'C/B-B-B/B', bar: [1, 2, 1, 1], cost: 5000, patch: 10, massKg: 12, coverage: ['full'], notes: 'Encumbering; includes military comm., thruster pack, polarized visor, 48 h life support' },
  { group: 'Environment Suits', name: 'Patchwork Enviro-Suit', ar: 'C/X-X-C/B', bar: [3, 2, 3, 2], cost: 600, patch: 300, massKg: 20, aff: 'MH', coverage: ['full'], notes: 'Encumbering; self-healing bio-polymer recovers 1 BAR/type per 10 turns (to listed max); 30-year shelf-life' },
  { group: 'Accessories', name: 'Grip Shoes/Slips', ar: 'C/B-B-B/A', bar: null, cost: 30, massKg: 1, coverage: ['feet'], notes: '+1 to Zero-G Operations' },
  { group: 'Accessories', name: "Engineer's Helmet", ar: 'C/X-B-B/A', bar: [3, 3, 0, 2], cost: 2000, patch: 200, massKg: 1, coverage: ['head'], notes: '-2 to Perception; BAR 5 vs. flash; includes intercom link, IR scanner, rangefinder; HC micro power pack (2 PP/h)' },
  { group: 'Accessories', name: 'Protective Goggles/Visor', ar: 'A/A-A-A/A', bar: null, cost: 4, massKg: 0.1, coverage: [], notes: 'BAR 0 vs. flash (0.1-0.4 kg)' },
  { group: 'Accessories', name: 'Polarized Goggles/Visor', ar: 'B/A-A-A/A', bar: null, cost: 10, massKg: 0.1, coverage: [], notes: 'BAR 5 vs. flash (0.1-0.4 kg)' },
  { group: 'Accessories', name: 'Sunglasses', ar: 'A/A-A-A/A', bar: null, cost: 3, massKg: 0.1, coverage: [], notes: 'BAR 1 vs. flash (0.1-0.4 kg)' },
  { group: 'Stealth', name: 'Camouflage Clothing', ar: 'A/A-A-A/A', bar: null, cost: 30, massKg: 0.5, coverage: ['full'], notes: 'Cost/weight based on base attire (x1.25, typically fatigues); E/I/C 0/0/2 (camo only matches its environment)' },
  { group: 'Stealth', name: 'DEST Infiltration Suit', ar: 'D/F-E-E/E', bar: [2, 4, 5, 2], cost: 50000, massKg: 9, aff: 'DC', coverage: ['full'], notes: 'E/I/C 0/6/2; HC power pack (1 PP/15 min active); wraparound visor (BAR 8 vs. flash; +1 Perception, cannot be surprised)' },
  { group: 'Stealth', name: 'Ghillie Suit', ar: 'A/A-B-A/A', bar: null, cost: 50, massKg: 6, coverage: ['full'], notes: 'E/I/C 0/0/6 (camo only matches its environment)' },
  { group: 'Stealth', name: 'Sneak Suit, Camo', ar: 'D/C-D-C/D', bar: [0, 2, 1, 2], cost: 7000, massKg: 4, coverage: ['full'], notes: 'E/I/C 0/0/4; HC power pack (1 PP/15 min active)' },
  { group: 'Stealth', name: 'Sneak Suit, Camo/ECM', ar: 'D/C-D-D/D', bar: [0, 2, 1, 2], cost: 21000, massKg: 5, coverage: ['full'], notes: 'E/I/C 6/0/4; HC power pack (1 PP/10 min active)' },
  { group: 'Stealth', name: 'Sneak Suit, Camo/IR', ar: 'D/C-E-D/D', bar: [0, 2, 1, 2], cost: 21000, massKg: 5, coverage: ['full'], notes: 'E/I/C 0/6/4; HC power pack (1 PP/10 min active)' },
  { group: 'Stealth', name: 'Sneak Suit, ECM', ar: 'D/C-D-C/D', bar: [0, 2, 1, 2], cost: 7000, massKg: 4, coverage: ['full'], notes: 'E/I/C 6/0/0; HC power pack (1 PP/15 min active)' },
  { group: 'Stealth', name: 'Sneak Suit, ECM/IR', ar: 'D/C-E-D/D', bar: [0, 2, 1, 2], cost: 21000, massKg: 5, coverage: ['full'], notes: 'E/I/C 6/6/0; HC power pack (1 PP/10 min active)' },
  { group: 'Stealth', name: 'Sneak Suit, IR', ar: 'D/C-D-C/D', bar: [0, 2, 1, 2], cost: 7000, massKg: 4, coverage: ['full'], notes: 'E/I/C 0/6/0; HC power pack (1 PP/15 min active)' },
  { group: 'Stealth', name: 'Sneak Suit, IR/ECM/Camo', ar: 'D/D-F-E/D', bar: [0, 2, 1, 2], cost: 28000, massKg: 6, coverage: ['full'], notes: 'E/I/C 6/6/4; HC power pack (1 PP/5 min active)' }
];
export const ARMOR_ENVIRONMENT = ENV_RAW.map(r =>
  fromRaw(r.group === 'Stealth' ? 'Stealth Gear' : 'Environment Gear', r.group === 'Stealth' ? '' : r.group, r));

// Non-combat attire (ATOW p.294). All BAR "—" unless leather/work (light BAR).
const CLOTHING_RAW = [
  { group: 'Formal/Casual', name: 'Dress/Robe', bar: null, cost: 20, massKg: 0.5, coverage: ['torso', 'arms', 'legs'], notes: 'Arm coverage optional (20-44 C)' },
  { group: 'Formal/Casual', name: 'Dress Shoes/Boots', bar: null, cost: 30, massKg: 0.8, coverage: ['feet'], notes: '30-75 C' },
  { group: 'Formal/Casual', name: 'Formal Gown', bar: null, cost: 90, massKg: 1, coverage: ['torso', 'arms', 'legs'], notes: 'Arm coverage optional (90-780 C)' },
  { group: 'Formal/Casual', name: 'Formal Suit', bar: null, cost: 140, massKg: 2, coverage: ['torso', 'arms', 'legs'], notes: '140-575 C' },
  { group: 'Formal/Casual', name: 'Hat/Cap/Fedora', bar: null, cost: 12, massKg: 0.5, coverage: ['head'], notes: '12-15 C' },
  { group: 'Formal/Casual', name: 'Shoes/Sandals/Sneakers', bar: null, cost: 17, massKg: 0.8, coverage: ['feet'], notes: '17-50 C' },
  { group: 'Formal/Casual', name: 'Jacket/Blazer', bar: null, cost: 28, massKg: 1, coverage: ['torso', 'arms'], notes: '28-36 C' },
  { group: 'Formal/Casual', name: 'Overcoat', bar: null, cost: 8, massKg: 1.3, coverage: ['torso', 'arms'], notes: '8-55 C' },
  { group: 'Formal/Casual', name: 'Pants', bar: null, cost: 8, massKg: 0.9, coverage: ['legs'], notes: '8-23 C' },
  { group: 'Formal/Casual', name: 'Pajamas/Sleepwear', bar: null, cost: 15, massKg: 0.5, coverage: ['torso', 'arms', 'legs'], notes: '15-20 C' },
  { group: 'Formal/Casual', name: 'Shirt/Tunic', bar: null, cost: 3, massKg: 0.3, coverage: ['torso', 'arms'], notes: 'Arm coverage optional (3-15 C)' },
  { group: 'Formal/Casual', name: 'Shorts', bar: null, cost: 6, massKg: 0.04, coverage: ['legs'], notes: '6-10 C' },
  { group: 'Formal/Casual', name: 'Skirt/Kilt', bar: null, cost: 22, massKg: 0.035, coverage: ['legs'], notes: '22-25 C' },
  { group: 'Formal/Casual', name: 'Sweater/Sweatshirt', bar: null, cost: 5, massKg: 1, coverage: ['torso', 'arms'], notes: '5-12 C' },
  { group: 'Formal/Casual', name: 'Sweatpants', bar: null, cost: 8, massKg: 0.06, coverage: ['legs'], notes: '8-15 C' },
  { group: 'Formal/Casual', name: 'Swimwear (Male)', bar: null, cost: 7, massKg: 0.02, coverage: ['legs'], notes: '7-11 C' },
  { group: 'Formal/Casual', name: 'Swimwear (Female)', bar: null, cost: 12, massKg: 0.05, coverage: ['torso', 'legs'], notes: 'One-piece or bikini (12-19 C)' },
  { group: 'Formal/Casual', name: 'Socks/Stockings', bar: null, cost: 5, massKg: 0.012, coverage: ['feet'], notes: 'Stockings cover legs too (5-8 C)' },
  { group: 'Formal/Casual', name: 'Underwear (Male)', bar: null, cost: 3, massKg: 0.015, coverage: ['torso'], notes: 'Undershirt or briefs/boxers (3-5 C)' },
  { group: 'Formal/Casual', name: 'Underwear (Female)', bar: null, cost: 12, massKg: 0.011, coverage: ['torso'], notes: 'One-piece or two (12-25 C)' },
  { group: 'Formal/Casual', name: 'Vest/Apron', bar: null, cost: 4, massKg: 0.1, coverage: ['torso'], notes: 'Apron covers front only (4-9 C)' },
  { group: 'Military/Work', name: 'Fatigues', ar: 'B/A-A-A/A', bar: null, cost: 30, massKg: 0.5, coverage: ['torso', 'arms', 'legs'], notes: '' },
  { group: 'Military/Work', name: 'Jump Suit', ar: 'B/A-A-A/A', bar: null, cost: 24, massKg: 0.5, coverage: ['torso', 'arms', 'legs'], notes: '' },
  { group: 'Military/Work', name: 'Work Boots', ar: 'B/A-A-A/A', bar: [1, 1, 0, 1], cost: 36, massKg: 1.7, coverage: ['feet'], notes: '' },
  { group: 'Leatherwear', name: 'Leather Jacket', ar: 'A/A-A-A/A', bar: [1, 1, 0, 1], cost: 50, massKg: 2, coverage: ['torso', 'arms'], notes: '' },
  { group: 'Leatherwear', name: 'Leather Boots', ar: 'A/A-A-A/A', bar: [1, 1, 0, 1], cost: 25, massKg: 0.8, coverage: ['feet'], notes: '' },
  { group: 'Leatherwear', name: 'Leather Gloves', ar: 'A/A-A-A/A', bar: [1, 1, 0, 1], cost: 20, massKg: 0.4, coverage: ['hands'], notes: '-1 to DEX-related rolls' },
  { group: 'Leatherwear', name: 'Leather Pants/Chaps', ar: 'A/A-A-A/A', bar: [1, 1, 0, 1], cost: 35, massKg: 3, coverage: ['legs'], notes: '' },
  { group: 'Leatherwear', name: 'Leather Shoes', ar: 'A/A-A-A/A', bar: [1, 1, 0, 1], cost: 25, massKg: 0.8, coverage: ['feet'], notes: '' },
  { group: 'Leatherwear', name: 'Leather Vest/Apron', ar: 'A/A-A-A/A', bar: [1, 1, 0, 1], cost: 25, massKg: 1.2, coverage: ['torso'], notes: 'Apron covers front only' }
];
export const ARMOR_CLOTHING = CLOTHING_RAW.map(r => fromRaw('Clothing', r.group, { ar: 'A/A-A-A/A', ...r }));

// Faction armor kits, MechWarrior kits and pilot/special kits (ATOW pp.291-293).
// [folder, subfolder, name-prefix] per source sub-header; prefix keeps the
// generic garment names (Helmet/Suit/Boots) unique across factions.
const KIT_META = {
  'Capellan Confederation': ['Faction Armor Kits', 'Capellan Confederation', 'Capellan'],
  'Clans (Generic)': ['Faction Armor Kits', 'Clans', 'Clan'],
  'Comstar/Word of Blake': ['Faction Armor Kits', 'ComStar / Word of Blake', 'ComStar'],
  'Draconis Combine / Free Rasalhague Republic': ['Faction Armor Kits', 'Draconis Combine / Rasalhague', 'Draconis'],
  'Federated Suns': ['Faction Armor Kits', 'Federated Suns', 'FedSuns'],
  'Federated Suns (PAB-27 Elite Kit)': ['Faction Armor Kits', 'Federated Suns (PAB-27 Elite)', 'FedSuns PAB-27'],
  'Free Worlds League': ['Faction Armor Kits', 'Free Worlds League', 'FWL'],
  'Lyran Alliance': ['Faction Armor Kits', 'Lyran Alliance', 'Lyran'],
  'Magistracy of Canopus': ['Faction Armor Kits', 'Magistracy of Canopus', 'Magistracy'],
  'Marian Hegemony': ['Faction Armor Kits', 'Marian Hegemony', 'Marian'],
  'Taurian Concordat/Calderon Protectorate': ['Faction Armor Kits', 'Taurian / Calderon', 'Taurian'],
  'Periphery/Generic': ['Faction Armor Kits', 'Periphery / Generic', 'Periphery'],
  'MW (IS Regular)': ['MechWarrior Kits', 'Inner Sphere (Regular)', 'MW IS Regular'],
  'MW (IS Elite/ComStar)': ['MechWarrior Kits', 'Inner Sphere (Elite / ComStar)', 'MW IS Elite'],
  'MW (Clan)': ['MechWarrior Kits', 'Clan', 'MW Clan'],
  'Aerospace Pilot': ['Pilot & Special Kits', 'Aerospace Fighter Pilot', 'Aerospace Pilot'],
  'Special': ['Pilot & Special Kits', 'Special Combat Kits', '']
};

const KITS_RAW = [
  { grp: 'Capellan Confederation', name: 'Helmet', ar: 'C/B-B-B/D', bar: [3, 4, 5, 3], cost: 200, massKg: 2, coverage: ['head'], notes: 'Includes military comm.; -1 to Perception; AV 7 vs. flash', aff: 'CC' },
  { grp: 'Capellan Confederation', name: 'Suit', ar: 'B/B-B-B/C', bar: [3, 4, 3, 2], cost: 200, patch: 10, massKg: 4.5, coverage: ['torso', 'arms', 'legs'], notes: '2/2/3/2 BAR for arms and legs', aff: 'CC' },
  { grp: 'Capellan Confederation', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 2, coverage: ['feet'], notes: '' },
  { grp: 'Clans (Generic)', name: 'Helmet', ar: 'E/X-E-E/F', bar: [5, 6, 5, 3], cost: 1400, massKg: 1, coverage: ['head'], notes: 'Includes military comm., IR scanner, night vision, rangefinder; HC micro power pack (3 PP/h); +1 to Perception; AV 8 vs. flash', aff: 'CLAN' },
  { grp: 'Clans (Generic)', name: 'Suit', ar: 'E/X-E-E/F', bar: [3, 6, 5, 3], cost: 4000, patch: 150, massKg: 6, coverage: ['torso', 'arms', 'legs'], notes: '', aff: 'CLAN' },
  { grp: 'Clans (Generic)', name: 'Boots', ar: 'C/X-E-E/F', bar: [3, 5, 5, 3], cost: 100, patch: 20, massKg: 2, coverage: ['feet'], notes: '', aff: 'CLAN' },
  { grp: 'Clans (Generic)', name: 'Gloves', ar: 'C/X-E-E/F', bar: [1, 1, 3, 2], cost: 60, massKg: 0.5, coverage: ['hands'], notes: '', aff: 'CLAN' },
  { grp: 'Comstar/Word of Blake', name: 'Helmet', ar: 'F/X-D-D/F', bar: [4, 5, 5, 3], cost: 1200, massKg: 2, coverage: ['head'], notes: 'Includes military comm., IR scanner, night vision, rangefinder, ultrasonic detector (5 m); HC micro power pack (3 PP/h); +1 to Perception; AV 8 vs. flash', aff: 'CS' },
  { grp: 'Comstar/Word of Blake', name: 'Suit', ar: 'E/X-E-D/E', bar: [4, 6, 5, 4], cost: 3000, patch: 120, massKg: 8, coverage: ['torso', 'arms', 'legs'], notes: '', aff: 'CS' },
  { grp: 'Comstar/Word of Blake', name: 'Boots', ar: 'E/X-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 2, coverage: ['feet'], notes: '' },
  { grp: 'Comstar/Word of Blake', name: 'Gloves', ar: 'B/A-A-A/A', bar: [1, 1, 1, 1], cost: 30, massKg: 0.5, coverage: ['hands'], notes: '' },
  { grp: 'Draconis Combine / Free Rasalhague Republic', name: 'Helmet', ar: 'C/B-B-B/D', bar: [3, 4, 4, 2], cost: 200, massKg: 1, coverage: ['head'], notes: 'Includes military comm.; AV 7 vs. flash', aff: 'DC/FR' },
  { grp: 'Draconis Combine / Free Rasalhague Republic', name: 'Suit', ar: 'B/B-B-B/C', bar: [2, 2, 3, 1], cost: 100, patch: 8, massKg: 5, coverage: ['torso', 'arms', 'legs'], notes: '', aff: 'DC/FR' },
  { grp: 'Draconis Combine / Free Rasalhague Republic', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 2, coverage: ['feet'], notes: '' },
  { grp: 'Draconis Combine / Free Rasalhague Republic', name: 'Gloves', ar: 'B/A-A-A/A', bar: [1, 1, 1, 1], cost: 30, massKg: 0.5, coverage: ['hands'], notes: '' },
  { grp: 'Federated Suns', name: 'Helmet', ar: 'C/B-B-B/D', bar: [4, 5, 5, 4], cost: 500, massKg: 1.5, coverage: ['head'], notes: 'Includes military comm., IR scanner, rangefinder; HC micro power pack (2 PP/h); -1 to Perception; AV 7 vs. flash', aff: 'FS' },
  { grp: 'Federated Suns', name: 'Jacket', ar: 'B/B-B-B/C', bar: [3, 5, 4, 3], cost: 450, patch: 10, massKg: 5, coverage: ['torso', 'arms'], notes: '1/2/2/1 BAR for arms', aff: 'FS' },
  { grp: 'Federated Suns', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 2, coverage: ['feet'], notes: '' },
  { grp: 'Federated Suns', name: 'Gloves', ar: 'A/B-B-B/B', bar: [2, 2, 2, 2], cost: 40, massKg: 1, coverage: ['hands'], notes: '', aff: 'FS' },
  { grp: 'Federated Suns (PAB-27 Elite Kit)', name: 'Helmet', ar: 'D/X-X-C/D', bar: [4, 6, 5, 4], cost: 800, massKg: 2, coverage: ['head'], notes: 'Includes military comm., IR scanner, night vision, rangefinder; HC micro power pack (2 PP/h); -1 to Perception; AV 7 vs. flash', aff: 'FS' },
  { grp: 'Federated Suns (PAB-27 Elite Kit)', name: 'Vest', ar: 'D/X-X-C/D', bar: [4, 6, 5, 4], cost: 650, patch: 50, massKg: 7.5, coverage: ['torso'], notes: 'Encumbering', aff: 'FS' },
  { grp: 'Federated Suns (PAB-27 Elite Kit)', name: 'Arm Guards', ar: 'C/X-X-C/C', bar: [2, 4, 3, 3], cost: 100, massKg: 2, coverage: ['arms'], notes: '', aff: 'FS' },
  { grp: 'Federated Suns (PAB-27 Elite Kit)', name: 'Leg Guards', ar: 'C/X-X-C/C', bar: [2, 4, 4, 3], cost: 200, massKg: 3.5, coverage: ['legs'], notes: '', aff: 'FS' },
  { grp: 'Federated Suns (PAB-27 Elite Kit)', name: 'Boots', ar: 'C/X-X-D/C', bar: [2, 4, 4, 3], cost: 250, massKg: 2.5, coverage: ['feet'], notes: '', aff: 'FS' },
  { grp: 'Federated Suns (PAB-27 Elite Kit)', name: 'Gloves', ar: 'C/X-X-D/C', bar: [2, 2, 3, 3], cost: 80, massKg: 0.5, coverage: ['hands'], notes: 'DEX -1', aff: 'FS' },
  { grp: 'Free Worlds League', name: 'Helmet', ar: 'C/B-B-B/D', bar: [4, 4, 4, 3], cost: 250, massKg: 1, coverage: ['head'], notes: 'Includes military comm., IR scanner; HC micro power pack (1 PP/h); -1 to Perception; AV 7 vs. flash', aff: 'FW' },
  { grp: 'Free Worlds League', name: 'Suit', ar: 'B/B-B-B/D', bar: [5, 6, 4, 3], cost: 1500, patch: 30, massKg: 15, coverage: ['torso', 'arms', 'legs'], notes: 'Encumbering; 3/4/2/1 BAR for arms and legs', aff: 'FW' },
  { grp: 'Free Worlds League', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 3, coverage: ['feet'], notes: '' },
  { grp: 'Free Worlds League', name: 'Gloves', ar: 'B/A-A-A/A', bar: [1, 1, 1, 1], cost: 30, massKg: 0.5, coverage: ['hands'], notes: '' },
  { grp: 'Lyran Alliance', name: 'Helmet', ar: 'C/B-B-B/D', bar: [4, 6, 6, 4], cost: 300, massKg: 1.2, coverage: ['head'], notes: 'Includes military comm., IR scanner, night vision; HC micro power pack (1 PP/h); -1 to Perception; AV 7 vs. flash', aff: 'LA' },
  { grp: 'Lyran Alliance', name: 'Jacket', ar: 'B/B-B-B/D', bar: [3, 5, 4, 3], cost: 350, patch: 10, massKg: 3.5, coverage: ['torso', 'arms'], notes: '2/4/3/2 BAR for arms', aff: 'LA' },
  { grp: 'Lyran Alliance', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 2, coverage: ['feet'], notes: '' },
  { grp: 'Lyran Alliance', name: 'Gloves', ar: 'B/A-A-A/A', bar: [1, 1, 1, 1], cost: 30, massKg: 0.5, coverage: ['hands'], notes: '' },
  { grp: 'Magistracy of Canopus', name: 'Helmet', ar: 'C/B-B-B/D', bar: [5, 6, 5, 2], cost: 250, massKg: 1, coverage: ['head'], notes: 'Includes military comm., rangefinder; HC micro power pack (1 PP/h); -2 to Perception; AV 7 vs. flash', aff: 'MC' },
  { grp: 'Magistracy of Canopus', name: 'Vest', ar: 'C/A-A-A/B', bar: [1, 5, 2, 3], cost: 75, patch: 10, massKg: 3, coverage: ['torso'], notes: '', aff: 'MC' },
  { grp: 'Magistracy of Canopus', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 2, coverage: ['feet'], notes: '' },
  { grp: 'Magistracy of Canopus', name: 'Gloves', ar: 'B/A-A-A/A', bar: [1, 1, 1, 1], cost: 30, massKg: 0.5, coverage: ['hands'], notes: '' },
  { grp: 'Marian Hegemony', name: 'Helmet', ar: 'C/B-B-B/D', bar: [5, 6, 5, 2], cost: 300, massKg: 1, coverage: ['head'], notes: 'Includes military comm., night vision, rangefinder; HC micro power pack (1 PP/h); -1 to Perception; AV 6 vs. flash', aff: 'MH' },
  { grp: 'Marian Hegemony', name: 'Jacket', ar: 'B/B-B-B/D', bar: [3, 6, 4, 3], cost: 1200, patch: 25, massKg: 10, coverage: ['torso', 'arms'], notes: '', aff: 'MH' },
  { grp: 'Marian Hegemony', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 2, coverage: ['feet'], notes: '' },
  { grp: 'Marian Hegemony', name: 'Gloves', ar: 'B/A-A-A/A', bar: [1, 1, 1, 1], cost: 30, massKg: 0.5, coverage: ['hands'], notes: '' },
  { grp: 'Taurian Concordat/Calderon Protectorate', name: 'Helmet', ar: 'C/B-B-B/D', bar: [3, 5, 5, 3], cost: 210, massKg: 1, coverage: ['head'], notes: '-1 to Perception; AV 7 vs. flash', aff: 'TC' },
  { grp: 'Taurian Concordat/Calderon Protectorate', name: 'Jacket', ar: 'B/B-B-B/D', bar: [2, 3, 3, 2], cost: 50, patch: 5, massKg: 3, coverage: ['torso', 'arms'], notes: '', aff: 'TC' },
  { grp: 'Taurian Concordat/Calderon Protectorate', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 1.2, coverage: ['feet'], notes: '' },
  { grp: 'Taurian Concordat/Calderon Protectorate', name: 'Gloves', ar: 'B/B-B-B/B', bar: [2, 2, 2, 2], cost: 60, massKg: 0.5, coverage: ['hands'], notes: 'Includes military comm.', aff: 'TC' },
  { grp: 'Periphery/Generic', name: 'Helmet', ar: 'B/A-A-A/B', bar: [4, 5, 4, 2], cost: 180, massKg: 1.8, coverage: ['head'], notes: '-1 to Perception; AV 5 vs. flash' },
  { grp: 'Periphery/Generic', name: 'Jacket', ar: 'C/A-A-A/B', bar: [1, 5, 1, 3], cost: 100, patch: 10, massKg: 3.5, coverage: ['torso', 'arms'], notes: '' },
  { grp: 'Periphery/Generic', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 48, patch: 10, massKg: 2, coverage: ['feet'], notes: '' },
  { grp: 'MW (IS Regular)', name: 'Cooling Vest', ar: 'D/B-C-B/B', bar: [1, 2, 0, 1], cost: 200, massKg: 4, coverage: ['torso'], notes: 'Loses function at BAR 0 (treat as a Life-Support critical)' },
  { grp: 'MW (IS Regular)', name: 'Neurohelmet, Standard', ar: 'D/B-C-B/B', bar: [4, 4, 3, 2], cost: 900, massKg: 6, coverage: ['head'], notes: '-2 to Perception; Encumbering; required to safely pilot a Mech' },
  { grp: 'MW (IS Regular)', name: 'Shorts', ar: 'A/A-A-A/A', bar: [0, 0, 0, 0], cost: 6, massKg: 0.09, coverage: ['legs'], notes: '' },
  { grp: 'MW (IS Regular)', name: 'Plasteel Boots', ar: 'D/C-D-C/A', bar: [4, 6, 4, 4], cost: 175, patch: 50, massKg: 3, coverage: ['feet'], notes: '' },
  { grp: 'MW (IS Elite/ComStar)', name: 'Combat Suit', ar: 'E/B-F-C/D', bar: [2, 5, 1, 3], cost: 20000, patch: 50, massKg: 10, coverage: ['torso', 'arms', 'legs'], notes: '1/4/0/2 BAR for arms and legs' },
  { grp: 'MW (IS Elite/ComStar)', name: 'Neurohelmet, Combat', ar: 'E/B-D-B/B', bar: [2, 3, 2, 1], cost: 1400, massKg: 5, coverage: ['head'], notes: '-1 to Perception; Encumbering; may be sealed in hostile environments (1 h air); required to safely pilot a Mech' },
  { grp: 'MW (IS Elite/ComStar)', name: 'Plasteel Boots', ar: 'D/C-D-C/A', bar: [4, 6, 4, 4], cost: 175, patch: 50, massKg: 3, coverage: ['feet'], notes: '' },
  { grp: 'MW (Clan)', name: 'Cooling Suit', ar: 'E/X-E-D/B', bar: [2, 2, 1, 1], cost: 5000, patch: 500, massKg: 2, coverage: ['torso', 'arms', 'legs'], notes: '1/1/1/1 BAR for arms and legs; loses function at BAR 0 (Life-Support critical)', aff: 'CLAN' },
  { grp: 'MW (Clan)', name: 'Neurohelmet, Clan', ar: 'F/X-E-B/B', bar: [2, 3, 2, 1], cost: 5000, massKg: 3, coverage: ['head'], notes: 'Required to safely pilot a Mech', aff: 'CLAN' },
  { grp: 'MW (Clan)', name: 'Boots', ar: 'C/E-E-E/B', bar: [3, 5, 5, 3], cost: 100, patch: 20, massKg: 2, coverage: ['feet'], notes: '', aff: 'CLAN' },
  { grp: 'Aerospace Pilot', name: 'Combat Flight Suit', ar: 'C/B-C-B/B', bar: [2, 3, 2, 2], cost: 3000, patch: 300, massKg: 7, coverage: ['torso', 'arms', 'legs'], notes: 'May be sealed with gloves, boots and pilot helmet (48 h life support); loses function at BAR 0 (Life-Support critical)' },
  { grp: 'Aerospace Pilot', name: "Pilot's Neurohelmet", ar: 'C/B-C-B/B', bar: [2, 3, 2, 2], cost: 1200, massKg: 5, coverage: ['head'], notes: 'May be sealed with the combat flight suit; AV 10 vs. flash' },
  { grp: 'Aerospace Pilot', name: 'Flight Gloves', ar: 'A/A-A-A/A', bar: [0, 0, 0, 0], cost: 20, massKg: 0.5, coverage: ['hands'], notes: 'Required to seal the combat flight suit' },
  { grp: 'Aerospace Pilot', name: 'Boots', ar: 'B/A-A-A/A', bar: [2, 3, 3, 1], cost: 55, patch: 15, massKg: 3, coverage: ['feet'], notes: 'Required to seal the combat flight suit' },
  { grp: 'Special', name: 'Combat Space Suit', ar: 'C/D-D-D/D', bar: [1, 5, 1, 3], cost: 7000, patch: 15, massKg: 14, coverage: ['full'], notes: 'Encumbering; may be sealed in hostile environments (48 h life support); AV 8 vs. flash' },
  { grp: 'Special', name: 'Marine Combat Suit', ar: 'D/E-E-D/D', bar: [4, 5, 5, 2], cost: 15000, patch: 100, massKg: 20, coverage: ['full'], notes: '+2 to Zero-G Operations; may be sealed in hostile environments (18 h life support); AV 10 vs. flash' },
  { grp: 'Special', name: "Tanker's Smock", ar: 'C/B-C-B/C', bar: [3, 5, 5, 3], cost: 275, patch: 30, massKg: 7.5, coverage: ['torso'], notes: 'Replaces torso armor in standard infantry attire; incorporates cooling systems' }
];
export const ARMOR_KITS = KITS_RAW.map(r => {
  const [folder, sub, prefix] = KIT_META[r.grp];
  const name = prefix ? `${prefix} ${r.name}` : r.name;
  const bar = (r.bar || []).map(x => x || 0);
  return wearable(folder, sub, name, r.ar, bar.length ? bar : [0, 0, 0, 0], r.cost, r.patch || 0, r.massKg, r.coverage, r.notes, r.aff || '');
});

/** All armor seed entries (expanded), consumed by the armor seeder. */
export const ARMOR_SEED = [
  ...ARMOR_BASE,
  ...ARMOR_CONCEALED,
  ...ARMOR_ACCESSORIES,
  ...ARMOR_KITS,
  ...ARMOR_ENVIRONMENT,
  ...ARMOR_CLOTHING
].map(toArmorSeed);
