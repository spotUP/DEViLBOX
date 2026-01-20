const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform,
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action)),
});
