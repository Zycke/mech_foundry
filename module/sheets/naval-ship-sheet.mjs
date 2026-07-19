import { DEPARTMENT_TYPES } from "./company-sheet.mjs";
import { BAY_COMPONENT_TYPES, bayComponentDef, cargoCapacity, cargoUsed } from "../helpers/cargo.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const ARC_FIELDS = [
  { key: 'nose', label: 'Nose' },
  { key: 'aft', label: 'Aft' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' }
];

const MOVEMENT_FIELDS = [
  { key: 'safeThrust', label: 'Safe Thrust' },
  { key: 'maxThrust', label: 'Max Thrust' },
  { key: 'initialFuel', label: 'Initial Fuel' },
  { key: 'currentFuel', label: 'Current Fuel' },
  { key: 'tonsBurnDay', label: 'Tons / Burn Day' },
  { key: 'fighters', label: 'Fighters' },
  { key: 'marinePoints', label: 'Marine Points' },
  { key: 'heatSinks', label: 'Heat Sinks' }
];

const WEAPON_COLUMNS = [
  { key: 'heat', label: 'Heat' },
  { key: 'arc', label: 'Arc' },
  { key: 'short', label: 'Short' },
  { key: 'medium', label: 'Medium' },
  { key: 'long', label: 'Long' },
  { key: 'ext', label: 'Ext.' }
];

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
      movementFields: MOVEMENT_FIELDS,
      weaponColumns: WEAPON_COLUMNS,
      trackTurns: TRACK_TURNS.map((key, i) => ({ key, num: i + 1 })),
      critTable: CRIT_TABLE,
      departmentTypes: DEPARTMENT_TYPES
    };

    context.weapons = (system.weapons || []).map(w => ({ ...w }));

    let totalPrimary = 0, totalOfficers = 0;
    context.departments = (system.departments || []).map(d => {
      const typeDef = DEPARTMENT_TYPES.find(t => t.key === d.type) || DEPARTMENT_TYPES[0];
      const primaryLabel = typeDef.primary === 'bayTechs' ? 'Bay Techs' : 'Enlisted';
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

    // Bays + components
    context.bayComponentTypes = BAY_COMPONENT_TYPES;
    context.bays = (system.bays || []).map(bay => ({
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
    html.on('change', '.weapon-field', this._onWeaponFieldChange.bind(this));
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
    const bays = foundry.utils.deepClone(this.actor.system.bays || []);
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
    const weapons = foundry.utils.deepClone(this.actor.system.weapons || []);
    weapons.push({ id: foundry.utils.randomID(), name: '', heat: '', arc: '', short: '', medium: '', long: '', ext: '' });
    await this.actor.update({ 'system.weapons': weapons });
  }

  async _onRemoveWeapon(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    const weapons = (this.actor.system.weapons || []).filter(w => w.id !== id);
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
