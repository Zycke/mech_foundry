import * as XP from './xp-math.mjs';

/**
 * character-builder.mjs
 * ---------------------
 * Framework-agnostic computation engine for the A Time of War life-module
 * character-creation wizard (see docs/CHARACTER_CREATION_PLAN.md, milestone M1).
 *
 * This file contains NO UI and NO Foundry-document mutation. It maintains an
 * in-memory "builder state" (a plain object), applies life modules to it,
 * tracks flexible-XP decisions, and can derive a preview character and validate
 * it. The wizard (a later milestone) drives this engine and, only at the very
 * end, writes the result to an Actor.
 *
 * All XP math delegates to the single source of truth in helpers/xp-math.mjs
 * (ATTRIBUTE_XP_PER_POINT, SKILL_XP_COSTS, get*FromXP). Anything a GM might want
 * to tune (starting pool, baseline age, universal-allotment cost, per-point
 * cost) is exposed via BUILDER_DEFAULTS and overridable per state so it can be
 * driven from world settings rather than hard-coded.
 */

/**
 * Rulebook defaults (A Time of War, Character Creation chapter). Every value is
 * overridable when a state is created so a GM setting can supersede it.
 */
export const BUILDER_DEFAULTS = Object.freeze({
  startingXP: 5000,           // baseline human XP pool (ATOW p.49)
  baselineAge: 21,            // human baseline starting age
  clanBaselineAge: 18,        // Clan warrior baseline starting age
  xpPerYearOverBaseline: 100, // aging adjustment (applied post-creation)
  universalCost: 850,         // mandatory Stage 0 universal allotment cost
  attributeXpPerPoint: 100,   // mirrors XP.ATTRIBUTE_XP_PER_POINT
  minModules: 1,
  typicalModules: 5,
  maxModules: 10
});

/** The eight ATOW attribute keys, in canonical order. */
export const ATTRIBUTE_KEYS = Object.freeze(['str', 'bod', 'rfl', 'dex', 'int', 'wil', 'cha', 'edg']);

/** Mandatory single-module stages that every character must fill. */
export const MANDATORY_STAGES = Object.freeze([0, 1, 2]);

/** Severity levels for validation issues. */
export const SEVERITY = Object.freeze({ ERROR: 'error', WARNING: 'warning' });

export class CharacterBuilder {
  /* ---------------------------------------------------------------------- */
  /*  State construction                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Create a fresh builder state.
   * @param {object} [options]
   * @param {number} [options.startingXP]  Override the XP pool (GM setting).
   * @param {boolean} [options.isClan]     Use the Clan baseline age.
   * @param {object} [options.config]      Partial override of BUILDER_DEFAULTS.
   * @returns {object} builder state
   */
  static createState({ startingXP, isClan = false, config = {} } = {}) {
    const cfg = { ...BUILDER_DEFAULTS, ...config };
    const pool = Number.isFinite(startingXP) ? startingXP : cfg.startingXP;
    return {
      config: cfg,
      isClan,
      // Identity / choices
      affiliation: '',
      subAffiliation: '',
      phenotype: '',
      // Economy
      startingXP: pool,
      spent: 0,                 // XP paid out of the pool for modules & free spend
      // Age accumulates from each module's `time` (years lived), starting at
      // birth. The config baseline age (21 human / 18 Clan) is only the XP-pool
      // reference and the threshold for post-creation aging XP — NOT a starting
      // offset. A standard 5-module build lands around the baseline.
      age: 0,
      universalApplied: false,
      // Accumulated stat XP (the character being built)
      attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(k => [k, 0])),
      skills: {},               // keyed by "Skill" or "Skill/Subskill" -> xp
      traits: {},               // keyed by trait name -> xp (may be negative)
      languages: {},            // id -> { name, type }
      // Bookkeeping
      modules: [],              // [{ id, stage, name, xpCost, source }]
      flexiblePending: [],      // unresolved flexible-XP pools
      cbills: 0
    };
  }

  /** Remaining, unspent XP in the pool. */
  static remaining(state) {
    return state.startingXP - state.spent;
  }

  /* ---------------------------------------------------------------------- */
  /*  Low-level accumulation (never touches the pool by themselves)          */
  /* ---------------------------------------------------------------------- */

  static addAttributeXP(state, key, xp) {
    if (!ATTRIBUTE_KEYS.includes(key)) throw new Error(`Unknown attribute: ${key}`);
    state.attributes[key] = (state.attributes[key] || 0) + (Number(xp) || 0);
  }

  /** Skill key is the display name, optionally "Root/Subskill". */
  static skillKey(name, subskill) {
    return subskill ? `${name}/${subskill}` : String(name);
  }

  static addSkillXP(state, name, xp, subskill) {
    const key = CharacterBuilder.skillKey(name, subskill);
    state.skills[key] = (state.skills[key] || 0) + (Number(xp) || 0);
  }

  static addTraitXP(state, name, xp) {
    state.traits[name] = (state.traits[name] || 0) + (Number(xp) || 0);
  }

  /* ---------------------------------------------------------------------- */
  /*  Modules                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Apply the mandatory universal allotment (ATOW p.63): pay `universalCost`
   * and gain +100 XP to each attribute, primary-language XP, English XP and
   * Perception XP. Idempotent — a second call is a no-op.
   * @param {object} state
   * @param {object} [opts]
   * @param {string} [opts.primaryLanguageName]  Language/<Affiliation> label.
   */
  static applyUniversalFixedXP(state, { primaryLanguageName = 'Affiliation Primary' } = {}) {
    if (state.universalApplied) return state;
    const perAttr = state.config.attributeXpPerPoint; // +100 to each attribute
    for (const k of ATTRIBUTE_KEYS) CharacterBuilder.addAttributeXP(state, k, perAttr);
    CharacterBuilder.addSkillXP(state, `Language/${primaryLanguageName}`, 20);
    CharacterBuilder.addSkillXP(state, 'Language/English', 20);
    CharacterBuilder.addSkillXP(state, 'Perception', 10);
    state.spent += state.config.universalCost;
    state.universalApplied = true;
    return state;
  }

  /**
   * Apply a structured life module to the state. Pays the module's XP cost,
   * accumulates its fixed XP, queues its flexible-XP pools, and advances age.
   *
   * @param {object} state
   * @param {object} module   A lifeModule item's system data (see the
   *                          template.json lifeModule schema / plan §3a).
   * @param {object} [meta]   { id, name } identifying the source document.
   * @returns {object} state
   */
  static applyModule(state, module, meta = {}) {
    const m = module || {};
    const entry = {
      id: meta.id || foundryRandomId(),
      stage: Number(m.stage) || 0,
      name: meta.name || m.name || '(unnamed module)',
      xpCost: Number(m.xpCost) || 0,
      source: meta.uuid || null
    };

    // Pay the cost.
    state.spent += entry.xpCost;

    // Fixed attribute XP.
    const fa = m.fixedXP?.attributes || {};
    for (const [k, xp] of Object.entries(fa)) {
      if (ATTRIBUTE_KEYS.includes(k)) CharacterBuilder.addAttributeXP(state, k, xp);
    }
    // Fixed skill XP (array of {name, subskill, xp}).
    for (const s of asArray(m.fixedXP?.skills)) {
      CharacterBuilder.addSkillXP(state, s.name, s.xp, s.subskill);
    }
    // Fixed trait XP (array of {name, xp}).
    for (const t of asArray(m.fixedXP?.traits)) {
      CharacterBuilder.addTraitXP(state, t.name, t.xp);
    }

    // Queue flexible-XP pools for later resolution.
    asArray(m.flexibleXP).forEach((pool, i) => {
      state.flexiblePending.push({
        id: foundryRandomId(),
        // Deterministic across rebuilds (moduleId is the source doc id, i is the
        // pool's index in the module): lets a caller re-apply saved assignments.
        sourceKey: `${entry.id}#${i}`,
        moduleId: entry.id,
        amount: Number(pool.amount) || 0,   // XP per assignment
        count: Number(pool.count) || 1,     // number of assignments allowed
        targets: pool.targets || 'any',     // 'attributes' | 'skills' | 'traits' | 'any'
        choices: asArray(pool.choices),     // constrained option list (empty = open)
        note: pool.note || '',
        assigned: []                        // [{ target, amount }]
      });
    });

    // Age / time.
    state.age += Number(m.time) || 0;

    state.modules.push(entry);
    return state;
  }

  /** Remove a previously-applied module and reverse its effects. */
  static removeModule(state, moduleId) {
    const idx = state.modules.findIndex(e => e.id === moduleId);
    if (idx === -1) return state;
    // Simplest correct approach: rebuild is the caller's job for full fidelity.
    // Here we only drop the record and its pending flexible pools; callers that
    // need exact XP reversal should re-derive from the surviving module list.
    state.flexiblePending = state.flexiblePending.filter(p => p.moduleId !== moduleId);
    state.modules.splice(idx, 1);
    return state;
  }

  /* ---------------------------------------------------------------------- */
  /*  Flexible XP resolution                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Assign one increment of a flexible pool to a concrete target.
   * @param {object} state
   * @param {string} poolId
   * @param {object} target  { kind: 'attribute'|'skill'|'trait', key, subskill? }
   * @returns {object} state
   */
  static assignFlexible(state, poolId, target) {
    const pool = state.flexiblePending.find(p => p.id === poolId);
    if (!pool) throw new Error(`No pending flexible pool: ${poolId}`);
    if (pool.assigned.length >= pool.count) {
      throw new Error(`Flexible pool already fully assigned`);
    }
    if (pool.choices.length && target.key && !pool.choices.includes(target.key)) {
      throw new Error(`"${target.key}" is not an allowed choice for this pool`);
    }
    const amount = pool.amount;
    switch (target.kind) {
      case 'attribute': CharacterBuilder.addAttributeXP(state, target.key, amount); break;
      case 'skill':     CharacterBuilder.addSkillXP(state, target.key, amount, target.subskill); break;
      case 'trait':     CharacterBuilder.addTraitXP(state, target.key, amount); break;
      default: throw new Error(`Unknown flexible target kind: ${target.kind}`);
    }
    pool.assigned.push({ ...target, amount });
    return state;
  }

  /** True once every queued flexible pool is fully assigned. */
  static flexibleResolved(state) {
    return state.flexiblePending.every(p => p.assigned.length >= p.count);
  }

  /* ---------------------------------------------------------------------- */
  /*  Free spend (leftover pool / point-buy cleanup)                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Spend leftover pool XP directly (point-buy). Deducts from the pool AND
   * accumulates the stat XP. Returns false if the pool can't cover it.
   */
  static spendPool(state, { kind, key, subskill, xp }) {
    const cost = Number(xp) || 0;
    if (cost > CharacterBuilder.remaining(state)) return false;
    switch (kind) {
      case 'attribute': CharacterBuilder.addAttributeXP(state, key, cost); break;
      case 'skill':     CharacterBuilder.addSkillXP(state, key, cost, subskill); break;
      case 'trait':     CharacterBuilder.addTraitXP(state, key, cost); break;
      default: return false;
    }
    state.spent += cost;
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /*  Derivation                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Produce a preview of the finished character from accumulated XP.
   * @param {object} state
   * @param {object} [phenotype]  A CONFIG.mechfoundry.phenotypes entry
   *                              ({ modifiers, maxValues, bonusTraits }).
   * @returns {object} derived character preview
   */
  static derive(state, phenotype = null) {
    const attributes = {};
    for (const k of ATTRIBUTE_KEYS) {
      const xp = state.attributes[k] || 0;
      const rawScore = XP.getAttributeScoreFromXP(xp);
      const cap = phenotype?.maxValues?.[k] ?? Infinity;
      const value = Math.min(rawScore, cap);
      const modifier = phenotype?.modifiers?.[k] ?? 0;
      const total = value + modifier;
      attributes[k] = {
        xp,
        value,
        modifier,
        total,
        linkMod: XP.getLinkModifier(total),
        cappedBy: rawScore > cap ? cap : null,
        wastedXP: rawScore > cap ? xp - XP.getAttributeXPCost(cap) : 0
      };
    }

    const skills = Object.entries(state.skills).map(([key, xp]) => {
      const [name, subskill] = key.split('/');
      return { key, name, subskill: subskill || '', xp, level: XP.getSkillLevelFromXP(xp) };
    }).sort((a, b) => a.key.localeCompare(b.key));

    const traits = Object.entries(state.traits).map(([name, xp]) => ({
      name, xp, type: xp < 0 ? 'negative' : 'positive'
    })).sort((a, b) => a.name.localeCompare(b.name));

    return {
      affiliation: state.affiliation,
      subAffiliation: state.subAffiliation,
      phenotype: state.phenotype,
      age: state.age,
      startingXP: state.startingXP,
      spent: state.spent,
      remaining: CharacterBuilder.remaining(state),
      moduleCount: state.modules.length,
      attributes,
      skills,
      traits,
      languages: { ...state.languages },
      cbills: state.cbills
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Validation                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Validate the current state. Returns an array of issues; the wizard decides
   * whether ERROR blocks "Finish" (strict) or is merely surfaced (permissive).
   *
   * @param {object} state
   * @param {object} [opts]
   * @param {object} [opts.phenotype]  phenotype entry for cap checks
   * @param {Array}  [opts.modules]    the applied modules' full system data,
   *                                   keyed to state.modules by id, for prereqs
   * @returns {Array<{severity, code, message, moduleId?}>}
   */
  static validate(state, { phenotype = null, modules = {} } = {}) {
    const issues = [];
    const derived = CharacterBuilder.derive(state, phenotype);

    // Pool math.
    if (derived.remaining < 0) {
      issues.push({
        severity: SEVERITY.ERROR, code: 'pool-overspent',
        message: `XP pool overspent by ${Math.abs(derived.remaining)}.`
      });
    }

    // Mandatory stages present.
    const stagesPresent = new Set(state.modules.map(m => m.stage));
    for (const stage of MANDATORY_STAGES) {
      if (!stagesPresent.has(stage)) {
        issues.push({
          severity: SEVERITY.ERROR, code: 'missing-stage',
          message: `Missing a mandatory Stage ${stage} module.`
        });
      }
    }
    if (!state.universalApplied) {
      issues.push({
        severity: SEVERITY.ERROR, code: 'missing-universal',
        message: 'The universal Stage 0 allotment has not been applied.'
      });
    }

    // Unresolved flexible XP.
    for (const pool of state.flexiblePending) {
      const remaining = pool.count - pool.assigned.length;
      if (remaining > 0) {
        issues.push({
          severity: SEVERITY.ERROR, code: 'flexible-unassigned',
          message: `${remaining} unassigned flexible-XP allocation(s)${pool.note ? ` (${pool.note})` : ''}.`,
          moduleId: pool.moduleId
        });
      }
    }

    // Phenotype attribute caps (wasted XP over the cap).
    for (const [k, a] of Object.entries(derived.attributes)) {
      if (a.cappedBy != null && a.wastedXP > 0) {
        issues.push({
          severity: SEVERITY.WARNING, code: 'attribute-over-cap',
          message: `${k.toUpperCase()} exceeds the phenotype cap of ${a.cappedBy}; ${a.wastedXP} XP is wasted.`
        });
      }
    }

    // Module prerequisites (checked at the end, most-restrictive-wins is handled
    // implicitly by checking every module's own minimums against final values).
    for (const rec of state.modules) {
      const full = modules[rec.id];
      const pre = full?.prerequisites;
      if (!pre) continue;
      for (const [k, min] of Object.entries(pre.attributes || {})) {
        const have = derived.attributes[k]?.total ?? 0;
        if (have < min) {
          issues.push({
            severity: SEVERITY.ERROR, code: 'prereq-attribute',
            message: `${rec.name}: requires ${k.toUpperCase()} ≥ ${min} (have ${have}).`,
            moduleId: rec.id
          });
        }
      }
      for (const [name, min] of Object.entries(pre.skills || {})) {
        const found = derived.skills.find(s => s.key === name || s.name === name);
        const have = found?.level ?? -1;
        if (have < min) {
          issues.push({
            severity: SEVERITY.ERROR, code: 'prereq-skill',
            message: `${rec.name}: requires ${name} ≥ ${min} (have ${have < 0 ? 'untrained' : have}).`,
            moduleId: rec.id
          });
        }
      }
      for (const [name, min] of Object.entries(pre.traits || {})) {
        // Trait XP -> TP is trait-specific; treat the prereq as an XP floor for
        // now (a per-trait TP table can refine this later).
        const have = state.traits[name] ?? 0;
        if (have < min) {
          issues.push({
            severity: SEVERITY.ERROR, code: 'prereq-trait',
            message: `${rec.name}: requires ${name} (≥ ${min}).`,
            moduleId: rec.id
          });
        }
      }
    }

    return issues;
  }
}

/* -------------------------------------------------------------------------- */
/*  Small utilities (kept local so the engine has no Foundry hard dependency  */
/*  beyond the shared XP tables in xp-math.mjs).                              */
/* -------------------------------------------------------------------------- */

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'object') return Object.values(v);
  return [v];
}

/** Use Foundry's randomID when present; fall back to a simple id otherwise. */
function foundryRandomId() {
  try {
    if (typeof foundry !== 'undefined' && foundry.utils?.randomID) return foundry.utils.randomID();
  } catch (_e) { /* not in Foundry */ }
  return 'id' + Math.abs(hashCounter++).toString(36) + (idSeed++).toString(36);
}
let hashCounter = 0x9e3779b1;
let idSeed = 1;
