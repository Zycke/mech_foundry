import { MechFoundryActorSheetV2 } from "./base-actor-sheet.mjs";
import { currentTurnKey, fireWeapons, firedThisTurn, unjamWeapon, usesAmmo, weaponToHitPreview } from "../helpers/tw-combat.mjs";
import { MOVE_MODES, movedThisTurn, mpBreakdown, setMovement, weaponOwnToHit } from "../helpers/tw-movement.mjs";
import { c3Network, enemyECM, sideOf } from "../helpers/tw-ecm.mjs";
import { automatedAnimationsActive, sequencerActive } from "../helpers/tw-animate.mjs";
import { EXTERNAL_HEAT_CAP, MUNITIONS, externalHeat, guidable, hasAnyAmmo, munitionKeys, narcPods, taggedThisTurn, weaponKind } from "../helpers/tw-weapons.mjs";
import { torsoTwist } from "../helpers/tw-facing.mjs";
import { setTorsoTwist, twistText } from "../helpers/tw-facing-ui.mjs";
import { aeroMaxBracket, aeroTurnState, isAero, setAeroTurn } from "../helpers/tw-aero.mjs";
import { physicalAttack } from "../helpers/tw-physical.mjs";
import { boostArmed, boostTarget, tsmActive, unitGear } from "../helpers/tw-gear.mjs";
import { engageBoost } from "../helpers/tw-boost.mjs";
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
      outOfAmmo: usesAmmo(w) && !hasAnyAmmo(w),
      special: weaponSpecialContext(w, this.actor),
      animDelay: w.animationDelay === undefined || w.animationDelay === '' ? 50 : w.animationDelay,
      animDuration: Number(w.animationDuration) || 0,
      animShots: Number(w.animationShots) > 0 ? Number(w.animationShots) : -1,
      animSize: Number(w.animationSize) > 0 ? Number(w.animationSize) : 1
    }));
    const turnKey = currentTurnKey();
    const markers = { narc: narcPods(this.actor), tagged: taggedThisTurn(this.actor, turnKey), extHeat: Math.min(EXTERNAL_HEAT_CAP, externalHeat(this.actor, turnKey)) };
    markers.any = !!(markers.narc.length || markers.tagged || markers.extHeat);
    context.weaponMarkers = markers;
    // Weapon-fire animations (tw-animate.mjs): which animation modules are running.
    context.animStatus = { sequencer: sequencerActive(), aa: automatedAnimationsActive() };
    // This turn's movement (ground units, during combat): hexes accumulate from
    // token moves; the mode is inferred unless picked here (jumping must be picked).
    if (currentTurnKey() && ['mech', 'ground_vehicle', 'battle_armor', 'infantry'].includes(this.actor.type)) {
      const mv = movedThisTurn(this.actor);
      const vehicle = this.actor.type === 'ground_vehicle';
      const label = (m) => vehicle ? m.vlabel : m.label;
      context.turnMove = {
        hexes: mv.hexes,
        meters: Math.round(mv.meters),
        mpNote: mv.mp > mv.hexes ? mpBreakdown(mv) : '',
        twist: this.actor.type === 'mech' ? (() => { const dir = torsoTwist(this.actor, currentTurnKey()); return { dir, left: dir < 0, right: dir > 0, text: twistText(this.actor) || 'straight' }; })() : null,
        modes: [
          { key: 'auto', label: `Auto (${label(MOVE_MODES.find(m => m.key === mv.mode))})`, selected: !mv.modeSet },
          ...MOVE_MODES.map(m => ({ key: m.key, label: `${label(m)} (+${m.mod})`, selected: mv.modeSet && mv.mode === m.key }))
        ]
      };
    }
    if (['mech', 'ground_vehicle'].includes(this.actor.type)) context.gear = gearContext(this.actor);
    if (isAero(this.actor)) context.aeroTurn = { ...aeroTurnState(this.actor), inCombat: !!currentTurnKey() };
    // Infantry swarming or riding this unit.
    if (['mech', 'ground_vehicle', 'aerospace_fighter', 'small_craft'].includes(this.actor.type)) context.attachedInfantry = attachedSummary(this.actor);
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this._keepDetailsOpen();
    if (this.#boundElement !== this.element) {
      this._activateUnitListeners($(this.element));
      this.#boundElement = this.element;
    }
  }

  /** `<details data-keep="…">` blocks the user opened stay open through re-renders. */
  #openDetails = new Set();

  /**
   * Every field change re-renders the sheet, which would redraw these blocks
   * closed; only a click on the block's own title opens or closes it.
   */
  _keepDetailsOpen() {
    for (const d of this.element?.querySelectorAll?.('details[data-keep]') ?? []) {
      if (this.#openDetails.has(d.dataset.keep)) d.open = true;
      d.addEventListener('toggle', () => {
        if (d.open) this.#openDetails.add(d.dataset.keep);
        else this.#openDetails.delete(d.dataset.keep);
      });
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
    html.on('click', '.twist-set', (ev) => { ev.preventDefault(); setTorsoTwist(this.actor, Number(ev.currentTarget.dataset.dir)); });
    html.on('click', '.boost-arm', (ev) => { ev.preventDefault(); engageBoost(this.actor, ev.currentTarget.dataset.which); });
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
  static NUMERIC_WEAPON_FIELDS = ['shotsPerTon', 'heat', 'ammo', 'animationDelay', 'animationDuration'];

  async _onWeaponFieldChange(event) {
    const { weaponId, field } = event.currentTarget.dataset;
    const raw = event.currentTarget.value;
    const numeric = this.constructor.NUMERIC_WEAPON_FIELDS.includes(field);
    await this._updateWeapons(w => {
      const wpn = w.find(x => x.id === weaponId);
      if (!wpn) return false;
      // Blank means "automatic": the catalog to-hit modifier, cluster rounds from Rds.
      if (field === 'toHit') wpn[field] = String(raw).trim() === '' ? '' : (parseInt(raw) || 0);
      // Animation shots: -1 (or blank) = the rules count; size: a multiplier (blank = 1).
      else if (field === 'animationShots') wpn[field] = String(raw).trim() === '' ? -1 : Math.max(-1, parseInt(raw) || 0) || -1;
      else if (field === 'animationSize') { const v = parseFloat(raw); wpn[field] = Number.isFinite(v) && v > 0 ? v : 1; }
      else if (field === 'clusterAmmo' || Object.values(MUNITIONS).some(m => m.field === field)) wpn[field] = String(raw).trim() === '' ? '' : Math.max(0, parseInt(raw) || 0);
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
    toHitSet: set, autoToHitText: auto > 0 ? `+${auto}` : String(auto), clearable: !!(w.jammed || w.spent),
    // Special munitions this weapon can carry (a blank count = none).
    munitions: usesAmmo(w) ? munitionKeys(w).map(k => ({ key: k, field: MUNITIONS[k].field, short: MUNITIONS[k].short, label: MUNITIONS[k].label, value: w[MUNITIONS[k].field] ?? '' })) : []
  };
}

/** Special equipment for the sheet: chips, MASC / supercharger arming, the editable record. */
export function gearContext(actor) {
  const g = unitGear(actor);
  const rec = actor.system?.gear ?? {};
  const key = currentTurnKey();
  const chips = [];
  const chip = (label, rec2, extra = {}) => chips.push({ label, state: !rec2.working ? 'destroyed' : extra.state ?? 'ready', title: `${rec2.name || label}${!rec2.working ? ' — destroyed' : extra.title ? ` — ${extra.title}` : ''}` });
  if (g.masc.has) chip('MASC', g.masc, boostArmed(actor, 'masc', key) ? { state: 'on', title: 'armed this turn' } : {});
  if (g.supercharger.has) chip('Supercharger', g.supercharger, boostArmed(actor, 'supercharger', key) ? { state: 'on', title: 'armed this turn' } : {});
  if (g.tsm.has) chip('TSM', g.tsm, tsmActive(actor) ? { state: 'on', title: 'active (heat 9+): +2 Walking MP, double punch / kick / club damage' } : { title: 'active at heat 9+' });
  if (g.ecm.has) chip(`${{ guardian: 'Guardian', angel: 'Angel', clan: 'Clan', watchdog: 'Watchdog' }[g.ecm.kind] ?? ''} ECM`, g.ecm, { title: `${g.ecm.range} hexes` });
  if (g.probe.has) chip(`${{ beagle: 'Beagle', bloodhound: 'Bloodhound', clan: 'Clan', light: 'Light' }[g.probe.kind] ?? ''} Probe`, g.probe, { title: `${g.probe.range} hexes` });
  // On the map: is the unit inside an enemy ECM bubble, and who is on its C3 network now (tw-ecm.mjs)?
  const token = actor.getActiveTokens?.()[0] ?? null;
  const jam = token?.center ? enemyECM(sideOf(token), token.center) : null;
  if (g.c3.has) {
    const net = token && g.c3.working && g.c3.network ? c3Network(token) : null;
    const status = !g.c3.network ? { title: 'no network name set' }
      : !token ? {}
      : net ? { state: 'on', title: `linked: ${net.members.map(t => t.actor?.name).join(', ')}` }
      : { state: 'off', title: jam ? `cut off: inside ${jam.name}'s ECM` : g.c3.role === 'c3i' ? 'no link' : 'no working C3 master on the network' };
    chip(`C3 ${{ master: 'Master', slave: 'Slave', c3i: 'i' }[g.c3.role] ?? ''}${g.c3.network ? ` (${g.c3.network})` : ''}`.replace('C3 i', 'C3i'), g.c3, status);
  }
  if (jam) chips.push({ label: 'Enemy ECM', state: 'off', title: `Inside ${jam.name}'s ECM: no C3 link; Artemis / probe lines through it fail` });
  const boosts = [];
  if (key) for (const [which, label] of [['masc', 'MASC'], ['supercharger', 'Supercharger']]) {
    if (!g[which].has) continue;
    const st = actor.flags?.['mech-foundry']?.boost;
    const failed = st?.key === key && !!st.failed?.[which];
    const armed = boostArmed(actor, which, key);
    const tn = boostTarget(actor, which, key);
    boosts.push({ which, label, tn, armed, failed, can: g[which].working && !armed && !failed,
      title: armed ? `${label} armed this turn` : failed ? `${label} failed this turn` : `Arm ${label} for this turn: 2D6 ≥ ${tn} (a lower roll fails)` });
  }
  const opts = (list, cur) => list.map(([value, label]) => ({ value, label, selected: String(cur ?? '') === value }));
  return {
    chips, boosts, mech: actor.type === 'mech',
    edit: { masc: !!rec.masc, supercharger: !!rec.supercharger, tsm: !!rec.tsm, c3Network: rec.c3Network ?? '' },
    ecmOptions: opts([['', '— (or from crits)'], ['guardian', 'Guardian ECM'], ['angel', 'Angel ECM'], ['clan', 'Clan ECM'], ['watchdog', 'Watchdog CEWS']], rec.ecm),
    probeOptions: opts([['', '— (or from crits)'], ['beagle', 'Beagle (4)'], ['clan', 'Clan (5)'], ['bloodhound', 'Bloodhound (8)'], ['light', 'Light (3)']], rec.probe),
    c3Options: opts([['', '— (or from crits)'], ['master', 'C3 Master'], ['slave', 'C3 Slave'], ['c3i', 'C3i']], rec.c3)
  };
}
