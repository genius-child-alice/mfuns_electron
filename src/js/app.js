import {
  accentToHex,
  initTheme,
  loadPreferences,
  savePreferences,
  setColorSchemeWithReveal,
} from './theme.js';
import { runSplash } from './splash.js';
import { materialIcon } from './icons.js';
import {
  clearSession,
  loadSession,
  loginWithPassword,
  loginWithSms,
  sendLoginCode,
  userDisplayName,
} from './auth.js';
import { userAvatarMediaSrc } from './content-api.js';
import { bindLegalLinks, LEGAL_URLS } from './legal.js';
import {
  bindOpenLoginTriggers,
  feedPageHtml,
  homePageHtml,
  minePageHtml,
  settingsPageHtml,
  watchPageHtml,
  articlePageHtml,
  spacePageHtml,
  setPage,
  syncPagesAuthState,
} from './pages.js';
import { registerOpenLoginHandler, requireLogin } from './login-ui.js';
import { bindHomeFeed } from './home-feed.js';
import { bindFeedPage } from './feed-page.js';
import { bindFeedDetail } from './feed-detail.js';
import { bindVideoDetail } from './video-detail.js';
import { bindArticleDetail } from './article-detail.js';
import { bindFavoritePicker } from './favorite-ui.js';
import { bindUserSpace } from './user-space.js';
import { bindMinePage, refreshMinePage } from './mine-page.js';

/** @type {() => void} */
let syncSettingsForm = () => {};

const DEFAULT_AVATAR_SRC = 'assets/mfuns_logo.png';

const NAV_ITEMS = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'feed', label: '动态', icon: 'auto_awesome' },
  { id: 'mine', label: '我的', icon: 'person' },
];

const TOP_TABS = [
  { id: 'recommend', label: '推荐' },
  { id: 'hot', label: '热门' },
  { id: 'category', label: '分区' },
];

const SIDEBAR_TOOLS = [
  { id: 'upload', icon: 'upload', label: '投稿' },
  { id: 'message', icon: 'mail', label: '消息' },
  { id: 'theme', icon: 'dark_mode', label: '外观', idAttr: 'btn-theme-toggle' },
  { id: 'settings', icon: 'settings', label: '设置', idAttr: 'btn-open-settings' },
];

function goToSettingsPage() {
  setPage('settings');
  syncSettingsForm();
}

function navIcon(name) {
  return materialIcon(name, 'material-symbols-outlined--nav');
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
          <button
            type="button"
            class="sidebar__avatar app-no-drag"
            id="btn-open-login"
            title="登录"
            aria-label="登录"
          >
            <img class="sidebar__avatar-img" src="${DEFAULT_AVATAR_SRC}" alt="" width="40" height="40" />
          </button>
          ${SIDEBAR_TOOLS.map(
            (tool) => `
            <button
              type="button"
              class="sidebar__item sidebar__item--icon-only"
              ${tool.idAttr ? `id="${tool.idAttr}"` : ''}
              data-sidebar-tool="${tool.id}"
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
            <a class="topbar__logo-link app-no-drag" href="#" aria-label="MFuns 首页">
              <span class="topbar__logo-mark" aria-hidden="true"></span>
            </a>
            <nav class="topbar__tabs app-no-drag" id="topbar-tabs-home" aria-label="内容分类">
              ${TOP_TABS.map(
                (tab, index) =>
                  `<button type="button" class="topbar__tab ${index === 0 ? 'is-active' : ''}" data-tab="${tab.id}">${tab.label}</button>`,
              ).join('')}
            </nav>
          </div>
          <div class="topbar__actions app-drag">
            <div class="topbar__search app-no-drag">
              <label class="search-field">
                <input type="search" class="search-input" placeholder="搜索你感兴趣的视频" aria-label="搜索" />
                ${materialIcon('search', 'material-symbols-outlined--search')}
              </label>
            </div>
            <div class="topbar__chrome app-no-drag" aria-label="窗口控制">
              <div class="window-controls">
                <button type="button" id="btn-minimize" class="window-btn" aria-label="最小化">${materialIcon('minimize', 'material-symbols-outlined--window')}</button>
                <button type="button" id="btn-maximize" class="window-btn" aria-label="最大化">${materialIcon('crop_square', 'material-symbols-outlined--window')}</button>
                <button type="button" id="btn-close" class="window-btn" aria-label="关闭">${materialIcon('close', 'material-symbols-outlined--window')}</button>
              </div>
            </div>
          </div>
        </header>

        <main class="content content--home" id="main-content">
          ${homePageHtml()}
          ${feedPageHtml()}
          ${minePageHtml()}
          ${settingsPageHtml()}
          ${watchPageHtml()}
          ${articlePageHtml()}
          ${spacePageHtml()}
          <button type="button" class="btn-refresh app-no-drag" aria-label="刷新">
            ${materialIcon('refresh')}
          </button>
        </main>
      </div>
    </div>

    <dialog class="login-panel app-no-drag" id="login-panel" aria-labelledby="login-title">
      <div class="login-panel__card">
        <button type="button" class="login-panel__close" id="login-panel-close" aria-label="关闭">${materialIcon('close')}</button>

        <div class="login-panel__logged" id="login-logged-view" hidden>
          <h2 class="login-panel__logged-title" id="login-title">已登录</h2>
          <p class="login-panel__logged-sub" id="login-logged-hint"></p>
          <div class="login-panel__logged-actions">
            <button type="button" class="btn-secondary" id="btn-logout">退出登录</button>
          </div>
        </div>

        <div class="login-panel__layout" id="login-guest-view">
          <section class="login-panel__form" aria-label="账号登录">
            <nav class="login-panel__tabs" aria-label="登录方式">
              <button type="button" class="login-panel__tab is-active" data-login-tab="password">密码登录</button>
              <button type="button" class="login-panel__tab" data-login-tab="sms">短信登录</button>
            </nav>

            <div class="login-panel__pane" id="login-tab-password" data-login-pane="password">
              <div class="login-panel__fields">
                <div class="login-panel__field-row">
                  <input type="text" id="login-account" autocomplete="username" placeholder="请输入账号" />
                </div>
                <div class="login-panel__field-row">
                  <input type="password" id="login-password" autocomplete="current-password" placeholder="请输入密码" />
                </div>
              </div>
            </div>

            <div class="login-panel__pane" id="login-tab-sms" data-login-pane="sms" hidden>
              <div class="login-panel__fields">
                <div class="login-panel__field-row">
                  <span class="login-panel__prefix">+86</span>
                  <input type="tel" id="login-phone" autocomplete="tel" placeholder="请输入手机号" />
                  <button type="button" class="login-panel__code-btn" id="btn-send-code">获取验证码</button>
                </div>
                <div class="login-panel__field-row">
                  <input type="text" id="login-sms-code" inputmode="numeric" autocomplete="one-time-code" placeholder="请输入验证码" />
                </div>
              </div>
            </div>

            <p class="login-panel__error" id="login-error" role="alert"></p>
            <button type="button" class="login-panel__submit" id="btn-login-submit">登录</button>
            <p class="login-panel__legal">
              未注册过 MFuns 的手机号，我们将自动帮你注册账号<br />
              登录或完成注册即代表你同意
              <a href="${LEGAL_URLS.userAgreement}" data-legal-link="${LEGAL_URLS.userAgreement}" data-legal-title="用户协议">用户协议</a>
              和
              <a href="${LEGAL_URLS.privacy}" data-legal-link="${LEGAL_URLS.privacy}" data-legal-title="隐私政策">隐私政策</a>
            </p>
          </section>
        </div>
      </div>
    </dialog>

    <dialog class="feed-detail app-no-drag" id="feed-detail-dialog" aria-labelledby="feed-detail-title">
      <div class="feed-detail__shell">
        <div class="feed-detail__head">
          <button type="button" class="feed-detail__close" id="feed-detail-close" aria-label="关闭">${materialIcon('close')}</button>
        </div>
        <div class="feed-detail__scroll">
          <p class="feed-detail__loading" id="feed-detail-loading" hidden>${materialIcon('progress_activity', 'feed-page__spin')}加载中…</p>
          <p class="feed-detail__error" id="feed-detail-error" hidden role="alert"></p>
          <div class="feed-detail__post" id="feed-detail-post"></div>
          <nav class="feed-detail__tabs" aria-label="动态互动">
            <button type="button" class="feed-detail__tab" data-feed-detail-tab="repost">转发</button>
            <button type="button" class="feed-detail__tab is-active" data-feed-detail-tab="comment">评论</button>
          </nav>
          <div id="feed-detail-repost-panel" hidden>
            <p class="feed-detail__repost-empty">暂无转发内容</p>
          </div>
          <div id="feed-detail-comment-panel">
            <div class="feed-detail__sort">
              <button type="button" class="feed-detail__sort-btn is-active" data-feed-comment-order="desc">最热</button>
              <span class="feed-detail__sort-sep">|</span>
              <button type="button" class="feed-detail__sort-btn" data-feed-comment-order="asc">最新</button>
            </div>
            <div class="watch-comments" id="feed-detail-comment-list"></div>
          </div>
        </div>
        <form class="feed-detail__composer" id="feed-detail-composer">
          <textarea class="feed-detail__composer-input" id="feed-detail-comment-input" rows="2" placeholder="发一条友善的评论"></textarea>
          <button type="submit" class="btn-accent feed-detail__composer-submit">发布</button>
        </form>
      </div>
    </dialog>

    <dialog class="favorite-picker app-no-drag" id="favorite-picker-dialog" aria-labelledby="favorite-picker-title">
      <div class="favorite-picker__card">
        <header class="favorite-picker__head">
          <h2 class="favorite-picker__title" id="favorite-picker-title">选择收藏夹</h2>
          <button type="button" class="favorite-picker__close" id="favorite-picker-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="favorite-picker__body" id="favorite-picker-list"></div>
      </div>
    </dialog>

  `;
}

function bindNavigation() {
  document.querySelectorAll('.sidebar__main [data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      const pageId = el.getAttribute('data-nav');
      if (pageId === 'home' || pageId === 'feed' || pageId === 'mine') {
        setPage(pageId);
      }
    });
  });

  bindOpenLoginTriggers();

  document.querySelector('.topbar__logo-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    setPage('home');
  });

  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.topbar__tab').forEach((tab) => tab.classList.remove('is-active'));
      el.classList.add('is-active');
    });
  });

  document.querySelector('[data-sidebar-tool="upload"]')?.addEventListener('click', () => {
    if (!requireLogin()) return;
  });

  document.querySelector('[data-sidebar-tool="message"]')?.addEventListener('click', () => {
    if (!requireLogin()) return;
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    goToSettingsPage();
  });
}

function parseRgbText(text) {
  const match = text.trim().match(/rgb?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function bindSettings() {
  const schemeSelect = document.getElementById('setting-color-scheme');
  const picker = /** @type {HTMLInputElement | null} */ (document.getElementById('setting-accent-picker'));
  const text = /** @type {HTMLInputElement | null} */ (document.getElementById('setting-accent-text'));

  syncSettingsForm = () => {
    const prefs = loadPreferences();
    if (schemeSelect) schemeSelect.value = prefs.colorScheme;
    if (picker) picker.value = accentToHex(prefs.accent);
    if (text) {
      text.value = `rgb(${prefs.accent.r}, ${prefs.accent.g}, ${prefs.accent.b})`;
    }
    updateThemeToggleIcon(prefs.colorScheme);
  };

  schemeSelect?.addEventListener('change', () => {
    setColorSchemeWithReveal(
      /** @type {'light'|'dark'} */ (schemeSelect.value),
      schemeSelect,
    );
    syncSettingsForm();
  });

  picker?.addEventListener('input', () => {
    if (!picker.value) return;
    const r = Number.parseInt(picker.value.slice(1, 3), 16);
    const g = Number.parseInt(picker.value.slice(3, 5), 16);
    const b = Number.parseInt(picker.value.slice(5, 7), 16);
    savePreferences({ accent: { r, g, b } });
    syncSettingsForm();
  });

  text?.addEventListener('change', () => {
    const rgb = parseRgbText(text.value);
    if (!rgb) return;
    savePreferences({ accent: rgb });
    syncSettingsForm();
  });

  document.getElementById('btn-reset-accent')?.addEventListener('click', () => {
    savePreferences({ accent: { r: 123, g: 127, b: 247 } });
    syncSettingsForm();
  });

  document.getElementById('btn-theme-toggle')?.addEventListener('click', (event) => {
    const prefs = loadPreferences();
    const next = prefs.colorScheme === 'dark' ? 'light' : 'dark';
    setColorSchemeWithReveal(next, event.currentTarget, event);
    syncSettingsForm();
  });

  syncSettingsForm();
}

function syncLoginUi() {
  const session = loadSession();
  const avatarBtn = document.getElementById('btn-open-login');
  const img = /** @type {HTMLImageElement | null} */ (
    avatarBtn?.querySelector('.sidebar__avatar-img')
  );
  const loggedIn = Boolean(session?.token);

  if (avatarBtn) {
    avatarBtn.classList.toggle('is-logged-in', loggedIn);
    avatarBtn.title = loggedIn ? userDisplayName(session?.user) : '登录';
    avatarBtn.setAttribute('aria-label', loggedIn ? userDisplayName(session?.user) : '登录');
  }

  if (img) {
    const remote = userAvatarMediaSrc(session?.user);
    img.src = remote || DEFAULT_AVATAR_SRC;
    img.classList.toggle('sidebar__avatar-img--brand', !remote);
  }

  syncPagesAuthState();
  refreshMinePage();
}

function bindLogin() {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('login-panel'));
  const guestView = document.getElementById('login-guest-view');
  const loggedView = document.getElementById('login-logged-view');
  const accountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('login-account'));
  const passwordInput = /** @type {HTMLInputElement | null} */ (document.getElementById('login-password'));
  const phoneInput = /** @type {HTMLInputElement | null} */ (document.getElementById('login-phone'));
  const smsCodeInput = /** @type {HTMLInputElement | null} */ (document.getElementById('login-sms-code'));
  const errorEl = document.getElementById('login-error');
  const submitBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-login-submit'));
  const sendCodeBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-send-code'));
  const logoutBtn = document.getElementById('btn-logout');
  const loggedHint = document.getElementById('login-logged-hint');

  /** @type {'password' | 'sms'} */
  let activeTab = 'password';
  let smsCooldownTimer = /** @type {ReturnType<typeof setInterval> | null} */ (null);
  let smsCooldownLeft = 0;

  const setError = (message = '') => {
    if (errorEl) errorEl.textContent = message;
  };

  const setActiveTab = (tab) => {
    activeTab = tab;
    document.querySelectorAll('[data-login-tab]').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-login-tab') === tab);
    });
    document.querySelectorAll('[data-login-pane]').forEach((el) => {
      const pane = el.getAttribute('data-login-pane');
      el.hidden = pane !== tab;
    });
    if (submitBtn) {
      submitBtn.textContent = tab === 'sms' ? '登录 / 注册' : '登录';
    }
    setError('');
  };

  const stopSmsCooldown = () => {
    if (smsCooldownTimer) clearInterval(smsCooldownTimer);
    smsCooldownTimer = null;
    smsCooldownLeft = 0;
    if (sendCodeBtn) {
      sendCodeBtn.disabled = false;
      sendCodeBtn.textContent = '获取验证码';
    }
  };

  const startSmsCooldown = (seconds = 60) => {
    stopSmsCooldown();
    smsCooldownLeft = seconds;
    if (!sendCodeBtn) return;
    sendCodeBtn.disabled = true;
    sendCodeBtn.textContent = `${smsCooldownLeft}s`;
    smsCooldownTimer = setInterval(() => {
      smsCooldownLeft -= 1;
      if (smsCooldownLeft <= 0) {
        stopSmsCooldown();
        return;
      }
      if (sendCodeBtn) sendCodeBtn.textContent = `${smsCooldownLeft}s`;
    }, 1000);
  };

  const resetGuestForm = () => {
    setActiveTab('password');
    setError('');
    if (passwordInput) passwordInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (smsCodeInput) smsCodeInput.value = '';
    stopSmsCooldown();
  };

  const openLoginDialog = () => {
    const session = loadSession();
    const loggedIn = Boolean(session?.token);

    if (loggedIn) {
      guestView?.setAttribute('hidden', '');
      loggedView?.removeAttribute('hidden');
      if (loggedHint) {
        loggedHint.textContent = `当前账号：${userDisplayName(session?.user)}`;
      }
    } else {
      loggedView?.setAttribute('hidden', '');
      guestView?.removeAttribute('hidden');
      resetGuestForm();
    }

    dialog?.showModal();
    if (!loggedIn) {
      (activeTab === 'sms' ? phoneInput : accountInput)?.focus();
    }
  };

  registerOpenLoginHandler(openLoginDialog);

  document.getElementById('btn-open-login')?.addEventListener('click', openLoginDialog);
  document.getElementById('login-panel-close')?.addEventListener('click', () => dialog?.close());

  dialog?.addEventListener('close', () => {
    stopSmsCooldown();
  });

  dialog?.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  document.querySelectorAll('[data-login-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.getAttribute('data-login-tab');
      if (id === 'password' || id === 'sms') {
        setActiveTab(id);
        (id === 'sms' ? phoneInput : accountInput)?.focus();
      }
    });
  });

  sendCodeBtn?.addEventListener('click', async () => {
    if (smsCooldownLeft > 0) return;
    setError('');
    sendCodeBtn.disabled = true;
    try {
      await sendLoginCode(phoneInput?.value ?? '');
      startSmsCooldown(60);
    } catch (err) {
      sendCodeBtn.disabled = false;
      setError(err instanceof Error ? err.message : '验证码发送失败');
    }
  });

  submitBtn?.addEventListener('click', async () => {
    if (loadSession()?.token) return;

    setError('');
    submitBtn.disabled = true;
    try {
      if (activeTab === 'password') {
        await loginWithPassword(accountInput?.value ?? '', passwordInput?.value ?? '');
      } else {
        await loginWithSms(phoneInput?.value ?? '', smsCodeInput?.value ?? '');
      }
      syncLoginUi();
      dialog?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      submitBtn.disabled = false;
    }
  });

  [accountInput, passwordInput, phoneInput, smsCodeInput].forEach((input) => {
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitBtn?.click();
      }
    });
  });

  logoutBtn?.addEventListener('click', () => {
    clearSession();
    syncLoginUi();
    dialog?.close();
  });

  setActiveTab('password');
  bindLegalLinks(dialog ?? document);
  syncLoginUi();
}

function updateThemeToggleIcon(scheme) {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  const icon = scheme === 'dark' ? 'light_mode' : 'dark_mode';
  btn.innerHTML = `${materialIcon(icon, 'material-symbols-outlined--nav')}<span class="sr-only">外观</span>`;
}

function bootApp() {
  initTheme();
  renderShell();
  bindWindowControls();
  bindNavigation();
  bindSettings();
  bindLogin();
  bindHomeFeed();
  bindFeedPage();
  bindFeedDetail();
  bindVideoDetail();
  bindArticleDetail();
  bindFavoritePicker();
  bindUserSpace();
  bindMinePage();
}

try {
  bootApp();
} catch (err) {
  console.error('应用初始化失败', err);
} finally {
  runSplash();
}
