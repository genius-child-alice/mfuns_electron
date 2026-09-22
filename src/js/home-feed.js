import { materialIcon, viewCountIcon } from './icons.js';
import {
  childCategoryNodes,
  fetchCategories,
  fetchHotList,
  fetchRecommendByCategory,
  fetchRecommendList,
  formatVideoDuration,
  mediaSrcForCover,
  rootCategoryNodes,
} from './content-api.js';
import { openContentDetail, previewFromCard } from './content-nav.js';
import { openCategoryListPage } from './category-list-page.js';
import { getScrollTop, registerPageNavigation, restoreScrollTop } from './navigation.js';

/** @typedef {'recommend' | 'hot' | 'category'} HomeTabId */

const PAGE_SIZE = 20;
const RECOMMEND_SIZE_STEP = PAGE_SIZE;
const MAX_RECOMMEND_SIZE = 200;
const MAX_CATEGORY_ITEMS = 100;
const CATEGORY_FETCH_SIZE = 20;
const SCROLL_PREFETCH_MIN_PX = 560;
const SCROLL_PREFETCH_VIEWPORT_RATIO = 1.5;

/** @type {HomeTabId} */
let activeHomeTab = 'recommend';

let loading = false;

/** 递增后用于丢弃过期的首页 feed 请求，避免加载中被误拦或旧响应覆盖新 Tab */
let feedLoadGen = 0;

function startFeedLoad() {
  return ++feedLoadGen;
}

/** @param {number} gen */
function isFeedLoadCurrent(gen) {
  return gen === feedLoadGen;
}

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
let selectedParentCategoryId = null;

/** @type {number | null} */
let selectedCategoryId = null;

let categoryRecommendSize = PAGE_SIZE;

let categoryStripBound = false;

/**
 * @param {import('./content-api.js').CategoryNode[]} all
 */
function syncCategorySelection(all) {
  const roots = rootCategoryNodes(all);
  if (roots.length === 0) return;

  const current = selectedCategoryId != null ? all.find((node) => node.id === selectedCategoryId) : null;
  if (current != null) {
    if (current.parentId != null && current.parentId !== 0) {
      selectedParentCategoryId = current.parentId;
    } else {
      selectedParentCategoryId = current.id;
    }
  } else if (
    selectedParentCategoryId == null ||
    !roots.some((node) => node.id === selectedParentCategoryId)
  ) {
    selectedParentCategoryId = roots[0].id;
  }

  const subs = childCategoryNodes(all, selectedParentCategoryId);
  if (subs.length === 0) {
    selectedCategoryId = selectedParentCategoryId;
    return;
  }
  if (selectedCategoryId == null || !subs.some((node) => node.id === selectedCategoryId)) {
    selectedCategoryId = subs[0].id;
  }
}

function renderCategoryChip(cat, active, attrName) {
  return `<button type="button" class="home-category-strip__item ${active ? 'is-active' : ''}" ${attrName}="${cat.id}">${escapeHtml(cat.name)}</button>`;
}

/**
 * 与 Flutter `AppController.mergeRecommendations` 一致：新内容在前、去重、上限 100。
 * @param {import('./content-api.js').ContentPreview[]} fresh
 * @param {import('./content-api.js').ContentPreview[]} existing
 */
function mergeRecommendations(fresh, existing) {
  const seen = new Set();
  /** @type {import('./content-api.js').ContentPreview[]} */
  const merged = [];
  for (const item of [...fresh, ...existing]) {
    const key = `${item.type}:${item.id}`;
    if (!item.id || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.length > MAX_CATEGORY_ITEMS ? merged.slice(0, MAX_CATEGORY_ITEMS) : merged;
}

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
  const durationLabel = item.type === 1 ? formatVideoDuration(item.duration) : '';

  return `
    <article class="video-card" data-content-id="${escapeHtml(item.id)}" data-content-type="${item.type}">
      <div class="video-card__cover-wrap">
        ${cover}
        <div class="video-card__stats">
          <div class="video-card__stats-left">
            <span class="video-card__stat">${viewCountIcon('video-card__stat-icon')}${formatCount(item.views)}</span>
            <span class="video-card__stat">${materialIcon('chat_bubble', 'video-card__stat-icon')}${formatCount(item.comments)}</span>
          </div>
          ${durationLabel ? `<span class="video-card__duration">${escapeHtml(durationLabel)}</span>` : ''}
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

function getCategoryParentListEl() {
  return document.getElementById('home-category-parent-list');
}

function getCategoryChildListEl() {
  return document.getElementById('home-category-child-list');
}

function syncCategoryStripVisible() {
  const isCategoryTab = activeHomeTab === 'category';
  const strip = getCategoryStripEl();
  if (strip) strip.hidden = !isCategoryTab;
  const openListBtn = document.getElementById('home-category-open-list');
  if (openListBtn) openListBtn.hidden = !isCategoryTab || selectedCategoryId == null;
  document.getElementById('main-content')?.classList.toggle('content--home-category', isCategoryTab);
}

function selectedCategoryLabel() {
  if (selectedCategoryId == null) return '';
  const node = categories.find((item) => item.id === selectedCategoryId);
  return node?.name ?? '';
}

function renderCategoryStrip() {
  const parentList = getCategoryParentListEl();
  const childList = getCategoryChildListEl();
  if (!parentList || !childList) return;
  if (categories.length === 0) {
    parentList.innerHTML = '<p class="home-category-strip__hint">正在加载分区…</p>';
    childList.innerHTML = '';
    return;
  }

  syncCategorySelection(categories);
  const roots = rootCategoryNodes(categories);
  const subs =
    selectedParentCategoryId != null
      ? childCategoryNodes(categories, selectedParentCategoryId)
      : [];

  parentList.innerHTML = roots
    .map((cat) =>
      renderCategoryChip(cat, cat.id === selectedParentCategoryId, 'data-home-parent'),
    )
    .join('');

  if (subs.length === 0) {
    childList.innerHTML = '<p class="home-category-strip__hint">暂无小分区</p>';
    return;
  }

  childList.innerHTML = subs
    .map((cat) => renderCategoryChip(cat, cat.id === selectedCategoryId, 'data-home-category'))
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
  syncCategorySelection(categories);
  renderCategoryStrip();
}

function resetFeedState() {
  shownItems = [];
  hasMore = true;
  recommendRequestSize = PAGE_SIZE;
  hotFilteredCache = null;
  hotShownCount = 0;
  categoryRecommendSize = PAGE_SIZE;
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
 * @param {'replace' | 'append' | 'merge'} [mode]
 * @param {number} [gen]
 */
async function loadCategoryContents(categoryId, mode = 'replace', gen = feedLoadGen) {
  const previousCategoryId = selectedCategoryId;
  selectedCategoryId = categoryId;
  renderCategoryStrip();
  syncCategoryStripVisible();

  if (mode === 'merge') {
    const fresh = await fetchRecommendByCategory(categoryId, CATEGORY_FETCH_SIZE);
    if (!isFeedLoadCurrent(gen)) return;
    if (fresh.length === 0) return;
    shownItems = mergeRecommendations(fresh, shownItems);
    setGridHtml(shownItems.map((item) => renderVideoCard(item)).join(''));
    return;
  }

  const switchingCategory =
    previousCategoryId == null || previousCategoryId !== categoryId;
  if (mode === 'replace' && switchingCategory) {
    categoryRecommendSize = PAGE_SIZE;
    shownItems = [];
    hasMore = true;
    setGridLoading();
  }

  if (mode === 'append') {
    if (categoryRecommendSize >= MAX_RECOMMEND_SIZE) {
      hasMore = false;
      return;
    }
    categoryRecommendSize += RECOMMEND_SIZE_STEP;
    const items = await fetchRecommendByCategory(categoryId, categoryRecommendSize);
    if (!isFeedLoadCurrent(gen)) return;
    const seen = new Set(shownItems.map((item) => `${item.type}:${item.id}`));
    const newItems = items.filter((item) => !seen.has(`${item.type}:${item.id}`));
    if (newItems.length === 0) {
      hasMore = false;
      return;
    }
    appendVideoCards(newItems);
    hasMore = categoryRecommendSize < MAX_RECOMMEND_SIZE;
    return;
  }

  const items = await fetchRecommendByCategory(categoryId, PAGE_SIZE);
  if (!isFeedLoadCurrent(gen)) return;
  categoryRecommendSize = PAGE_SIZE;
  if (items.length === 0) {
    hasMore = false;
    if (switchingCategory) {
      setGridHtml('<p class="home-feed__empty">该分区暂无内容</p>');
    }
    return;
  }

  shownItems = [...items];
  setGridHtml(shownItems.map((item) => renderVideoCard(item)).join(''));
  hasMore = categoryRecommendSize < MAX_RECOMMEND_SIZE;
}

async function refreshRecommendMerge() {
  if (loading) return;
  const gen = startFeedLoad();
  loading = true;
  setStatus('');
  try {
    const fresh = await fetchRecommendList(CATEGORY_FETCH_SIZE);
    if (!isFeedLoadCurrent(gen)) return;
    if (fresh.length === 0) return;
    shownItems = mergeRecommendations(fresh, shownItems);
    setGridHtml(shownItems.map((item) => renderVideoCard(item)).join(''));
    hasMore = recommendRequestSize < MAX_RECOMMEND_SIZE;
  } catch (err) {
    const message = err instanceof Error ? err.message : '刷新失败';
    setStatus(message, true);
  } finally {
    if (isFeedLoadCurrent(gen)) {
      loading = false;
      schedulePrefetchCheck();
    }
  }
}

/**
 * @param {HomeTabId} [tabId]
 */
export async function loadHomeFeed(tabId = activeHomeTab) {
  if (loading && tabId === activeHomeTab) return;
  const gen = startFeedLoad();
  activeHomeTab = tabId;
  syncTopbarHomeTabs();
  syncCategoryStripVisible();
  resetFeedState();
  loading = true;
  setStatus('');

  try {
    if (tabId === 'category') {
      setGridLoading();
      await ensureCategories();
      if (!isFeedLoadCurrent(gen)) return;
      if (categories.length === 0) {
        setGridHtml('<p class="home-feed__empty">暂无分区</p>');
        hasMore = false;
        return;
      }
      syncCategorySelection(categories);
      renderCategoryStrip();
      if (selectedCategoryId == null) {
        hasMore = false;
        setGridHtml('<p class="home-feed__empty">暂无分区</p>');
        return;
      }
      await loadCategoryContents(selectedCategoryId, 'replace', gen);
      return;
    }

    setGridLoading();

    if (tabId === 'hot') {
      const items = await fetchHotList();
      if (!isFeedLoadCurrent(gen)) return;
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
    if (!isFeedLoadCurrent(gen)) return;
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
    if (isFeedLoadCurrent(gen)) {
      loading = false;
      schedulePrefetchCheck();
    }
  }
}

export async function loadMoreHomeFeed() {
  if (loading || !hasMore || !isHomePageVisible()) return;

  const gen = feedLoadGen;
  loading = true;
  setLoadMoreIndicator(true);

  try {
    if (activeHomeTab === 'category') {
      if (selectedCategoryId == null) {
        hasMore = false;
        return;
      }
      await loadCategoryContents(selectedCategoryId, 'append', gen);
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
    if (!isFeedLoadCurrent(gen)) return;
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
    if (isFeedLoadCurrent(gen)) {
      loading = false;
      removeLoadMoreIndicator();
      schedulePrefetchCheck();
    }
  }
}

function onMainContentScroll() {
  if (!isHomePageVisible() || !hasMore || loading) return;
  const main = document.getElementById('main-content');
  if (!main || !shouldPrefetchMore(main)) return;
  void loadMoreHomeFeed();
}

function onCategoryStripClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const parentBtn = target.closest('[data-home-parent]');
  if (parentBtn) {
    const parentId = Number.parseInt(parentBtn.getAttribute('data-home-parent') ?? '', 10);
    if (!Number.isFinite(parentId) || parentId === selectedParentCategoryId) return;
    selectedParentCategoryId = parentId;
    const subs = childCategoryNodes(categories, parentId);
    const nextCategoryId = subs[0]?.id ?? parentId;
    if (nextCategoryId === selectedCategoryId) {
      renderCategoryStrip();
      return;
    }
    const gen = startFeedLoad();
    loading = true;
    resetFeedState();
    void loadCategoryContents(nextCategoryId, 'replace', gen)
      .catch((err) => {
        if (!isFeedLoadCurrent(gen)) return;
        setStatus(err instanceof Error ? err.message : '加载失败', true);
      })
      .finally(() => {
        if (isFeedLoadCurrent(gen)) {
          loading = false;
          schedulePrefetchCheck();
        }
      });
    return;
  }

  const btn = target.closest('[data-home-category]');
  if (!btn) return;
  const id = Number.parseInt(btn.getAttribute('data-home-category') ?? '', 10);
  if (!Number.isFinite(id) || id === selectedCategoryId) return;
  const gen = startFeedLoad();
  loading = true;
  resetFeedState();
  void loadCategoryContents(id, 'replace', gen)
    .catch((err) => {
      if (!isFeedLoadCurrent(gen)) return;
      setStatus(err instanceof Error ? err.message : '加载失败', true);
    })
    .finally(() => {
      if (isFeedLoadCurrent(gen)) {
        loading = false;
        schedulePrefetchCheck();
      }
    });
}

export function getActiveHomeTab() {
  return activeHomeTab;
}

function syncTopbarHomeTabs() {
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    const id = tab.getAttribute('data-tab');
    tab.classList.toggle('is-active', id === activeHomeTab);
  });
}

export function captureHomeFeedState() {
  return {
    activeHomeTab,
    shownItems,
    hasMore,
    recommendRequestSize,
    hotFilteredCache,
    hotShownCount,
    categories,
    categoriesLoaded,
    selectedParentCategoryId,
    selectedCategoryId,
    categoryRecommendSize,
    loading,
    scrollTop: getScrollTop('main-content'),
  };
}

/**
 * @param {ReturnType<typeof captureHomeFeedState>} state
 */
export function restoreHomeFeedState(state) {
  activeHomeTab = state.activeHomeTab ?? 'recommend';
  shownItems = state.shownItems ?? [];
  hasMore = state.hasMore ?? true;
  recommendRequestSize = state.recommendRequestSize ?? PAGE_SIZE;
  hotFilteredCache = state.hotFilteredCache ?? null;
  hotShownCount = state.hotShownCount ?? 0;
  categories = state.categories ?? [];
  categoriesLoaded = state.categoriesLoaded ?? false;
  selectedParentCategoryId = state.selectedParentCategoryId ?? null;
  selectedCategoryId = state.selectedCategoryId ?? null;
  categoryRecommendSize = state.categoryRecommendSize ?? PAGE_SIZE;
  loading = false;

  syncTopbarHomeTabs();
  syncCategoryStripVisible();
  if (categoriesLoaded && categories.length > 0) {
    renderCategoryStrip();
  }
  if (shownItems.length === 0) {
    setGridHtml('<p class="home-feed__empty">暂无内容</p>');
  } else {
    setGridHtml(shownItems.map((item) => renderVideoCard(item)).join(''));
  }
  restoreScrollTop('main-content', state.scrollTop ?? 0);
  schedulePrefetchCheck();
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
    getCategoryStripEl()?.addEventListener('click', onCategoryStripClick);
  }

  document.querySelector('.btn-refresh')?.addEventListener('click', () => {
    if (activeHomeTab === 'category' && selectedCategoryId != null) {
      void loadCategoryContents(selectedCategoryId, 'merge');
      return;
    }
    if (activeHomeTab === 'recommend') {
      void refreshRecommendMerge();
      return;
    }
    loadHomeFeed(activeHomeTab);
  });

  document.getElementById('home-category-open-list')?.addEventListener('click', () => {
    if (selectedCategoryId == null) return;
    void openCategoryListPage({
      categoryId: selectedCategoryId,
      categoryName: selectedCategoryLabel(),
    });
  });

  document.getElementById('main-content')?.addEventListener('scroll', onMainContentScroll, {
    passive: true,
  });

  document.getElementById('home-feed-grid')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const card = target.closest('.video-card');
    if (!card) return;
    const preview = previewFromCard(card);
    if (!preview || (preview.type !== 0 && preview.type !== 1)) return;
    void openContentDetail(preview);
  });

  syncCategoryStripVisible();
  loadHomeFeed('recommend');

  registerPageNavigation('home', {
    capture: () => captureHomeFeedState(),
    restore: (state) => {
      restoreHomeFeedState(/** @type {ReturnType<typeof captureHomeFeedState>} */ (state));
    },
    enter: async () => {
      syncCategoryStripVisible();
      syncTopbarHomeTabs();
      if (shownItems.length === 0) {
        await loadHomeFeed(activeHomeTab || 'recommend');
      }
    },
  });
}
