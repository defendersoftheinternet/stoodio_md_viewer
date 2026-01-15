const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Send content to main for saving
  sendContent: (content) => ipcRenderer.send('content-for-save', content),

  // Notify main that document was modified
  documentModified: () => ipcRenderer.send('document-modified'),

  // Listen for events from main
  onNewDocument: (callback) => ipcRenderer.on('new-document', callback),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
  onRequestContent: (callback) => ipcRenderer.on('request-content', callback),
  onFormat: (callback) => ipcRenderer.on('format', (event, type) => callback(type)),
  onParagraph: (callback) => ipcRenderer.on('paragraph', (event, type) => callback(type)),
  onToggleSource: (callback) => ipcRenderer.on('toggle-source', (event, enabled) => callback(enabled)),
  onToggleSidebar: (callback) => ipcRenderer.on('toggle-sidebar', callback),
  onFind: (callback) => ipcRenderer.on('find', callback),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),

  // Theme
  onThemeChange: (callback) => ipcRenderer.on('theme-change', (event, themeName) => callback(themeName)),
  sendCurrentTheme: (themeName) => ipcRenderer.send('current-theme', themeName),

  // Export
  onPrepareForExport: (callback) => ipcRenderer.on('prepare-for-export', callback),
  onRequestHtmlExport: (callback) => ipcRenderer.on('request-html-export', callback),
  sendHtmlExport: (htmlContent) => ipcRenderer.send('html-export-content', htmlContent),

  // Find & Replace
  onFindReplace: (callback) => ipcRenderer.on('find-replace', callback),
  onFindNext: (callback) => ipcRenderer.on('find-next', callback),
  onFindPrevious: (callback) => ipcRenderer.on('find-previous', callback),

  // File operations
  renameFile: (newName) => ipcRenderer.invoke('rename-file', newName),
  moveFile: () => ipcRenderer.invoke('move-file'),
  getFileInfo: () => ipcRenderer.invoke('get-file-info'),
  showPathMenu: (position) => ipcRenderer.invoke('show-path-menu', position),

  // File tree
  getDirectoryContents: () => ipcRenderer.invoke('get-directory-contents'),
  getFolderContents: (folderPath) => ipcRenderer.invoke('get-folder-contents', folderPath),
  openFileFromTree: (filePath) => ipcRenderer.invoke('open-file-from-tree', filePath),

  // Tab management
  onNewTab: (callback) => ipcRenderer.on('new-tab', callback),
  onCloseTab: (callback) => ipcRenderer.on('close-tab', callback),
  onNextTab: (callback) => ipcRenderer.on('next-tab', callback),
  onPrevTab: (callback) => ipcRenderer.on('prev-tab', callback),
  onSaveComplete: (callback) => ipcRenderer.on('save-complete', (event, data) => callback(data)),
  setActiveTabInfo: (info) => ipcRenderer.send('active-tab-info', info),
  confirmClose: (fileName) => ipcRenderer.invoke('confirm-close', fileName),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
