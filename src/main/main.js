const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { defaultTheme, buildThemeMenuItems } = require('./themes');

let mainWindow;
let currentFilePath = null;
let rootFolderPath = null; // Root folder for file tree (set on first file open)
let isDocumentModified = false;
let currentTheme = defaultTheme;

// Recent files
const recentFilesPath = path.join(app.getPath('userData'), 'recent-files.json');
let recentFiles = []; // Array of { path, name, timestamp }

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
        {
          label: 'Open Recent',
          submenu: recentFiles.length > 0
            ? [
                ...recentFiles.map(file => ({
                  label: file.name,
                  click: () => openRecentFile(file.path)
                })),
                { type: 'separator' },
                {
                  label: 'Clear Recent',
                  click: () => clearRecentFiles()
                }
              ]
            : [
                {
                  label: 'No Recent Files',
                  enabled: false
                }
              ]
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
        {
          label: 'Export',
          submenu: [
            {
              label: 'PDF...',
              click: () => exportToPDF()
            },
            {
              label: 'HTML...',
              click: () => exportToHTML()
            }
          ]
        },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
          click: () => printDocument()
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
          label: 'Find',
          submenu: [
            {
              label: 'Find...',
              accelerator: 'CmdOrCtrl+F',
              click: () => mainWindow?.webContents.send('find')
            },
            {
              label: 'Find and Replace...',
              accelerator: 'CmdOrCtrl+H',
              click: () => mainWindow?.webContents.send('find-replace')
            },
            { type: 'separator' },
            {
              label: 'Find Next',
              accelerator: 'CmdOrCtrl+G',
              click: () => mainWindow?.webContents.send('find-next')
            },
            {
              label: 'Find Previous',
              accelerator: 'CmdOrCtrl+Shift+G',
              click: () => mainWindow?.webContents.send('find-previous')
            }
          ]
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
      // Set root folder on first file open (File > Open always resets root)
      rootFolderPath = path.dirname(filePath);
      isDocumentModified = false;
      mainWindow?.webContents.send('file-opened', { path: filePath, content, isNewRoot: true });
      updateWindowTitle();
      addToRecentFiles(filePath);
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

// Export functions
let pendingExportPath = null;

async function exportToPDF() {
  const defaultName = currentFilePath
    ? path.basename(currentFilePath, '.md') + '.pdf'
    : 'Untitled.pdf';

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) return;

  try {
    // Request renderer to prepare for export (exit source mode if needed)
    mainWindow.webContents.send('prepare-for-export');

    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 100));

    const pdfData = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 1,
        bottom: 1,
        left: 0.75,
        right: 0.75
      }
    });

    fs.writeFileSync(result.filePath, pdfData);
    shell.showItemInFolder(result.filePath);
  } catch (err) {
    dialog.showErrorBox('Export Failed', `Failed to export PDF: ${err.message}`);
  }
}

async function exportToHTML() {
  const defaultName = currentFilePath
    ? path.basename(currentFilePath, '.md') + '.html'
    : 'Untitled.html';

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
  });

  if (result.canceled || !result.filePath) return;

  pendingExportPath = result.filePath;
  mainWindow.webContents.send('request-html-export');
}

function printDocument() {
  mainWindow.webContents.print({ printBackground: true });
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

ipcMain.on('html-export-content', (event, htmlContent) => {
  if (!pendingExportPath) return;

  try {
    fs.writeFileSync(pendingExportPath, htmlContent, 'utf-8');
    shell.showItemInFolder(pendingExportPath);
  } catch (err) {
    dialog.showErrorBox('Export Failed', `Failed to export HTML: ${err.message}`);
  }

  pendingExportPath = null;
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

// Get directory contents for file tree (always from root folder)
ipcMain.handle('get-directory-contents', async () => {
  if (!rootFolderPath) {
    return { success: false, error: 'No root folder set', items: [] };
  }

  try {
    const items = getDirectoryItems(rootFolderPath, currentFilePath);
    return { success: true, directory: rootFolderPath, currentFilePath, items };
  } catch (err) {
    return { success: false, error: err.message, items: [] };
  }
});

// Get folder contents on demand (when user expands a folder)
ipcMain.handle('get-folder-contents', async (event, folderPath) => {
  try {
    const items = getDirectoryItems(folderPath, currentFilePath);
    return { success: true, items };
  } catch (err) {
    return { success: false, error: err.message, items: [] };
  }
});

// Helper: Check if file is markdown
function isMarkdownFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.md', '.markdown', '.mdown', '.mkd'].includes(ext);
}

// Helper: Get directory items (single level, no recursion)
function getDirectoryItems(dirPath, currentFilePath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      // Skip hidden files/folders
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          type: 'folder',
          path: fullPath
        });
      } else if (isMarkdownFile(entry.name)) {
        items.push({
          name: entry.name,
          type: 'file',
          path: fullPath,
          isActive: fullPath === currentFilePath
        });
      }
    }

    // Sort: folders first, then files, alphabetically
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  } catch {
    return [];
  }
}

// Open a file from file tree (does NOT change root folder)
ipcMain.handle('open-file-from-tree', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    currentFilePath = filePath;
    // Don't change rootFolderPath - keep the original root
    isDocumentModified = false;
    mainWindow?.webContents.send('file-opened', { path: filePath, content, isNewRoot: false });
    updateWindowTitle();
    addToRecentFiles(filePath);
    return { success: true, currentFilePath: filePath };
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

// Recent files management
function loadRecentFiles() {
  try {
    if (fs.existsSync(recentFilesPath)) {
      const data = fs.readFileSync(recentFilesPath, 'utf-8');
      recentFiles = JSON.parse(data);
      // Filter out files that no longer exist
      recentFiles = recentFiles.filter(f => fs.existsSync(f.path));
    }
  } catch (err) {
    console.error('Failed to load recent files:', err);
    recentFiles = [];
  }
}

function saveRecentFiles() {
  try {
    fs.writeFileSync(recentFilesPath, JSON.stringify(recentFiles, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save recent files:', err);
  }
}

function addToRecentFiles(filePath) {
  const name = path.basename(filePath);

  // Remove if already exists (to move to top)
  recentFiles = recentFiles.filter(f => f.path !== filePath);

  // Add to beginning
  recentFiles.unshift({
    path: filePath,
    name: name,
    timestamp: Date.now()
  });

  // Keep only last 10
  recentFiles = recentFiles.slice(0, 10);

  saveRecentFiles();
  updateApplicationMenu();
}

function clearRecentFiles() {
  recentFiles = [];
  saveRecentFiles();
  updateApplicationMenu();
}

async function openRecentFile(filePath) {
  if (!fs.existsSync(filePath)) {
    // File no longer exists, remove from recent and show error
    recentFiles = recentFiles.filter(f => f.path !== filePath);
    saveRecentFiles();
    updateApplicationMenu();
    dialog.showErrorBox('File Not Found', `The file "${path.basename(filePath)}" could not be found.`);
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    currentFilePath = filePath;
    rootFolderPath = path.dirname(filePath);
    isDocumentModified = false;
    mainWindow?.webContents.send('file-opened', { path: filePath, content, isNewRoot: true });
    updateWindowTitle();
    addToRecentFiles(filePath);
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
  }
}

function updateApplicationMenu() {
  const menuTemplate = buildMenuTemplate();
  const newMenu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(newMenu);
}

// App lifecycle
app.whenReady().then(() => {
  loadRecentFiles();
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
