import { DiceMechanics } from '../helpers/dice-mechanics.mjs';

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

const PERSONNEL_SKILLS = {
  crewmember: [
    { key: 'technician', label: 'Tech' },
    { key: 'engineering', label: 'Eng' },
    { key: 'medical', label: 'Med' },
    { key: 'crew', label: 'Crew' },
    { key: 'admin', label: 'Admin' },
    { key: 'leadership', label: 'Ldr' }
  ],
  infantry: [
    { key: 'smallArms', label: 'SA' },
    { key: 'demolitions', label: 'Demo' },
    { key: 'supportWeapons', label: 'SW' },
    { key: 'stealth', label: 'Stlth' },
    { key: 'zeroG', label: '0-G' },
    { key: 'leadership', label: 'Ldr' },
    { key: 'tactics', label: 'Tac' },
    { key: 'strategy', label: 'Str' }
  ],
  pilot: [
    { key: 'gunnery', label: 'Gun' },
    { key: 'pilotAero', label: 'P-Ae' },
    { key: 'pilotMech', label: 'P-Me' },
    { key: 'pilotVehicle', label: 'P-Ve' },
    { key: 'navigation', label: 'Nav' },
    { key: 'leadership', label: 'Ldr' },
    { key: 'tactics', label: 'Tac' },
    { key: 'strategy', label: 'Str' }
  ]
};

const SKILL_DISPLAY_NAMES = {
  technician: "Technician", engineering: "Engineering", medical: "Medical",
  crew: "Crew", admin: "Admin", leadership: "Leadership",
  smallArms: "Small Arms", demolitions: "Demolitions", supportWeapons: "Support Weapons",
  stealth: "Stealth", zeroG: "Zero-G", tactics: "Tactics", strategy: "Strategy",
  gunnery: "Gunnery", pilotAero: "Pilot (Aero)", pilotMech: "Pilot (Mech)",
  pilotVehicle: "Pilot (Vehicle)", navigation: "Navigation"
};

const DEPARTMENT_DEFS = [
  { name: 'Technicians', primarySkill: 'technician' },
  { name: 'Engineering', primarySkill: 'engineering' },
  { name: 'Medical', primarySkill: 'medical' },
  { name: 'Crew', primarySkill: 'crew' },
  { name: 'Admin', primarySkill: 'admin' }
];

const UNIT_SKILLS = {
  infantry: ['smallArms', 'demolitions', 'supportWeapons', 'stealth', 'zeroG'],
  vehicle: ['gunnery', 'pilotAero', 'pilotMech', 'pilotVehicle', 'navigation']
};

const UNIT_LEADER_SKILLS = ['leadership', 'tactics', 'strategy'];

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

  constructor(...args) {
    super(...args);
    this._deptCollapsed = new Map();
    this._unitCollapsed = new Map();
    // Initialize departments as collapsed by default
    for (const d of DEPARTMENT_DEFS) {
      this._deptCollapsed.set(d.name, true);
    }
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

    // Pass skill config constants to template
    context.personnelSkills = PERSONNEL_SKILLS;
    context.skillDisplayNames = SKILL_DISPLAY_NAMES;

    // Prepare items by type
    this._prepareItems(context);

    // Calculate derived company data
    this._calculateCompanyTotals(context);

    // Prepare departments for organization tab
    this._prepareDepartments(context);

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
   * Organize items into categories for the sheet, split personnel by type
   */
  _prepareItems(context) {
    const crewmemberPersonnel = [];
    const infantryPersonnel = [];
    const pilotPersonnel = [];
    const supplies = [];

    const companyAssets = {
      weapon: [], armor: [], ammo: [], electronics: [],
      healthcare: [], prosthetics: [], drugpoison: [], fuel: []
    };

    for (const item of this.actor.items) {
      const itemData = item.toObject(false);

      if (item.type === 'personnel') {
        const pType = item.system.personnelType || 'crewmember';
        if (pType === 'crewmember') crewmemberPersonnel.push(itemData);
        else if (pType === 'infantry') infantryPersonnel.push(itemData);
        else if (pType === 'pilot') pilotPersonnel.push(itemData);
      } else if (item.type === 'supplies') {
        supplies.push(itemData);
      } else if (companyAssets.hasOwnProperty(item.type)) {
        companyAssets[item.type].push(itemData);
      }
    }

    companyAssets.hasItems = Object.entries(companyAssets)
      .some(([key, arr]) => key !== 'hasItems' && Array.isArray(arr) && arr.length > 0);

    // Build unit ID → name map for display
    const unitNameMap = {};
    for (const u of (this.actor.system.units || [])) {
      if (u.id) unitNameMap[u.id] = u.name || 'Unnamed Unit';
    }
    for (const arr of [infantryPersonnel, pilotPersonnel]) {
      for (const p of arr) {
        p.assignmentDisplay = unitNameMap[p.system.assignment] || p.system.assignment || '';
      }
    }

    context.crewmemberPersonnel = crewmemberPersonnel;
    context.infantryPersonnel = infantryPersonnel;
    context.pilotPersonnel = pilotPersonnel;
    context.personnel = [...crewmemberPersonnel, ...infantryPersonnel, ...pilotPersonnel];
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
   * Calculate company-wide totals from personnel items (each item = 1 person)
   */
  _calculateCompanyTotals(context) {
    let totalPersonnel = context.personnel.length;
    let totalMonthlyExpenses = 0;

    for (const p of context.personnel) {
      totalMonthlyExpenses += p.system.payRate || 0;
    }

    context.totalPersonnel = totalPersonnel;
    context.totalMonthlyExpenses = totalMonthlyExpenses;
  }

  /* -------------------------------------------- */
  /*  Departments                                  */
  /* -------------------------------------------- */

  /**
   * Prepare department data for the Organization tab
   */
  _prepareDepartments(context) {
    const storedDepts = foundry.utils.deepClone(this.actor.system.departments || []);

    const departments = DEPARTMENT_DEFS.map(def => {
      const stored = storedDepts.find(d => d.name === def.name) || {};

      // Find crewmember personnel assigned to this department
      const members = [];
      for (const item of this.actor.items) {
        if (item.type === 'personnel' &&
            item.system.personnelType === 'crewmember' &&
            item.system.assignment === def.name) {
          const mData = item.toObject(false);
          mData.primarySkillValue = item.system.skills?.[def.primarySkill] || 0;
          members.push(mData);
        }
      }

      // Calculate averages from members
      let skillTotal = 0;
      let healthTotal = 0, healthMaxTotal = 0;
      let readinessTotal = 0, readinessMaxTotal = 0;

      for (const m of members) {
        skillTotal += m.primarySkillValue;
        healthTotal += m.system.health?.value || 0;
        healthMaxTotal += m.system.health?.max || 1;
        readinessTotal += m.system.readiness?.value || 0;
        readinessMaxTotal += m.system.readiness?.max || 1;
      }

      // Resolve leader (can be actor or personnel item)
      let leaderData = null;
      let leaderSkillValue = 0;
      let leaderLeadership = 0;

      if (stored.leaderId) {
        if (stored.leaderType === 'item') {
          // Leader is a personnel item
          const leaderItem = this.actor.items.get(stored.leaderId);
          if (leaderItem) {
            leaderData = {
              id: leaderItem.id,
              name: leaderItem.name,
              img: leaderItem.img,
              isItem: true
            };
            leaderSkillValue = leaderItem.system.skills?.[def.primarySkill] || 0;
            leaderLeadership = leaderItem.system.skills?.leadership || 0;
          }
        } else {
          // Leader is a character/NPC actor
          const leaderActor = game.actors.get(stored.leaderId);
          if (leaderActor) {
            leaderData = {
              id: leaderActor.id,
              name: leaderActor.name,
              img: leaderActor.img,
              isItem: false
            };
            // Look up skills on the actor
            const primarySkillItem = leaderActor.items.find(
              i => i.type === 'skill' && i.name.toLowerCase() === (SKILL_DISPLAY_NAMES[def.primarySkill] || '').toLowerCase()
            );
            leaderSkillValue = primarySkillItem ? primarySkillItem.system.level : 0;
            const leadershipItem = leaderActor.items.find(
              i => i.type === 'skill' && i.name.toLowerCase() === 'leadership'
            );
            leaderLeadership = leadershipItem ? leadershipItem.system.level : 0;
          }
        }
      }

      // Include leader in the primary skill average
      const allSkillValues = members.map(m => m.primarySkillValue);
      if (leaderData) {
        allSkillValues.push(leaderSkillValue);
        healthTotal += 1; // Approximate for leader
        healthMaxTotal += 1;
        readinessTotal += 1;
        readinessMaxTotal += 1;
      }

      const totalCount = allSkillValues.length;
      const totalSkill = allSkillValues.reduce((sum, v) => sum + v, 0);
      const rating = totalCount > 0 ? (totalSkill / totalCount).toFixed(1) : "0.0";
      const avgHealth = totalCount > 0
        ? `${(healthTotal / totalCount).toFixed(1)}/${(healthMaxTotal / totalCount).toFixed(1)}`
        : "--";
      const avgReadiness = totalCount > 0
        ? `${(readinessTotal / totalCount).toFixed(1)}/${(readinessMaxTotal / totalCount).toFixed(1)}`
        : "--";

      return {
        name: def.name,
        primarySkill: def.primarySkill,
        primarySkillDisplay: SKILL_DISPLAY_NAMES[def.primarySkill],
        leaderId: stored.leaderId || null,
        leaderType: stored.leaderType || 'actor',
        collapsed: this._deptCollapsed.get(def.name) !== false,
        rating: rating,
        ratingNum: totalCount > 0 ? (totalSkill / totalCount) : 0,
        leaderData: leaderData,
        leaderLeadership: leaderLeadership,
        avgHealth: avgHealth,
        avgReadiness: avgReadiness,
        memberCount: members.length + (leaderData ? 1 : 0),
        members: members
      };
    });

    context.departments = departments;
  }

  /* -------------------------------------------- */
  /*  Units                                        */
  /* -------------------------------------------- */

  /**
   * Prepare unit data for the Organization tab.
   * Units now have a unitType (vehicle/infantry) with auto-determined skills.
   * Members come from two sources: actor IDs and personnel items assigned by `assignment`.
   */
  _prepareUnits(context) {
    const units = foundry.utils.deepClone(this.actor.system.units || []);

    for (const unit of units) {
      // Migrate old format
      if (unit.commanderId && !unit.leaderId) {
        unit.leaderId = unit.commanderId;
        delete unit.commanderId;
        delete unit.assignedPersonnel;
      }
      if (!unit.members) unit.members = [];
      if (!unit.id) unit.id = foundry.utils.randomID();
      if (!unit.unitType) unit.unitType = 'vehicle';

      // Determine tracked skills from unit type
      const memberSkillKeys = UNIT_SKILLS[unit.unitType] || [];
      const leaderSkillKeys = UNIT_LEADER_SKILLS;

      // Collapse state
      unit.collapsed = this._unitCollapsed.get(unit.id) !== false;

      // Resolve leader (supports both actor and personnel item leaders)
      if (unit.leaderId) {
        if (unit.leaderType === 'item') {
          // Personnel item leader
          const leaderItem = this.actor.items.get(unit.leaderId);
          if (leaderItem) {
            unit.leaderData = {
              id: leaderItem.id,
              name: leaderItem.name,
              img: leaderItem.img || 'icons/svg/mystery-man.svg',
              isItem: true,
              health: leaderItem.system.health || { value: 1, max: 1 },
              readiness: leaderItem.system.readiness || { value: 1, max: 1 }
            };
            unit.leaderSkills = {};
            for (const key of leaderSkillKeys) {
              unit.leaderSkills[key] = leaderItem.system.skills?.[key] || 0;
            }
          } else {
            unit.leaderData = null;
            unit.leaderId = null;
            unit.leaderType = null;
            unit.leaderSkills = {};
          }
        } else {
          // Character actor leader
          const leader = game.actors.get(unit.leaderId);
          if (leader) {
            unit.leaderData = this._getActorSummary(leader);
            unit.leaderData.isItem = false;
            unit.leaderSkills = {};
            for (const key of leaderSkillKeys) {
              const displayName = SKILL_DISPLAY_NAMES[key];
              const skillItem = leader.items.find(i => i.type === 'skill' && i.name.toLowerCase() === displayName.toLowerCase());
              unit.leaderSkills[key] = skillItem ? skillItem.system.level : 0;
            }
          } else {
            unit.leaderData = null;
            unit.leaderId = null;
            unit.leaderSkills = {};
          }
        }
      } else {
        unit.leaderSkills = {};
      }

      // Collect all member data from two sources:
      // 1. Character/NPC actors in members array
      unit.actorMemberData = unit.members.map(memberId => {
        const actor = game.actors.get(memberId);
        if (!actor) return null;
        const summary = this._getActorSummary(actor);
        // Get member skill levels
        summary.skillLevels = {};
        for (const key of memberSkillKeys) {
          const displayName = SKILL_DISPLAY_NAMES[key];
          const skillItem = actor.items.find(i => i.type === 'skill' && i.name.toLowerCase() === displayName.toLowerCase());
          summary.skillLevels[key] = skillItem ? skillItem.system.level : 0;
        }
        return summary;
      }).filter(Boolean);

      // 2. Personnel items assigned to this unit
      unit.personnelMemberData = [];
      const matchingType = unit.unitType === 'infantry' ? 'infantry' : 'pilot';
      for (const item of this.actor.items) {
        if (item.type === 'personnel' &&
            item.system.personnelType === matchingType &&
            item.system.assignment === unit.id) {
          const pData = item.toObject(false);
          pData.skillLevels = {};
          for (const key of memberSkillKeys) {
            pData.skillLevels[key] = item.system.skills?.[key] || 0;
          }
          pData.isPersonnelItem = true;
          unit.personnelMemberData.push(pData);
        }
      }

      // Calculate skill averages for member skills (from all sources)
      const allMemberSkills = [...unit.actorMemberData, ...unit.personnelMemberData];

      unit.skillSummary = memberSkillKeys.map(key => {
        let total = 0;
        let count = 0;
        for (const m of allMemberSkills) {
          const val = m.skillLevels?.[key] || 0;
          total += val;
          count++;
        }
        return {
          key: key,
          name: SKILL_DISPLAY_NAMES[key],
          average: count > 0 ? (total / count).toFixed(1) : "0.0",
          averageNum: count > 0 ? (total / count) : 0
        };
      });

      // Leader-only skill summary
      unit.leaderSkillSummary = leaderSkillKeys.map(key => ({
        key: key,
        name: SKILL_DISPLAY_NAMES[key],
        value: unit.leaderSkills[key] || 0
      }));

      // Calculate health/readiness averages
      let healthTotal = 0, healthMaxTotal = 0, readinessTotal = 0, readinessMaxTotal = 0, memberCount = 0;
      for (const m of unit.actorMemberData) {
        healthTotal += m.damage?.value || 0;
        healthMaxTotal += m.damageCapacity || 10;
        memberCount++;
      }
      for (const m of unit.personnelMemberData) {
        healthTotal += m.system.health?.value || 0;
        healthMaxTotal += m.system.health?.max || 1;
        readinessTotal += m.system.readiness?.value || 0;
        readinessMaxTotal += m.system.readiness?.max || 1;
        memberCount++;
      }

      unit.totalMembers = memberCount;
      unit.avgHealth = memberCount > 0
        ? `${(healthTotal / memberCount).toFixed(1)}/${(healthMaxTotal / memberCount).toFixed(1)}`
        : "--";
      unit.avgReadiness = memberCount > 0
        ? `${(readinessTotal / memberCount).toFixed(1)}/${(readinessMaxTotal / memberCount).toFixed(1)}`
        : "--";

      // Provide display info
      unit.unitTypeDisplay = unit.unitType === 'infantry' ? 'Infantry' : 'Vehicle';
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

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Rollable skill checks
    html.on('click', '.personnel-roll', this._onPersonnelRoll.bind(this));
    html.on('click', '.summary-skill-roll', this._onSummarySkillRoll.bind(this));

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

    // Personnel assignment
    html.on('click', '.assign-department', this._onAssignDepartment.bind(this));
    html.on('click', '.assign-unit', this._onAssignUnit.bind(this));

    // Department management
    html.on('click', '.department-toggle', this._onToggleDepartment.bind(this));
    html.on('click', '.remove-dept-leader', this._onRemoveDeptLeader.bind(this));
    html.on('click', '.remove-from-department', this._onRemoveFromDepartment.bind(this));
    html.on('click', '.promote-dept-leader', this._onPromoteDeptLeader.bind(this));

    // Unit management (Organization tab)
    html.on('click', '.add-unit', this._onAddUnit.bind(this));
    html.on('click', '.delete-unit', this._onDeleteUnit.bind(this));
    html.on('change', '.unit-name-input', this._onUnitNameChange.bind(this));
    html.on('click', '.unit-toggle', this._onToggleUnit.bind(this));
    html.on('click', '.remove-leader', this._onRemoveLeader.bind(this));
    html.on('click', '.remove-member', this._onRemoveMember.bind(this));
    html.on('click', '.remove-unit-personnel', this._onRemoveUnitPersonnel.bind(this));
    html.on('click', '.promote-unit-leader-actor', this._onPromoteUnitLeaderActor.bind(this));
    html.on('click', '.promote-unit-leader-item', this._onPromoteUnitLeaderItem.bind(this));
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onDropItem(event, data) {
    if (!this.isEditable) return false;

    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;

    // Personnel items: allow all (each is unique individual)
    if (item.type === 'personnel') {
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

    const dropTarget = event.target.closest('.tab');
    const tabName = dropTarget?.dataset?.tab;

    // Handle dropping character/NPC actors onto Organization tab
    if (tabName === 'organization') {
      if (actor.type === 'character' || actor.type === 'npc') {
        // Check for department leader zone
        const deptLeaderZone = event.target.closest('.dept-leader-zone');
        if (deptLeaderZone) {
          const deptName = deptLeaderZone.dataset.department;
          await this._assignDeptLeaderActor(deptName, actor.id);
          return false;
        }

        // Check for unit panel
        const unitPanel = event.target.closest('.unit-panel');
        if (unitPanel) {
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

    ui.notifications.warn("Drag character/NPC actors to the Organization tab. Drag Vehicle/Ship actors to the MTOE tab.");
    return false;
  }

  /* -------------------------------------------- */
  /*  C-Bills / Fund Management                   */
  /* -------------------------------------------- */

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
      </form>`;

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
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "confirm"
    }).render(true);
  }

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
      </form>`;

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
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "confirm"
    }).render(true);
  }

  async _onPayMonthlyExpenses(event) {
    event.preventDefault();

    let totalExpenses = 0;
    for (const item of this.actor.items) {
      if (item.type === 'personnel') {
        totalExpenses += item.system.payRate || 0;
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
  /*  Personnel Assignment                        */
  /* -------------------------------------------- */

  /**
   * Assign a crewmember to a department via dialog
   */
  async _onAssignDepartment(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.item').dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item || item.system.personnelType !== 'crewmember') return;

    const currentAssignment = item.system.assignment || '';
    const options = DEPARTMENT_DEFS.map(d =>
      `<option value="${d.name}" ${d.name === currentAssignment ? 'selected' : ''}>${d.name}</option>`
    ).join('');

    new Dialog({
      title: `Assign ${item.name} to Department`,
      content: `<form><div class="form-group">
        <label>Department</label>
        <select name="department">
          <option value="">-- Unassigned --</option>
          ${options}
        </select>
      </div></form>`,
      buttons: {
        assign: {
          icon: '<i class="fas fa-check"></i>',
          label: "Assign",
          callback: async (html) => {
            const dept = html.find('[name="department"]').val();
            await item.update({ 'system.assignment': dept });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "assign"
    }).render(true);
  }

  /**
   * Assign infantry/pilot personnel to a unit via dialog
   */
  async _onAssignUnit(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.item').dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const pType = item.system.personnelType;
    const compatibleUnitType = pType === 'infantry' ? 'infantry' : 'vehicle';
    const units = (this.actor.system.units || []).filter(u => u.unitType === compatibleUnitType);
    const currentAssignment = item.system.assignment || '';

    if (units.length === 0) {
      ui.notifications.warn(`No ${compatibleUnitType} units exist. Create one in the Organization tab first.`);
      return;
    }

    const options = units.map(u =>
      `<option value="${u.id}" ${u.id === currentAssignment ? 'selected' : ''}>${u.name} (${u.unitType})</option>`
    ).join('');

    new Dialog({
      title: `Assign ${item.name} to Unit`,
      content: `<form><div class="form-group">
        <label>Unit</label>
        <select name="unitId">
          <option value="">-- Unassigned --</option>
          ${options}
        </select>
      </div></form>`,
      buttons: {
        assign: {
          icon: '<i class="fas fa-check"></i>',
          label: "Assign",
          callback: async (html) => {
            const unitId = html.find('[name="unitId"]').val();
            await item.update({ 'system.assignment': unitId });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "assign"
    }).render(true);
  }

  /* -------------------------------------------- */
  /*  Department Management                       */
  /* -------------------------------------------- */

  async _onToggleDepartment(event) {
    event.preventDefault();
    const deptName = event.currentTarget.dataset.department;
    const current = this._deptCollapsed.get(deptName);
    this._deptCollapsed.set(deptName, !current);
    this.render(false);
  }

  /**
   * Assign a character/NPC actor as department leader (via drag-drop)
   */
  async _assignDeptLeaderActor(deptName, actorId) {
    const departments = foundry.utils.deepClone(this.actor.system.departments || []);
    this._ensureDepartments(departments);
    const dept = departments.find(d => d.name === deptName);
    if (dept) {
      dept.leaderId = actorId;
      dept.leaderType = 'actor';
      await this.actor.update({ 'system.departments': departments });
    }
  }

  /**
   * Promote a personnel item to department leader
   */
  async _onPromoteDeptLeader(event) {
    event.preventDefault();
    const deptName = event.currentTarget.dataset.department;
    const itemId = event.currentTarget.dataset.itemId;
    const departments = foundry.utils.deepClone(this.actor.system.departments || []);
    this._ensureDepartments(departments);
    const dept = departments.find(d => d.name === deptName);
    if (dept) {
      dept.leaderId = itemId;
      dept.leaderType = 'item';
      await this.actor.update({ 'system.departments': departments });
    }
  }

  async _onRemoveDeptLeader(event) {
    event.preventDefault();
    const deptName = event.currentTarget.dataset.department;
    const departments = foundry.utils.deepClone(this.actor.system.departments || []);
    this._ensureDepartments(departments);
    const dept = departments.find(d => d.name === deptName);
    if (dept) {
      dept.leaderId = null;
      dept.leaderType = 'actor';
      await this.actor.update({ 'system.departments': departments });
    }
  }

  async _onRemoveFromDepartment(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      await item.update({ 'system.assignment': '' });
    }
  }

  /**
   * Ensure all 5 departments exist in the stored array
   */
  _ensureDepartments(departments) {
    for (const def of DEPARTMENT_DEFS) {
      if (!departments.find(d => d.name === def.name)) {
        departments.push({ name: def.name, leaderId: null, leaderType: 'actor' });
      }
    }
  }

  /* -------------------------------------------- */
  /*  Unit Management                             */
  /* -------------------------------------------- */

  async _onAddUnit(event) {
    event.preventDefault();
    const unitType = event.currentTarget.dataset.unitType || 'vehicle';
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    const newUnit = {
      id: foundry.utils.randomID(),
      name: `New ${unitType === 'infantry' ? 'Infantry' : 'Vehicle'} Unit`,
      unitType: unitType,
      leaderId: null,
      members: []
    };
    units.push(newUnit);
    await this.actor.update({ 'system.units': units });
  }

  async _onDeleteUnit(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      // Clear assignments for personnel in this unit
      const unitId = units[unitIndex].id;
      for (const item of this.actor.items) {
        if (item.type === 'personnel' && item.system.assignment === unitId) {
          await item.update({ 'system.assignment': '' });
        }
      }
      units.splice(unitIndex, 1);
      await this.actor.update({ 'system.units': units });
    }
  }

  async _onUnitNameChange(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].name = event.currentTarget.value;
      await this.actor.update({ 'system.units': units });
    }
  }

  async _onToggleUnit(event) {
    event.preventDefault();
    const unitId = event.currentTarget.dataset.unitId;
    const current = this._unitCollapsed.get(unitId);
    this._unitCollapsed.set(unitId, !current);
    this.render(false);
  }

  async _assignLeaderToUnit(unitIndex, actorId) {
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].leaderId = actorId;
      await this.actor.update({ 'system.units': units });
    }
  }

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

  async _onRemoveLeader(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].leaderId = null;
      units[unitIndex].leaderType = null;
      await this.actor.update({ 'system.units': units });
    }
  }

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

  async _onRemoveUnitPersonnel(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      await item.update({ 'system.assignment': '' });
    }
  }

  /**
   * Promote a character actor member to unit leader
   */
  async _onPromoteUnitLeaderActor(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const actorId = event.currentTarget.dataset.actorId;
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].leaderId = actorId;
      units[unitIndex].leaderType = 'actor';
      // Remove from members array since they're now the leader
      units[unitIndex].members = (units[unitIndex].members || []).filter(id => id !== actorId);
      await this.actor.update({ 'system.units': units });
    }
  }

  /**
   * Promote a personnel item member to unit leader
   */
  async _onPromoteUnitLeaderItem(event) {
    event.preventDefault();
    const unitIndex = parseInt(event.currentTarget.dataset.unitIndex);
    const itemId = event.currentTarget.dataset.itemId;
    const units = foundry.utils.deepClone(this.actor.system.units || []);
    if (unitIndex >= 0 && unitIndex < units.length) {
      units[unitIndex].leaderId = itemId;
      units[unitIndex].leaderType = 'item';
      await this.actor.update({ 'system.units': units });
    }
  }

  /* -------------------------------------------- */
  /*  Skill Rolls                                 */
  /* -------------------------------------------- */

  /**
   * Roll a personnel item's skill from the Personnel tab
   */
  async _onPersonnelRoll(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.item').dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const pType = item.system.personnelType || 'crewmember';
    const skills = PERSONNEL_SKILLS[pType] || [];

    // Build skill options for the dialog
    const skillOptions = skills.map(s => {
      const val = item.system.skills?.[s.key] || 0;
      return `<option value="${s.key}" data-rating="${val}">${SKILL_DISPLAY_NAMES[s.key]} (${val})</option>`;
    }).join('');

    const dialogContent = `
      <form>
        <div class="form-group">
          <label>Skill</label>
          <select name="skillKey">${skillOptions}</select>
        </div>
        <div class="form-group">
          <label>Target Number (TN)</label>
          <input type="number" name="tn" value="8" min="1" />
        </div>
        <div class="form-group">
          <label>Additional Modifier</label>
          <input type="number" name="modifier" value="0" />
        </div>
      </form>`;

    new Dialog({
      title: `${item.name} - Skill Roll`,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice"></i>',
          label: "Roll",
          callback: async (html) => {
            const skillKey = html.find('[name="skillKey"]').val();
            const skillValue = item.system.skills?.[skillKey] || 0;
            const tn = parseInt(html.find('[name="tn"]').val()) || 8;
            const modifier = parseInt(html.find('[name="modifier"]').val()) || 0;
            const skillName = SKILL_DISPLAY_NAMES[skillKey] || skillKey;
            await this._executeSummaryRoll(`${item.name} - ${skillName}`, skillValue, modifier, tn);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }

  /**
   * Roll a skill from a department or unit summary
   */
  async _onSummarySkillRoll(event) {
    event.preventDefault();
    const el = event.currentTarget;
    const label = el.dataset.label || "Skill Roll";
    const rating = parseFloat(el.dataset.rating) || 0;

    const dialogContent = `
      <form>
        <div class="form-group">
          <label>${label} (Rating: ${rating.toFixed(1)})</label>
        </div>
        <div class="form-group">
          <label>Target Number (TN)</label>
          <input type="number" name="tn" value="8" min="1" />
        </div>
        <div class="form-group">
          <label>Additional Modifier</label>
          <input type="number" name="modifier" value="0" />
        </div>
      </form>`;

    new Dialog({
      title: label,
      content: dialogContent,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice"></i>',
          label: "Roll",
          callback: async (html) => {
            const tn = parseInt(html.find('[name="tn"]').val()) || 8;
            const modifier = parseInt(html.find('[name="modifier"]').val()) || 0;
            await this._executeSummaryRoll(label, rating, modifier, tn);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }

  /**
   * Execute a summary roll: 2d6 + floor(rating) + modifier vs TN
   */
  async _executeSummaryRoll(label, rating, modifier, tn = 8) {
    const ratingMod = Math.floor(rating);
    const totalMod = ratingMod + modifier;

    const roll = await new Roll("2d6").evaluate();
    const dice = roll.dice[0].results.map(r => r.result);
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(dice);
    const rollTotal = roll.total + totalMod;
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
    const modParts = [];
    if (ratingMod !== 0) modParts.push(`Rating: +${ratingMod}`);
    if (modifier !== 0) modParts.push(`Modifier: ${modifier >= 0 ? '+' : ''}${modifier}`);

    const bonusDiceStr = specialRoll.bonusDice.length > 0
      ? `<div>Bonus Dice: ${DiceMechanics.formatBonusDice(specialRoll.bonusDice)}</div>`
      : '';

    const chatContent = `
      <div class="mech-foundry chat-card skill-roll">
        <h3>${label}</h3>
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
      </div>`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: chatContent,
      roll: roll,
      type: CONST.CHAT_MESSAGE_TYPES.ROLL
    });
  }

  /* -------------------------------------------- */
  /*  Item Event Handlers                         */
  /* -------------------------------------------- */

  _onItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.actor.items.get(li.dataset.itemId);
    if (item) item.sheet.render(true);
  }

  async _onItemDelete(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.actor.items.get(li.dataset.itemId);
    if (!item) return;
    await item.delete();
  }

  async _onMTOERemove(event) {
    event.preventDefault();
    const actorId = event.currentTarget.dataset.actorId;
    const linkedAssets = (this.actor.getFlag('mech-foundry', 'linkedAssets') || []).filter(id => id !== actorId);
    await this.actor.setFlag('mech-foundry', 'linkedAssets', linkedAssets);
  }
}
