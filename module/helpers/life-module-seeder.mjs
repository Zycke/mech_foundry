import { LIFE_MODULE_SEED } from '../data/life-modules.mjs';

/**
 * life-module-seeder.mjs
 * ----------------------
 * Populates the `mech-foundry.life-modules` compendium with the starter set the
 * first time a world loads (milestone M2). Everything it creates is a normal,
 * fully GM-editable `lifeModule` Item — the GM can unlock the pack and edit,
 * add, or delete entries freely afterwards.
 *
 * Idempotent and non-destructive: it only imports when the pack is empty and it
 * has never seeded this world before (tracked by a world setting), so a GM who
 * clears the pack on purpose will not have it silently repopulated.
 */

const PACK_ID = 'mech-foundry.life-modules';
const SEEDED_FLAG = 'lifeModulesSeeded';

/** Register the one-time-seed tracking flag. Call from the init hook. */
export function registerSeederSettings() {
  game.settings.register('mech-foundry', SEEDED_FLAG, {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
  });
}

/**
 * Seed the compendium if appropriate. Safe to call unconditionally on ready;
 * it no-ops unless the current user is the GM, the pack exists and is empty,
 * and it has not been seeded before.
 */
export async function seedLifeModules() {
  if (!game.user?.isGM) return;

  const pack = game.packs?.get(PACK_ID);
  if (!pack) {
    console.warn(`mech-foundry | Life Modules pack "${PACK_ID}" not found; skipping seed.`);
    return;
  }

  // Respect a GM who has intentionally emptied the pack.
  if (game.settings.get('mech-foundry', SEEDED_FLAG)) return;

  const index = await pack.getIndex();
  if (index.size > 0) {
    // Pack already has content (e.g. from a prior version); mark as seeded.
    await game.settings.set('mech-foundry', SEEDED_FLAG, true);
    return;
  }

  try {
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });

    await Item.createDocuments(foundry.utils.deepClone(LIFE_MODULE_SEED), { pack: PACK_ID });

    if (wasLocked) await pack.configure({ locked: true });
    await game.settings.set('mech-foundry', SEEDED_FLAG, true);
    console.log(`mech-foundry | Seeded ${LIFE_MODULE_SEED.length} life modules into ${PACK_ID}.`);
    ui.notifications?.info(`Mech Foundry: seeded ${LIFE_MODULE_SEED.length} starter life modules into the Life Modules compendium.`);
  } catch (err) {
    console.error('mech-foundry | Failed to seed life modules:', err);
  }
}
