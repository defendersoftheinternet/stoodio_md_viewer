const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { SYSTEM_THEME, buildThemeMenuItems, resolveThemeId, getThemeBackground } = require('./themes');

let mainWindow;
let currentFilePath = null;
let activeTabName = null; // Display name for a not-yet-saved active tab
let rootFolderPath = null; // Root folder for file tree (set on first file open)
let isDocumentModified = false;
let currentTheme = SYSTEM_THEME;
let allowWindowClose = false;
let isCloseCheckPending = false;

// Settings persisted in userData (theme choice is needed before the renderer loads,
// so the window background can match and avoid a flash on launch)
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (saved.theme) currentTheme = saved.theme;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify({ theme: currentTheme }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

// Window state persistence
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');
let windowState = {
  width: 1200,
  height: 800,
  x: undefined,
  y: undefined
};

function loadWindowState() {
  try {
    if (fs.existsSync(windowStatePath)) {
      const data = fs.readFileSync(windowStatePath, 'utf-8');
      const saved = JSON.parse(data);
      // Validate the saved state
      if (saved.width && saved.height) {
        windowState = saved;
      }
    }
  } catch (err) {
    console.error('Failed to load window state:', err);
  }
}

function saveWindowState() {
  if (!mainWindow) return;

  // Don't save if minimized or maximized
  if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;

  const bounds = mainWindow.getBounds();
  windowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y
  };

  try {
    fs.writeFileSync(windowStatePath, JSON.stringify(windowState, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save window state:', err);
  }
}

// If the saved position is no longer on any connected display (e.g. a monitor
// was unplugged), discard it so the window opens centered on the primary display.
function validateWindowPosition() {
  if (windowState.x === undefined || windowState.y === undefined) return;

  const visible = screen.getAllDisplays().some(display => {
    const area = display.workArea;
    return (
      windowState.x + windowState.width > area.x &&
      windowState.x < area.x + area.width &&
      windowState.y + windowState.height > area.y &&
      windowState.y < area.y + area.height
    );
  });

  if (!visible) {
    windowState.x = undefined;
    windowState.y = undefined;
  }
}

function createWindow() {
  loadWindowState();
  validateWindowPosition();
  allowWindowClose = false;
  isCloseCheckPending = false;

  const resolvedTheme = resolveThemeId(currentTheme, nativeTheme.shouldUseDarkColors);

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: getThemeBackground(resolvedTheme),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Native-style context menu: spelling suggestions, Look Up, and edit actions
  mainWindow.webContents.on('context-menu', (event, params) => {
    const items = [];

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        items.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        });
      }
      if (params.dictionarySuggestions.length === 0) {
        items.push({ label: 'No Guesses Found', enabled: false });
      }
      items.push({ type: 'separator' });
      items.push({
        label: `Learn Spelling`,
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      });
      items.push({ type: 'separator' });
    }

    if (params.selectionText && process.platform === 'darwin') {
      const trimmed = params.selectionText.trim();
      const display = trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed;
      items.push({
        label: `Look Up “${display}”`,
        click: () => mainWindow.webContents.showDefinitionForSelection()
      });
      items.push({ type: 'separator' });
    }

    if (params.isEditable) {
      items.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' }
      );
    } else if (params.selectionText) {
      items.push({ role: 'copy' });
    }

    if (items.length === 0) return;
    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  // Let the renderer adapt layout when the traffic lights hide in fullscreen
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', false);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (url !== currentUrl) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [getContentSecurityPolicy()]
      }
    });
  });

  // Save window state on resize and move
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);

  mainWindow.on('close', (event) => {
    if (allowWindowClose || !mainWindow) return;

    event.preventDefault();
    if (isCloseCheckPending) return;

    isCloseCheckPending = true;
    mainWindow.webContents.send('request-close-app');
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

  // Handle pending file opens after window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    handlePendingFile();
  });

  updateWindowTitle();
}

function isSafeExternalUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function getContentSecurityPolicy() {
  const isDev = process.argv.includes('--dev');
  const scriptSrc = isDev ? "'self' 'unsafe-eval'" : "'self'";
  const connectSrc = isDev ? "'self' http://localhost:5173 ws://localhost:5173" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: file:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ');
}

function updateWindowTitle() {
  if (!mainWindow) return;

  const fileName = currentFilePath
    ? path.basename(currentFilePath)
    : (activeTabName || 'Untitled');
  mainWindow.setTitle(fileName);

  // Native macOS document signals: dot in the close button for unsaved changes,
  // and the window's represented file (proxy icon behavior, Mission Control grouping)
  mainWindow.setDocumentEdited(isDocumentModified);
  mainWindow.setRepresentedFilename(currentFilePath || '');
}

// Build menu template (function so we can rebuild with updated theme state)
function buildMenuTemplate() {
  return [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        {
          label: 'Check for Updates...',
          click: () => {
            const version = app.getVersion();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Check for Updates',
              message: `You're running Stoodio MD v${version}`,
              detail: 'Automatic update checking will be available in a future release.',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          enabled: false
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
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('new-tab')
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow?.webContents.send('close-tab')
        },
        { type: 'separator' },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openDocument()
        },
        {
          label: 'Open Recent',
          role: 'recentDocuments',
          submenu: [
            { label: 'Clear Menu', role: 'clearRecentDocuments' }
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
          label: 'Copy as Markdown',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => mainWindow?.webContents.send('copy-as-markdown')
        },
        {
          label: 'Copy as HTML',
          click: () => mainWindow?.webContents.send('copy-as-html')
        },
        {
          label: 'Paste and Match Style',
          accelerator: 'CmdOrCtrl+Alt+Shift+V',
          click: () => mainWindow?.webContents.send('paste-plain-text')
        },
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
              accelerator: 'CmdOrCtrl+Alt+F',
              enabled: false,
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
        },
        { type: 'separator' },
        {
          label: 'Speech',
          submenu: [
            { role: 'startSpeaking' },
            { role: 'stopSpeaking' }
          ]
        },
        {
          label: 'Emoji & Symbols',
          accelerator: 'Cmd+Ctrl+Space',
          click: () => app.showEmojiPanel()
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
          label: 'Underline',
          accelerator: 'CmdOrCtrl+U',
          click: () => mainWindow?.webContents.send('format', 'underline')
        },
        {
          label: 'Strikethrough',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => mainWindow?.webContents.send('format', 'strike')
        },
        { type: 'separator' },
        {
          label: 'Clear Format',
          accelerator: 'CmdOrCtrl+Shift+\\',
          click: () => mainWindow?.webContents.send('format', 'clear')
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
        },
        { type: 'separator' },
        {
          label: 'Image...',
          click: () => insertImage()
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
        {
          label: 'Heading 4',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.send('paragraph', 'h4')
        },
        {
          label: 'Heading 5',
          accelerator: 'CmdOrCtrl+5',
          click: () => mainWindow?.webContents.send('paragraph', 'h5')
        },
        {
          label: 'Heading 6',
          accelerator: 'CmdOrCtrl+6',
          click: () => mainWindow?.webContents.send('paragraph', 'h6')
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
        },
        { type: 'separator' },
        {
          label: 'Table',
          submenu: [
            {
              label: 'Insert Table',
              click: () => mainWindow?.webContents.send('table-command', 'insert')
            },
            { type: 'separator' },
            {
              label: 'Add Row Before',
              click: () => mainWindow?.webContents.send('table-command', 'addRowBefore')
            },
            {
              label: 'Add Row After',
              click: () => mainWindow?.webContents.send('table-command', 'addRowAfter')
            },
            {
              label: 'Add Column Before',
              click: () => mainWindow?.webContents.send('table-command', 'addColBefore')
            },
            {
              label: 'Add Column After',
              click: () => mainWindow?.webContents.send('table-command', 'addColAfter')
            },
            { type: 'separator' },
            {
              label: 'Delete Selected Cells',
              click: () => mainWindow?.webContents.send('table-command', 'deleteSelected')
            }
          ]
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
        {
          label: 'Show Next Tab',
          accelerator: 'Cmd+Shift+]',
          click: () => mainWindow?.webContents.send('next-tab')
        },
        {
          label: 'Show Previous Tab',
          accelerator: 'Cmd+Shift+[',
          click: () => mainWindow?.webContents.send('prev-tab')
        },
        // Hidden items so the conventional Ctrl+Tab cycling also works
        {
          label: 'Select Next Tab',
          accelerator: 'Ctrl+Tab',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => mainWindow?.webContents.send('next-tab')
        },
        {
          label: 'Select Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => mainWindow?.webContents.send('prev-tab')
        },
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
        },
        { type: 'separator' },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false
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
      const content = await fsp.readFile(filePath, 'utf-8');
      currentFilePath = filePath;
      // Set root folder on first file open (File > Open always resets root)
      rootFolderPath = path.dirname(filePath);
      isDocumentModified = false;
      mainWindow?.webContents.send('file-opened', { path: filePath, content, isNewRoot: true });
      updateWindowTitle();
      app.addRecentDocument(filePath);
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

    await fsp.writeFile(result.filePath, pdfData);
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

// Image insertion via menu
async function insertImage() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }
    ]
  });

  if (result.canceled || !result.filePaths.length) return;

  const imagePath = result.filePaths[0];

  try {
    const { destPath, destFileName } = await resolveAssetDestination(path.basename(imagePath));
    await fsp.copyFile(imagePath, destPath);
    mainWindow?.webContents.send('insert-image', { src: `assets/${destFileName}`, alt: destFileName, title: '' });
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to insert image: ${err.message}`);
  }
}

// Pick a unique destination in the document's assets folder.
// Uses basename() so a renderer-supplied name can't escape the folder.
async function resolveAssetDestination(fileName) {
  const targetDir = currentFilePath
    ? path.join(path.dirname(currentFilePath), 'assets')
    : path.join(app.getPath('temp'), 'stoodio-assets');

  await fsp.mkdir(targetDir, { recursive: true });

  const safeName = path.basename(fileName);
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);

  let destFileName = safeName;
  let destPath = path.join(targetDir, destFileName);
  let counter = 1;
  while (fs.existsSync(destPath)) {
    destFileName = `${base}-${counter}${ext}`;
    destPath = path.join(targetDir, destFileName);
    counter++;
  }

  return { destPath, destFileName };
}

// IPC handlers
async function writeMarkdownFile(filePath, content) {
  await fsp.writeFile(filePath, content, 'utf-8');
  app.addRecentDocument(filePath);
}

ipcMain.on('content-for-save', async (event, content) => {
  if (currentFilePath) {
    try {
      await writeMarkdownFile(currentFilePath, content);
      isDocumentModified = false;
      updateWindowTitle();
      // Notify renderer that save completed successfully
      mainWindow?.webContents.send('save-complete', { path: currentFilePath });
    } catch (err) {
      dialog.showErrorBox('Error', `Failed to save file: ${err.message}`);
    }
  }
});

ipcMain.handle('save-tab-content', async (event, { path: requestedPath, content, defaultName, isActive }) => {
  let targetPath = requestedPath;

  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'Untitled.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, cancelled: true };
    }

    targetPath = result.filePath;
  }

  try {
    await writeMarkdownFile(targetPath, content || '');

    if (isActive) {
      currentFilePath = targetPath;
      isDocumentModified = false;
      updateWindowTitle();
    }

    return { success: true, path: targetPath };
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to save file: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.on('html-export-content', async (event, htmlContent) => {
  if (!pendingExportPath) return;
  const exportPath = pendingExportPath;
  pendingExportPath = null;

  try {
    await fsp.writeFile(exportPath, htmlContent, 'utf-8');
    shell.showItemInFolder(exportPath);
  } catch (err) {
    dialog.showErrorBox('Export Failed', `Failed to export HTML: ${err.message}`);
  }
});

// Save image from renderer (drag-drop or clipboard paste)
ipcMain.handle('save-image', async (event, { buffer, fileName }) => {
  const { destPath, destFileName } = await resolveAssetDestination(fileName);
  await fsp.writeFile(destPath, Buffer.from(buffer));
  return { src: `assets/${destFileName}` };
});

ipcMain.on('document-modified', () => {
  isDocumentModified = true;
  updateWindowTitle();
});

// Active tab info from renderer (for window title)
ipcMain.on('active-tab-info', (event, info) => {
  currentFilePath = info.path;
  activeTabName = info.name || null;
  isDocumentModified = info.isModified;
  updateWindowTitle();
});

// Confirm close dialog for modified tabs
ipcMain.handle('confirm-close', async (event, fileName) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    message: `Do you want to save changes to "${fileName}"?`,
    detail: 'Your changes will be lost if you don\'t save them.'
  });

  if (result.response === 0) return 'save';
  if (result.response === 1) return 'discard';
  return 'cancel';
});

ipcMain.on('close-app-response', (event, canClose) => {
  isCloseCheckPending = false;

  if (!canClose || !mainWindow) return;

  allowWindowClose = true;
  mainWindow.close();
});

ipcMain.handle('get-file-info', async () => {
  if (!currentFilePath) {
    return {
      path: null,
      name: 'Untitled.md',
      directory: 'Not Saved',
      isLocked: false
    };
  }

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
  if (!newName.endsWith('.md')) {
    newName += '.md';
  }

  if (!currentFilePath) {
    // Unsaved document: the renderer keeps the name on the tab,
    // and it becomes the default filename on save
    return { success: true, newName };
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
    await fsp.rename(currentFilePath, newPath);
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
    await fsp.rename(currentFilePath, newPath);
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
    const content = await fsp.readFile(filePath, 'utf-8');
    currentFilePath = filePath;
    // Don't change rootFolderPath - keep the original root
    isDocumentModified = false;
    mainWindow?.webContents.send('file-opened', { path: filePath, content, isNewRoot: false });
    updateWindowTitle();
    app.addRecentDocument(filePath);
    return { success: true, currentFilePath: filePath };
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Theme handling. currentTheme is the user's choice (may be 'system');
// the renderer resolves 'system' against the OS appearance when applying it.
function setTheme(themeName) {
  currentTheme = themeName;
  saveSettings();
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
  if (themeName === currentTheme) return;
  currentTheme = themeName;
  saveSettings();
  updateThemeMenu();
});

// Show path hierarchy context menu (macOS-style Cmd+click on title)
ipcMain.handle('show-path-menu', async (event, position) => {
  if (!currentFilePath) return;

  // Build path hierarchy from file to root
  const pathParts = [];
  let currentPath = currentFilePath;

  // Add the file itself first
  pathParts.push({
    name: path.basename(currentPath),
    path: currentPath,
    isFile: true
  });

  // Walk up the directory tree
  let dir = path.dirname(currentPath);
  const rootPath = path.parse(dir).root;

  while (dir && dir !== rootPath) {
    pathParts.push({
      name: path.basename(dir),
      path: dir,
      isFile: false
    });
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break; // Reached root
    dir = parentDir;
  }

  // Add root if we're on macOS (show "/" or volume name)
  if (process.platform === 'darwin') {
    pathParts.push({
      name: 'Macintosh HD',
      path: '/',
      isFile: false,
      isRoot: true
    });
  }

  // Get icons for all paths (using actual file system icons)
  const iconSize = { width: 16, height: 16 };
  const menuItems = await Promise.all(pathParts.map(async (item) => {
    let icon = null;
    try {
      icon = await app.getFileIcon(item.path, { size: 'small' });
      // Resize to 16x16 for menu consistency
      icon = icon.resize(iconSize);
    } catch (err) {
      console.error('Failed to get icon for:', item.path, err);
    }

    return {
      label: item.name,
      icon: icon,
      click: () => {
        if (item.isFile) {
          // Reveal the file in Finder
          shell.showItemInFolder(item.path);
        } else {
          // Open the folder in Finder
          shell.openPath(item.path);
        }
      }
    };
  }));

  const menu = Menu.buildFromTemplate(menuItems);
  menu.popup({
    window: mainWindow,
    x: position?.x,
    y: position?.y
  });
});

// One-time migration: recent files used to be tracked in a custom JSON file.
// Seed the native macOS recent documents list from it, then remove it.
function migrateLegacyRecentFiles() {
  const legacyPath = path.join(app.getPath('userData'), 'recent-files.json');
  try {
    if (!fs.existsSync(legacyPath)) return;
    const entries = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
    // Reverse so the most recent entry ends up at the top of the native list
    [...entries].reverse().forEach(entry => {
      if (entry.path && fs.existsSync(entry.path)) {
        app.addRecentDocument(entry.path);
      }
    });
    fs.unlinkSync(legacyPath);
  } catch (err) {
    console.error('Failed to migrate legacy recent files:', err);
  }
}

// App lifecycle
app.whenReady().then(() => {
  // Set up About panel
  app.setAboutPanelOptions({
    applicationName: 'Stoodio MD',
    applicationVersion: app.getVersion(),
    version: '', // Build number (optional)
    copyright: '© 2024–2026 Stoodio',
    credits: 'A beautiful markdown editor with live preview.\n\nBuilt with Electron and Milkdown.',
    website: 'https://stoodio.app'
  });

  loadSettings();
  migrateLegacyRecentFiles();
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

// Handle file open events (double-click .md file or drag to dock)
let pendingFilePath = null;

app.on('open-file', (event, filePath) => {
  event.preventDefault();

  // Check if it's a markdown file
  if (!isMarkdownFile(filePath)) return;

  if (mainWindow) {
    // App is ready, open the file
    openFileFromPath(filePath);
  } else {
    // App not ready yet, store for later
    pendingFilePath = filePath;
  }
});

// Open a file from a path (used by open-file event and command line)
async function openFileFromPath(filePath) {
  if (!fs.existsSync(filePath)) {
    dialog.showErrorBox('File Not Found', `The file "${path.basename(filePath)}" could not be found.`);
    return;
  }

  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    currentFilePath = filePath;
    rootFolderPath = path.dirname(filePath);
    isDocumentModified = false;
    mainWindow?.webContents.send('file-opened', { path: filePath, content, isNewRoot: true });
    updateWindowTitle();
    app.addRecentDocument(filePath);

    // Bring window to front
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
  }
}

// Handle pending file after window is ready.
// did-finish-load fires after the renderer's module scripts have run and
// registered their IPC listeners, so the file can be sent immediately.
function handlePendingFile() {
  if (pendingFilePath) {
    openFileFromPath(pendingFilePath);
    pendingFilePath = null;
  }
}
