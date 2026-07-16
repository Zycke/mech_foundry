import { LIFE_MODULE_SEED } from '../data/life-modules.mjs';

/**
 * life-module-seeder.mjs
 * ----------------------
 * Populates the `mech-foundry.life-modules` compendium with the starter set.
 * Everything it creates is a normal, fully GM-editable `lifeModule` Item.
 *
 * The seed content is generated at runtime rather than shipped as a compiled
 * LevelDB (no Foundry CLI in this workflow), so the on-disk pack is empty on a
 * fresh checkout/update. Because of that the rule is simply: **if the pack is
 * empty, seed it.** This self-heals after a system update replaces the pack
 * directory. A GM who deletes individual modules keeps those deletions (we only
 * ever add entries whose name is not already present, and only auto-seed when
 * the pack is completely empty). `force: true` re-adds any missing seed entries
 * even when the pack already has content (used by the manual re-seed command).
 */

const PACK_ID = 'mech-foundry.life-modules';

/**
 * Kept for backwards compatibility (older worlds registered this flag). The
 * seeder no longer gates on it — emptiness of the pack is the source of truth.
 */
export function registerSeederSettings() {
  if (game.settings.settings.has('mech-foundry.lifeModulesSeeded')) return;
  game.settings.register('mech-foundry', 'lifeModulesSeeded', {
    scope: 'world', config: false, type: Boolean, default: false
  });
}

/**
 * Seed the compendium. Safe to call on every `ready`.
 * @param {object} [opts]
 * @param {boolean} [opts.force]   Add missing seed entries even if the pack is
 *                                 non-empty (manual re-seed). Also surfaces a
 *                                 notification when nothing needed adding.
 * @returns {Promise<number>} how many documents were created
 */
export async function seedLifeModules({ force = false } = {}) {
  if (!game.user?.isGM) return 0;

  const pack = game.packs?.get(PACK_ID);
  if (!pack) {
    console.warn(`mech-foundry | Life Modules pack "${PACK_ID}" not found; skipping seed.`);
    if (force) ui.notifications?.warn('Mech Foundry: Life Modules compendium not found.');
    return 0;
  }

  const index = await pack.getIndex();
  // Auto-seed only when empty; a populated pack is left alone unless forced.
  if (index.size > 0 && !force) return 0;

  const existingNames = new Set(index.map(e => e.name));
  const toCreate = LIFE_MODULE_SEED.filter(e => !existingNames.has(e.name));
  if (!toCreate.length) {
    if (force) ui.notifications?.info('Mech Foundry: Life Modules compendium already up to date.');
    return 0;
  }

  try {
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });

    await Item.createDocuments(foundry.utils.deepClone(toCreate), { pack: PACK_ID });

    if (wasLocked) await pack.configure({ locked: true });
    console.log(`mech-foundry | Seeded ${toCreate.length} life module(s) into ${PACK_ID}.`);
    ui.notifications?.info(`Mech Foundry: added ${toCreate.length} starter life module(s) to the Life Modules compendium.`);
    return toCreate.length;
  } catch (err) {
    console.error('mech-foundry | Failed to seed life modules:', err);
    ui.notifications?.error('Mech Foundry: failed to seed Life Modules (see console). The pack may be read-only.');
    return 0;
  }
}
