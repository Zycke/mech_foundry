import { DiceMechanics } from '../helpers/dice-mechanics.mjs';

/**
 * Company Actor Sheet - Represents a mercenary or military organization
 * Features 6 tabs: Personnel, Organization, Status, MTOE, Logistics, Assets
 * @extends {ActorSheet}
 */
export class MechFoundryCompanySheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mech-foundry", "sheet", "actor", "company-sheet"],
      width: 900,
      height: 800,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "personnel" }],
      dragDrop: [{ dragSelector: ".item", dropSelector: null }]
    });
  }

  /** @override */
  get template() {
    return "systems/mech-foundry/templates/actor/actor-company-sheet.hbs";
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const context = await super.getData();
    const actorData = this.document.toObject(false);

    context.system = actorData.system;
    context.flags = actorData.flags;
    context.config = game.mechfoundry?.config || {};
    context.owner = this.document.isOwner;
    context.editable = this.isEditable;
    context.isGM = game.user.isGM;

    // Prepare items by type
    this._prepareItems(context);

    // Calculate derived company data
    this._calculateCompanyTotals(context);

    // Prepare unit data for organization tab
    this._prepareUnits(context);

    // Enrich biography
    context.enrichedBiography = await TextEditor.enrichHTML(
      this.actor.system.biography || "",
      { async: true }
    );

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Organize items into categories for the sheet
   */
  _prepareItems(context) {
    const personnel = [];
    const supplies = [];
    const assets = [];

    for (const item of this.actor.items) {
      if (item.type === 'personnel') {
        const monthlyExpense = (item.system.quantity || 0) * (item.system.payRate || 0);
        personnel.push({
          ...item,
          monthlyExpense: monthlyExpense
        });
      } else if (item.type === 'supplies') {
        supplies.push(item);
      }
    }

    // Look for linked vehicle_actor and ship actors (stored as IDs in flags)
    const linkedAssets = this.actor.getFlag('mech-foundry', 'linkedAssets') || [];
    for (const assetId of linkedAssets) {
      const actor = game.actors.get(assetId);
      if (actor && (actor.type === 'vehicle_actor' || actor.type === 'ship')) {
        assets.push(actor);
      }
    }

    context.personnel = personnel;
    context.supplies = supplies;
    context.assets = assets;
  }

  /**
   * Calculate company-wide totals from personnel items
   */
  _calculateCompanyTotals(context) {
    let totalPersonnel = 0;
    let totalMonthlyExpenses = 0;

    for (const p of context.personnel) {
      totalPersonnel += p.system.quantity || 0;
      totalMonthlyExpenses += (p.system.quantity || 0) * (p.system.payRate || 0);
    }

    context.totalPersonnel = totalPersonnel;
    context.totalMonthlyExpenses = totalMonthlyExpenses;
  }

  /**
   * Prepare unit hierarchy data for the Organization tab
   */
  _prepareUnits(context) {
    const units = foundry.utils.deepClone(this.actor.system.units || []);

    // Build personnel availability map (total available minus assigned)
    const personnelAvailability = {};
    for (const p of context.personnel) {
      personnelAvailability[p.id] = {
        name: p.name,
        totalQuantity: p.system.quantity || 0,
        assigned: 0
      };
    }

    // Calculate assigned personnel across all units
    for (const unit of units) {
      if (unit.assignedPersonnel) {
        for (const assignment of unit.assignedPersonnel) {
          if (personnelAvailability[assignment.personnelId]) {
            personnelAvailability[assignment.personnelId].assigned += assignment.quantity || 0;
          }
        }
      }

      // Resolve commander data
      if (unit.commanderId) {
        const commander = game.actors.get(unit.commanderId);
        if (commander) {
          unit.commanderName = commander.name;
          unit.commanderImg = commander.img;
        } else {
          unit.commanderName = "Unknown";
          unit.commanderImg = "icons/svg/mystery-man.svg";
        }
      }

      // Resolve personnel assignment names
      if (unit.assignedPersonnel) {
        for (const assignment of unit.assignedPersonnel) {
          const personnelItem = this.actor.items.get(assignment.personnelId);
          if (personnelItem) {
            assignment.personnelName = personnelItem.name;
          } else {
            assignment.personnelName = "Unknown";
          }
        }
      }
    }

    // Calculate remaining availability
    for (const [id, data] of Object.entries(personnelAvailability)) {
      data.remaining = data.totalQuantity - data.assigned;
    }

    context.units = units;
    context.personnelAvailability = personnelAvailability;

    // Build list of available personnel types for the assignment dropdown
    context.availablePersonnelTypes = context.personnel.map(p => ({
      id: p.id,
      name: p.name,
      remaining: personnelAvailability[p.id]?.remaining || 0
    }));
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Rollable personnel skill check
    html.on('click', '.personnel-roll', this._onPersonnelRoll.bind(this));

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Item CRUD
    html.on('click', '.item-edit', this._onItemEdit.bind(this));
    html.on('click', '.item-delete', this._onItemDelete.bind(this));

    // Asset management
    html.on('click', '.asset-remove', this._onAssetRemove.bind(this));

    // Unit management (Organization tab)
    html.on('click', '.add-unit', this._onAddUnit.bind(this));
    html.on('click', '.delete-unit', this._onDeleteUnit.bind(this));
    html.on('change', '.unit-name-input', this._onUnitNameChange.bind(this));
    html.on('click', '.remove-commander', this._onRemoveCommander.bind(this));
    html.on('click', '.assign-personnel', this._onAssignPersonnel.bind(this));
    html.on('click', '.remove-assigned-personnel', this._onRemoveAssignedPersonnel.bind(this));
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onDropItem(event, data) {
    if (!this.isEditable) return false;

    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;

    // Only accept personnel and supplies items
    if (item.type === 'personnel' || item.type === 'supplies') {
      // Check if this item already exists on the company
      const existingItem = this.actor.items.find(i => i.name === item.name && i.type === item.type);
      if (existingItem) {
        ui.notifications.warn(`${item.name} already exists on this company sheet.`);
        return false;
      }
      return super._onDropItem(event, data);
    }

    ui.notifications.warn("Only Personnel and Supplies items can be added to a Company sheet via the appropriate tabs.");
    return false;
  }

  /** @override */
  async _onDropActor(event, data) {
    if (!this.isEditable) return false;

    const actor = await Actor.implementation.fromDropData(data);
    if (!actor) return false;

    // Determine which tab section we're dropping on
    const dropTarget = event.target.closest('.tab');
    const tabName = dropTarget?.dataset?.tab;

    // Handle dropping character actors onto unit panels (Organization tab)
    if (tabName === 'organization') {
      const unitPanel = event.target.closest('.unit-panel');
      if (unitPanel && (actor.type === 'character' || actor.type === 'npc')) {
        const unitIndex = parseInt(unitPanel.dataset.unitIndex);
        await this._assignCommanderToUnit(unitIndex, actor.id);
        return false;
      }
    }

    // Handle dropping vehicle_actor/ship onto Assets tab
    if (actor.type === 'vehicle_actor' || actor.type === 'ship') {
      const linkedAssets = this.actor.getFlag('mech-foundry', 'linkedAssets') || [];
      if (linkedAssets.includes(actor.id)) {
        ui.notifications.warn(`${actor.name} is already linked to this company.`);
        return false;
      }
      linkedAssets.push(actor.id);
      await this.actor.setFlag('mech-foundry', 'linkedAssets', linkedAssets);
      ui.notifications.info(`${actor.name} added to company assets.`);
      return false;
    }

    ui.notifications.warn("Only Vehicle and Ship actors can be added to the Assets tab. Character actors can be assigned as unit commanders on the Organization tab.");
    return false;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle clicking on a personnel name to roll their skill
   */
  async _onPersonnelRoll(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.item').dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const skillName = item.system.skillName || item.name;
    const tn = item.system.skillTN || 7;
    const veterancy = item.system.veterancy || 0;

    // Show roll dialog for additional modifiers
    const dialogContent = `
      <form>
        <div class="form-group">
          <label>Skill: ${skillName}</label>
        </div>
        <div class="form-group">
          <label>Target Number (TN): ${tn}</label>
        </div>
        <div class="form-group">
          <label>Veterancy Modifier: +${veterancy}</label>
        </div>
        <div class="form-group">
          <label>Additional Modifier</label>
          <input type="number" name="additionalMod" value="0" />
        </div>
      </form>
    `;

    const dialog = new Dialog({
      title: `${item.name} - Skill Roll`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice"></i>',
          label: "Roll",
          callback: async (html) => {
            const additionalMod = parseInt(html.find('[name="additionalMod"]').val()) || 0;
            const totalMod = veterancy + additionalMod;
            await this._executePersonnelRoll(item, tn, totalMod, veterancy, additionalMod);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "roll"
    });
    dialog.render(true);
  }

  /**
   * Execute the personnel skill roll
   */
  async _executePersonnelRoll(item, tn, totalMod, veterancy, additionalMod) {
    const roll = await new Roll("2d6").evaluate();
    const dice = roll.dice[0].results.map(r => r.result);

    // Check for special mechanics using DiceMechanics
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(dice);
    const rollTotal = roll.total + totalMod;

    // Determine success with special roll handling
    const result = DiceMechanics.determineSuccess(rollTotal, tn, specialRoll);

    let resultText = "";
    let cssClass = "";

    if (specialRoll.isFumble) {
      resultText = game.i18n.localize("MECHFOUNDRY.Fumble");
      cssClass = "fumble";
    } else if (specialRoll.isMiraculousFeat) {
      resultText = game.i18n.localize("MECHFOUNDRY.MiraculousFeat");
      cssClass = "miraculous";
    } else if (specialRoll.isStunningSuccess) {
      resultText = game.i18n.localize("MECHFOUNDRY.StunningSuccess");
      cssClass = "stunning";
    } else {
      resultText = result.success
        ? game.i18n.localize("MECHFOUNDRY.Success")
        : game.i18n.localize("MECHFOUNDRY.Failure");
      cssClass = result.success ? "success" : "failure";
    }

    const mos = Math.abs(result.mos);

    // Build modifier breakdown
    const modParts = [];
    if (veterancy !== 0) modParts.push(`Veterancy: +${veterancy}`);
    if (additionalMod !== 0) modParts.push(`Additional: ${additionalMod >= 0 ? '+' : ''}${additionalMod}`);

    const bonusDiceStr = specialRoll.bonusDice.length > 0
      ? `<div>Bonus Dice: ${DiceMechanics.formatBonusDice(specialRoll.bonusDice)}</div>`
      : '';

    const chatContent = `
      <div class="mech-foundry chat-card skill-roll">
        <h3>${item.name} - Skill Roll</h3>
        <div class="roll-details">
          <div>Dice: ${dice.join(', ')}</div>
          ${bonusDiceStr}
          ${modParts.length > 0 ? `<div>Modifiers: ${modParts.join(', ')}</div>` : ''}
          <div>Total: ${result.finalTotal} vs TN ${tn}</div>
        </div>
        <div class="roll-result ${cssClass}">
          <strong>${resultText}</strong>
          ${!specialRoll.isFumble ? `<div>MoS: ${mos}</div>` : ''}
        </div>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: chatContent,
      roll: roll,
      type: CONST.CHAT_MESSAGE_TYPES.ROLL
    });
  }

  /**
   * Handle editing an item
   */
  _onItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.actor.items.get(li.dataset.itemId);
    if (item) item.sheet.render(true);
  }

  /**
   * Handle deleting an item
   */
  async _onItemDelete(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.actor.items.get(li.dataset.itemId);
    if (!item) return;

    // Remove any unit assignments that reference this personnel item
    if (item.type === 'personnel') {
      const units = foundry.utils.deepClone(this.actor.system.units || []);
      let changed = false;
      for (const unit of units) {
        if (unit.assignedPersonnel) {
          const before = unit.assignedPersonnel.length;
          unit.assignedPersonnel = unit.assignedPersonnel.filter(a => a.personnelId !== item.id);
          if (unit.assignedPersonnel.length !== before) changed = true;
        }
      }
      if (changed) {
        await this.actor.update({ 'system.units': units });
      }
    }

    await item.delete();
  }

  /**
   * Handle removing an asset
   */
  async _onAssetRemove(event) {
    event.preventDefault();
    const actorId = event.currentTarget.dataset.actorId;
    const linkedAssets = (this.actor.getFlag('mech-foundry', 'linkedAssets') || []).filter(id => id !== actorId);
    await this.actor.setFlag('mech-foundry', 'linkedAssets', linkedAssets);
  }

  /* -------------------------------------------- */
  /*  Unit Management (Organization Tab)          */
  /* -------------------------------------------- */

  /**
   * Add a new unit
   */
  async _onAddUnit(event) {
    event.preventDefault();
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    units.push({
      name: "New Unit",
      commanderId: null,
      assignedPersonnel: []
    });
    await this.actor.update({ 'system.units': units });
  }

  /**
   * Delete a unit
   */
  async _onDeleteUnit(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units.splice(unitIndex, 1);
      await this.actor.update({ 'system.units': units });
    }
  }

  /**
   * Handle unit name change
   */
  async _onUnitNameChange(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].name = event.currentTarget.value;
      await this.actor.update({ 'system.units': units });
    }
  }

  /**
   * Assign a commander to a unit (via drag & drop)
   */
  async _assignCommanderToUnit(unitIndex, actorId) {
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].commanderId = actorId;
      await this.actor.update({ 'system.units': units });
    }
  }

  /**
   * Remove a commander from a unit
   */
  async _onRemoveCommander(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].commanderId = null;
      await this.actor.update({ 'system.units': units });
    }
  }

  /**
   * Assign personnel to a unit via dialog
   */
  async _onAssignPersonnel(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);

    // Build list of available personnel
    const personnel = this.actor.items.filter(i => i.type === 'personnel');
    if (personnel.length === 0) {
      ui.notifications.warn("No personnel available. Add personnel items to the Personnel tab first.");
      return;
    }

    // Calculate availability
    const units = this.actor.system.units || [];
    const availability = {};
    for (const p of personnel) {
      availability[p.id] = {
        name: p.name,
        total: p.system.quantity || 0,
        assigned: 0
      };
    }
    for (const unit of units) {
      if (unit.assignedPersonnel) {
        for (const a of unit.assignedPersonnel) {
          if (availability[a.personnelId]) {
            availability[a.personnelId].assigned += a.quantity || 0;
          }
        }
      }
    }

    // Build dialog options
    const options = personnel
      .filter(p => {
        const avail = availability[p.id];
        return avail && (avail.total - avail.assigned) > 0;
      })
      .map(p => {
        const remaining = availability[p.id].total - availability[p.id].assigned;
        return `<option value="${p.id}">${p.name} (${remaining} available)</option>`;
      })
      .join('');

    if (!options) {
      ui.notifications.warn("No unassigned personnel available.");
      return;
    }

    const dialogContent = `
      <form>
        <div class="form-group">
          <label>Personnel Type</label>
          <select name="personnelId">${options}</select>
        </div>
        <div class="form-group">
          <label>Quantity</label>
          <input type="number" name="quantity" value="1" min="1" />
        </div>
      </form>
    `;

    new Dialog({
      title: "Assign Personnel to Unit",
      content: dialogContent,
      buttons: {
        assign: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Assign",
          callback: async (html) => {
            const personnelId = html.find('[name="personnelId"]').val();
            let quantity = parseInt(html.find('[name="quantity"]').val()) || 1;

            // Validate quantity doesn't exceed available
            const avail = availability[personnelId];
            const remaining = avail.total - avail.assigned;
            if (quantity > remaining) {
              ui.notifications.warn(`Only ${remaining} of that personnel type are available.`);
              quantity = remaining;
            }
            if (quantity <= 0) return;

            const updatedUnits = foundry.utils.deepClone(this.actor.system.units || []);
            if (!updatedUnits[unitIndex].assignedPersonnel) {
              updatedUnits[unitIndex].assignedPersonnel = [];
            }

            // Check if this type is already assigned to the unit
            const existing = updatedUnits[unitIndex].assignedPersonnel.find(a => a.personnelId === personnelId);
            if (existing) {
              existing.quantity += quantity;
            } else {
              updatedUnits[unitIndex].assignedPersonnel.push({
                personnelId: personnelId,
                quantity: quantity
              });
            }

            await this.actor.update({ 'system.units': updatedUnits });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "assign"
    }).render(true);
  }

  /**
   * Remove assigned personnel from a unit
   */
  async _onRemoveAssignedPersonnel(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const assignmentIndex = parseInt(event.currentTarget.dataset.assignmentIndex);

    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      if (units[unitIndex].assignedPersonnel && assignmentIndex >= 0 && assignmentIndex < units[unitIndex].assignedPersonnel.length) {
        units[unitIndex].assignedPersonnel.splice(assignmentIndex, 1);
        await this.actor.update({ 'system.units': units });
      }
    }
  }
}
