/**
 * Record-sheet import UI: an "Import MegaMek Units" button in the Actors
 * sidebar opens a dialog for .mtf / .blk files (or pasted text); each file
 * becomes a new unit actor, and the import notes are whispered to the user.
 */
import { parseUnitFile } from "./megamek-import.mjs";

const { DialogV2 } = foundry.applications.api;
const esc = (t) => foundry.utils.escapeHTML?.(String(t)) ?? String(t);

/** Add the import button to the Actors directory header. */
export function registerMegaMekImport() {
  Hooks.on("renderActorDirectory", (app, element) => {
    const root = element instanceof HTMLElement ? element : element?.[0];
    if (!root || !game.user.can?.("ACTOR_CREATE") || root.querySelector(".mf-import-megamek")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mf-import-megamek";
    button.innerHTML = '<i class="fas fa-file-import"></i> Import MegaMek Units';
    button.title = "Create unit actors from MegaMek .mtf / .blk files";
    button.addEventListener("click", (ev) => { ev.preventDefault(); importMegaMekDialog(); });
    const host = root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root;
    host.append(button);
  });
}

/** The import dialog: pick files (or paste one), then create the actors. */
export async function importMegaMekDialog() {
  const folders = (game.folders?.filter(f => f.type === "Actor") ?? [])
    .map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join("");
  const result = await DialogV2.wait({
    window: { title: "Import MegaMek Units", icon: "fa-solid fa-file-import" },
    position: { width: 520 },
    content: `
      <div class="tw-attack-dialog mf-import-dialog">
        <p>Choose MegaMek unit files — <strong>.mtf</strong> for 'Mechs, <strong>.blk</strong> for combat vehicles and VTOLs,
        aerospace fighters, small craft, battle armor and conventional infantry — or paste one file's contents.</p>
        <div class="form-group"><label>Files</label><input type="file" name="files" multiple accept=".mtf,.blk" /></div>
        <div class="form-group stacked"><label>…or paste a file</label><textarea name="text" rows="6"></textarea></div>
        <div class="form-group"><label>Folder</label><select name="folder"><option value="">— none —</option>${folders}</select></div>
      </div>`,
    buttons: [
      {
        action: "import", label: "Import", icon: "fa-solid fa-file-import", default: true,
        callback: async (event, button) => {
          const f = button.form.elements;
          const texts = [];
          for (const file of f.files?.files ?? []) texts.push({ name: file.name, text: await file.text() });
          if (f.text?.value?.trim()) texts.push({ name: "pasted text", text: f.text.value });
          return { texts, folder: f.folder?.value || null };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return;
  if (!result.texts.length) { ui.notifications.warn("No files chosen and nothing pasted."); return; }
  return importMegaMekTexts(result.texts, { folder: result.folder });
}

/**
 * Parse and create one actor per file. Returns { created, failed } and
 * whispers a summary (with each unit's import notes) to the user.
 */
export async function importMegaMekTexts(texts, { folder = null } = {}) {
  const data = [], notes = [], failed = [];
  for (const { name, text } of texts) {
    try {
      const unit = parseUnitFile(text, name);
      data.push({ name: unit.name || name, type: unit.type, system: unit.system, folder });
      notes.push({ file: name, name: unit.name, type: unit.type, warnings: unit.warnings });
    } catch (err) {
      failed.push({ file: name, error: err.message });
    }
  }
  const created = data.length ? await Actor.createDocuments(data) : [];
  const typeLabel = (t) => game.i18n?.localize?.(`TYPES.Actor.${t}`) ?? t;
  const body = [
    ...notes.map(n => `<div class="mf-import-unit"><strong>${esc(n.name)}</strong> <em>(${esc(typeLabel(n.type))}, ${esc(n.file)})</em>
      ${n.warnings.length ? `<ul>${n.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}</div>`),
    ...failed.map(f => `<div class="mf-import-unit failed"><strong>${esc(f.file)}</strong>: not imported — ${esc(f.error)}</div>`)
  ].join("");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    whisper: [game.user.id],
    flavor: "MegaMek Import",
    content: `<div class="mech-foundry mf-import-report"><p>Imported ${created.length} unit${created.length === 1 ? "" : "s"}${failed.length ? `, ${failed.length} failed` : ""}.</p>${body}</div>`
  });
  if (created.length) ui.notifications.info(`Imported ${created.length} unit${created.length === 1 ? "" : "s"} from MegaMek files.`);
  if (failed.length) ui.notifications.warn(`${failed.length} file${failed.length === 1 ? "" : "s"} couldn't be imported — see the chat log.`);
  return { created, failed };
}
