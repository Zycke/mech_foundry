/**
 * Opposed Roll Helper
 * Handles targeting, opposed roll resolution, hit locations, and damage calculations
 */

import { SocketHandler, SOCKET_EVENTS } from './socket-handler.mjs';
import { DiceMechanics } from './dice-mechanics.mjs';

export class OpposedRollHelper {

  /**
   * Get the first targeted token
   * @returns {Token|null} The first targeted token or null
   */
  static getTarget() {
    const targets = game.user.targets;
    if (targets.size === 0) return null;
    return targets.first();
  }

  /**
   * Get defense skill options for a defender
   * @param {Actor} actor The defending actor
   * @returns {Array} Array of defense options
   */
  static getDefenseSkillOptions(actor) {
    const options = [];

    // Find Melee Weapons skill
    const meleeWeapons = actor.items.find(i =>
      i.type === 'skill' &&
      i.name.toLowerCase().includes('melee weapons')
    );
    if (meleeWeapons) {
      const level = this._getSkillLevel(meleeWeapons.system.xp);
      if (level >= 0) {
        options.push({
          id: meleeWeapons.id,
          name: meleeWeapons.name,
          level: level,
          type: 'skill'
        });
      }
    }

    // Find Martial Arts skill
    const martialArts = actor.items.find(i =>
      i.type === 'skill' &&
      i.name.toLowerCase().includes('martial arts')
    );
    if (martialArts) {
      const level = this._getSkillLevel(martialArts.system.xp);
      if (level >= 0) {
        options.push({
          id: martialArts.id,
          name: martialArts.name,
          level: level,
          type: 'skill'
        });
      }
    }

    // RFL + DEX attribute check (always available as fallback)
    const rfl = actor.system.attributes.rfl?.total || 0;
    const dex = actor.system.attributes.dex?.total || 0;
    options.push({
      id: 'attribute',
      name: "RFL+DEX Save (TN 18)",
      type: 'attribute',
      attrs: ['rfl', 'dex'],
      total: rfl + dex
    });

    // Option to decline defense
    options.push({
      id: 'decline',
      name: "Do Not Defend",
      type: 'decline'
    });

    return options;
  }

  /**
   * Calculate skill level from XP
   * @param {number} xp The XP amount
   * @returns {number} The skill level (-1 if no ranks)
   */
  static _getSkillLevel(xp) {
    const costs = [20, 30, 50, 80, 120, 170, 230, 300, 380, 470, 570];
    for (let i = 10; i >= 0; i--) {
      if (xp >= costs[i]) return i;
    }
    return -1;
  }

  /**
   * Resolve melee opposed roll outcome
   * @param {Object} attackerResult {success, mos, roll}
   * @param {Object} defenderResult {success, mos, roll, declined}
   * @returns {Object} Resolution result
   */
  static resolveMeleeOpposed(attackerResult, defenderResult) {
    const result = {
      outcome: null,
      attackerDealsDefenderDamage: false,
      defenderDealsAttackerDamage: false,
      defenderChoice: false,
      description: ""
    };

    // Declined defense = auto-fail with MoS -3
    if (defenderResult.declined) {
      defenderResult.success = false;
      defenderResult.mos = -3;
    }

    const attackerSuccess = attackerResult.success;
    const defenderSuccess = defenderResult.success;
    const attackerMoS = attackerResult.mos;
    const defenderMoS = defenderResult.mos;

    // Both succeed
    if (attackerSuccess && defenderSuccess) {
      // Tie goes to defender
      if (attackerMoS === defenderMoS) {
        result.outcome = "tie";
        result.description = "Tie - Defender blocks the attack!";
        return result;
      }

      // Attacker MoS > defender MoS - attacker hits
      if (attackerMoS > defenderMoS) {
        result.outcome = "attacker_hits";
        result.attackerDealsDefenderDamage = true;
        result.description = "Attacker lands the blow!";
        return result;
      }

      // Defender MoS > attacker MoS - defender chooses
      if (defenderMoS > attackerMoS) {
        result.outcome = "defender_choice";
        result.defenderChoice = true;
        result.description = "Defender has the advantage - choose to block or counter-attack!";
        return result;
      }
    }

    // Attacker succeeds, defender fails - attacker hits
    if (attackerSuccess && !defenderSuccess) {
      result.outcome = "attacker_hits";
      result.attackerDealsDefenderDamage = true;
      result.description = "Attacker lands the blow!";
      return result;
    }

    // Attacker fails, defender succeeds - counterstrike
    if (!attackerSuccess && defenderSuccess) {
      result.outcome = "counterstrike";
      result.defenderDealsAttackerDamage = true;
      result.description = "Defender counterstrikes!";
      return result;
    }

    // Both fail - mutual miss
    if (!attackerSuccess && !defenderSuccess) {
      result.outcome = "mutual_miss";
      result.description = "Both combatants miss.";
      return result;
    }

    return result;
  }

  /**
   * Roll hit location using 2d6 table
   * @returns {Promise<Object>} Hit location result
   */
  static async rollHitLocation() {
    const roll = await new Roll("2d6").evaluate();
    const total = roll.total;
    let location, displayLocation, armorLocation;
    let subRoll = null;

    if (total <= 2) {
      location = "head";
      displayLocation = "Head";
      armorLocation = "head";
    } else if (total === 3) {
      location = "leftFoot";
      displayLocation = "Left Foot";
      armorLocation = "legs";
    } else if (total === 4) {
      location = "leftHand";
      displayLocation = "Left Hand";
      armorLocation = "arms";
    } else if (total === 5) {
      location = "leftArm";
      displayLocation = "Left Arm";
      armorLocation = "arms";
    } else if (total === 6 || total === 8) {
      // Torso - roll 1d6 for chest vs abdomen
      const torsoRoll = await new Roll("1d6").evaluate();
      subRoll = torsoRoll.total;
      if (torsoRoll.total <= 4) {
        location = "chest";
        displayLocation = "Chest";
      } else {
        location = "abdomen";
        displayLocation = "Abdomen";
      }
      armorLocation = "torso";
    } else if (total === 7) {
      location = "legs";
      displayLocation = "Legs";
      armorLocation = "legs";
    } else if (total === 9) {
      location = "rightArm";
      displayLocation = "Right Arm";
      armorLocation = "arms";
    } else if (total === 10) {
      location = "rightHand";
      displayLocation = "Right Hand";
      armorLocation = "arms";
    } else if (total === 11) {
      location = "rightFoot";
      displayLocation = "Right Foot";
      armorLocation = "legs";
    } else { // 12+
      location = "head";
      displayLocation = "Head";
      armorLocation = "head";
    }

    return {
      roll: total,
      subRoll: subRoll,
      location,
      displayLocation,
      armorLocation
    };
  }

  /**
   * Create a hit location result from an aimed shot selection
   * @param {string} aimedLocation The aimed body part
   * @returns {Object} Hit location result matching rollHitLocation format
   */
  static getAimedHitLocation(aimedLocation) {
    const locationMap = {
      head: { location: 'head', displayLocation: 'Head (Aimed)', armorLocation: 'head' },
      chest: { location: 'chest', displayLocation: 'Chest (Aimed)', armorLocation: 'torso' },
      abdomen: { location: 'abdomen', displayLocation: 'Abdomen (Aimed)', armorLocation: 'torso' },
      arm: { location: 'rightArm', displayLocation: 'Arm (Aimed)', armorLocation: 'arms' },
      leg: { location: 'legs', displayLocation: 'Legs (Aimed)', armorLocation: 'legs' },
      hand: { location: 'rightHand', displayLocation: 'Hand (Aimed)', armorLocation: 'arms' },
      foot: { location: 'rightFoot', displayLocation: 'Foot (Aimed)', armorLocation: 'legs' }
    };

    const mapped = locationMap[aimedLocation] || locationMap.chest;
    return {
      roll: '—',
      subRoll: null,
      location: mapped.location,
      displayLocation: mapped.displayLocation,
      armorLocation: mapped.armorLocation
    };
  }

  /**
   * Get BAR value for a specific damage type and location
   * @param {Actor} actor The target actor
   * @param {string} damageType 'm', 'b', 'e', or 'x'
   * @param {string} armorLocation 'head', 'torso', 'arms', or 'legs'
   * @returns {number} The highest BAR value
   */
  static getBAR(actor, damageType, armorLocation) {
    const equippedArmor = actor.items.filter(i =>
      i.type === 'armor' && i.system.equipped
    );

    return equippedArmor.reduce((max, armor) => {
      const coverage = armor.system.coverage || {};

      // Check if this armor covers the location
      if (!coverage[armorLocation]) return max;

      const bar = armor.system.bar?.[damageType] || 0;
      return Math.max(max, bar);
    }, 0);
  }

  /**
   * Calculate damage after armor reduction
   * @param {number} damage Raw damage amount
   * @param {number} ap Armor penetration
   * @param {string} damageType 'm', 'b', 'e', or 'x'
   * @param {Actor} targetActor The target
   * @param {string} armorLocation The armor location
   * @returns {Object} Damage calculation result
   */
  static calculateDamageAfterArmor(damage, ap, damageType, targetActor, armorLocation) {
    const bar = this.getBAR(targetActor, damageType, armorLocation);
    const effectiveArmor = Math.max(0, bar - ap);
    const finalDamage = Math.max(0, damage - effectiveArmor);

    return {
      originalDamage: damage,
      armorValue: bar,
      apValue: ap,
      effectiveArmor,
      finalDamage,
      absorbed: damage - finalDamage,
      damageType,
      armorLocation
    };
  }

  /**
   * Calculate melee damage
   * @param {Actor} attacker The attacking actor
   * @param {Item|null} weapon The weapon item (null for unarmed)
   * @param {number} mos Margin of Success
   * @returns {Object} Damage calculation
   */
  static calculateMeleeDamage(attacker, weapon, mos) {
    const str = attacker.system.attributes.str?.total || 5;
    const baseDamage = weapon?.system.bd || 0;
    const ap = weapon?.system.ap || 0;
    const apFactor = weapon?.system.apFactor || 'M';
    const isSubduing = weapon?.system.subduing || baseDamage === 0;

    const strDamage = Math.ceil(str / 4);
    const mosDamage = Math.ceil(mos * 0.25);

    let standardDamage = 0;
    let fatigueDamage = 0;

    if (isSubduing) {
      // Unarmed or subduing - all fatigue damage
      fatigueDamage = strDamage + mosDamage;
    } else {
      // Armed melee - standard damage + 1 fatigue
      standardDamage = baseDamage + strDamage + mosDamage;
      fatigueDamage = 1;
    }

    // Map AP factor to damage type
    const damageTypeMap = {
      'M': 'm', 'B': 'b', 'E': 'e', 'X': 'x'
    };
    const damageType = damageTypeMap[apFactor] || 'm';

    return {
      standardDamage,
      fatigueDamage,
      baseDamage,
      strDamage,
      mosDamage,
      ap,
      apFactor,
      damageType,
      isSubduing,
      weaponName: weapon?.name || "Unarmed"
    };
  }

  /**
   * Get defender's melee weapon for counterstrike
   * @param {Actor} actor The defender
   * @returns {Item|null} The equipped melee weapon or null for unarmed
   */
  static getDefenderWeapon(actor) {
    const meleeWeapon = actor.items.find(i =>
      i.type === 'weapon' &&
      i.system.weaponType === 'melee' &&
      i.system.equipped
    );
    return meleeWeapon || null;
  }

  /**
   * Show defender dialog for skill selection
   * @param {Object} data Dialog data
   * @returns {Promise<Object>} Defense roll result
   */
  static async showDefenderDialog(data) {
    const actor = game.actors.get(data.targetActorId);
    if (!actor) {
      return { declined: true, mos: -3, success: false };
    }

    const options = this.getDefenseSkillOptions(actor);

    const content = await renderTemplate(
      "systems/mech-foundry/templates/dialog/defender-prompt.hbs",
      {
        attackerName: data.attackerName,
        weaponName: data.weaponName || "Melee Attack",
        options: options
      }
    );

    // Store reference to options for use in callback
    const defenseOptions = options;
    const helper = this;

    return new Promise((resolve) => {
      let resolved = false;

      const dialog = new Dialog({
        title: "Defend Against Attack",
        content: content,
        buttons: {
          defend: {
            icon: '<i class="fas fa-shield-alt"></i>',
            label: "Defend",
            callback: async (html) => {
              if (resolved) return;
              resolved = true;

              // Get the form element - html is a jQuery object wrapping the dialog content
              const formElement = html[0].querySelector('form.defender-prompt-dialog');

              let selectedOption = null;
              let modifier = 0;

              if (formElement) {
                // Use FormData to extract values
                const formData = new FormData(formElement);
                selectedOption = formData.get('defenseOption');
                modifier = parseInt(formData.get('modifier')) || 0;
              }

              // Fallback: try direct query
              if (!selectedOption) {
                const checked = html[0].querySelector('input[name="defenseOption"]:checked');
                selectedOption = checked?.value;
              }

              // Fallback: try jQuery on entire html
              if (!selectedOption) {
                selectedOption = html.find('input[name="defenseOption"]:checked').val();
              }

              // Final fallback: use first non-decline option
              if (!selectedOption && defenseOptions.length > 0) {
                const firstNonDecline = defenseOptions.find(o => o.type !== 'decline');
                selectedOption = firstNonDecline ? firstNonDecline.id : defenseOptions[0].id;
              }

              const defenseResult = await helper._makeDefenseRoll(
                actor,
                selectedOption,
                modifier,
                defenseOptions
              );

              resolve(defenseResult);
            }
          }
        },
        default: "defend",
        close: () => {
          // If closed without clicking button, treat as declined
          if (!resolved) {
            resolved = true;
            resolve({ declined: true, mos: -3, success: false });
          }
        }
      }, { width: 400 });

      dialog.render(true);
    });
  }

  /**
   * Make a defense roll
   * @param {Actor} actor The defending actor
   * @param {string} optionId The selected option ID
   * @param {number} modifier Additional modifier
   * @param {Array} options Available options
   * @returns {Promise<Object>} Roll result
   */
  static async _makeDefenseRoll(actor, optionId, modifier, options) {
    const option = options.find(o => o.id === optionId);

    if (!option || option.type === 'decline') {
      return { declined: true, mos: -3, success: false };
    }

    if (option.type === 'attribute') {
      // RFL + DEX attribute check (TN 18)
      return this._rollAttributeDefense(actor, modifier);
    }

    // Skill roll
    return this._rollSkillDefense(actor, option.id, modifier);
  }

  /**
   * Roll an attribute-based defense (RFL + DEX, TN 18)
   * @param {Actor} actor The defending actor
   * @param {number} modifier Additional modifier
   * @returns {Promise<Object>} Roll result
   */
  static async _rollAttributeDefense(actor, modifier) {
    const rfl = actor.system.attributes.rfl?.total || 0;
    const dex = actor.system.attributes.dex?.total || 0;
    const injuryMod = actor.system.injuryModifier || 0;
    const fatigueMod = actor.system.fatigueModifier || 0;

    const totalMod = rfl + dex + injuryMod + fatigueMod + modifier;
    const targetNumber = 18;

    const roll = await new Roll(`2d6 + ${totalMod}`).evaluate();
    const diceResults = roll.dice[0].results.map(r => r.result);

    // Check for special roll mechanics (Fumble, Stunning Success, Miraculous Feat)
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(diceResults);
    const successInfo = DiceMechanics.determineSuccess(roll.total, targetNumber, specialRoll);

    const success = successInfo.success;
    const mos = successInfo.mos;
    const finalTotal = successInfo.finalTotal;

    return {
      type: 'attribute',
      name: "RFL+DEX Save (TN 18)",
      roll: roll,
      total: finalTotal,
      rawTotal: roll.total,
      targetNumber: targetNumber,
      success: success,
      mos: mos,
      diceResults: diceResults,
      modifier: totalMod,
      declined: false,
      specialRoll: specialRoll
    };
  }

  /**
   * Roll a skill-based defense
   * @param {Actor} actor The defending actor
   * @param {string} skillId The skill item ID
   * @param {number} modifier Additional modifier
   * @returns {Promise<Object>} Roll result
   */
  static async _rollSkillDefense(actor, skillId, modifier) {
    const skill = actor.items.get(skillId);
    if (!skill || skill.type !== 'skill') {
      return { declined: true, mos: -3, success: false };
    }

    const skillData = skill.system;
    const targetNumber = skillData.targetNumber || 7;
    const xp = skillData.xp || 0;
    const skillLevel = this._getSkillLevel(xp);

    // Calculate link modifiers
    let linkMod = 0;
    if (skillData.linkedAttribute1) {
      const attr1 = actor.system.attributes[skillData.linkedAttribute1];
      if (attr1) linkMod += attr1.linkMod || 0;
    }
    if (skillData.linkedAttribute2) {
      const attr2 = actor.system.attributes[skillData.linkedAttribute2];
      if (attr2) linkMod += attr2.linkMod || 0;
    }

    const injuryMod = actor.system.injuryModifier || 0;
    const fatigueMod = actor.system.fatigueModifier || 0;

    const totalMod = skillLevel + linkMod + injuryMod + fatigueMod + modifier;

    const roll = await new Roll(`2d6 + ${totalMod}`).evaluate();
    const diceResults = roll.dice[0].results.map(r => r.result);

    // Check for special roll mechanics (Fumble, Stunning Success, Miraculous Feat)
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(diceResults);
    const successInfo = DiceMechanics.determineSuccess(roll.total, targetNumber, specialRoll);

    const success = successInfo.success;
    const mos = successInfo.mos;
    const finalTotal = successInfo.finalTotal;

    return {
      type: 'skill',
      name: skill.name,
      skillId: skillId,
      roll: roll,
      total: finalTotal,
      rawTotal: roll.total,
      targetNumber: targetNumber,
      success: success,
      mos: mos,
      diceResults: diceResults,
      modifier: totalMod,
      skillLevel: skillLevel,
      linkMod: linkMod,
      declined: false,
      specialRoll: specialRoll
    };
  }

  /**
   * Generate a unique roll ID
   * @returns {string}
   */
  static generateRollId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get damage type display name
   * @param {string} damageType Single letter code (m, b, e, x)
   * @returns {string} Localized display name
   */
  static getDamageTypeName(damageType) {
    const types = {
      'm': "Melee",
      'b': "Ballistic",
      'e': "Energy",
      'x': "Explosive"
    };
    return types[damageType] || damageType.toUpperCase();
  }

  /**
   * Get damage multiplier based on hit location
   * Per "A Time of War" rules, damage is modified based on where the hit lands
   * @param {string} location The specific hit location
   * @returns {Object} Multiplier info with value and display name
   */
  static getLocationDamageMultiplier(location) {
    const multipliers = {
      'head': { value: 2.0, display: 'x2' },
      'chest': { value: 1.0, display: 'x1' },
      'abdomen': { value: 1.0, display: 'x1' },
      'leftArm': { value: 0.5, display: 'x0.5' },
      'rightArm': { value: 0.5, display: 'x0.5' },
      'leftHand': { value: 0.25, display: 'x0.25' },
      'rightHand': { value: 0.25, display: 'x0.25' },
      'legs': { value: 0.75, display: 'x0.75' },
      'leftFoot': { value: 0.25, display: 'x0.25' },
      'rightFoot': { value: 0.25, display: 'x0.25' }
    };
    return multipliers[location] || { value: 1.0, display: 'x1' };
  }

  /**
   * Calculate damage after armor reduction AND location multiplier
   * @param {number} damage Raw damage amount
   * @param {number} ap Armor penetration
   * @param {string} damageType 'm', 'b', 'e', or 'x'
   * @param {Actor} targetActor The target
   * @param {string} armorLocation The armor location (head, torso, arms, legs)
   * @param {string} specificLocation The specific hit location (head, chest, leftArm, etc.)
   * @returns {Object} Damage calculation result with location modifier applied
   */
  static calculateDamageWithLocation(damage, ap, damageType, targetActor, armorLocation, specificLocation) {
    const bar = this.getBAR(targetActor, damageType, armorLocation);
    const effectiveArmor = Math.max(0, bar - ap);
    const damageAfterArmor = Math.max(0, damage - effectiveArmor);

    // Apply location damage multiplier (round up per rules)
    const locationMod = this.getLocationDamageMultiplier(specificLocation);
    const finalDamage = Math.ceil(damageAfterArmor * locationMod.value);

    return {
      originalDamage: damage,
      armorValue: bar,
      apValue: ap,
      effectiveArmor,
      damageAfterArmor,
      locationMultiplier: locationMod.value,
      locationMultiplierDisplay: locationMod.display,
      finalDamage,
      absorbed: damage - damageAfterArmor,
      damageType,
      armorLocation,
      specificLocation
    };
  }

  /**
   * Roll on the Specific Wound Effects table
   * Called when attack roll is doubles AND damage is dealt
   * @returns {Promise<Object>} Wound effect result
   */
  static async rollWoundEffect() {
    const roll = await new Roll("1d6").evaluate();
    const result = roll.total;

    const effects = {
      1: {
        name: 'Dazed',
        type: 'dazed',
        description: 'Character suffers 1D6 additional Fatigue damage points',
        automated: true,
        fatigueRoll: true,
        isWound: true
      },
      2: {
        name: 'Deafened',
        type: 'deafened',
        description: 'Character suffers critical damage to ear equal to Level 3 Poor Hearing (see p. 122)',
        automated: false,
        note: 'Surgery Skill required to stabilize/repair; apply -2 modifier to all Surgery Checks',
        isWound: true
      },
      3: {
        name: 'Blinded',
        type: 'blinded',
        description: 'Character suffers critical damage to eye equal to Level 3 Poor Vision (see p. 122)',
        automated: false,
        note: 'Surgery Skill required to stabilize/repair; apply -2 modifier to all Surgery Checks',
        isWound: true
      },
      4: {
        name: 'Internal Damage',
        type: 'internalDamage',
        description: 'Character suffers 1D6 additional Standard damage points (check for bleeding)',
        automated: true,
        standardRoll: true,
        note: 'Check for bleeding',
        isWound: true
      },
      5: {
        name: 'Knockdown',
        type: 'knockdown',
        description: 'Character must make a RFL Attribute Check to avoid falling, applying Injury modifiers',
        automated: false,
        note: 'RFL Attribute Check required to avoid falling',
        isWound: false
      },
      6: {
        name: 'Shattered Limb',
        type: 'shatteredLimb',
        description: 'Character cannot use the affected limb (check for bleeding)',
        automated: false,
        note: 'Check for bleeding; affected limb cannot be used',
        isWound: true
      }
    };

    const effect = effects[result];

    // Roll additional damage if applicable
    let additionalFatigue = 0;
    let additionalStandard = 0;
    let additionalRoll = null;

    if (effect.fatigueRoll) {
      additionalRoll = await new Roll("1d6").evaluate();
      additionalFatigue = additionalRoll.total;
    } else if (effect.standardRoll) {
      additionalRoll = await new Roll("1d6").evaluate();
      additionalStandard = additionalRoll.total;
    }

    return {
      roll: result,
      ...effect,
      additionalFatigue,
      additionalStandard,
      additionalRoll: additionalRoll ? additionalRoll.total : null
    };
  }

  /**
   * Check if attack roll is doubles (both dice show same value)
   * @param {Array} diceResults Array of individual dice results
   * @returns {boolean} True if doubles
   */
  static isDoubles(diceResults) {
    if (!diceResults || diceResults.length < 2) return false;
    return diceResults[0] === diceResults[1];
  }
}
