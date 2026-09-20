import { materialIcon } from './icons.js';
import {
  fetchCategories,
  fetchHotList,
  fetchRecommendByCategory,
  fetchRecommendList,
  mediaSrcForCover,
} from './content-api.js';
import { openVideoDetail } from './video-detail.js';

/** @typedef {'recommend' | 'hot' | 'category'} HomeTabId */

const PAGE_SIZE = 20;
const RECOMMEND_SIZE_STEP = PAGE_SIZE;
const MAX_RECOMMEND_SIZE = 200;
const MAX_CATEGORY_SIZE = 100;
const SCROLL_PREFETCH_MIN_PX = 560;
const SCROLL_PREFETCH_VIEWPORT_RATIO = 1.5;

/** @type {HomeTabId} */
let activeHomeTab = 'recommend';

let loading = false;

/** @type {import('./content-api.js').ContentPreview[]} */
let shownItems = [];

let hasMore = true;

let recommendRequestSize = PAGE_SIZE;

/** @type {import('./content-api.js').ContentPreview[] | null} */
let hotFilteredCache = null;

let hotShownCount = 0;

/** @type {import('./content-api.js').CategoryNode[]} */
let categories = [];

let categoriesLoaded = false;

/** @type {number | null} */
let selectedCategoryId = null;

let categoryRequestSize = PAGE_SIZE;

let categoryStripBound = false;

function formatCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

function formatDateLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderVideoCard(item) {
  const hue = Number.parseInt(item.id, 10) % 360 || 200;
  const coverSrc = mediaSrcForCover(item.cover);
  const cover = coverSrc
    ? `<img class="video-card__cover-img" src="${escapeHtml(coverSrc)}" alt="" loading="lazy" decoding="async" />`
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

function getGridEl() {
  return document.getElementById('home-feed-grid');
}

function getCategoryStripEl() {
  return document.getElementById('home-category-strip');
}

function getCategoryListEl() {
  return document.getElementById('home-category-list');
}

function syncCategoryStripVisible() {
  const strip = getCategoryStripEl();
  if (strip) strip.hidden = activeHomeTab !== 'category';
}

function renderCategoryStrip() {
  const list = getCategoryListEl();
  if (!list) return;
  if (categories.length === 0) {
    list.innerHTML = '<p class="home-category-strip__hint">正在加载分区…</p>';
    return;
  }
  list.innerHTML = categories
    .map(
      (cat) =>
        `<button type="button" class="home-category-strip__item ${cat.id === selectedCategoryId ? 'is-active' : ''}" data-home-category="${cat.id}">${escapeHtml(cat.name)}</button>`,
    )
    .join('');
}

async function ensureCategories() {
  if (categoriesLoaded && categories.length > 0) {
    renderCategoryStrip();
    return;
  }
  renderCategoryStrip();
  categories = await fetchCategories();
  categoriesLoaded = true;
  renderCategoryStrip();
  if (selectedCategoryId == null && categories.length > 0) {
    selectedCategoryId = categories[0].id;
    renderCategoryStrip();
  }
}

function resetFeedState() {
  shownItems = [];
  hasMore = true;
  recommendRequestSize = PAGE_SIZE;
  hotFilteredCache = null;
  hotShownCount = 0;
  categoryRequestSize = PAGE_SIZE;
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

function getScrollPrefetchLead(clientHeight) {
  return Math.max(SCROLL_PREFETCH_MIN_PX, clientHeight * SCROLL_PREFETCH_VIEWPORT_RATIO);
}

function shouldPrefetchMore(main) {
  const { scrollTop, clientHeight, scrollHeight } = main;
  const distanceToEnd = scrollHeight - (scrollTop + clientHeight);
  return distanceToEnd <= getScrollPrefetchLead(clientHeight);
}

function schedulePrefetchCheck() {
  requestAnimationFrame(() => {
    if (!isHomePageVisible() || !hasMore || loading) return;
    const main = document.getElementById('main-content');
    if (!main || !shouldPrefetchMore(main)) return;
    void loadMoreHomeFeed().then(() => schedulePrefetchCheck());
  });
}

/**
 * @param {number} categoryId
 * @param {boolean} [replaceGrid]
 */
async function loadCategoryContents(categoryId, replaceGrid = true) {
  selectedCategoryId = categoryId;
  renderCategoryStrip();
  if (replaceGrid) {
    categoryRequestSize = PAGE_SIZE;
    shownItems = [];
    hasMore = true;
    setGridLoading();
  }
  const size = Math.min(categoryRequestSize, MAX_CATEGORY_SIZE);
  const items = await fetchRecommendByCategory(categoryId, size);
  if (items.length === 0) {
    hasMore = false;
    if (replaceGrid) {
      setGridHtml('<p class="home-feed__empty">该分区暂无内容</p>');
    }
    return;
  }
  if (replaceGrid) {
    setGridHtml(items.map((item) => renderVideoCard(item)).join(''));
    shownItems = [...items];
  } else {
    const seen = new Set(shownItems.map((item) => item.id));
    const newItems = items.filter((item) => !seen.has(item.id));
    if (newItems.length === 0) {
      hasMore = false;
      return;
    }
    appendVideoCards(newItems);
  }
  hasMore = categoryRequestSize < MAX_CATEGORY_SIZE && items.length >= size;
}

/**
 * @param {HomeTabId} [tabId]
 */
export async function loadHomeFeed(tabId = activeHomeTab) {
  if (loading) return;
  activeHomeTab = tabId;
  syncCategoryStripVisible();
  resetFeedState();
  loading = true;
  setStatus('');

  try {
    if (tabId === 'category') {
      setGridLoading();
      await ensureCategories();
      if (categories.length === 0) {
        setGridHtml('<p class="home-feed__empty">暂无分区</p>');
        hasMore = false;
        return;
      }
      if (selectedCategoryId == null) {
        selectedCategoryId = categories[0].id;
        renderCategoryStrip();
      }
      await loadCategoryContents(selectedCategoryId, true);
      return;
    }

    setGridLoading();

    if (tabId === 'hot') {
      const items = await fetchHotList();
      hotFilteredCache = items;
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
    if (items.length === 0) {
      hasMore = false;
      setGridHtml('<p class="home-feed__empty">暂无内容</p>');
      return;
    }
    recommendRequestSize = PAGE_SIZE;
    hasMore = true;
    setGridHtml(items.map((item) => renderVideoCard(item)).join(''));
    shownItems = [...items];
  } catch (err) {
    const message = err instanceof Error ? err.message : '加载失败';
    setGridHtml('');
    setStatus(message, true);
    hasMore = false;
  } finally {
    loading = false;
    schedulePrefetchCheck();
  }
}

export async function loadMoreHomeFeed() {
  if (loading || !hasMore || !isHomePageVisible()) return;

  loading = true;
  setLoadMoreIndicator(true);

  try {
    if (activeHomeTab === 'category') {
      if (selectedCategoryId == null) {
        hasMore = false;
        return;
      }
      if (categoryRequestSize >= MAX_CATEGORY_SIZE) {
        hasMore = false;
        return;
      }
      categoryRequestSize += PAGE_SIZE;
      await loadCategoryContents(selectedCategoryId, false);
      return;
    }

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
    const seen = new Set(shownItems.map((item) => item.id));
    const newItems = items.filter((item) => !seen.has(item.id));

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
    schedulePrefetchCheck();
  }
}

function onMainContentScroll() {
  if (!isHomePageVisible() || !hasMore || loading) return;
  const main = document.getElementById('main-content');
  if (!main || !shouldPrefetchMore(main)) return;
  void loadMoreHomeFeed();
}

function onCategoryStripClick(event) {
  const btn = /** @type {HTMLElement} */ (event.target).closest('[data-home-category]');
  if (!btn) return;
  const id = Number.parseInt(btn.getAttribute('data-home-category') ?? '', 10);
  if (!Number.isFinite(id) || id === selectedCategoryId || loading) return;
  loading = true;
  resetFeedState();
  void loadCategoryContents(id, true)
    .catch((err) => {
      setStatus(err instanceof Error ? err.message : '加载失败', true);
    })
    .finally(() => {
      loading = false;
      schedulePrefetchCheck();
    });
}

export function getActiveHomeTab() {
  return activeHomeTab;
}

export function bindHomeFeed() {
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.getAttribute('data-tab');
      if (id === 'recommend' || id === 'hot' || id === 'category') {
        loadHomeFeed(/** @type {HomeTabId} */ (id));
      }
    });
  });

  if (!categoryStripBound) {
    categoryStripBound = true;
    getCategoryListEl()?.addEventListener('click', onCategoryStripClick);
  }

  document.querySelector('.btn-refresh')?.addEventListener('click', () => {
    if (activeHomeTab === 'category' && selectedCategoryId != null) {
      categoryRequestSize = PAGE_SIZE;
      void loadCategoryContents(selectedCategoryId, true);
      return;
    }
    loadHomeFeed(activeHomeTab);
  });

  document.getElementById('main-content')?.addEventListener('scroll', onMainContentScroll, {
    passive: true,
  });

  document.getElementById('home-feed-grid')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const card = target.closest('.video-card');
    if (!card) return;
    const id = card.getAttribute('data-content-id');
    const type = Number(card.getAttribute('data-content-type'));
    if (!id || type !== 1) return;
    const titleEl = card.querySelector('.video-card__title');
    const authorEl = card.querySelector('.video-card__sub span');
    void openVideoDetail({
      id,
      title: titleEl?.textContent?.trim() ?? '',
      cover: null,
      author: authorEl?.textContent?.trim() ?? '',
      authorId: null,
      authorAvatar: null,
      type: 1,
      views: 0,
      comments: 0,
      createdAt: null,
    });
  });

  syncCategoryStripVisible();
  loadHomeFeed('recommend');
}
