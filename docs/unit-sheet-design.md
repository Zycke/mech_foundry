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

## Rollout (reviewable commits)
1. Mech data model + sheet.  2. Token-bar derived totals + prototype config.  3. Ground-vehicle
sheet.  4. Aerospace sheet.  5. Company integration polish (status derivation, ammo alignment).
6. Combat automation (its own multi-commit effort).
