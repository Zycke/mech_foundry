import { DiceMechanics } from '../helpers/dice-mechanics.mjs';

/**
 * Company Actor Sheet - Represents a mercenary or military organization
 * Tabs: Personnel, Organization, Status, Logistics, MTOE, Assets, Finances
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

    // Prepare financial ledger for display
    context.financialLedger = (this.actor.system.financialLedger || []).map(entry => ({
      ...entry,
      formattedDate: new Date(entry.date).toLocaleDateString(game.i18n.lang || 'en', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    }));

    // Prepare MTOE actor assets (vehicle_actor and ship actors linked via flag)
    this._prepareMTOEActors(context);

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

    // Asset categories (matching character inventory pattern)
    const companyAssets = {
      weapon: [],
      armor: [],
      ammo: [],
      electronics: [],
      healthcare: [],
      prosthetics: [],
      drugpoison: [],
      fuel: []
    };

    for (const item of this.actor.items) {
      const itemData = item.toObject(false);

      if (item.type === 'personnel') {
        itemData.monthlyExpense = (item.system.quantity || 0) * (item.system.payRate || 0);
        personnel.push(itemData);
      } else if (item.type === 'supplies') {
        supplies.push(itemData);
      } else if (companyAssets.hasOwnProperty(item.type)) {
        companyAssets[item.type].push(itemData);
      }
    }

    companyAssets.hasItems = Object.entries(companyAssets)
      .some(([key, arr]) => key !== 'hasItems' && Array.isArray(arr) && arr.length > 0);

    context.personnel = personnel;
    context.supplies = supplies;
    context.companyAssets = companyAssets;
  }

  /**
   * Prepare MTOE actors (vehicle_actor and ship actors linked via flag)
   */
  _prepareMTOEActors(context) {
    const mtoeActors = [];
    const linkedAssets = this.actor.getFlag('mech-foundry', 'linkedAssets') || [];
    for (const assetId of linkedAssets) {
      const actor = game.actors.get(assetId);
      if (actor && (actor.type === 'vehicle_actor' || actor.type === 'ship')) {
        mtoeActors.push({
          id: actor.id,
          name: actor.name,
          img: actor.img,
          type: actor.type
        });
      }
    }
    context.mtoeActors = mtoeActors;
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
   * Units contain character/NPC actors as leader + members
   */
  _prepareUnits(context) {
    const units = foundry.utils.deepClone(this.actor.system.units || []);

    for (const unit of units) {
      // Migrate old format: commanderId → leaderId
      if (unit.commanderId && !unit.leaderId) {
        unit.leaderId = unit.commanderId;
        delete unit.commanderId;
        delete unit.assignedPersonnel;
      }

      // Ensure arrays exist
      if (!unit.members) unit.members = [];
      if (!unit.skills) unit.skills = [];

      // Resolve leader data
      if (unit.leaderId) {
        const leader = game.actors.get(unit.leaderId);
        if (leader) {
          unit.leaderData = this._getActorSummary(leader);
          // Get skill levels for tracked skills
          unit.leaderData.skillLevels = this._getActorSkillLevels(leader, unit.skills);
        } else {
          unit.leaderData = null;
          unit.leaderId = null;
        }
      }

      // Resolve member data
      unit.memberData = unit.members.map(memberId => {
        const actor = game.actors.get(memberId);
        if (!actor) return null;
        const summary = this._getActorSummary(actor);
        summary.skillLevels = this._getActorSkillLevels(actor, unit.skills);
        return summary;
      }).filter(Boolean);

      // Calculate skill averages across all unit actors
      unit.skillSummary = unit.skills.map(skillName => {
        const allActorIds = [unit.leaderId, ...unit.members].filter(Boolean);
        let totalLevel = 0;
        let count = 0;

        for (const actorId of allActorIds) {
          const actor = game.actors.get(actorId);
          if (!actor) continue;
          const skillItem = actor.items.find(i => i.type === 'skill' && i.name.toLowerCase() === skillName.toLowerCase());
          const level = skillItem ? skillItem.system.level : 0;
          totalLevel += level;
          count++;
        }

        return {
          name: skillName,
          average: count > 0 ? (totalLevel / count).toFixed(1) : "0.0"
        };
      });
    }

    context.units = units;
  }

  /**
   * Get a summary of an actor's key stats for unit display
   */
  _getActorSummary(actor) {
    const bod = actor.system.attributes?.bod?.total || actor.system.attributes?.bod?.value || 5;
    const wil = actor.system.attributes?.wil?.total || actor.system.attributes?.wil?.value || 5;
    return {
      id: actor.id,
      name: actor.name,
      img: actor.img,
      damage: actor.system.damage || { value: 0, max: 10 },
      fatigue: actor.system.fatigue || { value: 0, max: 10 },
      damageCapacity: actor.system.damageCapacity || (bod * 2),
      fatigueCapacity: actor.system.fatigueCapacity || (wil * 2)
    };
  }

  /**
   * Get an actor's skill levels for the tracked skills in a unit
   */
  _getActorSkillLevels(actor, skills) {
    const levels = {};
    for (const skillName of skills) {
      const skillItem = actor.items.find(i => i.type === 'skill' && i.name.toLowerCase() === skillName.toLowerCase());
      levels[skillName] = skillItem ? skillItem.system.level : 0;
    }
    return levels;
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

    // C-Bills fund management
    html.on('click', '.cbills-add', this._onAddFunds.bind(this));
    html.on('click', '.cbills-remove', this._onRemoveFunds.bind(this));

    // Finance management
    html.on('click', '.ledger-delete', this._onLedgerDelete.bind(this));
    html.on('click', '.pay-monthly-expenses', this._onPayMonthlyExpenses.bind(this));

    // MTOE asset management
    html.on('click', '.mtoe-remove', this._onMTOERemove.bind(this));

    // Unit management (Organization tab)
    html.on('click', '.add-unit', this._onAddUnit.bind(this));
    html.on('click', '.delete-unit', this._onDeleteUnit.bind(this));
    html.on('change', '.unit-name-input', this._onUnitNameChange.bind(this));
    html.on('click', '.remove-leader', this._onRemoveLeader.bind(this));
    html.on('click', '.remove-member', this._onRemoveMember.bind(this));
    html.on('click', '.add-unit-skill', this._onAddUnitSkill.bind(this));
    html.on('click', '.remove-unit-skill', this._onRemoveUnitSkill.bind(this));
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onDropItem(event, data) {
    if (!this.isEditable) return false;

    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;

    // Personnel items: check for duplicates by name
    if (item.type === 'personnel') {
      const existingItem = this.actor.items.find(i => i.name === item.name && i.type === item.type);
      if (existingItem) {
        ui.notifications.warn(`${item.name} already exists on this company sheet.`);
        return false;
      }
      return super._onDropItem(event, data);
    }

    // Supplies items
    if (item.type === 'supplies') {
      return super._onDropItem(event, data);
    }

    // Asset item types (for the Assets tab)
    const assetItemTypes = ['weapon', 'armor', 'ammo', 'electronics', 'healthcare', 'prosthetics', 'drugpoison', 'fuel'];
    if (assetItemTypes.includes(item.type)) {
      return super._onDropItem(event, data);
    }

    ui.notifications.warn("This item type cannot be added to the company sheet.");
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

    // Handle dropping character/NPC actors onto unit panels (Organization tab)
    if (tabName === 'organization') {
      const unitPanel = event.target.closest('.unit-panel');
      if (unitPanel && (actor.type === 'character' || actor.type === 'npc')) {
        const unitIndex = parseInt(unitPanel.dataset.unitIndex);
        const leaderZone = event.target.closest('.unit-leader-zone');

        if (leaderZone) {
          await this._assignLeaderToUnit(unitIndex, actor.id);
        } else {
          await this._addMemberToUnit(unitIndex, actor.id);
        }
        return false;
      }
    }

    // Handle dropping vehicle_actor/ship onto MTOE tab
    if (actor.type === 'vehicle_actor' || actor.type === 'ship') {
      const linkedAssets = this.actor.getFlag('mech-foundry', 'linkedAssets') || [];
      if (linkedAssets.includes(actor.id)) {
        ui.notifications.warn(`${actor.name} is already linked to this company.`);
        return false;
      }
      linkedAssets.push(actor.id);
      await this.actor.setFlag('mech-foundry', 'linkedAssets', linkedAssets);
      ui.notifications.info(`${actor.name} added to company MTOE.`);
      return false;
    }

    ui.notifications.warn("Drag character/NPC actors to the Organization tab to assign them to units. Drag Vehicle/Ship actors to the MTOE tab.");
    return false;
  }

  /* -------------------------------------------- */
  /*  C-Bills / Fund Management                   */
  /* -------------------------------------------- */

  /**
   * Process a financial transaction (add or remove funds)
   */
  async _processTransaction(amount, type, reason) {
    const currentCBills = this.actor.system.cbills || 0;
    const newCBills = type === 'add'
      ? currentCBills + amount
      : currentCBills - amount;

    if (newCBills < 0) {
      ui.notifications.warn("Insufficient funds for this transaction.");
      return;
    }

    const ledger = foundry.utils.deepClone(this.actor.system.financialLedger || []);
    ledger.unshift({
      id: foundry.utils.randomID(),
      date: new Date().toISOString(),
      submittedBy: game.user.name,
      amount: amount,
      type: type,
      reason: reason || "",
      balance: newCBills
    });

    await this.actor.update({
      'system.cbills': newCBills,
      'system.financialLedger': ledger
    });
  }

  /**
   * Open dialog to add funds
   */
  async _onAddFunds(event) {
    event.preventDefault();
    const dialogContent = `
      <form>
        <div class="form-group">
          <label>Amount (C-Bills)</label>
          <input type="number" name="amount" value="0" min="0" />
        </div>
        <div class="form-group">
          <label>Reason</label>
          <input type="text" name="reason" value="" placeholder="Reason for deposit" />
        </div>
      </form>
    `;

    new Dialog({
      title: "Add Funds",
      content: dialogContent,
      buttons: {
        confirm: {
          icon: '<i class="fas fa-check"></i>',
          label: "Confirm",
          callback: async (html) => {
            const amount = Math.abs(parseInt(html.find('[name="amount"]').val()) || 0);
            const reason = html.find('[name="reason"]').val() || "";
            if (amount <= 0) return;
            await this._processTransaction(amount, 'add', reason);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "confirm"
    }).render(true);
  }

  /**
   * Open dialog to remove funds
   */
  async _onRemoveFunds(event) {
    event.preventDefault();
    const currentCBills = this.actor.system.cbills || 0;
    const dialogContent = `
      <form>
        <div class="form-group">
          <label>Amount (C-Bills) — Current balance: ${currentCBills}</label>
          <input type="number" name="amount" value="0" min="0" />
        </div>
        <div class="form-group">
          <label>Reason</label>
          <input type="text" name="reason" value="" placeholder="Reason for withdrawal" />
        </div>
      </form>
    `;

    new Dialog({
      title: "Remove Funds",
      content: dialogContent,
      buttons: {
        confirm: {
          icon: '<i class="fas fa-check"></i>',
          label: "Confirm",
          callback: async (html) => {
            const amount = Math.abs(parseInt(html.find('[name="amount"]').val()) || 0);
            const reason = html.find('[name="reason"]').val() || "";
            if (amount <= 0) return;
            await this._processTransaction(amount, 'remove', reason);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "confirm"
    }).render(true);
  }

  /**
   * Pay monthly expenses
   */
  async _onPayMonthlyExpenses(event) {
    event.preventDefault();

    // Calculate total from personnel items
    let totalExpenses = 0;
    for (const item of this.actor.items) {
      if (item.type === 'personnel') {
        totalExpenses += (item.system.quantity || 0) * (item.system.payRate || 0);
      }
    }

    if (totalExpenses <= 0) {
      ui.notifications.warn("No monthly expenses to pay.");
      return;
    }

    const confirmed = await Dialog.confirm({
      title: "Pay Monthly Expenses",
      content: `<p>Deduct <strong>${totalExpenses} C-Bills</strong> for monthly personnel expenses?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      await this._processTransaction(totalExpenses, 'remove', 'Monthly Expenses (Wages)');
    }
  }

  /**
   * Delete a ledger entry (GM only)
   */
  async _onLedgerDelete(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const ledgerId = event.currentTarget.dataset.ledgerId;
    const ledger = foundry.utils.deepClone(this.actor.system.financialLedger || []);
    const index = ledger.findIndex(e => e.id === ledgerId);
    if (index >= 0) {
      ledger.splice(index, 1);
      await this.actor.update({ 'system.financialLedger': ledger });
    }
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
    await item.delete();
  }

  /**
   * Handle removing a MTOE actor asset
   */
  async _onMTOERemove(event) {
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
      leaderId: null,
      members: [],
      skills: []
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
   * Assign a leader to a unit (via drag & drop)
   */
  async _assignLeaderToUnit(unitIndex, actorId) {
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].leaderId = actorId;
      await this.actor.update({ 'system.units': units });
    }
  }

  /**
   * Add a member to a unit (via drag & drop)
   */
  async _addMemberToUnit(unitIndex, actorId) {
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      if (!units[unitIndex].members) units[unitIndex].members = [];
      if (units[unitIndex].members.includes(actorId) || units[unitIndex].leaderId === actorId) {
        ui.notifications.warn("This character is already in this unit.");
        return;
      }
      units[unitIndex].members.push(actorId);
      await this.actor.update({ 'system.units': units });
    }
  }

  /**
   * Remove a leader from a unit
   */
  async _onRemoveLeader(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].leaderId = null;
      await this.actor.update({ 'system.units': units });
    }
  }

  /**
   * Remove a member from a unit
   */
  async _onRemoveMember(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const memberIndex = parseInt(event.currentTarget.dataset.memberIndex);
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      if (units[unitIndex].members && memberIndex >= 0 && memberIndex < units[unitIndex].members.length) {
        units[unitIndex].members.splice(memberIndex, 1);
        await this.actor.update({ 'system.units': units });
      }
    }
  }

  /**
   * Add a tracked skill to a unit
   */
  async _onAddUnitSkill(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);

    const dialogContent = `
      <form>
        <div class="form-group">
          <label>Skill Name</label>
          <input type="text" name="skillName" value="" placeholder="e.g., Small Arms, Gunnery/Mech" />
        </div>
      </form>
    `;

    new Dialog({
      title: "Add Tracked Skill",
      content: dialogContent,
      buttons: {
        add: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Add",
          callback: async (html) => {
            const skillName = html.find('[name="skillName"]').val()?.trim();
            if (!skillName) return;

            const units = foundry.utils.deepClone(this.actor.system.units || []);
            if (unitIndex >= 0 && unitIndex < units.length) {
              if (!units[unitIndex].skills) units[unitIndex].skills = [];
              if (units[unitIndex].skills.some(s => s.toLowerCase() === skillName.toLowerCase())) {
                ui.notifications.warn("This skill is already tracked for this unit.");
                return;
              }
              units[unitIndex].skills.push(skillName);
              await this.actor.update({ 'system.units': units });
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "add"
    }).render(true);
  }

  /**
   * Remove a tracked skill from a unit
   */
  async _onRemoveUnitSkill(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const skillIndex = parseInt(event.currentTarget.dataset.skillIndex);
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      if (units[unitIndex].skills && skillIndex >= 0 && skillIndex < units[unitIndex].skills.length) {
        units[unitIndex].skills.splice(skillIndex, 1);
        await this.actor.update({ 'system.units': units });
      }
    }
  }
}
