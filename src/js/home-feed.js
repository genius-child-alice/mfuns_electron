import { materialIcon } from './icons.js';
import { fetchHotList, fetchRecommendList } from './content-api.js';

/** @typedef {'recommend' | 'hot' | 'article' | 'video'} HomeTabId */

const PAGE_SIZE = 20;
const RECOMMEND_SIZE_STEP = PAGE_SIZE;
const MAX_RECOMMEND_SIZE = 200;
const SCROLL_LOAD_THRESHOLD = 160;

/** @type {HomeTabId} */
let activeHomeTab = 'recommend';

/** @type {boolean} */
let loading = false;

/** @type {import('./content-api.js').ContentPreview[]} */
let shownItems = [];

/** @type {boolean} */
let hasMore = true;

/** @type {number} */
let recommendRequestSize = PAGE_SIZE;

/** @type {import('./content-api.js').ContentPreview[] | null} */
let hotFilteredCache = null;

/** @type {number} */
let hotShownCount = 0;

/**
 * @param {number} n
 */
function formatCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

/**
 * @param {string | null} iso
 */
function formatDateLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}-${date.getDate()}`;
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
 * @param {import('./content-api.js').ContentPreview} item
 */
function renderVideoCard(item) {
  const hue = Number.parseInt(item.id, 10) % 360 || 200;
  const cover = item.cover
    ? `<img class="video-card__cover-img" src="${escapeHtml(item.cover)}" alt="" loading="lazy" />`
    : `<div class="video-card__cover" style="--ph: ${hue}"></div>`;
  const dateLabel = formatDateLabel(item.createdAt);

  return `
    <article class="video-card" data-content-id="${escapeHtml(item.id)}" data-content-type="${item.type}">
      <div class="video-card__cover-wrap">
        ${cover}
        <div class="video-card__stats">
          <div class="video-card__stats-left">
            <span class="video-card__stat">${materialIcon('play_arrow', 'video-card__stat-icon')}${formatCount(item.views)}</span>
            <span class="video-card__stat">${materialIcon('chat_bubble', 'video-card__stat-icon')}${formatCount(item.comments)}</span>
          </div>
        </div>
      </div>
      <div class="video-card__meta">
        <h3 class="video-card__title">${escapeHtml(item.title)}</h3>
        <p class="video-card__sub">
          <span>${escapeHtml(item.author)}</span>
          ${dateLabel ? `<time>${dateLabel}</time>` : ''}
        </p>
      </div>
    </article>`;
}

/**
 * @param {HomeTabId} tabId
 * @param {import('./content-api.js').ContentPreview[]} items
 */
function filterByTab(tabId, items) {
  if (tabId === 'article') {
    return items.filter((item) => item.type === 0);
  }
  return items.filter((item) => item.type === 1);
}

function getGridEl() {
  return document.getElementById('home-feed-grid');
}

function resetFeedState() {
  shownItems = [];
  hasMore = true;
  recommendRequestSize = PAGE_SIZE;
  hotFilteredCache = null;
  hotShownCount = 0;
  removeLoadMoreIndicator();
}

function setStatus(message = '', isError = false) {
  const el = document.getElementById('home-feed-status');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('home-feed__status--error');
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('home-feed__status--error', isError);
}

function setGridHtml(html) {
  const grid = getGridEl();
  if (grid) grid.innerHTML = html;
}

function setGridLoading() {
  setGridHtml(
    `<p class="home-feed__loading">${materialIcon('progress_activity', 'home-feed__spin')}正在加载…</p>`,
  );
}

function removeLoadMoreIndicator() {
  getGridEl()?.querySelector('.home-feed__load-more')?.remove();
}

function setLoadMoreIndicator(visible) {
  const grid = getGridEl();
  if (!grid) return;
  let el = grid.querySelector('.home-feed__load-more');
  if (!visible) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('p');
    el.className = 'home-feed__load-more';
    el.setAttribute('aria-live', 'polite');
    grid.appendChild(el);
  }
  el.innerHTML = `${materialIcon('progress_activity', 'home-feed__spin')}加载更多…`;
}

/**
 * @param {import('./content-api.js').ContentPreview[]} items
 */
function appendVideoCards(items) {
  const grid = getGridEl();
  if (!grid || items.length === 0) return;
  removeLoadMoreIndicator();
  grid.insertAdjacentHTML('beforeend', items.map((item) => renderVideoCard(item)).join(''));
  shownItems.push(...items);
}

function isHomePageVisible() {
  const home = document.querySelector('.page-view[data-page="home"]');
  return home != null && !home.hidden;
}

/**
 * @param {HomeTabId} [tabId]
 */
export async function loadHomeFeed(tabId = activeHomeTab) {
  if (loading) return;
  activeHomeTab = tabId;
  resetFeedState();
  loading = true;
  setStatus('');
  setGridLoading();

  try {
    if (tabId === 'hot') {
      const items = await fetchHotList();
      hotFilteredCache = filterByTab(tabId, items);
      if (hotFilteredCache.length === 0) {
        hasMore = false;
        setGridHtml('<p class="home-feed__empty">暂无内容</p>');
        return;
      }
      const first = hotFilteredCache.slice(0, PAGE_SIZE);
      hotShownCount = first.length;
      hasMore = hotShownCount < hotFilteredCache.length;
      setGridHtml(first.map((item) => renderVideoCard(item)).join(''));
      shownItems = [...first];
      return;
    }

    const items = await fetchRecommendList(PAGE_SIZE);
    const filtered = filterByTab(tabId, items);
    if (filtered.length === 0) {
      hasMore = false;
      setGridHtml('<p class="home-feed__empty">暂无内容</p>');
      return;
    }
    recommendRequestSize = PAGE_SIZE;
    hasMore = true;
    setGridHtml(filtered.map((item) => renderVideoCard(item)).join(''));
    shownItems = [...filtered];
  } catch (err) {
    const message = err instanceof Error ? err.message : '加载失败';
    setGridHtml('');
    setStatus(message, true);
    hasMore = false;
  } finally {
    loading = false;
  }
}

export async function loadMoreHomeFeed() {
  if (loading || !hasMore || !isHomePageVisible()) return;

  loading = true;
  setLoadMoreIndicator(true);

  try {
    if (activeHomeTab === 'hot') {
      if (!hotFilteredCache) {
        hasMore = false;
        return;
      }
      const next = hotFilteredCache.slice(hotShownCount, hotShownCount + PAGE_SIZE);
      if (next.length === 0) {
        hasMore = false;
        return;
      }
      appendVideoCards(next);
      hotShownCount += next.length;
      hasMore = hotShownCount < hotFilteredCache.length;
      return;
    }

    if (recommendRequestSize >= MAX_RECOMMEND_SIZE) {
      hasMore = false;
      return;
    }

    recommendRequestSize += RECOMMEND_SIZE_STEP;
    const items = await fetchRecommendList(recommendRequestSize);
    const filtered = filterByTab(activeHomeTab, items);
    const seen = new Set(shownItems.map((item) => item.id));
    const newItems = filtered.filter((item) => !seen.has(item.id));

    if (newItems.length === 0) {
      hasMore = false;
      return;
    }

    appendVideoCards(newItems);
    hasMore = recommendRequestSize < MAX_RECOMMEND_SIZE;
  } catch (err) {
    const message = err instanceof Error ? err.message : '加载更多失败';
    setStatus(message, true);
  } finally {
    loading = false;
    removeLoadMoreIndicator();
  }
}

function onMainContentScroll() {
  if (!isHomePageVisible() || !hasMore || loading) return;
  const main = document.getElementById('main-content');
  if (!main) return;
  const { scrollTop, clientHeight, scrollHeight } = main;
  if (scrollTop + clientHeight >= scrollHeight - SCROLL_LOAD_THRESHOLD) {
    loadMoreHomeFeed();
  }
}

export function getActiveHomeTab() {
  return activeHomeTab;
}

export function bindHomeFeed() {
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.getAttribute('data-tab');
      if (id === 'recommend' || id === 'hot' || id === 'article' || id === 'video') {
        loadHomeFeed(id);
      }
    });
  });

  document.querySelector('.btn-refresh')?.addEventListener('click', () => {
    loadHomeFeed(activeHomeTab);
  });

  document.getElementById('main-content')?.addEventListener('scroll', onMainContentScroll, {
    passive: true,
  });

  loadHomeFeed('recommend');
}
