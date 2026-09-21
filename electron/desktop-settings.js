const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  disableGpuAcceleration: false,
  closeAction: 'quit',
  promptOnClose: true,
};

/**
 * @returns {string | null}
 */
function settingsFilePath() {
  try {
    return path.join(app.getPath('userData'), 'desktop-settings.json');
  } catch {
    const appName = 'Mfuns';
    if (process.platform === 'win32' && process.env.APPDATA) {
      return path.join(process.env.APPDATA, appName, 'desktop-settings.json');
    }
    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', appName, 'desktop-settings.json');
    }
    return path.join(os.homedir(), '.config', appName, 'desktop-settings.json');
  }
}

/**
 * @param {unknown} value
 */
function normalizeDesktopSettings(value) {
  const base = { ...DEFAULTS };
  if (!value || typeof value !== 'object') return base;
  const obj = /** @type {Record<string, unknown>} */ (value);
  const closeRaw = `${obj.closeAction ?? ''}`;
  const closeAction = closeRaw === 'tray' ? 'tray' : 'quit';
  return {
    disableGpuAcceleration: obj.disableGpuAcceleration === true,
    closeAction,
    promptOnClose: obj.promptOnClose !== false,
  };
}

/** @returns {typeof DEFAULTS} */
function readDesktopSettings() {
  try {
    const filePath = settingsFilePath();
    if (!filePath) return { ...DEFAULTS };
    const raw = fs.readFileSync(filePath, 'utf8');
    return normalizeDesktopSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * @param {Partial<typeof DEFAULTS>} patch
 */
function writeDesktopSettings(patch) {
  const filePath = settingsFilePath();
  if (!filePath) {
    throw new Error('无法解析桌面设置存储路径');
  }
  const next = normalizeDesktopSettings({ ...readDesktopSettings(), ...patch });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/** @returns {typeof DEFAULTS} */
function readDesktopSettingsForStartup() {
  try {
    return readDesktopSettings();
  } catch {
    return { ...DEFAULTS };
  }
}

module.exports = {
  DEFAULTS,
  readDesktopSettings,
  writeDesktopSettings,
  readDesktopSettingsForStartup,
};
