import { CharacterBuilder, ATTRIBUTE_KEYS, SEVERITY } from '../helpers/character-builder.mjs';
import * as XP from '../helpers/xp-math.mjs';
import { ATOW_SKILLS, ATOW_TRAITS, ATOW_TRAIT_DESCRIPTIONS, ATOW_SUBSKILLS, computeStartingWealth } from '../data/atow-lists.mjs';
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
  { id: 'spend', label: 'Spend XP' },
  { id: 'review', label: 'Review' }
];

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
    affiliationId: '', subAffiliationKey: '', phenotypeKey: '',
    modules: { 1: '', 2: '', 3: [], 4: [] }, // stage -> id | id[]
    variants: {},                            // moduleId -> chosen variant key
    flexible: {},                            // sourceKey -> [{ kind, key }]  (count pools)
    lumpFlexible: {},                        // sourceKey -> [{ kind, key, amount }] (lump pools)
    subskills: {},                           // subskill sourceKey -> chosen text
    freeSpend: { attributes: {}, skills: [] } // leftover-pool spend
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
      selectPhenotype: CharacterWizard.#onSelectPhenotype,
      selectStageModule: CharacterWizard.#onSelectStageModule,
      toggleStageModule: CharacterWizard.#onToggleStageModule,
      selectVariant: CharacterWizard.#onSelectVariant,
      spendAttr: CharacterWizard.#onSpendAttr,
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

  /** Every currently-selected module doc, in application order. */
  async #selectedModuleDocs() {
    const byStage = await this.#loadModules();
    const find = (st, id) => byStage[st]?.find(m => m.id === id) || null;
    const docs = [];
    const aff = find(0, this.#choices.affiliationId);
    if (aff) docs.push(aff);
    for (const st of [1, 2]) { const m = find(st, this.#choices.modules[st]); if (m) docs.push(m); }
    for (const st of [3, 4]) for (const id of this.#choices.modules[st]) { const m = find(st, id); if (m) docs.push(m); }
    return docs;
  }

  /** Rebuild the builder state from the current choices. */
  async #rebuildState() {
    this.#state = this.#freshState();
    this.#state.phenotype = this.#choices.phenotypeKey;

    const docs = await this.#selectedModuleDocs();
    const aff = docs.find(d => Number(d.system.stage) === 0);
    if (!aff) return; // no affiliation yet -> nothing else applies

    this.#state.affiliation = aff.name;
    this.#state.affiliationKey = aff.system.affiliationKey || '';
    this.#state.isClan = this.#state.affiliationKey === 'clan';

    // Resolve the chosen sub-affiliation up front: for realms whose primary or
    // secondary languages are listed as "See sub-affiliation" (e.g. the Deep
    // Periphery, Independent), the sub overrides the affiliation's languages,
    // and the override must be known before the universal language grant.
    const sub = this._asArray(aff.system.subAffiliations)
      .find(s => s.key === this.#choices.subAffiliationKey);
    const primaryLang = sub?.primaryLanguage || aff.system.primaryLanguage || '';
    const secondaryLang = (sub && this._asArray(sub.secondaryLanguages).length)
      ? this._asArray(sub.secondaryLanguages)
      : this._asArray(aff.system.secondaryLanguages);
    this.#state.affiliationLanguages = { primary: primaryLang, secondary: secondaryLang };

    // A clean primary-language label: the resolved language, else the affiliation
    // key capitalised, else the display name without any "(...)" suffix.
    const langName = primaryLang
      || (aff.system.affiliationKey && aff.system.affiliationKey !== 'universal'
        ? aff.system.affiliationKey.charAt(0).toUpperCase() + aff.system.affiliationKey.slice(1)
        : aff.name.replace(/\s*\(.*\)\s*$/, '').trim());
    CharacterBuilder.applyUniversalFixedXP(this.#state, { primaryLanguageName: langName });

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
    }

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

    // Apply leftover-pool free spend (attributes at 100 XP/point, then skills).
    const pheno = this.#phenotypeEntry();
    for (const [key, count] of Object.entries(this.#choices.freeSpend.attributes || {})) {
      const n = Number(count) || 0;
      if (n <= 0) continue;
      const cap = pheno?.maxValues?.[key] ?? Infinity;
      // Don't buy past the phenotype cap.
      const currentScore = XP.getAttributeScoreFromXP(this.#state.attributes[key] || 0);
      const buyable = Math.max(0, Math.min(n, cap - currentScore));
      if (buyable > 0) CharacterBuilder.spendPool(this.#state, { kind: 'attribute', key, xp: buyable * 100 });
    }
    for (const s of (this.#choices.freeSpend.skills || [])) {
      const xp = Number(s?.xp) || 0;
      if (s?.key && xp > 0) CharacterBuilder.spendPool(this.#state, { kind: 'skill', key: s.key, xp });
    }
  }

  #phenotypeEntry(key = this.#choices.phenotypeKey) {
    const phenotypes = game.mechfoundry?.config?.phenotypes || {};
    return key ? phenotypes[key] || null : null;
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
      moduleCount: this.#state.modules.filter(m => {
        const id = String(m.id);
        return !id.startsWith('subaff:') && !id.startsWith('variant:');
      }).length
    };

    if (stepId === 'affiliation') {
      const affiliations = await this.#getAffiliations();
      context.hasModules = affiliations.length > 0;
      context.modules = affiliations.map(a => this.#moduleCard(a, a.id === this.#choices.affiliationId, derived));
      context.emptyKind = 'affiliation';

      // Sub-affiliations of the chosen affiliation (optional, each adds its own XP).
      const chosen = affiliations.find(a => a.id === this.#choices.affiliationId);
      const subs = this._asArray(chosen?.system.subAffiliations);
      if (subs.length) {
        context.subAffiliations = subs.map(s => ({
          key: s.key,
          name: s.name,
          selected: s.key === this.#choices.subAffiliationKey,
          grants: this.#moduleGrants(s),
          flexible: this.#flexibleSummaries(s),
          notes: s.notes || ''
        }));
        context.hasSubAffiliations = true;
      }

      // Affiliation variant (e.g. a Clan Caste) — same picker as the stage steps.
      context.variantPickers = this.#variantPickersFor(chosen ? [chosen] : []);
      context.hasVariantPickers = context.variantPickers.length > 0;
    }

    if (step.stage) {
      const byStage = await this.#loadModules();
      const list = byStage[step.stage] || [];
      const sel = this.#choices.modules[step.stage];
      const selectedIds = step.multi ? sel : (sel ? [sel] : []);
      context.stage = step.stage;
      context.multi = !!step.multi;
      context.hasModules = list.length > 0;
      context.mandatory = [1, 2].includes(step.stage);
      context.modules = list.map(m => this.#moduleCard(m, selectedIds.includes(m.id), derived));
      // Variant (caste/branch) pickers for any selected module that has variants.
      context.variantPickers = this.#variantPickersFor(selectedIds.map(id => list.find(m => m.id === id)));
      context.hasVariantPickers = context.variantPickers.length > 0;
      context.emptyKind = 'stage';
    }

    if (stepId === 'phenotype') {
      const phenotypes = game.mechfoundry?.config?.phenotypes || {};
      context.phenotypes = Object.entries(phenotypes).map(([key, p]) => ({
        key,
        label: p.label || key,
        selected: key === this.#choices.phenotypeKey,
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
      const docs = await this.#selectedModuleDocs();
      const modulesById = Object.fromEntries(docs.map(d => [d.id, d.system]));
      const issues = CharacterBuilder.validate(this.#state, { phenotype: pheno, modules: modulesById });
      context.preview = {
        ...preview,
        attributeRows: ATTRIBUTE_KEYS.map(k => ({ key: k.toUpperCase(), ...preview.attributes[k] })),
        skillRows: preview.skills.map(s => ({ ...s, levelLabel: s.level < 0 ? 'Untrained' : `L${s.level}` })),
        traitRows: preview.traits.map(t => ({ ...t, tooltip: this.#traitTooltip(t.name) }))
      };
      context.issues = issues;
      context.errorCount = issues.filter(i => i.severity === SEVERITY.ERROR).length;
      context.warningCount = issues.filter(i => i.severity === SEVERITY.WARNING).length;
      context.targetName = this.actor?.name || this.#choices.name || 'a new character';
      context.wealth = computeStartingWealth(this.#state.traits, { isClan: !!this.#state.isClan });
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
    const attributes = ATTRIBUTE_KEYS.map(k => {
      const cap = pheno?.maxValues?.[k] ?? Infinity;
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
    return { attributes, skillOptions: this.#skillOptions(), skills: rows, remaining };
  }

  /** Whether the current step is complete enough to advance / finish. */
  #canAdvance(stepId, step) {
    if (stepId === 'affiliation') {
      if (!this.#choices.affiliationId) return false;
      return !this.#missingRequiredVariantFor(this.#modulesCache?.[0], [this.#choices.affiliationId]);
    }
    if (step.stage && [1, 2].includes(step.stage)) {
      return !!this.#choices.modules[step.stage] && !this.#missingRequiredVariant(step.stage);
    }
    if (step.stage) return !this.#missingRequiredVariant(step.stage);
    if (stepId === 'flexible') {
      return CharacterBuilder.flexibleResolved(this.#state) && CharacterBuilder.subskillsResolved(this.#state);
    }
    return true;
  }

  #advanceHint(stepId, step) {
    if (stepId === 'affiliation') {
      if (!this.#choices.affiliationId) return 'Choose an affiliation to continue.';
      const a = this.#missingRequiredVariantFor(this.#modulesCache?.[0], [this.#choices.affiliationId]);
      if (a) return `Choose a ${a.label.toLowerCase()} for ${a.moduleName} to continue.`;
    }
    if (step.stage && [1, 2].includes(step.stage) && !this.#choices.modules[step.stage]) {
      return 'Choose a module for this required stage.';
    }
    if (step.stage) {
      const m = this.#missingRequiredVariant(step.stage);
      if (m) return `Choose a ${m.label.toLowerCase()} for ${m.moduleName} to continue.`;
    }
    if (stepId === 'flexible') {
      if (!CharacterBuilder.subskillsResolved(this.#state)) return 'Choose all subskills to continue.';
      if (!CharacterBuilder.flexibleResolved(this.#state)) return 'Assign all flexible XP to continue.';
    }
    return '';
  }

  /** First selected module in a stage that requires a variant but has none chosen. */
  #missingRequiredVariant(stage) {
    const sel = this.#choices.modules[stage];
    const ids = Array.isArray(sel) ? sel : (sel ? [sel] : []);
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
          const kind = s?.kind || '';
          let key = s?.key || '';
          // If an 'any' pool's kind just changed, the old value no longer fits.
          if (kind && prev[i]?.kind && prev[i].kind !== kind) key = '';
          return { kind, key };
        });
      }
    }
    if (lumpChanged) {
      for (const [sk, rows] of Object.entries(lump)) {
        this.#choices.lumpFlexible[sk] = rows
          .map(r => ({ kind: r?.kind || '', key: r?.key || '', amount: Number(r?.amount) || 0 }))
          .filter(r => r.key && r.amount > 0);
      }
    }
    if (spendChanged) {
      this.#choices.freeSpend.skills = spendSkills
        .map(s => ({ key: s?.key || '', xp: Number(s?.xp) || 0 }))
        .filter(s => s.key && s.xp > 0);
    }
    if (flexChanged || lumpChanged || spendChanged || subChanged) {
      await this.#rebuildState();
      this.render();
    }
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
    this.#choices.affiliationId = target.dataset.id || '';
    this.#choices.subAffiliationKey = ''; // sub-affiliations are affiliation-specific
    if (prev) delete this.#choices.variants[prev]; // caste is affiliation-specific
    await this.#rebuildState();
    this.render();
  }

  static async #onSelectSubAffiliation(event, target) {
    const key = target.dataset.key || '';
    this.#choices.subAffiliationKey = this.#choices.subAffiliationKey === key ? '' : key;
    await this.#rebuildState();
    this.render();
  }

  static async #onSelectPhenotype(event, target) {
    this.#choices.phenotypeKey = target.dataset.key || '';
    this.#state.phenotype = this.#choices.phenotypeKey;
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
    if (i === -1) list.push(id);
    else { list.splice(i, 1); delete this.#choices.variants[id]; } // drop variant on deselect
    await this.#rebuildState();
    this.render();
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
    const docs = await this.#selectedModuleDocs();
    const modulesById = Object.fromEntries(docs.map(d => [d.id, d.system]));
    const issues = CharacterBuilder.validate(this.#state, { phenotype: pheno, modules: modulesById });
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
