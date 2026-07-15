# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**mech_foundry** - A new project to create a new game system for foundry VTT. This system will be based on and heavily influenced by "A Time of War", a tabletop rpg set in the battletech universe.

## Working Guidelines

- **Ask clarifying questions**: When a request or requirement is unclear, ambiguous, or not fully described, ask clarifying questions before proceeding. It's better to confirm intent than to make assumptions that may need to be reworked later.
- **Reference "A Time of War" rules**: When planning or implementing game mechanics, always refer to the rules from "A Time of War" (the BattleTech tabletop RPG) as the authoritative source. This ensures the system accurately represents the intended gameplay experience and stays true to the source material.

## Foundry VTT System Development

This project follows Foundry VTT system development conventions. Key documentation:
- [Intro to Development](https://foundryvtt.com/article/intro-development/)
- [System Development Guide](https://foundryvtt.com/article/system-development/)
- [Foundry VTT API Reference](https://foundryvtt.com/api/)
- [Community Wiki Tutorial](https://foundryvtt.wiki/en/development/guides/SD-tutorial)
- [Boilerplate System](https://github.com/asacolips-projects/boilerplate)
- [DnD5e Reference](https://github.com/foundryvtt/dnd5e)

## Foundry v14 Compatibility (REQUIRED)

**This system targets Foundry VTT v14.** All existing code and any new/proposed changes
MUST be compatible with v14. Set `compatibility.minimum` and `compatibility.verified`
to `"14"` in `system.json`. Key v14 constraints confirmed against Foundry's release
notes and API docs:

- **MeasuredTemplate is REMOVED.** The `MeasuredTemplate` Document type no longer
  exists in v14 — it was absorbed into the **Scene Regions** framework. Any Area-of-Effect,
  blast, or template-placement code must use `RegionDocument` and the
  `canvas.regions.placeRegion` API instead of creating/previewing MeasuredTemplates or
  reading `canvas.scene.templates`.
- **Use namespaced APIs, not globals** (the v11/v12-era globals are deprecated and some
  are removed):
  - `renderTemplate(...)` → `foundry.applications.handlebars.renderTemplate(...)`
  - `mergeObject(...)` → `foundry.utils.mergeObject(...)`
  - `new Ray(...)` + `canvas.grid.measureDistances(...)` → `canvas.grid.measurePath(...)`
  - `CONST.CHAT_MESSAGE_TYPES` → `CONST.CHAT_MESSAGE_STYLES`
  - `ChatMessage.create({ roll })` → `ChatMessage.create({ rolls: [roll] })`
- **Application/Sheet framework:** ApplicationV1 (`ActorSheet`, `ItemSheet`, `Dialog`) is
  still available in v14 but is **deprecated** (scheduled for removal ~v16). Prefer the
  V2 framework (`foundry.applications.sheets.ActorSheetV2`, `ItemSheetV2`,
  `foundry.applications.api.ApplicationV2`, `DialogV2`) for new work; migrating existing
  sheets is a known, deferrable follow-up.
- **Text editing:** Foundry is ProseMirror-only in v14 (TinyMCE removed).

When implementing anything, verify the API against the v14 docs
(`https://foundryvtt.com/api/` — version 14) rather than assuming v11/v12 behavior.

## Project Structure

```
mech_foundry/
├── system.json           # System manifest (required)
├── template.json         # Data model definitions (legacy) or use DataModels
├── module/               # JavaScript ES modules
│   ├── mech-foundry.mjs  # Main entry point
│   ├── documents/        # Custom Actor/Item document classes
│   ├── sheets/           # Actor and Item sheet applications
│   ├── helpers/          # Utility functions and helpers
│   └── data-models/      # DataModel class definitions (modern approach)
├── templates/            # Handlebars HTML templates
│   ├── actor/            # Actor sheet templates
│   └── item/             # Item sheet templates
├── css/                  # Stylesheets (or less/ for LESS, scss/ for SASS)
├── lang/                 # Localization files (en.json, etc.)
├── packs/                # Compendium pack data
├── assets/               # Images, icons, tokens
└── CLAUDE.md             # This file
```

## Key Configuration Files

### system.json (Required)
The system manifest must include:
```json
{
  "id": "mech-foundry",
  "title": "Mech Foundry",
  "description": "A mech-based TTRPG system",
  "version": "0.1.0",
  "compatibility": {
    "minimum": "14",
    "verified": "14"
  },
  "esmodules": ["module/mech-foundry.mjs"],
  "styles": ["css/mech-foundry.css"],
  "languages": [{"lang": "en", "name": "English", "path": "lang/en.json"}],
  "grid": {"distance": 5, "units": "ft"},
  "primaryTokenAttribute": "health",
  "secondaryTokenAttribute": "power"
}
```

### template.json (Data Models)
Defines actor and item data schemas:
```json
{
  "Actor": {
    "types": ["mech", "pilot"],
    "templates": {
      "base": {
        "health": {"value": 10, "max": 10}
      }
    },
    "mech": {"templates": ["base"]},
    "pilot": {"templates": ["base"]}
  },
  "Item": {
    "types": ["weapon", "system", "frame"],
    "templates": {
      "base": {"description": ""}
    }
  }
}
```

## Development Commands

```bash
# Install dependencies (if using build tools)
npm install

# Watch for changes (if using LESS/SCSS)
npm run watch

# Build for production
npm run build

# Lint JavaScript
npm run lint
```

## Main Entry File Structure

The main `.mjs` file should follow this pattern:

```javascript
// Import document classes, sheets, helpers
import { MechFoundryActor } from "./documents/actor.mjs";
import { MechFoundryItem } from "./documents/item.mjs";
import { MechFoundryActorSheet } from "./sheets/actor-sheet.mjs";
import { MechFoundryItemSheet } from "./sheets/item-sheet.mjs";

// Init Hook - Primary system setup
Hooks.once('init', function() {
  // Register custom document classes
  CONFIG.Actor.documentClass = MechFoundryActor;
  CONFIG.Item.documentClass = MechFoundryItem;

  // Register sheet applications
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("mech-foundry", MechFoundryActorSheet, { makeDefault: true });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("mech-foundry", MechFoundryItemSheet, { makeDefault: true });

  // Preload Handlebars templates
  preloadHandlebarsTemplates();
});

// Ready Hook - Post-load setup
Hooks.once('ready', function() {
  // System is ready
});
```

## Code Style Guidelines

- Use ES modules (import/export) for JavaScript
- Use Handlebars templates for UI rendering
- Follow Foundry VTT API conventions
- Keep document classes focused on data manipulation
- Keep sheet classes focused on UI rendering
- Use localization strings from lang/*.json for all user-facing text
- Prefix CSS classes with system name to avoid conflicts

## Foundry VTT API Patterns

### Document Classes
Extend `Actor` and `Item` for custom data handling:
```javascript
export class MechFoundryActor extends Actor {
  prepareData() {
    super.prepareData();
    // Derive computed values
  }
}
```

### Sheet Classes
Extend `ActorSheet` and `ItemSheet` for UI (note: these are ApplicationV1, deprecated in
v14 — see the "Foundry v14 Compatibility" section; new sheets should prefer the V2
framework):
```javascript
export class MechFoundryActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mech-foundry", "sheet", "actor"],
      template: "systems/mech-foundry/templates/actor/actor-sheet.hbs",
      width: 600,
      height: 600
    });
  }

  getData() {
    const context = super.getData();
    // Add custom data for template
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Bind click handlers, etc.
  }
}
```

### Useful Hooks
- `init` - Register document classes, sheets, settings
- `ready` - World loaded, safe to access game data
- `renderActorSheet` - Modify actor sheets after render
- `createActor` / `updateActor` / `deleteActor` - Actor lifecycle
- `createItem` / `updateItem` / `deleteItem` - Item lifecycle

## Important Notes

- System ID must be lowercase, URL-safe (e.g., `mech-foundry`)
- Changes to template.json require world reload
- Test against Foundry v14 (the verified/minimum target — see "Foundry v14 Compatibility")
- Use `game.system.id` to reference system in code
- Compendium packs go in `packs/` directory
- **Version bumps are required**: Increment the version number in `system.json` with every update/commit
