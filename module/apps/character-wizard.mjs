import { CharacterBuilder, ATTRIBUTE_KEYS, SEVERITY } from '../helpers/character-builder.mjs';
import * as XP from '../helpers/xp-math.mjs';
import { ATOW_SKILLS, ATOW_TRAITS, ATOW_TRAIT_DESCRIPTIONS } from '../data/atow-lists.mjs';
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
    affiliationId: '', phenotypeKey: '',
    modules: { 1: '', 2: '', 3: [], 4: [] }, // stage -> id | id[]
    flexible: {},                            // sourceKey -> [{ kind, key }]
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
      selectPhenotype: CharacterWizard.#onSelectPhenotype,
      selectStageModule: CharacterWizard.#onSelectStageModule,
      toggleStageModule: CharacterWizard.#onToggleStageModule,
      spendAttr: CharacterWizard.#onSpendAttr,
      finish: CharacterWizard.#onFinish
    }
  };

  /** @override */
  static PARTS = {
    body: { template: 'systems/mech-foundry/templates/apps/character-wizard.hbs' }
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
    // A clean primary-language label: an explicit field, else the affiliation
    // key capitalised, else the display name without any "(...)" suffix.
    const langName = aff.system.primaryLanguage
      || (aff.system.affiliationKey && aff.system.affiliationKey !== 'universal'
        ? aff.system.affiliationKey.charAt(0).toUpperCase() + aff.system.affiliationKey.slice(1)
        : aff.name.replace(/\s*\(.*\)\s*$/, '').trim());
    CharacterBuilder.applyUniversalFixedXP(this.#state, { primaryLanguageName: langName });
    for (const d of docs) {
      CharacterBuilder.applyModule(this.#state, d.system, { id: d.id, name: d.name, uuid: d.uuid });
    }

    // Re-apply saved flexible assignments against the freshly-created pools.
    for (const pool of this.#state.flexiblePending) {
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
      moduleCount: this.#state.modules.length
    };

    if (stepId === 'affiliation') {
      const affiliations = await this.#getAffiliations();
      context.hasModules = affiliations.length > 0;
      context.modules = affiliations.map(a => this.#moduleCard(a, a.id === this.#choices.affiliationId, derived));
      context.emptyKind = 'affiliation';
    }

    if (step.stage) {
      const byStage = await this.#loadModules();
      const list = byStage[step.stage] || [];
      const sel = this.#choices.modules[step.stage];
      context.stage = step.stage;
      context.multi = !!step.multi;
      context.hasModules = list.length > 0;
      context.mandatory = [1, 2].includes(step.stage);
      context.modules = list.map(m => this.#moduleCard(
        m, step.multi ? sel.includes(m.id) : sel === m.id, derived
      ));
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
    }

    return context;
  }

  #moduleCard(doc, selected, derived) {
    const sys = doc.system;
    const legal = CharacterBuilder.isModuleLegal(sys, this.#state.affiliationKey);
    const pre = this.#prereqStatus(sys.prerequisites, derived);
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
      legal,
      restrictedTo: legal ? '' : this._asArray(sys.restrictedToAffiliations).join(', ')
    };
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
      if ((this.#state.traits[k] ?? 0) < min) met = false;
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

  /** Short descriptions of a module's flexible-XP pools (for the card). */
  #flexibleSummaries(system) {
    return (system.flexibleXP || []).map(p =>
      p.note || `${p.amount} XP × ${p.count} (${p.targets || 'any'})`);
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

  /** Build the flexible-XP step context — every slot resolves to a dropdown. */
  #buildFlexibleContext() {
    const skillOptions = this.#skillOptions();
    const traitOptions = this.#traitOptions();
    const attrAll = ATTRIBUTE_KEYS.map(k => ({ value: k, label: k.toUpperCase() }));
    const optionsFor = (kind) => kind === 'skill' ? skillOptions : kind === 'trait' ? traitOptions : attrAll;

    return this.#state.flexiblePending.map(pool => {
      const baseKind = kindForTargets(pool.targets); // null = 'any'
      const attrChoices = (pool.choices.length ? pool.choices : ATTRIBUTE_KEYS)
        .map(k => ({ value: k, label: k.toUpperCase() }));
      const saved = this.#choices.flexible[pool.sourceKey] || [];
      const moduleName = this.#state.modules.find(m => m.id === pool.moduleId)?.name || '';

      const slots = Array.from({ length: pool.count }, (_, i) => {
        const s = saved[i] || {};
        // 'any' pools let the player pick the kind; fixed-kind pools use it.
        const kind = baseKind || s.kind || 'attribute';
        const options = baseKind === 'attribute' ? attrChoices : optionsFor(kind);
        return { idx: i, isAny: baseKind === null, kind, key: s.key || '', options };
      });

      return {
        sourceKey: pool.sourceKey,
        note: pool.note || `${pool.amount} XP`,
        amount: pool.amount,
        count: pool.count,
        moduleName,
        slots
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
    if (stepId === 'affiliation') return !!this.#choices.affiliationId;
    if (step.stage && [1, 2].includes(step.stage)) return !!this.#choices.modules[step.stage];
    if (stepId === 'flexible') return CharacterBuilder.flexibleResolved(this.#state);
    return true;
  }

  #advanceHint(stepId, step) {
    if (stepId === 'affiliation' && !this.#choices.affiliationId) return 'Choose an affiliation to continue.';
    if (step.stage && [1, 2].includes(step.stage) && !this.#choices.modules[step.stage]) {
      return 'Choose a module for this required stage.';
    }
    if (stepId === 'flexible' && !CharacterBuilder.flexibleResolved(this.#state)) {
      return 'Assign all flexible XP to continue.';
    }
    return '';
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
    if (spendChanged) {
      this.#choices.freeSpend.skills = spendSkills
        .map(s => ({ key: s?.key || '', xp: Number(s?.xp) || 0 }))
        .filter(s => s.key && s.xp > 0);
    }
    if (flexChanged || spendChanged) {
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
    this.#choices.affiliationId = target.dataset.id || '';
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
    this.#choices.modules[stage] = this.#choices.modules[stage] === id ? '' : id;
    await this.#rebuildState();
    this.render();
  }

  /** Multi-select stage (3 & 4): toggle membership. */
  static async #onToggleStageModule(event, target) {
    const stage = Number(target.dataset.stage);
    const id = target.dataset.id;
    const list = this.#choices.modules[stage];
    const i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);
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
