import { MechFoundryActorSheetV2 } from "./base-actor-sheet.mjs";
import { currentTurnKey, fireWeapons, firedThisTurn, unjamWeapon, usesAmmo, weaponToHitPreview } from "../helpers/tw-combat.mjs";
import { MOVE_MODES, movedThisTurn, setMovement, weaponOwnToHit } from "../helpers/tw-movement.mjs";
import { EXTERNAL_HEAT_CAP, externalHeat, guidable, narcPods, taggedThisTurn, weaponKind } from "../helpers/tw-weapons.mjs";
import { aeroMaxBracket, aeroTurnState, isAero, setAeroTurn } from "../helpers/tw-aero.mjs";
import { physicalAttack } from "../helpers/tw-physical.mjs";
import { sideslipCheck, skidCheck, vehicleCrash } from "../helpers/tw-skid.mjs";
import {
  antiMechAttack, attachedSummary, dismountCarrier, dropProneShakeOff, jumpShakeOff, mountCarrier, releaseSwarm, removeSwarmers,
  riderBuildingCheck, swarmAttack, takeOffShakeOff, vehicleShakeOff
} from "../helpers/tw-antimech.mjs";

/** Weight classes offered on unit sheets (free-form fallback allowed). */
const WEIGHT_CLASSES = ['Light', 'Medium', 'Heavy', 'Assault'];

const TYPE_LABELS = {
  mech: 'Mech',
  ground_vehicle: 'Ground Vehicle',
  aerospace_fighter: 'Aerospace Fighter',
  battle_armor: 'Battle Armor',
  infantry: 'Conventional Infantry'
};

/**
 * Shared editable sheet for the combat unit actor types (mech, ground vehicle,
 * aerospace fighter, battle armor). Placeholder-level: enough data (weight
 * class / tonnage / armor / a weapons+ammo table) to drive the company MTOE
 * loadout display and the Logistics ammo roll-up. Foundry v14 ApplicationV2.
 *
 * @extends {MechFoundryActorSheetV2}
 */
export class MechFoundryUnitSheet extends MechFoundryActorSheetV2 {

  #boundElement = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet"],
    position: { width: 640, height: 560 }
  };

  /** @override — all four unit types share one template. */
  static PARTS = {
    form: {
      template: "systems/mech-foundry/templates/actor/actor-unit-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user.isGM;
    context.isBattleArmor = this.actor.type === 'battle_armor';
    context.typeLabel = TYPE_LABELS[this.actor.type] || 'Unit';
    context.weightClasses = WEIGHT_CLASSES;
    // Per-weapon state: fired this turn (only meaningful during combat), out of
    // ammunition, destroyed (set by crits or the row's toggle).
    const fired = currentTurnKey() ? firedThisTurn(this.actor) : {};
    const toHit = weaponToHitPreview(this.actor); // vs the user's current target
    context.weapons = (this.actor.system.weapons || []).map(w => ({
      ...w,
      toHit: toHit[w.id] || null,
      aeroMax: aeroMaxBracket(w),
      destroyed: !!w.destroyed,
      fired: fired[w.id] !== undefined,
      outOfAmmo: usesAmmo(w) && (Number(w.ammo) || 0) <= 0 && !(weaponKind(w) === 'lbx' && (Number(w.clusterAmmo) || 0) > 0),
      special: weaponSpecialContext(w, this.actor)
    }));
    const turnKey = currentTurnKey();
    const markers = { narc: narcPods(this.actor), tagged: taggedThisTurn(this.actor, turnKey), extHeat: Math.min(EXTERNAL_HEAT_CAP, externalHeat(this.actor, turnKey)) };
    markers.any = !!(markers.narc.length || markers.tagged || markers.extHeat);
    context.weaponMarkers = markers;
    // This turn's movement (ground units, during combat): hexes accumulate from
    // token moves; the mode is inferred unless picked here (jumping must be picked).
    if (currentTurnKey() && ['mech', 'ground_vehicle', 'battle_armor', 'infantry'].includes(this.actor.type)) {
      const mv = movedThisTurn(this.actor);
      const vehicle = this.actor.type === 'ground_vehicle';
      const label = (m) => vehicle ? m.vlabel : m.label;
      context.turnMove = {
        hexes: mv.hexes,
        meters: Math.round(mv.meters),
        modes: [
          { key: 'auto', label: `Auto (${label(MOVE_MODES.find(m => m.key === mv.mode))})`, selected: !mv.modeSet },
          ...MOVE_MODES.map(m => ({ key: m.key, label: `${label(m)} (+${m.mod})`, selected: mv.modeSet && mv.mode === m.key }))
        ]
      };
    }
    if (isAero(this.actor)) context.aeroTurn = { ...aeroTurnState(this.actor), inCombat: !!currentTurnKey() };
    // Infantry swarming or riding this unit.
    if (['mech', 'ground_vehicle', 'aerospace_fighter', 'small_craft'].includes(this.actor.type)) context.attachedInfantry = attachedSummary(this.actor);
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    if (this.#boundElement !== this.element) {
      this._activateUnitListeners($(this.element));
      this.#boundElement = this.element;
    }
  }

  _activateUnitListeners(html) {
    if (!this.isEditable) return;
    html.on('click', '.add-weapon', this._onAddWeapon.bind(this));
    html.on('click', '.remove-weapon', this._onRemoveWeapon.bind(this));
    html.on('click', '.duplicate-weapon', this._onDuplicateWeapon.bind(this));
    html.on('click', '.toggle-weapon-destroyed', this._onToggleWeaponDestroyed.bind(this));
    html.on('change', '.weapon-field', this._onWeaponFieldChange.bind(this));
    html.on('click', '.weapon-unjam', (ev) => { ev.preventDefault(); unjamWeapon(this.actor, ev.currentTarget.dataset.weaponId); });
    html.on('click', '.weapon-clear-state', (ev) => {
      ev.preventDefault();
      const id = ev.currentTarget.dataset.weaponId;
      this._updateWeapons(w => { const x = w.find(y => y.id === id); if (!x) return false; x.jammed = false; x.spent = false; });
    });
    html.on('click', '.clear-narc', (ev) => { ev.preventDefault(); this.actor.update({ 'flags.mech-foundry.narc': [] }); });
    html.on('change', '.turn-move-field', this._onTurnMoveChange.bind(this));
    html.on('change', '.weapon-flag', this._onWeaponFlagChange.bind(this));
    html.on('change', '.aero-evading', (ev) => setAeroTurn(this.actor, { evading: ev.currentTarget.checked }));
    html.on('click', '.physical-attack', (ev) => { ev.preventDefault(); physicalAttack(this.actor); });
    html.on('click', '.fire-weapons', (ev) => { ev.preventDefault(); fireWeapons(this.actor); });
    html.on('click', '.skid-check', (ev) => { ev.preventDefault(); skidCheck(this.actor); });
    html.on('click', '.sideslip-check', (ev) => { ev.preventDefault(); sideslipCheck(this.actor); });
    html.on('click', '.vehicle-crash', (ev) => { ev.preventDefault(); vehicleCrash(this.actor); });
    // Anti-'Mech attacks (infantry) and fighting off swarmers (the swarmed unit).
    html.on('click', '.anti-mech-attack', (ev) => { ev.preventDefault(); antiMechAttack(this.actor); });
    html.on('click', '.swarm-attack', (ev) => { ev.preventDefault(); swarmAttack(this.actor); });
    html.on('click', '.release-swarm', (ev) => { ev.preventDefault(); releaseSwarm(this.actor); });
    html.on('click', '.remove-swarmers', (ev) => { ev.preventDefault(); removeSwarmers(this.actor); });
    html.on('click', '.jump-shakeoff', (ev) => { ev.preventDefault(); jumpShakeOff(this.actor); });
    html.on('click', '.drop-prone-shakeoff', (ev) => { ev.preventDefault(); dropProneShakeOff(this.actor); });
    html.on('click', '.vehicle-shakeoff', (ev) => { ev.preventDefault(); vehicleShakeOff(this.actor); });
    html.on('click', '.takeoff-shakeoff', (ev) => { ev.preventDefault(); takeOffShakeOff(this.actor); });
    // Mechanized battle armor.
    html.on('click', '.mount-carrier', (ev) => { ev.preventDefault(); mountCarrier(this.actor); });
    html.on('click', '.dismount-carrier', (ev) => { ev.preventDefault(); dismountCarrier(this.actor); });
    html.on('click', '.rider-building', (ev) => { ev.preventDefault(); riderBuildingCheck(this.actor); });
  }

  /** A boolean weapon field (e.g. Capital) from a checkbox. */
  async _onWeaponFlagChange(event) {
    const { weaponId, field } = event.currentTarget.dataset;
    const checked = event.currentTarget.checked;
    await this._updateWeapons(w => {
      const wpn = w.find(x => x.id === weaponId);
      if (!wpn) return false;
      wpn[field] = checked;
    });
  }

  /** Set this turn's movement mode or hexes moved. */
  async _onTurnMoveChange(event) {
    const el = event.currentTarget;
    if (el.dataset.field === 'hexes') await setMovement(this.actor, { hexes: Math.max(0, parseInt(el.value) || 0) });
    else await setMovement(this.actor, { mode: el.value });
  }

  /**
   * Mark a weapon destroyed or repaired. Mech crit slots set this automatically;
   * vehicle/aero 'Weapon Destroyed' crits don't say which weapon, so the owner
   * marks it here.
   */
  async _onToggleWeaponDestroyed(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    await this._updateWeapons(w => {
      const wpn = w.find(x => x.id === id);
      if (!wpn) return false;
      wpn.destroyed = !wpn.destroyed;
    });
  }

  /** Insert a copy of a weapon (new id) directly after the original. */
  async _onDuplicateWeapon(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    await this._updateWeapons(w => {
      const i = w.findIndex(x => x.id === id);
      if (i < 0) return false;
      const copy = foundry.utils.deepClone(w[i]);
      copy.id = foundry.utils.randomID();
      delete copy.destroyed; // a fresh copy starts intact
      w.splice(i + 1, 0, copy);
    });
  }

  async _updateWeapons(mutator) {
    const weapons = foundry.utils.deepClone(this.actor.system.weapons || []);
    if (mutator(weapons) === false) return;
    await this.actor.update({ 'system.weapons': weapons });
  }

  async _onAddWeapon(event) {
    event.preventDefault();
    await this._updateWeapons(w => {
      w.push({ id: foundry.utils.randomID(), name: '', ammoType: '', shotsPerTon: 0 });
    });
  }

  async _onRemoveWeapon(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    await this._updateWeapons(w => {
      const i = w.findIndex(x => x.id === id);
      if (i >= 0) w.splice(i, 1);
    });
  }

  /** Weapon fields stored as non-negative integers (all others are strings). */
  static NUMERIC_WEAPON_FIELDS = ['shotsPerTon', 'heat', 'ammo'];

  async _onWeaponFieldChange(event) {
    const { weaponId, field } = event.currentTarget.dataset;
    const raw = event.currentTarget.value;
    const numeric = this.constructor.NUMERIC_WEAPON_FIELDS.includes(field);
    await this._updateWeapons(w => {
      const wpn = w.find(x => x.id === weaponId);
      if (!wpn) return false;
      // Blank means "automatic": the catalog to-hit modifier, cluster rounds from Rds.
      if (field === 'toHit') wpn[field] = String(raw).trim() === '' ? '' : (parseInt(raw) || 0);
      else if (field === 'clusterAmmo') wpn[field] = String(raw).trim() === '' ? '' : Math.max(0, parseInt(raw) || 0);
      else wpn[field] = numeric ? Math.max(0, parseInt(raw) || 0) : raw;
    });
  }
}

/**
 * Keep the weapon rows' to-hit numbers current: re-render open unit sheets
 * when this user changes target, or when a token moves / a unit updates
 * (range and movement modifiers change). Debounced.
 */
export function registerToHitRefresh() {
  const refresh = foundry.utils.debounce(() => {
    for (const app of foundry.applications.instances?.values?.() ?? []) {
      if (app instanceof MechFoundryUnitSheet && app.rendered) app.render(false);
    }
  }, 150);
  Hooks.on("targetToken", (user) => { if (user === game.user) refresh(); });
  Hooks.on("updateToken", (doc, changes) => { if ('x' in changes || 'y' in changes || 'rotation' in changes) refresh(); });
  Hooks.on("updateActor", () => { if (game.user.targets?.size) refresh(); });
}

/** Sheet data for a weapon's Special cell (see tw-weapons.mjs). */
function weaponSpecialContext(w, actor) {
  const kind = weaponKind(w);
  const auto = weaponOwnToHit({ ...w, toHit: undefined }, actor);
  const set = w.toHit === undefined || w.toHit === null ? '' : w.toHit;
  return {
    kind, guidable: guidable(w), lbx: kind === 'lbx', rotary: kind === 'rotary',
    toHitSet: set, autoToHitText: auto > 0 ? `+${auto}` : String(auto), clearable: !!(w.jammed || w.spent)
  };
}
