import {
  accentToHex,
  initTheme,
  loadPreferences,
  savePreferences,
} from './theme.js';
import { runSplash } from './splash.js';
import { materialIcon } from './icons.js';

const NAV_ITEMS = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'featured', label: '精选', icon: 'auto_awesome' },
  { id: 'feed', label: '动态', icon: 'dynamic_feed' },
  { id: 'mine', label: '我的', icon: 'person' },
];

const TOP_TABS = [
  { id: 'recommend', label: '推荐' },
  { id: 'hot', label: '热门' },
  { id: 'article', label: '文章' },
  { id: 'video', label: '视频' },
];

const SIDEBAR_TOOLS = [
  { id: 'upload', icon: 'upload', label: '投稿' },
  { id: 'message', icon: 'mail', label: '消息' },
  { id: 'theme', icon: 'dark_mode', label: '外观', idAttr: 'btn-theme-toggle' },
  { id: 'settings', icon: 'settings', label: '设置', idAttr: 'btn-open-settings' },
];

function navIcon(name) {
  return materialIcon(name, 'material-symbols-outlined--nav');
}

function placeholderCards(count = 12) {
  return Array.from({ length: count }, (_, i) => {
    const hue = (i * 37) % 360;
    const views = `${(1.2 + i * 0.31).toFixed(1)}万`;
    const comments = 40 + i * 17;
    const mins = 3 + (i % 25);
    const secs = String((i * 7) % 60).padStart(2, '0');
    return `
      <article class="video-card">
        <div class="video-card__cover-wrap">
          <div class="video-card__cover" style="--ph: ${hue}"></div>
          <div class="video-card__stats">
            <div class="video-card__stats-left">
              <span class="video-card__stat">${materialIcon('play_arrow', 'video-card__stat-icon')}${views}</span>
              <span class="video-card__stat">${materialIcon('chat_bubble', 'video-card__stat-icon')}${comments}</span>
            </div>
            <span class="video-card__duration">${mins}:${secs}</span>
          </div>
        </div>
        <div class="video-card__meta">
          <h3 class="video-card__title">内容占位标题 ${i + 1} · 更接近 B 站卡片双行标题展示</h3>
          <p class="video-card__sub">
            <span>MFuns 用户</span>
            <time>9-${(i % 28) + 1}</time>
          </p>
        </div>
      </article>`;
  }).join('');
}

function bindWindowControls() {
  const api = window.electronAPI?.window;
  document.getElementById('btn-minimize')?.addEventListener('click', () => api?.minimize());
  document.getElementById('btn-maximize')?.addEventListener('click', () => api?.maximize());
  document.getElementById('btn-close')?.addEventListener('click', () => api?.close());
}

function renderShell() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="主导航">
        <div class="sidebar__main">
          ${NAV_ITEMS.map(
            (item, index) => `
            <button type="button" class="sidebar__item ${index === 0 ? 'is-active' : ''}" data-nav="${item.id}" title="${item.label}">
              ${navIcon(item.icon)}
              <span>${item.label}</span>
            </button>`,
          ).join('')}
        </div>
        <div class="sidebar__bottom">
          ${SIDEBAR_TOOLS.map(
            (tool) => `
            <button
              type="button"
              class="sidebar__item sidebar__item--icon-only"
              ${tool.idAttr ? `id="${tool.idAttr}"` : `data-nav="${tool.id}"`}
              title="${tool.label}"
            >
              ${materialIcon(tool.icon, 'material-symbols-outlined--nav')}
              <span class="sr-only">${tool.label}</span>
            </button>`,
          ).join('')}
        </div>
      </aside>

      <div class="main-column">
        <header class="topbar app-no-drag">
          <div class="topbar__brand app-drag">
            <button type="button" class="topbar__back app-no-drag" aria-label="后退">
              ${materialIcon('arrow_back_ios_new', 'material-symbols-outlined--nav')}
            </button>
            <a class="topbar__logo-link app-no-drag" href="#" aria-label="MFuns 首页">
              <span class="topbar__logo-wrap">
                <img class="topbar__logo" src="assets/mfuns_logo.png" alt="MFuns" />
              </span>
            </a>
            <nav class="topbar__tabs app-no-drag" aria-label="内容分类">
              ${TOP_TABS.map(
                (tab, index) =>
                  `<button type="button" class="topbar__tab ${index === 0 ? 'is-active' : ''}" data-tab="${tab.id}">${tab.label}</button>`,
              ).join('')}
            </nav>
          </div>
          <div class="topbar__center app-drag">
            <div class="topbar__search app-no-drag">
              <label class="search-field">
                ${materialIcon('search', 'material-symbols-outlined--search')}
                <input type="search" class="search-input" placeholder="搜索视频、文章、用户" aria-label="搜索" />
              </label>
            </div>
          </div>
          <div class="topbar__right app-no-drag">
            <button type="button" class="topbar__user">登录</button>
            <div class="window-controls">
              <button type="button" id="btn-minimize" class="window-btn" aria-label="最小化">${materialIcon('minimize', 'material-symbols-outlined--window')}</button>
              <button type="button" id="btn-maximize" class="window-btn" aria-label="最大化">${materialIcon('crop_square', 'material-symbols-outlined--window')}</button>
              <button type="button" id="btn-close" class="window-btn window-btn--close" aria-label="关闭">${materialIcon('close', 'material-symbols-outlined--window')}</button>
            </div>
          </div>
        </header>

        <main class="content" id="main-content">
          <div class="content-grid">${placeholderCards()}</div>
          <button type="button" class="btn-refresh app-no-drag" aria-label="刷新">
            ${materialIcon('refresh')}
          </button>
        </main>
      </div>
    </div>

    <dialog class="settings-panel" id="settings-panel" aria-labelledby="settings-title">
      <form method="dialog" class="settings-panel__inner">
        <header class="settings-panel__head">
          <h2 id="settings-title">设置</h2>
          <button type="submit" class="settings-panel__close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <section class="settings-section">
          <h3>外观</h3>
          <label class="field">
            <span>主题模式</span>
            <select id="setting-color-scheme">
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label class="field">
            <span>主题色</span>
            <div class="field-row">
              <input type="color" id="setting-accent-picker" />
              <input type="text" id="setting-accent-text" spellcheck="false" placeholder="rgb(123, 127, 247)" />
            </div>
          </label>
          <button type="button" class="btn-secondary" id="btn-reset-accent">恢复默认主题色</button>
        </section>
      </form>
    </dialog>
  `;
}

function bindNavigation() {
  document.querySelectorAll('.sidebar__main [data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      document
        .querySelectorAll('.sidebar__main .sidebar__item')
        .forEach((item) => item.classList.remove('is-active'));
      el.classList.add('is-active');
    });
  });

  document.querySelector('.topbar__logo-link')?.addEventListener('click', (e) => {
    e.preventDefault();
  });

  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.topbar__tab').forEach((tab) => tab.classList.remove('is-active'));
      el.classList.add('is-active');
    });
  });
}

function parseRgbText(text) {
  const match = text.trim().match(/rgb?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function bindSettings() {
  const dialog = document.getElementById('settings-panel');
  const schemeSelect = document.getElementById('setting-color-scheme');
  const picker = /** @type {HTMLInputElement | null} */ (document.getElementById('setting-accent-picker'));
  const text = /** @type {HTMLInputElement | null} */ (document.getElementById('setting-accent-text'));

  const syncForm = () => {
    const prefs = loadPreferences();
    if (schemeSelect) schemeSelect.value = prefs.colorScheme;
    if (picker) picker.value = accentToHex(prefs.accent);
    if (text) {
      text.value = `rgb(${prefs.accent.r}, ${prefs.accent.g}, ${prefs.accent.b})`;
    }
    updateThemeToggleIcon(prefs.colorScheme);
  };

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    syncForm();
    dialog?.showModal();
  });

  schemeSelect?.addEventListener('change', () => {
    savePreferences({ colorScheme: /** @type {'light'|'dark'} */ (schemeSelect.value) });
    syncForm();
  });

  picker?.addEventListener('input', () => {
    if (!picker.value) return;
    const r = Number.parseInt(picker.value.slice(1, 3), 16);
    const g = Number.parseInt(picker.value.slice(3, 5), 16);
    const b = Number.parseInt(picker.value.slice(5, 7), 16);
    savePreferences({ accent: { r, g, b } });
    syncForm();
  });

  text?.addEventListener('change', () => {
    const rgb = parseRgbText(text.value);
    if (!rgb) return;
    savePreferences({ accent: rgb });
    syncForm();
  });

  document.getElementById('btn-reset-accent')?.addEventListener('click', () => {
    savePreferences({ accent: { r: 123, g: 127, b: 247 } });
    syncForm();
  });

  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    const prefs = loadPreferences();
    savePreferences({ colorScheme: prefs.colorScheme === 'dark' ? 'light' : 'dark' });
    syncForm();
  });

  syncForm();
}

function updateThemeToggleIcon(scheme) {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  const icon = scheme === 'dark' ? 'light_mode' : 'dark_mode';
  btn.innerHTML = `${materialIcon(icon, 'material-symbols-outlined--nav')}<span class="sr-only">外观</span>`;
}

initTheme();
renderShell();
bindWindowControls();
bindNavigation();
bindSettings();

runSplash();
