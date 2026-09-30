/**
 * Token status icons for combat units, mirrored from their data so the map
 * shows what the sheets know: prone, shut down, warrior unconscious, immobile,
 * out of control, and a pending Piloting Skill Roll. Uses Foundry's status
 * effects (actor.toggleStatusEffect); the client that made the change syncs.
 *
 * "Inside a Building" follows the token instead: on whenever a ground unit's
 * token stands inside a building terrain region below its roof (the rule the
 * combat code uses — tw-buildings buildingAround). It is re-checked when the
 * token moves or changes elevation, and for every token on the scene when a
 * terrain region is drawn, moved, changed (e.g. collapsed to rubble) or deleted.
 */
import { pilotUnconscious } from "./tw-movement.mjs";
import { pendingPSR } from "./tw-psr.mjs";
import { crewStunnedNow } from "./tw-combat.mjs";
import { liveTroopers } from "./tw-infantry.mjs";
import { buildingAround } from "./tw-buildings.mjs";
import { TERRAIN_BEHAVIOR } from "./tw-terrain.mjs";

const UNIT_TYPES = new Set(['mech', 'ground_vehicle', 'aerospace_fighter', 'small_craft', 'battle_armor', 'infantry']);

/** Status effects added to CONFIG.statusEffects. */
export const UNIT_STATUSES = [
  { id: 'mfProne', name: 'Prone', img: 'icons/svg/falling.svg' },
  { id: 'mfShutdown', name: 'Shut Down', img: 'icons/svg/downgrade.svg' },
  { id: 'mfPilotOut', name: 'Warrior Unconscious', img: 'icons/svg/unconscious.svg' },
  { id: 'mfImmobile', name: 'Immobile', img: 'icons/svg/net.svg' },
  { id: 'mfOutOfControl', name: 'Out of Control', img: 'icons/svg/daze.svg' },
  { id: 'mfPSR', name: 'Piloting / Control Roll Pending', img: 'icons/svg/hazard.svg' },
  { id: 'mfStunned', name: 'Crew Stunned', img: 'icons/svg/paralysis.svg' },
  { id: 'mfInBuilding', name: 'Inside a Building', img: 'icons/svg/house.svg' }
];

/** Units that can be inside a building (ground units; aerospace units can't). */
const BUILDING_UNITS = new Set(['mech', 'ground_vehicle', 'battle_armor', 'infantry']);

const n = (v) => Number(v) || 0;
const gone = (loc) => !!loc && n(loc.max) > 0 && n(loc.value) <= 0;

/**
 * Is the unit destroyed (TW "Destroying a Unit")? 'Mech: head or center torso
 * destroyed, three engine hits, cockpit destroyed, or its (sheet-only) warrior
 * killed. Vehicle: internal structure gone. Aerospace: Structural Integrity 0.
 * Battle armor / conventional infantry: every trooper gone.
 */
export function unitDestroyed(actor) {
  const sys = actor?.system || {};
  if (actor?.type === 'mech') {
    const st = sys.structure || {};
    if (gone(st.ct) || gone(st.head)) return true;
    if (n(sys.systemHits?.engine) >= 3) return true;
    if ((sys.critSlots?.head || []).some(x => x?.type === 'cockpit' && x.hit)) return true;
    return !sys.pilot?.actorId && n(sys.pilot?.hits) >= 6;
  }
  if (actor?.type === 'ground_vehicle') return gone(sys.structure) || !!sys.conditions?.crewKilled;
  if (actor?.type === 'aerospace_fighter' || actor?.type === 'small_craft') return gone(sys.structuralIntegrity);
  if (actor?.type === 'battle_armor' || actor?.type === 'infantry') return liveTroopers(actor) <= 0;
  return false;
}

/** Which unit statuses should be on for an actor right now. */
export function desiredStatuses(actor) {
  const c = actor?.system?.conditions || {};
  return {
    mfProne: actor.type === 'mech' && !!c.prone,
    mfShutdown: !!c.shutdown,
    mfPilotOut: ['mech', 'aerospace_fighter', 'small_craft'].includes(actor.type) && pilotUnconscious(actor),
    mfImmobile: actor.type === 'ground_vehicle' && !!c.immobile,
    mfOutOfControl: !!c.outOfControl,
    mfPSR: !!pendingPSR(actor),
    mfStunned: actor.type === 'ground_vehicle' && !!c.stunned && crewStunnedNow(actor),
    dead: unitDestroyed(actor) // Foundry's core defeated status (skull overlay)
  };
}

/** Toggle the unit's status effects to match its data. */
export async function syncUnitStatuses(actor) {
  if (!actor || !UNIT_TYPES.has(actor.type) || !(actor.isOwner || game.user.isGM)) return;
  if (typeof actor.toggleStatusEffect !== 'function') return;
  for (const [id, want] of Object.entries(desiredStatuses(actor))) {
    const has = !!actor.statuses?.has(id);
    if (has === want) continue;
    if (id === 'dead' && !(CONFIG.statusEffects || []).some(e => e.id === 'dead')) continue;
    await actor.toggleStatusEffect(id, id === 'dead' ? { active: want, overlay: true } : { active: want });
  }
}

/**
 * Set a token's "Inside a Building" status from where it stands.
 * @param {TokenDocument} doc
 * @returns {Promise<boolean|null>} whether it's inside (null when not checked)
 */
export async function syncBuildingStatus(doc) {
  const actor = doc?.actor;
  if (!actor || !BUILDING_UNITS.has(actor.type) || !(actor.isOwner || game.user.isGM)) return null;
  if (typeof actor.toggleStatusEffect !== 'function') return null;
  const want = !!buildingAround(actor, doc);
  if (!!actor.statuses?.has('mfInBuilding') !== want) await actor.toggleStatusEffect('mfInBuilding', { active: want });
  return want;
}

/** Re-check every unit token on a scene (the active GM, after a terrain region changes). */
export async function syncSceneBuildingStatuses(scene) {
  if (!scene || !isActiveGM()) return;
  for (const doc of scene.tokens ?? []) await syncBuildingStatus(doc);
}

function isActiveGM() {
  const gm = game.users?.activeGM;
  return !!game.user?.isGM && (!gm || gm.id === game.user.id);
}

const regionScene = (region) => region?.parent ?? null;
const hasTerrain = (region) => (region?.behaviors ?? []).some(b => b.type === TERRAIN_BEHAVIOR);

/** Register the statuses (init) and the sync hooks. */
export function registerUnitStatuses() {
  Hooks.once("init", () => {
    const have = new Set((CONFIG.statusEffects || []).map(s => s.id));
    for (const s of UNIT_STATUSES) if (!have.has(s.id)) CONFIG.statusEffects.push({ ...s });
  });
  // Inside a building: follow the token …
  Hooks.on("updateToken", (doc, changes, options, userId) => {
    if (userId !== game.user.id || !('x' in changes || 'y' in changes || 'elevation' in changes)) return;
    return syncBuildingStatus(doc);
  });
  Hooks.on("createToken", (doc, options, userId) => userId === game.user.id ? syncBuildingStatus(doc) : undefined);
  // … and the terrain: re-check the scene when a building region changes.
  const behaviorChanged = (behavior) => behavior?.type === TERRAIN_BEHAVIOR ? syncSceneBuildingStatuses(regionScene(behavior.parent)) : undefined;
  Hooks.on("createRegionBehavior", behaviorChanged);
  Hooks.on("updateRegionBehavior", behaviorChanged);
  Hooks.on("deleteRegionBehavior", behaviorChanged);
  Hooks.on("updateRegion", (region, changes) => hasTerrain(region) && ('shapes' in changes || 'elevation' in changes) ? syncSceneBuildingStatuses(regionScene(region)) : undefined);
  Hooks.on("deleteRegion", (region) => hasTerrain(region) ? syncSceneBuildingStatuses(regionScene(region)) : undefined);
  Hooks.on("canvasReady", (canvas) => syncSceneBuildingStatuses(canvas?.scene));
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id) return;
    if (UNIT_TYPES.has(actor.type)) { syncUnitStatuses(actor); return; }
    // A linked pilot / crew character changed (e.g. knocked unconscious).
    if (!foundry.utils.hasProperty(changes, 'system.unconscious')) return;
    for (const unit of game.actors ?? []) {
      const crew = unit.system?.pilot || unit.system?.crew;
      if (UNIT_TYPES.has(unit.type) && crew?.actorId === actor.id) syncUnitStatuses(unit);
    }
  });
}
