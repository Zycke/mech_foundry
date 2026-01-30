import { OpposedRollHelper } from '../helpers/opposed-rolls.mjs';
import { SocketHandler, SOCKET_EVENTS } from '../helpers/socket-handler.mjs';

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

    // Calculate Link Attribute Modifiers for all attributes
    this._calculateLinkModifiers(systemData);

    // Calculate derived values
    this._calculateDerivedStats(systemData);

    // Apply active effect modifiers to movement
    this._applyActiveEffectModifiers(systemData, 'movement');

    // Calculate total XP (available + spent)
    if (systemData.xp) {
      systemData.xp.total = (systemData.xp.value || 0) + (systemData.xp.spent || 0);
    }

    // Store active skill modifiers for use in rolls
    systemData.activeSkillModifiers = this._getActiveSkillModifiers();
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

    // Damage Capacity = BOD x 2
    systemData.damageCapacity = bod * 2;
    // Set damage.max for token bar compatibility
    if (systemData.damage) systemData.damage.max = systemData.damageCapacity;

    // Fatigue Capacity = WIL x 2
    systemData.fatigueCapacity = wil * 2;
    // Set fatigue.max for token bar compatibility
    if (systemData.fatigue) systemData.fatigue.max = systemData.fatigueCapacity;

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

    // Calculate Injury Modifier (-1 per 25% of damage capacity)
    const damagePercent = (systemData.damage?.value || 0) / systemData.damageCapacity;
    systemData.injuryModifier = -Math.floor(damagePercent * 4);
    if (systemData.injuryModifier > 0) systemData.injuryModifier = 0;

    // Calculate Fatigue Modifier (-(Fatigue - WIL), minimum 0)
    const fatigueDiff = (systemData.fatigue?.value || 0) - wil;
    systemData.fatigueModifier = fatigueDiff > 0 ? -fatigueDiff : 0;

    // Current Edge (total - burned)
    if (systemData.attributes.edg) {
      systemData.attributes.edg.current =
        systemData.attributes.edg.total - (systemData.attributes.edg.burned || 0);
    }
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

    const success = roll.total >= targetNumber;
    const marginOfSuccess = roll.total - targetNumber;

    // Create chat message
    const messageContent = await renderTemplate(
      "systems/mech-foundry/templates/chat/skill-roll.hbs",
      {
        skillName: skill.name,
        total: roll.total,
        targetNumber: targetNumber,
        success: success,
        marginOfSuccess: marginOfSuccess,
        diceResults: diceResults,
        // Broken down modifiers for display
        skillMod: skillLevel + linkMod,
        inputMod: inputMod,
        injuryMod: injuryMod,
        fatigueMod: fatigueMod
      }
    );

    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${skill.name} Skill Check`,
      content: messageContent,
      rolls: [roll]
    };

    ChatMessage.create(messageData);
    return { roll, success, marginOfSuccess };
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
    const hasBurstFire = weaponData.bdFactor === 'B';
    const recoil = weaponData.recoil || 0;
    const burstRating = weaponData.burstRating || 0;
    const currentAmmo = weaponData.ammo?.value || 0;
    const firingMode = options.firingMode || 'single';
    const weaponType = weaponData.weaponType || 'smallarms';

    // Track modifiers separately for display
    let recoilMod = 0;
    let firingModeMod = 0;
    const inputMod = options.modifier || 0;
    const injuryMod = this.system.injuryModifier || 0;
    const fatigueMod = this.system.fatigueModifier || 0;

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
      numAttacks = options.numTargets || 1;
      const area = options.suppressionArea || 1;
      const roundsPerSqm = options.roundsPerSqm || 1;
      recoilMod = recoil;
      firingModeMod = area - roundsPerSqm;  // Area penalty minus rounds benefit
    }

    // Check ammo
    if (weaponData.ammo?.max > 0 && currentAmmo < ammoUsed) {
      ui.notifications.error(`Not enough ammunition! Need ${ammoUsed}, have ${currentAmmo}.`);
      return;
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

    // Calculate total modifier
    const totalMod = skillMod + inputMod + injuryMod + fatigueMod - recoilMod - firingModeMod;
    const targetNumber = skill?.system.targetNumber || 7;

    // Get weapon damage values
    const baseDamage = weaponData.bd || 0;
    const ap = weaponData.ap || 0;
    const apFactor = weaponData.apFactor || '';
    const isSubduing = weaponData.subduing || weaponData.bdFactor === 'D';
    const str = this.system.attributes.str?.value || 5;

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
      const success = roll.total >= targetNumber;
      const marginOfSuccess = roll.total - targetNumber;

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
      }

      results.push({
        roll,
        total: roll.total,
        diceResults,
        success,
        marginOfSuccess,
        targetIndex: numAttacks > 1 ? i + 1 : null,
        // Damage info
        standardDamage,
        fatigueDamage,
        baseDamage: isMelee ? baseDamage + strDamage : baseDamage,
        mosDamage,
        ap,
        apFactor,
        isSubduing: isSubduing || (isMelee && baseDamage === 0)
      });
    }

    // Reduce ammo
    if (weaponData.ammo?.max > 0) {
      await weapon.update({ "system.ammo.value": Math.max(0, currentAmmo - ammoUsed) });
    }

    // Create chat message
    const messageContent = await renderTemplate(
      "systems/mech-foundry/templates/chat/weapon-attack.hbs",
      {
        weaponName: weapon.name,
        attackType: attackType,
        firingMode: firingMode,
        ammoUsed: ammoUsed,
        targetNumber: targetNumber,
        results: results,
        // Broken down modifiers for display
        skillMod: skillMod,
        inputMod: inputMod,
        recoilMod: recoilMod,
        firingModeMod: firingModeMod,
        injuryMod: injuryMod,
        fatigueMod: fatigueMod
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
    const totalMod = skillMod + inputMod + injuryMod + fatigueMod;
    const targetNumber = skill?.system.targetNumber || 7;

    const roll = await new Roll(`2d6 + ${totalMod}`).evaluate();
    const diceResults = roll.dice[0].results.map(r => r.result);
    const success = roll.total >= targetNumber;
    const mos = roll.total - targetNumber;

    return {
      roll,
      total: roll.total,
      diceResults,
      success,
      mos,
      targetNumber,
      modifier: totalMod,
      skillMod,
      inputMod,
      injuryMod,
      fatigueMod
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

    // Prepare template data
    const templateData = {
      rollId,
      attackerName: this.name,
      attackerActorId: this.id,
      attackerWeaponName: weapon.name,
      attackerResult,
      defenderName: targetActor.name,
      defenderActorId: targetActor.id,
      defenderResult,
      resolution
    };

    // Calculate attacker damage to defender if applicable
    if (resolution.attackerDealsDefenderDamage) {
      const attackerDamage = OpposedRollHelper.calculateMeleeDamage(this, weapon, attackerResult.mos);
      const attackerHitLocation = await OpposedRollHelper.rollHitLocation();

      // Calculate armor reduction
      const attackerArmorCalc = OpposedRollHelper.calculateDamageAfterArmor(
        attackerDamage.isSubduing ? attackerDamage.fatigueDamage : attackerDamage.standardDamage,
        attackerDamage.ap,
        attackerDamage.damageType,
        targetActor,
        attackerHitLocation.armorLocation
      );

      templateData.attackerDamage = attackerDamage;
      templateData.attackerHitLocation = attackerHitLocation;
      templateData.attackerArmorCalc = attackerArmorCalc;
      templateData.attackerDamageTypeName = OpposedRollHelper.getDamageTypeName(attackerDamage.damageType);
      templateData.canApplyAttackerDamage = targetActor.isOwner || game.user.isGM;
    }

    // Calculate defender damage to attacker (counterstrike or mutual damage)
    if (resolution.defenderDealsAttackerDamage) {
      const defenderWeapon = OpposedRollHelper.getDefenderWeapon(targetActor);
      const defenderDamage = OpposedRollHelper.calculateMeleeDamage(targetActor, defenderWeapon, defenderResult.mos);
      const defenderHitLocation = await OpposedRollHelper.rollHitLocation();

      // Calculate armor reduction against attacker
      const defenderArmorCalc = OpposedRollHelper.calculateDamageAfterArmor(
        defenderDamage.isSubduing ? defenderDamage.fatigueDamage : defenderDamage.standardDamage,
        defenderDamage.ap,
        defenderDamage.damageType,
        this,
        defenderHitLocation.armorLocation
      );

      templateData.defenderDamage = defenderDamage;
      templateData.defenderHitLocation = defenderHitLocation;
      templateData.defenderArmorCalc = defenderArmorCalc;
      templateData.defenderDamageTypeName = OpposedRollHelper.getDamageTypeName(defenderDamage.damageType);
      templateData.canApplyDefenderDamage = this.isOwner || game.user.isGM;
    }

    // Show defender choice if applicable
    if (resolution.defenderChoice) {
      templateData.showDefenderChoice = targetActor.isOwner || game.user.isGM;

      // Pre-calculate potential damage for both choices
      const attackerDamage = OpposedRollHelper.calculateMeleeDamage(this, weapon, attackerResult.mos);
      const attackerHitLocation = await OpposedRollHelper.rollHitLocation();
      const attackerArmorCalc = OpposedRollHelper.calculateDamageAfterArmor(
        attackerDamage.isSubduing ? attackerDamage.fatigueDamage : attackerDamage.standardDamage,
        attackerDamage.ap,
        attackerDamage.damageType,
        targetActor,
        attackerHitLocation.armorLocation
      );

      templateData.attackerDamage = attackerDamage;
      templateData.attackerHitLocation = attackerHitLocation;
      templateData.attackerArmorCalc = attackerArmorCalc;
      templateData.attackerDamageTypeName = OpposedRollHelper.getDamageTypeName(attackerDamage.damageType);

      const defenderWeapon = OpposedRollHelper.getDefenderWeapon(targetActor);
      const defenderDamage = OpposedRollHelper.calculateMeleeDamage(targetActor, defenderWeapon, defenderResult.mos);
      const defenderHitLocation = await OpposedRollHelper.rollHitLocation();
      const defenderArmorCalc = OpposedRollHelper.calculateDamageAfterArmor(
        defenderDamage.isSubduing ? defenderDamage.fatigueDamage : defenderDamage.standardDamage,
        defenderDamage.ap,
        defenderDamage.damageType,
        this,
        defenderHitLocation.armorLocation
      );

      templateData.defenderDamage = defenderDamage;
      templateData.defenderHitLocation = defenderHitLocation;
      templateData.defenderArmorCalc = defenderArmorCalc;
      templateData.defenderDamageTypeName = OpposedRollHelper.getDamageTypeName(defenderDamage.damageType);
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
      flavor: game.i18n.localize('MECHFOUNDRY.OpposedMeleeAttack'),
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

    const success = roll.total >= targetNumber;
    const marginOfSuccess = roll.total - targetNumber;

    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${checkName} Attribute Check (TN ${targetNumber})`,
      content: `
        <div class="mech-foundry roll-result">
          <div class="dice-raw">Dice: ${diceResults.join(' + ')} = ${rawDiceTotal}</div>
          <div class="dice-formula">${rawDiceTotal} ${totalMod >= 0 ? '+' : ''}${totalMod} = ${roll.total}</div>
          <div class="dice-result">
            <strong>Roll:</strong> ${roll.total}
            <span class="target">(Target: ${targetNumber})</span>
          </div>
          <div class="result ${success ? 'success' : 'failure'}">
            ${success ? 'Success' : 'Failure'}
            <span class="margin">(MoS: ${marginOfSuccess >= 0 ? '+' : ''}${marginOfSuccess})</span>
          </div>
        </div>
      `,
      rolls: [roll]
    };

    ChatMessage.create(messageData);
    return { roll, success, marginOfSuccess };
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
      await this.update({
        "system.damage.value": newDamage,
        "system.fatigue.value": newFatigue,
        "system.stun": true
      });
    }

    // Check for unconsciousness or death
    await this._checkCondition();
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

    const roll = new Roll(`2d6 + ${totalMod}`);
    await roll.evaluate();

    const success = roll.total >= 7;

    if (!success) {
      await this.update({ "system.unconscious": true });
    }

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: "Consciousness Check (TN 7)",
      content: `
        <div class="mech-foundry roll-result">
          <div class="dice-result">
            <strong>Roll:</strong> ${roll.total}
          </div>
          <div class="result ${success ? 'success' : 'failure'}">
            ${success ? 'Remains Conscious!' : 'Falls Unconscious!'}
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
}
