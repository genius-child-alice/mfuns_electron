const STORAGE_KEY = 'mfuns.app.settings';

/** @typedef {'auto' | '1080' | '720' | '480' | '360'} PlaybackQualityPref */

/** @typedef {{
 *   defaultQuality: PlaybackQualityPref,
 *   danmakuEnabled: boolean,
 *   danmakuOpacity: number,
 *   danmakuFontScale: number,
 *   danmakuDisplayArea: number,
 *   autoLaunch: boolean,
 *   reduceMotion: boolean,
 * }} AppSettings */

/** @returns {AppSettings} */
export function defaultAppSettings() {
  return {
    defaultQuality: 'auto',
    danmakuEnabled: true,
    danmakuOpacity: 1,
    danmakuFontScale: 1,
    danmakuDisplayArea: 0.75,
    autoLaunch: false,
    reduceMotion: false,
  };
}

/** @param {unknown} value */
function normalizeAppSettings(value) {
  const base = defaultAppSettings();
  if (!value || typeof value !== 'object') return base;
  const obj = /** @type {Record<string, unknown>} */ (value);
  const qualityRaw = `${obj.defaultQuality ?? ''}`;
  const defaultQuality =
    qualityRaw === '1080' ||
    qualityRaw === '720' ||
    qualityRaw === '480' ||
    qualityRaw === '360'
      ? qualityRaw
      : 'auto';
  const danmakuEnabled = obj.danmakuEnabled !== false;
  let danmakuOpacity = Number(obj.danmakuOpacity);
  if (!Number.isFinite(danmakuOpacity)) danmakuOpacity = base.danmakuOpacity;
  danmakuOpacity = Math.min(1, Math.max(0.2, danmakuOpacity));
  let danmakuFontScale = Number(obj.danmakuFontScale);
  if (!Number.isFinite(danmakuFontScale)) danmakuFontScale = base.danmakuFontScale;
  danmakuFontScale = Math.min(1.6, Math.max(0.6, danmakuFontScale));
  let danmakuDisplayArea = Number(obj.danmakuDisplayArea);
  if (!Number.isFinite(danmakuDisplayArea)) danmakuDisplayArea = base.danmakuDisplayArea;
  danmakuDisplayArea = Math.min(1, Math.max(0.25, danmakuDisplayArea));
  return {
    defaultQuality,
    danmakuEnabled,
    danmakuOpacity,
    danmakuFontScale,
    danmakuDisplayArea,
    autoLaunch: obj.autoLaunch === true,
    reduceMotion: obj.reduceMotion === true,
  };
}

/** @returns {AppSettings} */
export function loadAppSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAppSettings();
    return normalizeAppSettings(JSON.parse(raw));
  } catch {
    return defaultAppSettings();
  }
}

/** @param {Partial<AppSettings>} patch */
export function saveAppSettings(patch) {
  const next = normalizeAppSettings({ ...loadAppSettings(), ...patch });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('mfuns:app-settings-changed', { detail: next }));
  return next;
}

/** 清除本机应用设置（不含登录会话） */
export function clearAppSettings() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('mfuns:app-settings-changed', { detail: defaultAppSettings() }));
}
