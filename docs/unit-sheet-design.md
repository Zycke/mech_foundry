# Unit Actor Sheet Design — Mech / Ground Vehicle / Aerospace Fighter / Battle Armor / Infantry

Status: **approved design, in implementation.** Source rules: *Total Warfare* (record-sheet
data model + sequence of play) with standard canonical values for the combat chapter (the
Drive extract only covered pp.1–62; the combat/heat/aero chapters will be verified from the
second split PDF before combat automation ships).

Guiding principles: **Foundry v14 native (ApplicationV2), functionality & player click-flow
first, values stored-as-entered** (no TechManual auto-derivation), and everything integrates
with the existing company sheet (MTOE blocks, ship cubicles, logistics, crew).

## Locked decisions
1. **Pilot/crew:** each unit has an embedded pilot/crew block (name + Gunnery + Piloting/
   Driving + hits ladder) that can *optionally link* to a character or a simplified NPC actor.
2. **Token bars:** the two bars are **Total Armor** and **Total Structure** (derived sums).
   Heat lives as a prominent on-sheet gauge (not enough bar slots for it too).
3. **Combat:** build the sheets first, fully functional; automation is a later phase but the
   data model is designed to support it.
4. **Rules source:** obtain the second Total Warfare split PDF for the combat/aero chapters
   before automating; not needed for the sheets themselves.

## Shared architecture
- A base sheet class (`module/sheets/unit-sheet.mjs`, `MechFoundryUnitSheet`) holds the common
  scaffolding: weapons table CRUD, pilot block, notes editor, image edit, tab switching, and
  generic `{value, max}` damage-bar handling. Battle Armor keeps the simple shared template.
- `mech`, `ground_vehicle`, `aerospace_fighter` each get their own template + a subclass that
  adds type-specific context and handlers.
- Every armor/structure location is a `{value, max}`: `max` entered once, `value` mutates in
  play. Current values are edited inline (bar + number); a click-to-damage affordance can be
  layered on later.
- Derived totals `system.derived.armorTotal` / `structureTotal` (`{value,max}`) computed in the
  actor document for token bars and for the MTOE status roll-up.

## Mech
Static: tonnage, weightClass, techBase, era, movement {walk, jump} (run = ⌈walk×1.5⌉ derived),
engineType, engineRating, heatSinks {count, type}, cost, bv.
Locations: armor {value,max} for head, ct, lt, rt, la, ra, ll, rl + rear {ct, lt, rt}; structure
{value,max} for the 8 locations.
Dynamic: heat {value, overflow}; systemHits {engine 0–3, gyro 0–2, sensors, lifeSupport};
per-location crit components (deferred to a follow-up); conditions {shutdown, prone}; weapons;
pilot.
Layout (tabs): **Status** (armor-over-structure location grid + heat gauge w/ live MP & to-hit
penalties + pilot condition + flags) · **Combat** (weapons w/ future attack buttons) ·
**Crits & Loadout** (system hits, heat sinks, per-location crits) · **Details/Notes**.

## Ground Vehicle
Static: tonnage, movementType, engineType, movement {cruise, flank = ⌈cruise×1.5⌉}, cost, bv,
hasTurret, bar (support vehicles).
Locations: armor {value,max} front/left/right/rear/turret(opt)/rotor(VTOL); **single** structure
{value,max}.
Dynamic: **no heat**; critical checklist (turretLocked, engineHit, stabilizers per facing,
sensorHits 0–4, motiveHits 0–3); crew {driver, commander} hit flags; weapons; flags (immobile,
turret jam; VTOL elevation, naval depth).
Layout: **Status** (facing armor bars + single structure bar + motive/crit checklist showing the
live movement/skill penalty + crew) · **Combat** · **Details/Notes**.

## Aerospace Fighter
Static: tonnage, thrust {safe, max = ⌈safe×1.5⌉}, structuralIntegrity {value,max}, heatSinks,
fuel, cost, bv.
Locations: armor {value,max, threshold} nose/leftWing/rightWing/aft.
Dynamic: heat {value, overflow} (aero effect table); critical checklist (fcs, avionics, sensors,
engine, gear, lifeSupport, progressive); velocity/altitude {velocity, altitude, thrustSpent};
weapons (SRV/MRV/LRV/ERV); bombs/external stores; pilot; flags (shutdown, outOfControl).
Layout: **Status** (facing armor + threshold + SI bar + aero heat gauge + velocity/altitude +
crit checklist + pilot) · **Combat** (arc weapons + bombs) · **Details/Notes**.

## Company-sheet integration
- Units drag into MTOE blocks (type-matched) and ship cubicles — already wired.
- The weapons model (name/location/heat/damage/ranges/**ammoType**) feeds the Logistics ammo
  roll-up (replaces the placeholder `system.weapons`).
- MTOE unit **status** (Undamaged/Damaged/Destroyed) will derive from armor/structure state.
- Pilot/crew link to characters/NPCs; company still tracks bulk crew as numeric pools.

## Combat automation (later phase)
Foundry-native, incremental: weapon **Attack** button → GATOR to-hit dialog (gunnery + attacker
move + target move + range via `canvas.grid.measurePath` + terrain/heat) → 2d6 → chat card →
hit-location roll → damage through armor→structure with transfer → crit checks → heat-phase
one-click resolution. Turn flow over the Combat Tracker (Initiative → Ground move → Aero move →
Weapon → Physical → Heat → End, alternating activation). Area effects via **Scene Regions**
(v14 removed MeasuredTemplate). Verify the Cluster Hits and Aero hit-location tables from the
full book before shipping.

## A Time of War ↔ Total Warfare conversion (implemented)
Source: *A Time of War* pp. 42-43 (skills) and the MechWarrior/Pilot/Crew Damage Table (p. 218).
Lives in `module/helpers/atow-conversion.mjs`.
- **Skill rating:** `TW Rating = Base Target Number − Skill Level`, floored at 0 ("superhuman"
  skills clamp to 0). Base TN comes from the skill's complexity code (SB 7, SA 8, CB 8, CA 9);
  Gunnery/'Mech, Piloting/'Mech, Gunnery/Ground Vehicle, Driving/Ground Vehicles,
  Gunnery/Aerospace and Piloting/Aerospace are all **8/SA** → Base TN 8. When a crew slot is
  linked to a character, the sheet derives the rating live from that actor's skill Item.
  Unit-scale rolls keep the Total Warfare convention (the rating is added to the target
  number; lower is better), which gives the same odds as AToW's 2D6 + level vs Base TN.
  `module/helpers/tw-skills.mjs` labels the rating by source — "Gunnery (Lvl 5 → 8 − 5)" for
  a linked character, "Gunnery rating" for a sheet value, "(entered)" when edited in a
  dialog — and dialogs / sheet inputs explain the sign ("+ harder, − easier").
- **Linked warrior condition (house rule):** a linked character's A Time of War injury and
  fatigue modifiers carry into every unit-scale roll the warrior makes (weapon and physical
  attacks, Piloting / Driving / Control Rolls, anti-'Mech attacks, skids, falls): an AToW −1
  becomes +1 to the target number ("Kai injured +1", "Kai fatigued +2"). Wound attribute
  penalties are not carried (link attributes aren't part of the conversion), though wounds
  that reduce damage capacity raise the injury modifier. Sheet-only warriors use the unit's
  pilot-hit rules only.
- **Pilot/crew damage (`CREW_DAMAGE`, `AP/BD`):** pilot hit = **1B/3**; falling 1M/3; ammo
  explosion 0E/4D\*; CT-by-artillery 10X/20; overheat w/life support 0E/2D\* (15+) & 0E/4D\* (25+);
  vehicle commander/driver hit 5B/4; crew stunned 0M/5D\* (subduing); crew killed 5B/10.
  `*` = unaffected by armor (applied via `applyDamage`'s raw path). Mech/aero pilot-hit pips and
  vehicle driver/commander flags apply the matching event to the linked character on increase.

## Rollout (reviewable commits)
1. ✅ Mech data model + sheet.  2. ✅ Token-bar derived totals + prototype config.
3. ✅ Ground-vehicle sheet.  4. ✅ Aerospace sheet.  5. ✅ Company integration polish (status
derivation, ammo alignment).  6. ✅ Combat automation.
Pilot skill-derivation and pilot/crew → character damage write-back are wired for all three
unit types (see the conversion section above).

## Combat automation (implemented) — `module/helpers/tw-combat.mjs`
GATOR to-hit dialog → 2d6 → chat card; on a hit the correct hit-location table for the
target type resolves damage through armor→structure(/SI) with transfer, plus motive damage,
criticals and cluster grouping:
- **Mech:** 'Mech Hit Location + transfer; Determining Critical Hits rolled against a full
  per-location **critical-slot model** (`system.critSlots`; standard biped layout via the
  Crits tab "Init standard") — engine/gyro/sensors/life-support/cockpit, weapons, heat sinks,
  ammo, actuators resolved to specific slots.
- **Combat Vehicle / VTOL:** hit location + Motive System Damage + Ground/VTOL crit tables.
- **Aerospace / Small Craft:** facing armor + threshold crits + Structural Integrity.
- **Heat phase:** mech "Resolve" nets Heat Point Table gains vs. sink dissipation. Advancing
  the tracker into the Heat Phase resolves heat for every 'Mech and aerospace unit in the
  combat with the defaults (this turn's movement, weapons fired, engine hits, sinks); a unit
  resolved by hand first is skipped, and a second resolution in one turn is blocked.
- **Facing, arcs and attack direction** (`module/helpers/tw-facing.mjs`, `tw-facing-ui.mjs`;
  geometry from MegaMek's ComputeArc / sideTable). Six hexside facings read from the token
  rotation (world setting for which way the art faces). Moving a unit token turns it to its
  direction of travel along the path (auto-facing, world setting); a leg straight back is
  backing up (facing kept); Alt while dropping keeps the facing. Q / E (rebindable) and token
  HUD buttons turn one hexside; Shift+Q / Shift+E twist a 'Mech's torso one hexside for the
  turn (not while prone). Facing changes cost 1 MP per hexside for 'Mechs and ground vehicles
  (free when jumping; infantry and battle armor turn freely): MP spent = hexes + turns drives
  the walked / ran inference, the over-MP warnings, the checklist and the round summary;
  running while backing up is flagged. Turning is held to the Movement Phase like moving.
  Tokens show the legs' facing as a small amber arrowhead on the edge (the token's rotation —
  it also sets the hit table). A twisted torso adds the same arrowhead in cyan where the torso
  faces. The selected unit's arcs are
  shaded from the torso's facing — forward amber, the two sides blue-grey, rear red — each
  outlined in its colour and lettered F / S / S / R (client settings). The hit table still goes
  by the legs (the amber arrow), twisted or not. The twist also shows on the
  'Mech sheet's movement panel ("Torso: twisted right", with left / straighten / right
  buttons), in the fire dialog's header, on the attack card's context line ("twisted R") and
  in the token HUD tooltips. Arcs: forward 300–60°, left arm 240–60°, right arm
  300–120°, rear 120–240°, vehicle sides 60–120° / 240–300°, aerospace nose / wings / aft;
  turrets, battle armor and infantry all round (a locked turret fires forward); torso and arm
  weapons turn with a torso twist, leg weapons don't. The fire dialog pre-selects the attack
  direction from the target's facing ('Mech table: front 270–90°, sides 60°, rear 60°;
  vehicles / aerospace: front 330–30°, sides 120°, rear 60°) and unchecks weapons that can't
  bear, with the reason — they can still be checked (the card notes the override); the
  sheet's to-hit buttons show ARC.
- **Map terrain** (`module/helpers/tw-terrain.mjs`): the GM draws Scene Regions and gives
  them the "Mech Foundry Terrain" region behaviour (type, ground level, water depth). Types:
  clear, paved / road, rough, rubble, light / heavy woods, water, swamp, ice, building, light /
  heavy smoke; a new terrain region is coloured by type and named after it (custom names are
  kept). Regions overlap and combine (woods on a level-2 hill). A unit's hex is the terrain
  under its token's centre (shown under a hovered token, "Heavy woods · Level 1"). Along a line,
  each continuous stretch of a feature counts round(length ÷ 30 m) hexes — half a hex (15 m)
  counts — and the attacker's and target's own hexes (the first and last 15 m) aren't
  "between". Ground attacks read from the map (tagged "(from map)", all still editable): light
  / heavy woods and smoke hexes between (+1 / +2 each), what the target stands in, partial
  cover for a 'Mech in depth 1 water, and whether conventional infantry are in the open (not in
  woods, rough, rubble, swamp or a building — MegaMek infantryInOpen). Line of sight: 3+ points
  of intervening woods / smoke (light 1, heavy 2) block it. Weapons that can't fire are
  unchecked with the reason, like out-of-arc ones: no line of sight; a submerged (depth 2+)
  'Mech firing at, or being fired at from, above the surface; leg weapons of a 'Mech in depth
  1 water. The sheet's to-hit buttons include map terrain (LOS / N/A when blocked); the
  anti-'Mech dialog pre-selects the woods the target stands in.
  Movement over the map (during combat, token moves): each 30 m travelled enters the next hex
  (the last is where the unit stops), and each hex entered adds its terrain cost (Total Warfare
  Movement Costs Table, checked against MegaMek): light woods +1, heavy woods +2, rough +1,
  rubble +1, ice +1, swamp +1 ('Mechs) / +2 (others; hover free), 'Mech in water +1 (depth 1)
  / +3 (depth 2+); a road (paved) through woods / rough / rubble removes their cost. Level
  changes cost 1 MP per level for 'Mechs (at most 2 per hex) and 2 per level for vehicles and
  infantry (at most 1). Terrain MP adds to hexes and facing changes everywhere MP is counted
  (walked / ran inference, over-MP warnings, the sheet's "9 MP: 6 hexes + terrain 3 (light
  woods +3)", the GM checklist, the round summary). Prohibited terrain for the motive type
  (wheeled: woods / rough / rubble / water; tracked: heavy woods / water; hover: woods;
  infantry: water without UMU; naval: land; too-steep level changes) warns the mover and
  whispers the GM — it isn't blocked. A 'Mech queues a Piloting Skill Roll for each rubble hex
  (+0) or water hex entered (depth 1 −1, 2 +0, 3+ +1); jumping pays no terrain costs and only
  checks the landing hex (rubble). Turning on pavement or ice while running / flanking
  reminds the player to make a Skid check. VTOLs, WiGEs and aerospace units ignore terrain.
  Levels and line of sight (MegaMek LosEffects, non-diagram rules): a unit's absolute height is
  its ground level (+ elevation: a VTOL / WiGE's sheet elevation, else the token's elevation at
  6 m a level; a 'Mech wading in water stands on the bottom) + its height (a standing 'Mech 1,
  others 0). A hill or building (its "Building height" field) blocks line of sight where its top
  is higher than both units, or higher than the unit it stands next to; woods and smoke rise 2
  levels and only count — for the to-hit number and the 3-point block — where that top would
  block by the same test (units on hills fire over woods in the valley). Terrain in the hex next
  to a 'Mech exactly at its hip line gives partial cover when the other unit is no higher: the
  target +1 (leg hits strike the cover); an attacker can't fire its leg weapons. The fire
  dialog's map line shows the level difference ("target 2 levels higher").
  Physical attacks read the level difference from the map (MegaMek attack actions): punches and
  physical weapons reach a 'Mech on the same level or one higher (one higher: legs, Kick Location
  Table) and a vehicle or infantry only one level higher (normal table); kicks a 'Mech on the same
  level or one lower (one lower: Punch Location Table), a vehicle or infantry the same level;
  clubs one level either way; pushes the same level; charges within a unit's height. The physical
  dialog also fills the target's woods and water cover from the map. A unit displaced (push,
  charge, death from above) into a hex more than one level lower falls: the mover and GM are told
  and the sheet's Fall… dialog has the levels filled in.
  Buildings (`module/helpers/tw-buildings.mjs`; TW pp. 166–177, checked against MegaMek): a
  building region has a class, a Construction Factor (CF), a height and the CF lost so far (one
  region is one building — draw one per building block). Entering one costs MP by class (light
  1, medium 2, heavy 3, hardened 4; infantry free). Passing a wall — entering or leaving, 'Mechs
  and vehicles — is rolled when the move lands (Piloting / Driving, + light 0 / medium 1 / heavy
  2 / hardened 5, + hexes moved this turn: 3–4 +1 … 25+ +6); a failure costs the unit CF ÷ 10
  damage (front, or rear when backing), and the building takes the unit's tonnage ÷ 10 either
  way ("Moving Through Buildings" card). A unit inside a building (below its roof) is shielded
  from attacks from outside: each hit on it loses CF ÷ 10, which the building takes instead
  (card alert; Undo covers the building) — for conventional infantry, off the troopers the hit
  would eliminate (per hit; the platoon's card line shows it). An attacker inside the same
  building gets no shield in the way, except fire at conventional infantry on another floor
  (by token elevation): the building takes a share — heavy ¼, hardened ½, light / medium none
  (TW p. 175). The fire dialog's map line says which applies. Mechanized platoons pay 1 MP to
  enter a building (foot infantry nothing). At CF 0 it collapses into rubble: units inside take CF × floors above ÷ 10
  (infantry ×3, battle armor ×2; Punch Location Table for 'Mechs inside) and units above the
  ground floor fall ("Building Collapse" card). Units inside the same building aren't blocked
  by it. Players' building damage goes through the GM relay (only the CF lost and the collapse
  to rubble). The hover readout shows "Medium building (CF 32, 2 levels)", and ground units
  ('Mechs, vehicles, battle armor, infantry) inside a building below its roof carry the
  "Inside a Building" status (house icon), kept up to date as tokens move or change elevation
  and as building regions are drawn, moved, collapsed or deleted (tw-status.mjs).
  Attacking a building: firing (or making a physical attack) with no unit targeted offers the
  buildings in reach, nearest first (physical: adjacent ones only), measured to the nearest wall.
  A building is an immobile target (−4); from an adjacent hex or from inside it every shot hits
  automatically and every missile hits (MegaMek). It takes all the damage; conventional infantry
  and battle armor inside take a share of each attack (light ¾, medium ½, heavy ¼, hardened
  none; infantry converted as direct fire, battle armor in 5-point groups — "Fire into …" card).
  Physical attacks on an adjacent building hit automatically (punch, kick, club, physical
  weapon; charges, death from above and pushes against buildings aren't supported). Missed
  attacks at a unit inside a building: weapon fire from an adjacent hex at a non-infantry unit
  hits the building (cluster weapons roll the Cluster Hits Table), and any missed punch, kick,
  club or physical weapon does (TW p. 171). Not modelled: charges, death from above and pushes
  into buildings (and units displaced into one), floors / basements and overload collapse,
  fire, TacOps diagrammed line of sight.
- **Special equipment** (`module/helpers/tw-gear.mjs`, `tw-boost.mjs`; TW, checked against
  MegaMek): MASC, superchargers, TSM, ECM, active probes and C3. A 'Mech's are found from its
  critical slot names (imported names like "ISMASC", "Guardian ECM Suite", "Beagle Active
  Probe", "C3 Slave"; the C3 master computer from its weapon entry) — a destroyed slot disables
  them; any unit can add or override them in the sheet's Equipment block (`system.gear`, with a
  C3 network name), and the importer fills it for vehicles. MASC / supercharger: armed turn by
  turn during combat from the sheet (2D6 ≥ the failure number 3 / 5 / 7 / 11 / 13, rising with
  each consecutive turn of use and falling when rested); armed, Running / Flanking MP is
  Walking × 2 (× 2.5 with both). A MASC failure puts a critical hit on each leg (re-rolled onto a
  real component); a supercharger failure rolls 2D6 for 0–3 engine hits (motive damage steps on
  a vehicle); either way it isn't armed that turn. TSM at heat 9+: +2 Walking MP (not with a
  destroyed leg) and double punch, kick, club, hatchet, sword and retractable blade damage.
- **Weapon-fire animations** (`module/helpers/tw-animate.mjs`; visual only): the "Weapon
  animations" block under each unit weapon table ('Mech, vehicle, fighter, battle armor) holds a
  Sequencer / JB2A path per weapon, a delay between projectiles and a travel time — like the
  personal-scale weapon items. A weapon left blank is handed to the Automated Animations module
  when it is active (`AutomatedAnimations.playAnimation` with the weapon's name), which matches
  it in its Automatic Recognition menu; unit weapons are sheet rows, not Items, so they can't hold
  A-A's own item settings. One projectile per missile / pellet / Ultra or Rotary shot, as many
  reaching the target as the Cluster Hits Table says; misses land beside it (15 m + 10 m per point
  missed, at most 60 m). Out-of-range, jammed and Streak-no-lock shots don't animate; a building
  target gets Sequencer animations only. The volley's animations play before its chat card.
- **Electronic warfare** (`module/helpers/tw-ecm.mjs`; TW, checked against MegaMek ComputeECM /
  ComputeC3Spotter): sides come from token disposition (different dispositions are enemies; a
  secret token counts as hostile). An ECM suite projects a 6-hex bubble (not while shut down or
  destroyed). All of these distances are measured like weapon range: straight-line metres on the
  gridless map, 30 m a hex, rounded up (6 hexes reach 181 m). Enemy ECM over any hex of the line of fire cancels Artemis IV / V; over the
  target's hex, the Narc bonus. Active probe (Beagle 4, Clan 5, Bloodhound 8, light 3 hexes; not
  through enemy ECM; a C3 mate's counts): −1 against a target in or behind woods. C3: units with
  the same network name (and side) use the range bracket of the linked member closest to the
  target that has line of sight; the attacker's own distance still decides minimum range and
  whether the weapon reaches at all. A standard network needs a working master; a unit inside
  enemy ECM, or whose link to the master crosses it, is cut off. The fire dialog's Electronics
  block shows and pre-fills all of this (C3 spotter range, probe, the two ECM boxes) so it can be
  overridden; the sheet's equipment chips show the live C3 link and an "Enemy ECM" chip.
- **Special munitions** (`module/helpers/tw-weapons.mjs` MUNITIONS; checked against MegaMek):
  Inferno SRM, semi-guided LRM, precision and armor-piercing autocannon rounds. Each has its own
  shot count on the weapon (Special column; blank = none carried), apart from the standard Rds,
  and is picked per weapon in the fire dialog (the default is standard rounds while they last).
  The importer puts MegaMek's munition bins there (precision / AP at half the shots a ton).
  Inferno: no damage; the cluster roll gives the missiles (every missile against conventional
  infantry or on an automatic hit) — 2 heat each to a 'Mech or fighter (external heat, 15 a turn
  at most; behind partial cover, leg hits strike the cover), a critical roll at −2 each against
  a vehicle, 1 damage per 3 missiles to battle armor, 3 troopers per missile, 2 damage per
  missile to a building. Semi-guided: against a target TAG-designated this turn the target
  movement modifier is cancelled (untagged, standard LRMs). Precision: up to 2 off the target
  movement modifier. Armor-piercing: +1 to-hit; a hit the armor stops still rolls for a
  critical hit at −4 / −3 / −2 / −1 (AC/2 / 5 / 10 / 20) on a 'Mech or vehicle. Not modelled:
  swarm and thunder (minefield) LRMs, other munitions, hardened / reactive armor immunity to AP.
- **Movement discipline** (`module/helpers/tw-phase.mjs`): a token move that takes a unit past
  its current MP this turn (Running / Flanking, or Walking when "Walked" is declared, Jumping
  when "Jumped" is) warns the mover and whispers the GM — it isn't blocked. During a running
  combat players can only move their units' tokens in the Movement Phase (world setting
  "Hold Units to the Movement Phase", on by default; the GM is never blocked; characters and
  units outside the combat aren't affected). A charge, push or death from above lets the
  units it displaces move once that turn.
- **GM phase checklist:** under the tracker's phase bar, one line per unit for the current
  phase — initiative rolled, hexes moved of its limit (over-limit in red), weapons fired /
  unjamming / anti-'Mech, physical attack, heat resolved — plus pending Piloting / Control
  Rolls, a manual "done" tick per unit per phase, and "Resolve heat for all" in the Heat Phase.
- **End Phase round summary** (`module/helpers/tw-round.mjs`, GM): in the End Phase the checklist
  becomes a round summary — totals (damage, crits, units destroyed, items to do), "Before the
  next round" (pending Piloting / Control Rolls with a Roll button, unresolved heat with
  Resolve, over-MP moves with OK to dismiss, rolls resolved automatically this End Phase), and
  a card per unit (movement of its limit, weapons hit / fired and damage by target, physical /
  anti-'Mech attacks, damage taken with notable effects, heat and its penalties, conditions:
  prone, shutdown, pilot hits, swarmed / swarming, Narc pod, roll pending). Destroyed units are
  listed last with what destroyed them. The data comes from a compact record each combat card
  stores on its chat message (`flags.mech-foundry.summary`: attacks, rolls, heat) plus the
  units' current state; the phase button reads "Start Round N".
- **Phases:** the tracker bar steps forward and back (stepping back undoes nothing). After
  the End Phase — or the tracker's own Next Round — the round advances to Initiative and
  every combatant's initiative is cleared for re-rolling.
- **Weapon to-hit modifiers:** each weapon's own modifier (pulse lasers −2, Clan ER pulse −1,
  heavy lasers +1, X-pulse −2, …) comes from the MegaMek-derived catalog — imported weapons
  store it as `toHit`; hand-entered weapons are looked up by name. The weapon table's Special
  column overrides it (blank = catalog).
- **Weapon special rules** (`module/helpers/tw-weapons.mjs`, checked against MegaMek's
  handlers). The fire dialog has a Mode column where a weapon has choices:
  - *Ultra AC* single / double rate (2 shots: 2× ammo and heat, Cluster Hits 2 column, each
    hit its own location; a natural 2 at double rate jams it for the battle).
  - *Rotary AC* 1–6 shots (ammo / heat per shot, cluster column = shots; jams on a natural
    2 at 2–3 shots, ≤3 at 4–5, ≤4 at 6). **Unjam** (Special column) replaces the unit's
    attacks for the turn: 2D6 ≥ Gunnery + 3.
  - *LB-X* slug or cluster (−1 to-hit, cluster column = cannon size, 1-point pellets; cluster
    rounds use the Special column's count when set, otherwise Rds).
  - *Flamer* damage or heat (against 'Mechs / aerospace: heat = damage, ER half; applied in
    the target's heat phase, max 15 external heat a turn).
  Missile launchers take a fire-control setting: Artemis IV +2 / V +3 on the cluster roll,
  or Narc-capable (+2 against a unit carrying a Narc pod). A target's **AMS** engages the
  first missile attack each turn automatically (−4 on the cluster roll; a Streak rolls as
  11 − 4; 1 ammo and its heat). Narc / iNarc hits attach a pod (shown on the target's sheet,
  removable there); TAG designates the target for the turn; Streaks that miss don't fire
  (no ammo or heat); one-shot weapons are spent after firing. Jams and spent one-shots are
  reset from the Special column between battles. The importer reads Artemis IV / V units
  (linked to the location's launchers), Narc-capable ammo and LB-X cluster bins.
- **Condensed chat cards** (`module/helpers/tw-cards.mjs`): every combat result is one
  outcome-first card. A weapons volley (`tw-volley.hbs`) posts a single message: header with
  round and phase, attacker → target, range / arc and the shared base to-hit (click for its
  modifiers), a tally (hits / damage / heat), alerts for anything that changes the fight
  (crits, destroyed locations, ammo explosions, pilot hits, PSRs / Control Rolls merged into
  one line per unit, infantry knocked off, "no GM online"), damage by location on the target
  (before → after, largest first), then one collapsed line per weapon ("12 of 20 missiles ·
  12 → RT 5, LA 5, RL 2") that opens to its own modifiers, dice, cluster roll and hit
  locations; the footer lists ammo left. Physical, anti-'Mech and swarm-damage attacks use
  the same card (single attack: HIT / MISS tally; charge / DFA show the attacker's own damage
  too). Roll cards (`tw-psr.hbs` — PSRs, falls, skids, crashes, Control Rolls, consciousness,
  swarm removal …) lead with the verdict, alerts and damage table, with each roll and the hit
  details collapsible. The heat card leads with new heat / change / fire modifier and the
  effect chips, alerts for shutdown / restart / ammo / pilot / PSR, and folds the heat
  breakdown and avoid rolls away. Damage fragments carry `locChanges` for the tables.
- **Turn phases:** combat-tracker phase bar (Initiative→Movement→Weapon→Physical→Heat→End).
- **Area effects:** Scene-Region blast tool (v14) applying damage to enclosed units.
- **GM relay** (`module/helpers/gm-relay.mjs`): a player's attack on a unit they don't own
  is applied by the active GM's client over the system socket. The GM client re-validates
  each request (damage fields only per unit type; characters/NPCs may only be set
  unconscious; crew damage by table key only). Needs a GM logged in; the GM can turn it off
  with the "Relay Player Combat Damage Through GM" world setting, in which case the card says
  to apply it manually.
- **Fired weapons:** firing records the weapon for the current combat round (blocks a second
  shot that round), spends one shot of ammo if the weapon has an ammo type, and the heat
  phase defaults to the heat of weapons actually fired. Destroyed (crit slot or the row's
  toggle) and out-of-ammo weapons can't fire; sheets badge FIRED / NO AMMO / DESTROYED.
- **Map scale** (`module/helpers/tw-scale.mjs`): scenes are gridless / metric (system
  default 1 unit = 1 m, shared with character-scale play). Unit-scale distances convert to
  hexes of **30 m** (ground) or **500 m** (aerospace vs aerospace on the low-altitude map);
  any part of a hex counts (91 m = 4 hexes, with ~1.5 m slack), and under 15 m is the same
  hex. Scenes in km / ft convert through metres; a scene whose units are "hex" is read as
  hexes. Area-attack radii are in 30 m hexes.
- **Movement & Attack Modifiers** (`module/helpers/tw-movement.mjs`, TW pp. 117–118): metres
  moved accumulate per turn from token moves during combat and convert to hexes (typing
  hexes on the sheet replaces them); the mode (stationary / walked /
  ran / jumped) is inferred from Walk/Cruise MP unless set on the sheet's "This turn" row
  (jumping must be set). The attack dialog pre-fills attacker and target movement, prone,
  immobile (shutdown / unconscious pilot), battle-armor target, sensor hits and arm-actuator
  damage for arm-mounted weapons; minimum range and prone-target range effects apply from the
  entered range; woods, partial cover and secondary targets are dialog inputs. Every
  pre-filled value is editable.
- **Warrior damage & consciousness** (`tw-psr.mjs`): every head hit is 1 warrior hit, an ammo
  explosion 2, overheating with damaged life support 1 (15+) or 2 (25+), a failed fall roll 1.
  Each hit advances the pilot's hit ladder; a sheet-only pilot rolls the Warrior Consciousness
  Table (3/5/7/10/11, 6 = dead) and wakes on a roll at a later End Phase (automatic when the GM
  advances to End). A linked character takes the AToW crew damage instead and uses its own AToW
  consciousness. An unconscious warrior makes the unit an immobile target and auto-fails PSRs;
  an unconscious fighter pilot sets Out of Control.
- **Piloting Skill Rolls & falls** (`tw-psr.mjs`, `tw-falls.mjs`, TW p. 60, pp. 68–69): damage
  queues PSRs on the target (20+ damage in a phase, gyro hit, hip / leg / foot actuators; gyro or
  leg destroyed = automatic fall; reactor shutdown +3 in the heat phase). Standing damage
  modifiers come from the current state (leg destroyed +5, hip +2, actuators +1 each, gyro +3),
  and +1 applies to every PSR in a phase with 20+ damage. The unit's sheet shows the pending
  rolls with a Roll PSR button; the first failure falls: ⌈tons/10⌉ × (levels + 1) damage in
  5-point groups on the Facing After Fall column, token rotated, prone, then the warrior roll
  (+1 per level above 1, destroyed gyro +6; automatic if unconscious, immobile or over 12).
  Stand (PSR, +1 heat per attempt) and a manual Fall… (levels) are on the sheet. The heat phase
  now rolls the shutdown avoid roll from 14+.
- **Physical attacks** (`tw-physical.mjs`, TW pp. 144–151): the mech sheet's Physical button
  (vehicles: Charge) covers punch, kick, club, push, the Physical Weapon Attacks Table, charge and
  death from above. To-hit = Piloting + the Physical Attack Modifiers value + movement / target /
  terrain modifiers (no heat or sensors; no terrain for DFA) + actuator damage (arm +2 each and
  half punch damage, hand +1, leg +2 and half kick damage, foot +1, shoulder +2 to push) +
  relative Piloting for charge / DFA. Blocks: shoulder / hand / hip hits, destroyed limbs, arms
  whose weapons fired, weapons fired before a charge / DFA, a jump before a charge (DFA needs
  one), one physical attack per turn (two punches may combine), no punching / clubbing vehicles
  or infantry, 'Mechs can't charge vehicles, only 'Mechs are pushed. Damage: punch ⌈t/10⌉, kick
  and club ⌈t/5⌉, charge ⌈t/10 × hexes⌉ (attacker takes ⌈target t/10⌉), DFA ⌈t/10 × 3⌉ on the
  Punch table (attacker ⌈t/5⌉ on the Kick table); charges force a motive roll on vehicles.
  PSRs: kicked 0, missed kick 0, pushed 0, charged +2 / charging +2, DFA target +2 / attacker +4;
  a missed DFA is a 2-level fall on the rear. Displacement (pushes, charges, DFAs) is noted on
  the card for the players to move tokens. Level differences come from the map's terrain
  regions (see Map terrain). Arcs ('Mechs, from the tokens' facing; MegaMek attack actions):
  punches and one-arm physical weapons reach that arm's arc (left 240–60°, right 300–120°),
  clubs and forward-only weapons (pile driver, wrecking ball) the forward arc — all from the
  torso, so a twist turns them; kicks the forward arc of the legs; pushes only the hex straight
  ahead of the feet (±30°); charges and death from above have no arc. The dialog lists the
  attacks that can't reach and pre-selects the attack direction from the target's facing; an
  out-of-arc attack is refused unless "Ignore arc" is ticked (noted on the card). Not modelled: TSM, the wrecking ball's self-hit on a 2, the spot
  welder's +2 heat.
- **Initiative** (A Time of War): 2D6, highest acts first, ties to the higher RFL; Combat Sense
  rolls 3D6 keeping the highest two. Combat units roll with their linked pilot / crew
  character's traits and break ties on that character's RFL (`MechFoundryCombatant`).
- **Cluster grouping:** a cluster weapon's damage lands in 5-point groups (LRM, MRM, ATM) or one
  location per missile / pellet (SRM, Streak SRM, LB-X); set per weapon (auto guesses from the name).
- **Ammunition explosions:** weapon and ammo crit slots link to a weapon on the Crits tab. A struck
  bin explodes for shots in the bin (Shots/Ton, capped at what's left) × damage per shot (a full
  salvo for cluster weapons), straight into that location's internal structure and transferring
  to the next location's internal structure; a CASE slot in the location vents the rest. Explosion damage can cause further crits;
  the warrior takes 2 per explosion. The heat phase rolls the 19+ avoid roll (4+/6+/8+) and blows
  the most damaging bin on a failure.
- **Restart:** a shut-down 'Mech restarts automatically below 14 heat, otherwise on a roll against
  the shutdown avoid number (not at 30+, with a destroyed engine or an unconscious warrior).
- **Partial cover:** besides +1 to hit, leg hits on a 'Mech in partial cover strike the cover.
- **Weapon fire UI:** with a token targeted, each weapon row's attack button shows its target
  number (hover for the chance and the modifiers; OOR buttons are disabled; terrain isn't known
  there). The Fire… button opens one declaration for several weapons: shared modifiers and
  terrain once, a checklist with each weapon's live target number and the heat of the checked
  weapons, then every checked weapon rolls and resolves in turn into one chat message.
- **Token status icons** (`tw-status.mjs`): Prone, Shut Down, Warrior Unconscious, Immobile, Out
  of Control and PSR Pending are mirrored onto unit tokens from the unit's data (and a linked
  character's unconsciousness) by whichever client made the change.
- **Chat-card actions** (`tw-chat.mjs`; recorder in `gm-relay.mjs`): every combat flow records
  the prior value of each field it writes. Cards then offer **Roll PSR** (to owners of units left
  with a pending roll), **Apply damage** (GM; writes that couldn't be made because no GM was
  online) and **Undo** (GM; restores every unit the card changed — AToW damage to linked
  characters is not undone). The system's chat hook now uses v14's `renderChatMessageHTML`.
- **'Mech critical hit effects** (TW pp. 126–128): second sensor hit stops weapons fire; weapons in
  a destroyed location (or an arm whose side torso is gone) can't fire; a side torso's loss takes
  its arm and counts its (XL) engine slots as engine hits; head blown off or center torso destroyed
  by an ammo explosion kills the warrior (linked character: unconscious, as for the cockpit house
  rule); ICE / fuel cell engine hits add no heat but roll 2D6 (+3 / +6) for a 10+ explosion; jump
  jet slots; a multi-slot heat sink is lost once; punch / kick halving rounds down; life support
  1 point at 15+ heat, 2 at 25+ (AToW crew-damage bands, chosen over TW's 26+). Destroyed units get Foundry's defeated (skull) status.
- **Effective MP & movement PSRs:** the mech sheet shows current Walk / Run / Jump after damage
  and heat (hip halves Walk, two hips 0; −1 per leg / foot actuator on a leg without a hip hit;
  destroyed leg: 1 MP, no running; −1 per 5 heat; −1 Jump per jump jet hit) and the movement
  mode is inferred from it. Leaving the Movement Phase queues a PSR for 'Mechs that ran with a
  damaged hip or gyro, or jumped with a damaged gyro, hip, leg or foot actuators.
- **Skidding, sideslipping, crashes** (`tw-skid.mjs`, TW pp. 62–63, 67): the map has no pavement /
  facing data, so these are sheet actions. Skid… (running 'Mech / flanking non-hover vehicle that
  turned on pavement): Piloting / Driving + skid modifier by hexes moved; a failure skids ⌈hexes/2⌉
  and ends movement — a 'Mech falls, then takes half its falling damage per hex skidded on the fall
  column; a vehicle rolls one Motive System Damage result. +1 to the skidder's attacks, +2 against
  it, that turn. Sideslip… (flanking hover / VTOL / WiGE that turned): Driving roll; slips the margin
  of failure (at most hexes entered − 1), added to its movement for the target modifier. Crash…
  (VTOL / WiGE): hexes × tons / 10 in 5-point groups on the struck side; no attacks that turn.
  Motive damage: −1 Cruise per moderate, half Cruise per heavy (cumulative); its +1 / +2 / +3
  Driving modifiers apply once each (max +6).
- **Ground Combat Vehicle critical hit effects** (TW pp. 194–195): results that can't apply (no
  such item in the location, already taken) move down the column, wrapping 12 → 6. Driver Hit +2
  Driving; Commander Hit stuns and gives +1 to-hit and Driving; repeats become Crew Stunned
  (no firing the following turn, repeats extend; after both driver and commander hits it's Crew
  Killed). Crew Killed: intact but immobile and out (VTOL / WiGE destroyed). Sensors +1 each, the
  4th stops fire. Stabilizer doubles the attacker movement modifier for weapons in that location.
  Turret Jam (clear with a Weapon Attack Phase; a 2nd jam locks), Turret Locks, Turret Blown Off
  (destroyed). Engine Hit: immobile, turret locked, direct-fire energy weapons dead. Fuel Tank (ICE)
  destroys. Ammunition: all ammo explodes into internal structure, or with CASE into the rear armor
  plus Crew Stunned. Weapon Malfunction (random weapon in the location; clear with a Weapon Attack
  Phase) and Weapon Destroyed (1D6: 1–3 target's player chooses, 4–6 attacker's). Weapons are
  matched to locations by their Loc text (Front / Left / Right / Rear / Turret). VTOL Pilot /
  Co-Pilot hits use Driver / Commander effects.
- **VTOL critical hits** (TW p. 197): Co-Pilot Hit +1 to hit (2nd = Crew Killed); Pilot Hit +2
  Driving and an immediate Driving roll or drop one elevation (2nd = Crew Killed); Engine Damage:
  landed → immobile, flying → Driving +4 to land (else destroyed); Flight Stabilizer: Cruise only,
  +3 Driving, +1 to hit; Rotor Damage −1 more Cruise; Rotors Destroyed destroys; fusion Fuel Tank →
  Engine Damage. Crash damage reaching internal structure explodes a VTOL. Airborne VTOL targets
  (elevation 1+) are +1. The vehicle sheet shows VTOL elevation and the co-pilot / flight
  stabilizer flags.
- **Aerospace attacks** (`tw-aero.mjs`; TW pp. 235, 237, 243, 77): fighter / small craft vs
  aerospace targets use the Aerospace Weapon Range Table (standard 6/12/20/25, capital 12/24/40/50;
  each weapon's longest bracket and Capital flag on the aero sheet) and the Aerospace Attack
  Modifiers: pilot damage +1/box, FCS +2/box, sensors +1/box (+5 destroyed), exceeded Safe Thrust
  +2, out of control +2, NOE vs air +2 (+1 OmniFighter), target at 0 velocity −2, target evading
  (+3 fighter / +2 small craft; evading fighters can't attack), target made an air-to-ground
  attack −3, angle of attack (nose +1, side +2), capital weapon vs <500 t +5, atmospheric hexes
  +2 each, screen hex +2, secondary target. Above / Below attacks use their own hit-location
  column (a "Wing" result rolls 1D6 for the side). Against ground targets the dialog offers
  strafing (+4, +2 more at NOE), striking (+2) or bombing (+2 + altitude; no terrain or target
  movement modifiers); air-to-ground has no range modifier and flags the attacker −3 to hit that
  turn. Per-turn aero state (evading, air-to-ground, thrust) is the `aeroTurn` actor flag.
- **Control Rolls & aero heat** (`tw-aero-flight.mjs`; TW pp. 93, 161, 249): Avionics / Control
  criticals and any damage in atmosphere (+1 per 20 damage) queue Control Rolls (Piloting + pilot
  damage, avionics, life support, atmosphere +2 / fighter −1, above Safe Thrust +1, +1 per point
  above 2× Safe); a failure puts the unit out of control (random movement next turn via the sheet's
  Random move button, +2 to its attacks) and the GM's End Phase rolls to regain control. The aero
  heat phase (sheet Resolve) sums weapons fired, +2 per engine hit and heat-causing weapons, minus
  sinks (no movement heat), then rolls random movement (5+), shutdown (14+, auto at 30; restarts at
  13 or less or on the avoid roll), ammunition (19+: most damaging per-shot ammo × rounds / 10 to SI,
  / 20 with CASE, min 1; pilot 1) and pilot damage (21+). Random-movement and pilot-damage avoid
  numbers (5/6/7/8/10 and 6/9) are from the aerospace record-sheet heat scale — `AERO_HEAT`.
- **Aero maneuvering & landing** (TW pp. 77, 84–87, 92–93): the aero sheet's Maneuver… declares
  the turn's thrust (velocity changes + facing changes at the Changing Facing Cost Table rate +
  special maneuver cost), new velocity, evasive action, and hazards; it shows the minimum straight
  movement (aero map / ground map), records thrust and evasion for the attack modifiers, and rolls
  the Control Rolls the move requires (special maneuver with its control modifier, more than one
  roll, thrust above SI, velocity over 2× Safe in atmosphere, stalling, 3+ altitudes descended,
  ceiling). Land… rolls a landing Control Roll with the Landing Modifiers (terrain halved for
  vertical landings); a horizontal failure applies the Failed Braking Maneuver Table (6+: 20 damage
  to the nose, gear damaged). Not automated: token movement on the aero map, re-entry, ramming
  damage, capital missiles, large craft.
- **Battle armor** (`tw-infantry.mjs`, sheet `battle-armor-sheet.mjs`; TW pp. 214–219, 228–229):
  one actor is the whole unit (Squad / Point of 1–6; tech base default IS 4, Clan 5, ComStar /
  WoB 6). Each trooper has its own damage track of Armor Value + 1 boxes (the last is the
  soldier); the sheet's boxes are clickable. Details holds armor value, manipulators (left /
  right), stealth (basic / prototype / standard / improved), mimetic, camo, fire-resistant,
  magnetic clamps and body-mounted missiles (jettisoned flag). The squad leader links to a
  character: Gunnery/Battlesuit for Gunnery, Piloting/Battlesuit for the Anti-'Mech Skill.
  *Attacks against battle armor:* +1 for non-infantry attackers; stealth +S/M/L by bracket,
  mimetic +3/+2/+1 and camo +2/+1 by hexes the unit moved; each damage group strikes a random
  live trooper (1D6, re-rolled) and excess is wasted; area-effect damage (the Area Attack tool)
  hits every trooper. The unit is destroyed (skull status) when every trooper is.
  *Battle armor attacks:* infantry never add attacker movement; secondary targets are only +1;
  attacks into their own hex are range 1 (anti-personnel weapons use the Rifle, Ballistic range
  row from 0). All troopers fire each weapon together: non-missile weapons roll the Cluster Hits
  Table for live troopers (one trooper always hits), missiles for troopers × launcher size over
  the fewest columns (54 → 27 + 27), AP weapons turn troopers hitting into damage on the Rifle,
  Ballistic column (2-point groups, one AP attack per turn). Every hit rolls its own location;
  only missile launchers spend ammunition.
- **Anti-'Mech attacks** (`tw-antimech.mjs`; TW pp. 220–223): the battle armor sheet's
  Anti-'Mech… button (target a unit in the same hex) makes a leg or swarm attack instead of weapon
  attacks. To-hit = Anti-'Mech Skill + Leg / Swarm Attacks Table (by active troopers) + target
  movement, terrain, 'Mech prone −2, immobile −4, (swarm) vehicle −2, magnetic claws −1 and the
  Swarm Attack Modifiers Table when the target carries friendly mechanized battle armor.
  Eligibility: humanoid PA(L) / light / medium suits with two basic manipulators, a battle claw
  (vibro- and magnetic claws count) or — light / PA(L) — two armored gloves; body-mounted missile
  launchers jettisoned; mechanized platoons can't. Leg attack: 4 damage (+1 / +2 vibro-claws) on
  the front Kick Location column plus an automatic Determining Critical Hits roll; one per 'Mech
  per turn. Swarm: attaches the unit (`system.attached`, mode `swarm`; landed VTOL / WiGE /
  aerospace only; one swarmer per unit, one attempt per turn). From the next turn its sheet's Swarm
  Damage is an automatic hit: arm-mounted non-missile weapons × troopers (+ vibro-claws) in one
  group on the Swarm Attacks Hit Location Table with an automatic crit roll ('Mech), or a random
  side column (vehicle / grounded aerospace: 1D6 1–2 front, 3 left, 4 right, 5–6 rear); Release
  ends it. Swarmers can't be targeted and may only shoot battle armor riding the unit they swarm.
  Hits on a swarmed 'Mech's torso (any location of a vehicle) strike the swarmers on 1D6 5–6: a
  random trooper absorbs up to its capacity and the rest carries on. The swarmed unit's sheet
  lists the swarmers and offers: Pull off… ('Mech, Physical Attack Phase: Piloting +4 per arm plus
  punch modifiers, +1 vs magnetic claws; success throws them off with the punch as infantry damage,
  failure punches the 'Mech itself), Shake off (jump) (+4; 1 damage per Jump MP to every trooper),
  Drop prone (Piloting; success throws them off and the 'Mech takes an accidental fall), Erratic
  maneuvers (vehicle: Driving +4, +2 with VTOL MP; 1 damage each, or per elevation for VTOL /
  WiGE) and Take off (aerospace: 4D6). Any 'Mech fall throws swarming and riding infantry off
  (2D6 each, as from an infantry attack). Self-inflicted damage (falls, skids, charges) never
  strikes the attached infantry.
- **Mechanized battle armor** (TW p. 227): Mount… on the battle armor sheet (target a friendly
  'Mech or vehicle in the same hex) attaches it (mode `ride`). Needs a humanoid suit up to heavy
  with a basic manipulator or battle claw (light / PA(L): or two armored gloves), an Omni carrier
  (the mech / vehicle Details "OmniMech / OmniVehicle" flag) or magnetic clamps, one battle armor
  unit per carrier, and no VTOL / WiGE / UMU carriers. A swarmed carrier is mounted only with a
  swarm-style roll using the negated Swarm Attack Modifiers Table value; those riders (and the
  swarmers) may shoot each other ignoring target movement and terrain. Troopers ride per the
  Battle Armor Transport Position Table (#1 RT / right, #2 LT / right, #3 RT rear / left, #4 LT
  rear / left, #5 CT rear / rear, #6 CT / rear). Weapons in a 'Mech torso location or vehicle
  side with a live rider can't fire (turrets can); a non-Omni carrier loses 1 Walking / Cruising
  MP. Hits in a location with riders (front / rear for torsos) roll 1D6 per trooper there: 5–6
  and that trooper absorbs damage up to its capacity first. A destroyed torso kills its riders; a
  destroyed carrier's riders survive on 1D6 1–2 (swarmers drop off; from a VTOL / WiGE with 1
  damage per elevation). Falls throw riders off (2D6); Building hex… on the carrier rolls the
  building check (1–3: 1D6 and hold on; 4–6 or accidental: fall off with 2D6). Riders can't be
  targeted or fire; Dismount returns them to the hex.
- **Conventional infantry** (`infantry` actor, `infantry-sheet.mjs`; TW pp. 213–217): one actor
  is a platoon — tech base, platoon type (foot / motorized / jump / mechanized + hover / wheeled /
  tracked), weapon type (rifle ballistic / energy, machine gun, SRM, LRM, flamer), troopers
  (current / max) and Ground / Jump MP; "Generic platoon" fills troopers and MP from the Generic
  Conventional Infantry Units Table. Gunnery links to a character's Small Arms (7/SB); the
  Anti-'Mech Skill is entered. Token bar: troopers. *Its attack* (the sheet's Attack button, one
  attack per turn) uses the Conventional Infantry Range Modifier Table by weapon type (range 0–9),
  no attacker movement, no stealth-armor modifiers; on a hit the Cluster Hits Table for its active
  troopers (one trooper always hits) gives troopers hitting → Generic Conventional Infantry Damage
  Table → 2-point groups (all at once against another platoon; machine gun platoons +1D6 against
  infantry). A 0-MP platoon that moved can't attack. *Attacks against platoons*: non-infantry
  weapons eliminate troopers per the Non-Infantry Weapon Damage Against Infantry Table (DV / 10
  direct fire and physical, / 10 + 1 cluster ballistic, / 10 + 2 pulse, / 5 cluster missile — full
  cluster damage, no Cluster Hits roll — area effect / 0.5), doubled against mechanized platoons;
  burst-fire weapons roll the Burst-Fire table dice (battle armor per hit, on its own subtable);
  infantry damage (platoons, battle armor AP weapons, punches pulling swarmers off) removes a
  trooper per point, mechanized troopers taking two points (a one-point wound is carried). A
  platoon standing in the open (no woods / partial cover in the dialog) takes double. Battle armor
  non-missile hits count separately; its missile volleys use the full volley. Weapons carry an
  optional "vs Inf" row override (auto guesses from the name: MG / flamer / small pulse = burst,
  pulse, LB-X / Ultra / Rotary = cluster ballistic, launchers = cluster missile). Platoons make leg
  and swarm attacks with their own table columns (mechanized platoons can't); their swarm damage
  is their standard damage in 2-point groups with no automatic crit, and a hit that strikes a
  swarming platoon is taken whole. Can't be punched, clubbed or charged; kicks / DFAs +3.
- **Record-sheet importer** (`megamek-import.mjs`, UI `megamek-import-ui.mjs`): the Actors sidebar's
  "Import MegaMek Units" button reads MegaMek `.mtf` ('Mechs) and `.blk` files (combat vehicles and
  VTOLs, aerospace and conventional fighters, small craft, battle armor, conventional infantry) —
  several files at once, or pasted text — creates one actor per unit (optionally into a folder)
  and whispers the import notes to the user. Weapon statistics come from a catalog generated from
  MegaMek's equipment definitions (`module/data/tw-equipment.mjs`, regenerated with
  `tools/extract-megamek-equipment.py`; about 600 weapons and 400 ammunition types, matched by
  MegaMek's display, internal and lookup names — a shared name picks the battle armor / Clan /
  IS version that fits the unit). 'Mechs: armor from the file, internal structure from the
  Internal Structure Table, crit slots mapped onto the slot model (engine, gyro, sensors, life
  support, cockpit, actuators, heat sinks — each multi-slot double sink named separately — jump
  jets, CASE, ammunition, weapons; Endo Steel / Ferro-Fibrous slots as named empties), weapons
  built from their slot runs (rear mounts, weapons split across two locations), ammunition bins
  pooled per weapon type and linked to the weapon they feed (for explosions). Vehicles: facing
  armor (front / right / left / rear / turret or rotor), structure ⌈t/10⌉ for the single pool.
  Fighters / small craft: thrust (max = ⌈safe × 1.5⌉), SI (file value, else the higher of ⌊t/10⌋
  and Safe Thrust), thresholds ⌈armor/10⌉, heat sinks, fuel, each weapon's aerospace range
  bracket. Battle armor: troopers, armor value, weight class, chassis, movement, manipulators,
  stealth / mimetic / fire-resistant armor, magnetic clamps, weapons (arm / body / turret, AP
  mount → one AP weapon, missile shots) and IS body-mounted launchers. Infantry: troopers (squads
  × squad size), platoon type, the generic weapon type from the secondary (else primary) weapon,
  MP from the generic table. Weapons also carry their burst-fire dice against infantry and a
  Streak flag (Streak launchers now hit with every missile). Equipment without automated effects
  (Artemis, ECM, MASC, C3, targeting computers, physical weapons, …) is listed in the notes.
**Intentional house rules** (deliberate divergences — don't "correct" toward the book):
- Combat vehicles roll a critical on any hit that penetrates to internal structure, in
  addition to the tables' marked results (2/12, or 8 on side attacks).
- A mech cockpit critical knocks a *linked* pilot character unconscious rather than killing
  them (an unlinked sheet-only pilot is still marked killed); the mech is out of action.

Sources verified from Total Warfare (hit-location pp.193–237, cluster p.117, crits p.124,
heat p.159) and the AToW conversion.
