/**
 * vehicles.mjs
 * ------------
 * Canonical seed data for the Vehicles compendium, transcribed from the A Time
 * of War Personal Vehicles table. Seeded into `mech-foundry.vehicles` as
 * editable `vehicle` Items, foldered under Personal Vehicles by class.
 */

const VEH_IMG = 'icons/environment/settlement/wagon-black.webp';

/** Map a printed vehicle class to the item's vehicleType keyword. */
function typeFor(cls) {
  const c = (cls || '').toLowerCase();
  if (c.includes('hover') || c.includes('wige')) return 'hover';
  if (c.includes('vtol') || c.includes('rotor')) return 'vtol';
  if (c.includes('naval') || c.includes('water')) return 'naval';
  if (c.includes('track')) return 'tracked';
  return 'wheeled';
}

/** Expand a raw vehicle record into a seed entry { folder, subfolder, item }. */
export function toVehicleSeed(r) {
  return {
    folder: 'Personal Vehicles',
    subfolder: r.group || '',
    item: {
      name: r.name,
      img: r.img || VEH_IMG,
      type: 'vehicle',
      system: {
        description: '',
        vehicleType: r.vehicleType || typeFor(r.group),
        equipmentRating: r.ar || '',
        cost: r.cost ?? 0,
        carryStatus: 'stored',
        affiliation: r.aff || '',
        crew: String(r.crew ?? ''),
        passengers: String(r.passengers ?? ''),
        cargo: r.cargoKg ?? 0,
        range: r.range || '',
        speed: r.speed || '',
        notes: r.notes || '',
        armor: { front: r.armorFront ?? 0, side: r.armorSide ?? 0, back: r.armorRear ?? 0, rotor: r.rotor ?? 0, bar: r.bar ?? 0 },
        fuel: { capacity: r.fuelKg ?? 0, type: r.fuelType || 'P' }
      },
      flags: { 'mech-foundry': { folder: 'Personal Vehicles', subfolder: r.group || '' } }
    }
  };
}

/* Records mirror the Personal Vehicles table columns. */
export const VEHICLES = [
  { group: 'Hover/WiGE', name: 'Routemaster Hoverbus', ar: 'C/B-B-A/C', cost: 15000, armorFront: 1, armorSide: 1, armorRear: 1, bar: 3, fuelKg: 80, fuelType: 'P', range: '495 km', speed: '97/151 kph', crew: 1, passengers: 13, cargoKg: 85 },
  { group: 'Hover/WiGE', name: 'Crimson Streak Hover Racer', ar: 'E/X-X-D/D', cost: 40000, armorFront: 2, armorSide: 2, armorRear: 1, bar: 8, fuelKg: 451, fuelType: 'H', range: '1,302 km', speed: '184/280 kph', crew: 1, passengers: 0, cargoKg: 75 },
  { group: 'Hover/WiGE', name: 'Bayamo Hoverbike', ar: 'D/X-D-A/B', cost: 3750, armorFront: 1, armorSide: 1, armorRear: 1, bar: 2, fuelKg: 68, fuelType: 'H', range: '509 km', speed: '129/194 kph', crew: 1, passengers: 1, cargoKg: 68 },
  { group: 'Hover/WiGE', name: 'Slipper LX Hovercar', ar: 'D/X-X-D/B', cost: 11500, armorFront: 1, armorSide: 1, armorRear: 1, bar: 4, fuelKg: 78, fuelType: 'H', range: '605 km', speed: '162/248 kph', aff: 'LA/FS', crew: 1, passengers: 3, cargoKg: 9 },
  { group: 'Hover/WiGE', name: 'Air Car Hovercraft', ar: 'D/C-E-D/B', cost: 15500, armorFront: 2, armorSide: 1, armorRear: 2, bar: 3, fuelKg: 111, fuelType: 'P', range: '802 km', speed: '118/183 kph', crew: 1, passengers: 11, cargoKg: 147 },
  { group: 'Hover/WiGE', name: 'Feicui Aircar Hovercraft', ar: 'D/X-E-E/B', cost: 140000, armorFront: 3, armorSide: 1, armorRear: 1, bar: 3, fuelKg: 54, fuelType: 'H', range: '302 km', speed: '140/216 kph', aff: 'CC', crew: 1, passengers: 6, cargoKg: 192 },
  { group: 'Hover/WiGE', name: 'Hurricane Hover Car', ar: 'D/C-E-D/B', cost: 10000, armorFront: 2, armorSide: 1, armorRear: 1, bar: 2, fuelKg: 48, fuelType: 'H', range: '393 km', speed: '172/259 kph', aff: 'LA', crew: 1, passengers: 1, cargoKg: 49 },
  { group: 'Hover/WiGE', name: 'Turbofan Car', ar: 'D/C-E-D/B', cost: 10500, armorFront: 1, armorSide: 1, armorRear: 1, bar: 2, fuelKg: 101, fuelType: 'P', range: '889 km', speed: '140/216 kph', crew: 1, passengers: 2, cargoKg: 61 },
  { group: 'Hover/WiGE', name: 'Coanda Personal WiGE', ar: 'D/X-X-C/C', cost: 24000, armorFront: 1, armorSide: 1, armorRear: 1, bar: 6, fuelKg: 475, fuelType: 'P', range: '2,412 km', speed: '118/183 kph', aff: 'LA', crew: 1, passengers: 1, cargoKg: 19, notes: 'Amphibious' },
  { group: 'Wheeled/Tracked', name: 'Saturnus V Racer', ar: 'D/X-X-D/C', cost: 42000, armorFront: 2, armorSide: 1, armorRear: 2, bar: 6, fuelKg: 108, fuelType: 'AL', range: '887 km', speed: '140/216 kph', crew: 1, passengers: 0, cargoKg: 0, notes: 'Ejection seat' },
  { group: 'Wheeled/Tracked', name: 'Blue Nova Sports Car', ar: 'B/X-X-A/B', cost: 4250, armorFront: 1, armorSide: 1, armorRear: 1, bar: 2, fuelKg: 29, fuelType: 'P', range: '379 km', speed: '86/129 kph', crew: 1, passengers: 1, cargoKg: 198, notes: 'Convertible' },
  { group: 'Wheeled/Tracked', name: 'Aston-Martin Fiver Roadster', ar: 'D/X-X-A/B', cost: 5100, armorFront: 0, armorSide: 0, armorRear: 0, bar: 2, fuelKg: 222, fuelType: 'B', range: '1,000 km', speed: '129/194 kph', aff: 'FS', crew: 1, passengers: 1, cargoKg: 52, notes: 'Convertible' },
  { group: 'Wheeled/Tracked', name: 'A-M Fiver Traveler Minivan', ar: 'D/X-X-A/B', cost: 12500, armorFront: 2, armorSide: 2, armorRear: 2, bar: 4, fuelKg: 244, fuelType: 'B', range: '520 km', speed: '118/183 kph', aff: 'FS', crew: 1, passengers: 7, cargoKg: 210 },
  { group: 'Wheeled/Tracked', name: 'Flashbang ZZ10000 Motorcycle', ar: 'C/X-X-A/B', cost: 600, armorFront: 0, armorSide: 0, armorRear: 0, bar: 2, fuelKg: 10, fuelType: 'P', range: '1,282 km', speed: '108/162 kph', aff: 'CC', crew: 1, passengers: 0, cargoKg: 21 },
  { group: 'Wheeled/Tracked', name: 'Skoda "Growler" Utility Truck', ar: 'D/C-E-D/D', cost: 15000, armorFront: 1, armorSide: 1, armorRear: 1, bar: 2, fuelKg: 20, fuelType: 'P', range: '1,000 km', speed: '64/97 kph', crew: 1, passengers: 3, cargoKg: 128, notes: 'Amphibious, off-road; 20 m ladder, manipulator arm' },
  { group: 'Wheeled/Tracked', name: 'Bulldog Medium Truck', ar: 'B/X-B-A/B', cost: 6000, armorFront: 1, armorSide: 1, armorRear: 1, bar: 2, fuelKg: 45, fuelType: 'P', range: '1,000 km', speed: '43/64 kph', crew: 1, passengers: 3, cargoKg: 1617 },
  { group: 'Wheeled/Tracked', name: 'Avanti Luxury Sedan', ar: 'C/X-E-D/B', cost: 70000, armorFront: 3, armorSide: 2, armorRear: 2, bar: 3, fuelKg: 22, fuelType: 'P', range: '259 km', speed: '86/129 kph', crew: 1, passengers: 7, cargoKg: 292 },
  { group: 'Wheeled/Tracked', name: 'Jeep', ar: 'C/B-C-D/B', cost: 6000, armorFront: 2, armorSide: 2, armorRear: 1, bar: 5, fuelKg: 23, fuelType: 'P', range: '509 km', speed: '75/118 kph', crew: 1, passengers: 3, cargoKg: 294, notes: 'Off-road' },
  { group: 'Wheeled/Tracked', name: 'Jitney (Minibus)', ar: 'C/A-A-A/B', cost: 62000, armorFront: 4, armorSide: 3, armorRear: 2, bar: 3, fuelKg: 500, fuelType: 'P', range: '588 km', speed: '64/97 kph', crew: 2, passengers: 24, cargoKg: 200 },
  { group: 'Wheeled/Tracked', name: 'Macadam Ground Car', ar: 'C/X-C-C/B', cost: 8000, armorFront: 2, armorSide: 1, armorRear: 1, bar: 2, fuelKg: 83, fuelType: 'H', range: '732 km', speed: '129/194 kph', crew: 1, passengers: 5, cargoKg: 97 },
  { group: 'Wheeled/Tracked', name: 'Speeder', ar: 'E/C-E-D/B', cost: 23000, armorFront: 3, armorSide: 1, armorRear: 1, bar: 5, fuelKg: 0, fuelType: 'Fusion', range: 'Unlimited', speed: '216/324 kph', crew: 1, passengers: 0, cargoKg: 15 },
  { group: 'Wheeled/Tracked', name: 'Transport, Heavy', ar: 'C/B-B-B/C', cost: 90000, armorFront: 6, armorSide: 5, armorRear: 5, bar: 5, fuelKg: 1000, fuelType: 'P', range: '833 km', speed: '64/97 kph', crew: 1, passengers: 1, cargoKg: 2350, notes: 'Cargo carrier' },
  { group: 'Wheeled/Tracked', name: 'Typhoon Ground Car', ar: 'C/D-D-D/B', cost: 35000, armorFront: 3, armorSide: 1, armorRear: 1, bar: 2, fuelKg: 10, fuelType: 'P', range: '294 km', speed: '86/129 kph', aff: 'FS', crew: 1, passengers: 3, cargoKg: 16 },
  { group: 'Wheeled/Tracked', name: 'Jet Sled Tracked Snowmobile', ar: 'D/D-E-D/B', cost: 5000, armorFront: 1, armorSide: 1, armorRear: 1, bar: 2, fuelKg: 14, fuelType: 'AL', range: '244 km', speed: '86/129 kph', crew: 1, passengers: 0, cargoKg: 29, notes: 'Snowmobile' },
  { group: 'Fixed-Wing/VTOL', name: 'Jetta Coruna 4X Jet', ar: 'D/X-X-D/C', cost: 330000, armorFront: 15, armorSide: 9, armorRear: 6, bar: 2, fuelKg: 8500, fuelType: 'H', range: '425 thrust pts', speed: 'Thrust 4/6', crew: 2, passengers: 'special', cargoKg: 1500, notes: '1 luxury cabin, enviro-sealing' },
  { group: 'Fixed-Wing/VTOL', name: 'Zanadu Air Bus Jet', ar: 'C/X-E-D/C', cost: 590000, armorFront: 13, armorSide: 13, armorRear: 13, bar: 6, fuelKg: 30000, fuelType: 'P', range: '1,200 thrust pts', speed: 'Thrust 3/5', crew: 6, passengers: 100, cargoKg: 6500, notes: 'Field kitchen' },
  { group: 'Fixed-Wing/VTOL', name: 'Soar Helicopter', ar: 'C/X-D-C/C', cost: 150000, armorFront: 5, armorSide: 3, armorRear: 2, rotor: 2, bar: 4, fuelKg: 500, fuelType: 'H', range: '952 km', speed: '86/129 kph', aff: 'DC', crew: 2, passengers: 6, cargoKg: 50, notes: 'Enviro-sealing; 4-patient paramedic equipment' },
  { group: 'Watercraft', name: 'Whitestreak Jetski', ar: 'C/C-D-C/C', cost: 280, armorFront: 0, armorSide: 0, armorRear: 0, bar: 2, fuelKg: 1, fuelType: 'H', range: '256 km', speed: '75/118 kph', crew: 1, passengers: 1, cargoKg: 9 },
  { group: 'Watercraft', name: 'Atlantia Luxury Yacht', ar: 'D/X-D-C/C', cost: 700000, armorFront: 25, armorSide: 16, armorRear: 10, bar: 3, fuelKg: 3000, fuelType: 'P', range: '1,153 km', speed: '32/54 kph', crew: 9, passengers: 7, cargoKg: 7000, notes: '7 luxury quarters, 9 crew quarters, field kitchen, 2 lifeboats' }
];

/** All vehicle seed entries (expanded), consumed by the pack seeder. */
export const VEHICLE_SEED = VEHICLES.map(toVehicleSeed);
