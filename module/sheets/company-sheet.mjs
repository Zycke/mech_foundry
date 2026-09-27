import { DiceMechanics } from '../helpers/dice-mechanics.mjs';
import {
  SHIP_SUPPLY_FIELDS, GROUND_SUPPLY_GROUPS, GROUND_SUPPLY_FIELDS,
  cargoCapacity, cargoUsed, blankCargoSupplies,
  canFitBoxAtShip, freeCubicles
} from '../helpers/cargo.mjs';

/* -------------------------------------------- */
/*  Constants                                    */
/* -------------------------------------------- */

/** Ship crew types (numeric company-wide pools staffed into departments). */
/** Ship's Company crew types (permanent ship crew; staff departments, affect ship rolls). */
const CREW_TYPES = [
  { key: 'gunners', label: 'Gunners' },
  { key: 'enlisted', label: 'Enlisted' },
  { key: 'officers', label: 'Officers' },
  { key: 'bayTechs', label: 'Bay Techs' }
];

/** Embarked personnel (passengers; assigned into MTOE units, do NOT affect ship rolls). */
const TROOP_TYPES = [
  { key: 'infantry', label: 'Infantry' },
  { key: 'aeroPilots', label: 'Aerospace Pilots' },
  { key: 'mechPilots', label: 'Mech Pilots' },
  { key: 'vehicleCrew', label: 'Vehicle Crew' },
  { key: 'installationCrew', label: 'Installation Crew' }
];

const ALL_PERSONNEL_TYPES = [...CREW_TYPES, ...TROOP_TYPES];

/**
 * Base monthly salary per personnel type, in C-Bills, adapted from the
 * A Time of War Base Salary Table (p.335). Generic pool types are mapped to the
 * closest table role; adjust here to retune. Quality/Expertise multipliers are
 * not applied to the pool total (veterancy is tracked per department/unit).
 */
const BASE_SALARY = {
  gunners: 1000,           // trained gunnery crew
  enlisted: 1000,          // DropShip Crewman
  officers: 1500,          // senior / commissioned
  bayTechs: 800,           // 'Mech/Fighter Technician
  infantry: 750,           // Regular Infantry
  aeroPilots: 1500,        // Aerospace Pilot
  mechPilots: 1500,        // MechWarrior
  vehicleCrew: 900,        // Vehicle/Artillery Crewman
  installationCrew: 750    // generic garrison crew
};

/** Ship / installation department types and the primary crew pool each draws. */
export const DEPARTMENT_TYPES = [
  { key: 'gunnery', label: 'Gunnery', primary: 'gunners' },
  { key: 'engineering', label: 'Engineering', primary: 'enlisted' },
  { key: 'medical', label: 'Medical', primary: 'enlisted' },
  { key: 'boatswain', label: 'Boatswain', primary: 'enlisted' },
  { key: 'bayMaintenance', label: 'Bay Maintenance', primary: 'bayTechs' }
];

/** Veterancy tiers (index 0..3) with roll modifiers. 100 XP per tier. */
const VETERANCY = [
  { label: 'Green', mod: -1 },
  { label: 'Regular', mod: 0 },
  { label: 'Veteran', mod: 1 },
  { label: 'Elite', mod: 2 }
];
const XP_PER_LEVEL = 100;

/** Actor types that can be linked to the company as Locations. */
const LOCATION_ACTOR_TYPES = {
  naval_ship: 'Naval Ship',
  installation: 'Installation'
};

/** Each troop type's matching combat vehicle actor type (null = no vehicle). */
const TROOP_VEHICLE = {
  infantry: 'battle_armor',
  aeroPilots: 'aerospace_fighter',
  mechPilots: 'mech',
  vehicleCrew: 'ground_vehicle',
  installationCrew: null
};

const UNIT_ACTOR_TYPE_LABELS = {
  mech: 'Mech',
  ground_vehicle: 'Ground Vehicle',
  aerospace_fighter: 'Aerospace Fighter',
  battle_armor: 'Battle Armor'
};

/**
 * MTOE block types. Each unit block is ONE type, which fixes its embarked crew
 * type and its matching combat-vehicle actor type. Infantry blocks also carry a
 * loadout (one armor type + weapons). Installation blocks have no vehicle.
 */
const BLOCK_TYPES = [
  { key: 'mech', label: 'Mech', troop: 'mechPilots', vehicle: 'mech', vehicleLabel: 'Mechs' },
  { key: 'aerospace', label: 'Aerospace', troop: 'aeroPilots', vehicle: 'aerospace_fighter', vehicleLabel: 'Fighters' },
  { key: 'vehicle', label: 'Vehicle', troop: 'vehicleCrew', vehicle: 'ground_vehicle', vehicleLabel: 'Vehicles' },
  { key: 'infantry', label: 'Infantry', troop: 'infantry', vehicle: 'battle_armor', vehicleLabel: 'Battle Armor', loadout: true },
  { key: 'installation', label: 'Installation', troop: 'installationCrew', vehicle: null }
];

const PERSON_STATUSES = ['Active', 'Injured', 'KIA'];
const VEHICLE_STATUSES = ['Undamaged', 'Damaged', 'Destroyed'];
const UNIT_STATUSES = ['Combat Ready', 'Lowered Readiness', 'Combat Ineffective'];
const MEDICAL_STATUSES = [
  { key: 'active', label: 'Active' },
  { key: 'wounded', label: 'Wounded' },
  { key: 'kia', label: 'KIA' }
];

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Company Actor Sheet.
 * Tabs: Locations, Logistics, Status, MTOE, Assets, Finances.
 *
 * Personnel are numeric company-wide pools (crew + troops) staffed into ship
 * departments and MTOE unit boxes. Departments and unit boxes carry XP-driven
 * veterancy and can roll. Foundry v14 ApplicationV2 sheet.
 * @extends {ActorSheetV2}
 */
export class MechFoundryCompanySheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  #activeTab = null;
  #dragDrop;
  #boundElement = null;
  /** Ids of location cards currently expanded (collapsed by default). */
  #locExpanded = new Set();
  /** Ids of logistics rows currently expanded (collapsed by default). */
  #logiExpanded = new Set();
  /** MTOE tree UI state: collapsed block ids, and opened stack ids. */
  #mtoeCollapsed = new Set();
  #mtoeStackOpen = new Set();

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
  /*  Derivation helpers                           */
  /* -------------------------------------------- */

  /** Resolve XP into a veterancy tier + progress bar. */
  static veterancy(xp) {
    const total = Math.max(0, parseInt(xp) || 0);
    const index = Math.min(VETERANCY.length - 1, Math.floor(total / XP_PER_LEVEL));
    const tier = VETERANCY[index];
    const into = total - index * XP_PER_LEVEL;
    const atMax = index >= VETERANCY.length - 1;
    return {
      xp: total,
      index,
      label: tier.label,
      mod: tier.mod,
      into: atMax ? XP_PER_LEVEL : into,
      pct: atMax ? 100 : Math.round((into / XP_PER_LEVEL) * 100),
      atMax
    };
  }

  /** Staffing level → roll modifier + whether the unit can act at all. */
  static staffing(assigned, required) {
    if (required <= 0) return { pct: 100, mod: 0, canRoll: true };
    const pct = Math.round((assigned / required) * 100);
    let mod = 0;
    let canRoll = true;
    if (pct < 50) canRoll = false;
    else if (pct < 65) mod = -2;
    else if (pct < 80) mod = -1;
    return { pct, mod, canRoll };
  }

  static _int(value) {
    return Math.max(0, parseInt(value) || 0);
  }

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
      departmentTypes: DEPARTMENT_TYPES,
      personStatuses: PERSON_STATUSES,
      vehicleStatuses: VEHICLE_STATUSES,
      unitStatuses: UNIT_STATUSES,
      medicalStatuses: MEDICAL_STATUSES,
      shipSupplyFields: SHIP_SUPPLY_FIELDS,
      groundSupplyGroups: GROUND_SUPPLY_GROUPS
    };

    this._prepareAssets(context);
    this._preparePersonnel(context);
    this._prepareMedical(context);
    this._prepareLocations(context);
    this._prepareLogistics(context);
    this._prepareMTOE(context);

    context.totalPersonnel = context.crewPools.reduce((s, p) => s + p.total, 0)
      + context.troopPools.reduce((s, p) => s + p.total, 0);
    context.locationCount = context.locations.length;
    context.unitBoxCount = (this.actor.system.mtoe || []).length;
    context.monthlyExpenses = context.crewPools.concat(context.troopPools)
      .reduce((s, p) => s + p.total * (BASE_SALARY[p.key] || 0), 0);

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

  _preparePersonnel(context) {
    const pools = this.actor.system.personnel || {};
    const locations = this.actor.system.locations || [];
    const boxes = this.actor.system.mtoe || [];

    const crewAssigned = {};
    for (const t of CREW_TYPES) crewAssigned[t.key] = 0;
    for (const loc of locations) {
      const shipDepts = game.actors.get(loc.actorId)?.system?.departments || [];
      const assignments = loc.deptAssignments || {};
      for (const sd of shipDepts) {
        const primary = (DEPARTMENT_TYPES.find(d => d.key === sd.type) || DEPARTMENT_TYPES[0]).primary;
        const a = assignments[sd.id] || {};
        crewAssigned[primary] += Number(a.primary) || 0;
        crewAssigned.officers += Number(a.officers) || 0;
      }
    }

    const troopAssigned = {};
    for (const t of TROOP_TYPES) troopAssigned[t.key] = 0;
    for (const box of boxes) {
      const def = BLOCK_TYPES.find(t => t.key === this._blockType(box));
      if (def && troopAssigned.hasOwnProperty(def.troop)) {
        troopAssigned[def.troop] += (box.personnel || []).length;
      }
    }

    const build = (t, assignedMap) => {
      const total = Number(pools[t.key]) || 0;
      const assigned = assignedMap[t.key];
      return { ...t, total, assigned, available: total - assigned, over: assigned > total, salary: BASE_SALARY[t.key] || 0 };
    };
    context.crewPools = CREW_TYPES.map(t => build(t, crewAssigned));
    context.troopPools = TROOP_TYPES.map(t => build(t, troopAssigned));
  }

  _prepareMedical(context) {
    const medical = this.actor.system.medical || {};
    const totals = { active: 0, wounded: 0, kia: 0 };
    const rows = ALL_PERSONNEL_TYPES.map(t => {
      const entry = medical[t.key] || {};
      const cells = MEDICAL_STATUSES.map(s => {
        const v = Number(entry[s.key]) || 0;
        totals[s.key] += v;
        return { key: s.key, value: v };
      });
      return { key: t.key, label: t.label, cells };
    });
    context.medicalRows = rows;
    context.medicalTotals = MEDICAL_STATUSES.map(s => ({ key: s.key, label: s.label, value: totals[s.key] }));
  }

  _prepareLocations(context) {
    const stored = this.actor.system.locations || [];
    const locations = [];

    for (const loc of stored) {
      const actor = game.actors.get(loc.actorId);
      // Departments + their crew requirements are defined on the location actor
      // (e.g. the naval ship). The company stores only the crew assignments
      // (and per-company veterancy XP) keyed by the actor's department id.
      const shipDepts = actor?.system?.departments || [];
      const assignments = loc.deptAssignments || {};
      const departments = shipDepts.map(sd => {
        const typeDef = DEPARTMENT_TYPES.find(d => d.key === sd.type) || DEPARTMENT_TYPES[0];
        const primary = typeDef.primary;
        const primaryLabel = CREW_TYPES.find(c => c.key === primary)?.label || primary;
        const a = assignments[sd.id] || {};
        const crew = [
          {
            slot: 'primary', key: primary, label: primaryLabel,
            required: Number(sd.requiredPrimary) || 0,
            assigned: Number(a.primary) || 0
          },
          {
            slot: 'officers', key: 'officers', label: 'Officers',
            required: Number(sd.requiredOfficers) || 0,
            assigned: Number(a.officers) || 0
          }
        ];
        const reqTotal = crew.reduce((s, c) => s + c.required, 0);
        const assignedTotal = crew.reduce((s, c) => s + c.assigned, 0);
        const vet = MechFoundryCompanySheet.veterancy(a.xp);
        const staff = MechFoundryCompanySheet.staffing(assignedTotal, reqTotal);
        // Fold the short-crew penalty into the staffing badge so it stays on one
        // line (no extra row height for understaffed departments).
        let penaltyLabel = 'Staffing', staffSuffix = '', staffWarn = false;
        if (!staff.canRoll) { penaltyLabel = 'Understaffed — cannot roll'; staffSuffix = ' ✕'; staffWarn = true; }
        else if (staff.mod < 0) { penaltyLabel = `Short-crew penalty ${staff.mod}`; staffSuffix = ` ${staff.mod}`; staffWarn = true; }
        return {
          id: sd.id,
          type: typeDef.key,
          typeLabel: typeDef.label,
          crew, reqTotal, assignedTotal,
          understaffed: assignedTotal < reqTotal,
          xp: vet.xp, veterancy: vet.label, vetMod: vet.mod, xpPct: vet.pct, xpInto: vet.into, atMax: vet.atMax,
          staffPct: staff.pct, staffMod: staff.mod, canRoll: staff.canRoll,
          rollMod: vet.mod + staff.mod,
          penaltyLabel, staffSuffix, staffWarn
        };
      });
      const hasDeptSupport = Array.isArray(actor?.system?.departments);

      // Armor summary from the ship's arcs: current armor / total max armor.
      const arcs = actor?.system?.armor || {};
      let armorValue = 0, armorMax = 0;
      for (const arc of Object.values(arcs)) {
        armorMax += Number(arc?.max) || 0;
        armorValue += Number(arc?.value) || 0;
      }

      locations.push({
        id: loc.id,
        actorId: loc.actorId,
        exists: !!actor,
        name: actor ? actor.name : (loc.name || 'Missing Location'),
        img: actor ? actor.img : 'icons/svg/hazard.svg',
        typeLabel: actor ? (LOCATION_ACTOR_TYPES[actor.type] || 'Location') : 'Missing',
        status: loc.status || '',
        departments,
        deptSupported: hasDeptSupport,
        expanded: this.#locExpanded.has(loc.id),
        armorValue, armorMax,
        crewAssignedTotal: departments.reduce((s, d) => s + d.assignedTotal, 0),
        crewRequiredTotal: departments.reduce((s, d) => s + d.reqTotal, 0)
      });
    }
    context.locations = locations;
  }

  /**
   * Derive the ammo types required by the MTOE units based at a location, from
   * their vehicles' weapons and any infantry loadout, listing which units use each.
   */
  _ammoNeedsForLocation(shipId) {
    const needs = new Map(); // ammoType -> { units:Set, weapons:number }
    const add = (ammoType, unitName) => {
      if (!ammoType) return;
      if (!needs.has(ammoType)) needs.set(ammoType, { units: new Set(), weapons: 0 });
      const e = needs.get(ammoType);
      e.units.add(unitName);
      e.weapons += 1;
    };
    for (const box of (this.actor.system.mtoe || [])) {
      if ((box.locationId || '') !== shipId) continue;
      const unitName = box.name || 'Unit';
      for (const u of (box.units || [])) {
        const a = game.actors.get(u.actorId);
        for (const w of (a?.system?.weapons || [])) add(w.ammoType, unitName);
      }
      const def = BLOCK_TYPES.find(t => t.key === this._blockType(box));
      if (def?.loadout) for (const w of (box.loadout?.weapons || [])) add(w.ammoType, unitName);
    }
    return [...needs.entries()].map(([ammoType, e]) => ({
      ammoType, weaponCount: e.weapons, unitCount: e.units.size, unitsLabel: [...e.units].join(', ')
    }));
  }

  /**
   * Logistics: supplies live on each location actor (cargoSupplies). This tab is
   * the management interface — it reads/writes the actors and shows company-wide
   * summary totals.
   */
  _prepareLogistics(context) {
    const summaryShip = {};
    for (const f of SHIP_SUPPLY_FIELDS) summaryShip[f.key] = 0;
    const summaryGround = {};
    for (const f of GROUND_SUPPLY_FIELDS) summaryGround[f.key] = 0;
    const ammoSummary = {};

    const logiLocations = [];
    for (const loc of (this.actor.system.locations || [])) {
      const actor = game.actors.get(loc.actorId);
      if (!actor) continue;
      const cs = actor.system.cargoSupplies || blankCargoSupplies();
      const cap = cargoCapacity(actor);
      const used = cargoUsed(actor);

      const ship = SHIP_SUPPLY_FIELDS.map(f => {
        const v = Number(cs.ship?.[f.key]) || 0;
        summaryShip[f.key] += v;
        return { key: f.key, label: f.label, value: v };
      });
      const ground = GROUND_SUPPLY_GROUPS.map(g => ({
        label: g.label,
        fields: g.fields.map(f => {
          const v = Number(cs.ground?.[f.key]) || 0;
          summaryGround[f.key] += v;
          return { key: f.key, label: f.label, value: v };
        })
      }));
      const shipAmmo = (cs.shipAmmo || []).map(a => ({ id: a.id, name: a.name || '', value: Number(a.value) || 0 }));
      const groundAmmo = (cs.groundAmmo || []).map(a => ({ id: a.id, name: a.name || '', usedBy: a.usedBy || '', value: Number(a.value) || 0 }));
      for (const a of [...shipAmmo, ...groundAmmo]) {
        const key = a.name || '(unnamed)';
        ammoSummary[key] = (ammoSummary[key] || 0) + a.value;
      }

      logiLocations.push({
        id: loc.id,
        actorId: loc.actorId,
        name: actor.name,
        img: actor.img,
        typeLabel: LOCATION_ACTOR_TYPES[actor.type] || 'Location',
        expanded: this.#logiExpanded.has(loc.id),
        uncapped: cap === Infinity,
        capacity: cap === Infinity ? '∞' : cap,
        used,
        free: cap === Infinity ? '∞' : Math.max(0, cap - used),
        full: cap !== Infinity && used >= cap,
        ship, ground, shipAmmo, groundAmmo,
        ammoNeeds: this._ammoNeedsForLocation(loc.actorId)
      });
    }

    context.logiLocations = logiLocations;
    context.hasLogiLocations = logiLocations.length > 0;
    context.logiSummaryShip = SHIP_SUPPLY_FIELDS.map(f => ({ label: f.label, value: summaryShip[f.key] }));
    context.logiSummaryGround = GROUND_SUPPLY_GROUPS.map(g => ({
      label: g.label,
      fields: g.fields.map(f => ({ label: f.label, value: summaryGround[f.key] }))
    }));
    context.logiAmmoSummary = Object.entries(ammoSummary).map(([name, tons]) => ({ name, tons }));
  }

  /** Resolve a box's single block type, migrating legacy mixed boxes. */
  _blockType(box) {
    if (box.type && BLOCK_TYPES.some(t => t.key === box.type)) return box.type;
    const p = (box.personnel || [])[0];
    if (p?.type) {
      const bt = BLOCK_TYPES.find(t => t.troop === p.type);
      if (bt) return bt.key;
    }
    const u = (box.units || [])[0];
    if (u) {
      const a = game.actors.get(u.actorId);
      const bt = BLOCK_TYPES.find(t => t.vehicle === a?.type);
      if (bt) return bt.key;
    }
    return 'infantry';
  }

  /** Build the detail panel data for one block. */
  _blockDetail(box) {
    const def = BLOCK_TYPES.find(t => t.key === this._blockType(box)) || BLOCK_TYPES[0];
    const crew = (box.personnel || []).map(p => ({ id: p.id, status: p.status || 'Active' }));
    const vehicles = (box.units || []).map(u => {
      const a = game.actors.get(u.actorId);
      return {
        actorId: u.actorId, exists: !!a,
        name: a ? a.name : 'Missing', img: a ? a.img : 'icons/svg/hazard.svg',
        status: u.status || 'Undamaged'
      };
    });
    const rowCount = Math.max(crew.length, vehicles.length);
    const roster = [];
    for (let i = 0; i < rowCount; i++) roster.push({ person: crew[i] || null, vehicle: vehicles[i] || null });

    // Supply usage: ammo types from assigned vehicles' + infantry loadout weapons.
    const ammo = new Set();
    for (const u of (box.units || [])) {
      const a = game.actors.get(u.actorId);
      for (const w of (a?.system?.weapons || [])) if (w.ammoType) ammo.add(w.ammoType);
    }
    if (def.loadout) for (const w of (box.loadout?.weapons || [])) if (w.ammoType) ammo.add(w.ammoType);

    const vet = MechFoundryCompanySheet.veterancy(box.xp);
    const locActor = box.locationId ? game.actors.get(box.locationId) : null;
    const troopLabel = (TROOP_TYPES.find(t => t.key === def.troop) || {}).label || '';

    return {
      id: box.id, name: box.name || 'Unit', type: def.key, typeLabel: def.label,
      troopLabel, hasVehicle: !!def.vehicle, vehicleLabel: def.vehicleLabel || null,
      isInfantry: !!def.loadout,
      parentId: box.parentId || '',
      status: box.status || 'Combat Ready',
      crewCount: crew.length, vehicleCount: vehicles.length,
      roster,
      loadout: def.loadout ? { armorType: box.loadout?.armorType || '', weapons: (box.loadout?.weapons || []).map(w => ({ ...w })) } : null,
      supplyChips: [...ammo],
      chassisCategory: def.vehicle ? UNIT_ACTOR_TYPE_LABELS[def.vehicle] : null,
      xp: vet.xp, veterancy: vet.label, vetMod: vet.mod, xpPct: vet.pct, xpInto: vet.into,
      locationId: box.locationId || '', locationName: locActor ? locActor.name : '',
      locationMissing: !!box.locationId && !locActor,
      mismatch: (def.vehicle && crew.length !== vehicles.length)
        ? (crew.length > vehicles.length ? 'More crew than vehicles' : 'More vehicles than crew') : null
    };
  }

  /** Recursively flatten the org tree into display rows (respecting collapse + stacks). */
  _mtoeWalk(all, parentId, depth, rows) {
    const kids = all.filter(b => (b.parentId || '') === parentId);
    const groups = new Map();
    const order = [];
    for (const b of kids) {
      const key = `${b.name || 'Unit'}|${this._blockType(b)}`;
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key).push(b);
    }
    for (const key of order) {
      const group = groups.get(key);
      if (group.length === 1) {
        this._mtoeBlockRow(all, group[0], depth, rows);
      } else {
        const stackId = `stack:${parentId}:${key}`;
        const open = this.#mtoeStackOpen.has(stackId);
        const def = BLOCK_TYPES.find(t => t.key === this._blockType(group[0])) || {};
        rows.push({ kind: 'stack', stackId, depth, open, count: group.length, name: group[0].name || 'Unit', typeLabel: def.label || '' });
        if (open) for (const b of group) this._mtoeBlockRow(all, b, depth + 1, rows);
      }
    }
  }

  _mtoeBlockRow(all, box, depth, rows) {
    const hasChildren = all.some(b => (b.parentId || '') === box.id);
    const collapsed = this.#mtoeCollapsed.has(box.id);
    rows.push({ kind: 'block', id: box.id, depth, hasChildren, collapsed, detail: this._blockDetail(box) });
    if (!collapsed) this._mtoeWalk(all, box.id, depth + 1, rows);
  }

  _prepareMTOE(context) {
    const all = this.actor.system.mtoe || [];
    const rows = [];
    this._mtoeWalk(all, '', 0, rows);
    context.mtoeRows = rows;
    context.hasMtoe = all.length > 0;
    context.blockTypes = BLOCK_TYPES;
    // Parent options for reparenting (a block cannot parent itself; cycle guard is in the handler).
    context.mtoeParentOptions = all.map(b => ({ id: b.id, name: b.name || 'Unit' }));
    context.mtoeLocationOptions = (this.actor.system.locations || [])
      .map(l => {
        const a = game.actors.get(l.actorId);
        return a ? { actorId: a.id, name: a.name } : null;
      })
      .filter(Boolean);
  }

  /**
   * Organize equipment items for the Assets tab, stacking identical items
   * (same type + name) into one row with a quantity.
   */
  _prepareAssets(context) {
    const buckets = {
      weapon: [], armor: [], ammo: [], electronics: [],
      healthcare: [], prosthetics: [], drugpoison: [], fuel: []
    };
    for (const item of this.actor.items) {
      if (!buckets.hasOwnProperty(item.type)) continue;
      const arr = buckets[item.type];
      const stack = arr.find(s => s._stackKey === item.name);
      if (stack) {
        stack.qty += 1;
        stack._ids.push(item.id);
      } else {
        const data = item.toObject(false);
        data.qty = 1;
        data._stackKey = item.name;
        data._ids = [item.id];
        arr.push(data);
      }
    }
    buckets.hasItems = Object.entries(buckets)
      .some(([key, arr]) => key !== 'hasItems' && Array.isArray(arr) && arr.length > 0);
    context.companyAssets = buckets;
  }

  /* -------------------------------------------- */
  /*  Image action                                */
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
  /*  Render: tabs, drag/drop, listeners           */
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
        id: foundry.utils.randomID(), actorId: actor.id, status: '',
        deptAssignments: {}
      });
      await this.actor.update({ 'system.locations': locations });
      ui.notifications.info(`${actor.name} added as a company location.`);
      return false;
    }

    // Combat vehicle actors → the MTOE box dropped onto (type must match).
    if (Object.values(TROOP_VEHICLE).includes(actor.type)) {
      const boxEl = event.target.closest('.mtoe-box[data-box-id]');
      if (!boxEl) {
        ui.notifications.warn("Drop combat vehicles onto a specific MTOE unit box.");
        return false;
      }
      const boxId = boxEl.dataset.boxId;
      const box = (this.actor.system.mtoe || []).find(b => b.id === boxId);
      if (!box) return false;
      // A block is a single type; only its matching vehicle type may be added.
      const def = BLOCK_TYPES.find(t => t.key === this._blockType(box));
      if (!def?.vehicle || actor.type !== def.vehicle) {
        const want = def?.vehicle ? UNIT_ACTOR_TYPE_LABELS[def.vehicle] : 'no vehicles';
        ui.notifications.warn(`A ${def?.label || 'unit'} block accepts ${want}.`);
        return false;
      }
      // If the block is based at a location, the ship must have a free cubicle.
      if (box.locationId) {
        const ship = game.actors.get(box.locationId);
        const already = (box.units || []).filter(u => game.actors.get(u.actorId)?.type === actor.type).length;
        if (already + 1 > freeCubicles(ship, actor.type, box.id)) {
          ui.notifications.warn(`${ship?.name || 'The assigned location'} has no free ${UNIT_ACTOR_TYPE_LABELS[actor.type]} cubicle for ${actor.name}. Free a cubicle or reassign the unit.`);
          return false;
        }
      }
      await this._updateBox(boxId, b => {
        if (!Array.isArray(b.units)) b.units = [];
        if (b.units.some(u => u.actorId === actor.id)) {
          ui.notifications.warn(`${actor.name} is already in this unit.`);
          return false;
        }
        b.units.push({ actorId: actor.id, status: 'Undamaged' });
      });
      return false;
    }

    ui.notifications.warn("Drop Naval Ships / Installations on Locations, and matching combat vehicles onto an MTOE unit box.");
    return false;
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

  /* -------------------------------------------- */
  /*  Listeners                                    */
  /* -------------------------------------------- */

  _activateSheetListeners(html) {
    // Expand/collapse works for viewers too (pure UI state).
    html.on('click', '.location-toggle', this._onToggleLocation.bind(this));
    html.on('click', '.logi-toggle', this._onToggleLogi.bind(this));
    html.on('click', '.mtoe-toggle', this._onToggleBlock.bind(this));
    html.on('click', '.mtoe-stack-toggle', this._onToggleStack.bind(this));

    if (!this.isEditable) return;

    // Assets
    html.on('click', '.item-edit', this._onItemEdit.bind(this));
    html.on('click', '.item-delete', this._onItemDelete.bind(this));

    // Finances
    html.on('click', '.cbills-add', this._onAddFunds.bind(this));
    html.on('click', '.cbills-remove', this._onRemoveFunds.bind(this));
    html.on('click', '.ledger-delete', this._onLedgerDelete.bind(this));
    html.on('click', '.pay-monthly-expenses', this._onPayMonthlyExpenses.bind(this));

    // Locations (departments are defined on the ship actor; here we only assign)
    html.on('click', '.location-remove', this._onLocationRemove.bind(this));
    html.on('change', '.location-status', this._onLocationStatusChange.bind(this));
    html.on('change', '.dept-assign', this._onDeptAssignChange.bind(this));
    html.on('change', '.dept-xp', this._onDeptXpChange.bind(this));
    html.on('click', '.dept-roll', this._onDeptRoll.bind(this));

    // Logistics (supplies are stored on the location actors)
    html.on('click', '.transfer-supplies', this._onTransferSupplies.bind(this));
    html.on('change', '.cargo-ship', this._onCargoScalarChange.bind(this));
    html.on('change', '.cargo-ground', this._onCargoScalarChange.bind(this));
    html.on('click', '.add-cargo-ammo', this._onAddCargoAmmo.bind(this));
    html.on('click', '.remove-cargo-ammo', this._onRemoveCargoAmmo.bind(this));
    html.on('change', '.cargo-ammo-field', this._onCargoAmmoFieldChange.bind(this));

    // MTOE
    html.on('change', '.add-mtoe-block', this._onAddBlock.bind(this));
    html.on('change', '.add-subunit', this._onAddBlock.bind(this));
    html.on('click', '.remove-mtoe-box', this._onRemoveBox.bind(this));
    html.on('change', '.mtoe-box-name', this._onBoxNameChange.bind(this));
    html.on('change', '.mtoe-block-type', this._onBlockTypeChange.bind(this));
    html.on('change', '.mtoe-parent', this._onBlockParentChange.bind(this));
    html.on('change', '.mtoe-box-status', this._onBoxStatusChange.bind(this));
    html.on('change', '.mtoe-location', this._onBoxLocationChange.bind(this));
    html.on('change', '.mtoe-xp', this._onBoxXpChange.bind(this));
    html.on('click', '.mtoe-roll', this._onBoxRoll.bind(this));
    html.on('click', '.add-personnel', this._onAddPersonnel.bind(this));
    html.on('click', '.remove-personnel', this._onRemovePersonnel.bind(this));
    html.on('change', '.person-status', this._onPersonStatusChange.bind(this));
    html.on('change', '.vehicle-status', this._onVehicleStatusChange.bind(this));
    html.on('click', '.mtoe-unit-open', this._onUnitOpen.bind(this));
    html.on('click', '.mtoe-unit-remove', this._onBoxUnitRemove.bind(this));
    // Infantry loadout
    html.on('change', '.loadout-armor', this._onLoadoutArmorChange.bind(this));
    html.on('click', '.add-loadout-weapon', this._onAddLoadoutWeapon.bind(this));
    html.on('click', '.remove-loadout-weapon', this._onRemoveLoadoutWeapon.bind(this));
    html.on('change', '.loadout-weapon-field', this._onLoadoutWeaponField.bind(this));
  }

  /* -------------------------------------------- */
  /*  Location / department handlers               */
  /* -------------------------------------------- */

  _onToggleLocation(event) {
    event.preventDefault();
    const locId = event.currentTarget.dataset.locId;
    if (this.#locExpanded.has(locId)) this.#locExpanded.delete(locId);
    else this.#locExpanded.add(locId);
    this.render(false);
  }

  async _onLocationRemove(event) {
    event.preventDefault();
    const locId = event.currentTarget.dataset.locId;
    const locations = (this.actor.system.locations || []).filter(l => l.id !== locId);
    this.#locExpanded.delete(locId);
    await this.actor.update({ 'system.locations': locations });
  }

  async _onLocationStatusChange(event) {
    const locId = event.currentTarget.dataset.locId;
    const value = event.currentTarget.value;
    await this._updateLocation(locId, loc => { loc.status = value; });
  }

  /** The crew pool key a department slot draws from (primary depends on type). */
  _deptSlotPoolKey(actorId, deptId, slot) {
    if (slot === 'officers') return 'officers';
    const sd = (game.actors.get(actorId)?.system?.departments || []).find(d => d.id === deptId);
    const typeDef = DEPARTMENT_TYPES.find(d => d.key === sd?.type) || DEPARTMENT_TYPES[0];
    return typeDef.primary;
  }

  /** Total already-assigned for a crew pool across all locations/departments. */
  _totalCrewAssigned(poolKey) {
    let total = 0;
    for (const loc of (this.actor.system.locations || [])) {
      const shipDepts = game.actors.get(loc.actorId)?.system?.departments || [];
      const assignments = loc.deptAssignments || {};
      for (const sd of shipDepts) {
        const a = assignments[sd.id] || {};
        const primary = (DEPARTMENT_TYPES.find(d => d.key === sd.type) || DEPARTMENT_TYPES[0]).primary;
        if (poolKey === 'officers') total += Number(a.officers) || 0;
        else if (primary === poolKey) total += Number(a.primary) || 0;
      }
    }
    return total;
  }

  /**
   * Assign crew to a ship department. Clamps so the total assigned for that
   * crew pool never exceeds the company pool total (can't assign what you
   * don't have).
   */
  async _onDeptAssignChange(event) {
    const { locId, deptId, slot } = event.currentTarget.dataset;
    let value = MechFoundryCompanySheet._int(event.currentTarget.value);

    const loc = (this.actor.system.locations || []).find(l => l.id === locId);
    if (!loc) return;
    const poolKey = this._deptSlotPoolKey(loc.actorId, deptId, slot);
    const poolTotal = Number(this.actor.system.personnel?.[poolKey]) || 0;
    const current = Number(loc.deptAssignments?.[deptId]?.[slot]) || 0;
    const otherAssigned = this._totalCrewAssigned(poolKey) - current;
    const maxAllowed = Math.max(0, poolTotal - otherAssigned);
    if (value > maxAllowed) {
      value = maxAllowed;
      const label = CREW_TYPES.find(c => c.key === poolKey)?.label || poolKey;
      ui.notifications.warn(`Not enough ${label} in the pool — capped at ${maxAllowed}.`);
    }

    await this._updateLocation(locId, l => {
      if (!l.deptAssignments) l.deptAssignments = {};
      if (!l.deptAssignments[deptId]) l.deptAssignments[deptId] = { primary: 0, officers: 0, xp: 0 };
      l.deptAssignments[deptId][slot] = value;
    });
  }

  async _onDeptXpChange(event) {
    const { locId, deptId } = event.currentTarget.dataset;
    const value = MechFoundryCompanySheet._int(event.currentTarget.value);
    await this._updateLocation(locId, loc => {
      if (!loc.deptAssignments) loc.deptAssignments = {};
      if (!loc.deptAssignments[deptId]) loc.deptAssignments[deptId] = { primary: 0, officers: 0, xp: 0 };
      loc.deptAssignments[deptId].xp = value;
    });
  }

  async _onDeptRoll(event) {
    event.preventDefault();
    const { locId, deptId } = event.currentTarget.dataset;
    const loc = (this.actor.system.locations || []).find(l => l.id === locId);
    if (!loc) return;
    const sd = (game.actors.get(loc.actorId)?.system?.departments || []).find(d => d.id === deptId);
    if (!sd) return;

    const typeDef = DEPARTMENT_TYPES.find(d => d.key === sd.type) || DEPARTMENT_TYPES[0];
    const a = loc.deptAssignments?.[deptId] || {};
    const reqTotal = (Number(sd.requiredPrimary) || 0) + (Number(sd.requiredOfficers) || 0);
    const assignedTotal = (Number(a.primary) || 0) + (Number(a.officers) || 0);
    const vet = MechFoundryCompanySheet.veterancy(a.xp);
    const staff = MechFoundryCompanySheet.staffing(assignedTotal, reqTotal);
    const locName = game.actors.get(loc.actorId)?.name || 'Location';

    if (!staff.canRoll) {
      ui.notifications.warn(`${typeDef.label} is below 50% staffing (${staff.pct}%) and cannot perform tasks.`);
      return;
    }
    await this._departmentRoll(`${locName} — ${typeDef.label}`, vet, staff);
  }

  /* -------------------------------------------- */
  /*  Logistics — supplies stored on location actors */
  /* -------------------------------------------- */

  _onToggleLogi(event) {
    event.preventDefault();
    const locId = event.currentTarget.dataset.locId;
    if (this.#logiExpanded.has(locId)) this.#logiExpanded.delete(locId);
    else this.#logiExpanded.add(locId);
    this.render(false);
  }

  /** Resolve the location actor for a logistics control, or warn. */
  _logiActor(actorId) {
    const actor = game.actors.get(actorId);
    if (!actor) { ui.notifications.warn("That location's actor no longer exists."); return null; }
    return actor;
  }

  /** Update a location actor's cargoSupplies via a mutator, then re-render. */
  async _updateCargo(actor, mutator) {
    const cs = foundry.utils.deepClone(actor.system.cargoSupplies || blankCargoSupplies());
    if (!cs.ship) cs.ship = {};
    if (!cs.ground) cs.ground = {};
    if (!Array.isArray(cs.shipAmmo)) cs.shipAmmo = [];
    if (!Array.isArray(cs.groundAmmo)) cs.groundAmmo = [];
    if (mutator(cs) === false) return;
    await actor.update({ 'system.cargoSupplies': cs });
    this.render(false);
  }

  /**
   * The maximum a supply value can rise to on an actor without exceeding cargo
   * capacity, given the current value being edited.
   */
  _cargoCap(actor, currentValue) {
    const cap = cargoCapacity(actor);
    if (cap === Infinity) return Infinity;
    return Math.max(0, cap - (cargoUsed(actor) - currentValue));
  }

  /** Change a ship- or ground-supply scalar (class carries which). */
  async _onCargoScalarChange(event) {
    const el = event.currentTarget;
    const { actorId, group, key } = el.dataset; // group: 'ship' | 'ground'
    let value = MechFoundryCompanySheet._int(el.value);
    const actor = this._logiActor(actorId);
    if (!actor) return;
    const current = Number(actor.system.cargoSupplies?.[group]?.[key]) || 0;
    const max = this._cargoCap(actor, current);
    if (value > max) { value = max; ui.notifications.warn(`Cargo full — capped at ${max} t.`); }
    await this._updateCargo(actor, cs => { cs[group][key] = value; });
  }

  async _onAddCargoAmmo(event) {
    event.preventDefault();
    const { actorId, group } = event.currentTarget.dataset; // group: 'shipAmmo' | 'groundAmmo'
    const actor = this._logiActor(actorId);
    if (!actor) return;
    await this._updateCargo(actor, cs => {
      const entry = { id: foundry.utils.randomID(), name: '', value: 0 };
      if (group === 'groundAmmo') entry.usedBy = '';
      cs[group].push(entry);
    });
  }

  async _onRemoveCargoAmmo(event) {
    event.preventDefault();
    const { actorId, group, ammoId } = event.currentTarget.dataset;
    const actor = this._logiActor(actorId);
    if (!actor) return;
    await this._updateCargo(actor, cs => { cs[group] = cs[group].filter(a => a.id !== ammoId); });
  }

  async _onCargoAmmoFieldChange(event) {
    const el = event.currentTarget;
    const { actorId, group, ammoId, field } = el.dataset;
    const actor = this._logiActor(actorId);
    if (!actor) return;
    const raw = el.value;
    await this._updateCargo(actor, cs => {
      const ammo = cs[group].find(a => a.id === ammoId);
      if (!ammo) return false;
      if (field === 'value') {
        let value = MechFoundryCompanySheet._int(raw);
        const max = this._cargoCap(actor, Number(ammo.value) || 0);
        if (value > max) { value = max; ui.notifications.warn(`Cargo full — capped at ${max} t.`); }
        ammo.value = value;
      } else {
        ammo[field] = raw;
      }
    });
  }

  /* -------------------------------------------- */
  /*  Supply transfer between locations            */
  /* -------------------------------------------- */

  /** Flat list of transferable scalar categories with labels. */
  _transferCategories() {
    const cats = SHIP_SUPPLY_FIELDS.map(f => ({ group: 'ship', key: f.key, label: `Ship: ${f.label}` }));
    for (const f of GROUND_SUPPLY_FIELDS) cats.push({ group: 'ground', key: f.key, label: `Ground: ${f.label}` });
    return cats;
  }

  async _onTransferSupplies(event) {
    event.preventDefault();
    const locs = (this.actor.system.locations || [])
      .map(l => game.actors.get(l.actorId)).filter(Boolean);
    if (locs.length < 2) { ui.notifications.warn("Need at least two locations to transfer between."); return; }

    const cats = this._transferCategories();
    const locOpts = locs.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    const catOpts = cats.map((c, i) => `<option value="${i}">${c.label}</option>`).join('');
    const content = `
      <div class="form-group"><label>From</label><select name="from">${locOpts}</select></div>
      <div class="form-group"><label>To</label><select name="to">${locOpts}</select></div>
      <div class="form-group"><label>Supply</label><select name="cat">${catOpts}</select></div>
      <div class="form-group"><label>Amount (tons)</label><input type="number" name="amount" value="0" min="0" /></div>`;

    const result = await DialogV2.wait({
      window: { title: "Transfer Supplies", icon: "fa-solid fa-right-left" },
      content,
      buttons: [
        {
          action: "transfer", label: "Transfer", icon: "fa-solid fa-right-left", default: true,
          callback: (event, button) => ({
            from: button.form.elements.from.value,
            to: button.form.elements.to.value,
            cat: button.form.elements.cat.value,
            amount: button.form.elements.amount.value
          })
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!result || result === "cancel") return;

    const fromActor = game.actors.get(result.from);
    const toActor = game.actors.get(result.to);
    const cat = cats[parseInt(result.cat)];
    let amount = MechFoundryCompanySheet._int(result.amount);
    if (!fromActor || !toActor || !cat || amount <= 0) return;
    if (fromActor.id === toActor.id) { ui.notifications.warn("Pick two different locations."); return; }

    const fromBefore = Number(fromActor.system.cargoSupplies?.[cat.group]?.[cat.key]) || 0;
    const toBefore = Number(toActor.system.cargoSupplies?.[cat.group]?.[cat.key]) || 0;

    // Clamp by what the source has and what the destination can hold.
    amount = Math.min(amount, fromBefore);
    const destFree = this._cargoCap(toActor, toBefore) - toBefore;
    if (destFree !== Infinity) amount = Math.min(amount, Math.max(0, destFree));
    if (amount <= 0) { ui.notifications.warn("Nothing transferred (source empty or destination full)."); return; }

    await this._updateCargo(fromActor, cs => { cs[cat.group][cat.key] = fromBefore - amount; });
    await this._updateCargo(toActor, cs => { cs[cat.group][cat.key] = toBefore + amount; });

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="mech-foundry chat-card">
        <h3>Supply Transfer — ${cat.label.replace(/^(Ship|Ground): /, '')}</h3>
        <div class="roll-details">
          <div>Moved <strong>${amount} t</strong> from <strong>${fromActor.name}</strong> to <strong>${toActor.name}</strong></div>
          <div>${fromActor.name}: ${fromBefore} → ${fromBefore - amount}</div>
          <div>${toActor.name}: ${toBefore} → ${toBefore + amount}</div>
        </div>
      </div>`
    });
  }

  /* -------------------------------------------- */
  /*  MTOE handlers                                */
  /* -------------------------------------------- */

  _onToggleBlock(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.boxId;
    if (this.#mtoeCollapsed.has(id)) this.#mtoeCollapsed.delete(id);
    else this.#mtoeCollapsed.add(id);
    this.render(false);
  }

  _onToggleStack(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.stackId;
    if (this.#mtoeStackOpen.has(id)) this.#mtoeStackOpen.delete(id);
    else this.#mtoeStackOpen.add(id);
    this.render(false);
  }

  /** Add a unit block of the chosen type, optionally under a parent (sub-unit). */
  async _onAddBlock(event) {
    const type = event.currentTarget.value;
    if (!type || !BLOCK_TYPES.some(t => t.key === type)) return;
    const parentId = event.currentTarget.dataset.parentId || '';
    const def = BLOCK_TYPES.find(t => t.key === type);
    const boxes = foundry.utils.deepClone(this.actor.system.mtoe || []);
    boxes.push({
      id: foundry.utils.randomID(),
      name: `New ${def.label} Unit`,
      type, parentId,
      status: 'Combat Ready', xp: 0, locationId: '',
      personnel: [], units: [],
      loadout: def.loadout ? { armorType: '', weapons: [] } : undefined
    });
    if (parentId) this.#mtoeCollapsed.delete(parentId); // reveal the new child
    await this.actor.update({ 'system.mtoe': boxes });
  }

  /** Remove a block; its children are promoted to the removed block's parent. */
  async _onRemoveBox(event) {
    event.preventDefault();
    const boxId = event.currentTarget.dataset.boxId;
    const all = foundry.utils.deepClone(this.actor.system.mtoe || []);
    const box = all.find(b => b.id === boxId);
    if (!box) return;
    const newParent = box.parentId || '';
    for (const b of all) if ((b.parentId || '') === boxId) b.parentId = newParent;
    const boxes = all.filter(b => b.id !== boxId);
    await this.actor.update({ 'system.mtoe': boxes });
  }

  async _onBoxNameChange(event) {
    const boxId = event.currentTarget.dataset.boxId;
    const value = event.currentTarget.value;
    await this._updateBox(boxId, box => { box.name = value; });
  }

  /** Change a block's type; clears its roster/vehicles since the type constraints change. */
  async _onBlockTypeChange(event) {
    const boxId = event.currentTarget.dataset.boxId;
    const value = event.currentTarget.value;
    if (!BLOCK_TYPES.some(t => t.key === value)) return;
    const def = BLOCK_TYPES.find(t => t.key === value);
    await this._updateBox(boxId, box => {
      box.type = value;
      box.personnel = [];
      box.units = [];
      box.loadout = def.loadout ? { armorType: '', weapons: [] } : undefined;
    });
    ui.notifications.info("Unit type changed — its crew and vehicles were cleared.");
  }

  /** Reparent a block, guarding against cycles (can't parent to itself or a descendant). */
  async _onBlockParentChange(event) {
    const boxId = event.currentTarget.dataset.boxId;
    const value = event.currentTarget.value; // parent id or ''
    if (value === boxId) { ui.notifications.warn("A unit can't be its own parent."); this.render(false); return; }
    if (value) {
      // Walk up from the proposed parent; if we reach boxId, it's a cycle.
      const all = this.actor.system.mtoe || [];
      const byId = new Map(all.map(b => [b.id, b]));
      let cur = byId.get(value);
      const seen = new Set();
      while (cur && !seen.has(cur.id)) {
        if (cur.id === boxId) { ui.notifications.warn("That would create a loop in the hierarchy."); this.render(false); return; }
        seen.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : null;
      }
    }
    await this._updateBox(boxId, box => { box.parentId = value; });
  }

  async _onBoxStatusChange(event) {
    const boxId = event.currentTarget.dataset.boxId;
    const value = event.currentTarget.value;
    await this._updateBox(boxId, box => { box.status = value; });
  }

  async _onBoxXpChange(event) {
    const boxId = event.currentTarget.dataset.boxId;
    const value = MechFoundryCompanySheet._int(event.currentTarget.value);
    await this._updateBox(boxId, box => { box.xp = value; });
  }

  /** Assign a unit box to a location, if the ship has room for its equipment. */
  async _onBoxLocationChange(event) {
    const boxId = event.currentTarget.dataset.boxId;
    const value = event.currentTarget.value; // ship actor id or ''
    const box = (this.actor.system.mtoe || []).find(b => b.id === boxId);
    if (!box) return;

    if (value) {
      const ship = game.actors.get(value);
      const fit = canFitBoxAtShip(ship, box, box.id);
      if (!fit.ok) {
        const vLabel = UNIT_ACTOR_TYPE_LABELS[fit.vehicleType] || 'unit';
        ui.notifications.warn(`${ship?.name || 'That location'} lacks free ${vLabel} cubicles (needs ${fit.need}, ${Math.max(0, fit.free)} free).`);
        this.render(false); // revert the select
        return;
      }
    }
    await this._updateBox(boxId, b => { b.locationId = value; });
  }

  async _onBoxRoll(event) {
    event.preventDefault();
    const boxId = event.currentTarget.dataset.boxId;
    const box = (this.actor.system.mtoe || []).find(b => b.id === boxId);
    if (!box) return;
    const vet = MechFoundryCompanySheet.veterancy(box.xp);
    await this._departmentRoll(box.name || 'Unit', vet, { mod: 0, canRoll: true, pct: 100 });
  }

  /** Add one crew member (the block's single embarked type is implicit). */
  async _onAddPersonnel(event) {
    event.preventDefault();
    const boxId = event.currentTarget.dataset.boxId;
    await this._updateBox(boxId, box => {
      if (!Array.isArray(box.personnel)) box.personnel = [];
      box.personnel.push({ id: foundry.utils.randomID(), status: 'Active' });
    });
  }

  async _onRemovePersonnel(event) {
    event.preventDefault();
    const { boxId, personId } = event.currentTarget.dataset;
    await this._updateBox(boxId, box => {
      box.personnel = (box.personnel || []).filter(p => p.id !== personId);
    });
  }

  async _onPersonStatusChange(event) {
    const { boxId, personId } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    await this._updateBox(boxId, box => {
      const p = (box.personnel || []).find(x => x.id === personId);
      if (p) p.status = value;
    });
  }

  async _onVehicleStatusChange(event) {
    const { boxId, actorId } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    await this._updateBox(boxId, box => {
      const u = (box.units || []).find(x => x.actorId === actorId);
      if (u) u.status = value;
    });
  }

  _onUnitOpen(event) {
    event.preventDefault();
    const actorId = event.currentTarget.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (actor) actor.sheet.render(true);
    else ui.notifications.warn("That vehicle actor no longer exists.");
  }

  async _onBoxUnitRemove(event) {
    event.preventDefault();
    const { boxId, actorId } = event.currentTarget.dataset;
    await this._updateBox(boxId, box => {
      box.units = (box.units || []).filter(u => u.actorId !== actorId);
    });
  }

  /* -------------------------------------------- */
  /*  Infantry loadout                             */
  /* -------------------------------------------- */

  async _onLoadoutArmorChange(event) {
    const boxId = event.currentTarget.dataset.boxId;
    const value = event.currentTarget.value;
    await this._updateBox(boxId, box => {
      if (!box.loadout) box.loadout = { armorType: '', weapons: [] };
      box.loadout.armorType = value;
    });
  }

  async _onAddLoadoutWeapon(event) {
    event.preventDefault();
    const boxId = event.currentTarget.dataset.boxId;
    await this._updateBox(boxId, box => {
      if (!box.loadout) box.loadout = { armorType: '', weapons: [] };
      if (!Array.isArray(box.loadout.weapons)) box.loadout.weapons = [];
      box.loadout.weapons.push({ id: foundry.utils.randomID(), name: '', ammoType: '' });
    });
  }

  async _onRemoveLoadoutWeapon(event) {
    event.preventDefault();
    const { boxId, weaponId } = event.currentTarget.dataset;
    await this._updateBox(boxId, box => {
      if (box.loadout?.weapons) box.loadout.weapons = box.loadout.weapons.filter(w => w.id !== weaponId);
    });
  }

  async _onLoadoutWeaponField(event) {
    const { boxId, weaponId, field } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    await this._updateBox(boxId, box => {
      const w = box.loadout?.weapons?.find(x => x.id === weaponId);
      if (w) w[field] = value;
    });
  }

  /* -------------------------------------------- */
  /*  Rolls                                        */
  /* -------------------------------------------- */

  /**
   * Roll a department / unit task: 2d6 + veterancy mod + staffing mod (+ extra),
   * against a target number chosen in a dialog.
   */
  async _departmentRoll(label, vet, staff) {
    const baseMod = (vet?.mod || 0) + (staff?.mod || 0);
    const content = `
      <div class="form-group">
        <label>${label}</label>
        <p style="margin:2px 0;opacity:0.8;">Veterancy: ${vet?.label} (${vet?.mod >= 0 ? '+' : ''}${vet?.mod || 0})${staff && staff.mod ? ` · Staffing: ${staff.mod}` : ''}</p>
      </div>
      <div class="form-group">
        <label>Target Number (TN)</label>
        <input type="number" name="tn" value="8" min="1" />
      </div>
      <div class="form-group">
        <label>Additional Modifier</label>
        <input type="number" name="modifier" value="0" />
      </div>`;
    const result = await DialogV2.wait({
      window: { title: `${label} — Task Roll`, icon: "fa-solid fa-dice" },
      content,
      buttons: [
        {
          action: "roll", label: "Roll", icon: "fa-solid fa-dice", default: true,
          callback: (event, button) => ({
            tn: button?.form?.elements?.tn?.value ?? '8',
            modifier: button?.form?.elements?.modifier?.value ?? '0'
          })
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!result || result === "cancel") return;
    const tn = parseInt(result.tn) || 8;
    const extra = parseInt(result.modifier) || 0;
    await this._executeRoll(label, baseMod + extra, tn, vet, staff);
  }

  async _executeRoll(label, totalMod, tn, vet, staff) {
    const roll = await new Roll("2d6").evaluate();
    const dice = roll.dice[0].results.map(r => r.result);
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(dice);
    const rollTotal = roll.total + totalMod;
    const result = DiceMechanics.determineSuccess(rollTotal, tn, specialRoll);

    let resultText, cssClass;
    if (specialRoll.isFumble) { resultText = game.i18n.localize("MECHFOUNDRY.Fumble"); cssClass = "fumble"; }
    else if (specialRoll.isMiraculousFeat) { resultText = game.i18n.localize("MECHFOUNDRY.MiraculousFeat"); cssClass = "miraculous"; }
    else if (specialRoll.isStunningSuccess) { resultText = game.i18n.localize("MECHFOUNDRY.StunningSuccess"); cssClass = "stunning"; }
    else { resultText = result.success ? game.i18n.localize("MECHFOUNDRY.Success") : game.i18n.localize("MECHFOUNDRY.Failure"); cssClass = result.success ? "success" : "failure"; }

    const mos = Math.abs(result.mos);
    const modParts = [];
    if (vet) modParts.push(`Veterancy (${vet.label}): ${vet.mod >= 0 ? '+' : ''}${vet.mod}`);
    if (staff && staff.mod) modParts.push(`Staffing (${staff.pct}%): ${staff.mod}`);

    const chatContent = `
      <div class="mech-foundry chat-card skill-roll">
        <h3>${label}</h3>
        <div class="roll-details">
          <div>Dice: ${dice.join(', ')}</div>
          ${modParts.length ? `<div>Modifiers: ${modParts.join(', ')}</div>` : ''}
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
      rolls: [roll]
    });
  }

  /* -------------------------------------------- */
  /*  C-Bills / Fund Management                    */
  /* -------------------------------------------- */

  async _processTransaction(amount, type, reason) {
    const currentCBills = this.actor.system.cbills || 0;
    const newCBills = type === 'add' ? currentCBills + amount : currentCBills - amount;
    if (newCBills < 0) { ui.notifications.warn("Insufficient funds for this transaction."); return; }
    const ledger = foundry.utils.deepClone(this.actor.system.financialLedger || []);
    ledger.unshift({
      id: foundry.utils.randomID(), date: new Date().toISOString(),
      submittedBy: game.user.name, amount, type, reason: reason || "", balance: newCBills
    });
    await this.actor.update({ 'system.cbills': newCBills, 'system.financialLedger': ledger });
  }

  static _fieldValue(button, name) {
    return button?.form?.elements?.[name]?.value ?? '';
  }

  /** Total monthly salary bill across all personnel pools. */
  _computeMonthlyExpenses() {
    const pools = this.actor.system.personnel || {};
    return ALL_PERSONNEL_TYPES.reduce((s, t) => s + (Number(pools[t.key]) || 0) * (BASE_SALARY[t.key] || 0), 0);
  }

  async _onAddFunds(event) {
    event.preventDefault();
    const content = `
      <div class="form-group"><label>Amount (C-Bills)</label>
        <input type="number" name="amount" value="0" min="0" autofocus /></div>
      <div class="form-group"><label>Reason</label>
        <input type="text" name="reason" value="" placeholder="Reason for deposit" /></div>`;
    const result = await DialogV2.wait({
      window: { title: "Add Funds", icon: "fa-solid fa-coins" }, content,
      buttons: [
        { action: "confirm", label: "Confirm", icon: "fa-solid fa-check", default: true,
          callback: (event, button) => ({
            amount: MechFoundryCompanySheet._fieldValue(button, 'amount'),
            reason: MechFoundryCompanySheet._fieldValue(button, 'reason')
          }) },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ], rejectClose: false
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
      <div class="form-group"><label>Amount (C-Bills) — Current balance: ${currentCBills.toLocaleString()}</label>
        <input type="number" name="amount" value="0" min="0" autofocus /></div>
      <div class="form-group"><label>Reason</label>
        <input type="text" name="reason" value="" placeholder="Reason for withdrawal" /></div>`;
    const result = await DialogV2.wait({
      window: { title: "Remove Funds", icon: "fa-solid fa-coins" }, content,
      buttons: [
        { action: "confirm", label: "Confirm", icon: "fa-solid fa-check", default: true,
          callback: (event, button) => ({
            amount: MechFoundryCompanySheet._fieldValue(button, 'amount'),
            reason: MechFoundryCompanySheet._fieldValue(button, 'reason')
          }) },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ], rejectClose: false
    });
    if (!result || result === "cancel") return;
    const amount = Math.abs(parseInt(result.amount) || 0);
    if (amount <= 0) return;
    await this._processTransaction(amount, 'remove', result.reason || "");
  }

  async _onPayMonthlyExpenses(event) {
    event.preventDefault();
    const totalExpenses = this._computeMonthlyExpenses();
    if (totalExpenses <= 0) { ui.notifications.warn("No personnel to pay. Set pool counts on the Status tab."); return; }
    const confirmed = await DialogV2.confirm({
      window: { title: "Pay Monthly Expenses", icon: "fa-solid fa-coins" },
      content: `<p>Deduct <strong>${totalExpenses.toLocaleString()} C-Bills</strong> for monthly personnel salaries?</p>`,
      rejectClose: false, modal: true
    });
    if (confirmed) await this._processTransaction(totalExpenses, 'remove', 'Monthly Salaries');
  }

  async _onLedgerDelete(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const ledgerId = event.currentTarget.dataset.ledgerId;
    const ledger = foundry.utils.deepClone(this.actor.system.financialLedger || []);
    const index = ledger.findIndex(e => e.id === ledgerId);
    if (index >= 0) { ledger.splice(index, 1); await this.actor.update({ 'system.financialLedger': ledger }); }
  }

  /* -------------------------------------------- */
  /*  Item handlers (Assets)                       */
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
