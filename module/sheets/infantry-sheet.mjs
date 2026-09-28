import { MechFoundryUnitSheet } from "./unit-sheet.mjs";
import { actorSkillRating, INFANTRY_GUNNERY_SKILLS, INFANTRY_SKILL_BASE_TN } from "../helpers/atow-conversion.mjs";
import { fireWeapons, weaponToHitPreview } from "../helpers/tw-combat.mjs";
import {
  CI_WEAPONS, MECHANIZED_TYPES, PLATOON_TYPES, attachedCarrier, attachment, ciDamage, ciRangeBracket, genericPlatoon, liveTroopers
} from "../helpers/tw-infantry.mjs";
import { antiMechCapability, swarmDamageBlock } from "../helpers/tw-antimech.mjs";

const { DialogV2 } = foundry.applications.api;
const opts = (map, current) => Object.entries(map).map(([key, label]) => ({ key, label, selected: key === current }));

/**
 * Conventional Infantry Actor Sheet — Foundry v14, ApplicationV2. One actor is
 * a whole platoon: its type (foot / motorized / jump / mechanized), weapon
 * type and active troopers drive its single attack (Generic Conventional
 * Infantry tables). "Generic platoon" fills troopers and MP from the table.
 *
 * @extends {MechFoundryUnitSheet}
 */
export class MechFoundryInfantrySheet extends MechFoundryUnitSheet {

  #infBound = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["mech-foundry", "sheet", "actor", "unit-sheet", "mech-sheet", "infantry-sheet"],
    position: { width: 640, height: 640 }
  };

  /** @override */
  static PARTS = {
    form: {
      template: "systems/mech-foundry/templates/actor/actor-infantry-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;
    const type = sys.weaponType || 'rifleBallistic';
    const t = sys.troopers || {};
    const value = Math.max(0, Number(t.value) || 0), max = Math.max(0, Number(t.max) || 0);
    context.platoon = {
      value, max, pct: max > 0 ? Math.round((value / max) * 100) : 0, damaged: value < max,
      mechanized: sys.platoonType === 'mechanized', wound: Number(t.wound) || 0,
      damage: ciDamage(type, liveTroopers(this.actor)),
      ranges: Array.from({ length: 10 }, (_, d) => { const r = ciRangeBracket(type, d); return { d, text: r.inRange ? `${r.mod >= 0 ? '+' : ''}${r.mod}` : '—' }; }),
      generic: genericPlatoon(sys)
    };
    context.techBases = opts({ is: 'Inner Sphere', clan: 'Clan' }, sys.techBase || 'is');
    context.platoonTypes = opts(PLATOON_TYPES, sys.platoonType || 'foot');
    context.mechanizedTypes = opts(MECHANIZED_TYPES, sys.mechanizedType || 'tracked');
    context.weaponTypes = opts(CI_WEAPONS, type);
    context.attackToHit = weaponToHitPreview(this.actor).platoon || null;
    context.zeroMP = !Number(sys.movement?.ground) && !Number(sys.movement?.jump);

    const att = attachment(this.actor);
    if (att?.mode === 'swarm') {
      context.attached = { swarm: true, carrierName: attachedCarrier(this.actor)?.name ?? '(unit not found)', swarmBlock: swarmDamageBlock(this.actor) };
    }
    context.antiMechBlock = antiMechCapability(this.actor);

    const crew = sys.crew || {};
    const linked = crew.actorId ? game.actors.get(crew.actorId) : null;
    context.crew = { name: crew.name ?? '', gunnery: crew.gunnery ?? 4, antiMech: crew.antiMech ?? 5, gunneryDerived: false };
    context.crewLinked = linked ? { id: linked.id, name: linked.name, img: linked.img } : null;
    if (linked) {
      const g = actorSkillRating(linked, INFANTRY_GUNNERY_SKILLS, INFANTRY_SKILL_BASE_TN);
      if (g) Object.assign(context.crew, { gunnery: g.rating, gunneryDerived: true, gunnerySource: `${linked.name}: ${g.skillName} Lvl ${g.level}` });
    }
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.#infBound !== this.element) {
      this._activateInfantryListeners($(this.element));
      this.#infBound = this.element;
    }
  }

  _activateInfantryListeners(html) {
    if (!this.isEditable) return;
    html.on('click', '.platoon-attack', (ev) => { ev.preventDefault(); fireWeapons(this.actor, ['platoon']); });
    html.on('click', '.generic-platoon', this._onGenericPlatoon.bind(this));
    html.on('click', '.crew-link', this._onCrewLink.bind(this));
    html.on('click', '.crew-unlink', async (ev) => { ev.preventDefault(); await this.actor.update({ 'system.crew.actorId': '' }); });
    html.on('click', '.crew-open', (ev) => {
      ev.preventDefault();
      const a = game.actors.get(this.actor.system.crew?.actorId);
      if (a) a.sheet.render(true); else ui.notifications.warn("Linked crew actor was not found.");
    });
  }

  /** Fill troopers and MP from the Generic Conventional Infantry Units Table. */
  async _onGenericPlatoon(event) {
    event.preventDefault();
    const g = genericPlatoon(this.actor.system);
    if (!g) return;
    await this.actor.update({
      'system.troopers': { value: g.troopers, max: g.troopers, wound: 0 },
      'system.movement': { ground: g.ground, jump: g.jump }
    });
  }

  async _onCrewLink(event) {
    event.preventDefault();
    const candidates = game.actors.filter(a => ['character', 'npc'].includes(a.type));
    if (!candidates.length) { ui.notifications.warn("No character or NPC actors exist to link."); return; }
    const options = candidates.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML?.(a.name) ?? a.name}</option>`).join('');
    const result = await DialogV2.wait({
      window: { title: "Link Platoon Leader", icon: "fa-solid fa-user-plus" },
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
}
