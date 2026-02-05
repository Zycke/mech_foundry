import { OpposedRollHelper } from "./opposed-rolls.mjs";

/**
 * AOE (Area of Effect) Attack Helper
 *
 * Handles the full AOE attack flow:
 * 1. Template placement (player chooses aim point)
 * 2. Attack roll (with +2 AOE bonus, MoS forced to 0)
 * 3. Scatter on miss (d12 clock direction, MoF meters distance)
 * 4. Token detection within blast radius
 * 5. Per-target damage with distance falloff (BD and AP decrease by 1/meter)
 *
 * Based on A Time of War area-effect (blast) weapon rules.
 */
export class AOEHelper {

  /**
   * Clock position to angle mapping (d12 → degrees)
   * 12 o'clock = 0° (straight up/north on canvas)
   */
  static CLOCK_ANGLES = {
    1: 30, 2: 60, 3: 90, 4: 120, 5: 150, 6: 180,
    7: 210, 8: 240, 9: 270, 10: 300, 11: 330, 12: 0
  };

  static CLOCK_LABELS = {
    1: "1 o'clock", 2: "2 o'clock", 3: "3 o'clock",
    4: "4 o'clock", 5: "5 o'clock", 6: "6 o'clock",
    7: "7 o'clock", 8: "8 o'clock", 9: "9 o'clock",
    10: "10 o'clock", 11: "11 o'clock", 12: "12 o'clock"
  };

  /**
   * Initiate the AOE attack flow.
   * Creates a template preview for the player to place, then resolves the attack.
   *
   * @param {Actor} actor The attacking actor
   * @param {Item} weapon The AOE weapon
   * @param {Object} options Attack options (modifier, etc.)
   */
  static async initiateAOEAttack(actor, weapon, options = {}) {
    const bd = weapon.system.bd || 1;
    const blastRadius = bd; // Radius in meters = BD

    // Create template preview data
    const templateData = {
      t: "circle",
      user: game.user.id,
      distance: blastRadius,
      direction: 0,
      x: 0,
      y: 0,
      fillColor: game.user.color || "#ff4400",
      flags: {
        "mech-foundry": {
          isAOEAttack: true,
          actorId: actor.id,
          weaponId: weapon.id
        }
      }
    };

    // Create a temporary MeasuredTemplate document for preview
    const templateDoc = new MeasuredTemplateDocument(templateData, { parent: canvas.scene });
    const template = new MeasuredTemplate(templateDoc);

    // Enter template placement mode
    const placedPosition = await this._enterPlacementMode(template, blastRadius);

    if (!placedPosition) {
      // Player cancelled placement
      ui.notifications.info("AOE attack cancelled.");
      return;
    }

    // Now roll the attack and resolve
    await this._rollAndResolve(actor, weapon, placedPosition, blastRadius, options);
  }

  /**
   * Enter template placement mode where the player clicks to place the blast center.
   * Returns the canvas coordinates of the placement, or null if cancelled.
   *
   * @param {MeasuredTemplate} template The template object for preview
   * @param {number} blastRadius The blast radius in grid units
   * @returns {Promise<{x: number, y: number}|null>}
   */
  static async _enterPlacementMode(template, blastRadius) {
    return new Promise((resolve) => {
      // Disable token layer interactivity so clicks pass through to stage
      const tokensLayer = canvas.tokens;
      const originalInteractive = tokensLayer.interactiveChildren;
      tokensLayer.interactiveChildren = false;
      tokensLayer.releaseAll();

      // Add the template to the template layer for preview rendering
      template.draw();
      template.layer.preview.addChild(template);

      // Track mouse position and update template
      const moveHandler = (event) => {
        const pos = event.getLocalPosition(canvas.app.stage);
        // Snap to grid center
        const snapped = canvas.grid.getSnappedPoint(pos, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
        template.document.updateSource({ x: snapped.x, y: snapped.y });
        template.refresh();
      };

      // Handle left click to place
      const clickHandler = (event) => {
        // Only respond to left clicks
        if (event.button !== 0) return;

        const pos = event.getLocalPosition(canvas.app.stage);
        const snapped = canvas.grid.getSnappedPoint(pos, { mode: CONST.GRID_SNAPPING_MODES.CENTER });

        // Clean up
        cleanup();
        resolve({ x: snapped.x, y: snapped.y });
      };

      // Handle right click or Escape to cancel
      const cancelHandler = (event) => {
        if (event.button === 2 || event.key === "Escape") {
          cleanup();
          resolve(null);
        }
      };

      const cleanup = () => {
        // Re-enable token layer interactivity
        tokensLayer.interactiveChildren = originalInteractive;

        canvas.stage.off("pointermove", moveHandler);
        canvas.stage.off("pointerdown", clickHandler);
        document.removeEventListener("keydown", cancelHandler);
        canvas.stage.off("pointerdown", cancelHandler);
        template.layer.preview.removeChild(template);
        template.destroy();
      };

      // Bind handlers
      canvas.stage.on("pointermove", moveHandler);
      canvas.stage.on("pointerdown", clickHandler);
      document.addEventListener("keydown", cancelHandler);

      // Show placement hint
      ui.notifications.info("Click to place the blast center. Right-click or Escape to cancel.");
    });
  }

  /**
   * Roll the attack and resolve blast damage after template placement.
   *
   * @param {Actor} actor The attacking actor
   * @param {Item} weapon The AOE weapon
   * @param {{x: number, y: number}} aimPoint The intended impact point
   * @param {number} blastRadius The blast radius in meters
   * @param {Object} options Attack options
   */
  static async _rollAndResolve(actor, weapon, aimPoint, blastRadius, options = {}) {
    const weaponData = weapon.system;
    const bd = weaponData.bd || 0;
    const ap = weaponData.ap || 0;
    const apFactor = weaponData.apFactor || '';

    // Calculate attack modifiers (mirrors rollWeaponAttack logic)
    const inputMod = options.modifier || 0;
    const injuryMod = actor.system.injuryModifier || 0;
    const fatigueMod = actor.system.fatigueModifier || 0;
    const aoeMod = 2; // +2 AOE bonus
    const indirectFire = options.indirectFire || false;
    const spotter = options.spotter || false;
    const indirectMod = indirectFire ? (spotter ? -2 : -4) : 0;

    // Find linked skill
    const skillName = weaponData.skill;
    let skill = null;
    let skillLevel = 0;
    let linkMod = 0;

    if (skillName) {
      skill = actor.items.find(i => i.type === 'skill' && i.name === skillName);
      if (skill) {
        const xp = skill.system.xp || 0;
        const costs = [20, 30, 50, 80, 120, 170, 230, 300, 380, 470, 570];
        skillLevel = -1;
        for (let i = 10; i >= 0; i--) {
          if (xp >= costs[i]) {
            skillLevel = i;
            break;
          }
        }

        if (skill.system.linkedAttribute1) {
          const attr1 = actor.system.attributes[skill.system.linkedAttribute1];
          if (attr1) linkMod += attr1.linkMod || 0;
        }
        if (skill.system.linkedAttribute2) {
          const attr2 = actor.system.attributes[skill.system.linkedAttribute2];
          if (attr2) linkMod += attr2.linkMod || 0;
        }
      }
    }

    const skillMod = skillLevel + linkMod;

    // Get combat modifiers from equipped item effects
    const { ItemEffectsHelper } = await import("./effects-helper.mjs");
    const itemCombatMod = ItemEffectsHelper.getCombatModifier(actor, 'ranged', weapon.id);
    const itemEffectMod = itemCombatMod.totalBonus;

    const totalMod = skillMod + inputMod + injuryMod + fatigueMod + itemEffectMod + aoeMod + indirectMod;
    const targetNumber = skill?.system.targetNumber || 7;

    // Roll the attack
    const { DiceMechanics } = await import("./dice-mechanics.mjs");
    const rollFormula = `2d6 + ${totalMod}`;
    const roll = new Roll(rollFormula);
    await roll.evaluate();

    const diceResults = roll.dice[0].results.map(r => r.result);
    const specialRoll = await DiceMechanics.evaluateSpecialRoll(diceResults);
    const successInfo = DiceMechanics.determineSuccess(roll.total, targetNumber, specialRoll);

    const success = successInfo.success;
    const marginOfSuccess = successInfo.mos;
    const finalTotal = successInfo.finalTotal;

    // Determine final impact point (scatter on miss)
    let impactPoint = { ...aimPoint };
    let scatterInfo = null;

    if (!success) {
      const marginOfFailure = Math.abs(marginOfSuccess);
      scatterInfo = await this._calculateScatter(marginOfFailure);
      impactPoint = this._applyScatter(aimPoint, scatterInfo);
    }

    // Place the final template on the canvas
    const finalTemplate = await this._placeTemplate(impactPoint, blastRadius, scatterInfo);

    // Find all tokens within the blast radius
    const targets = this._getTokensInRadius(impactPoint, blastRadius);

    // Calculate damage for each target
    const damageTypeMap = { 'M': 'm', 'B': 'b', 'E': 'e', 'X': 'x' };
    const damageType = damageTypeMap[apFactor] || 'x';
    const damageTypeName = OpposedRollHelper.getDamageTypeName(damageType);

    const targetResults = [];
    for (const { token, distance } of targets) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      // Calculate falloff damage
      const meterDistance = Math.floor(distance);
      const effectiveBD = Math.max(0, bd - meterDistance);
      const effectiveAP = Math.max(0, ap - meterDistance);

      // MoS is always 0 for AOE - damage = effectiveBD
      const standardDamage = effectiveBD;
      const fatigueDamage = effectiveBD > 0 ? 1 : 0;

      // Skip targets that take 0 damage
      if (standardDamage <= 0) continue;

      // Roll hit location
      const hitLocation = await OpposedRollHelper.rollHitLocation();

      // Calculate armor reduction
      const armorCalc = OpposedRollHelper.calculateDamageAfterArmor(
        standardDamage,
        effectiveAP,
        damageType,
        targetActor,
        hitLocation.armorLocation
      );

      const canApplyDamage = targetActor.isOwner || game.user.isGM;

      targetResults.push({
        tokenName: token.name,
        tokenId: token.id,
        tokenDocId: token.document?.id || token.id,
        actorId: targetActor.id,
        distance: Math.round(distance * 10) / 10, // 1 decimal
        meterDistance,
        effectiveBD,
        effectiveAP,
        standardDamage,
        fatigueDamage,
        hitLocation,
        armorCalc,
        canApplyDamage,
        damageTypeName
      });
    }

    // Sort targets by distance from center
    targetResults.sort((a, b) => a.distance - b.distance);

    // Consume ammo
    const currentAmmo = weaponData.ammo?.value || 0;
    if (weaponData.ammo?.max > 0) {
      await weapon.update({ "system.ammo.value": Math.max(0, currentAmmo - 1) });
    }

    // Render and send the chat message
    const messageContent = await renderTemplate(
      "systems/mech-foundry/templates/chat/aoe-attack.hbs",
      {
        weaponName: weapon.name,
        attackType: "Area Effect",
        blastRadius,
        baseBD: bd,
        baseAP: ap,
        apFactor,
        damageTypeName,
        // Roll info
        targetNumber,
        roll: {
          total: finalTotal,
          rawTotal: roll.total,
          diceResults,
          success,
          marginOfSuccess,
          specialRoll
        },
        // Modifier breakdown
        skillMod,
        inputMod,
        aoeMod,
        injuryMod,
        fatigueMod,
        itemEffectMod,
        itemCombatModBreakdown: itemCombatMod.breakdown,
        // Indirect fire info
        indirectFire,
        spotter,
        indirectMod,
        // Scatter info
        didScatter: !!scatterInfo,
        scatterInfo,
        // Target results
        targets: targetResults,
        hasTargets: targetResults.length > 0,
        sceneId: canvas.scene?.id || null,
        // Template info for cleanup
        templateId: finalTemplate?.id || null
      }
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${weapon.name} Area Effect Attack`,
      content: messageContent,
      rolls: [roll]
    });
  }

  /**
   * Calculate scatter direction and distance on a miss.
   *
   * @param {number} marginOfFailure The absolute margin of failure
   * @returns {Promise<Object>} Scatter info with direction and distance
   */
  static async _calculateScatter(marginOfFailure) {
    // Roll d12 for clock direction
    const directionRoll = new Roll("1d12");
    await directionRoll.evaluate();
    const clockPosition = directionRoll.total;
    const angle = this.CLOCK_ANGLES[clockPosition];
    const label = this.CLOCK_LABELS[clockPosition];
    const distance = marginOfFailure; // 1 meter per MoF

    return {
      clockPosition,
      angle,
      label,
      distance,
      directionRoll: directionRoll.total
    };
  }

  /**
   * Apply scatter offset to the aim point.
   *
   * @param {{x: number, y: number}} aimPoint Original aim point
   * @param {Object} scatterInfo Scatter calculation result
   * @returns {{x: number, y: number}} New impact point
   */
  static _applyScatter(aimPoint, scatterInfo) {
    const gridSize = canvas.grid.size; // pixels per grid square
    const gridDistance = canvas.grid.distance; // meters per grid square
    const pixelsPerMeter = gridSize / gridDistance;

    // Convert angle to radians (0° = north/up, clockwise)
    // Canvas: +x is right, +y is down
    // 0° (12 o'clock) = -y direction
    const radians = (scatterInfo.angle * Math.PI) / 180;
    const pixelDistance = scatterInfo.distance * pixelsPerMeter;

    // Calculate offset (sin for x, -cos for y because canvas y is inverted)
    const dx = Math.sin(radians) * pixelDistance;
    const dy = -Math.cos(radians) * pixelDistance;

    return {
      x: aimPoint.x + dx,
      y: aimPoint.y + dy
    };
  }

  /**
   * Place the final MeasuredTemplate on the canvas.
   *
   * @param {{x: number, y: number}} position The center position
   * @param {number} blastRadius The radius in grid units (meters)
   * @param {Object|null} scatterInfo Scatter info if attack missed
   * @returns {Promise<MeasuredTemplateDocument|null>}
   */
  static async _placeTemplate(position, blastRadius, scatterInfo) {
    const templateData = {
      t: "circle",
      user: game.user.id,
      x: position.x,
      y: position.y,
      distance: blastRadius,
      direction: 0,
      fillColor: scatterInfo ? "#ff8800" : "#ff4400", // Orange for scattered, red for direct hit
      flags: {
        "mech-foundry": {
          isAOEBlast: true,
          scattered: !!scatterInfo
        }
      }
    };

    const created = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
    return created?.[0] || null;
  }

  /**
   * Find all tokens within a given radius from a center point.
   *
   * @param {{x: number, y: number}} center The blast center
   * @param {number} radius The radius in grid units (meters)
   * @returns {Array<{token: Token, distance: number}>}
   */
  static _getTokensInRadius(center, radius) {
    const gridSize = canvas.grid.size;
    const gridDistance = canvas.grid.distance;
    const pixelsPerMeter = gridSize / gridDistance;
    const radiusPixels = radius * pixelsPerMeter;

    const results = [];

    for (const token of canvas.tokens.placeables) {
      // Calculate distance from blast center to token center
      const tokenCenter = token.center;
      const dx = tokenCenter.x - center.x;
      const dy = tokenCenter.y - center.y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);

      // Convert to meters
      const meterDistance = pixelDistance / pixelsPerMeter;

      if (pixelDistance <= radiusPixels) {
        results.push({
          token,
          distance: meterDistance
        });
      }
    }

    return results;
  }

  // ============================================
  // Suppression Fire Template Methods
  // ============================================

  /**
   * Initiate suppression fire with rectangular template placement.
   * The rectangle is 1m wide and the length is defined by the suppression area.
   *
   * @param {Actor} actor The attacking actor
   * @param {Item} weapon The weapon
   * @param {Object} options Attack options (suppressionArea, roundsPerSqm, modifier, etc.)
   */
  static async initiateSuppressionFire(actor, weapon, options = {}) {
    const length = options.suppressionArea || 1; // Length in meters

    // Create a rectangular template preview (ray type: 1m wide, length from area)
    const templateData = {
      t: "ray",
      user: game.user.id,
      distance: length,
      width: 1, // 1 meter wide
      direction: 0,
      x: 0,
      y: 0,
      fillColor: game.user.color || "#ffaa00",
      flags: {
        "mech-foundry": {
          isSuppressionFire: true,
          actorId: actor.id,
          weaponId: weapon.id
        }
      }
    };

    const templateDoc = new MeasuredTemplateDocument(templateData, { parent: canvas.scene });
    const template = new MeasuredTemplate(templateDoc);

    const placementResult = await this._enterRayPlacementMode(template, length);

    if (!placementResult) {
      ui.notifications.info("Suppression fire cancelled.");
      return;
    }

    // Place the final template on the canvas
    const finalTemplate = await this._placeSuppressionTemplate(placementResult, length);

    // Find all tokens within the rectangle
    const targets = this._getTokensInRay(placementResult, length);

    // Now delegate back to the standard rollWeaponAttack for each target
    // Pass the detected targets so it makes one roll per target
    options.suppressionTargets = targets;
    options.suppressionTemplateId = finalTemplate?.id || null;

    await actor.rollWeaponAttack(weapon.id, options);
  }

  /**
   * Enter ray (rectangle) placement mode.
   * Player clicks to set the origin, then moves mouse to set direction, clicks again to confirm.
   *
   * @param {MeasuredTemplate} template The template object for preview
   * @param {number} length The ray length in grid units
   * @returns {Promise<{x: number, y: number, direction: number}|null>}
   */
  static async _enterRayPlacementMode(template, length) {
    return new Promise((resolve) => {
      let originSet = false;
      let origin = null;

      // Disable token layer interactivity so clicks pass through to stage
      const tokensLayer = canvas.tokens;
      const originalInteractive = tokensLayer.interactiveChildren;
      tokensLayer.interactiveChildren = false;
      tokensLayer.releaseAll();

      template.draw();
      template.layer.preview.addChild(template);

      const moveHandler = (event) => {
        const pos = event.getLocalPosition(canvas.app.stage);
        const snapped = canvas.grid.getSnappedPoint(pos, { mode: CONST.GRID_SNAPPING_MODES.CENTER });

        if (!originSet) {
          // Move template origin with cursor
          template.document.updateSource({ x: snapped.x, y: snapped.y });
        } else {
          // Origin is set, update direction based on mouse position
          const dx = snapped.x - origin.x;
          const dy = snapped.y - origin.y;
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          template.document.updateSource({ direction: angle });
        }
        template.refresh();
      };

      const clickHandler = (event) => {
        // Only respond to left clicks
        if (event.button !== 0) return;

        const pos = event.getLocalPosition(canvas.app.stage);
        const snapped = canvas.grid.getSnappedPoint(pos, { mode: CONST.GRID_SNAPPING_MODES.CENTER });

        if (!originSet) {
          // First click: set origin
          originSet = true;
          origin = { x: snapped.x, y: snapped.y };
          template.document.updateSource({ x: snapped.x, y: snapped.y });
          template.refresh();
          ui.notifications.info("Now aim the suppression zone. Click to confirm direction.");
        } else {
          // Second click: confirm direction
          const dx = snapped.x - origin.x;
          const dy = snapped.y - origin.y;
          const direction = (Math.atan2(dy, dx) * 180) / Math.PI;

          cleanup();
          resolve({ x: origin.x, y: origin.y, direction });
        }
      };

      const cancelHandler = (event) => {
        if (event.button === 2 || event.key === "Escape") {
          cleanup();
          resolve(null);
        }
      };

      const cleanup = () => {
        // Re-enable token layer interactivity
        tokensLayer.interactiveChildren = originalInteractive;

        canvas.stage.off("pointermove", moveHandler);
        canvas.stage.off("pointerdown", clickHandler);
        document.removeEventListener("keydown", cancelHandler);
        canvas.stage.off("pointerdown", cancelHandler);
        template.layer.preview.removeChild(template);
        template.destroy();
      };

      canvas.stage.on("pointermove", moveHandler);
      canvas.stage.on("pointerdown", clickHandler);
      document.addEventListener("keydown", cancelHandler);

      ui.notifications.info("Click to set the suppression zone origin. Right-click or Escape to cancel.");
    });
  }

  /**
   * Place the final suppression fire template on the canvas.
   *
   * @param {{x: number, y: number, direction: number}} placement The placement data
   * @param {number} length The ray length in meters
   * @returns {Promise<MeasuredTemplateDocument|null>}
   */
  static async _placeSuppressionTemplate(placement, length) {
    const templateData = {
      t: "ray",
      user: game.user.id,
      x: placement.x,
      y: placement.y,
      distance: length,
      width: 1,
      direction: placement.direction,
      fillColor: "#ffaa00",
      flags: {
        "mech-foundry": {
          isSuppressionFire: true
        }
      }
    };

    const created = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
    return created?.[0] || null;
  }

  /**
   * Find all tokens within a ray (rectangle) template area.
   *
   * @param {{x: number, y: number, direction: number}} placement The ray origin and direction
   * @param {number} length The ray length in meters
   * @returns {Array<{token: Token, distance: number}>}
   */
  static _getTokensInRay(placement, length) {
    const gridSize = canvas.grid.size;
    const gridDistance = canvas.grid.distance;
    const pixelsPerMeter = gridSize / gridDistance;
    const lengthPixels = length * pixelsPerMeter;
    const halfWidthPixels = 0.5 * pixelsPerMeter; // 1m wide / 2

    // Direction in radians
    const dirRad = (placement.direction * Math.PI) / 180;

    // Unit vectors along and perpendicular to the ray
    const dirX = Math.cos(dirRad);
    const dirY = Math.sin(dirRad);
    const perpX = -dirY;
    const perpY = dirX;

    const results = [];

    for (const token of canvas.tokens.placeables) {
      const tokenCenter = token.center;
      const dx = tokenCenter.x - placement.x;
      const dy = tokenCenter.y - placement.y;

      // Project onto ray axis (along) and perpendicular axis
      const along = dx * dirX + dy * dirY;
      const perp = dx * perpX + dy * perpY;

      // Check if within rectangle bounds
      if (along >= 0 && along <= lengthPixels && Math.abs(perp) <= halfWidthPixels) {
        const meterDistance = along / pixelsPerMeter;
        results.push({
          token,
          distance: meterDistance
        });
      }
    }

    return results;
  }
}
