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
   * Based on A Time of War attribute progression (p.60)
   * Total XP needed for that score (Level × 100)
   */
  static ATTRIBUTE_XP_COSTS = {
    1: 100,
    2: 200,
    3: 300,
    4: 400,
    5: 500,    // Standard starting value
    6: 600,
    7: 700,
    8: 800,
    9: 900,
    10: 1000
  };

  /**
   * XP cost for Standard skill progression (A Time of War p.60)
   * Using Standard rate for all skills
   */
  static STANDARD_SKILL_XP_COSTS = {
    0: 20,
    1: 30,
    2: 50,
    3: 80,
    4: 120,
    5: 170,
    6: 230,
    7: 300,
    8: 380,
    9: 470,
    10: 570
  };

  /**
   * Get XP cost for the next attribute level
   * @param {number} currentScore Current attribute score
   * @returns {number} XP cost to reach next level
   */
  static getAttributeNextCost(currentScore) {
    if (currentScore >= 10) return 0;
    return this.ATTRIBUTE_XP_COSTS[currentScore + 1] || 0;
  }

  /**
   * Get attribute score from total XP invested
   * @param {number} xp Total XP invested
   * @returns {number} Attribute score (0 if insufficient XP)
   */
  static getAttributeScoreFromXP(xp) {
    if (xp < 100) return 0;  // Need at least 100 XP for level 1
    for (let i = 10; i >= 1; i--) {
      if (xp >= this.ATTRIBUTE_XP_COSTS[i]) {
        return i;
      }
    }
    return 0;
  }

  /**
   * Get skill level from total XP invested
   * Uses Standard skill progression rate
   * @param {number} xp Total XP invested
   * @returns {number} Skill level (-1 if insufficient XP for level 0)
   */
  static getSkillLevelFromXP(xp) {
    if (xp < 20) return -1;  // Need at least 20 XP for level 0
    for (let i = 10; i >= 0; i--) {
      if (xp >= this.STANDARD_SKILL_XP_COSTS[i]) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Get XP cost for the next skill level
   * Uses Standard skill progression rate
   * @param {number} currentLevel Current skill level
   * @returns {number} Total XP needed for next level
   */
  static getSkillNextCost(currentLevel) {
    if (currentLevel >= 10) return 0;
    return this.STANDARD_SKILL_XP_COSTS[currentLevel + 1] || 0;
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

    // Initialize inventory categories
    const inventory = {
      armor: [],
      weapons: [],
      electronics: [],
      powerpacks: [],
      healthcare: [],
      prosthetics: [],
      drugpoisons: [],
      vehicles: [],
      fuel: []
    };

    let totalWeight = 0;

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;

      // Calculate effective skill level (with link modifiers baked in)
      if (i.type === 'skill') {
        // Calculate skill level from XP (using Standard rate)
        const calculatedLevel = MechFoundryActorSheet.getSkillLevelFromXP(i.system.xp || 0);
        i.system.level = calculatedLevel;

        // Calculate next level cost
        i.nextLevelCost = MechFoundryActorSheet.getSkillNextCost(calculatedLevel);

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
        inventory.weapons.push(i);
        // Add weight if equipped or carried
        const status = i.system.carryStatus || 'carried';
        if (status !== 'stored') {
          totalWeight += parseFloat(i.system.mass) || 0;
        }
      }
      else if (i.type === 'armor') {
        armor.push(i);
        inventory.armor.push(i);
        // Add weight if equipped or carried
        const status = i.system.carryStatus || 'carried';
        if (status !== 'stored') {
          totalWeight += parseFloat(i.system.mass) || 0;
        }
      }
      else if (i.type === 'equipment') {
        equipment.push(i);
      }
      else if (i.type === 'vehicle') {
        vehicles.push(i);
        inventory.vehicles.push(i);
        // Vehicles don't contribute to carried weight
      }
      else if (i.type === 'electronics') {
        inventory.electronics.push(i);
        const status = i.system.carryStatus || 'carried';
        if (status !== 'stored') {
          totalWeight += parseFloat(i.system.mass) || 0;
        }
      }
      else if (i.type === 'powerpack') {
        inventory.powerpacks.push(i);
        const status = i.system.carryStatus || 'carried';
        if (status !== 'stored') {
          totalWeight += parseFloat(i.system.mass) || 0;
        }
      }
      else if (i.type === 'healthcare') {
        inventory.healthcare.push(i);
        const status = i.system.carryStatus || 'carried';
        if (status !== 'stored') {
          totalWeight += parseFloat(i.system.mass) || 0;
        }
      }
      else if (i.type === 'prosthetics') {
        inventory.prosthetics.push(i);
        // Prosthetics don't have mass field
      }
      else if (i.type === 'drugpoison') {
        inventory.drugpoisons.push(i);
        const status = i.system.carryStatus || 'carried';
        if (status !== 'stored') {
          totalWeight += parseFloat(i.system.mass) || 0;
        }
      }
      else if (i.type === 'fuel') {
        inventory.fuel.push(i);
        const status = i.system.carryStatus || 'carried';
        if (status !== 'stored') {
          totalWeight += parseFloat(i.system.mass) || 0;
        }
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

    // Filter equipped items for combat tab
    context.equippedWeapons = weapons.filter(w => w.system.carryStatus === 'equipped');
    context.equippedArmor = armor.filter(a => a.system.carryStatus === 'equipped');

    // Calculate total armor per body part
    context.totalArmor = this._calculateTotalArmor(context.equippedArmor);

    // Add inventory data
    inventory.totalWeight = totalWeight.toFixed(1);
    inventory.hasItems = Object.values(inventory)
      .some(arr => Array.isArray(arr) && arr.length > 0);

    // Calculate encumbrance
    const str = context.system.attributes?.str?.value || 5;
    const encumbrance = this._calculateEncumbrance(str, totalWeight);
    inventory.encumbrance = encumbrance;

    context.inventory = inventory;

    // Calculate highest equipped BAR (M type as default)
    context.equippedBAR = armor
      .filter(a => a.system.equipped || a.system.carryStatus === 'equipped')
      .reduce((max, a) => Math.max(max, a.system.bar?.m || 0), 0);
  }

  /**
   * Calculate total armor per body part from equipped armor
   * @param {Array} equippedArmor Array of equipped armor items
   * @returns {Object} Total armor values per location
   */
  _calculateTotalArmor(equippedArmor) {
    const totalArmor = {
      head: { m: 0, b: 0, e: 0, x: 0 },
      torso: { m: 0, b: 0, e: 0, x: 0 },
      arms: { m: 0, b: 0, e: 0, x: 0 },
      legs: { m: 0, b: 0, e: 0, x: 0 }
    };

    for (const armor of equippedArmor) {
      const coverage = armor.system.coverage || {};
      const bar = armor.system.bar || { m: 0, b: 0, e: 0, x: 0 };

      if (coverage.head) {
        totalArmor.head.m += bar.m || 0;
        totalArmor.head.b += bar.b || 0;
        totalArmor.head.e += bar.e || 0;
        totalArmor.head.x += bar.x || 0;
      }
      if (coverage.torso) {
        totalArmor.torso.m += bar.m || 0;
        totalArmor.torso.b += bar.b || 0;
        totalArmor.torso.e += bar.e || 0;
        totalArmor.torso.x += bar.x || 0;
      }
      if (coverage.arms) {
        totalArmor.arms.m += bar.m || 0;
        totalArmor.arms.b += bar.b || 0;
        totalArmor.arms.e += bar.e || 0;
        totalArmor.arms.x += bar.x || 0;
      }
      if (coverage.legs) {
        totalArmor.legs.m += bar.m || 0;
        totalArmor.legs.b += bar.b || 0;
        totalArmor.legs.e += bar.e || 0;
        totalArmor.legs.x += bar.x || 0;
      }
    }

    return totalArmor;
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
    let movementMultiplier = 1;

    if (weight >= limits.overloaded) {
      level = 'overloaded';
      effects = 'Movement reduced to 1 (crawl only)';
      movementMultiplier = 0; // Special case - set to 1
    } else if (weight >= limits.veryEncumbered) {
      level = 'veryEncumbered';
      effects = 'Triple MP cost, +1 fatigue/turn if moving (except walk/crawl) or melee';
      movementMultiplier = 1/3;
    } else if (weight >= limits.encumbered) {
      level = 'encumbered';
      effects = 'Double MP cost, +1 fatigue/turn if sprinting or melee';
      movementMultiplier = 0.5;
    }

    return {
      level,
      label: level === 'veryEncumbered' ? 'Very Encumbered' :
             level.charAt(0).toUpperCase() + level.slice(1),
      effects,
      limits,
      movementMultiplier
    };
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

    // Condition box click (damage/fatigue bubbles)
    html.on('click', '.condition-box', this._onConditionBoxClick.bind(this));

    // Add Inventory Item (with type selection dialog)
    html.on('click', '.add-inventory-item', this._onAddInventoryItem.bind(this));

    // Carry status toggle
    html.on('click', '.carry-status-toggle', this._onCarryStatusToggle.bind(this));

    // Weapon attack roll
    html.on('click', '.weapon-attack-roll', this._onWeaponAttack.bind(this));

    // Weapon reload
    html.on('click', '.weapon-reload', this._onWeaponReload.bind(this));

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
    event.stopPropagation();
    const input = event.currentTarget;
    const attrKey = input.dataset.attr;
    const newXP = parseInt(input.value) || 0;

    // Get the ACTUAL current XP from actor data (not the input which may have been changed)
    const currentXP = foundry.utils.getProperty(this.actor, `system.attributes.${attrKey}.xp`) || 0;

    if (newXP === currentXP) return;

    // Immediately revert the input to show original value while dialog is open
    input.value = currentXP;

    const isGM = game.user.isGM;
    const xpDifference = newXP - currentXP;

    // If reducing XP, only GM can do this
    if (xpDifference < 0 && !isGM) {
      ui.notifications.warn("Only the GM can reduce XP invested.");
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
    event.stopPropagation();
    const input = event.currentTarget;
    const itemId = input.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const newXP = parseInt(input.value) || 0;
    const currentXP = item.system.xp || 0;

    if (newXP === currentXP) return;

    // Immediately revert the input to show original value while dialog is open
    input.value = currentXP;

    const isGM = game.user.isGM;
    const xpDifference = newXP - currentXP;

    // If reducing XP, only GM can do this
    if (xpDifference < 0 && !isGM) {
      ui.notifications.warn("Only the GM can reduce XP invested.");
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
    event.stopPropagation();
    const input = event.currentTarget;
    const itemId = input.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const newXP = parseInt(input.value) || 0;
    const currentXP = item.system.xp || 0;
    const xpCost = parseInt(input.dataset.xpCost) || 0;

    if (newXP === currentXP) return;

    // Immediately revert the input to show original value while dialog is open
    input.value = currentXP;

    const isGM = game.user.isGM;
    const xpDifference = newXP - currentXP;

    // If reducing XP, only GM can do this
    if (xpDifference < 0 && !isGM) {
      ui.notifications.warn("Only the GM can reduce XP invested.");
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
      newValue = MechFoundryActorSheet.getSkillLevelFromXP(newXP);
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

  /**
   * Handle clicking on a condition box (damage/fatigue bubble)
   * Clicking an empty box fills it and all boxes to its left
   * Clicking a filled box empties it and all boxes to its right
   * @param {Event} event The click event
   * @private
   */
  async _onConditionBoxClick(event) {
    event.preventDefault();
    const box = event.currentTarget;
    const index = parseInt(box.dataset.index);
    const type = box.dataset.type; // 'damage' or 'fatigue'
    const isFilled = box.classList.contains('filled');

    // Determine the new value
    // Index is 0-based, so clicking box 0 means 1 damage, box 1 means 2 damage, etc.
    // If the box is filled, we want to set damage to this index (unfill this and all to the right)
    // If the box is empty, we want to set damage to index + 1 (fill this and all to the left)
    const newValue = isFilled ? index : index + 1;

    // Update the appropriate value
    if (type === 'damage') {
      await this.actor.update({ "system.damage.value": newValue });
    } else if (type === 'fatigue') {
      await this.actor.update({ "system.fatigue.value": newValue });
    }
  }

  /**
   * Handle adding a new inventory item with type selection dialog
   * @param {Event} event The originating click event
   * @private
   */
  async _onAddInventoryItem(event) {
    event.preventDefault();

    const itemTypes = [
      { type: 'weapon', label: 'Weapon' },
      { type: 'armor', label: 'Armor' },
      { type: 'electronics', label: 'Electronics' },
      { type: 'powerpack', label: 'Power Pack' },
      { type: 'healthcare', label: 'Health Care' },
      { type: 'prosthetics', label: 'Prosthetics' },
      { type: 'drugpoison', label: 'Drugs & Poisons' },
      { type: 'vehicle', label: 'Vehicle' },
      { type: 'fuel', label: 'Fuel' }
    ];

    const options = itemTypes.map(t =>
      `<option value="${t.type}">${t.label}</option>`
    ).join('');

    new Dialog({
      title: "Add Inventory Item",
      content: `
        <form>
          <div class="form-group">
            <label>Item Type</label>
            <select name="type">${options}</select>
          </div>
        </form>
      `,
      buttons: {
        create: {
          label: "Create",
          callback: async (html) => {
            const type = html.find('[name="type"]').val();
            const typeLabel = itemTypes.find(t => t.type === type)?.label || type;
            await Item.create({
              name: `New ${typeLabel}`,
              type: type,
              system: {}
            }, { parent: this.actor });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "create"
    }).render(true);
  }

  /**
   * Handle carry status toggle (equipped/carried/stored)
   * @param {Event} event The originating click event
   * @private
   */
  async _onCarryStatusToggle(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const li = $(element).parents(".item");
    const item = this.actor.items.get(li.data("itemId"));
    if (!item) return;

    const currentStatus = item.system.carryStatus || 'carried';
    const canEquip = ['weapon', 'armor'].includes(item.type);

    let newStatus;
    if (canEquip) {
      // Cycle: equipped -> carried -> stored -> equipped
      newStatus = currentStatus === 'equipped' ? 'carried' :
                  currentStatus === 'carried' ? 'stored' : 'equipped';
    } else {
      // Cycle: carried -> stored -> carried
      newStatus = currentStatus === 'carried' ? 'stored' : 'carried';
    }

    await item.update({ "system.carryStatus": newStatus });
  }

  /**
   * Handle weapon attack roll
   * @param {Event} event The originating click event
   * @private
   */
  async _onWeaponAttack(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents(".item");
    const weapon = this.actor.items.get(li.data("itemId"));
    if (!weapon) return;

    const hasBurstFire = weapon.system.bdFactor === 'B';
    const burstRating = weapon.system.burstRating || 0;
    const recoil = weapon.system.recoil || 0;
    const currentAmmo = weapon.system.ammo?.value || 0;
    const maxAmmo = weapon.system.ammo?.max || 0;

    // Build firing mode options
    let firingModeHtml = '';
    if (hasBurstFire) {
      firingModeHtml = `
        <div class="form-group">
          <label>Firing Mode</label>
          <select name="firingMode" class="firing-mode-select">
            <option value="single">Single Shot</option>
            <option value="burst">Burst Fire</option>
            <option value="controlled">Controlled Burst</option>
            <option value="suppression">Suppression Fire</option>
          </select>
        </div>
        <div class="burst-options" style="display: none;">
          <div class="form-group">
            <label>Shots (max ${burstRating})</label>
            <input type="number" name="burstShots" value="1" min="1" max="${burstRating}"/>
          </div>
        </div>
        <div class="controlled-options" style="display: none;">
          <div class="form-group">
            <label>Shots</label>
            <select name="controlledShots">
              <option value="2">2 shots</option>
              <option value="3">3 shots</option>
            </select>
          </div>
        </div>
        <div class="suppression-options" style="display: none;">
          <div class="form-group">
            <label>Area (m\u00b2)</label>
            <input type="number" name="suppressionArea" value="1" min="1"/>
          </div>
          <div class="form-group">
            <label>Rounds per m\u00b2 (1-5)</label>
            <input type="number" name="roundsPerSqm" value="1" min="1" max="5"/>
          </div>
          <div class="form-group">
            <label>Number of Targets</label>
            <input type="number" name="numTargets" value="1" min="1"/>
          </div>
        </div>
      `;
    }

    const dialogContent = `
      <form class="weapon-attack-dialog">
        <div class="form-group">
          <label>Weapon: <strong>${weapon.name}</strong></label>
        </div>
        <div class="form-group">
          <label>Linked Skill: <strong>${weapon.system.skill || 'None'}</strong></label>
        </div>
        <div class="form-group">
          <label>Current Ammo: <strong>${currentAmmo}/${maxAmmo}</strong></label>
        </div>
        <hr/>
        <div class="form-group">
          <label>Modifier</label>
          <input type="number" name="modifier" value="0"/>
        </div>
        ${firingModeHtml}
      </form>
    `;

    new Dialog({
      title: `Attack with ${weapon.name}`,
      content: dialogContent,
      buttons: {
        attack: {
          icon: '<i class="fas fa-crosshairs"></i>',
          label: "Attack",
          callback: async (html) => {
            const modifier = parseInt(html.find('[name="modifier"]').val()) || 0;
            const firingMode = html.find('[name="firingMode"]').val() || 'single';

            const options = {
              modifier,
              firingMode,
              burstShots: parseInt(html.find('[name="burstShots"]').val()) || 1,
              controlledShots: parseInt(html.find('[name="controlledShots"]').val()) || 2,
              suppressionArea: parseInt(html.find('[name="suppressionArea"]').val()) || 1,
              roundsPerSqm: parseInt(html.find('[name="roundsPerSqm"]').val()) || 1,
              numTargets: parseInt(html.find('[name="numTargets"]').val()) || 1
            };

            await this.actor.rollWeaponAttack(weapon._id, options);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "attack",
      render: (html) => {
        // Toggle firing mode options
        html.find('.firing-mode-select').on('change', (e) => {
          const mode = e.currentTarget.value;
          html.find('.burst-options, .controlled-options, .suppression-options').hide();
          if (mode === 'burst') html.find('.burst-options').show();
          else if (mode === 'controlled') html.find('.controlled-options').show();
          else if (mode === 'suppression') html.find('.suppression-options').show();
        });
      }
    }).render(true);
  }

  /**
   * Handle weapon reload
   * @param {Event} event The originating click event
   * @private
   */
  async _onWeaponReload(event) {
    event.preventDefault();
    event.stopPropagation();

    // Get item ID from the element's data attribute or parent
    let itemId = event.currentTarget.dataset.itemId;
    if (!itemId) {
      const li = $(event.currentTarget).parents(".item");
      itemId = li.data("itemId");
    }

    const weapon = this.actor.items.get(itemId);
    if (!weapon) return;

    const maxAmmo = weapon.system.ammo?.max || 0;
    const currentAmmo = weapon.system.ammo?.value || 0;

    if (currentAmmo >= maxAmmo) {
      ui.notifications.info(`${weapon.name} is already fully loaded.`);
      return;
    }

    await weapon.update({ "system.ammo.value": maxAmmo });
    ui.notifications.info(`${weapon.name} reloaded to ${maxAmmo} rounds.`);
  }
}
