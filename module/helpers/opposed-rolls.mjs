/**
 * Opposed Roll Helper
 * Handles targeting, opposed roll resolution, hit locations, and damage calculations
 */

import { SocketHandler, SOCKET_EVENTS } from './socket-handler.mjs';

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
      name: game.i18n.localize('MECHFOUNDRY.AttributeCheckRFLDEX'),
      type: 'attribute',
      attrs: ['rfl', 'dex'],
      total: rfl + dex
    });

    // Option to decline defense
    options.push({
      id: 'decline',
      name: game.i18n.localize('MECHFOUNDRY.DoNotDefend'),
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
        result.description = game.i18n.localize('MECHFOUNDRY.OpposedTie');
        return result;
      }

      // Attacker MoS > defender MoS - attacker hits
      if (attackerMoS > defenderMoS) {
        result.outcome = "attacker_hits";
        result.attackerDealsDefenderDamage = true;
        result.description = game.i18n.localize('MECHFOUNDRY.OpposedAttackerHits');
        return result;
      }

      // Defender MoS > attacker MoS - defender chooses
      if (defenderMoS > attackerMoS) {
        result.outcome = "defender_choice";
        result.defenderChoice = true;
        result.description = game.i18n.localize('MECHFOUNDRY.OpposedDefenderChoice');
        return result;
      }
    }

    // Attacker succeeds, defender fails - attacker hits
    if (attackerSuccess && !defenderSuccess) {
      result.outcome = "attacker_hits";
      result.attackerDealsDefenderDamage = true;
      result.description = game.i18n.localize('MECHFOUNDRY.OpposedAttackerHits');
      return result;
    }

    // Attacker fails, defender succeeds - counterstrike
    if (!attackerSuccess && defenderSuccess) {
      result.outcome = "counterstrike";
      result.defenderDealsAttackerDamage = true;
      result.description = game.i18n.localize('MECHFOUNDRY.OpposedCounterstrike');
      return result;
    }

    // Both fail - mutual miss
    if (!attackerSuccess && !defenderSuccess) {
      result.outcome = "mutual_miss";
      result.description = game.i18n.localize('MECHFOUNDRY.OpposedMutualMiss');
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
      displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.Head');
      armorLocation = "head";
    } else if (total === 3) {
      location = "leftFoot";
      displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.LeftFoot');
      armorLocation = "legs";
    } else if (total === 4) {
      location = "leftHand";
      displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.LeftHand');
      armorLocation = "arms";
    } else if (total === 5) {
      location = "leftArm";
      displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.LeftArm');
      armorLocation = "arms";
    } else if (total === 6 || total === 8) {
      // Torso - roll 1d6 for chest vs abdomen
      const torsoRoll = await new Roll("1d6").evaluate();
      subRoll = torsoRoll.total;
      if (torsoRoll.total <= 4) {
        location = "chest";
        displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.Chest');
      } else {
        location = "abdomen";
        displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.Abdomen');
      }
      armorLocation = "torso";
    } else if (total === 7) {
      location = "legs";
      displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.Legs');
      armorLocation = "legs";
    } else if (total === 9) {
      location = "rightArm";
      displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.RightArm');
      armorLocation = "arms";
    } else if (total === 10) {
      location = "rightHand";
      displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.RightHand');
      armorLocation = "arms";
    } else if (total === 11) {
      location = "rightFoot";
      displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.RightFoot');
      armorLocation = "legs";
    } else { // 12+
      location = "head";
      displayLocation = game.i18n.localize('MECHFOUNDRY.HitLocation.Head');
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
      weaponName: weapon?.name || game.i18n.localize('MECHFOUNDRY.Unarmed')
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
        weaponName: data.weaponName || game.i18n.localize('MECHFOUNDRY.MeleeAttack'),
        options: options
      }
    );

    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: game.i18n.localize('MECHFOUNDRY.DefendAgainstAttack'),
        content: content,
        buttons: {
          defend: {
            icon: '<i class="fas fa-shield-alt"></i>',
            label: game.i18n.localize('MECHFOUNDRY.Defend'),
            callback: async (html) => {
              // Try multiple selectors to find the checked radio button
              let selectedOption = html.find('input[name="defenseOption"]:checked').val();

              // Fallback: if jQuery selector didn't work, try vanilla JS
              if (!selectedOption) {
                const form = html[0].querySelector('form') || html[0];
                const checked = form.querySelector('input[name="defenseOption"]:checked');
                selectedOption = checked?.value;
              }

              // If still no selection, default to first option (not decline)
              if (!selectedOption && options.length > 0) {
                selectedOption = options[0].id;
              }

              const modifier = parseInt(html.find('[name="modifier"]').val()) || 0;

              const defenseResult = await this._makeDefenseRoll(
                actor,
                selectedOption,
                modifier,
                options
              );

              resolve(defenseResult);
            }
          }
        },
        default: "defend",
        close: () => {
          // If closed without action, treat as declined
          resolve({ declined: true, mos: -3, success: false });
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
    const success = roll.total >= targetNumber;
    const mos = roll.total - targetNumber;

    return {
      type: 'attribute',
      name: game.i18n.localize('MECHFOUNDRY.AttributeCheckRFLDEX'),
      roll: roll,
      total: roll.total,
      targetNumber: targetNumber,
      success: success,
      mos: mos,
      diceResults: diceResults,
      modifier: totalMod,
      declined: false
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
    const success = roll.total >= targetNumber;
    const mos = roll.total - targetNumber;

    return {
      type: 'skill',
      name: skill.name,
      skillId: skillId,
      roll: roll,
      total: roll.total,
      targetNumber: targetNumber,
      success: success,
      mos: mos,
      diceResults: diceResults,
      modifier: totalMod,
      skillLevel: skillLevel,
      linkMod: linkMod,
      declined: false
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
      'm': game.i18n.localize('MECHFOUNDRY.DamageType.Melee'),
      'b': game.i18n.localize('MECHFOUNDRY.DamageType.Ballistic'),
      'e': game.i18n.localize('MECHFOUNDRY.DamageType.Energy'),
      'x': game.i18n.localize('MECHFOUNDRY.DamageType.Explosive')
    };
    return types[damageType] || damageType.toUpperCase();
  }
}
