const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform,
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action)),
  
  // Native file system access
  fs: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    readdir: (dirPath, extensions) => ipcRenderer.invoke('fs:readdir', dirPath, extensions),
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:save', options),
    showOpenDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  },
});
