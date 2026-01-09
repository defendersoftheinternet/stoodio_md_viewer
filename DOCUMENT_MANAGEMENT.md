# Document Renaming & Management Feature

This document describes the implementation of the macOS-style document renaming and management feature in the **Stoodio MD Viewer** application.

## Overview

The application features a title bar that mimics the native macOS interaction pattern for document management. Users can:
1. View the current document name.
2. Click the name to reveal a popover.
3. Rename the document directly.
4. Move the document to a different folder.

## User Interaction

### 1. Document Title
- **Visual**: The document name is displayed in the center of the title bar with a subtle chevron icon, indicating interactivity.
- **Action**: Clicking anywhere on the filename container toggles the management popover.

### 2. Renaming Popover
The popover provides fields to manage the file's metadata.

- **Name Field**: 
    - Automatically populated with the current filename (without extension).
    - **Renaming**: Users can type a new name. Pressing `Enter` or clicking outside (blur) commits the change.
    - **Validation**: The system checks if a file with the target name already exists in the directory. If it does, the user is prompted to confirm overwriting.
    - **Extension Handling**: The `.md` extension is automatically managed; users do not need to type it.

- **Where (Location)**:
    - Displays the current directory of the file.
    - **Simplified Path**: Home directories are often abbreviated with `~` or descriptive text (e.g., `Desktop — iCloud`) to match macOS style.
    - **Moving**: Clicking the location row opens a native system directory picker ("Move Document to Folder"). Selecting a new folder instantly moves the file and updates the UI accordingly.

- **Visual Design**: The popover uses backdrop blur, shadows, and spacing consistent with macOS design guidelines, adhering to both Light and Dark themes.

## Technical Implementation

### Renderer Process (`src/renderer/main.js` & `index.html`)

- **Event Listeners**:
    - `click` on `#filename-container`: Toggles the popover visibility and fetches up-to-date file info.
    - `keydown` (Enter/Escape) and `blur` on `#document-name`: Triggers the rename logic.
    - `click` on `#document-location`: Triggers the move file logic.
    - `mousedown` on `document`: Detects clicks outside the popover to close it.

- **UI Updates**:
    - `updateFilename(path)`: Updates the title bar text.
    - Dynamic updates to the popover input fields when the file state changes.

### Main Process (`src/main/main.js`)

- **IPC Handlers**:
    - `ipcMain.handle('get-file-info')`: Returns current file path, name, and a formatted directory string.
    - `ipcMain.handle('rename-file', newName)`: 
        - Renames the physical file using `fs.renameSync`.
        - Checks for existing files to prevent accidental data loss.
        - Updates the window title and internal `currentFilePath`.
    - `ipcMain.handle('move-file')`:
        - Opens `dialog.showOpenDialog` for directory selection.
        - Moves the file to the selected directory.
        - Updates the internal state and returns the new path for the renderer.

### Preload Script (`src/main/preload.js`)
Exposes safe, limited APIs to the renderer:
- `electronAPI.renameFile(newName)`
- `electronAPI.moveFile()`
- `electronAPI.getFileInfo()`

## Design Decisions within Electron Limits

Native macOS apps use a private `NSDocument` title bar interface that is not directly accessible to web views. We emulated this behavior by:
1. **Recreating the Visuals**: Using CSS for the popover, arrows, and layout.
2. **Logic via IPC**: Routing file system operations securely through the main process.
3. **Using Native Dialogs**: For complex interactions like picking a folder (which requires navigating the file system), we fall back to the native OS dialog (`showOpenDialog`) initiated by the click, rather than trying to check directory trees inside the web popover.

## Future Improvements

- **Tagging**: The "Tags" input is currently visual-only. Implementing macOS tagging would require native modules (like `mac-tag`) to write xattr metadata.
- **Locked State**: The "Locked" checkbox is also visual-only. Functional implementation would require changing file permission flags (`chflags`).
