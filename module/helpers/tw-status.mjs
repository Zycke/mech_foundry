/**
 * Token status icons for combat units, mirrored from their data so the map
 * shows what the sheets know: prone, shut down, warrior unconscious, immobile,
 * out of control, and a pending Piloting Skill Roll. Uses Foundry's status
 * effects (actor.toggleStatusEffect); the client that made the change syncs.
 */
import { pilotUnconscious } from "./tw-movement.mjs";
import { pendingPSR } from "./tw-psr.mjs";

const UNIT_TYPES = new Set(['mech', 'ground_vehicle', 'aerospace_fighter', 'small_craft', 'battle_armor']);

/** Status effects added to CONFIG.statusEffects. */
export const UNIT_STATUSES = [
  { id: 'mfProne', name: 'Prone', img: 'icons/svg/falling.svg' },
  { id: 'mfShutdown', name: 'Shut Down', img: 'icons/svg/downgrade.svg' },
  { id: 'mfPilotOut', name: 'Warrior Unconscious', img: 'icons/svg/unconscious.svg' },
  { id: 'mfImmobile', name: 'Immobile', img: 'icons/svg/net.svg' },
  { id: 'mfOutOfControl', name: 'Out of Control', img: 'icons/svg/daze.svg' },
  { id: 'mfPSR', name: 'Piloting Skill Roll Pending', img: 'icons/svg/hazard.svg' }
];

const n = (v) => Number(v) || 0;
const gone = (loc) => !!loc && n(loc.max) > 0 && n(loc.value) <= 0;

/**
 * Is the unit destroyed (TW "Destroying a Unit")? 'Mech: head or center torso
 * destroyed, three engine hits, cockpit destroyed, or its (sheet-only) warrior
 * killed. Vehicle: internal structure gone. Aerospace: Structural Integrity 0.
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
  if (actor?.type === 'ground_vehicle') return gone(sys.structure);
  if (actor?.type === 'aerospace_fighter' || actor?.type === 'small_craft') return gone(sys.structuralIntegrity);
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

/** Register the statuses (init) and the sync hooks. */
export function registerUnitStatuses() {
  Hooks.once("init", () => {
    const have = new Set((CONFIG.statusEffects || []).map(s => s.id));
    for (const s of UNIT_STATUSES) if (!have.has(s.id)) CONFIG.statusEffects.push({ ...s });
  });
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
