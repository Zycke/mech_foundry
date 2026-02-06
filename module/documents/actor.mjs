import { OpposedRollHelper } from '../helpers/opposed-rolls.mjs';
import { SocketHandler, SOCKET_EVENTS } from '../helpers/socket-handler.mjs';
import { DiceMechanics } from '../helpers/dice-mechanics.mjs';
import { ItemEffectsHelper } from '../helpers/effects-helper.mjs';
import { AOEHelper } from '../helpers/aoe-helper.mjs';

/**
 * Extend the base Actor document for Mech Foundry system
 * Based on A Time of War mechanics
 * @extends {Actor}
 */
export class MechFoundryActor extends Actor {

  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded documents or derived data
  }

  /** @override */
  prepareDerivedData() {
    const actorData = this;
    const systemData = actorData.system;

    // Calculate total attribute scores (base + modifier, capped at 9)
    this._calculateAttributeTotals(systemData);

    // Apply active effect modifiers to attributes
    this._applyActiveEffectModifiers(systemData, 'attribute');

    // Apply item effect modifiers to attributes
    this._applyItemEffectModifiers(systemData, 'attribute');

    // Calculate Link Attribute Modifiers for all attributes
    this._calculateLinkModifiers(systemData);

    // Calculate derived values
    this._calculateDerivedStats(systemData);

    // Apply active effect modifiers to movement
    this._applyActiveEffectModifiers(systemData, 'movement');

    // Apply item effect modifiers to movement
    this._applyItemEffectModifiers(systemData, 'movement');

    // Calculate total XP (available + spent)
    if (systemData.xp) {
      systemData.xp.total = (systemData.xp.value || 0) + (systemData.xp.spent || 0);
    }

    // Store active skill modifiers for use in rolls
    systemData.activeSkillModifiers = this._getActiveSkillModifiers();

    // Store vision effects from equipped items
    systemData.visionEffects = ItemEffectsHelper.getVisionEffects(this);
  }

  /**
   * Calculate total attribute scores (base value + modifier, capped at 9)
   * @param {Object} systemData
   */
  _calculateAttributeTotals(systemData) {
    for (let [key, attr] of Object.entries(systemData.attributes || {})) {
      const baseValue = attr.value || 0;
      const modifier = attr.modifier || 0;
      // Total is base + modifier, capped at 9
      attr.total = Math.min(baseValue + modifier, 9);
    }
  }

  /**
   * Calculate Link Attribute Modifiers based on A Time of War rules
   * Uses total score (base + modifier, capped at 9)
   * 1: -2, 2-3: -1, 4-6: +0, 7-9: +1, 10: +2
   * @param {Object} systemData
   */
  _calculateLinkModifiers(systemData) {
    for (let [key, attr] of Object.entries(systemData.attributes || {})) {
      // Use total (base + modifier, already capped at 9) for link modifier
      const value = attr.total;
      if (value <= 1) {
        attr.linkMod = -2;
      } else if (value <= 3) {
        attr.linkMod = -1;
      } else if (value <= 6) {
        attr.linkMod = 0;
      } else if (value <= 9) {
        attr.linkMod = 1;
      } else {
        attr.linkMod = 2;
      }
    }
  }

  /**
   * Calculate derived statistics
   * Uses total attribute scores (base + modifier, capped at 9)
   * @param {Object} systemData
   */
  _calculateDerivedStats(systemData) {
    // Use total (base + modifier) for derived stats
    const str = systemData.attributes.str?.total || 5;
    const bod = systemData.attributes.bod?.total || 5;
    const rfl = systemData.attributes.rfl?.total || 5;
    const wil = systemData.attributes.wil?.total || 5;

    // Calculate wound effects FIRST before other derived stats
    const woundEffects = this._calculateWoundEffects(systemData);
    systemData.woundEffects = woundEffects;

    // Apply wound attribute modifiers to linkMod
    if (woundEffects.attributeModifiers) {
      for (const [attr, penalty] of Object.entries(woundEffects.attributeModifiers)) {
        if (systemData.attributes[attr]) {
          systemData.attributes[attr].woundMod = penalty;
          systemData.attributes[attr].linkMod += penalty;
        }
      }
    }

    // Base Damage Capacity = BOD x 2
    const baseDamageCapacity = bod * 2;
    // Base Fatigue Capacity = WIL x 2
    const baseFatigueCapacity = wil * 2;

    // Apply wound capacity penalties
    systemData.lockedDamage = woundEffects.lockedDamage;
    systemData.lockedFatigue = woundEffects.lockedFatigue;
    systemData.damageCapacity = Math.max(0, baseDamageCapacity - woundEffects.lockedDamage);
    systemData.fatigueCapacity = Math.max(0, baseFatigueCapacity - woundEffects.lockedFatigue);
    systemData.baseDamageCapacity = baseDamageCapacity;
    systemData.baseFatigueCapacity = baseFatigueCapacity;

    // Set damage.max for token bar compatibility
    if (systemData.damage) systemData.damage.max = systemData.damageCapacity;
    // Set fatigue.max for token bar compatibility
    if (systemData.fatigue) systemData.fatigue.max = systemData.fatigueCapacity;

    // Check for death (effective max standard damage <= 0)
    if (systemData.damageCapacity <= 0) {
      systemData.dead = true;
    }

    // Check for coma (effective max fatigue <= 0)
    if (systemData.fatigueCapacity <= 0) {
      systemData.coma = true;
      systemData.unconscious = true;
    }

    // Calculate carried weight for encumbrance
    const carriedWeight = this._calculateCarriedWeight();
    const encumbrance = this._calculateEncumbrance(str, carriedWeight);
    systemData.encumbrance = encumbrance;

    // Movement rates (meters per turn) - base values
    systemData.movement = systemData.movement || {};

    // Walk = STR + RFL
    let baseWalk = str + rfl;

    // Run/Evade = 10 + STR + RFL (+ Running Skill if applicable)
    const runningSkill = this._getSkillLevel("running") || 0;
    let baseRun = 10 + str + rfl + runningSkill;

    // Sprint = Run x 2
    let baseSprint = baseRun * 2;

    // Climb = based on Climbing skill, default is Walk/4
    const climbingSkill = this._getSkillLevel("climbing") || 0;
    let baseClimb = Math.floor(baseWalk / 4) + climbingSkill;

    // Crawl = Walk / 4
    let baseCrawl = Math.floor(baseWalk / 4);

    // Swim = based on Swimming skill, default is Walk/4
    const swimmingSkill = this._getSkillLevel("swimming") || 0;
    let baseSwim = Math.floor(baseWalk / 4) + swimmingSkill;

    // Apply encumbrance penalties
    if (encumbrance.level === 'overloaded') {
      // Overloaded: All movement = 1 (crawl only)
      systemData.movement.walk = 1;
      systemData.movement.run = 1;
      systemData.movement.sprint = 1;
      systemData.movement.climb = 1;
      systemData.movement.crawl = 1;
      systemData.movement.swim = 1;
    } else if (encumbrance.level === 'veryEncumbered') {
      // Very Encumbered: Divide by 3
      systemData.movement.walk = Math.floor(baseWalk / 3);
      systemData.movement.run = Math.floor(baseRun / 3);
      systemData.movement.sprint = Math.floor(baseSprint / 3);
      systemData.movement.climb = Math.floor(baseClimb / 3);
      systemData.movement.crawl = Math.floor(baseCrawl / 3);
      systemData.movement.swim = Math.floor(baseSwim / 3);
    } else if (encumbrance.level === 'encumbered') {
      // Encumbered: Divide by 2
      systemData.movement.walk = Math.floor(baseWalk / 2);
      systemData.movement.run = Math.floor(baseRun / 2);
      systemData.movement.sprint = Math.floor(baseSprint / 2);
      systemData.movement.climb = Math.floor(baseClimb / 2);
      systemData.movement.crawl = Math.floor(baseCrawl / 2);
      systemData.movement.swim = Math.floor(baseSwim / 2);
    } else {
      // Unencumbered: No penalty
      systemData.movement.walk = baseWalk;
      systemData.movement.run = baseRun;
      systemData.movement.sprint = baseSprint;
      systemData.movement.climb = baseClimb;
      systemData.movement.crawl = baseCrawl;
      systemData.movement.swim = baseSwim;
    }

    // Apply wound movement penalty (Severe Strain: -50%)
    if (woundEffects.movementMultiplier < 1) {
      systemData.movement.walk = Math.floor(systemData.movement.walk * woundEffects.movementMultiplier);
      systemData.movement.run = Math.floor(systemData.movement.run * woundEffects.movementMultiplier);
      systemData.movement.sprint = Math.floor(systemData.movement.sprint * woundEffects.movementMultiplier);
      systemData.movement.climb = Math.floor(systemData.movement.climb * woundEffects.movementMultiplier);
      systemData.movement.crawl = Math.max(1, Math.floor(systemData.movement.crawl * woundEffects.movementMultiplier));
      systemData.movement.swim = Math.floor(systemData.movement.swim * woundEffects.movementMultiplier);
    }

    // Calculate Injury Modifier (-1 per 25% of damage capacity) - use effective capacity
    const effectiveCapacity = systemData.damageCapacity > 0 ? systemData.damageCapacity : 1;
    const damagePercent = (systemData.damage?.value || 0) / effectiveCapacity;
    systemData.injuryModifier = -Math.floor(damagePercent * 4);
    if (systemData.injuryModifier > 0) systemData.injuryModifier = 0;

    // Calculate Fatigue Modifier (-(Fatigue - WIL), minimum 0)
    const fatigueDiff = (systemData.fatigue?.value || 0) - wil;
    systemData.fatigueModifier = fatigueDiff > 0 ? -fatigueDiff : 0;

    // Calculate Critical Injury threshold (>75% of effective damage capacity)
    const criticalThreshold = Math.ceil(systemData.damageCapacity * 0.75);
    systemData.criticalThreshold = criticalThreshold;

    // Auto-set dying if damage exceeds effective capacity (can only be removed by stabilization)
    if (systemData.damageCapacity > 0 && (systemData.damage?.value || 0) > systemData.damageCapacity) {
      systemData.dying = true;
    }

    // Current Edge (total - burned)
    if (systemData.attributes.edg) {
      systemData.attributes.edg.current =
        systemData.attributes.edg.total - (systemData.attributes.edg.burned || 0);
    }
  }

  /**
   * Calculate wound effects from all active wounds
   * @param {Object} systemData
   * @returns {Object} Wound effects summary
   */
  _calculateWoundEffects(systemData) {
    const wounds = systemData.wounds || [];
    const effects = {
      lockedDamage: 0,
      lockedFatigue: 0,
      attributeModifiers: {},
      movementMultiplier: 1,
      woundCount: wounds.length
    };

    // Wound type definitions
    const woundTypes = {
      dazed: { capacityPenalty: 1 },
      concussion: { capacityPenalty: 1, attributePenalties: { int: -2, wil: -2 } },
      hemorrhage: { capacityPenalty: 1 },
      traumaticImpact: { capacityPenalty: 1 },
      nerveDamage: { capacityPenalty: 1, attributePenalties: { dex: -2, rfl: -2 } },
      severeStrain: { capacityPenalty: 1, movementPenalty: 0.5 },
      severelyWounded: { capacityPenalty: 3 }
    };

    for (const wound of wounds) {
      const woundDef = woundTypes[wound.type];
      if (!woundDef) continue;

      // Apply capacity penalties
      effects.lockedDamage += woundDef.capacityPenalty || 0;
      effects.lockedFatigue += woundDef.capacityPenalty || 0;

      // Apply attribute penalties (don't stack - just use highest penalty per attribute)
      if (woundDef.attributePenalties) {
        for (const [attr, penalty] of Object.entries(woundDef.attributePenalties)) {
          if (!effects.attributeModifiers[attr] || penalty < effects.attributeModifiers[attr]) {
            effects.attributeModifiers[attr] = penalty;
          }
        }
      }

      // Apply movement penalty (multiplicative)
      if (woundDef.movementPenalty) {
        effects.movementMultiplier *= woundDef.movementPenalty;
      }
    }

    return effects;
  }

  /**
   * Calculate total carried weight from all items
   * @returns {number} Total weight in kg
   */
  _calculateCarriedWeight() {
    let totalWeight = 0;

    for (const item of this.items) {
      // Skip items that are stored (not carried or equipped)
      const status = item.system.carryStatus || 'carried';
      if (status === 'stored') continue;

      // Skip vehicles - they carry you, not the other way around
      if (item.type === 'vehicle') continue;

      // Add item mass
      const mass = parseFloat(item.system.mass) || 0;
      totalWeight += mass;
    }

    return totalWeight;
  }

  /**
   * Calculate encumbrance level based on STR and carried weight
   * @param {number} str Character's STR score
   * @param {number} weight Total carried weight in kg
   * @returns {Object} Encumbrance data
   */
  _calculateEncumbrance(str, weight) {
    // Encumbrance thresholds based on STR
    const thresholds = {
      0: { encumbered: 0.1, veryEncumbered: 0.5, overloaded: 1 },
      1: { encumbered: 5, veryEncumbered: 10, overloaded: 15 },
      2: { encumbered: 10, veryEncumbered: 20, overloaded: 25 },
      3: { encumbered: 15, veryEncumbered: 30, overloaded: 50 },
      4: { encumbered: 20, veryEncumbered: 40, overloaded: 75 },
      5: { encumbered: 30, veryEncumbered: 60, overloaded: 100 },
      6: { encumbered: 40, veryEncumbered: 80, overloaded: 125 },
      7: { encumbered: 55, veryEncumbered: 110, overloaded: 150 },
      8: { encumbered: 70, veryEncumbered: 140, overloaded: 200 },
      9: { encumbered: 85, veryEncumbered: 170, overloaded: 250 },
      10: { encumbered: 100, veryEncumbered: 200, overloaded: 300 }
    };

    let limits;
    if (str <= 10) {
      limits = thresholds[str] || thresholds[5];
    } else {
      // STR 11+: (STR x 15)kg, (STR x 30)kg, (STR x 45)kg
      limits = {
        encumbered: str * 15,
        veryEncumbered: str * 30,
        overloaded: str * 45
      };
    }

    // Determine encumbrance level
    let level = 'unencumbered';
    let effects = '';

    if (weight >= limits.overloaded) {
      level = 'overloaded';
      effects = 'Movement = 1 (crawl only)';
    } else if (weight >= limits.veryEncumbered) {
      level = 'veryEncumbered';
      effects = 'Movement ÷3, +1 fatigue/turn';
    } else if (weight >= limits.encumbered) {
      level = 'encumbered';
      effects = 'Movement ÷2, +1 fatigue if sprint/melee';
    }

    return {
      level,
      label: level === 'veryEncumbered' ? 'Very Encumbered' :
             level === 'unencumbered' ? 'Unencumbered' :
             level.charAt(0).toUpperCase() + level.slice(1),
      effects,
      limits,
      carriedWeight: weight
    };
  }

  /**
   * Apply active effect modifiers to system data
   * @param {Object} systemData The actor's system data
   * @param {string} targetType The type of modifier to apply ('attribute', 'movement', or 'skill')
   */
  _applyActiveEffectModifiers(systemData, targetType) {
    // Get all active persistent effects
    const activeEffects = this.items.filter(i =>
      i.type === 'activeEffect' &&
      i.system.active &&
      i.system.effectType === 'persistent'
    );

    // Collect modifiers by target, separating additive and multiplicative
    const modifiersByTarget = {};

    for (const effect of activeEffects) {
      // Ensure persistentModifiers is an array (may be {} from old data)
      const modifiers = Array.isArray(effect.system.persistentModifiers)
        ? effect.system.persistentModifiers
        : [];
      for (const mod of modifiers) {
        if (mod.targetType !== targetType) continue;

        const target = mod.target;
        const value = mod.value || 0;
        const operation = mod.operation || 'add';

        if (!modifiersByTarget[target]) {
          modifiersByTarget[target] = { additive: [], multiplicative: [] };
        }

        if (operation === 'multiply') {
          modifiersByTarget[target].multiplicative.push(value);
        } else {
          modifiersByTarget[target].additive.push(value);
        }
      }
    }

    // Apply modifiers: additive first, then multiplicative
    for (const [target, mods] of Object.entries(modifiersByTarget)) {
      if (targetType === 'attribute' && systemData.attributes[target]) {
        // Apply additive modifiers first
        let totalAdditive = mods.additive.reduce((sum, v) => sum + v, 0);
        systemData.attributes[target].total += totalAdditive;

        // Track effect modifier separately for display
        if (!systemData.attributes[target].effectMod) {
          systemData.attributes[target].effectMod = 0;
        }
        systemData.attributes[target].effectMod += totalAdditive;

        // Apply multiplicative modifiers (multiply sequentially)
        for (const multiplier of mods.multiplicative) {
          systemData.attributes[target].total *= multiplier;
        }

        // Round to integer
        systemData.attributes[target].total = Math.round(systemData.attributes[target].total);

      } else if (targetType === 'movement' && systemData.movement && systemData.movement[target] !== undefined) {
        // Apply additive modifiers first
        let totalAdditive = mods.additive.reduce((sum, v) => sum + v, 0);
        systemData.movement[target] += totalAdditive;

        // Apply multiplicative modifiers (multiply sequentially)
        for (const multiplier of mods.multiplicative) {
          systemData.movement[target] *= multiplier;
        }

        // Round to integer and ensure movement doesn't go below 0
        systemData.movement[target] = Math.max(0, Math.round(systemData.movement[target]));
      }
    }
  }

  /**
   * Apply modifiers from equipped item effects
   * @param {Object} systemData The actor's system data
   * @param {string} targetType The type of target to apply modifiers to ('attribute' or 'movement')
   */
  _applyItemEffectModifiers(systemData, targetType) {
    if (targetType === 'attribute') {
      const attrModifiers = ItemEffectsHelper.getAttributeModifiers(this);
      for (const [attr, modData] of Object.entries(attrModifiers)) {
        if (systemData.attributes[attr]) {
          systemData.attributes[attr].total += modData.additive;
          // Track item effect modifier separately for display
          if (!systemData.attributes[attr].itemEffectMod) {
            systemData.attributes[attr].itemEffectMod = 0;
          }
          systemData.attributes[attr].itemEffectMod += modData.additive;
        }
      }
    } else if (targetType === 'movement') {
      const moveModifiers = ItemEffectsHelper.getMovementModifiers(this);
      for (const [moveType, modData] of Object.entries(moveModifiers)) {
        if (systemData.movement && systemData.movement[moveType] !== undefined) {
          systemData.movement[moveType] += modData.additive;
          systemData.movement[moveType] = Math.max(0, Math.round(systemData.movement[moveType]));
        }
      }
    }
  }

  /**
   * Get active skill modifiers from persistent effects
   * @returns {Object} Map of skill name to modifier object with additive and multiplicative arrays
   */
  _getActiveSkillModifiers() {
    const skillModifiers = {};

    // Get all active persistent effects
    const activeEffects = this.items.filter(i =>
      i.type === 'activeEffect' &&
      i.system.active &&
      i.system.effectType === 'persistent'
    );

    for (const effect of activeEffects) {
      // Ensure persistentModifiers is an array (may be {} from old data)
      const modifiers = Array.isArray(effect.system.persistentModifiers)
        ? effect.system.persistentModifiers
        : [];
      for (const mod of modifiers) {
        if (mod.targetType !== 'skill') continue;

        const skillName = mod.target.toLowerCase();
        const value = mod.value || 0;
        const operation = mod.operation || 'add';

        if (!skillModifiers[skillName]) {
          skillModifiers[skillName] = { additive: 0, multiplicative: [] };
        }

        if (operation === 'multiply') {
          skillModifiers[skillName].multiplicative.push(value);
        } else {
          skillModifiers[skillName].additive += value;
        }
      }
    }

    return skillModifiers;
  }

  /**
   * Get a skill level by name/id
   * @param {string} skillName
   * @returns {number|null}
   */
  _getSkillLevel(skillName) {
    const skill = this.items.find(i =>
      i.type === 'skill' &&
      i.name.toLowerCase().includes(skillName.toLowerCase())
    );
    return skill?.system.level || null;
  }

  /**
   * Get equipped armor by location
   * @param {string} location Optional location filter
   * @returns {Array} Array of equipped armor items
   */
  getEquippedArmor(location = null) {
    let armor = this.items.filter(i => i.type === 'armor' && i.system.equipped);
    if (location) {
      armor = armor.filter(a => a.system.location === location);
    }
    return armor;
  }

  /**
   * Get highest BAR value from equipped armor for a damage type
   * @param {string} damageType 'm', 'b', 'e', or 'x'
   * @param {string} location Optional location filter
   * @returns {number}
   */
  getBAR(damageType = 'm', location = null) {
    const armor = this.getEquippedArmor(location);
    return armor.reduce((max, a) => {
      const bar = a.system.bar?.[damageType] || 0;
      return Math.max(max, bar);
    }, 0);
  }

  /**
   * Roll a skill check for this actor (A Time of War 2d6 system)
   * @param {string} skillId The ID of the skill item to roll
   * @param {object} options Additional options for the roll
   */
  async rollSkill(skillId, options = {}) {
    const skill = this.items.get(skillId);
    if (!skill || skill.type !== 'skill') return;

    const skillData = skill.system;
    const targetNumber = skillData.targetNumber || 7;

    // Calculate skill level from XP (Standard rate, A Time of War p.60)
    const xp = skillData.xp || 0;
    const costs = [20, 30, 50, 80, 120, 170, 230, 300, 380, 470, 570];

    let skillLevel = -1;  // No level if less than 20 XP
    for (let i = 10; i >= 0; i--) {
      if (xp >= costs[i]) {
        skillLevel = i;
        break;
      }
    }

    // Track linked attribute modifiers separately
    let linkMod = 0;
    if (skillData.linkedAttribute1) {
      const attr1 = this.system.attributes[skillData.linkedAttribute1];
      if (attr1) linkMod += attr1.linkMod || 0;
    }
    if (skillData.linkedAttribute2) {
      const attr2 = this.system.attributes[skillData.linkedAttribute2];
      if (attr2) linkMod += attr2.linkMod || 0;
    }

    // Get injury and fatigue modifiers
    const injuryMod = this.system.injuryModifier || 0;
    const fatigueMod = this.system.fatigueModifier || 0;
    const inputMod = options.modifier || 0;

    // Get active effect skill modifiers
    const activeSkillMods = this.system.activeSkillModifiers || {};
    const skillModData = activeSkillMods[skill.name.toLowerCase()];
    let effectMod = 0;
    if (skillModData) {
      // Apply additive modifiers
      effectMod = skillModData.additive || 0;
      // Apply multiplicative modifiers to skill level (if any)
      if (skillModData.multiplicative && skillModData.multiplicative.length > 0) {
        let modifiedSkillLevel = skillLevel;
        for (const multiplier of skillModData.multiplicative) {
          modifiedSkillLevel *= multiplier;
        }
        // Adjust effectMod to account for the skill level change
        effectMod += Math.round(modifiedSkillLevel) - skillLevel;
      }
    }

    // Calculate total modifier
    const totalMod = skillLevel + linkMod + injuryMod + fatigueMod + inputMod + effectMod;

    const rollFormula = `2d6 + ${totalMod}`;
    const roll = new Roll(rollFormula);
    await roll.evaluate();

    // Extract raw dice results for display
    const diceResults = roll.dice[0].results.map(r => r.result);

    // Check for special roll mechanics (Fumble, Stunning Success, Miraculous Feat)
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(diceResults);
    const successInfo = DiceMechanics.determineSuccess(roll.total, targetNumber, specialRoll);

    const success = successInfo.success;
    const marginOfSuccess = successInfo.mos;
    const finalTotal = successInfo.finalTotal;

    // Create chat message
    const messageContent = await renderTemplate(
      "systems/mech-foundry/templates/chat/skill-roll.hbs",
      {
        skillName: skill.name,
        total: finalTotal,
        rawTotal: roll.total,
        targetNumber: targetNumber,
        success: success,
        marginOfSuccess: marginOfSuccess,
        diceResults: diceResults,
        // Broken down modifiers for display
        skillMod: skillLevel + linkMod,
        inputMod: inputMod,
        injuryMod: injuryMod,
        fatigueMod: fatigueMod,
        // Special roll info
        specialRoll: specialRoll
      }
    );

    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${skill.name} Skill Check`,
      content: messageContent,
      rolls: [roll]
    };

    ChatMessage.create(messageData);
    return { roll, success, marginOfSuccess, specialRoll };
  }

  /**
   * Roll a weapon attack
   * @param {string} weaponId The weapon item ID
   * @param {Object} options Attack options
   */
  async rollWeaponAttack(weaponId, options = {}) {
    const weapon = this.items.get(weaponId);
    if (!weapon || weapon.type !== 'weapon') return;

    const weaponData = weapon.system;

    // Check for loaded ammo (required for ranged weapons with ammo capacity)
    const loadedAmmoId = weaponData.loadedAmmo;
    const loadedAmmo = loadedAmmoId ? this.items.get(loadedAmmoId) : null;
    const ammoCategory = loadedAmmo?.system?.ammoCategory || null;
    const isEnergyWeapon = ammoCategory === 'energy';

    // For weapons that require ammo, ensure ammo is loaded
    if (weaponData.ammo?.max > 0 || weaponData.pps > 0) {
      if (!loadedAmmo) {
        ui.notifications.warn(`${weapon.name} has no ammo loaded!`);
        return;
      }
    }

    // Get effective weapon stats (may be modified by ammo)
    const effectiveStats = this.getWeaponEffectiveStats(weaponId);

    // AOE weapons use the dedicated AOE attack flow
    if (weaponData.bdFactor === 'A') {
      return AOEHelper.initiateAOEAttack(this, weapon, options);
    }

    // Suppression fire: delegate to template placement if targets not yet detected
    const firingModeCheck = options.firingMode || 'single';
    if (firingModeCheck === 'suppression' && !options.suppressionTargets) {
      return AOEHelper.initiateSuppressionFire(this, weapon, options);
    }

    const hasBurstFire = weaponData.bdFactor === 'B';
    const recoil = weaponData.recoil || 0;
    const burstRating = weaponData.burstRating || 0;
    const currentAmmo = weaponData.ammo?.value || 0;
    const firingMode = options.firingMode || 'single';
    const weaponType = weaponData.weaponType || 'smallarms';

    // Track modifiers separately for display
    let recoilMod = 0;
    let firingModeMod = 0;
    let splashMod = 0;
    let coverMod = 0;
    let friendlyInLoFMod = 0;
    let aimedShotMod = 0;
    let proneMod = 0;
    let sizeMod = 0;
    let rangeMod = 0;
    let rangeCategory = null;
    let measuredDistance = null;
    const inputMod = options.modifier || 0;
    const injuryMod = this.system.injuryModifier || 0;
    const fatigueMod = this.system.fatigueModifier || 0;

    // Aimed shot options
    const aimedShot = options.aimedShot || false;
    const aimedLocation = options.aimedLocation || null;
    const ignoreCover = options.ignoreCover || false;
    const friendlyInLoF = options.friendlyInLoF || false;

    // Determine attack type
    let attackType = 'Standard Ranged';
    const isMelee = weaponType === 'melee';

    if (isMelee) {
      attackType = 'Standard Melee';
    } else if (firingMode === 'burst' && hasBurstFire) {
      attackType = 'Burst Fire';
    } else if (firingMode === 'controlled' && hasBurstFire) {
      attackType = 'Controlled Burst';
    } else if (firingMode === 'suppression' && hasBurstFire) {
      attackType = 'Suppression Fire';
    }

    // Check BD Factor for special attack types
    if (weaponData.bdFactor === 'A') {
      attackType = 'Area Effect';
    } else if (weaponData.bdFactor === 'S') {
      attackType = 'Splash Fire';
      // Splash weapons get +2 to ranged attack rolls
      splashMod = 2;
    } else if (weaponData.bdFactor === 'D' || weaponData.subduing) {
      attackType = 'Subduing';
    }

    // Override with explicit attack type if provided
    if (options.attackType) {
      attackType = options.attackType;
    }

    // Calculate ammo consumption
    let ammoUsed = 1;
    let numAttacks = 1;

    if (firingMode === 'burst' && hasBurstFire) {
      ammoUsed = options.burstShots || 1;
      recoilMod = recoil;  // Track recoil separately
    } else if (firingMode === 'controlled' && hasBurstFire) {
      ammoUsed = options.controlledShots || 2;
      firingModeMod = 1;  // Fixed -1 modifier (stored positive, applied negative)
    } else if (firingMode === 'suppression' && hasBurstFire) {
      ammoUsed = burstRating * 2;
      // Use detected targets from template, or fall back to manual count
      const suppressionTargets = options.suppressionTargets || [];
      numAttacks = suppressionTargets.length > 0 ? suppressionTargets.length : (options.numTargets || 1);
      const area = options.suppressionArea || 1;
      const roundsPerSqm = options.roundsPerSqm || 1;
      recoilMod = recoil;
      firingModeMod = area - roundsPerSqm;  // Area penalty minus rounds benefit
    }

    // Check ammo availability
    let ammoAvailable, ammoNeeded;
    if (isEnergyWeapon) {
      // Energy weapons consume PPS from the power pack
      const pps = weaponData.pps || 1;
      ammoNeeded = pps * ammoUsed; // ammoUsed is shots count for burst
      ammoAvailable = loadedAmmo.system.quantity.value;
      if (ammoAvailable < ammoNeeded) {
        ui.notifications.error(`Not enough power! Need ${ammoNeeded} PP, have ${ammoAvailable} PP.`);
        return;
      }
    } else if (weaponData.ammo?.max > 0) {
      // Ballistics/Ordnance consume from weapon's magazine
      ammoNeeded = ammoUsed;
      ammoAvailable = currentAmmo;
      if (ammoAvailable < ammoNeeded) {
        ui.notifications.error(`Not enough ammunition! Need ${ammoNeeded}, have ${ammoAvailable}.`);
        return;
      }
    }

    // Find linked skill
    const skillName = weaponData.skill;
    let skill = null;
    let skillLevel = 0;
    let linkMod = 0;

    if (skillName) {
      skill = this.items.find(i => i.type === 'skill' && i.name === skillName);
      if (skill) {
        // Calculate skill level from XP
        const xp = skill.system.xp || 0;
        const costs = [20, 30, 50, 80, 120, 170, 230, 300, 380, 470, 570];
        skillLevel = -1;
        for (let i = 10; i >= 0; i--) {
          if (xp >= costs[i]) {
            skillLevel = i;
            break;
          }
        }

        // Add linked attribute modifiers
        if (skill.system.linkedAttribute1) {
          const attr1 = this.system.attributes[skill.system.linkedAttribute1];
          if (attr1) linkMod += attr1.linkMod || 0;
        }
        if (skill.system.linkedAttribute2) {
          const attr2 = this.system.attributes[skill.system.linkedAttribute2];
          if (attr2) linkMod += attr2.linkMod || 0;
        }
      }
    }

    // Combined skill modifier
    const skillMod = skillLevel + linkMod;

    // Get combat modifiers from equipped item effects
    const combatType = isMelee ? 'melee' : 'ranged';
    const itemCombatMod = ItemEffectsHelper.getCombatModifier(this, combatType, weaponId);
    const itemEffectMod = itemCombatMod.totalBonus;

    // Apply cover modifier for ranged attacks against a target
    if (!isMelee && options.target?.actor && !ignoreCover) {
      const targetCover = options.target.actor.system?.cover || 'none';
      const coverModifiers = { none: 0, light: -1, moderate: -2, heavy: -3, full: -4 };
      coverMod = coverModifiers[targetCover] || 0;
    }

    // Apply prone target modifier
    if (options.target?.actor?.system?.prone) {
      proneMod = isMelee ? 2 : -1;
    }

    // Apply friendly in line of fire penalty (ranged only)
    if (!isMelee && friendlyInLoF) {
      friendlyInLoFMod = -1;
    }

    // Apply aimed shot penalty
    if (aimedShot && aimedLocation) {
      const aimedModifiers = {
        chest: -2, arm: -3, leg: -3, abdomen: -3,
        head: -5, hand: -5, foot: -5
      };
      aimedShotMod = aimedModifiers[aimedLocation] || 0;
    }

    // Apply target size modifier
    if (options.target?.actor) {
      const targetSize = options.target.actor.system?.personalData?.size || 'medium';
      const sizeModifiers = {
        monstrous: 5, veryLarge: 3, large: 1, medium: 0,
        small: -1, verySmall: -2, extremelySmall: -3, tiny: -4
      };
      sizeMod = sizeModifiers[targetSize] ?? 0;
    }

    // Apply range modifier for ranged attacks
    if (!isMelee && options.target) {
      const rangeResult = this._calculateRangeModifier(weaponData, options.target);
      if (rangeResult) {
        rangeMod = rangeResult.modifier;
        rangeCategory = rangeResult.category;
        measuredDistance = rangeResult.distance;
      }
    }

    // Calculate total modifier
    const totalMod = skillMod + inputMod + injuryMod + fatigueMod + itemEffectMod + splashMod + coverMod + proneMod + friendlyInLoFMod + aimedShotMod + sizeMod + rangeMod - recoilMod - firingModeMod;
    const targetNumber = skill?.system.targetNumber || 7;

    // Get weapon damage values (use effective stats if ammo modifies them)
    const baseDamage = effectiveStats?.bd ?? weaponData.bd ?? 0;
    const ap = effectiveStats?.ap ?? weaponData.ap ?? 0;
    const apFactor = effectiveStats?.apFactor ?? weaponData.apFactor ?? '';
    const bdFactor = effectiveStats?.bdFactor ?? weaponData.bdFactor ?? '';
    const isSubduing = weaponData.subduing || bdFactor === 'D';
    const ammoSpecialEffects = effectiveStats?.specialEffects || [];
    const str = this.system.attributes.str?.value || 5;

    // Get damage modifiers from equipped item effects
    const itemDamageMod = ItemEffectsHelper.getDamageModifier(this, combatType, weaponId);
    const itemDamageBonus = itemDamageMod.totalBonus;

    // Calculate extra shots for burst fire damage cap
    const extraShots = (firingMode === 'burst') ? (options.burstShots || 1) - 1 :
                       (firingMode === 'controlled') ? (options.controlledShots || 2) - 1 : 0;

    // Make attack roll(s)
    const results = [];
    for (let i = 0; i < numAttacks; i++) {
      const rollFormula = `2d6 + ${totalMod}`;
      const roll = new Roll(rollFormula);
      await roll.evaluate();

      const diceResults = roll.dice[0].results.map(r => r.result);

      // Check for special roll mechanics (Fumble, Stunning Success, Miraculous Feat)
      const specialRoll = await DiceMechanics.evaluateSpecialRoll(diceResults);
      const successInfo = DiceMechanics.determineSuccess(roll.total, targetNumber, specialRoll);

      const success = successInfo.success;
      const marginOfSuccess = successInfo.mos;
      const finalTotal = successInfo.finalTotal;

      // Calculate damage if attack succeeds
      let standardDamage = 0;
      let fatigueDamage = 0;
      let mosDamage = 0;
      let strDamage = 0;

      if (success && marginOfSuccess >= 0) {
        if (isMelee) {
          // Melee damage: (Weapon Damage) + ceil(STR / 4) + ceil(MoS × 0.25)
          // Unarmed: No weapon damage, AP = 0M, damage as Subduing
          strDamage = Math.ceil(str / 4);
          mosDamage = Math.ceil(marginOfSuccess * 0.25);

          if (baseDamage === 0) {
            // Unarmed - damage is subduing (fatigue)
            fatigueDamage = strDamage + mosDamage;
          } else {
            // Armed melee
            standardDamage = baseDamage + strDamage + mosDamage;
            fatigueDamage = 1; // All damage causes 1 fatigue
          }
        } else if (attackType === 'Burst Fire' || attackType === 'Controlled Burst') {
          // Burst/Controlled: Base damage + 1 per MoS (capped at extra shots)
          mosDamage = Math.min(marginOfSuccess, extraShots);
          standardDamage = baseDamage + mosDamage;
          fatigueDamage = isSubduing ? 0 : 1;

          if (isSubduing) {
            fatigueDamage = standardDamage;
            standardDamage = 0;
          }
        } else if (isSubduing || attackType === 'Subduing') {
          // Subduing: Base damage + floor(MoS × 0.25), dealt as fatigue only
          mosDamage = Math.floor(marginOfSuccess * 0.25);
          fatigueDamage = baseDamage + mosDamage;
          standardDamage = 0;
        } else {
          // Standard Ranged / Suppression Fire / Area Effect / Splash Fire
          // Base damage + floor(MoS × 0.25) + 1 fatigue
          mosDamage = Math.floor(marginOfSuccess * 0.25);
          standardDamage = baseDamage + mosDamage;
          fatigueDamage = 1;
        }

        // Apply item effect damage bonus
        if (itemDamageBonus > 0) {
          if (isSubduing || attackType === 'Subduing' || (isMelee && baseDamage === 0)) {
            fatigueDamage += itemDamageBonus;
          } else {
            standardDamage += itemDamageBonus;
          }
        }
      }

      // Calculate hit location and armor if we have a target
      let hitLocation = null;
      let armorCalc = null;
      let canApplyDamage = false;
      let targetActorId = null;
      let targetTokenId = null;
      let targetSceneId = null;
      let damageTypeName = null;
      let woundEffect = null;

      // For suppression fire with template targets, use the detected token for this roll
      const suppressionTargets = options.suppressionTargets || [];
      let targetToken = options.target || null;
      if (firingMode === 'suppression' && suppressionTargets.length > 0 && i < suppressionTargets.length) {
        targetToken = suppressionTargets[i].token;
      }
      const targetActor = targetToken?.actor || null;
      if (targetActor && success && standardDamage > 0) {
        // Use aimed shot location or roll hit location
        if (aimedShot && aimedLocation) {
          hitLocation = OpposedRollHelper.getAimedHitLocation(aimedLocation);
        } else {
          hitLocation = await OpposedRollHelper.rollHitLocation();
        }

        // Determine damage type from apFactor
        const damageTypeMap = { 'M': 'm', 'B': 'b', 'E': 'e', 'X': 'x' };
        const damageType = damageTypeMap[apFactor] || 'm';
        damageTypeName = OpposedRollHelper.getDamageTypeName(damageType);

        // Calculate armor reduction with location damage multiplier
        armorCalc = OpposedRollHelper.calculateDamageWithLocation(
          standardDamage,
          ap,
          damageType,
          targetActor,
          hitLocation.armorLocation,
          hitLocation.location
        );

        targetActorId = targetActor.id;
        targetTokenId = targetToken?.document?.id || targetToken?.id || null;
        targetSceneId = canvas.scene?.id || null;
        canApplyDamage = targetActor.isOwner || game.user.isGM;

        // Check for wound effects: doubles on successful attack AND damage dealt
        if (OpposedRollHelper.isDoubles(diceResults) && armorCalc.finalDamage > 0) {
          woundEffect = await OpposedRollHelper.rollWoundEffect();
          // Add wound effect damage to totals
          if (woundEffect.additionalFatigue > 0) {
            fatigueDamage += woundEffect.additionalFatigue;
          }
          if (woundEffect.additionalStandard > 0) {
            armorCalc.finalDamage += woundEffect.additionalStandard;
            armorCalc.woundDamage = woundEffect.additionalStandard;
          }
        }
      }

      results.push({
        roll,
        total: finalTotal,
        rawTotal: roll.total,
        diceResults,
        success,
        marginOfSuccess,
        targetIndex: numAttacks > 1 ? i + 1 : null,
        targetName: (firingMode === 'suppression' && targetActor) ? targetActor.name : null,
        // Damage info
        standardDamage,
        fatigueDamage,
        baseDamage: isMelee ? baseDamage + strDamage : baseDamage,
        mosDamage,
        ap,
        apFactor,
        isSubduing: isSubduing || (isMelee && baseDamage === 0),
        // Target info
        hitLocation,
        armorCalc,
        canApplyDamage,
        targetActorId,
        targetTokenId,
        targetSceneId,
        damageTypeName,
        // Special roll info
        specialRoll,
        // Wound effect info (doubles on successful attack with damage)
        woundEffect,
        isDoubles: OpposedRollHelper.isDoubles(diceResults)
      });
    }

    // Reduce ammo
    if (isEnergyWeapon && loadedAmmo) {
      // Energy weapons: decrement power pack PP
      const newPP = loadedAmmo.system.quantity.value - ammoNeeded;
      await loadedAmmo.update({ 'system.quantity.value': Math.max(0, newPP) });
    } else if (weaponData.ammo?.max > 0) {
      // Ballistics/Ordnance: decrement weapon magazine and sync ammo item
      const newAmmoValue = Math.max(0, currentAmmo - ammoUsed);
      await weapon.update({ "system.ammo.value": newAmmoValue });
      // Also update the ammo item to stay in sync
      if (loadedAmmo) {
        await loadedAmmo.update({ 'system.quantity.value': newAmmoValue });
      }
    }

    // Create chat message
    const targetActor = options.target?.actor || null;

    // Prepare aimed shot display info
    const aimedLocationLabels = {
      chest: 'Chest', arm: 'Arm', leg: 'Leg', abdomen: 'Abdomen',
      head: 'Head', hand: 'Hand', foot: 'Foot'
    };

    // Prepare cover display info
    const coverLabels = { none: 'None', light: 'Light', moderate: 'Moderate', heavy: 'Heavy', full: 'Full' };
    const targetCoverStatus = (!isMelee && targetActor && !ignoreCover) ? (targetActor.system?.cover || 'none') : 'none';

    // Prepare size display info (only show if not medium)
    const sizeLabels = {
      monstrous: 'Monstrous', veryLarge: 'Very Large', large: 'Large', medium: 'Medium',
      small: 'Small', verySmall: 'Very Small', extremelySmall: 'Extremely Small', tiny: 'Tiny'
    };
    const targetSizeKey = targetActor?.system?.personalData?.size || 'medium';
    const targetSizeLabel = sizeMod !== 0 ? sizeLabels[targetSizeKey] : null;

    const messageContent = await renderTemplate(
      "systems/mech-foundry/templates/chat/weapon-attack.hbs",
      {
        weaponName: weapon.name,
        attackType: attackType,
        firingMode: firingMode,
        ammoUsed: ammoUsed,
        targetNumber: targetNumber,
        results: results,
        targetName: targetActor?.name || null,
        // Loaded ammo info
        loadedAmmoName: loadedAmmo?.name || null,
        ammoSpecialEffects: ammoSpecialEffects,
        // Broken down modifiers for display
        skillMod: skillMod,
        inputMod: inputMod,
        recoilMod: recoilMod,
        firingModeMod: firingModeMod,
        injuryMod: injuryMod,
        fatigueMod: fatigueMod,
        itemEffectMod: itemEffectMod,
        itemCombatModBreakdown: itemCombatMod.breakdown,
        splashMod: splashMod,
        // New combat option modifiers
        coverMod: coverMod,
        coverLabel: coverMod !== 0 ? coverLabels[targetCoverStatus] : null,
        ignoreCover: ignoreCover && targetActor?.system?.cover && targetActor.system.cover !== 'none',
        friendlyInLoF: friendlyInLoF,
        friendlyInLoFMod: friendlyInLoFMod,
        aimedShot: aimedShot,
        aimedShotMod: aimedShotMod,
        aimedLocationLabel: aimedShot ? aimedLocationLabels[aimedLocation] : null,
        proneMod: proneMod,
        targetProne: options.target?.actor?.system?.prone || false,
        // Size modifier
        sizeMod: sizeMod,
        targetSizeLabel: targetSizeLabel,
        // Range modifier
        rangeMod: rangeMod,
        rangeCategory: rangeCategory,
        measuredDistance: measuredDistance
      }
    );

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${weapon.name} Attack`,
      content: messageContent,
      rolls: results.map(r => r.roll)
    });

    return results;
  }

  /**
   * Handle an opposed melee attack with a target
   * @param {string} weaponId The weapon item ID
   * @param {Token} target The target token
   * @param {Object} options Attack options
   */
  async rollOpposedMeleeAttack(weaponId, target, options = {}) {
    const weapon = this.items.get(weaponId);
    if (!weapon || weapon.type !== 'weapon') return;

    const targetActor = target.actor;
    if (!targetActor) return;

    const weaponData = weapon.system;
    const rollId = OpposedRollHelper.generateRollId();

    // Make attacker's roll
    const attackerResult = await this._makeAttackRoll(weapon, options);
    if (!attackerResult) return;

    // Determine if defender is owned by a different player
    const defenderOwner = game.users.find(u =>
      u.active && targetActor.ownership[u.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    );

    let defenderResult;

    if (defenderOwner && defenderOwner.id !== game.user.id && !game.user.isGM) {
      // Remote player owns defender - use socket
      SocketHandler.emit(SOCKET_EVENTS.DEFENDER_PROMPT, {
        rollId: rollId,
        attackerUserId: game.user.id,
        attackerActorId: this.id,
        attackerName: this.name,
        targetActorId: targetActor.id,
        targetTokenId: target.id,
        weaponName: weapon.name,
        attackType: 'melee'
      });

      // Wait for response
      defenderResult = await SocketHandler.waitForDefenderResponse(rollId);
    } else {
      // Local player/GM handles defense
      defenderResult = await OpposedRollHelper.showDefenderDialog({
        attackerName: this.name,
        weaponName: weapon.name,
        targetActorId: targetActor.id
      });
    }

    // Resolve the opposed roll
    await this._resolveOpposedMelee(attackerResult, defenderResult, weapon, target, targetActor, rollId);
  }

  /**
   * Make an attack roll and return the result
   * @param {Item} weapon The weapon item
   * @param {Object} options Roll options
   * @returns {Object} Roll result
   */
  async _makeAttackRoll(weapon, options = {}) {
    const weaponData = weapon.system;
    const inputMod = options.modifier || 0;
    const injuryMod = this.system.injuryModifier || 0;
    const fatigueMod = this.system.fatigueModifier || 0;

    // Find linked skill
    const skillName = weaponData.skill;
    let skill = null;
    let skillLevel = 0;
    let linkMod = 0;

    if (skillName) {
      skill = this.items.find(i => i.type === 'skill' && i.name === skillName);
      if (skill) {
        const xp = skill.system.xp || 0;
        const costs = [20, 30, 50, 80, 120, 170, 230, 300, 380, 470, 570];
        skillLevel = -1;
        for (let i = 10; i >= 0; i--) {
          if (xp >= costs[i]) {
            skillLevel = i;
            break;
          }
        }

        if (skill.system.linkedAttribute1) {
          const attr1 = this.system.attributes[skill.system.linkedAttribute1];
          if (attr1) linkMod += attr1.linkMod || 0;
        }
        if (skill.system.linkedAttribute2) {
          const attr2 = this.system.attributes[skill.system.linkedAttribute2];
          if (attr2) linkMod += attr2.linkMod || 0;
        }
      }
    }

    const skillMod = skillLevel + linkMod;

    // Get combat modifiers from equipped item effects (melee for this function)
    const itemCombatMod = ItemEffectsHelper.getCombatModifier(this, 'melee', weapon.id);
    const itemEffectMod = itemCombatMod.totalBonus;

    const totalMod = skillMod + inputMod + injuryMod + fatigueMod + itemEffectMod;
    const targetNumber = skill?.system.targetNumber || 7;

    const roll = await new Roll(`2d6 + ${totalMod}`).evaluate();
    const diceResults = roll.dice[0].results.map(r => r.result);

    // Check for special roll mechanics (Fumble, Stunning Success, Miraculous Feat)
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(diceResults);
    const successInfo = DiceMechanics.determineSuccess(roll.total, targetNumber, specialRoll);

    const success = successInfo.success;
    const mos = successInfo.mos;
    const finalTotal = successInfo.finalTotal;

    return {
      roll,
      total: finalTotal,
      rawTotal: roll.total,
      diceResults,
      success,
      mos,
      targetNumber,
      modifier: totalMod,
      skillMod,
      inputMod,
      injuryMod,
      fatigueMod,
      itemEffectMod,
      itemCombatModBreakdown: itemCombatMod.breakdown,
      specialRoll
    };
  }

  /**
   * Resolve an opposed melee roll and create chat message
   * @param {Object} attackerResult Attacker's roll result
   * @param {Object} defenderResult Defender's roll result
   * @param {Item} weapon Attacker's weapon
   * @param {Token} target Target token
   * @param {Actor} targetActor Target actor
   * @param {string} rollId Unique roll ID
   */
  async _resolveOpposedMelee(attackerResult, defenderResult, weapon, target, targetActor, rollId) {
    // Resolve the opposed roll
    const resolution = OpposedRollHelper.resolveMeleeOpposed(attackerResult, defenderResult);

    // Get token IDs for unlinked token support
    const defenderTokenId = target?.document?.id || target?.id || null;
    const attackerToken = canvas.tokens?.placeables.find(t => t.actor?.id === this.id);
    const attackerTokenId = attackerToken?.document?.id || attackerToken?.id || null;
    const sceneId = canvas.scene?.id || null;

    // Prepare template data
    const templateData = {
      rollId,
      attackerName: this.name,
      attackerActorId: this.id,
      attackerTokenId,
      attackerWeaponName: weapon.name,
      attackerResult,
      defenderName: targetActor.name,
      defenderActorId: targetActor.id,
      defenderTokenId,
      sceneId,
      defenderResult,
      resolution
    };

    // Calculate attacker damage to defender if applicable
    if (resolution.attackerDealsDefenderDamage) {
      const attackerDamage = OpposedRollHelper.calculateMeleeDamage(this, weapon, attackerResult.mos);
      const attackerHitLocation = await OpposedRollHelper.rollHitLocation();

      // Calculate armor reduction with location damage modifier
      const attackerArmorCalc = OpposedRollHelper.calculateDamageWithLocation(
        attackerDamage.isSubduing ? attackerDamage.fatigueDamage : attackerDamage.standardDamage,
        attackerDamage.ap,
        attackerDamage.damageType,
        targetActor,
        attackerHitLocation.armorLocation,
        attackerHitLocation.location
      );

      // Check for wound effects: doubles on successful attack AND damage dealt
      let attackerWoundEffect = null;
      if (OpposedRollHelper.isDoubles(attackerResult.diceResults) && attackerArmorCalc.finalDamage > 0) {
        attackerWoundEffect = await OpposedRollHelper.rollWoundEffect();
        // Add wound effect damage to totals
        if (attackerWoundEffect.additionalFatigue > 0) {
          attackerDamage.fatigueDamage += attackerWoundEffect.additionalFatigue;
        }
        if (attackerWoundEffect.additionalStandard > 0) {
          attackerArmorCalc.finalDamage += attackerWoundEffect.additionalStandard;
          attackerArmorCalc.woundDamage = attackerWoundEffect.additionalStandard;
        }
      }

      templateData.attackerDamage = attackerDamage;
      templateData.attackerHitLocation = attackerHitLocation;
      templateData.attackerArmorCalc = attackerArmorCalc;
      templateData.attackerDamageTypeName = OpposedRollHelper.getDamageTypeName(attackerDamage.damageType);
      templateData.attackerWoundEffect = attackerWoundEffect;
      templateData.attackerIsDoubles = OpposedRollHelper.isDoubles(attackerResult.diceResults);
      templateData.canApplyAttackerDamage = targetActor.isOwner || game.user.isGM;
    }

    // Calculate defender damage to attacker (counterstrike or mutual damage)
    if (resolution.defenderDealsAttackerDamage) {
      const defenderWeapon = OpposedRollHelper.getDefenderWeapon(targetActor);
      const defenderDamage = OpposedRollHelper.calculateMeleeDamage(targetActor, defenderWeapon, defenderResult.mos);
      const defenderHitLocation = await OpposedRollHelper.rollHitLocation();

      // Calculate armor reduction with location damage modifier against attacker
      const defenderArmorCalc = OpposedRollHelper.calculateDamageWithLocation(
        defenderDamage.isSubduing ? defenderDamage.fatigueDamage : defenderDamage.standardDamage,
        defenderDamage.ap,
        defenderDamage.damageType,
        this,
        defenderHitLocation.armorLocation,
        defenderHitLocation.location
      );

      // Check for wound effects: doubles on successful defense roll AND damage dealt
      let defenderWoundEffect = null;
      if (defenderResult.diceResults && OpposedRollHelper.isDoubles(defenderResult.diceResults) && defenderArmorCalc.finalDamage > 0) {
        defenderWoundEffect = await OpposedRollHelper.rollWoundEffect();
        // Add wound effect damage to totals
        if (defenderWoundEffect.additionalFatigue > 0) {
          defenderDamage.fatigueDamage += defenderWoundEffect.additionalFatigue;
        }
        if (defenderWoundEffect.additionalStandard > 0) {
          defenderArmorCalc.finalDamage += defenderWoundEffect.additionalStandard;
          defenderArmorCalc.woundDamage = defenderWoundEffect.additionalStandard;
        }
      }

      templateData.defenderDamage = defenderDamage;
      templateData.defenderHitLocation = defenderHitLocation;
      templateData.defenderArmorCalc = defenderArmorCalc;
      templateData.defenderDamageTypeName = OpposedRollHelper.getDamageTypeName(defenderDamage.damageType);
      templateData.defenderWoundEffect = defenderWoundEffect;
      templateData.defenderIsDoubles = defenderResult.diceResults ? OpposedRollHelper.isDoubles(defenderResult.diceResults) : false;
      templateData.canApplyDefenderDamage = this.isOwner || game.user.isGM;
    }

    // Show defender choice if applicable
    if (resolution.defenderChoice) {
      templateData.showDefenderChoice = targetActor.isOwner || game.user.isGM;

      // Pre-calculate potential damage for both choices
      const attackerDamage = OpposedRollHelper.calculateMeleeDamage(this, weapon, attackerResult.mos);
      const attackerHitLocation = await OpposedRollHelper.rollHitLocation();
      const attackerArmorCalc = OpposedRollHelper.calculateDamageWithLocation(
        attackerDamage.isSubduing ? attackerDamage.fatigueDamage : attackerDamage.standardDamage,
        attackerDamage.ap,
        attackerDamage.damageType,
        targetActor,
        attackerHitLocation.armorLocation,
        attackerHitLocation.location
      );

      // Check for wound effects for attacker's potential damage
      let attackerWoundEffect = null;
      if (OpposedRollHelper.isDoubles(attackerResult.diceResults) && attackerArmorCalc.finalDamage > 0) {
        attackerWoundEffect = await OpposedRollHelper.rollWoundEffect();
        if (attackerWoundEffect.additionalFatigue > 0) {
          attackerDamage.fatigueDamage += attackerWoundEffect.additionalFatigue;
        }
        if (attackerWoundEffect.additionalStandard > 0) {
          attackerArmorCalc.finalDamage += attackerWoundEffect.additionalStandard;
          attackerArmorCalc.woundDamage = attackerWoundEffect.additionalStandard;
        }
      }

      templateData.attackerDamage = attackerDamage;
      templateData.attackerHitLocation = attackerHitLocation;
      templateData.attackerArmorCalc = attackerArmorCalc;
      templateData.attackerDamageTypeName = OpposedRollHelper.getDamageTypeName(attackerDamage.damageType);
      templateData.attackerWoundEffect = attackerWoundEffect;
      templateData.attackerIsDoubles = OpposedRollHelper.isDoubles(attackerResult.diceResults);

      const defenderWeapon = OpposedRollHelper.getDefenderWeapon(targetActor);
      const defenderDamage = OpposedRollHelper.calculateMeleeDamage(targetActor, defenderWeapon, defenderResult.mos);
      const defenderHitLocation = await OpposedRollHelper.rollHitLocation();
      const defenderArmorCalc = OpposedRollHelper.calculateDamageWithLocation(
        defenderDamage.isSubduing ? defenderDamage.fatigueDamage : defenderDamage.standardDamage,
        defenderDamage.ap,
        defenderDamage.damageType,
        this,
        defenderHitLocation.armorLocation,
        defenderHitLocation.location
      );

      // Check for wound effects for defender's potential counterstrike damage
      let defenderWoundEffect = null;
      if (defenderResult.diceResults && OpposedRollHelper.isDoubles(defenderResult.diceResults) && defenderArmorCalc.finalDamage > 0) {
        defenderWoundEffect = await OpposedRollHelper.rollWoundEffect();
        if (defenderWoundEffect.additionalFatigue > 0) {
          defenderDamage.fatigueDamage += defenderWoundEffect.additionalFatigue;
        }
        if (defenderWoundEffect.additionalStandard > 0) {
          defenderArmorCalc.finalDamage += defenderWoundEffect.additionalStandard;
          defenderArmorCalc.woundDamage = defenderWoundEffect.additionalStandard;
        }
      }

      templateData.defenderDamage = defenderDamage;
      templateData.defenderHitLocation = defenderHitLocation;
      templateData.defenderArmorCalc = defenderArmorCalc;
      templateData.defenderDamageTypeName = OpposedRollHelper.getDamageTypeName(defenderDamage.damageType);
      templateData.defenderWoundEffect = defenderWoundEffect;
      templateData.defenderIsDoubles = defenderResult.diceResults ? OpposedRollHelper.isDoubles(defenderResult.diceResults) : false;
    }

    // Create chat message
    const messageContent = await renderTemplate(
      "systems/mech-foundry/templates/chat/opposed-roll.hbs",
      templateData
    );

    const rolls = [attackerResult.roll];
    if (defenderResult.roll) rolls.push(defenderResult.roll);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: "Opposed Melee Attack",
      content: messageContent,
      rolls: rolls
    });

    return { resolution, templateData };
  }

  /**
   * Roll an attribute check (single or double attribute)
   * Uses total attribute scores (base + modifier, capped at 9)
   * @param {string} attr1Key First attribute key
   * @param {string} attr2Key Optional second attribute key for double checks
   * @param {object} options Additional options
   */
  async rollAttribute(attr1Key, attr2Key = null, options = {}) {
    const attr1 = this.system.attributes[attr1Key];
    if (!attr1) return;

    // Use total (base + modifier) for attribute rolls
    let totalMod = attr1.total;
    let targetNumber = 12; // Single attribute check TN
    let checkName = attr1Key.toUpperCase();

    if (attr2Key) {
      const attr2 = this.system.attributes[attr2Key];
      if (attr2) {
        totalMod += attr2.total;
        targetNumber = 18; // Double attribute check TN
        checkName = `${attr1Key.toUpperCase()} + ${attr2Key.toUpperCase()}`;
      }
    }

    // Apply injury and fatigue modifiers
    totalMod += this.system.injuryModifier || 0;
    totalMod += this.system.fatigueModifier || 0;

    // Apply any additional modifiers
    totalMod += options.modifier || 0;

    const rollFormula = `2d6 + ${totalMod}`;
    const roll = new Roll(rollFormula);
    await roll.evaluate();

    // Extract raw dice results for display
    const diceResults = roll.dice[0].results.map(r => r.result);
    const rawDiceTotal = diceResults.reduce((a, b) => a + b, 0);

    // Check for special roll mechanics (Fumble, Stunning Success, Miraculous Feat)
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(diceResults);
    const successInfo = DiceMechanics.determineSuccess(roll.total, targetNumber, specialRoll);

    const success = successInfo.success;
    const marginOfSuccess = successInfo.mos;
    const finalTotal = successInfo.finalTotal;

    // Build special roll display
    let specialRollHtml = '';
    if (specialRoll.isFumble) {
      specialRollHtml = `<div class="special-roll fumble">${specialRoll.displayText}</div>`;
    } else if (specialRoll.isStunningSuccess) {
      const bonusDiceStr = DiceMechanics.formatBonusDice(specialRoll.bonusDice);
      specialRollHtml = `<div class="special-roll ${specialRoll.isMiraculousFeat ? 'miraculous-feat' : 'stunning-success'}">
        ${specialRoll.displayText}
        <span class="bonus-dice">(Bonus: ${bonusDiceStr})</span>
      </div>`;
    }

    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${checkName} Attribute Check (TN ${targetNumber})`,
      content: `
        <div class="mech-foundry roll-result">
          ${specialRollHtml}
          <div class="dice-raw">Dice: ${diceResults.join(' + ')} = ${rawDiceTotal}</div>
          <div class="dice-formula">${rawDiceTotal} ${totalMod >= 0 ? '+' : ''}${totalMod}${specialRoll.bonusTotal ? ` + ${specialRoll.bonusTotal} bonus` : ''} = ${finalTotal}</div>
          <div class="dice-result">
            <strong>Roll:</strong> ${finalTotal}
            <span class="target">(Target: ${targetNumber})</span>
          </div>
          <div class="result ${success ? 'success' : 'failure'}">
            ${success ? 'Success' : 'Failure'}${successInfo.autoResult ? ' (Auto)' : ''}
            <span class="margin">(MoS: ${marginOfSuccess >= 0 ? '+' : ''}${marginOfSuccess})</span>
          </div>
        </div>
      `,
      rolls: [roll]
    };

    ChatMessage.create(messageData);
    return { roll, success, marginOfSuccess, specialRoll };
  }

  /**
   * Burn Edge points
   * @param {number} points Number of Edge points to burn
   * @param {string} timing 'before' or 'after' the roll
   * @returns {number} The modifier to apply (or 0 if after with reroll)
   */
  async burnEdge(points, timing = 'before') {
    const edg = this.system.attributes.edg;
    const available = edg.total - (edg.burned || 0);

    if (points > available) {
      ui.notifications.warn("Not enough Edge points available!");
      return 0;
    }

    // Update burned Edge
    await this.update({
      "system.attributes.edg.burned": (edg.burned || 0) + points
    });

    // Before roll: double the points as modifier
    if (timing === 'before') {
      return points * 2;
    }

    // After roll: single point modifier
    return points;
  }

  /**
   * Apply damage to this actor
   * @param {number} damage Amount of damage
   * @param {number} ap Armor Penetration of the attack
   * @param {string} damageType Type of damage ('m', 'b', 'e', 'x')
   * @param {string} location Hit location
   * @param {boolean} isSubduing Whether this is subduing damage
   */
  async applyDamage(damage, ap = 0, damageType = 'm', location = null, isSubduing = false) {
    const bar = this.getBAR(damageType, location);
    let finalDamage = damage;

    // If BAR > AP, reduce damage by difference
    if (bar > ap) {
      finalDamage = Math.max(0, damage - (bar - ap));
    }

    if (finalDamage <= 0) {
      ui.notifications.info("Attack absorbed by armor!");
      return;
    }

    if (isSubduing) {
      // Subduing damage applies to Fatigue and causes Stun
      const newFatigue = (this.system.fatigue.value || 0) + finalDamage;
      await this.update({
        "system.fatigue.value": newFatigue,
        "system.stun": true
      });
    } else {
      // Standard damage
      const newDamage = (this.system.damage.value || 0) + finalDamage;
      // Standard damage also causes 1 Fatigue
      const newFatigue = (this.system.fatigue.value || 0) + 1;

      // Check if this damage causes critical injury (>75% capacity)
      const criticalThreshold = Math.ceil(this.system.damageCapacity * 0.75);
      const wasCriticallyInjured = this.system.criticallyInjured || false;
      const isCriticallyInjured = newDamage >= criticalThreshold;

      // Check if dying (damage exceeds capacity)
      const isDying = newDamage > this.system.damageCapacity;

      await this.update({
        "system.damage.value": newDamage,
        "system.fatigue.value": newFatigue,
        "system.stun": true,
        "system.criticallyInjured": isCriticallyInjured,
        "system.dying": isDying
      });

      // If just became critically injured, trigger consciousness check
      if (isCriticallyInjured && !wasCriticallyInjured) {
        ui.notifications.warn(`${this.name} is critically injured! Consciousness check required.`);
      }

      // If dying, notify
      if (isDying) {
        ui.notifications.error(`${this.name} is dying! Stabilization required immediately.`);
      }

      // Check for bleeding: if standard damage >= ceil(BOD/2) and not already bleeding
      await this._checkBleedingFromDamage(finalDamage);
    }

    // Check for unconsciousness or death
    await this._checkCondition();
  }

  /**
   * Check if heavy standard damage should trigger a BOD check for bleeding
   * If damage >= ceil(BOD/2) and not already bleeding, roll BOD check
   * @param {number} damageDealt The amount of standard damage dealt
   */
  async _checkBleedingFromDamage(damageDealt) {
    // Skip if already bleeding
    if (this.system.bleeding) return;

    const bod = this.system.attributes.bod?.value || 5;
    const threshold = Math.ceil(bod / 2);

    if (damageDealt < threshold) return;

    // Perform BOD attribute check (single attribute, TN 12)
    const bodTotal = this.system.attributes.bod?.total || bod;
    const injuryMod = this.system.injuryModifier || 0;
    const fatigueMod = this.system.fatigueModifier || 0;
    const totalMod = bodTotal + injuryMod + fatigueMod;

    const roll = await new Roll(`2d6 + ${totalMod}`).evaluate();
    const diceResults = roll.dice[0].results.map(r => r.result);
    const targetNumber = 12;
    const success = roll.total >= targetNumber;
    const mos = roll.total - targetNumber;

    // Check for auto-fail on snake eyes
    const isFumble = diceResults[0] === 1 && diceResults[1] === 1;
    const finalSuccess = isFumble ? false : success;

    // Create chat message for the BOD check
    const resultText = finalSuccess ? 'Success' : 'Failure - Bleeding!';
    const resultClass = finalSuccess ? 'success' : 'failure';

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="mech-foundry roll-result bod-bleeding-check">
        <div class="roll-title">BOD Check - Heavy Damage</div>
        <div class="check-reason">${this.name} took ${damageDealt} standard damage (threshold: ${threshold})</div>
        <div class="roll-formula">[${diceResults[0]}]+[${diceResults[1]}] + ${totalMod} = ${roll.total}</div>
        <div class="roll-tn">TN: ${targetNumber}</div>
        <div class="roll-mos ${resultClass}">MoS: ${mos} [${resultText}]</div>
        ${!finalSuccess ? '<div class="bleeding-result"><i class="fas fa-tint"></i> <strong>Bleeding status applied!</strong></div>' : ''}
        ${isFumble ? '<div class="special-roll fumble">FUMBLE! (Auto-fail)</div>' : ''}
      </div>`,
      rolls: [roll]
    });

    // If failed, apply bleeding
    if (!finalSuccess) {
      await this.update({ "system.bleeding": true });
    }
  }

  /**
   * Calculate range modifier for a ranged attack
   * Measures distance between attacker and target tokens, compares to weapon range brackets
   * @param {Object} weaponData The weapon's system data
   * @param {Token} targetToken The target token
   * @returns {Object|null} Range info {modifier, category, distance} or null if unmeasurable
   */
  _calculateRangeModifier(weaponData, targetToken) {
    // Need canvas and tokens to measure distance
    if (!canvas?.ready || !canvas?.scene) return null;

    // Find attacker token on canvas
    const attackerTokens = this.getActiveTokens(true);
    const attackerToken = attackerTokens[0];
    if (!attackerToken || !targetToken) return null;

    // Measure distance using Foundry's grid system
    let distance;
    try {
      const ray = new Ray(attackerToken.center, targetToken.center);
      const segments = [{ ray }];
      distance = canvas.grid.measureDistances(segments, { gridSpaces: false })[0];
    } catch (e) {
      return null;
    }

    if (distance == null || isNaN(distance)) return null;

    // Round distance up to nearest whole number
    distance = Math.ceil(distance);

    // Get weapon range brackets (values are in meters)
    const ranges = weaponData.range || {};
    const pb = Number(ranges.pointBlank) || 0;
    const short = Number(ranges.short) || 0;
    const medium = Number(ranges.medium) || 0;
    const long = Number(ranges.long) || 0;
    const extreme = Number(ranges.extreme) || 0;

    // If no ranges defined, cannot determine modifier
    if (pb === 0 && short === 0 && medium === 0 && long === 0 && extreme === 0) return null;

    // Determine range category (compare rounded-up distance to range brackets)
    let category, modifier;
    if (pb > 0 && distance <= pb) {
      category = 'Point Blank';
      modifier = 1;
    } else if (short > 0 && distance <= short) {
      category = 'Short';
      modifier = 0;
    } else if (medium > 0 && distance <= medium) {
      category = 'Medium';
      modifier = -2;
    } else if (long > 0 && distance <= long) {
      category = 'Long';
      modifier = -4;
    } else if (extreme > 0 && distance <= extreme) {
      category = 'Extreme';
      modifier = -6;
    } else {
      // Beyond extreme range
      category = 'Out of Range';
      modifier = -6;
    }

    return { modifier, category, distance };
  }

  /**
   * Check for unconsciousness or death
   */
  async _checkCondition() {
    const damage = this.system.damage.value || 0;
    const fatigue = this.system.fatigue.value || 0;
    const damageCapacity = this.system.damageCapacity;
    const fatigueCapacity = this.system.fatigueCapacity;

    if (damage >= damageCapacity) {
      ui.notifications.error(`${this.name} has died!`);
    } else if (fatigue >= fatigueCapacity) {
      ui.notifications.warn(`${this.name} has fallen unconscious!`);
      await this.update({ "system.unconscious": true });
      // Excess fatigue becomes standard damage
      const excessFatigue = fatigue - fatigueCapacity;
      if (excessFatigue > 0) {
        await this.update({
          "system.damage.value": damage + excessFatigue,
          "system.fatigue.value": fatigueCapacity
        });
      }
    }
  }

  /**
   * Recover fatigue (Complex Action)
   * Recovers fatigue points equal to BOD score (total)
   */
  async recoverFatigue() {
    const bod = this.system.attributes.bod.total;
    const currentFatigue = this.system.fatigue.value || 0;
    const newFatigue = Math.max(0, currentFatigue - bod);

    await this.update({
      "system.fatigue.value": newFatigue
    });

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `${this.name} recovers ${Math.min(bod, currentFatigue)} Fatigue points.`
    });
  }

  /**
   * Clear stun effect (Simple Action)
   */
  async clearStun() {
    if (!this.system.stun) {
      ui.notifications.info("Not currently stunned.");
      return;
    }

    await this.update({
      "system.stun": false
    });

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `${this.name} shakes off the stun effect.`
    });
  }

  /**
   * Apply standard damage to this actor (used by active effects)
   * @param {number} amount Amount of standard damage to apply
   * @returns {Object} Result with newDamage value and any triggered conditions
   */
  async applyStandardDamage(amount) {
    if (amount <= 0) return { newDamage: this.system.damage?.value || 0, died: false };

    const currentDamage = this.system.damage?.value || 0;
    const maxDamage = this.system.damageCapacity || 10;
    const newDamage = Math.min(currentDamage + amount, maxDamage);

    await this.update({
      "system.damage.value": newDamage
    });

    // Check for death
    const died = newDamage >= maxDamage;
    if (died) {
      ui.notifications.error(`${this.name} has died!`);
    }

    return { newDamage, died };
  }

  /**
   * Apply fatigue damage to this actor (used by active effects)
   * @param {number} amount Amount of fatigue damage to apply
   * @returns {Object} Result with newFatigue value and any triggered conditions
   */
  async applyFatigueDamage(amount) {
    if (amount <= 0) return { newFatigue: this.system.fatigue?.value || 0, unconscious: false, excessDamage: 0 };

    const currentFatigue = this.system.fatigue?.value || 0;
    const maxFatigue = this.system.fatigueCapacity || 10;
    const newFatigue = Math.min(currentFatigue + amount, maxFatigue);

    await this.update({
      "system.fatigue.value": newFatigue
    });

    // Check for unconsciousness
    let unconscious = false;
    let excessDamage = 0;

    if (newFatigue >= maxFatigue) {
      unconscious = true;
      ui.notifications.warn(`${this.name} has fallen unconscious!`);
      await this.update({ "system.unconscious": true });

      // Calculate excess fatigue that becomes standard damage
      excessDamage = (currentFatigue + amount) - maxFatigue;
      if (excessDamage > 0) {
        const currentDamage = this.system.damage?.value || 0;
        const maxDamage = this.system.damageCapacity || 10;
        const newDamage = Math.min(currentDamage + excessDamage, maxDamage);
        await this.update({
          "system.damage.value": newDamage
        });

        if (newDamage >= maxDamage) {
          ui.notifications.error(`${this.name} has died from excess fatigue!`);
        }
      }
    }

    return { newFatigue, unconscious, excessDamage };
  }

  /**
   * Roll consciousness check (TN 7)
   */
  async rollConsciousness() {
    const wil = this.system.attributes.wil;
    let totalMod = wil.linkMod || 0;
    totalMod += this.system.injuryModifier || 0;
    totalMod += this.system.fatigueModifier || 0;
    const targetNumber = 7;

    const roll = new Roll(`2d6 + ${totalMod}`);
    await roll.evaluate();

    // Extract raw dice results for display
    const diceResults = roll.dice[0].results.map(r => r.result);

    // Check for special roll mechanics (Fumble, Stunning Success, Miraculous Feat)
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(diceResults);
    const successInfo = DiceMechanics.determineSuccess(roll.total, targetNumber, specialRoll);

    const success = successInfo.success;
    const finalTotal = successInfo.finalTotal;

    if (!success) {
      await this.update({ "system.unconscious": true });
    }

    // Build special roll display
    let specialRollHtml = '';
    if (specialRoll.isFumble) {
      specialRollHtml = `<div class="special-roll fumble">${specialRoll.displayText}</div>`;
    } else if (specialRoll.isStunningSuccess) {
      const bonusDiceStr = DiceMechanics.formatBonusDice(specialRoll.bonusDice);
      specialRollHtml = `<div class="special-roll ${specialRoll.isMiraculousFeat ? 'miraculous-feat' : 'stunning-success'}">
        ${specialRoll.displayText}
        <span class="bonus-dice">(Bonus: ${bonusDiceStr})</span>
      </div>`;
    }

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: "Consciousness Check (TN 7)",
      content: `
        <div class="mech-foundry roll-result">
          ${specialRollHtml}
          <div class="dice-formula">[${diceResults.join(']+[')}] + ${totalMod}${specialRoll.bonusTotal ? ` + ${specialRoll.bonusTotal} bonus` : ''} = ${finalTotal}</div>
          <div class="dice-result">
            <strong>Roll:</strong> ${finalTotal}
          </div>
          <div class="result ${success ? 'success' : 'failure'}">
            ${success ? 'Remains Conscious!' : 'Falls Unconscious!'}${successInfo.autoResult ? ' (Auto)' : ''}
          </div>
        </div>
      `,
      rolls: [roll]
    });

    return success;
  }

  /**
   * Roll initiative (2d6, highest RFL breaks ties)
   */
  async rollInitiativeDialog() {
    // Check for Combat Sense trait (roll 3d6, use highest 2)
    const hasCombatSense = this.items.some(i =>
      i.type === 'trait' &&
      i.name.toLowerCase().includes('combat sense')
    );

    const formula = hasCombatSense ? '3d6kh2' : '2d6';
    const roll = new Roll(formula);
    await roll.evaluate();

    return roll.total;
  }

  /* -------------------------------------------- */
  /*  Ammunition Management                        */
  /* -------------------------------------------- */

  /**
   * Check if ammo is compatible with a weapon based on their tags.
   * @param {Item} weapon The weapon item
   * @param {Item} ammo The ammo item
   * @returns {boolean} True if compatible
   */
  _isAmmoCompatible(weapon, ammo) {
    const weaponTags = weapon.system.ammoCompatibility || [];
    const ammoTags = ammo.system.weaponCompatibility || [];

    // If weapon has no compatibility tags, it doesn't use ammo
    if (weaponTags.length === 0) return false;

    // If ammo has no compatibility tags, it's incompatible
    if (ammoTags.length === 0) return false;

    // Energy ammo only for weapons with PPS > 0
    if (ammo.system.ammoCategory === 'energy' && !weapon.system.pps) {
      return false;
    }

    // Check for any matching tag
    return weaponTags.some(tag => ammoTags.includes(tag));
  }

  /**
   * Load ammo into a weapon. Automatically unloads existing ammo first.
   * @param {string} weaponId The weapon item ID
   * @param {string} ammoId The ammo item ID to load
   * @returns {Promise<boolean>} True if successful
   */
  async loadAmmoIntoWeapon(weaponId, ammoId) {
    const weapon = this.items.get(weaponId);
    const ammo = this.items.get(ammoId);

    if (!weapon || !ammo) {
      ui.notifications.error("Invalid weapon or ammo.");
      return false;
    }

    if (weapon.type !== 'weapon') {
      ui.notifications.error("Target is not a weapon.");
      return false;
    }

    if (ammo.type !== 'ammo') {
      ui.notifications.error("Item is not ammunition.");
      return false;
    }

    // Validate compatibility
    if (!this._isAmmoCompatible(weapon, ammo)) {
      ui.notifications.warn(`${ammo.name} is not compatible with ${weapon.name}.`);
      return false;
    }

    // Unload existing ammo first (handles all categories appropriately)
    if (weapon.system.loadedAmmo) {
      await this.unloadAmmoFromWeapon(weaponId);
    }

    const ammoCategory = ammo.system.ammoCategory;
    const magazineCapacity = weapon.system.ammo.max;
    const available = ammo.system.quantity.value;

    if (available <= 0) {
      ui.notifications.warn(`${ammo.name} is empty.`);
      return false;
    }

    switch (ammoCategory) {
      case 'energy':
        // Link power pack to weapon (pack tracks its own PP)
        await weapon.update({
          'system.loadedAmmo': ammoId,
          'system.loadedAmmoName': ammo.name,
          'system.loadedAmmoCategory': 'energy'
        });
        // Mark the ammo as loaded in this weapon
        await ammo.update({ 'system.loadedInWeapon': weaponId });
        ui.notifications.info(
          `Attached ${ammo.name} to ${weapon.name} (${available} PP available).`
        );
        break;

      case 'ballistics':
      case 'ordnance':
        // Load rounds into weapon's magazine
        const toLoad = Math.min(magazineCapacity, available);
        const remaining = available - toLoad;

        await weapon.update({
          'system.loadedAmmo': ammoId,
          'system.loadedAmmoName': ammo.name,
          'system.loadedAmmoCategory': ammoCategory,
          'system.ammo.value': toLoad
        });

        // Update ammo item to show loaded amount and link to weapon
        await ammo.update({
          'system.quantity.value': toLoad,
          'system.loadedInWeapon': weaponId
        });

        // If there were remaining rounds, create a new partial stack in inventory
        if (remaining > 0) {
          const partialData = ammo.toObject();
          partialData.system.quantity.value = remaining;
          partialData.system.loadedInWeapon = null;
          delete partialData._id;
          await this.createEmbeddedDocuments('Item', [partialData]);
          ui.notifications.info(
            `Loaded ${toLoad} ${ammo.name} into ${weapon.name}. ${remaining} rounds remain in inventory.`
          );
        } else {
          ui.notifications.info(
            `Loaded ${toLoad} ${ammo.name} into ${weapon.name}.`
          );
        }
        break;
    }

    return true;
  }

  /**
   * Unload ammo from a weapon, returning it to inventory.
   * The ammo item already exists in inventory (marked as loaded), just clear the references.
   * @param {string} weaponId The weapon item ID
   */
  async unloadAmmoFromWeapon(weaponId) {
    const weapon = this.items.get(weaponId);
    if (!weapon) return;

    const loadedAmmoId = weapon.system.loadedAmmo;
    if (!loadedAmmoId) {
      ui.notifications.info(`${weapon.name} has no ammo loaded.`);
      return;
    }

    const loadedAmmo = this.items.get(loadedAmmoId);
    if (!loadedAmmo) {
      // Orphaned reference, just clear it
      await weapon.update({
        'system.loadedAmmo': null,
        'system.loadedAmmoName': '',
        'system.loadedAmmoCategory': '',
        'system.ammo.value': 0
      });
      return;
    }

    const ammoCategory = loadedAmmo.system.ammoCategory;
    const remainingRounds = weapon.system.ammo.value;

    switch (ammoCategory) {
      case 'energy':
        // Power pack remains in inventory with current PP
        await loadedAmmo.update({ 'system.loadedInWeapon': null });
        ui.notifications.info(
          `Detached ${loadedAmmo.name} (${loadedAmmo.system.quantity.value}/${loadedAmmo.system.quantity.max} PP remaining).`
        );
        break;

      case 'ballistics':
      case 'ordnance':
        // The ammo item already has the current quantity (synced during firing)
        // Just clear the loaded reference
        await loadedAmmo.update({ 'system.loadedInWeapon': null });

        if (remainingRounds > 0) {
          ui.notifications.info(
            `Unloaded ${loadedAmmo.name} (${remainingRounds} rounds remaining).`
          );
        } else {
          ui.notifications.info(`${weapon.name} unloaded (empty).`);
        }
        break;
    }

    // Clear weapon's ammo reference
    await weapon.update({
      'system.loadedAmmo': null,
      'system.loadedAmmoName': '',
      'system.loadedAmmoCategory': '',
      'system.ammo.value': 0
    });
  }

  /**
   * Reload a weapon from its currently loaded ammo type (if available in inventory).
   * For energy weapons, this is a no-op (swap power packs instead).
   * @param {string} weaponId The weapon item ID
   * @param {string} [ammoId] Optional specific ammo ID to reload from
   */
  async reloadWeapon(weaponId, ammoId = null) {
    const weapon = this.items.get(weaponId);
    if (!weapon) return;

    const currentAmmoId = ammoId || weapon.system.loadedAmmo;
    if (!currentAmmoId) {
      ui.notifications.warn('No ammo type selected for reload.');
      return;
    }

    const ammo = this.items.get(currentAmmoId);
    if (!ammo) {
      ui.notifications.warn('Ammo not found in inventory.');
      return;
    }

    const ammoCategory = ammo.system.ammoCategory;

    if (ammoCategory === 'energy') {
      // Energy packs don't reload - swap instead
      ui.notifications.info('Swap power packs using Load Ammo.');
      return;
    }

    const currentInMag = weapon.system.ammo.value;
    const magazineCapacity = weapon.system.ammo.max;
    const needed = magazineCapacity - currentInMag;
    const available = ammo.system.quantity.value;

    if (needed <= 0) {
      ui.notifications.info('Magazine is already full.');
      return;
    }

    if (available <= 0) {
      ui.notifications.warn('No ammo available to reload.');
      return;
    }

    const toLoad = Math.min(needed, available);

    await weapon.update({ 'system.ammo.value': currentInMag + toLoad });

    const remaining = available - toLoad;
    if (remaining <= 0) {
      await ammo.delete();
    } else {
      await ammo.update({ 'system.quantity.value': remaining });
    }

    ui.notifications.info(`Reloaded ${toLoad} rounds into ${weapon.name}.`);
  }

  /**
   * Get compatible ammo items from inventory for a weapon.
   * @param {string} weaponId The weapon item ID
   * @returns {Item[]} Array of compatible ammo items
   */
  getCompatibleAmmo(weaponId) {
    const weapon = this.items.get(weaponId);
    if (!weapon) return [];

    return this.items.filter(item =>
      item.type === 'ammo' &&
      this._isAmmoCompatible(weapon, item) &&
      item.system.quantity.value > 0
    );
  }

  /**
   * Get effective weapon stats including ammo modifications.
   * @param {string} weaponId The weapon item ID
   * @returns {Object} Effective stats (ap, apFactor, bd, bdFactor, range, specialEffects)
   */
  getWeaponEffectiveStats(weaponId) {
    const weapon = this.items.get(weaponId);
    if (!weapon) return null;

    const base = {
      ap: weapon.system.ap,
      apFactor: weapon.system.apFactor,
      bd: weapon.system.bd,
      bdFactor: weapon.system.bdFactor,
      range: { ...weapon.system.range },
      specialEffects: []
    };

    const loadedAmmoId = weapon.system.loadedAmmo;
    if (!loadedAmmoId) return base;

    const loadedAmmo = this.items.get(loadedAmmoId);
    if (!loadedAmmo) return base;

    const ammoData = loadedAmmo.system;

    if (ammoData.ammoCategory === 'ballistics') {
      // Apply modifiers
      base.ap += ammoData.apModifier || 0;
      base.bd += ammoData.bdModifier || 0;

      // Override factors if specified
      if (ammoData.apFactorOverride) base.apFactor = ammoData.apFactorOverride;
      if (ammoData.bdFactorOverride) base.bdFactor = ammoData.bdFactorOverride;

      // Apply range modifier
      if (ammoData.rangeModifier && ammoData.rangeModifier !== 1.0) {
        for (const band of ['pointBlank', 'short', 'medium', 'long', 'extreme']) {
          if (base.range[band]) {
            base.range[band] = Math.floor(Number(base.range[band]) * ammoData.rangeModifier);
          }
        }
      }

      // Add special effects
      base.specialEffects = ammoData.specialEffects || [];

    } else if (ammoData.ammoCategory === 'ordnance') {
      // Ordnance completely replaces weapon stats
      base.ap = ammoData.ap;
      base.apFactor = ammoData.damageType;
      base.bd = ammoData.bd;
      base.bdFactor = ammoData.bdFactorOverride || '';
      base.specialEffects = ammoData.specialEffects || [];
    }
    // Energy weapons: no stat modification, just power consumption

    return base;
  }

  /**
   * Inflict a wound (critical hit effect) on this actor
   * Wound types: dazed, deafened, blinded, internalDamage, shatteredLimb
   * @param {string} woundType The type of wound
   * @param {string} location The hit location (head, torso, arm, leg)
   * @param {string} source Description of what caused the wound
   */
  async inflictWound(woundType, location = null, source = 'Critical Hit') {
    const validTypes = ['dazed', 'concussion', 'hemorrhage', 'traumaticImpact', 'nerveDamage', 'severeStrain', 'severelyWounded'];
    if (!validTypes.includes(woundType)) {
      console.warn(`Invalid wound type: ${woundType}`);
      return;
    }

    const wounds = [...(this.system.wounds || [])];

    // Check if character already has this wound type (except severelyWounded which can stack)
    const hasDuplicate = woundType !== 'severelyWounded' &&
      wounds.some(w => w.type === woundType);

    let actualWoundType = woundType;
    if (hasDuplicate) {
      // Convert to Severely Wounded instead of duplicating
      actualWoundType = 'severelyWounded';
      ui.notifications.warn(`${this.name} already has ${this._getWoundName(woundType)}! Inflicting Severely Wounded instead.`);
    }

    wounds.push({
      type: actualWoundType,
      location: location,
      source: source,
      timestamp: Date.now()
    });

    // Apply immediate effects based on wound type
    const updates = { "system.wounds": wounds };

    // Hemorrhage causes automatic bleeding
    if (actualWoundType === 'hemorrhage') {
      updates["system.bleeding"] = true;
    }

    await this.update(updates);

    const locationText = location ? ` (${location})` : '';
    ui.notifications.warn(`${this.name} suffers ${this._getWoundName(actualWoundType)}${locationText}!`);

    // Check for death/coma after wound is applied (will be calculated in derived stats)
    // Force a re-render to trigger the checks
    this.prepareData();

    if (this.system.dead) {
      ui.notifications.error(`${this.name} has died from their wounds!`);
    } else if (this.system.coma) {
      ui.notifications.error(`${this.name} has fallen into a coma from their wounds!`);
    }

    return actualWoundType;
  }

  /**
   * Get display name for wound type
   * @param {string} woundType
   * @returns {string}
   */
  _getWoundName(woundType) {
    const woundNames = {
      dazed: 'Dazed',
      concussion: 'Concussion',
      hemorrhage: 'Hemorrhage',
      traumaticImpact: 'Traumatic Impact',
      nerveDamage: 'Nerve Damage',
      severeStrain: 'Severe Strain',
      severelyWounded: 'Severely Wounded'
    };
    return woundNames[woundType] || woundType;
  }

  /**
   * Remove a wound from this actor
   * @param {number} woundIndex The index of the wound to remove
   */
  async healWound(woundIndex) {
    const wounds = [...(this.system.wounds || [])];
    if (woundIndex < 0 || woundIndex >= wounds.length) {
      console.warn(`Invalid wound index: ${woundIndex}`);
      return;
    }

    const removedWound = wounds.splice(woundIndex, 1)[0];

    // If hemorrhage is removed, check if bleeding should stop
    const updates = { "system.wounds": wounds };
    if (removedWound.type === 'hemorrhage') {
      // Only stop bleeding if no other hemorrhage wounds exist
      const hasOtherHemorrhage = wounds.some(w => w.type === 'hemorrhage');
      if (!hasOtherHemorrhage) {
        updates["system.bleeding"] = false;
      }
    }

    await this.update(updates);

    ui.notifications.info(`${this.name}'s ${this._getWoundName(removedWound.type)} wound has been healed.`);
    return removedWound;
  }
}
