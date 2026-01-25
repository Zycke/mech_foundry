/**
 * Extend the base Actor document for Mech Foundry system
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
    const flags = actorData.flags.mechfoundry || {};

    // Prepare data based on actor type
    this._prepareCharacterData(actorData);
    this._prepareNpcData(actorData);
  }

  /**
   * Prepare Character type specific data
   * @param {Object} actorData The actor data object
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    const systemData = actorData.system;

    // Calculate attribute modifiers
    for (let [key, attribute] of Object.entries(systemData.attributes || {})) {
      attribute.mod = Math.floor((attribute.value - 5) / 2);
    }
  }

  /**
   * Prepare NPC type specific data
   * @param {Object} actorData The actor data object
   */
  _prepareNpcData(actorData) {
    if (actorData.type !== 'npc') return;

    const systemData = actorData.system;

    // Calculate attribute modifiers
    for (let [key, attribute] of Object.entries(systemData.attributes || {})) {
      attribute.mod = Math.floor((attribute.value - 5) / 2);
    }
  }

  /**
   * Roll a skill check for this actor
   * @param {string} skillId The ID of the skill item to roll
   * @param {object} options Additional options for the roll
   */
  async rollSkill(skillId, options = {}) {
    const skill = this.items.get(skillId);
    if (!skill || skill.type !== 'skill') return;

    const skillData = skill.system;
    const linkedAttr = this.system.attributes[skillData.linkedAttribute];
    const attrMod = linkedAttr ? linkedAttr.mod : 0;

    return game.mechfoundry.rollSkillCheck(
      skillData.level,
      attrMod,
      skillData.targetNumber,
      {
        speaker: ChatMessage.getSpeaker({ actor: this }),
        flavor: `${skill.name} Check`
      }
    );
  }

  /**
   * Roll a basic attribute check (2d6 + attribute modifier)
   * @param {string} attributeKey The key of the attribute to roll
   * @param {object} options Additional options for the roll
   */
  async rollAttribute(attributeKey, options = {}) {
    const attribute = this.system.attributes[attributeKey];
    if (!attribute) return;

    const rollFormula = `2d6 + ${attribute.mod}`;
    const roll = new Roll(rollFormula);
    await roll.evaluate();

    const targetNumber = options.targetNumber || 7;
    const success = roll.total >= targetNumber;

    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${attributeKey.toUpperCase()} Check`,
      content: `
        <div class="mech-foundry roll-result">
          <div class="dice-result">
            <strong>Roll:</strong> ${roll.total}
            <span class="target">(Target: ${targetNumber})</span>
          </div>
          <div class="result ${success ? 'success' : 'failure'}">
            ${success ? 'Success' : 'Failure'}
          </div>
        </div>
      `
    };

    roll.toMessage(messageData);
    return { roll, success };
  }
}
