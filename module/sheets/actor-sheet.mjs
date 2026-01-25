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
      width: 750,
      height: 700,
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

    // Add config data
    context.config = game.mechfoundry?.config || {};

    // Add roll data for TinyMCE editors
    context.rollData = this.actor.getRollData();

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

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;

      // Calculate effective skill level (with link modifiers baked in)
      if (i.type === 'skill') {
        let effectiveLevel = i.system.level || 0;
        if (i.system.linkedAttribute1) {
          const attr = context.system.attributes[i.system.linkedAttribute1];
          if (attr) effectiveLevel += attr.linkMod || 0;
        }
        if (i.system.linkedAttribute2) {
          const attr = context.system.attributes[i.system.linkedAttribute2];
          if (attr) effectiveLevel += attr.linkMod || 0;
        }
        i.effectiveLevel = effectiveLevel;
        skills.push(i);
      }
      else if (i.type === 'trait') {
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
    }

    // Sort skills alphabetically
    skills.sort((a, b) => a.name.localeCompare(b.name));

    // Assign to context
    context.skills = skills;
    context.traits = traits;
    context.weapons = weapons;
    context.armor = armor;
    context.equipment = equipment;

    // Calculate highest equipped BAR
    context.equippedBAR = armor
      .filter(a => a.system.equipped)
      .reduce((max, a) => Math.max(max, a.system.bar || 0), 0);
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
}
