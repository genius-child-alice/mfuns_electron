import { materialIcon } from './icons.js';
import { loadSession, userDisplayName } from './auth.js';
import { userAvatarMediaSrc } from './content-api.js';
import { destroyWatchPlayer } from './watch-player.js';

const DEFAULT_AVATAR = 'assets/mfuns_logo.png';

/** @typedef {'home' | 'feed' | 'mine' | 'settings' | 'watch' | 'article' | 'space' | 'follow-list' | 'search'} PageId */

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
      <nav class="home-category-strip" id="home-category-strip" hidden aria-label="内容分区">
        <div class="home-category-strip__scroll" id="home-category-list"></div>
      </nav>
      <p class="home-feed__status" id="home-feed-status" hidden role="status"></p>
      <div class="content-grid" id="home-feed-grid"></div>
    </div>`;
}

export function searchPageHtml() {
  return `
    <div class="page-view page-view--search" data-page="search" hidden>
      <div class="search-page">
        <header class="search-page__head">
          <h1 class="search-page__title" id="search-page-query">搜索</h1>
        </header>
        <nav class="search-page__tabs" id="search-page-tabs" aria-label="搜索分类">
          <button type="button" class="search-page__tab is-active" data-search-tab="all">综合</button>
          <button type="button" class="search-page__tab" data-search-tab="video">视频</button>
          <button type="button" class="search-page__tab" data-search-tab="article">文章</button>
          <button type="button" class="search-page__tab" data-search-tab="user">用户</button>
        </nav>
        <p class="home-feed__status" id="search-page-status" hidden role="status"></p>
        <div class="content-grid search-page__resource" id="search-page-resource"></div>
        <div class="search-page__users" id="search-page-users" hidden></div>
        <nav class="search-page__pager" id="search-page-pager" hidden aria-label="搜索结果分页">
          <div class="search-page__pager-main">
            <button type="button" class="search-page__pager-link" id="search-page-prev" disabled>上一页</button>
            <div class="search-page__pager-pages" id="search-page-pager-pages"></div>
            <button type="button" class="search-page__pager-link" id="search-page-next" disabled>下一页</button>
            <span class="search-page__pager-total" id="search-page-pager-total"></span>
          </div>
          <div class="search-page__pager-jump" id="search-page-pager-jump">
            <span class="search-page__pager-jump-label">跳至</span>
            <input
              type="number"
              class="search-page__pager-jump-input"
              id="search-page-jump-input"
              min="1"
              step="1"
              inputmode="numeric"
              aria-label="页码"
            />
            <span class="search-page__pager-jump-label">页</span>
            <button type="button" class="search-page__pager-jump-btn" id="search-page-jump-btn">确定</button>
          </div>
        </nav>
      </div>
    </div>`;
}

export function feedPageHtml() {
  return `
    <div class="page-view page-view--feed" data-page="feed" hidden>
      <div class="feed-page">
        <aside class="feed-page__aside" aria-label="关注的人">
          <nav class="feed-page__aside-inner" id="feed-page-aside" data-auth-only hidden>
            <button type="button" class="feed-page__nav feed-page__nav--all is-active" data-feed-filter="all">
              ${materialIcon('auto_awesome', 'feed-page__nav-icon')}
              <span>全部动态</span>
            </button>
            <div class="feed-page__aside-divider" aria-hidden="true"></div>
            <div class="feed-page__follow-list" id="feed-page-follow-list"></div>
          </nav>
          <p class="feed-page__aside-guest" data-guest-only>登录后查看关注列表</p>
        </aside>
        <div class="feed-page__main">
          ${guestBanner('登录账号，查看你关注的 UP 主内容')}
          <div class="feed-page__stream" data-auth-only hidden>
            <div class="feed-page__scroll" id="feed-page-scroll">
              <div id="feed-page-list"></div>
              <p class="feed-page__hint" id="feed-page-hint" hidden></p>
            </div>
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
              <p class="mine-profile__coins">喵币：-</p>
            </div>
            <div class="mine-profile__stats">
              <div><strong>-</strong><span>视频</span></div>
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
              <p class="mine-profile__coins">喵币：<span id="mine-neko-coin">-</span></p>
            </div>
            <div class="mine-profile__stats">
              <div><strong id="mine-stat-videos">-</strong><span>视频</span></div>
              <div><strong id="mine-stat-feeds">-</strong><span>动态</span></div>
              <button type="button" class="mine-profile__stat-btn" id="mine-open-follows"><strong id="mine-stat-follows">-</strong><span>关注</span></button>
              <button type="button" class="mine-profile__stat-btn" id="mine-open-fans"><strong id="mine-stat-fans">-</strong><span>粉丝</span></button>
            </div>
            <button type="button" class="mine-profile__space" id="btn-open-my-space">空间 &gt;</button>
          </div>
        </div>

        <div class="mine-page__toolbar">
          <nav class="mine-tabs" aria-label="个人内容">
            <button type="button" class="mine-tabs__item is-active" data-mine-tab="history">历史记录</button>
            <button type="button" class="mine-tabs__item" data-mine-tab="offline">离线缓存</button>
            <button type="button" class="mine-tabs__item" data-mine-tab="favorite">我的收藏</button>
            <button type="button" class="mine-tabs__item" data-mine-tab="watchlater">稍后再看</button>
          </nav>
          <label class="mine-search">
            ${materialIcon('search', 'mine-search__icon')}
            <input type="search" id="mine-history-search" placeholder="搜索你的历史记录" aria-label="搜索历史记录" />
          </label>
        </div>

        <div class="mine-page__body" data-auth-only hidden>
          <div class="mine-history" id="mine-history-root"></div>
        </div>
        ${guestCenterBlock('你还未登录', '登录注册解锁更多精彩内容')}
      </div>
    </div>`;
}

export function watchPageHtml() {
  return `
    <div class="page-view page-view--watch" data-page="watch" hidden>
      <div class="watch-page" id="watch-page-root">
        <div class="watch-layout">
          <div class="watch-main">
            <header class="watch-toolbar app-no-drag">
              <button type="button" class="watch-back" id="watch-back-btn">
                ${materialIcon('arrow_back', 'watch-back-icon')}
                <span>返回</span>
              </button>
            </header>
            <div class="watch-player-wrap app-no-drag" id="watch-player-root">
              <video id="watch-player" class="watch-player" playsinline></video>
              <canvas class="watch-player__danmaku" id="watch-player-danmaku" aria-hidden="true"></canvas>
              <div class="watch-player__overlay" id="watch-player-overlay">
                <div class="watch-player__center">
                  <button type="button" class="watch-player__big-play" id="watch-player-big-play" aria-label="播放">
                    ${materialIcon('play_arrow', 'watch-player__big-play-icon')}
                  </button>
                </div>
                <p class="watch-player__loading" id="watch-player-loading" hidden>正在缓冲…</p>
                <p class="watch-player__error" id="watch-player-error" hidden></p>
                <div class="watch-player__bottom">
                  <div class="watch-player__progress-wrap">
                    <div class="watch-player__progress-track">
                      <div class="watch-player__progress-buffer" id="watch-player-buffer"></div>
                      <div class="watch-player__progress-played" id="watch-player-played"></div>
                      <input type="range" class="watch-player__progress" id="watch-player-progress" min="0" max="1000" value="0" aria-label="进度" />
                    </div>
                  </div>
                  <div class="watch-player__controls">
                    <div class="watch-player__controls-left">
                      <button type="button" class="watch-player__btn" id="watch-player-play" aria-label="播放/暂停">
                        ${materialIcon('play_arrow')}
                      </button>
                      <button type="button" class="watch-player__btn" id="watch-player-next" aria-label="下一P" hidden>
                        ${materialIcon('skip_next')}
                      </button>
                      <span class="watch-player__time" id="watch-player-time">00:00 / 00:00</span>
                    </div>
                    <div class="watch-player__controls-center">
                      <div class="watch-danmaku-bar">
                        <button type="button" class="watch-danmaku-bar__toggle is-on" id="watch-danmaku-toggle" aria-label="弹幕开关" title="弹幕">
                          ${materialIcon('subtitles', 'watch-danmaku-bar__toggle-icon')}
                        </button>
                        <input type="text" class="watch-danmaku-bar__input" id="watch-danmaku-input" maxlength="100" placeholder="发个友善的弹幕见证当下" autocomplete="off" />
                        <button type="button" class="watch-danmaku-bar__send" id="watch-danmaku-send">发送</button>
                        <div class="watch-player__menu-wrap watch-danmaku-bar__settings-wrap">
                          <button type="button" class="watch-danmaku-bar__settings" id="watch-danmaku-settings-btn" aria-label="弹幕设置" title="弹幕设置">
                            ${materialIcon('tune')}
                          </button>
                          <div class="watch-player__popup-menu watch-danmaku-settings" id="watch-danmaku-settings-menu" hidden>
                            <label class="watch-danmaku-settings__row">
                              <span>不透明度</span>
                              <input type="range" id="watch-danmaku-opacity" min="20" max="100" value="85" />
                            </label>
                            <label class="watch-danmaku-settings__row">
                              <span>字号</span>
                              <input type="range" id="watch-danmaku-scale" min="60" max="160" value="100" />
                            </label>
                            <label class="watch-danmaku-settings__row">
                              <span>显示区域</span>
                              <input type="range" id="watch-danmaku-area" min="25" max="100" value="75" />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="watch-player__controls-right">
                      <div class="watch-player__menu-wrap watch-player__quality-wrap">
                        <button type="button" class="watch-player__text-btn" id="watch-player-quality-btn">清晰度</button>
                        <div class="watch-player__popup-menu" id="watch-player-quality-menu" hidden></div>
                      </div>
                      <div class="watch-player__menu-wrap watch-player__speed-wrap">
                        <button type="button" class="watch-player__text-btn" id="watch-player-speed-btn">倍速</button>
                        <div class="watch-player__popup-menu" id="watch-player-speed-menu" hidden>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="2">2.0x</button>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="1.5">1.5x</button>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="1.25">1.25x</button>
                          <button type="button" class="watch-player__menu-item is-active" data-playback-rate="1">1.0x</button>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="0.75">0.75x</button>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="0.5">0.5x</button>
                        </div>
                      </div>
                      <div class="watch-player__menu-wrap watch-player__volume-wrap">
                        <button type="button" class="watch-player__btn" id="watch-player-volume-btn" aria-label="音量">
                          ${materialIcon('volume_up')}
                        </button>
                        <div class="watch-player__volume-popup" id="watch-player-volume-popup" hidden>
                          <input type="range" class="watch-player__volume" id="watch-player-volume" min="0" max="100" value="70" aria-label="音量" />
                        </div>
                      </div>
                      <button type="button" class="watch-player__btn" id="watch-player-fullscreen" aria-label="全屏">
                        ${materialIcon('fullscreen')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <aside class="watch-side" id="watch-side-panel" aria-label="视频信息"></aside>
        </div>
      </div>
    </div>`;
}

export function articlePageHtml() {
  return `
    <div class="page-view page-view--article" data-page="article" hidden>
      <div class="article-page" id="article-page-root">
        <header class="article-toolbar app-no-drag">
          <button type="button" class="article-back" id="article-back-btn">
            ${materialIcon('arrow_back', 'article-back-icon')}
            <span>返回</span>
          </button>
        </header>
        <div class="article-scroll" id="article-scroll">
          <div class="article-body" id="article-body-root"></div>
        </div>
      </div>
    </div>`;
}

export function followListPageHtml() {
  return `
    <div class="page-view page-view--follow-list" data-page="follow-list" hidden>
      <div class="follow-list" id="follow-list-root">
        <header class="follow-list__bar app-no-drag">
          <button type="button" class="follow-list__back" id="follow-list-back">
            ${materialIcon('arrow_back', 'follow-list__back-icon')}
            <span>返回</span>
          </button>
          <h1 class="follow-list__bar-title" id="follow-list-title">关注</h1>
        </header>
        <div class="follow-list__scroll">
          <p class="follow-list__loading" id="follow-list-loading" hidden>${materialIcon('progress_activity', 'follow-list__spin')}加载中…</p>
          <div class="follow-list__grid" id="follow-list-grid"></div>
        </div>
      </div>
    </div>`;
}

export function spacePageHtml() {
  return `
    <div class="page-view page-view--space" data-page="space" hidden>
      <div class="user-space" id="user-space-root">
        <header class="user-space__bar app-no-drag">
          <button type="button" class="user-space__back" id="user-space-back">
            ${materialIcon('arrow_back')}
            <span>返回</span>
          </button>
          <span class="user-space__bar-title" id="user-space-bar-title">个人空间</span>
        </header>
        <div class="user-space__scroll" id="user-space-scroll">
          <div class="user-space__banner-wrap" id="user-space-banner-wrap">
            <div class="user-space__banner user-space__banner--ph"></div>
          </div>
          <div class="user-space__profile" id="user-space-profile"></div>
          <nav class="user-space__tabs" role="tablist" aria-label="空间内容">
            <button type="button" class="user-space__tab is-active" data-space-tab="video" role="tab">视频</button>
            <button type="button" class="user-space__tab" data-space-tab="feed" role="tab">动态</button>
            <button type="button" class="user-space__tab" data-space-tab="article" role="tab">文章</button>
            <button type="button" class="user-space__tab" data-space-tab="favorite" role="tab" hidden>收藏</button>
          </nav>
          <div class="user-space__body" id="user-space-body"></div>
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
  main?.classList.toggle('content--article', pageId === 'article');
  main?.classList.toggle('content--space', pageId === 'space');
  main?.classList.toggle('content--follow-list', pageId === 'follow-list');
  main?.classList.toggle('content--search', pageId === 'search');

  const homeTabs = document.getElementById('topbar-tabs-home');
  homeTabs?.toggleAttribute('hidden', pageId !== 'home');

  document
    .querySelector('.btn-refresh')
    ?.toggleAttribute(
      'hidden',
      pageId === 'watch' ||
        pageId === 'article' ||
        pageId === 'space' ||
        pageId === 'follow-list',
    );

  syncPagesAuthState();

  if (pageId === 'search') {
    void import('./search-page.js').then((mod) => mod.onSearchPageEnter());
  }
  if (pageId === 'mine') {
    void import('./mine-page.js').then((mod) => mod.onMinePageEnter());
  }
  if (pageId === 'feed') {
    void import('./feed-page.js').then((mod) => mod.onFeedPageEnter());
  }
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
