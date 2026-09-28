import { MechFoundryUnitSheet } from "./unit-sheet.mjs";
import { actorSkillRating, applyCrewDamage, CREW_DAMAGE, VEHICLE_GUNNERY_SKILLS, VEHICLE_DRIVING_SKILLS } from "../helpers/atow-conversion.mjs";
import { weaponAttack } from "../helpers/tw-combat.mjs";

const { DialogV2 } = foundry.applications.api;

/** Armor facings in display order; turret/rotor are optional. */
const VEHICLE_FACINGS = [
  { key: 'front', label: 'Front' },
  { key: 'left', label: 'Left Side' },
  { key: 'right', label: 'Right Side' },
  { key: 'rear', label: 'Rear' },
  { key: 'turret', label: 'Turret', optional: true },
  { key: 'rotor', label: 'Rotor', optional: true }
];

const MOVEMENT_TYPES = ['tracked', 'wheeled', 'hover', 'vtol', 'wige', 'naval', 'hydrofoil', 'submarine'];

/**
 * Ground Vehicle (Combat Vehicle) Actor Sheet — Foundry v14, ApplicationV2.
 *
 * Status shows facing armor bars over a single internal-structure pool, the
 * motive/critical checklist with a live movement/skill penalty, and the crew
 * block (Gunnery/Driving, optionally linked to a character). Combat holds the
 * weapons table; Details the construction data and biography.
 *
 * @extends {MechFoundryUnitSheet}
 */
export class MechFoundryGroundVehicleSheet extends MechFoundryUnitSheet {

  #activeTab = null;
  #vehBound = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet", "mech-sheet", "ground-vehicle-sheet"],
    position: { width: 700, height: 700 }
  };

  /** @override */
  static PARTS = {
    form: {
      template: "systems/mech-foundry/templates/actor/actor-ground_vehicle-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /** @override */
  static NUMERIC_WEAPON_FIELDS = ['heat', 'damage', 'rangeS', 'rangeM', 'rangeL', 'ammo', 'shotsPerTon', 'clusterSize'];

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;
    const armor = sys.armor || {};

    const bar = (loc) => {
      const value = Number(loc?.value) || 0;
      const max = Number(loc?.max) || 0;
      return { value, max, pct: max > 0 ? Math.round((value / max) * 100) : 0, damaged: value < max };
    };

    context.facings = VEHICLE_FACINGS
      .filter(f => !f.optional || (Number(armor[f.key]?.max) || 0) > 0 || f.key === 'turret' && sys.hasTurret)
      .map(f => ({ ...f, armor: bar(armor[f.key]) }));
    context.showTurret = !!sys.hasTurret || (Number(armor.turret?.max) || 0) > 0;
    context.showRotor = (Number(armor.rotor?.max) || 0) > 0 || sys.movementType === 'vtol';

    context.structure = bar(sys.structure);

    const at = sys.derived?.armorTotal || { value: 0, max: 0 };
    context.armorTotal = { value: at.value, max: at.max, damaged: at.value < at.max };

    // Construction grid (Details tab): max values entered from the record sheet.
    context.setupFacings = VEHICLE_FACINGS.map(f => ({ key: f.key, label: f.label, max: Number(armor[f.key]?.max) || 0 }));
    context.structureMax = Number(sys.structure?.max) || 0;

    const cruise = Number(sys.movement?.cruise) || 0;
    const motiveHits = Math.max(0, Number(sys.crits?.motiveHits) || 0);
    // Motive / rotor damage reduces Cruising MP; Flank is re-derived from the
    // reduced Cruise (Cruise × 1.5, round up).
    const effCruise = Math.max(0, cruise - motiveHits);
    context.movement = {
      cruise, flank: Math.ceil(cruise * 1.5),
      type: sys.movementType || 'tracked',
      motivePenalty: motiveHits,
      effCruise, effFlank: Math.ceil(effCruise * 1.5)
    };
    context.movementTypes = MOVEMENT_TYPES;
    context.crits = sys.crits || {};
    context.conditions = sys.conditions || {};

    // Motive / sensor pip arrays (motive 0-3, sensors 0-4).
    context.motivePips = Array.from({ length: 3 }, (_, i) => i < motiveHits);
    const sensorHits = Math.max(0, Number(sys.crits?.sensorHits) || 0);
    context.sensorPips = Array.from({ length: 4 }, (_, i) => i < sensorHits);

    // Crew block + optional link (Gunnery / Driving).
    const crew = sys.crew || {};
    const linked = crew.actorId ? game.actors.get(crew.actorId) : null;
    context.crew = {
      name: crew.name ?? '', gunnery: crew.gunnery ?? 4, driving: crew.driving ?? 5,
      driverHit: !!crew.driverHit, commanderHit: !!crew.commanderHit,
      gunneryDerived: false, drivingDerived: false
    };
    context.crewLinked = linked ? { id: linked.id, name: linked.name, img: linked.img } : null;
    if (linked) {
      const g = actorSkillRating(linked, VEHICLE_GUNNERY_SKILLS);
      const d = actorSkillRating(linked, VEHICLE_DRIVING_SKILLS);
      if (g) { context.crew.gunnery = g.rating; context.crew.gunneryDerived = true; context.crew.gunnerySource = `${linked.name}: ${g.skillName} Lvl ${g.level}`; }
      if (d) { context.crew.driving = d.rating; context.crew.drivingDerived = true; context.crew.drivingSource = `${linked.name}: ${d.skillName} Lvl ${d.level}`; }
    }

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.#vehBound !== this.element) {
      this._activateVehicleListeners($(this.element));
      this.#vehBound = this.element;
    }
    this._applyActiveTab();
  }

  _activateVehicleListeners(html) {
    html.on('click', '.sheet-tabs .item[data-tab]', (ev) => {
      ev.preventDefault();
      this.#activeTab = ev.currentTarget.dataset.tab;
      this._applyActiveTab();
    });
    if (!this.isEditable) return;
    html.on('click', '.crit-pip', this._onCritPip.bind(this));
    html.on('change', '.crew-hit-flag', this._onCrewHitFlag.bind(this));
    html.on('click', '.crew-link', this._onCrewLink.bind(this));
    html.on('click', '.crew-unlink', this._onCrewUnlink.bind(this));
    html.on('click', '.crew-open', this._onCrewOpen.bind(this));
    html.on('click', '.weapon-attack', this._onWeaponAttack.bind(this));
  }

  _applyActiveTab() {
    const navs = this.element.querySelectorAll(".sheet-tabs .item[data-tab]");
    const bodies = this.element.querySelectorAll(".sheet-body .tab[data-tab]");
    if (!navs.length || !bodies.length) return;
    if (!this.#activeTab || ![...bodies].some(b => b.dataset.tab === this.#activeTab)) {
      this.#activeTab = bodies[0].dataset.tab;
    }
    for (const n of navs) n.classList.toggle("active", n.dataset.tab === this.#activeTab);
    for (const b of bodies) b.classList.toggle("active", b.dataset.tab === this.#activeTab);
  }

  /* -------------------------------------------- */

  /** @override — richer default weapon for the combat table. */
  async _onAddWeapon(event) {
    event.preventDefault();
    await this._updateWeapons(w => {
      w.push({ id: foundry.utils.randomID(), name: '', location: '', heat: 0, damage: 0, clusterSize: 0, rangeS: 0, rangeM: 0, rangeL: 0, ammoType: '', ammo: 0 });
    });
  }

  /** Generic crit-pip toggle: sets a numeric crit value from data-path/data-level. */
  async _onCritPip(event) {
    event.preventDefault();
    const { path, level } = event.currentTarget.dataset;
    const lvl = parseInt(level);
    const current = Number(foundry.utils.getProperty(this.actor.system, path)) || 0;
    const next = current === lvl ? lvl - 1 : lvl;
    await this.actor.update({ [`system.${path}`]: Math.max(0, next) });
  }

  async _onCrewLink(event) {
    event.preventDefault();
    const candidates = game.actors.filter(a => ['character', 'npc'].includes(a.type));
    if (!candidates.length) { ui.notifications.warn("No character or NPC actors exist to link as crew."); return; }
    const options = candidates.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML?.(a.name) ?? a.name}</option>`).join('');
    const result = await DialogV2.wait({
      window: { title: "Link Crew", icon: "fa-solid fa-user-plus" },
      content: `<div class="form-group"><label>Actor</label><select name="actorId">${options}</select></div>`,
      buttons: [
        { action: "link", label: "Link", icon: "fa-solid fa-link", default: true, callback: (ev, b) => b.form.elements.actorId.value },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!result || result === "cancel") return;
    const actor = game.actors.get(result);
    if (!actor) return;
    const update = { 'system.crew.actorId': actor.id };
    if (!this.actor.system.crew?.name) update['system.crew.name'] = actor.name;
    await this.actor.update(update);
  }

  /**
   * Toggle a crew hit flag (driver/commander). When newly set and a crew actor
   * is linked, apply the AToW Commander/Driver Hit damage (5B/4) to that actor.
   */
  async _onCrewHitFlag(event) {
    const flag = event.currentTarget.dataset.flag;   // 'driverHit' | 'commanderHit'
    const checked = event.currentTarget.checked;
    const was = !!this.actor.system.crew?.[flag];
    await this.actor.update({ [`system.crew.${flag}`]: checked });
    if (checked && !was) {
      const linked = game.actors.get(this.actor.system.crew?.actorId);
      if (linked && await applyCrewDamage(linked, CREW_DAMAGE.vehicleCrewHit)) {
        ui.notifications.info(`${this.actor.name}: applied Commander/Driver Hit (${CREW_DAMAGE.vehicleCrewHit.bd} damage) to ${linked.name}.`);
      }
    }
  }

  async _onCrewUnlink(event) { event.preventDefault(); await this.actor.update({ 'system.crew.actorId': '' }); }

  _onCrewOpen(event) {
    event.preventDefault();
    const actor = game.actors.get(this.actor.system.crew?.actorId);
    if (actor) actor.sheet.render(true); else ui.notifications.warn("Linked crew actor was not found.");
  }

  async _onWeaponAttack(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    const weapon = (this.actor.system.weapons || []).find(w => w.id === id);
    if (weapon) await weaponAttack(this.actor, weapon);
  }
}
