import { DEPARTMENT_TYPES } from "./company-sheet.mjs";
import {
  BAY_COMPONENT_TYPES, bayComponentDef, bayList, cargoCapacity, cargoUsed,
  VEHICLE_CUBICLE_TYPES, shipCubiclesByVehicle, mtoeVehiclesAtShip,
  SHIP_SUPPLY_FIELDS, GROUND_SUPPLY_GROUPS, blankCargoSupplies
} from "../helpers/cargo.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const ARC_FIELDS = [
  { key: 'nose', label: 'Nose' },
  { key: 'aft', label: 'Aft' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' }
];

// Movement & Vitals arranged as columns of stacked pairs.
const MOVEMENT_COLUMNS = [
  [{ key: 'safeThrust', label: 'Safe Thrust' }, { key: 'maxThrust', label: 'Max Thrust' }],
  [{ key: 'currentFuel', label: 'Current Fuel' }, { key: 'initialFuel', label: 'Initial Fuel' }],
  [{ key: 'fighters', label: 'Fighters' }, { key: 'tonsBurnDay', label: 'Tons / Burn Day' }],
  [{ key: 'heatSinks', label: 'Heat Sinks' }]
];

const WEAPON_COLUMNS = [
  { key: 'heat', label: 'Heat' },
  { key: 'short', label: 'Short' },
  { key: 'medium', label: 'Medium' },
  { key: 'long', label: 'Long' },
  { key: 'ext', label: 'Ext.' }
];

/** Ship classes and the firing arcs each provides (Total Warfare / StratOps). */
const SHIP_TYPES = [
  { key: 'dropship_spheroid', label: 'DropShip (Spheroid)' },
  { key: 'dropship_aerodyne', label: 'DropShip (Aerodyne)' },
  { key: 'warship', label: 'WarShip' },
  { key: 'jumpship', label: 'JumpShip' }
];

const SHIP_ARCS = {
  dropship_spheroid: [
    { key: 'nose', label: 'Nose' }, { key: 'aft', label: 'Aft' },
    { key: 'leftFront', label: 'Left Front' }, { key: 'rightFront', label: 'Right Front' },
    { key: 'leftRear', label: 'Left Rear' }, { key: 'rightRear', label: 'Right Rear' }
  ],
  dropship_aerodyne: [
    { key: 'nose', label: 'Nose' }, { key: 'aft', label: 'Aft' },
    { key: 'lwFront', label: 'Left Wing Front' }, { key: 'rwFront', label: 'Right Wing Front' },
    { key: 'lwRear', label: 'Left Wing Rear' }, { key: 'rwRear', label: 'Right Wing Rear' }
  ],
  warship: [
    { key: 'nose', label: 'Nose' }, { key: 'aft', label: 'Aft' },
    { key: 'lwFront', label: 'Left Wing Front' }, { key: 'rwFront', label: 'Right Wing Front' },
    { key: 'lwRear', label: 'Left Wing Rear' }, { key: 'rwRear', label: 'Right Wing Rear' },
    { key: 'leftBroadside', label: 'Left Broadside' }, { key: 'rightBroadside', label: 'Right Broadside' }
  ],
  jumpship: [
    { key: 'nose', label: 'Nose' }, { key: 'aft', label: 'Aft' },
    { key: 'leftFront', label: 'Left Front' }, { key: 'rightFront', label: 'Right Front' },
    { key: 'leftRear', label: 'Left Rear' }, { key: 'rightRear', label: 'Right Rear' }
  ]
};

function shipArcs(shipType) {
  return SHIP_ARCS[shipType] || SHIP_ARCS.dropship_spheroid;
}

const TRACK_TURNS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'];

/**
 * Critical-hit reference (BattleSpace Dropship Record Sheet). Static game aid.
 */
const CRIT_TABLE = [
  ['Transfer', 'KF Boom', 'Dock. Coll.', 'Radar', 'Lndg. Gear', 'Nav. Sys.'],
  ['FL WP', 'Nose WP', 'FR WP', 'AL WP', 'Aft WP', 'AR WP'],
  ['Computer', 'Computer', 'Bridge', 'Bridge', 'Left Thruster', 'Right Thruster'],
  ['Bay Door', 'Bay Door', 'Bay Door', 'Bay Door', 'Bay Door', 'Life Support'],
  ['Bay 1', 'Bay 1', 'Bay 2', 'Bay 2', 'Bay 3', 'CIC']
];

/**
 * Naval Ship Actor Sheet (ApplicationV2, Foundry v14).
 *
 * Modelled on the BattleSpace Dropship Record Sheet: armor arcs, movement, a
 * per-turn thrust/velocity track, a weapons bay table, bay contents, and a
 * critical-hit reference. The "Crew & Departments" tab defines departments and
 * their crew requirements; the company Locations tab reads those and handles
 * the actual crew assignment.
 *
 * @extends {ActorSheetV2}
 */
export class MechFoundryNavalShipSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  #activeTab = null;
  #boundElement = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "naval-ship-sheet"],
    position: { width: 860, height: 780 },
    tag: "form",
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
    actions: {
      editImage: MechFoundryNavalShipSheet._onEditImage
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: "systems/mech-foundry/templates/actor/actor-naval_ship-sheet.hbs",
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
      arcFields: ARC_FIELDS,
      movementColumns: MOVEMENT_COLUMNS,
      weaponColumns: WEAPON_COLUMNS,
      trackTurns: TRACK_TURNS.map((key, i) => ({ key, num: i + 1 })),
      critTable: CRIT_TABLE,
      departmentTypes: DEPARTMENT_TYPES
    };

    context.weapons = (system.weapons || []).map(w => ({ ...w }));

    // Ship class + firing arcs. Weapons are grouped into per-arc panels; any
    // weapon whose arc isn't in the current class falls into an "Unassigned" panel.
    const shipType = system.shipType || 'dropship_spheroid';
    const arcs = shipArcs(shipType);
    context.shipTypes = SHIP_TYPES;
    context.shipType = shipType;
    const byArc = new Map(arcs.map(a => [a.key, []]));
    const orphans = [];
    for (const w of context.weapons) {
      if (byArc.has(w.arc)) byArc.get(w.arc).push(w);
      else orphans.push(w);
    }
    context.weaponArcs = arcs.map(a => ({ key: a.key, label: a.label, weapons: byArc.get(a.key) }));
    context.weaponOrphans = orphans;
    context.allArcs = arcs;

    let totalPrimary = 0, totalOfficers = 0;
    context.departments = (system.departments || []).map(d => {
      const typeDef = DEPARTMENT_TYPES.find(t => t.key === d.type) || DEPARTMENT_TYPES[0];
      const primaryLabel = { gunners: 'Gunners', bayTechs: 'Bay Techs', officers: 'Officers' }[typeDef.primary] || 'Enlisted';
      const reqPrimary = Number(d.requiredPrimary) || 0;
      const reqOfficers = Number(d.requiredOfficers) || 0;
      totalPrimary += reqPrimary;
      totalOfficers += reqOfficers;
      return {
        id: d.id, type: typeDef.key, typeLabel: typeDef.label,
        primaryLabel, requiredPrimary: reqPrimary, requiredOfficers: reqOfficers
      };
    });
    context.totalReqPrimary = totalPrimary;
    context.totalReqOfficers = totalOfficers;

    // Bays + components. Free cubicles are auto-filled by MTOE units based here.
    context.bayComponentTypes = BAY_COMPONENT_TYPES;

    // Build a map of compId → MTOE-derived occupant for empty cubicles.
    const cubs = shipCubiclesByVehicle(this.actor);
    const mtoe = mtoeVehiclesAtShip(this.actor.id);
    const mtoeByComp = {};
    for (const vt of Object.keys(cubs)) {
      const queue = [...(mtoe[vt] || [])];
      for (const cub of cubs[vt]) {
        if (cub.manualUnitId) continue; // manual assignment keeps the slot
        const occ = queue.shift();
        if (occ) mtoeByComp[cub.compId] = occ;
      }
    }

    context.bays = bayList(this.actor).map(bay => ({
      id: bay.id,
      name: bay.name || 'Bay',
      components: (bay.components || []).map(c => {
        const def = bayComponentDef(c.type) || {};
        const comp = {
          id: c.id,
          type: c.type,
          label: def.label || c.type,
          assignable: !!def.unitType,
          hasSquadSize: !!def.hasSquadSize,
          hasTonnage: !!def.hasTonnage
        };
        if (def.unitType) {
          const assigned = c.unitId ? game.actors.get(c.unitId) : null;
          comp.unitId = c.unitId || '';
          comp.assignedName = assigned?.name || '';
          comp.assignedExists = !!assigned;
          comp.options = game.actors
            .filter(a => a.type === def.unitType)
            .map(a => ({ id: a.id, name: a.name, selected: a.id === c.unitId }));
          // MTOE occupant only when no manual unit is set.
          const occ = !c.unitId ? mtoeByComp[c.id] : null;
          if (occ) {
            comp.mtoe = { actorId: occ.actorId, name: occ.name, unitName: occ.unitName, status: occ.status };
          }
        }
        if (def.hasSquadSize) comp.squadSize = Number(c.squadSize) || 0;
        if (def.hasTonnage) comp.tonnage = Number(c.tonnage) || 0;
        return comp;
      })
    }));
    const cap = cargoCapacity(this.actor);
    const used = cargoUsed(this.actor);
    context.cargoCapacity = cap === Infinity ? '∞' : cap;
    context.cargoUsed = used;
    context.cargoFree = cap === Infinity ? '∞' : Math.max(0, cap - used);

    // Read-only supply manifest (managed from the company Logistics tab).
    const cs = system.cargoSupplies || blankCargoSupplies();
    context.logiShip = SHIP_SUPPLY_FIELDS.map(f => ({ label: f.label, value: Number(cs.ship?.[f.key]) || 0 }));
    context.logiGround = GROUND_SUPPLY_GROUPS.map(g => ({
      label: g.label,
      fields: g.fields.map(f => ({ label: f.label, value: Number(cs.ground?.[f.key]) || 0 }))
    }));
    context.logiShipAmmo = (cs.shipAmmo || []).map(a => ({ name: a.name || '—', value: Number(a.value) || 0 }));
    context.logiGroundAmmo = (cs.groundAmmo || []).map(a => ({ name: a.name || '—', usedBy: a.usedBy || '', value: Number(a.value) || 0 }));

    context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.biography ?? "",
      { secrets: this.document.isOwner, relativeTo: this.actor }
    );

    return context;
  }

  /* -------------------------------------------- */

  static async _onEditImage(event, target) {
    const attr = target.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.document, attr);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image", current,
      callback: (path) => this.document.update({ [attr]: path })
    });
    return fp.browse();
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    if (this.#boundElement !== this.element) {
      this._activateListeners($(this.element));
      this.#boundElement = this.element;
    }
    this._applyActiveTab();
  }

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
    for (const b of bodies) b.classList.toggle("active", b.dataset.tab === this.#activeTab);
  }

  /* -------------------------------------------- */

  _activateListeners(html) {
    if (!this.isEditable) return;
    html.on('click', '.add-weapon', this._onAddWeapon.bind(this));
    html.on('click', '.remove-weapon', this._onRemoveWeapon.bind(this));
    html.on('click', '.duplicate-weapon', this._onDuplicateWeapon.bind(this));
    html.on('change', '.weapon-field', this._onWeaponFieldChange.bind(this));
    html.on('change', '.weapon-arc', this._onWeaponArcChange.bind(this));
    // Weapon drag between arc panels.
    html.on('dragstart', '.ship-weapon-row', this._onWeaponDragStart.bind(this));
    html.on('dragover', '.arc-panel', (ev) => { ev.preventDefault(); ev.currentTarget.classList.add('drag-over'); });
    html.on('dragleave', '.arc-panel', (ev) => ev.currentTarget.classList.remove('drag-over'));
    html.on('drop', '.arc-panel', this._onWeaponDrop.bind(this));
    // Bays quick-add.
    html.on('click', '.quick-add-component', this._onQuickAddComponent.bind(this));
    html.on('click', '.add-ship-dept', this._onAddDept.bind(this));
    html.on('click', '.remove-ship-dept', this._onRemoveDept.bind(this));
    html.on('change', '.ship-dept-type', this._onDeptTypeChange.bind(this));
    html.on('change', '.ship-dept-req', this._onDeptReqChange.bind(this));
    // Bays
    html.on('click', '.add-bay', this._onAddBay.bind(this));
    html.on('click', '.remove-bay', this._onRemoveBay.bind(this));
    html.on('change', '.bay-name', this._onBayNameChange.bind(this));
    html.on('change', '.add-component', this._onAddComponent.bind(this));
    html.on('click', '.remove-component', this._onRemoveComponent.bind(this));
    html.on('change', '.component-unit', this._onComponentUnitChange.bind(this));
    html.on('change', '.component-squad', this._onComponentNumChange.bind(this));
    html.on('change', '.component-tonnage', this._onComponentNumChange.bind(this));
    html.on('click', '.component-open', this._onComponentOpen.bind(this));
  }

  /* -------------------------------------------- */
  /*  Bays                                        */
  /* -------------------------------------------- */

  async _updateBays(mutator) {
    const bays = foundry.utils.deepClone(bayList(this.actor));
    if (mutator(bays) === false) return;
    await this.actor.update({ 'system.bays': bays });
  }

  async _onAddBay(event) {
    event.preventDefault();
    await this._updateBays(bays => {
      bays.push({ id: foundry.utils.randomID(), name: `Bay ${bays.length + 1}`, components: [] });
    });
  }

  async _onRemoveBay(event) {
    event.preventDefault();
    const bayId = event.currentTarget.dataset.bayId;
    await this._updateBays(bays => {
      const i = bays.findIndex(b => b.id === bayId);
      if (i >= 0) bays.splice(i, 1);
    });
  }

  async _onBayNameChange(event) {
    const bayId = event.currentTarget.dataset.bayId;
    const value = event.currentTarget.value;
    await this._updateBays(bays => {
      const bay = bays.find(b => b.id === bayId);
      if (bay) bay.name = value;
    });
  }

  /** Fired when a bay's "add component" dropdown is changed to a real type. */
  async _onAddComponent(event) {
    const bayId = event.currentTarget.dataset.bayId;
    const type = event.currentTarget.value;
    if (!type) return;
    if (!BAY_COMPONENT_TYPES.some(t => t.key === type)) return;
    await this._updateBays(bays => {
      const bay = bays.find(b => b.id === bayId);
      if (!bay) return false;
      if (!Array.isArray(bay.components)) bay.components = [];
      bay.components.push({ id: foundry.utils.randomID(), type, unitId: '', squadSize: 0, tonnage: 0 });
    });
  }

  /** Quick-add a component of a specific type via a per-bay button. */
  async _onQuickAddComponent(event) {
    event.preventDefault();
    const { bayId, type } = event.currentTarget.dataset;
    if (!BAY_COMPONENT_TYPES.some(t => t.key === type)) return;
    await this._updateBays(bays => {
      const bay = bays.find(b => b.id === bayId);
      if (!bay) return false;
      if (!Array.isArray(bay.components)) bay.components = [];
      bay.components.push({ id: foundry.utils.randomID(), type, unitId: '', squadSize: 0, tonnage: 0 });
    });
  }

  async _onRemoveComponent(event) {
    event.preventDefault();
    const { bayId, componentId } = event.currentTarget.dataset;
    await this._updateBays(bays => {
      const bay = bays.find(b => b.id === bayId);
      if (bay) bay.components = (bay.components || []).filter(c => c.id !== componentId);
    });
  }

  async _onComponentUnitChange(event) {
    const { bayId, componentId } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    await this._updateBays(bays => {
      const c = bays.find(b => b.id === bayId)?.components?.find(x => x.id === componentId);
      if (c) c.unitId = value;
    });
  }

  async _onComponentNumChange(event) {
    const { bayId, componentId, field } = event.currentTarget.dataset;
    const value = Math.max(0, parseInt(event.currentTarget.value) || 0);
    await this._updateBays(bays => {
      const c = bays.find(b => b.id === bayId)?.components?.find(x => x.id === componentId);
      if (c) c[field] = value;
    });
  }

  _onComponentOpen(event) {
    event.preventDefault();
    const actorId = event.currentTarget.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (actor) actor.sheet.render(true);
  }

  /* -------------------------------------------- */
  /*  Weapons                                     */
  /* -------------------------------------------- */

  async _onAddWeapon(event) {
    event.preventDefault();
    const arc = event.currentTarget.dataset.arc || '';
    const weapons = foundry.utils.deepClone(this.actor.system.weapons || []);
    weapons.push({ id: foundry.utils.randomID(), name: '', heat: '', arc, short: '', medium: '', long: '', ext: '' });
    await this.actor.update({ 'system.weapons': weapons });
  }

  async _onRemoveWeapon(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    const weapons = (this.actor.system.weapons || []).filter(w => w.id !== id);
    await this.actor.update({ 'system.weapons': weapons });
  }

  /** Duplicate a weapon (new id) right after the original, in the same arc. */
  async _onDuplicateWeapon(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    const weapons = foundry.utils.deepClone(this.actor.system.weapons || []);
    const i = weapons.findIndex(w => w.id === id);
    if (i < 0) return;
    const copy = foundry.utils.deepClone(weapons[i]);
    copy.id = foundry.utils.randomID();
    weapons.splice(i + 1, 0, copy);
    await this.actor.update({ 'system.weapons': weapons });
  }

  async _onWeaponFieldChange(event) {
    const { weaponId, field } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    const weapons = foundry.utils.deepClone(this.actor.system.weapons || []);
    const w = weapons.find(x => x.id === weaponId);
    if (!w) return;
    w[field] = value;
    await this.actor.update({ 'system.weapons': weapons });
  }

  /** Move a weapon to another arc via the per-weapon arc dropdown. */
  async _onWeaponArcChange(event) {
    const weaponId = event.currentTarget.dataset.weaponId;
    const arc = event.currentTarget.value;
    const weapons = foundry.utils.deepClone(this.actor.system.weapons || []);
    const w = weapons.find(x => x.id === weaponId);
    if (!w) return;
    w.arc = arc;
    await this.actor.update({ 'system.weapons': weapons });
  }

  _onWeaponDragStart(event) {
    const id = event.currentTarget.dataset.weaponId;
    const dt = event.originalEvent?.dataTransfer || event.dataTransfer;
    dt?.setData('text/plain', JSON.stringify({ mfWeaponId: id }));
    if (dt) dt.effectAllowed = 'move';
  }

  /** Drop a dragged weapon onto an arc panel → set its arc. */
  async _onWeaponDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    const arc = event.currentTarget.dataset.arc;
    const dt = event.originalEvent?.dataTransfer || event.dataTransfer;
    let data;
    try { data = JSON.parse(dt?.getData('text/plain') || '{}'); } catch { return; }
    if (!data.mfWeaponId || arc === undefined) return;
    const weapons = foundry.utils.deepClone(this.actor.system.weapons || []);
    const w = weapons.find(x => x.id === data.mfWeaponId);
    if (!w || w.arc === arc) return;
    w.arc = arc;
    await this.actor.update({ 'system.weapons': weapons });
  }

  /* -------------------------------------------- */
  /*  Departments                                 */
  /* -------------------------------------------- */

  async _onAddDept(event) {
    event.preventDefault();
    const departments = foundry.utils.deepClone(this.actor.system.departments || []);
    departments.push({ id: foundry.utils.randomID(), type: 'gunnery', requiredPrimary: 0, requiredOfficers: 0 });
    await this.actor.update({ 'system.departments': departments });
  }

  async _onRemoveDept(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.deptId;
    const departments = (this.actor.system.departments || []).filter(d => d.id !== id);
    await this.actor.update({ 'system.departments': departments });
  }

  async _onDeptTypeChange(event) {
    const id = event.currentTarget.dataset.deptId;
    const value = event.currentTarget.value;
    const departments = foundry.utils.deepClone(this.actor.system.departments || []);
    const d = departments.find(x => x.id === id);
    if (!d) return;
    d.type = value;
    await this.actor.update({ 'system.departments': departments });
  }

  async _onDeptReqChange(event) {
    const { deptId, field } = event.currentTarget.dataset;
    const value = Math.max(0, parseInt(event.currentTarget.value) || 0);
    const departments = foundry.utils.deepClone(this.actor.system.departments || []);
    const d = departments.find(x => x.id === deptId);
    if (!d) return;
    d[field] = value;
    await this.actor.update({ 'system.departments': departments });
  }
}
