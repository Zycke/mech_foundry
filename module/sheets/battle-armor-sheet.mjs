import { MechFoundryUnitSheet } from "./unit-sheet.mjs";
import { actorSkillRating, BATTLESUIT_GUNNERY_SKILLS, BATTLESUIT_ANTIMECH_SKILLS } from "../helpers/atow-conversion.mjs";
import { weaponAttack } from "../helpers/tw-combat.mjs";
import {
  BA_TECH, BA_WEIGHTS, MANIPULATORS, STEALTH_TYPES, baTroopers, baWeaponKind, squadSize, troopersForWrite
} from "../helpers/tw-infantry.mjs";

const { DialogV2 } = foundry.applications.api;

const opts = (map, current) => Object.entries(map).map(([key, label]) => ({ key, label: typeof label === 'string' ? label : label.label, selected: key === current }));

/**
 * Battle Armor Actor Sheet — Foundry v14, ApplicationV2. One actor is a whole
 * unit (a Squad / Point of 1–6 troopers).
 *
 * Status shows each trooper's damage track (Armor Value boxes + 1 for the
 * soldier), movement, and the crew block (Gunnery / Anti-'Mech, optionally
 * linked to a character). Combat holds the weapons table; Details the
 * construction data (armor value, manipulators, equipment).
 *
 * @extends {MechFoundryUnitSheet}
 */
export class MechFoundryBattleArmorSheet extends MechFoundryUnitSheet {

  #activeTab = null;
  #baBound = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet", "mech-sheet", "battle-armor-sheet"],
    position: { width: 700, height: 700 }
  };

  /** @override */
  static PARTS = {
    form: {
      template: "systems/mech-foundry/templates/actor/actor-battle_armor-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /** @override */
  static NUMERIC_WEAPON_FIELDS = ['damage', 'clusterSize', 'rangeMin', 'rangeS', 'rangeM', 'rangeL', 'ammo'];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;

    const troopers = baTroopers(this.actor);
    context.troopers = troopers.map(t => ({
      ...t,
      boxes: Array.from({ length: t.capacity }, (_, i) => ({ n: i + 1, on: i < t.damage, soldier: i === t.capacity - 1 }))
    }));
    context.squad = { size: squadSize(this.actor), live: troopers.filter(t => t.alive).length, capacity: troopers[0]?.capacity ?? 1 };
    context.techBases = opts(BA_TECH, sys.techBase || 'is');
    context.weightClassOpts = opts(BA_WEIGHTS, sys.weightClass || 'medium');
    context.chassisOpts = opts({ humanoid: 'Humanoid', quad: 'Quad' }, sys.chassis || 'humanoid');
    context.manipLeft = opts(MANIPULATORS, sys.manipulators?.left || 'none');
    context.manipRight = opts(MANIPULATORS, sys.manipulators?.right || 'none');
    context.stealthOpts = opts(STEALTH_TYPES, sys.equipment?.stealth || 'none');
    context.equipment = sys.equipment || {};
    context.move = sys.movement || {};
    context.weapons = context.weapons.map(w => ({
      ...w,
      kind: baWeaponKind(w),
      locOpts: opts({ arm: 'Arm', body: 'Body', turret: 'Turret' }, w.location || 'arm')
    }));

    // Crew block + optional link (Gunnery / Anti-'Mech).
    const crew = sys.crew || {};
    const linked = crew.actorId ? game.actors.get(crew.actorId) : null;
    context.crew = { name: crew.name ?? '', gunnery: crew.gunnery ?? 4, antiMech: crew.antiMech ?? 5, gunneryDerived: false, antiMechDerived: false };
    context.crewLinked = linked ? { id: linked.id, name: linked.name, img: linked.img } : null;
    if (linked) {
      const g = actorSkillRating(linked, BATTLESUIT_GUNNERY_SKILLS);
      const a = actorSkillRating(linked, BATTLESUIT_ANTIMECH_SKILLS);
      if (g) Object.assign(context.crew, { gunnery: g.rating, gunneryDerived: true, gunnerySource: `${linked.name}: ${g.skillName} Lvl ${g.level}` });
      if (a) Object.assign(context.crew, { antiMech: a.rating, antiMechDerived: true, antiMechSource: `${linked.name}: ${a.skillName} Lvl ${a.level}` });
    }
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.#baBound !== this.element) {
      this._activateBattleArmorListeners($(this.element));
      this.#baBound = this.element;
    }
    this._applyActiveTab();
  }

  _activateBattleArmorListeners(html) {
    html.on('click', '.sheet-tabs .item[data-tab]', (ev) => {
      ev.preventDefault();
      this.#activeTab = ev.currentTarget.dataset.tab;
      this._applyActiveTab();
    });
    if (!this.isEditable) return;
    html.on('click', '.trooper-box', this._onTrooperBox.bind(this));
    html.on('click', '.crew-link', this._onCrewLink.bind(this));
    html.on('click', '.crew-unlink', async (ev) => { ev.preventDefault(); await this.actor.update({ 'system.crew.actorId': '' }); });
    html.on('click', '.crew-open', (ev) => {
      ev.preventDefault();
      const a = game.actors.get(this.actor.system.crew?.actorId);
      if (a) a.sheet.render(true); else ui.notifications.warn("Linked crew actor was not found.");
    });
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

  /**
   * Click a damage box: mark damage up to it (clicking the last marked box
   * clears it). The last box of each track is the soldier inside.
   */
  async _onTrooperBox(event) {
    event.preventDefault();
    const idx = parseInt(event.currentTarget.dataset.trooper) - 1;
    const box = parseInt(event.currentTarget.dataset.box);
    const troopers = baTroopers(this.actor);
    const t = troopers[idx];
    if (!t) return;
    t.damage = t.damage === box ? box - 1 : box;
    await this.actor.update({ 'system.troopers': troopersForWrite(troopers) });
  }

  /** @override — battle armor weapon defaults. */
  async _onAddWeapon(event) {
    event.preventDefault();
    await this._updateWeapons(w => {
      w.push({ id: foundry.utils.randomID(), name: '', location: 'arm', damage: 0, clusterSize: 0, rangeMin: 0, rangeS: 0, rangeM: 0, rangeL: 0, ap: false, ammoType: '', ammo: 0 });
    });
  }

  async _onCrewLink(event) {
    event.preventDefault();
    const candidates = game.actors.filter(a => ['character', 'npc'].includes(a.type));
    if (!candidates.length) { ui.notifications.warn("No character or NPC actors exist to link as crew."); return; }
    const options = candidates.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML?.(a.name) ?? a.name}</option>`).join('');
    const result = await DialogV2.wait({
      window: { title: "Link Squad Leader", icon: "fa-solid fa-user-plus" },
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

  async _onWeaponAttack(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    const weapon = (this.actor.system.weapons || []).find(w => w.id === id);
    if (weapon) await weaponAttack(this.actor, weapon);
  }
}
