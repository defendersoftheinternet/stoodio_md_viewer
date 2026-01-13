# Stoodio MD - Features & Functionality

A beautiful, Typora-inspired markdown editor built with Electron and Milkdown.

---

## Editor

### WYSIWYM Editing
Stoodio MD follows the "What You See Is What You Mean" philosophy - markdown renders live as you type without a split view. The editor uses Milkdown/Crepe with full CommonMark and GitHub Flavored Markdown (GFM) support.

### Formatting Commands

| Format | Shortcut | Description |
|--------|----------|-------------|
| Bold | `Cmd+B` | **Bold text** |
| Italic | `Cmd+I` | *Italic text* |
| Strikethrough | `Cmd+Shift+S` | ~~Strikethrough~~ |
| Inline Code | `Cmd+\`` | `code` |
| Link | `Cmd+K` | Insert hyperlink |
| Heading 1 | `Cmd+1` | # Heading |
| Heading 2 | `Cmd+2` | ## Heading |
| Heading 3 | `Cmd+3` | ### Heading |
| Paragraph | `Cmd+0` | Normal text |

### Block Elements
- Bullet lists
- Numbered/ordered lists (with proper sequential numbering)
- Blockquotes
- Code blocks with syntax highlighting
- Tables
- Horizontal rules

### Source Mode
Toggle between visual editing and raw markdown source with `Cmd+/`. The source mode provides a plain textarea for direct markdown editing, useful for complex formatting or troubleshooting.

---

## Tabs

### Multi-Document Support
Open multiple markdown files simultaneously in a tabbed interface.

| Action | Shortcut |
|--------|----------|
| New Tab | `Cmd+N` |
| Close Tab | `Cmd+W` |
| Next Tab | `Ctrl+Tab` |
| Previous Tab | `Ctrl+Shift+Tab` |

### Tab Features
- Active tab highlighting
- Modified indicator (dot) on unsaved documents
- Scroll position preserved per tab
- Prompts to save before closing modified tabs
- Always maintains at least one tab (creates new untitled if closing last)

---

## File Operations

### Open & Save

| Action | Shortcut |
|--------|----------|
| Open | `Cmd+O` |
| Save | `Cmd+S` |
| Save As | `Cmd+Shift+S` |

Supported file extensions: `.md`, `.markdown`, `.mdown`, `.mkd`, `.txt`

### Recent Files
Access recently opened files from **File > Open Recent**. Tracks the last 10 files with a "Clear Recent" option.

### File Associations
Stoodio MD registers as a handler for markdown files on macOS. Double-clicking a `.md` file in Finder opens it in Stoodio MD.

---

## Export

### PDF Export
**File > Export > PDF...**

Exports the current document as a styled PDF with:
- A4 page size
- 1" top/bottom margins, 0.75" side margins
- Theme colors and fonts preserved
- Opens file location after export

### HTML Export
**File > Export > HTML...**

Exports as a standalone HTML file with:
- Complete inline CSS styling
- Theme-specific fonts and colors
- Fully formatted tables, code blocks, and blockquotes
- Opens file location after export

### Print
`Cmd+P` opens the native print dialog for the rendered document.

---

## Sidebar

Toggle the sidebar with `Cmd+\`. Resize by dragging the right edge (120px - 400px).

### Outline Panel
Auto-generated table of contents from document headings (H1-H6).
- Hierarchical indentation by heading level
- Click any heading to jump to it with smooth scroll
- Brief highlight effect on navigation
- Updates in real-time as you edit

### Files Panel
Browse markdown files in the current folder.
- Nested folder navigation with lazy loading
- Active file highlighted
- Click any file to open in a new tab
- Shows only markdown files (hides hidden files)

---

## Find & Replace

| Action | Shortcut |
|--------|----------|
| Find | `Cmd+F` |
| Find & Replace | `Cmd+H` |
| Find Next | `Cmd+G` |
| Find Previous | `Cmd+Shift+G` |

### Features
- Yellow highlight for all matches
- Orange highlight for current match
- Match counter showing "current/total"
- **Match Case** option
- **Replace** single match or **Replace All**
- `Enter` in find field jumps to next match
- `Esc` closes the panel

---

## Themes

Eight built-in themes accessible via **Format > Theme**:

| Theme | Description |
|-------|-------------|
| GitHub | Clean white background, blue accents (default) |
| GitHub Dark | Dark mode GitHub styling |
| Sepia | Warm, aged paper aesthetic |
| Night | Dark with muted colors |
| Newsprint | Black and white newspaper style |
| Gothic | Dark, elegant theme |
| Dracula | Popular Dracula color palette |
| Solarized Light | Solarized light colors |

Theme selection persists across sessions.

**Format > Open Themes Folder** opens the themes directory in Finder for customization.

---

## Document Info

Click the filename in the titlebar (or `Cmd+click`) to open the document info popover:

- **Name**: Rename the current file
- **Where**: View location or move file to new directory
- **Tags**: Placeholder for future tagging support
- **Locked**: Placeholder for future lock support

---

## Window Management

### macOS Integration
- Native titlebar with traffic light buttons
- Window state persistence (size and position saved)
- Minimum window size: 600x400px
- Full screen support (`Ctrl+Cmd+F`)

### Zoom
| Action | Shortcut |
|--------|----------|
| Zoom In | `Cmd+=` |
| Zoom Out | `Cmd+-` |
| Actual Size | `Cmd+0` |

---

## Keyboard Shortcuts Reference

### File
| Action | Shortcut |
|--------|----------|
| New Tab | `Cmd+N` |
| Open | `Cmd+O` |
| Save | `Cmd+S` |
| Save As | `Cmd+Shift+S` |
| Close Tab | `Cmd+W` |
| Print | `Cmd+P` |

### Edit
| Action | Shortcut |
|--------|----------|
| Undo | `Cmd+Z` |
| Redo | `Cmd+Shift+Z` |
| Cut | `Cmd+X` |
| Copy | `Cmd+C` |
| Paste | `Cmd+V` |
| Select All | `Cmd+A` |
| Find | `Cmd+F` |
| Find & Replace | `Cmd+H` |
| Find Next | `Cmd+G` |
| Find Previous | `Cmd+Shift+G` |

### Format
| Action | Shortcut |
|--------|----------|
| Bold | `Cmd+B` |
| Italic | `Cmd+I` |
| Strikethrough | `Cmd+Shift+S` |
| Inline Code | `Cmd+\`` |
| Link | `Cmd+K` |
| Heading 1 | `Cmd+1` |
| Heading 2 | `Cmd+2` |
| Heading 3 | `Cmd+3` |
| Paragraph | `Cmd+0` |

### View
| Action | Shortcut |
|--------|----------|
| Toggle Source | `Cmd+/` |
| Toggle Sidebar | `Cmd+\` |
| Zoom In | `Cmd+=` |
| Zoom Out | `Cmd+-` |
| Full Screen | `Ctrl+Cmd+F` |

### Tabs
| Action | Shortcut |
|--------|----------|
| Next Tab | `Ctrl+Tab` |
| Previous Tab | `Ctrl+Shift+Tab` |

---

## Technical Details

### Stack
- **Framework**: Electron
- **Editor**: Milkdown (Crepe) with ProseMirror
- **Build**: Vite + electron-builder
- **Markdown**: CommonMark + GitHub Flavored Markdown

### Data Storage
- Theme preference: localStorage
- Sidebar width: localStorage
- Recent files: `~/Library/Application Support/Stoodio MD/recent-files.json`
- Window state: `~/Library/Application Support/Stoodio MD/window-state.json`

### Requirements
- macOS 10.13 or later
- Apple Silicon (arm64) or Intel (x64)

---

*Version 1.0.0*
