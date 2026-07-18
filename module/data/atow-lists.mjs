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
  { name: 'Alternate ID', type: 'positive', tp: '2', desc: 'A fully-documented second legal identity the character can assume.',
    longDesc: `<p>Represents a fully built-out false persona the character can slip into, complete with paperwork, resources, and a changed appearance. It is a +2 TP identity-based Multiple trait, so a character may hold several, and any identity-dependent traits (Attractive, Bloodmark, Connections, Dark Secret, Dependents, Equipped, In For Life, Property, Rank, Reputation, Vehicle, Wealth) must each be pinned to a specific alias. Assuming an established alias normally takes a day of Acting and Disguise checks (often waived if the cover is well-seasoned), while an outsider trying to unmask it must invest weeks or months of research and win an Opposed Double Attribute Check against the target's INT and WIL, needing a net margin of 3+ to expose the identity.</p>` },
  { name: 'Ambidextrous', type: 'positive', tp: '2', desc: 'Uses either hand equally well; no off-hand penalty.',
    longDesc: `<p>The character uses either hand with equal skill rather than having to designate a primary and an off hand at creation. As a +2 TP trait, its effect is to ignore the off-hand penalty entirely, so a weapon or tool is wielded just as effectively in the left hand as the right. It does not, however, grant any extra actions in a combat turn beyond the normal allowance.</p>` },
  { name: 'Animal Empathy', type: 'positive', tp: '1', desc: 'Bonus when handling and calming animals.',
    longDesc: `<p>A +1 TP trait reflecting an instinctive rapport with animals. It grants a +2 modifier to any skill check involving creatures (Animal Handling, Riding, and the like) and halves (rounding down) the check modifiers from a creature's Shy or Aggressive traits when it must make a Fight or Flight check near the character. Non-aggressive animals act as if Shy in the character's presence and Shy animals act as if Tamed, and in a fight creatures attack such a character last unless the character strikes first. It is opposed by Animal Antipathy, and the two cancel out if both are acquired.</p>` },
  { name: 'Attractive', type: 'positive', tp: '2', desc: 'Bonus to CHA-based interactions with those receptive to the character.',
    longDesc: `<p>An identity-based +2 TP trait marking the character as naturally good-looking. It adds a +2 modifier to skill and attribute checks that rely on the CHA attribute when the target is attracted to the character's gender, and a +1 modifier otherwise, representing general disarming charm. As an identity-dependent trait it can be assigned to a particular alias; it is opposed by Unattractive, and the two cancel unless Attractive is specifically tied to one identity.</p>` },
  { name: 'Citizenship', type: 'positive', tp: '2', desc: 'Full legal citizenship in the home realm, with its rights and access.',
    longDesc: `<p>The Inner Sphere half of the Citizenship/Trueborn trait, worth +2 TP, marking the character as a recognized citizen in one of the more restrictive realms, with the rights (land ownership, voting, higher education, certain careers) that lesser residents lack. Only affiliations with restrictive citizenship requirements, flagged in the character creation rules, need it. It is identity-based, so with an Alternate ID it must be assigned to a specific alias, at most one Citizenship per alias.</p>` },
  { name: 'Citizenship/Trueborn', type: 'positive', tp: '2', desc: 'Clan trueborn citizenship/caste standing.',
    longDesc: `<p>A +2 TP identity-based trait covering elevated birth or legal status in restrictive societies. In its Inner Sphere Citizenship form it confers full citizen rights in realms that gate them. In its Clan Trueborn form it marks a warrior born of the iron wombs: only a trueborn may hold a Bloodname and a political voice, must also take a Phenotype trait, and begins in the Warrior Caste. Trueborn status cannot be faked, only concealed; if the character has aliases, Trueborn must sit on the primary (birth) identity, and Bloodnames do not carry across aliases.</p>` },
  { name: 'Combat Sense', type: 'positive', tp: '4', desc: 'Improved initiative and situational awareness in combat.',
    longDesc: `<p>A +4 TP trait for characters who thrive under the stress of a fight. They roll Initiative with the best two of 3D6 (as though Initiative were a Natural Aptitude) and reduce the Stun or Surprise combat penalty to +1 instead of +2. In Tactical Combat it matters only when the character commands a force or is cut off under the Out-of-Contact rule, and outside combat the GM may grant a +1 modifier to any action check made under stress or fear. It is opposed by Combat Paralysis, and the two cancel each other out.</p>` },
  { name: 'Connections', type: 'positive', tp: '1 to 10', desc: 'A network of contacts who can supply aid, info, or favours.',
    longDesc: `<p>An identity- and region-based Multiple trait ranging from +1 to +10 TP that lets the character call on contacts for information, money, equipment, or personnel. The TP score sets how powerful the contacts are, how often they can be tapped (from once per 14 days up through longer intervals at the extremes), and the roll modifier applied when reaching out; tapping one takes 2D6 hours of searching plus an appropriate skill check (Streetwise, Protocol, or Negotiation depending on the contact). Higher scores unlock richer 'Info/Wealth/Equip/People' aid, though borrowed funds or gear generally must be repaid or returned or the character risks a debt or even a Bloodmark. The region covered scales with TP (a city at 3 or less, a world at 5 or less, a realm at 8 or less, the whole Inner Sphere at 9-10), and multiple Connections must be split among aliases.</p>` },
  { name: 'Exceptional Attribute', type: 'positive', tp: '2', desc: 'Raises one attribute maximum by one above the normal cap.',
    longDesc: `<p>A +2 TP Multiple trait that raises the character's permitted ceiling for one attribute by 1 point above the normal phenotype maximum. It only lifts the cap; it does not actually raise the attribute or grant the higher value, which still costs Experience Points to buy up. It may be taken several times, but only once per attribute.</p>` },
  { name: 'Fast Learner', type: 'positive', tp: '3', desc: 'Earns experience more quickly than normal.',
    longDesc: `<p>A +3 TP trait for characters who absorb training quickly. It cuts the Experience Point cost of skills by 20 percent, both when buying skills at creation and when advancing them later. It is opposed by Slow Learner, and the two cancel each other out.</p>` },
  { name: 'Fit', type: 'positive', tp: '2', desc: 'Naturally healthy and hardy; resists fatigue and illness.',
    longDesc: `<p>A +2 TP trait representing superior conditioning and endurance. It grants a +1 modifier to BOD or STR attribute checks (though not to skill checks that merely use those as linked attributes), halves Fatigue (rounding down) from strenuous exertion, and lets the character recover an extra 2 Fatigue per turn. It is opposed by Handicap, but unusually the two do not simply cancel: the character must buy enough extra Fit points to offset the total negative TP of all Handicaps before a genuine +2 Fit trait can exist, and any Handicap described as genetic bars the Fit trait entirely.</p>` },
  { name: 'G-Tolerance', type: 'positive', tp: '1', desc: 'Withstands high-g manoeuvres better than most.',
    longDesc: `<p>A +1 TP trait for characters who handle unusual gravity and acceleration better than most. It halves both the roll modifiers and the Fatigue imposed by non-standard gravity and acceleration conditions. Aerospace pilots additionally get a +1 modifier to Piloting rolls for high-G maneuvers, and the character gets a +1 to RFL checks made to resist sudden inertia, such as during an abrupt DropShip maneuver.</p>` },
  { name: 'Good Hearing', type: 'positive', tp: '1', desc: 'Bonus to hearing-based Perception checks.',
    longDesc: `<p>A +1 TP trait for sharper-than-average hearing. It adds a +1 modifier to Perception skill checks in which hearing is the relevant sense, but has no effect on combat action rolls. It is opposed by Poor Hearing at any level, and the two cancel each other out.</p>` },
  { name: 'Good Vision', type: 'positive', tp: '1', desc: 'Bonus to sight-based Perception checks.',
    longDesc: `<p>A +1 TP trait for keener-than-average eyesight. It grants a +1 modifier to Perception skill checks that depend on vision, with no bearing on combat action rolls. It is opposed by Poor Vision at any level, and the two cancel each other out.</p>` },
  { name: 'Gregarious', type: 'positive', tp: '1', desc: 'Naturally likeable; bonus to social first impressions.',
    longDesc: `<p>A +1 TP trait for a natural people-person whose social ease exceeds what the CHA attribute alone would suggest. It adds a +1 modifier to skill checks where social interaction is a factor, at the GM's discretion. It is opposed by Introvert, and the two cancel each other out.</p>` },
  { name: 'Implant', type: 'positive', tp: '1 to 6', desc: 'A beneficial cybernetic or bio-implant.',
    longDesc: `<p>Represents a character who lost a limb or organ before play began and received an artificial replacement, letting them start the game already fitted with the device (implants cannot be bought with XP alone). The trait's rating from +1 to +7 sets the sophistication of the replacement, and it offsets the penalties of a matching Lost Limb, Poor Hearing, or Poor Vision trait only as far as that quality allows. Because the parts are mechanical, damage to them requires both medical and technical repair to heal.</p><p>A character may hold one Implant per limb plus one per replaced eye or ear; a full-body myomer implant covers all limbs but not the eyes or ears. Higher tiers unlock better hardware (bionic eyes/ears, cloned or myomer limbs), and Clan characters can buy some options one TP cheaper while they remain with the Clans.</p>` },
  { name: 'Natural Aptitude', type: 'positive', tp: '3 or 5', desc: 'Exceptional innate talent in one chosen skill.',
    longDesc: `<p>Marks an inborn knack for one specific Skill (or subskill) beyond what training provides. Costs +3 TP for a Basic skill or +5 TP for an Advanced skill. In play, any check with that skill — including at Level 0 or completely untrained — is rolled with the best two of 3D6 instead of a normal 2D6.</p><p>A character can take it multiple times for different skills, but the total number of Natural Aptitude traits cannot exceed their INT attribute.</p>` },
  { name: 'Pain Resistance', type: 'positive', tp: '3', desc: 'Shrugs off wound penalties better than normal.',
    longDesc: `<p>Reflects an unusual capacity to shrug off pain. Worth +3 TP, it does not lessen damage taken but reduces every injury-based penalty to action checks and movement by 1 (never below 0). It also lets the character ignore the Stun effect from wounds as long as their accumulated standard damage (including Fatigue points) stays below their BOD score.</p>` },
  { name: 'Patient', type: 'positive', tp: '1', desc: 'Calm and deliberate; bonus to tasks that reward care over haste.',
    longDesc: `<p>Represents strong focus and composure under time pressure. This +1 TP trait grants a +1 modifier to lengthy, concentration-heavy checks (anything classed as Complex), raises the maximum Careful Aim bonus to +4, and doubles any positive modifiers earned by taking extra time on complex tasks. It is opposed by the Impatient trait, and the two cancel each other out if a character ever holds both.</p>` },
  { name: 'Phenotype', type: 'positive', tp: '0', desc: 'Marks the character as a Clan-engineered phenotype.',
    longDesc: `<p>A mandatory 0 TP trait every character carries; non-Clan and freeborn characters are simply "normal human," while Clan trueborns must instead take the Aerospace, Elemental, or MechWarrior phenotype from their eugenic breeding. Each phenotype applies fixed attribute modifiers (added after XP is spent, and capped by that phenotype's attribute maximums) and grants bonus traits at no XP cost — for example, Elementals gain +2 STR plus Toughness, while Aerospace pilots gain +2 DEX/+2 RFL along with G-Tolerance and Glass Jaw.</p><p>Trueborns also receive a Field Aptitude sub-trait tied to their training field, giving a permanent -1 TN modifier to all skills in that field. The trait is restricted: it is Clan-only for anything other than normal human, and a character may have exactly one.</p>` },
  { name: 'Poison Resistance', type: 'positive', tp: '2', desc: 'Resists toxins and drugs more effectively.',
    longDesc: `<p>A +2 TP trait for a metabolism that naturally shrugs off toxins. It grants a +2 modifier to all attribute checks made to resist the effects of poisons, drugs, and alcohol.</p>` },
  { name: 'Property', type: 'positive', tp: '1 to 10', desc: 'Owns significant real property or a landhold.',
    longDesc: `<p>Represents ownership of land or real estate that yields steady income. Rated +1 to +10 TP (higher is possible only through advanced play), the score sets the size of the holding and its average annual income, from a small farm at +1 up to a small moon or planet at the top. A character needs at least one level of Wealth to hold Property above +5 TP, and beyond that the Property score cannot exceed their Title level; Clan members cannot own Property at all.</p><p>On their land the character effectively commands its people and resources, but yearly income is set by an Administration check modified by local conditions (borders, industry, title, disasters, warfare), with severe failure risking loss of the holding entirely. Property is identity-based, limited to one per alias.</p>` },
  { name: 'Rank', type: 'positive', tp: '1 to 15', desc: 'Formal military/organisational rank and the authority it carries.',
    longDesc: `<p>Denotes an official position in a military, paramilitary, police, or intelligence body, rated +1 to +15 TP for increasing authority. Enlisted ranks (E-codes) and officer ranks (O-codes) map to the General Rank Table; officer ranks require also taking the Officer skill field, and the very top ranks are only reachable through advanced play. Rank confers chain-of-command authority but gamemasters are expected to balance it with matching duties.</p><p>Rank cannot be raised by spending XP after play begins — advancement or demotion comes from in-game performance (Clan warriors must requalify yearly via a Trial of Position). Leaving the organization can forfeit the rank down to 0 TP. It is identity-based and distributed among a character's aliases.</p>` },
  { name: 'Sixth Sense', type: 'positive', tp: '4', desc: 'Uncanny instinct that warns of danger.',
    longDesc: `<p>A +4 TP trait for an uncanny intuition about danger. It grants a +3 modifier to Perception checks made to avoid being surprised, and the gamemaster may grant additional vague "feelings" that something is wrong when peril looms. The sense conveys only a general warning rather than precise details; a strong success may hint that an attack is imminent but not its size or direction.</p>` },
  { name: 'Tech Empathy', type: 'positive', tp: '3', desc: 'Intuitive feel for machines; bonus to Technician-style work.',
    longDesc: `<p>Represents an instinctive feel for machines and gadgetry. This +3 TP trait cuts the base XP cost of raising or buying any Technician skill after character creation by 10 percent, and gives a +1 modifier when using equipment of Tech Rating B or higher in non-combat situations. It is opposed by the Gremlins trait, and the two cancel out if a character holds both.</p>` },
  { name: 'Title', type: 'positive', tp: '3 to 10', desc: 'A noble title or Clan Bloodname and its standing.',
    longDesc: `<p>The Inner Sphere side of the Title/Bloodname trait, representing hereditary or bestowed noble status, rated +3 to +10 TP (Knight up to Duke; higher ranks only via advanced play). A title carries political standing and, importantly, sets the ceiling on how much Property the character may rule, though many titles are honorary with no land attached. Titles come with a liege to answer to and can be revoked for poor conduct or treason.</p><p>A character may take an "Heir" version for 1 TP less, placing them in line for the title without its full authority yet. Title is identity-based; Inner Sphere characters may hold several across different aliases, and the score cannot be raised with XP after play begins — advancement depends on loyalty and the gamemaster's situations.</p>` },
  { name: 'Toughness', type: 'positive', tp: '3', desc: 'Higher damage capacity; harder to put down.',
    longDesc: `<p>A +3 TP trait for a character far more durable than their BOD suggests. Any personal damage they take is multiplied by 0.75 (rounded up), and any Fatigue from combat is halved (rounding normally). It is opposed by Glass Jaw, and the two cancel each other out if a character ever has both.</p>` },
  { name: 'Vehicle', type: 'positive', tp: '1 to 10', desc: 'Owns a personal vehicle; the level reflects its size and quality.',
    longDesc: `<p>The Vehicle Level trait (+1 to +12 TP) gives a character a personal war machine at the start of play — a BattleMech, IndustrialMech, Combat Vehicle, aerospace or conventional fighter, battlesuit, or ProtoMech. The score sets the weight class of the assigned unit; spending 2 extra TP lets the character actually own the vehicle (as a purchase or heirloom) rather than merely be assigned it, an option unavailable to Clan characters who stay with the Clans since all units belong to the Clan.</p><p>This trait does not fix the exact model — that is left to the Custom Vehicle trait or a Random Unit Assignment roll. Vehicle is identity-based and may be taken multiple times per identity.</p>` },
  { name: 'Custom Vehicle', type: 'positive', tp: '1 to 10', desc: 'Owns a customised or bespoke vehicle beyond a standard model.',
    longDesc: `<p>A vehicle trait (+1 to +6 TP) that lets a character influence which specific machine they receive rather than rolling it randomly. It applies to a single owned vehicle among battle armor, ProtoMechs, BattleMechs, IndustrialMechs, Combat Vehicles, and fighters, and the TP score sets how much choice and quality is available — from a random stock unit of any affiliation, to free choice of stock, to designing a custom Inner Sphere or Clan-tech vehicle at the top tiers.</p><p>Without this trait a character's starting vehicle is rolled on the Random Assignment tables (a Clan pilot defaults to a Front-Line unit if trueborn, Second-Line if freeborn). It may be taken multiple times to cover more than one vehicle.</p>` },
  { name: 'Bloodname', type: 'positive', tp: '1 to 10', desc: 'Holds a Clan Bloodname and the standing it confers among the warrior caste.',
    longDesc: `<p>The Clan counterpart within the Title/Bloodname trait, rated +3 to +10 TP, available only to Clan trueborns; it grants the surname of a Clan founder, earned by winning through the Trials of Bloodright, and a voice in Clan politics. Unlike a Title it cannot be taken as an Heir, does not raise a character's Property allowance (Clans forbid land ownership), and is permanent and irrevocable once gained.</p><p>A Clan character may hold only one Bloodname regardless of aliases, and its TP score can never be raised or lowered after it is received. Higher scores reflect more prestigious and exclusive bloodlines.</p>` },
  { name: 'Prosthetic', type: 'positive', tp: '1 to 6', desc: 'A prosthetic limb or implant that restores function lost to a Lost Limb.',
    longDesc: `<p>Shares the Implant/Prosthetic trait entry: a pre-game replacement for a body part lost to injury or defect, taken at +1 to +7 TP to reflect increasing quality (Type 1 through Type 6 cloned or myomer limbs). It reduces the effects of an associated Lost Limb, Poor Hearing, or Poor Vision trait up to the limit its type permits. Unlike a permanent cloned or myomer limb, an ordinary removable prosthetic does not truly cancel a Lost Limb trait, and any damage to it needs technical as well as medical repair.</p><p>Only replacements installed before play count here, not enhanced or later-added gear, and it cannot be acquired through XP. A character may take one per limb, plus one per eye and ear.</p>` },
  // Negative
  { name: 'Animal Antipathy', type: 'negative', tp: '-1', desc: 'Animals distrust the character; penalty to handling them.',
    longDesc: `<p>Something about this character makes animals distrust and dislike them; creatures react far worse to the character than they otherwise would. Mechanically, the character takes a -2 penalty on any animal-related Skill Check (Animal Handling, Riding, etc.), and doubles the effect of a creature's Shy or Aggressive traits on its Fight-or-Flight decisions in the character's presence. An Aggressive creature effectively gains Blood Rage near the character and will single them out to attack first. Animal Antipathy (-1 TP) is directly opposed by Animal Empathy, and the two cancel out if both are ever held.</p>` },
  { name: 'Bloodmark', type: 'negative', tp: '-5 to -1', desc: 'A price on the character’s head; hunted by bounty hunters.',
    longDesc: `<p>The character has a price on their head and is actively pursued by bounty hunters, whether for a genuine crime, a frame-up, or mistaken identity. This is a variable, stackable trait from -1 to -5 TP; higher levels mean a larger bounty, tougher hunters (Enemy Level 1 up to 3), and more frequent encounters (roughly a fraction of 1D6 per six months at -1 up to 1D6 per month at -5). Defeating the hunters does not end the trait; the only way to clear it is to deal with whoever posted the bounty.</p><p>Bloodmark is identity-based and stackable, so it must be tied to a specific alias, with one Bloodmark per identity; additional bounty sources simply raise the effective level. It is often linked to an Enemy trait.</p>` },
  { name: 'Combat Paralysis', type: 'negative', tp: '-4', desc: 'May freeze under fire; risk of losing the first combat action.',
    longDesc: `<p>Under stress, especially in combat, this character tends to freeze. They roll Initiative using the worst two of 3D6, cannot seize the initiative, and may only act on their own Action Phase. In tense non-combat moments demanding fast reactions, the GM may require a WIL check; failure costs one turn (5 seconds) of delay before the character can act. In Tactical Combat it matters only if the character commands a force or is out of contact with their commander. This -4 TP trait is opposed by Combat Sense, and the two cancel each other out.</p>` },
  { name: 'Compulsion', type: 'negative', tp: '-5 to -1', desc: 'A compulsive behaviour or phobia that can force checks.',
    longDesc: `<p>An irrational, negative compulsion ranging from a minor quirk or phobia up to a serious addiction or full psychosis. It is a stackable trait from -1 to -5 TP; the level sets both the WIL check modifier for resisting it and the penalty when triggered. A -1 (trivial) applies a -1 penalty to all rolls; -2 (serious addiction) gives a -2 WIL modifier and a -3 penalty to all rolls; -3 to -5 (psychoses) instead invoke the Madness table (berserker, catatonia, paranoia, etc.).</p><p>A compulsion is always present but only 'triggers' under its specific conditions: addictions fire when the character goes over 24 hours without a fix, fear/hate compulsions when their focus is present, and severe psychoses under any sufficiently stressful circumstance. A successful WIL check (with the level's modifier) lets the character hold out for a number of 5-second turns equal to the margin of success. Multiple Compulsions are allowed as long as none directly contradict one another.</p>` },
  { name: 'Dark Secret', type: 'negative', tp: '-5 to -1', desc: 'A hidden secret that brings trouble if exposed.',
    longDesc: `<p>The character hides a damaging secret, scaled -1 to -5 TP by how ruinous it would be if exposed (a minor lie at -1 up to serious treachery or an atrocity at -5). While hidden it mainly threatens exposure: whenever the character faces scrutiny, use the Alternate ID exposure rules (with a +3 bonus to a casual, non-hostile investigator). If revealed, the secret converts into a negative Reputation trait of equal TP and also cuts the character's Connections by half the trait's TP (rounded up); severe cases can trigger further consequences like imprisonment or a Bloodmark.</p><p>Dark Secret is identity-based and stackable across aliases. It cannot duplicate an already-public flaw, so it may not be the alternate identity itself, nor tied to an existing negative Reputation or Bloodmark. Once revealed and resolved, the trait is removed.</p>` },
  { name: 'Dependent', type: 'negative', tp: '-2 to -1', desc: 'Someone who relies on the character and can become a liability.',
    longDesc: `<p>The character has a vulnerable loved one (usually a spouse or child) who can be threatened or taken hostage. It is a stackable, identity-based trait at -1 or -2 TP, with the level reflecting the dependent's helplessness (-1 for a mildly vulnerable adult, -2 for a child or severely disabled person). When the character knows a dependent is in danger, they cannot function normally: treat it exactly like a triggered Compulsion of the same TP. Multiple threatened dependents stack their roll penalties up to a maximum of -3, and an extra +1 penalty applies if the danger involves a dependent tied to an alias other than the one currently in use.</p>` },
  { name: 'Enemy', type: 'negative', tp: '-1 to -10', desc: 'A recurring adversary who actively works against the character.',
    longDesc: `<p>The character has drawn the lasting hostility of a person or organization powerful enough to seriously disrupt their life. Ranging from -1 to -10 TP, the level sets the enemy's relative strength (built as an NPC with a multiple of the character's XP, e.g. x1.2 at -1 up to x5.0 at -10) and how often they interfere (from once per 90 days at -1 to once per two days at -10). Enemies act through whatever means suit them, from bureaucratic sabotage to hired thugs. The GM may periodically roll 2D6, adding the character's Reputation TP and the Enemy TP; a 7 or higher means no trouble that time. Enemy is identity-based and stackable, and a character may hold any number of them.</p>` },
  { name: 'Glass Jaw', type: 'negative', tp: '-3', desc: 'Easily knocked out; worse effects from stun/knockdown.',
    longDesc: `<p>The character is far more fragile than their Body attribute suggests. Any personal damage they take is multiplied by 1.5 (rounded up), and any Fatigue suffered in combat is doubled. This -3 TP trait is opposed by Toughness; if a character ever holds both, they cancel out.</p>` },
  { name: 'Gremlins', type: 'negative', tp: '-3', desc: 'Technology tends to fail in the character’s hands.',
    longDesc: `<p>The character is disastrously bad with machinery, which tends to fail on them at the worst moments. They pay 10% more XP to raise or buy any Technician skill after character creation, take a -1 penalty when using any equipment of Tech Rating B or higher, and fumble such equipment on a natural roll of 2 or 3. On a natural 2 the device actually breaks down (weapons jam or fuse and need repair before reuse). This -3 TP trait is opposed by Tech Empathy, and the two cancel each other out.</p>` },
  { name: 'Handicap', type: 'negative', tp: '-5 to -1', desc: 'A lasting physical impairment.',
    longDesc: `<p>A catch-all physical or mental impairment not covered by other traits (i.e. not Compulsion, Glass Jaw, Lost Limb, Poor Vision/Hearing, Slow Learner, or TDS). It is stackable and ranges -1 to -5 TP by severity: a -1 serious allergy imposes -1 to all rolls when triggered, a -2 crippling allergy -3 to all rolls (or extra Fatigue), and -3 to -5 range from loss of a small body function up to body-wide impairment like paralysis or emphysema. It cannot 'double up' with another negative trait describing the same affliction.</p><p>Handicap is opposed by Fit, but unusually Fit does not simply cancel it; the character must buy enough Fit TP to offset all Handicaps before gaining any net Fit benefit, and a Handicap described as genetic can never be bought off, permanently barring the Fit trait.</p>` },
  { name: 'Illiterate', type: 'negative', tp: '-1', desc: 'Cannot read or write.',
    longDesc: `<p>The character cannot read regardless of their spoken Language skills. Any action needing reading is resolved as if the relevant INT-linked skill were untrained; if the character also lacks that skill, they roll 3D6 and keep the lowest two dice. Raising or buying INT-linked skills, or any Advanced-training skill, costs 10% more XP (rounded up). This -1 TP trait has no opposing trait, but is instead nullified once the character reaches level 4 or higher in any Language skill.</p>` },
  { name: 'Impatient', type: 'negative', tp: '-1', desc: 'Restless; penalty to tasks that require patience.',
    longDesc: `<p>The character compulsively cannot wait, even to their own detriment. They take a -1 penalty on any Skill or Attribute Check classified as Complex (tasks needing sustained time and focus), may accumulate at most a +2 bonus from Careful Aim, and gain no bonus for taking extra time on complex tasks. This -1 TP trait is opposed by Patient, and the two cancel out.</p>` },
  { name: 'In For Life', type: 'negative', tp: '-3', desc: 'Bound to an organisation the character cannot freely leave.',
    longDesc: `<p>The character is permanently bound to a secretive organization or an individual through oath, debt, or honor. In play, that master may call on them at any time for favors, missions, or a final reckoning, even when doing so is harmful to the character, and typically offers little or nothing in return. Refusing or failing such obligations can turn the master into an Enemy and even earn a Bloodmark. This -3 TP trait is identity-based and stackable, tied to specific aliases.</p>` },
  { name: 'Introvert', type: 'negative', tp: '-1', desc: 'Uncomfortable in social situations; penalty to some CHA checks.',
    longDesc: `<p>Innate shyness or social awkwardness makes the character worse with people than their Charisma alone would suggest. They take a -1 penalty on any Skill Check where social interaction is a factor, at the GM's discretion. This -1 TP trait is opposed by Gregarious, and the two cancel each other out.</p>` },
  { name: 'Lost Limb', type: 'negative', tp: '-5 to -1', desc: 'A missing limb (unless replaced by a prosthetic).',
    longDesc: `<p>The character is missing all or part of a limb through injury or birth defect. This stackable trait runs -1 to -5 TP by extent: -1/-2 for missing fingers or toes (-1 or -2 to affected DEX or balance rolls), -3/-4 for a lost hand or foot (-3 to DEX rolls with a hand, or -1 RFL and reduced movement for a foot), and -5 for a whole arm or leg (-4 to DEX rolls for an arm; halved RFL, quartered walking, and no running/jumping for a leg). Losing both arms or both legs removes those functions entirely without prosthetics.</p><p>The Implant/Prosthetic trait technically opposes it, but because most prosthetics are removable, it only truly cancels a Lost Limb when the replacement is permanent (a Type 6 cloned limb or a myomer implant).</p>` },
  { name: 'Poor Hearing', type: 'negative', tp: '-5 to -1', desc: 'Penalty to hearing-based Perception checks.',
    longDesc: `<p>Hearing loss from birth or injury, scaled -1 (minor) to -5 (complete deafness). The trait's TP applies directly as a penalty to any hearing-based Action Check, and the character also takes an Initiative penalty equal to half the TP (rounded down). At -5 TP hearing is impossible: hearing-based checks auto-fail and a flat -3 applies to all personal-combat Initiative rolls. It is opposed by Good Hearing, but because Poor Hearing scales, each point of Good Hearing only removes 1 TP rather than cancelling it outright.</p>` },
  { name: 'Poor Vision', type: 'negative', tp: '-9 to -2', desc: 'Penalty to sight-based Perception checks.',
    longDesc: `<p>Bad eyesight from birth or injury, ranging -2 (minor loss, night or color blindness) to -9 (total blindness). The character takes a penalty equal to half the TP (rounded down) on any vision-based Action Check and on personal-combat Initiative rolls. At -9 TP sight is impossible: vision-based checks auto-fail, a -5 applies to all Initiative rolls, and operating any vehicle or 'Mech becomes impossible. It is opposed by Good Vision, but since Poor Vision scales, each Good Vision only strips 1 TP rather than cancelling the whole trait.</p>` },
  { name: 'Slow Learner', type: 'negative', tp: '-3', desc: 'Earns experience more slowly than normal.',
    longDesc: `<p>The character struggles to acquire and improve skills relative to others of equal intelligence, paying 20% more XP for skills both at character creation and during advancement. This -3 TP trait is opposed by Fast Learner, and the two cancel each other out.</p>` },
  { name: 'TDS', type: 'negative', tp: '-1', desc: 'Transit Disorientation Syndrome; ill effects from jump travel.',
    longDesc: `<p>A character with Transit Disorientation Syndrome becomes severely ill from hyperspace (K-F) jumps. After a jump they are treated as Stunned for 20 minutes minus their BOD attribute and cannot shake it off early, then remain nauseated for a further 3D6 hours with a -1 penalty to all Action Checks. Enduring a second jump while still recovering knocks the character out for the stun duration (20 minus BOD minutes) and then inflicts 24 + 4D6 hours of lingering sickness at a -2 penalty to all Action Checks. This is a fixed -1 TP trait with no opposing trait.</p>` },
  { name: 'Unattractive', type: 'negative', tp: '-1', desc: 'Penalty to CHA-based interactions.',
    longDesc: `<p>The character is physically off-putting, whether through deformity, scarring, a grating voice, or worse. They take a -2 penalty on any Skill or Attribute roll involving their Charisma, and unlike the Attractive trait this penalty applies regardless of the other party's gender. This -1 TP identity-based trait is opposed by Attractive; the two cancel out unless Unattractive is specifically assigned to one alias.</p>` },
  { name: 'Unlucky', type: 'negative', tp: '-10 to -2', desc: 'Fate works against the character; reduced Edge benefit.',
    longDesc: `<p>The character is cursed with terrible luck, and the GM effectively wields their bad fortune like a reverse Edge score. Ranging -2 to -10 TP, the trait grants a pool of 'anti-Edge' points (1 point at -2, up to 5 points at -9/-10) that the GM burns to force the character to reroll an Action Check or to worsen a result, exactly as Edge is normally spent. These points refresh every game session. Use is limited to rolls affecting the unlucky character directly, not their teammates; and if the character spends their own Edge on the same roll the GM taxes with bad luck, they may make a special check against their EDG score to instantly regain 1 Edge point.</p>` },
  // Flexible
  { name: 'Design Quirk', type: 'flexible', tp: '-5 to 5', desc: 'A vehicle or equipment quirk that can help or hinder, depending on the score.',
    longDesc: `<p>Design Quirk is a Vehicle trait describing distinctive perks or flaws a specific unit has beyond its raw combat stats. It applies to one owned/assigned vehicle (BattleMechs, IndustrialMechs, combat and support vehicles, fighters, or battle armor) and does not carry over if that vehicle is destroyed. TP runs from -5 to +5: positive TP is a benefit (e.g. enhanced targeting), negative TP a drawback (e.g. sensor glitches or faulty power systems), with 1-2 TP being minor and 3-5 TP significant.</p><p>It is a Multiple trait, so a vehicle can hold several quirks, but only one quirk of any given type. A vehicle may carry at most 5 positive and 5 negative quirks, and the sum of all its quirk TP scores may not exceed 5.</p>` },
  { name: 'Equipped', type: 'flexible', tp: '-1 to 8', desc: 'Starts with (or lacking) personal gear appropriate to the score.',
    longDesc: `<p>Equipped is a flexible, identity-based trait (TP -1 to +8) that widens or narrows a character's access to gear, mainly at character creation but usable throughout play at the GM's option. Its TP sets the maximum equipment ratings the character can obtain across three axes: Tech Level, Availability, and Legality, climbing from low ratings at -1 up to top-tier F/F/F at +8.</p><p>Periphery-affiliated characters reduce the allowed Tech Level by 1 (minimum B) while Clan characters raise it by 1 (maximum F). Buying items from outside the character's own affiliation (and not neutral) raises that item's required Availability and Legality by 1 each. It is a Multiple trait tied to a specific alias.</p>` },
  { name: 'Extra Income', type: 'flexible', tp: '-10 to 10', desc: 'A recurring income (or debt) each month.',
    longDesc: `<p>Extra Income is a flexible, identity-based trait (TP -10 to +10) representing money that flows in or out each month independent of the character's job, such as a stipend, an investment return, or a debt. The amount is applied at the start of each month per the trait table: positive TP is regular income (from +250 C-bills at +1 up to +5,000 at +10) while negative TP is an ongoing debt (from -250 at -1 down to -5,000 at -10). Funds move electronically from the character's savings regardless of location, and the GM and player should define the source and any conditions attached (a stipend may carry obligations; a debt may only be servicing interest on a larger balance).</p><p>It is a Multiple trait, one per identity. It cannot double up income already represented by the Property or Rank traits, and it never covers ordinary pay from in-game employment.</p>` },
  { name: 'Reputation', type: 'flexible', tp: '-5 to 5', desc: 'A widespread good or ill reputation.',
    longDesc: `<p>Reputation is a flexible, region- and identity-based trait (TP -5 to +5) marking a character as famous or infamous and easily recognized wherever the reputation applies. TP scale sets reach, from known on a single world at +/-1 up to universally recognized across the Inner Sphere, Periphery, and Clan space at +/-5. A positive score grants a +1 modifier to Negotiation, Protocol, and Streetwise checks; a negative score imposes -1 on those same checks.</p><p>Regardless of whether the score is positive or negative, any non-zero Reputation gives a -2 modifier to Disguise checks (the character's face is too well known) and a +2 bonus to anyone investigating that character for Dark Secrets or Alternate IDs. It is a Multiple trait limited to one per identity; if linked aliases with different Reputations are exposed together, the character takes on the lowest (worst) of the exposed scores.</p>` },
  { name: 'Wealth', type: 'flexible', tp: '-1 to 10', desc: 'Personal liquid wealth (or, if negative, poverty).',
    longDesc: `<p>Wealth is a flexible, identity-based trait (TP -1 to +10) that adjusts a character's starting cash away from the default 1,000 C-bills spent at the end of character creation. The table ranges from just 100 C-bills at -1 up to 2,000,000 C-bills at +10 (with +0 being the standard 1,000). It only sets starting funds; it does not grant equipment access, pay rates, or ongoing income, though unspent money carries forward into play.</p><p>It is a Multiple trait, but a character may hold only one Wealth trait of any value per identity, assigned to a specific alias if the character has Alternate IDs.</p>` }
];

/** name -> description map (base trait name, before any "/subskill"). */
export const ATOW_TRAIT_DESCRIPTIONS = Object.fromEntries(
  ATOW_TRAITS.map(t => [t.name, `${t.desc} (${t.type}, ${t.tp} TP)`])
);

/**
 * Canonical subskills per root skill (ATOW Skills chapter). Closed lists are
 * complete; open-ended skills (Interest, Protocol, Streetwise) are left empty
 * so the wizard offers a free-text field. Semi-open skills carry example
 * suggestions plus an "Other…" escape hatch in the UI. GM-editable via each
 * skill Item's `system.subskills`.
 */
export const ATOW_SUBSKILLS = {
  'Acrobatics': ['Free-Fall', 'Gymnastics'],
  'Animal Handling': ['Herding', 'Riding', 'Training'],
  'Art': ['Dance', 'Drawing', 'Music', 'Painting', 'Sculpture', 'Writing'],
  'Career': ['Accountant', 'Clerk', 'Cook', 'Laborer', 'Merchant'],
  'Communications': ['Black Box', 'Conventional EM', 'Hyperpulse Generator'],
  'Driving': ['Ground Vehicles', 'Rail Vehicles', 'Sea Vehicles'],
  'Gunnery': ['Aerospace', 'Air Vehicle', 'Battlesuit', 'Ground Vehicle', "'Mech", 'Spacecraft'],
  'Language': ['English', 'Chinese', 'Japanese', 'German', 'Russian', 'French', 'Arabic', 'Urdu'],
  'MedTech': ['General', 'Veterinary'],
  'Navigation': ['Air', 'Ground', 'K-F Jump', 'Sea', 'Space'],
  'Piloting': ['Aerospace', 'Air Vehicle', 'Battlesuit', "'Mech", 'Spacecraft'],
  'Prestidigitation': ['Pick Pocket', 'Quickdraw', 'Sleight of Hand'],
  'Science': ['Astronomy', 'Biology', 'Chemistry', 'Geology', 'Mathematics', 'Physics'],
  'Security Systems': ['Electronic', 'Mechanical'],
  'Support Weapons': ['Air', 'Infantry', 'Land', 'Sea', 'Space'],
  'Surgery': ['General', 'Veterinary'],
  'Survival': ['Arctic', 'Desert', 'Forest', 'Jungle', 'Mountain', 'Ocean', 'Plains', 'Urban'],
  'Technician': ['Aeronautics', 'Cybernetics', 'Electronic', 'Jets', 'Mechanical', 'Myomer', 'Nuclear', 'Weapons'],
  'Tracking': ['Urban', 'Wilds'],
  'Melee Weapons': ['Blade', 'Blunt']
};

/* -------------------------------------------------------------------------- */
/*  Shared parsers + compendium seed builders                                  */
/* -------------------------------------------------------------------------- */

const ATTR_SET = new Set(['str', 'bod', 'rfl', 'dex', 'int', 'wil', 'cha', 'edg']);

/** Parse a "INT+WIL" links string into [linkedAttribute1, linkedAttribute2]. */
export function parseSkillLinks(links) {
  const parts = String(links || '').split('+').map(s => s.trim().toLowerCase()).filter(Boolean);
  const valid = parts.filter(p => ATTR_SET.has(p));
  return [valid[0] || 'int', valid[1] || ''];
}

/** Parse a "8/SA" TN/Complexity code into { targetNumber, complexity }. */
export function parseSkillTNC(tnc) {
  const [tn, code] = String(tnc || '').split('/');
  return {
    targetNumber: Number(tn) || 7,
    complexity: /^C/i.test((code || '').trim()) ? 'C' : 'S'
  };
}

/** First signed integer in a TP range string ("-5 to -1" -> -5, "2" -> 2). */
function parseTP(tp) {
  const m = String(tp || '').replace(/[–—]/g, '-').match(/-?\d+/);
  return m ? Number(m[0]) : 0;
}

/** Build `skill` Item data for the reference compendium from the master list. */
export function skillSeedItems(list = ATOW_SKILLS) {
  return list.map(s => {
    const [linkedAttribute1, linkedAttribute2] = parseSkillLinks(s.links);
    const { targetNumber, complexity } = parseSkillTNC(s.tnc);
    return {
      name: s.name,
      type: 'skill',
      system: {
        linkedAttribute1, linkedAttribute2, targetNumber, complexity, xp: 0, level: 0,
        subskills: ATOW_SUBSKILLS[s.name] || []
      },
      // Keep the original strings so config can be rebuilt losslessly.
      flags: { 'mech-foundry': { reference: true, links: s.links, tnc: s.tnc } }
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Wealth -> starting C-Bills, Equipped -> equipment rating (ATOW p.128/116)  */
/* -------------------------------------------------------------------------- */

/** Wealth Trait Table: TP -> starting cash in C-bills (TP 0 is the 1,000 default). */
export const WEALTH_CBILLS = {
  '-1': 100, '0': 1000, '1': 2500, '2': 5000, '3': 10000, '4': 25000,
  '5': 50000, '6': 100000, '7': 250000, '8': 500000, '9': 1000000, '10': 2000000
};

/** Default starting cash for a character with no Wealth Trait (Wealth TP 0). */
export const DEFAULT_STARTING_CBILLS = 1000;

/** Equipped Trait Table: TP -> "Tech/Availability/Legality" max rating codes. */
export const EQUIPPED_RATINGS = {
  '-1': 'C/A/B', '0': 'D/B/B', '1': 'D/B/C', '2': 'D/C/C', '3': 'E/C/D',
  '4': 'E/D/D', '5': 'E/D/E', '6': 'E/E/E', '7': 'E/E/F', '8': 'F/F/F'
};

const clampKey = (tp, lo, hi) => String(Math.max(lo, Math.min(hi, Math.round(Number(tp) || 0))));

/** Starting C-bills for a Wealth Trait TP. */
export function wealthCBills(tp) {
  return WEALTH_CBILLS[clampKey(tp, -1, 10)] ?? DEFAULT_STARTING_CBILLS;
}

const TECH = ['B', 'C', 'D', 'E', 'F'];

/** Max equipment rating for an Equipped Trait TP, with affiliation adjustments. */
export function equippedRating(tp, { isClan = false, isPeriphery = false } = {}) {
  let rating = EQUIPPED_RATINGS[clampKey(tp, -1, 8)] ?? EQUIPPED_RATINGS['0'];
  if (isClan || isPeriphery) {
    const parts = rating.split('/');
    let i = TECH.indexOf(parts[0]);
    if (isClan) i = Math.min(TECH.length - 1, i + 1);       // Clan: Tech +1 (max F)
    if (isPeriphery) i = Math.max(0, i - 1);                // Periphery: Tech -1 (min B)
    parts[0] = TECH[i] ?? parts[0];
    rating = parts.join('/');
  }
  return rating;
}

/**
 * Derive starting wealth/equipment from a character's trait XP map.
 * @param {Object<string, number>} traits  name -> accumulated XP
 * @param {object} [opts]  { isClan, isPeriphery }
 * @returns {{ wealthTP:number, equippedTP:number, cbills:number, rating:string }}
 */
export function computeStartingWealth(traits = {}, opts = {}) {
  const sumBase = (base) => Object.entries(traits)
    .filter(([n]) => n.split('/')[0].trim().toLowerCase() === base)
    .reduce((a, [, xp]) => a + (Number(xp) || 0), 0);
  const wealthTP = sumBase('wealth') / 100;
  const equippedTP = sumBase('equipped') / 100;
  return {
    wealthTP,
    equippedTP,
    cbills: wealthCBills(wealthTP),
    rating: equippedRating(equippedTP, opts)
  };
}

/** Build `trait` Item data for the reference compendium from the master list. */
export function traitSeedItems(list = ATOW_TRAITS) {
  return list.map(t => ({
    name: t.name,
    type: 'trait',
    system: {
      traitType: t.type === 'negative' ? 'negative' : 'positive',
      cost: parseTP(t.tp),
      xp: 0,
      purchased: false,
      description: t.longDesc || `<p>${t.desc}</p>`
    },
    flags: { 'mech-foundry': { reference: true, category: t.type, tp: t.tp, summary: t.desc } }
  }));
}
