# Automated Character Creation — Design & Implementation Plan

Status: **proposal / awaiting sign-off**
Target: Foundry VTT v14, system `mech-foundry`
Source of truth for rules: *A Time of War* (ATOW), Character Creation chapter (book pp. 48–150).

---

## 0. Decisions baked into this draft

These were the recommended defaults (the question prompt was interrupted). Each is a
real fork — call out any you want changed and the plan adjusts.

| # | Decision | Chosen default | Alternatives |
|---|----------|----------------|--------------|
| D1 | Creation method(s) | **Life Modules (RAW)** primary, **Point-Buy** quick path secondary | + Archetype templates |
| D2 | Module content scope | **Engine + seed compendium** (all Stage 0 affiliations + representative later-stage modules) | full-catalog transcription / engine-only |
| D3 | Rules strictness | **Guided but permissive** (auto-math; prereq/cap violations are overridable warnings) | strict RAW hard-block |
| D4 | Sheet integration | **Wizard writes structured data**; sheet shows read-only summary; old free-text panels migrated | wizard-only / replace entirely |

---

## 1. The ATOW rules the engine must implement

Confirmed against the rulebook:

- **XP Pool:** every character starts with **5,000 XP** (baseline age 21; Clan warriors 18).
  `+100 XP per year` of starting age over baseline (aging is applied *after* creation, so
  the wizard tracks age but does not re-spend aging XP automatically).
- **Universal Fixed XP (mandatory, Stage 0):** costs **850 XP** and grants `+100 XP to each
  of the 8 attributes`, `Language/(Affiliation Primary or Secondary) +20`, `Language/English
  +20`, `Perception +10`. Applied automatically the moment an affiliation is chosen.
- **Attributes:** **100 XP per point** (linear). Final score = `floor(totalAttrXP / 100)`,
  capped by phenotype `maxValues`. This matches the sheet's existing `ATTRIBUTE_XP_COSTS`
  (`score × 100`).
- **Skills:** cumulative XP thresholds — **already in code** and rulebook-correct:
  `SKILL_XP_COSTS = [20,30,50,80,120,170,230,300,380,470,570]` for levels 0–10.
  Level = highest threshold fully covered by accumulated XP (`getSkillLevelFromXP`).
- **Traits:** costed in XP; positive traits cost XP, negative traits **refund** XP. XP totals
  per trait accumulate across modules (a `+50 / −25` pair nets `+25`).
- **Modules & stages:**
  - Stage 0 Affiliation — **mandatory, exactly one**. Sets cultural bonuses and gates which
    later modules are legal.
  - Stage 1 Early Childhood (0–10) — **mandatory, exactly one**.
  - Stage 2 Late Childhood (11–16) — **mandatory, exactly one**; required to proceed to 3/4.
  - Stage 3 Higher Education — **optional**, may repeat different modules (GM guidance: ≤2);
    awards skills in **Fields** (Basic / Advanced / Special / Officer).
  - Stage 4 Real Life — **optional**, multiple allowed; each adds years (age → aging later).
  - Typical character = **5 modules**; legal range 1–10.
- **Module anatomy:** `name`, `xpCost` (deducted from pool), `prerequisites`, **fixed XP**
  (pre-assigned to specific attributes/skills/traits), **flexible XP** (pools the player
  distributes, sometimes constrained e.g. "any Physical attribute", "Archery/Melee/Thrown"),
  `time` (years), `notes`.
- **Flexible XP** must be fully assigned before advancing to the next module.
- **Subskills:** `/Affiliation` → resolved from the character's affiliation; `/Any` → player
  chooses the subskill.
- **Prerequisites** (min attribute / skill level / trait TP) are checked **at the end** of
  creation, and **most-restrictive-wins** when two modules constrain the same stat.

## 2. Where the existing code already helps (and where it doesn't)

Helps:
- Data model already has `system.lifeStages.stage0–4.modules`, `system.xp {value, spent}`
  (+ derived `total`), `affiliation`, `phenotype`, `languages`, `cbills`.
- Attribute/skill/trait math already exists: `MechFoundryActor.getLinkModifier`,
  `getSkillLevelFromXP`, `SKILL_XP_COSTS`; sheet-side `ATTRIBUTE_XP_COSTS`,
  `getAttributeScoreFromXP`, `getAttributeNextCost`.
- `CONFIG.mechfoundry.phenotypes` (modifiers / maxValues / bonusTraits) + `_onPhenotypeChange`
  is the pattern for applying racial modifiers and caps.
- Skills/traits are Items → grant via `createEmbeddedDocuments("Item", …)`.

Gaps the wizard must fill:
- **No structured module/affiliation catalog** anywhere. Current `lifeStages` module entries
  are free-text `{value:""}` strings nothing parses into mechanics. → We introduce a
  structured data source (below).
- **No compendium packs** declared. → We add one.
- **Attribute XP → score table lives on the sheet, not the document.** → Promote it to the
  actor document so the wizard and sheet share one source of truth.
- **Two XP directions**: skills derive level from `xp` at read time; attributes store a
  concrete `value`. The wizard, when finalizing, must write attribute `value` (and `xp`) but
  only needs to write skill `xp`.

## 3. Data architecture — the module catalog

Introduce a **structured life-module schema** as the wizard's data source, shipped as a
compendium so GMs/community can extend it without code edits.

### 3a. New Item type `lifeModule` (compendium-backed)

```jsonc
// template.json → Item.lifeModule
{
  "stage": 0,                      // 0..4
  "moduleType": "affiliation",     // affiliation | childhood | education | reallife | field
  "affiliationKey": "",            // for stage 0; or gating key for later modules
  "xpCost": 0,
  "time": 0,                       // years added to age
  "restrictedToAffiliations": [],  // legality gate (empty = any)
  "prerequisites": {               // checked at finalize
    "attributes": { "int": 4, "wil": 5 },
    "skills":     { "MartialArts": 1 },
    "traits":     { "Connections": 2 }
  },
  "fixedXP": {
    "attributes": { "wil": 75 },
    "skills":     [ { "name": "Protocol", "subskill": "Capellan", "xp": 15 } ],
    "traits":     [ { "name": "Connections", "xp": 50 } ]
  },
  "flexibleXP": [
    { "amount": 45, "count": 3, "targets": "attributes",
      "choices": ["str","bod","rfl","dex"], "note": "+15 each to any three Physical" }
  ],
  "grantsFields": [],              // stage 3 field references
  "notes": "",
  "pageRef": "ATOW p.64"
}
```

Rationale for an **Item type + compendium** (vs. a big JS config object): compendium entries
are editable in-app, draggable, localizable, and community-extensible; they survive system
updates; and they reuse Foundry's document plumbing. A plain JSON/config table would be
faster to seed but not user-authorable.

### 3b. Seed content (D2 = engine + seed)

Ship `packs/life-modules` containing:
- **All Stage 0 affiliations** (the Great Houses, major Periphery, Clans) with sub-affiliations
  — this is the highest-value, most-referenced data and defines legality gates.
- **The Universal Fixed XP** as a special always-applied pseudo-module.
- A **representative module for each of Stages 1–4** (e.g. Early Childhood: "Farm", "Blue
  Collar"; Late Childhood: "High School", "Military School"; Higher Ed: one academy with
  Fields; Real Life: "Soldier", "Civilian Job").
- The **Master Skills List** and **common Traits** as skill/trait compendium entries the
  wizard references by name (so granted skills/traits come from canonical sources, not
  ad-hoc typos).

Full-catalog transcription (D2 alt) becomes a follow-on data-entry track against this schema.

## 4. The computation engine (`module/helpers/character-builder.mjs`)

A framework-agnostic module holding all math, unit-testable in isolation:

- `createBuilderState(options)` → in-memory draft: `{ pool, spent, age, affiliation,
  phenotype, selectedModules[], allocations{attributes,skills,traits}, flexiblePending[] }`.
- `applyModule(state, module, choices)` — deduct `xpCost`, add fixed XP to the running
  allocation maps, queue flexible-XP decisions, advance age by `time`. Idempotent/undoable.
- `assignFlexible(state, poolId, target, amount)` — validate against pool constraints.
- `deriveCharacter(state)` — the finalizer: for each attribute `score = min(cap,
  floor(xp/100))`; per skill `level = getSkillLevelFromXP(xp)`; per trait sum XP; total
  spent; remaining pool.
- `validate(state)` — returns structured issues: unmet prerequisites, over-cap attributes,
  missing mandatory stages, unassigned flexible XP, negative pool. Severity `error|warning`
  drives D3 (permissive shows warnings + override; strict blocks Finish).

Reuses the document's static tables (promote `ATTRIBUTE_XP_COSTS`/`getAttributeScoreFromXP`
onto `MechFoundryActor` so engine + sheet + wizard agree).

## 5. The wizard UI (`module/apps/character-wizard.mjs`)

An **ApplicationV2** (`HandlebarsApplicationMixin(ApplicationV2)`) multi-step dialog —
consistent with the v14 migration already done for the sheets. One `PART` per step, a
persistent footer (XP pool remaining, current age, Back/Next/Finish), left-rail stepper.

**Step flow:**
1. **Concept & Method** — name, player, portrait; pick Life Modules (default) or Point-Buy
   quick path (D1).
2. **Affiliation (Stage 0)** — pick affiliation + optional sub-affiliation from the
   compendium; auto-applies Universal Fixed XP (850) and shows the affiliation's grants.
3. **Phenotype** — choose phenotype; applies modifiers + caps (reuses `_onPhenotypeChange`
   logic) and pre-loads bonus traits.
4. **Early Childhood (Stage 1)** — pick one module; resolve its flexible XP inline.
5. **Late Childhood (Stage 2)** — pick one module; flexible XP.
6. **Higher Education (Stage 3, optional)** — add 0–N modules, choose Fields.
7. **Real Life (Stage 4, optional)** — add 0–N modules; age accrues.
8. **Flexible XP & Cleanup** — resolve any deferred pools; optionally spend leftover pool
   (point-buy style) on attributes/skills/traits with live cost feedback.
9. **Review & Finish** — full derived sheet preview (attributes+links, skills+levels, traits,
   languages, age, C-Bills, remaining XP) + the validation report. **Finish** commits.

Each module-pick step shows: cost, what it grants, prerequisites (with live met/unmet
badges), and legality against the chosen affiliation (D3 controls block vs. warn).

Point-Buy path collapses steps 2–8 into a single spend screen using the same engine.

## 6. Finalize — writing the character (`_commit`)

On Finish, one atomic-ish sequence:
1. `actor.update({ system })` — write `attributes.*.value` + `.xp`, `phenotype`,
   `affiliation`, `languages`, `cbills`, `xp.value`/`xp.spent`, `personalData`, and a
   **structured** `lifeStages` record (module id/name/stage/xpCost per selection, for audit
   & the read-only summary).
2. `actor.createEmbeddedDocuments("Item", …)` — instantiate granted **skill** and **trait**
   items from the canonical compendium entries, with computed `xp` (skills) / `xp`+`purchased`
   (traits). De-dupe: same skill+subskill accumulates XP rather than duplicating.
3. Apply phenotype `modifiers` to `attributes.*.modifier` and bonus traits as items.
4. Flag the actor `flags["mech-foundry"].created = true` (+ builder snapshot) so the wizard
   can be re-opened to review/rebuild.

All grants routed through **one helper** (`grantToActor`) so the wizard and any future
"apply module" sheet button share the logic.

## 7. Sheet integration (D4)

- The free-text `lifeStages` panels in the Biography tab become a **read-only summary**
  (stage, module names, XP spent) rendered from the structured record, plus a **"Launch
  Character Builder"** / **"Rebuild"** button and a per-actor **"Reset creation"** (GM).
- A header button on the character sheet and a **"Create Character"** entry in the Actor
  directory context menu launch the wizard.
- Migration: a one-time reader that leaves existing manually-authored free-text modules
  visible under the summary (no destructive change) until the user rebuilds.

## 8. Milestones (incremental, each shippable)

1. **M1 — Engine + tables. ✅ DONE.** Shared XP math extracted to a dependency-free
   `module/helpers/xp-math.mjs` (single source of truth; `MechFoundryActor` and the sheet now
   delegate to it, including the promoted attribute XP table). Engine implemented in
   `module/helpers/character-builder.mjs` (state, universal allotment, module apply, flexible-XP
   resolution, free-spend, derive, validate). Regression suite in
   `tests/character-builder.test.mjs` (`node tests/character-builder.test.mjs`, all passing).
   GM-tunable world settings added: `creationStartingXP`, `creationStrictness`. *No UI yet.*
2. **M2 — `lifeModule` item type + compendium. ✅ DONE.** New `lifeModule` Item type
   (template.json) with a GM-editable sheet (`templates/item/item-lifeModule-sheet.hbs`:
   scalar fields + guarded JSON editors for the structured fixedXP/flexibleXP/prerequisites,
   parsed in `item-sheet.mjs`). System compendium `mech-foundry.life-modules` declared in
   system.json, auto-seeded once per world (GM-only, idempotent, respects a cleared pack) by
   `helpers/life-module-seeder.mjs` from the canonical `module/data/life-modules.mjs`. Starter
   set: the Universal allotment, a fully-transcribed Capellan (House Liao) Stage 0 affiliation,
   and clearly-labelled EXAMPLE modules for Stages 1–4. Everything is a normal, editable Item.
   Seed integrity + apply-through-engine covered by the regression suite. Full-catalogue
   transcription remains the M8 data track.
3. **M3 — Wizard shell (ApplicationV2). ✅ DONE.** `module/apps/character-wizard.mjs` +
   `templates/apps/character-wizard.hbs`: stepper, live footer (XP remaining / age),
   Back/Next. Concept, Affiliation (reads Stage 0 modules from the compendium, applies the
   universal allotment + affiliation to builder state), and Phenotype (from CONFIG) steps, plus
   a live Review preview (derived attributes/skills/traits + validation report). Launch via a
   "Character Builder" header control on the character sheet and
   `game.mechfoundry.openCharacterWizard(actor)`. Finish is a preview endpoint — no actor
   mutation yet (that is M5). Themed to the gritty HUD.
4. **M4 — Stages 1–4 steps + flexible-XP resolver. ✅ DONE.** Wizard now has the full
   life-path: Stage 1 & 2 single-select and Stage 3 & 4 multi-select module steps (reading each
   stage from the compendium, cost/time/prereq shown on cards), plus a flexible-XP resolver step
   that renders a slot per granted allocation (attribute dropdown, skill/trait text, or
   kind+value for "any" pools). Selections rebuild the builder state deterministically; flexible
   assignments persist across re-selection via a stable pool `sourceKey`
   (`<moduleId>#<index>`) added to the engine. Review validates against every selected module's
   prerequisites. Engine + reapply logic covered by regression tests; the template was
   render-validated. Finish still preview-only (commit is M5).
5. **M5 — Commit path** (`grantToActor`, item creation, actor update) + sheet summary +
   launch buttons. First fully generated sheet.
6. **M6 — Point-Buy quick path** (D1) reusing engine.
7. **M7 — Validation polish** (D3 strict/permissive toggle as a world setting) + seed the
   representative Stage 1–4 modules + Master Skills/Traits compendium.
8. **M8 (data track) — Full catalog transcription** against the schema (optional, ongoing).

## 9. Open questions / risks

- **Data-entry volume & fidelity** (biggest risk): transcribing modules from the PDF is
  laborious and must be verified against the book. The seed-first approach de-risks the
  engine before committing to full content.
- **Skill/trait name canonicalization**: granted skills reference names; needs a stable
  Master Skills List so modules and the sheet agree (drives M7).
- **Fields (Stage 3)** add a sub-selection layer; modeled as `moduleType:"field"` child
  modules referenced by their parent.
- **Aging effects** (book pp. 332–333) are explicitly *post-creation*; plan tracks age but
  defers auto-applying aging XP to a later feature.
- **World setting** for `creationStrictness` (D3) and `startingXP` (GM override of 5,000).

## 10. First concrete step if approved

Implement **M1** (engine + promote the attribute XP table onto `MechFoundryActor`) and
**M2 scaffold** (the `lifeModule` item type + an empty `packs/life-modules` compendium with
the Universal Fixed XP entry and one seed affiliation), because they carry no UI risk, are
independently testable, and unblock every later milestone.
