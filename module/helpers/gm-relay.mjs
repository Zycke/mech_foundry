/**
 * GM relay for combat writes.
 *
 * In Foundry a player can only update documents they own, but in combat a
 * player's attack has to damage the GM's units. This relay lets a player's
 * client ask the active GM's client to apply a specific, whitelisted write
 * (the same executeAsGM pattern many systems use), over the system socket.
 *
 * Scope is deliberately narrow — the GM client re-validates every request:
 *  - `update`: only combat-unit damage fields, or `system.unconscious: true`
 *    on a character / NPC.
 *  - other ops (e.g. `crewDamage`) are registered by the modules that own them
 *    and must validate their own payloads.
 * A world setting ("gmDamageRelay") lets the GM disable the relay entirely.
 */

const SOCKET = "system.mech-foundry";
const REQUEST = "gmRelayRequest";
const RESULT = "gmRelayResult";
const TIMEOUT_MS = 10000;

/** Fields a relayed `update` may write, per actor type. */
const UPDATE_WHITELIST = {
  mech: ['system.armor', 'system.structure', 'system.critSlots', 'system.systemHits', 'system.heatSinks', 'system.weapons', 'system.pilot',
    'system.conditions', 'flags.mech-foundry.psr', 'flags.mech-foundry.phaseDamage'],
  ground_vehicle: ['system.armor', 'system.structure', 'system.crits', 'system.conditions', 'system.crew'],
  aerospace_fighter: ['system.armor', 'system.structuralIntegrity', 'system.crits', 'system.conditions', 'system.crew'],
  small_craft: ['system.armor', 'system.structuralIntegrity', 'system.crits', 'system.conditions', 'system.crew'],
  character: ['system.unconscious'],
  npc: ['system.unconscious']
};

const handlers = { update: handleUpdate };
const pending = new Map();

/** Register a GM-side handler for a relay op. The handler must validate its payload. */
export function registerRelayHandler(op, fn) {
  handlers[op] = fn;
}

function relayEnabled() {
  try { return game.settings.get("mech-foundry", "gmDamageRelay") !== false; }
  catch { return true; }
}

function activeGM() {
  return game.users?.activeGM ?? game.users?.find(u => u.isGM && u.active) ?? null;
}

/**
 * Ask the active GM to perform an op. Resolves true on success, false when the
 * relay is disabled, no GM is online, the GM rejects the request, or it times out.
 */
export async function relayRequest(op, payload) {
  if (!relayEnabled()) return false;
  const gm = activeGM();
  if (!gm) return false;
  const requestId = foundry.utils.randomID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(requestId); resolve(false); }, TIMEOUT_MS);
    pending.set(requestId, (ok) => { clearTimeout(timer); resolve(ok); });
    game.socket.emit(SOCKET, { eventType: REQUEST, requestId, gmId: gm.id, userId: game.user.id, op, payload });
  });
}

/**
 * Update a document, directly when this user may, otherwise via the GM relay.
 * @returns {Promise<boolean>} true if the write was applied.
 */
export async function writeDoc(doc, data) {
  if (!doc) return false;
  if (doc.isOwner || game.user.isGM) { await doc.update(data); return true; }
  return relayRequest('update', { uuid: doc.uuid, data });
}

/** Socket listener — call once from the ready hook. */
export function initGMRelay() {
  game.socket.on(SOCKET, onMessage);
}

/** Exposed for tests; the socket listener. */
export async function onMessage(data) {
  if (data?.eventType === RESULT) {
    if (data.userId !== game.user.id) return;
    const done = pending.get(data.requestId);
    if (done) { pending.delete(data.requestId); done(!!data.ok); }
    return;
  }
  if (data?.eventType !== REQUEST) return;
  // Exactly one GM (the one the requester addressed) handles each request.
  if (!game.user.isGM || data.gmId !== game.user.id) return;

  let ok = false, error = '';
  try {
    if (!relayEnabled()) throw new Error("GM relay is disabled in system settings");
    const fn = handlers[data.op];
    if (!fn) throw new Error(`Unknown relay op "${data.op}"`);
    ok = (await fn(data.payload, data.userId)) !== false;
  } catch (e) {
    error = e?.message || String(e);
    console.warn(`mech-foundry | GM relay rejected "${data.op}" from user ${data.userId}: ${error}`);
  }
  game.socket.emit(SOCKET, { eventType: RESULT, requestId: data.requestId, userId: data.userId, ok, error });
}

async function handleUpdate(payload) {
  const doc = await fromUuid(payload?.uuid);
  if (!doc || doc.documentName !== "Actor") throw new Error("Target is not an actor");
  const allowed = UPDATE_WHITELIST[doc.type];
  if (!allowed) throw new Error(`Actor type "${doc.type}" is not relay-writable`);
  const data = payload?.data;
  const keys = data && typeof data === "object" ? Object.keys(data) : [];
  if (!keys.length) throw new Error("Empty update");
  const bad = keys.filter(k => !allowed.includes(k));
  if (bad.length) throw new Error(`Field(s) not allowed: ${bad.join(", ")}`);
  if (["character", "npc"].includes(doc.type) && data["system.unconscious"] !== true) {
    throw new Error("Only marking a character unconscious is allowed");
  }
  await doc.update(data);
  return true;
}
