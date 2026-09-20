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
export function savePreferences(patch) {
  const next = normalizePreferences({ ...loadPreferences(), ...patch });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
}

export function initTheme() {
  applyPreferences(loadPreferences());
}
