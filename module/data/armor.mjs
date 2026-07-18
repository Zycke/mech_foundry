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

/** All armor seed entries (expanded), consumed by the armor seeder. */
export const ARMOR_SEED = [...ARMOR_BASE, ...ARMOR_CONCEALED, ...ARMOR_ACCESSORIES].map(toArmorSeed);
