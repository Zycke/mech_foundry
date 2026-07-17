/**
 * weapons.mjs
 * -----------
 * Canonical seed data for the Weapons compendium, transcribed from the
 * A Time of War EQUIPMENT chapter. On first load the seeder
 * (helpers/weapon-seeder.mjs) imports these into the `mech-foundry.weapons`
 * pack as editable `weapon` Items, grouped into folders by Skill and then by
 * weapon sub-category (e.g. Small Arms › Ballistic). Like the other reference
 * compendia this file is only the initial content, never the live source of
 * truth once a world is seeded.
 *
 * Each raw record mirrors the ATOW weapon-table columns:
 *   ITEM | EQUIPMENT RATINGS | AP/BD | RANGE | SHOTS | COST/RELOAD | AFF |
 *   MASS/RELOAD | NOTES
 * and is expanded by `toWeaponSeed()` into a { skill, category, item } entry
 * matching the template.json `weapon` schema.
 */

const IMG = 'icons/weapons/guns/gun-pistol-flintlock-metal.webp';

/**
 * Expand a raw ATOW weapon record into a seed entry.
 * @param {object} r  raw record (see SMALL_ARMS below)
 * @returns {{ skill: string, category: string, item: object }}
 */
export function toWeaponSeed(r) {
  const range = Array.isArray(r.range) ? r.range : [];
  const notes = r.notes && r.notes !== '—' ? r.notes : '';
  return {
    skill: r.skill || 'Small Arms',
    category: r.subCategory || 'Other',
    item: {
      name: r.name,
      img: r.img || IMG,
      type: 'weapon',
      system: {
        description: r.description || '',
        equipmentRating: r.ar || '',
        cost: r.cost ?? 0,
        affiliation: r.aff || '',
        mass: r.massKg ?? 0,
        notes,
        carryStatus: 'carried',
        itemEffects: [],
        weaponType: r.weaponType || 'ranged',
        skill: r.skill || 'Small Arms',
        ap: r.ap ?? 0,
        apFactor: r.apFactor || 'B',
        bd: r.bd ?? 0,
        bdFactor: r.bdFactor || '',
        subduing: !!r.subduing,
        recoil: r.recoil ?? 0,
        burstRating: r.burst ?? 0,
        range: {
          pointBlank: '',
          short: range[0] ?? '',
          medium: range[1] ?? '',
          long: range[2] ?? '',
          extreme: range[3] ?? ''
        },
        ammo: { value: r.shots ?? 0, max: r.shots ?? 0 },
        reloadCost: r.reloadCost ?? 0,
        // Table reload mass is in grams; store kilograms to match `mass`.
        reloadMass: r.reloadMassG != null ? Math.round((r.reloadMassG / 1000) * 1000) / 1000 : 0,
        loadedAmmo: null,
        loadedAmmoName: '',
        loadedAmmoCategory: '',
        pps: r.pps ?? 0,
        ammoCompatibility: r.ammoCompatibility || [],
        animation: '',
        animationDelay: 50,
        animationDuration: 0
      },
      // Skill/category are surfaced in flags so the sheet or other tooling can
      // read them; the seeder uses them to build the folder tree.
      flags: { 'mech-foundry': { skill: r.skill || 'Small Arms', category: r.subCategory || 'Other' } }
    }
  };
}

/**
 * Small Arms (ATOW pp. 263-267). Skill: Small Arms. All `ranged`.
 * Records mirror the table columns; see toWeaponSeed() for field meanings.
 * (Populated from the EQUIPMENT chapter extraction.)
 */
export const SMALL_ARMS = [
  // Filled in below.
];

/** All weapon seed entries (expanded), consumed by the weapon seeder. */
export const WEAPON_SEED = [
  ...SMALL_ARMS
].map(r => toWeaponSeed({ skill: 'Small Arms', weaponType: 'ranged', ...r }));
