/**
 * Dice Mechanics Helper
 * Handles Fumble, Stunning Success, and Miraculous Feat special roll outcomes
 *
 * Based on A Time of War rules:
 * - Fumble: Both dice show 1 (snake eyes) = automatic failure
 * - Stunning Success: Both dice show 6 (boxcars) = roll extra d6, keep rolling on 6s
 * - Miraculous Feat: Stunning Success with 3+ consecutive bonus 6s (total=30) = auto-pass
 */
export class DiceMechanics {

  /**
   * Evaluate a 2d6 roll for special mechanics (Fumble, Stunning Success, Miraculous Feat)
   * @param {number[]} diceResults - The two d6 results [die1, die2]
   * @returns {Promise<Object>} - Special roll info
   */
  static async evaluateSpecialRoll(diceResults) {
    const [die1, die2] = diceResults;

    // Check for Fumble (both dice show 1 - snake eyes)
    if (die1 === 1 && die2 === 1) {
      return {
        isFumble: true,
        isStunningSuccess: false,
        isMiraculousFeat: false,
        bonusDice: [],
        bonusTotal: 0,
        displayText: "FUMBLE!"
      };
    }

    // Check for Stunning Success (both dice show 6 - boxcars)
    if (die1 === 6 && die2 === 6) {
      const bonusDice = [];
      let currentRoll = 6;

      // Keep rolling while we get 6s
      while (currentRoll === 6) {
        const bonusRoll = await new Roll("1d6").evaluate();
        currentRoll = bonusRoll.total;
        bonusDice.push(currentRoll);
      }

      const bonusTotal = bonusDice.reduce((sum, d) => sum + d, 0);

      // Check for Miraculous Feat: need 3 consecutive 6s in the bonus dice
      // That means bonusDice starts with [6, 6, 6, ...] before hitting a non-6
      // Count consecutive 6s from the start (all but last are 6s if we kept rolling)
      let consecutiveSixes = 0;
      for (let i = 0; i < bonusDice.length - 1; i++) {
        if (bonusDice[i] === 6) {
          consecutiveSixes++;
        } else {
          break;
        }
      }

      // Miraculous Feat requires 3+ consecutive 6s (giving total of 12 + 6 + 6 + 6 = 30)
      const isMiraculousFeat = consecutiveSixes >= 3;

      return {
        isFumble: false,
        isStunningSuccess: true,
        isMiraculousFeat: isMiraculousFeat,
        bonusDice: bonusDice,
        bonusTotal: bonusTotal,
        displayText: isMiraculousFeat ? "MIRACULOUS FEAT!" : "Stunning Success!"
      };
    }

    // Normal roll - no special mechanics
    return {
      isFumble: false,
      isStunningSuccess: false,
      isMiraculousFeat: false,
      bonusDice: [],
      bonusTotal: 0,
      displayText: null
    };
  }

  /**
   * Determine final success considering special mechanics
   * @param {number} rollTotal - Original 2d6 + modifiers total
   * @param {number} targetNumber - Target number to beat
   * @param {Object} specialRoll - Result from evaluateSpecialRoll
   * @returns {Object} - Final success/failure info with adjusted totals
   */
  static determineSuccess(rollTotal, targetNumber, specialRoll) {
    // Fumble always fails, regardless of modifiers
    if (specialRoll.isFumble) {
      return {
        success: false,
        autoResult: true,
        finalTotal: rollTotal,
        mos: rollTotal - targetNumber // Still calculate MoS for reference
      };
    }

    // Miraculous Feat always succeeds (if physically possible)
    if (specialRoll.isMiraculousFeat) {
      const finalTotal = rollTotal + specialRoll.bonusTotal;
      return {
        success: true,
        autoResult: true,
        finalTotal: finalTotal,
        mos: finalTotal - targetNumber
      };
    }

    // Stunning Success - add bonus dice to total, then check normally
    if (specialRoll.isStunningSuccess) {
      const finalTotal = rollTotal + specialRoll.bonusTotal;
      return {
        success: finalTotal >= targetNumber,
        autoResult: false,
        finalTotal: finalTotal,
        mos: finalTotal - targetNumber
      };
    }

    // Normal roll - standard success check
    return {
      success: rollTotal >= targetNumber,
      autoResult: false,
      finalTotal: rollTotal,
      mos: rollTotal - targetNumber
    };
  }

  /**
   * Format bonus dice for display
   * @param {number[]} bonusDice - Array of bonus die results
   * @returns {string} - Formatted string like "+6, +6, +3"
   */
  static formatBonusDice(bonusDice) {
    if (!bonusDice || bonusDice.length === 0) return '';
    return bonusDice.map(d => `+${d}`).join(', ');
  }
}
