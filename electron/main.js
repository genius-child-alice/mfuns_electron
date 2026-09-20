const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const appIconPath = path.join(__dirname, '../src/assets/favicon.ico');

/** @type {BrowserWindow | null} */
let mainWindow = null;

/**
 * @param {string} url
 * @param {string} [title]
 */
function openInAppBrowser(url, title) {
  if (!/^https:\/\//i.test(url)) return null;

  const browserWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    parent: mainWindow ?? undefined,
    show: false,
    frame: false,
    icon: appIconPath,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'browser-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  const query = new URLSearchParams({
    url,
    title: title || 'MFuns',
  });

  browserWindow.loadFile(path.join(__dirname, '../src/in-app-browser.html'), {
    search: query.toString(),
  });

  browserWindow.once('ready-to-show', () => {
    browserWindow.show();
  });

  return browserWindow;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    icon: appIconPath,
    backgroundColor: '#7B7FF7',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

ipcMain.handle('browser:open', (_event, payload) => {
  const url = typeof payload?.url === 'string' ? payload.url : '';
  const title = typeof payload?.title === 'string' ? payload.title : 'MFuns';
  if (!url) return { ok: false };
  openInAppBrowser(url, title);
  return { ok: true };
});

ipcMain.on('in-app-browser:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIconPath);
  }
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
