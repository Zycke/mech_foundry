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

/**
 * A location actor's bays as an array. Older ship actors stored `bays` as an
 * object ({bay1, bay2, bay3}); those are treated as no bays until re-saved.
 */
export function bayList(actor) {
  const b = actor?.system?.bays;
  return Array.isArray(b) ? b : [];
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
  for (const bay of bayList(actor)) {
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

/* -------------------------------------------- */
/*  Cubicle occupancy (MTOE units ↔ ship bays)  */
/* -------------------------------------------- */

/** Each combat vehicle actor type → the cubicle component types that hold it. */
export const VEHICLE_CUBICLE_TYPES = {
  aerospace_fighter: ['aeroCubicle'],
  mech: ['mechCubicle'],
  ground_vehicle: ['heavyVeeCubicle', 'lightVeeCubicle'],
  battle_armor: ['baSquadBay']
};

/** Ship cubicles grouped by the vehicle type they accept. */
export function shipCubiclesByVehicle(actor) {
  const out = {};
  for (const vt of Object.keys(VEHICLE_CUBICLE_TYPES)) out[vt] = [];
  for (const bay of bayList(actor)) {
    for (const c of (bay.components || [])) {
      for (const vt of Object.keys(VEHICLE_CUBICLE_TYPES)) {
        if (VEHICLE_CUBICLE_TYPES[vt].includes(c.type)) {
          out[vt].push({ bayId: bay.id, bayName: bay.name, compId: c.id, manualUnitId: c.unitId || '' });
        }
      }
    }
  }
  return out;
}

/**
 * Every MTOE vehicle currently assigned to a ship (by any company), grouped by
 * vehicle type. Optionally exclude one MTOE box (used when re-checking that box).
 */
export function mtoeVehiclesAtShip(shipId, excludeBoxId = null) {
  const out = {};
  for (const vt of Object.keys(VEHICLE_CUBICLE_TYPES)) out[vt] = [];
  for (const company of game.actors) {
    if (company.type !== 'company') continue;
    for (const box of (company.system?.mtoe || [])) {
      if (box.locationId !== shipId) continue;
      if (excludeBoxId && box.id === excludeBoxId) continue;
      for (const u of (box.units || [])) {
        const a = game.actors.get(u.actorId);
        const vt = a?.type;
        if (out[vt]) out[vt].push({
          actorId: u.actorId, name: a?.name || 'Unit', status: u.status || 'Undamaged',
          unitName: box.name || 'Unit', companyName: company.name
        });
      }
    }
  }
  return out;
}

/** Count a box's vehicles by actor type. */
export function boxVehicleNeeds(box) {
  const need = {};
  for (const u of (box.units || [])) {
    const a = game.actors.get(u.actorId);
    const vt = a?.type;
    if (vt) need[vt] = (need[vt] || 0) + 1;
  }
  return need;
}

/** Free cubicles of a vehicle type on a ship (total − manual − other MTOE). */
export function freeCubicles(shipActor, vehicleType, excludeBoxId = null) {
  const cubs = shipCubiclesByVehicle(shipActor)[vehicleType] || [];
  const manual = cubs.filter(c => c.manualUnitId).length;
  const mtoe = (mtoeVehiclesAtShip(shipActor.id, excludeBoxId)[vehicleType] || []).length;
  return cubs.length - manual - mtoe;
}

/**
 * Whether a ship has room for a box's equipment. Returns {ok} or
 * {ok:false, vehicleType, need, free} describing the shortfall.
 */
export function canFitBoxAtShip(shipActor, box, excludeBoxId = null) {
  if (!shipActor) return { ok: false, reason: 'no-ship' };
  const need = boxVehicleNeeds(box);
  for (const vt of Object.keys(need)) {
    const free = freeCubicles(shipActor, vt, excludeBoxId);
    if (need[vt] > free) return { ok: false, vehicleType: vt, need: need[vt], free };
  }
  return { ok: true };
}
