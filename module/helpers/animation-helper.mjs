import { AOEHelper } from "./aoe-helper.mjs";

/**
 * Animation Helper
 *
 * Handles projectile animations for weapon attacks using Sequencer.
 * Provides different animation behaviors based on attack type:
 * - Single shot: hit → target token, miss → scattered coordinates
 * - Burst fire: individual bullets with mixed hit/miss targets
 * - AOE: projectile → impact point (uses existing scatter for misses)
 * - Suppression: bullets spray randomly across template area
 *
 * Requires Sequencer module. Gracefully degrades if not installed.
 */
export class AnimationHelper {

  /**
   * Check if Sequencer module is available and active.
   * @returns {boolean}
   */
  static isSequencerAvailable() {
    return typeof Sequencer !== "undefined" && game.modules.get("sequencer")?.active;
  }

  /**
   * Play a single projectile animation.
   *
   * @param {Token} sourceToken The token firing the projectile
   * @param {Token|{x: number, y: number}} target The target token or coordinates
   * @param {Object} options Animation options
   * @param {string} options.file The Sequencer-compatible animation path (e.g., "jb2a.bullet.01.orange")
   * @param {boolean} options.hit Whether the attack hit (affects visual feedback)
   * @param {number} options.delay Delay before playing (ms)
   * @returns {Promise<void>}
   */
  static async playProjectileAnimation(sourceToken, target, options = {}) {
    if (!this.isSequencerAvailable()) return;
    if (!options.file) return;

    const sequence = new Sequence();

    sequence.effect()
      .file(options.file)
      .atLocation(sourceToken)
      .stretchTo(target)
      .delay(options.delay || 0)
      .waitUntilFinished(options.waitUntilFinished ?? -500);

    // Optional impact effect on hit
    if (options.hit && options.impactFile) {
      sequence.effect()
        .file(options.impactFile)
        .atLocation(target)
        .scaleToObject(1.5);
    }

    await sequence.play();
  }

  /**
   * Play animation for a single shot attack with hit/miss handling.
   * On a miss, calculates scatter and animates to scattered coordinates.
   *
   * @param {Token} sourceToken The attacking token
   * @param {Token} targetToken The target token
   * @param {Object} attackResult The attack result containing success/failure info
   * @param {boolean} attackResult.success Whether the attack hit
   * @param {number} attackResult.marginOfSuccess The margin of success (negative = failure)
   * @param {Object} options Animation options
   * @param {string} options.file The animation path
   * @returns {Promise<void>}
   */
  static async playSingleShotAnimation(sourceToken, targetToken, attackResult, options = {}) {
    if (!this.isSequencerAvailable()) return;
    if (!options.file) return;

    let target = targetToken;

    // On miss, calculate scatter and use scattered coordinates
    if (!attackResult.success) {
      const marginOfFailure = Math.abs(attackResult.marginOfSuccess);
      const scatteredCoords = await this.calculateMissOffset(targetToken.center, marginOfFailure);
      target = scatteredCoords;
    }

    await this.playProjectileAnimation(sourceToken, target, {
      ...options,
      hit: attackResult.success
    });
  }

  /**
   * Play burst fire animation with individual bullet trajectories.
   * Each bullet can hit or miss independently, with misses going to scattered coordinates.
   *
   * @param {Token} sourceToken The attacking token
   * @param {Token} targetToken The target token
   * @param {Object} burstInfo Burst fire information
   * @param {number} burstInfo.totalBullets Total bullets fired
   * @param {number} burstInfo.hitsCount Number of bullets that hit
   * @param {boolean} burstInfo.attackHit Whether the attack roll succeeded
   * @param {number} burstInfo.marginOfSuccess The margin of success
   * @param {Object} options Animation options
   * @param {string} options.file The animation path
   * @param {number} options.bulletDelay Delay between bullets (ms), default 50
   * @returns {Promise<void>}
   */
  static async playBurstAnimation(sourceToken, targetToken, burstInfo, options = {}) {
    if (!this.isSequencerAvailable()) return;
    if (!options.file) return;

    const { totalBullets, hitsCount, attackHit, marginOfSuccess } = burstInfo;
    const bulletDelay = options.bulletDelay ?? 50;

    // If attack missed entirely, all bullets miss
    const actualHits = attackHit ? Math.min(hitsCount, totalBullets) : 0;

    // Randomly determine which bullet indices are hits
    const hitIndices = this._selectRandomHitIndices(totalBullets, actualHits);

    const sequence = new Sequence();

    for (let i = 0; i < totalBullets; i++) {
      const isHit = hitIndices.has(i);
      let bulletTarget = targetToken;

      if (!isHit) {
        // Calculate small scatter for this miss
        // Use smaller scatter for burst (1-3 meters) for tighter grouping
        const scatterDistance = Math.random() * 2 + 1;
        bulletTarget = await this.calculateMissOffset(targetToken.center, scatterDistance);
      }

      sequence.effect()
        .file(options.file)
        .atLocation(sourceToken)
        .stretchTo(bulletTarget)
        .delay(i * bulletDelay)
        .waitUntilFinished(-500);
    }

    await sequence.play();
  }

  /**
   * Play suppression fire animation with bullets spraying across the template area.
   * Each bullet targets a random point within the ray template.
   *
   * @param {Token} sourceToken The attacking token
   * @param {Object} templateData The suppression template data
   * @param {number} templateData.x Template origin X
   * @param {number} templateData.y Template origin Y
   * @param {number} templateData.direction Template direction in degrees
   * @param {number} templateData.distance Template length in grid units
   * @param {number} numBullets Number of bullets to animate
   * @param {Object} options Animation options
   * @param {string} options.file The animation path
   * @param {number} options.bulletDelay Delay between bullets (ms), default 40
   * @returns {Promise<void>}
   */
  static async playSuppressionAnimation(sourceToken, templateData, numBullets, options = {}) {
    if (!this.isSequencerAvailable()) return;
    if (!options.file) return;

    const bulletDelay = options.bulletDelay ?? 40;
    const width = 1; // Suppression templates are 1m wide

    const sequence = new Sequence();

    for (let i = 0; i < numBullets; i++) {
      // Get random point within the ray template
      const bulletTarget = this.getRandomPointInRay(
        { x: templateData.x, y: templateData.y },
        templateData.direction,
        templateData.distance,
        width
      );

      sequence.effect()
        .file(options.file)
        .atLocation(sourceToken)
        .stretchTo(bulletTarget)
        .delay(i * bulletDelay)
        .waitUntilFinished(-500);
    }

    await sequence.play();
  }

  /**
   * Play AOE weapon animation. Uses provided impact point (already scattered if miss).
   *
   * @param {Token} sourceToken The attacking token
   * @param {{x: number, y: number}} impactPoint The impact coordinates (aim point or scattered)
   * @param {Object} options Animation options
   * @param {string} options.file The projectile animation path
   * @param {string} options.explosionFile Optional explosion effect at impact
   * @returns {Promise<void>}
   */
  static async playAOEAnimation(sourceToken, impactPoint, options = {}) {
    if (!this.isSequencerAvailable()) return;
    if (!options.file) return;

    const sequence = new Sequence();

    // Projectile to impact point
    sequence.effect()
      .file(options.file)
      .atLocation(sourceToken)
      .stretchTo(impactPoint)
      .waitUntilFinished(-200);

    // Optional explosion at impact
    if (options.explosionFile) {
      sequence.effect()
        .file(options.explosionFile)
        .atLocation(impactPoint)
        .scaleToObject(2);
    }

    await sequence.play();
  }

  /**
   * Calculate scattered coordinates for a miss.
   * Uses AOEHelper's scatter logic for consistency.
   *
   * @param {{x: number, y: number}} targetCoords Original target coordinates
   * @param {number} marginOfFailure The margin of failure (determines scatter distance)
   * @returns {Promise<{x: number, y: number}>} Scattered coordinates
   */
  static async calculateMissOffset(targetCoords, marginOfFailure) {
    // Use a minimum scatter distance of 1 meter
    const scatterDistance = Math.max(1, marginOfFailure);

    // Calculate scatter using AOEHelper's method
    const scatterInfo = await AOEHelper._calculateScatter(scatterDistance);
    return AOEHelper._applyScatter(targetCoords, scatterInfo);
  }

  /**
   * Get a random point within a ray (rectangle) template area.
   *
   * @param {{x: number, y: number}} origin The ray origin point
   * @param {number} direction The ray direction in degrees
   * @param {number} length The ray length in grid units (meters)
   * @param {number} width The ray width in grid units (meters)
   * @returns {{x: number, y: number}} Random point within the ray
   */
  static getRandomPointInRay(origin, direction, length, width) {
    const gridSize = canvas.grid.size;
    const gridDistance = canvas.grid.distance;
    const pixelsPerMeter = gridSize / gridDistance;

    const lengthPixels = length * pixelsPerMeter;
    const halfWidthPixels = (width / 2) * pixelsPerMeter;

    // Direction in radians
    const dirRad = (direction * Math.PI) / 180;

    // Unit vectors along and perpendicular to the ray
    const dirX = Math.cos(dirRad);
    const dirY = Math.sin(dirRad);
    const perpX = -dirY;
    const perpY = dirX;

    // Random position along ray length and across width
    const alongDistance = Math.random() * lengthPixels;
    const acrossOffset = (Math.random() - 0.5) * 2 * halfWidthPixels;

    return {
      x: origin.x + dirX * alongDistance + perpX * acrossOffset,
      y: origin.y + dirY * alongDistance + perpY * acrossOffset
    };
  }

  /**
   * Select random indices for which bullets hit in a burst.
   *
   * @param {number} totalBullets Total number of bullets
   * @param {number} hitsCount Number of bullets that should hit
   * @returns {Set<number>} Set of indices that are hits
   * @private
   */
  static _selectRandomHitIndices(totalBullets, hitsCount) {
    const indices = Array.from({ length: totalBullets }, (_, i) => i);

    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Take the first 'hitsCount' indices as hits
    return new Set(indices.slice(0, hitsCount));
  }

  /**
   * Get the source token for an actor.
   * Finds the token on the current scene that represents the actor.
   *
   * @param {Actor} actor The actor
   * @returns {Token|null} The token, or null if not found
   */
  static getActorToken(actor) {
    if (!canvas.ready) return null;

    // Try to get the token from the actor's token document
    const token = actor.getActiveTokens()?.[0];
    return token || null;
  }
}
