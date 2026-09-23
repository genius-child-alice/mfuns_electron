import { materialIcon, videoPlayCountIcon, viewCountIcon } from './icons.js';
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
import { getScrollTop, registerPageNavigation, restoreScrollTop } from './navigation.js';
import { videoGridSkeletonHtml } from './skeleton-ui.js';

/** @typedef {'recommend' | 'hot' | 'category'} HomeTabId */

/** 与 `fetchRecommendList` 默认及官方客户端首屏一致 */
const PAGE_SIZE = 24;
const RECOMMEND_SIZE_STEP = PAGE_SIZE;
/** 与动态页一致：接近底部再加载 */
const SCROLL_LOAD_MORE_PX = 320;

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

/** @type {import('./content-api.js').CategoryNode[]} */
let categories = [];

let categoriesLoaded = false;

/** @type {number | null} */
let selectedParentCategoryId = null;

/** @type {number | null} */
let selectedCategoryId = null;

let categoryRecommendSize = PAGE_SIZE;

let categoryStripBound = false;

let homeFeedBound = false;

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

/**
 * 与 Flutter 首页热门一致：按播放量降序。
 * @param {import('./content-api.js').ContentPreview[]} items
 */
function sortHotRankings(items) {
  return [...items].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
}

/**
 * @param {import('./content-api.js').ContentPreview} item
 * @param {number} rank
 */
export function renderHotRankingCard(item, rank) {
  const coverSrc = mediaSrcForCover(item.cover);
  const cover = coverSrc
    ? `<img class="home-hot-rank-card__cover" src="${escapeHtml(coverSrc)}" alt="" loading="lazy" decoding="async" />`
    : `<div class="home-hot-rank-card__cover home-hot-rank-card__cover--ph" aria-hidden="true"></div>`;
  const rankClass =
    rank <= 3 ? ' home-hot-rank-card__rank home-hot-rank-card__rank--top' : ' home-hot-rank-card__rank';

  return `
    <article class="home-hot-rank-card video-card" data-content-id="${escapeHtml(item.id)}" data-content-type="${item.type}">
      <span class="${rankClass.trim()}" aria-label="第 ${rank} 名">${rank}</span>
      <div class="home-hot-rank-card__media">${cover}</div>
      <div class="home-hot-rank-card__body">
        <h3 class="home-hot-rank-card__title video-card__title">${escapeHtml(item.title)}</h3>
        <p class="home-hot-rank-card__stats video-card__sub">
          <span>${formatCount(item.likes)} 赞 · ${formatCount(item.comments)} 评论 · ${formatCount(item.views)} 浏览</span>
        </p>
      </div>
    </article>`;
}

export function renderVideoCard(item) {
  const hue = Number.parseInt(item.id, 10) % 360 || 200;
  const coverSrc = mediaSrcForCover(item.cover);
  const cover = coverSrc
    ? `<img class="video-card__cover-img" src="${escapeHtml(coverSrc)}" alt="" loading="lazy" decoding="async" />`
    : `<div class="video-card__cover" style="--ph: ${hue}"></div>`;
  const dateLabel = formatDateLabel(item.createdAt);
  const durationLabel = item.type === 1 ? formatVideoDuration(item.duration) : '';
  const viewsIcon =
    item.type === 1
      ? videoPlayCountIcon('video-card__stat-icon')
      : viewCountIcon('video-card__stat-icon');

  return `
    <article class="video-card" data-content-id="${escapeHtml(item.id)}" data-content-type="${item.type}">
      <div class="video-card__cover-wrap">
        ${cover}
        <div class="video-card__stats">
          <div class="video-card__stats-left">
            <span class="video-card__stat">${viewsIcon}${formatCount(item.views)}</span>
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
  syncHomeFeedGridLayout();
}

function syncHomeFeedGridLayout() {
  const isHotTab = activeHomeTab === 'hot';
  getGridEl()?.classList.toggle('content-grid--hot-rank', isHotTab);
  document.getElementById('main-content')?.classList.toggle('content--home-hot', isHotTab);
}

function setHotGridLoading() {
  const rows = Array.from({ length: 8 }, () => '<div class="home-hot-rank-card home-hot-rank-card--skeleton" aria-hidden="true"></div>');
  setGridHtml(rows.join(''));
}

/**
 * @param {import('./content-api.js').ContentPreview[]} items
 */
function renderHomeFeedItems(items) {
  if (activeHomeTab === 'hot') {
    setGridHtml(items.map((item, index) => renderHotRankingCard(item, index + 1)).join(''));
    return;
  }
  setGridHtml(items.map((item) => renderVideoCard(item)).join(''));
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
  setGridHtml(videoGridSkeletonHtml(12));
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

function shouldLoadMoreOnScroll(main) {
  const { scrollTop, clientHeight, scrollHeight } = main;
  const distanceToEnd = scrollHeight - (scrollTop + clientHeight);
  return distanceToEnd <= SCROLL_LOAD_MORE_PX;
}

function schedulePrefetchCheck() {
  requestAnimationFrame(() => {
    if (!isHomePageVisible() || !hasMore || loading) return;
    const main = document.getElementById('main-content');
    if (!main || !shouldLoadMoreOnScroll(main)) return;
    void loadMoreHomeFeed().then(() => schedulePrefetchCheck());
  });
}

/**
 * @param {number} categoryId
 * @param {'replace' | 'append'} [mode]
 * @param {number} [gen]
 */
async function loadCategoryContents(categoryId, mode = 'replace', gen = feedLoadGen) {
  const previousCategoryId = selectedCategoryId;
  selectedCategoryId = categoryId;
  renderCategoryStrip();
  syncCategoryStripVisible();

  const switchingCategory =
    previousCategoryId == null || previousCategoryId !== categoryId;
  if (mode === 'replace' && switchingCategory) {
    categoryRecommendSize = PAGE_SIZE;
    shownItems = [];
    hasMore = true;
    setGridLoading();
  }

  if (mode === 'append') {
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
    hasMore = true;
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
  hasMore = items.length > 0;
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

    if (tabId === 'hot') {
      setHotGridLoading();
    } else {
      setGridLoading();
    }

    if (tabId === 'hot') {
      const items = sortHotRankings(await fetchHotList());
      if (!isFeedLoadCurrent(gen)) return;
      hasMore = false;
      if (items.length === 0) {
        setGridHtml('<p class="home-feed__empty">暂无内容</p>');
        shownItems = [];
        return;
      }
      shownItems = [...items];
      renderHomeFeedItems(shownItems);
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
    hasMore = items.length > 0;
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
      hasMore = false;
      return;
    }

    recommendRequestSize += RECOMMEND_SIZE_STEP;
    const items = await fetchRecommendList(recommendRequestSize);
    if (!isFeedLoadCurrent(gen)) return;
    const seen = new Set(shownItems.map((item) => `${item.type}:${item.id}`));
    const newItems = items.filter((item) => !seen.has(`${item.type}:${item.id}`));

    if (newItems.length === 0) {
      hasMore = false;
      return;
    }

    appendVideoCards(newItems);
    hasMore = true;
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
  if (!main || !shouldLoadMoreOnScroll(main)) return;
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
    renderHomeFeedItems(shownItems);
  }
  restoreScrollTop('main-content', state.scrollTop ?? 0);
  schedulePrefetchCheck();
}

export function bindHomeFeed() {
  if (homeFeedBound) return;
  homeFeedBound = true;

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

  document.getElementById('home-category-open-list')?.addEventListener('click', () => {
    if (selectedCategoryId == null) return;
    void import('./category-list-page.js').then((mod) =>
      mod.openCategoryListPage({
        categoryId: selectedCategoryId,
        categoryName: selectedCategoryLabel(),
      }),
    );
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
