/**
 * pack-seeder.mjs
 * ---------------
 * Generic seeder for a foldered Item compendium. The equipment packs (ammo,
 * armor, electronics, field gear, medical, …) all share the same shape — an
 * array of `{ folder, subfolder, item }` seed entries — so they share this one
 * implementation instead of copying the boilerplate per pack.
 *
 * Rule (same as the other reference compendia): seed when the pack is empty;
 * on a version reconcile (`force`) add any entries missing by name without
 * disturbing existing/GM-edited items or their folder arrangement; `refresh`
 * overwrites already-present items with the current seed data (data corrections,
 * discards GM edits — hence manual/explicit).
 */

/** Ensure the top → sub folder tree exists in `pack`; returns lookup maps. */
async function ensureFolders(pack, packId, seed) {
  const wanted = new Map();
  for (const e of seed) {
    if (!wanted.has(e.folder)) wanted.set(e.folder, new Set());
    if (e.subfolder) wanted.get(e.folder).add(e.subfolder);
  }
  const topByName = () => new Map(Array.from(pack.folders).filter(f => !f.folder).map(f => [f.name, f]));

  let tops = topByName();
  const newTops = [...wanted.keys()].filter(s => !tops.has(s)).map(name => ({ name, type: 'Item', sorting: 'a' }));
  if (newTops.length) { await Folder.createDocuments(newTops, { pack: packId }); tops = topByName(); }

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
    await Folder.createDocuments(newChildren, { pack: packId });
    children = new Map(Array.from(pack.folders).filter(f => f.folder).map(f => [childKey(f), f]));
  }
  return { tops, children };
}

function folderIdFor(entry, { tops, children }) {
  if (entry.subfolder && children.has(`${entry.folder}/${entry.subfolder}`)) {
    return children.get(`${entry.folder}/${entry.subfolder}`).id;
  }
  return tops.get(entry.folder)?.id ?? null;
}

/**
 * Build a seed function bound to a pack + seed accessor.
 * @param {string} packId    e.g. 'mech-foundry.electronics'
 * @param {() => Array} getSeed  returns the `{folder, subfolder, item}[]` seed
 * @param {string} label     human label for notifications (e.g. 'Electronics')
 * @returns {(opts?: {force?:boolean, quiet?:boolean, refresh?:boolean}) => Promise<number>}
 */
export function makeFolderedSeeder(packId, getSeed, label) {
  return async function seed({ force = false, quiet = false, refresh = false } = {}) {
    if (!game.user?.isGM) return 0;
    const pack = game.packs?.get(packId);
    if (!pack) {
      console.warn(`mech-foundry | ${label} pack "${packId}" not found; skipping seed.`);
      if (force && !quiet) ui.notifications?.warn(`Mech Foundry: ${label} compendium not found.`);
      return 0;
    }
    const SEED = getSeed();
    if (!SEED.length) return 0;

    const index = await pack.getIndex();
    if (index.size > 0 && !force && !refresh) return 0;

    const existingByName = new Map(index.map(e => [e.name, e._id]));
    const toCreate = SEED.filter(e => !existingByName.has(e.item.name));
    const toUpdate = refresh
      ? SEED.filter(e => existingByName.has(e.item.name)).map(e => ({
          _id: existingByName.get(e.item.name),
          img: e.item.img,
          system: foundry.utils.deepClone(e.item.system)
        }))
      : [];

    if (!toCreate.length && !toUpdate.length) {
      if ((force || refresh) && !quiet) ui.notifications?.info(`Mech Foundry: ${label} compendium already up to date.`);
      return 0;
    }

    try {
      const wasLocked = pack.locked;
      if (wasLocked) await pack.configure({ locked: false });
      if (toCreate.length) {
        const folders = await ensureFolders(pack, packId, SEED);
        const docs = toCreate.map(e => ({ ...foundry.utils.deepClone(e.item), folder: folderIdFor(e, folders) }));
        await Item.createDocuments(docs, { pack: packId });
      }
      if (toUpdate.length) await Item.updateDocuments(toUpdate, { pack: packId });
      if (wasLocked) await pack.configure({ locked: true });
      const msg = [toCreate.length ? `added ${toCreate.length}` : '', toUpdate.length ? `refreshed ${toUpdate.length}` : ''].filter(Boolean).join(', ');
      console.log(`mech-foundry | ${label} seed: ${msg}.`);
      if (!quiet) ui.notifications?.info(`Mech Foundry: ${msg} item(s) in the ${label} compendium.`);
      return toCreate.length + toUpdate.length;
    } catch (err) {
      console.error(`mech-foundry | Failed to seed ${label}:`, err);
      if (!quiet) ui.notifications?.error(`Mech Foundry: failed to seed ${label} (see console). The pack may be read-only.`);
      return 0;
    }
  };
}
