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
      affiliationKey: '',       // machine key used for module legality checks
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
      subskillPending: [],      // fixed "Skill/Any" grants awaiting a subskill
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
    // Fixed skill XP (array of {name, subskill, xp}). Subskills ending in
    // "Any" need a player choice (queued); "Affiliation" auto-resolves.
    asArray(m.fixedXP?.skills).forEach((s, i) => {
      const sub = String(s.subskill || '');
      if (/\b(any|choose|either|various)\b/i.test(sub)) {
        state.subskillPending.push({
          sourceKey: `${entry.id}#sk${i}`,
          moduleId: entry.id,
          name: s.name,
          xp: Number(s.xp) || 0,
          hint: sub,
          resolved: null
        });
      } else if (/affiliation/i.test(sub)) {
        const key = state.affiliationKey;
        const aff = key
          ? key.charAt(0).toUpperCase() + key.slice(1)
          : (state.affiliation || '').replace(/\s*\(.*\)\s*$/, '').trim() || 'Affiliation';
        CharacterBuilder.addSkillXP(state, s.name, s.xp, aff);
      } else {
        CharacterBuilder.addSkillXP(state, s.name, s.xp, s.subskill);
      }
    });
    // Fixed trait XP (array of {name, xp}).
    for (const t of asArray(m.fixedXP?.traits)) {
      CharacterBuilder.addTraitXP(state, t.name, t.xp);
    }

    // Queue flexible-XP pools for later resolution. A pool is either
    // COUNT-based ("+X each to N targets": amount × count) or a LUMP ("+N XP"
    // distributed freely across targets).
    asArray(m.flexibleXP).forEach((pool, i) => {
      state.flexiblePending.push({
        id: foundryRandomId(),
        // Deterministic across rebuilds (moduleId is the source doc id, i is the
        // pool's index in the module): lets a caller re-apply saved assignments.
        sourceKey: `${entry.id}#${i}`,
        moduleId: entry.id,
        lump: !!pool.lump,
        amount: Number(pool.amount) || 0,   // per-assignment XP (count) or total (lump)
        count: Number(pool.count) || 1,     // number of assignments (count pools)
        targets: pool.targets || 'any',     // 'attributes' | 'skills' | 'traits' | 'any'
        choices: asArray(pool.choices),     // constrained option list (empty = open)
        note: pool.note || '',
        assigned: [],                       // [{ target, amount }]  (count pools)
        allocated: 0                        // total XP placed so far (lump pools)
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

  /** True once every queued flexible pool is fully assigned/allocated. */
  static flexibleResolved(state) {
    return state.flexiblePending.every(p =>
      p.lump ? (p.allocated || 0) >= p.amount : p.assigned.length >= p.count);
  }

  /**
   * Resolve a pending "Skill/Any" subskill choice: records the choice and adds
   * the queued XP under the concrete subskill.
   * @returns {boolean} whether a pending entry was resolved
   */
  static resolveSubskill(state, sourceKey, subskill) {
    const p = state.subskillPending.find(x => x.sourceKey === sourceKey);
    if (!p || !subskill) return false;
    p.resolved = subskill;
    CharacterBuilder.addSkillXP(state, p.name, p.xp, subskill);
    return true;
  }

  /** True once every pending subskill grant has a chosen subskill. */
  static subskillsResolved(state) {
    return (state.subskillPending || []).every(p => p.resolved);
  }

  /**
   * Is a module legal for the given affiliation key?
   * A module with an empty `restrictedToAffiliations` list is available to all;
   * otherwise the affiliation key must be in the list.
   * @param {object} moduleSystem  a lifeModule's system data
   * @param {string} affiliationKey
   * @returns {boolean}
   */
  static isModuleLegal(moduleSystem, affiliationKey) {
    const restricted = asArray(moduleSystem?.restrictedToAffiliations);
    if (!restricted.length) return true;
    return restricted.map(String).includes(String(affiliationKey || ''));
  }

  /**
   * Map attribute key -> extra cap from "Exceptional Attribute/<ATTR>" traits
   * (each such trait with positive XP raises that attribute's phenotype cap by 1).
   * @param {object} state
   * @returns {Object<string, number>}
   */
  static exceptionalAttributeBonuses(state) {
    const bonuses = {};
    for (const [name, xp] of Object.entries(state.traits || {})) {
      const m = /^exceptional attribute\/([a-z]{3})/i.exec(name);
      if (m && (Number(xp) || 0) > 0) {
        const k = m[1].toLowerCase();
        if (ATTRIBUTE_KEYS.includes(k)) bonuses[k] = (bonuses[k] || 0) + 1;
      }
    }
    return bonuses;
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
    // "Exceptional Attribute/<ATTR>" traits raise that attribute's cap by 1.
    const exceptional = CharacterBuilder.exceptionalAttributeBonuses(state);

    const attributes = {};
    for (const k of ATTRIBUTE_KEYS) {
      const xp = state.attributes[k] || 0;
      const rawScore = XP.getAttributeScoreFromXP(xp);
      const baseCap = phenotype?.maxValues?.[k] ?? Infinity;
      const cap = baseCap === Infinity ? Infinity : baseCap + (exceptional[k] || 0);
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
      name, xp, tp: XP.getTraitTP(xp), type: xp < 0 ? 'negative' : 'positive'
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

    // Stage-3 count guidance (book recommends no more than two).
    const stage3count = state.modules.filter(m => m.stage === 3).length;
    if (stage3count > 2) {
      issues.push({
        severity: SEVERITY.WARNING, code: 'too-many-stage3',
        message: `${stage3count} Stage 3 (Higher Education) modules — the book recommends no more than two.`
      });
    }

    // Affiliation legality of each selected module.
    for (const rec of state.modules) {
      const sys = modules[rec.id];
      if (sys && !CharacterBuilder.isModuleLegal(sys, state.affiliationKey)) {
        issues.push({
          severity: SEVERITY.ERROR, code: 'affiliation-illegal',
          message: `${rec.name}: not available to ${state.affiliation || 'this affiliation'}.`,
          moduleId: rec.id
        });
      }
    }

    // Unresolved flexible XP.
    for (const pool of state.flexiblePending) {
      if (pool.lump) {
        const left = pool.amount - (pool.allocated || 0);
        if (left > 0) {
          issues.push({
            severity: SEVERITY.ERROR, code: 'flexible-unassigned',
            message: `${left} of ${pool.amount} flexible XP still to distribute${pool.note ? ` (${pool.note})` : ''}.`,
            moduleId: pool.moduleId
          });
        }
      } else {
        const remaining = pool.count - pool.assigned.length;
        if (remaining > 0) {
          issues.push({
            severity: SEVERITY.ERROR, code: 'flexible-unassigned',
            message: `${remaining} unassigned flexible-XP allocation(s)${pool.note ? ` (${pool.note})` : ''}.`,
            moduleId: pool.moduleId
          });
        }
      }
    }

    // Unresolved subskill choices.
    for (const p of (state.subskillPending || [])) {
      if (!p.resolved) {
        issues.push({
          severity: SEVERITY.ERROR, code: 'subskill-unresolved',
          message: `Choose a subskill for ${p.name} (${p.hint}).`,
          moduleId: p.moduleId
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
        // Prerequisites are in Trait Points; each TP = 100 XP (ATOW p.66).
        const haveTP = XP.getTraitTP(state.traits[name] ?? 0);
        if (haveTP < min) {
          issues.push({
            severity: SEVERITY.ERROR, code: 'prereq-trait',
            message: `${rec.name}: requires ${name} ≥ ${min} TP (have ${haveTP}).`,
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
