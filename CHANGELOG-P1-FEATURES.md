# Priority 1 Features Implementation

**Date:** 2026-01-27
**Scope:** 5 phases adding headings, table editing, clipboard operations, task lists, underline, clear formatting, and image support.

---

## Phase 1: Headings 4-6 + Table Editing Menu

### Headings 4-6

Added Cmd+4, Cmd+5, Cmd+6 keyboard shortcuts to convert text to H4, H5, H6 headings. These mirror the existing Cmd+1/2/3 shortcuts for H1-H3.

**Files changed:**

| File | Change |
|------|--------|
| `src/renderer/main.js` | Added `h4`, `h5`, `h6` entries to `paragraphCommands` registry (~line 400) |
| `src/main/main.js` | Added Heading 4/5/6 menu items with `CmdOrCtrl+4/5/6` accelerators to Paragraph menu |

### Table Editing UI

Added a Table submenu to the Paragraph menu with commands for inserting and editing tables.

**Menu items added (Paragraph > Table):**
- Insert Table (creates 3x3 table)
- Add Row Before
- Add Row After
- Add Column Before
- Add Column After
- Delete Selected Cells

**Files changed:**

| File | Change |
|------|--------|
| `src/renderer/main.js` | New `tableCommands` registry mapping 6 table operations to Milkdown GFM commands; new `onTableCommand` IPC handler in `setupElectronListeners()` |
| `src/main/main.js` | Added Table submenu with 6 items to Paragraph menu, all sending `table-command` IPC messages |
| `src/main/preload.js` | Added `onTableCommand` channel bridging `table-command` IPC |

**Imports added to renderer:**
```js
import {
  insertTableCommand,
  addColBeforeCommand, addColAfterCommand,
  addRowBeforeCommand, addRowAfterCommand,
  deleteSelectedCellsCommand
} from '@milkdown/preset-gfm';
```

---

## Phase 2: Clipboard Operations

Three new clipboard commands added to the Edit menu.

### Copy as Markdown (Cmd+Shift+C)

Copies the full document content as raw markdown text to the system clipboard using `crepe.getMarkdown()` + `navigator.clipboard.writeText()`.

### Copy as HTML

Copies the rendered HTML of the current selection (or full document if nothing selected) to the clipboard. Uses `window.getSelection()` to detect selection, then `range.cloneContents()` for selected HTML or `editorEl.innerHTML` for the full document.

### Paste as Plain Text (Cmd+Alt+Shift+V)

Reads plain text from the clipboard via `navigator.clipboard.readText()` and inserts it at the cursor position using ProseMirror's `tr.insertText()`. Strips all formatting, unlike the default paste which preserves rich content.

**Files changed:**

| File | Change |
|------|--------|
| `src/renderer/main.js` | Added `copyAsMarkdown()`, `copyAsHTML()`, `pasteAsPlainText()` functions; added 3 IPC handlers in `setupElectronListeners()` |
| `src/main/main.js` | Added 3 menu items to Edit menu after Select All: Copy as Markdown (`CmdOrCtrl+Shift+C`), Copy as HTML, Paste as Plain Text (`CmdOrCtrl+Alt+Shift+V`) |
| `src/main/preload.js` | Added `onCopyAsMarkdown`, `onCopyAsHTML`, `onPastePlainText` channels |

**Imports added to renderer:**
```js
import { editorViewCtx } from '@milkdown/core';
```

---

## Phase 3: Task List Toggle

The Paragraph > Task List menu item already existed in `main.js` but had no handler in the renderer. This phase wires it up.

### How it works

When triggered, `handleTaskListToggle()` uses ProseMirror APIs via `crepe.action()`:

1. Walks up the document tree from the cursor to find the nearest `list_item` node
2. If found: toggles the `checked` attribute
   - `null`/`undefined` → `false` (converts regular item to unchecked task)
   - `false`/`true` → `null` (converts task back to regular item)
3. If not in a list: wraps the current block in a bullet list first using `wrapInBulletListCommand`

**Files changed:**

| File | Change |
|------|--------|
| `src/renderer/main.js` | Added `handleTaskListToggle()` function; added special-case check for `type === 'task'` in the `onParagraph` IPC handler, before the generic command lookup |

No preload or main process changes needed — the existing `paragraph` IPC channel carries the `'task'` type.

---

## Phase 4: Underline + Clear Formatting

### Underline (Cmd+U)

Standard markdown has no underline syntax. This implementation adds a custom ProseMirror mark that renders `<u>` HTML tags in the editor.

**Custom mark schema** (`underlineSchema`):
- `parseDOM`: Parses `<u>` tags and `text-decoration: underline` CSS
- `toDOM`: Renders as `<u>` element
- `parseMarkdown`: No-op (no standard markdown syntax for underline)
- `toMarkdown`: No-op (underline mark is stripped during markdown serialization; text content preserved)

**Custom command** (`toggleUnderlineCommand`):
- Uses `toggleMark()` from `@milkdown/prose/commands` with the underline mark type
- Registered in `formatCommands` as `underline`

**Limitation:** Underline does not survive markdown round-trip (save/reload). The visual underline works in the editor and for pasted HTML content, but the markdown output does not include `<u>` tags. This can be improved later with a custom remark plugin.

### Clear Formatting (Cmd+Shift+\\)

Removes all marks (bold, italic, underline, strikethrough, code, link) from the current text selection.

Uses ProseMirror's `tr.removeMark(from, to)` which strips all marks from the range when no specific mark type is provided.

**Note:** `Cmd+\` remains Toggle Sidebar (no conflict). Clear Format uses `Cmd+Shift+\`.

**Files changed:**

| File | Change |
|------|--------|
| `src/renderer/main.js` | Added `underlineSchema` ($markSchema), `toggleUnderlineCommand` ($command), `clearFormatting()` function; registered plugins in `initEditor()`; added `underline` to `formatCommands`; added `'clear'` special case in `onFormat` handler |
| `src/main/main.js` | Added Underline (`CmdOrCtrl+U`) and Clear Format (`CmdOrCtrl+Shift+\\`) to Format menu |
| `src/renderer/styles/core.css` | Added `.milkdown u { text-decoration: underline; }` |

**Imports added to renderer:**
```js
import { $markSchema, $command } from '@milkdown/utils';
import { toggleMark } from '@milkdown/prose/commands';
```

---

## Phase 5: Image Support

### Image Insertion via Menu (Format > Image...)

Opens a native file dialog filtered for image types (png, jpg, jpeg, gif, svg, webp). The selected image is copied to an `assets/` subdirectory relative to the current markdown file (or a temp directory for unsaved files). Filenames are deduplicated with numeric suffixes if collisions occur.

The relative path `assets/filename.png` is sent to the renderer, which inserts it using Milkdown's `insertImageCommand`.

### Drag & Drop

A custom ProseMirror plugin (`clipboardImagePlugin`) intercepts drop events containing image files. The image file is:

1. Read as an `ArrayBuffer`
2. Sent to the main process via `saveImage` IPC invoke
3. Main process saves to `assets/` with deduplication
4. Plugin inserts a ProseMirror image node at the drop position using `view.posAtCoords()`

### Clipboard Paste

The same `clipboardImagePlugin` intercepts paste events containing image data (e.g., screenshots from Cmd+Shift+4). The flow is identical to drag & drop, with the image saved as `paste-{timestamp}.png`.

### Save Image IPC Handler

The main process `save-image` handler:
1. Receives `{ buffer, fileName }` from the renderer
2. Determines target directory (`assets/` relative to current file, or temp)
3. Creates directory if needed
4. Deduplicates filename
5. Writes the buffer to disk
6. Returns `{ src: 'assets/filename.png' }` relative path

**Files changed:**

| File | Change |
|------|--------|
| `src/renderer/main.js` | Added `clipboardImagePlugin` ($prose plugin) with `handlePaste` and `handleDrop`; added `onInsertImage` IPC handler using `insertImageCommand`; registered plugin in `initEditor()` |
| `src/main/main.js` | Added `insertImage()` function with file dialog and copy logic; added `save-image` IPC handler; added Image... menu item to Format menu |
| `src/main/preload.js` | Added `onInsertImage` channel and `saveImage` invoke handler |

**Imports added to renderer:**
```js
import { insertImageCommand } from '@milkdown/preset-commonmark';
```

---

## Complete Import Changes (renderer/main.js)

### Before
```js
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { callCommand, $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
```

### After
```js
import {
  toggleStrikethroughCommand,
  insertTableCommand, addColBeforeCommand, addColAfterCommand,
  addRowBeforeCommand, addRowAfterCommand, deleteSelectedCellsCommand
} from '@milkdown/preset-gfm';
import { insertImageCommand } from '@milkdown/preset-commonmark';
import { callCommand, $prose, $markSchema, $command } from '@milkdown/utils';
import { toggleMark } from '@milkdown/prose/commands';
import { editorViewCtx } from '@milkdown/core';
import { Plugin, PluginKey } from '@milkdown/prose/state';
```

---

## Complete Preload Channel Additions (preload.js)

```js
// Table editing
onTableCommand: (cb) => ipcRenderer.on('table-command', (e, type) => cb(type)),

// Clipboard operations
onCopyAsMarkdown: (cb) => ipcRenderer.on('copy-as-markdown', cb),
onCopyAsHTML: (cb) => ipcRenderer.on('copy-as-html', cb),
onPastePlainText: (cb) => ipcRenderer.on('paste-plain-text', cb),

// Image support
onInsertImage: (cb) => ipcRenderer.on('insert-image', (e, data) => cb(data)),
saveImage: (data) => ipcRenderer.invoke('save-image', data),
```

---

## Menu Structure Changes

### Edit Menu (additions)
```
Edit
  ...
  Select All
  ---
  Copy as Markdown        Cmd+Shift+C
  Copy as HTML
  Paste as Plain Text     Cmd+Alt+Shift+V
  ---
  Find >
  ...
```

### Format Menu (additions)
```
Format
  Bold                    Cmd+B
  Italic                  Cmd+I
  Underline               Cmd+U          ← NEW
  Strikethrough           Cmd+Shift+S
  ---
  Clear Format            Cmd+Shift+\    ← NEW
  ---
  Code                    Cmd+`
  Link...                 Cmd+K
  ---
  Image...                               ← NEW
```

### Paragraph Menu (additions)
```
Paragraph
  Heading 1               Cmd+1
  Heading 2               Cmd+2
  Heading 3               Cmd+3
  Heading 4               Cmd+4          ← NEW
  Heading 5               Cmd+5          ← NEW
  Heading 6               Cmd+6          ← NEW
  ---
  Paragraph               Cmd+0
  ---
  Bullet List
  Numbered List
  Task List
  ---
  Quote
  Code Block
  ---
  Table >                                ← NEW
    Insert Table
    ---
    Add Row Before
    Add Row After
    Add Column Before
    Add Column After
    ---
    Delete Selected Cells
```

---

## Known Limitations

1. **Underline markdown round-trip**: Underline marks are stripped when saving to markdown. The text content is preserved but the `<u>` tags are not written to the markdown file. A future improvement would add a custom remark plugin to serialize/parse `<u>` HTML tags in the markdown source.

2. **Task list toggle from non-list**: When the cursor is not inside a list, the toggle only wraps the text in a bullet list. The user needs to trigger the toggle again to convert the bullet item to a task item.

3. **Image support for unsaved files**: Images are saved to a temp directory when the markdown file hasn't been saved yet. The relative paths (`assets/...`) will be incorrect until the file is saved to a permanent location.

---

## Verification Checklist

### Phase 1
- [ ] Cmd+4/5/6 converts text to H4/H5/H6
- [ ] Paragraph menu shows all 6 heading levels
- [ ] Table > Insert Table creates a 3x3 table
- [ ] Table submenu items work when cursor is in a table

### Phase 2
- [ ] Cmd+Shift+C copies full document markdown to clipboard
- [ ] Copy as HTML copies rendered HTML
- [ ] Paste as Plain Text strips formatting from clipboard content

### Phase 3
- [ ] Paragraph > Task List creates checkbox list items
- [ ] Clicking a checkbox toggles its state
- [ ] Source mode shows `- [ ]` and `- [x]` syntax

### Phase 4
- [ ] Cmd+U toggles underline on selected text
- [ ] Cmd+Shift+\ removes all formatting from selection
- [ ] Cmd+\ still toggles sidebar (no conflict)

### Phase 5
- [ ] Format > Image... opens file picker and inserts image
- [ ] Drag image from Finder into editor inserts image
- [ ] Paste screenshot (Cmd+V) inserts image
- [ ] Images saved to `assets/` directory next to markdown file
