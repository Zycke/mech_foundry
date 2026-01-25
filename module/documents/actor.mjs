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

    // Calculate Link Attribute Modifiers for all attributes
    this._calculateLinkModifiers(systemData);

    // Calculate derived values
    this._calculateDerivedStats(systemData);

    // Calculate total XP (available + spent)
    if (systemData.xp) {
      systemData.xp.total = (systemData.xp.value || 0) + (systemData.xp.spent || 0);
    }
  }

  /**
   * Calculate Link Attribute Modifiers based on A Time of War rules
   * 1: -2, 2-3: -1, 4-6: +0, 7-9: +1, 10: +2
   * @param {Object} systemData
   */
  _calculateLinkModifiers(systemData) {
    for (let [key, attr] of Object.entries(systemData.attributes || {})) {
      const value = attr.value;
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
   * @param {Object} systemData
   */
  _calculateDerivedStats(systemData) {
    const str = systemData.attributes.str?.value || 5;
    const bod = systemData.attributes.bod?.value || 5;
    const rfl = systemData.attributes.rfl?.value || 5;
    const wil = systemData.attributes.wil?.value || 5;

    // Damage Capacity = BOD x 2
    systemData.damageCapacity = bod * 2;
    // Set damage.max for token bar compatibility
    if (systemData.damage) systemData.damage.max = systemData.damageCapacity;

    // Fatigue Capacity = WIL x 2
    systemData.fatigueCapacity = wil * 2;
    // Set fatigue.max for token bar compatibility
    if (systemData.fatigue) systemData.fatigue.max = systemData.fatigueCapacity;

    // Movement rates (meters per turn)
    systemData.movement = systemData.movement || {};

    // Walk = STR + RFL
    systemData.movement.walk = str + rfl;

    // Run/Evade = 10 + STR + RFL (+ Running Skill if applicable)
    const runningSkill = this._getSkillLevel("running") || 0;
    systemData.movement.run = 10 + str + rfl + runningSkill;

    // Sprint = Run x 2
    systemData.movement.sprint = systemData.movement.run * 2;

    // Climb = based on Climbing skill, default is Walk/4
    const climbingSkill = this._getSkillLevel("climbing") || 0;
    systemData.movement.climb = Math.floor(systemData.movement.walk / 4) + climbingSkill;

    // Crawl = Walk / 4
    systemData.movement.crawl = Math.floor(systemData.movement.walk / 4);

    // Swim = based on Swimming skill, default is Walk/4
    const swimmingSkill = this._getSkillLevel("swimming") || 0;
    systemData.movement.swim = Math.floor(systemData.movement.walk / 4) + swimmingSkill;

    // Calculate Injury Modifier (-1 per 25% of damage capacity)
    const damagePercent = (systemData.damage?.value || 0) / systemData.damageCapacity;
    systemData.injuryModifier = -Math.floor(damagePercent * 4);
    if (systemData.injuryModifier > 0) systemData.injuryModifier = 0;

    // Calculate Fatigue Modifier (-(Fatigue - WIL), minimum 0)
    const fatigueDiff = (systemData.fatigue?.value || 0) - wil;
    systemData.fatigueModifier = fatigueDiff > 0 ? -fatigueDiff : 0;

    // Current Edge (value - burned)
    if (systemData.attributes.edg) {
      systemData.attributes.edg.current =
        systemData.attributes.edg.value - (systemData.attributes.edg.burned || 0);
    }
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

    // Calculate total modifier
    let totalMod = skillData.level || 0;

    // Add linked attribute modifiers
    if (skillData.linkedAttribute1) {
      const attr1 = this.system.attributes[skillData.linkedAttribute1];
      if (attr1) totalMod += attr1.linkMod || 0;
    }
    if (skillData.linkedAttribute2) {
      const attr2 = this.system.attributes[skillData.linkedAttribute2];
      if (attr2) totalMod += attr2.linkMod || 0;
    }

    // Apply injury and fatigue modifiers
    totalMod += this.system.injuryModifier || 0;
    totalMod += this.system.fatigueModifier || 0;

    // Apply any additional modifiers from options
    totalMod += options.modifier || 0;

    const rollFormula = `2d6 + ${totalMod}`;
    const roll = new Roll(rollFormula);
    await roll.evaluate();

    // Extract raw dice results for display
    const diceResults = roll.dice[0].results.map(r => r.result);
    const rawDiceTotal = diceResults.reduce((a, b) => a + b, 0);

    const success = roll.total >= targetNumber;
    const marginOfSuccess = roll.total - targetNumber;

    // Create chat message
    const messageContent = await renderTemplate(
      "systems/mech-foundry/templates/chat/skill-roll.hbs",
      {
        skillName: skill.name,
        roll: roll,
        total: roll.total,
        targetNumber: targetNumber,
        modifier: totalMod,
        success: success,
        marginOfSuccess: marginOfSuccess,
        complexity: skillData.complexity,
        diceResults: diceResults,
        rawDiceTotal: rawDiceTotal
      }
    );

    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${skill.name} Check (TN ${targetNumber})`,
      content: messageContent,
      rolls: [roll]
    };

    ChatMessage.create(messageData);
    return { roll, success, marginOfSuccess };
  }

  /**
   * Roll an attribute check (single or double attribute)
   * @param {string} attr1Key First attribute key
   * @param {string} attr2Key Optional second attribute key for double checks
   * @param {object} options Additional options
   */
  async rollAttribute(attr1Key, attr2Key = null, options = {}) {
    const attr1 = this.system.attributes[attr1Key];
    if (!attr1) return;

    let totalMod = attr1.value;
    let targetNumber = 12; // Single attribute check TN
    let checkName = attr1Key.toUpperCase();

    if (attr2Key) {
      const attr2 = this.system.attributes[attr2Key];
      if (attr2) {
        totalMod += attr2.value;
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
    const available = edg.value - (edg.burned || 0);

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
   * Recovers fatigue points equal to BOD score
   */
  async recoverFatigue() {
    const bod = this.system.attributes.bod.value;
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
