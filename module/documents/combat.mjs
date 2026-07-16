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
