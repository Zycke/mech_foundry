import { skillSeedItems, traitSeedItems, ATOW_SUBSKILLS } from '../data/atow-lists.mjs';

/**
 * reference-seeder.mjs
 * --------------------
 * Seeds the editable Skills and Traits reference compendia (M7 item #7) from the
 * A Time of War master lists, and rebuilds the runtime config lists
 * (`game.mechfoundry.config.skillsList / traitsList / traitDescriptions`) FROM
 * the compendia so a GM's edits/additions flow through to the character wizard
 * without breaking any existing consumer.
 *
 * The config lists keep the exact shape the wizard/grant already expect
 * (skills: {name, links, tnc}; traits: {name, type, tp, desc}), reconstructed
 * losslessly from the seed's stored flags, or derived from the item's own
 * fields for GM-added entries that have no flags.
 *
 * Same "seed when empty" rule as the life modules — robust to redeploys.
 */

const SKILLS_PACK = 'mech-foundry.skills';
const TRAITS_PACK = 'mech-foundry.traits';

async function seedPackIfEmpty(packId, buildItems, { force = false } = {}) {
  const pack = game.packs?.get(packId);
  if (!pack) { console.warn(`mech-foundry | pack "${packId}" not found; skipping seed.`); return 0; }
  const index = await pack.getIndex();
  if (index.size > 0 && !force) return 0;

  const existing = new Set(index.map(e => e.name));
  const toCreate = buildItems().filter(i => !existing.has(i.name));
  if (!toCreate.length) return 0;

  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });
  await Item.createDocuments(foundry.utils.deepClone(toCreate), { pack: packId });
  if (wasLocked) await pack.configure({ locked: true });
  console.log(`mech-foundry | Seeded ${toCreate.length} into ${packId}.`);
  return toCreate.length;
}

/** Seed both reference packs (GM only, idempotent). */
export async function seedReferenceCompendia({ force = false } = {}) {
  if (!game.user?.isGM) return 0;
  let n = 0;
  try {
    n += await seedPackIfEmpty(SKILLS_PACK, skillSeedItems, { force });
    n += await seedPackIfEmpty(TRAITS_PACK, traitSeedItems, { force });
  } catch (err) {
    console.error('mech-foundry | Failed to seed reference compendia:', err);
    if (force) ui.notifications?.error('Mech Foundry: failed to seed reference compendia (see console).');
  }
  return n;
}

const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').trim();
const reconstructLinks = (sys) =>
  [sys.linkedAttribute1, sys.linkedAttribute2].filter(Boolean).map(a => String(a).toUpperCase()).join('+');

/**
 * Rebuild the runtime config reference lists from the compendia. Falls back to
 * the imported master lists (already set at init) if a pack is unavailable.
 */
export async function rebuildReferenceConfig() {
  const cfg = game.mechfoundry?.config;
  if (!cfg) return;

  const skillsPack = game.packs?.get(SKILLS_PACK);
  if (skillsPack) {
    const docs = await skillsPack.getDocuments();
    if (docs.length) {
      cfg.skillsList = docs
        .filter(d => d.type === 'skill')
        .map(d => ({
          name: d.name,
          links: d.getFlag('mech-foundry', 'links') || reconstructLinks(d.system),
          tnc: d.getFlag('mech-foundry', 'tnc') || `${d.system.targetNumber}/${d.system.complexity}`,
          subskills: Array.isArray(d.system.subskills) && d.system.subskills.length
            ? d.system.subskills
            : (ATOW_SUBSKILLS[d.name] || [])
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  const traitsPack = game.packs?.get(TRAITS_PACK);
  if (traitsPack) {
    const docs = await traitsPack.getDocuments();
    if (docs.length) {
      cfg.traitsList = docs
        .filter(d => d.type === 'trait')
        .map(d => ({
          name: d.name,
          type: d.getFlag('mech-foundry', 'category') || d.system.traitType || 'positive',
          tp: d.getFlag('mech-foundry', 'tp') || String(d.system.cost ?? ''),
          desc: d.getFlag('mech-foundry', 'summary') || stripHtml(d.system.description)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      cfg.traitDescriptions = Object.fromEntries(
        cfg.traitsList.map(t => [t.name, `${t.desc} (${t.type}, ${t.tp} TP)`])
      );
    }
  }
}
