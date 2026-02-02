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
}
