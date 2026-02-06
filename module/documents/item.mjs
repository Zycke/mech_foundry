/**
 * Extend the base Item document for Mech Foundry system
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
  /*  Equipment Status                            */
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

  /* -------------------------------------------- */
  /*  Armor Damage System                         */
  /* -------------------------------------------- */

  /**
   * Check if this armor item is damaged
   * @returns {boolean}
   */
  get isDamaged() {
    if (this.type !== 'armor') return false;
    return (this.system.armorDamage || 0) > 0;
  }

  /**
   * Get the current BAR values after damage reduction
   * @returns {Object} Object with m, b, e, x values
   */
  getCurrentBAR() {
    if (this.type !== 'armor') return { m: 0, b: 0, e: 0, x: 0 };

    const damage = this.system.armorDamage || 0;
    const bar = this.system.bar || { m: 0, b: 0, e: 0, x: 0 };

    return {
      m: Math.max(0, bar.m - damage),
      b: Math.max(0, bar.b - damage),
      e: Math.max(0, bar.e - damage),
      x: Math.max(0, bar.x - damage)
    };
  }

  /**
   * Get the maximum BAR values (undamaged)
   * @returns {Object} Object with m, b, e, x values
   */
  getMaxBAR() {
    if (this.type !== 'armor') return { m: 0, b: 0, e: 0, x: 0 };
    return this.system.bar || { m: 0, b: 0, e: 0, x: 0 };
  }

  /**
   * Apply damage to this armor
   * @param {number} amount Amount of damage to apply
   */
  async applyArmorDamage(amount) {
    if (this.type !== 'armor') return;

    const currentDamage = this.system.armorDamage || 0;
    const newDamage = currentDamage + amount;

    await this.update({ 'system.armorDamage': newDamage });

    ui.notifications.warn(`${this.name} takes ${amount} armor damage! (Total: ${newDamage})`);
    return newDamage;
  }

  /**
   * Repair this armor (reset damage to 0)
   */
  async repairArmor() {
    if (this.type !== 'armor') return;

    const wasDamaged = this.system.armorDamage > 0;
    await this.update({ 'system.armorDamage': 0 });

    if (wasDamaged) {
      ui.notifications.info(`${this.name} has been repaired.`);
    }
  }

  /**
   * Check if this armor covers a specific location
   * @param {string} location The location to check (head, torso, leftArm, rightArm, leftLeg, rightLeg)
   * @returns {boolean}
   */
  coversLocation(location) {
    if (this.type !== 'armor') return false;

    const coverage = this.system.coverage || {};

    // Map specific locations to coverage categories
    const locationMap = {
      'head': 'head',
      'torso': 'torso',
      'leftArm': 'arms',
      'rightArm': 'arms',
      'leftLeg': 'legs',
      'rightLeg': 'legs',
      'arms': 'arms',
      'legs': 'legs'
    };

    const coverageKey = locationMap[location] || location;
    return coverage[coverageKey] === true;
  }
}
