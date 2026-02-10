const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-action', 'new-project')
        },
        { type: 'separator' },
        {
          label: 'Open Song...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu-action', 'open-song')
        },
        {
          label: 'Import Module...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => mainWindow.webContents.send('menu-action', 'import-module')
        },
        { type: 'separator' },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-action', 'save-project')
        },
        {
          label: 'Download Song File',
          accelerator: 'CmdOrCtrl+Alt+S',
          click: () => mainWindow.webContents.send('menu-action', 'download-song')
        },
        { type: 'separator' },
        {
          label: 'Export Audio...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('menu-action', 'export-audio')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow.webContents.send('menu-action', 'undo')
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => mainWindow.webContents.send('menu-action', 'redo')
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Pattern List',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-patterns')
        },
        {
          label: 'Toggle Automation',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-automation')
        },
        {
          label: 'Toggle Master FX',
          accelerator: 'CmdOrCtrl+M',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-master-fx')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Transport',
      submenu: [
        {
          label: 'Play/Stop',
          accelerator: 'Space',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-play')
        },
        {
          label: 'Record Mode',
          accelerator: 'Enter',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-record')
        },
        { type: 'separator' },
        {
          label: 'Next Pattern',
          accelerator: 'Ctrl+Right',
          click: () => mainWindow.webContents.send('menu-action', 'next-pattern')
        },
        {
          label: 'Prev Pattern',
          accelerator: 'Ctrl+Left',
          click: () => mainWindow.webContents.send('menu-action', 'prev-pattern')
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Quick Help',
          accelerator: '?',
          click: () => mainWindow.webContents.send('menu-action', 'show-help')
        },
        {
          label: 'Check for Updates',
          click: () => shell.openExternal('https://github.com/spot/DEViLBOX/releases')
        },
        { type: 'separator' },
        {
          label: 'About DEViLBOX',
          click: () => mainWindow.webContents.send('menu-action', 'show-about')
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'DEViLBOX',
    backgroundColor: '#0b0909',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  createMenu();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  // IPC handlers for native file system access
  
  // Show open directory dialog
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  });

  // List directory contents
  ipcMain.handle('fs:readdir', async (event, dirPath, extensions = []) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          let stats = null;
          try {
            stats = await fs.stat(fullPath);
          } catch {
            // Ignore stat errors
          }
          
          // Filter by extensions if provided
          if (!entry.isDirectory() && extensions.length > 0) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!extensions.includes(ext)) {
              return null;
            }
          }
          
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: stats?.size,
            modifiedAt: stats?.mtime?.toISOString(),
          };
        })
      );
      
      return items.filter(item => item !== null);
    } catch (error) {
      console.error('Error reading directory:', error);
      throw error;
    }
  });

  // Read file
  ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
      const buffer = await fs.readFile(filePath);
      return buffer;
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  });

  // Write file
  ipcMain.handle('fs:writeFile', async (event, filePath, data) => {
    try {
      await fs.writeFile(filePath, Buffer.from(data));
      return true;
    } catch (error) {
      console.error('Error writing file:', error);
      throw error;
    }
  });

  // Show save dialog
  ipcMain.handle('dialog:save', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    if (result.canceled) {
      return null;
    }
    return result.filePath;
  });

  // Show open file dialog
  ipcMain.handle('dialog:openFile', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    if (result.canceled) {
      return null;
    }
    return result.filePaths;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

