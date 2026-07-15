import { OpposedRollHelper } from "./opposed-rolls.mjs";
import { AnimationHelper } from "./animation-helper.mjs";

/**
 * AOE (Area of Effect) Attack Helper
 *
 * Handles the full AOE attack flow:
 * 1. Region placement (player chooses aim point via canvas.regions.placeRegion)
 * 2. Attack roll (with +2 AOE bonus, MoS forced to 0)
 * 3. Scatter on miss (1d6 clock direction relative to firing line, MoF meters)
 * 4. Token detection within blast radius
 * 5. Per-target damage with distance falloff (BD and AP decrease by 1/meter)
 *
 * Based on A Time of War area-effect (blast) weapon rules.
 *
 * Foundry v14: MeasuredTemplate was removed and absorbed into the Scene Regions
 * framework. Interactive placement now uses `canvas.regions.placeRegion(...)` and
 * the persistent visual is a `RegionDocument`. Token detection is done with pure
 * geometry (`_getTokensInRadius`/`_getTokensInRay`), so the Region is purely a
 * visual aid and never affects the mechanical result.
 */
export class AOEHelper {

  /**
   * Scatter direction labels for a 1d6 roll, per A Time of War: a 1 scatters
   * directly away from the attacker, with each subsequent number rotating a
   * further 60 degrees clockwise.
   */
  static SCATTER_LABELS = {
    1: "directly away from attacker",
    2: "60° clockwise of firing line",
    3: "120° clockwise of firing line",
    4: "180° (back toward attacker)",
    5: "240° clockwise of firing line",
    6: "300° clockwise of firing line"
  };

  /**
   * Pixels-per-meter for the current scene grid.
   * @returns {number}
   */
  static _pixelsPerMeter() {
    return canvas.grid.size / canvas.grid.distance;
  }

  /**
   * Initiate the AOE attack flow.
   * Places a circular Region for the player to position, then resolves the attack.
   *
   * @param {Actor} actor The attacking actor
   * @param {Item} weapon The AOE weapon
   * @param {Object} options Attack options (modifier, etc.)
   */
  static async initiateAOEAttack(actor, weapon, options = {}) {
    const bd = weapon.system.bd || 1;
    const blastRadius = bd; // Radius in meters = BD

    const placement = await this._placeRegionInteractive({
      name: `${weapon.name} Blast`,
      color: game.user.color || "#ff4400",
      shape: {
        type: "circle",
        x: 0,
        y: 0,
        radius: blastRadius * this._pixelsPerMeter()
      },
      flags: { isAOEAttack: true, actorId: actor.id, weaponId: weapon.id }
    });

    if (!placement) {
      ui.notifications.info("AOE attack cancelled.");
      return;
    }

    // Now roll the attack and resolve
    await this._rollAndResolve(actor, weapon, { x: placement.x, y: placement.y }, blastRadius, options);
  }

  /**
   * Run the interactive Region placement flow (Foundry v14 replacement for the
   * old MeasuredTemplate preview). Returns the snapped placement info, or null if
   * the player cancelled (right-click / Escape are handled by placeRegion itself).
   *
   * @param {Object} cfg
   * @param {string} cfg.name Region name
   * @param {string} cfg.color Fill color
   * @param {Object} cfg.shape A single Region shape object (in pixel units)
   * @param {Object} [cfg.flags] mech-foundry flags to attach to the region
   * @returns {Promise<{x:number, y:number, rotation:number, region:RegionDocument}|null>}
   */
  static async _placeRegionInteractive({ name, color, shape, flags = {} }) {
    const regionData = {
      name,
      color,
      shapes: [shape],
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      flags: { "mech-foundry": flags }
    };

    // Snap the region to grid centers while the player moves it.
    const onMove = (event) => {
      const snapped = canvas.grid.getSnappedPoint(event.position, {
        mode: CONST.GRID_SNAPPING_MODES.CENTER
      });
      Object.assign(event.position, snapped);
    };

    ui.notifications.info("Position the blast, click to confirm. Right-click or Escape to cancel.");

    let region;
    try {
      // create:false → returns an unsaved RegionDocument with the placed geometry.
      region = await canvas.regions.placeRegion(regionData, { create: false, onMove });
    } catch (e) {
      console.error("mech-foundry | Region placement failed", e);
      return null;
    }

    if (!region) return null;

    const placedShape = region.shapes?.[0] ?? {};
    return {
      x: placedShape.x ?? 0,
      y: placedShape.y ?? 0,
      rotation: placedShape.rotation ?? 0,
      region
    };
  }

  /**
   * Roll the attack and resolve blast damage after region placement.
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
        // Skill level from XP (single source of truth on the actor document)
        skillLevel = actor.constructor.getSkillLevelFromXP(skill.system.xp);

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

    // Determine attacker origin (for scatter direction relative to the firing line)
    const sourceToken = AnimationHelper.getActorToken(actor);
    const attackerPoint = sourceToken?.center || null;

    // Determine final impact point (scatter on miss)
    let impactPoint = { ...aimPoint };
    let scatterInfo = null;

    if (!success) {
      const marginOfFailure = Math.abs(marginOfSuccess);
      scatterInfo = await this._calculateScatter(marginOfFailure);
      impactPoint = this._applyScatter(aimPoint, scatterInfo, attackerPoint);
    }

    // Play AOE projectile animation (if configured)
    const animationPath = weapon.system.animation;
    if (animationPath && sourceToken) {
      const animationDuration = weapon.system.animationDuration ?? 0;
      await AnimationHelper.playAOEAnimation(sourceToken, impactPoint, {
        file: animationPath,
        duration: animationDuration
      });
    }

    // Place the final blast Region on the canvas (visual only)
    const finalRegion = await this._placeBlastRegion(impactPoint, blastRadius, scatterInfo);

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
    const messageContent = await foundry.applications.handlebars.renderTemplate(
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
        // Region info for cleanup
        templateId: finalRegion?.id || null
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
   * Per A Time of War, direction is a 1d6 roll relative to the firing line:
   * 1 = directly away from the attacker, each further number +60° clockwise.
   * Distance = margin of failure in meters.
   *
   * @param {number} marginOfFailure The absolute margin of failure
   * @returns {Promise<Object>} Scatter info with direction and distance
   */
  static async _calculateScatter(marginOfFailure) {
    const directionRoll = new Roll("1d6");
    await directionRoll.evaluate();
    const clockPosition = directionRoll.total;
    // Offset from the firing line, in degrees clockwise (1 → 0°, 2 → 60°, ...)
    const relativeAngle = (clockPosition - 1) * 60;
    const label = this.SCATTER_LABELS[clockPosition];
    const distance = marginOfFailure; // 1 meter per MoF

    return {
      clockPosition,
      relativeAngle,
      label,
      distance,
      directionRoll: directionRoll.total
    };
  }

  /**
   * Apply scatter offset to the aim point.
   * The scatter direction is measured relative to the attacker→target firing line
   * (a 1 on the die scatters directly away from the attacker). If the attacker
   * position is unknown, "away from attacker" falls back to canvas north.
   *
   * @param {{x: number, y: number}} aimPoint Original aim point
   * @param {Object} scatterInfo Scatter calculation result
   * @param {{x: number, y: number}|null} attackerPoint The attacker's token center
   * @returns {{x: number, y: number}} New impact point
   */
  static _applyScatter(aimPoint, scatterInfo, attackerPoint = null) {
    const pixelsPerMeter = this._pixelsPerMeter();
    const pixelDistance = scatterInfo.distance * pixelsPerMeter;

    // Base direction = "directly away from the attacker" (attacker → aim, continued).
    // Fallback to canvas north (-y) if attacker position is unavailable.
    let baseAngle;
    if (attackerPoint) {
      baseAngle = Math.atan2(aimPoint.y - attackerPoint.y, aimPoint.x - attackerPoint.x);
    } else {
      baseAngle = -Math.PI / 2; // north
    }

    const totalAngle = baseAngle + (scatterInfo.relativeAngle * Math.PI) / 180;
    const dx = Math.cos(totalAngle) * pixelDistance;
    const dy = Math.sin(totalAngle) * pixelDistance;

    return {
      x: aimPoint.x + dx,
      y: aimPoint.y + dy
    };
  }

  /**
   * Create the persistent blast Region on the canvas (visual aid only).
   * Failures here are swallowed so a cosmetic issue never breaks resolution.
   *
   * @param {{x: number, y: number}} position The center position (pixels)
   * @param {number} blastRadius The radius in meters
   * @param {Object|null} scatterInfo Scatter info if the attack missed
   * @returns {Promise<RegionDocument|null>}
   */
  static async _placeBlastRegion(position, blastRadius, scatterInfo) {
    const regionData = {
      name: scatterInfo ? "Scattered Blast" : "Blast",
      color: scatterInfo ? "#ff8800" : "#ff4400", // Orange for scattered, red for direct hit
      shapes: [{
        type: "circle",
        x: position.x,
        y: position.y,
        radius: blastRadius * this._pixelsPerMeter()
      }],
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      flags: { "mech-foundry": { isAOEBlast: true, scattered: !!scatterInfo } }
    };

    try {
      const created = await canvas.scene.createEmbeddedDocuments("Region", [regionData]);
      return created?.[0] || null;
    } catch (e) {
      console.warn("mech-foundry | Could not create blast Region (visual only)", e);
      return null;
    }
  }

  /**
   * Find all tokens within a given radius from a center point.
   *
   * @param {{x: number, y: number}} center The blast center (pixels)
   * @param {number} radius The radius in meters
   * @returns {Array<{token: Token, distance: number}>}
   */
  static _getTokensInRadius(center, radius) {
    const pixelsPerMeter = this._pixelsPerMeter();
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
  // Suppression Fire Region Methods
  // ============================================

  /**
   * Initiate suppression fire with a line (ray) Region placement.
   * The strip is 1m wide and the length is defined by the suppression area.
   *
   * @param {Actor} actor The attacking actor
   * @param {Item} weapon The weapon
   * @param {Object} options Attack options (suppressionArea, roundsPerSqm, modifier, etc.)
   */
  static async initiateSuppressionFire(actor, weapon, options = {}) {
    const length = options.suppressionArea || 1; // Length in meters
    const pixelsPerMeter = this._pixelsPerMeter();

    const placement = await this._placeRegionInteractive({
      name: `${weapon.name} Suppression`,
      color: game.user.color || "#ffaa00",
      shape: {
        type: "line",
        x: 0,
        y: 0,
        length: length * pixelsPerMeter,
        width: 1 * pixelsPerMeter, // 1 meter wide
        rotation: 0
      },
      flags: { isSuppressionFire: true, actorId: actor.id, weaponId: weapon.id }
    });

    if (!placement) {
      ui.notifications.info("Suppression fire cancelled.");
      return;
    }

    const rayPlacement = { x: placement.x, y: placement.y, direction: placement.rotation };

    // Place the final suppression Region on the canvas (visual only)
    const finalRegion = await this._placeSuppressionRegion(rayPlacement, length);

    // Find all tokens within the strip
    const targets = this._getTokensInRay(rayPlacement, length);

    // Delegate back to the standard rollWeaponAttack for each detected target.
    // Pass placement geometry directly so the animation path needs no canvas lookup.
    options.suppressionTargets = targets;
    options.suppressionRegionId = finalRegion?.id || null;
    options.suppressionPlacement = {
      x: rayPlacement.x,
      y: rayPlacement.y,
      direction: rayPlacement.direction,
      distance: length
    };

    await actor.rollWeaponAttack(weapon.id, options);
  }

  /**
   * Create the persistent suppression Region on the canvas (visual aid only).
   *
   * @param {{x: number, y: number, direction: number}} placement Origin + direction (degrees)
   * @param {number} length The strip length in meters
   * @returns {Promise<RegionDocument|null>}
   */
  static async _placeSuppressionRegion(placement, length) {
    const pixelsPerMeter = this._pixelsPerMeter();
    const regionData = {
      name: "Suppression Zone",
      color: "#ffaa00",
      shapes: [{
        type: "line",
        x: placement.x,
        y: placement.y,
        length: length * pixelsPerMeter,
        width: 1 * pixelsPerMeter,
        rotation: placement.direction
      }],
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      flags: { "mech-foundry": { isSuppressionFire: true } }
    };

    try {
      const created = await canvas.scene.createEmbeddedDocuments("Region", [regionData]);
      return created?.[0] || null;
    } catch (e) {
      console.warn("mech-foundry | Could not create suppression Region (visual only)", e);
      return null;
    }
  }

  /**
   * Find all tokens within a ray (strip) area.
   *
   * @param {{x: number, y: number, direction: number}} placement Origin + direction (degrees)
   * @param {number} length The strip length in meters
   * @returns {Array<{token: Token, distance: number}>}
   */
  static _getTokensInRay(placement, length) {
    const pixelsPerMeter = this._pixelsPerMeter();
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
