import { materialIcon } from './icons.js';
import { loadSession, userDisplayName } from './auth.js';
import { userAvatarMediaSrc } from './content-api.js';
import { destroyWatchPlayer } from './watch-player.js';

const DEFAULT_AVATAR = 'assets/mfuns_logo.png';

/** @typedef {'home' | 'feed' | 'mine' | 'settings' | 'watch'} PageId */

/** @type {PageId} */
let currentPage = 'home';

function guestBanner(subtitle) {
  return `
    <div class="guest-banner" data-guest-only>
      <div class="guest-banner__text">
        <h2 class="guest-banner__title">你还未登录</h2>
        <p class="guest-banner__sub">${subtitle}</p>
      </div>
      <button type="button" class="btn-accent" data-action="open-login">登录</button>
    </div>`;
}

function guestEmpty(message = '没有你想要的内容~', showBadge = true) {
  return `
    <div class="guest-empty" data-guest-only>
      <div class="guest-empty__art">
        <img src="${DEFAULT_AVATAR}" alt="" class="guest-empty__img" />
        ${showBadge ? '<span class="guest-empty__badge">空</span>' : ''}
      </div>
      <p class="guest-empty__text">${message}</p>
    </div>`;
}

function guestCenterBlock(title, subtitle) {
  return `
    <div class="guest-center" data-guest-only>
      <div class="guest-empty__art guest-empty__art--lg">
        <img src="${DEFAULT_AVATAR}" alt="" class="guest-empty__img" />
      </div>
      <h2 class="guest-center__title">${title}</h2>
      <p class="guest-center__sub">${subtitle}</p>
      <button type="button" class="btn-accent btn-accent--lg" data-action="open-login">登录</button>
    </div>`;
}

export function homePageHtml() {
  return `
    <div class="page-view page-view--home" data-page="home">
      <p class="home-feed__status" id="home-feed-status" hidden role="status"></p>
      <div class="content-grid" id="home-feed-grid"></div>
    </div>`;
}

export function feedPageHtml() {
  return `
    <div class="page-view page-view--feed" data-page="feed" hidden>
      <div class="feed-page">
        <aside class="feed-page__aside" aria-label="动态分类">
          <button type="button" class="feed-page__nav is-active">
            ${materialIcon('auto_awesome', 'feed-page__nav-icon')}
            <span>全部动态</span>
          </button>
        </aside>
        <div class="feed-page__main">
          ${guestBanner('登录账号，查看你关注的 UP 主内容')}
          <div class="feed-page__body" data-auth-only hidden>
            <p class="page-placeholder">登录后将展示关注动态</p>
          </div>
          ${guestEmpty()}
        </div>
      </div>
    </div>`;
}

export function minePageHtml() {
  return `
    <div class="page-view page-view--mine" data-page="mine" hidden>
      <div class="mine-page">
        <div class="mine-page__head">
          <div class="mine-profile" data-guest-only>
            <button type="button" class="mine-profile__avatar" data-action="open-login" aria-label="登录">
              <img src="${DEFAULT_AVATAR}" alt="" />
            </button>
            <div class="mine-profile__info">
              <button type="button" class="mine-profile__login" data-action="open-login">点击登录</button>
              <p class="mine-profile__coins">喵币：-　硬币：-</p>
            </div>
            <div class="mine-profile__stats">
              <div><strong>-</strong><span>动态</span></div>
              <div><strong>-</strong><span>关注</span></div>
              <div><strong>-</strong><span>粉丝</span></div>
            </div>
            <button type="button" class="mine-profile__space" data-action="open-login">空间 &gt;</button>
          </div>
          <div class="mine-profile mine-profile--auth" data-auth-only hidden>
            <div class="mine-profile__avatar mine-profile__avatar--static">
              <img id="mine-avatar-img" src="${DEFAULT_AVATAR}" alt="" />
            </div>
            <div class="mine-profile__info">
              <p class="mine-profile__name" id="mine-display-name">MFuns 用户</p>
              <p class="mine-profile__coins">喵币：-　硬币：-</p>
            </div>
            <div class="mine-profile__stats">
              <div><strong>-</strong><span>动态</span></div>
              <div><strong>-</strong><span>关注</span></div>
              <div><strong>-</strong><span>粉丝</span></div>
            </div>
            <button type="button" class="mine-profile__space">空间 &gt;</button>
          </div>
        </div>

        <div class="mine-page__toolbar">
          <nav class="mine-tabs" aria-label="个人内容">
            <button type="button" class="mine-tabs__item is-active">历史记录</button>
            <button type="button" class="mine-tabs__item">离线缓存</button>
            <button type="button" class="mine-tabs__item">我的收藏</button>
            <button type="button" class="mine-tabs__item">稍后再看</button>
          </nav>
          <label class="mine-search">
            ${materialIcon('search', 'mine-search__icon')}
            <input type="search" placeholder="搜索你的历史记录" aria-label="搜索历史记录" />
          </label>
        </div>

        <div class="mine-page__body" data-auth-only hidden>
          <p class="page-placeholder">登录后的历史与收藏将显示在这里</p>
        </div>
        ${guestCenterBlock('你还未登录', '登录注册解锁更多精彩内容')}
      </div>
    </div>`;
}

export function watchPageHtml() {
  return `
    <div class="page-view page-view--watch" data-page="watch" hidden>
      <div class="watch-page" id="watch-page-root">
        <header class="watch-toolbar app-no-drag">
          <button type="button" class="watch-back" id="watch-back-btn">
            ${materialIcon('arrow_back', 'watch-back-icon')}
            <span>返回</span>
          </button>
        </header>
        <div class="watch-layout">
          <div class="watch-main">
            <div class="watch-player-wrap app-no-drag" id="watch-player-root">
              <video id="watch-player" class="watch-player" playsinline></video>
              <div class="watch-player__overlay" id="watch-player-overlay">
                <div class="watch-player__center">
                  <button type="button" class="watch-player__big-play" id="watch-player-big-play" aria-label="播放">
                    ${materialIcon('play_arrow', 'watch-player__big-play-icon')}
                  </button>
                </div>
                <p class="watch-player__loading" id="watch-player-loading" hidden>正在缓冲…</p>
                <p class="watch-player__error" id="watch-player-error" hidden></p>
                <div class="watch-player__bar">
                  <button type="button" class="watch-player__btn" id="watch-player-play" aria-label="播放/暂停">
                    ${materialIcon('play_arrow')}
                  </button>
                  <span class="watch-player__time" id="watch-player-time">00:00 / 00:00</span>
                  <input type="range" class="watch-player__progress" id="watch-player-progress" min="0" max="1000" value="0" aria-label="进度" />
                  <div class="watch-player__quality-wrap">
                    <button type="button" class="watch-player__quality-btn" id="watch-player-quality-btn">清晰度</button>
                    <div class="watch-player__quality-menu" id="watch-player-quality-menu" hidden></div>
                  </div>
                  <input type="range" class="watch-player__volume" id="watch-player-volume" min="0" max="100" value="70" aria-label="音量" />
                  <button type="button" class="watch-player__btn" id="watch-player-fullscreen" aria-label="全屏">
                    ${materialIcon('fullscreen')}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <aside class="watch-side" id="watch-side-panel" aria-label="视频信息"></aside>
        </div>
      </div>
    </div>`;
}

export function settingsPageHtml() {
  return `
    <div class="page-view page-view--settings" data-page="settings" hidden>
      <div class="settings-page">
        <header class="settings-page__head">
          <h1 class="settings-page__title">设置</h1>
          <p class="settings-page__sub">外观与主题偏好将保存在本机</p>
        </header>
        <section class="settings-section settings-page__section">
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
      </div>
    </div>`;
}

export function getCurrentPage() {
  return currentPage;
}

/** @param {PageId} pageId */
export function setPage(pageId) {
  if (currentPage === 'watch' && pageId !== 'watch') {
    destroyWatchPlayer();
  }
  currentPage = pageId;

  document.querySelectorAll('.page-view').forEach((el) => {
    el.hidden = el.getAttribute('data-page') !== pageId;
  });

  document.querySelectorAll('.sidebar__main [data-nav]').forEach((el) => {
    el.classList.toggle('is-active', el.getAttribute('data-nav') === pageId);
  });

  document.querySelectorAll('[data-sidebar-tool]').forEach((el) => {
    const tool = el.getAttribute('data-sidebar-tool');
    el.classList.toggle('is-active', pageId === 'settings' && tool === 'settings');
  });

  const main = document.getElementById('main-content');
  main?.classList.toggle('content--home', pageId === 'home');
  main?.classList.toggle('content--feed', pageId === 'feed');
  main?.classList.toggle('content--mine', pageId === 'mine');
  main?.classList.toggle('content--settings', pageId === 'settings');
  main?.classList.toggle('content--watch', pageId === 'watch');

  const homeTabs = document.getElementById('topbar-tabs-home');
  homeTabs?.toggleAttribute('hidden', pageId !== 'home');

  document.querySelector('.btn-refresh')?.toggleAttribute('hidden', pageId === 'watch');

  syncPagesAuthState();
}

export function syncPagesAuthState() {
  const session = loadSession();
  const loggedIn = Boolean(session?.token);

  document.querySelectorAll('[data-guest-only]').forEach((el) => {
    el.hidden = loggedIn;
  });
  document.querySelectorAll('[data-auth-only]').forEach((el) => {
    el.hidden = !loggedIn;
  });

  const nameEl = document.getElementById('mine-display-name');
  const imgEl = /** @type {HTMLImageElement | null} */ (document.getElementById('mine-avatar-img'));
  if (loggedIn && nameEl) {
    nameEl.textContent = userDisplayName(session?.user);
  }
  if (loggedIn && imgEl) {
    imgEl.src = userAvatarMediaSrc(session?.user) || DEFAULT_AVATAR;
  }
}

export function bindOpenLoginTriggers(root = document) {
  root.querySelectorAll('[data-action="open-login"]').forEach((el) => {
    el.addEventListener('click', () => {
      document.getElementById('btn-open-login')?.click();
    });
  });
}
