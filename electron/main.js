const { app, BrowserWindow, ipcMain, session, protocol, net, Tray, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  readDesktopSettings,
  writeDesktopSettings,
  readDesktopSettingsForStartup,
} = require('./desktop-settings');
const {
  attachWindowDragPerf,
  handleDragPrepareFromRenderer,
  handleDragReleaseFromRenderer,
} = require('./window-drag-perf');

app.setName('Mfuns');

const startupDesktopSettings = readDesktopSettingsForStartup();
if (startupDesktopSettings.disableGpuAcceleration) {
  app.disableHardwareAcceleration();
}

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
  {
    scheme: 'mfuns-offline',
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
/** 点播/CDN 防盗链 UA（与 Flutter ExoPlayer / just_audio 一致） */
const MFUNS_VOD_USER_AGENT = 'ExoPlayer';
const MFUNS_MEDIA_URL_FILTER = [
  '*://cdn2.mfuns.net/*',
  '*://resource.mfuns.net/*',
  '*://vod.mfuns.net/*',
  '*://*.aliyuncs.com/*',
  '*://*.alicdn.com/*',
];

/**
 * @param {string} urlString
 */
function mediaUserAgentForUrl(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (host.includes('vod.') || host.endsWith('.aliyuncs.com') || host.endsWith('.alicdn.com')) {
      return MFUNS_VOD_USER_AGENT;
    }
  } catch {
    /* ignore */
  }
  return MFUNS_USER_AGENT;
}

/**
 * @param {string} urlString
 */
function isAllowedMfunsMediaUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'mfuns.net' || host.endsWith('.mfuns.net')) return true;
    if (host.endsWith('.aliyuncs.com')) return true;
    if (host.endsWith('.alicdn.com')) return true;
    return false;
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
        'User-Agent': mediaUserAgentForUrl(details.url),
      };
      callback({ requestHeaders });
    },
  );
}

function offlineStorageDir() {
  return path.join(app.getPath('userData'), 'offline');
}

async function installMfunsOfflineProtocol() {
  protocol.handle('mfuns-offline', async (request) => {
    let relPath = '';
    try {
      const parsed = new URL(request.url);
      relPath = decodeURIComponent(parsed.searchParams.get('f') ?? '');
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (!relPath || relPath.includes('..') || relPath.includes('\\')) {
      return new Response('Forbidden path', { status: 403 });
    }
    const filePath = path.join(offlineStorageDir(), relPath);
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
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

    /** @type {Record<string, string>} */
    const headers = {
      Referer: MFUNS_MEDIA_REFERER,
      Accept: '*/*',
      'User-Agent': mediaUserAgentForUrl(target),
    };
    const range = request.headers.get('Range') ?? request.headers.get('range');
    if (range) headers.Range = range;

    try {
      return await net.fetch(target, { headers });
    } catch {
      return new Response('Upstream failed', { status: 502 });
    }
  });
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;
let isQuitting = false;
let closeDialogOpen = false;
/** @type {((choice: string) => void) | null} */
let pendingCloseChoice = null;

function destroyTray() {
  tray?.destroy();
  tray = null;
}

function hideMainWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (process.platform === 'win32') {
    mainWindow.setSkipTaskbar(true);
  }
  mainWindow.hide();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (process.platform === 'win32') {
    mainWindow.setSkipTaskbar(false);
  }
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  const settings = readDesktopSettings();
  if (settings.closeAction !== 'tray') {
    destroyTray();
    return;
  }
  if (tray) return;
  try {
    tray = new Tray(appIconPath);
  } catch (err) {
    console.error('系统托盘创建失败', err);
    return;
  }
  tray.setToolTip('Mfuns');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        showMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: '退出 Mfuns',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    showMainWindow();
  });
  tray.on('click', () => {
    showMainWindow();
  });
}

function waitForCloseChoice() {
  return new Promise((resolve) => {
    pendingCloseChoice = resolve;
  });
}

async function promptAndClose() {
  if (closeDialogOpen || !mainWindow || isQuitting) return;
  closeDialogOpen = true;
  const settings = readDesktopSettings();
  const useTray = settings.closeAction === 'tray';
  try {
    if (!mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('window:show-close-dialog', { useTray });
    }
    const choice = await waitForCloseChoice();
    if (choice === 'tray' && useTray) {
      hideMainWindowToTray();
      return;
    }
    if (choice === 'quit') {
      isQuitting = true;
      mainWindow.close();
    }
  } finally {
    closeDialogOpen = false;
    pendingCloseChoice = null;
  }
}

function handleMainWindowClose(event) {
  if (isQuitting) return;
  const settings = readDesktopSettings();
  if (settings.promptOnClose) {
    event.preventDefault();
    void promptAndClose();
    return;
  }
  if (settings.closeAction === 'tray') {
    event.preventDefault();
    hideMainWindowToTray();
  }
}

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
    title: title || 'Mfuns',
  });

  browserWindow.loadFile(path.join(__dirname, '../src/in-app-browser.html'), {
    search: query.toString(),
  });

  browserWindow.once('ready-to-show', () => {
    browserWindow.show();
  });

  attachWindowDragPerf(browserWindow);

  return browserWindow;
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }

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

  mainWindow.on('close', handleMainWindowClose);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  attachWindowDragPerf(mainWindow);

  ensureTray();
}

ipcMain.on('window:drag-prepare', (event) => {
  if (event.sender) handleDragPrepareFromRenderer(event.sender);
});

ipcMain.on('window:drag-release', (event) => {
  if (event.sender) handleDragReleaseFromRenderer(event.sender);
});

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

ipcMain.on('window:close-choice', (_event, choice) => {
  if (typeof choice !== 'string' || !pendingCloseChoice) return;
  pendingCloseChoice(choice);
  pendingCloseChoice = null;
});

ipcMain.handle('browser:open', (_event, payload) => {
  const url = typeof payload?.url === 'string' ? payload.url : '';
  const title = typeof payload?.title === 'string' ? payload.title : 'Mfuns';
  if (!url) return { ok: false };
  openInAppBrowser(url, title);
  return { ok: true };
});

ipcMain.on('in-app-browser:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle('offline:download', async (_event, payload) => {
  const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
  const relPath = typeof payload?.relPath === 'string' ? payload.relPath.trim() : '';
  if (!url || !relPath || relPath.includes('..') || relPath.includes('\\')) {
    return { ok: false, error: '参数无效' };
  }
  if (!isAllowedMfunsMediaUrl(url)) {
    return { ok: false, error: '不允许的下载地址' };
  }
  const dir = offlineStorageDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, relPath);
  const headers = {
    Referer: MFUNS_MEDIA_REFERER,
    Accept: '*/*',
    'User-Agent': mediaUserAgentForUrl(url),
  };
  try {
    const res = await net.fetch(url, { headers });
    if (!res.ok) return { ok: false, error: `下载失败 (${res.status})` };
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(filePath, buf);
    return { ok: true, size: buf.length, relPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '下载失败' };
  }
});

ipcMain.handle('offline:delete', async (_event, payload) => {
  const relPath = typeof payload?.relPath === 'string' ? payload.relPath.trim() : '';
  if (!relPath || relPath.includes('..') || relPath.includes('\\')) {
    return { ok: false };
  }
  const filePath = path.join(offlineStorageDir(), relPath);
  try {
    await fs.promises.unlink(filePath);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('offline:clearAll', async () => {
  const dir = offlineStorageDir();
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map((entry) => fs.promises.unlink(path.join(dir, entry.name)).catch(() => {})),
    );
    return { ok: true };
  } catch {
    return { ok: true };
  }
});

ipcMain.handle('offline:getUsage', async () => {
  const dir = offlineStorageDir();
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stat = await fs.promises.stat(path.join(dir, entry.name));
      total += stat.size;
    }
    return { ok: true, bytes: total, files: entries.filter((e) => e.isFile()).length };
  } catch {
    return { ok: true, bytes: 0, files: 0 };
  }
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:setAutoLaunch', (_event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('app:getAutoLaunch', () => {
  try {
    return { ok: true, enabled: app.getLoginItemSettings().openAtLogin };
  } catch {
    return { ok: true, enabled: false };
  }
});

ipcMain.handle('app:getDesktopSettings', () => ({
  ok: true,
  settings: readDesktopSettings(),
}));

ipcMain.handle('app:setDesktopSettings', (_event, patch) => {
  try {
    const settings = writeDesktopSettings(patch ?? {});
    ensureTray();
    return { ok: true, settings };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '保存失败',
    };
  }
});

ipcMain.handle('app:relaunch', () => {
  app.relaunch();
  app.exit(0);
  return { ok: true };
});

app.whenReady().then(async () => {
  await installMfunsMediaProtocol();
  await installMfunsOfflineProtocol();
  installMfunsMediaReferer();
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIconPath);
  }
  createWindow();

  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow();
      return;
    }
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  const settings = readDesktopSettings();
  if (settings.closeAction === 'tray' && !isQuitting) {
    return;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  destroyTray();
});
