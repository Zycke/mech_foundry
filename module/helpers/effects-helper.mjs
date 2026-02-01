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
      darkvision: { label: "Dark Vision", hasValue: true, unit: "meters" },
      low_light_vision: { label: "Low-Light Vision", hasValue: true, unit: "multiplier" },
      thermal_vision: { label: "Thermal Vision", hasValue: true, unit: "meters" }
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
   * @returns {Array} Array of effect objects with source item info
   */
  static getEquippedItemEffects(actor) {
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
      for (const effect of itemEffects) {
        if (!effect.effectType) continue;

        effects.push({
          ...effect,
          sourceItemId: item.id,
          sourceItemName: item.name,
          sourceItemType: item.type
        });
      }
    }

    return effects;
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
   * Get vision effects from equipped items
   * @param {Actor} actor The actor to check
   * @returns {Object} Object with vision properties
   */
  static getVisionEffects(actor) {
    const effects = this.getEquippedItemEffects(actor);
    const vision = {
      darkvision: 0,
      lowLightMultiplier: 1,
      thermalVision: 0,
      sources: []
    };

    for (const effect of effects) {
      const category = getEffectCategory(effect.effectType);
      if (category !== 'vision') continue;

      const value = Number(effect.value) || 0;

      if (effect.effectType === 'darkvision') {
        // Take the highest darkvision range
        if (value > vision.darkvision) {
          vision.darkvision = value;
        }
        vision.sources.push({
          type: 'darkvision',
          value: value,
          source: effect.sourceItemName
        });
      } else if (effect.effectType === 'low_light_vision') {
        // Multiply low-light multipliers
        vision.lowLightMultiplier *= value;
        vision.sources.push({
          type: 'low_light_vision',
          value: value,
          source: effect.sourceItemName
        });
      } else if (effect.effectType === 'thermal_vision') {
        // Take the highest thermal range
        if (value > vision.thermalVision) {
          vision.thermalVision = value;
        }
        vision.sources.push({
          type: 'thermal_vision',
          value: value,
          source: effect.sourceItemName
        });
      }
    }

    return vision;
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
   * Apply vision effects to a token
   * This should be called when token vision needs to be updated
   * @param {Token} token The token to update
   * @param {Object} visionEffects Vision effects from getVisionEffects
   */
  static applyVisionToToken(token, visionEffects) {
    if (!token || !token.document) return;

    const updates = {};

    // Apply darkvision
    if (visionEffects.darkvision > 0) {
      // In Foundry v12, this is done through detection modes
      // We'll set the token's sight range to include darkvision
      updates['sight.range'] = Math.max(
        token.document.sight?.range || 0,
        visionEffects.darkvision
      );
      updates['sight.visionMode'] = 'darkvision';
    }

    // Apply changes if any
    if (Object.keys(updates).length > 0) {
      token.document.update(updates);
    }
  }
}
