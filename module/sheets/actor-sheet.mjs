/**
 * Extend the basic ActorSheet with modifications for Mech Foundry
 * @extends {ActorSheet}
 */
export class MechFoundryActorSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mech-foundry", "sheet", "actor"],
      width: 720,
      height: 680,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }]
    });
  }

  /** @override */
  get template() {
    return `systems/mech-foundry/templates/actor/actor-${this.actor.type}-sheet.hbs`;
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

    // Add roll data for TinyMCE editors
    context.rollData = this.actor.getRollData();

    // Prepare character data and items
    if (actorData.type === 'character') {
      this._prepareCharacterData(context);
    }

    // Prepare NPC data
    if (actorData.type === 'npc') {
      this._prepareNpcData(context);
    }

    // Prepare items
    this._prepareItems(context);

    return context;
  }

  /**
   * Organize and classify Items for Character sheets
   * @param {Object} context The actor data context
   */
  _prepareCharacterData(context) {
    // Attribute labels for display
    context.attributeLabels = {
      str: "MECHFOUNDRY.AttributeStr",
      bod: "MECHFOUNDRY.AttributeBod",
      dex: "MECHFOUNDRY.AttributeDex",
      rfl: "MECHFOUNDRY.AttributeRfl",
      int: "MECHFOUNDRY.AttributeInt",
      wil: "MECHFOUNDRY.AttributeWil",
      cha: "MECHFOUNDRY.AttributeCha",
      edg: "MECHFOUNDRY.AttributeEdg"
    };
  }

  /**
   * Organize and classify Items for NPC sheets
   * @param {Object} context The actor data context
   */
  _prepareNpcData(context) {
    context.attributeLabels = {
      str: "MECHFOUNDRY.AttributeStr",
      bod: "MECHFOUNDRY.AttributeBod",
      dex: "MECHFOUNDRY.AttributeDex",
      rfl: "MECHFOUNDRY.AttributeRfl",
      int: "MECHFOUNDRY.AttributeInt",
      wil: "MECHFOUNDRY.AttributeWil",
      cha: "MECHFOUNDRY.AttributeCha",
      edg: "MECHFOUNDRY.AttributeEdg"
    };
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
    const equipment = [];

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      if (i.type === 'skill') {
        skills.push(i);
      }
      else if (i.type === 'trait') {
        traits.push(i);
      }
      else if (i.type === 'weapon') {
        weapons.push(i);
      }
      else if (i.type === 'equipment') {
        equipment.push(i);
      }
    }

    // Assign to context
    context.skills = skills;
    context.traits = traits;
    context.weapons = weapons;
    context.equipment = equipment;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check
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

    // Rollable abilities
    html.on('click', '.rollable', this._onRoll.bind(this));

    // Attribute rolls
    html.on('click', '.attribute-roll', this._onAttributeRoll.bind(this));

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
    const data = duplicate(header.dataset);

    const name = `New ${type.capitalize()}`;
    const itemData = {
      name: name,
      type: type,
      system: data
    };

    // Remove the type from the dataset since it's in the itemData.type prop
    delete itemData.system["type"];

    return await Item.create(itemData, { parent: this.actor });
  }

  /**
   * Handle clickable rolls
   * @param {Event} event The originating click event
   * @private
   */
  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle skill rolls
    if (dataset.rollType === 'skill') {
      const itemId = element.closest('.item').dataset.itemId;
      return this.actor.rollSkill(itemId);
    }

    // Handle item rolls
    if (dataset.rollType === 'item') {
      const itemId = element.closest('.item').dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) return item.roll();
    }
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
    return this.actor.rollAttribute(attributeKey);
  }
}
