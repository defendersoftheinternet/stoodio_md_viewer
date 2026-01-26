# Stoodio MD Viewer - Codebase Documentation

## Overview

Stoodio MD Viewer is a Typora-like markdown editor built with Electron and Milkdown. It follows the **WYSIWYM** (What You See Is What You Mean) design philosophy, providing live preview without a split view - markdown syntax renders immediately as you type.

### Key Features
- Live markdown preview (WYSIWYM)
- Multiple themes (8 built-in themes)
- Source code mode toggle
- Document outline sidebar
- Full markdown syntax support (CommonMark + GFM)
- File operations (open, save, new)
- Keyboard shortcuts for formatting

---

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

---

## File Structure

```
Stoodio MD Viewer/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process
│   │   ├── preload.js       # IPC bridge
│   │   └── themes.js        # Centralized theme configuration
│   └── renderer/
│       ├── main.js          # Editor logic & UI
│       └── styles/
│           └── app.css     # All styles & themes
├── index.html              # Entry HTML
├── package.json            # Dependencies & scripts
├── vite.config.js          # Vite build configuration
├── SPECIFICATION.md        # Feature specification
├── CLAUDE.md              # Development guide
├── CODE_REVIEW.md         # Code review & simplifications
└── DOCUMENTATION.md        # This file
```

---

## Key Components

### 1. Main Process (`src/main/main.js`)

**Responsibilities:**
- Window creation and management
- Native menu system
- File I/O operations (open, save, new)
- IPC message handling
- Theme state synchronization

**Key Functions:**
- `createWindow()` - Creates Electron BrowserWindow
- `buildMenuTemplate()` - Dynamically builds application menu
- `newDocument()` - Creates new document (with unsaved changes check)
- `openDocument()` - Opens file via dialog
- `saveDocument()` / `saveDocumentAs()` - Saves document
- `setTheme()` - Changes theme and syncs with renderer
- `updateThemeMenu()` - Updates menu to reflect current theme

**State Variables:**
- `mainWindow` - Current BrowserWindow instance
- `currentFilePath` - Path of currently open file (null if new)
- `isDocumentModified` - Whether document has unsaved changes
- `currentTheme` - Currently active theme ID

### 2. Preload Script (`src/main/preload.js`)

**Purpose:** Secure IPC bridge using Electron's `contextBridge`

**Exposed API (`window.electronAPI`):**

**Renderer → Main:**
- `sendContent(content)` - Sends markdown content for saving
- `documentModified()` - Notifies main that document was modified
- `sendCurrentTheme(themeName)` - Syncs theme from renderer to main

**Main → Renderer (via callbacks):**
- `onNewDocument(callback)` - New document requested
- `onFileOpened(callback)` - File opened (receives `{path, content}`)
- `onRequestContent(callback)` - Main requests content for save
- `onFormat(callback)` - Format command (receives type: 'bold', 'italic', etc.)
- `onParagraph(callback)` - Paragraph command (receives type: 'h1', 'h2', etc.)
- `onToggleSource(callback)` - Toggle source mode
- `onToggleSidebar(callback)` - Toggle sidebar visibility
- `onFind(callback)` - Find dialog requested
- `onThemeChange(callback)` - Theme changed (receives themeName)

### 3. Renderer Process (`src/renderer/main.js`)

**Responsibilities:**
- Milkdown/Crepe editor initialization
- Theme management (localStorage persistence)
- Source code mode toggle
- Document outline generation
- Command execution (format, paragraph)

**Key Functions:**
- `initEditor(content)` - Initializes or reinitializes Milkdown editor
- `updateOutline()` - Extracts headings from markdown and builds outline
- `toggleSourceMode(enable)` - Switches between visual and source mode
- `setTheme(themeName)` - Applies theme and persists to localStorage
- `getMarkdown()` - Gets current markdown content (handles both modes)

**Command Registries:**
- `formatCommands` - Maps format types to Milkdown actions
- `paragraphCommands` - Maps paragraph types to Milkdown actions

**State Variables:**
- `crepe` - Milkdown Crepe editor instance
- `currentContent` - Current document content
- `isSourceMode` - Whether in source code mode
- `currentTheme` - Current theme ID

### 4. Theme System (`src/main/themes.js`)

**Purpose:** Centralized theme configuration (single source of truth)

**Exports:**
- `themes` - Array of theme definitions
- `defaultTheme` - Default theme ID ('github')
- `getTheme(id)` - Helper to get theme by ID
- `buildThemeMenuItems(currentThemeId, setThemeCallback)` - Builds menu items

**Theme Structure:**
```javascript
{
  id: 'github',           // CSS data-theme attribute value
  label: 'GitHub',        // Display name in menu
  group: 'light'          // 'light', 'dark', or 'other'
}
```

### 5. Styles (`src/renderer/styles/app.css`)

**Theme System:**
- Themes defined via `[data-theme="themename"]` selectors
- CSS variables for colors, fonts, spacing
- Theme applied to `<html>` element via `data-theme` attribute

**Key CSS Variables:**
- `--bg-primary`, `--bg-secondary`, `--bg-sidebar` - Background colors
- `--text-primary`, `--text-secondary`, `--text-muted` - Text colors
- `--accent-color`, `--accent-hover` - Accent colors
- `--font-body`, `--font-size-base`, `--line-height-base` - Typography
- `--border-color` - Border colors

**Available Themes:**
1. **github** (default) - Light theme matching Typora's GitHub theme
2. **github-dark** - Dark version
3. **sepia** - Warm reading theme
4. **newsprint** - Classic print look
5. **night** - Pure dark theme
6. **dracula** - Popular dark theme
7. **gothic** - High contrast
8. **solarized-light** - Solarized light variant

---

## IPC Communication Flow

### File Operations

**Open File:**
1. User clicks File > Open
2. Main: Shows dialog, reads file
3. Main → Renderer: `file-opened` IPC with `{path, content}`
4. Renderer: Calls `initEditor(content)` and updates filename

**Save File:**
1. User clicks File > Save
2. Main → Renderer: `request-content` IPC
3. Renderer: Gets markdown via `getMarkdown()`
4. Renderer → Main: `content-for-save` IPC with content
5. Main: Writes file, updates `isDocumentModified = false`

**New Document:**
1. User clicks File > New
2. Main: Checks for unsaved changes, shows dialog if needed
3. Main → Renderer: `new-document` IPC
4. Renderer: Calls `initEditor(defaultContent)`

### Format Commands

**Example: Bold (⌘B)**
1. User presses ⌘B or clicks Format > Bold
2. Main → Renderer: `format` IPC with type 'bold'
3. Renderer: Looks up `formatCommands['bold']`
4. Renderer: Executes `crepe.action(callCommand(toggleStrongCommand.key))`

### Theme Changes

**From Menu:**
1. User selects Themes > [Theme Name]
2. Main: Calls `setTheme(themeName)`
3. Main → Renderer: `theme-change` IPC with themeName
4. Renderer: Calls `setTheme(themeName)` (applies CSS, saves to localStorage)
5. Renderer → Main: `current-theme` IPC (syncs back)
6. Main: Updates menu checked state

**From Renderer (on load):**
1. Renderer: Loads theme from localStorage
2. Renderer → Main: `current-theme` IPC
3. Main: Updates menu checked state

---

## Simplifications Made

### 1. Centralized Theme Management

**Before:** Theme names hardcoded in 3 places:
- Menu template (45+ lines)
- `updateThemeMenu()` mapping (10+ lines)
- CSS theme definitions

**After:** Single `themes.js` file with:
- All theme definitions in one array
- Helper function to build menu items
- Single source of truth

**Benefit:** Adding/removing themes now requires changes in only 2 places (themes.js + CSS)

### 2. Menu Template Refactoring

**Before:** Static `menuTemplate` array, manual theme menu updates

**After:** `buildMenuTemplate()` function that:
- Dynamically builds menu
- Integrates theme menu via helper
- Can be rebuilt when theme changes

**Benefit:** Cleaner code, easier to maintain

### 3. Command Registry Pattern

**Before:** Two large switch statements (~50 lines total):
```javascript
switch (type) {
  case 'bold':
    crepe.action(callCommand(toggleStrongCommand.key));
    break;
  case 'italic':
    // ...
}
```

**After:** Two simple command maps (~10 lines total):
```javascript
const formatCommands = {
  bold: () => callCommand(toggleStrongCommand.key),
  italic: () => callCommand(toggleEmphasisCommand.key),
  // ...
};

// Usage:
const command = formatCommands[type];
if (command) crepe.action(command());
```

**Benefit:**
- 80% reduction in command handling code
- Easier to add new commands
- More maintainable

---

## Development

### Setup

```bash
npm install
```

### Development Mode

Run in two terminals:

```bash
# Terminal 1: Vite dev server
npm run dev

# Terminal 2: Electron app
npm run dev:electron
```

The Vite server runs on port 5173. Both must be running simultaneously.

### Production Build

```bash
npm run build    # Build renderer + copy main process files
npm run start    # Build and run production app
```

### Project Structure

- **Main process** files are in `src/main/` and copied to `dist/main/` during build
- **Renderer** files are in `src/renderer/` and bundled by Vite to `dist/`
- **Entry point** is `index.html` (served by Vite in dev, copied to `dist/` in build)

---

## Extending the Codebase

### Adding a New Theme

1. **Add theme definition** in `src/main/themes.js`:
```javascript
{ id: 'my-theme', label: 'My Theme', group: 'light' }
```

2. **Add CSS** in `src/renderer/styles/app.css`:
```css
[data-theme="my-theme"] {
  --bg-primary: #ffffff;
  --text-primary: #000000;
  /* ... */
}
```

That's it! The menu will automatically include it.

### Adding a New Format Command

1. **Import command** from Milkdown:
```javascript
import { toggleUnderlineCommand } from '@milkdown/preset-commonmark';
```

2. **Add to registry** in `src/renderer/main.js`:
```javascript
const formatCommands = {
  // ... existing
  underline: () => callCommand(toggleUnderlineCommand.key)
};
```

3. **Add menu item** in `src/main/main.js`:
```javascript
{
  label: 'Underline',
  accelerator: 'CmdOrCtrl+U',
  click: () => mainWindow?.webContents.send('format', 'underline')
}
```

### Adding a New Paragraph Type

1. **Import command** from Milkdown
2. **Add to `paragraphCommands`** registry
3. **Add menu item** in Paragraph submenu

---

## Dependencies

### Production
- **@milkdown/crepe** (^7.6.0) - High-level Milkdown wrapper for WYSIWYM editing

### Development
- **electron** (^33.0.0) - Desktop app framework
- **vite** (^6.0.0) - Build tool and dev server

---

## Code Quality

### Strengths
- ✅ Clean separation of concerns (main/renderer)
- ✅ Secure IPC communication (contextBridge)
- ✅ Centralized configuration (themes)
- ✅ Command registry pattern (extensible)
- ✅ Theme persistence (localStorage)
- ✅ Proper error handling in file operations

### Areas for Future Improvement
- [ ] Add unit tests
- [ ] Add E2E tests
- [ ] Implement recent files list
- [ ] Add export functionality (PDF, HTML)
- [ ] Add find & replace UI
- [ ] Add focus/typewriter modes
- [ ] Support for tabs (multiple documents)

---

## References

- **Milkdown Docs:** https://milkdown.dev
- **Electron Docs:** https://www.electronjs.org/docs
- **Typora Reference:** https://typora.io
- **CommonMark Spec:** https://spec.commonmark.org
- **GFM Spec:** https://github.github.com/gfm/

---

## License

MIT


