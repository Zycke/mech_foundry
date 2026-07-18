import { CharacterBuilder, ATTRIBUTE_KEYS, SEVERITY, FIELD_SKILL_COST, affiliationCategory } from '../helpers/character-builder.mjs';
import * as XP from '../helpers/xp-math.mjs';
import { ATOW_SKILLS, ATOW_TRAITS, ATOW_TRAIT_DESCRIPTIONS, ATOW_SUBSKILLS, computeStartingWealth } from '../data/atow-lists.mjs';
import { SKILL_FIELDS } from '../data/skill-fields.mjs';
import { grantCharacter } from '../helpers/character-grant.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PACK_ID = 'mech-foundry.life-modules';

/**
 * The ordered wizard steps. Stages 1 & 2 are single-select; 3 & 4 are
 * multi-select. The flexible-XP step only has work when a chosen module
 * allocated flexible pools.
 */
const STEPS = [
  { id: 'concept', label: 'Concept' },
  { id: 'affiliation', label: 'Affiliation' },
  { id: 'phenotype', label: 'Phenotype' },
  { id: 'stage1', label: 'Childhood', stage: 1, multi: false },
  { id: 'stage2', label: 'Teen Years', stage: 2, multi: false },
  { id: 'stage3', label: 'Higher Ed', stage: 3, multi: true },
  { id: 'stage4', label: 'Real Life', stage: 4, multi: true },
  { id: 'flexible', label: 'Flexible XP' },
  { id: 'spend', label: 'Finalize' },
  { id: 'review', label: 'Review' }
];

/** Clan caste variant keys grouped by the caste families Stage-4 prereqs use. */
const CASTE_GROUPS = {
  warrior: ['mechwarrior', 'elemental', 'elemental-adv', 'aerospace', 'aerospace-naval', 'warrior-other'],
  scientist: ['scientist'], technician: ['technician'], merchant: ['merchant'], laborer: ['laborer']
};

/** Map a flexible pool's `targets` to a concrete builder kind (null = player picks). */
function kindForTargets(targets) {
  switch (targets) {
    case 'attributes': return 'attribute';
    case 'skills': return 'skill';
    case 'traits': return 'trait';
    default: return null; // 'any'
  }
}

/**
 * character-wizard.mjs
 * --------------------
 * Step-by-step A Time of War character-creation wizard (ApplicationV2).
 *
 * M3 built the frame + Concept/Affiliation/Phenotype/Review. M4 adds the
 * Stage 1-4 module-selection steps and the flexible-XP resolver, so the full
 * life-path flows end-to-end into the live Review preview. Finish is still a
 * preview endpoint — writing to the actor is milestone M5.
 */
export class CharacterWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {object} CharacterBuilder state (rebuilt from #choices). */
  #state;
  /** @type {number} current step index into STEPS */
  #step = 0;
  #choices = {
    name: '', player: '',
    affiliationId: '', subAffiliationKey: '',
    birthAffiliationId: '', birthSubAffiliationKey: '', // ComStar/WoB "birth" affiliation
    phenotypeKey: '',
    modules: { 1: '', 2: '', 3: [], 4: [] }, // stage -> id | id[]
    variants: {},                            // moduleId -> chosen variant key
    fields: {},                              // stage-3 schoolId -> { basic, advanced[], special[] }
    flexible: {},                            // sourceKey -> [{ kind, key }]  (count pools)
    lumpFlexible: {},                        // sourceKey -> [{ kind, key, amount }] (lump pools)
    subskills: {},                           // subskill sourceKey -> chosen text
    optimize: { attributes: false, traits: false, skills: false }, // reclaim excess XP
    boughtTraits: [],                        // [{ name, tp }] negative traits bought for XP
    freeSpend: { attributes: {}, skills: [], traits: [] } // leftover-pool spend
  };
  /** @type {Object<number, Item[]>|null} cached modules grouped by stage */
  #modulesCache = null;
  /** @type {Actor|null} optional target actor for the eventual commit (M5). */
  actor;

  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? null;
    if (this.actor?.name && this.actor.name !== 'New Actor') this.#choices.name = this.actor.name;
    this.#state = this.#freshState();
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'mf-character-wizard',
    classes: ['mech-foundry', 'character-wizard'],
    tag: 'form',
    position: { width: 780, height: 740 },
    window: { title: 'MECHFOUNDRY.WizardTitle', icon: 'fa-solid fa-hat-wizard', resizable: true },
    form: { handler: CharacterWizard.#onFormChange, submitOnChange: true, closeOnSubmit: false },
    actions: {
      back: CharacterWizard.#onBack,
      next: CharacterWizard.#onNext,
      selectAffiliation: CharacterWizard.#onSelectAffiliation,
      selectSubAffiliation: CharacterWizard.#onSelectSubAffiliation,
      selectBirthAffiliation: CharacterWizard.#onSelectBirthAffiliation,
      selectBirthSubAffiliation: CharacterWizard.#onSelectBirthSubAffiliation,
      selectPhenotype: CharacterWizard.#onSelectPhenotype,
      selectStageModule: CharacterWizard.#onSelectStageModule,
      toggleStageModule: CharacterWizard.#onToggleStageModule,
      addStageModule: { handler: CharacterWizard.#onAddStageModule, buttons: [0, 2] },
      removeStageInstance: CharacterWizard.#onRemoveStageInstance,
      selectVariant: CharacterWizard.#onSelectVariant,
      selectFieldBasic: CharacterWizard.#onSelectFieldBasic,
      toggleFieldAdvanced: CharacterWizard.#onToggleField,
      toggleFieldSpecial: CharacterWizard.#onToggleField,
      spendAttr: CharacterWizard.#onSpendAttr,
      toggleOptimize: CharacterWizard.#onToggleOptimize,
      finish: CharacterWizard.#onFinish
    }
  };

  /** @override — `scrollable` keeps the body's scroll position across re-renders
   * (selecting an option re-renders the part, which would otherwise jump to top). */
  static PARTS = {
    body: {
      template: 'systems/mech-foundry/templates/apps/character-wizard.hbs',
      scrollable: ['.wizard-body']
    }
  };

  /** @override — after each render, force every stamped `<select>` to the value
   *  the state says it should hold. A submitOnChange re-render can otherwise
   *  leave a reused/refocused select showing a stale option (e.g. the flexible-XP
   *  kind reverting to "Attribute" when no target is picked yet). */
  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const sel of this.element.querySelectorAll('select[data-value]')) {
      const want = sel.dataset.value ?? '';
      if (sel.value !== want) sel.value = want;
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  State & data                                                           */
  /* ---------------------------------------------------------------------- */

  #freshState() {
    let startingXP;
    try { startingXP = game.settings.get('mech-foundry', 'creationStartingXP'); } catch (_e) { /* pre-ready */ }
    return CharacterBuilder.createState({ startingXP });
  }

  /** Load all life modules once, grouped by stage (universal excluded). */
  async #loadModules() {
    if (this.#modulesCache) return this.#modulesCache;
    const byStage = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    const pack = game.packs?.get(PACK_ID);
    if (pack) {
      const docs = await pack.getDocuments();
      for (const d of docs) {
        if (d.type !== 'lifeModule') continue;
        if (d.system.affiliationKey === 'universal') continue; // engine applies this
        const st = Number(d.system.stage);
        if (byStage[st]) byStage[st].push(d);
      }
      for (const st of Object.keys(byStage)) byStage[st].sort((a, b) => a.name.localeCompare(b.name));
    }
    this.#modulesCache = byStage;
    return byStage;
  }

  async #getAffiliations() {
    const byStage = await this.#loadModules();
    return byStage[0].filter(d => d.system.moduleType === 'affiliation');
  }

  /** Every currently-selected module doc (Stages 0-3), in application order.
   * Stage 4 is applied separately (repeat-aware) — see #applyStageFour. */
  async #selectedModuleDocs() {
    const byStage = await this.#loadModules();
    const find = (st, id) => byStage[st]?.find(m => m.id === id) || null;
    const docs = [];
    const aff = find(0, this.#choices.affiliationId);
    if (aff) docs.push(aff);
    for (const st of [1, 2]) { const m = find(st, this.#choices.modules[st]); if (m) docs.push(m); }
    for (const id of this.#choices.modules[3]) { const m = find(3, id); if (m) docs.push(m); }
    return docs;
  }

  /** Unique Stage-4 module docs currently taken (for review/validation/grant). */
  async #stageFourDocs() {
    const byStage = await this.#loadModules();
    const list = byStage[4] || [];
    const seen = new Set(), docs = [];
    for (const entry of this.#choices.modules[4]) {
      const id = entry.id;
      if (seen.has(id)) continue;
      const m = list.find(x => x.id === id);
      if (m) { seen.add(id); docs.push(m); }
    }
    return docs;
  }

  /** Map every applied module *record id* to its source system data, so
   *  validate() can look up legality even for Stage-4 records whose ids are
   *  `s4:<iid>:<docId>[:sub|:var|:rep]` rather than a raw document id. */
  async #modulesByRecordId() {
    const docs = [...await this.#selectedModuleDocs(), ...await this.#stageFourDocs()];
    const byDocId = Object.fromEntries(docs.map(d => [d.id, d.system]));
    const map = { ...byDocId };
    for (const rec of this.#state.modules) {
      const id = String(rec.id);
      if (id.startsWith('s4:')) {
        const docId = id.split(':')[2];       // s4 : iid : docId : [sub|var|rep]
        if (byDocId[docId]) map[id] = byDocId[docId];
      }
    }
    return map;
  }

  /**
   * Aggregate the attribute minimums required by every currently-selected module
   * (most-restrictive-wins). Feeds the top bar so a player can see the target
   * each attribute must reach, even before it's met.
   * @returns {Promise<Record<string, number>>} lowercase attr → highest minimum
   */
  async #requiredAttributes() {
    const req = {};
    const bump = (obj) => {
      for (const [k, min] of Object.entries(obj || {})) {
        const n = Number(min) || 0;
        if (n > (req[k] || 0)) req[k] = n;
      }
    };
    // Module-level minimums (affiliation, Stage 1-4 modules).
    for (const sys of Object.values(await this.#modulesByRecordId())) bump(sys?.prerequisites?.attributes);
    // Stage-3 Skill Fields carry their own attribute minimums under `req.attrs`.
    for (const fname of this.#chosenFieldNames()) bump(SKILL_FIELDS[fname]?.req?.attrs);
    return req;
  }

  /** Stage-4 instances whose categorical prerequisite broke after they were
   *  added (their XP is not applied) — surfaced as errors on Review/Finish. */
  async #stageFourUnmetIssues() {
    return (this.#state.stage4Unmet || []).map(u => ({
      severity: SEVERITY.ERROR, code: 'stage4-prereq-unmet',
      message: `${u.name}: its prerequisite is no longer met — remove it or restore the requirement.`
    }));
  }

  /** Rebuild the builder state from the current choices. */
  async #rebuildState() {
    this.#state = this.#freshState();
    this.#state.phenotype = this.#choices.phenotypeKey;

    const docs = await this.#selectedModuleDocs();
    const aff = docs.find(d => Number(d.system.stage) === 0);
    if (!aff) return; // no affiliation yet -> nothing else applies

    // ComStar / Word of Blake stacks a second "birth" affiliation (ATOW p.74):
    // the character is born elsewhere, then joins the order. The birth affiliation
    // is the cultural origin (drives the primary language and module legality);
    // ComStar's own grants and 50-XP cost apply on top, at full price.
    const byStage = await this.#loadModules();
    const birthAff = aff.system.requiresBirthAffiliation
      ? (byStage[0] || []).find(a => a.id === this.#choices.birthAffiliationId && !a.system.requiresBirthAffiliation)
      : null;
    const birthSub = birthAff
      ? this._asArray(birthAff.system.subAffiliations).find(s => s.key === this.#choices.birthSubAffiliationKey)
      : null;

    // The chosen sub-affiliation of the primary (ComStar / non-ComStar) affiliation.
    const sub = this._asArray(aff.system.subAffiliations)
      .find(s => s.key === this.#choices.subAffiliationKey);

    // Cultural origin: the birth affiliation when present, else the affiliation
    // itself. This drives module legality, Clan status, and the primary language.
    const origin = birthAff || aff;
    const originSub = birthAff ? birthSub : sub;
    this.#state.affiliation = birthAff ? `${aff.name} (${birthAff.name})` : aff.name;
    this.#state.affiliationKey = origin.system.affiliationKey || '';
    this.#state.isClan = this.#state.affiliationKey === 'clan';

    // Resolve languages before the universal grant. A sub-affiliation's own
    // languages override its affiliation's ("See sub-affiliation" realms). For a
    // ComStar character the birth affiliation supplies the primary language and
    // ComStar's own primary (English) is folded in as an extra secondary.
    const pairs = birthAff ? [{ a: birthAff, s: birthSub }, { a: aff, s: sub }] : [{ a: aff, s: sub }];
    const primaryOf = ({ a, s }) => s?.primaryLanguage || a.system.primaryLanguage || '';
    const primaryLang = pairs.map(primaryOf).find(Boolean) || '';
    const secondaryLang = [...new Set(pairs.flatMap(p => {
      const own = (p.s && this._asArray(p.s.secondaryLanguages).length)
        ? this._asArray(p.s.secondaryLanguages)
        : this._asArray(p.a.system.secondaryLanguages);
      const prim = primaryOf(p);
      return prim && prim !== primaryLang ? [...own, prim] : own; // e.g. ComStar's English
    }).filter(Boolean))];
    this.#state.affiliationLanguages = { primary: primaryLang, secondary: secondaryLang };

    // A clean primary-language label: the resolved language, else the origin
    // key capitalised, else the display name without any "(...)" suffix.
    const langName = primaryLang
      || (origin.system.affiliationKey && origin.system.affiliationKey !== 'universal'
        ? origin.system.affiliationKey.charAt(0).toUpperCase() + origin.system.affiliationKey.slice(1)
        : origin.name.replace(/\s*\(.*\)\s*$/, '').trim());
    CharacterBuilder.applyUniversalFixedXP(this.#state, { primaryLanguageName: langName });

    // Birth affiliation (ComStar only): full XP and full cost, applied first.
    if (birthAff) {
      CharacterBuilder.applyModule(this.#state, birthAff.system, { id: birthAff.id, name: birthAff.name, uuid: birthAff.uuid });
      // Birth caste/variant (e.g. a ComStar acolyte born into a Clan).
      const birthVariant = this._asArray(birthAff.system.variants).find(v => v.key === this.#choices.variants[birthAff.id]);
      if (birthVariant) CharacterBuilder.applyModule(this.#state, {
        stage: 0, xpCost: Number(birthVariant.xpCost) || 0, time: 0,
        fixedXP: birthVariant.fixedXP, flexibleXP: birthVariant.flexibleXP
      }, { id: `variant:${birthAff.id}:${birthVariant.key}`, name: `${birthAff.name} — ${birthVariant.name}` });
      if (birthSub) CharacterBuilder.applyModule(this.#state, {
        stage: 0, xpCost: 0, time: 0, fixedXP: birthSub.fixedXP, flexibleXP: birthSub.flexibleXP
      }, { id: `birthsub:${birthSub.key}`, name: `${birthAff.name} — ${birthSub.name}` });
    }

    // Main affiliation module.
    CharacterBuilder.applyModule(this.#state, aff.system, { id: aff.id, name: aff.name, uuid: aff.uuid });

    // Optional affiliation variant (e.g. a Clan Caste), picked alongside the
    // sub-affiliation in the Affiliation step.
    const affVariant = this._asArray(aff.system.variants).find(v => v.key === this.#choices.variants[aff.id]);
    if (affVariant) {
      CharacterBuilder.applyModule(this.#state, {
        stage: 0, xpCost: Number(affVariant.xpCost) || 0, time: 0,
        fixedXP: affVariant.fixedXP, flexibleXP: affVariant.flexibleXP
      }, { id: `variant:${aff.id}:${affVariant.key}`, name: `${aff.name} — ${affVariant.name}` });
    }

    // Optional sub-affiliation: applied as an extra Stage 0 bundle (resolved above).
    if (sub) {
      this.#state.subAffiliation = sub.name;
      CharacterBuilder.applyModule(this.#state, {
        stage: 0, xpCost: 0, time: 0, fixedXP: sub.fixedXP, flexibleXP: sub.flexibleXP
      }, { id: `subaff:${sub.key}`, name: `${aff.name} — ${sub.name}` });
    }

    // Remaining stage modules (everything except the affiliation doc), each
    // followed by its chosen variant (caste/branch) bundle, if any.
    for (const d of docs) {
      if (d.id === aff.id) continue;
      CharacterBuilder.applyModule(this.#state, d.system, { id: d.id, name: d.name, uuid: d.uuid });
      const variant = this._asArray(d.system.variants).find(v => v.key === this.#choices.variants[d.id]);
      if (variant) {
        CharacterBuilder.applyModule(this.#state, {
          stage: d.system.stage, xpCost: Number(variant.xpCost) || 0, time: 0,
          fixedXP: variant.fixedXP, flexibleXP: variant.flexibleXP
        }, { id: `variant:${d.id}:${variant.key}`, name: `${d.name} — ${variant.name}` });
      }
      // Stage 3 schools: conditional penalty (if earlier modules were skipped)
      // and the player's chosen Skill Fields (each grants +30/skill at 24/skill).
      if (Number(d.system.stage) === 3) {
        CharacterBuilder.applyConditionalXP(this.#state, d.system.conditionalXP);
        this.#applyChosenFields(d);
      }
    }

    // Stage 4 (Real Life): apply each instance in order. The 2nd+ instance of
    // the same module is a repeat (Skill + Flexible XP only), still full cost.
    await this.#applyStageFour();

    // Re-apply saved subskill choices (adds the queued XP under the chosen subskill).
    // '__other__' is the "Other…" placeholder before the player has typed a value.
    for (const p of this.#state.subskillPending) {
      const chosen = this.#choices.subskills[p.sourceKey];
      if (chosen && chosen !== '__other__') CharacterBuilder.resolveSubskill(this.#state, p.sourceKey, chosen);
    }

    // Re-apply saved flexible assignments against the freshly-created pools.
    for (const pool of this.#state.flexiblePending) {
      if (pool.lump) {
        // Lump pool: distribute saved {kind,key,amount} rows, never over the total.
        const allocs = this.#choices.lumpFlexible[pool.sourceKey] || [];
        let total = 0;
        for (const a of allocs) {
          const amt = Math.max(0, Number(a?.amount) || 0);
          if (!a?.key || amt <= 0 || total + amt > pool.amount) continue;
          const kind = a.kind || kindForTargets(pool.targets) || 'attribute';
          try {
            if (kind === 'attribute') CharacterBuilder.addAttributeXP(this.#state, a.key, amt);
            else if (kind === 'skill') CharacterBuilder.addSkillXP(this.#state, a.key, amt);
            else if (kind === 'trait') CharacterBuilder.addTraitXP(this.#state, a.key, amt);
            total += amt;
          } catch (_e) { /* invalid target */ }
        }
        pool.allocated = total;
        continue;
      }
      const saved = this.#choices.flexible[pool.sourceKey] || [];
      for (const raw of saved.slice(0, pool.count)) {
        if (!raw?.key) continue;
        const kind = raw.kind || kindForTargets(pool.targets);
        if (!kind) continue;
        try { CharacterBuilder.assignFlexible(this.#state, pool.id, { kind, key: raw.key }); }
        catch (_e) { /* choice no longer valid after a module change */ }
      }
    }

    // Finalization post-pass (ATOW pp.96-97), in book order: resolve opposed
    // Traits, optimize (reclaim excess XP), then buy additional XP via negatives.
    CharacterBuilder.resolveOpposedTraits(this.#state);
    this.#state.optimizeReclaimed = CharacterBuilder.optimize(this.#state, this.#choices.optimize);
    const boughtDetail = [];
    this.#state.additionalXPGained = CharacterBuilder.applyBoughtTraits(this.#state, this.#choices.boughtTraits, this.#traitLimitFn(), boughtDetail);
    this.#state.boughtDetail = boughtDetail;

    // Apply leftover-pool free spend (attributes at 100 XP/point, skills, traits).
    // Rows the pool can't afford are collected so the UI can flag them rather
    // than silently displaying a spend that never happened.
    const pheno = this.#phenotypeEntry();
    const excCaps = CharacterBuilder.exceptionalAttributeBonuses(this.#state);
    const overspent = [];
    for (const [key, count] of Object.entries(this.#choices.freeSpend.attributes || {})) {
      const n = Number(count) || 0;
      if (n <= 0) continue;
      // Cap includes any Exceptional-Attribute bonus that raised the maximum.
      const cap = (pheno?.maxValues?.[key] ?? Infinity) + (excCaps[key] || 0);
      const currentScore = XP.getAttributeScoreFromXP(this.#state.attributes[key] || 0);
      const buyable = Math.max(0, Math.min(n, cap - currentScore));
      if (buyable > 0 && !CharacterBuilder.spendPool(this.#state, { kind: 'attribute', key, xp: buyable * 100 })) {
        overspent.push({ kind: 'attribute', key: key.toUpperCase(), xp: buyable * 100 });
      }
    }
    for (const s of (this.#choices.freeSpend.skills || [])) {
      const xp = Number(s?.xp) || 0;
      if (s?.key && xp > 0 && !CharacterBuilder.spendPool(this.#state, { kind: 'skill', key: s.key, xp })) {
        overspent.push({ kind: 'skill', key: s.key, xp });
      }
    }
    for (const t of (this.#choices.freeSpend.traits || [])) {
      let xp = Number(t?.xp) || 0;
      if (!t?.key || xp <= 0) continue;
      // Don't let a spend push a Trait past its maximum (positive) level.
      const lim = this.#traitLimit(t.key);
      if (lim && Number.isFinite(lim.max)) {
        const currentTP = XP.getTraitTP(this.#state.traits[t.key] || 0);
        const maxAddXP = Math.max(0, (lim.max - currentTP) * 100);
        if (xp > maxAddXP) xp = maxAddXP;
      }
      if (xp > 0 && !CharacterBuilder.spendPool(this.#state, { kind: 'trait', key: t.key, xp })) {
        overspent.push({ kind: 'trait', key: t.key, xp });
      }
    }
    this.#state.freeSpendOverspent = overspent;

    // Safety net: cap any Trait that somehow exceeded its allowed level range.
    CharacterBuilder.clampTraits(this.#state, this.#traitLimitFn());
  }

  #phenotypeEntry(key = this.#choices.phenotypeKey) {
    const phenotypes = game.mechfoundry?.config?.phenotypes || {};
    return key ? phenotypes[key] || null : null;
  }

  /** Apply a Stage-3 school's chosen Skill Fields (Basic + Advanced + Special). */
  #applyChosenFields(school) {
    const fc = this.#choices.fields[school.id];
    if (!fc) return;
    const f = school.system.fields || {};
    const apply = (name, tier, kind) => {
      const def = SKILL_FIELDS[name];
      if (!def) return;
      CharacterBuilder.applyField(this.#state, def.skills, tier?.time || 0,
        { id: `field:${school.id}:${kind}:${name}`, name: `${school.name} — ${name}` });
    };
    if (fc.basic) apply(fc.basic, f.basic, 'basic');
    for (const n of this._asArray(fc.advanced)) apply(n, f.advanced, 'advanced');
    for (const n of this._asArray(fc.special)) apply(n, f.special, 'special');
  }

  /** Total Fields chosen for a school (Basic + Advanced + Special). */
  #fieldCount(fc) {
    return (fc?.basic ? 1 : 0) + this._asArray(fc?.advanced).length + this._asArray(fc?.special).length;
  }

  /** Apply the Stage-4 instance list. Each entry is one "take" of a module; the
   * 2nd+ take of the same module is a repeat (attributes/traits granted once).
   * Also applies affiliation cost tiers, auto sub-modules and repeat effects. */
  async #applyStageFour() {
    const byStage = await this.#loadModules();
    const list = byStage[4] || [];
    const cat = affiliationCategory(this.#state.affiliationKey);
    const casteGroup = this.#characterCasteGroup();
    const count = new Map();
    const unmet = [];
    this.#choices.modules[4].forEach((entry) => {
      const { iid, id } = entry;
      const d = list.find(x => x.id === id);
      if (!d) return;
      const sys = d.system;
      // A categorical prerequisite that an earlier choice has since broken:
      // do NOT apply this instance's XP, and flag it for the Review step.
      if (!this.#stageFourPrereqStatus(sys).met) { unmet.push({ id, name: d.name }); return; }
      const n = count.get(id) || 0;
      count.set(id, n + 1);
      const repeat = n > 0;
      // Affiliation-tiered cost (e.g. Tour of Duty 700/800/1,000).
      const cost = sys.costByCategory?.[cat] ?? sys.xpCost;
      CharacterBuilder.applyModule(this.#state, this.#prepareStage4Module(sys, cost),
        { id: `s4:${iid}:${d.id}`, name: d.name, uuid: d.uuid },
        { repeat, noFlexOnRepeat: !!sys.noFlexOnRepeat });
      // Auto sub-module matching the character's affiliation / caste.
      if (sys.variantAuto) {
        const v = this.#matchAutoVariant(sys, cat, casteGroup);
        if (v) CharacterBuilder.applyModule(this.#state,
          this.#prepareStage4Module({ stage: 4, xpCost: Number(v.xpCost) || 0, fixedXP: v.fixedXP, flexibleXP: v.flexibleXP }, Number(v.xpCost) || 0),
          { id: `s4:${iid}:${d.id}:sub`, name: `${d.name} — ${v.name}` }, { repeat });
      } else if (this._asArray(sys.variants).length) {
        // Player-selected variant (e.g. Clan Warrior Washout's new caste).
        const v = this._asArray(sys.variants).find(x => x.key === this.#choices.variants[id]);
        if (v) CharacterBuilder.applyModule(this.#state,
          this.#prepareStage4Module({ stage: 4, xpCost: Number(v.xpCost) || 0, fixedXP: v.fixedXP, flexibleXP: v.flexibleXP }, Number(v.xpCost) || 0),
          { id: `s4:${iid}:${d.id}:var`, name: `${d.name} — ${v.name}` }, { repeat });
      }
      // Repeat effect (e.g. Solaris modules' In For Life penalty) — repeats only.
      if (repeat && this.#hasRepeatEffect(sys.repeatEffect)) {
        CharacterBuilder.applyModule(this.#state, { stage: 4, xpCost: 0, fixedXP: sys.repeatEffect },
          { id: `s4:${iid}:${d.id}:rep`, name: `${d.name} (repeat effect)` });
      }
    });
    this.#state.stage4Unmet = unmet;
  }

  #hasRepeatEffect(re) {
    return !!re && (Object.keys(re.attributes || {}).length || this._asArray(re.skills).length || this._asArray(re.traits).length);
  }

  /** Skills the character gained from Stage-3 Fields, optionally of given type(s). */
  #characterFieldSkills(fieldTypes) {
    const out = new Set();
    for (const fname of this.#chosenFieldNames()) {
      const def = SKILL_FIELDS[fname];
      if (!def) continue;
      if (this._asArray(fieldTypes).length && !fieldTypes.includes(def.type)) continue;
      for (const s of def.skills) out.add(s);
    }
    return [...out];
  }

  /** Override a Stage-4 module's cost and fill any field-constrained pool's
   * choices with the character's actual Field skills before applying it. */
  #prepareStage4Module(sys, cost) {
    const flexibleXP = this._asArray(sys.flexibleXP).map(pool =>
      pool.fromFields ? { ...pool, choices: this.#characterFieldSkills(pool.fieldTypes) } : pool);
    return { ...sys, xpCost: cost, flexibleXP };
  }

  /** The auto sub-module whose `match` fits this character (or null). */
  #matchAutoVariant(sys, cat, casteGroup) {
    const key = this.#state.affiliationKey;
    const subKey = this.#choices.subAffiliationKey;
    const affName = this.#state.affiliation || '';
    for (const v of this._asArray(sys.variants)) {
      const m = v.match || {};
      if (this._asArray(m.categories).length && !m.categories.includes(cat)) continue;
      if (this._asArray(m.affiliationKeys).length && !m.affiliationKeys.includes(key)) continue;
      if (this._asArray(m.castes).length && !m.castes.includes(casteGroup)) continue;
      if (this._asArray(m.subAffiliations).length && !m.subAffiliations.includes(subKey)) continue;
      if (this._asArray(m.affiliationNames).length && !m.affiliationNames.some(nm => affName.includes(nm))) continue;
      return v;
    }
    return null;
  }

  /* ---------------------------------------------------------------------- */
  /*  Context                                                                */
  /* ---------------------------------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const step = STEPS[this.#step];
    const stepId = step.id;
    const remaining = CharacterBuilder.remaining(this.#state);
    const derived = CharacterBuilder.derive(this.#state, this.#phenotypeEntry());
    const requiredAttrs = await this.#requiredAttributes();
    const context = {
      steps: STEPS.map((s, i) => ({ ...s, number: i + 1, active: i === this.#step, done: i < this.#step })),
      stepId,
      stepLabel: step.label,
      isFirst: this.#step === 0,
      isLast: this.#step === STEPS.length - 1,
      canAdvance: this.#canAdvance(stepId, step),
      advanceHint: this.#advanceHint(stepId, step),
      choices: this.#choices,
      remaining,
      remainingClass: remaining < 0 ? 'over' : '',
      age: this.#state.age,
      // Live attribute totals for the top bar (so players can read prereqs).
      // `required` is the highest minimum any chosen module needs; `short` flags
      // attributes still below their target so the player knows what to raise.
      attributeBar: ATTRIBUTE_KEYS.map(k => {
        const a = derived.attributes[k];
        const required = requiredAttrs[k] || 0;
        return {
          key: k.toUpperCase(), total: a.total, capped: !!a.cappedBy,
          required, hasReq: required > 0, short: required > 0 && a.total < required
        };
      }),
      moduleCount: this.#state.modules.filter(m => {
        const id = String(m.id);
        return !id.startsWith('subaff:') && !id.startsWith('variant:')
          && !id.startsWith('birthsub:') && !id.startsWith('field:')
          // Stage-4 auto sub-modules, player variants and repeat effects are not
          // separate "modules" for the count shown in Review.
          && !/^s4:[^:]+:[^:]+:(sub|var|rep)$/.test(id);
      }).length
    };

    if (stepId === 'affiliation') {
      const affiliations = await this.#getAffiliations();
      context.hasModules = affiliations.length > 0;
      context.modules = affiliations.map(a => this.#moduleCard(a, a.id === this.#choices.affiliationId, derived));
      context.emptyKind = 'affiliation';

      // Sub-affiliations of the chosen affiliation (required — each adds its own XP).
      const chosen = affiliations.find(a => a.id === this.#choices.affiliationId);
      context.subAffiliations = this.#subAffCards(chosen?.system.subAffiliations, this.#choices.subAffiliationKey);
      context.hasSubAffiliations = context.subAffiliations.length > 0;
      context.subAffRequired = context.hasSubAffiliations && !this.#choices.subAffiliationKey;

      // Affiliation variant (e.g. a Clan Caste) — same picker as the stage steps.
      context.variantPickers = this.#variantPickersFor(chosen ? [chosen] : []);
      context.hasVariantPickers = context.variantPickers.length > 0;

      // ComStar / Word of Blake: a second "birth" affiliation, chosen from every
      // other (non-ComStar) affiliation, plus its own sub-affiliations.
      if (chosen?.system.requiresBirthAffiliation) {
        context.needsBirthAffiliation = true;
        const options = affiliations.filter(a => !a.system.requiresBirthAffiliation);
        context.birthAffiliations = options.map(a => this.#moduleCard(a, a.id === this.#choices.birthAffiliationId, derived));
        const birth = options.find(a => a.id === this.#choices.birthAffiliationId);
        context.birthSubAffiliations = this.#subAffCards(birth?.system.subAffiliations, this.#choices.birthSubAffiliationKey);
        context.hasBirthSubAffiliations = context.birthSubAffiliations.length > 0;
        context.birthSubAffRequired = context.hasBirthSubAffiliations && !this.#choices.birthSubAffiliationKey;
        // Birth caste picker (e.g. a ComStar acolyte born into a Clan).
        context.birthVariantPickers = this.#variantPickersFor(birth ? [birth] : []);
        context.hasBirthVariantPickers = context.birthVariantPickers.length > 0;
      }
    }

    if (step.stage) {
      const byStage = await this.#loadModules();
      const list = byStage[step.stage] || [];
      const sel = this.#choices.modules[step.stage];
      // Stage 4's selections are an instance list of { iid, id } objects.
      const selectedIds = step.stage === 4
        ? this.#choices.modules[4].map(e => e.id)
        : (step.multi ? sel : (sel ? [sel] : []));
      context.stage = step.stage;
      context.multi = !!step.multi;
      context.hasModules = list.length > 0;
      context.mandatory = [1, 2].includes(step.stage);
      context.modules = list.map(m => this.#moduleCard(m, selectedIds.includes(m.id), derived));
      // Variant (caste/branch) pickers for any selected module that has variants.
      const uniqueSelected = [...new Set(selectedIds)].map(id => list.find(m => m.id === id));
      context.variantPickers = this.#variantPickersFor(uniqueSelected);
      context.hasVariantPickers = context.variantPickers.length > 0;
      context.emptyKind = 'stage';

      // Stage 3: Skill-Field pickers for each selected school + repeat advisory.
      if (step.stage === 3) {
        // Officer Candidate School locks until a prior Intelligence/Police/Military
        // school with a Basic + Advanced Field exists (ATOW p.83).
        const ocsMet = this.#ocsPrereqMet();
        for (const card of context.modules) {
          const m = list.find(x => x.id === card.id);
          if (m?.system.schoolType === 'officer' && !card.selected && !ocsMet) {
            card.locked = true;
            card.lockReason = 'Requires an Intelligence, Police or Military school with at least one Basic and one Advanced Field first.';
          }
        }
        const schools = selectedIds.map(id => list.find(m => m.id === id)).filter(Boolean);
        context.schoolFields = schools.map(m => this.#schoolFieldContext(m, derived));
        context.hasSchoolFields = context.schoolFields.length > 0;
        context.tooManyStage3 = selectedIds.length > 2; // GM soft cap (ATOW p.80)
      }

      // Stage 4: repeatable modules taken as an "instance list"; categorical
      // prerequisites lock a module, attribute/trait minimums only warn.
      if (step.stage === 4) {
        const instances = this.#choices.modules[4];
        const countById = {};
        for (const e of instances) countById[e.id] = (countById[e.id] || 0) + 1;
        for (const card of context.modules) {
          const m = list.find(x => x.id === card.id);
          card.count = countById[card.id] || 0;
          card.repeatable = m.system.repeatable !== false;
          card.maxedOut = !card.repeatable && card.count >= 1;
          const pre = this.#stageFourPrereqStatus(m.system);
          if (!pre.met && !card.count) { card.locked = true; card.lockReason = pre.reason; }
        }
        // An instance whose prereq broke after it was added is flagged (not applied).
        const unmetIds = new Set((this.#state.stage4Unmet || []).map(u => u.id));
        const seen = {};
        context.stage4Instances = instances.map((e, idx) => {
          const m = list.find(x => x.id === e.id);
          seen[e.id] = (seen[e.id] || 0) + 1;
          return {
            index: idx, name: m ? m.name : '(removed)', isRepeat: seen[e.id] > 1,
            unmet: unmetIds.has(e.id),
            unmetReason: unmetIds.has(e.id) ? this.#stageFourPrereqStatus(m.system).reason : ''
          };
        });
        context.hasStage4Instances = context.stage4Instances.length > 0;
      }
    }

    if (stepId === 'phenotype') {
      const phenotypes = game.mechfoundry?.config?.phenotypes || {};
      context.phenotypes = Object.entries(phenotypes).map(([key, p]) => ({
        key,
        label: p.label || key,
        selected: key === this.#choices.phenotypeKey,
        clanOnly: !!p.clanOnly,
        modifiers: ATTRIBUTE_KEYS
          .filter(k => (p.modifiers?.[k] ?? 0) !== 0)
          .map(k => `${k.toUpperCase()} ${p.modifiers[k] > 0 ? '+' : ''}${p.modifiers[k]}`)
          .join(', ') || 'No attribute modifiers',
        bonusTraits: (p.bonusTraits || []).join(', ')
      }));
    }

    if (stepId === 'flexible') {
      context.pools = this.#buildFlexibleContext();
      context.hasPools = context.pools.length > 0;
      context.lumpPools = this.#buildLumpContext();
      context.hasLumpPools = context.lumpPools.length > 0;
      context.subskills = this.#state.subskillPending.map(p => {
        const value = this.#choices.subskills[p.sourceKey] || '';
        const options = this.#subskillOptions(p.name);
        const hasOptions = options.length > 0;
        const isOther = value === '__other__' || (!!value && hasOptions && !options.includes(value));
        return {
          sourceKey: p.sourceKey, name: p.name, hint: p.hint, xp: p.xp,
          value, options, hasOptions, isOther,
          otherText: value && value !== '__other__' && !options.includes(value) ? value : ''
        };
      });
      context.hasSubskills = context.subskills.length > 0;
      context.nothingToResolve = !context.hasPools && !context.hasLumpPools && !context.hasSubskills;
    }

    if (stepId === 'spend') {
      context.spend = this.#buildSpendContext(derived);
    }

    if (stepId === 'review') {
      const pheno = this.#phenotypeEntry();
      const preview = CharacterBuilder.derive(this.#state, pheno);
      const modulesById = await this.#modulesByRecordId();
      const issues = [...await this.#stageFourUnmetIssues(),
        ...CharacterBuilder.validate(this.#state, { phenotype: pheno, modules: modulesById })];
      context.preview = {
        ...preview,
        // Human-readable phenotype name (preview.phenotype is the raw key).
        phenotypeLabel: pheno?.label || '',
        attributeRows: ATTRIBUTE_KEYS.map(k => ({ key: k.toUpperCase(), ...preview.attributes[k] })),
        skillRows: preview.skills.map(s => ({ ...s, levelLabel: s.level < 0 ? 'Untrained' : `L${s.level}` })),
        traitRows: preview.traits.map(t => ({ ...t, tooltip: this.#traitTooltip(t.name) }))
      };
      context.issues = issues;
      context.errorCount = issues.filter(i => i.severity === SEVERITY.ERROR).length;
      context.warningCount = issues.filter(i => i.severity === SEVERITY.WARNING).length;
      context.targetName = this.actor?.name || this.#choices.name || 'a new character';
      context.wealth = computeStartingWealth(this.#state.traits, { isClan: !!this.#state.isClan });
      const rec = this.#state.optimizeReclaimed || {};
      context.reclaimTotal = (rec.attributes || 0) + (rec.traits || 0) + (rec.skills || 0);
      context.additionalXP = this.#state.additionalXPGained || 0;
    }

    return context;
  }

  #moduleCard(doc, selected, derived) {
    const sys = doc.system;
    const legal = CharacterBuilder.isModuleLegal(sys, this.#state.affiliationKey);
    const pre = this.#prereqStatus(sys.prerequisites, derived);
    const affNames = this._asArray(sys.restrictedToAffiliations)
      .map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(', ');
    return {
      id: doc.id,
      name: doc.name,
      img: doc.img,
      selected,
      cost: sys.xpCost || 0,
      time: sys.time || 0,
      grants: this.#moduleGrants(sys),
      flexible: this.#flexibleSummaries(sys),
      prereq: this.#prereqSummary(sys.prerequisites),
      hasPrereq: pre.has,
      prereqMet: pre.met,
      notes: sys.notes || '',
      hasVariants: this._asArray(sys.variants).length > 0,
      legal,
      // Human-readable reason the module is unavailable to this character.
      restrictionText: legal ? ''
        : `Available only to ${affNames || 'certain'} affiliation(s) — your affiliation (${this.#state.affiliation || 'none'}) cannot take it.${sys.notes ? ' ' + sys.notes : ''}`
    };
  }

  /** Build the Skill-Field picker view model for one Stage-3 school. */
  #schoolFieldContext(school, derived) {
    const sys = school.system;
    const fc = this.#choices.fields[school.id] || { basic: '', advanced: [], special: [] };
    const count = this.#fieldCount(fc);
    const atMax = count >= 3;
    const hasAdvanced = this._asArray(fc.advanced).length > 0;
    const chosen = this.#chosenFieldNames();
    const waivers = new Set(this._asArray(sys.fieldWaivers)); // school-specific prereq waivers
    const tierCards = (tierObj, kind) => this._asArray(tierObj?.options).map(name => {
      const selected = kind === 'basic' ? fc.basic === name : this._asArray(fc[kind]).includes(name);
      // A Field prerequisite (needs another Field first) locks the option unless
      // the school waives it (e.g. Solaris MechWarrior needs no Basic Training).
      const fieldsMet = waivers.has(name) || this.#requiredFieldsMet(SKILL_FIELDS[name]?.req, chosen);
      // Can't add once at the cap; Specials need an Advanced first; locked = prereq unmet.
      const disabled = !selected && (atMax || (kind === 'special' && !hasAdvanced) || !fieldsMet);
      return this.#fieldCard(name, kind, school.id, selected, disabled, derived, fieldsMet);
    });
    // Does this school's conditional penalty currently apply to the build?
    const cx = sys.conditionalXP;
    const penaltyApplies = cx && this._asArray(cx.unlessModules).length
      && !this._asArray(cx.unlessModules).some(w => this.#state.modules.some(m => String(m.name || '').includes(w)));
    return {
      moduleId: school.id, moduleName: school.name, schoolType: sys.schoolType,
      count, atMax,
      basicOptions: tierCards(sys.fields.basic, 'basic'),
      basicTime: sys.fields.basic.time,
      advancedOptions: tierCards(sys.fields.advanced, 'advanced'),
      advancedTime: sys.fields.advanced.time,
      hasAdvanced: this._asArray(sys.fields.advanced.options).length > 0,
      specialOptions: tierCards(sys.fields.special, 'special'),
      specialTime: sys.fields.special.time,
      hasSpecial: this._asArray(sys.fields.special.options).length > 0,
      needsBasic: !fc.basic,
      penaltyApplies,
      penaltyText: penaltyApplies ? this.#conditionalPenaltyText(cx) : ''
    };
  }

  /** One selectable Skill-Field card (skills, cost, prereqs). */
  #fieldCard(name, kind, moduleId, selected, disabled, derived, fieldsMet = true) {
    const def = SKILL_FIELDS[name] || { skills: [], req: {} };
    const pre = this.#fieldPrereqStatus(def.req, derived);
    return {
      name, kind, moduleId, selected, disabled,
      skills: def.skills.join(', '),
      skillCount: def.skills.length,
      cost: FIELD_SKILL_COST * def.skills.length,
      prereq: this.#fieldPrereqText(def.req),
      hasPrereq: pre.has,
      prereqMet: pre.met,
      // A field is "locked" (greyed) when a *Field* prerequisite is unmet — e.g.
      // Doctor needs the Medical Assistant or Scientist Field first. Attribute
      // prereqs never lock (they only warn), per design.
      fieldLocked: !selected && !fieldsMet
    };
  }

  /** Human-readable prereq string for a Field. */
  #fieldPrereqText(req) {
    if (!req) return '';
    const bits = [];
    for (const [k, v] of Object.entries(req.attrs || {})) bits.push(`${k.toUpperCase()} ${v}`);
    for (const fn of this._asArray(req.fields)) bits.push(`${fn} Field`);
    for (const t of this._asArray(req.traits)) bits.push(`${t} Trait`);
    for (const t of this._asArray(req.forbidTraits)) bits.push(`no ${t}`);
    let s = bits.join(', ');
    if (req.note) s += (s ? ' — ' : '') + req.note;
    return s;
  }

  /** Every Skill Field currently selected across all schools. */
  #chosenFieldNames() {
    const chosen = new Set();
    for (const fcv of Object.values(this.#choices.fields || {})) {
      if (fcv.basic) chosen.add(fcv.basic);
      for (const n of this._asArray(fcv.advanced)) chosen.add(n);
      for (const n of this._asArray(fcv.special)) chosen.add(n);
    }
    return chosen;
  }

  /** Whether a Field's "requires one of these Fields" prereq is satisfied. */
  #requiredFieldsMet(req, chosen = this.#chosenFieldNames()) {
    const reqFields = this._asArray(req?.fields);
    return !reqFields.length || reqFields.some(f => chosen.has(f));
  }

  /** Whether a Field's attribute + Field prereqs are currently met (for the badge). */
  #fieldPrereqStatus(req, derived) {
    if (!req) return { has: false, met: true };
    const hasReq = Object.keys(req.attrs || {}).length || this._asArray(req.fields).length
      || this._asArray(req.traits).length;
    if (!hasReq) return { has: false, met: true };
    let met = true;
    for (const [k, min] of Object.entries(req.attrs || {})) {
      if ((derived.attributes[k]?.total ?? 0) < min) met = false;
    }
    if (!this.#requiredFieldsMet(req)) met = false;
    return { has: true, met };
  }

  /** Short description of a school's conditional penalty allotment. */
  #conditionalPenaltyText(cx) {
    const fx = cx.fixedXP || {};
    const parts = [];
    for (const [k, v] of Object.entries(fx.attributes || {})) parts.push(`${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`);
    for (const t of this._asArray(fx.traits)) parts.push(`${t.name} ${t.xp > 0 ? '+' : ''}${t.xp}`);
    return `Penalty applied (you skipped ${this._asArray(cx.unlessModules).join(' / ')}): ${parts.join(', ')}.`;
  }

  /** View models for a list of sub-affiliation bundles (main or birth). */
  #subAffCards(subs, selectedKey) {
    return this._asArray(subs).map(s => ({
      key: s.key,
      name: s.name,
      selected: s.key === selectedKey,
      grants: this.#moduleGrants(s),
      flexible: this.#flexibleSummaries(s),
      notes: s.notes || ''
    }));
  }

  /** Build variant-picker view models for any of the given module docs that
   * declare variants (shared by the affiliation and stage steps). */
  #variantPickersFor(docs) {
    return (docs || [])
      .filter(m => m && this._asArray(m.system.variants).length)
      .map(m => ({
        moduleId: m.id,
        moduleName: m.name,
        label: m.system.variantLabel || 'Variant',
        required: !!m.system.variantRequired,
        variants: this._asArray(m.system.variants).map(v => ({
          key: v.key,
          name: v.name,
          selected: this.#choices.variants[m.id] === v.key,
          grants: this.#moduleGrants({ fixedXP: v.fixedXP }),
          flexible: this.#flexibleSummaries({ flexibleXP: v.flexibleXP }),
          notes: v.notes || ''
        }))
      }));
  }

  /** Small array coercion (module fields may be arrays or objects). */
  _asArray(v) { return Array.isArray(v) ? v : (v == null ? [] : Object.values(v)); }

  /** Whether a module's prerequisites are currently met by the build. */
  #prereqStatus(pre, derived) {
    const has = !!pre && (Object.keys(pre.attributes || {}).length
      || Object.keys(pre.skills || {}).length || Object.keys(pre.traits || {}).length);
    if (!has) return { has: false, met: true };
    let met = true;
    for (const [k, min] of Object.entries(pre.attributes || {})) {
      if ((derived.attributes[k]?.total ?? 0) < min) met = false;
    }
    for (const [k, min] of Object.entries(pre.skills || {})) {
      const s = derived.skills.find(x => x.key === k || x.name === k);
      if ((s?.level ?? -1) < min) met = false;
    }
    for (const [k, min] of Object.entries(pre.traits || {})) {
      if (XP.getTraitTP(this.#state.traits[k] ?? 0) < min) met = false;
    }
    return { has: true, met };
  }

  /** Structured, human-readable grants for a module card. */
  #moduleGrants(system) {
    const attributes = Object.entries(system.fixedXP?.attributes || {})
      .map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`);
    const skills = (system.fixedXP?.skills || []).map(s => ({
      label: `${s.subskill ? `${s.name}/${s.subskill}` : s.name} ${s.xp > 0 ? '+' : ''}${s.xp}`
    }));
    const traits = (system.fixedXP?.traits || []).map(t => ({
      label: `${t.name} ${t.xp > 0 ? '+' : ''}${t.xp}`,
      tooltip: this.#traitTooltip(t.name)
    }));
    return {
      attributes, skills, traits,
      empty: !attributes.length && !skills.length && !traits.length
    };
  }

  /** Short descriptions of a module's flexible-XP pools (for the card). Always
   * shows the XP amount, then the constraint note (a lump note like "may only
   * be applied to Skills" doesn't itself state the amount). */
  #flexibleSummaries(system) {
    return (system.flexibleXP || []).map(p => {
      if (p.lump) return `${p.amount} XP flexible${p.note ? ` — ${p.note}` : ''}`;
      const base = `${p.amount} XP × ${p.count || 1}`;
      return p.note ? `${base} — ${p.note}` : `${base} (${p.targets || 'any'})`;
    });
  }

  /** Tooltip text for a trait, resolved from its base name (before "/subskill"). */
  #traitTooltip(name) {
    const base = String(name).split('/')[0].trim();
    const map = game.mechfoundry?.config?.traitDescriptions || ATOW_TRAIT_DESCRIPTIONS;
    return map[base] || map[String(name)] || '';
  }

  /** Skill dropdown options: master list ∪ skills already in the build. */
  #skillOptions() {
    const master = (game.mechfoundry?.config?.skillsList || ATOW_SKILLS).map(s => s.name);
    const set = new Set([...master, ...Object.keys(this.#state.skills)]);
    return [...set].sort((a, b) => a.localeCompare(b)).map(n => ({ value: n, label: n }));
  }

  /** Known subskills for a root skill (GM-edited compendium first, then master). */
  #subskillOptions(root) {
    // Language subskills: prefer the affiliation's own languages, then common ones.
    if (root === 'Language') {
      const langs = this.#state.affiliationLanguages || {};
      const affLangs = [langs.primary, ...(langs.secondary || [])].filter(Boolean);
      const generic = ATOW_SUBSKILLS['Language'] || [];
      return [...new Set([...affLangs, ...generic])];
    }
    const entry = (game.mechfoundry?.config?.skillsList || []).find(s => s.name === root);
    if (entry?.subskills?.length) return entry.subskills;
    return ATOW_SUBSKILLS[root] || [];
  }

  /** Trait dropdown options: master list ∪ traits already in the build. */
  #traitOptions() {
    const master = (game.mechfoundry?.config?.traitsList || ATOW_TRAITS).map(t => t.name);
    const set = new Set([...master, ...Object.keys(this.#state.traits)]);
    return [...set].sort((a, b) => a.localeCompare(b)).map(n => ({ value: n, label: n }));
  }

  /**
   * Parse a Trait's TP spec into its allowed { min, max } level range (in TP).
   * Handles single ('2', '-1', '0'), range ('1 to 10', '-5 to -1', '-9 to -2'),
   * discrete ('3 or 5') and dual-sign flexible ('-5 to 5') specs. Positive Traits
   * are floored at 0, negative Traits capped at 0; flexible Traits keep both signs.
   * Returns null when the Trait/spec is unknown (treated as unlimited).
   */
  #traitLimit(name) {
    if (!name) return null;
    const list = game.mechfoundry?.config?.traitsList || ATOW_TRAITS;
    let def = list.find(t => t.name === name);
    if (!def && name.includes('/')) {
      const base = name.slice(0, name.indexOf('/'));
      def = list.find(t => t.name === base);
    }
    if (!def) return null;
    const nums = String(def.tp || '').match(/-?\d+/g);
    if (!nums || !nums.length) return null;
    const vals = nums.map(Number);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (def.type === 'positive') lo = Math.min(0, lo);
    else if (def.type === 'negative') hi = Math.max(0, hi);
    return { min: lo, max: hi };
  }

  /** Bound Trait-limit lookup passed into the builder engine. */
  #traitLimitFn() {
    return (name) => this.#traitLimit(name);
  }

  /** Trait options limited to negatives — for the Buy Additional XP dropdown. */
  #negativeTraitOptions() {
    const list = game.mechfoundry?.config?.traitsList || ATOW_TRAITS;
    return list
      .filter(t => t.type === 'negative')
      .map(t => t.name)
      .sort((a, b) => a.localeCompare(b))
      .map(n => ({ value: n, label: n }));
  }

  #prereqSummary(pre) {
    if (!pre) return '';
    const bits = [];
    for (const [k, v] of Object.entries(pre.attributes || {})) bits.push(`${k.toUpperCase()} ≥ ${v}`);
    for (const [k, v] of Object.entries(pre.skills || {})) bits.push(`${k} ≥ ${v}`);
    for (const [k, v] of Object.entries(pre.traits || {})) bits.push(`${k} ≥ ${v}`);
    return bits.join(', ');
  }

  /** Build the count-based flexible-XP pools (fixed-size dropdown slots). */
  #buildFlexibleContext() {
    const skillOptions = this.#skillOptions();
    const traitOptions = this.#traitOptions();
    const attrAll = ATTRIBUTE_KEYS.map(k => ({ value: k, label: k.toUpperCase() }));
    const optionsFor = (kind) => kind === 'skill' ? skillOptions : kind === 'trait' ? traitOptions : attrAll;

    return this.#state.flexiblePending.filter(p => !p.lump).map(pool => {
      const baseKind = kindForTargets(pool.targets); // null = 'any'
      const attrChoices = (pool.choices.length ? pool.choices : ATTRIBUTE_KEYS)
        .map(k => ({ value: k, label: k.toUpperCase() }));
      const saved = this.#choices.flexible[pool.sourceKey] || [];
      const moduleName = this.#state.modules.find(m => m.id === pool.moduleId)?.name || '';

      // A constrained choice list (e.g. "choose one: Combat Sense or Pain
      // Resistance") drives the dropdown directly for skills/traits.
      const constrained = pool.choices.length && baseKind && baseKind !== 'attribute'
        ? pool.choices.map(c => ({ value: c, label: c })) : null;
      const slots = Array.from({ length: pool.count }, (_, i) => {
        const s = saved[i] || {};
        const kind = baseKind || s.kind || 'attribute';
        const options = baseKind === 'attribute' ? attrChoices : (constrained || optionsFor(kind));
        return { idx: i, isAny: baseKind === null, kind, key: s.key || '', options };
      });

      return { sourceKey: pool.sourceKey, note: pool.note || `${pool.amount} XP`, amount: pool.amount, count: pool.count, moduleName, slots };
    });
  }

  /** Build the lump flexible-XP pools (distribute a total across free-form rows). */
  #buildLumpContext() {
    const skillOptions = this.#skillOptions();
    const traitOptions = this.#traitOptions();
    const attrAll = ATTRIBUTE_KEYS.map(k => ({ value: k, label: k.toUpperCase() }));
    const optionsFor = (kind) => kind === 'skill' ? skillOptions : kind === 'trait' ? traitOptions : attrAll;

    return this.#state.flexiblePending.filter(p => p.lump).map(pool => {
      const baseKind = kindForTargets(pool.targets); // null = 'any'
      const saved = this.#choices.lumpFlexible[pool.sourceKey] || [];
      const moduleName = this.#state.modules.find(m => m.id === pool.moduleId)?.name || '';
      const allocated = pool.allocated || 0;
      const rows = [...saved, { kind: '', key: '', amount: '' }].map((a, i) => {
        const kind = baseKind || a.kind || 'attribute';
        return {
          idx: i, isAny: baseKind === null, kind,
          key: a.key || '', amount: a.amount || '',
          options: optionsFor(kind)
        };
      });
      return {
        sourceKey: pool.sourceKey,
        note: pool.note || `Distribute ${pool.amount} XP`,
        amount: pool.amount, allocated, remaining: pool.amount - allocated,
        over: allocated > pool.amount,
        moduleName, rows
      };
    });
  }

  /** Leftover-pool spend step context (attribute steppers + skill rows). */
  #buildSpendContext(derived) {
    const pheno = this.#phenotypeEntry();
    const remaining = CharacterBuilder.remaining(this.#state);
    const excCaps = CharacterBuilder.exceptionalAttributeBonuses(this.#state);
    const attributes = ATTRIBUTE_KEYS.map(k => {
      // Effective cap includes any Exceptional-Attribute bonus (matches rebuild).
      const cap = (pheno?.maxValues?.[k] ?? Infinity) + (excCaps[k] || 0);
      const value = derived.attributes[k].value;
      return {
        key: k, label: k.toUpperCase(),
        total: derived.attributes[k].total,
        bought: this.#choices.freeSpend.attributes[k] || 0,
        atCap: value >= cap,
        canBuy: value < cap && remaining >= 100
      };
    });
    const saved = this.#choices.freeSpend.skills || [];
    const rows = [...saved, { key: '', xp: '' }].map((s, i) => ({ idx: i, key: s.key || '', xp: s.xp || '' }));
    const savedT = this.#choices.freeSpend.traits || [];
    const traitRows = [...savedT, { key: '', xp: '' }].map((t, i) => ({ idx: i, key: t.key || '', xp: t.xp || '' }));

    // Optimization: how much would be reclaimed per category (already applied).
    const opt = this.#choices.optimize;
    const reclaimed = this.#state.optimizeReclaimed || { attributes: 0, traits: 0, skills: 0 };

    // Buy Additional XP: negative Traits, capped at 10% of starting XP.
    const cap = CharacterBuilder.additionalXPCap(this.#state);
    const gained = this.#state.additionalXPGained || 0;
    // Per-row applied XP (after cap/limit clamping) so the display never
    // overstates a purchase that was reduced or skipped.
    const detail = this.#state.boughtDetail || [];
    const boughtRows = [...(this.#choices.boughtTraits || []), { name: '', tp: '' }]
      .map((b, i) => {
        const requested = Math.abs((Number(b.tp) || 0) * 100);
        const d = detail[i];
        const xp = d ? d.appliedXP : requested;
        return {
          idx: i, name: b.name || '', tp: b.tp || '', xp,
          requestedXp: requested,
          reduced: !!b.name && xp > 0 && xp < requested,     // partially clamped
          dropped: !!b.name && xp === 0 && requested > 0     // skipped (cap reached)
        };
      });

    return {
      attributes, skillOptions: this.#skillOptions(), skills: rows,
      traitOptions: this.#traitOptions(), traits: traitRows, remaining,
      optimize: opt, reclaimed,
      reclaimTotal: reclaimed.attributes + reclaimed.traits + reclaimed.skills,
      buyCap: cap, buyGained: gained, buyLeft: cap - gained, boughtRows,
      negativeTraitOptions: this.#negativeTraitOptions(),
      overspent: this.#state.freeSpendOverspent || [],
      hasOverspent: (this.#state.freeSpendOverspent || []).length > 0
    };
  }

  /** Whether the current step is complete enough to advance / finish. */
  #canAdvance(stepId, step) {
    if (stepId === 'affiliation') {
      if (!this.#choices.affiliationId) return false;
      if (this.#affiliationHasSubs() && !this.#choices.subAffiliationKey) return false;
      if (this.#missingRequiredVariantFor(this.#modulesCache?.[0], [this.#choices.affiliationId])) return false;
      if (this.#needsBirthAffiliation()) {
        if (!this.#choices.birthAffiliationId) return false;
        if (this.#birthAffiliationHasSubs() && !this.#choices.birthSubAffiliationKey) return false;
        // A birth affiliation that itself requires a variant (a Clan caste).
        if (this.#missingRequiredVariantFor(this.#modulesCache?.[0], [this.#choices.birthAffiliationId])) return false;
      }
      return true;
    }
    if (step.stage && [1, 2].includes(step.stage)) {
      return !!this.#choices.modules[step.stage] && !this.#missingRequiredVariant(step.stage);
    }
    if (step.stage === 3) return !this.#missingRequiredVariant(3) && !this.#schoolMissingBasic() && !this.#ocsSelectedButUnmet();
    if (step.stage) return !this.#missingRequiredVariant(step.stage);
    if (stepId === 'flexible') {
      return CharacterBuilder.flexibleResolved(this.#state) && CharacterBuilder.subskillsResolved(this.#state);
    }
    return true;
  }

  #advanceHint(stepId, step) {
    if (stepId === 'affiliation') {
      if (!this.#choices.affiliationId) return 'Choose an affiliation to continue.';
      if (this.#affiliationHasSubs() && !this.#choices.subAffiliationKey) return 'Choose a sub-affiliation to continue.';
      const a = this.#missingRequiredVariantFor(this.#modulesCache?.[0], [this.#choices.affiliationId]);
      if (a) return `Choose a ${a.label.toLowerCase()} for ${a.moduleName} to continue.`;
      if (this.#needsBirthAffiliation()) {
        if (!this.#choices.birthAffiliationId) return 'Choose a birth affiliation for ComStar / Word of Blake to continue.';
        if (this.#birthAffiliationHasSubs() && !this.#choices.birthSubAffiliationKey) return 'Choose a birth sub-affiliation to continue.';
        const b = this.#missingRequiredVariantFor(this.#modulesCache?.[0], [this.#choices.birthAffiliationId]);
        if (b) return `Choose a ${b.label.toLowerCase()} for your birth affiliation (${b.moduleName}) to continue.`;
      }
    }
    if (step.stage && [1, 2].includes(step.stage) && !this.#choices.modules[step.stage]) {
      return 'Choose a module for this required stage.';
    }
    if (step.stage) {
      const m = this.#missingRequiredVariant(step.stage);
      if (m) return `Choose a ${m.label.toLowerCase()} for ${m.moduleName} to continue.`;
    }
    if (step.stage === 3) {
      const s = this.#schoolMissingBasic();
      if (s) return `Choose a Basic Field for ${s} to continue (or deselect the school).`;
      if (this.#ocsSelectedButUnmet()) return 'Officer Candidate School needs an Intelligence/Police/Military school with a Basic and an Advanced Field (or deselect OCS).';
    }
    if (stepId === 'flexible') {
      if (!CharacterBuilder.subskillsResolved(this.#state)) return 'Choose all subskills to continue.';
      if (!CharacterBuilder.flexibleResolved(this.#state)) return 'Assign all flexible XP to continue.';
    }
    return '';
  }

  /** Whether the currently-chosen affiliation demands a "birth" affiliation (ComStar). */
  #needsBirthAffiliation() {
    const aff = this.#modulesCache?.[0]?.find(a => a.id === this.#choices.affiliationId);
    return !!aff?.system.requiresBirthAffiliation;
  }

  /** Whether the currently-chosen affiliation offers sub-affiliations (one is required). */
  #affiliationHasSubs() {
    const aff = this.#modulesCache?.[0]?.find(a => a.id === this.#choices.affiliationId);
    return !!aff && this._asArray(aff.system.subAffiliations).length > 0;
  }

  /** Whether the chosen ComStar "birth" affiliation offers sub-affiliations (one is required). */
  #birthAffiliationHasSubs() {
    const b = this.#modulesCache?.[0]?.find(a => a.id === this.#choices.birthAffiliationId);
    return !!b && this._asArray(b.system.subAffiliations).length > 0;
  }

  /** Name of the first selected Stage-3 school that still needs a Basic Field. */
  #schoolMissingBasic() {
    const list = this.#modulesCache?.[3] || [];
    for (const id of this.#choices.modules[3]) {
      const m = list.find(x => x.id === id);
      if (m && !this.#choices.fields[id]?.basic) return m.name;
    }
    return null;
  }

  /** Whether Officer Candidate School's prerequisite is satisfied: a selected
   * Intelligence/Police/Military school that has both a Basic and an Advanced
   * Field chosen (ATOW p.83). */
  #ocsPrereqMet() {
    const list = this.#modulesCache?.[3] || [];
    return this.#choices.modules[3].some(id => {
      const m = list.find(x => x.id === id);
      if (!m || !['intelligence', 'military'].includes(m.system.schoolType)) return false;
      const fc = this.#choices.fields[id];
      return !!fc?.basic && this._asArray(fc.advanced).length > 0;
    });
  }

  /** True if OCS is selected but its prerequisite is not (yet) satisfied. */
  #ocsSelectedButUnmet() {
    const list = this.#modulesCache?.[3] || [];
    const ocs = this.#choices.modules[3].some(id => list.find(x => x.id === id)?.system.schoolType === 'officer');
    return ocs && !this.#ocsPrereqMet();
  }

  /** The character's Clan caste family ('warrior'|'scientist'|…), or '' if none. */
  #characterCasteGroup() {
    const casteKey = this.#choices.variants[this.#choices.affiliationId];
    if (!casteKey) return '';
    for (const [group, keys] of Object.entries(CASTE_GROUPS)) if (keys.includes(casteKey)) return group;
    return '';
  }

  /** Names of every module currently in the build (all stages). */
  #takenModuleNames() {
    return new Set(this.#state.modules.map(m => String(m.name || '')));
  }

  /** Evaluate a Stage-4 module's CATEGORICAL prerequisites (affiliation category,
   * caste, possessed Field, prior module) — these lock the module. Attribute /
   * trait minimums are handled separately (warn-only) by #moduleCard. */
  #stageFourPrereqStatus(sys) {
    const p = sys.prerequisites || {};
    const cat = affiliationCategory(this.#state.affiliationKey);
    const reasons = [];
    const cats = this._asArray(p.affiliationCategories);
    if (cats.length && !cats.includes(cat)) reasons.push(`requires a ${cats.join(' or ')} affiliation`);
    const forbid = this._asArray(p.forbidCategories);
    if (forbid.length && forbid.includes(cat)) reasons.push(`not available to ${forbid.join('/')} characters`);
    const castes = this._asArray(p.castes);
    if (castes.length) {
      const group = this.#characterCasteGroup();
      if (!castes.includes(group)) reasons.push(`requires the ${castes.join(' or ')} caste`);
    }
    // Training requirement: a specific Field, a Field of a given type, OR a prior
    // module — any listed satisfies the requirement.
    const reqFields = this._asArray(p.fields), reqTypes = this._asArray(p.fieldTypes), reqModules = this._asArray(p.modules);
    if (reqFields.length || reqTypes.length || reqModules.length) {
      const chosenFields = this.#chosenFieldNames();
      const names = this.#takenModuleNames();
      const hasField = reqFields.some(f => chosenFields.has(f));
      const hasType = reqTypes.some(t => [...chosenFields].some(f => SKILL_FIELDS[f]?.type === t));
      const hasModule = reqModules.some(r => [...names].some(n => n.includes(r) || r.includes(n)));
      const ok = (reqFields.length && hasField) || (reqTypes.length && hasType) || (reqModules.length && hasModule);
      if (!ok) {
        const bits = [];
        if (reqFields.length) bits.push(`the ${reqFields.join('/')} Field`);
        if (reqTypes.length) bits.push(`a ${reqTypes.join('/')} Field`);
        if (reqModules.length) bits.push(`the ${reqModules.join(' or ')} module`);
        reasons.push(`requires ${bits.join(' or ')}`);
      }
    }
    return { met: reasons.length === 0, reason: reasons.length ? `Locked — ${reasons.join('; ')}.` : '' };
  }

  /** First selected module in a stage that requires a variant but has none chosen. */
  #missingRequiredVariant(stage) {
    const sel = this.#choices.modules[stage];
    let ids = Array.isArray(sel) ? sel : (sel ? [sel] : []);
    // Stage 4 stores { iid, id } instance objects; other stages store id strings.
    ids = ids.map(x => (x && typeof x === 'object') ? x.id : x);
    return this.#missingRequiredVariantFor(this.#modulesCache?.[stage], ids);
  }

  /** First module in `ids` (looked up in `list`) that requires a variant but has none chosen. */
  #missingRequiredVariantFor(list, ids) {
    const byId = list || [];
    for (const id of ids || []) {
      const m = byId.find(x => x.id === id);
      if (!m) continue;
      const variants = this._asArray(m.system.variants);
      if (variants.length && m.system.variantRequired && !this.#choices.variants[id]) {
        return { moduleId: id, moduleName: m.name, label: m.system.variantLabel || 'Variant' };
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------------- */
  /*  Actions                                                                */
  /* ---------------------------------------------------------------------- */

  /** Capture free-text concept fields and flexible-XP selections on change. */
  static async #onFormChange(event, form, formData) {
    const data = formData.object;
    if ('name' in data) this.#choices.name = data.name;
    if ('player' in data) this.#choices.player = data.player;

    // Collect flexible-XP inputs: name = "flex::<sourceKey>::<slot>::<field>"
    let flexChanged = false;
    const collected = {};
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('flex::')) continue;
      flexChanged = true;
      const parts = k.split('::');
      const sourceKey = parts[1], slot = Number(parts[2]), field = parts[3];
      ((collected[sourceKey] ??= [])[slot] ??= { kind: '', key: '' })[field] = v;
    }
    // Lump flexible: name = "lump::<sourceKey>::<slot>::<field>"
    let lumpChanged = false;
    const lump = {};
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('lump::')) continue;
      lumpChanged = true;
      const parts = k.split('::');
      const sourceKey = parts[1], slot = Number(parts[2]), field = parts[3];
      ((lump[sourceKey] ??= [])[slot] ??= { kind: '', key: '', amount: '' })[field] = v;
    }

    // Leftover-pool skill spend: name = "spendskill::<slot>::<field>"
    let spendChanged = false;
    const spendSkills = [];
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('spendskill::')) continue;
      spendChanged = true;
      const parts = k.split('::');
      const slot = Number(parts[1]), field = parts[2];
      (spendSkills[slot] ??= { key: '', xp: '' })[field] = v;
    }
    // Leftover-pool trait spend: name = "spendtrait::<slot>::<field>"
    let spendTraitChanged = false;
    const spendTraits = [];
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('spendtrait::')) continue;
      spendTraitChanged = true;
      const parts = k.split('::');
      const slot = Number(parts[1]), field = parts[2];
      (spendTraits[slot] ??= { key: '', xp: '' })[field] = v;
    }
    // Buy Additional XP via negative Traits: name = "buytrait::<slot>::<field>"
    let buyChanged = false;
    const buys = [];
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('buytrait::')) continue;
      buyChanged = true;
      const parts = k.split('::');
      const slot = Number(parts[1]), field = parts[2];
      (buys[slot] ??= { name: '', tp: '' })[field] = v;
    }

    // Subskill choices: a "subskill::<key>" select (or text) plus, when the
    // select is on "Other…", a "subskillother::<key>" free-text field.
    let subChanged = false;
    const subSel = {}, subOther = {};
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('subskillother::')) { subChanged = true; subOther[k.slice('subskillother::'.length)] = v; }
      else if (k.startsWith('subskill::')) { subChanged = true; subSel[k.slice('subskill::'.length)] = v; }
    }
    if (subChanged) {
      for (const key of new Set([...Object.keys(subSel), ...Object.keys(subOther)])) {
        const sel = subSel[key];
        let final;
        if (sel === '__other__') final = (subOther[key] || '').trim() || '__other__'; // keep marker until typed
        else if (sel !== undefined) final = sel;                                       // known option or plain text
        else final = (subOther[key] || '').trim();
        if (final) this.#choices.subskills[key] = final;
        else delete this.#choices.subskills[key];
      }
    }

    if (flexChanged) {
      for (const [sk, slots] of Object.entries(collected)) {
        const prev = this.#choices.flexible[sk] || [];
        this.#choices.flexible[sk] = slots.map((s, i) => {
          // Fall back to the previously-stored kind so a re-serialization that
          // omits the kind field never silently resets it to empty (→ Attribute).
          const kind = s?.kind || prev[i]?.kind || '';
          let key = s?.key || '';
          // If an 'any' pool's kind just changed, the old value no longer fits.
          if (kind && prev[i]?.kind && prev[i].kind !== kind) key = '';
          return { kind, key };
        });
      }
    }
    if (lumpChanged) {
      for (const [sk, rows] of Object.entries(lump)) {
        // Keep a row once it has a kind, a target, OR an amount, so any one of
        // the three dropdowns/fields sticks before the others are filled in.
        // Including `kind` is what lets the Attribute/Skill/Trait selector hold
        // its choice while the target is still empty (an 'any' pool renders that
        // extra select). #rebuildState only actually allocates a row when it has
        // both a key and amount > 0, so a kind-only row spends nothing.
        const prev = this.#choices.lumpFlexible[sk] || [];
        this.#choices.lumpFlexible[sk] = rows
          .map((r, i) => {
            const kind = r?.kind || '';
            let key = r?.key || '';
            // If an 'any' row's kind just changed, the old target no longer fits.
            if (kind && prev[i]?.kind && prev[i].kind !== kind) key = '';
            return { kind, key, amount: Number(r?.amount) || 0 };
          })
          .filter(r => r.kind || r.key || r.amount > 0);
      }
    }
    // Keep a row once it has EITHER a target or an amount, so a dropdown choice
    // sticks before the XP/TP is typed (and vice-versa). #rebuildState only
    // actually spends a row when both the target and a positive amount exist.
    if (spendChanged) {
      this.#choices.freeSpend.skills = spendSkills
        .map(s => ({ key: s?.key || '', xp: Number(s?.xp) || 0 }))
        .filter(s => s.key || s.xp > 0);
    }
    if (spendTraitChanged) {
      this.#choices.freeSpend.traits = spendTraits
        .map(t => ({ key: t?.key || '', xp: Number(t?.xp) || 0 }))
        .filter(t => t.key || t.xp > 0);
    }
    if (buyChanged) {
      this.#choices.boughtTraits = buys
        .map(b => ({ name: b?.name || '', tp: Number(b?.tp) || 0 }))
        .filter(b => b.name || b.tp < 0);
    }
    if (flexChanged || lumpChanged || spendChanged || spendTraitChanged || buyChanged || subChanged) {
      await this.#rebuildState();
      this.render();
    }
  }

  /** Toggle optimization for a category (attributes / traits / skills). */
  static async #onToggleOptimize(event, target) {
    const cat = target.dataset.cat;
    if (cat in this.#choices.optimize) this.#choices.optimize[cat] = !this.#choices.optimize[cat];
    await this.#rebuildState();
    this.render();
  }

  static async #onBack() { if (this.#step > 0) { this.#step -= 1; this.render(); } }
  static async #onNext() {
    const step = STEPS[this.#step];
    if (!this.#canAdvance(step.id, step)) {
      const hint = this.#advanceHint(step.id, step);
      if (hint) ui.notifications?.warn(hint);
      return;
    }
    if (this.#step < STEPS.length - 1) { this.#step += 1; this.render(); }
  }

  /** Buy (+1) or refund (-1) an attribute point with leftover pool XP. */
  static async #onSpendAttr(event, target) {
    const key = target.dataset.key;
    const dir = target.dataset.dir === 'dec' ? -1 : 1;
    const cur = this.#choices.freeSpend.attributes[key] || 0;
    const next = Math.max(0, cur + dir);
    if (next === 0) delete this.#choices.freeSpend.attributes[key];
    else this.#choices.freeSpend.attributes[key] = next;
    await this.#rebuildState();
    this.render();
  }

  static async #onSelectAffiliation(event, target) {
    const prev = this.#choices.affiliationId;
    const prevBirth = this.#choices.birthAffiliationId;
    this.#choices.affiliationId = target.dataset.id || '';
    this.#choices.subAffiliationKey = ''; // sub-affiliations are affiliation-specific
    this.#choices.birthAffiliationId = '';       // ComStar birth is ComStar-specific
    this.#choices.birthSubAffiliationKey = '';
    if (prev) delete this.#choices.variants[prev]; // caste is affiliation-specific
    if (prevBirth) delete this.#choices.variants[prevBirth]; // birth caste too
    await this.#rebuildState();
    this.render();
  }

  static async #onSelectSubAffiliation(event, target) {
    const key = target.dataset.key || '';
    this.#choices.subAffiliationKey = this.#choices.subAffiliationKey === key ? '' : key;
    await this.#rebuildState();
    this.render();
  }

  /** ComStar / Word of Blake: choose (or clear) the "birth" affiliation. */
  static async #onSelectBirthAffiliation(event, target) {
    const prev = this.#choices.birthAffiliationId;
    const id = target.dataset.id || '';
    this.#choices.birthAffiliationId = this.#choices.birthAffiliationId === id ? '' : id;
    this.#choices.birthSubAffiliationKey = ''; // birth sub is birth-affiliation-specific
    if (prev) delete this.#choices.variants[prev]; // birth caste is birth-affiliation-specific
    await this.#rebuildState();
    this.render();
  }

  static async #onSelectBirthSubAffiliation(event, target) {
    const key = target.dataset.key || '';
    this.#choices.birthSubAffiliationKey = this.#choices.birthSubAffiliationKey === key ? '' : key;
    await this.#rebuildState();
    this.render();
  }

  static async #onSelectPhenotype(event, target) {
    this.#choices.phenotypeKey = target.dataset.key || '';
    this.#state.phenotype = this.#choices.phenotypeKey;
    // Rebuild so the phenotype's attribute caps are re-applied to any leftover
    // free-spend (otherwise earlier spends stay clamped to the old caps).
    await this.#rebuildState();
    this.render();
  }

  /** Single-select stage (1 & 2): choosing the selected one again clears it. */
  static async #onSelectStageModule(event, target) {
    const stage = Number(target.dataset.stage);
    const id = target.dataset.id;
    const prev = this.#choices.modules[stage];
    this.#choices.modules[stage] = prev === id ? '' : id;
    // Clear any variant choice tied to a module that is no longer selected.
    if (prev && prev !== this.#choices.modules[stage]) delete this.#choices.variants[prev];
    await this.#rebuildState();
    this.render();
  }

  /** Multi-select stage (3 & 4): toggle membership. */
  static async #onToggleStageModule(event, target) {
    const stage = Number(target.dataset.stage);
    const id = target.dataset.id;
    const list = this.#choices.modules[stage];
    const i = list.indexOf(id);
    if (i === -1) {
      // Stage 3: block a second school of the same type (Officer is exempt).
      if (stage === 3 && await this.#stageThreeTypeConflict(id)) return;
      // Stage 3: block OCS until its prior-schooling prerequisite is met.
      if (stage === 3) {
        const byStage = await this.#loadModules();
        const m = (byStage[3] || []).find(x => x.id === id);
        if (m?.system.schoolType === 'officer' && !this.#ocsPrereqMet()) {
          ui.notifications?.warn('Officer Candidate School requires a prior Intelligence, Police or Military school with a Basic and an Advanced Field.');
          return;
        }
      }
      list.push(id);
    } else {
      list.splice(i, 1);
      delete this.#choices.variants[id];  // drop variant on deselect
      delete this.#choices.fields[id];    // drop Skill-Field choices on deselect
    }
    await this.#rebuildState();
    this.render();
  }

  /** True (and warns) if adding this Stage-3 school repeats an already-chosen
   * school type (Civilian / Intelligence / Military). Officer type is exempt. */
  async #stageThreeTypeConflict(id) {
    const byStage = await this.#loadModules();
    const list = byStage[3] || [];
    const adding = list.find(m => m.id === id);
    const type = adding?.system.schoolType;
    if (!type || type === 'officer') return false;
    const clash = this.#choices.modules[3]
      .map(sid => list.find(m => m.id === sid))
      .some(m => m && m.system.schoolType === type);
    if (clash) {
      ui.notifications?.warn(`You may not take two ${type} schools — choose a different type of schooling.`);
      return true;
    }
    return false;
  }

  /** Stage-3: pick (or clear) the single Basic Field for a school. */
  static async #onSelectFieldBasic(event, target) {
    const fc = this.#fieldChoice(target.dataset.module);
    const name = target.dataset.field;
    fc.basic = fc.basic === name ? '' : name;
    await this.#rebuildState();
    this.render();
  }

  /** Stage-3: toggle an Advanced or Special Field (respecting the 3-field cap). */
  static async #onToggleField(event, target) {
    const fc = this.#fieldChoice(target.dataset.module);
    const kind = target.dataset.kind; // 'advanced' | 'special'
    const name = target.dataset.field;
    const arr = fc[kind];
    const i = arr.indexOf(name);
    if (i !== -1) {
      arr.splice(i, 1);
      // Removing the last Advanced orphans any Specials — clear them.
      if (kind === 'advanced' && !arr.length) fc.special = [];
    } else {
      if (this.#fieldCount(fc) >= 3) { ui.notifications?.warn('A school may grant at most three Fields.'); return; }
      if (kind === 'special' && !fc.advanced.length) { ui.notifications?.warn('Choose an Advanced Field before a Special Field.'); return; }
      arr.push(name);
    }
    await this.#rebuildState();
    this.render();
  }

  /** Get (creating if needed) the Field-selection record for a school. */
  #fieldChoice(moduleId) {
    return (this.#choices.fields[moduleId] ??= { basic: '', advanced: [], special: [] });
  }

  /** Stage 4: add an instance of a Real Life module (repeatable → multiple). */
  static async #onAddStageModule(event, target) {
    const id = target.dataset.id;
    // Right-click removes one instance of this module (mirrors left-click adding
    // one), so players can dial a repeatable Stage-4 module up and down in place.
    if (event.type === 'contextmenu' || event.button === 2) {
      event.preventDefault();
      const taken = this.#choices.modules[4];
      for (let i = taken.length - 1; i >= 0; i--) {
        if (taken[i].id === id) { taken.splice(i, 1); await this.#rebuildState(); this.render(); return; }
      }
      return;
    }
    const list = (await this.#loadModules())[4] || [];
    const m = list.find(x => x.id === id);
    if (!m) return;
    // Categorical prerequisite gate.
    if (!this.#stageFourPrereqStatus(m.system).met) {
      ui.notifications?.warn(this.#stageFourPrereqStatus(m.system).reason.replace(/^Locked — /, ''));
      return;
    }
    // Non-repeatable modules can be taken only once.
    if (m.system.repeatable === false && this.#choices.modules[4].some(e => e.id === id)) {
      ui.notifications?.warn(`${m.name} cannot be repeated.`);
      return;
    }
    // Each instance carries a stable instance id (iid) so that removing one
    // instance never renumbers the others' derived pool/subskill sourceKeys.
    this.#choices.modules[4].push({ iid: foundry.utils.randomID(), id });
    await this.#rebuildState();
    this.render();
  }

  /** Stage 4: remove one taken instance by its position in the list. */
  static async #onRemoveStageInstance(event, target) {
    const idx = Number(target.dataset.index);
    if (Number.isInteger(idx) && idx >= 0 && idx < this.#choices.modules[4].length) {
      this.#choices.modules[4].splice(idx, 1);
      await this.#rebuildState();
      this.render();
    }
  }

  /** Choose (or clear) a module's variant (caste/branch sub-option). */
  static async #onSelectVariant(event, target) {
    const moduleId = target.dataset.module;
    const key = target.dataset.key || '';
    this.#choices.variants[moduleId] = this.#choices.variants[moduleId] === key ? '' : key;
    if (!this.#choices.variants[moduleId]) delete this.#choices.variants[moduleId];
    await this.#rebuildState();
    this.render();
  }

  static async #onFinish() {
    const pheno = this.#phenotypeEntry();
    const derived = CharacterBuilder.derive(this.#state, pheno);
    const modulesById = await this.#modulesByRecordId();
    const issues = [...await this.#stageFourUnmetIssues(),
      ...CharacterBuilder.validate(this.#state, { phenotype: pheno, modules: modulesById })];
    const errors = issues.filter(i => i.severity === SEVERITY.ERROR);

    let strict = false;
    try { strict = game.settings.get('mech-foundry', 'creationStrictness') === 'strict'; } catch (_e) { /* pre-ready */ }

    if (errors.length && strict) {
      ui.notifications?.error(`Cannot finish: ${errors.length} rule error(s) must be resolved (strict mode is on).`);
      this.#step = STEPS.length - 1;
      this.render();
      return;
    }

    const targetName = this.actor?.name || this.#choices.name || 'New Character';
    const warn = errors.length
      ? `<p style="color:var(--mf-danger)"><i class="fas fa-triangle-exclamation"></i> ${errors.length} unresolved issue(s) will be applied anyway (permissive mode).</p>`
      : '';
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('MECHFOUNDRY.WizardTitle') },
      content: `<p>Write this character to <strong>${foundry.utils.escapeHTML?.(targetName) ?? targetName}</strong>?</p>`
        + `<p>Attributes, XP, affiliation and phenotype will be set, and skill/trait items (re)created. Previously wizard-generated items are replaced; anything you added by hand is left untouched.</p>${warn}`,
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;

    let actor = this.actor;
    try {
      if (!actor) {
        actor = await Actor.create({ name: this.#choices.name || 'New Character', type: 'character' });
        this.actor = actor;
      }
      await grantCharacter(actor, {
        state: this.#state, derived, choices: this.#choices, phenotypeKey: this.#choices.phenotypeKey
      });
      ui.notifications?.info(`Character "${actor.name}" generated.`);
      await this.close();
      actor.sheet?.render(true);
    } catch (err) {
      console.error('mech-foundry | character grant failed:', err);
      ui.notifications?.error('Failed to write the character (see console).');
    }
  }
}
