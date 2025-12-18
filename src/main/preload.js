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

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
