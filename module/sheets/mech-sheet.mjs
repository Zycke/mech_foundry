import { MechFoundryUnitSheet } from "./unit-sheet.mjs";
import { actorSkillRating, applyCrewDamage, CREW_DAMAGE, MECH_GUNNERY_SKILLS, MECH_PILOTING_SKILLS } from "../helpers/atow-conversion.mjs";
import { weaponAttack, resolveMechHeat, standardMechSlots, SLOT_TYPES } from "../helpers/tw-combat.mjs";

const CRIT_LOCATIONS = [
  ['head', 'Head'], ['ct', 'Center Torso'], ['lt', 'Left Torso'], ['rt', 'Right Torso'],
  ['la', 'Left Arm'], ['ra', 'Right Arm'], ['ll', 'Left Leg'], ['rl', 'Right Leg']
];

const { DialogV2 } = foundry.applications.api;

/** Armor locations in display order, with rear-armor mapping for torsos. */
const ARMOR_LOCATIONS = [
  { key: 'la', label: 'Left Arm', code: 'LA', col: 'left' },
  { key: 'lt', label: 'Left Torso', code: 'LT', col: 'left', rear: 'ltRear' },
  { key: 'll', label: 'Left Leg', code: 'LL', col: 'left' },
  { key: 'head', label: 'Head', code: 'HD', col: 'center' },
  { key: 'ct', label: 'Center Torso', code: 'CT', col: 'center', rear: 'ctRear' },
  { key: 'ra', label: 'Right Arm', code: 'RA', col: 'right' },
  { key: 'rt', label: 'Right Torso', code: 'RT', col: 'right', rear: 'rtRear' },
  { key: 'rl', label: 'Right Leg', code: 'RL', col: 'right' }
];

/** System-hit trackers: max crit slots per system. */
const SYSTEM_HITS = [
  { key: 'engine', label: 'Engine', max: 3 },
  { key: 'gyro', label: 'Gyro', max: 2 },
  { key: 'sensors', label: 'Sensors', max: 2 },
  { key: 'lifeSupport', label: 'Life Support', max: 2 }
];

/** Pilot hit ladder length (0 undamaged … 6 dead). */
const PILOT_HIT_MAX = 6;

/**
 * BattleMech Actor Sheet (Foundry v14, ApplicationV2).
 *
 * Status tab shows the armor-over-structure location map (current / max with
 * bars), a heat gauge with a live effect readout, movement, conditions and the
 * (optionally linked) pilot block. Combat holds the weapons table; Crits &
 * Loadout the system-hit trackers and heat sinks; Details the construction data
 * and biography. Construction values are stored as entered — no auto-derivation.
 *
 * @extends {MechFoundryUnitSheet}
 */
export class MechFoundryMechSheet extends MechFoundryUnitSheet {

  #activeTab = null;
  #mechBound = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet", "mech-sheet"],
    position: { width: 720, height: 760 }
  };

  /** @override — mech uses its own template, not the shared placeholder. */
  static PARTS = {
    form: {
      template: "systems/mech-foundry/templates/actor/actor-mech-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /** Weapon fields stored as integers on this sheet. */
  static NUMERIC_WEAPON_FIELDS = ['heat', 'damage', 'rangeS', 'rangeM', 'rangeL', 'ammo', 'shotsPerTon', 'clusterSize'];

  /* -------------------------------------------- */
  /*  Context                                      */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;

    // Armor / structure location map + running totals.
    const armor = sys.armor || {};
    const structure = sys.structure || {};
    const bar = (loc) => {
      const value = Number(loc?.value) || 0;
      const max = Number(loc?.max) || 0;
      return { value, max, pct: max > 0 ? Math.round((value / max) * 100) : 0, damaged: value < max };
    };

    let armorVal = 0, armorMax = 0, structVal = 0, structMax = 0;
    const cols = { left: [], center: [], right: [] };
    for (const def of ARMOR_LOCATIONS) {
      const a = bar(armor[def.key]);
      const s = bar(structure[def.key]);
      armorVal += a.value; armorMax += a.max;
      structVal += s.value; structMax += s.max;
      let rear = null;
      if (def.rear) {
        rear = bar(armor[def.rear]);
        armorVal += rear.value; armorMax += rear.max;
        rear.rearKey = def.rear;
      }
      cols[def.col].push({ ...def, armor: a, structure: s, rear });
    }
    context.mechLocations = cols;
    context.armorTotal = { value: armorVal, max: armorMax, damaged: armorVal < armorMax };
    context.structureTotal = { value: structVal, max: structMax, damaged: structVal < structMax };

    // Construction grid (Details tab): the "max" values, entered once per record sheet.
    context.setupLocations = ARMOR_LOCATIONS.map(def => ({
      key: def.key, label: def.label, code: def.code,
      rearKey: def.rear || null,
      armorMax: Number(armor[def.key]?.max) || 0,
      rearMax: def.rear ? (Number(armor[def.rear]?.max) || 0) : null,
      structMax: Number(structure[def.key]?.max) || 0
    }));

    // Movement (run is derived; jump entered).
    const walk = Number(sys.movement?.walk) || 0;
    context.movement = {
      walk,
      run: Math.ceil(walk * 1.5),
      jump: Number(sys.movement?.jump) || 0
    };

    // Heat + live effects.
    context.heat = {
      value: Number(sys.heat?.value) || 0,
      scale: 30
    };
    context.heat.pct = Math.min(100, Math.round((context.heat.value / context.heat.scale) * 100));
    context.heatEffects = MechFoundryMechSheet.heatEffects(context.heat.value);

    // System-hit trackers (render pips).
    context.systemHits = SYSTEM_HITS.map(def => {
      const taken = Math.max(0, Math.min(def.max, Number(sys.systemHits?.[def.key]) || 0));
      return { ...def, taken, pips: Array.from({ length: def.max }, (_, i) => i < taken) };
    });

    // Pilot block + optional actor link.
    const pilot = sys.pilot || {};
    const linked = pilot.actorId ? game.actors.get(pilot.actorId) : null;
    const hits = Math.max(0, Math.min(PILOT_HIT_MAX, Number(pilot.hits) || 0));
    context.pilot = {
      name: pilot.name ?? '',
      gunnery: pilot.gunnery ?? 4,
      piloting: pilot.piloting ?? 5,
      hits,
      pips: Array.from({ length: PILOT_HIT_MAX }, (_, i) => i < hits),
      gunneryDerived: false,
      pilotingDerived: false
    };
    context.pilotLinked = linked ? { id: linked.id, uuid: linked.uuid, name: linked.name, img: linked.img } : null;

    // When linked, derive Gunnery/Piloting live from the character's AToW skills
    // (TW Rating = Base TN − Skill Level; A Time of War pp. 42-43).
    if (linked) {
      const g = actorSkillRating(linked, MECH_GUNNERY_SKILLS);
      const p = actorSkillRating(linked, MECH_PILOTING_SKILLS);
      if (g) {
        context.pilot.gunnery = g.rating;
        context.pilot.gunneryDerived = true;
        context.pilot.gunnerySource = `${linked.name}: ${g.skillName} Lvl ${g.level}`;
      }
      if (p) {
        context.pilot.piloting = p.rating;
        context.pilot.pilotingDerived = true;
        context.pilot.pilotingSource = `${linked.name}: ${p.skillName} Lvl ${p.level}`;
      }
    }

    context.conditions = sys.conditions || {};
    context.heatSinks = sys.heatSinks || { count: 0, type: 'single' };

    // Critical slots (Crits & Loadout tab).
    const cs = sys.critSlots || {};
    context.critSlotLocations = CRIT_LOCATIONS.map(([key, label]) => ({
      key, label,
      slots: (cs[key] || []).map((s, i) => ({ index: i + 1, name: s.name, type: s.type, hit: !!s.hit }))
    }));
    context.hasCritSlots = CRIT_LOCATIONS.some(([k]) => (cs[k] || []).length > 0);
    context.slotTypes = SLOT_TYPES;

    return context;
  }

  /**
   * BattleMech heat-scale effects (Total Warfare). Returns the live movement
   * and firing penalties plus the current shutdown / ammo-explosion avoid rolls.
   * @param {number} heat
   */
  static heatEffects(heat) {
    const h = Number(heat) || 0;
    // Movement: -1 MP per full 5 heat (max -5 at 25).
    const mp = Math.min(5, Math.floor(h / 5));
    // Firing to-hit: +1@8, +2@13, +3@17, +4@24.
    const toHit = [8, 13, 17, 24].filter(t => h >= t).length;
    const pick = (table) => {
      let hit = null;
      for (const row of table) if (h >= row.at) hit = row;
      return hit;
    };
    const sd = pick([
      { at: 14, text: '4+' }, { at: 18, text: '6+' }, { at: 22, text: '8+' },
      { at: 26, text: '10+' }, { at: 30, text: 'Automatic' }
    ]);
    const ammo = pick([
      { at: 19, text: '4+' }, { at: 23, text: '6+' }, { at: 28, text: '8+' }
    ]);
    return {
      mp, toHit,
      shutdown: { active: !!sd, text: sd ? sd.text : '—' },
      ammo: { active: !!ammo, text: ammo ? ammo.text : '—' },
      auto: h >= 30
    };
  }

  /* -------------------------------------------- */
  /*  Rendering / listeners                        */
  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.#mechBound !== this.element) {
      this._activateMechListeners($(this.element));
      this.#mechBound = this.element;
    }
    this._applyActiveTab();
  }

  _activateMechListeners(html) {
    html.on('click', '.sheet-tabs .item[data-tab]', (ev) => {
      ev.preventDefault();
      this.#activeTab = ev.currentTarget.dataset.tab;
      this._applyActiveTab();
    });
    if (!this.isEditable) return;
    html.on('click', '.sys-pip', this._onSystemHitPip.bind(this));
    html.on('click', '.consc-pip', this._onPilotHitPip.bind(this));
    html.on('click', '.pilot-link', this._onPilotLink.bind(this));
    html.on('click', '.pilot-unlink', this._onPilotUnlink.bind(this));
    html.on('click', '.pilot-open', this._onPilotOpen.bind(this));
    html.on('click', '.weapon-attack', this._onWeaponAttack.bind(this));
    html.on('click', '.resolve-heat', (ev) => { ev.preventDefault(); resolveMechHeat(this.actor); });
    html.on('click', '.init-critslots', this._onInitCritSlots.bind(this));
    html.on('change', '.critslot-field', this._onCritSlotFieldChange.bind(this));
    html.on('change', '.critslot-hit', this._onCritSlotHitToggle.bind(this));
  }

  async _updateCritSlots(mutator) {
    const cs = foundry.utils.deepClone(this.actor.system.critSlots || {});
    if (mutator(cs) === false) return;
    await this.actor.update({ 'system.critSlots': cs });
  }

  /** Fill the standard biped layout for any location that has no slots yet. */
  async _onInitCritSlots(event) {
    event.preventDefault();
    const std = standardMechSlots();
    await this._updateCritSlots(cs => {
      let filled = 0;
      for (const [key] of CRIT_LOCATIONS) {
        if (!Array.isArray(cs[key]) || cs[key].length === 0) { cs[key] = std[key]; filled++; }
      }
      if (!filled) { ui.notifications.info("Critical slots are already initialized."); return false; }
    });
  }

  async _onCritSlotFieldChange(event) {
    const { loc, index, field } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    await this._updateCritSlots(cs => {
      const slot = cs[loc]?.[parseInt(index)];
      if (!slot) return false;
      slot[field] = value;
    });
  }

  async _onCritSlotHitToggle(event) {
    const { loc, index } = event.currentTarget.dataset;
    const checked = event.currentTarget.checked;
    await this._updateCritSlots(cs => {
      const slot = cs[loc]?.[parseInt(index)];
      if (!slot) return false;
      slot.hit = checked;
    });
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
  /*  Handlers                                     */
  /* -------------------------------------------- */

  /** @override — richer default weapon for the mech combat table. */
  async _onAddWeapon(event) {
    event.preventDefault();
    await this._updateWeapons(w => {
      w.push({
        id: foundry.utils.randomID(), name: '', location: '',
        heat: 0, damage: 0, clusterSize: 0, rangeS: 0, rangeM: 0, rangeL: 0, ammoType: '', ammo: 0
      });
    });
  }

  /** Click a system-hit pip: set the level, or clear it if already at that level. */
  async _onSystemHitPip(event) {
    event.preventDefault();
    const { sys, level } = event.currentTarget.dataset;
    const lvl = parseInt(level);
    const current = Number(this.actor.system.systemHits?.[sys]) || 0;
    const next = current === lvl ? lvl - 1 : lvl;
    await this.actor.update({ [`system.systemHits.${sys}`]: Math.max(0, next) });
  }

  /**
   * Click a consciousness pip: set pilot hits, or clear if already at that level.
   * When hits increase and a character is linked, apply the AToW pilot-hit damage
   * (1B/3 per hit, MechWarrior/Pilot/Crew Damage Table) to that character.
   */
  async _onPilotHitPip(event) {
    event.preventDefault();
    const lvl = parseInt(event.currentTarget.dataset.level);
    const current = Number(this.actor.system.pilot?.hits) || 0;
    const next = Math.max(0, current === lvl ? lvl - 1 : lvl);
    await this.actor.update({ 'system.pilot.hits': next });
    const delta = next - current;
    if (delta > 0) await this._applyPilotHits(delta);
  }

  /** Apply `count` pilot-hit damage events to the linked character. */
  async _applyPilotHits(count) {
    const linked = game.actors.get(this.actor.system.pilot?.actorId);
    if (!linked) return;
    let applied = 0;
    for (let i = 0; i < count; i++) {
      if (!(await applyCrewDamage(linked, CREW_DAMAGE.pilotHit))) break;
      applied++;
    }
    if (applied) {
      ui.notifications.info(`${this.actor.name}: applied ${applied} pilot hit(s) to ${linked.name} (${CREW_DAMAGE.pilotHit.bd} damage each).`);
    }
  }

  /** Link the pilot block to a world character/NPC actor. */
  async _onPilotLink(event) {
    event.preventDefault();
    const candidates = game.actors.filter(a => ['character', 'npc'].includes(a.type));
    if (!candidates.length) {
      ui.notifications.warn("No character or NPC actors exist to link as a pilot.");
      return;
    }
    const options = candidates
      .map(a => `<option value="${a.id}">${foundry.utils.escapeHTML?.(a.name) ?? a.name}</option>`)
      .join('');
    const result = await DialogV2.wait({
      window: { title: "Link Pilot / Crew", icon: "fa-solid fa-user-plus" },
      content: `<div class="form-group"><label>Actor</label><select name="actorId">${options}</select></div>`,
      buttons: [
        {
          action: "link", label: "Link", icon: "fa-solid fa-link", default: true,
          callback: (ev, button) => button.form.elements.actorId.value
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
      ],
      rejectClose: false
    });
    if (!result || result === "cancel") return;
    const actor = game.actors.get(result);
    if (!actor) return;
    const update = { 'system.pilot.actorId': actor.id };
    if (!this.actor.system.pilot?.name) update['system.pilot.name'] = actor.name;
    await this.actor.update(update);
  }

  async _onPilotUnlink(event) {
    event.preventDefault();
    await this.actor.update({ 'system.pilot.actorId': '' });
  }

  _onPilotOpen(event) {
    event.preventDefault();
    const actor = game.actors.get(this.actor.system.pilot?.actorId);
    if (actor) actor.sheet.render(true);
    else ui.notifications.warn("Linked pilot actor was not found.");
  }

  /** Open the GATOR to-hit dialog for the clicked weapon. */
  async _onWeaponAttack(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    const weapon = (this.actor.system.weapons || []).find(w => w.id === id);
    if (weapon) await weaponAttack(this.actor, weapon);
  }
}
