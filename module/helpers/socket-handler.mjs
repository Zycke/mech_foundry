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
    // Resolve target actor - prefer token actor for unlinked token support
    let targetActor = null;
    if (data.targetTokenId) {
      const scene = game.scenes.current;
      const tokenDoc = scene?.tokens.get(data.targetTokenId);
      if (tokenDoc) targetActor = tokenDoc.actor;
    }
    if (!targetActor) targetActor = game.actors.get(data.targetActorId);

    // Only process if this client owns the target actor
    if (!targetActor?.isOwner) return;

    // Don't process if we're the attacker (handled locally)
    if (data.attackerUserId === game.user.id) return;

    // Show the defender dialog
    const defenderResult = await OpposedRollHelper.showDefenderDialog(data);

    // Send response back via socket
    this.emit(SOCKET_EVENTS.DEFENDER_RESPONSE, {
      rollId: data.rollId,
      attackerUserId: data.attackerUserId,
      defenderResult: defenderResult
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

    // Resolve the opposed roll
    pendingRoll.resolve(data.defenderResult);

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
