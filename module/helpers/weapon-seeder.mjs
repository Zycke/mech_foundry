import { WEAPON_SEED } from '../data/weapons.mjs';

/**
 * weapon-seeder.mjs
 * -----------------
 * Populates the `mech-foundry.weapons` compendium with the transcribed A Time of
 * War weapon catalogue as fully GM-editable `weapon` Items, organised into
 * folders by Skill (top level) and weapon sub-category (child level) — e.g.
 * Small Arms › Ballistic.
 *
 * Same "seed when empty, or force to add missing-by-name" rule as the other
 * reference compendia, so it self-heals after a system update replaces the pack
 * directory and reconciles new entries on a version change without disturbing
 * existing (possibly GM-edited) items or their folder arrangement.
 */

const PACK_ID = 'mech-foundry.weapons';

/** Ensure the Skill → sub-category folder tree exists; returns lookup maps. */
async function ensureFolders(seed) {
  // Desired structure: skill -> Set(category).
  const wanted = new Map();
  for (const e of seed) {
    if (!wanted.has(e.skill)) wanted.set(e.skill, new Set());
    if (e.category) wanted.get(e.skill).add(e.category);
  }

  const pack = game.packs.get(PACK_ID);
  const topByName = () => new Map(Array.from(pack.folders).filter(f => !f.folder).map(f => [f.name, f]));

  // Top-level (skill) folders.
  let tops = topByName();
  const newTops = [...wanted.keys()].filter(s => !tops.has(s)).map(name => ({ name, type: 'Item', sorting: 'a' }));
  if (newTops.length) { await Folder.createDocuments(newTops, { pack: PACK_ID }); tops = topByName(); }

  // Child (sub-category) folders.
  const childKey = (f) => `${f.folder?.name}/${f.name}`;
  let children = new Map(Array.from(pack.folders).filter(f => f.folder).map(f => [childKey(f), f]));
  const newChildren = [];
  for (const [skill, cats] of wanted) {
    const parent = tops.get(skill);
    for (const cat of cats) {
      if (!children.has(`${skill}/${cat}`)) newChildren.push({ name: cat, type: 'Item', folder: parent.id, sorting: 'a' });
    }
  }
  if (newChildren.length) {
    await Folder.createDocuments(newChildren, { pack: PACK_ID });
    children = new Map(Array.from(pack.folders).filter(f => f.folder).map(f => [childKey(f), f]));
  }

  return { tops, children };
}

/** Resolve the folder id an entry belongs in (child if it has a category). */
function folderIdFor(entry, { tops, children }) {
  if (entry.category && children.has(`${entry.skill}/${entry.category}`)) {
    return children.get(`${entry.skill}/${entry.category}`).id;
  }
  return tops.get(entry.skill)?.id ?? null;
}

/**
 * Seed the weapons pack. Safe to call on every `ready`.
 * @param {object} [opts]
 * @param {boolean} [opts.force]  Add missing-by-name entries even if populated.
 * @param {boolean} [opts.quiet]  Suppress the success/up-to-date notifications.
 * @returns {Promise<number>} how many weapons were created
 */
export async function seedWeapons({ force = false, quiet = false } = {}) {
  if (!game.user?.isGM) return 0;

  const pack = game.packs?.get(PACK_ID);
  if (!pack) {
    console.warn(`mech-foundry | Weapons pack "${PACK_ID}" not found; skipping seed.`);
    if (force && !quiet) ui.notifications?.warn('Mech Foundry: Weapons compendium not found.');
    return 0;
  }
  if (!WEAPON_SEED.length) return 0; // nothing transcribed yet

  const index = await pack.getIndex();
  // Auto-seed only when empty; a populated pack is left alone unless forced.
  if (index.size > 0 && !force) return 0;

  const existingNames = new Set(index.map(e => e.name));
  const toCreate = WEAPON_SEED.filter(e => !existingNames.has(e.item.name));
  if (!toCreate.length) {
    if (force && !quiet) ui.notifications?.info('Mech Foundry: Weapons compendium already up to date.');
    return 0;
  }

  try {
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });

    const folders = await ensureFolders(WEAPON_SEED);
    const docs = toCreate.map(e => ({ ...foundry.utils.deepClone(e.item), folder: folderIdFor(e, folders) }));
    await Item.createDocuments(docs, { pack: PACK_ID });

    if (wasLocked) await pack.configure({ locked: true });
    console.log(`mech-foundry | Seeded ${toCreate.length} weapon(s) into ${PACK_ID}.`);
    if (!quiet) ui.notifications?.info(`Mech Foundry: added ${toCreate.length} weapon(s) to the Weapons compendium.`);
    return toCreate.length;
  } catch (err) {
    console.error('mech-foundry | Failed to seed weapons:', err);
    if (!quiet) ui.notifications?.error('Mech Foundry: failed to seed Weapons (see console). The pack may be read-only.');
    return 0;
  }
}
