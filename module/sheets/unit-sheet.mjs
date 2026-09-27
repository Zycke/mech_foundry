import { MechFoundryActorSheetV2 } from "./base-actor-sheet.mjs";

/** Weight classes offered on unit sheets (free-form fallback allowed). */
const WEIGHT_CLASSES = ['Light', 'Medium', 'Heavy', 'Assault'];

const TYPE_LABELS = {
  mech: 'Mech',
  ground_vehicle: 'Ground Vehicle',
  aerospace_fighter: 'Aerospace Fighter',
  battle_armor: 'Battle Armor'
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
    context.weapons = (this.actor.system.weapons || []).map(w => ({ ...w }));
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
    html.on('change', '.weapon-field', this._onWeaponFieldChange.bind(this));
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

  async _onWeaponFieldChange(event) {
    const { weaponId, field } = event.currentTarget.dataset;
    const raw = event.currentTarget.value;
    await this._updateWeapons(w => {
      const wpn = w.find(x => x.id === weaponId);
      if (!wpn) return false;
      wpn[field] = field === 'shotsPerTon' ? Math.max(0, parseInt(raw) || 0) : raw;
    });
  }
}
