/**
 * Keep a sheet's scroll position across re-renders.
 *
 * Foundry restores the scroll of a part's `scrollable` elements while it swaps
 * the HTML in, but these sheets show their active tab afterwards (in
 * `_onRender`), so at that moment the content is hidden and the scroll clamps
 * to the top. This records every scrolled container before the render and puts
 * it back once the subclass `_onRender` code (tab activation) has run.
 */
const SCROLLERS = '.window-content, .sheet-body, .tab, .scrollable, form';

export function ScrollKeeperMixin(Base) {
  return class extends Base {
    #scroll = null;

    /** @override */
    async _preRender(context, options) {
      await super._preRender(context, options);
      this.#scroll = captureScroll(this.element);
    }

    /** @override */
    _onRender(context, options) {
      super._onRender(context, options);
      const saved = this.#scroll;
      this.#scroll = null;
      if (!saved?.length) return;
      // After the (synchronous) subclass _onRender work, before the next paint.
      Promise.resolve().then(() => restoreScroll(this.element, saved));
    }
  };
}

/** [{ key, top, left }] for each scrolled container, keyed by selector position. */
export function captureScroll(root) {
  if (!root?.querySelectorAll) return [];
  const out = [];
  [...root.querySelectorAll(SCROLLERS)].forEach((el, i) => {
    if (el.scrollTop || el.scrollLeft) out.push({ key: keyOf(el, i), top: el.scrollTop, left: el.scrollLeft });
  });
  return out;
}

export function restoreScroll(root, saved) {
  if (!root?.querySelectorAll) return;
  const els = [...root.querySelectorAll(SCROLLERS)];
  for (const s of saved) {
    const el = els.find((e, i) => keyOf(e, i) === s.key);
    if (!el) continue;
    el.scrollTop = s.top;
    el.scrollLeft = s.left;
  }
}

function keyOf(el, i) {
  return `${i}:${el.tagName}.${[...el.classList].filter(c => c !== 'active').sort().join('.')}:${el.dataset?.tab ?? ''}`;
}
