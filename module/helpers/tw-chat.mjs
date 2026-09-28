/**
 * Action buttons on combat chat cards, from what the card's flow recorded
 * (see beginRecording in gm-relay.mjs):
 *  - Roll PSR — for owners of units the card left with a Piloting Skill Roll pending;
 *  - Apply (GM) — writes that couldn't be applied (no permission, no GM online);
 *  - Undo (GM) — restores every field the card changed to its prior value.
 * A Time of War damage to linked characters isn't part of Undo.
 */
import { pendingPSR } from "./tw-psr.mjs";
import { rollPendingPSR } from "./tw-falls.mjs";
import { rollPendingControl } from "./tw-aero-flight.mjs";
import { isAero } from "./tw-aero.mjs";

const { DialogV2 } = foundry.applications.api;

function button(action, label, icon, extra = '') {
  return `<button type="button" data-mf-action="${action}" ${extra}><i class="fas ${icon}"></i> ${label}</button>`;
}

/** Build the action bar for a message (or '' if it needs none). Exposed for tests. */
export function cardActionsHTML(message) {
  const f = message?.flags?.['mech-foundry'];
  if (!f || !(f.undo || f.failed || f.psr)) return '';
  const esc = (t) => foundry.utils.escapeHTML?.(String(t)) ?? String(t);
  const parts = [];
  for (const uuid of f.psr || []) {
    const a = fromUuidSync(uuid);
    if (a?.isOwner && pendingPSR(a)) parts.push(button('psr', `${isAero(a) ? 'Roll Control' : 'Roll PSR'} — ${esc(a.name)}`, isAero(a) ? 'fa-plane' : 'fa-person-falling', `data-uuid="${uuid}"`));
  }
  if (game.user.isGM && f.failed?.length) {
    parts.push(f.applied ? '<span class="tw-card-done">Applied</span>'
      : button('apply', 'Apply damage', 'fa-check', 'title="These changes could not be written when the card was made (no permission / no GM online). Apply them now."'));
  }
  if (game.user.isGM && f.undo?.length) {
    parts.push(f.undone ? '<span class="tw-card-done">Undone</span>'
      : button('undo', 'Undo', 'fa-rotate-left', 'title="Restore every unit this card changed to how it was before (A Time of War damage to linked characters is not undone)"'));
  }
  return parts.length ? `<div class="mech-foundry tw-card-actions">${parts.join('')}</div>` : '';
}

/** Undo a card: restore the recorded prior values, then mark the card undone. */
export async function undoCard(message) {
  const f = message.flags?.['mech-foundry'];
  if (!game.user.isGM || !f?.undo?.length || f.undone) return false;
  for (const { uuid, data } of f.undo) {
    const doc = await fromUuid(uuid);
    if (doc) await doc.update(foundry.utils.deepClone(data));
  }
  await message.update({ 'flags.mech-foundry.undone': true });
  return true;
}

/** Apply the writes a card couldn't make at the time. */
export async function applyCard(message) {
  const f = message.flags?.['mech-foundry'];
  if (!game.user.isGM || !f?.failed?.length || f.applied) return false;
  for (const { uuid, data } of f.failed) {
    const doc = await fromUuid(uuid);
    if (doc) await doc.update(foundry.utils.deepClone(data));
  }
  await message.update({ 'flags.mech-foundry.applied': true });
  return true;
}

async function onAction(message, btn) {
  const action = btn.dataset.mfAction;
  if (action === 'psr') {
    const a = await fromUuid(btn.dataset.uuid);
    if (a) await (isAero(a) ? rollPendingControl(a) : rollPendingPSR(a));
  } else if (action === 'apply') {
    await applyCard(message);
  } else if (action === 'undo') {
    const ok = await DialogV2.confirm({
      window: { title: 'Undo this card?' },
      content: '<p>Restore every unit this card changed to how it was before it. Changes made to those units since (later attacks, heat) are lost for the same fields. A Time of War damage to linked characters is not undone.</p>'
    });
    if (ok) await undoCard(message);
  }
}

/** Add the action bar to combat cards as they render. */
export function registerCombatChat() {
  Hooks.on('renderChatMessageHTML', (message, element) => {
    const html = cardActionsHTML(message);
    if (!html || !element?.querySelector) return;
    const host = element.querySelector('.message-content') ?? element;
    host.insertAdjacentHTML('beforeend', html);
    host.querySelector('.tw-card-actions')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('button[data-mf-action]');
      if (!btn) return;
      ev.preventDefault();
      btn.disabled = true;
      onAction(message, btn).finally(() => { btn.disabled = false; });
    });
  });
}
