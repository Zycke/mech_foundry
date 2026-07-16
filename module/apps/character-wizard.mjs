import { CharacterBuilder, ATTRIBUTE_KEYS, SEVERITY } from '../helpers/character-builder.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PACK_ID = 'mech-foundry.life-modules';

/**
 * The ordered wizard steps. Later milestones (M4) insert the Stage 1-4 module
 * steps and the flexible-XP / cleanup step between "phenotype" and "review".
 */
const STEPS = [
  { id: 'concept', label: 'Concept' },
  { id: 'affiliation', label: 'Affiliation' },
  { id: 'phenotype', label: 'Phenotype' },
  { id: 'review', label: 'Review' }
];

/**
 * character-wizard.mjs
 * --------------------
 * Step-by-step A Time of War character-creation wizard (ApplicationV2), M3 shell.
 *
 * This milestone implements the frame (stepper, footer with live XP/age,
 * Back/Next) and the Concept, Affiliation and Phenotype steps, reading modules
 * from the `mech-foundry.life-modules` compendium into a CharacterBuilder state,
 * plus a live Review preview. It does NOT yet commit to the actor — Finish is a
 * preview endpoint until milestone M5.
 */
export class CharacterWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {object} CharacterBuilder state (rebuilt from #choices). */
  #state;
  /** @type {number} current step index into STEPS */
  #step = 0;
  /** @type {{name:string, player:string, affiliationId:string, phenotypeKey:string}} */
  #choices = { name: '', player: '', affiliationId: '', phenotypeKey: '' };
  /** @type {Array|null} cached Stage 0 affiliation modules from the pack */
  #affiliations = null;
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
    position: { width: 760, height: 720 },
    window: { title: 'MECHFOUNDRY.WizardTitle', icon: 'fa-solid fa-hat-wizard', resizable: true },
    form: { handler: CharacterWizard.#onFormChange, submitOnChange: true, closeOnSubmit: false },
    actions: {
      back: CharacterWizard.#onBack,
      next: CharacterWizard.#onNext,
      selectAffiliation: CharacterWizard.#onSelectAffiliation,
      selectPhenotype: CharacterWizard.#onSelectPhenotype,
      finish: CharacterWizard.#onFinish
    }
  };

  /** @override */
  static PARTS = {
    body: { template: 'systems/mech-foundry/templates/apps/character-wizard.hbs' }
  };

  /* ---------------------------------------------------------------------- */
  /*  State                                                                  */
  /* ---------------------------------------------------------------------- */

  #freshState() {
    let startingXP;
    try { startingXP = game.settings.get('mech-foundry', 'creationStartingXP'); } catch (_e) { /* pre-ready */ }
    return CharacterBuilder.createState({ startingXP });
  }

  /** Load (and cache) the Stage 0 affiliations from the compendium. */
  async #getAffiliations() {
    if (this.#affiliations) return this.#affiliations;
    const pack = game.packs?.get(PACK_ID);
    if (!pack) { this.#affiliations = []; return this.#affiliations; }
    const docs = await pack.getDocuments();
    this.#affiliations = docs
      .filter(d => d.type === 'lifeModule'
        && Number(d.system.stage) === 0
        && d.system.moduleType === 'affiliation'
        && d.system.affiliationKey !== 'universal')
      .sort((a, b) => a.name.localeCompare(b.name));
    return this.#affiliations;
  }

  /**
   * Rebuild the builder state from the current choices. Applies the universal
   * allotment and the chosen affiliation. (Stage 1-4 module application is
   * added in M4.)
   */
  async #rebuildState() {
    this.#state = this.#freshState();
    if (!this.#choices.affiliationId) return;
    const affiliations = await this.#getAffiliations();
    const aff = affiliations.find(a => a.id === this.#choices.affiliationId);
    if (!aff) { this.#choices.affiliationId = ''; return; }
    CharacterBuilder.applyUniversalFixedXP(this.#state, { primaryLanguageName: aff.name });
    CharacterBuilder.applyModule(this.#state, aff.system, { id: aff.id, name: aff.name, uuid: aff.uuid });
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
    const stepId = STEPS[this.#step].id;
    const remaining = CharacterBuilder.remaining(this.#state);
    const context = {
      steps: STEPS.map((s, i) => ({ ...s, index: i, number: i + 1, active: i === this.#step, done: i < this.#step })),
      stepId,
      stepLabel: STEPS[this.#step].label,
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
      context.affiliations = affiliations.map(a => ({
        id: a.id,
        name: a.name,
        img: a.img,
        selected: a.id === this.#choices.affiliationId,
        summary: this.#summariseFixedXP(a.system)
      }));
      context.hasAffiliations = affiliations.length > 0;
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

    if (stepId === 'review') {
      const pheno = this.#phenotypeEntry();
      const preview = CharacterBuilder.derive(this.#state, pheno);
      const modulesById = Object.fromEntries(
        (this.#affiliations || []).map(a => [a.id, a.system])
      );
      const issues = CharacterBuilder.validate(this.#state, { phenotype: pheno, modules: modulesById });
      context.preview = {
        ...preview,
        attributeRows: ATTRIBUTE_KEYS.map(k => ({ key: k.toUpperCase(), ...preview.attributes[k] })),
        skillRows: preview.skills.map(s => ({ ...s, levelLabel: s.level < 0 ? 'untrained' : s.level }))
      };
      context.issues = issues;
      context.errorCount = issues.filter(i => i.severity === SEVERITY.ERROR).length;
      context.warningCount = issues.filter(i => i.severity === SEVERITY.WARNING).length;
      context.previewOnly = true; // M3: no commit yet
    }

    return context;
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

  /* ---------------------------------------------------------------------- */
  /*  Actions                                                                */
  /* ---------------------------------------------------------------------- */

  /** Persist free-text concept fields on every change. */
  static async #onFormChange(event, form, formData) {
    const data = formData.object;
    if ('name' in data) this.#choices.name = data.name;
    if ('player' in data) this.#choices.player = data.player;
    // No re-render needed for plain text capture.
  }

  static async #onBack() {
    if (this.#step > 0) { this.#step -= 1; this.render(); }
  }

  static async #onNext() {
    if (this.#step < STEPS.length - 1) { this.#step += 1; this.render(); }
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

  static async #onFinish() {
    // M5 will commit to the actor here. For now this is a preview endpoint.
    ui.notifications?.info('Character preview complete. Committing to an actor arrives in a later update (M5).');
  }
}
