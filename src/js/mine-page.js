import { materialIcon } from './icons.js';
import { loadSession } from './auth.js';
import { mediaSrcForCover } from './content-api.js';
import { fetchHistoryPage } from './history-api.js';
import { isLoggedIn } from './login-ui.js';
import { getCurrentPage } from './pages.js';
import { openContentDetail, previewFromCard } from './content-nav.js';
import { fetchMineDashboard } from './user-profile-api.js';
import {
  fetchFavoriteFolderList,
  fetchFavoriteItemsPage,
  resolveMineUserId,
} from './favorite-api.js';
import {
  bindFavoriteFolderListActions,
  favoriteFolderCreateButtonHtml,
  favoriteFolderRowHtml,
  removeItemFromFavoriteFolder,
} from './favorite-ui.js';
import { renderVideoCard } from './home-feed.js';
import {
  clearWatchLater,
  listWatchLater,
  removeVideoFromWatchLater,
} from './watch-later-store.js';

/** @typedef {import('./history-api.js').HistoryEntry} HistoryEntry */
/** @typedef {'history' | 'offline' | 'favorite' | 'watchlater'} MineTabId */

/** @type {MineTabId} */
let activeTab = 'history';

let loading = false;
let hasMore = true;
/** @type {number | null} */
let nextStartTime = null;

/** @type {HistoryEntry[]} */
let allHistoryItems = [];

/** @type {string} */
let searchQuery = '';

const SCROLL_PREFETCH_MIN_PX = 480;

let profileLoading = false;

/** @type {import('./favorite-api.js').FavoriteFolder[]} */
let favoriteFolders = [];
/** @type {number | null} */
let activeFavoriteFolderId = null;
/** @type {string} */
let activeFavoriteFolderName = '';
/** @type {import('./content-api.js').ContentPreview[]} */
let favoriteItems = [];
/** @type {number | null} */
let favoriteNextLastId = null;
let favoriteItemsHasMore = true;
let favoriteLoading = false;

/**
 * @param {number} n
 */
function formatCount(n) {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(Math.trunc(n));
}

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
 * @param {import('./user-profile-api.js').MineDashboardStats} stats
 */
function applyMineDashboard(stats) {
  const coinEl = document.getElementById('mine-neko-coin');
  const videosEl = document.getElementById('mine-stat-videos');
  const feedsEl = document.getElementById('mine-stat-feeds');
  const followsEl = document.getElementById('mine-stat-follows');
  const fansEl = document.getElementById('mine-stat-fans');
  if (coinEl) coinEl.textContent = formatCount(stats.nekoCoin);
  if (videosEl) videosEl.textContent = formatCount(stats.videoCount);
  if (feedsEl) feedsEl.textContent = formatCount(stats.feedCount);
  if (followsEl) followsEl.textContent = formatCount(stats.follows);
  if (fansEl) fansEl.textContent = formatCount(stats.fans);
}

async function loadMineDashboard() {
  if (!isLoggedIn() || profileLoading) return;
  const userId = sessionUserId(loadSession()?.user);
  if (userId == null || userId <= 0) return;

  profileLoading = true;
  try {
    const stats = await fetchMineDashboard(userId);
    applyMineDashboard(stats);
  } catch {
    applyMineDashboard({
      nekoCoin: 0,
      videoCount: 0,
      feedCount: 0,
      follows: 0,
      fans: 0,
    });
  } finally {
    profileLoading = false;
  }
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

/**
 * @param {Date} a
 * @param {Date} b
 */
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * @param {string | null} iso
 */
function parseViewDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Date} date
 */
function formatDayHeading(date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, now)) return '今天';
  if (isSameDay(date, yesterday)) return '昨天';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * @param {Date} date
 */
function formatViewTimeLabel(date) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (isSameDay(date, now)) return `今天 ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return `昨天 ${time}`;
  return `${date.getMonth() + 1}-${date.getDate()} ${time}`;
}

/**
 * @param {HistoryEntry[]} items
 * @param {string} query
 */
function filterHistoryItems(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((entry) => {
    const { preview } = entry;
    return (
      preview.title.toLowerCase().includes(q) || preview.author.toLowerCase().includes(q)
    );
  });
}

/**
 * @param {HistoryEntry} entry
 */
function renderHistoryCard(entry) {
  const { preview, viewTime, progressRatio, finished } = entry;
  const hue = Number.parseInt(preview.id, 10) % 360 || 200;
  const coverSrc = mediaSrcForCover(preview.cover);
  const cover = coverSrc
    ? `<img class="video-card__cover-img" src="${escapeHtml(coverSrc)}" alt="" loading="lazy" decoding="async" />`
    : `<div class="video-card__cover" style="--ph: ${hue}"></div>`;

  const viewDate = parseViewDate(viewTime);
  const viewLabel = viewDate ? formatViewTimeLabel(viewDate) : '';
  const progressWidth = finished ? 100 : Math.round(progressRatio * 100);

  return `
    <article class="mine-history-card video-card" data-content-id="${escapeHtml(preview.id)}" data-content-type="${preview.type}">
      <div class="mine-history-card__cover video-card__cover-wrap">
        ${cover}
        ${finished ? '<span class="mine-history-card__badge">已看完</span>' : ''}
        ${
          viewLabel
            ? `<span class="mine-history-card__time">${materialIcon('schedule', 'mine-history-card__time-icon')}${escapeHtml(viewLabel)}</span>`
            : ''
        }
        ${
          progressWidth > 0
            ? `<div class="mine-history-card__progress" aria-hidden="true"><span style="width:${progressWidth}%"></span></div>`
            : ''
        }
      </div>
      <div class="mine-history-card__title-row">
        <h3 class="mine-history-card__title">${escapeHtml(preview.title)}</h3>
        <button type="button" class="mine-history-card__more" aria-label="更多" title="更多">
          ${materialIcon('more_vert')}
        </button>
      </div>
      <p class="mine-history-card__up">
        <span class="mine-history-card__up-tag">UP</span>
        <span class="mine-history-card__up-name">${escapeHtml(preview.author)}</span>
      </p>
    </article>`;
}

/**
 * @param {HistoryEntry[]} items
 */
function groupHistoryByDay(items) {
  /** @type {{ key: string, label: string, items: HistoryEntry[] }[]} */
  const groups = [];
  /** @type {Map<string, { key: string, label: string, items: HistoryEntry[] }>} */
  const map = new Map();

  items.forEach((entry) => {
    const date = parseViewDate(entry.viewTime) ?? new Date(0);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    let group = map.get(key);
    if (!group) {
      group = { key, label: formatDayHeading(date), items: [] };
      map.set(key, group);
      groups.push(group);
    }
    group.items.push(entry);
  });

  return groups;
}

/**
 * @param {HistoryEntry[]} items
 */
function renderHistorySections(items) {
  if (items.length === 0) {
    return '<p class="mine-history__empty">暂无历史记录</p>';
  }

  const groups = groupHistoryByDay(items);
  return groups
    .map(
      (group, index) => `
    <section class="mine-history-section" data-day-key="${escapeHtml(group.key)}">
      <header class="mine-history-section__head">
        <h2 class="mine-history-section__title">${escapeHtml(group.label)}</h2>
        ${
          index === 0
            ? `<button type="button" class="mine-history-section__clear" id="mine-history-clear-btn">
                ${materialIcon('delete_outline', 'mine-history-section__clear-icon')}
                清空历史记录
              </button>`
            : ''
        }
      </header>
      <div class="content-grid">
        ${group.items.map((entry) => renderHistoryCard(entry)).join('')}
      </div>
    </section>`,
    )
    .join('');
}

function getRootEl() {
  return document.getElementById('mine-history-root');
}

function getSearchInput() {
  return /** @type {HTMLInputElement | null} */ (document.getElementById('mine-history-search'));
}

function syncSearchVisibility() {
  const searchWrap = document.querySelector('.mine-search');
  searchWrap?.classList.toggle('mine-search--hidden', activeTab !== 'history');
}

function syncTabUi() {
  document.querySelectorAll('[data-mine-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-mine-tab') === activeTab);
  });
  syncSearchVisibility();
}

function renderPanelPlaceholder(message) {
  const root = getRootEl();
  if (!root) return;
  root.innerHTML = `<p class="mine-history__empty">${escapeHtml(message)}</p>`;
}

function renderHistoryView() {
  const root = getRootEl();
  if (!root) return;
  const filtered = filterHistoryItems(allHistoryItems, searchQuery);
  root.innerHTML = renderHistorySections(filtered);
  bindHistoryCardClicks(root);
  document.getElementById('mine-history-clear-btn')?.addEventListener('click', () => {
    alert('服务端暂未开放清空历史接口');
  });
}

function bindHistoryCardClicks(root) {
  root.querySelectorAll('.mine-history-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      if (target.closest('.mine-history-card__more')) return;
      const preview = previewFromCard(card);
      if (!preview || (preview.type !== 0 && preview.type !== 1)) return;
      void openContentDetail(preview);
    });
  });
}

function resetHistoryState() {
  allHistoryItems = [];
  nextStartTime = null;
  hasMore = true;
}

function resetFavoriteState() {
  favoriteFolders = [];
  activeFavoriteFolderId = null;
  activeFavoriteFolderName = '';
  favoriteItems = [];
  favoriteNextLastId = null;
  favoriteItemsHasMore = true;
  favoriteLoading = false;
}

export function refreshWatchLaterView() {
  renderWatchLaterView();
}

/** 当前在「我的 → 稍后再看」时刷新列表 */
export function refreshWatchLaterIfActive() {
  if (getCurrentPage() === 'mine' && activeTab === 'watchlater') {
    renderWatchLaterView();
  }
}

function renderWatchLaterView() {
  const root = getRootEl();
  if (!root) return;
  const userId = resolveMineUserId(null);
  const items = userId != null ? listWatchLater(userId) : [];

  if (items.length === 0) {
    root.innerHTML = `
      <div class="mine-watchlater">
        <p class="mine-history__empty">暂无稍后再看视频</p>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="mine-watchlater">
      <header class="mine-watchlater__head">
        <p class="mine-watchlater__meta">共 ${items.length} 个视频 · 保存在本设备</p>
        <button type="button" class="mine-watchlater__clear" id="mine-watchlater-clear">
          ${materialIcon('delete_outline', 'mine-watchlater__clear-icon')}
          清空
        </button>
      </header>
      <div class="content-grid mine-watchlater__grid">
        ${items
          .map(
            (item) => `
          <div class="mine-watchlater-card">
            ${renderVideoCard(item)}
            <button type="button" class="mine-watchlater-card__remove" data-watchlater-remove="${escapeHtml(item.id)}" aria-label="移出稍后再看" title="移出稍后再看">
              ${materialIcon('close')}
            </button>
          </div>`,
          )
          .join('')}
      </div>
    </div>`;

  root.querySelectorAll('.mine-watchlater-card .video-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      if (target.closest('.mine-watchlater-card__remove')) return;
      const preview = previewFromCard(card);
      if (!preview || preview.type !== 1) return;
      void openContentDetail(preview);
    });
  });

  root.querySelectorAll('[data-watchlater-remove]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = btn.getAttribute('data-watchlater-remove');
      const uid = resolveMineUserId(null);
      if (!id || uid == null) return;
      removeVideoFromWatchLater(uid, id);
      renderWatchLaterView();
    });
  });

  document.getElementById('mine-watchlater-clear')?.addEventListener('click', () => {
    if (!confirm('确定清空稍后再看列表？')) return;
    const uid = resolveMineUserId(null);
    if (uid == null) return;
    clearWatchLater(uid);
    renderWatchLaterView();
  });
}

function renderFavoriteFoldersView(folders) {
  const root = getRootEl();
  if (!root) return;
  const toolbar = `<div class="mine-favorite-folders__toolbar">${favoriteFolderCreateButtonHtml('mine-favorite-folders__create')}</div>`;
  if (folders.length === 0) {
    root.innerHTML = `${toolbar}<p class="mine-history__empty">暂无收藏夹</p>`;
    bindFavoriteFolderListActions(root, {
      folders,
      openAttr: 'data-favorite-folder-id',
      onOpen: () => {},
      onRefresh: () => {
        void loadFavoriteFolders();
      },
    });
    return;
  }
  root.innerHTML = `
    <div class="mine-favorite-folders">
      ${toolbar}
      ${folders
        .map((folder) =>
          favoriteFolderRowHtml(folder, { openAttr: 'data-favorite-folder-id', openValue: folder.id }),
        )
        .join('')}
    </div>`;

  bindFavoriteFolderListActions(root, {
    folders,
    openAttr: 'data-favorite-folder-id',
    onOpen: (folder) => {
      activeFavoriteFolderId = folder.id;
      activeFavoriteFolderName = folder.name;
      favoriteItems = [];
      favoriteNextLastId = null;
      favoriteItemsHasMore = true;
      void loadFavoriteItemsFirstPage();
    },
    onRefresh: () => {
      void loadFavoriteFolders();
    },
  });
}

function renderFavoriteItemsView() {
  const root = getRootEl();
  if (!root) return;
  const title = activeFavoriteFolderName || '收藏夹';
  root.innerHTML = `
    <div class="mine-favorite-items">
      <header class="mine-favorite-items__head">
        <button type="button" class="mine-favorite-items__back" id="mine-favorite-back">
          ${materialIcon('arrow_back', 'mine-favorite-items__back-icon')}
          <span>返回</span>
        </button>
        <h2 class="mine-favorite-items__title">${escapeHtml(title)}</h2>
      </header>
      <div class="content-grid mine-favorite-items__grid" id="mine-favorite-grid">
        ${
          favoriteItems.length === 0
            ? '<p class="mine-history__empty mine-favorite-items__empty">该收藏夹暂无内容</p>'
            : favoriteItems
                .map(
                  (item) => `
            <div class="mine-favorite-item-card">
              ${renderVideoCard(item)}
              <button type="button" class="mine-favorite-item-card__remove" data-favorite-item-remove="${escapeHtml(item.id)}" data-favorite-item-type="${item.type}" aria-label="移出收藏夹" title="移出收藏夹">
                ${materialIcon('bookmark_remove')}
              </button>
            </div>`,
                )
                .join('')
        }
      </div>
    </div>`;

  document.getElementById('mine-favorite-back')?.addEventListener('click', () => {
    activeFavoriteFolderId = null;
    activeFavoriteFolderName = '';
    favoriteItems = [];
    favoriteNextLastId = null;
    favoriteItemsHasMore = true;
    renderFavoriteFoldersView(favoriteFolders);
  });

  const grid = document.getElementById('mine-favorite-grid');
  grid?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const removeBtn = target.closest('[data-favorite-item-remove]');
    if (removeBtn instanceof HTMLButtonElement && activeFavoriteFolderId != null) {
      const preview = previewFromCard(
        /** @type {HTMLElement} */ (removeBtn.closest('.mine-favorite-item-card')?.querySelector('.video-card') ?? removeBtn),
      );
      if (!preview) return;
      void removeItemFromFavoriteFolder(activeFavoriteFolderId, preview, () => {
        favoriteItems = favoriteItems.filter((entry) => String(entry.id) !== String(preview.id));
        renderFavoriteItemsView();
        void loadFavoriteFolders();
      });
      return;
    }
    const card = target.closest('.video-card');
    if (!card) return;
    const preview = previewFromCard(card);
    if (!preview || (preview.type !== 0 && preview.type !== 1)) return;
    void openContentDetail(preview);
  });
}

function appendFavoriteLoadMoreHint() {
  const root = getRootEl();
  if (!root || document.getElementById('mine-favorite-load-more')) return;
  const grid = document.getElementById('mine-favorite-grid');
  grid?.insertAdjacentHTML(
    'afterend',
    `<p class="mine-history__loading" id="mine-favorite-load-more">${materialIcon('progress_activity', 'mine-history__spin')}加载更多…</p>`,
  );
}

async function loadFavoriteFolders() {
  if (!isLoggedIn() || favoriteLoading) return;
  const userId = resolveMineUserId(sessionUserId(loadSession()?.user));
  if (userId == null) {
    renderPanelPlaceholder('请先登录');
    return;
  }

  favoriteLoading = true;
  activeFavoriteFolderId = null;
  renderPanelPlaceholder('加载中…');
  try {
    favoriteFolders = await fetchFavoriteFolderList(userId);
    renderFavoriteFoldersView(favoriteFolders);
  } catch (err) {
    renderPanelPlaceholder(err instanceof Error ? err.message : '加载失败');
  } finally {
    favoriteLoading = false;
  }
}

async function loadFavoriteItemsFirstPage() {
  if (!isLoggedIn() || favoriteLoading || activeFavoriteFolderId == null) return;
  favoriteLoading = true;
  renderFavoriteItemsView();
  const grid = document.getElementById('mine-favorite-grid');
  if (grid) grid.innerHTML = '<p class="mine-history__loading">加载中…</p>';

  try {
    const page = await fetchFavoriteItemsPage(activeFavoriteFolderId);
    favoriteItems = page.items;
    favoriteNextLastId = page.nextLastId;
    favoriteItemsHasMore = page.hasMore && page.items.length > 0;
    renderFavoriteItemsView();
  } catch (err) {
    const root = getRootEl();
    if (root) {
      root.innerHTML = `<p class="mine-history__empty">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`;
    }
  } finally {
    favoriteLoading = false;
  }
}

async function loadFavoriteItemsMore() {
  if (
    !isLoggedIn() ||
    favoriteLoading ||
    !favoriteItemsHasMore ||
    activeTab !== 'favorite' ||
    activeFavoriteFolderId == null
  ) {
    return;
  }

  favoriteLoading = true;
  appendFavoriteLoadMoreHint();
  try {
    const page = await fetchFavoriteItemsPage(activeFavoriteFolderId, favoriteNextLastId);
    document.getElementById('mine-favorite-load-more')?.remove();
    if (page.items.length === 0) {
      favoriteItemsHasMore = false;
      return;
    }
    favoriteItems = favoriteItems.concat(page.items);
    favoriteNextLastId = page.nextLastId;
    favoriteItemsHasMore = page.hasMore;
    renderFavoriteItemsView();
  } catch {
    document.getElementById('mine-favorite-load-more')?.remove();
  } finally {
    favoriteLoading = false;
  }
}

function appendLoadMoreHint() {
  const root = getRootEl();
  if (!root || document.getElementById('mine-history-load-more')) return;
  root.insertAdjacentHTML(
    'beforeend',
    `<p class="mine-history__loading" id="mine-history-load-more">${materialIcon('progress_activity', 'mine-history__spin')}加载更多…</p>`,
  );
}

function removeLoadMoreHint() {
  document.getElementById('mine-history-load-more')?.remove();
}

async function loadHistoryFirstPage() {
  if (!isLoggedIn() || loading) return;
  loading = true;
  resetHistoryState();
  renderPanelPlaceholder('加载中…');

  try {
    const page = await fetchHistoryPage();
    allHistoryItems = page.items;
    nextStartTime = page.nextStartTime;
    hasMore = page.hasMore && page.items.length > 0;
    renderHistoryView();
  } catch (err) {
    renderPanelPlaceholder(err instanceof Error ? err.message : '加载失败');
    hasMore = false;
  } finally {
    loading = false;
  }
}

async function loadHistoryMore() {
  if (!isLoggedIn() || loading || !hasMore || activeTab !== 'history') return;
  if (searchQuery.trim()) return;

  loading = true;
  appendLoadMoreHint();

  try {
    const page = await fetchHistoryPage(nextStartTime);
    document.getElementById('mine-history-load-more')?.remove();
    if (page.items.length === 0) {
      hasMore = false;
      return;
    }
    allHistoryItems = allHistoryItems.concat(page.items);
    nextStartTime = page.nextStartTime;
    hasMore = page.hasMore;
    renderHistoryView();
  } catch {
    document.getElementById('mine-history-load-more')?.remove();
  } finally {
    loading = false;
  }
}

/**
 * @param {MineTabId} tab
 */
function showTabPanel(tab) {
  activeTab = tab;
  syncTabUi();

  if (!isLoggedIn()) return;

  if (tab === 'history') {
    if (allHistoryItems.length === 0 && !loading) {
      void loadHistoryFirstPage();
    } else {
      renderHistoryView();
    }
    return;
  }

  if (tab === 'favorite') {
    if (activeFavoriteFolderId != null) {
      if (favoriteItems.length === 0 && !favoriteLoading) {
        void loadFavoriteItemsFirstPage();
      } else {
        renderFavoriteItemsView();
      }
    } else if (favoriteFolders.length === 0 && !favoriteLoading) {
      void loadFavoriteFolders();
    } else {
      renderFavoriteFoldersView(favoriteFolders);
    }
    return;
  }

  if (tab === 'watchlater') {
    refreshWatchLaterView();
    return;
  }

  if (tab === 'offline') {
    renderPanelPlaceholder('离线缓存功能开发中');
  }
}

function shouldPrefetchMore(container) {
  const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
  const threshold = Math.max(SCROLL_PREFETCH_MIN_PX, container.clientHeight * 0.8);
  return remaining < threshold;
}

function onMainScroll() {
  if (getCurrentPage() !== 'mine') return;
  const main = document.getElementById('main-content');
  if (!main || !shouldPrefetchMore(main)) return;

  if (activeTab === 'history') {
    if (!hasMore || loading || searchQuery.trim()) return;
    void loadHistoryMore();
    return;
  }

  if (activeTab === 'favorite' && activeFavoriteFolderId != null) {
    if (!favoriteItemsHasMore || favoriteLoading) return;
    void loadFavoriteItemsMore();
  }
}

export function refreshMinePage() {
  if (!isLoggedIn()) {
    resetHistoryState();
    resetFavoriteState();
    return;
  }
  void loadMineDashboard();
  if (getCurrentPage() === 'mine' && activeTab === 'history') {
    void loadHistoryFirstPage();
  }
  if (getCurrentPage() === 'mine' && activeTab === 'favorite') {
    resetFavoriteState();
    void loadFavoriteFolders();
  }
  if (getCurrentPage() === 'mine' && activeTab === 'watchlater') {
    refreshWatchLaterView();
  }
}

export function onMinePageEnter() {
  if (!isLoggedIn()) return;
  void loadMineDashboard();
  if (activeTab === 'history') {
    if (allHistoryItems.length === 0) void loadHistoryFirstPage();
    else renderHistoryView();
  }
  if (activeTab === 'favorite') {
    if (activeFavoriteFolderId != null) {
      if (favoriteItems.length === 0) void loadFavoriteItemsFirstPage();
      else renderFavoriteItemsView();
    } else if (favoriteFolders.length === 0) {
      void loadFavoriteFolders();
    } else {
      renderFavoriteFoldersView(favoriteFolders);
    }
  }
  if (activeTab === 'watchlater') {
    refreshWatchLaterView();
  }
}

export function bindMinePage() {
  document.querySelectorAll('[data-mine-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.getAttribute('data-mine-tab');
      if (id !== 'history' && id !== 'offline' && id !== 'favorite' && id !== 'watchlater') return;
      showTabPanel(id);
    });
  });

  getSearchInput()?.addEventListener('input', () => {
    searchQuery = getSearchInput()?.value ?? '';
    if (activeTab === 'history') renderHistoryView();
  });

  document.getElementById('main-content')?.addEventListener('scroll', onMainScroll, {
    passive: true,
  });

  window.addEventListener('mfuns:watch-later-changed', () => {
    refreshWatchLaterIfActive();
  });

  window.addEventListener('mfuns:favorite-changed', () => {
    if (getCurrentPage() !== 'mine' || activeTab !== 'favorite') return;
    if (activeFavoriteFolderId != null) {
      void loadFavoriteItemsFirstPage();
    } else {
      void loadFavoriteFolders();
    }
  });

  syncTabUi();
}
