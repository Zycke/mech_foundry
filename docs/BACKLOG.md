# mech_foundry — Outstanding Work

Working branch: `claude/foundry-module-github-7klpun`. Current version: see `system.json`.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done (kept for context) · `[?]` needs a decision

---

## 0. Testing gate (BLOCKS most of the rest)

**Nothing below or already-shipped has been runtime-verified on a live Foundry v14
world** — no v14 instance was available during development. Everything passed
`node --check` + JSON validation and is built against authoritative v14 reference
implementations, but must be exercised in-app.

Priority things to test in a real v14 world:
- [ ] System **initializes** without errors (validates the registration hardening).
- [ ] **V2 stub sheets** (Ship, Vehicle) open, render, and save name/image/biography.
- [ ] **AOE / suppression** Scene Regions port: `canvas.regions.placeRegion`, region
      shapes (circle / line), scatter, token detection, chat output.
- [ ] **Opposed melee across two clients**: single-responder selection (no duplicate
      GM prompt), unlinked-token defender uses token actor, Roll survives the socket.
- [ ] **NPC attacks** from the NPC sheet; **NPC armor BAR** shows `M/B/E/X`.
- [ ] Skill/attribute/weapon rolls; **link modifiers** at scores 0, 10, 11+.
- [ ] **Terrain regions**: the "Mech Foundry Terrain" region behaviour appears in a Region's
      behaviours, saves its type / level / depth, colours and names the region; the fire dialog
      reads woods / smoke / water from it (`documentTypes.RegionBehavior` in system.json).

---

## 1. ApplicationV2 sheet migration (sheets done; old dialogs left)

- [x] `MechFoundryActorSheetV2` base + Ship/Vehicle stubs — **tested, loads & works**.
- [x] **Item sheet** → V2 (class + all 14 templates + effects partial) — **tested & working**
      (single-root part fix; combat-tab equipped filter fixed for plain-object items).
- [x] **Company sheet** → V2 + full overhaul (Locations/Logistics/Status/MTOE/Assets/
      Finances; numeric crew+troop pools, per-location departments, MTOE unit boxes,
      structured logistics). Personnel/Organization tabs and the old personnel-item /
      skill-averaging model retired.
- [x] **Character/NPC sheet** → V2 class (`ActorSheetV2`, parts, header controls, drag/drop).
- [ ] Character sheet internals: its ~60 jQuery-style handlers still run through
      `_activateSheetListeners` in `_onRender`; converting them to V2 `actions` is optional
      cleanup (works as is).
- [ ] Move the large **inline-HTML dialogs** (First Aid/Stabilize/Surgery, weapon
      attack, XP) into `templates/dialog/` + `renderTemplate`, and localize.
- [ ] Replace `Dialog` (appv1) with `DialogV2`: 17 in the character sheet (First Aid /
      Stabilize / Surgery, XP, confirmations…) and 1 in `opposed-rolls.mjs` — needed before V1 is
      removed (~v16); every unit-combat dialog already uses DialogV2.

## 2. Design decisions needed (do NOT auto-fix)

- [x] ~~**Company sheet math (H4/B2)**: unit readiness/health averaging is wrong~~ —
      obsolete; the personnel-item averaging model was removed in the company overhaul
      (personnel are now numeric pools, no per-member skill/health averaging).
- [ ] **Logistics auto-population**: Ship/ground ammo needs and per-chassis spare-parts/
      maintenance sums should pull from unit sheets' weapon/equipment data once those
      placeholder unit sheets carry real data models. Currently manual entry.
- [?] **Token bars (M1)**: `system.json` sets `primaryTokenAttribute: "damage"` /
      `secondaryTokenAttribute: "fatigue"`, but `company` and the unit actor types
      (`naval_ship` / `mech` / `ground_vehicle` / `aerospace_fighter` / `battle_armor` /
      `installation`) lack those fields → empty bars. Decide what (if anything) those
      bars should show.

## 3. Intentional divergences (leave as-is)

- [x] **Wound system is deliberate homebrew** — confirmed intentional. Do NOT align it
      to the rulebook's Specific Wound Effects table. (Also noted in CLAUDE.md.)

## 4. Localization (partial)

- [x] Special-roll labels (Fumble/Stunning/Miraculous) + damage-type names.
- [ ] Full i18n pass: inline chat HTML in `actor.mjs`, all dialog strings, company
      sheet, wound names/descriptions, `ui.notifications`, effects helper. Large —
      best paired with the template-extraction / V2 work.

## 5. Cleanups / improvements (from the review; quality, not bugs)

- [ ] **Template partials**: the character Inventory tab repeats ~8 near-identical
      category tables; the Biography tab repeats the life-stage block 5×.
- [ ] Consolidate the two item-create paths (`_onItemCreate` vs `_onAddInventoryItem`).
- [ ] Handlebars helpers: register all logical helpers (`and`/`or`/`not`) or rely on
      core consistently (currently half-and-half).
- [ ] `MECHFOUNDRY` config: exposed as `game.mechfoundry.config` but some sheets may
      expect `CONFIG.MECHFOUNDRY`; remove/def dead maps (`targetNumbers`, `weaponTypes`,
      and the cover/size/range modifier maps that are re-declared inline instead).
- [ ] DRY the duplicate XP→level cost table still in `opposed-rolls._getSkillLevel`
      (already XP-based, so not a bug — cleanup only).
- [ ] Move remaining inline chat HTML (`rollAttribute`, `rollConsciousness`,
      `_checkKnockdown`, `_checkBleedingFromDamage`) into `.hbs` partials.
- [ ] Accessibility: `role="button"` / keyboard handlers / `aria-label`s on clickable
      `<span>`/`<a>` controls; the XP dialog re-renders redundantly.

## 6. Character creation system (see docs/CHARACTER_CREATION_PLAN.md)

Milestones M1–M5 shipped (engine, lifeModule compendium, wizard shell, stage/flex
steps, commit path). Needs runtime testing on a live v14 world (per §0).

- [x] **M1–M5** — engine + XP math, `lifeModule` type + seeded compendium, ApplicationV2
      wizard (Concept→Affiliation→Phenotype→Stages 1–4→Flexible→Review), commit path
      (`grantCharacter`) that writes attributes/XP and creates skill/trait items + sheet
      summary.
- [?] **M6 — Point-Buy quick path** — **DEFERRED / may not be needed.** Free-form spend of
      the XP pool as an alternative to Life Modules. Engine already has `spendPool`; would
      add a single-screen step. Revisit only if wanted.
- [x] **M7 — Validation & quality polish** (complete apart from the deferred aging pass;
      needs live-world testing):
    - [x] **Affiliation legality**: `restrictedToAffiliations` honoured — `isModuleLegal`,
          a validation error, and a "Restricted" badge on illegal stage cards.
    - [x] **Stage rules**: Next is gated until affiliation / Stage 1 / Stage 2 are chosen
          and all flexible XP is assigned; >2 Stage-3 modules warns.
    - [x] **Leftover-pool spend**: a "Spend XP" step — attribute steppers (100/pt, capped by
          phenotype) and skill XP rows, funded from the remaining pool.
    - [x] **Prerequisites**: live met/unmet badges on module cards; trait prereqs now use
          real Trait Points (each TP = 100 XP); `Exceptional Attribute/<ATTR>` raises that
          attribute's cap by 1 in derive.
    - [x] **Languages**: `system.languages` populated from `Language/*` skills on commit.
    - [x] **Subskills**: `/Affiliation` grants auto-resolve to the affiliation; `/Any` grants
          are queued and the player chooses the subskill via a dropdown of the root skill's
          canonical subskills (with an "Other…" free-text fallback; open skills use plain
          text). Subskills live on each skill Item (`system.subskills`), so GM-editable.
    - [x] **Skills/Traits editability**: promoted to editable `mech-foundry.skills` /
          `mech-foundry.traits` compendia (seeded from the master lists); the runtime config
          lists are rebuilt FROM the compendia at ready, so GM edits flow to the wizard
          without breaking dropdowns/tooltips/grant. `game.mechfoundry.reseedReferences()`.
    - [x] **Starting C-Bills / gear**: Wealth Trait sets `system.cbills` (TP table, default
          1,000); Equipped Trait yields the max equipment rating (D/B/B…) shown in Review and
          the sheet summary. Gear itself is bought via the existing inventory (compatible with
          the equipment item schema — no changes needed).
    - [?] Aging effects (book pp.332–333) as an optional post-creation pass — **DEFERRED**
          (not needed for now; revisit on request).
- [x] **Sub-affiliations**: affiliation lifeModules carry a `subAffiliations` array (each with
      its own attributes/skills/traits/flexible XP) + `primaryLanguage`/`secondaryLanguages`.
      The wizard offers an optional sub-affiliation picker (cards showing grants) that stacks
      on the main affiliation; Language subskill dropdowns prefer the affiliation's languages.
- [x] **Lump flexible XP**: pools can be `{lump:true, amount}` (distribute a total freely) in
      addition to count-based `{amount,count}`; the wizard renders a distribution UI
      (target + XP-amount rows with a running total) and gates/ validates on full allocation.
- [ ] **M8 (data track)** — transcribe the full A Time of War module/affiliation catalogue
      against the schema. **Done so far:** Capellan Confederation (accurate main + all 5
      Commonality sub-affiliations); **all 11 Stage 1 (Early Childhood) and all 12 Stage 2
      (Late Childhood) modules** (Clan branch/caste modules carry base data + notes for the
      conditional branch XP). Remaining: the other Great Houses, Periphery, Clans, and the
      Stage 3 (Higher Education) & Stage 4 (Real Life) module catalogues (still labelled
      examples).

---

## 7. Combat automation (Total Warfare) — open questions & not-automated systems

Rules detail for what *is* automated lives in `docs/unit-sheet-design.md`.

### 7a. Open rules questions (answers pending — the user is looking them up)

- [?] **Aerospace heat-scale avoid numbers** — not in the pages supplied; taken from the
      standard Aerospace Fighter record-sheet heat scale. One table in code
      (`AERO_HEAT` in `module/helpers/tw-aero-flight.mjs`):
      - Random movement avoid: 5+ at 5 heat, 6+ at 10, 7+ at 15, 8+ at 20, 10+ at 25.
      - Pilot damage avoid: 6+ at 21 heat, 9+ at 27.
- [?] **Ambiguous table readings** (current interpretation in parentheses):
      - Control Roll Table "Above 2× Safe Thrust: +1 per velocity point above 2× Safe
        Thrust" (uses the *thrust spent this turn*, not velocity).
      - Atmospheric Control Modifiers "+1 per 20 points of damage" (counts *each attack's*
        damage separately, not the turn's total).
      - Linked pilot's aero heat damage (uses the AToW crew-damage table's *pilot-hit* row,
        1B/3).
      - Minor: Straight Movement Table has no small-craft column (small craft use the
        *aerodyne DropShip* column); Landing terrain modifiers "halved" for vertical
        landings (rounded *toward zero*).
- [?] **Battle armor readings** (current interpretation in parentheses):
      - TW's Golem example says 25 missiles on a roll of 7 give 14 hits; the Cluster Hits
        Table supplied gives 16 (*the table is used*).
      - "Determine a hit location separately for each missile hit" (every battle armor
        missile hit — LRMs included — rolls its own location; a weapon can be set to 5-point
        groups instead).
      - Anti-'Mech Skill for a linked character (*Piloting/Battlesuit*); battle armor Gunnery
        uses Gunnery/Battlesuit.
      - Vibro-claws and magnetic claws count as battle claws for anti-'Mech eligibility (TW
        lists their anti-'Mech effects but only names basic manipulators, battle claws and
        armored gloves as enabling the attacks).
      - Swarm damage to a vehicle: no automatic critical roll (the "roll once on the
        Determining Critical Hits Table" text is for 'Mechs); the vehicle's own crit rules
        apply. Random side column: 1D6 1–2 front, 3 left, 4 right, 5–6 rear.
      - A conventional platoon hit while swarming takes the whole damage group (battle armor:
        one trooper absorbs up to its capacity, the rest goes to the unit).
- [?] **Conventional infantry readings** (current interpretation in parentheses):
      - "Clear terrain" doubling (applies when the fire dialog has the target in the open with no
        partial cover).
      - Battle armor non-missile weapons against a platoon (each trooper's hit is a separate
        Non-Infantry-table hit at the weapon's damage); burst-fire weapons not on either subtable
        (2D6).
      - Anti-'Mech Skill for a linked character (not derived — entered on the sheet); platoon
        Gunnery from Small Arms.
- [?] **Cluster weapons against aerospace units** — damage is grouped as on the ground
      (5-point groups for LRM / MRM / ATM, per missile / pellet for SRM / LB-X). Confirm
      whether fighters and small craft should take cluster damage differently.

### 7b. Not automated (candidates to automate later)

**Map / movement**
- [x] Elevation and level differences (physical attacks by level, LOS, falls into lower
      hexes when displaced) — from the map's terrain regions.
- [x] Facing (auto-facing, Q/E, torso twist), facing MP costs, firing arcs, attack direction
      from facing, physical-attack arcs (punch / kick / club / push). Deferred (by decision):
      quad 'Mechs, mule kicks. Open: lateral shifts, rear-facing arm flips, turret facing for locked turrets (assumed forward),
      facing costs for aerospace (thrust, via the Maneuver helper today).
- [ ] Token displacement: pushes, charges, death from above, skids, sideslips (chat card
      tells players what to move).
- [x] Movement warnings (over MP), Movement-Phase-only token moves for players, GM phase
      checklist, End Phase round summary; facing changes count against MP. Open: movement order
      by initiative isn't enforced.
- [~] Terrain from the map (Scene Region "Mech Foundry Terrain" behaviour). Done: terrain
      lookup, woods / smoke between and target terrain, woods / smoke line of sight, water cover
      and submerged units, infantry in the open, sheet to-hit preview; movement terrain and
      level-change MP along the token path, prohibited-terrain warnings, rubble / water PSRs,
      skid reminders on pavement / ice; levels and height-based line of sight (hills, building
      height, woods / smoke only where tall enough), partial cover from terrain, physical attacks
      across levels, falls when displaced 2+ levels down; buildings (class / CF, entry MP, wall
      rolls and damage both ways, absorption for units inside, collapse). Not modelled: swamp
      bog-down, road bonus MP for vehicles, careful vs. fast ice movement, TacOps diagrammed line
      of sight, level-based falls outside displacement (e.g. skids off a ledge), charges /
      death from above / pushes into buildings (and units displaced into one), floors /
      basements / overload collapse, per-hex CF within one building region, fire.
- [x] Buildings: movement, damage absorption, collapse, building PSRs — from the map's terrain
      regions (see the terrain item for what's not modelled).
- [ ] Water / underwater, hull down, life support while submerged; hover vehicles sinking
      when immobilized over water.
- [ ] Motive-damage timing (TW applies it at the end of the phase; applied immediately).
- [ ] Crew Stunned "no faster than Cruising" and Flight Stabilizer "Cruising only" (noted,
      not enforced).

**Weapons & equipment**
- [x] Weapon to-hit modifiers (pulse −2, Clan ER pulse −1, heavy lasers +1 …) from the
      catalog; Streak (all missiles hit).
- [x] Ultra / Rotary AC rate of fire and jams (+ RAC unjam), LB-X slug / cluster, Artemis IV / V,
      Narc pods and Narc-capable missiles, AMS, flamer heat mode, TAG, Streak no-fire on a miss,
      one-shot weapons, to-hit override on the weapon table.
- [?] Rules choices to confirm: Narc pods help any attacker (no team tracking); AMS engages
      regardless of arc; TAG only marks the target (no semi-guided / homing munitions yet);
      ECM / stealth don't cancel Artemis / Narc bonuses (no ECM modelled).
- [ ] Special munitions (inferno, semi-guided, swarm, thunder, precision / armor-piercing AC
      ammo) and their to-hit / damage effects; separate ammo bins per munition.
- [ ] Removing Narc pods by physical action / when the location is destroyed; iNarc pod types
      (ECM, haywire, nemesis, homing).
- [ ] Explosive components (Gauss rifles) and vehicle "Weapon Destroyed" explosions.
- [ ] Indirect fire / artillery / spotting; C3, ECM.
- [ ] Aimed shots against immobile targets.
- [ ] MASC, superchargers, TSM.
- [ ] Ammo bins in crit slots vs. the weapon's pooled ammo count (bin size from Shots/Ton).

**'Mechs**
- [ ] Four-legged 'Mechs (deferred by decision); IndustrialMechs; small cockpits (+1 PSR); heavy-duty gyros;
      fission-engine radiation.
- [ ] Physical-attack restrictions while prone; wrecking ball self-hit on a 2; spot welder
      +2 heat.

**Vehicles**
- [ ] Cargo / Infantry Hit (card note only).
- [ ] Physical attacks against flying VTOLs (table not supplied).

**Aerospace**
- [ ] Aero token movement on the map (velocity, facing, straight-movement enforcement);
      the high-altitude map; re-entry.
- [ ] Ramming damage (to-hit table supplied, damage not).
- [ ] Strafing every hex along a flight path (one target per shot today).
- [ ] Stalling / altitude loss in atmosphere; shutdown drift in space; failed vertical
      landing crashes.
- [ ] Capital missiles; large craft (DropShips / WarShips: arc heat, bays); conventional
      fighters; VSTOL gating for VIFF / vertical landings.

**Other units & setup**
- [ ] Conventional infantry details: heat-effect weapons (infernos) and flamer heat, heavy-burst /
      point-blank / anti-aircraft / non-penetrating platoon features (TechManual), field guns,
      burst-fire against infantry in buildings, mechanized platoon movement types and prohibited
      terrain, battle armor vibro-claw melee against infantry, custom (non-generic) platoons.
- [ ] Infantry carriers: cargo bays, mounting / dismounting, the Infantry Destroyed if Carrying
      Unit Destroyed Table, Cargo / Infantry Hit crits, damage from the carrier's movement.
- [ ] Mechanized battle armor details: MP / timing limits on mounting (all MP spent, not the
      carrier's last MP), riders not counting for initiative or stacking, weapons spanning several
      locations, ammo dumping, trailers / Large Support Vehicles (two units), moving rider tokens
      with the carrier, carrier destroyed in prohibited terrain.
- [ ] Anti-'Mech details: four-legged 'Mech swarm location column, IndustrialMech −1 (use Other),
      aimed shots on immobile targets, arms mounting physical weapons (the Pull off… dialog
      leaves that to the player), water (swarmers without UMU drowned), stacking / domino
      effects, moving the swarmer's token with the 'Mech, TAG + anti-'Mech in one turn.
- [ ] Battle armor: bomb racks, pop-up mines, Narc, squad support weapons, inferno
      self-detonation, torpedoes / multi-purpose missiles, UMU / VTOL movement rules,
      jettisoning launchers as an action.
- [ ] Importer follow-ups: equipment effects the importer only lists (Artemis IV/V cluster
      bonus, MASC / TSM / superchargers, targeting computers, ECM / probes, C3, A-Pods, PPC
      capacitors), physical weapons (hatchets, swords) into the physical-attack dialog, quad /
      tripod / LAM 'Mechs, superheavy and dual-turret vehicles, support vehicle BAR, DropShips and
      larger craft, field guns and custom infantry weapons, variable-damage weapons (Heavy Gauss,
      VSP, Snub-nose PPC import with 0 damage), one-shot launchers, per-bin ammunition (bins are
      pooled per weapon), per-location vehicle structure, re-importing over an existing actor, a
      compendium of common designs.
- [ ] Damage log / struck-location highlight on the unit sheets.

---

## Done this engagement (for reference)

- v14 compat: namespaced APIs (`renderTemplate`, `measurePath`, chat `rolls`), AOE →
  Scene Regions, sheet registration + V1 base classes hardened.
- Critical bugs C1–C7 (initiative ×2, socket ×3, NPC attacks, AOE cancel).
- Data-model: skill level unified on XP (H1), equipped unified on `carryStatus` (H2),
  link-modifier table fixed to the rulebook (H5).
- Correctness: melee STR `.total` (M3), vision `basic` priority (H8), stunning-success
  cap, null guards (M4); verified M2 (no double armor damage) and R2/R6 (rules correct).
- Cleanups: AOE import cycle (M6), dead `numTargets` (M5); partial localization.
