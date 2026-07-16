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

---

## 1. ApplicationV2 sheet migration (in progress)

- [x] `MechFoundryActorSheetV2` base + Ship/Vehicle stubs — **tested, loads & works**.
- [x] **Item sheet** → V2 (class + all 14 templates + effects partial) — **tested & working**
      (single-root part fix; combat-tab equipped filter fixed for plain-object items).
- [ ] **Company sheet** → V2 (departments/units/ledger, drag-drop zones).
- [ ] **Character/NPC sheet** → V2 — the big one (~3,200 lines of jQuery
      `activateListeners` → V2 `actions` + `_onRender`; drag/drop; inline dialogs).
- [ ] Move the large **inline-HTML dialogs** (First Aid/Stabilize/Surgery, weapon
      attack, XP) into `templates/dialog/` + `renderTemplate`, and localize.
- [ ] Replace `Dialog` (appv1) with `DialogV2`, and the V1 sheets' global
      `TextEditor.enrichHTML` with `foundry.applications.ux.TextEditor.implementation`.

## 2. Design decisions needed (do NOT auto-fix)

- [?] **Company sheet math (H4/B2)**: unit readiness/health averaging is wrong
      (`_prepareUnits` never sums readiness for actor members but divides by member
      count; `avgHealth` mixes damage-taken and health-remaining). Needs the intended
      semantics of "readiness"/"health" for mixed actor + personnel units.
- [?] **Token bars (M1)**: `system.json` sets `primaryTokenAttribute: "damage"` /
      `secondaryTokenAttribute: "fatigue"`, but `company` / `vehicle_actor` / `ship`
      lack those fields → empty bars. Decide what (if anything) those bars should show.

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
          are queued and the player chooses the subskill (gated before continuing).
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
- [ ] **M8 (data track)** — transcribe the full A Time of War module/affiliation catalogue
      against the schema (the seed ships only Capellan + labelled examples).

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
