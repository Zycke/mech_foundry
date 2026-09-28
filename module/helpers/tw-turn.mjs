/**
 * Turn / phase keys for per-turn combat records (fired weapons, movement,
 * damage taken this phase). Outside a running combat there is no key and
 * those records don't apply.
 */

/** Key identifying "this turn": the running combat's round, or null outside combat. */
export function currentTurnKey() {
  const c = game.combat;
  return c?.started ? `${c.id}:${c.round}` : null;
}

/** Key identifying "this phase" of this turn, or null outside combat. */
export function currentPhaseKey() {
  const c = game.combat;
  if (!c?.started) return null;
  const phase = c.getFlag?.('mech-foundry', 'phase') ?? 0;
  return `${c.id}:${c.round}:${phase}`;
}
