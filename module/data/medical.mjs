/**
 * medical.mjs
 * -----------
 * Canonical seed data for the Medical compendium, transcribed from the A Time of
 * War EQUIPMENT chapter: Medical Equipment (`healthcare`), Drugs & Poisons
 * (`drugpoison`), and Cybernetics/Prosthetics (`prosthetics`). All three seed
 * into `mech-foundry.medical` and share the shop's Medical tab, foldered by
 * kind: Medical Equipment, Drugs & Poisons, and Cybernetics.
 */

const HC_IMG = 'icons/tools/laboratory/vial-blue.webp';
const DRUG_IMG = 'icons/consumables/potions/potion-tube-corked-red.webp';
const CYBER_IMG = 'icons/commodities/tech/cog-brass.webp';

/** Parse a vector string ("Ingested/Inhaled") into the primaryVector flags. */
function vec(s) {
  const l = (s || '').toLowerCase();
  return { ingested: l.includes('ingest'), injected: l.includes('inject'), inhaled: l.includes('inhal'), contact: l.includes('contact') };
}

/* -------------------------------------------------------------------------- */
/*  Medical Equipment (healthcare)                                            */
/* -------------------------------------------------------------------------- */

export function toHealthcareSeed(r) {
  return {
    folder: 'Medical Equipment', subfolder: r.sub || '',
    item: {
      name: r.name, img: r.img || HC_IMG, type: 'healthcare',
      system: {
        description: '', equipmentRating: r.ar || '', cost: r.cost ?? 0, affiliation: r.aff || '',
        mass: r.massKg ?? 0, notes: r.notes || '', carryStatus: 'carried', itemEffects: [],
        powerUse: r.powerUse ?? 0, charges: { value: r.charges ?? 0, max: r.charges ?? 0 },
        medTechBonus: r.medTech ?? 0, surgeryBonus: r.surgery ?? 0
      },
      flags: { 'mech-foundry': { folder: 'Medical Equipment', subfolder: r.sub || '' } }
    }
  };
}

export const HEALTHCARE = [
  { sub: 'Medical Kits', name: 'Advanced Medical Kit', cost: 250, massKg: 2, charges: 4, medTech: 2, notes: '4 uses; +2 to MedTech rolls' },
  { sub: 'Medical Kits', name: 'Field Surgical Kit', cost: 800, massKg: 11.5, charges: 2, medTech: 2, surgery: 1, notes: '2 uses; +1 to Surgery, +2 to MedTech rolls' },
  { sub: 'Medical Kits', name: 'Medical Kit', cost: 10, massKg: 0.25, charges: 1, medTech: 1, notes: '1 use; +1 to MedTech rolls' },
  { sub: 'First Aid Consumables', name: 'Medipatch', cost: 10, massKg: 0.01, medTech: 1, notes: '+1 to MedTech rolls (max, even with multiple)' },
  { sub: 'First Aid Consumables', name: 'Plastiflesh Bandage', cost: 5, massKg: 0.005, notes: 'Stops 1 bleeding effect; -50% healing time on a successful MedTech roll' },
  { sub: 'First Aid Consumables', name: 'Preserving Sleeve', cost: 25, massKg: 0.5, medTech: 1, surgery: 1, notes: '+1 to MedTech/Surgery on the affected limb; halts continuous damage there up to 36 hours' },
  { sub: 'First Aid Consumables', name: 'Sedative Patch', cost: 30, massKg: 0.012, notes: 'Inflicts 0S/4D "damage"; no effect unless placed against skin' },
  { sub: 'First Aid Consumables', name: 'Stimpatch', cost: 2, massKg: 0.009, notes: 'Removes 2 Fatigue (min 0); +1 to Consciousness checks; addictive (Drug Strength 3)' },
  { sub: 'First Aid Consumables', name: 'Stimpatch, Clan', cost: 5, aff: 'CLAN', massKg: 0.01, notes: 'Removes 3 Fatigue and Stun; +2 to Consciousness checks; addictive (Drug Strength 4)' },
  { sub: 'Medipacks', name: 'Clan LSSU', cost: 2200, aff: 'CLAN', massKg: 0.325, charges: 24, notes: 'Removes 3 Fatigue and negates Stun; injury mod +2 for 15 min; 24 doses; reload 100; addictive (DS 3)' },
  { sub: 'Medipacks', name: 'Medipack', cost: 400, massKg: 0.4, charges: 12, notes: 'Removes 2 Fatigue and negates Stun; injury mod +1 for 15 min; 12 doses; reload 75; addictive (DS 2)' },
  { sub: 'Medipacks', name: 'Combat Medipack', cost: 1000, massKg: 3.5, powerUse: 5, charges: 1, medTech: 2, notes: '+2 to MedTech (max); stops bleeding and removes Stun; 1 use; refill 150' },
  { sub: 'Medical Tools', name: 'Laser Scalpel', cost: 50, massKg: 0.1, powerUse: 1, notes: 'Range 25 cm; inflicts 0E/3 damage if used offensively' },
  { sub: 'Medical Tools', name: 'Life-Support Unit', cost: 8500, aff: 'CS', massKg: 22.5, powerUse: 3, notes: 'Stops all continuous damage and allows moving critical patients; -20% healing time; +2 MedTech with a Portable Medical Monitor' },
  { sub: 'Medical Tools', name: 'Myomer Implantation Device', cost: 175000, aff: 'CS', massKg: 15, powerUse: 10, notes: 'Malfunction on a fumble' },
  { sub: 'Medical Tools', name: 'Portable Medical Monitor', cost: 2200, massKg: 13.3, powerUse: 1, medTech: 1, notes: '+1 to MedTech (+2 with a Life-Support Unit)' },
  { sub: 'Medical Tools', name: 'Stasis Tube', cost: 500000, aff: 'MC', massKg: 1200, powerUse: 10, notes: 'Freeze/thaw 1 person in 24 hours; BOD -2 to freeze/thaw; BOD -1 per year stored (on failure, -1 to BOD or INT)' }
];

/* -------------------------------------------------------------------------- */
/*  Drugs & Poisons (drugpoison)                                              */
/* -------------------------------------------------------------------------- */

export function toDrugSeed(r) {
  return {
    folder: 'Drugs & Poisons', subfolder: r.group || '',
    item: {
      name: r.name, img: r.img || DRUG_IMG, type: 'drugpoison',
      system: {
        description: '', equipmentRating: r.ar || '', basePrice: r.cost ?? 0, mass: r.massKg ?? 0.05,
        carryStatus: 'carried', primaryVector: vec(r.vector), drugStrength: r.strength ?? 0,
        poisonAP: r.ap ?? 0, duration: r.duration || '', notes: r.notes || ''
      },
      flags: { 'mech-foundry': { folder: 'Drugs & Poisons', subfolder: r.group || '' } }
    }
  };
}

export const DRUGS = [
  { group: 'Drugs', name: 'Alcohol: Beer/Wine', vector: 'Ingested', strength: 1, ap: 0, ar: 'A/A-A-A/B', cost: 1, duration: '2 hr' },
  { group: 'Drugs', name: 'Alcohol: Mixed Drink', vector: 'Ingested', strength: 2, ap: 0, ar: 'A/A-A-A/B', cost: 2, duration: '3 hr' },
  { group: 'Drugs', name: 'Alcohol: Hard Liquor', vector: 'Ingested', strength: 3, ap: 0, ar: 'A/A-B-B/B', cost: 2, duration: '4 hr' },
  { group: 'Drugs', name: 'Alcohol: Fusionnaire', vector: 'Ingested', strength: 4, ap: 0, ar: 'A/X-C-B/B', cost: 5, duration: '5 hr', notes: 'Aff: Clan' },
  { group: 'Drugs', name: 'Cannabis/Hashish', vector: 'Ingested/Inhaled', strength: 2, ap: 0, ar: 'A/B-B-B/C', cost: 2, duration: '3 hr' },
  { group: 'Drugs', name: 'Heroin', vector: 'Ingested/Inhaled', strength: 7, ap: 0, ar: 'A/B-B-B/D', cost: 10, duration: '6 hr' },
  { group: 'Drugs', name: 'Codeine', vector: 'Ingested', strength: 5, ap: 0, ar: 'A/B-B-B/C', cost: 6, duration: '8 hr', notes: 'Medicinal (pain reducer)' },
  { group: 'Drugs', name: 'Barbiturates', vector: 'Ingested', strength: 6, ap: 0, ar: 'A/B-B-B/D', cost: 7, duration: '4 hr' },
  { group: 'Drugs', name: 'Sedatemaxx', vector: 'Injected', strength: 4, ap: 0, ar: 'A/X-C-B/A', cost: 10, duration: '8 hr', notes: 'Medicinal (sedative)' },
  { group: 'Drugs', name: 'Battlestun', vector: 'Injected', strength: 6, ap: 0, ar: 'B/X-C-C/A', cost: 15, duration: '2 hr' },
  { group: 'Drugs', name: 'Caffeine', vector: 'Ingested', strength: 1, ap: 0, ar: 'A/A-A-A/A', cost: 0.5, duration: '2 hr' },
  { group: 'Drugs', name: 'Nicotine', vector: 'Ingested/Inhaled', strength: 2, ap: 0, ar: 'A/A-A-A/B', cost: 1, duration: '2 hr' },
  { group: 'Drugs', name: 'Cocaine', vector: 'Inhaled/Injected', strength: 3, ap: 0, ar: 'A/C-B-B/D', cost: 7, duration: '4 hr' },
  { group: 'Drugs', name: 'Amphetamines', vector: 'Ingested/Injected', strength: 4, ap: 0, ar: 'A/B-B-B/D', cost: 6, duration: '6 hr' },
  { group: 'Drugs', name: 'Methamphetamines', vector: 'Ingested', strength: 5, ap: 0, ar: 'B/B-B-B/D', cost: 6, duration: '6 hr' },
  { group: 'Drugs', name: 'K-Z ("Krazy")', vector: 'Ingested/Injected', strength: 6, ap: 0, ar: 'C/F-D-C/E', cost: 10, duration: '10 hr' },
  { group: 'Drugs', name: 'X-Quick', vector: 'Injected', strength: 3, ap: 0, ar: 'C/X-F-C/E', cost: 2, duration: '2 hr' },
  { group: 'Drugs', name: 'Peyote/Mescaline', vector: 'Ingested/Inhaled', strength: 2, ap: 0, ar: 'A/A-B-A/C', cost: 2, duration: '8 hr' },
  { group: 'Drugs', name: 'Lysergic Acid Diethylamide (LSD)', vector: 'Ingested', strength: 6, ap: 0, ar: 'A/B-B-B/C', cost: 4, duration: '8 hr' },
  { group: 'Drugs', name: 'Phencyclidine (PCP)', vector: 'Ingested', strength: 7, ap: 0, ar: 'A/B-B-B/D', cost: 6, duration: '8 hr' },
  { group: 'Drugs', name: 'Psilocybin', vector: 'Ingested', strength: 3, ap: 0, ar: 'A/B-A-A/A', cost: 3, duration: '4 hr', notes: '"Magic" mushrooms' },
  { group: 'Drugs', name: 'Ingrot Venom', vector: 'Injected', strength: 4, ap: 0, ar: 'A/X-D-C/D', cost: 9, duration: '6 hr' },
  { group: 'Drugs', name: 'Necrosia', vector: 'Ingested', strength: 8, ap: 0, ar: 'C/X-F-D/E', cost: 12, duration: '4 hr', notes: 'Aff: HC' },
  { group: 'Drugs', name: 'Qwikstim', vector: 'Ingested', strength: 8, ap: 0, ar: 'D/X-F-E/E', cost: 8, duration: '1D6x2 hr', notes: 'Aff: LA; ignore Fatigue; DEX -1' },
  { group: 'Drugs', name: 'Rage', vector: 'Injected', strength: 9, ap: 0, ar: 'E/X-E-E/E', cost: 10, duration: '1D6x0.5 hr', notes: 'Aff: CC; ignore injury modifiers; STR +3, INT -1, WIL -1' },
  { group: 'Drugs', name: 'LD-512', vector: 'Ingested', strength: 6, ap: 0, ar: 'E/X-X-E/E', cost: 12, duration: '1D6x0.5 hr', notes: 'Aff: FS; INT +3, WIL +1; -3 to Perception' },
  { group: 'Drugs', name: 'Spazz', vector: 'Ingested', strength: 10, ap: 0, ar: 'D/X-X-E/E', cost: 10, duration: '1D6 hr', notes: 'RFL +2, DEX -1; Compulsion/Paranoia (-3 TP)' },
  { group: 'Poisons', name: 'Rattlesnake Venom', vector: 'Injected', strength: 3, ap: 0, ar: 'A/A-B-B/C', cost: 5, duration: '3 turns', notes: 'Lethal; continuous' },
  { group: 'Poisons', name: 'Azh Venom', vector: 'Injected', strength: 4, ap: 0, ar: 'A/X-C-B/C', cost: 5, duration: '1 turn', notes: 'Lethal' },
  { group: 'Poisons', name: 'Goliath Scorpion Venom', vector: 'Injected', strength: 5, ap: 1, ar: 'B/X-D-B/D', cost: 10, duration: '1 turn', notes: 'Aff: HC; hallucinogenic; lethal' },
  { group: 'Poisons', name: 'Radium', vector: 'Inhaled/Injected', strength: 7, ap: 3, ar: 'B/C-E-D/D', cost: 50, duration: '1 turn', notes: 'Lethal' },
  { group: 'Poisons', name: 'Thallium', vector: 'Ingested', strength: 3, ap: 0, ar: 'B/A-B-C/D', cost: 10, duration: '4 turns', notes: 'Lethal; continuous' },
  { group: 'Poisons', name: 'Arsenic', vector: 'Ingested', strength: 4, ap: 1, ar: 'A/A-B-C/C', cost: 10, duration: '2 turns', notes: 'Lethal; continuous' },
  { group: 'Poisons', name: 'Hemlock', vector: 'Ingested', strength: 5, ap: 0, ar: 'B/B-D-C/D', cost: 15, duration: '1 turn', notes: 'Lethal' },
  { group: 'Poisons', name: 'Dioxins (Injected)', vector: 'Injected', strength: 4, ap: 0, ar: 'A/C-D-C/C', cost: 20, duration: '4 turns', notes: 'Lethal; continuous' },
  { group: 'Poisons', name: 'Dioxins (Ingested)', vector: 'Ingested', strength: 4, ap: 0, ar: 'A/C-D-C/C', cost: 20, duration: '8 turns', notes: 'Lethal; continuous' },
  { group: 'Poisons', name: 'VX Gas (Inhaled)', vector: 'Inhaled', strength: 30, ap: 6, ar: 'D/C-E-D/E', cost: 70, duration: '12 turns', notes: 'Lethal; delayed' },
  { group: 'Poisons', name: 'VX Gas (Contact)', vector: 'Contact', strength: 30, ap: 6, ar: 'D/C-E-D/E', cost: 70, duration: '24 turns', notes: 'Lethal; delayed' }
];

/* -------------------------------------------------------------------------- */
/*  Cybernetics / Prosthetics (prosthetics)                                   */
/* -------------------------------------------------------------------------- */

export function toCyberSeed(r) {
  return {
    folder: 'Cybernetics', subfolder: r.sub || '',
    item: {
      name: r.name, img: r.img || CYBER_IMG, type: 'prosthetics',
      system: {
        description: '', equipmentRating: r.ar || '', cost: r.cost ?? 0, affiliation: r.aff || '',
        carryStatus: 'carried', notes: r.notes || '', itemEffects: []
      },
      flags: { 'mech-foundry': { folder: 'Cybernetics', subfolder: r.sub || '' } }
    }
  };
}

export const CYBERNETICS = [
  { sub: 'Prosthetics', name: 'Type 1: Simple Limb (Arm/Hand/Leg/Foot)', cost: 75, notes: 'Removable; BAR 2/2/1/2; STR -2' },
  { sub: 'Prosthetics', name: 'Type 1: Acoustic Aid (Ear)', cost: 5, notes: 'Handheld hearing "horn"; no effect at Poor Hearing (-5)' },
  { sub: 'Prosthetics', name: 'Type 1: Glasses/Monocle (Eyes)', cost: 12, notes: 'Worn as attire; no effect at Poor Vision (-9)' },
  { sub: 'Prosthetics', name: 'Type 2: Useful Limb (Arm/Hand)', cost: 750, notes: 'Removable; BAR 2/3/2/2; STR -1' },
  { sub: 'Prosthetics', name: 'Type 2: Useful Limb (Leg/Foot)', cost: 250, notes: 'Removable; BAR 2/3/2/2; STR -1' },
  { sub: 'Prosthetics', name: 'Type 2: Hearing Aid (Ear)', cost: 55, notes: 'Removable; no effect at Poor Hearing (-5)' },
  { sub: 'Prosthetics', name: 'Type 3: Standard Prosthetic (Arm/Hand)', cost: 7500, notes: 'Removable; BAR 3/3/2/3' },
  { sub: 'Prosthetics', name: 'Type 3: Standard Prosthetic (Leg/Foot)', cost: 10000, notes: 'Removable; BAR 3/3/2/3' },
  { sub: 'Prosthetics', name: 'Type 4: Advanced Prosthetic (Arm/Hand)', cost: 25000, notes: 'Removable; BAR 3/4/3/3; +1 melee AP (unarmed only)' },
  { sub: 'Prosthetics', name: 'Type 4: Advanced Prosthetic (Leg/Foot)', cost: 17500, notes: 'Removable; BAR 3/4/3/3; +1 melee AP (unarmed only)' },
  { sub: 'Prosthetics', name: 'Type 5: Myomer Replacement (Arm)', cost: 200000, aff: 'CS', notes: 'Removable; BAR 3/4/4/3; STR +1; +1 melee AP (unarmed only)' },
  { sub: 'Prosthetics', name: 'Type 5: Myomer Replacement (Hand)', cost: 100000, aff: 'CS', notes: 'Removable; BAR 3/4/4/3; STR +1; +1 melee AP (unarmed only)' },
  { sub: 'Prosthetics', name: 'Type 5: Myomer Replacement (Leg)', cost: 125000, aff: 'CS', notes: 'Removable; BAR 3/4/4/3; STR +1; +1 melee AP (unarmed only)' },
  { sub: 'Prosthetics', name: 'Type 5: Myomer Replacement (Foot)', cost: 50000, aff: 'CS', notes: 'Removable; BAR 3/4/4/3; STR +1; +1 melee AP (unarmed only)' },
  { sub: 'Cloned Replacements', name: 'Type 6: Cloned Replacement (Arm)', cost: 500000, aff: 'CLAN', notes: 'Grafted; negates the related Lost Limb Trait' },
  { sub: 'Cloned Replacements', name: 'Type 6: Cloned Replacement (Hand)', cost: 300000, aff: 'CLAN', notes: 'Grafted; negates the related Lost Limb Trait' },
  { sub: 'Cloned Replacements', name: 'Type 6: Cloned Replacement (Leg)', cost: 350000, aff: 'CLAN', notes: 'Grafted; negates the related Lost Limb Trait' },
  { sub: 'Cloned Replacements', name: 'Type 6: Cloned Replacement (Foot)', cost: 150000, aff: 'CLAN', notes: 'Grafted; negates the related Lost Limb Trait' },
  { sub: 'Cloned Replacements', name: 'Type 6: Cloned Replacement (Organ)', cost: 200000, aff: 'CLAN', notes: 'Grafted; negates the related Lost Limb/Handicap/Poor Vision/Poor Hearing Trait' },
  { sub: 'Bionic Replacements', name: 'Type 2: Corrective Lens Implant (Eye)', cost: 350, notes: 'Removable with surgery; no effect at Poor Vision (-9)' },
  { sub: 'Bionic Replacements', name: 'Type 3: Bionic Ear Replacement', cost: 100000, notes: 'Removable; reduces related Poor Hearing Trait to -1 TP' },
  { sub: 'Bionic Replacements', name: 'Type 4: Bionic Eye Replacement', cost: 220000, notes: 'Removable; reduces related Poor Vision Trait to -1 TP' },
  { sub: 'Bionic Replacements', name: 'Type 3: Bionic Organ (Artificial Heart)', cost: 500000, notes: 'Removable with Surgery; reduces heart-related Handicap Trait to -1 TP' },
  { sub: 'Bionic Replacements', name: 'Type 4: Bionic Organ (Artificial Liver/Kidney)', cost: 750000, notes: 'Removable with Surgery; reduces liver/kidney-related Handicap Trait to -1 TP' },
  { sub: 'Bionic Replacements', name: 'Type 4: Bionic Organ (Artificial Lung)', cost: 800000, notes: 'Removable with Surgery; reduces lung-related Handicap Trait to -1 TP' },
  { sub: 'Cosmetic Modifications', name: 'Cosmetic Surgery (Per Body Location)', cost: 2500, notes: 'Mimics the Attractive Trait (only if all deformities removed)' },
  { sub: 'Cosmetic Modifications', name: 'Type 4 Limb: Cosmetic Treatment', cost: 1750, notes: '-2 to Perception rolls to notice the difference' },
  { sub: 'Cosmetic Modifications', name: 'Type 5 Limb: Cosmetic Treatment', cost: 5000, notes: '-4 to Perception rolls to notice the difference' },
  { sub: 'Cosmetic Modifications', name: 'Bionic Ear Cosmetic Treatment', cost: 1000, notes: '-2 to Perception rolls to notice the difference' },
  { sub: 'Cosmetic Modifications', name: 'Bionic Eye Cosmetic Treatment', cost: 3000, notes: '-2 to Perception rolls to notice the difference' },
  { sub: 'Elective Myomer Implants', name: 'Elective Myomer Implant (Arm)', cost: 300000, aff: 'CC', notes: 'Grafted; STR +1 for actions with the affected arm, plus the Hand implant benefit' },
  { sub: 'Elective Myomer Implants', name: 'Elective Myomer Implant (Hand)', cost: 150000, aff: 'CC', notes: 'Grafted; +1 to Martial Arts and Climbing using the affected hand' },
  { sub: 'Elective Myomer Implants', name: 'Elective Myomer Implant (Feet, Both)', cost: 150000, aff: 'CC', notes: 'Grafted; half Fatigue for Sprinting movement' },
  { sub: 'Elective Myomer Implants', name: 'Elective Myomer Implant (Legs, Both)', cost: 375000, aff: 'CC', notes: 'Grafted; STR +1 and RFL +1 for movement purposes' },
  { sub: 'Elective Myomer Implants', name: 'Elective Myomer Implant (Full Body)', cost: 975000, aff: 'CC', notes: 'Grafted; STR +2, RFL +1; CHA -1; gain the Toughness Trait' },
  { sub: 'Elective Myomer Implants', name: 'Enhanced Imaging (EI) Neural Implant', cost: 1500000, aff: 'CLAN', notes: 'Grafted; see EI Neural Implant rules' }
];

/** All medical/drug/cybernetic seed entries, consumed by the pack seeder. */
export const MEDICAL_SEED = [
  ...HEALTHCARE.map(toHealthcareSeed),
  ...DRUGS.map(toDrugSeed),
  ...CYBERNETICS.map(toCyberSeed)
];
