/**
 * field-gear.mjs
 * --------------
 * Canonical seed data for the Field Gear compendium, transcribed from the
 * A Time of War EQUIPMENT chapter (Repair/Salvage gear, Survival gear, and
 * Espionage & Security gear). Seeded into `mech-foundry.gear` as editable
 * `supplies` Items, foldered under Field Gear by category.
 *
 * These are non-armor, non-electronic kit — toolkits, survival gear, lock-picks
 * and spy gear — so they use the `supplies` item type (equipment_base fields
 * plus supplyType/quantity/powerUse).
 */

const IMG = 'icons/tools/hand/hammer-and-nail.webp';

/** Expand a raw gear record into a seed entry { folder, subfolder, item }. */
export function toGearSeed(r) {
  return {
    folder: 'Field Gear',
    subfolder: r.sub || '',
    item: {
      name: r.name,
      img: r.img || IMG,
      type: 'supplies',
      system: {
        description: r.description || '',
        equipmentRating: r.ar || '',
        cost: r.cost ?? 0,
        affiliation: r.aff || '',
        mass: r.massKg ?? 0,
        notes: r.notes || '',
        carryStatus: 'carried',
        supplyType: r.supplyType || '',
        quantity: r.quantity ?? 1,
        powerUse: r.powerUse ?? 0
      },
      flags: { 'mech-foundry': { folder: 'Field Gear', subfolder: r.sub || '' } }
    }
  };
}

/** g(sub, supplyType, name, cost, massKg, powerUse, notes, aff) */
function g(sub, supplyType, name, cost, massKg, powerUse, notes, aff = '') {
  return { sub, supplyType, name, cost, massKg, powerUse, notes, aff };
}

export const FIELD_GEAR = [
  // ---- Toolkits & Repair ------------------------------------------------
  g('Toolkits & Repair', 'Toolkit', 'Basic Toolkit', 250, 10, 0, 'Encumbering; required to perform any repair that needs a skill roll'),
  g('Toolkits & Repair', 'Toolkit', 'Deluxe Toolkit', 750, 50, 0, 'Encumbering; +1 to all Technician rolls'),
  g('Toolkits & Repair', 'Repair Kit', 'Aerospace Repair Kit', 2500, 310, 0, 'Mobile; restock 500; +1 to Technician/Aeronautics and /Jets'),
  g('Toolkits & Repair', 'Repair Kit', 'Bionic Maintenance Kit', 5000, 45, 0, 'Encumbering; restock 1,000; +1 to Technician/Cybernetics and /Myomer'),
  g('Toolkits & Repair', 'Repair Kit', 'Cutting/Joining Kit', 1250, 175, 0, 'Mobile; restock 250; +1 to Technician/Mechanics'),
  g('Toolkits & Repair', 'Repair Kit', 'Electronics Repair Kit', 2000, 40, 0, 'Encumbering; restock 400; +1 to Technician/Electronics'),
  g('Toolkits & Repair', 'Repair Kit', 'Fission/Fusion Repair Kit', 15000, 345, 0, 'Mobile; restock 3,000; +1 to Technician/Nuclear and /Electronic'),
  g('Toolkits & Repair', 'Repair Kit', 'Myomer/Actuator Repair Kit', 3000, 260, 0, 'Mobile; restock 600; +1 to Technician/Myomer'),
  g('Toolkits & Repair', 'Repair Kit', 'Vehicle Repair Kit', 1000, 225, 0, 'Mobile; restock 200; +1 to Technician/Mechanics'),
  g('Toolkits & Repair', 'Repair Kit', 'Weapon Repair Kit', 1500, 200, 0, 'Mobile; restock 300; +1 to Technician/Weapons'),
  g('Toolkits & Repair', 'Weapon Maintenance', 'Energy Weapon Kit', 850, 2.5, 0, 'Maintains energy small arms/support weapons; restock 160; +1 Technician/Weapons (energy only)'),
  g('Toolkits & Repair', 'Weapon Maintenance', 'Reloading Kit', 250, 25, 0, 'Encumbering; casts ballistic/Gauss small-arms & support-weapon ammo (~0.5x pre-made ammo cost)'),
  g('Toolkits & Repair', 'Weapon Maintenance', 'Slug-Thrower Kit', 100, 3, 0, 'Maintains ballistic/Gauss small arms/support weapons; restock 20; +1 Technician/Weapons (ballistic/Gauss only)'),
  g('Toolkits & Repair', 'Tool', 'Hand-Held Laser Torch', 40, 0.95, 1, 'AP/BD 5E/4; cuts on contact only'),
  g('Toolkits & Repair', 'Tool', 'Null-G Pack', 1000, 20, 0, 'Fuel 60 pts; refuel 10; consumes 1 pt/min per ton of cargo moved (zero-G only)'),
  g('Toolkits & Repair', 'Tool', 'Null-G Pack Controller', 250, 2, 1, 'Required to operate a pair of Null-G Packs (which work as a set)'),
  g('Toolkits & Repair', 'Tool', 'Radiation Sheeting (per sq. m)', 1, 0.25, 0, '~50 sq m for a typical vehicular fusion engine; reduces repair time by 10%'),
  g('Toolkits & Repair', 'Tool', 'Repair Platform', 12500, 2250, 2, 'Mobile; reduces repair time by 20%'),

  // ---- Survival ---------------------------------------------------------
  g('Survival', 'Survival Gear', 'Advanced Field Kit', 100, 15, 1, 'Knife, multi-tool, mattress, thermal blankets, heating plate, lantern, 2 flares, 5 igniters, canteen, basic medical kit; +2 to Survival'),
  g('Survival', 'Survival Gear', 'Basic Field Kit', 10, 5, 0, 'Knife, sleeping bag, lantern, canteen, basic medical kit; +1 to Survival'),
  g('Survival', 'Survival Gear', 'Compass', 10, 0.1, 0, '+1 to Navigation/Ground'),
  g('Survival', 'Survival Gear', 'Electronic Compass', 30, 0.1, 0.1, '+2 to Navigation/Ground'),
  g('Survival', 'Survival Gear', 'Emergency Flares', 10, 0.6, 0, 'Visible up to 5 km on a Perception check (automatic at 1 km or less)'),
  g('Survival', 'Survival Gear', 'Emergency Rations', 2, 1, 0, ''),
  g('Survival', 'Survival Gear', 'Portable Life Support Unit', 5000, 10, 0, '90 man-hours of air and heat to sealed suits/rooms; recharge 100'),
  g('Survival', 'Shelter', 'Bubble Tent', 40, 1, 1, '3 PP/hour in positive-pressure mode; AP 8 vs. inhaled toxins (AP 10 positive-pressure)'),
  g('Survival', 'Shelter', 'Tent', 4, 2, 0, ''),
  g('Survival', 'Shelter', 'Personal Environment Bag', 300, 4, 1, 'Max 1 adult; patch cost 10; AP 8 vs. inhaled toxins'),
  g('Survival', 'Shelter', 'Pop-Up Camper', 550, 500, 2, 'Max 6 adults (+20 cost/mass each to a max of 10); power for heating/refrigeration/plate; includes an Advanced Field Kit and 50 rations'),
  g('Survival', 'Field Equipment', 'Climbing/Rappelling Kit', 150, 10.3, 0, '+1 to Climbing'),
  g('Survival', 'Field Equipment', 'Emergency Jet Pack', 5000, 20, 0, '1,000 fuel; 2 pts/m of flight; max 150 m/turn; Acrobatics/Free-Fall to launch and land', 'CS'),
  g('Survival', 'Field Equipment', 'Hang Glider, Powered', 240, 105, 0, 'Encumbering; Acrobatics/Freefall to fly; engine 1,000 fuel (2 pts/30 m, max 60 m/turn); glides with engine off; BAR 2'),
  g('Survival', 'Field Equipment', 'Hang Glider, Unpowered', 240, 84, 0, 'Encumbering; Acrobatics/Freefall; loses 1 m altitude per (30 + skill) m; max 30 m/turn; BAR 2'),
  g('Survival', 'Field Equipment', 'Hull-Breaching Frame', 250, 3, 0, 'Demolitions to use (AP/BD 10X/10A; -4X/-4A per m); breaches a spacecraft hull for one large creature or armored trooper', 'OA'),
  g('Survival', 'Field Equipment', 'Jump Pack', 3100, 30, 0, 'Encumbering; 1,000 fuel; 2 pts/m; max 150 m/turn; jump mode 150 m max (5 fuel/jump); Acrobatics/Free-Fall'),
  g('Survival', 'Field Equipment', 'Parachute', 78, 8, 0, 'Encumbering; +4 Acrobatics/Free-Fall (to land, turn, control in weather); falls 20 m/turn once deployed, lateral move = skill level in m'),

  // ---- Espionage & Security --------------------------------------------
  g('Espionage & Security', 'Security Tool', 'Basic Lock Pick Set', 100, 0.365, 0, '+2 to Security Systems/Mechanical to pick (mechanical locks only)'),
  g('Espionage & Security', 'Security Tool', 'Vibro Lock Pick Set', 2000, 0.52, 1, '+4 to Security Systems/Mechanical to pick (mechanical locks only)'),
  g('Espionage & Security', 'Security Tool', 'Electronic Security Bypass Kit', 1200, 2, 0.1, '+2 to Security Systems/Electronic to pick (electronic locks only)'),
  g('Espionage & Security', 'Security Tool', 'Electronic Codebreaker, Advanced', 20000, 3, 0.2, '+4 to Security Systems/Electronic to pick (electronic locks only)'),
  g('Espionage & Security', 'Security Tool', 'Neurohelmet Codebreaker', 100000, 4, 0.1, "+2 to Security Systems/Electronic to hack ('Mech control systems only)"),
  g('Espionage & Security', 'Espionage Gear', 'Disguise/Make-Up Kit', 1000, 6.5, 0, '+1 to Disguise rolls; 5 uses'),
  g('Espionage & Security', 'Espionage Gear', 'Forgery Kit', 1225, 5, 0, '+1 to Forgery rolls; 5 uses'),
  g('Espionage & Security', 'Espionage Gear', 'Forensics Analysis Kit, Advanced', 4500, 8, 0.6, '+3 to Investigation; 1D6 minutes/use; refill 100 (after 5 uses)'),
  g('Espionage & Security', 'Espionage Gear', 'Forensics Analysis Kit, Basic', 300, 5, 0.2, '+1 to Investigation; 1D6x5 minutes/use; refill 75 (after 3 uses)'),
  g('Espionage & Security', 'Espionage Gear', 'Counter-Forgery Kit, Basic', 700, 4, 0.4, '+2 to Appraisal of non-electronic documents/images; 2D6 turns/use'),
  g('Espionage & Security', 'Espionage Gear', 'Counter-Forgery Kit, Electronic', 900, 4, 0.4, '+2 to Appraisal of electronic documents/images; 1D6 turns/use'),
  g('Espionage & Security', 'Espionage Gear', 'Fire Capsule', 50, 0.01, 0, 'Destroys prepared documents; -4 to Perception to detect an embedded capsule'),
  g('Espionage & Security', 'Espionage Gear', 'Lie Detector/Polygraph', 380, 9.5, 0.1, '+1 to Interrogation (interrogator only)'),
  g('Espionage & Security', 'Espionage Gear', 'Neural Interrogation Computer', 45000, 200, 1, '+2 to Interrogation (interrogator only); subject makes a BOD+WIL check each minute or takes -1 TP (-2 on fumble)', 'CC')
];

/** All field-gear seed entries (expanded), consumed by the pack seeder. */
export const FIELD_GEAR_SEED = FIELD_GEAR.map(toGearSeed);
