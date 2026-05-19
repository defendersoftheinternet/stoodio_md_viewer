# Stoodio MD - Project Status

This document tracks everything completed and remaining work based on the original [SPECIFICATION.md](./SPECIFICATION.md).

---

## Development Timeline

| Commit | Description |
|--------|-------------|
| `c471338` | Initial commit: WYSIWYM editor with Milkdown, basic themes |
| `f173757` | Refactored CSS into modular theme system |
| `572e024` | Added sidebar file tree view and UI improvements |
| `1067330` | Added Recent Files, Export (PDF/HTML), Find & Replace |
| `886bd7d` | Added project documentation (CLAUDE.md, SPECIFICATION.md) |
| `c5b65bb` | Added tabbed interface, electron-builder, app icon |

---

## Completed Features

### Core Editor
- [x] WYSIWYM live preview (markdown renders as you type)
- [x] Milkdown/Crepe editor with ProseMirror
- [x] CommonMark + GitHub Flavored Markdown support
- [x] Source code mode toggle (`Cmd+/`)

### Inline Formatting
- [x] Bold (`Cmd+B`)
- [x] Italic (`Cmd+I`)
- [x] Underline (`Cmd+U`; visual editor only, markdown round-trip is not supported)
- [x] Strikethrough (`Cmd+Shift+X`)
- [x] Inline code (`` Cmd+` ``)
- [x] Hyperlinks (`Cmd+K`)
- [x] Clear formatting (`` Cmd+Shift+\ ``)
- [x] Copy as Markdown (`Cmd+Shift+C`)
- [x] Copy as HTML
- [x] Paste as Plain Text

### Block Formatting
- [x] Headings 1-6 (`Cmd+1` through `Cmd+6`)
- [x] Paragraph (`Cmd+0`)
- [x] Bullet lists
- [x] Ordered lists (with proper sequential numbering fix)
- [x] Blockquotes
- [x] Code fences/blocks
- [x] Tables
- [x] Table editing menu commands
- [x] Task lists
- [x] Horizontal rules

### File Operations
- [x] New document (`Cmd+N`)
- [x] Open file (`Cmd+O`)
- [x] Save (`Cmd+S`)
- [x] Save As (`Cmd+Shift+S`)
- [x] Recent files (last 10, with Clear Recent)
- [x] File associations (.md, .markdown, .mdown, .mkd)
- [x] Drag & drop file opening

### Multi-Document Support
- [x] Tabbed interface
- [x] New tab (`Cmd+N`)
- [x] Close tab (`Cmd+W`)
- [x] Tab switching (`Ctrl+Tab`, `Ctrl+Shift+Tab`)
- [x] Per-tab state (content, scroll position, modified status)
- [x] Modified indicator on tabs
- [x] Unsaved changes prompt on close
- [x] Source-mode edits preserved when switching tabs
- [x] Inactive modified tabs save the correct tab before close

### Sidebar
- [x] Toggle sidebar (`Cmd+\`)
- [x] Resizable sidebar (drag to resize)
- [x] Width persistence

#### Outline Panel
- [x] Auto-generated from headings
- [x] Hierarchical indentation
- [x] Click to navigate (smooth scroll)
- [x] Real-time updates

#### File Tree Panel
- [x] Browse markdown files in current folder
- [x] Nested folder navigation
- [x] Lazy loading of folder contents
- [x] Active file highlighting
- [x] Click to open in new tab

### Find & Replace
- [x] Find (`Cmd+F`)
- [x] Find & Replace (`Cmd+H`)
- [x] Find Next/Previous (`Cmd+G`, `Cmd+Shift+G`)
- [x] Match highlights (yellow all, orange current)
- [x] Match counter
- [x] Match Case option
- [x] Replace single / Replace All
- [x] Escape to close

### Export
- [x] PDF export with theme styling
- [x] HTML export (standalone with inline CSS)
- [x] Print (`Cmd+P`)

### Themes (8 total)
- [x] GitHub (default light)
- [x] GitHub Dark
- [x] Sepia
- [x] Night
- [x] Newsprint
- [x] Gothic
- [x] Dracula
- [x] Solarized Light
- [x] Theme persistence
- [x] Open Themes Folder menu item

### Document Info
- [x] Filename popover (click titlebar)
- [x] Rename file
- [x] Move file to different location
- [x] Location display

### Window Management
- [x] macOS native titlebar (hiddenInset)
- [x] Window state persistence (size, position)
- [x] Minimum window size (600x400)
- [x] Zoom controls (`Cmd+=`, `Cmd+-`)
- [x] Full screen (`Ctrl+Cmd+F`)

### App Packaging
- [x] electron-builder configuration
- [x] App icon (.icns)
- [x] Entitlements for hardened runtime
- [x] DMG and ZIP targets
- [x] File associations
- [x] About dialog
- [x] Ad-hoc code signing (local dev)
- [x] Release signing script that requires Developer ID signing
- [x] DMG and ZIP release artifacts
- [x] Renderer CSP and navigation hardening

---

## Remaining Work

### Priority 1 (Core - Should Complete)

#### Images
- [x] Image insertion via menu
- [x] Drag & drop images into document
- [x] Copy/paste images from clipboard
- [ ] Image resizing

### Priority 2 (Important - v1.0)

#### File Operations
- [ ] New Window (`Option+Cmd+N`)
- [ ] Open Quickly... (quick file picker)
- [ ] Open File Location (reveal in Finder)
- [ ] Duplicate document
- [ ] Delete document
- [ ] Save All
- [ ] Import from other formats

#### Editing
- [ ] Move Row Up/Down (`Ctrl+Cmd+↑/↓`)
- [ ] Selection submenu (Select All, Select Line, etc.)
- [ ] Line Endings option (LF/CRLF)
- [ ] Emoji & Symbols picker

#### Block Formatting
- [ ] Increase/Decrease Heading Level (`Cmd++`, `Cmd+-`)
- [ ] Math blocks (LaTeX)
- [ ] Alert/Callout boxes
- [ ] List indentation controls
- [ ] Footnotes
- [ ] YAML Front Matter support
- [ ] Table of Contents auto-generation
- [ ] Link references

#### Inline Formatting
- [ ] Inline math ($latex$)
- [ ] Comment insertion (HTML comments)
- [ ] Hyperlink actions (edit, open, copy link)

#### View
- [ ] Focus Mode (highlight current paragraph)
- [ ] Typewriter Mode (keep cursor centered)
- [ ] Word Count popover
- [ ] Global search (across all files)

#### Export
- [ ] DOCX export (via Pandoc)
- [ ] Custom export settings

#### Window
- [ ] Tab bar show/hide toggle
- [ ] Show All Tabs
- [ ] Merge All Windows
- [ ] Move to Display (multi-monitor)

#### Help
- [ ] Quick Start / Onboarding
- [ ] Markdown Reference guide
- [ ] What's New dialog

### Priority 3 (Future Versions)

#### Advanced Features
- [ ] Mermaid diagram support
- [ ] Flowchart.js support
- [ ] Sequence diagram support
- [ ] MathJax/LaTeX rendering
- [ ] Pandoc integration for advanced exports
- [ ] EPUB export
- [ ] LaTeX export
- [ ] MediaWiki export

#### Editor Enhancements
- [ ] Auto-pair brackets and quotes
- [ ] Smart punctuation (curly quotes, em-dashes)
- [ ] Auto-numbering headings
- [ ] Auto-complete (emoji, file paths)
- [ ] Spelling and Grammar check integration
- [ ] Version history / Revert To

#### Platform
- [ ] Settings/Preferences panel
- [ ] Check for Updates
- [ ] Custom theme creation UI
- [ ] Sync settings across devices

### Distribution

- [ ] Apple Developer certificate signing
- [ ] Notarization for Gatekeeper
- [ ] App Store submission (optional)
- [ ] Windows build
- [ ] Linux build

---

## Feature Comparison with Typora

| Feature | Typora | Stoodio MD |
|---------|--------|------------|
| WYSIWYM editing | ✓ | ✓ |
| Tabs | ✓ | ✓ |
| Themes | ✓ | ✓ (8 themes) |
| Source mode | ✓ | ✓ |
| File tree | ✓ | ✓ |
| Outline | ✓ | ✓ |
| Find & Replace | ✓ | ✓ |
| PDF export | ✓ | ✓ |
| HTML export | ✓ | ✓ |
| Recent files | ✓ | ✓ |
| Focus mode | ✓ | ✗ |
| Typewriter mode | ✓ | ✗ |
| Math/LaTeX | ✓ | ✗ |
| Diagrams (Mermaid) | ✓ | ✗ |
| Image paste | ✓ | ✗ |
| DOCX export | ✓ | ✗ |
| Custom themes | ✓ | Partial |
| Task lists | ✓ | ✗ |
| Word count | ✓ | ✗ |

---

## Recommended Next Steps

### Immediate (Polish for v1.0)
1. **Task lists** - High-value markdown feature, commonly used
2. **Image drag & drop** - Essential for practical document creation
3. **Clear formatting** - Basic editing need
4. **Word count** - Simple to add, frequently requested

### Short-term (Complete Core Experience)
5. **Focus Mode** - Differentiating writing feature
6. **Table editing UI** - Tables are cumbersome without it
7. **Settings panel** - Proper app preferences

### Distribution
8. **Apple Developer signing** - Required for public distribution
9. **Notarization** - Required for macOS Gatekeeper
10. **DMG background image** - Polish for installer

---

## Technical Debt

- [ ] Add comprehensive error handling throughout
- [ ] Add keyboard navigation accessibility
- [ ] Performance optimization for large documents
- [ ] Unit tests for core functionality
- [ ] E2E tests for critical workflows
- [ ] Code documentation

---

*Last updated: January 2026*
