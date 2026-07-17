/**
 * life-modules.mjs
 * ----------------
 * Canonical seed data for the Life Modules compendium (milestone M2). On first
 * load the seeder (helpers/life-module-seeder.mjs) imports these into the
 * `mech-foundry.life-modules` pack as editable `lifeModule` Items, so a GM can
 * browse, tweak, extend, or delete them entirely in-app — this file is only the
 * initial content, never the live source of truth once a world is seeded.
 *
 * Only a small, verifiable starter set ships here (the Universal allotment, one
 * fully-transcribed Stage 0 affiliation, and clearly-labelled EXAMPLE modules
 * for the later stages). Transcribing the full A Time of War catalogue against
 * this schema is the separate M8 data track — see docs/CHARACTER_CREATION_PLAN.md.
 *
 * Each entry is `{ name, img?, type: 'lifeModule', system: {...} }` matching the
 * template.json lifeModule schema.
 */

const IMG = 'icons/sundries/scrolls/scroll-writing-tan.webp';

/* Compact builders for the transcribed Stage 1 / Stage 2 modules. */
const sk = (name, xp, subskill) => (subskill ? { name, subskill, xp } : { name, xp });
const tr = (name, xp) => ({ name, xp });
const lump = (amount, targets = 'any', note = '') => ({ lump: true, amount, targets, note });
const flex = (amount, count, targets = 'any', note = '', choices = []) => ({ amount, count, targets, note, choices });
/** A branch/caste sub-option bundle applied on top of its parent module. */
const vr = (key, name, xpCost, s = {}) => ({
  key, name, xpCost,
  fixedXP: { attributes: s.attrs || {}, skills: s.skills || [], traits: s.traits || [] },
  flexibleXP: s.flex || [],
  notes: s.notes || ''
});
/** Expand a skill "Field" into per-skill grants: each entry gets +xp. */
const field = (xp, skills) => skills.map(spec => Array.isArray(spec) ? sk(spec[0], xp, spec[1]) : sk(spec, xp));
const mod = (name, stage, moduleType, xpCost, time, s = {}) => ({
  name, img: IMG, type: 'lifeModule',
  system: {
    stage, moduleType, affiliationKey: '', xpCost, time,
    primaryLanguage: '', secondaryLanguages: [], subAffiliations: [],
    restrictedToAffiliations: s.restricted || [],
    prerequisites: s.prereq || { attributes: {}, skills: {}, traits: {} },
    variantLabel: s.variantLabel || '', variantRequired: !!s.variantRequired, variants: s.variants || [],
    fixedXP: { attributes: s.attrs || {}, skills: s.skills || [], traits: s.traits || [] },
    flexibleXP: s.flex || [],
    grantsFields: [], notes: s.notes || '', pageRef: s.pageRef || 'ATOW pp.75-78',
    description: s.desc || ''
  }
});

export const LIFE_MODULE_SEED = [
  /* ---- Universal allotment (mandatory, applied to every character) ------ */
  {
    name: 'Universal Fixed Experience (Mandatory)',
    img: 'icons/sundries/documents/document-sealed-signatures-red.webp',
    type: 'lifeModule',
    system: {
      stage: 0,
      moduleType: 'affiliation',
      affiliationKey: 'universal',
      xpCost: 850,
      time: 0,
      restrictedToAffiliations: [],
      prerequisites: { attributes: {}, skills: {}, traits: {} },
      fixedXP: {
        attributes: { str: 100, bod: 100, rfl: 100, dex: 100, int: 100, wil: 100, cha: 100, edg: 100 },
        skills: [
          { name: 'Language', subskill: 'Affiliation Primary', xp: 20 },
          { name: 'Language', subskill: 'English', xp: 20 },
          { name: 'Perception', xp: 10 }
        ],
        traits: []
      },
      flexibleXP: [],
      grantsFields: [],
      notes: 'Applied automatically by the wizard when an affiliation is chosen. Costs 850 XP: +100 to each attribute, +20 to a primary/affiliation language, +20 English, +10 Perception.',
      pageRef: 'ATOW p.63',
      description: '<p>The mandatory universal allotment every A Time of War character purchases at Stage 0.</p>'
    }
  },

  /* ---- Stage 0: Affiliation (fully transcribed) ------------------------- */
  {
    name: 'Capellan Confederation (House Liao)',
    img: IMG,
    type: 'lifeModule',
    system: {
      stage: 0,
      moduleType: 'affiliation',
      affiliationKey: 'capellan',
      xpCost: 150,
      time: 0,
      primaryLanguage: 'Mandarin Chinese',
      secondaryLanguages: ['Russian', 'Cantonese', 'Vietnamese', 'English'],
      restrictedToAffiliations: [],
      prerequisites: { attributes: {}, skills: {}, traits: {} },
      fixedXP: {
        attributes: { wil: 50 },
        skills: [
          { name: 'Language', subskill: 'Any Capellan Secondary', xp: 10 },
          { name: 'Protocol', subskill: 'Capellan', xp: 10 },
          { name: 'Martial Arts', xp: 5 }
        ],
        traits: [
          { name: 'Exceptional Attribute/EDG', xp: 100 },
          { name: 'Compulsion/Paranoia', xp: -100 }
        ]
      },
      flexibleXP: [],
      subAffiliations: [
        {
          key: 'capellan-commonality',
          name: 'Capellan Commonality',
          fixedXP: {
            attributes: { edg: 50 },
            skills: [
              { name: 'Language', subskill: 'Any FedSuns', xp: 5 },
              { name: 'Protocol', subskill: 'FedSuns', xp: 5 }
            ],
            traits: [{ name: 'Wealth', xp: 15 }]
          },
          flexibleXP: []
        },
        {
          key: 'liao-commonality',
          name: 'Liao Commonality',
          fixedXP: {
            attributes: { int: 50 },
            skills: [
              { name: 'Language', subskill: 'Choose Any FedSuns or Lyran', xp: 15 },
              { name: 'Protocol', subskill: 'Choose either FedSuns or Lyran', xp: 10 },
              { name: 'Art', subskill: 'Any', xp: 10 },
              { name: 'Martial Arts', xp: 15 }
            ],
            traits: [{ name: 'Reputation', xp: -25 }]
          },
          flexibleXP: []
        },
        {
          key: 'sian-commonality',
          name: 'Sian Commonality',
          fixedXP: {
            attributes: { wil: 75 },
            skills: [
              { name: 'Interest', subskill: 'Capellan History', xp: 10 },
              { name: 'Protocol', subskill: 'Capellan', xp: 15 },
              { name: 'Language', subskill: 'Any Capellan Secondary', xp: 10 }
            ],
            traits: [
              { name: 'Compulsion/Hatred of Federated Suns', xp: -135 },
              { name: 'Citizenship', xp: 50 },
              { name: 'Connections', xp: 50 }
            ]
          },
          flexibleXP: []
        },
        {
          key: 'st-ives-commonality',
          name: 'St. Ives Commonality',
          fixedXP: {
            attributes: { wil: 50, edg: 50 },
            skills: [
              { name: 'Language', subskill: 'Any FedSuns', xp: 15 },
              { name: 'Protocol', subskill: 'Capellan', xp: -15 },
              { name: 'Protocol', subskill: 'FedSuns', xp: 10 },
              { name: 'Art', subskill: 'Any', xp: 5 },
              { name: 'Martial Arts', xp: 10 }
            ],
            traits: [
              { name: 'Reputation', xp: -100 },
              { name: 'Wealth', xp: 50 }
            ]
          },
          flexibleXP: []
        },
        {
          key: 'victoria-commonality',
          name: 'Victoria Commonality',
          fixedXP: {
            attributes: { wil: 35 },
            skills: [
              { name: 'Language', subskill: 'Any', xp: 15 },
              { name: 'Negotiation', xp: 10 },
              { name: 'Martial Arts', xp: 15 }
            ],
            traits: [
              { name: 'Connections', xp: 50 },
              { name: 'Wealth', xp: -50 }
            ]
          },
          flexibleXP: []
        }
      ],
      grantsFields: [],
      notes: 'Child labour is legal in the Confederation, so Capellan characters may take the Civilian Job Stage 4 module in place of a Stage 2 module (advancing immediately to age 18). Capellan characters may not take the Military School Stage 2 module or any Stage 3 module unless they also purchase the Citizenship Trait.',
      pageRef: 'ATOW p.64',
      description: '<p>Origins in the Capellan Confederation (House Liao), a rigid, security-obsessed realm long beset by its neighbours. Choose a Commonality sub-affiliation for regional flavour and its own XP.</p>'
    }
  },

  /* ==== STAGE 1 — EARLY CHILDHOOD (ATOW p.75) — all end at age 10 ======== */
  mod('Back Woods', 1, 'childhood', 290, 10, {
    prereq: { attributes: { str: 4, bod: 5 }, skills: {}, traits: {} },
    attrs: { str: 100, bod: 100, rfl: 75, int: -25, cha: -50 },
    traits: [tr('Equipped', -50), tr('Fit', 100), tr('Illiterate', -75), tr('Toughness', 75), tr('Wealth', -75)],
    skills: [sk('Language', -5, 'Affiliation'), sk('Martial Arts', 10), sk('Melee Weapons', 10),
      sk('Navigation', 10, 'Ground'), sk('Perception', 5), sk('Running', 10), sk('Survival', 15, 'Any'), sk('Tracking', 10, 'Wilds')],
    flex: [flex(25, 2, 'any', '+25 XP each to any two Attributes or Traits')],
    desc: '<p>Raised in the country or remote fringes: hardy, but unrefined and uneducated.</p>'
  }),
  mod('Blue Collar', 1, 'childhood', 210, 10, {
    attrs: { str: 45, bod: 50, dex: 50, int: 25, wil: -10, cha: -10 },
    skills: [sk('Career', 10, 'Any'), sk('Interest', 5, 'Any'), sk('Interest', 5, 'Any')],
    flex: [flex(10, 4, 'any', '+10 XP each to any four Attributes, Traits or Skills')],
    desc: '<p>Humble but respectable working-class origins with a solid education.</p>'
  }),
  mod('Born Mercenary Brat', 1, 'childhood', 270, 10, {
    restricted: ['mercenary', 'independent'],
    prereq: { attributes: { str: 4, bod: 4, wil: 4 }, skills: {}, traits: {} },
    attrs: { str: 75, bod: 50, rfl: 100, wil: 25, cha: -25, edg: 25 },
    traits: [tr('Equipped', 50), tr('Illiterate', -50), tr('Reputation', -50)],
    skills: [sk('Career', 10, 'Soldier'), sk('Interest', 5, 'Military History'), sk('Language', 10, 'Any'),
      sk('Martial Arts', 15), sk('Melee Weapons', 10), sk('Negotiation', 5), sk('Perception', 5), sk('Streetwise', 10, 'Any')],
    notes: 'Requires an Independent/Mercenary affiliation.',
    desc: '<p>Child of mercenaries — a transient army brat with no true nationality.</p>'
  }),
  mod('Farm', 1, 'childhood', 275, 10, {
    attrs: { str: 100, bod: 100, dex: 25, cha: -50 },
    traits: [tr('Animal Empathy', 25), tr('Illiterate', -25), tr('Toughness', 50), tr('Wealth', -25)],
    skills: [sk('Career', 10, 'Agriculture'), sk('Animal Handling', 15, 'Any'), sk('Interest', 5, 'Any'), sk('Interest', 5, 'Any')],
    flex: [flex(10, 4, 'any', '+10 XP each to any four Attributes, Traits or Skills')],
    desc: '<p>Endless chores in a modest but respected farming life.</p>'
  }),
  mod('Fugitives', 1, 'childhood', 225, 10, {
    attrs: { str: 25, rfl: 100, wil: 100, edg: 100 },
    traits: [tr('Connections', 75), tr('Dark Secret', -100), tr('Illiterate', -50), tr('Introvert', -100), tr('Wealth', -100)],
    skills: [sk('Acting', 5), sk('Language', 5, 'Any'), sk('Perception', 10), sk('Running', 10),
      sk('Stealth', 10), sk('Streetwise', 10, 'Any'), sk('Zero-G Operations', 5)],
    flex: [
      flex(100, 1, 'traits', 'Choose one Trait (+100 XP)', ['Combat Sense', 'Fit', 'Good Hearing', 'Good Vision', 'Patient', 'Toughness']),
      flex(5, 4, 'any', '+5 XP each to any four Attributes, Traits or Skills')
    ],
    desc: '<p>A transient childhood on the run from the law or criminal overlords.</p>'
  }),
  mod('Nobility', 1, 'childhood', 215, 10, {
    attrs: { str: -75, bod: -75, rfl: -50, int: 100, cha: 100 },
    traits: [tr('Equipped', 125), tr('Enemy', -200), tr('Glass Jaw', -100), tr('Reputation', 175), tr('Wealth', 150)],
    skills: [sk('Appraisal', 5), sk('Art', 10, 'Any'), sk('Interest', 10, 'Any'), sk('Language', 10, 'Affiliation'), sk('Protocol', 10, 'Affiliation')],
    flex: [flex(5, 4, 'any', '+5 XP each to any four Attributes, Traits or Skills')],
    notes: 'Any non-Clan affiliation; requires 5+ TP total across Title, Wealth or Property.',
    desc: '<p>Privileged, cultured upbringing — but softened by indulgence.</p>'
  }),
  mod('Slave', 1, 'childhood', 45, 10, {
    prereq: { attributes: { str: 4, bod: 4 }, skills: {}, traits: {} },
    attrs: { str: 100, bod: 75, dex: 100, int: -50, wil: -50 },
    traits: [tr('Equipped', -100), tr('Illiterate', -90), tr('Patient', 100), tr('Reputation', -100), tr('Wealth', -200)],
    skills: [sk('Language', -5, 'Affiliation'), sk('Career', 15, 'Any'), sk('Interest', 10, 'Any'),
      sk('Protocol', 15, 'Affiliation'), sk('Stealth', 15), sk('Streetwise', 15, 'Affiliation'), sk('Technician', 5, 'Any')],
    flex: [
      flex(90, 1, 'traits', '+90 XP to Exceptional Attribute/Any or Natural Aptitude/Any', ['Exceptional Attribute', 'Natural Aptitude']),
      flex(25, 4, 'any', '+25 XP each to any four Attributes or Traits')
    ],
    desc: '<p>A harsh childhood bound to servitude, with few rewards.</p>'
  }),
  mod('Street', 1, 'childhood', 250, 10, {
    attrs: { str: 25, bod: -20, rfl: 100, wil: 100, cha: -25, edg: 100 },
    traits: [tr('Connections', 75), tr('Compulsion/Paranoid', -50), tr('Enemy', -100), tr('Illiterate', -75),
      tr('Reputation', -100), tr('Toughness', 200), tr('Wealth', -75)],
    skills: [sk('Language', -5, 'Affiliation'), sk('Martial Arts', 15), sk('Melee Weapons', 5),
      sk('Perception', 10), sk('Running', 10), sk('Stealth', 10), sk('Streetwise', 10, 'Affiliation')],
    flex: [flex(10, 4, 'any', '+10 XP each to any four Attributes, Traits or Skills')],
    desc: '<p>Raised amid lawlessness — reliant on cunning and luck.</p>'
  }),
  mod('Trueborn Crèche', 1, 'childhood', 300, 10, {
    restricted: ['clan'],
    attrs: { str: 100, bod: 125, rfl: 125, wil: 100, cha: -75 },
    traits: [tr('Compulsion/Clan Honor', -100), tr('Phenotype', 0), tr('Slow Learner', -300), tr('Trueborn', 200)],
    skills: [sk('Interest', 10, 'Clan Remembrance'), sk('Martial Arts', 10), sk('Melee Weapons', 5),
      sk('Protocol', 10, 'Clan'), sk('Small Arms', 5), sk('Swimming', 10)],
    flex: [flex(15, 5, 'any', '+15 XP each to any five Attributes, Traits or Skills')],
    notes: 'Clan affiliation; requires Phenotype and Trueborn Traits. Choose an Aerospace, Elemental or MechWarrior Phenotype.',
    desc: '<p>A trueborn Clansman bred from birth for the warrior caste.</p>'
  }),
  mod('War Orphan', 1, 'childhood', 170, 10, {
    attrs: { int: 50, wil: 100, edg: 100 },
    traits: [tr('Compulsion/Traumatic Memories', -100), tr('Illiterate', -25), tr('Introvert', -50),
      tr('Reputation', -50), tr('Sixth Sense', 150), tr('Wealth', -100)],
    skills: [sk('Language', -5, 'Affiliation'), sk('Perception', 10), sk('Stealth', 5), sk('Streetwise', 10, 'Affiliation')],
    flex: [flex(25, 3, 'any', '+25 XP each to any three Attributes or Traits')],
    desc: '<p>Orphaned by war — self-reliant, but scarred.</p>'
  }),
  mod('White Collar', 1, 'childhood', 170, 10, {
    attrs: { str: -50, bod: -50, int: 75, wil: -50, cha: 75 },
    traits: [tr('Equipped', 75), tr('Enemy', -100), tr('Extra Income', 50), tr('Glass Jaw', -50), tr('Reputation', 50), tr('Wealth', 100)],
    skills: [sk('Art', 10, 'Any'), sk('Interest', 10, 'Any'), sk('Language', 5, 'Affiliation'), sk('Protocol', 5, 'Affiliation')],
    flex: [flex(5, 3, 'any', '+5 XP each to any three Attributes, Traits or Skills')],
    notes: 'Requires 3+ TP total across Wealth or Property.',
    desc: '<p>Comfortable, sheltered upbringing above the middle class.</p>'
  }),

  /* ==== STAGE 2 — LATE CHILDHOOD (ATOW p.77) — all end at age 16 ========= */
  mod('Adolescent Warfare', 2, 'childhood', 500, 6, {
    attrs: { bod: 40, rfl: 40, wil: 50, int: -30 },
    traits: [tr('Combat Sense', 80), tr('Connections', 30), tr('Compulsion/Paranoid', -20), tr('Enemy', -40), tr('Wealth', -20)],
    skills: [sk('Language', -25, 'Affiliation'), sk('Leadership', 25), sk('MedTech', 25, 'General'), sk('Melee Weapons', 25),
      sk('Negotiation', 15), sk('Perception', 25), sk('Protocol', -10, 'Affiliation'), sk('Running', 40),
      sk('Small Arms', 20), sk('Stealth', 30), sk('Streetwise', 45, 'Affiliation'), sk('Survival', 25, 'Any')],
    flex: [lump(130)],
    notes: 'Requires any Stage 1 module except Nobility or Trueborn Crèche.',
    desc: '<p>Teenage years spent carrying a gun rather than school books.</p>'
  }),
  mod('Back Woods', 2, 'childhood', 500, 6, {
    attrs: { bod: 60, wil: 70, int: -20 },
    traits: [tr('Animal Empathy', 50), tr('Good Hearing', 40), tr('Introvert', -20), tr('Wealth', -20)],
    skills: [sk('Climbing', 30), sk('MedTech', 20, 'General'), sk('Melee Weapons', 20), sk('Perception', 45),
      sk('Protocol', -15, 'Affiliation'), sk('Small Arms', 20), sk('Stealth', 40), sk('Survival', 25, 'Forest'), sk('Tracking', 30, 'Wilds')],
    flex: [lump(125)],
    desc: '<p>A survivalist teenage life far from modern society.</p>'
  }),
  mod('Clan Apprenticeship', 2, 'childhood', 360, 6, {
    restricted: ['clan'],
    skills: [sk('Administration', 35), sk('Computers', 50), sk('Interest', 30, 'Any'), sk('Interest', 80, 'Clan History')],
    flex: [lump(165)],
    variantLabel: 'Caste', variantRequired: true,
    variants: [
      vr('laborer', 'Laborer', 140, {
        attrs: { bod: 30 },
        skills: [sk('Career', 50, 'Any'), sk('Computers', 40), sk('Driving', 20, 'Ground Vehicle')],
        notes: 'Requires BOD 4+. Proceed to a matching Stage 3 civilian trade school.'
      }),
      vr('merchant', 'Merchant', 140, {
        attrs: { cha: 30 },
        skills: [sk('Administration', 50), sk('Appraisal', 40), sk('Negotiation', 20)],
        notes: 'Requires CHA 4+. Proceed to a matching Stage 3 civilian trade school.'
      }),
      vr('scientist', 'Scientist', 140, {
        attrs: { int: 30 },
        skills: [sk('Computers', 30), sk('Interest', 10, 'Any'), sk('MedTech', 20, 'Any'), sk('Science', 50, 'Any')],
        notes: 'Requires INT 4+. Proceed to a matching Stage 3 civilian trade school.'
      }),
      vr('technician', 'Technician', 140, {
        attrs: { dex: 30 },
        skills: [sk('Computers', 30), sk('Perception', 20), sk('Technician', 30, 'Any'), sk('Technician', 15, 'Any'), sk('Technician', 15, 'Any')],
        notes: 'Requires DEX 4+. Proceed to a matching Stage 3 civilian trade school.'
      })
    ],
    notes: 'Clan lower-caste apprenticeship. Choose the caste (trade) below — each adds its own attributes/skills and has its own prerequisite. Must proceed to a matching Stage 3 civilian school.',
    desc: '<p>Clan lower-caste teens apprenticed to masters of their designated trade.</p>'
  }),
  mod('Farm', 2, 'childhood', 400, 6, {
    attrs: { bod: 40, cha: -20 },
    traits: [tr('Animal Empathy', 30)],
    skills: [sk('Administration', 35), sk('Animal Handling', 30, 'Any'), sk('Career', 50, 'Agriculture'),
      sk('Driving', 30, 'Ground Vehicle'), sk('Interest', 40, 'Any'), sk('Interest', 20, 'Any'), sk('Small Arms', 30)],
    flex: [lump(115)],
    desc: '<p>Teenage years working the land of a vaunted civilian profession.</p>'
  }),
  mod('Freeborn Sibko', 2, 'childhood', 364, 6, {
    restricted: ['clan'],
    prereq: { attributes: { bod: 3, dex: 4, rfl: 3, wil: 4 }, skills: {}, traits: {} },
    attrs: { bod: 50, wil: 50, cha: -30 },
    traits: [tr('Compulsion/Clan Honor', -30), tr('Rank', 100), tr('Reputation', -40)],
    // Clan Basic Training Field (+30 each; pay only 144).
    skills: [sk('Career', 50, 'Soldier'), sk('Interest', 20, 'Clan Remembrance'), sk('Negotiation', 50),
      ...field(30, ['Martial Arts', ['MedTech', 'General'], 'Melee Weapons', ['Navigation', 'Ground'], ['Protocol', 'Affiliation'], 'Small Arms'])],
    variantLabel: 'Branch', variantRequired: true,
    variants: [
      vr('aerospace', 'Aerospace', 500, {
        traits: [tr('Vehicle', 100)],
        skills: field(50, [['Gunnery', 'Aerospace'], ['Navigation', 'Space'], ['Piloting', 'Aerospace'], 'Sensor Operations', ['Tactics', 'Space']]),
        flex: [lump(200)],
        notes: 'Clan Aerospace Warrior Field. May apply flexible XP to Pilot – DropShip/JumpShip/WarShip Fields (min 20 XP each); if so, +2 years age and begin with +300 XP Rank.'
      }),
      vr('cavalry', 'Cavalry', 500, {
        traits: [tr('Vehicle', 100)],
        skills: field(50, ['Artillery', ['Driving', 'Any'], ['Gunnery', 'Vehicle'], 'Sensor Operations', ['Tactics', 'Land']]),
        flex: [lump(200)],
        notes: 'Clan Cavalry Field.'
      }),
      vr('elemental', 'Elemental', 480, {
        traits: [tr('Vehicle', 100)],
        skills: field(50, ['Climbing', ['Gunnery', 'Battlesuit'], 'Melee Weapons', ['Piloting', 'Battlesuit'], 'Sensor Operations', 'Small Arms', ['Tactics', 'Infantry']]),
        flex: [lump(100)],
        notes: 'Clan Elemental Field.'
      }),
      vr('infantry', 'Infantry (non-Elemental)', 490, {
        traits: [tr('Equipped', 100)],
        skills: field(50, [['Acrobatics', 'Free-Fall'], 'Artillery', 'Climbing', ['Communications', 'Conventional'], 'Support Weapons', ['Tactics', 'Infantry']]),
        flex: [lump(150)],
        notes: 'Infantry Field.'
      }),
      vr('mechwarrior', 'MechWarrior', 490, {
        traits: [tr('Vehicle', 100)],
        skills: field(50, [['Gunnery', "'Mech"], 'Leadership', ['Navigation', 'Ground'], ['Piloting', "'Mech"], 'Sensor Operations', ['Tactics', 'Land']]),
        flex: [lump(150)],
        notes: 'Clan MechWarrior Field.'
      })
    ],
    notes: 'Clan freeborn warrior training. Choose a branch of service below. Freeborn warriors may ignore Phenotype prerequisites. Must select a Clan-affiliated Stage 4 module next.',
    desc: '<p>Brutal training for Clan warriors born outside the iron wombs.</p>'
  }),
  mod('High School', 2, 'childhood', 400, 6, {
    attrs: { cha: 25, int: 25 },
    traits: [tr('Connections', 20)],
    skills: [sk('Computers', 20), sk('Interest', 40, 'Any'), sk('Interest', 35, 'Any'),
      sk('Language', 10, 'Affiliation'), sk('Streetwise', 20, 'Affiliation'), sk('Swimming', 20)],
    flex: [lump(185)],
    notes: 'Any non-Clan affiliation; may not have the Illiterate Trait.',
    desc: '<p>The typical academic teenage path across the Inner Sphere and Periphery.</p>'
  }),
  mod('Mercenary Brat', 2, 'childhood', 600, 6, {
    attrs: { wil: 35, edg: 50, int: -20, cha: -20 },
    traits: [tr('Connections', 40), tr('Tech Empathy', 20)],
    skills: [sk('Career', 50, 'Soldier'), sk('Driving', 15, 'Ground Vehicle'), sk('Interest', 30, 'Any'), sk('Interest', 20, 'Any'),
      sk('Language', 30, 'Any'), sk('Language', 20, 'Any'), sk('Martial Arts', 30), sk('MedTech', 10, 'General'),
      sk('Negotiation', 50), sk('Perception', 30), sk('Streetwise', 20, 'Any'), sk('Tactics', 10, 'Any'), sk('Technician', 30, 'Any')],
    flex: [lump(150)],
    desc: '<p>Seeing the universe and picking up the family trade between missions.</p>'
  }),
  mod('Military School', 2, 'childhood', 500, 6, {
    prereq: { attributes: { wil: 3 }, skills: {}, traits: {} },
    attrs: { cha: 50 },
    traits: [tr('Connections', 15), tr('Fit', 15), tr('Rank', 20)],
    skills: [sk('Career', 25, 'Soldier'), sk('Computers', 35), sk('Interest', 30, 'Any'), sk('Interest', 40, 'Military History'),
      sk('Leadership', 20), sk('Martial Arts', 30), sk('MedTech', 10, 'General'), sk('Melee Weapons', 20),
      sk('Protocol', 30, 'Affiliation'), sk('Running', 30), sk('Small Arms', 50), sk('Strategy', 10), sk('Swimming', 30)],
    flex: [lump(40, 'skills', 'may only be applied to Skills')],
    desc: '<p>Late childhood spent in military school — discipline and a broad skill set.</p>'
  }),
  mod('Preparatory School', 2, 'childhood', 500, 6, {
    attrs: { cha: 60 },
    traits: [tr('Connections', 40), tr('Extra Income', 20), tr('Gregarious', 20)],
    skills: [sk('Archery', 20), sk('Computers', 25), sk('Interest', 30, 'Any'), sk('Interest', 20, 'Any'), sk('Interest', 20, 'Any'),
      sk('Language', 20, 'Any'), sk('MedTech', 10, 'General'), sk('Melee Weapons', 15), sk('Protocol', 40, 'Affiliation')],
    flex: [lump(160, 'any', 'up to 80 XP may be applied to Traits')],
    notes: 'May not have used the Back Woods or Fugitives Stage 1 module; may not have the Illiterate Trait.',
    desc: '<p>Prep school — the wealthy path toward prestigious colleges.</p>'
  }),
  mod('Spacer Family', 2, 'childhood', 490, 6, {
    prereq: { attributes: { rfl: 4, dex: 4, int: 4 }, skills: { 'Zero-G Operations': 2 }, traits: {} },
    attrs: { rfl: 40, dex: 30, bod: -20, str: -20 },
    traits: [tr('Equipped', 20), tr('G-Tolerance', 40), tr('Natural Aptitude/Zero-G Operations', 20), tr('Introvert', -25)],
    skills: [sk('Career', 30, "Ship's Crew"), sk('Communications', 20, 'Conventional'), sk('Computers', 20), sk('Gunnery', 10, 'Spacecraft'),
      sk('Interest', 15, 'Any'), sk('Language', 15, 'Any'), sk('Navigation', 20, 'Space'), sk('Perception', 15),
      sk('Piloting', 15, 'Spacecraft'), sk('Sensor Operations', 15), sk('Technician', 20, 'Aeronautics'),
      sk('Technician', 20, 'Electronic'), sk('Zero-G Operations', 15)],
    flex: [lump(175, 'any', 'at least 100 XP must be applied to Skills')],
    notes: 'Cannot have the TDS Trait.',
    desc: '<p>Raised aboard DropShips and JumpShips — at home in the black sea.</p>'
  }),
  mod('Street', 2, 'childhood', 400, 6, {
    attrs: { bod: 20, wil: 10, cha: -20, edg: 40 },
    traits: [tr('Combat Sense', 15), tr('Connections', 20), tr('Enemy', -20), tr('Illiterate', -20), tr('Reputation', -20)],
    skills: [sk('Acting', 20), sk('Climbing', 15), sk('Disguise', 20), sk('Escape Artist', 20), sk('Interest', 20, 'Any'),
      sk('Interrogation', 20), sk('Martial Arts', 20), sk('MedTech', 10, 'General'), sk('Melee Weapons', 25), sk('Negotiation', 20),
      sk('Perception', 25), sk('Running', 25), sk('Small Arms', 20), sk('Stealth', 15), sk('Streetwise', 40, 'Affiliation')],
    flex: [lump(60)],
    desc: '<p>Dangerous teenage years surviving the streets.</p>'
  }),
  mod('Trueborn Sibko', 2, 'childhood', 710, 6, {
    restricted: ['clan'],
    prereq: { attributes: { bod: 3, dex: 4, rfl: 3, wil: 3 }, skills: {}, traits: {} },
    attrs: { bod: 40, dex: 60, rfl: 50, wil: 20, cha: -30 },
    traits: [tr('Compulsion/Clan Honor', -50), tr('Rank', 200)],
    // Clan Basic Training Field (+50 each; pay only 240).
    skills: [sk('Career', 80, 'Soldier'), sk('Interest', 50, 'Clan Remembrance'), sk('Negotiation', 50),
      ...field(50, ['Martial Arts', ['MedTech', 'General'], 'Melee Weapons', ['Navigation', 'Ground'], ['Protocol', 'Affiliation'], 'Small Arms'])],
    variantLabel: 'Branch', variantRequired: true,
    variants: [
      vr('aerospace', 'Aerospace', 750, {
        traits: [tr('Custom Vehicle', 200)],
        skills: [sk('Gunnery', 20, 'Spacecraft'), sk('Piloting', 20, 'Spacecraft'), sk('Navigation', 40, 'Air'),
          ...field(80, [['Gunnery', 'Aerospace'], ['Navigation', 'Space'], ['Piloting', 'Aerospace'], 'Sensor Operations', ['Tactics', 'Space']])],
        flex: [lump(150)],
        notes: 'Requires Aerospace Phenotype. May apply flexible XP to Pilot – DropShip/JumpShip/WarShip Fields (min 20 XP each); if so, +2 years age and begin with +300 XP Rank.'
      }),
      vr('elemental', 'Elemental', 718, {
        traits: [tr('Vehicle', 120)],
        skills: field(80, ['Climbing', ['Gunnery', 'Battlesuit'], 'Melee Weapons', ['Piloting', 'Battlesuit'], 'Sensor Operations', 'Small Arms', ['Tactics', 'Infantry']]),
        flex: [lump(150)],
        notes: 'Requires Elemental Phenotype. Ghost Bear / Hell\'s Horses Elementals may instead take Advanced Training (see ATOW p.78).'
      }),
      vr('mechwarrior', 'MechWarrior', 734, {
        traits: [tr('Custom Vehicle', 200), tr('Vehicle', 70)],
        skills: [sk('Gunnery', 15, "'Mech"), sk('Piloting', 15, 'BattleMech'),
          ...field(80, [['Gunnery', "'Mech"], 'Leadership', ['Navigation', 'Ground'], ['Piloting', "'Mech"], 'Sensor Operations', ['Tactics', 'Land']])],
        flex: [lump(50)],
        notes: 'Requires MechWarrior Phenotype.'
      }),
      vr('protomech', 'ProtoMech', 680, {
        traits: [tr('Compulsion/Chemical Addiction', -100), tr('Implant/EI Neural Implant', 200),
          tr('Reputation', -100), tr('Toughness', 100), tr('Vehicle', 100)],
        skills: [sk('Navigation', 30, 'Ground'), sk('Tactics', 30, 'Infantry'), sk('Tactics', 30, 'Land'),
          ...field(50, [['Gunnery', 'ProtoMech'], ['Navigation', 'Ground'], ['Piloting', 'ProtoMech'], 'Sensor Operations', ['Tactics', 'Land']])],
        flex: [lump(190)],
        notes: 'ProtoMech warriors pay 1,500 XP total (base module cost is lower for them) and may not have Combat Paralysis, Glass Jaw, Lost Limb, Poor Hearing or Poor Vision. Requires Implant/EI Neural Implant.'
      })
    ],
    notes: 'Clan trueborn warrior training. Choose a branch of service below. Requires the Phenotype and Trueborn Traits. Clan Steel Viper characters reduce final age by 1 year.',
    desc: '<p>The intense trueborn Clan warrior regimen, begun on leaving the crèche.</p>'
  }),
  {
    name: 'Military Academy (Example)',
    img: IMG,
    type: 'lifeModule',
    system: {
      stage: 3,
      moduleType: 'education',
      affiliationKey: '',
      xpCost: 600,
      time: 4,
      restrictedToAffiliations: [],
      prerequisites: { attributes: { int: 3, wil: 3 }, skills: {}, traits: {} },
      fixedXP: {
        attributes: { rfl: 50, dex: 50 },
        skills: [
          { name: 'Small Arms', xp: 40 },
          { name: 'Leadership', xp: 20 },
          { name: 'Tactics', subskill: 'Any', xp: 20 }
        ],
        traits: [{ name: 'Rank', xp: 100 }]
      },
      flexibleXP: [
        { amount: 25, count: 2, targets: 'skills', choices: [], note: '+25 each to any two combat Skills' }
      ],
      grantsFields: ['Basic Training'],
      notes: 'EXAMPLE Stage 3 module with a prerequisite and a granted Field.',
      pageRef: '',
      description: '<p><em>Example</em> higher-education military module.</p>'
    }
  },
  {
    name: 'Soldier (Example)',
    img: IMG,
    type: 'lifeModule',
    system: {
      stage: 4,
      moduleType: 'reallife',
      affiliationKey: '',
      xpCost: 500,
      time: 4,
      restrictedToAffiliations: [],
      prerequisites: { attributes: {}, skills: {}, traits: {} },
      fixedXP: {
        attributes: { bod: 25 },
        skills: [
          { name: 'Small Arms', xp: 30 },
          { name: 'Survival', subskill: 'Any', xp: 20 }
        ],
        traits: []
      },
      flexibleXP: [
        { amount: 20, count: 3, targets: 'any', choices: [], note: '+20 each to any three Attributes, Traits or Skills' }
      ],
      grantsFields: [],
      notes: 'EXAMPLE Stage 4 module. Each Stage 4 module adds years (aging applied post-creation).',
      pageRef: '',
      description: '<p><em>Example</em> adult-career module.</p>'
    }
  }
];
