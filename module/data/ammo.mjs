/**
 * ammo.mjs
 * --------
 * Canonical seed data for the Ammunition compendium, transcribed from the
 * A Time of War EQUIPMENT chapter (Specialty Ammunition, Ordnance, Power Packs).
 * The seeder (helpers/ammo-seeder.mjs) imports these as editable `ammo` Items
 * grouped into folders by kind. Only the initial content — never the live source
 * of truth once a world is seeded.
 *
 * Compatibility is handled by the ammo-family system: each item's `ammoType`
 * (and, for ordnance, its `ordnanceClass`) is matched against a weapon's — no
 * per-item tagging. `ammoCategory` (ballistics/energy/ordnance) drives the
 * load/consume mechanics (magazine rounds vs power points vs ordnance).
 */

const AMMO_IMG = 'icons/weapons/ammunition/bullets-cartridge-brass.webp';

/**
 * Expand a raw ammo record into a seed entry { folder, subfolder?, item }.
 * Specialty rounds carry ap/bd *modifiers*; ordnance carries absolute ap/bd.
 */
export function toAmmoSeed(r) {
  const cap = r.quantityMax ?? 1;
  const noteParts = [];
  if (r.ar) noteParts.push(`AR ${r.ar}`);
  if (r.aff) noteParts.push(`Affiliation: ${r.aff}`);
  if (r.costMultiplier && r.costMultiplier !== 1) noteParts.push(`Cost ×${r.costMultiplier}`);
  if (r.notes) noteParts.push(r.notes);
  return {
    folder: r.folder || 'Ammunition',
    subfolder: r.subfolder || '',
    item: {
      name: r.name,
      img: r.img || AMMO_IMG,
      type: 'ammo',
      system: {
        description: r.description || '',
        ammoCategory: r.ammoCategory || 'ballistics',
        ammoType: r.ammoType || '',
        ordnanceClass: r.ordnanceClass || '',
        quantity: { value: cap, max: cap },
        mass: r.massKg ?? 0,
        cost: r.cost ?? 0,
        costMultiplier: r.costMultiplier ?? 1.0,
        apModifier: r.apModifier ?? 0,
        apFactorOverride: r.apFactorOverride || '',
        bdModifier: r.bdModifier ?? 0,
        bdFactorOverride: r.bdFactorOverride || '',
        rangeModifier: r.rangeModifier ?? 1.0,
        ap: r.ap ?? 0,
        bd: r.bd ?? 0,
        damageType: r.damageType || '',
        specialEffects: r.specialEffects || [],
        quickCharge: !!r.quickCharge,
        notes: noteParts.join('; '),
        loadedInWeapon: null
      },
      flags: { 'mech-foundry': { folder: r.folder || 'Ammunition', subfolder: r.subfolder || '' } }
    }
  };
}

/**
 * Specialty Ammunition (ATOW p.285). Ballistic rounds that MODIFY the weapon's
 * base AP/BD (apModifier/bdModifier) plus factor overrides, range and cost.
 * Family-matched: slug-thrower rounds are `ballistic`; shotgun-only rounds are
 * `flechette`; gauss/gyrojet specialty use their own families.
 */
export const SPECIALTY_AMMO = [
  { folder: 'Specialty Rounds', name: 'AET Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'D/D-X-D/C', costMultiplier: 2, aff: 'CS', specialEffects: ['half-ap-barriers'], notes: 'AP 50% (round down) vs. barriers' },
  { folder: 'Specialty Rounds', name: 'Air-Burst Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'D/X-X-D/E', apModifier: -1, apFactorOverride: 'X', bdModifier: -1, bdFactorOverride: 'S', costMultiplier: 8, aff: 'FS', specialEffects: ['guided'], notes: 'Rifles only; requires Guided Rifle module; Complex Action to attack' },
  { folder: 'Specialty Rounds', name: 'Armor-Piercing Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'C/C-E-D/D', apModifier: 2, apFactorOverride: 'B', bdModifier: -1, costMultiplier: 3, notes: 'Increased armor penetration' },
  { folder: 'Specialty Rounds', name: 'Explosive Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'C/C-E-D/D', apModifier: -1, apFactorOverride: 'X', bdModifier: 1, bdFactorOverride: 'S', costMultiplier: 3, specialEffects: ['splash'], notes: 'Explosive damage' },
  { folder: 'Specialty Rounds', name: 'Flechette Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'D/B-C-B/B', apModifier: -3, apFactorOverride: 'B', bdModifier: 1, bdFactorOverride: 'S', costMultiplier: 1, specialEffects: ['splash'], notes: 'Unavailable to shotguns' },
  { folder: 'Specialty Rounds', name: 'Frangible Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'C/D-X-D/B', apModifier: -1, apFactorOverride: 'B', bdModifier: 0, costMultiplier: 2, aff: 'CS', specialEffects: ['no-ap-barriers'], notes: '0 AP vs. barriers' },
  { folder: 'Specialty Rounds', name: 'Incendiary Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'C/B-C-C/C', apModifier: -1, apFactorOverride: 'B', bdModifier: -1, bdFactorOverride: 'CS', costMultiplier: 1.5, specialEffects: ['incendiary'], notes: 'Adds Continuous/Splash to BD' },
  { folder: 'Specialty Rounds', name: 'Radioactive Tracker Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'C/E-F-E/E', apModifier: 0, apFactorOverride: 'B', bdModifier: 0, costMultiplier: 3.5, specialEffects: ['tagged'], notes: 'Target tagged on a successful hit (even if undamaged); signature lasts 1 month; requires tracker scanner to spot' },
  { folder: 'Specialty Rounds', name: 'Shotgun Solid Slugs', ammoCategory: 'ballistics', ammoType: 'flechette', ar: 'B/A-A-A/B', apModifier: 3, apFactorOverride: 'B', bdModifier: 0, bdFactorOverride: 'S', costMultiplier: 4, notes: 'Shotguns only' },
  { folder: 'Specialty Rounds', name: 'Subsonic Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'C/B-C-C/D', apModifier: -2, apFactorOverride: 'B', bdModifier: -1, rangeModifier: 0.5, costMultiplier: 1, notes: 'Half range; -1 Perception to hear the shot' },
  { folder: 'Specialty Rounds', name: 'Tracer Rounds', ammoCategory: 'ballistics', ammoType: 'ballistic', ar: 'C/B-B-B/B', costMultiplier: 1.5, specialEffects: ['tracer'], notes: '+1 attack modifier for suppression fire or in darkness; +2 Perception to spot the attacker' },
  // Gauss specialty
  { folder: 'Specialty Rounds', name: 'GDPC Rounds (Gauss)', ammoCategory: 'ballistics', ammoType: 'gauss', ar: 'D/X-X-F/E', costMultiplier: 2, aff: 'FW', specialEffects: ['half-ap-barriers'], notes: 'For support Gauss weapons only; penetrating discarding-sabot rounds' },
  // Gyrojet specialty
  { folder: 'Specialty Rounds', name: 'Guided Gyrojet Rounds', ammoCategory: 'ballistics', ammoType: 'gyrojet', ar: 'E/X-X-E/E', apModifier: -1, apFactorOverride: 'B', bdModifier: -1, costMultiplier: 8, specialEffects: ['guided'], notes: 'Requires Guided Rifle module; Complex Action to attack; +2 to attack' }
];

/**
 * Standard reloads — the baseline (unmodified) ammunition for each family, for
 * players who want to track loose reloads/boxes. Quantities are a convenient
 * default; adjust per purchase.
 */
export const STANDARD_AMMO = [
  { folder: 'Standard Rounds', name: 'Standard Rounds (Ballistic)', ammoCategory: 'ballistics', ammoType: 'ballistic', quantityMax: 50, massKg: 0.5, cost: 5, notes: 'Standard slug-thrower ammunition — no modifiers' },
  { folder: 'Standard Rounds', name: 'Shotgun Shells', ammoCategory: 'ballistics', ammoType: 'flechette', quantityMax: 25, massKg: 0.5, cost: 5, notes: 'Standard shotgun/needler load — no modifiers' },
  { folder: 'Standard Rounds', name: 'Gauss Slugs', ammoCategory: 'ballistics', ammoType: 'gauss', quantityMax: 20, massKg: 0.5, cost: 10, notes: 'Standard Gauss ammunition (also requires a power pack)' },
  { folder: 'Standard Rounds', name: 'Gyrojet Rockets', ammoCategory: 'ballistics', ammoType: 'gyrojet', quantityMax: 20, massKg: 0.5, cost: 10, notes: 'Standard gyrojet mini-rockets — no modifiers' }
];

/** Power Packs (ATOW p.306). Energy ammunition; quantity = Power Points (PP). */
export const POWER_PACKS = [
  { folder: 'Power Packs', name: 'Power Pack', ammoCategory: 'energy', ammoType: 'power-pack', ar: 'C/A-B-A/A', cost: 5, massKg: 0.25, quantityMax: 20, notes: 'Standard rechargeable power pack (20 PP)' },
  { folder: 'Power Packs', name: 'Micro Power Pack', ammoCategory: 'energy', ammoType: 'power-pack', ar: 'C/A-B-A/A', cost: 10, massKg: 0.015, quantityMax: 15, notes: 'Compact power pack (15 PP)' },
  { folder: 'Power Packs', name: 'Military Power Pack', ammoCategory: 'energy', ammoType: 'power-pack', ar: 'D/A-B-A/B', cost: 40, massKg: 4, quantityMax: 200, notes: 'High-capacity military power pack (200 PP)' },
  { folder: 'Power Packs', name: 'Power Pack (Clan)', ammoCategory: 'energy', ammoType: 'power-pack', ar: 'F/X-D-B/A', cost: 25, massKg: 0.275, quantityMax: 30, aff: 'CLAN', quickCharge: true, notes: 'Clan quick-charge power pack (30 PP)' },
  { folder: 'Power Packs', name: 'Micro Power Pack (Clan)', ammoCategory: 'energy', ammoType: 'power-pack', ar: 'F/X-E-C/A', cost: 50, massKg: 0.015, quantityMax: 20, aff: 'CLAN', quickCharge: true, notes: 'Clan quick-charge compact power pack (20 PP)' }
];

/**
 * Ordnance (ATOW pp.282-284). Grenade/mortar/missile/recoilless munitions,
 * classified by ordnance class (A-E). These carry ABSOLUTE ap/bd plus a
 * damageType (apFactor) and load into any ordnance weapon of the matching
 * class — matching is generic by class, not by weapon sub-family.
 *
 * Raw rows transcribed from the ORDNANCE table (EQUIPMENT chapter). `ap`/`bd`
 * are absolute values; `apFactor` becomes the ordnance damageType; `bdFactor`
 * becomes the bdFactorOverride. Non-damaging ordnance (flares, smoke, Narc,
 * FASCAM) carry null ap/bd. `typeNote` is the shared rules text for the type.
 */
const ORDNANCE_RAW = [
  { type: 'Anti-Personnel', ordnanceClass: 'A', ar: 'C/B-C-C/E', ap: 2, apFactor: 'X', bd: 8, bdFactor: 'A', cost: 2, aff: '', massKg: 0.2, typeNote: '', notes: '' },
  { type: 'Anti-Personnel', ordnanceClass: 'B', ar: 'C/A-B-B/E', ap: 3, apFactor: 'X', bd: 10, bdFactor: 'A', cost: 8, aff: '', massKg: 0.45, typeNote: '', notes: '' },
  { type: 'Anti-Personnel', ordnanceClass: 'C', ar: 'C/A-B-A/E', ap: 4, apFactor: 'X', bd: 12, bdFactor: 'A', cost: 16, aff: '', massKg: 0.6, typeNote: '', notes: '' },
  { type: 'Anti-Personnel', ordnanceClass: 'D', ar: 'C/A-B-B/E', ap: 4, apFactor: 'X', bd: 13, bdFactor: 'A', cost: 24, aff: '', massKg: 2, typeNote: '', notes: '' },
  { type: 'Anti-Personnel', ordnanceClass: 'E', ar: 'C/A-B-B/E', ap: 4, apFactor: 'X', bd: 14, bdFactor: 'A', cost: 32, aff: '', massKg: 4, typeNote: '', notes: '' },

  { type: 'Air-Burst', ordnanceClass: 'D', ar: 'D/X-X-C/F', ap: 5, apFactor: 'X', bd: 10, bdFactor: 'A', cost: 60, aff: 'FW', massKg: 2, typeNote: 'Mortars only; attack ignores any ground-level cover.', notes: '' },
  { type: 'Air-Burst', ordnanceClass: 'E', ar: 'D/X-X-C/F', ap: 5, apFactor: 'X', bd: 11, bdFactor: 'A', cost: 80, aff: 'FW', massKg: 4, typeNote: 'Mortars only; attack ignores any ground-level cover.', notes: '' },

  { type: 'Anti-Vehicle', ordnanceClass: 'C', ar: 'C/B-C-C/E', ap: 8, apFactor: 'X', bd: 10, bdFactor: 'A', cost: 100, aff: '', massKg: 1, typeNote: 'Maximum 1-metre blast area; halve AP/BD for targets in the area not directly hit.', notes: '' },
  { type: 'Anti-Vehicle', ordnanceClass: 'D', ar: 'C/B-C-C/E', ap: 8, apFactor: 'X', bd: 11, bdFactor: 'A', cost: 250, aff: '', massKg: 3, typeNote: 'Maximum 1-metre blast area; halve AP/BD for targets in the area not directly hit.', notes: '' },
  { type: 'Anti-Vehicle', ordnanceClass: 'E', ar: 'C/B-C-C/E', ap: 8, apFactor: 'X', bd: 12, bdFactor: 'A', cost: 400, aff: '', massKg: 5, typeNote: 'Maximum 1-metre blast area; halve AP/BD for targets in the area not directly hit.', notes: '' },

  { type: 'FASCAM', ordnanceClass: 'D', ar: 'D/X-X-B/E', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 50, aff: 'CC', massKg: 3, typeNote: 'Increase minefield density by 2. Deploys anti-personnel/high-explosive/inferno mines (Ordnance Type B) over the area (see Standard Explosives, p.277).', notes: 'Affects 3m radius' },
  { type: 'FASCAM', ordnanceClass: 'E', ar: 'D/X-X-B/E', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 100, aff: 'CC', massKg: 5, typeNote: 'Increase minefield density by 2. Deploys anti-personnel/high-explosive/inferno mines (Ordnance Type B) over the area (see Standard Explosives, p.277).', notes: 'Affects 5m radius' },

  { type: 'Flare', ordnanceClass: 'A', ar: 'C/A-B-B/B', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 1, aff: '', massKg: 0.2, typeNote: 'Negates darkness modifiers for 25 seconds.', notes: 'Illuminates 50m radius' },
  { type: 'Flare', ordnanceClass: 'B', ar: 'C/A-B-B/B', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 2, aff: '', massKg: 0.45, typeNote: 'Negates darkness modifiers for 25 seconds.', notes: 'Illuminates 75m radius' },
  { type: 'Flare', ordnanceClass: 'C', ar: 'C/A-B-A/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 4, aff: '', massKg: 0.6, typeNote: 'Negates darkness modifiers for 25 seconds.', notes: 'Illuminates 100m radius' },
  { type: 'Flare', ordnanceClass: 'D', ar: 'C/A-B-B/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 10, aff: '', massKg: 2, typeNote: 'Negates darkness modifiers for 25 seconds.', notes: 'Illuminates 200m radius' },
  { type: 'Flare', ordnanceClass: 'E', ar: 'C/A-B-B/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 20, aff: '', massKg: 4, typeNote: 'Negates darkness modifiers for 25 seconds.', notes: 'Illuminates 300m radius' },

  { type: 'Flash', ordnanceClass: 'A', ar: 'C/B-C-C/D', ap: 2, apFactor: 'S', bd: 2, bdFactor: 'AD', cost: 2, aff: '', massKg: 0.2, typeNote: 'No effect vs. anti-flash BAR higher than the ordnance AP; if the attack exceeds the target\'s BAR, the target is Blinded for turns equal to the Flash damage.', notes: '' },
  { type: 'Flash', ordnanceClass: 'B', ar: 'C/A-B-B/C', ap: 3, apFactor: 'S', bd: 3, bdFactor: 'AD', cost: 8, aff: '', massKg: 0.45, typeNote: 'No effect vs. anti-flash BAR higher than the ordnance AP; if the attack exceeds the target\'s BAR, the target is Blinded for turns equal to the Flash damage.', notes: '' },
  { type: 'Flash', ordnanceClass: 'C', ar: 'C/A-B-A/C', ap: 4, apFactor: 'S', bd: 4, bdFactor: 'AD', cost: 16, aff: '', massKg: 0.6, typeNote: 'No effect vs. anti-flash BAR higher than the ordnance AP; if the attack exceeds the target\'s BAR, the target is Blinded for turns equal to the Flash damage.', notes: '' },
  { type: 'Flash', ordnanceClass: 'D', ar: 'C/A-B-B/C', ap: 5, apFactor: 'S', bd: 5, bdFactor: 'AD', cost: 24, aff: '', massKg: 2, typeNote: 'No effect vs. anti-flash BAR higher than the ordnance AP; if the attack exceeds the target\'s BAR, the target is Blinded for turns equal to the Flash damage.', notes: '' },
  { type: 'Flash', ordnanceClass: 'E', ar: 'C/A-B-B/C', ap: 7, apFactor: 'S', bd: 6, bdFactor: 'AD', cost: 32, aff: '', massKg: 4, typeNote: 'No effect vs. anti-flash BAR higher than the ordnance AP; if the attack exceeds the target\'s BAR, the target is Blinded for turns equal to the Flash damage.', notes: '' },

  { type: 'Gas', ordnanceClass: 'A', ar: 'C/B-D-D/E', ap: 1, apFactor: 'S', bd: 5, bdFactor: 'ACD', cost: 2, aff: '', massKg: 0.2, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). Standard tear-gas damage; other inhaled poisons of equal BD may substitute. Negated/reduced by hostile-environment gear.', notes: 'Affects 3m radius' },
  { type: 'Gas', ordnanceClass: 'B', ar: 'C/B-C-C/E', ap: 1, apFactor: 'S', bd: 5, bdFactor: 'ACD', cost: 10, aff: '', massKg: 0.45, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). Standard tear-gas damage; other inhaled poisons of equal BD may substitute. Negated/reduced by hostile-environment gear.', notes: 'Affects 6m radius' },
  { type: 'Gas', ordnanceClass: 'C', ar: 'C/B-C-B/E', ap: 1, apFactor: 'S', bd: 5, bdFactor: 'ACD', cost: 20, aff: '', massKg: 0.6, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). Standard tear-gas damage; other inhaled poisons of equal BD may substitute. Negated/reduced by hostile-environment gear.', notes: 'Affects 9m radius' },
  { type: 'Gas', ordnanceClass: 'D', ar: 'C/B-C-B/E', ap: 1, apFactor: 'S', bd: 5, bdFactor: 'ACD', cost: 30, aff: '', massKg: 2, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). Standard tear-gas damage; other inhaled poisons of equal BD may substitute. Negated/reduced by hostile-environment gear.', notes: 'Affects 12m radius' },
  { type: 'Gas', ordnanceClass: 'E', ar: 'C/B-C-C/E', ap: 1, apFactor: 'S', bd: 5, bdFactor: 'ACD', cost: 40, aff: '', massKg: 4, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). Standard tear-gas damage; other inhaled poisons of equal BD may substitute. Negated/reduced by hostile-environment gear.', notes: 'Affects 15m radius' },

  { type: 'Guided', ordnanceClass: 'D', ar: 'D/X-X-C/F', ap: 5, apFactor: 'X', bd: 10, bdFactor: 'A', cost: 120, aff: 'FW', massKg: 2, typeNote: 'Mortars only; +2 attack modifier vs. any target designated by friendly TAG.', notes: '' },
  { type: 'Guided', ordnanceClass: 'E', ar: 'D/X-X-C/F', ap: 5, apFactor: 'X', bd: 11, bdFactor: 'A', cost: 160, aff: 'FW', massKg: 4, typeNote: 'Mortars only; +2 attack modifier vs. any target designated by friendly TAG.', notes: '' },

  { type: 'High-Explosive', ordnanceClass: 'A', ar: 'C/B-D-C/E', ap: 4, apFactor: 'X', bd: 6, bdFactor: 'A', cost: 2, aff: '', massKg: 0.2, typeNote: '', notes: '' },
  { type: 'High-Explosive', ordnanceClass: 'B', ar: 'C/B-C-B/E', ap: 5, apFactor: 'X', bd: 8, bdFactor: 'A', cost: 10, aff: '', massKg: 0.45, typeNote: '', notes: '' },
  { type: 'High-Explosive', ordnanceClass: 'C', ar: 'C/A-A-A/E', ap: 6, apFactor: 'X', bd: 10, bdFactor: 'A', cost: 20, aff: '', massKg: 0.6, typeNote: '', notes: '' },
  { type: 'High-Explosive', ordnanceClass: 'D', ar: 'C/A-B-B/E', ap: 6, apFactor: 'X', bd: 11, bdFactor: 'A', cost: 30, aff: '', massKg: 2, typeNote: '', notes: '' },
  { type: 'High-Explosive', ordnanceClass: 'E', ar: 'C/A-B-B/E', ap: 6, apFactor: 'X', bd: 12, bdFactor: 'A', cost: 40, aff: '', massKg: 4, typeNote: '', notes: '' },

  { type: 'Inferno', ordnanceClass: 'B', ar: 'C/B-D-C/E', ap: 3, apFactor: 'E', bd: 3, bdFactor: 'ACS', cost: 8, aff: '', massKg: 0.45, typeNote: 'No effect in thin atmospheres/vacuum; ignites affected terrain and lasts 4D6 minutes (2D6 in rain/snow).', notes: '' },
  { type: 'Inferno', ordnanceClass: 'C', ar: 'C/B-C-B/E', ap: 3, apFactor: 'E', bd: 5, bdFactor: 'ACS', cost: 16, aff: '', massKg: 0.6, typeNote: 'No effect in thin atmospheres/vacuum; ignites affected terrain and lasts 4D6 minutes (2D6 in rain/snow).', notes: '' },
  { type: 'Inferno', ordnanceClass: 'D', ar: 'C/B-C-B/E', ap: 3, apFactor: 'E', bd: 7, bdFactor: 'ACS', cost: 24, aff: '', massKg: 2, typeNote: 'No effect in thin atmospheres/vacuum; ignites affected terrain and lasts 4D6 minutes (2D6 in rain/snow).', notes: '' },
  { type: 'Inferno', ordnanceClass: 'E', ar: 'C/B-C-B/E', ap: 3, apFactor: 'E', bd: 9, bdFactor: 'ACS', cost: 32, aff: '', massKg: 4, typeNote: 'No effect in thin atmospheres/vacuum; ignites affected terrain and lasts 4D6 minutes (2D6 in rain/snow).', notes: '' },

  { type: 'Narc', ordnanceClass: 'C', ar: 'E/E-X-E/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 600, aff: 'CS', massKg: 1, typeNote: 'Attack modifier applies to friendly infantry-launched Narc-compatible missiles. Only anti-vehicle/high-explosive ordnance may be Narc-enhanced (-1 BD, +50% cost).', notes: '+1 to infantry-portable Narc-compatible missiles' },
  { type: 'Narc', ordnanceClass: 'D', ar: 'E/D-X-D/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 800, aff: 'CS', massKg: 3, typeNote: 'Attack modifier applies to friendly infantry-launched Narc-compatible missiles. Only anti-vehicle/high-explosive ordnance may be Narc-enhanced (-1 BD, +50% cost).', notes: '+2 to infantry-portable Narc-compatible missiles' },
  { type: 'Narc', ordnanceClass: 'E', ar: 'E/D-X-D/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 1000, aff: 'CS', massKg: 5, typeNote: 'Attack modifier applies to friendly infantry-launched Narc-compatible missiles. Only anti-vehicle/high-explosive ordnance may be Narc-enhanced (-1 BD, +50% cost).', notes: '+3 to infantry-portable Narc-compatible missiles' },

  { type: 'Smoke', ordnanceClass: 'A', ar: 'C/A-B-B/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 1, aff: '', massKg: 0.2, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). See Weather Conditions (p.237).', notes: 'Affects 3m radius' },
  { type: 'Smoke', ordnanceClass: 'B', ar: 'C/A-A-A/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 2, aff: '', massKg: 0.45, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). See Weather Conditions (p.237).', notes: 'Affects 6m radius' },
  { type: 'Smoke', ordnanceClass: 'C', ar: 'B/A-A-A/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 4, aff: '', massKg: 0.6, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). See Weather Conditions (p.237).', notes: 'Affects 9m radius' },
  { type: 'Smoke', ordnanceClass: 'D', ar: 'B/A-A-A/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 10, aff: '', massKg: 2, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). See Weather Conditions (p.237).', notes: 'Affects 12m radius' },
  { type: 'Smoke', ordnanceClass: 'E', ar: 'B/A-A-B/C', ap: null, apFactor: '', bd: null, bdFactor: '', cost: 20, aff: '', massKg: 4, typeNote: 'No effect in thin atmospheres/vacuum; lasts 4D6 turns (2D6 in strong winds). See Weather Conditions (p.237).', notes: 'Affects 15m radius' },

  { type: 'Stun', ordnanceClass: 'B', ar: 'D/A-B-B/C', ap: 1, apFactor: 'S', bd: 8, bdFactor: 'AD', cost: 10, aff: '', massKg: 0.45, typeNote: '', notes: '' },
  { type: 'Stun', ordnanceClass: 'C', ar: 'C/A-B-A/C', ap: 1, apFactor: 'S', bd: 10, bdFactor: 'AD', cost: 20, aff: '', massKg: 0.6, typeNote: '', notes: '' },
  { type: 'Stun', ordnanceClass: 'D', ar: 'C/A-A-A/D', ap: 1, apFactor: 'S', bd: 12, bdFactor: 'AD', cost: 30, aff: '', massKg: 2, typeNote: '', notes: '' },
  { type: 'Stun', ordnanceClass: 'E', ar: 'C/A-B-B/D', ap: 1, apFactor: 'S', bd: 14, bdFactor: 'AD', cost: 40, aff: '', massKg: 4, typeNote: '', notes: '' }
];

/** Map a raw ordnance row into the ammo seed record shape. */
function toOrdnanceRecord(o) {
  const noteBits = [];
  if (o.notes) noteBits.push(o.notes);
  if (o.typeNote) noteBits.push(o.typeNote);
  return {
    folder: 'Ordnance',
    subfolder: o.type,
    name: `${o.type} Ordnance (Class ${o.ordnanceClass})`,
    ammoCategory: 'ordnance',
    ammoType: 'ordnance',
    ordnanceClass: o.ordnanceClass,
    ap: o.ap ?? 0,
    damageType: o.apFactor || '',
    bd: o.bd ?? 0,
    bdFactorOverride: o.bdFactor || '',
    ar: o.ar,
    aff: o.aff,
    cost: o.cost,
    massKg: o.massKg,
    quantityMax: 1,
    notes: noteBits.join(' ')
  };
}

export const ORDNANCE = ORDNANCE_RAW.map(toOrdnanceRecord);

/** All ammo seed entries (expanded), consumed by the ammo seeder. */
export const AMMO_SEED = [
  ...SPECIALTY_AMMO,
  ...STANDARD_AMMO,
  ...POWER_PACKS,
  ...ORDNANCE
].map(toAmmoSeed);
