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

- [x] `MechFoundryActorSheetV2` base + Ship/Vehicle stubs (proof-of-pattern) — **needs v14 test**.
- [ ] **Item sheet** → V2 (next; real interactivity, array-field round-tripping).
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
