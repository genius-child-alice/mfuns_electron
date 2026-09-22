const STORAGE_KEY = 'mfuns.preferences';

export const DEFAULT_ACCENT = { r: 123, g: 127, b: 247 };

/** @typedef {{ colorScheme: 'light' | 'dark', accent: { r: number, g: number, b: number } }} Preferences */

/** @returns {Preferences} */
export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreferences();
    const parsed = JSON.parse(raw);
    return normalizePreferences(parsed);
  } catch {
    return defaultPreferences();
  }
}

/** @param {Partial<Preferences>} patch */
function writePreferences(patch) {
  const next = normalizePreferences({ ...loadPreferences(), ...patch });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** @param {Partial<Preferences>} patch */
export function savePreferences(patch) {
  const next = writePreferences(patch);
  applyPreferences(next);
  return next;
}

/**
 * @param {number} x
 * @param {number} y
 */
function maxRevealRadius(x, y) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 16;
}

/**
 * @param {Element | null | undefined} el
 * @param {MouseEvent | null} [event]
 */
function revealOriginFromElement(el, event) {
  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return { x: event.clientX, y: event.clientY };
  }
  if (el && typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/**
 * @param {{ x: number, y: number }} origin
 */
function setRevealOrigin(origin) {
  const root = document.documentElement;
  root.style.setProperty('--theme-reveal-x', `${origin.x}px`);
  root.style.setProperty('--theme-reveal-y', `${origin.y}px`);
  root.style.setProperty('--theme-reveal-r', `${maxRevealRadius(origin.x, origin.y)}px`);
}

function clearRevealOrigin() {
  const root = document.documentElement;
  root.style.removeProperty('--theme-reveal-x');
  root.style.removeProperty('--theme-reveal-y');
  root.style.removeProperty('--theme-reveal-r');
}

/**
 * 深浅色切换：从 origin 处圆形扩散至全屏（需 Chromium View Transitions）。
 * @param {'light' | 'dark'} nextScheme
 * @param {Element | null | undefined} [originEl]
 * @param {MouseEvent | null} [event]
 * @returns {Preferences}
 */
export function setColorSchemeWithReveal(nextScheme, originEl, event = null) {
  const current = loadPreferences();
  const scheme = nextScheme === 'dark' ? 'dark' : 'light';
  if (current.colorScheme === scheme) return current;

  // 桌面端暂不用 View Transition：Electron 下偶发残留层会挡住全部点击
  void originEl;
  void event;
  clearRevealOrigin();
  const next = writePreferences({ colorScheme: scheme });
  applyPreferences(next);
  return next;
}

/** @returns {Preferences} */
function defaultPreferences() {
  return {
    colorScheme: 'light',
    accent: { ...DEFAULT_ACCENT },
  };
}

/** @param {unknown} value */
function normalizePreferences(value) {
  const base = defaultPreferences();
  if (!value || typeof value !== 'object') return base;
  const obj = /** @type {Record<string, unknown>} */ (value);
  const colorScheme = obj.colorScheme === 'dark' ? 'dark' : 'light';
  const accent = normalizeAccent(obj.accent) ?? base.accent;
  return { colorScheme, accent };
}

/** @param {unknown} value */
function normalizeAccent(value) {
  if (!value || typeof value !== 'object') return null;
  const obj = /** @type {Record<string, unknown>} */ (value);
  const r = clampChannel(obj.r);
  const g = clampChannel(obj.g);
  const b = clampChannel(obj.b);
  if (r == null || g == null || b == null) return null;
  return { r, g, b };
}

/** @param {unknown} value */
function clampChannel(value) {
  const n = typeof value === 'number' ? value : Number.parseInt(`${value}`, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(255, Math.max(0, Math.round(n)));
}

/** @param {{ r: number, g: number, b: number }} accent */
export function accentToHex(accent) {
  const hex = (n) => n.toString(16).padStart(2, '0');
  return `#${hex(accent.r)}${hex(accent.g)}${hex(accent.b)}`;
}

/** @param {Preferences} prefs */
export function applyPreferences(prefs) {
  const root = document.documentElement;
  root.dataset.theme = prefs.colorScheme;
  const { r, g, b } = prefs.accent;
  root.style.setProperty('--accent-r', `${r}`);
  root.style.setProperty('--accent-g', `${g}`);
  root.style.setProperty('--accent-b', `${b}`);
  root.style.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
  root.style.setProperty(
    '--accent-soft',
    `rgba(${r}, ${g}, ${b}, ${prefs.colorScheme === 'dark' ? 0.22 : 0.14})`,
  );
  root.style.setProperty('--color-primary', `rgb(${r}, ${g}, ${b})`);
  window.dispatchEvent(
    new CustomEvent('mfuns:theme-change', { detail: { colorScheme: prefs.colorScheme } }),
  );
}

export function initTheme() {
  applyPreferences(loadPreferences());
}
