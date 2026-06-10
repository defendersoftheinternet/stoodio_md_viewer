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
  onTableCommand: (callback) => ipcRenderer.on('table-command', (event, type) => callback(type)),
  onToggleSource: (callback) => ipcRenderer.on('toggle-source', (event, enabled) => callback(enabled)),
  onToggleSidebar: (callback) => ipcRenderer.on('toggle-sidebar', callback),
  onFind: (callback) => ipcRenderer.on('find', callback),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),

  // Clipboard operations
  onCopyAsMarkdown: (callback) => ipcRenderer.on('copy-as-markdown', callback),
  onCopyAsHTML: (callback) => ipcRenderer.on('copy-as-html', callback),
  onPastePlainText: (callback) => ipcRenderer.on('paste-plain-text', callback),

  // Theme
  onThemeChange: (callback) => ipcRenderer.on('theme-change', (event, themeName) => callback(themeName)),
  sendCurrentTheme: (themeName) => ipcRenderer.send('current-theme', themeName),

  // Window state
  onFullScreenChange: (callback) => ipcRenderer.on('fullscreen-change', (event, isFullScreen) => callback(isFullScreen)),

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
  showLocationMenu: (position) => ipcRenderer.invoke('show-location-menu', position),
  moveDocumentTo: (data) => ipcRenderer.invoke('move-document-to', data),
  getFileInfo: () => ipcRenderer.invoke('get-file-info'),
  showPathMenu: (position) => ipcRenderer.invoke('show-path-menu', position),

  // File tree
  getDirectoryContents: () => ipcRenderer.invoke('get-directory-contents'),
  getFolderContents: (folderPath) => ipcRenderer.invoke('get-folder-contents', folderPath),
  openFileFromTree: (filePath) => ipcRenderer.invoke('open-file-from-tree', filePath),

  // Image support
  onInsertImage: (callback) => ipcRenderer.on('insert-image', (event, data) => callback(data)),
  saveImage: (data) => ipcRenderer.invoke('save-image', data),

  // Tab management
  onNewTab: (callback) => ipcRenderer.on('new-tab', callback),
  onCloseTab: (callback) => ipcRenderer.on('close-tab', callback),
  onNextTab: (callback) => ipcRenderer.on('next-tab', callback),
  onPrevTab: (callback) => ipcRenderer.on('prev-tab', callback),
  onSaveComplete: (callback) => ipcRenderer.on('save-complete', (event, data) => callback(data)),
  onRequestCloseApp: (callback) => ipcRenderer.on('request-close-app', callback),
  setActiveTabInfo: (info) => ipcRenderer.send('active-tab-info', info),
  saveTabContent: (data) => ipcRenderer.invoke('save-tab-content', data),
  confirmClose: (fileName) => ipcRenderer.invoke('confirm-close', fileName),
  sendCloseAppResponse: (canClose) => ipcRenderer.send('close-app-response', canClose),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
