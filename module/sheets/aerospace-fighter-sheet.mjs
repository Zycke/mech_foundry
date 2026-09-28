import { MechFoundryUnitSheet } from "./unit-sheet.mjs";
import { actorSkillRating, applyCrewDamage, CREW_DAMAGE, AERO_GUNNERY_SKILLS, AERO_PILOTING_SKILLS } from "../helpers/atow-conversion.mjs";
import { weaponAttack } from "../helpers/tw-combat.mjs";
import { wakeRoll } from "../helpers/tw-falls.mjs";
import { aeroLanding, aeroManeuver, randomMovement, resolveAeroHeat, rollPendingControl } from "../helpers/tw-aero-flight.mjs";
import { pendingPSR } from "../helpers/tw-psr.mjs";

const { DialogV2 } = foundry.applications.api;

/** Armor facings in display order (each carries a threshold). */
const AERO_FACINGS = [
  { key: 'nose', label: 'Nose' },
  { key: 'leftWing', label: 'Left Wing' },
  { key: 'rightWing', label: 'Right Wing' },
  { key: 'aft', label: 'Aft' }
];

/** Critical-hit trackers with pip counts (Total Warfare aerospace). */
const AERO_CRITS = [
  { key: 'avionics', label: 'Avionics', max: 3 },
  { key: 'fcs', label: 'FCS', max: 3 },
  { key: 'sensors', label: 'Sensors', max: 3 },
  { key: 'engine', label: 'Engine', max: 3 }
];

const PILOT_HIT_MAX = 6;

/**
 * Aerospace Fighter Actor Sheet — Foundry v14, ApplicationV2.
 *
 * Status shows facing armor (with threshold) over the Structural Integrity pool,
 * an aerospace heat gauge with live effects, the flight block (thrust/velocity/
 * altitude/fuel), the critical-hit checklist, and the linkable pilot block.
 *
 * @extends {MechFoundryUnitSheet}
 */
export class MechFoundryAerospaceFighterSheet extends MechFoundryUnitSheet {

  #activeTab = null;
  #aeroBound = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet", "mech-sheet", "aerospace-fighter-sheet"],
    position: { width: 700, height: 740 }
  };

  /** @override */
  static PARTS = {
    form: {
      template: "systems/mech-foundry/templates/actor/actor-aerospace_fighter-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /** @override */
  static NUMERIC_WEAPON_FIELDS = ['heat', 'damage', 'rangeS', 'rangeM', 'rangeL', 'rangeE', 'ammo', 'shotsPerTon', 'clusterSize'];

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;
    const armor = sys.armor || {};

    const bar = (loc) => {
      const value = Number(loc?.value) || 0;
      const max = Number(loc?.max) || 0;
      return {
        value, max, threshold: Number(loc?.threshold) || 0,
        pct: max > 0 ? Math.round((value / max) * 100) : 0, damaged: value < max
      };
    };

    context.facings = AERO_FACINGS.map(f => ({ ...f, armor: bar(armor[f.key]) }));
    context.si = bar(sys.structuralIntegrity);

    const at = sys.derived?.armorTotal || { value: 0, max: 0 };
    context.armorTotal = { value: at.value, max: at.max, damaged: at.value < at.max };

    // Aerospace heat gauge + live effects.
    const heat = Number(sys.heat?.value) || 0;
    context.heat = { value: heat, scale: 30, pct: Math.min(100, Math.round((heat / 30) * 100)) };
    context.heatEffects = MechFoundryAerospaceFighterSheet.aeroHeatEffects(heat, !!sys.crits?.lifeSupport);

    // Flight.
    const safe = Number(sys.thrust?.safe) || 0;
    context.flight = {
      safe, max: Math.ceil(safe * 1.5),
      velocity: Number(sys.flight?.velocity) || 0,
      altitude: Number(sys.flight?.altitude) || 0,
      thrustSpent: Number(sys.flight?.thrustSpent) || 0,
      fuel: Number(sys.fuel) || 0
    };

    // Critical-hit pip trackers + flags.
    context.aeroCrits = AERO_CRITS.map(def => {
      const taken = Math.max(0, Math.min(def.max, Number(sys.crits?.[def.key]) || 0));
      return { ...def, pips: Array.from({ length: def.max }, (_, i) => i < taken) };
    });
    context.crits = sys.crits || {};
    context.conditions = sys.conditions || {};
    context.heatSinks = sys.heatSinks || { count: 0, type: 'single' };

    // Construction grid (Details tab).
    context.setupFacings = AERO_FACINGS.map(f => ({
      key: f.key, label: f.label,
      max: Number(armor[f.key]?.max) || 0, threshold: Number(armor[f.key]?.threshold) || 0
    }));
    context.siMax = Number(sys.structuralIntegrity?.max) || 0;

    // Pilot block + optional link (Gunnery/Aerospace, Piloting/Aerospace).
    const pilot = sys.crew || {};
    const linked = pilot.actorId ? game.actors.get(pilot.actorId) : null;
    const hits = Math.max(0, Math.min(PILOT_HIT_MAX, Number(pilot.hits) || 0));
    context.pilot = {
      name: pilot.name ?? '', gunnery: pilot.gunnery ?? 4, piloting: pilot.piloting ?? 5,
      hits, pips: Array.from({ length: PILOT_HIT_MAX }, (_, i) => i < hits),
      gunneryDerived: false, pilotingDerived: false,
      unconscious: linked ? !!linked.system?.unconscious : !!pilot.unconscious,
      dead: hits >= PILOT_HIT_MAX
    };
    context.pilotLinked = linked ? { id: linked.id, name: linked.name, img: linked.img } : null;
    const pend = pendingPSR(this.actor);
    context.controlPending = pend ? pend.reasons.map(r => r.label) : null;
    if (linked) {
      const g = actorSkillRating(linked, AERO_GUNNERY_SKILLS);
      const p = actorSkillRating(linked, AERO_PILOTING_SKILLS);
      if (g) { context.pilot.gunnery = g.rating; context.pilot.gunneryDerived = true; context.pilot.gunnerySource = `${linked.name}: ${g.skillName} Lvl ${g.level}`; }
      if (p) { context.pilot.piloting = p.rating; context.pilot.pilotingDerived = true; context.pilot.pilotingSource = `${linked.name}: ${p.skillName} Lvl ${p.level}`; }
    }

    return context;
  }

  /**
   * Aerospace heat-scale effects (Total Warfare). Firing/shutdown/ammo thresholds
   * match the mech scale; life-support overheat inflicts pilot damage at 15+/25+
   * only when the Life Support critical is present.
   */
  static aeroHeatEffects(heat, lifeSupportHit) {
    const h = Number(heat) || 0;
    const toHit = [8, 13, 17, 24].filter(t => h >= t).length;
    const pick = (table) => { let hit = null; for (const r of table) if (h >= r.at) hit = r; return hit; };
    const sd = pick([{ at: 14, text: '4+' }, { at: 18, text: '6+' }, { at: 22, text: '8+' }, { at: 26, text: '10+' }, { at: 30, text: 'Automatic' }]);
    const ammo = pick([{ at: 19, text: '4+' }, { at: 23, text: '6+' }, { at: 28, text: '8+' }]);
    let ls = { active: false, text: '—' };
    if (lifeSupportHit && h >= 25) ls = { active: true, text: '4 dmg' };
    else if (lifeSupportHit && h >= 15) ls = { active: true, text: '2 dmg' };
    else if (h >= 15) ls = { active: false, text: 'if life support hit' };
    return {
      toHit,
      shutdown: { active: !!sd, text: sd ? sd.text : '—' },
      ammo: { active: !!ammo, text: ammo ? ammo.text : '—' },
      lifeSupport: ls
    };
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.#aeroBound !== this.element) {
      this._activateAeroListeners($(this.element));
      this.#aeroBound = this.element;
    }
    this._applyActiveTab();
  }

  _activateAeroListeners(html) {
    html.on('click', '.sheet-tabs .item[data-tab]', (ev) => {
      ev.preventDefault();
      this.#activeTab = ev.currentTarget.dataset.tab;
      this._applyActiveTab();
    });
    if (!this.isEditable) return;
    html.on('click', '.crit-pip', this._onCritPip.bind(this));
    html.on('click', '.consc-pip', this._onPilotHitPip.bind(this));
    html.on('click', '.pilot-link', this._onPilotLink.bind(this));
    html.on('click', '.pilot-unlink', this._onPilotUnlink.bind(this));
    html.on('click', '.pilot-open', this._onPilotOpen.bind(this));
    html.on('click', '.weapon-attack', this._onWeaponAttack.bind(this));
    html.on('click', '.wake-roll', (ev) => { ev.preventDefault(); wakeRoll(this.actor); });
    html.on('click', '.resolve-heat', (ev) => { ev.preventDefault(); resolveAeroHeat(this.actor); });
    html.on('click', '.control-roll', (ev) => { ev.preventDefault(); rollPendingControl(this.actor); });
    html.on('click', '.random-move', (ev) => { ev.preventDefault(); randomMovement(this.actor); });
    html.on('click', '.aero-maneuver', (ev) => { ev.preventDefault(); aeroManeuver(this.actor); });
    html.on('click', '.aero-landing', (ev) => { ev.preventDefault(); aeroLanding(this.actor); });
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

  /** @override */
  async _onAddWeapon(event) {
    event.preventDefault();
    await this._updateWeapons(w => {
      w.push({ id: foundry.utils.randomID(), name: '', location: '', heat: 0, damage: 0, clusterSize: 0, rangeS: 0, rangeM: 0, rangeL: 0, rangeE: 0, ammoType: '', ammo: 0 });
    });
  }

  /** Generic crit-pip toggle (data-path/data-level). */
  async _onCritPip(event) {
    event.preventDefault();
    const { path, level } = event.currentTarget.dataset;
    const lvl = parseInt(level);
    const current = Number(foundry.utils.getProperty(this.actor.system, path)) || 0;
    const next = current === lvl ? lvl - 1 : lvl;
    await this.actor.update({ [`system.${path}`]: Math.max(0, next) });
  }

  /** Pilot consciousness pip: set hits; apply pilot-hit damage on increase when linked. */
  async _onPilotHitPip(event) {
    event.preventDefault();
    const lvl = parseInt(event.currentTarget.dataset.level);
    const current = Number(this.actor.system.crew?.hits) || 0;
    const next = Math.max(0, current === lvl ? lvl - 1 : lvl);
    await this.actor.update({ 'system.crew.hits': next });
    const delta = next - current;
    if (delta > 0) {
      const linked = game.actors.get(this.actor.system.crew?.actorId);
      if (linked) {
        let applied = 0;
        for (let i = 0; i < delta; i++) { if (!(await applyCrewDamage(linked, CREW_DAMAGE.pilotHit))) break; applied++; }
        if (applied) ui.notifications.info(`${this.actor.name}: applied ${applied} pilot hit(s) to ${linked.name} (${CREW_DAMAGE.pilotHit.bd} damage each).`);
      }
    }
  }

  async _onPilotLink(event) {
    event.preventDefault();
    const candidates = game.actors.filter(a => ['character', 'npc'].includes(a.type));
    if (!candidates.length) { ui.notifications.warn("No character or NPC actors exist to link as a pilot."); return; }
    const options = candidates.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML?.(a.name) ?? a.name}</option>`).join('');
    const result = await DialogV2.wait({
      window: { title: "Link Pilot", icon: "fa-solid fa-user-plus" },
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

  async _onPilotUnlink(event) { event.preventDefault(); await this.actor.update({ 'system.crew.actorId': '' }); }

  _onPilotOpen(event) {
    event.preventDefault();
    const actor = game.actors.get(this.actor.system.crew?.actorId);
    if (actor) actor.sheet.render(true); else ui.notifications.warn("Linked pilot actor was not found.");
  }

  async _onWeaponAttack(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.weaponId;
    const weapon = (this.actor.system.weapons || []).find(w => w.id === id);
    if (weapon) await weaponAttack(this.actor, weapon);
  }
}
