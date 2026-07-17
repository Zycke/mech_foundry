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
/** A Stage 0 sub-affiliation bundle (regional/cultural sub-sect). A sub may
 * override the affiliation's languages (for "See sub-affiliation" realms). */
const saff = (key, name, s = {}) => ({
  key, name,
  primaryLanguage: s.primary || '',
  secondaryLanguages: s.secondary || [],
  fixedXP: { attributes: s.attrs || {}, skills: s.skills || [], traits: s.traits || [] },
  flexibleXP: s.flex || [],
  notes: s.notes || ''
});
/** A Stage 0 affiliation module (with optional sub-affiliations & caste variants). */
const aff = (name, key, xpCost, s = {}) => ({
  name, img: IMG, type: 'lifeModule',
  system: {
    stage: 0, moduleType: 'affiliation', affiliationKey: key, xpCost, time: 0,
    primaryLanguage: s.primary || '', secondaryLanguages: s.secondary || [],
    subAffiliations: s.subs || [],
    variantLabel: s.variantLabel || '', variantRequired: !!s.variantRequired, variants: s.variants || [],
    requiresBirthAffiliation: !!s.requiresBirthAffiliation,
    restrictedToAffiliations: [],
    prerequisites: s.prereq || { attributes: {}, skills: {}, traits: {} },
    fixedXP: { attributes: s.attrs || {}, skills: s.skills || [], traits: s.traits || [] },
    flexibleXP: s.flex || [],
    grantsFields: [], notes: s.notes || '', pageRef: s.pageRef || 'ATOW pp.64-74',
    description: s.desc || ''
  }
});
/** The ten Clan castes/sub-castes (ATOW p.71) — applied as a variant on the
 * Invading/Homeworld Clan affiliations (picked alongside the specific Clan). */
const CLAN_CASTES = [
  vr('mechwarrior', 'Warrior — MechWarrior', 0, {
    attrs: { dex: 75, rfl: 75, wil: 75, cha: -25, edg: -50 }, traits: [tr('Fit', 25), tr('Impatient', -50)] }),
  vr('elemental', 'Warrior — Elemental', 0, {
    attrs: { bod: 125, str: 125, dex: -75, cha: -75 }, skills: [sk('Martial Arts', 25)] }),
  vr('elemental-adv', 'Warrior — Elemental (Advanced)', 0, {
    attrs: { bod: 200, str: 175, dex: -100, rfl: -75, cha: -100, edg: -100 }, traits: [tr('Patient', 25), tr('Reputation', 100)],
    notes: 'Ghost Bear / Hell\'s Horses only.' }),
  vr('aerospace', 'Warrior — Aerospace / ProtoMech', 0, {
    attrs: { bod: -50, str: -50, dex: 150, rfl: 150, cha: -25, edg: -25 }, traits: [tr('Fit', 25), tr('Impatient', -50)] }),
  vr('aerospace-naval', 'Warrior — Aerospace-Naval', 0, {
    attrs: { bod: -50, str: -50, dex: 125, rfl: 125, int: 50, cha: -25, edg: -100 },
    traits: [tr('Compulsion/Arrogance', -100), tr('Patient', 75), tr('Reputation', 75)],
    notes: 'Snow Raven (Aerospace Phenotype) only.' }),
  vr('warrior-other', 'Warrior (Other)', 0, {
    attrs: { bod: 75, str: 50, dex: 50, rfl: 50, cha: -25 }, traits: [tr('Reputation', -75)] }),
  vr('scientist', 'Scientist', 0, {
    attrs: { str: -50, int: 100 }, traits: [tr('Compulsion/Arrogance', -25), tr('Patient', 100), tr('Reputation', -25)],
    skills: [sk('Interest', 10, 'Any'), sk('Science', 15, 'Any')] }),
  vr('technician', 'Technician', 0, {
    attrs: { dex: 100, int: 20, cha: -50 }, traits: [tr('Patient', 100), tr('Reputation', -75)],
    skills: [sk('Interest', 15, 'Any'), sk('Technician', 15, 'Any')] }),
  vr('merchant', 'Merchant', 0, {
    attrs: { bod: -50, int: 25, cha: 75 }, traits: [tr('Gregarious', 100), tr('Reputation', -75)],
    skills: [sk('Appraisal', 10), sk('Negotiation', 15), sk('Protocol', 10, 'Any'), sk('Streetwise', 15, 'Clan')] }),
  vr('laborer', 'Laborer', 0, {
    attrs: { bod: 100, str: 125, dex: 50, rfl: 50, int: -50, cha: -50 }, traits: [tr('Reputation', -125)],
    skills: [sk('Career', 15, 'Any'), sk('Interest', 10, 'Any')] })
];
/** A Stage-3 school's Field tier: the years it adds and the Field names offered. */
const tier = (time, options) => ({ time, options });
/** A school's conditional penalty XP (applied unless one of `unlessModules` is taken). */
const cond = (unlessModules, s = {}) => ({
  unlessModules, fixedXP: { attributes: s.attrs || {}, skills: s.skills || [], traits: s.traits || [] }
});
/** A Stage-3 Higher Education school (ATOW pp.82-83). Base xpCost already
 * includes the automatic + flexible XP; each chosen Field adds 24 XP/Skill. */
const school = (name, schoolType, xpCost, s = {}) => ({
  name, img: IMG, type: 'lifeModule',
  system: {
    stage: 3, moduleType: 'education', affiliationKey: '', xpCost, time: 0,
    schoolType,
    fieldWaivers: s.fieldWaivers || [],
    conditionalXP: s.conditional || { unlessModules: [], fixedXP: { attributes: {}, skills: [], traits: [] } },
    fields: {
      basic: s.basic || { time: 0, options: [] },
      advanced: s.advanced || { time: 0, options: [] },
      special: s.special || { time: 0, options: [] },
      officer: s.officer || { time: 0, options: [] }
    },
    restrictedToAffiliations: [],
    prerequisites: s.prereq || { attributes: {}, skills: {}, traits: {} },
    fixedXP: { attributes: s.attrs || {}, skills: s.skills || [], traits: s.traits || [] },
    flexibleXP: s.flex || [],
    grantsFields: [], notes: s.notes || '', pageRef: s.pageRef || 'ATOW pp.82-83',
    description: s.desc || ''
  }
});
/** A Stage-4 Real Life module (ATOW pp.84-91). Repeatable by default; on a
 * repeat only Skill + Flexible XP re-apply (the engine handles that). Prereqs
 * may be categorical (affiliation category / caste / possessed Field / prior
 * module) as well as the usual attribute/trait minimums. */
const real = (name, xpCost, s = {}) => ({
  name, img: IMG, type: 'lifeModule',
  system: {
    stage: 4, moduleType: 'reallife', affiliationKey: '', xpCost, time: s.time || 0,
    repeatable: s.repeatable !== false,
    noFlexOnRepeat: !!s.noFlexOnRepeat,
    restrictedToAffiliations: s.restricted || [],
    variantLabel: s.variantLabel || '', variants: s.variants || [],
    prerequisites: {
      attributes: s.reqAttrs || {}, skills: s.reqSkills || {}, traits: s.reqTraits || {},
      affiliationCategories: s.reqCategories || [], forbidCategories: s.forbidCategories || [],
      castes: s.reqCastes || [], fields: s.reqFields || [], modules: s.reqModules || [],
      note: s.reqNote || ''
    },
    fixedXP: { attributes: s.attrs || {}, skills: s.skills || [], traits: s.traits || [] },
    flexibleXP: s.flex || [],
    grantsFields: [], notes: s.notes || '', pageRef: s.pageRef || 'ATOW pp.84-91',
    description: s.desc || ''
  }
});
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
      variantLabel: '', variantRequired: false, variants: [],
      requiresBirthAffiliation: false,
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

  /* ==== STAGE 0 — AFFILIATIONS (ATOW pp.64-74) ========================== */
  aff('Draconis Combine (House Kurita)', 'kurita', 150, {
    primary: 'Japanese', secondary: ['Arabic', 'English', 'Swedenese'],
    attrs: { wil: 50 },
    traits: [tr('Compulsion/Xenophobia', -100), tr('Wealth', -50)],
    skills: [sk('Art', 15, 'Oral Tradition'), sk('Martial Arts', 10), sk('Protocol', 15, 'Combine')],
    flex: [flex(100, 1, 'traits', 'choose one: Pain Resistance or Combat Sense', ['Pain Resistance', 'Combat Sense']),
      flex(10, 1, 'skills', 'choose one: Archery, Melee Weapons or Thrown Weapons/Blade', ['Archery', 'Melee Weapons', 'Thrown Weapons/Blade'])],
    subs: [
      saff('azami', 'Azami', {
        attrs: { wil: 190 }, traits: [tr('Compulsion/Xenophobia', -50), tr('Equipped', -50), tr('Wealth', -25)],
        skills: [sk('Language', 10, 'Arabic'), sk('Language', -10, 'Japanese'), sk('Martial Arts', 10), sk('Melee Weapons', 10), sk('Animal Handling', 5, 'Riding'), sk('Survival', 10, 'Any')] }),
      saff('benjamin', 'Benjamin District', {
        traits: [tr('Compulsion/Paranoid of Combine Government', -50), tr('Connections', 50), tr('Patient', 25), tr('Wealth', 35)],
        skills: [sk('Art', 5, 'Oral Tradition'), sk('Martial Arts', 10), sk('Protocol', 15, 'Combine'), sk('Streetwise', 10, 'Combine')] }),
      saff('dieron', 'Dieron District', {
        attrs: { int: 50, wil: -50 }, traits: [tr('Compulsion/Xenophobia', 50), tr('Connections', 60), tr('Enemy', -100), tr('Wealth', 50)],
        skills: [sk('Interest', 5, 'Star League History'), sk('Language', 15, 'Any'), sk('Negotiation', 5), sk('Art', 15, 'Any')] }),
      saff('new-samarkand', 'New Samarkand (Galedon) District', {
        attrs: { wil: 100, cha: -50 }, traits: [tr('Compulsion/Hatred of Federated Suns', -50), tr('Connections', 50)],
        skills: [sk('Interest', 10, 'Combine History'), sk('Melee Weapons', 15), sk('Negotiation', 5), sk('Protocol', 10, 'Combine'), sk('Streetwise', 10, 'Combine')] }),
      saff('pesht', 'Pesht District', {
        attrs: { wil: 100, edg: -25 }, traits: [tr('Compulsion/Hatred of Clans', -100), tr('Connections', 20), tr('Wealth', 50)],
        skills: [sk('Martial Arts', 10), sk('Melee Weapons', 15), sk('Protocol', 20, 'Combine'), sk('Streetwise', 10, 'Combine')] })
    ],
    notes: 'Child labour is legal in the Draconis Combine, so Combine characters may take the Civilian Job Stage 4 module in place of a Stage 2 module (advancing immediately to age 18).',
    desc: '<p>Origins in the Draconis Combine (House Kurita), a harsh, honour-bound realm patterned on feudal Japan.</p>'
  }),

  aff('Federated Suns (House Davion)', 'davion', 150, {
    primary: 'English', secondary: ['French', 'German', 'Hindi', 'Russian'],
    skills: [sk('Protocol', 10, 'FedSuns')],
    flex: [flex(100, 1, 'traits', 'choose Natural Aptitude/Protocol or Natural Aptitude/Strategy (requires INT 4)', ['Natural Aptitude/Protocol', 'Natural Aptitude/Strategy'])],
    subs: [
      saff('crucis-march', 'Crucis March', {
        attrs: { wil: 50, edg: -50 },
        skills: [sk('Art', 10, 'Any'), sk('Interest', 15, 'FedSuns History'), sk('Protocol', 15, 'FedSuns')] }),
      saff('draconis-march', 'Draconis March', {
        attrs: { edg: 25 }, traits: [tr('Connections', 20), tr('Compulsion/Hatred of Draconis Combine', -30)],
        skills: [sk('Art', 10, 'Any'), sk('Interest', 10, 'FedSuns History'), sk('Protocol', 5, 'FedSuns')] }),
      saff('capellan-march', 'Capellan March', {
        attrs: { wil: 40 }, traits: [tr('Connections', 25), tr('Compulsion/Hatred of Capellan Confederation', -50)],
        skills: [sk('Protocol', 10, 'FedSuns'), sk('Interest', 10, 'FedSuns History'), sk('Language', 5, 'Choose one from Cantonese, German, Mandarin, Spanish or Russian')] }),
      saff('outback', 'Outback', {
        attrs: { str: 50, bod: 150, wil: 100, int: -100 }, traits: [tr('Illiterate', -50), tr('Reputation', -50), tr('Wealth', -100)],
        skills: [sk('Art', 10, 'Any or Interest/Any'), sk('Streetwise', 10, 'FedSuns'), sk('Survival', 20, 'Any')] })
    ],
    notes: 'A minimum INT score of 4 is required for FedSuns characters that select Natural Aptitude/Protocol or Natural Aptitude/Strategy in Stage 0.',
    desc: '<p>Origins in the Federated Suns (House Davion), a realm of border marches patterned on feudal England.</p>'
  }),

  aff('Free Worlds League (House Marik)', 'marik', 150, {
    primary: 'English', secondary: ['Greek', 'Hindi', 'Italian', 'Mandarin', 'Mongolian', 'Romanian', 'Slovak', 'Spanish', 'Urdu'],
    skills: [sk('Language', 15, 'Any Secondary'), sk('Art', 10, 'Any')],
    subs: [
      saff('marik-commonwealth', 'Marik Commonwealth', {
        traits: [tr('Wealth', 100), tr('Equipped', 100), tr('Reputation', -100)],
        skills: [sk('Appraisal', 5), sk('Negotiation', 10), sk('Protocol', 10, 'Free Worlds')] }),
      saff('regulus', 'Principality of Regulus', {
        attrs: { wil: 75 }, traits: [tr('Gregarious', 75), tr('Compulsion/Atrean Opponent', -50), tr('Reputation', -50)],
        skills: [sk('Interest', 20, 'Regulan History'), sk('Negotiation', 25), sk('Perception', 15), sk('Protocol', 15, 'Free Worlds')] }),
      saff('oriente', 'Duchy of Oriente', {
        traits: [tr('Reputation', 100)],
        skills: [sk('Appraisal', 5), sk('Negotiation', 15), sk('Technician', 5, 'Any')] }),
      saff('andurien', 'Duchy of Andurien', {
        attrs: { wil: 50 }, traits: [tr('Combat Sense', 215), tr('Compulsion/Hatred of House Liao', -100), tr('Compulsion/Atrean Opponent', -50), tr('Reputation', -30)],
        skills: [sk('Negotiation', 15), sk('Perception', 10), sk('Protocol', 15, 'Free Worlds')] }),
      saff('other-fwl', 'Other FWL Worlds', {
        skills: [sk('Appraisal', 15), sk('Language', 20, 'Any'), sk('Protocol', 10, 'Free Worlds')],
        flex: [flex(35, 1, 'traits', 'any one Trait'), flex(10, 2, 'skills', 'any two other Skills'), flex(25, 1, 'any', '+25 to any one Attribute, Trait or Language Skill')] })
    ],
    notes: 'Free Worlds characters that receive an Implant/Prosthetics Trait automatically receive -100 XP in the Reputation Trait as well.',
    desc: '<p>Origins in the Free Worlds League (House Marik), an open-minded but divided confederation of smaller states.</p>'
  }),

  aff('Lyran Alliance (House Steiner)', 'steiner', 150, {
    primary: 'German', secondary: ['English', 'Italian', 'Scots Gaelic', 'Swedish'],
    attrs: { wil: -50, edg: -50 },
    traits: [tr('Equipped', 100), tr('Extra Income', 50), tr('Wealth', 100)],
    skills: [sk('Negotiation', 15), sk('Appraisal', 10), sk('Protocol', 15, 'Lyran')],
    flex: [flex(100, 1, 'traits', 'choose either Combat Paralysis or Glass Jaw (penalty)', ['Combat Paralysis', 'Glass Jaw'])],
    subs: [
      saff('alarion', 'Alarion Province', {
        attrs: { cha: -50 }, traits: [tr('Wealth', 70)],
        skills: [sk('Administration', 10), sk('Interest', 10, 'Any'), sk('Language', 10, 'Any'), sk('Negotiation', 10)] }),
      saff('bolan', 'Bolan Province', {
        traits: [tr('Compulsion/Hatred of House Marik', -50), tr('Connections', 50), tr('Wealth', 25)],
        skills: [sk('Administration', 5), sk('Negotiation', 15), sk('Protocol', 10, 'Lyran'), sk('Streetwise', 5, 'Lyran')] }),
      saff('coventry', 'Coventry Province', {
        attrs: { wil: 100 }, traits: [tr('Compulsion/Hatred of Clans', -95), tr('Wealth', 25)],
        skills: [sk('Administration', 10), sk('Negotiation', 10), sk('Protocol', 10, 'Lyran')] }),
      saff('donegal', 'Donegal Province', {
        attrs: { wil: 50 }, traits: [tr('Compulsion/Greedy', -75), tr('Connections', 50), tr('Reputation', -50), tr('Wealth', 50)],
        skills: [sk('Appraisal', 10), sk('Negotiation', 10), sk('Protocol', 15, 'Lyran')] }),
      saff('skye', 'Skye Province', {
        attrs: { wil: 100 }, traits: [tr('Connections', 85), tr('Reputation', -150)],
        skills: [sk('Language', 10, 'Scots Gaelic'), sk('Negotiation', 15), sk('Protocol', -15, 'Lyran'), sk('Streetwise', 15, 'Lyran')] })
    ],
    desc: '<p>Origins in the Lyran Alliance (House Steiner), a heavily industrialised, mercantile realm patterned on feudal Germany.</p>'
  }),

  aff('Free Rasalhague Republic', 'rasalhague', 100, {
    primary: 'Swedish', secondary: ['English', 'Japanese', 'Swedenese', 'German'],
    attrs: { wil: 25, edg: -25 },
    skills: [sk('Negotiation', 15), sk('Interest', 10, 'Any')],
    subs: [
      saff('clan-war-expatriate', 'Clan War Expatriate', {
        attrs: { wil: 125, edg: 100 }, traits: [tr('Compulsion/Hatred of Clans', -150), tr('Wealth', -50)],
        skills: [sk('Language', 15, 'Choose Any Lyran or Draconis'), sk('Martial Arts', 10), sk('Protocol', 10, 'Choose either Lyran or Draconis'), sk('Small Arms', 15)] }),
      saff('ghost-bear-dominion', 'Ghost Bear Dominion', {
        traits: [tr('Equipped', 50), tr('Introvert', -25), tr('Reputation', -25)],
        skills: [sk('Protocol', 20, 'Clan (Ghost Bear)'), sk('Interest', 10, 'Any'), sk('Interest', 10, 'Remembrance'), sk('Negotiation', 10), sk('Martial Arts', 15), sk('Melee Weapons', 10)] })
    ],
    notes: 'Rasalhague-born characters that join a mercenary command automatically receive -100 XP in the Reputation Trait. Characters with the Ghost Bear Dominion sub-affiliation reflect native (non-Clan) Rasalhagians and must take only Stage 1 and 2 modules permitted to Clan freeborns.',
    desc: '<p>Origins in the Free Rasalhague Republic, a Scandinavian realm long caught between the Combine and the Clans.</p>'
  }),

  aff('Minor Periphery State', 'periphery-minor', 75, {
    primary: 'English', secondary: ['Any'],
    traits: [tr('Equipped', -150)],
    skills: [sk('Perception', 15), sk('Survival', 20, 'Any')],
    flex: [flex(25, 3, 'any', '+25 XP each to any three Attributes or Traits')],
    subs: [
      saff('fiefdom-of-randis', 'Fiefdom of Randis', {
        attrs: { bod: 125, edg: 50 }, traits: [tr('Illiterate', -75), tr('Wealth', -50)],
        skills: [sk('Martial Arts', 10), sk('Melee Weapons', 10), sk('Negotiation', 10), sk('Streetwise', 15, 'Periphery'), sk('Survival', 20, 'Any')] }),
      saff('franklin-fiefs', 'Franklin Fiefs', {
        attrs: { bod: 150, int: -100, wil: 50 }, traits: [tr('Equipped', -60), tr('Illiterate', -90), tr('Toughness', 100)],
        skills: [sk('Martial Arts', 15), sk('MedTech', 10, 'Any'), sk('Protocol', 10, 'Novo Franklin'), sk('Streetwise', 10, 'Periphery'), sk('Survival', 10, 'Any')],
        flex: [flex(10, 1, 'skills', 'choose one: Archery, Melee Weapons or Negotiation', ['Archery', 'Melee Weapons', 'Negotiation'])] }),
      saff('mica-majority', 'Mica Majority', {
        attrs: { bod: 100, rfl: 100, edg: -100 }, traits: [tr('Equipped', -25), tr('Toughness', 100), tr('Wealth', -100)],
        skills: [sk('Career', 10, 'Mining'), sk('Language', 10, 'Japanese'), sk('Negotiation', 10), sk('Survival', 10, 'Arctic')] }),
      saff('niops-association', 'Niops Association', {
        attrs: { int: 125, wil: -110 }, traits: [tr('Equipped', 200), tr('Introvert', -125)],
        skills: [sk('Interest', 10, 'Any'), sk('Technician', 15, 'Any')] }),
      saff('rim-collection', 'Rim Collection', {
        attrs: { cha: -50, edg: 100 }, traits: [tr('Fit', 75), tr('Wealth', -50)],
        skills: [sk('Negotiation', 15), sk('Small Arms', 5)],
        flex: [flex(10, 2, 'skills', 'choose two: Animal Handling/Any, Archery, Martial Arts, Melee Weapons, Streetwise/Rim Collection or Survival/Any', ['Animal Handling/Any', 'Archery', 'Martial Arts', 'Melee Weapons', 'Streetwise/Rim Collection', 'Survival/Any'])] })
    ],
    notes: 'Periphery characters may not take: High School or Military School (Stage 2); University or Military Academy (Stage 3); Postgraduate Study (Stage 4). Franklin Fiefs characters without the Citizen Trait may not receive the Title or Property Trait and may only take Basic Training, Infantry or Cavalry. Mica Majority and Rim Collection characters may not take the Nobility Life Modules nor hold titles.',
    desc: '<p>Origins in one of the small, well-armed statelets of the Periphery.</p>'
  }),

  aff('Major Periphery State', 'periphery-major', 100, {
    primary: 'English', secondary: [],
    traits: [tr('Equipped', -50)],
    flex: [flex(15, 3, 'any', '+15 XP each to any three Attributes, Traits or Skills')],
    subs: [
      saff('circinus-federation', 'Circinus Federation', {
        secondary: ['German', 'Spanish'],
        attrs: { str: 100, bod: 75, int: -100, wil: 70 }, traits: [tr('Illiterate', -75), tr('Reputation', -200), tr('Toughness', 300), tr('Wealth', -125)],
        flex: [flex(20, 3, 'skills', 'choose three: Animal Handling/Any, Martial Arts, MedTech/Any, Small Arms, Streetwise/Periphery, Survival/Any or Tracking/Any', ['Animal Handling/Any', 'Martial Arts', 'MedTech/Any', 'Small Arms', 'Streetwise/Periphery', 'Survival/Any', 'Tracking/Any'])] }),
      saff('magistracy-of-canopus', 'Magistracy of Canopus', {
        secondary: ['Greek', 'Romanian', 'Spanish', 'Urdu'],
        attrs: { cha: 100, edg: 50 }, traits: [tr('Gregarious', 50), tr('Illiterate', -25), tr('Reputation', -125), tr('Wealth', 25)],
        skills: [sk('Streetwise', 15, 'Magistracy')],
        flex: [flex(15, 1, 'skills', 'choose one: Acting or MedTech/General', ['Acting', 'MedTech/General'])],
        notes: 'Includes the Fronc Reaches.' }),
      saff('marian-hegemony', 'Marian Hegemony', {
        primary: 'Latin', secondary: ['French', 'German', 'Greek', 'Spanish', 'Swedish'],
        attrs: { wil: 100 }, traits: [tr('Compulsion/Paranoid', -50), tr('Connections', 25), tr('Reputation', -150), tr('Toughness', 125)],
        skills: [sk('Interest', 15, 'Marian History'), sk('Interest', 10, 'Roman History'), sk('Language', 15, 'Latin'), sk('Protocol', 10, 'Marian'), sk('Strategy', 5)],
        notes: 'Marian characters must purchase the Citizen Trait or take the Slave Stage 1 module.' }),
      saff('outworlds-alliance', 'Outworlds Alliance', {
        secondary: ['French', 'Japanese'],
        attrs: { edg: 75 }, traits: [tr('Equipped', -55), tr('G-Tolerance', 125), tr('Wealth', -75)],
        skills: [sk('Streetwise', 10, 'Outworlds'), sk('Survival', 10, 'Any')],
        flex: [flex(15, 1, 'skills', 'choose one: Martial Arts, MedTech/Any or Small Arms', ['Martial Arts', 'MedTech/Any', 'Small Arms'])] }),
      saff('taurian-concordat', 'Taurian Concordat', {
        secondary: ['French', 'Spanish'],
        attrs: { wil: 150, edg: 50 }, traits: [tr('Compulsion/Distrust FedSuns', -75), tr('Compulsion/Stubborn', -75)],
        skills: [sk('Martial Arts', 10), sk('Negotiation', 10), sk('Small Arms', 15), sk('Streetwise', 15, 'Taurian'), sk('Survival', 5, 'Any')],
        notes: 'Includes the Calderon Protectorate.' })
    ],
    notes: 'Primary language is English; each sub-affiliation lists its own secondary (or primary) languages. The four major Periphery realms are miniature Successor States.',
    desc: '<p>Origins in one of the major Periphery nations — Magistracy of Canopus, Marian Hegemony, Outworlds Alliance, Taurian Concordat or Circinus Federation.</p>'
  }),

  aff('Deep Periphery', 'periphery-deep', 50, {
    primary: '', secondary: [],
    attrs: { wil: 60 }, traits: [tr('Equipped', -80)],
    flex: [flex(10, 2, 'any', '+10 XP each to any two Attributes, Traits or Skills')],
    subs: [
      saff('hanseatic-league', 'Hanseatic League', {
        primary: 'German', secondary: ['English'],
        traits: [tr('Citizenship', 30), tr('Compulsion/Distrust Lyrans', -20)],
        skills: [sk('Appraisal', 10), sk('Negotiation', 20), sk('Protocol', 10, 'Hanseatic')],
        notes: 'If the Wealth Trait drops to 0 or less, lose Citizenship and gain Reputation (-20) and In For Life (-40).' }),
      saff('castilian-principalities', 'Castilian Principalities', {
        primary: 'Spanish', secondary: ['German'],
        attrs: { dex: 25 }, traits: [tr('Compulsion/Castilian Honor Code', -20), tr('Compulsion/Hatred of Umayyads', -20)],
        skills: [sk('Martial Arts', 15), sk('Melee Weapons', 15), sk('Negotiation', 10), sk('Protocol', 25, 'Castilian')],
        notes: 'Rank may not exceed Title level; may not take University modules.' }),
      saff('umayyad-caliphate', 'Umayyad Caliphate', {
        primary: 'Arabic', secondary: ['English'],
        attrs: { dex: 20 }, traits: [tr('Compulsion/Xenophobic', -10)],
        skills: [sk('Art', 10, 'Any'), sk('Interest', 10, 'Any'), sk('Protocol', 20, 'Umayyad')],
        notes: 'Warriors must take the Nobility Stage 1 module and need a Title Trait for Officer/MechWarrior Fields.' }),
      saff('jarnfolk', 'JàrnFòlk', {
        primary: 'JàrnFòlk Norse', secondary: ['Danish', 'English', 'German', 'Swedish'],
        attrs: { rfl: 20 }, traits: [tr('Compulsion/Xenophobic', -10), tr('Natural Aptitude/Martial Arts', 10), tr('Wealth', -10)],
        skills: [sk('Negotiation', 15), sk('Protocol', 15, 'JàrnFòlk Families')],
        flex: [flex(10, 1, 'skills', 'choose one: Art/Any, Interest/Any or Technician/Any', ['Art/Any', 'Interest/Any', 'Technician/Any'])],
        notes: 'May not take White Collar/Preparatory School/Military School/Undergraduate Studies, nor any Stage 3 except Family Training; may not become MechWarriors or use battle armor.' })
    ],
    notes: 'Each sub-affiliation defines its own primary and secondary languages (see the sub notes).',
    desc: '<p>Origins in one of the four realms of the Deep Periphery — the Hanseatic League, Castilian Principalities, Umayyad Caliphate or JàrnFòlk.</p>'
  }),

  aff('Invading Clan', 'clan', 75, {
    primary: 'English', secondary: [],
    traits: [tr('Compulsion/Arrogance', -50), tr('Compulsion/Distrust of Inner Sphere', -100)],
    skills: [sk('Interest', 25, 'Clan Remembrance'), sk('Protocol', 25, 'Clan')],
    variantLabel: 'Caste', variantRequired: true, variants: CLAN_CASTES,
    subs: [
      saff('diamond-shark', 'Diamond Shark', {
        attrs: { str: -45, int: 25, edg: -50 }, traits: [tr('Connections', 25), tr('Equipped', 25), tr('Wealth', 30)],
        skills: [sk('Negotiation', 20), sk('Perception', 10), sk('Protocol', 10, 'Diamond Shark')] }),
      saff('ghost-bear', 'Ghost Bear', {
        attrs: { str: 25, bod: 25 }, traits: [tr("Compulsion/Hate Hell's Horses", -25), tr('Exceptional Attribute/Strength', 50), tr('Slow Learner', -50)],
        skills: [sk('Art', 10, 'Any'), sk('Protocol', 10, 'Ghost Bear'), sk('Streetwise', 5, 'Rasalhague')],
        notes: 'Cannot choose the Aerospace Phenotype; must select MechWarrior Phenotype (substituting one Fighter Pilot Field Skill).' }),
      saff('hells-horses', "Hell's Horses", {
        attrs: { str: 25, bod: 25 }, traits: [tr('Compulsion/Hate Ghost Bears', -25), tr('Introvert', -30)],
        skills: [sk('Melee Weapons', 10), sk('Navigation', 15, 'Ground'), sk('Protocol', 15, "Hell's Horses"), sk('Survival', 15, 'Desert')] }),
      saff('jade-falcon', 'Jade Falcon', {
        attrs: { wil: 25 }, traits: [tr('Compulsion/Falcon Pride', -75), tr('Compulsion/Hate Steel Vipers', -50), tr('Reputation', 100)],
        skills: [sk('Acting', 10), sk('Martial Arts', 15), sk('Protocol', 15, 'Jade Falcon'), sk('Survival', 10, 'Forests')] }),
      saff('nova-cat', 'Nova Cat', {
        attrs: { edg: 120 }, traits: [tr('Enemy/The Clans', -100), tr('Enemy/Draconis Combine', -50), tr('Equipped', 50), tr('Reputation', -100), tr('Sixth Sense', 100)],
        skills: [sk('Interest', 10, 'Nova Cat Vision Quest'), sk('Language', 5, 'Japanese'), sk('Protocol', 5, 'Draconis Combine'), sk('Protocol', 10, 'Nova Cat')] }),
      saff('snow-raven', 'Snow Raven', {
        attrs: { int: 20 }, traits: [tr('Compulsion/Raven Pride', -50), tr('Connections', 50)],
        skills: [sk('Negotiation', 10), sk('Protocol', 10, 'Snow Raven'), sk('Zero-G Operations', 10)] }),
      saff('wolf', 'Wolf', {
        attrs: { int: 25, wil: 25 }, traits: [tr('Compulsion/Wolf Pride', -50), tr('Equipped', 50), tr('Enemy', -100), tr('Reputation', 70)],
        skills: [sk('Protocol', 10, 'Wolf')],
        flex: [flex(10, 2, 'skills', 'choose two: Interest/Any, Leadership, Negotiation, Perception or Strategy', ['Interest/Any', 'Leadership', 'Negotiation', 'Perception', 'Strategy'])],
        notes: 'Includes Clan Wolf (in-Exile).' })
    ],
    notes: 'Clan characters may not take the Property or Extra Income Traits; the Title Trait (a Bloodname) is unavailable unless the character also takes the Trueborn Trait. Choose both a Clan (sub-affiliation) and a Caste. Freeborn Clan characters do not require a Phenotype Trait.',
    desc: '<p>Origins in one of the seven warrior Clans that invaded the Inner Sphere. Pick your Clan and your caste.</p>'
  }),

  aff('Homeworld Clan', 'clan', 50, {
    primary: 'English', secondary: [],
    traits: [tr('Compulsion/Distrust of Inner Sphere', -100), tr('Compulsion/Hate Invading Clans', -100)],
    skills: [sk('Interest', 25, 'Clan Remembrance'), sk('Protocol', 25, 'Clan')],
    variantLabel: 'Caste', variantRequired: true, variants: CLAN_CASTES,
    subs: [
      saff('blood-spirit', 'Blood Spirit', {
        attrs: { bod: 25, wil: 100, cha: -50 }, traits: [tr('Combat Sense', 100), tr('Compulsion/Blood Spirit Fanaticism', -100), tr('Compulsion/Hate Star Adder', -100), tr('Equipped', -65), tr('Exceptional Attribute/WIL', 200), tr('Introvert', -50), tr('Reputation', -50)],
        skills: [sk('Interest', 25, 'Clan History'), sk('Martial Arts', 15), sk('Small Arms', 15), sk('Protocol', 10, 'Blood Spirit')] }),
      saff('cloud-cobra', 'Cloud Cobra', {
        attrs: { int: 50, wil: 50 }, traits: [tr('Compulsion/Religious Faith', -75), tr('Equipped', -25), tr('Patient', 100), tr('Reputation', -75)],
        skills: [sk('Interest', 20, 'Theology/Any'), sk('Protocol', 20, 'Cloud Cobra')],
        flex: [flex(10, 1, 'skills', '+10 XP to any one other Skill')] }),
      saff('coyote', 'Coyote', {
        attrs: { int: 100, wil: -60, edg: 25 }, traits: [tr('Equipped', 25), tr('Reputation', -60)],
        skills: [sk('Interest', 15, 'Coyote Rituals'), sk('Protocol', 10, 'Coyote'), sk('Survival', 10, 'Any')],
        flex: [flex(10, 1, 'traits', 'choose one: Custom Vehicle, Natural Aptitude/Computers, Natural Aptitude/Technician/Any or Vehicle Level', ['Custom Vehicle', 'Natural Aptitude/Computers', 'Natural Aptitude/Technician/Any', 'Vehicle Level'])] }),
      saff('fire-mandrill', 'Fire Mandrill', {
        attrs: { wil: 25 }, traits: [tr('Compulsion/Fire Mandrill Fanaticism', -100), tr('Compulsion/Kindraa Fanaticism', -100), tr('Enemy/Rival Kindraa', -25), tr('Reputation', -25)],
        skills: [sk('Language', 20, 'Secondary'), sk('Martial Arts', 15), sk('Protocol', 15, 'Fire Mandrill'), sk('Protocol', 25, 'Kindraa')],
        flex: [flex(75, 1, 'attributes', '+75 XP to any one other Attribute'),
          flex(150, 1, 'traits', 'choose one: Combat Sense, Exceptional Attribute/Any, Fast Learner, Natural Aptitude/Any or Sixth Sense', ['Combat Sense', 'Exceptional Attribute/Any', 'Fast Learner', 'Natural Aptitude/Any', 'Sixth Sense']),
          flex(10, 2, 'skills', 'choose two: Leadership, Melee Weapons, Negotiation, Perception or Tactics/Any', ['Leadership', 'Melee Weapons', 'Negotiation', 'Perception', 'Tactics/Any'])],
        notes: 'Secondary Languages: Chinese, French, German, Japanese, Russian, Spanish. Also -20 XP to any one other Attribute.' }),
      saff('goliath-scorpion', 'Goliath Scorpion', {
        attrs: { dex: 50, int: 50, wil: -50, edg: -50 }, traits: [tr('Compulsion/Necrosia Addiction', -50), tr('Compulsion/Nostalgic', -50), tr('Fit', 55), tr('Reputation', -25)],
        skills: [sk('Interest', 20, 'Star League History'), sk('Melee Weapons', 15), sk('Protocol', 10, 'Goliath Scorpion')],
        flex: [flex(100, 1, 'traits', 'choose one: Exceptional Attribute/INT, Natural Aptitude/Gunnery/Any, Natural Aptitude/Melee Weapons or Natural Aptitude/Interest/Any', ['Exceptional Attribute/INT', 'Natural Aptitude/Gunnery/Any', 'Natural Aptitude/Melee Weapons', 'Natural Aptitude/Interest/Any'])],
        notes: 'Secondary Languages: Goliath Scorpion Battle Language (warrior caste only), Russian.' }),
      saff('ice-hellion', 'Ice Hellion', {
        attrs: { dex: 75, rfl: 100, wil: 50, cha: -75 }, traits: [tr('Combat Sense', 50), tr('Impatient', -100), tr('Reputation', -95)],
        skills: [sk('Interest', 15, 'Clan Remembrance'), sk('Martial Arts', 10), sk('Negotiation', 15), sk('Protocol', 10, 'Ice Hellion'), sk('Swimming', 10), sk('Survival', 10, 'Arctic')] }),
      saff('star-adder', 'Star Adder', {
        attrs: { int: 50, wil: 75, cha: -70 }, traits: [tr('Combat Sense', 50), tr('Compulsion/Clan Honor', -50), tr('Equipped', 25), tr('Reputation', 25)],
        skills: [sk('Leadership', 10), sk('Perception', 10), sk('Protocol', 10, 'Star Adder')],
        flex: [flex(60, 1, 'traits', 'choose one: Compulsion/Adder Arrogance or Compulsion/Burrock Forever! (penalty)', ['Compulsion/Adder Arrogance', 'Compulsion/Burrock Forever!'])] }),
      saff('steel-viper', 'Steel Viper', {
        attrs: { int: 75, wil: 100, cha: -50 }, traits: [tr('Compulsion/Clan Honor', -100), tr('Compulsion/Hate Jade Falcons', -100), tr('Compulsion/Hate Snow Ravens', -50), tr('Connections', 50), tr('Equipped', 50), tr('Reputation', 50)],
        skills: [sk('Negotiation', 15), sk('Protocol', 15, 'Steel Viper'), sk('Survival', 20, 'Any')] })
    ],
    notes: 'See notes for the Invading Clan affiliation. Choose both a Clan (sub-affiliation) and a Caste.',
    desc: '<p>Origins in one of the eight Clans that remained in the Clan Homeworlds. Pick your Clan and your caste.</p>'
  }),

  aff('Independent', 'independent', 50, {
    primary: '', secondary: [],
    attrs: { wil: 20, edg: 20 }, traits: [tr('Equipped', -20), tr('Reputation', -10), tr('Wealth', -10)],
    subs: [
      saff('antallos', 'Antallos (Port Krin)', {
        primary: 'English', secondary: ['Any'],
        attrs: { bod: 20, wil: 10, cha: -10 }, traits: [tr('Illiterate', -20), tr('Pain Resistance', 10), tr('Reputation', -20), tr('Toughness', 10)],
        skills: [sk('Language', 10, 'Japanese'), sk('Perception', 10), sk('Streetwise', 10, 'Periphery')],
        flex: [flex(10, 2, 'skills', 'choose two: Acting, Escape Artist, Martial Arts, Melee Weapons, Small Arms or Survival/Desert', ['Acting', 'Escape Artist', 'Martial Arts', 'Melee Weapons', 'Small Arms', 'Survival/Desert'])] }),
      saff('astrokaszy', 'Astrokaszy', {
        primary: 'Arabic', secondary: ['English', 'German', 'Greek'],
        attrs: { bod: 15, wil: 25, cha: -10, edg: -10 }, traits: [tr('Fit', 20), tr('Compulsion/Xenophobic', -20), tr('Illiterate', -20), tr('Reputation', -10)],
        skills: [sk('Perception', 10), sk('Protocol', 10, 'Astrokaszy'), sk('Streetwise', 10, 'Periphery')],
        flex: [flex(15, 2, 'skills', 'choose two: Acting, Martial Arts, Melee Weapons, Small Arms, Survival/Desert or Thrown Weapons/Any', ['Acting', 'Martial Arts', 'Melee Weapons', 'Small Arms', 'Survival/Desert', 'Thrown Weapons/Any'])] }),
      saff('generic', 'Generic', {
        primary: 'Any', secondary: ['Any from nearest state'],
        traits: [tr('Introvert', -10)],
        skills: [sk('Interest', 10, 'Any'), sk('Negotiation', 10)],
        flex: [flex(10, 4, 'skills', '+10 XP to any four other Skills')] }),
      saff('mercenary', 'Mercenary', {
        primary: 'English', secondary: ['Any'],
        attrs: { cha: -20 }, traits: [tr('Equipped', 20), tr('Rank', 20)],
        skills: [sk('Negotiation', 10), sk('Protocol', 10, 'Mercenary')],
        flex: [flex(10, 1, 'skills', '+10 XP to any one other Skill')],
        notes: 'Only for characters born to the mercenary life.' }),
      saff('pirate', 'Pirate', {
        primary: 'Any', secondary: ['Any from nearest state'],
        attrs: { bod: 20, wil: 10, cha: -30 }, traits: [tr('Pain Resistance', 10), tr('Reputation', -30), tr('Toughness', 10)],
        skills: [sk('Language', 10, 'Any'), sk('Negotiation', 5), sk('Perception', 15)],
        flex: [flex(10, 3, 'skills', 'choose three: Acting, Escape Artist, Martial Arts, Melee Weapons, Small Arms or Survival/Any', ['Acting', 'Escape Artist', 'Martial Arts', 'Melee Weapons', 'Small Arms', 'Survival/Any'])] }),
      saff('spacer', 'Spacer', {
        primary: 'English', secondary: ['Any from nearest state'],
        attrs: { bod: -20, str: -10, dex: 10, rfl: 10 }, traits: [tr('Equipped', 10), tr('G-Tolerance', 20), tr('Introvert', -20), tr('Natural Aptitude/Zero-G Operations', 20)],
        skills: [sk('Career', 10, "Ship's Crew"), sk('Zero-G Operations', 10)],
        flex: [flex(10, 1, 'skills', 'choose one: Appraisal, Interest/Any, Navigation/Space, Negotiation or Sensor Operations', ['Appraisal', 'Interest/Any', 'Navigation/Space', 'Negotiation', 'Sensor Operations'])],
        notes: 'Cannot take the TDS Trait.' }),
      saff('tortuga', 'Tortuga', {
        primary: 'English', secondary: ['Any Taurian or FedSuns language'],
        attrs: { bod: 10, str: 10, wil: 20, cha: -40 }, traits: [tr('Pain Resistance', 10), tr('Reputation', -50), tr('Toughness', 10)],
        skills: [sk('Language', 10, 'Any'), sk('Martial Arts', 10), sk('Negotiation', 10), sk('Perception', 10), sk('Streetwise', 10, 'Periphery')],
        flex: [flex(10, 3, 'skills', 'choose three: Acting, Escape Artist, Melee Weapons, Small Arms or Survival/Any', ['Acting', 'Escape Artist', 'Melee Weapons', 'Small Arms', 'Survival/Any'])] })
    ],
    notes: 'Independents belong to no realm. Antallos, Mercenary, Pirate, Spacer or Tortuga characters may not take Title Traits; Antallos, Pirate or Tortuga characters may not take Nobility, Preparatory School or Military School. A Dark Caste Clan character must take the Pirate sub-affiliation here.',
    desc: '<p>Origins outside the great realms — pirates, mercenaries, spacers and the lawless worlds of the deep dark.</p>'
  }),

  aff('ComStar / Word of Blake', 'comstar', 50, {
    requiresBirthAffiliation: true,
    primary: 'English', secondary: ['Any from nearest state'],
    traits: [tr('Enemy', -100), tr('Equipped', 100), tr('Rank', 50), tr('Reputation', -50)],
    skills: [sk('Communications', 10, 'Conventional'), sk('Interest', 10, 'Writings of Jerome Blake'), sk('Negotiation', 10)],
    subs: [
      saff('comstar', 'ComStar', {
        attrs: { int: 25, wil: -15 }, traits: [tr('Connections', 50), tr('Enemy/Word of Blake', -100), tr('Reputation', 20)],
        skills: [sk('Protocol', 15, 'Nearest state'), sk('Protocol', 15, 'ComStar'), sk('Technician', 10, 'Any')] }),
      saff('word-of-blake', 'Word of Blake', {
        attrs: { wil: 50, cha: -50 }, traits: [tr('Compulsion/Paranoid', -50), tr('Connections', 75), tr('Enemy/ComStar', -100), tr('Equipped', 30)],
        skills: [sk('Interest', 15, 'Writings of Jerome Blake'), sk('Interest', 15, 'Writings of the Master'), sk('Negotiation', 10), sk('Protocol', 5, 'Nearest state'), sk('Technician', 10, 'Any')] })
    ],
    notes: 'Module cost is 50 XP PLUS the cost of a second "birth" affiliation (selecting ComStar/Word of Blake does not reduce the birth affiliation\'s XP costs). May not possess the Extra Income or Property Traits.',
    desc: '<p>Origins in the quasi-religious order of ComStar or the fanatical Word of Blake. Requires a separate "birth" affiliation.</p>'
  }),

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
      vr('aerospace', 'Aerospace', 586, {
        traits: [tr('Vehicle', 100)],
        skills: field(50, [['Gunnery', 'Aerospace'], ['Navigation', 'Space'], ['Piloting', 'Aerospace'], 'Sensor Operations', ['Tactics', 'Space']]),
        flex: [lump(200)],
        notes: 'Clan Aerospace Warrior Field. May apply flexible XP to Pilot – DropShip/JumpShip/WarShip Fields (min 20 XP each); if so, +2 years age and begin with +300 XP Rank.'
      }),
      vr('cavalry', 'Cavalry', 586, {
        traits: [tr('Vehicle', 100)],
        skills: field(50, ['Artillery', ['Driving', 'Any'], ['Gunnery', 'Vehicle'], 'Sensor Operations', ['Tactics', 'Land']]),
        flex: [lump(200)],
        notes: 'Clan Cavalry Field.'
      }),
      vr('elemental', 'Elemental', 586, {
        traits: [tr('Vehicle', 100)],
        skills: field(50, ['Climbing', ['Gunnery', 'Battlesuit'], 'Melee Weapons', ['Piloting', 'Battlesuit'], 'Sensor Operations', 'Small Arms', ['Tactics', 'Infantry']]),
        flex: [lump(100)],
        notes: 'Clan Elemental Field.'
      }),
      vr('infantry', 'Infantry (non-Elemental)', 586, {
        traits: [tr('Equipped', 100)],
        skills: field(50, [['Acrobatics', 'Free-Fall'], 'Artillery', 'Climbing', ['Communications', 'Conventional'], 'Support Weapons', ['Tactics', 'Infantry']]),
        flex: [lump(150)],
        notes: 'Infantry Field.'
      }),
      vr('mechwarrior', 'MechWarrior', 586, {
        traits: [tr('Vehicle', 100)],
        skills: field(50, [['Gunnery', "'Mech"], 'Leadership', ['Navigation', 'Ground'], ['Piloting', "'Mech"], 'Sensor Operations', ['Tactics', 'Land']]),
        flex: [lump(150)],
        notes: 'Clan MechWarrior Field.'
      })
    ],
    notes: 'Clan freeborn warrior training (950 XP total, all branches). Choose a branch of service below. Freeborn warriors may ignore Phenotype prerequisites. Must select a Clan-affiliated Stage 4 module next.',
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
      vr('aerospace', 'Aerospace', 890, {
        traits: [tr('Custom Vehicle', 200)],
        skills: [sk('Gunnery', 20, 'Spacecraft'), sk('Piloting', 20, 'Spacecraft'), sk('Navigation', 40, 'Air'),
          ...field(80, [['Gunnery', 'Aerospace'], ['Navigation', 'Space'], ['Piloting', 'Aerospace'], 'Sensor Operations', ['Tactics', 'Space']])],
        flex: [lump(150)],
        notes: '1,600 XP total. Requires Aerospace Phenotype. May apply flexible XP to Pilot – DropShip/JumpShip/WarShip Fields (min 20 XP each); if so, +2 years age and begin with +300 XP Rank.'
      }),
      vr('elemental', 'Elemental', 890, {
        traits: [tr('Vehicle', 120)],
        skills: field(80, ['Climbing', ['Gunnery', 'Battlesuit'], 'Melee Weapons', ['Piloting', 'Battlesuit'], 'Sensor Operations', 'Small Arms', ['Tactics', 'Infantry']]),
        flex: [lump(150)],
        notes: '1,600 XP total. Requires Elemental Phenotype. Ghost Bear / Hell\'s Horses Elementals may instead take Advanced Training (see ATOW p.78).'
      }),
      vr('mechwarrior', 'MechWarrior', 890, {
        traits: [tr('Custom Vehicle', 200), tr('Vehicle', 70)],
        skills: [sk('Gunnery', 15, "'Mech"), sk('Piloting', 15, 'BattleMech'),
          ...field(80, [['Gunnery', "'Mech"], 'Leadership', ['Navigation', 'Ground'], ['Piloting', "'Mech"], 'Sensor Operations', ['Tactics', 'Land']])],
        flex: [lump(50)],
        notes: '1,600 XP total. Requires MechWarrior Phenotype.'
      }),
      vr('protomech', 'ProtoMech', 790, {
        traits: [tr('Compulsion/Chemical Addiction', -100), tr('Implant/EI Neural Implant', 200),
          tr('Reputation', -100), tr('Toughness', 100), tr('Vehicle', 100)],
        skills: [sk('Navigation', 30, 'Ground'), sk('Tactics', 30, 'Infantry'), sk('Tactics', 30, 'Land'),
          ...field(50, [['Gunnery', 'ProtoMech'], ['Navigation', 'Ground'], ['Piloting', 'ProtoMech'], 'Sensor Operations', ['Tactics', 'Land']])],
        flex: [lump(190)],
        notes: '1,500 XP total (ProtoMech and Advanced ProtoMech Warriors cost 100 XP less than other branches). May not have Combat Paralysis, Glass Jaw, Lost Limb, Poor Hearing or Poor Vision. Requires Implant/EI Neural Implant.'
      })
    ],
    notes: 'Clan trueborn warrior training — 1,600 XP total (1,500 for ProtoMech / Advanced ProtoMech). Choose a branch of service below. Requires the Phenotype and Trueborn Traits. Clan Steel Viper characters reduce final age by 1 year.',
    desc: '<p>The intense trueborn Clan warrior regimen, begun on leaving the crèche.</p>'
  }),
  /* ==== STAGE 3 — HIGHER EDUCATION (ATOW pp.82-83) ====================== */
  /* Schools grant automatic XP + a flexible pool, then the player selects
     1-3 Skill Fields (exactly one Basic, an Advanced before any Special, max 3).
     Field skills/prereqs live in data/skill-fields.mjs. */

  school('Technical College', 'civilian', 600, {
    attrs: { dex: 100, int: 100 }, traits: [tr('Equipped', 150)],
    skills: [sk('Computers', 20), sk('Interest', 30, 'Any')],
    flex: [lump(200)],
    basic: tier(1, ['Communications', 'Pilot – Aerospace (Civilian)', 'Pilot – Aircraft (Civilian)', 'Pilot – DropShip', 'Pilot – Exoskeleton', 'Technician – Civilian']),
    advanced: tier(2, ['Cartographer', 'Engineer', 'Merchant Marine', 'Pilot – IndustrialMech', 'Pilot – JumpShip', 'Technician – Aerospace', "Technician – 'Mech", 'Technician – Vehicle']),
    desc: '<p>The common technical college — training in communications, piloting and the machinery of modern life. Open to any social stratum.</p>'
  }),

  school('Trade School', 'civilian', 560, {
    attrs: { int: 50 }, traits: [tr('Connections', 50), tr('Equipped', 100)],
    flex: [flex(100, 1, 'attributes', '+100 XP to any one other Attribute'),
      flex(20, 3, 'skills', '+20 XP to any three Skills'), lump(200)],
    basic: tier(1, ['General Studies', 'Merchant']),
    advanced: tier(2, ['Analysis', 'Anthropologist', 'Archaeologist', 'Cartographer', 'Communications', 'HPG Technician', 'Journalist', 'Manager', 'Medical Assistant', 'Merchant Marine']),
    desc: '<p>A generalized equivalent to technical college (from community colleges to correspondence schools) covering non-technical careers. Open to any social stratum.</p>'
  }),

  school('University', 'civilian', 710, {
    prereq: { attributes: { int: 4 }, skills: {}, traits: {} },
    conditional: cond(['Preparatory School', 'Nobility', 'White Collar'], {
      attrs: { wil: 100, edg: -100 }, traits: [tr('Connections', 200), tr('Reputation', -100), tr('Wealth', -100)]
    }),
    attrs: { int: 150, wil: 75, cha: 25, edg: 25 },
    traits: [tr('Connections', 200), tr('Equipped', 50), tr('Reputation', 75), tr('Wealth', -200)],
    skills: [sk('Computers', 25), sk('Interest', 20, 'Any'), sk('Perception', 25), sk('Protocol', 20, 'Affiliation')],
    flex: [lump(220)],
    basic: tier(1, ['Cartographer', 'Communications', 'General Studies', 'Manager', 'Scientist', 'Technician – Civilian']),
    advanced: tier(2, ['Analysis', 'Anthropologist', 'Archaeologist', 'Detective', 'Engineer', 'HPG Technician', 'Planetary Surveyor', 'Medical Assistant', 'Politician', 'Technician – Aerospace', 'Technician – Vehicle']),
    special: tier(2, ['Doctor', 'Lawyer', 'Military Scientist', "Technician – 'Mech", 'Technician – Military']),
    notes: 'Requires INT 4+. If the character did not take Preparatory School (Stage 2) or Nobility / White Collar (Stage 1), a penalty allotment (WIL +100, EDG -100, Connections +200, Reputation -100, Wealth -100) is applied automatically.',
    desc: '<p>The upper crust of civilian higher education — science, medicine, law and technology. Expensive, with strict entry requirements.</p>'
  }),

  school('Solaris Internship', 'civilian', 700, {
    prereq: { attributes: {}, skills: {}, traits: {} },
    fieldWaivers: ['Cavalry', 'MechWarrior', 'Pilot – Battle Armor'],
    attrs: { cha: 150, edg: 50 },
    traits: [tr('Connections', 100), tr('Enemy', -50), tr('Reputation', 100)],
    skills: [sk('Acting', 25), sk('Interest', 30, 'Solaris Games'), sk('Perception', 20), sk('Streetwise', 25, 'Any')],
    flex: [flex(50, 1, 'attributes', '+50 XP to any one other Attribute'),
      flex(100, 1, 'traits', 'choose: Equipped or Vehicle', ['Equipped', 'Vehicle']), lump(100)],
    basic: tier(2, ['Communications', 'Manager', 'Technician – Military']),
    advanced: tier(2, ['Cavalry', 'Journalist', 'MechWarrior', 'Pilot – Battle Armor', 'Politician', "Technician – 'Mech"]),
    notes: 'Requires residency on Solaris VII and Connections +2 TP or higher. Solaris Cavalry and MechWarrior Fields do not require Basic Training; Solaris Battle Armor Pilots do not require the Infantry or Basic Training Fields.',
    desc: '<p>Solaris VII\'s informal internships — an unconventional path into stable management, arena combat or cutthroat journalism.</p>'
  }),

  school('Police Academy', 'intelligence', 680, {
    attrs: { rfl: 100, wil: 100 },
    traits: [tr('Connections', 50), tr('Rank', 100), tr('Reputation', 100)],
    skills: [sk('Computers', 15), sk('Driving', 20, 'Any'), sk('Protocol', 25, 'Affiliation'), sk('Streetwise', 30, 'Affiliation')],
    flex: [lump(140)],
    basic: tier(0.5, ['Police Officer']),
    advanced: tier(1, ['Analysis', 'Communications', 'Detective', 'Intelligence', 'Technician – Military']),
    special: tier(2, ['Covert Operations', 'Police Tactical Officer', 'Special Forces', 'Technician – Aerospace', 'Technician – Vehicle']),
    desc: '<p>Standard law-enforcement training — open to any social stratum, fostering community stability and respect.</p>'
  }),

  school('Intelligence Operative Training', 'intelligence', 760, {
    prereq: { attributes: { int: 4, wil: 5 }, skills: {}, traits: {} },
    attrs: { int: 100, wil: 150 },
    traits: [tr('Alternate ID', 50), tr('Connections', 200), tr('In For Life', -300), tr('Rank', 250), tr('Wealth', 50)],
    skills: [sk('Acting', 20), sk('Computers', 20), sk('Protocol', 20, 'Affiliation')],
    flex: [flex(50, 1, 'attributes', '+50 XP to any one other Attribute'), lump(150)],
    basic: tier(1, ['Basic Training']),
    advanced: tier(1, ['Analysis', 'Covert Operations', 'Detective', 'Intelligence', 'Police Officer', 'Scout']),
    special: tier(2, ['Police Tactical Officer', 'Special Forces']),
    notes: 'Requires INT 4+, WIL 5+, and Connections +2 TP or higher.',
    desc: '<p>Secretive, selective training for a civilian or military intelligence service.</p>'
  }),

  school('Military Academy', 'military', 830, {
    conditional: cond(['Preparatory School', 'Military School'], {
      attrs: { wil: 100, edg: -100 }, traits: [tr('Connections', 200), tr('Reputation', -100), tr('Wealth', -100)]
    }),
    attrs: { str: 50, bod: 100, rfl: 125, wil: 100 },
    traits: [tr('Equipped', 100), tr('Rank', 200)],
    skills: [sk('Interest', 15, 'Military History'), sk('Leadership', 10), sk('Protocol', 15, 'Affiliation'), sk('Swimming', 15)],
    flex: [lump(100)],
    basic: tier(1, ['Basic Training', 'Basic Training (Naval)']),
    advanced: tier(1, ['Analysis', 'Cavalry', 'Infantry', 'Marine', 'MechWarrior', 'Pilot – Aerospace (Combat)', 'Pilot – Aircraft (Combat)', 'Pilot – DropShip', 'Scientist', 'Scout', "Ship's Crew"]),
    special: tier(2, ['Doctor', "Infantry – Anti-'Mech", 'Military Scientist', 'Pilot – Battle Armor', 'Pilot – JumpShip', 'Pilot – WarShip', 'Special Forces']),
    notes: 'The finest career military training, where MechWarriors are made. If the character did not take Preparatory School or Military School (Stage 2), a penalty allotment (WIL +100, EDG -100, Connections +200, Reputation -100, Wealth -100) is applied automatically.',
    desc: '<p>An interstellar-grade military academy (Nagelring, Sun Zhang, etc.). Stricter entry than simple enlistment; all recruits are officer candidates.</p>'
  }),

  school('Military Enlistment', 'military', 720, {
    attrs: { str: 125, bod: 125, rfl: 100, wil: 100, cha: -100 },
    traits: [tr('Equipped', 50), tr('Rank', 100)],
    skills: [sk('Swimming', 20)],
    flex: [lump(200)],
    basic: tier(0.5, ['Basic Training', 'Basic Training (Naval)']),
    advanced: tier(1.5, ['Cavalry', 'Infantry', 'Marine', 'Medical Assistant', 'Police Officer', 'Scout', "Ship's Crew", 'Technician – Military']),
    special: tier(1, ['Detective', 'Police Tactical Officer', "Infantry – Anti-'Mech", 'Special Forces', 'Technician – Aerospace', "Technician – 'Mech", 'Technician – Vehicle']),
    desc: '<p>The common standard of military training — conventional infantry and cavalry support troops rather than MechWarriors.</p>'
  }),

  school('Family Training', 'military', 570, {
    prereq: { attributes: {}, skills: {}, traits: {} },
    attrs: { str: 75, bod: 75, rfl: 50, wil: 50 },
    traits: [tr('Equipped', 50), tr('Rank', 100)],
    skills: [sk('Driving', 15, 'Any'), sk('Interest', 20, 'Homeworld History'), sk('Protocol', 15, 'Affiliation'), sk('Survival', 20, 'Any')],
    flex: [lump(100)],
    basic: tier(0.5, ['Basic Training', 'Basic Training (Naval)']),
    advanced: tier(1.5, ['Cavalry', 'Infantry', 'Marine', 'MechWarrior', 'Pilot – Aerospace (Combat)', 'Pilot – Aircraft (Combat)', 'Pilot – DropShip', 'Scout', "Ship's Crew"]),
    special: tier(2, ["Infantry – Anti-'Mech", 'Pilot – Battle Armor', 'Pilot – JumpShip']),
    notes: 'Requires Preparatory School or Military School (Stage 2), or Connections +1 TP or higher. A watered-down academy experience common among minor noble houses.',
    desc: '<p>Military training performed "in-house" by a noble house or affluent family, common on far-flung worlds.</p>'
  }),

  school('Officer Candidate School', 'officer', 550, {
    attrs: { cha: 100, edg: -200 },
    traits: [tr('Connections', 50), tr('Equipped', 50), tr('Rank', 250), tr('Reputation', 50), tr('Wealth', 100)],
    skills: [sk('Leadership', 10), sk('Protocol', 25, 'Affiliation')],
    flex: [lump(115)],
    basic: tier(1, ['Officer']),
    notes: 'A bolt-on to an Intelligence, Police or Military school (requires at least one Basic and one Advanced Field there). Grants only the Officer Field and access to the officer (O-grade) ranks. Does not count against the same-type repeat rule.',
    desc: '<p>Officer Candidate School — technically a branch of the character\'s academy, taken after all other Fields, unlocking the officer ranks.</p>'
  }),
  /* ==== STAGE 4 — REAL LIFE (ATOW pp.84-91) ============================= */
  /* Optional and repeatable (a repeat re-awards only Skill + Flexible XP).
     Prereqs may be categorical (affiliation category / caste / possessed Field
     / prior module). Affiliation & caste sub-modules within some entries are a
     Phase-3 follow-up — noted in each module's `notes`. */

  real('Agitator', 900, {
    time: 4,
    attrs: { wil: 75 },
    traits: [tr('Bloodmark', -50), tr('Gregarious', 80), tr('Toughness', 80), tr('Reputation', -150)],
    skills: [sk('Acting', 50), sk('Disguise', 75), sk('Driving', 65, 'Any'), sk('Leadership', 60), sk('Negotiation', 80),
      sk('Perception', 70), sk('Prestidigitation', 100, 'Any'), sk('Small Arms', 75), sk('Streetwise', 75, 'Affiliation'),
      sk('Tactics', 40, 'Infantry'), sk('Training', 50)],
    flex: [lump(125, 'any', 'max +50 XP to any one Attribute')],
    desc: '<p>Challenging authority by any means necessary — a life of constant peril.</p>'
  }),

  real('Civilian Job', 600, {
    time: 6,
    reqNote: 'Clan characters from any non-warrior caste except Scientist and Dark Caste use this module.',
    skills: [sk('Administration', 75), sk('Career', 40, 'Any Non-Military'), sk('Computers', 40), sk('Driving', 60, 'Any'),
      sk('Interest', 50, 'Any'), sk('Interest', 50, 'Any'), sk('Leadership', 40), sk('Negotiation', 30), sk('Protocol', 50, 'Affiliation')],
    flex: [flex(20, 4, 'skills', '+20 XP to any four Skills in your chosen career Field (else treat as flexible)'), lump(85)],
    desc: '<p>Honest work in the vast civilian infrastructure — bureaucrat, clerk, loader.</p>'
  }),

  real('Clan Watch Operative', 1200, {
    time: 3, restricted: ['clan'], reqCategories: ['clan'], reqCastes: ['warrior', 'scientist', 'technician'],
    attrs: { int: 70, rfl: 50, cha: -75 },
    traits: [tr('Connections', 100), tr('Dark Secret', -50), tr('In For Life', -100), tr('Reputation', -50)],
    skills: [sk('Acting', 30), sk('Computers', 75), sk('Cryptography', 50), sk('Demolitions', 40), sk('Martial Arts', 75),
      sk('Perception', 75), sk('Protocol', 50, 'Affiliation'), sk('Small Arms', 80), sk('Stealth', 50), sk('Streetwise', 50, 'Affiliation'),
      sk('Tracking', 80, 'Any')],
    flex: [lump(175)],
    notes: 'Homeworld / Invader Clan sub-modules add their own skills (Phase-3 follow-up). Warrior, Scientist or Technician castes only.',
    desc: '<p>The Clans\' grudging foray into espionage — spycraft the warrior castes disdain.</p>'
  }),

  real('Clan Warrior Washout', 400, {
    time: 2, repeatable: false, restricted: ['clan'], reqCategories: ['clan'], reqModules: ['Freeborn Sibko', 'Trueborn Sibko'],
    attrs: { cha: -25, wil: -50 },
    traits: [tr('Compulsion/Any', -25), tr('Reputation', -150)],
    skills: [sk('Career', -30, 'Soldier'), sk('Computers', 25), sk('Protocol', 80, 'Affiliation'), sk('Survival', 75, 'Any')],
    flex: [lump(185)],
    notes: 'Cannot be repeated. Player chooses the new caste; each caste (Scientist/Technician/Merchant/Laborer) adds its own XP (Phase-3 follow-up). Also -60 XP (-30 to two Clan Warrior Field Skills). Requires a prior Freeborn or Trueborn Sibko.',
    desc: '<p>Washed out of warrior training and consigned to a lesser caste.</p>'
  }),

  real('Cloister Training', 700, {
    time: 3, repeatable: false, restricted: ['clan'], reqCategories: ['clan'], reqCastes: ['warrior'], reqAttrs: { wil: 5 },
    attrs: { wil: 75 },
    traits: [tr('Connections', 50), tr('In For Life', -75)],
    skills: [sk('Interest', 80, 'Clan Remembrance'), sk('Interest', 100, 'Theology'), sk('Interest', 75, 'Any'),
      sk('Melee Weapons', 50), sk('Perception', 35), sk('Training', 85)],
    flex: [flex(25, 3, 'skills', '+25 XP to three of your Clan Warrior Field Skills'), lump(150)],
    notes: 'Cannot be repeated. Clan warrior caste, WIL 5+. Non-Cloud Cobra characters also need Connections +2 TP.',
    desc: '<p>The spiritual-martial Cloisters of Clan Cloud Cobra.</p>'
  }),

  real('Combat Correspondent', 700, {
    time: 4, forbidCategories: ['clan'], reqFields: ['Journalist'],
    reqNote: 'Any non-Clan affiliation. Must not have the Combat Paralysis Trait.',
    attrs: { wil: 50, cha: 75 },
    traits: [tr('Extra Income', 40), tr('Reputation', 30)],
    skills: [sk('Art', 35, 'Writing'), sk('Career', 50, 'Journalist'), sk('Communications', 30, 'Conventional'), sk('Computers', 20),
      sk('Investigation', 35), sk('Language', 50, 'Affiliation'), sk('Language', 30, 'Any'), sk('Navigation', 25, 'Any'),
      sk('Negotiation', 40), sk('Perception', 30), sk('Survival', 35, 'Any'), sk('Technician', 35, 'Electronic')],
    flex: [lump(90)],
    desc: '<p>Part soldier, part journalist — front-line battlefield reporting.</p>'
  }),

  real('ComStar / Word of Blake Service', 900, {
    time: 5, restricted: ['comstar'],
    reqNote: 'ComStar or Word of Blake only. Cannot have Lost Limb, Poor Hearing, Poor Vision or TDS above the lowest level.',
    attrs: { dex: 50, int: 50 },
    traits: [tr('Combat Sense', 75), tr('In For Life', -100), tr('Tech Empathy', 35)],
    skills: [sk('Administration', 40), sk('Communications', 55, 'HPG'), sk('Communications', 35, 'Any'), sk('Computers', 35),
      sk('Language', 25, 'Any'), sk('Martial Arts', 45), sk('Protocol', 35, 'Affiliation'), sk('Protocol', 20, 'Any')],
    flex: [flex(100, 1, 'traits', 'choose one: Equipped, Vehicle or Wealth', ['Equipped', 'Vehicle', 'Wealth']), lump(50)],
    notes: 'ComStar / Word of Blake sub-modules add their own XP (Phase-3 follow-up). Members trained in intel/police/military Fields may take Covert Operations / To Serve and Protect / Tour of Duty instead.',
    desc: '<p>Service to ComStar or the Word of Blake — HPG tech, comms, security and investigation.</p>'
  }),

  real('Covert Operations', 900, {
    time: 6, reqCategories: ['innerSphere', 'periphery'],
    reqNote: 'Requires prior military or intelligence training (a Stage-3 Field or a Tour of Duty with +150 XP in Connections or Leadership). Cannot have Combat Paralysis.',
    traits: [tr('Alternate ID', 85), tr('Enemy', -25), tr('In For Life', -110), tr('Sixth Sense', 50)],
    skills: [sk('Acting', 25), sk('Perception', 50), sk('Survival', 75, 'Any')],
    flex: [flex(50, 2, 'attributes', 'choose two: BOD, RFL, WIL or EDG', ['bod', 'rfl', 'wil', 'edg']),
      flex(25, 6, 'skills', '+25 XP to up to six of your Military or Intelligence/Police Field Skills')],
    notes: 'Ten affiliation sub-modules add their own XP (Phase-3 follow-up). Inner Sphere or Periphery only (for Clan covert ops, see Clan Watch Operative).',
    desc: '<p>Spies, scouts and undercover operatives — the shadowy trade of covert ops.</p>'
  }),

  real('Dark Caste', 700, {
    time: 4, restricted: ['clan'], reqCategories: ['clan'],
    reqNote: 'Any Clan affiliation, but only after leaving the Clans or washing out of training.',
    attrs: { bod: 25, dex: 25 },
    traits: [tr('Compulsion/Distrust of Inner Sphere', 75), tr('Reputation', -100), tr('Wealth', -25)],
    skills: [sk('Acting', 30), sk('Disguise', 50), sk('Escape Artist', 50), sk('Gunnery', 75, 'Any'), sk('Martial Arts', 60),
      sk('Navigation', 50, 'Any'), sk('Negotiation', 25), sk('Perception', 40), sk('Piloting', 20, 'Any'), sk('Prestidigitation', 25, 'Any'),
      sk('Protocol', -25, 'Clan'), sk('Running', 30), sk('Stealth', 40), sk('Survival', 45, 'Any'), sk('Technician', 45, 'Any'), sk('Technician', 25, 'Any')],
    flex: [lump(115)],
    desc: '<p>The outcast Bandit Caste — drifters and fugitives in the shadows of Clan society.</p>'
  }),

  real('Explorer', 900, {
    time: 6,
    reqNote: 'Inner Sphere characters need 150 XP in Connections; Clan characters must be scientist caste. May not have the TDS Trait.',
    reqCastes: [], // Clan-only constraint handled by note; open to IS/Periphery/Clan-scientist
    attrs: { bod: 20, rfl: 30, int: 30, wil: 30 },
    traits: [tr('G-Tolerance', 50), tr('Good Hearing', 35), tr('Vehicle', 35), tr('Introvert', -40), tr('Wealth', -50)],
    skills: [sk('Appraisal', 35), sk('Climbing', 25), sk('Communications', 35, 'Any'), sk('Computers', 20), sk('Investigation', 35),
      sk('Language', 25, 'Affiliation'), sk('Language', 40, 'Any'), sk('Martial Arts', 25), sk('MedTech', 15, 'Any'), sk('Melee Weapons', 30),
      sk('Navigation', 50, 'Any'), sk('Piloting', 50, 'Any'), sk('Sensor Operations', 55), sk('Survival', 75, 'Any'), sk('Streetwise', 35, 'Any'),
      sk('Tracking', 25, 'Any'), sk('Zero-G Operations', 15)],
    flex: [lump(170)],
    desc: '<p>Charting lost and untapped worlds in search of Star League relics and new resources.</p>'
  }),

  real('Goliath Scorpion Seeker', 700, {
    time: 4, restricted: ['clan'], reqCategories: ['clan'], reqCastes: ['warrior'],
    reqNote: 'Clan Goliath Scorpion affiliation, warrior caste only.',
    traits: [tr('Connections', 75), tr('In For Life', -25)],
    skills: [sk('Appraisal', 50), sk('Computers', 65), sk('Interest', 55, 'Archaeology'), sk('Interest', 60, 'Star League History'),
      sk('Interest', 35, 'Pre-Star League History'), sk('Language', 35, 'Any'), sk('MedTech', 40, 'Any'), sk('Navigation', 35, 'Space'),
      sk('Perception', 50), sk('Survival', 40, 'Any'), sk('Zero-G Operations', 25)],
    flex: [lump(160, 'any', 'at least 100 XP must be applied to Attributes or Traits')],
    desc: '<p>Clan Goliath Scorpion\'s relic-hunting Seekers, roaming as far as the Inner Sphere.</p>'
  }),

  real('Guerilla Insurgent', 900, {
    time: 6, forbidCategories: ['clan'],
    attrs: { str: 100, wil: 100 },
    traits: [tr('Bloodmark', -50), tr('Combat Sense', 30), tr('Connections', 50), tr('Equipped', 30),
      tr('Compulsion/Hatred for Authority', -100), tr('Dependent', -25), tr('Unlucky', -35)],
    skills: [sk('Computers', 45), sk('Demolitions', 65), sk('Disguise', 40), sk('Escape Artist', 25), sk('Melee Weapons', 20),
      sk('Perception', 25), sk('Prestidigitation', 50, 'Any'), sk('Security Systems', 25, 'Any'), sk('Small Arms', 35),
      sk('Support Weapons', 35), sk('Survival', 35, 'Any')],
    flex: [lump(180)],
    notes: 'Free Rasalhague / General sub-modules add their own XP (Phase-3 follow-up). Cannot have a Clan affiliation.',
    desc: '<p>Freedom fighter or terrorist — an armed insurgent, often backed by a foreign power.</p>'
  }),

  real('Merchant', 900, {
    time: 4, reqFields: ['Merchant'],
    reqNote: 'Merchant Field, or +50 XP each in Negotiation and Administration. Diamond Shark warrior-merchants need Clan/Diamond Shark, warrior or merchant caste, no TDS.',
    attrs: { cha: 50 },
    traits: [tr('Enemy', -75), tr('Reputation', 50), tr('Wealth', 50)],
    skills: [sk('Acting', 20), sk('Appraisal', 20), sk('Computers', 15), sk('Interest', 35, 'Any'), sk('Language', 20, 'Affiliation'),
      sk('Language', 25, 'Any'), sk('Negotiation', 20), sk('Perception', 30), sk('Protocol', 35, 'Any'), sk('Protocol', 15, 'Any'), sk('Zero-G Operations', 10)],
    flex: [lump(200)],
    notes: 'Free Trader / Merchant Master / Deep Periphery Trader / Diamond Shark sub-modules add their own XP (Phase-3 follow-up).',
    desc: '<p>The trader\'s life of near-constant JumpShip travel — free traders to Diamond Shark warrior-merchants.</p>'
  }),

  real("Ne'er-do-well", 700, {
    time: 4, noFlexOnRepeat: true, forbidCategories: ['clan'],
    reqNote: 'Not available to Clan characters unless they leave the Clans for the Inner Sphere.',
    attrs: { edg: 75 },
    traits: [tr('Extra Income', 75), tr('Reputation', -25), tr('Wealth', -50)],
    skills: [sk('Acting', 25), sk('Appraisal', 25), sk('Art', 35, 'Cooking'), sk('Disguise', 15), sk('Escape Artist', 35),
      sk('Interest', 40, 'Any'), sk('Interest', 20, 'Any'), sk('Language', 25, 'Any'), sk('Martial Arts', 20), sk('Negotiation', 35),
      sk('Prestidigitation', 25, 'Pick Pocket'), sk('Running', 35), sk('Streetwise', 25, 'Affiliation'), sk('Survival', 35, 'Any'), sk('Swimming', 10)],
    flex: [flex(75, 1, 'attributes', '+75 XP to any one other Attribute'), lump(145, 'any', 'may not be applied to Traits')],
    notes: 'Flexible XP are not awarded on repeats (the cost is unchanged).',
    desc: '<p>The aimless free spirit — a catch-all for characters who fit no other module.</p>'
  }),

  real('Organized Crime', 1000, {
    time: 5,
    reqNote: 'Clan characters must take a Dark Caste module first, and receive no Attribute/Trait XP from this module.',
    attrs: { edg: 85 },
    traits: [tr('Alternate ID', 100), tr('In For Life', -150)],
    skills: [sk('Acting', 60), sk('Career', 100, 'Syndicate'), sk('Computers', 15), sk('Demolitions', 50), sk('Driving', 30, 'Any'),
      sk('Escape Artist', 35), sk('Forgery', 35), sk('Interest', 55, 'Any Sport'), sk('Interrogation', 85), sk('Language', 50, 'Syndicate'),
      sk('Leadership', 25), sk('Martial Arts', 30), sk('Melee Weapons', 45), sk('Negotiation', 35), sk('Perception', 35),
      sk('Prestidigitation', 35, 'Any'), sk('Protocol', 25, 'Affiliation'), sk('Security Systems', 45, 'Any'), sk('Small Arms', 75),
      sk('Stealth', 35), sk('Streetwise', 50, 'Affiliation')],
    flex: [flex(85, 1, 'traits', 'choose one: Dark Secret or Compulsion/Loyalty to Crime Boss', ['Dark Secret', 'Compulsion/Loyalty to Crime Boss']), lump(100)],
    desc: '<p>The mafia, yakuza, tong or triad — amassing wealth and power by any means.</p>'
  }),

  real('Postgraduate Studies', 700, {
    time: 4, repeatable: false, reqModules: ['University'],
    attrs: { int: 50, wil: -50 },
    traits: [tr('Connections', 75), tr('Extra Income', 25), tr('Wealth', -100)],
    skills: [sk('Appraisal', 50), sk('Interest', 120, 'Any Academic'), sk('Interest', 85, 'Any'), sk('Language', 85, 'Affiliation'),
      sk('Language', 50, 'Any'), sk('Survival', 35, 'Any'), sk('Training', 75), sk('Zero-G Operations', 25)],
    flex: [lump(175, 'any', 'at least 100 XP to up to four Skills in your Stage-3 University Fields')],
    notes: 'Cannot be repeated. Requires the University Stage-3 module.',
    desc: '<p>Hands-on postgraduate fieldwork rounding out a university education.</p>'
  }),

  real('ProtoMech Pilot Training', 600, {
    time: 2, repeatable: false, restricted: ['clan'], reqCategories: ['clan'], reqCastes: ['warrior'],
    reqNote: 'Blood Spirit, Fire Mandrill, Goliath Scorpion, Hell\'s Horses or Snow Raven only. Warrior caste, Aerospace Phenotype, Implant/EI Neural Implant. May not have Combat Paralysis, Glass Jaw, Lost Limb, Poor Hearing, Poor Vision or Slow Learner.',
    attrs: { rfl: 50 },
    traits: [tr('Fast Learner', 50), tr('Toughness', 80), tr('Vehicle', 75), tr('Compulsion/Chemical Addiction', -80),
      tr('Implant/EI Neural Implant', 150), tr('Reputation', -75)],
    skills: [sk('Career', 15, 'Soldier'), sk('Escape Artist', 20), sk('Interest', 15, 'Neural Implants'), sk('Martial Arts', 30),
      sk('Melee Weapons', 15), sk('Tactics', 50, 'Infantry'), sk('Tactics', 50, 'Land'),
      sk('Gunnery', 25, 'ProtoMech'), sk('Piloting', 25, 'ProtoMech'), sk('Navigation', 25, 'Ground'), sk('Sensor Operations', 25), sk('Tactics', 25, 'Land')],
    flex: [lump(30)],
    notes: 'Cannot be repeated. The +125 XP Clan ProtoMech Field is folded into the skill list above (+25 to each of its five Skills).',
    desc: '<p>Washed-out aerospace warriors retrained as ProtoMech pilots.</p>'
  }),

  real('Scientist Caste Service', 1200, {
    time: 4, restricted: ['clan'], reqCategories: ['clan'], reqCastes: ['scientist'],
    attrs: { int: 75, wil: 50, bod: -75 },
    skills: [sk('Acting', 50), sk('Administration', 75), sk('Career', 100, 'Scientist'), sk('Computers', 70), sk('Cryptography', 50),
      sk('Interest', 85, 'Clan Genetics'), sk('Interest', 75, 'Any'), sk('Investigation', 95), sk('Language', 45, 'Any'), sk('Leadership', 35),
      sk('MedTech', 65, 'Any'), sk('Perception', 85), sk('Protocol', 65, 'Affiliation'), sk('Protocol', 35, 'Any Clan'), sk('Science', 85, 'Any'), sk('Training', 85)],
    flex: [flex(75, 1, 'traits', 'choose one pair: Fast Learner/Combat Paralysis or Natural Aptitude/Dark Secret', ['Fast Learner', 'Natural Aptitude/Any Interest or Science']), lump(50)],
    notes: 'Clan scientist caste only. The chosen Trait pair also carries a -75 XP negative Trait (Combat Paralysis or Dark Secret).',
    desc: '<p>Service in the powerful, secretive Clan scientist caste.</p>'
  }),

  real('Solaris Insider', 825, {
    time: 4, reqModules: ['Solaris Internship'],
    reqNote: 'Requires the Solaris Internship (Stable Internship) module, or 200 XP in Connections.',
    attrs: { wil: 50, cha: 45, edg: 50 },
    traits: [tr('Compulsion/Gambling', -75), tr('Connections', 150), tr('Enemy', -200), tr('Fit', 50), tr('Property', 75), tr('Reputation', 100), tr('Wealth', 100)],
    skills: [sk('Administration', 30), sk('Computers', 25), sk('Escape Artist', 15), sk('Forgery', 15), sk('Interest', 20, 'Solaris Games'),
      sk('Interest', 25, 'Solaris Night Life'), sk('Interest', 15, 'Any'), sk('Prestidigitation', 15, 'Any'), sk('Security Systems', 25, 'Any'),
      sk('Stealth', 20), sk('Streetwise', 25, 'Solaris VII')],
    flex: [flex(25, 6, 'skills', '+25 XP to six of your Solaris Stable Internship Field Skills (else Communications/Manager/Politician)'), lump(100)],
    notes: 'On repeat, also apply -100 XP to the In For Life Trait.',
    desc: '<p>A fixer on Solaris VII, brokering the deals behind the arena games.</p>'
  }),

  real('Solaris VII Games', 900, {
    time: 4, reqModules: ['Solaris Internship', 'Tour of Duty'], reqFields: ['MechWarrior', 'Cavalry', 'Pilot – Battle Armor'],
    reqNote: 'Requires Solaris Internship, Tour of Duty, or any module with MechWarrior, Cavalry or Battle Armor training.',
    attrs: { edg: 100 },
    traits: [tr('Bloodmark', -25), tr('Enemy', -250), tr('Reputation', 150)],
    skills: [sk('Acting', 25), sk('Administration', 10), sk('Computers', 10), sk('Escape Artist', 15), sk('Interest', 30, 'Solaris Games'),
      sk('Interest', 35, 'Solaris Night Life'), sk('Interest', 10, 'Any'), sk('Martial Arts', 20), sk('Streetwise', 25, 'Solaris VII')],
    flex: [flex(100, 1, 'attributes', '+100 XP to any one other Attribute'),
      flex(100, 3, 'traits', '+100 XP each to three of: Custom Vehicle, Design Quirk, Equipped, Extra Income, Property, Tech Empathy or Vehicle',
        ['Custom Vehicle', 'Design Quirk', 'Equipped', 'Extra Income', 'Property', 'Tech Empathy', 'Vehicle']),
      flex(45, 6, 'skills', '+45 XP to six Skills from any Tech or Military Fields you possess (except Officer)'), lump(125)],
    notes: 'On repeat, also apply -150 XP to the In For Life Trait. Also awards a -50 XP Addiction/Gambling Compulsion.',
    desc: '<p>A gladiator in the arenas of Solaris VII — wealth and glory, betrayal and intrigue.</p>'
  }),

  real('Think Tank', 900, {
    time: 4, reqAttrs: { int: 7 }, reqTraits: { Connections: 3 }, reqFields: ['Analysis', 'Doctor', 'Engineer', 'Military Scientist'],
    reqNote: 'INT 7+, Connections +3 TP, and one or more of the Analysis, Doctor, Engineer or Military Scientist Fields.',
    attrs: { str: -75, bod: -75, int: 90, wil: 75 },
    traits: [tr('Connections', 100), tr('Exceptional Attribute/INT', 75), tr('Rank', 75), tr('Wealth', 100), tr('In For Life', -100)],
    skills: [sk('Administration', 50), sk('Computers', 50), sk('Interest', 120, 'Any Academic'), sk('Interest', 85, 'Any'),
      sk('Protocol', 30, 'Affiliation'), sk('Science', 30, 'Any'), sk('Technician', 30, 'Any'), sk('Training', 50)],
    flex: [lump(190, 'any', 'non-military, non-combat Traits and/or Skills only')],
    desc: '<p>A handpicked genius solving problems and projecting strategy for a powerful patron.</p>'
  }),

  real('Tour of Duty', 800, {
    time: 3, reqFields: [], reqNote: 'Must have at least one Military Skill Field. Cost varies by affiliation: 700 (Periphery) / 800 (Inner Sphere) / 1,000 (Clan).',
    traits: [tr('Connections', 25)],
    skills: [sk('Career', 50, 'Soldier'), sk('Martial Arts', 40), sk('Navigation', 40, 'Any'), sk('Protocol', 40, 'Affiliation')],
    flex: [flex(100, 1, 'traits', 'choose one: Equipped or Vehicle', ['Equipped', 'Vehicle']), lump(100)],
    notes: 'Inner Sphere / Periphery / Clan sub-modules add their own attributes, traits, skills and a Military-Field skill pool, and set the cost tier (Phase-3 follow-up). Base cost shown is the Inner Sphere tier.',
    desc: '<p>A soldier\'s tour — long dull guard duty punctuated by the panic of incoming fire.</p>'
  }),

  real('To Serve and Protect', 900, {
    time: 4, reqFields: ['Police Officer', 'Police Tactical Officer', 'Detective'],
    reqNote: 'Requires a Police Officer, Police Tactical Officer or Detective Field.',
    attrs: { bod: 100, rfl: 100, wil: 100 },
    traits: [tr('Connections', 50), tr('Enemy', -75)],
    skills: [sk('Administration', 25), sk('Computers', 35), sk('Cryptography', 15), sk('Interrogation', 25), sk('Investigation', 25),
      sk('Leadership', 25), sk('MedTech', 30, 'Any'), sk('Melee Weapons', 45), sk('Navigation', 35, 'Any'), sk('Perception', 45),
      sk('Protocol', 25, 'Affiliation'), sk('Small Arms', 50), sk('Streetwise', 45, 'Affiliation'), sk('Support Weapons', 15),
      sk('Tactics', 25, 'Infantry'), sk('Training', 10)],
    flex: [flex(50, 1, 'traits', 'choose one pair: Attractive/Handicap or Fit/Dependent', ['Attractive', 'Fit']),
      flex(25, 4, 'skills', '+25 XP to four of your Police / Police Tactical / Detective Field Skills'), lump(50)],
    notes: 'The chosen Trait pair also carries a -50 XP negative Trait (Handicap or Dependent).',
    desc: '<p>A police or security officer sworn to serve and protect the civilian population.</p>'
  }),

  real('Travel', 700, {
    time: 6, reqTraits: { Wealth: 2 },
    reqNote: 'Cannot have TDS. Requires +2 TP in Extra Income or Wealth.',
    attrs: { int: 45, edg: 45 },
    skills: [sk('Art', 35, 'Any'), sk('Art', 30, 'Cooking'), sk('Climbing', 35), sk('Driving', 50, 'Any'), sk('Interest', 75, 'Any'),
      sk('Interest', 45, 'Any'), sk('Interest', 20, 'Any'), sk('Language', 50, 'Affiliation'), sk('Language', 35, 'Any'),
      sk('Survival', 25, 'Any'), sk('Swimming', 50), sk('Zero-G Operations', 50)],
    flex: [lump(110)],
    desc: '<p>Wanderlust — years and fortunes spent venturing among the stars just to see them.</p>'
  })
];
