import { ARMOR_SEED } from '../data/armor.mjs';

/**
 * armor-seeder.mjs
 * ----------------
 * Populates the `mech-foundry.armor` compendium with the transcribed
 * A Time of War personal-armor catalogue as fully GM-editable `armor` Items,
 * organised under Personal Armor and foldered by armor type (Flak, Ablative,
 * Ballistic Plate, Concealed, …).
 *
 * Same "seed when empty, or force to add missing-by-name" rule as the other
 * reference compendia, so it self-heals after a system update replaces the pack
 * directory and reconciles new entries on a version change without disturbing
 * existing (possibly GM-edited) items or their folder arrangement.
 */

const PACK_ID = 'mech-foundry.armor';

/** Ensure the kind → sub-type folder tree exists; returns lookup maps. */
async function ensureFolders(seed) {
  // Desired structure: folder -> Set(subfolder).
  const wanted = new Map();
  for (const e of seed) {
    if (!wanted.has(e.folder)) wanted.set(e.folder, new Set());
    if (e.subfolder) wanted.get(e.folder).add(e.subfolder);
  }

  const pack = game.packs.get(PACK_ID);
  const topByName = () => new Map(Array.from(pack.folders).filter(f => !f.folder).map(f => [f.name, f]));

  // Top-level (kind) folders.
  let tops = topByName();
  const newTops = [...wanted.keys()].filter(s => !tops.has(s)).map(name => ({ name, type: 'Item', sorting: 'a' }));
  if (newTops.length) { await Folder.createDocuments(newTops, { pack: PACK_ID }); tops = topByName(); }

  // Child (sub-type) folders.
  const childKey = (f) => `${f.folder?.name}/${f.name}`;
  let children = new Map(Array.from(pack.folders).filter(f => f.folder).map(f => [childKey(f), f]));
  const newChildren = [];
  for (const [top, subs] of wanted) {
    const parent = tops.get(top);
    for (const sub of subs) {
      if (!children.has(`${top}/${sub}`)) newChildren.push({ name: sub, type: 'Item', folder: parent.id, sorting: 'a' });
    }
  }
  if (newChildren.length) {
    await Folder.createDocuments(newChildren, { pack: PACK_ID });
    children = new Map(Array.from(pack.folders).filter(f => f.folder).map(f => [childKey(f), f]));
  }

  return { tops, children };
}

/** Resolve the folder id an entry belongs in (child if it has a sub-type). */
function folderIdFor(entry, { tops, children }) {
  if (entry.subfolder && children.has(`${entry.folder}/${entry.subfolder}`)) {
    return children.get(`${entry.folder}/${entry.subfolder}`).id;
  }
  return tops.get(entry.folder)?.id ?? null;
}

/**
 * Seed the armor pack. Safe to call on every `ready`.
 * @param {object} [opts]
 * @param {boolean} [opts.force]    Add missing-by-name entries even if populated.
 * @param {boolean} [opts.quiet]    Suppress the success/up-to-date notifications.
 * @param {boolean} [opts.refresh]  Re-apply seed system data to existing items.
 * @returns {Promise<number>} how many armor items were created/refreshed
 */
export async function seedArmor({ force = false, quiet = false, refresh = false } = {}) {
  if (!game.user?.isGM) return 0;

  const pack = game.packs?.get(PACK_ID);
  if (!pack) {
    console.warn(`mech-foundry | Armor pack "${PACK_ID}" not found; skipping seed.`);
    if (force && !quiet) ui.notifications?.warn('Mech Foundry: Armor compendium not found.');
    return 0;
  }
  if (!ARMOR_SEED.length) return 0; // nothing transcribed yet

  const index = await pack.getIndex();
  // Auto-seed only when empty; a populated pack is left alone unless forced/refreshed.
  if (index.size > 0 && !force && !refresh) return 0;

  const existingByName = new Map(index.map(e => [e.name, e._id]));
  const toCreate = ARMOR_SEED.filter(e => !existingByName.has(e.item.name));
  // `refresh` re-applies the seed's system data to already-present items (used
  // to push data corrections); it overwrites the stored stats, so GM edits to
  // those items are lost — hence it is a manual, explicit action.
  const toUpdate = refresh
    ? ARMOR_SEED.filter(e => existingByName.has(e.item.name)).map(e => ({
        _id: existingByName.get(e.item.name),
        img: e.item.img,
        system: foundry.utils.deepClone(e.item.system)
      }))
    : [];

  if (!toCreate.length && !toUpdate.length) {
    if ((force || refresh) && !quiet) ui.notifications?.info('Mech Foundry: Armor compendium already up to date.');
    return 0;
  }

  try {
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });

    if (toCreate.length) {
      const folders = await ensureFolders(ARMOR_SEED);
      const docs = toCreate.map(e => ({ ...foundry.utils.deepClone(e.item), folder: folderIdFor(e, folders) }));
      await Item.createDocuments(docs, { pack: PACK_ID });
    }
    if (toUpdate.length) await Item.updateDocuments(toUpdate, { pack: PACK_ID });

    if (wasLocked) await pack.configure({ locked: true });
    const msg = [
      toCreate.length ? `added ${toCreate.length}` : '',
      toUpdate.length ? `refreshed ${toUpdate.length}` : ''
    ].filter(Boolean).join(', ');
    console.log(`mech-foundry | Armor seed: ${msg}.`);
    if (!quiet) ui.notifications?.info(`Mech Foundry: ${msg} armor item(s) in the Armor compendium.`);
    return toCreate.length + toUpdate.length;
  } catch (err) {
    console.error('mech-foundry | Failed to seed armor:', err);
    if (!quiet) ui.notifications?.error('Mech Foundry: failed to seed Armor (see console). The pack may be read-only.');
    return 0;
  }
}
