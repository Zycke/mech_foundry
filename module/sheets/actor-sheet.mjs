/**
 * Extend the basic ActorSheet with modifications for Mech Foundry
 * Based on A Time of War mechanics
 * @extends {ActorSheet}
 */
export class MechFoundryActorSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mech-foundry", "sheet", "actor"],
      width: 850,
      height: 750,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }]
    });
  }

  /** @override */
  get template() {
    return `systems/mech-foundry/templates/actor/actor-${this.actor.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */
  /*  XP Cost Tables (A Time of War)              */
  /* -------------------------------------------- */

  /**
   * XP cost to raise an attribute to a given score
   * Based on A Time of War attribute progression
   * Cost is cumulative total XP needed for that score
   */
  static ATTRIBUTE_XP_COSTS = {
    1: 0,
    2: 100,
    3: 200,
    4: 300,
    5: 400,    // Standard starting value
    6: 600,
    7: 900,
    8: 1200,
    9: 1600,
    10: 2100
  };

  /**
   * XP cost to raise a Simple skill to a given level
   */
  static SIMPLE_SKILL_XP_COSTS = {
    0: 0,
    1: 20,
    2: 50,
    3: 100,
    4: 170,
    5: 260,
    6: 370,
    7: 500,
    8: 650,
    9: 820,
    10: 1010
  };

  /**
   * XP cost to raise a Complex skill to a given level
   */
  static COMPLEX_SKILL_XP_COSTS = {
    0: 0,
    1: 30,
    2: 70,
    3: 130,
    4: 210,
    5: 310,
    6: 430,
    7: 570,
    8: 730,
    9: 910,
    10: 1110
  };

  /**
   * Get XP cost for the next attribute level
   * @param {number} currentScore Current attribute score
   * @returns {number} XP cost to reach next level
   */
  static getAttributeNextCost(currentScore) {
    if (currentScore >= 10) return 0;
    const currentTotal = this.ATTRIBUTE_XP_COSTS[currentScore] || 0;
    const nextTotal = this.ATTRIBUTE_XP_COSTS[currentScore + 1] || 0;
    return nextTotal - currentTotal;
  }

  /**
   * Get attribute score from total XP invested
   * @param {number} xp Total XP invested
   * @returns {number} Attribute score
   */
  static getAttributeScoreFromXP(xp) {
    let score = 1;
    for (let i = 10; i >= 1; i--) {
      if (xp >= this.ATTRIBUTE_XP_COSTS[i]) {
        score = i;
        break;
      }
    }
    return score;
  }

  /**
   * Get skill level from total XP invested
   * @param {number} xp Total XP invested
   * @param {string} complexity 'S' for Simple, 'C' for Complex
   * @returns {number} Skill level
   */
  static getSkillLevelFromXP(xp, complexity = 'S') {
    const costs = complexity === 'C' ? this.COMPLEX_SKILL_XP_COSTS : this.SIMPLE_SKILL_XP_COSTS;
    let level = 0;
    for (let i = 10; i >= 0; i--) {
      if (xp >= costs[i]) {
        level = i;
        break;
      }
    }
    return level;
  }

  /**
   * Get XP cost for the next skill level
   * @param {number} currentLevel Current skill level
   * @param {string} complexity 'S' for Simple, 'C' for Complex
   * @returns {number} XP cost to reach next level
   */
  static getSkillNextCost(currentLevel, complexity = 'S') {
    if (currentLevel >= 10) return 0;
    const costs = complexity === 'C' ? this.COMPLEX_SKILL_XP_COSTS : this.SIMPLE_SKILL_XP_COSTS;
    const currentTotal = costs[currentLevel] || 0;
    const nextTotal = costs[currentLevel + 1] || 0;
    return nextTotal - currentTotal;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    // Retrieve base data structure
    const context = super.getData();

    // Use a safe clone of the actor data for further operations
    const actorData = this.document.toObject(false);

    // Add the actor's data to context.data for easier access
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Add config data
    context.config = game.mechfoundry?.config || {};

    // Add roll data for TinyMCE editors
    context.rollData = this.actor.getRollData();

    // Add whether user is GM
    context.isGM = game.user.isGM;

    // Prepare XP costs for attributes
    context.xpCosts = this._prepareXPCosts(context.system);

    // Prepare character data and items
    this._prepareItems(context);

    // Enrich biography
    context.enrichedBiography = await TextEditor.enrichHTML(
      this.actor.system.biography,
      { async: true }
    );

    return context;
  }

  /**
   * Prepare XP cost data for the template
   * @param {Object} systemData The actor's system data
   * @returns {Object} XP costs object
   */
  _prepareXPCosts(systemData) {
    const xpCosts = {
      attributeNext: {}
    };

    // Calculate next level cost for each attribute
    for (const [key, attr] of Object.entries(systemData.attributes || {})) {
      xpCosts.attributeNext[key] = MechFoundryActorSheet.getAttributeNextCost(attr.value);
    }

    return xpCosts;
  }

  /**
   * Organize and classify Items for sheets
   * @param {Object} context The actor data context
   */
  _prepareItems(context) {
    // Initialize containers
    const skills = [];
    const traits = [];
    const weapons = [];
    const armor = [];
    const equipment = [];
    const vehicles = [];

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;

      // Calculate effective skill level (with link modifiers baked in)
      if (i.type === 'skill') {
        // Calculate skill level from XP
        const complexity = i.system.complexity || 'S';
        const calculatedLevel = MechFoundryActorSheet.getSkillLevelFromXP(i.system.xp || 0, complexity);
        i.system.level = calculatedLevel;

        // Calculate next level cost
        i.nextLevelCost = MechFoundryActorSheet.getSkillNextCost(calculatedLevel, complexity);

        // Calculate total link modifier for display
        let totalLinkMod = 0;
        if (i.system.linkedAttribute1) {
          const attr = context.system.attributes[i.system.linkedAttribute1];
          if (attr) totalLinkMod += attr.linkMod || 0;
        }
        if (i.system.linkedAttribute2) {
          const attr = context.system.attributes[i.system.linkedAttribute2];
          if (attr) totalLinkMod += attr.linkMod || 0;
        }
        i.totalLinkMod = totalLinkMod;
        i.effectiveLevel = calculatedLevel + totalLinkMod;
        skills.push(i);
      }
      else if (i.type === 'trait') {
        // Calculate trait XP cost from TP (Trait Points)
        // Positive traits cost XP, negative traits give XP back
        const tp = Math.abs(i.system.cost || 0);
        i.xpCost = tp * 100; // 100 XP per Trait Point
        traits.push(i);
      }
      else if (i.type === 'weapon') {
        weapons.push(i);
      }
      else if (i.type === 'armor') {
        armor.push(i);
      }
      else if (i.type === 'equipment') {
        equipment.push(i);
      }
      else if (i.type === 'vehicle') {
        vehicles.push(i);
      }
    }

    // Sort skills alphabetically
    skills.sort((a, b) => a.name.localeCompare(b.name));

    // Assign to context
    context.skills = skills;
    context.traits = traits;
    context.weapons = weapons;
    context.armor = armor;
    context.equipment = equipment;
    context.vehicles = vehicles;

    // Calculate highest equipped BAR (M type as default)
    context.equippedBAR = armor
      .filter(a => a.system.equipped)
      .reduce((max, a) => Math.max(max, a.system.bar?.m || 0), 0);
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing
    html.on('click', '.item-edit', (ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Add Inventory Item
    html.on('click', '.item-create', this._onItemCreate.bind(this));

    // Delete Inventory Item
    html.on('click', '.item-delete', (ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });

    // Rollable abilities - Skills
    html.on('click', '.skill-roll', this._onSkillRoll.bind(this));

    // Attribute rolls
    html.on('click', '.attribute-roll', this._onAttributeRoll.bind(this));

    // Toggle armor equipped
    html.on('click', '.armor-toggle', this._onArmorToggle.bind(this));

    // Condition actions
    html.on('click', '.clear-stun', this._onClearStun.bind(this));
    html.on('click', '.recover-fatigue', this._onRecoverFatigue.bind(this));
    html.on('click', '.consciousness-check', this._onConsciousnessCheck.bind(this));

    // Edge burning
    html.on('click', '.burn-edge', this._onBurnEdge.bind(this));

    // XP spending (button clicks - kept for backwards compatibility)
    html.on('click', '.add-xp-btn', this._onAddXP.bind(this));

    // XP input field changes
    html.on('change', '.attr-xp-input', this._onAttributeXPChange.bind(this));
    html.on('change', '.skill-xp-input', this._onSkillXPChange.bind(this));
    html.on('change', '.trait-xp-input', this._onTraitXPChange.bind(this));

    // Condition monitor max validation
    html.on('change', '.condition-input', this._onConditionChange.bind(this));

    // Drag events for macros
    if (this.actor.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
    }
  }

  /**
   * Handle creating a new Owned Item for the actor
   * @param {Event} event The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;

    const name = `New ${type.capitalize()}`;
    const itemData = {
      name: name,
      type: type,
      system: {}
    };

    return await Item.create(itemData, { parent: this.actor });
  }

  /**
   * Handle skill rolls
   * @param {Event} event The originating click event
   * @private
   */
  async _onSkillRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const itemId = element.closest('.item').dataset.itemId;
    return this.actor.rollSkill(itemId);
  }

  /**
   * Handle attribute roll clicks
   * @param {Event} event The originating click event
   * @private
   */
  async _onAttributeRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const attributeKey = element.dataset.attribute;

    // Check if shift is held for double attribute check
    if (event.shiftKey) {
      // Show dialog to select second attribute
      const attributes = Object.keys(this.actor.system.attributes);
      const options = attributes
        .filter(a => a !== attributeKey)
        .map(a => `<option value="${a}">${a.toUpperCase()}</option>`)
        .join('');

      const content = `
        <form>
          <div class="form-group">
            <label>Second Attribute</label>
            <select name="attr2">${options}</select>
          </div>
        </form>
      `;

      new Dialog({
        title: "Double Attribute Check",
        content: content,
        buttons: {
          roll: {
            label: "Roll",
            callback: (html) => {
              const attr2 = html.find('[name="attr2"]').val();
              this.actor.rollAttribute(attributeKey, attr2);
            }
          },
          cancel: {
            label: "Cancel"
          }
        },
        default: "roll"
      }).render(true);
    } else {
      return this.actor.rollAttribute(attributeKey);
    }
  }

  /**
   * Toggle armor equipped status
   * @param {Event} event
   * @private
   */
  async _onArmorToggle(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents(".item");
    const item = this.actor.items.get(li.data("itemId"));
    await item.update({ "system.equipped": !item.system.equipped });
  }

  /**
   * Clear stun effect
   * @param {Event} event
   * @private
   */
  async _onClearStun(event) {
    event.preventDefault();
    return this.actor.clearStun();
  }

  /**
   * Recover fatigue
   * @param {Event} event
   * @private
   */
  async _onRecoverFatigue(event) {
    event.preventDefault();
    return this.actor.recoverFatigue();
  }

  /**
   * Roll consciousness check
   * @param {Event} event
   * @private
   */
  async _onConsciousnessCheck(event) {
    event.preventDefault();
    return this.actor.rollConsciousness();
  }

  /**
   * Burn Edge points
   * @param {Event} event
   * @private
   */
  async _onBurnEdge(event) {
    event.preventDefault();

    const edg = this.actor.system.attributes.edg;
    const available = edg.value - (edg.burned || 0);

    if (available <= 0) {
      ui.notifications.warn("No Edge points available to burn!");
      return;
    }

    const content = `
      <form>
        <div class="form-group">
          <label>Points to Burn (${available} available)</label>
          <input type="number" name="points" value="1" min="1" max="${available}"/>
        </div>
        <div class="form-group">
          <label>Timing</label>
          <select name="timing">
            <option value="before">Before Roll (x2 modifier)</option>
            <option value="after">After Roll (x1 modifier)</option>
            <option value="reroll">Force Reroll (1 point)</option>
          </select>
        </div>
      </form>
    `;

    new Dialog({
      title: "Burn Edge",
      content: content,
      buttons: {
        burn: {
          label: "Burn Edge",
          callback: async (html) => {
            const points = parseInt(html.find('[name="points"]').val());
            const timing = html.find('[name="timing"]').val();
            const modifier = await this.actor.burnEdge(points, timing);

            let message = `${this.actor.name} burns ${points} Edge point(s)`;
            if (timing === 'before') {
              message += ` for a +${modifier} modifier to the next roll.`;
            } else if (timing === 'after') {
              message += ` for a +${modifier} modifier to the roll result.`;
            } else {
              message += ` to force a reroll.`;
            }

            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              content: message
            });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "burn"
    }).render(true);
  }

  /**
   * Handle XP spending for attributes, skills, and traits
   * @param {Event} event The originating click event
   * @private
   */
  async _onAddXP(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const type = button.dataset.type;
    const cost = parseInt(button.dataset.cost);

    const availableXP = this.actor.system.xp.value || 0;
    const isGM = game.user.isGM;

    let targetName = "";
    let itemId = null;
    let attrKey = null;

    if (type === "attribute") {
      attrKey = button.dataset.key;
      targetName = attrKey.toUpperCase();
    } else if (type === "skill" || type === "trait") {
      itemId = button.dataset.itemId;
      const item = this.actor.items.get(itemId);
      targetName = item?.name || "Unknown";
    }

    // Build dialog content
    let content = `
      <form>
        <p>Add XP to <strong>${targetName}</strong>?</p>
        <p>Cost: <strong>${cost} XP</strong></p>
        <p>Available XP: <strong>${availableXP}</strong></p>
    `;

    // Add Free XP option for GMs
    if (isGM) {
      content += `
        <div class="form-group">
          <label>
            <input type="checkbox" name="freeXP" value="1"/>
            Free XP (GM only - does not deduct from available XP)
          </label>
        </div>
      `;
    }

    content += `</form>`;

    new Dialog({
      title: `Add XP to ${targetName}`,
      content: content,
      buttons: {
        confirm: {
          label: "Confirm",
          callback: async (html) => {
            const freeXP = isGM && html.find('[name="freeXP"]').is(':checked');

            // Check if enough XP available (unless free XP)
            if (!freeXP && cost > availableXP) {
              ui.notifications.warn(`Not enough XP! Need ${cost}, have ${availableXP}.`);
              return;
            }

            // Apply the XP
            if (type === "attribute") {
              await this._applyAttributeXP(attrKey, cost, freeXP);
            } else if (type === "skill") {
              await this._applySkillXP(itemId, cost, freeXP);
            } else if (type === "trait") {
              await this._applyTraitXP(itemId, cost, freeXP);
            }

            // Notify
            const method = freeXP ? "granted (Free)" : "spent";
            ui.notifications.info(`${cost} XP ${method} on ${targetName}.`);
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "confirm"
    }).render(true);
  }

  /**
   * Apply XP to an attribute
   * @param {string} attrKey The attribute key
   * @param {number} cost The XP cost
   * @param {boolean} freeXP Whether this is free XP (GM only)
   * @private
   */
  async _applyAttributeXP(attrKey, cost, freeXP) {
    const attr = this.actor.system.attributes[attrKey];
    const newXP = (attr.xp || 0) + cost;
    const newScore = MechFoundryActorSheet.getAttributeScoreFromXP(newXP);

    const updates = {
      [`system.attributes.${attrKey}.xp`]: newXP,
      [`system.attributes.${attrKey}.value`]: newScore
    };

    // Deduct from available XP unless free
    if (!freeXP) {
      updates["system.xp.value"] = (this.actor.system.xp.value || 0) - cost;
      updates["system.xp.spent"] = (this.actor.system.xp.spent || 0) + cost;
    }

    await this.actor.update(updates);
  }

  /**
   * Apply XP to a skill
   * @param {string} itemId The skill item ID
   * @param {number} cost The XP cost
   * @param {boolean} freeXP Whether this is free XP (GM only)
   * @private
   */
  async _applySkillXP(itemId, cost, freeXP) {
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const newXP = (item.system.xp || 0) + cost;
    await item.update({ "system.xp": newXP });

    // Deduct from available XP unless free
    if (!freeXP) {
      await this.actor.update({
        "system.xp.value": (this.actor.system.xp.value || 0) - cost,
        "system.xp.spent": (this.actor.system.xp.spent || 0) + cost
      });
    }
  }

  /**
   * Apply XP to purchase a trait
   * @param {string} itemId The trait item ID
   * @param {number} cost The XP cost
   * @param {boolean} freeXP Whether this is free XP (GM only)
   * @private
   */
  async _applyTraitXP(itemId, cost, freeXP) {
    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Mark trait as purchased
    await item.update({
      "system.purchased": true,
      "system.xp": cost
    });

    // Deduct from available XP unless free
    if (!freeXP) {
      await this.actor.update({
        "system.xp.value": (this.actor.system.xp.value || 0) - cost,
        "system.xp.spent": (this.actor.system.xp.spent || 0) + cost
      });
    }
  }

  /**
   * Handle attribute XP input change
   * @param {Event} event The change event
   * @private
   */
  async _onAttributeXPChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const attrKey = input.dataset.attr;
    const newXP = parseInt(input.value) || 0;
    const currentXP = this.actor.system.attributes[attrKey]?.xp || 0;

    if (newXP === currentXP) return;

    const isGM = game.user.isGM;
    const xpDifference = newXP - currentXP;

    // If reducing XP, only GM can do this
    if (xpDifference < 0 && !isGM) {
      ui.notifications.warn("Only the GM can reduce XP invested.");
      input.value = currentXP;
      return;
    }

    // Show confirmation dialog
    await this._confirmXPChange("attribute", attrKey, null, currentXP, newXP, xpDifference);
  }

  /**
   * Handle skill XP input change
   * @param {Event} event The change event
   * @private
   */
  async _onSkillXPChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const itemId = input.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const newXP = parseInt(input.value) || 0;
    const currentXP = item.system.xp || 0;

    if (newXP === currentXP) return;

    const isGM = game.user.isGM;
    const xpDifference = newXP - currentXP;

    // If reducing XP, only GM can do this
    if (xpDifference < 0 && !isGM) {
      ui.notifications.warn("Only the GM can reduce XP invested.");
      input.value = currentXP;
      return;
    }

    // Show confirmation dialog
    await this._confirmXPChange("skill", null, itemId, currentXP, newXP, xpDifference);
  }

  /**
   * Handle trait XP input change
   * @param {Event} event The change event
   * @private
   */
  async _onTraitXPChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const itemId = input.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const newXP = parseInt(input.value) || 0;
    const currentXP = item.system.xp || 0;
    const xpCost = parseInt(input.dataset.xpCost) || 0;

    if (newXP === currentXP) return;

    const isGM = game.user.isGM;
    const xpDifference = newXP - currentXP;

    // If reducing XP, only GM can do this
    if (xpDifference < 0 && !isGM) {
      ui.notifications.warn("Only the GM can reduce XP invested.");
      input.value = currentXP;
      return;
    }

    // Show confirmation dialog
    await this._confirmXPChange("trait", null, itemId, currentXP, newXP, xpDifference, xpCost);
  }

  /**
   * Show confirmation dialog for XP changes
   * @param {string} type Type of XP change (attribute, skill, trait)
   * @param {string} attrKey Attribute key (for attributes)
   * @param {string} itemId Item ID (for skills/traits)
   * @param {number} currentXP Current XP value
   * @param {number} newXP New XP value
   * @param {number} xpDifference The XP difference
   * @param {number} xpCost Total XP cost for trait
   * @private
   */
  async _confirmXPChange(type, attrKey, itemId, currentXP, newXP, xpDifference, xpCost = 0) {
    const isGM = game.user.isGM;
    const availableXP = this.actor.system.xp.value || 0;
    const isReduction = xpDifference < 0;

    let targetName = "";
    let newValue = 0;

    if (type === "attribute") {
      targetName = attrKey.toUpperCase();
      newValue = MechFoundryActorSheet.getAttributeScoreFromXP(newXP);
    } else if (type === "skill") {
      const item = this.actor.items.get(itemId);
      targetName = item?.name || "Unknown";
      const complexity = item?.system.complexity || 'S';
      newValue = MechFoundryActorSheet.getSkillLevelFromXP(newXP, complexity);
    } else if (type === "trait") {
      const item = this.actor.items.get(itemId);
      targetName = item?.name || "Unknown";
      // Check if trait is purchased (XP >= cost)
      newValue = newXP >= xpCost ? "Purchased" : "Not Purchased";
    }

    // Build dialog content
    let content = `
      <form>
        <p>${isReduction ? 'Remove' : 'Add'} XP ${isReduction ? 'from' : 'to'} <strong>${targetName}</strong>?</p>
        <p>XP Change: <strong>${isReduction ? '' : '+'}${xpDifference} XP</strong></p>
        <p>New Total XP: <strong>${newXP}</strong></p>
        <p>New ${type === 'trait' ? 'Status' : (type === 'skill' ? 'Level' : 'Score')}: <strong>${type === 'skill' ? (newValue >= 0 ? '+' + newValue : newValue) : newValue}</strong></p>
    `;

    if (!isReduction) {
      content += `<p>Available XP: <strong>${availableXP}</strong></p>`;
    }

    // Add Free XP option for GMs
    if (isGM) {
      content += `
        <div class="form-group">
          <label>
            <input type="checkbox" name="freeXP" value="1" ${isReduction ? 'checked' : ''}/>
            Free XP (GM only - ${isReduction ? 'refunds XP to available pool' : 'does not deduct from available XP'})
          </label>
        </div>
      `;
    }

    content += `</form>`;

    new Dialog({
      title: `${isReduction ? 'Remove' : 'Add'} XP - ${targetName}`,
      content: content,
      buttons: {
        confirm: {
          label: "Confirm",
          callback: async (html) => {
            const freeXP = isGM && html.find('[name="freeXP"]').is(':checked');

            // Check if enough XP available (unless free XP or reduction)
            if (!freeXP && !isReduction && xpDifference > availableXP) {
              ui.notifications.warn(`Not enough XP! Need ${xpDifference}, have ${availableXP}.`);
              this.render(false);
              return;
            }

            // Apply the XP change
            if (type === "attribute") {
              const newScore = MechFoundryActorSheet.getAttributeScoreFromXP(newXP);
              const updates = {
                [`system.attributes.${attrKey}.xp`]: newXP,
                [`system.attributes.${attrKey}.value`]: newScore
              };

              if (!freeXP) {
                if (isReduction) {
                  // Refund XP to available pool
                  updates["system.xp.value"] = availableXP + Math.abs(xpDifference);
                  updates["system.xp.spent"] = (this.actor.system.xp.spent || 0) - Math.abs(xpDifference);
                } else {
                  updates["system.xp.value"] = availableXP - xpDifference;
                  updates["system.xp.spent"] = (this.actor.system.xp.spent || 0) + xpDifference;
                }
              }

              await this.actor.update(updates);
            } else if (type === "skill") {
              const item = this.actor.items.get(itemId);
              if (item) {
                await item.update({ "system.xp": newXP });

                if (!freeXP) {
                  const updates = {};
                  if (isReduction) {
                    updates["system.xp.value"] = availableXP + Math.abs(xpDifference);
                    updates["system.xp.spent"] = (this.actor.system.xp.spent || 0) - Math.abs(xpDifference);
                  } else {
                    updates["system.xp.value"] = availableXP - xpDifference;
                    updates["system.xp.spent"] = (this.actor.system.xp.spent || 0) + xpDifference;
                  }
                  await this.actor.update(updates);
                }
              }
            } else if (type === "trait") {
              const item = this.actor.items.get(itemId);
              if (item) {
                await item.update({
                  "system.xp": newXP,
                  "system.purchased": newXP >= xpCost
                });

                if (!freeXP) {
                  const updates = {};
                  if (isReduction) {
                    updates["system.xp.value"] = availableXP + Math.abs(xpDifference);
                    updates["system.xp.spent"] = (this.actor.system.xp.spent || 0) - Math.abs(xpDifference);
                  } else {
                    updates["system.xp.value"] = availableXP - xpDifference;
                    updates["system.xp.spent"] = (this.actor.system.xp.spent || 0) + xpDifference;
                  }
                  await this.actor.update(updates);
                }
              }
            }

            // Notify
            const method = freeXP ? (isReduction ? "removed (Free)" : "granted (Free)") : (isReduction ? "refunded" : "spent");
            ui.notifications.info(`${Math.abs(xpDifference)} XP ${method} on ${targetName}.`);
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => {
            // Re-render to reset the input value
            this.render(false);
          }
        }
      },
      default: "confirm",
      close: () => {
        // Re-render if dialog closed without action
        this.render(false);
      }
    }).render(true);
  }

  /**
   * Handle condition monitor input change - enforce max value
   * @param {Event} event The change event
   * @private
   */
  _onConditionChange(event) {
    const input = event.currentTarget;
    const max = parseInt(input.dataset.max) || 0;
    const name = input.name.includes('damage') ? 'Standard Damage' : 'Fatigue';
    let value = parseInt(input.value) || 0;

    // Get old value from actor data
    const oldValue = input.name.includes('damage')
      ? this.actor.system.damage.value
      : this.actor.system.fatigue.value;

    if (value > max) {
      ui.notifications.error(`${name} cannot exceed maximum of ${max}!`);
      input.value = oldValue;
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    if (value < 0) {
      input.value = 0;
    }
  }
}
