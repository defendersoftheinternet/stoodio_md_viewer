const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { defaultTheme, buildThemeMenuItems } = require('./themes');

let mainWindow;
let currentFilePath = null;
let isDocumentModified = false;
let currentTheme = defaultTheme;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // In development, load from Vite dev server
  // In production, load the built file
  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  updateWindowTitle();
}

function updateWindowTitle() {
  if (!mainWindow) return;

  const fileName = currentFilePath
    ? path.basename(currentFilePath)
    : 'Untitled';
  const modified = isDocumentModified ? ' — Edited' : '';
  mainWindow.setTitle(`${fileName}${modified}`);
}

// Build menu template (function so we can rebuild with updated theme state)
function buildMenuTemplate() {
  return [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('open-settings')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => newDocument()
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openDocument()
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => saveDocument()
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => saveDocumentAs()
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find...',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow?.webContents.send('find')
        }
      ]
    },
    {
      label: 'Format',
      submenu: [
        {
          label: 'Bold',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('format', 'bold')
        },
        {
          label: 'Italic',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow?.webContents.send('format', 'italic')
        },
        {
          label: 'Strikethrough',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('format', 'strike')
        },
        { type: 'separator' },
        {
          label: 'Code',
          accelerator: 'CmdOrCtrl+`',
          click: () => mainWindow?.webContents.send('format', 'code')
        },
        {
          label: 'Link...',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow?.webContents.send('format', 'link')
        }
      ]
    },
    {
      label: 'Paragraph',
      submenu: [
        {
          label: 'Heading 1',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.send('paragraph', 'h1')
        },
        {
          label: 'Heading 2',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.send('paragraph', 'h2')
        },
        {
          label: 'Heading 3',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.send('paragraph', 'h3')
        },
        { type: 'separator' },
        {
          label: 'Paragraph',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow?.webContents.send('paragraph', 'paragraph')
        },
        { type: 'separator' },
        {
          label: 'Bullet List',
          click: () => mainWindow?.webContents.send('paragraph', 'bullet')
        },
        {
          label: 'Numbered List',
          click: () => mainWindow?.webContents.send('paragraph', 'ordered')
        },
        {
          label: 'Task List',
          click: () => mainWindow?.webContents.send('paragraph', 'task')
        },
        { type: 'separator' },
        {
          label: 'Quote',
          click: () => mainWindow?.webContents.send('paragraph', 'quote')
        },
        {
          label: 'Code Block',
          click: () => mainWindow?.webContents.send('paragraph', 'codeblock')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Source Code Mode',
          accelerator: 'CmdOrCtrl+/',
          type: 'checkbox',
          checked: false,
          click: (menuItem) => mainWindow?.webContents.send('toggle-source', menuItem.checked)
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+\\',
          click: () => mainWindow?.webContents.send('toggle-sidebar')
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Themes',
      submenu: [
        ...buildThemeMenuItems(currentTheme, setTheme),
        { type: 'separator' },
        {
          label: 'Open Themes Folder',
          click: () => {
            const themesPath = path.join(__dirname, '../renderer/styles/themes');
            shell.openPath(themesPath);
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Markdown Reference',
          click: () => {
            require('electron').shell.openExternal('https://www.markdownguide.org/basic-syntax/');
          }
        }
      ]
    }
  ];
}

// File operations
async function newDocument() {
  if (isDocumentModified) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      message: 'Do you want to save changes to the current document?'
    });

    if (result.response === 0) {
      await saveDocument();
    } else if (result.response === 2) {
      return;
    }
  }

  currentFilePath = null;
  isDocumentModified = false;
  mainWindow?.webContents.send('new-document');
  updateWindowTitle();
}

async function openDocument() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      currentFilePath = filePath;
      isDocumentModified = false;
      mainWindow?.webContents.send('file-opened', { path: filePath, content });
      updateWindowTitle();
    } catch (err) {
      dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
    }
  }
}

async function saveDocument() {
  if (!currentFilePath) {
    return saveDocumentAs();
  }

  mainWindow?.webContents.send('request-content');
}

async function saveDocumentAs() {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: currentFilePath || 'Untitled.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    currentFilePath = result.filePath;
    mainWindow?.webContents.send('request-content');
  }
}

// IPC handlers
ipcMain.on('content-for-save', (event, content) => {
  if (currentFilePath) {
    try {
      fs.writeFileSync(currentFilePath, content, 'utf-8');
      isDocumentModified = false;
      updateWindowTitle();
    } catch (err) {
      dialog.showErrorBox('Error', `Failed to save file: ${err.message}`);
    }
  }
});

ipcMain.on('document-modified', () => {
  isDocumentModified = true;
  updateWindowTitle();
});

ipcMain.handle('get-file-info', async () => {
  if (!currentFilePath) {
    return {
      path: null,
      name: 'Untitled.md',
      directory: 'Desktop — iCloud',
      isLocked: false
    };
  }

  const stats = fs.statSync(currentFilePath);
  const directory = path.dirname(currentFilePath);
  const name = path.basename(currentFilePath);

  // Simplified "macOS" path display
  let displayDir = directory;
  const homeDir = app.getPath('home');
  if (directory.startsWith(homeDir)) {
    displayDir = directory.replace(homeDir, '~');
  }

  return {
    path: currentFilePath,
    name: name,
    directory: displayDir,
    isLocked: false // We could check file permissions here if needed
  };
});

ipcMain.handle('rename-file', async (event, newName) => {
  if (!currentFilePath) {
    // For unsaved files, we can just return success and let the renderer update the title
    // The actual save will happen when they hit save
    return { success: true, newName };
  }

  if (!newName.endsWith('.md')) {
    newName += '.md';
  }

  const directory = path.dirname(currentFilePath);
  const newPath = path.join(directory, newName);

  if (newPath === currentFilePath) return { success: true, newPath, newName };

  if (fs.existsSync(newPath)) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Replace', 'Cancel'],
      defaultId: 1,
      message: `A file named "${newName}" already exists in this location. Do you want to replace it?`
    });

    if (result.response === 1) return { success: false, error: 'File already exists' };
  }

  try {
    fs.renameSync(currentFilePath, newPath);
    currentFilePath = newPath;
    updateWindowTitle();
    return { success: true, newPath, newName };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('move-file', async () => {
  if (!currentFilePath) {
    return { success: false, error: 'File must be saved first.' };
  }

  // Open directory picker
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Move Here',
    title: 'Move Document to Folder'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, cancelled: true };
  }

  const targetDir = result.filePaths[0];
  const fileName = path.basename(currentFilePath);
  const newPath = path.join(targetDir, fileName);

  if (newPath === currentFilePath) return { success: true, path: currentFilePath, directory: targetDir };

  if (fs.existsSync(newPath)) {
    const overwrite = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Replace', 'Cancel'],
      defaultId: 1,
      message: `A file named "${fileName}" already exists in the destination folder. Do you want to replace it?`
    });

    if (overwrite.response === 1) return { success: false, cancelled: true };
  }

  try {
    fs.renameSync(currentFilePath, newPath);
    currentFilePath = newPath;
    updateWindowTitle();

    // Calculate display directory
    let displayDir = targetDir;
    const homeDir = app.getPath('home');
    if (targetDir.startsWith(homeDir)) {
      displayDir = targetDir.replace(homeDir, '~');
    }

    return { success: true, path: newPath, directory: displayDir };
  } catch (err) {
    dialog.showErrorBox('Move Failed', err.message);
    return { success: false, error: err.message };
  }
});

// Get directory contents for file tree
ipcMain.handle('get-directory-contents', async () => {
  if (!currentFilePath) {
    return { success: false, error: 'No file open', items: [] };
  }

  const directory = path.dirname(currentFilePath);
  const currentFileName = path.basename(currentFilePath);

  try {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      // Skip hidden files and non-markdown files (for files)
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        // Get markdown files in subdirectory
        const subItems = getMarkdownFilesInDir(path.join(directory, entry.name));
        if (subItems.length > 0) {
          items.push({
            name: entry.name,
            type: 'folder',
            path: path.join(directory, entry.name),
            children: subItems
          });
        }
      } else if (isMarkdownFile(entry.name)) {
        items.push({
          name: entry.name,
          type: 'file',
          path: path.join(directory, entry.name),
          isActive: entry.name === currentFileName
        });
      }
    }

    // Sort: folders first, then files, alphabetically
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { success: true, directory, items };
  } catch (err) {
    return { success: false, error: err.message, items: [] };
  }
});

// Helper: Check if file is markdown
function isMarkdownFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.md', '.markdown', '.mdown', '.mkd'].includes(ext);
}

// Helper: Get markdown files in a directory (one level deep)
function getMarkdownFilesInDir(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isFile() && isMarkdownFile(entry.name)) {
        files.push({
          name: entry.name,
          type: 'file',
          path: path.join(dirPath, entry.name)
        });
      }
    }

    files.sort((a, b) => a.name.localeCompare(b.name));
    return files;
  } catch {
    return [];
  }
}

// Open a file from file tree
ipcMain.handle('open-file-from-tree', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    currentFilePath = filePath;
    isDocumentModified = false;
    mainWindow?.webContents.send('file-opened', { path: filePath, content });
    updateWindowTitle();
    return { success: true };
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Theme handling
function setTheme(themeName) {
  currentTheme = themeName;
  mainWindow?.webContents.send('theme-change', themeName);
  updateThemeMenu();
}

function updateThemeMenu() {
  // Rebuild entire menu with updated theme checked state
  const menuTemplate = buildMenuTemplate();
  const newMenu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(newMenu);
}

ipcMain.on('current-theme', (event, themeName) => {
  currentTheme = themeName;
  updateThemeMenu();
});

// App lifecycle
app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate(buildMenuTemplate());
  Menu.setApplicationMenu(menu);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
