import { clearGlobalPlayerBlackmask, ensureHeimuGuard } from './watch-player.js';
import { unblockUi } from './ui-unblock.js';
import {
  accentToHex,
  initTheme,
  loadPreferences,
  savePreferences,
  setColorSchemeWithReveal,
} from './theme.js';
import { runSplash } from './splash.js';
import { notify } from './notice-ui.js';
import { materialIcon } from './icons.js';
import {
  clearSession,
  loadSession,
  loginWithPassword,
  loginWithSms,
  sendLoginCode,
  userDisplayName,
} from './auth.js';
import { renderUserFramedAvatarHtml } from './avatar-frame-ui.js';
import { userAvatarMediaSrc } from './content-api.js';
import { bindLegalLinks, LEGAL_URLS } from './legal.js';
import { bindRichMentionClicks } from './rich-content.js';
import { loadAppSettings } from './app-preferences.js';
import {
  bindOpenLoginTriggers,
  feedPageHtml,
  homePageHtml,
  minePageHtml,
  settingsPageHtml,
  watchPageHtml,
  articlePageHtml,
  spacePageHtml,
  followListPageHtml,
  searchPageHtml,
  tagPageHtml,
  categoryListPageHtml,
  signPageHtml,
  seriesPageHtml,
  messagePageHtml,
  contributePageHtml,
  memberCenterPageHtml,
  getCurrentPage,
  syncPagesAuthState,
} from './pages.js';
import { bindConfirmDialog } from './confirm-dialog.js';
import { bindCloseAppDialog } from './close-app-dialog.js';
import { bindNavigationShortcuts, navigateTo, resetNavigationLock } from './navigation.js';
import { initWindowDragPerf } from './window-drag-perf.js';
import { initLazyPageBind, ensurePageBound } from './lazy-page-bind.js';
import { registerOpenLoginHandler, requireLogin } from './login-ui.js';
import { feedForwardDialogHtml } from './feed-forward.js';
import { shareDialogHtml } from './share-ui.js';
import { bindPromptDialog, promptDialogHtml } from './prompt-dialog.js';
import { mergeGuestWatchLaterIntoUser } from './watch-later-store.js';
import { reportDialogHtml } from './report-ui.js';

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
  void navigateTo('settings');
}

function navIcon(name) {
  return materialIcon(name, 'material-symbols-outlined--nav');
}

function syncMaximizeControl(maximized) {
  const btn = document.getElementById('btn-maximize');
  if (!btn) return;
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = maximized ? 'filter_none' : 'crop_square';
  btn.setAttribute('aria-label', maximized ? '还原' : '最大化');
}

function bindWindowControls() {
  const api = window.electronAPI?.window;
  document.getElementById('btn-minimize')?.addEventListener('click', () => api?.minimize());
  document.getElementById('btn-maximize')?.addEventListener('click', () => api?.maximize());
  document.getElementById('btn-close')?.addEventListener('click', () => api?.close());

  if (api?.isMaximized) {
    void api.isMaximized().then((maximized) => {
      if (typeof maximized === 'boolean') syncMaximizeControl(maximized);
    });
  }
  api?.onMaximizedChanged?.(({ maximized }) => syncMaximizeControl(maximized));
}

function renderShell() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar app-no-drag" aria-label="主导航">
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
            <span class="sidebar__avatar-host" id="sidebar-avatar-host"></span>
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
              ${tool.id === 'message' ? '<span class="sidebar__badge" id="sidebar-message-badge" hidden></span>' : ''}
            </button>`,
          ).join('')}
        </div>
      </aside>

      <div class="main-column">
        <header class="topbar app-no-drag">
          <div class="topbar__brand app-drag">
            <a class="topbar__logo-link app-no-drag" href="#" aria-label="Mfuns 首页">
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
              <div class="search-field">
                <input
                  type="search"
                  class="search-input"
                  id="topbar-search-input"
                  placeholder="搜索视频、文章或用户"
                  aria-label="搜索"
                  enterkeyhint="search"
                  autocomplete="off"
                />
                <button
                  type="button"
                  class="search-field__clear"
                  id="topbar-search-clear"
                  hidden
                  aria-label="清除搜索"
                >${materialIcon('close', 'search-field__clear-icon')}</button>
                <button
                  type="button"
                  class="search-field__submit"
                  id="topbar-search-submit"
                  aria-label="搜索"
                >${materialIcon('search', 'search-field__submit-icon')}</button>
              </div>
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
          ${followListPageHtml()}
          ${searchPageHtml()}
          ${tagPageHtml()}
          ${categoryListPageHtml()}
          ${signPageHtml()}
          ${seriesPageHtml()}
          ${messagePageHtml()}
          ${contributePageHtml()}
          ${memberCenterPageHtml()}
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
              未注册过 Mfuns 的手机号，我们将自动帮你注册账号<br />
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
        <div class="feed-detail__scroll">
          <p class="feed-detail__loading" id="feed-detail-loading" hidden>${materialIcon('progress_activity', 'feed-page__spin')}加载中…</p>
          <p class="feed-detail__error" id="feed-detail-error" hidden role="alert"></p>
          <div class="feed-detail__post" id="feed-detail-post"></div>
          <div class="feed-detail__interact watch-interact-bar" id="feed-detail-interact" hidden></div>
          <nav class="feed-detail__tabs" aria-label="动态互动">
            <button type="button" class="feed-detail__tab" data-feed-detail-tab="repost">转发</button>
            <button type="button" class="feed-detail__tab is-active" data-feed-detail-tab="comment">评论</button>
          </nav>
          <div id="feed-detail-repost-panel" hidden>
            <p class="feed-detail__repost-empty">暂无转发内容</p>
          </div>
          <div id="feed-detail-comment-panel">
            <div class="feed-detail__sort" id="feed-detail-comment-sort"></div>
            <div class="watch-comments" id="feed-detail-comment-list"></div>
            <div id="feed-detail-comment-footer"></div>
          </div>
        </div>
        <div class="feed-detail__composer" id="feed-detail-composer">
          <button type="button" class="feed-detail__composer-trigger" id="feed-detail-comment-trigger">发一条友善的评论</button>
        </div>
      </div>
    </dialog>

    ${feedForwardDialogHtml()}
    ${reportDialogHtml()}

    <dialog class="favorite-picker app-no-drag" id="favorite-picker-dialog" aria-labelledby="favorite-picker-title">
      <div class="favorite-picker__card">
        <header class="favorite-picker__head">
          <div class="favorite-picker__head-main">
            <h2 class="favorite-picker__title" id="favorite-picker-title">收藏到收藏夹</h2>
            <p class="favorite-picker__hint" id="favorite-picker-hint">点击加入或移出；同一内容可存在于多个收藏夹</p>
          </div>
          <button type="button" class="favorite-picker__close" id="favorite-picker-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="favorite-picker__body" id="favorite-picker-list"></div>
        <footer class="favorite-picker__footer">
          <button type="button" class="favorite-picker__create" id="favorite-picker-create">
            ${materialIcon('add', 'favorite-picker__create-icon')}
            <span>新建收藏夹</span>
          </button>
        </footer>
      </div>
    </dialog>

    <dialog class="favorite-folder-create app-no-drag" id="favorite-folder-form-dialog" aria-labelledby="favorite-folder-form-title">
      <div class="favorite-folder-create__card">
        <header class="favorite-folder-create__head">
          <h2 class="favorite-folder-create__title" id="favorite-folder-form-title">新建收藏夹</h2>
          <button type="button" class="favorite-folder-create__close" id="favorite-folder-form-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <form class="favorite-folder-create__form" id="favorite-folder-form">
          <label class="favorite-folder-create__field">
            <span class="favorite-folder-create__label">名称</span>
            <input class="favorite-folder-create__input" id="favorite-folder-form-name" name="name" maxlength="50" required placeholder="给收藏夹起个名字" />
          </label>
          <label class="favorite-folder-create__field">
            <span class="favorite-folder-create__label">简介（可选）</span>
            <textarea class="favorite-folder-create__textarea" id="favorite-folder-form-desc" name="desc" maxlength="200" rows="3" placeholder="简单介绍一下这个收藏夹"></textarea>
          </label>
          <fieldset class="favorite-folder-create__field favorite-folder-create__visibility">
            <legend class="favorite-folder-create__label">可见性</legend>
            <div class="favorite-folder-create__status-group">
              <label class="favorite-folder-create__status">
                <input type="radio" name="favorite-folder-status" value="1" checked />
                <span class="favorite-folder-create__status-main">公开</span>
                <span class="favorite-folder-create__status-hint">所有人可见</span>
              </label>
              <label class="favorite-folder-create__status">
                <input type="radio" name="favorite-folder-status" value="0" />
                <span class="favorite-folder-create__status-main">私密</span>
                <span class="favorite-folder-create__status-hint">仅自己可见</span>
              </label>
              <label class="favorite-folder-create__status">
                <input type="radio" name="favorite-folder-status" value="2" />
                <span class="favorite-folder-create__status-main">隐藏</span>
                <span class="favorite-folder-create__status-hint">不在个人空间展示</span>
              </label>
            </div>
          </fieldset>
          <div class="favorite-folder-create__actions">
            <button type="button" class="favorite-folder-create__cancel" id="favorite-folder-form-cancel">取消</button>
            <button type="submit" class="btn-accent favorite-folder-create__submit" id="favorite-folder-form-submit">创建</button>
          </div>
        </form>
      </div>
    </dialog>

    <dialog class="danmaku-manager app-no-drag" id="danmaku-manager-dialog" aria-labelledby="danmaku-manager-title">
      <div class="danmaku-manager__card">
        <header class="danmaku-manager__head">
          <div class="danmaku-manager__head-main">
            <h2 class="danmaku-manager__title" id="danmaku-manager-title">弹幕列表</h2>
            <p class="danmaku-manager__count" id="danmaku-manager-count"></p>
          </div>
          <button type="button" class="danmaku-manager__close" id="danmaku-manager-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="danmaku-manager__search-wrap">
          <input type="search" class="danmaku-manager__search" id="danmaku-manager-search" placeholder="搜索弹幕内容" autocomplete="off" />
        </div>
        <div class="danmaku-manager__list" id="danmaku-manager-list"></div>
      </div>
    </dialog>

    <dialog class="confirm-dialog app-no-drag" id="confirm-dialog" aria-labelledby="confirm-dialog-title">
      <div class="confirm-dialog__card">
        <h2 class="confirm-dialog__title" id="confirm-dialog-title">请确认</h2>
        <p class="confirm-dialog__message" id="confirm-dialog-message"></p>
        <div class="confirm-dialog__actions">
          <button type="button" class="confirm-dialog__cancel" id="confirm-dialog-cancel">取消</button>
          <button type="button" class="confirm-dialog__confirm" id="confirm-dialog-confirm">确定</button>
        </div>
      </div>
    </dialog>

    <dialog class="close-app-dialog app-no-drag" id="close-app-dialog" aria-labelledby="close-app-dialog-title">
      <div class="close-app-dialog__card">
        <h2 class="close-app-dialog__title" id="close-app-dialog-title">关闭 Mfuns</h2>
        <p class="close-app-dialog__message">确定要关闭主界面吗？</p>
        <div class="close-app-dialog__actions" id="close-app-dialog-actions"></div>
      </div>
    </dialog>

    <dialog class="reward-dialog app-no-drag" id="reward-dialog" aria-labelledby="reward-dialog-title">
      <div class="reward-dialog__card">
        <header class="reward-dialog__head">
          <div class="reward-dialog__head-main">
            <h2 class="reward-dialog__title" id="reward-dialog-title">${materialIcon('paid', 'reward-dialog__title-icon')}投币支持</h2>
            <p class="reward-dialog__subtitle" id="reward-dialog-subtitle">为你喜欢的内容投币吧！</p>
          </div>
          <button type="button" class="reward-dialog__close" id="reward-dialog-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="reward-dialog__options" role="list">
          ${[1, 2, 5]
            .map(
              (n) => `
            <button type="button" class="reward-dialog__option" data-reward-count="${n}" role="listitem">
              <span class="reward-dialog__option-icon">${materialIcon('monetization_on')}</span>
              <span class="reward-dialog__option-label">投 ${n} 枚</span>
              ${materialIcon('chevron_right', 'reward-dialog__option-chevron')}
            </button>`,
            )
            .join('')}
        </div>
        <footer class="reward-dialog__footer">
          <button type="button" class="reward-dialog__cancel" id="reward-dialog-cancel">取消</button>
        </footer>
      </div>
    </dialog>

    <dialog class="reward-dialog app-no-drag offline-download-dialog" id="offline-download-dialog" aria-labelledby="offline-download-dialog-title">
      <div class="reward-dialog__card">
        <header class="reward-dialog__head">
          <div class="reward-dialog__head-main">
            <h2 class="reward-dialog__title" id="offline-download-dialog-title">${materialIcon('download', 'reward-dialog__title-icon')}离线缓存</h2>
            <p class="reward-dialog__subtitle" id="offline-download-subtitle">选择要缓存的分辨率</p>
          </div>
          <button type="button" class="reward-dialog__close" id="offline-download-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="reward-dialog__options" id="offline-download-options" role="list"></div>
        <footer class="reward-dialog__footer">
          <button type="button" class="reward-dialog__cancel" id="offline-download-cancel">取消</button>
        </footer>
      </div>
    </dialog>

    ${shareDialogHtml()}

    <dialog class="series-picker app-no-drag" id="series-picker-dialog" aria-labelledby="series-picker-title">
      <div class="series-picker__card">
        <header class="series-picker__head">
          <div class="series-picker__head-main">
            <h2 class="series-picker__title" id="series-picker-title">加入合集</h2>
            <p class="series-picker__hint">选择要加入的合集</p>
          </div>
          <button type="button" class="series-picker__close" id="series-picker-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="series-picker__body" id="series-picker-list"></div>
        <footer class="series-picker__footer">
          <button type="button" class="series-picker__create" id="series-picker-create">
            ${materialIcon('add', 'series-picker__create-icon')}
            <span>新建合集</span>
          </button>
        </footer>
      </div>
    </dialog>

    <dialog class="series-picker app-no-drag" id="series-content-picker-dialog" aria-labelledby="series-content-picker-title">
      <div class="series-picker__card">
        <header class="series-picker__head">
          <div class="series-picker__head-main">
            <h2 class="series-picker__title" id="series-content-picker-title">添加内容</h2>
            <p class="series-picker__hint">从已发布的投稿中选择</p>
          </div>
          <button type="button" class="series-picker__close" id="series-content-picker-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="series-picker__body series-content-picker__body" id="series-content-picker-list"></div>
      </div>
    </dialog>

    ${promptDialogHtml()}

  `;
}

function onSidebarInteract() {
  resetNavigationLock();
  unblockUi('sidebar', { keepLogin: true });
  void import('./comment-composer.js')
    .then((mod) => mod.closeCommentComposer?.())
    .catch(() => {});
}

function bindNavigation() {
  document.querySelectorAll('.sidebar button, .sidebar a').forEach((el) => {
    el.classList.add('app-no-drag');
  });

  document.querySelectorAll('.sidebar__main [data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      onSidebarInteract();
      const pageId = el.getAttribute('data-nav');
      if (pageId === 'home' || pageId === 'feed' || pageId === 'mine') {
        void navigateTo(pageId);
      }
    });
  });

  bindOpenLoginTriggers();

  document.querySelector('.topbar__logo-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    onSidebarInteract();
    void navigateTo('home');
  });

  document.querySelector('[data-sidebar-tool="upload"]')?.addEventListener('click', () => {
    onSidebarInteract();
    void ensurePageBound('contribute')
      .then(() => import('./contribute-page.js'))
      .then((mod) => mod.openContributePage())
      .catch((err) => {
        console.error('创作中心模块加载失败', err);
        notify('创作中心加载失败，请重启应用后重试', 'error');
      });
  });

  document.querySelector('[data-sidebar-tool="message"]')?.addEventListener('click', () => {
    onSidebarInteract();
    void import('./message-page.js').then((mod) => mod.openMessagePage());
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    onSidebarInteract();
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
      /** @type {'light'|'dark'|'system'} */ (schemeSelect.value),
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
    const order = /** @type {const} */ (['light', 'dark', 'system']);
    const index = order.indexOf(prefs.colorScheme);
    const next = order[(index + 1) % order.length];
    setColorSchemeWithReveal(next, event.currentTarget, event);
    syncSettingsForm();
  });

  syncSettingsForm();
}

function syncLoginUi() {
  const session = loadSession();
  const avatarBtn = document.getElementById('btn-open-login');
  const avatarHost = document.getElementById('sidebar-avatar-host');
  const loggedIn = Boolean(session?.token);

  if (avatarBtn) {
    avatarBtn.classList.toggle('is-logged-in', loggedIn);
    avatarBtn.title = loggedIn ? userDisplayName(session?.user) : '登录';
    avatarBtn.setAttribute('aria-label', loggedIn ? userDisplayName(session?.user) : '登录');
  }

  if (avatarHost) {
    const remote = userAvatarMediaSrc(session?.user);
    avatarHost.innerHTML = renderUserFramedAvatarHtml({
      user: session?.user ?? null,
      fallbackAvatarSrc: DEFAULT_AVATAR_SRC,
      size: 'sidebar',
      imgClass: `sidebar__avatar-img${remote ? '' : ' sidebar__avatar-img--brand'}`,
      phClass: 'sidebar__avatar-img--ph',
    });
  }

  syncPagesAuthState();
  void import('./mine-page.js').then((mod) => mod.refreshMinePage());
  if (getCurrentPage() === 'settings') {
    void import('./settings-page.js').then((mod) => mod.refreshSettingsProfile());
  }
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
      const session = loadSession();
      const uid = Number(session?.user?.id ?? session?.user?.user_id);
      if (Number.isFinite(uid) && uid > 0) {
        const merged = mergeGuestWatchLaterIntoUser(uid);
        if (merged > 0) notify(`已合并 ${merged} 条稍后再看到账号`, 'success');
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
  const icon =
    scheme === 'system' ? 'brightness_auto' : scheme === 'dark' ? 'light_mode' : 'dark_mode';
  const label =
    scheme === 'system' ? '外观：追随系统' : scheme === 'dark' ? '外观：深色' : '外观：浅色';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = `${materialIcon(icon, 'material-symbols-outlined--nav')}<span class="sr-only">${label}</span>`;
}

function bootApp() {
  initWindowDragPerf();
  initTheme();
  ensureHeimuGuard();
  clearGlobalPlayerBlackmask();
  resetNavigationLock();
  unblockUi('boot');
  document.documentElement.classList.toggle('reduce-motion', loadAppSettings().reduceMotion);
  renderShell();
  bindWindowControls();
  bindNavigation();
  void import('./search-page.js').then((mod) => mod.bindTopbarSearch());
  bindNavigationShortcuts();
  bindRichMentionClicks();
  bindSettings();
  initLazyPageBind({ onSettingsUserUpdated: () => syncLoginUi() });
  bindLogin();
  bindConfirmDialog();
  bindCloseAppDialog();
  bindPromptDialog();
  void ensurePageBound('home');
}

try {
  bootApp();
} catch (err) {
  console.error('应用初始化失败', err);
} finally {
  runSplash();
}
