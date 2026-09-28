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
Sources verified from Total Warfare (hit-location pp.193–237, cluster p.117, crits p.124,
heat p.159) and the AToW conversion.
