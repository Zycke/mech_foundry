/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

/**
 * Ship crew types. These are numeric company-wide pools staffed into ship /
 * installation departments (they are NOT individual actors or items).
 */
const CREW_TYPES = [
  { key: 'enlisted', label: 'Enlisted' },
  { key: 'officers', label: 'Officers' },
  { key: 'bayTechs', label: 'Bay Techs' }
];

/**
 * Combat troop types. Numeric company-wide pools assigned into MTOE unit boxes
 * (distinct from ship crew).
 */
const TROOP_TYPES = [
  { key: 'infantry', label: 'Infantry' },
  { key: 'aeroPilots', label: 'Aerospace Pilots' },
  { key: 'mechPilots', label: 'Mech Pilots' },
  { key: 'vehicleCrew', label: 'Vehicle Crew' },
  { key: 'installationCrew', label: 'Installation Crew' }
];

/** Actor types that can be linked to the company as Locations. */
const LOCATION_ACTOR_TYPES = {
  naval_ship: 'Naval Ship',
  installation: 'Installation'
};

/** Actor types that can be dropped into MTOE unit boxes as equipment. */
const UNIT_ACTOR_TYPES = {
  mech: 'Mech',
  ground_vehicle: 'Ground Vehicle',
  aerospace_fighter: 'Aerospace Fighter',
  battle_armor: 'Battle Armor'
};

/** Per-location (ship / installation) numeric supply fields. */
const SHIP_SUPPLY_FIELDS = [
  { key: 'fuel', label: 'Ship Fuel' },
  { key: 'consumables', label: 'Ship Consumables' },
  { key: 'lifeSupport', label: 'Life Support' },
  { key: 'medicalSustainment', label: 'Medical Sustainment' },
  { key: 'emergencyMedical', label: 'Emergency Medical' },
  { key: 'spareParts', label: 'Spare Parts' }
];

/** Company-wide ground-forces supply numeric fields, grouped for display. */
const GROUND_SUPPLY_GROUPS = [
  {
    label: 'Spare Parts', fields: [
      { key: 'sparePartsMech', label: 'Mechs' },
      { key: 'sparePartsAero', label: 'Aerospace' },
      { key: 'sparePartsVehicle', label: 'Vehicles' },
      { key: 'sparePartsBA', label: 'Battle Armor' }
    ]
  },
  {
    label: 'Maintenance Consumables', fields: [
      { key: 'maintMech', label: 'Mechs' },
      { key: 'maintAero', label: 'Aerospace' },
      { key: 'maintVehicle', label: 'Vehicles' },
      { key: 'maintBA', label: 'Battle Armor' },
      { key: 'maintTroops', label: 'Troops' }
    ]
  },
  {
    label: 'Fuel', fields: [
      { key: 'fuel', label: 'Ground Fuel' }
    ]
  }
];

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Company Actor Sheet - Represents a mercenary or military organization.
 * Tabs: Locations, Logistics, Status, MTOE, Assets, Finances.
 *
 * Personnel are tracked as numeric company-wide pools (crew + troops) that are
 * assigned into ship/installation departments (crew) and MTOE unit boxes
 * (troops). Locations and MTOE equipment are linked unit actors.
 *
 * Foundry v14 ApplicationV2 sheet.
 * @extends {ActorSheetV2}
 */
export class MechFoundryCompanySheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** Active tab id, preserved across submitOnChange re-renders. */
  #activeTab = null;
  #dragDrop;
  /** The frame element the delegated listeners are currently bound to. */
  #boundElement = null;

  constructor(options = {}) {
    super(options);
    this.#dragDrop = this.#createDragDropHandlers();
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "company-sheet"],
    position: { width: 900, height: 800 },
    tag: "form",
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
    actions: {
      editImage: MechFoundryCompanySheet._onEditImage
    },
    dragDrop: [{ dragSelector: ".item", dropSelector: null }]
  };

  /** @override */
  static PARTS = {
    form: {
      template: "systems/mech-foundry/templates/actor/actor-company-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const system = this.actor.system;
    const context = {
      editable: this.isEditable,
      owner: this.document.isOwner,
      isGM: game.user.isGM,
      actor: this.actor,
      system,
      flags: this.actor.flags,
      config: game.mechfoundry?.config || {},
      crewTypes: CREW_TYPES,
      troopTypes: TROOP_TYPES,
      shipSupplyFields: SHIP_SUPPLY_FIELDS,
      groundSupplyGroups: GROUND_SUPPLY_GROUPS
    };

    this._prepareAssets(context);
    this._preparePersonnel(context);
    this._prepareLocations(context);
    this._prepareMTOE(context);

    // Company rollups
    context.totalPersonnel = context.crewPools.reduce((s, p) => s + p.total, 0)
      + context.troopPools.reduce((s, p) => s + p.total, 0);
    context.locationCount = context.locations.length;
    context.unitBoxCount = context.mtoe.length;

    // Financial ledger for display
    context.financialLedger = (system.financialLedger || []).map(entry => ({
      ...entry,
      formattedDate: new Date(entry.date).toLocaleDateString(game.i18n.lang || 'en', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    }));

    context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.biography || "",
      { relativeTo: this.actor }
    );

    return context;
  }

  /* -------------------------------------------- */
  /*  Context preparation                          */
  /* -------------------------------------------- */

  /**
   * Personnel pools with derived assigned / available counts.
   * Crew are assigned across location departments; troops across MTOE boxes.
   */
  _preparePersonnel(context) {
    const pools = this.actor.system.personnel || {};
    const locations = this.actor.system.locations || [];
    const boxes = this.actor.system.mtoe || [];

    // Sum crew assigned across every department of every location.
    const crewAssigned = {};
    for (const t of CREW_TYPES) crewAssigned[t.key] = 0;
    for (const loc of locations) {
      for (const dept of (loc.departments || [])) {
        for (const t of CREW_TYPES) {
          crewAssigned[t.key] += Number(dept.assigned?.[t.key]) || 0;
        }
      }
    }

    // Sum troops assigned across every MTOE box.
    const troopAssigned = {};
    for (const t of TROOP_TYPES) troopAssigned[t.key] = 0;
    for (const box of boxes) {
      for (const t of TROOP_TYPES) {
        troopAssigned[t.key] += Number(box.troops?.[t.key]) || 0;
      }
    }

    context.crewPools = CREW_TYPES.map(t => {
      const total = Number(pools[t.key]) || 0;
      const assigned = crewAssigned[t.key];
      return { ...t, total, assigned, available: total - assigned, over: assigned > total };
    });
    context.troopPools = TROOP_TYPES.map(t => {
      const total = Number(pools[t.key]) || 0;
      const assigned = troopAssigned[t.key];
      return { ...t, total, assigned, available: total - assigned, over: assigned > total };
    });
  }

  /**
   * Resolve linked location actors and their departments / supplies.
   */
  _prepareLocations(context) {
    const stored = this.actor.system.locations || [];
    const locations = [];

    for (const loc of stored) {
      const actor = game.actors.get(loc.actorId);
      const departments = (loc.departments || []).map(dept => {
        const reqTotal = CREW_TYPES.reduce((s, t) => s + (Number(dept.required?.[t.key]) || 0), 0);
        const assignedTotal = CREW_TYPES.reduce((s, t) => s + (Number(dept.assigned?.[t.key]) || 0), 0);
        return {
          id: dept.id,
          name: dept.name || 'Department',
          crew: CREW_TYPES.map(t => ({
            key: t.key,
            label: t.label,
            required: Number(dept.required?.[t.key]) || 0,
            assigned: Number(dept.assigned?.[t.key]) || 0
          })),
          reqTotal,
          assignedTotal,
          understaffed: assignedTotal < reqTotal
        };
      });

      const supplies = SHIP_SUPPLY_FIELDS.map(f => ({
        key: f.key,
        label: f.label,
        value: Number(loc.supplies?.[f.key]) || 0
      }));
      const ammo = (loc.supplies?.ammo || []).map(a => ({
        id: a.id, name: a.name || '', value: Number(a.value) || 0
      }));

      locations.push({
        id: loc.id,
        actorId: loc.actorId,
        exists: !!actor,
        name: actor ? actor.name : (loc.name || 'Missing Location'),
        img: actor ? actor.img : 'icons/svg/hazard.svg',
        typeLabel: actor ? (LOCATION_ACTOR_TYPES[actor.type] || 'Location') : 'Missing',
        status: loc.status || '',
        departments,
        supplies,
        ammo,
        crewAssignedTotal: departments.reduce((s, d) => s + d.assignedTotal, 0)
      });
    }

    context.locations = locations;
    // Ship-type locations only, for the Logistics ship-supplies section.
    context.shipLocations = locations;
  }

  /**
   * Resolve MTOE unit boxes: linked equipment actors + assigned troop counts.
   */
  _prepareMTOE(context) {
    const stored = this.actor.system.mtoe || [];
    const boxes = [];

    for (const box of stored) {
      const units = (box.unitActorIds || []).map(id => {
        const actor = game.actors.get(id);
        if (!actor) return { id, exists: false, name: 'Missing Unit', img: 'icons/svg/hazard.svg', typeLabel: 'Missing' };
        return {
          id: actor.id,
          exists: true,
          name: actor.name,
          img: actor.img,
          typeLabel: UNIT_ACTOR_TYPES[actor.type] || 'Unit'
        };
      });

      const troops = TROOP_TYPES.map(t => ({
        key: t.key,
        label: t.label,
        value: Number(box.troops?.[t.key]) || 0
      }));
      const troopTotal = troops.reduce((s, t) => s + t.value, 0);

      boxes.push({
        id: box.id,
        name: box.name || 'Unit',
        status: box.status || '',
        units,
        troops,
        troopTotal
      });
    }

    context.mtoe = boxes;
  }

  /**
   * Organize equipment items for the Assets tab (item-based, unchanged).
   */
  _prepareAssets(context) {
    const companyAssets = {
      weapon: [], armor: [], ammo: [], electronics: [],
      healthcare: [], prosthetics: [], drugpoison: [], fuel: []
    };
    for (const item of this.actor.items) {
      if (companyAssets.hasOwnProperty(item.type)) {
        companyAssets[item.type].push(item.toObject(false));
      }
    }
    companyAssets.hasItems = Object.entries(companyAssets)
      .some(([key, arr]) => key !== 'hasItems' && Array.isArray(arr) && arr.length > 0);
    context.companyAssets = companyAssets;
  }

  /* -------------------------------------------- */
  /*  Image action                                */
  /* -------------------------------------------- */

  static async _onEditImage(event, target) {
    const attr = target.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.document, attr);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: (path) => this.document.update({ [attr]: path })
    });
    return fp.browse();
  }

  /* -------------------------------------------- */
  /*  Render: tabs, drag/drop, delegated listeners */
  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    if (this.#boundElement !== this.element) {
      this._activateSheetListeners($(this.element));
      this.#boundElement = this.element;
    }
    this._applyActiveTab();
    this.#dragDrop.forEach((d) => d.bind(this.element));
  }

  /** Apply/restore the active tab and (re)bind tab clicks. */
  _applyActiveTab() {
    const navs = this.element.querySelectorAll(".sheet-tabs .item[data-tab]");
    const bodies = this.element.querySelectorAll(".sheet-body .tab[data-tab]");
    if (!navs.length || !bodies.length) return;

    if (!this.#activeTab || ![...bodies].some(b => b.dataset.tab === this.#activeTab)) {
      this.#activeTab = bodies[0].dataset.tab;
    }
    for (const n of navs) {
      n.classList.toggle("active", n.dataset.tab === this.#activeTab);
      n.onclick = (ev) => { ev.preventDefault(); this.#activeTab = n.dataset.tab; this._applyActiveTab(); };
    }
    for (const b of bodies) {
      b.classList.toggle("active", b.dataset.tab === this.#activeTab);
    }
  }

  /* -------------------------------------------- */
  /*  Drag and Drop                               */
  /* -------------------------------------------- */

  #createDragDropHandlers() {
    return this.options.dragDrop.map((d) => {
      d.permissions = {
        dragstart: () => this.isEditable,
        drop: () => this.isEditable
      };
      d.callbacks = {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this)
      };
      return new foundry.applications.ux.DragDrop.implementation(d);
    });
  }

  _onDragStart(event) {
    const el = event.currentTarget;
    const itemId = el.dataset.itemId || el.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.actor.items.get(itemId) : null;
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
  }

  _onDragOver(event) {}

  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const allowed = Hooks.call("dropActorSheetData", this.actor, this, data);
    if (allowed === false) return;
    switch (data.type) {
      case "Item": return this._onDropItem(event, data);
      case "Actor": return this._onDropActor(event, data);
      case "ActiveEffect": return this._onDropActiveEffect?.(event, data);
      case "Folder": return this._onDropFolder?.(event, data);
    }
  }

  /** @override */
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;
    if (this.actor.uuid === item.parent?.uuid) return false;

    // Only equipment item types (Assets tab) are stored on the company now.
    const allowedTypes = ['weapon', 'armor', 'ammo', 'electronics',
      'healthcare', 'prosthetics', 'drugpoison', 'fuel'];
    if (!allowedTypes.includes(item.type)) {
      ui.notifications.warn("Only equipment items can be added to the company (Assets tab).");
      return false;
    }
    const created = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
    this.render(false);
    return created;
  }

  /** @override */
  async _onDropActor(event, data) {
    if (!this.isEditable) return false;
    const actor = await Actor.implementation.fromDropData(data);
    if (!actor) return false;

    // Location actors → Locations list.
    if (LOCATION_ACTOR_TYPES.hasOwnProperty(actor.type)) {
      const locations = foundry.utils.deepClone(this.actor.system.locations || []);
      if (locations.some(l => l.actorId === actor.id)) {
        ui.notifications.warn(`${actor.name} is already a company location.`);
        return false;
      }
      locations.push({
        id: foundry.utils.randomID(),
        actorId: actor.id,
        status: '',
        departments: [],
        supplies: this._blankShipSupplies()
      });
      await this.actor.update({ 'system.locations': locations });
      ui.notifications.info(`${actor.name} added as a company location.`);
      return false;
    }

    // Unit actors → the MTOE box they were dropped onto.
    if (UNIT_ACTOR_TYPES.hasOwnProperty(actor.type)) {
      const boxEl = event.target.closest('.mtoe-box[data-box-id]');
      if (!boxEl) {
        ui.notifications.warn("Drop unit actors onto a specific MTOE unit box. Create one first.");
        return false;
      }
      const boxId = boxEl.dataset.boxId;
      await this._updateBox(boxId, box => {
        if (!Array.isArray(box.unitActorIds)) box.unitActorIds = [];
        if (box.unitActorIds.includes(actor.id)) {
          ui.notifications.warn(`${actor.name} is already in this unit.`);
          return false;
        }
        box.unitActorIds.push(actor.id);
      });
      return false;
    }

    ui.notifications.warn("Drop Naval Ships / Installations on the Locations tab, and Mechs / Vehicles / Fighters / Battle Armor onto an MTOE unit box.");
    return false;
  }

  _blankShipSupplies() {
    const s = { ammo: [] };
    for (const f of SHIP_SUPPLY_FIELDS) s[f.key] = 0;
    return s;
  }

  /* -------------------------------------------- */
  /*  Array update helpers                         */
  /* -------------------------------------------- */

  async _updateLocation(locId, mutator) {
    const locations = foundry.utils.deepClone(this.actor.system.locations || []);
    const loc = locations.find(l => l.id === locId);
    if (!loc) return;
    if (mutator(loc) === false) return;
    await this.actor.update({ 'system.locations': locations });
  }

  async _updateBox(boxId, mutator) {
    const boxes = foundry.utils.deepClone(this.actor.system.mtoe || []);
    const box = boxes.find(b => b.id === boxId);
    if (!box) return;
    if (mutator(box) === false) return;
    await this.actor.update({ 'system.mtoe': boxes });
  }

  static _int(value) {
    return Math.max(0, parseInt(value) || 0);
  }

  /* -------------------------------------------- */
  /*  Listeners                                    */
  /* -------------------------------------------- */

  _activateSheetListeners(html) {
    if (!this.isEditable) return;

    // Assets (equipment items)
    html.on('click', '.item-edit', this._onItemEdit.bind(this));
    html.on('click', '.item-delete', this._onItemDelete.bind(this));

    // Finances
    html.on('click', '.cbills-add', this._onAddFunds.bind(this));
    html.on('click', '.cbills-remove', this._onRemoveFunds.bind(this));
    html.on('click', '.ledger-delete', this._onLedgerDelete.bind(this));
    html.on('click', '.pay-monthly-expenses', this._onPayMonthlyExpenses.bind(this));

    // Locations
    html.on('click', '.location-remove', this._onLocationRemove.bind(this));
    html.on('change', '.location-status', this._onLocationStatusChange.bind(this));
    html.on('click', '.add-department', this._onAddDepartment.bind(this));
    html.on('click', '.remove-department', this._onRemoveDepartment.bind(this));
    html.on('change', '.dept-name', this._onDeptNameChange.bind(this));
    html.on('change', '.dept-crew', this._onDeptCrewChange.bind(this));

    // Location (ship) supplies
    html.on('change', '.ship-supply', this._onShipSupplyChange.bind(this));
    html.on('click', '.add-ship-ammo', this._onAddShipAmmo.bind(this));
    html.on('click', '.remove-ship-ammo', this._onRemoveShipAmmo.bind(this));
    html.on('change', '.ship-ammo-field', this._onShipAmmoFieldChange.bind(this));

    // MTOE
    html.on('click', '.add-mtoe-box', this._onAddBox.bind(this));
    html.on('click', '.remove-mtoe-box', this._onRemoveBox.bind(this));
    html.on('change', '.mtoe-box-name', this._onBoxNameChange.bind(this));
    html.on('change', '.mtoe-box-status', this._onBoxStatusChange.bind(this));
    html.on('change', '.mtoe-troop', this._onBoxTroopChange.bind(this));
    html.on('click', '.mtoe-unit-remove', this._onBoxUnitRemove.bind(this));

    // Ground supplies (company-wide) ammo list
    html.on('click', '.add-ground-ammo', this._onAddGroundAmmo.bind(this));
    html.on('click', '.remove-ground-ammo', this._onRemoveGroundAmmo.bind(this));
    html.on('change', '.ground-ammo-field', this._onGroundAmmoFieldChange.bind(this));
  }

  /* -------------------------------------------- */
  /*  Location handlers                            */
  /* -------------------------------------------- */

  async _onLocationRemove(event) {
    event.preventDefault();
    const locId = event.currentTarget.dataset.locId;
    const locations = (this.actor.system.locations || []).filter(l => l.id !== locId);
    await this.actor.update({ 'system.locations': locations });
  }

  async _onLocationStatusChange(event) {
    const locId = event.currentTarget.dataset.locId;
    const value = event.currentTarget.value;
    await this._updateLocation(locId, loc => { loc.status = value; });
  }

  async _onAddDepartment(event) {
    event.preventDefault();
    const locId = event.currentTarget.dataset.locId;
    await this._updateLocation(locId, loc => {
      if (!Array.isArray(loc.departments)) loc.departments = [];
      loc.departments.push({
        id: foundry.utils.randomID(),
        name: 'New Department',
        required: { enlisted: 0, officers: 0, bayTechs: 0 },
        assigned: { enlisted: 0, officers: 0, bayTechs: 0 }
      });
    });
  }

  async _onRemoveDepartment(event) {
    event.preventDefault();
    const { locId, deptId } = event.currentTarget.dataset;
    await this._updateLocation(locId, loc => {
      loc.departments = (loc.departments || []).filter(d => d.id !== deptId);
    });
  }

  async _onDeptNameChange(event) {
    const { locId, deptId } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    await this._updateLocation(locId, loc => {
      const dept = (loc.departments || []).find(d => d.id === deptId);
      if (dept) dept.name = value;
    });
  }

  /** Change a department's required/assigned count for a crew type. */
  async _onDeptCrewChange(event) {
    const { locId, deptId, group, type } = event.currentTarget.dataset;
    const value = MechFoundryCompanySheet._int(event.currentTarget.value);
    await this._updateLocation(locId, loc => {
      const dept = (loc.departments || []).find(d => d.id === deptId);
      if (!dept) return;
      if (!dept[group]) dept[group] = {};
      dept[group][type] = value;
    });
  }

  /* -------------------------------------------- */
  /*  Ship supply handlers                         */
  /* -------------------------------------------- */

  async _onShipSupplyChange(event) {
    const { locId, key } = event.currentTarget.dataset;
    const value = MechFoundryCompanySheet._int(event.currentTarget.value);
    await this._updateLocation(locId, loc => {
      if (!loc.supplies) loc.supplies = this._blankShipSupplies();
      loc.supplies[key] = value;
    });
  }

  async _onAddShipAmmo(event) {
    event.preventDefault();
    const locId = event.currentTarget.dataset.locId;
    await this._updateLocation(locId, loc => {
      if (!loc.supplies) loc.supplies = this._blankShipSupplies();
      if (!Array.isArray(loc.supplies.ammo)) loc.supplies.ammo = [];
      loc.supplies.ammo.push({ id: foundry.utils.randomID(), name: '', value: 0 });
    });
  }

  async _onRemoveShipAmmo(event) {
    event.preventDefault();
    const { locId, ammoId } = event.currentTarget.dataset;
    await this._updateLocation(locId, loc => {
      if (loc.supplies?.ammo) loc.supplies.ammo = loc.supplies.ammo.filter(a => a.id !== ammoId);
    });
  }

  async _onShipAmmoFieldChange(event) {
    const { locId, ammoId, field } = event.currentTarget.dataset;
    const raw = event.currentTarget.value;
    await this._updateLocation(locId, loc => {
      const ammo = loc.supplies?.ammo?.find(a => a.id === ammoId);
      if (!ammo) return;
      ammo[field] = field === 'value' ? MechFoundryCompanySheet._int(raw) : raw;
    });
  }

  /* -------------------------------------------- */
  /*  MTOE handlers                                */
  /* -------------------------------------------- */

  async _onAddBox(event) {
    event.preventDefault();
    const boxes = foundry.utils.deepClone(this.actor.system.mtoe || []);
    boxes.push({
      id: foundry.utils.randomID(),
      name: 'New Unit',
      status: '',
      unitActorIds: [],
      troops: { infantry: 0, aeroPilots: 0, mechPilots: 0, vehicleCrew: 0, installationCrew: 0 }
    });
    await this.actor.update({ 'system.mtoe': boxes });
  }

  async _onRemoveBox(event) {
    event.preventDefault();
    const boxId = event.currentTarget.dataset.boxId;
    const boxes = (this.actor.system.mtoe || []).filter(b => b.id !== boxId);
    await this.actor.update({ 'system.mtoe': boxes });
  }

  async _onBoxNameChange(event) {
    const boxId = event.currentTarget.dataset.boxId;
    const value = event.currentTarget.value;
    await this._updateBox(boxId, box => { box.name = value; });
  }

  async _onBoxStatusChange(event) {
    const boxId = event.currentTarget.dataset.boxId;
    const value = event.currentTarget.value;
    await this._updateBox(boxId, box => { box.status = value; });
  }

  async _onBoxTroopChange(event) {
    const { boxId, type } = event.currentTarget.dataset;
    const value = MechFoundryCompanySheet._int(event.currentTarget.value);
    await this._updateBox(boxId, box => {
      if (!box.troops) box.troops = {};
      box.troops[type] = value;
    });
  }

  async _onBoxUnitRemove(event) {
    event.preventDefault();
    const { boxId, actorId } = event.currentTarget.dataset;
    await this._updateBox(boxId, box => {
      box.unitActorIds = (box.unitActorIds || []).filter(id => id !== actorId);
    });
  }

  /* -------------------------------------------- */
  /*  Ground supply ammo handlers                  */
  /* -------------------------------------------- */

  async _onAddGroundAmmo(event) {
    event.preventDefault();
    const ground = foundry.utils.deepClone(this.actor.system.groundSupplies || {});
    if (!Array.isArray(ground.ammo)) ground.ammo = [];
    ground.ammo.push({ id: foundry.utils.randomID(), name: '', usedBy: '', value: 0 });
    await this.actor.update({ 'system.groundSupplies': ground });
  }

  async _onRemoveGroundAmmo(event) {
    event.preventDefault();
    const ammoId = event.currentTarget.dataset.ammoId;
    const ground = foundry.utils.deepClone(this.actor.system.groundSupplies || {});
    ground.ammo = (ground.ammo || []).filter(a => a.id !== ammoId);
    await this.actor.update({ 'system.groundSupplies': ground });
  }

  async _onGroundAmmoFieldChange(event) {
    const { ammoId, field } = event.currentTarget.dataset;
    const raw = event.currentTarget.value;
    const ground = foundry.utils.deepClone(this.actor.system.groundSupplies || {});
    const ammo = (ground.ammo || []).find(a => a.id === ammoId);
    if (!ammo) return;
    ammo[field] = field === 'value' ? MechFoundryCompanySheet._int(raw) : raw;
    await this.actor.update({ 'system.groundSupplies': ground });
  }

  /* -------------------------------------------- */
  /*  C-Bills / Fund Management                    */
  /* -------------------------------------------- */

  async _processTransaction(amount, type, reason) {
    const currentCBills = this.actor.system.cbills || 0;
    const newCBills = type === 'add' ? currentCBills + amount : currentCBills - amount;
    if (newCBills < 0) {
      ui.notifications.warn("Insufficient funds for this transaction.");
      return;
    }
    const ledger = foundry.utils.deepClone(this.actor.system.financialLedger || []);
    ledger.unshift({
      id: foundry.utils.randomID(),
      date: new Date().toISOString(),
      submittedBy: game.user.name,
      amount, type,
      reason: reason || "",
      balance: newCBills
    });
    await this.actor.update({ 'system.cbills': newCBills, 'system.financialLedger': ledger });
  }

  /** Read a named field's value from the form owning the clicked dialog button. */
  static _fieldValue(button, name) {
    return button?.form?.elements?.[name]?.value ?? '';
  }

  async _onAddFunds(event) {
    event.preventDefault();
    const content = `
      <div class="form-group">
        <label>Amount (C-Bills)</label>
        <input type="number" name="amount" value="0" min="0" autofocus />
      </div>
      <div class="form-group">
        <label>Reason</label>
        <input type="text" name="reason" value="" placeholder="Reason for deposit" />
      </div>`;
    const result = await DialogV2.wait({
      window: { title: "Add Funds", icon: "fa-solid fa-coins" },
      content,
      buttons: [
        {
          action: "confirm", label: "Confirm", icon: "fa-solid fa-check", default: true,
          callback: (event, button) => ({
            amount: MechFoundryCompanySheet._fieldValue(button, 'amount'),
            reason: MechFoundryCompanySheet._fieldValue(button, 'reason')
          })
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!result || result === "cancel") return;
    const amount = Math.abs(parseInt(result.amount) || 0);
    if (amount <= 0) return;
    await this._processTransaction(amount, 'add', result.reason || "");
  }

  async _onRemoveFunds(event) {
    event.preventDefault();
    const currentCBills = this.actor.system.cbills || 0;
    const content = `
      <div class="form-group">
        <label>Amount (C-Bills) — Current balance: ${currentCBills.toLocaleString()}</label>
        <input type="number" name="amount" value="0" min="0" autofocus />
      </div>
      <div class="form-group">
        <label>Reason</label>
        <input type="text" name="reason" value="" placeholder="Reason for withdrawal" />
      </div>`;
    const result = await DialogV2.wait({
      window: { title: "Remove Funds", icon: "fa-solid fa-coins" },
      content,
      buttons: [
        {
          action: "confirm", label: "Confirm", icon: "fa-solid fa-check", default: true,
          callback: (event, button) => ({
            amount: MechFoundryCompanySheet._fieldValue(button, 'amount'),
            reason: MechFoundryCompanySheet._fieldValue(button, 'reason')
          })
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!result || result === "cancel") return;
    const amount = Math.abs(parseInt(result.amount) || 0);
    if (amount <= 0) return;
    await this._processTransaction(amount, 'remove', result.reason || "");
  }

  async _onPayMonthlyExpenses(event) {
    event.preventDefault();
    const totalExpenses = Number(this.actor.system.monthlyExpenses) || 0;
    if (totalExpenses <= 0) {
      ui.notifications.warn("Set a monthly expenses amount first (Status tab).");
      return;
    }
    const confirmed = await DialogV2.confirm({
      window: { title: "Pay Monthly Expenses", icon: "fa-solid fa-coins" },
      content: `<p>Deduct <strong>${totalExpenses.toLocaleString()} C-Bills</strong> for monthly expenses?</p>`,
      rejectClose: false,
      modal: true
    });
    if (confirmed) await this._processTransaction(totalExpenses, 'remove', 'Monthly Expenses');
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
  /*  Item Event Handlers (Assets)                */
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
}
