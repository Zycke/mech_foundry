/**
 * shop-catalog.mjs
 * ----------------
 * Registry of the equipment-shop tabs. Each entry maps a tab to a source
 * compendium (and optionally an item-type filter within it). The shop renders
 * one tab per entry whose pack exists and is non-empty, so expanding the shop to
 * a new equipment type is a one-line addition here once its compendium ships —
 * no changes to the shop application itself.
 *
 * `types` (optional) restricts which item types from the pack appear on the tab
 * (useful when a single pack holds mixed types). Omit to include everything.
 */
export const SHOP_TABS = [
  { id: 'weapons', label: 'Weapons', icon: 'fa-solid fa-gun', pack: 'mech-foundry.weapons', types: ['weapon'] },
  { id: 'ammunition', label: 'Ammunition', icon: 'fa-solid fa-boxes-stacked', pack: 'mech-foundry.ammunition', types: ['ammo'] },
  { id: 'armor', label: 'Armor', icon: 'fa-solid fa-shield-halved', pack: 'mech-foundry.armor', types: ['armor'] },
  // Future equipment tabs — uncomment as each compendium is added:
  { id: 'electronics', label: 'Electronics', icon: 'fa-solid fa-microchip', pack: 'mech-foundry.electronics', types: ['electronics'] },
  // { id: 'medical', label: 'Medical', icon: 'fa-solid fa-kit-medical', pack: 'mech-foundry.medical', types: ['healthcare', 'drugpoison'] },
  { id: 'gear', label: 'Field Gear', icon: 'fa-solid fa-toolbox', pack: 'mech-foundry.gear', types: ['supplies', 'fuel'] }
];

/**
 * The tabs that can actually be shown right now: pack registered and non-empty.
 * Returns `{ ...tab, count }` for each live tab, in registry order. Async because
 * a compendium's index is lazily built — we await getIndex() so a pack that
 * hasn't been read yet still reports its true size (rather than 0 → hidden tab).
 */
export async function availableShopTabs() {
  const tabs = game.mechfoundry?.config?.shopTabs || SHOP_TABS;
  const live = [];
  for (const tab of tabs) {
    const pack = game.packs?.get(tab.pack);
    if (!pack) continue;
    const index = await pack.getIndex();
    if (!index.size) continue;
    live.push({ ...tab, count: index.size });
  }
  return live;
}
