/**
 * Socket handler for cross-player communication in opposed rolls
 * Enables defender prompts to be sent to different clients
 */

import { OpposedRollHelper } from './opposed-rolls.mjs';

// Socket event types
export const SOCKET_EVENTS = {
  DEFENDER_PROMPT: "defenderPrompt",
  DEFENDER_RESPONSE: "defenderResponse",
  DEFENDER_CHOICE: "defenderChoice"
};

export class SocketHandler {
  static SOCKET_NAME = "system.mech-foundry";

  /**
   * Initialize the socket handler - call this in the ready hook
   */
  static initialize() {
    game.socket.on(this.SOCKET_NAME, this._onSocketMessage.bind(this));

    // Initialize storage for pending opposed rolls
    game.mechfoundry = game.mechfoundry || {};
    game.mechfoundry.pendingOpposedRolls = {};
  }

  /**
   * Emit a socket message to all clients
   * @param {string} eventType - The type of event
   * @param {object} data - The data to send
   */
  static emit(eventType, data) {
    game.socket.emit(this.SOCKET_NAME, { eventType, ...data });
  }

  /**
   * Handle incoming socket messages
   * @param {object} data - The received data
   */
  static _onSocketMessage(data) {
    switch (data.eventType) {
      case SOCKET_EVENTS.DEFENDER_PROMPT:
        this._handleDefenderPrompt(data);
        break;
      case SOCKET_EVENTS.DEFENDER_RESPONSE:
        this._handleDefenderResponse(data);
        break;
      case SOCKET_EVENTS.DEFENDER_CHOICE:
        this._handleDefenderChoice(data);
        break;
    }
  }

  /**
   * Handle defender prompt - show dialog if this client owns the target
   * @param {object} data - The prompt data
   */
  static async _handleDefenderPrompt(data) {
    // Don't process if we're the attacker (handled locally)
    if (data.attackerUserId === game.user.id) return;

    // Resolve target actor - prefer token actor for unlinked token support
    const targetActor = OpposedRollHelper.resolveTargetActor(data);
    if (!targetActor) return;

    // Exactly ONE client should answer. Prefer an active non-GM owner of the
    // target; otherwise fall back to the first active GM. Without this, a GM
    // (who owns every actor) and the owning player would both show the dialog
    // and both emit a response — the second of which is silently dropped.
    const activePlayerOwner = game.users.find(u =>
      u.active && !u.isGM && targetActor.testUserPermission(u, "OWNER")
    );
    const responderId = activePlayerOwner
      ? activePlayerOwner.id
      : game.users.find(u => u.active && u.isGM)?.id;
    if (game.user.id !== responderId) return;

    // Show the defender dialog
    const defenderResult = await OpposedRollHelper.showDefenderDialog(data);

    // Roll instances do not survive socket JSON serialization, so send the
    // roll as plain data and re-hydrate it on the attacker's side.
    const payload = { ...defenderResult };
    if (payload.roll instanceof Roll) payload.roll = payload.roll.toJSON();

    // Send response back via socket
    this.emit(SOCKET_EVENTS.DEFENDER_RESPONSE, {
      rollId: data.rollId,
      attackerUserId: data.attackerUserId,
      defenderResult: payload
    });
  }

  /**
   * Handle defender response - process the defense roll result
   * @param {object} data - The response data
   */
  static _handleDefenderResponse(data) {
    // Only the original attacker processes this
    if (data.attackerUserId !== game.user.id) return;

    // Find the pending roll
    const pendingRoll = game.mechfoundry.pendingOpposedRolls[data.rollId];
    if (!pendingRoll) return;

    // Re-hydrate the defender's Roll (reduced to plain data over the socket)
    const result = data.defenderResult;
    if (result && result.roll && !(result.roll instanceof Roll)) {
      try {
        result.roll = Roll.fromData(result.roll);
      } catch (e) {
        console.warn("mech-foundry | Could not rehydrate defender roll", e);
        result.roll = null;
      }
    }

    // Resolve the opposed roll
    pendingRoll.resolve(result);

    // Clean up
    delete game.mechfoundry.pendingOpposedRolls[data.rollId];
  }

  /**
   * Handle defender choice (block vs mutual damage)
   * @param {object} data - The choice data
   */
  static _handleDefenderChoice(data) {
    // Only the original attacker processes this
    if (data.attackerUserId !== game.user.id) return;

    // Find the pending choice
    const pendingChoice = game.mechfoundry.pendingDefenderChoices?.[data.rollId];
    if (!pendingChoice) return;

    // Resolve the choice
    pendingChoice.resolve(data.choice);

    // Clean up
    delete game.mechfoundry.pendingDefenderChoices[data.rollId];
  }

  /**
   * Wait for a defender response with timeout
   * @param {string} rollId - The roll ID to wait for
   * @param {number} timeout - Timeout in milliseconds (default 60 seconds)
   * @returns {Promise<object>} The defender result or declined result on timeout
   */
  static waitForDefenderResponse(rollId, timeout = 60000) {
    return new Promise((resolve) => {
      // Store the resolve function
      game.mechfoundry.pendingOpposedRolls[rollId] = { resolve };

      // Set timeout
      setTimeout(() => {
        if (game.mechfoundry.pendingOpposedRolls[rollId]) {
          // Timeout - treat as declined
          resolve({ declined: true, mos: -3, success: false, timedOut: true });
          delete game.mechfoundry.pendingOpposedRolls[rollId];
        }
      }, timeout);
    });
  }

  /**
   * Wait for a defender choice (block vs mutual damage)
   * @param {string} rollId - The roll ID to wait for
   * @param {number} timeout - Timeout in milliseconds (default 30 seconds)
   * @returns {Promise<string>} The choice ('block' or 'mutual') or 'block' on timeout
   */
  static waitForDefenderChoice(rollId, timeout = 30000) {
    return new Promise((resolve) => {
      game.mechfoundry.pendingDefenderChoices = game.mechfoundry.pendingDefenderChoices || {};
      game.mechfoundry.pendingDefenderChoices[rollId] = { resolve };

      setTimeout(() => {
        if (game.mechfoundry.pendingDefenderChoices?.[rollId]) {
          // Timeout - default to block
          resolve('block');
          delete game.mechfoundry.pendingDefenderChoices[rollId];
        }
      }, timeout);
    });
  }
}
