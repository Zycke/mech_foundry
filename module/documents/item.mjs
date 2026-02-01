/**
 * Extend the base Item document for Mech Foundry system
 * Handles Active Effects on items and transfers them to actors when equipped
 * @extends {Item}
 */
export class MechFoundryItem extends Item {

  /**
   * Item types that can have effects and be equipped
   */
  static EQUIPPABLE_TYPES = ['weapon', 'armor', 'electronics', 'healthcare', 'prosthetics'];

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /* -------------------------------------------- */
  /*  Active Effect Management                    */
  /* -------------------------------------------- */

  /**
   * Check if this item is currently equipped
   * @returns {boolean}
   */
  get isEquipped() {
    if (this.type === 'armor') {
      return this.system.equipped === true || this.system.carryStatus === 'equipped';
    }
    return this.system.carryStatus === 'equipped';
  }

  /**
   * Get all Active Effects that should be transferred to the actor
   * @returns {Array} Array of effect data objects
   */
  getTransferableEffects() {
    const effects = [];

    // Get embedded Active Effects from this item
    const embeddedEffects = this.system.embeddedActiveEffects || [];

    for (const effect of embeddedEffects) {
      effects.push({
        ...effect,
        origin: this.uuid,
        sourceItemId: this.id,
        sourceItemName: this.name,
        disabled: !this.isEquipped
      });
    }

    return effects;
  }

  /**
   * Create a new embedded Active Effect on this item
   * @param {Object} effectData The effect data
   * @returns {Promise}
   */
  async createEmbeddedActiveEffect(effectData = {}) {
    const effects = Array.isArray(this.system.embeddedActiveEffects)
      ? [...this.system.embeddedActiveEffects]
      : [];

    const newEffect = {
      id: foundry.utils.randomID(),
      name: effectData.name || 'New Effect',
      icon: effectData.icon || 'icons/svg/aura.svg',
      active: effectData.active !== false,
      attachedItemOnly: effectData.attachedItemOnly || false,
      modifiers: effectData.modifiers || [],
      description: effectData.description || ''
    };

    effects.push(newEffect);
    return this.update({ 'system.embeddedActiveEffects': effects });
  }

  /**
   * Update an embedded Active Effect on this item
   * @param {string} effectId The effect ID to update
   * @param {Object} updateData The update data
   * @returns {Promise}
   */
  async updateEmbeddedActiveEffect(effectId, updateData) {
    const effects = Array.isArray(this.system.embeddedActiveEffects)
      ? [...this.system.embeddedActiveEffects]
      : [];

    const index = effects.findIndex(e => e.id === effectId);
    if (index === -1) return;

    effects[index] = foundry.utils.mergeObject(effects[index], updateData);
    return this.update({ 'system.embeddedActiveEffects': effects });
  }

  /**
   * Delete an embedded Active Effect from this item
   * @param {string} effectId The effect ID to delete
   * @returns {Promise}
   */
  async deleteEmbeddedActiveEffect(effectId) {
    const effects = Array.isArray(this.system.embeddedActiveEffects)
      ? [...this.system.embeddedActiveEffects]
      : [];

    const filtered = effects.filter(e => e.id !== effectId);
    return this.update({ 'system.embeddedActiveEffects': filtered });
  }

  /* -------------------------------------------- */
  /*  Effect Transfer Handling                    */
  /* -------------------------------------------- */

  /**
   * Called when item equipped status changes
   * Handles transferring effects to/from the owning actor
   * @param {boolean} equipped Whether the item is now equipped
   */
  async onEquipmentStatusChange(equipped) {
    const actor = this.parent;
    if (!actor) return;

    if (equipped) {
      await this._applyEffectsToActor(actor);
    } else {
      await this._removeEffectsFromActor(actor);
    }
  }

  /**
   * Apply this item's Active Effects to the owning actor
   * @param {Actor} actor The actor to apply effects to
   */
  async _applyEffectsToActor(actor) {
    const embeddedEffects = this.system.embeddedActiveEffects || [];
    if (embeddedEffects.length === 0) return;

    // Find existing transferred effects from this item and update them
    for (const effect of embeddedEffects) {
      const existingEffect = actor.items.find(i =>
        i.type === 'activeEffect' &&
        i.getFlag('mech-foundry', 'sourceItemId') === this.id &&
        i.getFlag('mech-foundry', 'sourceEffectId') === effect.id
      );

      if (existingEffect) {
        // Enable existing effect
        await existingEffect.update({ 'system.active': true });
      } else {
        // Create new transferred effect
        await this._createTransferredEffect(actor, effect);
      }
    }
  }

  /**
   * Remove this item's Active Effects from the owning actor
   * @param {Actor} actor The actor to remove effects from
   */
  async _removeEffectsFromActor(actor) {
    // Find all effects from this item
    const transferredEffects = actor.items.filter(i =>
      i.type === 'activeEffect' &&
      i.getFlag('mech-foundry', 'sourceItemId') === this.id
    );

    // Disable (don't delete) transferred effects
    for (const effect of transferredEffects) {
      await effect.update({ 'system.active': false });
    }
  }

  /**
   * Create a transferred Active Effect on the actor
   * @param {Actor} actor The target actor
   * @param {Object} effectData The effect data from this item
   */
  async _createTransferredEffect(actor, effectData) {
    // Convert item effect modifiers to activeEffect format
    const persistentModifiers = (effectData.modifiers || []).map(mod => ({
      targetType: mod.targetType || 'attribute',
      target: mod.target || '',
      operation: mod.operation || 'add',
      value: mod.value || 0
    }));

    const itemData = {
      name: `${effectData.name} (${this.name})`,
      type: 'activeEffect',
      img: effectData.icon || 'icons/svg/aura.svg',
      system: {
        description: effectData.description || `Effect from ${this.name}`,
        effectType: 'persistent',
        active: this.isEquipped,
        persistentModifiers: persistentModifiers
      },
      flags: {
        'mech-foundry': {
          sourceItemId: this.id,
          sourceItemName: this.name,
          sourceEffectId: effectData.id,
          attachedItemOnly: effectData.attachedItemOnly || false,
          isTransferred: true
        }
      }
    };

    await actor.createEmbeddedDocuments('Item', [itemData]);
  }

  /**
   * Sync all embedded effects to the actor (used for initial sync or repair)
   */
  async syncEffectsToActor() {
    const actor = this.parent;
    if (!actor) return;
    if (!MechFoundryItem.EQUIPPABLE_TYPES.includes(this.type)) return;

    const embeddedEffects = this.system.embeddedActiveEffects || [];

    for (const effect of embeddedEffects) {
      const existingEffect = actor.items.find(i =>
        i.type === 'activeEffect' &&
        i.getFlag('mech-foundry', 'sourceItemId') === this.id &&
        i.getFlag('mech-foundry', 'sourceEffectId') === effect.id
      );

      if (!existingEffect) {
        // Create missing transferred effect
        await this._createTransferredEffect(actor, effect);
      } else {
        // Update active state based on equipped status
        const shouldBeActive = this.isEquipped && effect.active;
        if (existingEffect.system.active !== shouldBeActive) {
          await existingEffect.update({ 'system.active': shouldBeActive });
        }
      }
    }
  }

  /**
   * Clean up transferred effects when item is deleted
   */
  async cleanupTransferredEffects() {
    const actor = this.parent;
    if (!actor) return;

    // Find all effects from this item
    const transferredEffects = actor.items.filter(i =>
      i.type === 'activeEffect' &&
      i.getFlag('mech-foundry', 'sourceItemId') === this.id
    );

    // Delete transferred effects
    const idsToDelete = transferredEffects.map(e => e.id);
    if (idsToDelete.length > 0) {
      await actor.deleteEmbeddedDocuments('Item', idsToDelete);
    }
  }
}
