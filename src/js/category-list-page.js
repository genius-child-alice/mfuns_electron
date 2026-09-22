import { materialIcon } from './icons.js';
import { fetchCategoryListPage } from './content-api.js';
import { openContentDetail, previewFromCard } from './content-nav.js';
import { getCurrentPage } from './pages.js';
import {
  getScrollTop,
  navigateBack,
  navigateTo,
  registerPageNavigation,
  restoreScrollTop,
} from './navigation.js';
import { renderVideoCard } from './home-feed.js';
import { videoGridSkeletonHtml } from './skeleton-ui.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

const PAGE_SIZE = 20;
const SCROLL_PREFETCH_MIN_PX = 480;

let categoryId = 0;
let categoryName = '';
let page = 1;
let loading = false;
let hasMore = true;
/** @type {ContentPreview[]} */
let shownItems = [];
let bound = false;

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getGridEl() {
  return document.getElementById('category-list-grid');
}

function getScrollEl() {
  return document.getElementById('category-list-scroll');
}

function setStatus(message = '', isError = false) {
  const el = document.getElementById('category-list-status');
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

function syncTitle() {
  const title = document.getElementById('category-list-title');
  if (title) title.textContent = categoryName || '分区稿件';
}

async function loadPage(nextPage, mode = 'replace') {
  if (loading || categoryId <= 0) return;
  loading = true;
  setStatus('');
  const grid = getGridEl();
  if (mode === 'replace' && grid) {
    grid.innerHTML = videoGridSkeletonHtml(12);
  }

  try {
    const { items, hasNext } = await fetchCategoryListPage(categoryId, nextPage, PAGE_SIZE);
    page = nextPage;
    hasMore = hasNext;
    if (mode === 'replace') {
      shownItems = [...items];
      if (shownItems.length === 0) {
        if (grid) grid.innerHTML = '<p class="home-feed__empty">该分区暂无稿件</p>';
        hasMore = false;
        return;
      }
      if (grid) grid.innerHTML = shownItems.map((item) => renderVideoCard(item)).join('');
      return;
    }
    if (items.length === 0) {
      hasMore = false;
      return;
    }
    const seen = new Set(shownItems.map((item) => `${item.type}:${item.id}`));
    const fresh = items.filter((item) => !seen.has(`${item.type}:${item.id}`));
    shownItems.push(...fresh);
    if (grid) {
      grid.insertAdjacentHTML('beforeend', fresh.map((item) => renderVideoCard(item)).join(''));
    }
    hasMore = hasNext;
  } catch (err) {
    setStatus(err instanceof Error ? err.message : '加载失败', true);
    if (mode === 'replace' && grid) grid.innerHTML = '';
    hasMore = false;
  } finally {
    loading = false;
  }
}

function onScroll() {
  if (loading || !hasMore || getCurrentPage() !== 'category-list') return;
  const main = getScrollEl();
  if (!main) return;
  const distance = main.scrollHeight - (main.scrollTop + main.clientHeight);
  if (distance > SCROLL_PREFETCH_MIN_PX) return;
  void loadPage(page + 1, 'append');
}

/**
 * @param {{ categoryId?: number, categoryName?: string }} params
 */
export async function openCategoryListPage(params) {
  const id = Number(params.categoryId);
  if (!Number.isFinite(id) || id <= 0) return;
  await navigateTo('category-list', {
    categoryId: Math.trunc(id),
    categoryName: `${params.categoryName ?? ''}`.trim(),
  });
}

export function bindCategoryListPage() {
  if (bound) return;
  bound = true;

  document.getElementById('category-list-back')?.addEventListener('click', () => {
    void navigateBack();
  });

  document.getElementById('category-list-refresh')?.addEventListener('click', () => {
    hasMore = true;
    void loadPage(1, 'replace');
  });

  getGridEl()?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const card = target.closest('.video-card');
    if (!card) return;
    const preview = previewFromCard(card);
    if (!preview || (preview.type !== 0 && preview.type !== 1)) return;
    void openContentDetail(preview);
  });

  getScrollEl()?.addEventListener('scroll', onScroll, { passive: true });

  registerPageNavigation('category-list', {
    enter: async (params) => {
      const id = Number(params?.categoryId);
      categoryId = Number.isFinite(id) ? Math.trunc(id) : 0;
      categoryName = `${params?.categoryName ?? ''}`.trim();
      syncTitle();
      page = 1;
      hasMore = true;
      shownItems = [];
      await loadPage(1, 'replace');
    },
    capture: () => ({
      categoryId,
      categoryName,
      page,
      hasMore,
      shownItems,
      scrollTop: getScrollTop('category-list-scroll'),
    }),
    restore: (state) => {
      categoryId = Number(state.categoryId) || 0;
      categoryName = `${state.categoryName ?? ''}`;
      page = Number(state.page) || 1;
      hasMore = state.hasMore !== false;
      shownItems = /** @type {ContentPreview[]} */ (state.shownItems ?? []);
      syncTitle();
      const grid = getGridEl();
      if (grid) {
        grid.innerHTML =
          shownItems.length === 0
            ? '<p class="home-feed__empty">暂无内容</p>'
            : shownItems.map((item) => renderVideoCard(item)).join('');
      }
      restoreScrollTop('category-list-scroll', Number(state.scrollTop) || 0);
    },
  });
}
