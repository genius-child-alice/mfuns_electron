import { loadSession } from './auth.js';
import { renderFramedAvatarHtml } from './avatar-frame-ui.js';
import { materialIcon } from './icons.js';
import { isLoggedIn } from './login-ui.js';
import { getCurrentPage } from './pages.js';
import { getScrollTop, registerPageNavigation, restoreScrollTop } from './navigation.js';
import {
  fetchAllFollowing,
  fetchFollowingFeeds,
  fetchNewReplyFeeds,
  fetchUserFeeds,
} from './user-profile-api.js';
import {
  bindTimelineFeedClick,
  hydrateFeedCards,
  renderFeedCard,
  renderFeedListHtml,
} from './timeline-feed-ui.js';
import { openUserSpace } from './user-space.js';
import { feedListSkeletonHtml } from './skeleton-ui.js';

/** @typedef {import('./user-profile-api.js').UserProfile} UserProfile */
/** @typedef {import('./user-profile-api.js').TimelineFeedItem} TimelineFeedItem */

/** @type {number | null} */
let filterUserId = null;

let feedStartId = -1;
let globalPage = 1;
/** @type {'following' | 'global'} */
let feedStreamMode = 'following';
let loading = false;
let hasMore = true;
let asideBound = false;

/** 距列表底部不足该像素时才加载下一页 */
const SCROLL_LOAD_MORE_PX = 320;
const GLOBAL_FEED_PAGE_SIZE = 20;

/**
 * @param {Record<string, unknown> | null | undefined} user
 */
function sessionUserId(user) {
  if (!user) return null;
  const id = user.id ?? user.user_id;
  if (typeof id === 'number' && Number.isFinite(id)) return Math.trunc(id);
  const parsed = Number.parseInt(`${id ?? ''}`, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getListEl() {
  return document.getElementById('feed-page-list');
}

function getScrollEl() {
  return document.getElementById('feed-page-scroll');
}

function setHint(html, visible = true) {
  const el = document.getElementById('feed-page-hint');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = !visible;
}

function syncAsideActive() {
  document.querySelectorAll('[data-feed-filter]').forEach((btn) => {
    const raw = btn.getAttribute('data-feed-filter');
    let active = false;
    if (raw === 'all') active = filterUserId == null && feedStreamMode === 'following';
    else if (raw === 'global') active = filterUserId == null && feedStreamMode === 'global';
    else active = Number(raw) === filterUserId;
    btn.classList.toggle('is-active', active);
  });
}

/**
 * @param {UserProfile[]} users
 */
function renderFollowAside(users) {
  const list = document.getElementById('feed-page-follow-list');
  if (!list) return;
  list.innerHTML = users
    .map((user) => {
      const name = user.name || 'Mfuns 用户';
      return `
        <button type="button" class="feed-page__nav feed-page__nav--user" data-feed-filter="${user.id}">
          ${renderFramedAvatarHtml({
            avatar: user.avatar,
            frame: user.avatarFrame,
            size: 'nav',
            imgClass: 'feed-page__nav-avatar',
            phClass: 'feed-page__nav-avatar--ph',
          })}
          <span class="feed-page__nav-name">${escapeHtml(name)}</span>
        </button>`;
    })
    .join('');
}

function resetFeedState() {
  feedStartId = -1;
  hasMore = true;
}

/**
 * @param {boolean} first
 */
async function loadFeedPage(first) {
  if (loading) return;
  loading = true;
  if (first) {
    setHint('', false);
    const list = getListEl();
    if (list) list.innerHTML = feedListSkeletonHtml(4);
  } else {
    setHint(`${materialIcon('progress_activity', 'feed-page__spin')}加载更多…`, true);
  }

  try {
    const session = loadSession();
    const selfId = sessionUserId(session?.user);
    if (!filterUserId && feedStreamMode === 'following' && !selfId) {
      if (first) getListEl()?.replaceChildren();
      setHint('请先登录查看关注动态，或切换到全站动态', true);
      hasMore = false;
      return;
    }

    /** @type {TimelineFeedItem[]} */
    let items;
    if (filterUserId) {
      items = await fetchUserFeeds(filterUserId, first ? -1 : feedStartId);
    } else if (feedStreamMode === 'global') {
      const page = first ? 1 : globalPage + 1;
      items = await fetchNewReplyFeeds(page, GLOBAL_FEED_PAGE_SIZE);
      globalPage = page;
      if (first) feedStartId = -1;
    } else {
      items = await fetchFollowingFeeds(first ? -1 : feedStartId, selfId);
    }

    if (first) {
      getListEl()?.replaceChildren();
      if (items.length === 0) {
        setHint(
          filterUserId
            ? 'TA 还没有发布动态'
            : feedStreamMode === 'global'
              ? '暂无全站动态'
              : '暂无关注动态，去关注一些 UP 主吧',
          true,
        );
        hasMore = false;
        return;
      }
      setHint('', false);
      getListEl()?.insertAdjacentHTML('beforeend', renderFeedListHtml(items, feedRenderContext()));
      hydrateFeedCards(items, 'feed-page-feed');
    } else if (items.length > 0) {
      setHint('', false);
      const ctx = feedRenderContext();
      getListEl()
        ?.querySelector('.user-space__list--feed')
        ?.insertAdjacentHTML('beforeend', items.map((item) => renderFeedCard(item, ctx)).join(''));
      hydrateFeedCards(items, 'feed-page-feed');
    } else {
      hasMore = false;
      setHint('没有更多了', true);
    }

    if (feedStreamMode === 'global') {
      // 全站接口常返回少于请求的 size（如 size=20 仍只回 10 条），不能以 >=20 判断结束
      hasMore = items.length > 0;
    } else if (items.length > 0) {
      const last = items[items.length - 1];
      feedStartId = last.id;
      hasMore = true;
    } else if (!first) {
      hasMore = false;
    }
  } catch (err) {
    if (first) getListEl()?.replaceChildren();
    setHint(err instanceof Error ? err.message : '加载失败', true);
    hasMore = false;
  } finally {
    loading = false;
  }
}

function feedRenderContext() {
  return {
    domIdPrefix: 'feed-page-feed',
    profileFallback: null,
    spaceOwnerId: filterUserId,
  };
}

async function loadAside() {
  const session = loadSession();
  const userId = sessionUserId(session?.user);
  if (!userId) return;
  const list = document.getElementById('feed-page-follow-list');
  if (list) {
    list.innerHTML = `<p class="feed-page__aside-loading">${materialIcon('progress_activity', 'feed-page__spin')}加载关注…</p>`;
  }
  try {
    const users = await fetchAllFollowing(userId);
    renderFollowAside(users);
  } catch {
    if (list) list.innerHTML = '<p class="feed-page__aside-error">关注列表加载失败</p>';
  }
}

/**
 * @param {number | null} userId
 */
function selectFeedFilter(userId) {
  filterUserId = userId;
  if (userId != null) feedStreamMode = 'following';
  syncAsideActive();
  resetFeedState();
  globalPage = 1;
  void loadFeedPage(true);
}

/**
 * @param {'following' | 'global'} mode
 */
function selectFeedStream(mode) {
  feedStreamMode = mode;
  filterUserId = null;
  syncAsideActive();
  resetFeedState();
  globalPage = 1;
  void loadFeedPage(true);
}

function onAsideClick(event) {
  const btn = /** @type {HTMLElement} */ (event.target).closest('[data-feed-filter]');
  if (!btn) return;
  const raw = btn.getAttribute('data-feed-filter');
  if (raw === 'all') {
    selectFeedStream('following');
    return;
  }
  if (raw === 'global') {
    selectFeedStream('global');
    return;
  }
  const id = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(id)) return;
  selectFeedFilter(id);
}

/**
 * @param {HTMLElement | null} container
 */
function shouldLoadMoreNearBottom(container) {
  if (!container) return false;
  if (container.scrollHeight <= container.clientHeight + 1) return false;
  const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
  return remaining <= SCROLL_LOAD_MORE_PX;
}

function onFeedScroll() {
  if (getCurrentPage() !== 'feed' || loading || !hasMore) return;
  if (!shouldLoadMoreNearBottom(getScrollEl())) return;
  void loadFeedPage(false);
}

export function onFeedPageEnter() {
  if (getCurrentPage() !== 'feed') return;
  resetFeedState();
  filterUserId = null;
  feedStreamMode = isLoggedIn() ? 'following' : 'global';
  globalPage = 1;
  syncAsideActive();
  if (isLoggedIn()) void loadAside();
  void loadFeedPage(true);
}

export function captureFeedPageState() {
  const hintEl = document.getElementById('feed-page-hint');
  return {
    filterUserId,
    feedStreamMode,
    feedStartId,
    globalPage,
    hasMore,
    loading: false,
    listHtml: getListEl()?.innerHTML ?? '',
    hintHtml: hintEl?.innerHTML ?? '',
    hintHidden: hintEl?.hidden ?? true,
    scrollTop: getScrollTop('feed-page-scroll') || getScrollTop('main-content'),
  };
}

/**
 * @param {ReturnType<typeof captureFeedPageState>} state
 */
export function restoreFeedPageState(state) {
  filterUserId = state.filterUserId ?? null;
  feedStreamMode = state.feedStreamMode ?? 'following';
  feedStartId = state.feedStartId ?? -1;
  globalPage = state.globalPage ?? 1;
  hasMore = state.hasMore ?? true;
  loading = false;
  syncAsideActive();
  const list = getListEl();
  if (list) list.innerHTML = state.listHtml ?? '';
  const hintEl = document.getElementById('feed-page-hint');
  if (hintEl) {
    hintEl.innerHTML = state.hintHtml ?? '';
    hintEl.hidden = state.hintHidden ?? true;
  }
  restoreScrollTop(getScrollEl() ?? 'main-content', state.scrollTop ?? 0);
}

export function bindFeedPage() {
  if (asideBound) return;
  asideBound = true;

  document.getElementById('feed-page-aside')?.addEventListener('click', onAsideClick);
  getScrollEl()?.addEventListener('scroll', onFeedScroll, { passive: true });

  bindTimelineFeedClick(document.getElementById('feed-page-list'), {
    onOpenUserSpace: (uid) => openUserSpace(uid),
  });

  document.getElementById('feed-page-compose-btn')?.addEventListener('click', () => {
    void import('./contribute-page.js').then((mod) => {
      mod.openContributePage('feed');
      mod.openFeedComposeView();
    });
  });

  registerPageNavigation('feed', {
    capture: () => captureFeedPageState(),
    restore: (state) => {
      restoreFeedPageState(/** @type {ReturnType<typeof captureFeedPageState>} */ (state));
    },
    enter: () => {
      onFeedPageEnter();
    },
  });
}
