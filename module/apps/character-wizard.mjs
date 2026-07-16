import { CharacterBuilder, ATTRIBUTE_KEYS, SEVERITY } from '../helpers/character-builder.mjs';

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
    flexible: {}                             // sourceKey -> [{ kind, key }]
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
    CharacterBuilder.applyUniversalFixedXP(this.#state, { primaryLanguageName: aff.name });
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
    const context = {
      steps: STEPS.map((s, i) => ({ ...s, number: i + 1, active: i === this.#step, done: i < this.#step })),
      stepId,
      stepLabel: step.label,
      isFirst: this.#step === 0,
      isLast: this.#step === STEPS.length - 1,
      choices: this.#choices,
      remaining,
      remainingClass: remaining < 0 ? 'over' : '',
      age: this.#state.age,
      moduleCount: this.#state.modules.length
    };

    if (stepId === 'affiliation') {
      const affiliations = await this.#getAffiliations();
      context.hasModules = affiliations.length > 0;
      context.modules = affiliations.map(a => this.#moduleCard(a, a.id === this.#choices.affiliationId));
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
        m, step.multi ? sel.includes(m.id) : sel === m.id
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

    if (stepId === 'review') {
      const pheno = this.#phenotypeEntry();
      const preview = CharacterBuilder.derive(this.#state, pheno);
      const docs = await this.#selectedModuleDocs();
      const modulesById = Object.fromEntries(docs.map(d => [d.id, d.system]));
      const issues = CharacterBuilder.validate(this.#state, { phenotype: pheno, modules: modulesById });
      context.preview = {
        ...preview,
        attributeRows: ATTRIBUTE_KEYS.map(k => ({ key: k.toUpperCase(), ...preview.attributes[k] })),
        skillRows: preview.skills.map(s => ({ ...s, levelLabel: s.level < 0 ? 'untrained' : s.level }))
      };
      context.issues = issues;
      context.errorCount = issues.filter(i => i.severity === SEVERITY.ERROR).length;
      context.warningCount = issues.filter(i => i.severity === SEVERITY.WARNING).length;
      context.previewOnly = true; // M3/M4: no commit yet
    }

    return context;
  }

  #moduleCard(doc, selected) {
    const sys = doc.system;
    const pre = this.#prereqSummary(sys.prerequisites);
    return {
      id: doc.id,
      name: doc.name,
      img: doc.img,
      selected,
      cost: sys.xpCost || 0,
      time: sys.time || 0,
      summary: this.#summariseFixedXP(sys),
      prereq: pre
    };
  }

  #summariseFixedXP(system) {
    const parts = [];
    const attrs = system.fixedXP?.attributes || {};
    const attrStr = Object.entries(attrs).map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`).join(', ');
    if (attrStr) parts.push(attrStr);
    const skills = (system.fixedXP?.skills || []).length;
    if (skills) parts.push(`${skills} skill${skills === 1 ? '' : 's'}`);
    const traits = (system.fixedXP?.traits || []).length;
    if (traits) parts.push(`${traits} trait${traits === 1 ? '' : 's'}`);
    return parts.join(' · ') || 'No fixed XP';
  }

  #prereqSummary(pre) {
    if (!pre) return '';
    const bits = [];
    for (const [k, v] of Object.entries(pre.attributes || {})) bits.push(`${k.toUpperCase()} ≥ ${v}`);
    for (const [k, v] of Object.entries(pre.skills || {})) bits.push(`${k} ≥ ${v}`);
    for (const [k, v] of Object.entries(pre.traits || {})) bits.push(`${k} ≥ ${v}`);
    return bits.join(', ');
  }

  /** Build the flexible-XP step context from the live pending pools. */
  #buildFlexibleContext() {
    return this.#state.flexiblePending.map(pool => {
      const kind = kindForTargets(pool.targets);
      const saved = this.#choices.flexible[pool.sourceKey] || [];
      const attrChoices = (pool.choices.length ? pool.choices : ATTRIBUTE_KEYS)
        .map(k => ({ value: k, label: k.toUpperCase() }));
      const moduleName = this.#state.modules.find(m => m.id === pool.moduleId)?.name || '';
      return {
        sourceKey: pool.sourceKey,
        note: pool.note || `${pool.amount} XP × ${pool.count}`,
        amount: pool.amount,
        count: pool.count,
        moduleName,
        targets: pool.targets,
        isAttribute: kind === 'attribute',
        isSkill: kind === 'skill',
        isTrait: kind === 'trait',
        isAny: kind === null,
        attrChoices,
        slots: Array.from({ length: pool.count }, (_, i) => ({
          idx: i,
          key: saved[i]?.key || '',
          kind: saved[i]?.kind || ''
        }))
      };
    });
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
    if (flexChanged) {
      for (const [sk, slots] of Object.entries(collected)) {
        this.#choices.flexible[sk] = slots.map(s => ({ kind: s?.kind || '', key: s?.key || '' }));
      }
      await this.#rebuildState();
      this.render();
    }
  }

  static async #onBack() { if (this.#step > 0) { this.#step -= 1; this.render(); } }
  static async #onNext() { if (this.#step < STEPS.length - 1) { this.#step += 1; this.render(); } }

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
    ui.notifications?.info('Character preview complete. Writing to an actor arrives in a later update (M5).');
  }
}
