# Unit Actor Sheet Design — Mech / Ground Vehicle / Aerospace Fighter

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
- **Heat phase:** mech "Resolve" nets Heat Point Table gains vs. sink dissipation.
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
- **Movement & Attack Modifiers** (`module/helpers/tw-movement.mjs`, TW pp. 117–118): hexes
  moved accumulate per turn from token moves during combat; the mode (stationary / walked /
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
  the card for the players to move tokens. Not modelled: level differences, TSM, the wrecking
  ball's self-hit on a 2, the spot welder's +2 heat.
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
  1 point at 15–25 heat, 2 at 26+. Destroyed units get Foundry's defeated (skull) status.
- **Effective MP & movement PSRs:** the mech sheet shows current Walk / Run / Jump after damage
  and heat (hip halves Walk, two hips 0; −1 per leg / foot actuator on a leg without a hip hit;
  destroyed leg: 1 MP, no running; −1 per 5 heat; −1 Jump per jump jet hit) and the movement
  mode is inferred from it. Leaving the Movement Phase queues a PSR for 'Mechs that ran with a
  damaged hip or gyro, or jumped with a damaged gyro, hip, leg or foot actuators.
**Intentional house rules** (deliberate divergences — don't "correct" toward the book):
- Combat vehicles roll a critical on any hit that penetrates to internal structure, in
  addition to the tables' marked results (2/12, or 8 on side attacks).
- A mech cockpit critical knocks a *linked* pilot character unconscious rather than killing
  them (an unlinked sheet-only pilot is still marked killed); the mech is out of action.

Sources verified from Total Warfare (hit-location pp.193–237, cluster p.117, crits p.124,
heat p.159) and the AToW conversion.
