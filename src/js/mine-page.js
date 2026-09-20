import { materialIcon } from './icons.js';
import { mediaSrcForCover } from './content-api.js';
import { fetchHistoryPage } from './history-api.js';
import { isLoggedIn } from './login-ui.js';
import { getCurrentPage } from './pages.js';
import { openVideoDetail } from './video-detail.js';

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
      const id = card.getAttribute('data-content-id');
      const type = Number(card.getAttribute('data-content-type'));
      if (!id || type !== 1) return;
      const titleEl = card.querySelector('.mine-history-card__title');
      const authorEl = card.querySelector('.mine-history-card__up-name');
      void openVideoDetail({
        id,
        title: titleEl?.textContent?.trim() ?? '',
        cover: null,
        author: authorEl?.textContent?.trim() ?? '',
        type: 1,
        views: 0,
        comments: 0,
        createdAt: null,
      });
    });
  });
}

function resetHistoryState() {
  allHistoryItems = [];
  nextStartTime = null;
  hasMore = true;
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

  const messages = {
    offline: '离线缓存功能开发中',
    favorite: '我的收藏功能开发中',
    watchlater: '稍后再看功能开发中',
  };
  renderPanelPlaceholder(messages[tab]);
}

function shouldPrefetchMore(container) {
  const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
  const threshold = Math.max(SCROLL_PREFETCH_MIN_PX, container.clientHeight * 0.8);
  return remaining < threshold;
}

function onMainScroll() {
  if (getCurrentPage() !== 'mine' || activeTab !== 'history') return;
  if (!hasMore || loading || searchQuery.trim()) return;
  const main = document.getElementById('main-content');
  if (!main || !shouldPrefetchMore(main)) return;
  void loadHistoryMore();
}

export function refreshMinePage() {
  if (!isLoggedIn()) {
    resetHistoryState();
    return;
  }
  if (getCurrentPage() === 'mine' && activeTab === 'history') {
    void loadHistoryFirstPage();
  }
}

export function onMinePageEnter() {
  if (!isLoggedIn()) return;
  if (activeTab === 'history') {
    if (allHistoryItems.length === 0) void loadHistoryFirstPage();
    else renderHistoryView();
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

  syncTabUi();
}
