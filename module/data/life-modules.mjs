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

  /* ---- Later-stage EXAMPLE modules (templates to copy, not canon) ------- */
  {
    name: 'Farm (Example)',
    img: IMG,
    type: 'lifeModule',
    system: {
      stage: 1,
      moduleType: 'childhood',
      affiliationKey: '',
      xpCost: 200,
      time: 10,
      restrictedToAffiliations: [],
      prerequisites: { attributes: {}, skills: {}, traits: {} },
      fixedXP: {
        attributes: { str: 50, bod: 50 },
        skills: [
          { name: 'Animal Handling', subskill: 'Any', xp: 20 },
          { name: 'Survival', subskill: 'Any', xp: 10 }
        ],
        traits: []
      },
      flexibleXP: [
        { amount: 15, count: 3, targets: 'any', choices: [], note: '+15 each to any three Attributes, Traits or Skills' }
      ],
      grantsFields: [],
      notes: 'EXAMPLE module illustrating the Stage 1 shape — replace values with the rulebook module you want.',
      pageRef: '',
      description: '<p><em>Example</em> rural early-childhood module.</p>'
    }
  },
  {
    name: 'High School (Example)',
    img: IMG,
    type: 'lifeModule',
    system: {
      stage: 2,
      moduleType: 'childhood',
      affiliationKey: '',
      xpCost: 300,
      time: 6,
      restrictedToAffiliations: [],
      prerequisites: { attributes: {}, skills: {}, traits: {} },
      fixedXP: {
        attributes: { int: 25 },
        skills: [
          { name: 'Academic', subskill: 'Any', xp: 30 },
          { name: 'Computers', xp: 20 }
        ],
        traits: []
      },
      flexibleXP: [
        { amount: 20, count: 2, targets: 'skills', choices: [], note: '+20 each to any two Skills' }
      ],
      grantsFields: [],
      notes: 'EXAMPLE Stage 2 module.',
      pageRef: '',
      description: '<p><em>Example</em> late-childhood schooling module.</p>'
    }
  },
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
