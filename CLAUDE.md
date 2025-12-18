# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Stoodio MD Viewer is a Typora-like markdown editor built with Electron and Milkdown. It follows the WYSIWYM (What You See Is What You Mean) design philosophy - markdown renders live as you type without a split view.

## Commands

```bash
# Development - run these in separate terminals
npm run dev              # Start Vite dev server (renderer process)
npm run dev:electron     # Start Electron app in dev mode

# Production
npm run build            # Build for production
npm run start            # Build and run production app
```

**Important:** Both `npm run dev` and `npm run dev:electron` must be running simultaneously during development. The Vite server runs on port 5173.

## Architecture

### Process Model (Electron)

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                         │
│  src/main/main.js                                       │
│  - Window management, native menus, file dialogs       │
│  - IPC handlers for file operations                    │
│  - Theme state synchronization                         │
└────────────────────────┬────────────────────────────────┘
                         │ IPC (contextBridge)
                         │
┌────────────────────────▼────────────────────────────────┐
│                   Preload Script                        │
│  src/main/preload.js                                    │
│  - Exposes window.electronAPI to renderer              │
│  - Secure bridge between main and renderer             │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  Renderer Process                       │
│  src/renderer/main.js                                   │
│  - Milkdown (Crepe) editor initialization              │
│  - Theme management with localStorage                  │
│  - Source mode toggle                                  │
│  - Document outline generation                         │
│  src/renderer/styles/app.css                           │
│  - All theming via CSS variables and data-theme attr   │
└─────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/main/main.js` | Electron main process - menus, file I/O, window management |
| `src/main/preload.js` | IPC bridge - exposes `window.electronAPI` to renderer |
| `src/renderer/main.js` | Editor logic - Milkdown setup, format commands, theme switching |
| `src/renderer/styles/app.css` | All CSS including theme definitions via CSS variables |
| `index.html` | Entry HTML with titlebar, sidebar, editor container |
| `SPECIFICATION.md` | Full feature spec based on Typora menu analysis |

### Theme System

Themes use CSS variables applied via `data-theme` attribute on `<html>`:
- Variables defined in `app.css` under `[data-theme="themename"]` selectors
- Theme persisted to `localStorage` key `stoodio-theme`
- Main process kept in sync via `current-theme` IPC message
- Each theme can define custom fonts, colors, and spacing

### IPC Communication Pattern

```javascript
// Renderer → Main
window.electronAPI.sendContent(markdown)
window.electronAPI.documentModified()
window.electronAPI.sendCurrentTheme(themeName)

// Main → Renderer (via callbacks)
window.electronAPI.onFileOpened((data) => {...})
window.electronAPI.onThemeChange((themeName) => {...})
window.electronAPI.onFormat((type) => {...})
```

### Milkdown/Crepe API

The editor uses `@milkdown/crepe` (high-level Milkdown wrapper):

```javascript
// Initialize
crepe = new Crepe({ root: '#editor', defaultValue: content });
await crepe.create();

// Get content
const markdown = crepe.getMarkdown();

// Execute commands
crepe.action(callCommand(toggleStrongCommand.key));
crepe.action(callCommand(wrapInHeadingCommand.key, 1)); // H1

// Listen for updates
crepe.on((listener) => {
  listener.updated((ctx, doc, prevDoc) => { ... });
});
```

## Styling Notes

- Milkdown has its own CSS variables that need to be overridden
- Use `!important` for theme colors/fonts to override Milkdown defaults
- Theme-specific font rules must target all elements including headings explicitly
- GitHub theme styling aims to match Typora's github.css exactly
