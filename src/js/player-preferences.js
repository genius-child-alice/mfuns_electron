import { loadPreferences } from './theme.js';

const PLAYER_CONFIG_KEY = 'mfuns.player.config.v1';
const DANMAKU_CONFIG_KEY = 'playerDanmakuConfigV2';

const DEFAULT_PLAYER = {
  autoPlay: false,
  autoSwitch: true,
  autoSkip: true,
  smallWindow: false,
  blackBorder: false,
  muted: false,
  volume: 0.7,
  seriesOrder: 'sequential',
  seriesPlayMode: 'stop',
};

const DEFAULT_DANMAKU = {
  show: true,
  shields: [],
  opacity: 0.8,
  limitArea: 4,
  fontScale: 1,
  speed: 1,
  keepOutSubtitle: false,
};

/** @returns {typeof DEFAULT_PLAYER} */
export function getPlayerConfig() {
  try {
    const raw = localStorage.getItem(PLAYER_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_PLAYER };
    return { ...DEFAULT_PLAYER, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PLAYER };
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function updatePlayerConfig(key, value) {
  const next = { ...getPlayerConfig(), [key]: value };
  localStorage.setItem(PLAYER_CONFIG_KEY, JSON.stringify(next));
}

/** @param {number} volume 0–1 */
export function setPlayerVolume(volume) {
  updatePlayerConfig('volume', volume);
}

/** @param {'sequential' | 'reverse'} order */
export function setSeriesOrder(order) {
  updatePlayerConfig('seriesOrder', order);
}

/** @param {'stop' | 'loop' | 'shuffle'} mode */
export function setSeriesPlayMode(mode) {
  updatePlayerConfig('seriesPlayMode', mode);
}

/** @returns {typeof DEFAULT_DANMAKU} */
export function getDanmakuPlayerConfig() {
  try {
    const raw = localStorage.getItem(DANMAKU_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_DANMAKU };
    return { ...DEFAULT_DANMAKU, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DANMAKU };
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function updateDanmakuPlayerConfig(key, value) {
  const next = { ...getDanmakuPlayerConfig(), [key]: value };
  localStorage.setItem(DANMAKU_CONFIG_KEY, JSON.stringify(next));
}

export function getPreferredResolution() {
  const stored = localStorage.getItem('user_set_resolution');
  if (stored && /^\d+P$/i.test(stored)) return stored;
  return '1080P';
}

/** @param {string} name e.g. 1080P */
export function setPreferredResolution(name) {
  localStorage.setItem('user_set_resolution', name);
}

/** @returns {boolean} */
export function isAppDarkMode() {
  return loadPreferences().colorScheme === 'dark';
}

/**
 * 播放器关灯/深色：优先读用户曾在播放器里切换过的偏好，否则跟随应用主题。
 * @returns {boolean}
 */
export function resolvePlayerDarkMode() {
  const config = getPlayerConfig();
  if (typeof config.darkMode === 'boolean') return config.darkMode;
  return isAppDarkMode();
}

/** @param {boolean} enabled */
export function setPlayerDarkMode(enabled) {
  updatePlayerConfig('darkMode', enabled);
}
