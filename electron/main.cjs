const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
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

