<p align="center">
  <img src="website/favicon.svg" alt="Stoodio MD" width="128" height="128">
</p>

<h1 align="center">Stoodio MD</h1>

<p align="center">
  A beautiful WYSIWYM markdown editor for macOS
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/electron-33-blue" alt="Electron">
</p>

---

Stoodio MD is a Typora-inspired markdown editor that renders your content live as you type. No split view, no preview pane -- just clean, distraction-free writing where formatting appears instantly.

## Features

**Live WYSIWYM Editing** -- Markdown syntax renders in place as you type. Bold text looks bold, headings look like headings, and code blocks are highlighted -- all without a separate preview.

**8 Built-in Themes** -- Switch between GitHub, GitHub Dark, Sepia, Newsprint, Night, Dracula, Gothic, and Solarized Light. Each theme is carefully crafted with its own typography and color palette.

**Source Mode** -- Toggle between the rendered view and raw markdown source with a single shortcut. See exactly what's in your document when you need to.

**Document Outline** -- A sidebar that automatically builds a navigable table of contents from your headings. Click any heading to jump directly to it.

**Native macOS Integration** -- Title bar shows the current file with a native path hierarchy menu. Full menu bar with standard macOS keyboard shortcuts. Opens `.md` and `.markdown` files natively.

**Full Markdown Support** -- CommonMark and GitHub Flavored Markdown including tables, task lists, fenced code blocks, strikethrough, and more.

# Installation

### Download

Download the latest `.dmg` from the [Releases](../../releases) page, open it, and drag Stoodio MD to your Applications folder.

### Build from Source

```bash
git clone https://github.com/defendersoftheinternet/stoodio_md_viewer.git
cd stoodio-md-viewer
npm install
npm run dist:mac
```

The built application will be in the `release/` directory.

For a public macOS release, use Developer ID signing credentials and notarization environment variables before running:

```bash
APPLE_ID="you@example.com" \
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
APPLE_TEAM_ID="TEAMID1234" \
npm run dist:mac:release
```

Electron Builder also supports App Store Connect API key notarization with `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.

## Development

Both the Vite dev server and Electron must run simultaneously:

```bash
# Install dependencies
npm install

# Terminal 1: Start Vite dev server (port 5173)
npm run dev

# Terminal 2: Start Electron in dev mode
npm run dev:electron
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run dev:electron` | Start Electron in dev mode |
| `npm run build` | Build renderer and copy main process files |
| `npm run start` | Build and run production app |
| `npm run dist:mac` | Build distributable `.dmg` and `.zip` |
| `npm run dist:mac:release` | Build signed/notarized release; fails if Developer ID signing is unavailable |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Electron 33](https://www.electronjs.org/) |
| Editor | [Milkdown / Crepe 7.6](https://milkdown.dev/) |
| Bundler | [Vite 6](https://vitejs.dev/) |
| Language | JavaScript (ES Modules) |
| Styling | CSS Variables with theme system |
| Build | [electron-builder](https://www.electron.build/) |

## Keyboard Shortcuts

### File

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New document |
| `Cmd+O` | Open file |
| `Cmd+S` | Save |
| `Cmd+Shift+S` | Save as |

### Format

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Bold |
| `Cmd+I` | Italic |
| `Cmd+U` | Underline |
| `Cmd+Shift+X` | Strikethrough |
| `` Cmd+` `` | Inline code |

### Paragraph

| Shortcut | Action |
|----------|--------|
| `Cmd+1` through `Cmd+6` | Heading 1--6 |
| `Cmd+0` | Paragraph |

### View

| Shortcut | Action |
|----------|--------|
| `Cmd+/` | Toggle source mode |
| `` Cmd+\ `` | Toggle sidebar |

## Architecture

```
src/
├── main/
│   ├── main.js        # Electron main process, menus, file I/O
│   ├── preload.js     # Secure IPC bridge (contextBridge)
│   └── themes.js      # Centralized theme definitions
└── renderer/
    ├── main.js        # Milkdown editor, theme switching, outline
    └── styles/
        ├── core.css   # Layout and structural styles
        └── themes/    # Theme CSS variables
```

The main and renderer processes communicate through a secure IPC bridge. The renderer never has direct access to Node.js APIs. See [DOCUMENTATION.md](DOCUMENTATION.md) for full architectural details.

## License

[MIT](LICENSE)
