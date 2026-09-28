import { pendingPSR } from "../helpers/tw-psr.mjs";
import { endPhaseRecovery } from "../helpers/tw-falls.mjs";

/**
 * Extend the base Combat document for the Mech Foundry system.
 *
 * A Time of War breaks initiative ties in favor of the higher Reflexes (RFL)
 * score. Foundry determines turn order through {@link Combat#_sortCombatants},
 * so the tiebreak must live there — sorting the derived `combat.turns` array
 * elsewhere has no persistent effect.
 *
 * @extends {Combat}
 */
export class MechFoundryCombat extends Combat {

  /** Total Warfare turn phase order. */
  static TW_PHASES = ['Initiative', 'Movement', 'Weapon Attack', 'Physical Attack', 'Heat', 'End'];

  get phaseIndex() { return this.getFlag('mech-foundry', 'phase') ?? 0; }
  get phaseName() { return MechFoundryCombat.TW_PHASES[this.phaseIndex] || 'Initiative'; }

  /** Advance to the next Total Warfare phase, rolling into the next round after End. */
  async nextPhase() {
    let i = this.phaseIndex + 1;
    if (i >= MechFoundryCombat.TW_PHASES.length) {
      await this.setFlag('mech-foundry', 'phase', 0);
      await this.nextRound();
    } else {
      await this.setFlag('mech-foundry', 'phase', i);
    }
    await this._announcePhase();
    // End Phase: unconscious (sheet-only) warriors roll to wake.
    if (this.phaseName === 'End') await endPhaseRecovery(this);
  }

  async _announcePhase() {
    // Remind the table of Piloting Skill Rolls still waiting to be rolled.
    const pending = [...new Set(this.combatants.map(c => c.actor).filter(a => a && pendingPSR(a)))];
    const note = pending.length
      ? `<div class="tw-phase-psr"><i class="fas fa-person-falling"></i> Piloting Skill Roll pending: ${pending.map(a => foundry.utils.escapeHTML?.(a.name) ?? a.name).join(', ')}</div>`
      : '';
    await ChatMessage.create({
      content: `<div class="mech-foundry tw-phase-banner"><i class="fas fa-flag"></i> <strong>${this.phaseName}</strong> Phase — Round ${this.round}${note}</div>`
    });
  }

  /** @override */
  _sortCombatants(a, b) {
    const ia = Number.isFinite(a.initiative) ? a.initiative : null;
    const ib = Number.isFinite(b.initiative) ? b.initiative : null;

    // Combatants without a rolled initiative sort last.
    if (ia === null && ib !== null) return 1;
    if (ib === null && ia !== null) return -1;

    // Higher initiative goes first.
    if (ia !== null && ib !== null && ia !== ib) return ib - ia;

    // Tie (or both unrolled): break in favor of higher RFL (total, incl. modifiers).
    const rflA = a.actor?.system?.attributes?.rfl?.total ?? 0;
    const rflB = b.actor?.system?.attributes?.rfl?.total ?? 0;
    if (rflA !== rflB) return rflB - rflA;

    // Stable final fallback by document id.
    return (a.id ?? "").localeCompare(b.id ?? "");
  }
}
