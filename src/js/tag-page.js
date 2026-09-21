import { materialIcon } from './icons.js';
import { openContentDetail, previewFromCard } from './content-nav.js';
import { getCurrentPage, setPage } from './pages.js';
import { renderVideoCard } from './home-feed.js';
import {
  fetchTagArticles,
  fetchTagVideos,
  mergeTagItemsByLatest,
} from './tag-api.js';

/** @typedef {'latest' | 'video' | 'article'} TagTabId */
/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

const SCROLL_PREFETCH_MIN_PX = 480;

/** @type {TagTabId} */
let activeTab = 'latest';

let tagName = '';

/** @type {import('./pages.js').PageId} */
let returnPage = 'home';

let loading = false;

/** @type {ContentPreview[]} */
let shownItems = [];

/** @type {ContentPreview[]} */
let articleItems = [];

/** @type {ContentPreview[]} */
let videoItems = [];

/** @type {number | null} */
let articleCursor = null;

/** @type {number | null} */
let videoCursor = null;

let articleHasMore = true;

let videoHasMore = true;

let bound = false;

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
 * @param {string[]} tags
 */
export function renderTagButtons(tags) {
  return tags
    .map(
      (tag) =>
        `<button type="button" class="watch-tag" data-content-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`,
    )
    .join('');
}

/**
 * @param {HTMLElement} root
 */
export function bindTagButtons(root = document) {
  root.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const btn = target.closest('[data-content-tag]');
    if (!(btn instanceof HTMLElement)) return;
    const tag = btn.getAttribute('data-content-tag');
    if (!tag) return;
    event.preventDefault();
    openTagPlaza(tag);
  });
}

function resetState() {
  shownItems = [];
  articleItems = [];
  videoItems = [];
  articleCursor = null;
  videoCursor = null;
  articleHasMore = true;
  videoHasMore = true;
}

function currentHasMore() {
  if (activeTab === 'article') return articleHasMore;
  if (activeTab === 'video') return videoHasMore;
  return articleHasMore || videoHasMore;
}

function syncHeading() {
  const el = document.getElementById('tag-page-title');
  if (el) {
    el.textContent = tagName ? `#${tagName}` : '标签广场';
  }
}

function syncTabs() {
  document.querySelectorAll('[data-tag-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-tag-tab') === activeTab);
  });
}

function setStatus(message = '', isError = false) {
  const el = document.getElementById('tag-page-status');
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

function setHint(message = '') {
  const el = document.getElementById('tag-page-hint');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function rebuildShownItems() {
  if (activeTab === 'article') {
    shownItems = articleItems;
    return;
  }
  if (activeTab === 'video') {
    shownItems = videoItems;
    return;
  }
  shownItems = mergeTagItemsByLatest(articleItems, videoItems);
}

function renderResults() {
  const grid = document.getElementById('tag-page-grid');
  if (!grid) return;

  if (!shownItems.length) {
    grid.innerHTML = `<p class="tag-page__empty">${tagName ? '该标签下暂无内容' : '选择一个标签开始浏览'}</p>`;
  } else {
    grid.innerHTML = shownItems.map((item) => renderVideoCard(item)).join('');
  }

  if (loading) {
    setHint('加载中…');
  } else if (!currentHasMore()) {
    setHint(shownItems.length ? '没有更多了' : '');
  } else {
    setHint('');
  }
}

/**
 * @param {ContentPreview[]} incoming
 * @param {ContentPreview[]} existing
 */
function appendUnique(incoming, existing) {
  const seen = new Set(existing.map((item) => `${item.type}:${item.id}`));
  const next = [...existing];
  incoming.forEach((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    next.push(item);
  });
  return next;
}

async function loadLatestPage() {
  const tasks = [];
  if (articleHasMore) {
    tasks.push(
      fetchTagArticles(tagName, articleCursor).then((page) => {
        articleItems = appendUnique(page.items, articleItems);
        articleCursor = page.lastId;
        articleHasMore = page.hasMore;
      }),
    );
  }
  if (videoHasMore) {
    tasks.push(
      fetchTagVideos(tagName, videoCursor).then((page) => {
        videoItems = appendUnique(page.items, videoItems);
        videoCursor = page.lastId;
        videoHasMore = page.hasMore;
      }),
    );
  }
  await Promise.all(tasks);
}

async function loadArticlePage() {
  if (!articleHasMore) return;
  const page = await fetchTagArticles(tagName, articleCursor);
  articleItems = appendUnique(page.items, articleItems);
  articleCursor = page.lastId;
  articleHasMore = page.hasMore;
}

async function loadVideoPage() {
  if (!videoHasMore) return;
  const page = await fetchTagVideos(tagName, videoCursor);
  videoItems = appendUnique(page.items, videoItems);
  videoCursor = page.lastId;
  videoHasMore = page.hasMore;
}

async function loadMore() {
  if (!tagName || loading || !currentHasMore()) return;
  loading = true;
  renderResults();
  setStatus('');
  try {
    if (activeTab === 'latest') {
      await loadLatestPage();
    } else if (activeTab === 'article') {
      await loadArticlePage();
    } else {
      await loadVideoPage();
    }
    rebuildShownItems();
    renderResults();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : '加载失败', true);
    renderResults();
  } finally {
    loading = false;
    renderResults();
  }
}

async function reloadTab() {
  resetState();
  rebuildShownItems();
  renderResults();
  await loadMore();
}

function onMainScroll() {
  if (getCurrentPage() !== 'tag' || loading || !currentHasMore()) return;
  const main = document.getElementById('main-content');
  if (!main) return;
  const remaining = main.scrollHeight - main.scrollTop - main.clientHeight;
  if (remaining <= SCROLL_PREFETCH_MIN_PX) {
    void loadMore();
  }
}

function onTabClick(event) {
  const btn = /** @type {HTMLElement} */ (event.target).closest('[data-tag-tab]');
  if (!btn) return;
  const tab = btn.getAttribute('data-tag-tab');
  if (tab !== 'latest' && tab !== 'video' && tab !== 'article') return;
  if (tab === activeTab) return;
  activeTab = tab;
  syncTabs();
  rebuildShownItems();
  renderResults();
  if (!shownItems.length && currentHasMore()) {
    void loadMore();
  }
}

function onResultsClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const card = target.closest('.video-card');
  if (!card) return;
  const preview = previewFromCard(card);
  if (!preview || (preview.type !== 0 && preview.type !== 1)) return;
  void openContentDetail(preview);
}

/**
 * @param {string} tag
 */
export function openTagPlaza(tag) {
  const trimmed = `${tag ?? ''}`.trim();
  if (!trimmed) return;

  const currentPage = getCurrentPage();
  if (currentPage !== 'tag') {
    returnPage = currentPage;
  }

  tagName = trimmed;
  activeTab = 'latest';
  resetState();
  syncHeading();
  syncTabs();
  setPage('tag');
  setStatus('');
  document.getElementById('main-content')?.scrollTo(0, 0);
  void reloadTab();
}

export function closeTagPlaza() {
  setPage(returnPage);
}

export function onTagPageEnter() {
  syncHeading();
  syncTabs();
  renderResults();
}

export function bindTagPage() {
  if (bound) return;
  bound = true;

  document.getElementById('tag-page-back')?.addEventListener('click', closeTagPlaza);
  document.getElementById('tag-page-tabs')?.addEventListener('click', onTabClick);
  document.getElementById('tag-page-grid')?.addEventListener('click', onResultsClick);
  document.getElementById('main-content')?.addEventListener('scroll', onMainScroll, { passive: true });

  document.querySelector('.btn-refresh')?.addEventListener('click', () => {
    if (getCurrentPage() === 'tag' && tagName) {
      void reloadTab();
    }
  });
}
