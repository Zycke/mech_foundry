/**
 * skill-fields.mjs
 * ----------------
 * The A Time of War Master Skill Fields List (ATOW pp.92-95). A "Field" is a
 * package of Skills granted together — used by the Sibko Stage-2 branches and,
 * more importantly, by the Stage-3 Higher Education schools, where a player
 * selects 1-3 Fields per school.
 *
 * Each field lists its Skills (as "Name" or "Name/Subskill" strings) and its
 * prerequisites. Prereqs are advisory in the wizard (surfaced as warnings; the
 * creation "strict" setting decides whether they block a finish), so they only
 * need to be descriptive: `{ attrs, fields, traits, forbidTraits, note }`.
 *
 * In Higher Education a chosen Field grants +30 XP to each of its Skills but is
 * bought at a reduced 24 XP per Skill (see CharacterBuilder.FIELD_SKILL_*).
 */

const f = (type, skills, req = {}) => ({ type, skills, req });

export const SKILL_FIELDS = {
  /* ---- Civilian ------------------------------------------------------- */
  'Anthropologist': f('civilian', ['Career/Anthropologist', 'Interest/History (Any one culture)', 'Investigation', 'Language/Any', 'Language/Any', 'Protocol/Any'], { fields: ['General Studies'], attrs: { int: 4 } }),
  'Archaeologist': f('civilian', ['Career/Archaeologist', 'Appraisal', 'Interest/Geology', 'Interest/History (any)', 'Navigation/Ground', 'Perception'], { fields: ['General Studies'], attrs: { int: 4 } }),
  'Cartographer': f('civilian', ['Career/Cartographer', 'Computers', 'Navigation/Air', 'Navigation/Ground', 'Perception', 'Sensor Operations'], { attrs: { int: 4 } }),
  'Communications': f('civilian', ['Acting', 'Career/Communications', 'Communications/Conventional EM', 'Computers', 'Protocol/Any', 'Sensor Operations'], { attrs: { int: 4 } }),
  'Doctor': f('civilian', ['Administration', 'Career/Doctor', 'MedTech/Any', 'Protocol/Affiliation', 'Surgery/Any'], { fields: ['Medical Assistant', 'Scientist'], attrs: { dex: 4, int: 5, wil: 3 }, note: 'Requires Medical Assistant OR Scientist Field.' }),
  'Engineer': f('civilian', ['Appraisal', 'Career/Engineer', 'Perception', 'Technician/Nuclear', 'Technician/Any'], { fields: ['Technician – Civilian', 'Technician – Military'], attrs: { int: 4 }, note: 'Requires a Tech (Civilian or Military) Field.' }),
  'General Studies': f('civilian', ['Career/Any', 'Computers', 'Interest/Any', 'Perception', 'Protocol/Affiliation'], { attrs: { int: 3 }, note: 'Also requires at least one other related Skill.' }),
  'HPG Technician': f('civilian', ['Administration', 'Communications/Conventional EM', 'Communications/Hyperpulse Generator', 'Computers', 'Cryptography'], { fields: ['Communications'], note: 'ComStar, Word of Blake or Clan affiliation only.' }),
  'Journalist': f('civilian', ['Acting', 'Art/Writing', 'Career/Journalist', 'Computers', 'Investigation', 'Perception'], { attrs: { int: 3, cha: 4, wil: 4 } }),
  'Lawyer': f('civilian', ['Acting', 'Administration', 'Career/Lawyer', 'Interest/Law', 'Negotiation', 'Protocol/Any'], { fields: ['General Studies'], attrs: { int: 4, cha: 4, wil: 5 } }),
  'Manager': f('civilian', ['Administration', 'Career/Management', 'Leadership', 'Negotiation', 'Protocol/Affiliation', 'Training'], { attrs: { int: 5, cha: 5 } }),
  'Medical Assistant': f('civilian', ['Career/MedTech', 'Computers', 'Interest/Pharmacology', 'MedTech/Any', 'Perception'], { attrs: { dex: 3, int: 4 } }),
  'Merchant': f('civilian', ['Administration', 'Appraisal', 'Career/Merchant', 'Negotiation', 'Protocol/Any', 'Streetwise/Any'], { attrs: { cha: 3, wil: 3 } }),
  'Merchant Marine': f('civilian', ['Career/Merchant Marine', 'Protocol/Any', 'Technician/Aeronautics', 'Technician/Any', 'Zero-G Operations'], { attrs: { rfl: 3 }, forbidTraits: ['TDS'] }),
  'Pilot – Aerospace (Civilian)': f('civilian', ['Career/Aerospace Pilot', 'Communications/Conventional EM', 'Navigation/Air', 'Navigation/Space', 'Piloting/Aerospace', 'Sensor Operations'], { attrs: { dex: 3, rfl: 4, int: 3 } }),
  'Pilot – Aircraft (Civilian)': f('civilian', ['Career/Aircraft Pilot', 'Communications/Conventional EM', 'Navigation/Air', 'Piloting/Air Vehicle or VTOL', 'Sensor Operations'], { attrs: { dex: 3, rfl: 3 } }),
  'Pilot – DropShip': f('civilian', ['Career/DropShip Pilot', 'Communications/Conventional EM', 'Navigation/Space', 'Piloting/Spacecraft', 'Sensor Operations', 'Zero-G Operations'], { attrs: { dex: 4, int: 3, wil: 3 }, forbidTraits: ['TDS'] }),
  'Pilot – Exoskeleton': f('civilian', ['Piloting/Battlesuit', 'Sensor Operations', 'Technician/Electronic', 'Technician/Mechanical', 'Technician/Myomer'], { attrs: { str: 5, bod: 5 } }),
  'Pilot – IndustrialMech': f('civilian', ["Piloting/'Mech", 'Sensor Operations', 'Technician/Electronic', 'Technician/Mechanical', 'Technician/Myomer'], { attrs: { dex: 3, rfl: 3 } }),
  'Pilot – JumpShip': f('civilian', ['Administration', 'Computers', 'Navigation/K-F Jump', 'Navigation/Space'], { fields: ['Pilot – DropShip'], attrs: { int: 5 }, forbidTraits: ['TDS'] }),
  'Planetary Surveyor': f('civilian', ['Appraisal', 'Driving/Any', 'Navigation/Ground', 'Survival/Any', 'Tracking/Wilds'], { fields: ['Scientist'], attrs: { int: 6 } }),
  'Politician': f('civilian', ['Acting', 'Career/Politician', 'Leadership', 'Negotiation', 'Protocol/Affiliation'], { fields: ['Manager'], attrs: { cha: 4 } }),
  'Scientist': f('civilian', ['Career/Scientist', 'Computers', 'Interest/Any', 'Investigation', 'Perception', 'Science/Any', 'Training'], { attrs: { int: 4 } }),
  'Technician – Aerospace': f('civilian', ['Computers', 'Technician/Aeronautics', 'Technician/Nuclear', 'Technician/Jets', 'Zero-G Operations'], { fields: ['Technician – Civilian', 'Technician – Military'], attrs: { int: 4 } }),
  'Technician – Civilian': f('civilian', ['Appraisal', 'Career/Technician', 'Technician/Electronic', 'Technician/Mechanical', 'Technician/Nuclear'], { attrs: { int: 3, dex: 3 } }),
  "Technician – 'Mech": f('civilian', ['Technician/Electronic', 'Technician/Jets', 'Technician/Mechanical', 'Technician/Myomer', 'Technician/Nuclear'], { fields: ['Technician – Civilian', 'Technician – Military'], attrs: { int: 4 } }),
  'Technician – Vehicle': f('civilian', ['Computers', 'Technician/Electronic', 'Technician/Mechanical', 'Technician/Nuclear'], { fields: ['Technician – Civilian', 'Technician – Military'], attrs: { int: 4 } }),

  /* ---- Intelligence / Police ------------------------------------------ */
  'Analysis': f('intelligence', ['Computers', 'Investigation', 'Language/Any one', 'Language/Any one', 'Sensor Operations', 'Strategy', 'Tactics/Any'], { attrs: { int: 4, wil: 4 }, note: 'Or INT 3, WIL 4 with the Police Officer Field.' }),
  'Covert Operations': f('intelligence', ['Acting', 'Escape Artist', 'Language/Any one', 'Perception', 'Protocol/Any', 'Streetwise/Any', 'Tracking/Any'], { attrs: { int: 4, wil: 4 }, note: 'Or INT 3, WIL 4 with the Police Officer Field.' }),
  'Detective': f('intelligence', ['Career/Detective', 'Computers', 'Interrogation', 'Investigation', 'Perception', 'Security Systems/Any', 'Streetwise/Affiliation'], { attrs: { int: 4, wil: 4 }, note: 'Or INT 3, WIL 4 with the Police Officer Field.' }),
  'Intelligence': f('intelligence', ['Communications/Conventional EM', 'Computers', 'Cryptography', 'Language/Any', 'Sensor Operations'], { attrs: { int: 4, wil: 4 }, note: 'Or INT 3, WIL 4 with the Police Officer Field.' }),
  'Police Officer': f('intelligence', ['Acting', 'Career/Police', 'Driving/Any', 'Martial Arts', 'MedTech/General', 'Small Arms', 'Streetwise/Affiliation'], { attrs: { wil: 3 } }),
  'Police Tactical Officer': f('intelligence', ['Climbing', 'Demolitions', 'Running', 'Support Weapons', 'Tactics/Infantry', 'Thrown Weapons/Any', 'Tracking/Urban'], { fields: ['Police Officer'], attrs: { rfl: 4 } }),

  /* ---- Military -------------------------------------------------------- */
  'Basic Training': f('military', ['Career/Soldier', 'Martial Arts', 'MedTech/General', 'Navigation/Ground', 'Small Arms'], { traits: ['Rank'], attrs: { int: 3, wil: 3 } }),
  'Basic Training (Naval)': f('military', ["Career/Pilot or Ship's Crew", 'Martial Arts', 'MedTech/General', 'Navigation/Space', 'Small Arms', 'Zero-G Operations'], { traits: ['Rank'], attrs: { int: 4, rfl: 3 }, forbidTraits: ['TDS'] }),
  'Cavalry': f('military', ['Artillery', 'Driving/Any', 'Gunnery/Any Vehicle', 'Sensor Operations', 'Tactics/Land or Sea', 'Technician/Mechanical'], { fields: ['Basic Training'], attrs: { dex: 3 } }),
  'Infantry': f('military', ['Acrobatics/Free-Fall', 'Artillery', 'Climbing', 'Communications/Conventional EM', 'Support Weapons', 'Tactics/Infantry'], { fields: ['Basic Training'] }),
  "Infantry – Anti-'Mech": f('military', ['Acrobatics/Gymnastics', 'Demolitions', 'Perception', 'Security Systems/Electronic', 'Technician/Mechanical', 'Technician/Myomer'], { fields: ['Infantry'], attrs: { wil: 5 } }),
  'Marine': f('military', ['Acrobatics/Free-Fall', 'Demolitions', 'Gunnery/Spacecraft', 'Security Systems/Any', 'Zero-G Operations'], { fields: ['Basic Training (Naval)'], forbidTraits: ['TDS'] }),
  'MechWarrior': f('military', ["Gunnery/'Mech", "Piloting/'Mech", 'Sensor Operations', 'Tactics/Land', 'Technician/Any'], { fields: ['Basic Training'], attrs: { dex: 4, rfl: 4 } }),
  'Military Scientist': f('military', ['Career/Military Scientist', 'Computers', 'Cryptography', 'Interest/Military History', 'Strategy', 'Tactics/Any'], { fields: ['Analysis'], attrs: { int: 5 } }),
  'Officer': f('military', ['Administration', 'Leadership', 'Melee Weapons', 'Protocol/Affiliation', 'Training'], { fields: ['Basic Training', 'Basic Training (Naval)'], note: 'Requires a Basic Training Field and Rank O1 or higher.' }),
  'Pilot – Aerospace (Combat)': f('military', ['Gunnery/Aerospace', 'Navigation/Air', 'Navigation/Space', 'Piloting/Aerospace', 'Sensor Operations', 'Tactics/Space', 'Zero-G Operations'], { fields: ['Basic Training', 'Basic Training (Naval)'], attrs: { dex: 4, rfl: 4 } }),
  'Pilot – Aircraft (Combat)': f('military', ['Gunnery/Air Vehicle', 'Navigation/Air', 'Piloting/Air Vehicle', 'Sensor Operations', 'Tactics/Air'], { fields: ['Basic Training', 'Basic Training (Naval)'], attrs: { dex: 4, rfl: 3 } }),
  'Pilot – Battle Armor': f('military', ['Climbing', 'Gunnery/Battlesuit', 'Martial Arts', 'Piloting/Battlesuit', 'Sensor Operations', 'Tactics/Land'], { fields: ['Infantry'], attrs: { str: 6, bod: 5 } }),
  'Pilot – WarShip': f('military', ['Computers', 'Leadership', 'Navigation/K-F Jump', 'Navigation/Space', 'Protocol/Affiliation', 'Strategy', 'Tactics/Space'], { fields: ['Pilot – DropShip'], attrs: { dex: 4, int: 6 }, forbidTraits: ['TDS'] }),
  'Scout': f('military', ['Communications/Conventional EM', 'Disguise', 'Language/Any', 'Security Systems/Any', 'Stealth', 'Streetwise/Any', 'Tracking/Any'], { fields: ['Basic Training'], attrs: { int: 4, wil: 3 }, forbidTraits: ['Illiterate'] }),
  "Ship's Crew": f('military', ["Career/Ship's Crew", 'Computers', 'Gunnery/Spacecraft', 'Technician/Any', 'Zero-G Operations'], { fields: ['Basic Training (Naval)'], attrs: { rfl: 3 }, forbidTraits: ['TDS'] }),
  'Special Forces': f('military', ['Acrobatics/Free-Fall', 'Demolitions', 'Small Arms', 'Stealth', 'Survival/Any', 'Tracking/Any'], { fields: ['Infantry', 'MechWarrior', 'Scout'], attrs: { bod: 4, rfl: 4, wil: 5 } }),
  'Technician – Military': f('military', ['Appraisal', 'Career/Technician', 'Technician/Electronic', 'Technician/Mechanical', 'Technician/Nuclear', 'Technician/Weapons'], { attrs: { int: 3, dex: 3 } })
};

/** Number of Skills in a named Field (0 if unknown). */
export function fieldSkillCount(name) {
  return SKILL_FIELDS[name] ? SKILL_FIELDS[name].skills.length : 0;
}
