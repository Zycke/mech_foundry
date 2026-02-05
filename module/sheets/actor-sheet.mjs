import { OpposedRollHelper } from '../helpers/opposed-rolls.mjs';
import { ItemEffectsHelper } from '../helpers/effects-helper.mjs';

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
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }],
      dragDrop: [{ dragSelector: ".item", dropSelector: null }]
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
    const context = await super.getData();

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

    // Prepare life stages data with default modules for single-module stages
    context.lifeStagesData = this._prepareLifeStagesData(context.system);

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
    const activeEffects = [];

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

    // Get items directly from the actor and convert to plain objects
    // In Foundry v11+, we need to explicitly get items from the actor
    const items = this.actor.items.map(i => {
      const itemData = i.toObject(false);
      itemData._id = i.id; // Ensure _id is set for template data-item-id attributes
      return itemData;
    });

    // Iterate through items, allocating to containers
    for (let i of items) {
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
      else if (i.type === 'activeEffect') {
        activeEffects.push(i);
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

    // Calculate encumbrance (use total STR including modifiers)
    const str = context.system.attributes?.str?.total || 5;
    const encumbrance = this._calculateEncumbrance(str, totalWeight);
    inventory.encumbrance = encumbrance;

    context.inventory = inventory;

    // Calculate highest equipped BAR (M type as default)
    context.equippedBAR = armor
      .filter(a => a.system.equipped || a.system.carryStatus === 'equipped')
      .reduce((max, a) => Math.max(max, a.system.bar?.m || 0), 0);

    // Add active effects - split into categories
    context.activeEffects = activeEffects;

    // Separate activeEffects into persistent and continuous damage
    context.persistentEffects = activeEffects.filter(e =>
      e.system.effectType !== 'continuous_damage'
    );
    context.continuousDamageEffects = activeEffects.filter(e =>
      e.system.effectType === 'continuous_damage'
    );

    // Get item-based effects from equipped items (including inactive toggleable ones)
    context.itemBasedEffects = ItemEffectsHelper.getAllEquippedItemEffects(this.actor);

    // Get toggleable effects for Combat tab
    context.toggleableEffects = context.itemBasedEffects.filter(e => e.isToggleable);
    context.hasToggleableEffects = context.toggleableEffects.length > 0;

    // Calculate active modifiers summary for display
    const activeModifiersSummary = [];

    // Add modifiers from persistent Active Effects
    for (const effect of activeEffects) {
      if (effect.system.active && effect.system.effectType === 'persistent') {
        // Ensure persistentModifiers is an array (may be {} from old data)
        const modifiers = Array.isArray(effect.system.persistentModifiers)
          ? effect.system.persistentModifiers
          : [];
        for (const mod of modifiers) {
          let targetLabel = mod.target;
          if (mod.targetType === 'attribute') {
            targetLabel = mod.target.toUpperCase();
          } else if (mod.targetType === 'movement') {
            targetLabel = mod.target.charAt(0).toUpperCase() + mod.target.slice(1);
          }
          const isMultiplicative = mod.operation === 'multiply';
          activeModifiersSummary.push({
            target: targetLabel,
            value: mod.value,
            source: effect.name,
            targetType: mod.targetType,
            isMultiplicative: isMultiplicative,
            effectSource: 'activeEffect'
          });
        }
      }
    }

    // Add modifiers from active item-based effects
    const activeItemEffects = ItemEffectsHelper.getEquippedItemEffects(this.actor);
    for (const effect of activeItemEffects) {
      let targetLabel = effect.effectType;
      let value = effect.value || 0;

      // Format combat effect labels
      if (effect.effectType.includes('attack_bonus')) {
        targetLabel = effect.effectType.replace('_', ' ').replace('attack bonus', 'Attack');
      } else if (effect.effectType.includes('damage_bonus')) {
        targetLabel = effect.effectType.replace('_', ' ').replace('damage bonus', 'Damage');
      } else if (effect.effectType === 'attribute_bonus') {
        targetLabel = (effect.target || '').toUpperCase();
      } else if (effect.effectType === 'movement_bonus') {
        targetLabel = (effect.target || '').charAt(0).toUpperCase() + (effect.target || '').slice(1);
      } else if (effect.effectType === 'skill_bonus') {
        targetLabel = effect.target || 'Skill';
      } else if (effect.effectType.startsWith('vision_')) {
        targetLabel = 'Vision: ' + effect.effectType.replace('vision_', '');
        value = effect.value + 'm';
      }

      activeModifiersSummary.push({
        target: targetLabel,
        value: value,
        source: effect.name || effect.sourceItemName,
        effectSource: 'itemEffect',
        isToggleable: effect.isToggleable
      });
    }

    context.activeModifiersSummary = activeModifiersSummary;
    context.hasActiveModifiers = activeModifiersSummary.length > 0;
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
      // Get item ID from button's data attribute first, then fall back to parent
      const btn = $(ev.currentTarget);
      const itemId = btn.data("itemId") || btn.parents(".item").data("itemId");
      const item = this.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Add Inventory Item
    html.on('click', '.item-create', this._onItemCreate.bind(this));

    // Delete Inventory Item
    html.on('click', '.item-delete', (ev) => {
      // Get item ID from button's data attribute first, then fall back to parent
      const btn = $(ev.currentTarget);
      const itemId = btn.data("itemId") || btn.parents(".item").data("itemId");
      const item = this.actor.items.get(itemId);
      if (!item) return;
      const container = btn.parents(".item");
      item.delete();
      container.slideUp(200, () => this.render(false));
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

    // Life Modules event handlers
    html.on('click', '.add-language', this._onAddLanguage.bind(this));
    html.on('click', '.remove-language', this._onRemoveLanguage.bind(this));
    html.on('click', '.add-module', this._onAddModule.bind(this));
    html.on('click', '.remove-module', this._onRemoveModule.bind(this));
    html.on('click', '.add-entry', this._onAddEntry.bind(this));
    html.on('click', '.remove-entry', this._onRemoveEntry.bind(this));

    // Phenotype selection handler
    html.on('change', '.phenotype-select', this._onPhenotypeChange.bind(this));

    // Active Effect toggle
    html.on('change', '.effect-toggle', this._onEffectToggle.bind(this));

    // Item Effect toggle (for toggleable effects from equipped items)
    html.on('change', '.item-effect-toggle', this._onItemEffectToggle.bind(this));

    // Drag events for macros
    if (this.actor.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      // Handle li.item elements (skills, traits, inventory items)
      html.find('li.item').each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
      // Handle tr.item elements (active effects in conditions table)
      html.find('tr.item').each((i, tr) => {
        tr.setAttribute("draggable", true);
        tr.addEventListener("dragstart", handler, false);
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

    // Set default values for activeEffect items
    if (type === 'activeEffect') {
      itemData.name = "New Effect";
      itemData.system = {
        active: true,
        effectType: 'persistent',
        continuousDamage: { standardDamage: 0, fatigueDamage: 0 },
        persistentModifiers: []
      };
    }

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
    const skill = this.actor.items.get(itemId);
    if (!skill) return;

    // Check for selected target
    const target = OpposedRollHelper.getTarget();
    const hasTarget = !!target;
    const targetName = target?.name || '';

    // Build target section
    let targetHtml = '';
    if (hasTarget) {
      targetHtml = `
        <div class="form-group target-info">
          <label>Target: <strong>${targetName}</strong></label>
        </div>
        <hr/>
      `;
    }

    const dialogContent = `
      <form class="skill-roll-dialog">
        <div class="form-group">
          <label>Skill: <strong>${skill.name}</strong></label>
        </div>
        <div class="form-group">
          <label>Target Number: <strong>${skill.system.targetNumber || 7}</strong></label>
        </div>
        <hr/>
        ${targetHtml}
        <div class="form-group">
          <label>Modifier</label>
          <input type="number" name="modifier" value="0"/>
        </div>
      </form>
    `;

    new Dialog({
      title: `${skill.name} Skill Check`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice"></i>',
          label: "Roll",
          callback: async (html) => {
            const modifier = parseInt(html.find('[name="modifier"]').val()) || 0;
            await this.actor.rollSkill(itemId, { modifier });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "roll"
    }).render(true);
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

    // Check for selected target
    const target = OpposedRollHelper.getTarget();
    const hasTarget = !!target;
    const targetName = target?.name || '';

    // Build target section
    let targetHtml = '';
    if (hasTarget) {
      targetHtml = `
        <div class="form-group target-info">
          <label>Target: <strong>${targetName}</strong></label>
        </div>
        <hr/>
      `;
    }

    // Build attribute options for double check
    const attributes = Object.keys(this.actor.system.attributes);
    const attr2Options = attributes
      .filter(a => a !== attributeKey)
      .map(a => `<option value="${a}">${a.toUpperCase()}</option>`)
      .join('');

    const content = `
      <form class="attribute-roll-dialog">
        <div class="form-group">
          <label>Attribute: <strong>${attributeKey.toUpperCase()}</strong></label>
        </div>
        <hr/>
        ${targetHtml}
        <div class="form-group">
          <label>
            <input type="checkbox" name="doubleCheck"/>
            Double Attribute Check (TN 18)
          </label>
        </div>
        <div class="form-group double-attr-select" style="display: none;">
          <label>Second Attribute</label>
          <select name="attr2">${attr2Options}</select>
        </div>
        <div class="form-group">
          <label>Modifier</label>
          <input type="number" name="modifier" value="0"/>
        </div>
      </form>
    `;

    new Dialog({
      title: `${attributeKey.toUpperCase()} Attribute Check`,
      content: content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice"></i>',
          label: "Roll",
          callback: async (html) => {
            const modifier = parseInt(html.find('[name="modifier"]').val()) || 0;
            const isDoubleCheck = html.find('[name="doubleCheck"]').is(':checked');
            const attr2 = isDoubleCheck ? html.find('[name="attr2"]').val() : null;
            await this.actor.rollAttribute(attributeKey, attr2, { modifier });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "roll",
      render: (html) => {
        // Toggle second attribute select visibility
        html.find('[name="doubleCheck"]').on('change', (e) => {
          const checked = e.currentTarget.checked;
          html.find('.double-attr-select').toggle(checked);
        });
      }
    }).render(true);
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
    const available = edg.total - (edg.burned || 0);

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

    const isAOE = weapon.system.bdFactor === 'A';

    // AOE weapons get their own dialog flow
    if (isAOE) {
      return this._onAOEWeaponAttack(weapon);
    }

    const hasBurstFire = weapon.system.bdFactor === 'B';
    const burstRating = weapon.system.burstRating || 0;
    const recoil = weapon.system.recoil || 0;
    const currentAmmo = weapon.system.ammo?.value || 0;
    const maxAmmo = weapon.system.ammo?.max || 0;
    const isMelee = weapon.system.weaponType === 'melee';

    // Check for selected target
    const target = OpposedRollHelper.getTarget();
    const hasTarget = !!target;
    const targetName = target?.name || '';

    // Get target's cover status for display
    const targetActor = target?.actor || null;
    const targetCover = targetActor?.system?.cover || 'none';
    const coverLabels = { none: 'None', light: 'Light (-1)', moderate: 'Moderate (-2)', heavy: 'Heavy (-3)', full: 'Full (-4)' };

    // Build target/opposed roll section
    let targetHtml = '';
    if (hasTarget) {
      targetHtml = `
        <div class="form-group target-info">
          <label>Target: <strong>${targetName}</strong></label>
        </div>
        ${isMelee ? `
        <div class="form-group opposed-roll-option">
          <label>
            <input type="checkbox" name="opposedRoll" checked/>
            Opposed Roll
          </label>
        </div>
        ` : ''}
        ${!isMelee && targetCover !== 'none' ? `
        <div class="form-group cover-info">
          <label>Target Cover: <strong>${coverLabels[targetCover]}</strong></label>
        </div>
        ` : ''}
        <hr/>
      `;
    } else {
      targetHtml = `
        <div class="form-group no-target-hint">
          <em>Select a target for opposed rolls</em>
        </div>
        <hr/>
      `;
    }

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
            <label>Zone Length (m)</label>
            <input type="number" name="suppressionArea" value="1" min="1"/>
          </div>
          <div class="form-group">
            <label>Rounds per m\u00b2 (1-5)</label>
            <input type="number" name="roundsPerSqm" value="1" min="1" max="5"/>
          </div>
          <div class="form-group suppression-hint">
            <em><i class="fas fa-ruler"></i> Place a 1m-wide suppression zone on the map. Targets detected automatically.</em>
          </div>
        </div>
      `;
    }

    // Build ranged-only options (cover, friendly fire)
    let rangedOptionsHtml = '';
    if (!isMelee) {
      rangedOptionsHtml = `
        ${hasTarget ? `
        <div class="form-group">
          <label>
            <input type="checkbox" name="ignoreCover"/>
            Ignore Cover
          </label>
        </div>
        ` : ''}
        <div class="form-group">
          <label>
            <input type="checkbox" name="friendlyInLoF"/>
            Friendly in Line of Fire (-1)
          </label>
        </div>
      `;
    }

    // Build aimed shot section (available for both melee and ranged)
    const aimedShotHtml = `
      <div class="form-group">
        <label>
          <input type="checkbox" name="aimedShot" class="aimed-shot-toggle"/>
          Aimed Shot
        </label>
      </div>
      <div class="aimed-shot-options" style="display: none;">
        <div class="form-group">
          <label>Target Body Part</label>
          <select name="aimedLocation">
            <option value="chest">Chest (-2)</option>
            <option value="arm">Arm (-3)</option>
            <option value="leg">Leg (-3)</option>
            <option value="abdomen">Abdomen (-3)</option>
            <option value="head">Head (-5)</option>
            <option value="hand">Hand (-5)</option>
            <option value="foot">Foot (-5)</option>
          </select>
        </div>
      </div>
    `;

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
        ${targetHtml}
        <div class="form-group">
          <label>Modifier</label>
          <input type="number" name="modifier" value="0"/>
        </div>
        ${rangedOptionsHtml}
        ${aimedShotHtml}
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
            const useOpposedRoll = html.find('[name="opposedRoll"]').is(':checked');

            const ignoreCover = html.find('[name="ignoreCover"]').is(':checked');
            const friendlyInLoF = html.find('[name="friendlyInLoF"]').is(':checked');
            const aimedShot = html.find('[name="aimedShot"]').is(':checked');
            const aimedLocation = aimedShot ? html.find('[name="aimedLocation"]').val() : null;

            const options = {
              modifier,
              firingMode,
              burstShots: parseInt(html.find('[name="burstShots"]').val()) || 1,
              controlledShots: parseInt(html.find('[name="controlledShots"]').val()) || 2,
              suppressionArea: parseInt(html.find('[name="suppressionArea"]').val()) || 1,
              roundsPerSqm: parseInt(html.find('[name="roundsPerSqm"]').val()) || 1,
              numTargets: parseInt(html.find('[name="numTargets"]').val()) || 1,
              target: hasTarget ? target : null,
              ignoreCover,
              friendlyInLoF,
              aimedShot,
              aimedLocation
            };

            // For melee attacks with target and opposed roll checked, use opposed roll flow
            if (isMelee && hasTarget && useOpposedRoll) {
              await this.actor.rollOpposedMeleeAttack(weapon._id, target, options);
            } else {
              await this.actor.rollWeaponAttack(weapon._id, options);
            }
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

        // Toggle aimed shot body part dropdown
        html.find('.aimed-shot-toggle').on('change', (e) => {
          const checked = e.currentTarget.checked;
          html.find('.aimed-shot-options').toggle(checked);
        });
      }
    }).render(true);
  }

  /**
   * Handle AOE weapon attack dialog
   * Shows blast info and modifier, then triggers template placement flow
   * @param {Item} weapon The AOE weapon
   * @private
   */
  async _onAOEWeaponAttack(weapon) {
    const currentAmmo = weapon.system.ammo?.value || 0;
    const maxAmmo = weapon.system.ammo?.max || 0;
    const bd = weapon.system.bd || 0;
    const ap = weapon.system.ap || 0;
    const apFactor = weapon.system.apFactor || '';

    const dialogContent = `
      <form class="weapon-attack-dialog aoe-attack-dialog">
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
        <div class="aoe-info">
          <label><i class="fas fa-bomb"></i> Area Effect Weapon</label>
        </div>
        <div class="aoe-stats">
          <table>
            <tr><td>Blast Radius</td><td><strong>${bd}m</strong></td></tr>
            <tr><td>Base Damage</td><td><strong>${bd}</strong></td></tr>
            <tr><td>AP</td><td><strong>${ap}${apFactor}</strong></td></tr>
            <tr><td>AOE Bonus</td><td><strong>+2</strong> to hit</td></tr>
            <tr><td>MoS</td><td><strong>Always 0</strong></td></tr>
            <tr><td>Falloff</td><td><strong>-1 BD / -1 AP</strong> per meter</td></tr>
          </table>
        </div>
        <hr/>
        <div class="form-group">
          <label>
            <input type="checkbox" name="indirectFire" class="indirect-fire-toggle"/>
            Indirect Fire <span class="indirect-penalty">(-4)</span>
          </label>
        </div>
        <div class="spotter-option" style="display: none;">
          <div class="form-group">
            <label>
              <input type="checkbox" name="spotter"/>
              Spotter (reduces penalty to -2)
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Additional Modifier</label>
          <input type="number" name="modifier" value="0"/>
        </div>
        <div class="form-group aoe-hint">
          <em><i class="fas fa-bullseye"></i> After clicking Attack, place the blast template on the map.</em>
        </div>
      </form>
    `;

    new Dialog({
      title: `Area Effect Attack: ${weapon.name}`,
      content: dialogContent,
      buttons: {
        attack: {
          icon: '<i class="fas fa-bomb"></i>',
          label: "Attack (Place Template)",
          callback: async (html) => {
            const modifier = parseInt(html.find('[name="modifier"]').val()) || 0;
            const indirectFire = html.find('[name="indirectFire"]').is(':checked');
            const spotter = html.find('[name="spotter"]').is(':checked');
            await this.actor.rollWeaponAttack(weapon._id, { modifier, indirectFire, spotter });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "attack",
      render: (html) => {
        html.find('.indirect-fire-toggle').on('change', (e) => {
          const checked = e.currentTarget.checked;
          html.find('.spotter-option').toggle(checked);
          html.find('.indirect-penalty').text(checked ? '(-4)' : '');
          if (!checked) {
            html.find('[name="spotter"]').prop('checked', false);
          }
        });
        html.find('[name="spotter"]').on('change', (e) => {
          const spotterChecked = e.currentTarget.checked;
          html.find('.indirect-penalty').text(spotterChecked ? '(-2)' : '(-4)');
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

  /* -------------------------------------------- */
  /*  Life Modules Handlers                        */
  /* -------------------------------------------- */

  /**
   * Prepare life stages data, ensuring single-module stages have a default module
   * @param {Object} systemData The actor's system data
   * @returns {Object} Prepared life stages data
   */
  _prepareLifeStagesData(systemData) {
    const lifeStages = foundry.utils.deepClone(systemData.lifeStages || {});
    const languages = foundry.utils.deepClone(systemData.languages || {});

    // Ensure all stages exist
    const stageKeys = ['stage0', 'stage1', 'stage2', 'stage3', 'stage4'];
    for (const stageKey of stageKeys) {
      if (!lifeStages[stageKey]) {
        lifeStages[stageKey] = { modules: {} };
      }
      if (!lifeStages[stageKey].modules) {
        lifeStages[stageKey].modules = {};
      }
    }

    // Single-module stages (0, 1, 2) should always have exactly one module
    const singleModuleStages = ['stage0', 'stage1', 'stage2'];
    for (const stageKey of singleModuleStages) {
      const moduleKeys = Object.keys(lifeStages[stageKey].modules || {});
      if (moduleKeys.length === 0) {
        const id = foundry.utils.randomID();
        lifeStages[stageKey].modules[id] = {
          name: "",
          xpCost: 0,
          attributes: {},
          skills: {},
          traits: {}
        };
      }
    }

    return {
      ...lifeStages,
      languages
    };
  }

  /**
   * Handle adding a new language
   * @param {Event} event
   */
  async _onAddLanguage(event) {
    event.preventDefault();
    const id = foundry.utils.randomID();
    const languages = foundry.utils.deepClone(this.actor.system.languages || {});
    languages[id] = { type: "secondary", name: "" };
    await this.actor.update({ "system.languages": languages });
  }

  /**
   * Handle removing a language
   * @param {Event} event
   */
  async _onRemoveLanguage(event) {
    event.preventDefault();
    const langId = event.currentTarget.dataset.langId;
    await this.actor.update({ [`system.languages.-=${langId}`]: null });
  }

  /**
   * Handle adding a module to a stage
   * @param {Event} event
   */
  async _onAddModule(event) {
    event.preventDefault();
    const stage = event.currentTarget.dataset.stage;
    const id = foundry.utils.randomID();
    const path = `system.lifeStages.${stage}.modules`;
    const modules = foundry.utils.deepClone(foundry.utils.getProperty(this.actor, path) || {});

    modules[id] = {
      name: "",
      xpCost: 0,
      attributes: {},
      skills: {},
      traits: {}
    };

    await this.actor.update({ [path]: modules });
  }

  /**
   * Handle removing a module from a stage
   * @param {Event} event
   */
  async _onRemoveModule(event) {
    event.preventDefault();
    const stage = event.currentTarget.dataset.stage;
    const moduleId = event.currentTarget.dataset.moduleId;
    await this.actor.update({
      [`system.lifeStages.${stage}.modules.-=${moduleId}`]: null
    });
  }

  /**
   * Handle adding an entry (attribute/skill/trait) to a module
   * @param {Event} event
   */
  async _onAddEntry(event) {
    event.preventDefault();
    const { stage, module: moduleId, type } = event.currentTarget.dataset;
    const id = foundry.utils.randomID();
    const path = `system.lifeStages.${stage}.modules.${moduleId}.${type}`;
    const entries = foundry.utils.deepClone(foundry.utils.getProperty(this.actor, path) || {});

    entries[id] = { value: "" };

    await this.actor.update({ [path]: entries });
  }

  /**
   * Handle removing an entry from a module
   * @param {Event} event
   */
  async _onRemoveEntry(event) {
    event.preventDefault();
    const { stage, module: moduleId, type, entry: entryId } = event.currentTarget.dataset;
    await this.actor.update({
      [`system.lifeStages.${stage}.modules.${moduleId}.${type}.-=${entryId}`]: null
    });
  }

  /**
   * Handle toggling an active effect's active state
   * @param {Event} event The change event
   */
  async _onEffectToggle(event) {
    event.preventDefault();
    const checkbox = event.currentTarget;
    const itemId = checkbox.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    await item.update({ "system.active": checkbox.checked });
  }

  /**
   * Handle toggling an item effect's active state
   * @param {Event} event The change event
   */
  async _onItemEffectToggle(event) {
    event.preventDefault();
    const checkbox = event.currentTarget;
    const itemId = checkbox.dataset.itemId;
    const effectIndex = parseInt(checkbox.dataset.effectIndex);
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const itemEffects = [...(item.system.itemEffects || [])];
    if (effectIndex >= 0 && effectIndex < itemEffects.length) {
      itemEffects[effectIndex].active = checkbox.checked;
      await item.update({ 'system.itemEffects': itemEffects });
    }
  }

  /**
   * Handle the drop of an Item onto the Actor sheet
   * @param {DragEvent} event The concluding drag event
   * @param {Object} data The drop data from the event
   * @override
   */
  async _onDropItem(event, data) {
    try {
      // Check if the user has permission to modify this actor
      if (!this.actor.isOwner) return false;

      // Retrieve the dropped item
      const item = await Item.implementation.fromDropData(data);
      if (!item) return false;

      // If the item is from the same actor, just sort it
      if (this.actor.uuid === item.parent?.uuid) {
        return this._onSortItem(event, item.toObject());
      }

      // Otherwise, create a copy of the item on this actor
      const itemData = item.toObject();
      return this._onDropItemCreate(itemData);
    } catch (err) {
      console.error("Mech Foundry | Error handling item drop:", err);
      ui.notifications?.error("Failed to drop item. See console for details.");
      return false;
    }
  }

  /**
   * Handle dropping of Item data onto the Actor sheet
   * @param {DragEvent} event The concluding drag event
   * @param {Object} data The dropped data transfer
   * @override
   */
  async _onDropItemCreate(itemData) {
    try {
      // Ensure itemData is an array
      const items = Array.isArray(itemData) ? itemData : [itemData];

      // Filter out items that cannot be added to this actor
      const toCreate = [];
      for (const item of items) {
        const result = await this._onDropSingleItem(item);
        if (result) toCreate.push(result);
      }

      // Don't create if nothing to create
      if (toCreate.length === 0) return [];

      // Create the owned items
      const created = await this.actor.createEmbeddedDocuments("Item", toCreate);

      // Force a re-render to ensure the sheet updates
      this.render(false);

      return created;
    } catch (err) {
      console.error("Mech Foundry | Error creating dropped item:", err);
      ui.notifications?.error("Failed to create item. See console for details.");
      return [];
    }
  }

  /**
   * Process a single dropped item and prepare it for creation
   * @param {Object} itemData The item data being dropped
   * @returns {Object|null} The processed item data or null if it should be rejected
   * @private
   */
  async _onDropSingleItem(itemData) {
    // Clone the item data to avoid modifying the original
    const item = foundry.utils.deepClone(itemData);

    // Ensure system data exists
    item.system = item.system || {};

    // For activeEffect items dropped from compendiums or other actors, ensure defaults
    if (item.type === 'activeEffect') {
      // Set default values if not present
      item.system.active = item.system.active ?? true;
      item.system.effectType = item.system.effectType || 'persistent';
      item.system.continuousDamage = item.system.continuousDamage || { standardDamage: 0, fatigueDamage: 0 };
      // Ensure persistentModifiers is always an array (may be {} from old data)
      item.system.persistentModifiers = Array.isArray(item.system.persistentModifiers)
        ? item.system.persistentModifiers
        : [];
    }

    // Remove any properties that shouldn't be copied (like _id, ownership, etc.)
    delete item._id;
    delete item.ownership;
    delete item.folder;
    delete item.sort;

    return item;
  }

  /**
   * Handle phenotype selection change
   * Automatically applies attribute modifiers based on selected phenotype
   * @param {Event} event The change event
   */
  async _onPhenotypeChange(event) {
    event.preventDefault();
    const phenotypeKey = event.currentTarget.value;
    const phenotypes = game.mechfoundry?.config?.phenotypes || {};
    const phenotype = phenotypes[phenotypeKey];

    if (!phenotype) {
      // If no valid phenotype selected, reset all modifiers to 0
      const updates = {
        "system.phenotype": phenotypeKey
      };
      for (const attr of ['str', 'bod', 'dex', 'rfl', 'int', 'wil', 'cha', 'edg']) {
        updates[`system.attributes.${attr}.modifier`] = 0;
      }
      await this.actor.update(updates);
      return;
    }

    // Apply phenotype modifiers to all attributes
    const updates = {
      "system.phenotype": phenotypeKey
    };
    for (const [attr, mod] of Object.entries(phenotype.modifiers)) {
      updates[`system.attributes.${attr}.modifier`] = mod;
    }

    await this.actor.update(updates);

    // Notify about bonus traits (informational only)
    if (phenotype.bonusTraits && phenotype.bonusTraits.length > 0) {
      ui.notifications.info(`${phenotype.label} phenotype includes these traits: ${phenotype.bonusTraits.join(', ')}`);
    }
  }
}
