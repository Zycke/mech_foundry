/**
 * atow-lists.mjs
 * --------------
 * Canonical A Time of War Master Skills List (p.142) and Master Traits List
 * (p.109), used to populate the character-wizard dropdowns and to supply trait
 * tooltips. Exposed on `game.mechfoundry.config` (skillsList / traitsList /
 * traitDescriptions) so they are centralised and overridable.
 *
 * Trait descriptions are concise summaries for at-a-glance tooltips, not the
 * full rulebook text.
 */

/** Master Skills List — root skill names, with linked attributes & TN/Complexity. */
export const ATOW_SKILLS = [
  { name: 'Acrobatics', links: 'RFL', tnc: '7/SB' },
  { name: 'Acting', links: 'CHA', tnc: '8/CB' },
  { name: 'Administration', links: 'INT+WIL', tnc: '8/SA' },
  { name: 'Animal Handling', links: 'WIL', tnc: '7/SB' },
  { name: 'Appraisal', links: 'INT', tnc: '8/CB' },
  { name: 'Archery', links: 'DEX', tnc: '7/SB' },
  { name: 'Art', links: 'DEX+INT', tnc: '9/CA' },
  { name: 'Artillery', links: 'INT+WIL', tnc: '8/SA' },
  { name: 'Career', links: 'INT', tnc: '7/SB' },
  { name: 'Climbing', links: 'DEX', tnc: '7/SB' },
  { name: 'Communications', links: 'INT', tnc: '7/SB' },
  { name: 'Computers', links: 'DEX+INT', tnc: '9/CA' },
  { name: 'Cryptography', links: 'INT+WIL', tnc: '9/CA' },
  { name: 'Demolitions', links: 'DEX+INT', tnc: '9/CA' },
  { name: 'Disguise', links: 'CHA', tnc: '7/SB' },
  { name: 'Driving', links: 'RFL+DEX', tnc: '8/SA' },
  { name: 'Escape Artist', links: 'STR+DEX', tnc: '9/CA' },
  { name: 'Forgery', links: 'DEX+INT', tnc: '8/SA' },
  { name: 'Gunnery', links: 'RFL+DEX', tnc: '8/SA' },
  { name: 'Interest', links: 'INT+WIL', tnc: '9/CA' },
  { name: 'Interrogation', links: 'WIL+CHA', tnc: '9/CA' },
  { name: 'Investigation', links: 'INT+WIL', tnc: '9/CA' },
  { name: 'Language', links: 'INT+CHA', tnc: '8/SA' },
  { name: 'Leadership', links: 'WIL+CHA', tnc: '8/SA' },
  { name: 'Martial Arts', links: 'RFL+DEX', tnc: '8/SA' },
  { name: 'MedTech', links: 'INT', tnc: '7/SB' },
  { name: 'Melee Weapons', links: 'RFL+DEX', tnc: '8/SA' },
  { name: 'Navigation', links: 'INT', tnc: '7/SB' },
  { name: 'Negotiation', links: 'CHA', tnc: '8/CB' },
  { name: 'Perception', links: 'INT', tnc: '7/SB' },
  { name: 'Piloting', links: 'RFL+DEX', tnc: '8/SA' },
  { name: 'Prestidigitation', links: 'RFL+DEX', tnc: '8/SA' },
  { name: 'Protocol', links: 'WIL+CHA', tnc: '9/CA' },
  { name: 'Running', links: 'RFL', tnc: '7/SB' },
  { name: 'Science', links: 'INT+WIL', tnc: '9/CA' },
  { name: 'Security Systems', links: 'DEX+INT', tnc: '9/CA' },
  { name: 'Sensor Operations', links: 'INT+WIL', tnc: '8/SA' },
  { name: 'Small Arms', links: 'DEX', tnc: '7/SB' },
  { name: 'Stealth', links: 'RFL+INT', tnc: '8/SA' },
  { name: 'Strategy', links: 'INT+WIL', tnc: '9/CA' },
  { name: 'Streetwise', links: 'CHA', tnc: '8/CB' },
  { name: 'Support Weapons', links: 'DEX', tnc: '7/SB' },
  { name: 'Surgery', links: 'DEX+INT', tnc: '9/CA' },
  { name: 'Survival', links: 'BOD+INT', tnc: '9/CA' },
  { name: 'Swimming', links: 'STR', tnc: '7/SB' },
  { name: 'Tactics', links: 'INT+WIL', tnc: '9/CA' },
  { name: 'Technician', links: 'DEX+INT', tnc: '9/CA' },
  { name: 'Thrown Weapons', links: 'DEX', tnc: '7/SB' },
  { name: 'Tracking', links: 'INT+WIL', tnc: '8/SA' },
  { name: 'Training', links: 'INT+CHA', tnc: '9/CA' },
  { name: 'Zero-G Operations', links: 'RFL', tnc: '7/SB' }
];

/** Master Traits List — name, type, TP range, and a short tooltip summary. */
export const ATOW_TRAITS = [
  // Positive
  { name: 'Alternate ID', type: 'positive', tp: '2', desc: 'A fully-documented second legal identity the character can assume.' },
  { name: 'Ambidextrous', type: 'positive', tp: '2', desc: 'Uses either hand equally well; no off-hand penalty.' },
  { name: 'Animal Empathy', type: 'positive', tp: '1', desc: 'Bonus when handling and calming animals.' },
  { name: 'Attractive', type: 'positive', tp: '2', desc: 'Bonus to CHA-based interactions with those receptive to the character.' },
  { name: 'Citizenship', type: 'positive', tp: '2', desc: 'Full legal citizenship in the home realm, with its rights and access.' },
  { name: 'Citizenship/Trueborn', type: 'positive', tp: '2', desc: 'Clan trueborn citizenship/caste standing.' },
  { name: 'Combat Sense', type: 'positive', tp: '4', desc: 'Improved initiative and situational awareness in combat.' },
  { name: 'Connections', type: 'positive', tp: '1 to 10', desc: 'A network of contacts who can supply aid, info, or favours.' },
  { name: 'Exceptional Attribute', type: 'positive', tp: '2', desc: 'Raises one attribute maximum by one above the normal cap.' },
  { name: 'Fast Learner', type: 'positive', tp: '3', desc: 'Earns experience more quickly than normal.' },
  { name: 'Fit', type: 'positive', tp: '2', desc: 'Naturally healthy and hardy; resists fatigue and illness.' },
  { name: 'G-Tolerance', type: 'positive', tp: '1', desc: 'Withstands high-g manoeuvres better than most.' },
  { name: 'Good Hearing', type: 'positive', tp: '1', desc: 'Bonus to hearing-based Perception checks.' },
  { name: 'Good Vision', type: 'positive', tp: '1', desc: 'Bonus to sight-based Perception checks.' },
  { name: 'Gregarious', type: 'positive', tp: '1', desc: 'Naturally likeable; bonus to social first impressions.' },
  { name: 'Implant', type: 'positive', tp: '1 to 6', desc: 'A beneficial cybernetic or bio-implant.' },
  { name: 'Natural Aptitude', type: 'positive', tp: '3 or 5', desc: 'Exceptional innate talent in one chosen skill.' },
  { name: 'Pain Resistance', type: 'positive', tp: '3', desc: 'Shrugs off wound penalties better than normal.' },
  { name: 'Patient', type: 'positive', tp: '1', desc: 'Calm and deliberate; bonus to tasks that reward care over haste.' },
  { name: 'Phenotype', type: 'positive', tp: '0', desc: 'Marks the character as a Clan-engineered phenotype.' },
  { name: 'Poison Resistance', type: 'positive', tp: '2', desc: 'Resists toxins and drugs more effectively.' },
  { name: 'Property', type: 'positive', tp: '1 to 10', desc: 'Owns significant real property or a landhold.' },
  { name: 'Rank', type: 'positive', tp: '1 to 15', desc: 'Formal military/organisational rank and the authority it carries.' },
  { name: 'Sixth Sense', type: 'positive', tp: '4', desc: 'Uncanny instinct that warns of danger.' },
  { name: 'Tech Empathy', type: 'positive', tp: '3', desc: 'Intuitive feel for machines; bonus to Technician-style work.' },
  { name: 'Title', type: 'positive', tp: '3 to 10', desc: 'A noble title or Clan Bloodname and its standing.' },
  { name: 'Toughness', type: 'positive', tp: '3', desc: 'Higher damage capacity; harder to put down.' },
  // Negative
  { name: 'Animal Antipathy', type: 'negative', tp: '-1', desc: 'Animals distrust the character; penalty to handling them.' },
  { name: 'Bloodmark', type: 'negative', tp: '-5 to -1', desc: 'A price on the character’s head; hunted by bounty hunters.' },
  { name: 'Combat Paralysis', type: 'negative', tp: '-4', desc: 'May freeze under fire; risk of losing the first combat action.' },
  { name: 'Compulsion', type: 'negative', tp: '-5 to -1', desc: 'A compulsive behaviour or phobia that can force checks.' },
  { name: 'Dark Secret', type: 'negative', tp: '-5 to -1', desc: 'A hidden secret that brings trouble if exposed.' },
  { name: 'Dependent', type: 'negative', tp: '-2 to -1', desc: 'Someone who relies on the character and can become a liability.' },
  { name: 'Enemy', type: 'negative', tp: '-1 to -10', desc: 'A recurring adversary who actively works against the character.' },
  { name: 'Glass Jaw', type: 'negative', tp: '-3', desc: 'Easily knocked out; worse effects from stun/knockdown.' },
  { name: 'Gremlins', type: 'negative', tp: '-3', desc: 'Technology tends to fail in the character’s hands.' },
  { name: 'Handicap', type: 'negative', tp: '-5 to -1', desc: 'A lasting physical impairment.' },
  { name: 'Illiterate', type: 'negative', tp: '-1', desc: 'Cannot read or write.' },
  { name: 'Impatient', type: 'negative', tp: '-1', desc: 'Restless; penalty to tasks that require patience.' },
  { name: 'In For Life', type: 'negative', tp: '-3', desc: 'Bound to an organisation the character cannot freely leave.' },
  { name: 'Introvert', type: 'negative', tp: '-1', desc: 'Uncomfortable in social situations; penalty to some CHA checks.' },
  { name: 'Lost Limb', type: 'negative', tp: '-5 to -1', desc: 'A missing limb (unless replaced by a prosthetic).' },
  { name: 'Poor Hearing', type: 'negative', tp: '-5 to -1', desc: 'Penalty to hearing-based Perception checks.' },
  { name: 'Poor Vision', type: 'negative', tp: '-9 to -2', desc: 'Penalty to sight-based Perception checks.' },
  { name: 'Slow Learner', type: 'negative', tp: '-3', desc: 'Earns experience more slowly than normal.' },
  { name: 'TDS', type: 'negative', tp: '-1', desc: 'Transit Disorientation Syndrome; ill effects from jump travel.' },
  { name: 'Unattractive', type: 'negative', tp: '-1', desc: 'Penalty to CHA-based interactions.' },
  { name: 'Unlucky', type: 'negative', tp: '-10 to -2', desc: 'Fate works against the character; reduced Edge benefit.' },
  // Flexible
  { name: 'Equipped', type: 'flexible', tp: '-1 to 8', desc: 'Starts with (or lacking) personal gear appropriate to the score.' },
  { name: 'Extra Income', type: 'flexible', tp: '-10 to 10', desc: 'A recurring income (or debt) each month.' },
  { name: 'Reputation', type: 'flexible', tp: '-5 to 5', desc: 'A widespread good or ill reputation.' },
  { name: 'Wealth', type: 'flexible', tp: '-1 to 10', desc: 'Personal liquid wealth (or, if negative, poverty).' }
];

/** name -> description map (base trait name, before any "/subskill"). */
export const ATOW_TRAIT_DESCRIPTIONS = Object.fromEntries(
  ATOW_TRAITS.map(t => [t.name, `${t.desc} (${t.type}, ${t.tp} TP)`])
);
