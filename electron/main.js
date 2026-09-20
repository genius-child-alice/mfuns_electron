const { app, BrowserWindow, ipcMain, session, protocol, net } = require('electron');
const path = require('path');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mfuns-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const isDev = !app.isPackaged;
const appIconPath = path.join(__dirname, '../src/assets/favicon.ico');

/** CDN 防盗链：与 Flutter `DownloadManager` 媒体请求头一致 */
const MFUNS_MEDIA_REFERER = 'https://api.mfuns.net/';
const MFUNS_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const MFUNS_MEDIA_URL_FILTER = [
  '*://cdn2.mfuns.net/*',
  '*://resource.mfuns.net/*',
  '*://vod.mfuns.net/*',
];

/**
 * @param {string} urlString
 */
function isAllowedMfunsMediaUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'mfuns.net' || host.endsWith('.mfuns.net');
  } catch {
    return false;
  }
}

function installMfunsMediaReferer() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: MFUNS_MEDIA_URL_FILTER },
    (details, callback) => {
      const requestHeaders = {
        ...details.requestHeaders,
        Referer: MFUNS_MEDIA_REFERER,
        'User-Agent': MFUNS_USER_AGENT,
      };
      callback({ requestHeaders });
    },
  );
}

async function installMfunsMediaProtocol() {
  protocol.handle('mfuns-media', async (request) => {
    let target;
    try {
      const parsed = new URL(request.url);
      const raw = parsed.searchParams.get('u');
      if (!raw) return new Response('Missing url', { status: 400 });
      target = decodeURIComponent(raw);
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    if (!isAllowedMfunsMediaUrl(target)) {
      return new Response('Forbidden host', { status: 403 });
    }

    try {
      return await net.fetch(target, {
        headers: {
          Referer: MFUNS_MEDIA_REFERER,
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': MFUNS_USER_AGENT,
        },
      });
    } catch {
      return new Response('Upstream failed', { status: 502 });
    }
  });
}

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

app.whenReady().then(async () => {
  await installMfunsMediaProtocol();
  installMfunsMediaReferer();
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
