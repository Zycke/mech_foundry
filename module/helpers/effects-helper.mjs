/**
 * Item Effects Helper
 * Handles Active Effects tied to items that apply when equipped
 */

/**
 * Effect categories and types
 */
export const EFFECT_CATEGORIES = {
  combat: {
    label: "Combat",
    types: {
      ranged_attack_bonus: { label: "Ranged Attack Bonus", hasValue: true },
      melee_attack_bonus: { label: "Melee Attack Bonus", hasValue: true },
      all_attack_bonus: { label: "All Attack Bonus", hasValue: true },
      damage_bonus: { label: "Damage Bonus", hasValue: true },
      ranged_damage_bonus: { label: "Ranged Damage Bonus", hasValue: true },
      melee_damage_bonus: { label: "Melee Damage Bonus", hasValue: true }
    }
  },
  vision: {
    label: "Vision",
    types: {
      vision_basic: { label: "Basic Vision", hasValue: true, unit: "meters" },
      vision_darkvision: { label: "Darkvision", hasValue: true, unit: "meters" },
      vision_monochromatic: { label: "Monochromatic", hasValue: true, unit: "meters" },
      vision_tremorsense: { label: "Tremorsense", hasValue: true, unit: "meters" },
      vision_lightAmplification: { label: "Light Amplification", hasValue: true, unit: "meters" }
    }
  },
  light: {
    label: "Light",
    types: {
      light_emission: { label: "Light Emission", hasValue: false, hasBrightDim: true }
    }
  },
  attribute: {
    label: "Attribute",
    types: {
      attribute_bonus: { label: "Attribute Bonus", hasValue: true, hasTarget: true }
    }
  },
  movement: {
    label: "Movement",
    types: {
      movement_bonus: { label: "Movement Bonus", hasValue: true, hasTarget: true }
    }
  },
  skill: {
    label: "Skill",
    types: {
      skill_bonus: { label: "Skill Bonus", hasValue: true, hasTarget: true }
    }
  }
};

/**
 * Get a flat list of all effect types for select dropdowns
 * @returns {Object} Object mapping effectType to label
 */
export function getEffectTypeOptions() {
  const options = {};
  for (const [catKey, category] of Object.entries(EFFECT_CATEGORIES)) {
    for (const [typeKey, typeData] of Object.entries(category.types)) {
      options[typeKey] = `${category.label}: ${typeData.label}`;
    }
  }
  return options;
}

/**
 * Get the category for an effect type
 * @param {string} effectType The effect type
 * @returns {string|null} The category key or null
 */
export function getEffectCategory(effectType) {
  for (const [catKey, category] of Object.entries(EFFECT_CATEGORIES)) {
    if (effectType in category.types) {
      return catKey;
    }
  }
  return null;
}

/**
 * Item Effects Helper class
 */
export class ItemEffectsHelper {

  /**
   * Get all effects from equipped items on an actor
   * @param {Actor} actor The actor to check
   * @param {boolean} includeInactive If true, include inactive toggleable effects
   * @returns {Array} Array of effect objects with source item info
   */
  static getEquippedItemEffects(actor, includeInactive = false) {
    const effects = [];

    // Get all items that can have effects and are equipped
    const equippableTypes = ['weapon', 'armor', 'electronics', 'healthcare', 'prosthetics'];

    for (const item of actor.items) {
      if (!equippableTypes.includes(item.type)) continue;

      // Check if item is equipped
      const isEquipped = this._isItemEquipped(item);
      if (!isEquipped) continue;

      // Get effects from this item
      const itemEffects = item.system.itemEffects || [];
      for (let effectIndex = 0; effectIndex < itemEffects.length; effectIndex++) {
        const effect = itemEffects[effectIndex];
        if (!effect.effectType) continue;

        // Check if effect is toggleable and active
        const isToggleable = effect.toggleable === true;
        const isActive = effect.active !== false; // Default to active if not set

        // Skip inactive toggleable effects unless includeInactive is true
        if (!includeInactive && isToggleable && !isActive) continue;

        effects.push({
          ...effect,
          sourceItemId: item.id,
          sourceItemName: item.name,
          sourceItemType: item.type,
          effectIndex: effectIndex,
          isToggleable: isToggleable,
          isActive: isActive
        });
      }
    }

    return effects;
  }

  /**
   * Get all effects from equipped items, including inactive toggleable effects
   * Useful for UI display where all effects should be shown
   * @param {Actor} actor The actor to check
   * @returns {Array} Array of effect objects with source item info
   */
  static getAllEquippedItemEffects(actor) {
    return this.getEquippedItemEffects(actor, true);
  }

  /**
   * Check if an item is equipped
   * @param {Item} item The item to check
   * @returns {boolean} True if equipped
   */
  static _isItemEquipped(item) {
    // For armor, check the equipped flag or carryStatus
    if (item.type === 'armor') {
      return item.system.equipped === true || item.system.carryStatus === 'equipped';
    }

    // For weapons and other equipment, check carryStatus
    return item.system.carryStatus === 'equipped';
  }

  /**
   * Calculate combat modifier from equipped item effects
   * @param {Actor} actor The actor making the roll
   * @param {string} combatType 'ranged' or 'melee'
   * @param {string|null} weaponId Optional weapon ID for attached-item-only effects
   * @returns {Object} Object with totalBonus and breakdown array
   */
  static getCombatModifier(actor, combatType, weaponId = null) {
    const effects = this.getEquippedItemEffects(actor);
    let totalBonus = 0;
    const breakdown = [];

    for (const effect of effects) {
      const category = getEffectCategory(effect.effectType);
      if (category !== 'combat') continue;

      // Check if this effect applies to the combat type
      let applies = false;
      if (effect.effectType === 'all_attack_bonus') {
        applies = true;
      } else if (effect.effectType === 'ranged_attack_bonus' && combatType === 'ranged') {
        applies = true;
      } else if (effect.effectType === 'melee_attack_bonus' && combatType === 'melee') {
        applies = true;
      }

      if (!applies) continue;

      // Check attachedItemOnly restriction
      if (effect.attachedItemOnly && effect.sourceItemId !== weaponId) {
        continue;
      }

      const value = Number(effect.value) || 0;
      totalBonus += value;
      breakdown.push({
        name: effect.name || effect.effectType,
        source: effect.sourceItemName,
        value: value,
        attachedItemOnly: effect.attachedItemOnly
      });
    }

    return { totalBonus, breakdown };
  }

  /**
   * Calculate damage modifier from equipped item effects
   * @param {Actor} actor The actor making the roll
   * @param {string} combatType 'ranged' or 'melee'
   * @param {string|null} weaponId Optional weapon ID for attached-item-only effects
   * @returns {Object} Object with totalBonus and breakdown array
   */
  static getDamageModifier(actor, combatType, weaponId = null) {
    const effects = this.getEquippedItemEffects(actor);
    let totalBonus = 0;
    const breakdown = [];

    for (const effect of effects) {
      const category = getEffectCategory(effect.effectType);
      if (category !== 'combat') continue;

      // Check if this is a damage effect
      let applies = false;
      if (effect.effectType === 'damage_bonus') {
        applies = true;
      } else if (effect.effectType === 'ranged_damage_bonus' && combatType === 'ranged') {
        applies = true;
      } else if (effect.effectType === 'melee_damage_bonus' && combatType === 'melee') {
        applies = true;
      }

      if (!applies) continue;

      // Check attachedItemOnly restriction
      if (effect.attachedItemOnly && effect.sourceItemId !== weaponId) {
        continue;
      }

      const value = Number(effect.value) || 0;
      totalBonus += value;
      breakdown.push({
        name: effect.name || effect.effectType,
        source: effect.sourceItemName,
        value: value,
        attachedItemOnly: effect.attachedItemOnly
      });
    }

    return { totalBonus, breakdown };
  }

  /**
   * Get vision and light effects from equipped items
   * @param {Actor} actor The actor to check
   * @returns {Object} Object with vision and light properties
   */
  static getVisionEffects(actor) {
    const effects = this.getEquippedItemEffects(actor);

    // Vision effects - Foundry vision modes
    const vision = {
      visionMode: null,       // Foundry vision mode name (basic, darkvision, etc.)
      visionRange: 0,         // Range in meters/units
      sources: []
    };

    // Light emission effects
    const light = {
      brightRadius: 0,
      dimRadius: 0,
      lightColor: null,
      sources: []
    };

    // Vision mode priority (higher index = higher priority)
    const visionModePriority = ['basic', 'darkvision', 'monochromatic', 'tremorsense', 'lightAmplification'];

    for (const effect of effects) {
      const category = getEffectCategory(effect.effectType);

      // Handle vision modes
      if (category === 'vision' && effect.effectType.startsWith('vision_')) {
        const mode = effect.effectType.replace('vision_', '');
        const range = Number(effect.value) || 0;

        // Take highest range, prefer more advanced vision modes on tie
        const currentPriority = visionModePriority.indexOf(vision.visionMode) || -1;
        const newPriority = visionModePriority.indexOf(mode);

        if (range > vision.visionRange || (range === vision.visionRange && newPriority > currentPriority)) {
          vision.visionMode = mode;
          vision.visionRange = range;
        }

        vision.sources.push({
          type: mode,
          value: range,
          source: effect.sourceItemName
        });
      }

      // Handle light emission
      if (category === 'light' && effect.effectType === 'light_emission') {
        const brightRadius = Number(effect.brightRadius) || 0;
        const dimRadius = Number(effect.dimRadius) || 0;

        // Take the maximum light radii
        if (brightRadius > light.brightRadius) {
          light.brightRadius = brightRadius;
        }
        if (dimRadius > light.dimRadius) {
          light.dimRadius = dimRadius;
        }
        // Use the last defined color
        if (effect.lightColor) {
          light.lightColor = effect.lightColor;
        }

        light.sources.push({
          type: 'light_emission',
          brightRadius: brightRadius,
          dimRadius: dimRadius,
          lightColor: effect.lightColor,
          source: effect.sourceItemName
        });
      }
    }

    return { vision, light };
  }

  /**
   * Get attribute modifiers from equipped item effects
   * @param {Actor} actor The actor to check
   * @returns {Object} Object mapping attribute keys to modifier values
   */
  static getAttributeModifiers(actor) {
    const effects = this.getEquippedItemEffects(actor);
    const modifiers = {};

    for (const effect of effects) {
      if (effect.effectType !== 'attribute_bonus') continue;

      const target = effect.target;
      const value = Number(effect.value) || 0;

      if (!modifiers[target]) {
        modifiers[target] = { additive: 0, sources: [] };
      }

      modifiers[target].additive += value;
      modifiers[target].sources.push({
        name: effect.name || 'Attribute Bonus',
        source: effect.sourceItemName,
        value: value
      });
    }

    return modifiers;
  }

  /**
   * Get movement modifiers from equipped item effects
   * @param {Actor} actor The actor to check
   * @returns {Object} Object mapping movement types to modifier values
   */
  static getMovementModifiers(actor) {
    const effects = this.getEquippedItemEffects(actor);
    const modifiers = {};

    for (const effect of effects) {
      if (effect.effectType !== 'movement_bonus') continue;

      const target = effect.target;
      const value = Number(effect.value) || 0;

      if (!modifiers[target]) {
        modifiers[target] = { additive: 0, sources: [] };
      }

      modifiers[target].additive += value;
      modifiers[target].sources.push({
        name: effect.name || 'Movement Bonus',
        source: effect.sourceItemName,
        value: value
      });
    }

    return modifiers;
  }

  /**
   * Get skill modifiers from equipped item effects
   * @param {Actor} actor The actor to check
   * @param {string} skillName The skill name to check
   * @returns {Object} Object with totalBonus and sources array
   */
  static getSkillModifier(actor, skillName) {
    const effects = this.getEquippedItemEffects(actor);
    let totalBonus = 0;
    const sources = [];

    for (const effect of effects) {
      if (effect.effectType !== 'skill_bonus') continue;

      // Check if this effect applies to the skill
      const targetSkill = (effect.target || '').toLowerCase();
      const checkSkill = skillName.toLowerCase();

      if (targetSkill !== checkSkill) continue;

      const value = Number(effect.value) || 0;
      totalBonus += value;
      sources.push({
        name: effect.name || 'Skill Bonus',
        source: effect.sourceItemName,
        value: value
      });
    }

    return { totalBonus, sources };
  }

  /**
   * Apply vision and light effects to a token
   * This should be called when token vision needs to be updated
   * @param {Token} token The token to update
   * @param {Object} visionEffects Vision/light effects from getVisionEffects
   */
  static applyVisionToToken(token, visionEffects) {
    if (!token || !token.document) return;

    const { vision, light } = visionEffects || {};
    const updates = {};

    // Apply vision mode
    if (vision?.visionMode && vision.visionRange > 0) {
      updates['sight.range'] = vision.visionRange;
      updates['sight.visionMode'] = vision.visionMode;
      updates['sight.enabled'] = true;
    }

    // Apply light emission
    if (light?.brightRadius > 0 || light?.dimRadius > 0) {
      updates['light.bright'] = light.brightRadius || 0;
      updates['light.dim'] = light.dimRadius || 0;
      if (light.lightColor) {
        updates['light.color'] = light.lightColor;
      }
    }

    // Apply changes if any
    if (Object.keys(updates).length > 0) {
      token.document.update(updates);
    }
  }
}
