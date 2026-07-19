/**
 * Shared cargo / bay / supply definitions and helpers used by both the company
 * sheet (Logistics tab) and the naval ship sheet (Bay tab).
 *
 * Supplies are stored on the location actor (`system.cargoSupplies`) and each
 * unit of supply weighs 1 ton. A ship's cargo capacity is the summed tonnage of
 * its Cargo bay components; used tonnage is the sum of all stored supplies.
 */

/** Ship-supply categories (numeric, tons). */
export const SHIP_SUPPLY_FIELDS = [
  { key: 'fuel', label: 'Ship Fuel' },
  { key: 'consumables', label: 'Ship Consumables' },
  { key: 'lifeSupport', label: 'Life Support' },
  { key: 'medicalSustainment', label: 'Medical Sustainment' },
  { key: 'emergencyMedical', label: 'Emergency Medical' },
  { key: 'spareParts', label: 'Spare Parts' }
];

/** Ground-forces supply categories, grouped for display (numeric, tons). */
export const GROUND_SUPPLY_GROUPS = [
  {
    label: 'Spare Parts', fields: [
      { key: 'sparePartsMech', label: 'Mechs' },
      { key: 'sparePartsAero', label: 'Aerospace' },
      { key: 'sparePartsVehicle', label: 'Vehicles' },
      { key: 'sparePartsBA', label: 'Battle Armor' }
    ]
  },
  {
    label: 'Maintenance Consumables', fields: [
      { key: 'maintMech', label: 'Mechs' },
      { key: 'maintAero', label: 'Aerospace' },
      { key: 'maintVehicle', label: 'Vehicles' },
      { key: 'maintBA', label: 'Battle Armor' },
      { key: 'maintTroops', label: 'Troops' }
    ]
  },
  {
    label: 'Fuel', fields: [
      { key: 'fuel', label: 'Ground Fuel' }
    ]
  }
];

export const GROUND_SUPPLY_FIELDS = GROUND_SUPPLY_GROUPS.flatMap(g => g.fields);

/** Bay component types (a bay panel holds any number of these). */
export const BAY_COMPONENT_TYPES = [
  { key: 'aeroCubicle', label: 'Aerospace Fighter Cubicle', unitType: 'aerospace_fighter' },
  { key: 'smallCraftCubicle', label: 'Small Craft Cubicle', unitType: null },
  { key: 'mechCubicle', label: 'Battlemech Cubicle', unitType: 'mech' },
  { key: 'heavyVeeCubicle', label: 'Heavy Vehicle Cubicle', unitType: 'ground_vehicle' },
  { key: 'lightVeeCubicle', label: 'Light Vehicle Cubicle', unitType: 'ground_vehicle' },
  { key: 'baSquadBay', label: 'Battle Armor Squad Bay', unitType: 'battle_armor', hasSquadSize: true },
  { key: 'cargo', label: 'Cargo', hasTonnage: true }
];

export function bayComponentDef(key) {
  return BAY_COMPONENT_TYPES.find(t => t.key === key) || null;
}

/** A fresh, zeroed cargo-supplies structure. */
export function blankCargoSupplies() {
  const ship = {};
  for (const f of SHIP_SUPPLY_FIELDS) ship[f.key] = 0;
  const ground = {};
  for (const f of GROUND_SUPPLY_FIELDS) ground[f.key] = 0;
  return { ship, ground, shipAmmo: [], groundAmmo: [] };
}

/**
 * Total cargo tonnage available on an actor. Naval ships derive it from their
 * Cargo bay components; other location actors (e.g. installations) are treated
 * as unlimited for now (their bay model isn't built yet).
 */
export function cargoCapacity(actor) {
  if (!actor) return 0;
  if (actor.type !== 'naval_ship') return Infinity;
  let cap = 0;
  for (const bay of (actor.system.bays || [])) {
    for (const c of (bay.components || [])) {
      if (c.type === 'cargo') cap += Number(c.tonnage) || 0;
    }
  }
  return cap;
}

/** Total supply tonnage currently stored on an actor (1 ton per unit). */
export function cargoUsed(actor) {
  const cs = actor?.system?.cargoSupplies || {};
  let used = 0;
  for (const k of Object.keys(cs.ship || {})) used += Number(cs.ship[k]) || 0;
  for (const k of Object.keys(cs.ground || {})) used += Number(cs.ground[k]) || 0;
  for (const a of (cs.shipAmmo || [])) used += Number(a.value) || 0;
  for (const a of (cs.groundAmmo || [])) used += Number(a.value) || 0;
  return used;
}

/** Free cargo tonnage on an actor (Infinity when uncapped). */
export function cargoFree(actor) {
  const cap = cargoCapacity(actor);
  if (cap === Infinity) return Infinity;
  return Math.max(0, cap - cargoUsed(actor));
}
