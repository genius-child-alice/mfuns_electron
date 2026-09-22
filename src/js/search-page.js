import { materialIcon } from './icons.js';
import { openContentDetail, previewFromCard } from './content-nav.js';
import { getCurrentPage } from './pages.js';
import {
  getScrollTop,
  navigateTo,
  registerPageNavigation,
  restoreScrollTop,
} from './navigation.js';
import { renderVideoCard } from './home-feed.js';
import { renderFramedAvatarHtml } from './avatar-frame-ui.js';
import { mediaSrcForCover } from './content-api.js';
import { searchResources, searchUsers } from './search-api.js';
import { openUserSpace } from './user-space.js';
import { searchUserListSkeletonHtml, videoGridSkeletonHtml } from './skeleton-ui.js';

/** @typedef {'all' | 'video' | 'article' | 'user'} SearchTabId */
/** @typedef {import('./user-profile-api.js').UserProfile} UserProfile */
/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

const PAGE_SIZE = 20;

/** 横屏：当前页两侧各展示的页码数量 */
const PAGINATION_SIBLING_COUNT = 5;

/** @type {SearchTabId} */
let activeTab = 'all';

let query = '';

let loading = false;

/** @type {ContentPreview[]} */
let resourceItems = [];

/** @type {UserProfile[]} */
let userItems = [];

let resourcePage = 1;

let userPage = 1;

let resourceTotalPages = 1;

let userTotalPages = 1;

/** @type {number | null} */
let resourceTotalCount = null;

/** @type {number | null} */
let userTotalCount = null;

let resourceHasNext = false;

let userHasNext = false;

let resourceTotalExact = false;

let userTotalExact = false;

let bound = false;

/**
 * @param {SearchTabId} tab
 */
function resourceTypeForTab(tab) {
  if (tab === 'video') return 1;
  if (tab === 'article') return 0;
  return -1;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTopbarSearchInput() {
  return /** @type {HTMLInputElement | null} */ (document.getElementById('topbar-search-input'));
}

function currentPageNumber() {
  return activeTab === 'user' ? userPage : resourcePage;
}

function currentTotalPages() {
  return activeTab === 'user' ? userTotalPages : resourceTotalPages;
}

function currentHasNext() {
  return activeTab === 'user' ? userHasNext : resourceHasNext;
}

/**
 * @param {'resource' | 'user'} kind
 * @param {import('./search-api.js').SearchResourcePage | import('./search-api.js').SearchUserPage} result
 * @param {number} page
 */
function applySearchPagination(kind, result, page) {
  if (kind === 'resource') {
    resourceHasNext = result.hasNext;
    if (result.total != null) resourceTotalCount = result.total;
    if (result.exactTotalPages) {
      resourceTotalPages = result.totalPages;
      resourceTotalExact = true;
    } else if (!resourceTotalExact) {
      resourceTotalPages = result.hasNext ? Math.max(resourceTotalPages, page) : page;
    }
  } else {
    userHasNext = result.hasNext;
    if (result.total != null) userTotalCount = result.total;
    if (result.exactTotalPages) {
      userTotalPages = result.totalPages;
      userTotalExact = true;
    } else if (!userTotalExact) {
      userTotalPages = result.hasNext ? Math.max(userTotalPages, page) : page;
    }
  }
}

/**
 * @param {'resource' | 'user'} kind
 * @param {number} failedPage
 */
function shrinkTotalPagesAfterError(kind, failedPage) {
  if (failedPage <= 1) return;
  const last = failedPage - 1;
  if (kind === 'resource') {
    resourceTotalPages = Math.min(resourceTotalPages, last);
    resourceTotalExact = true;
    resourceHasNext = resourcePage < resourceTotalPages;
  } else {
    userTotalPages = Math.min(userTotalPages, last);
    userTotalExact = true;
    userHasNext = userPage < userTotalPages;
  }
}

/**
 * @param {number} current
 * @param {number} total
 * @returns {(number | 'ellipsis')[]}
 */
function buildPaginationItems(current, total) {
  if (total <= 1) return [1];
  const maxWithoutEllipsis = PAGINATION_SIBLING_COUNT * 2 + 5;
  if (total <= maxWithoutEllipsis) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const delta = PAGINATION_SIBLING_COUNT;
  /** @type {number[]} */
  const range = [];
  for (let i = 1; i <= total; i += 1) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }
  /** @type {(number | 'ellipsis')[]} */
  const items = [];
  let prev = 0;
  for (const pageNum of range) {
    if (prev) {
      if (pageNum - prev === 2) items.push(prev + 1);
      else if (pageNum - prev !== 1) items.push('ellipsis');
    }
    items.push(pageNum);
    prev = pageNum;
  }
  return items;
}

function setStatus(message = '', isError = false) {
  const el = document.getElementById('search-page-status');
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

function syncQueryHeading() {
  const el = document.getElementById('search-page-query');
  if (el) {
    el.textContent = query ? `搜索「${query}」` : '搜索';
  }
}

function syncTabs() {
  document.querySelectorAll('[data-search-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-search-tab') === activeTab);
  });
  const resourcePanel = document.getElementById('search-page-resource');
  const userPanel = document.getElementById('search-page-users');
  const isUser = activeTab === 'user';
  document.getElementById('search-page-sort-hint')?.toggleAttribute('hidden', isUser);
  resourcePanel?.toggleAttribute('hidden', isUser);
  userPanel?.toggleAttribute('hidden', !isUser);
}

function scrollResultsToTop() {
  const main = document.getElementById('main-content');
  if (main) main.scrollTop = 0;
}

function getJumpInput() {
  return /** @type {HTMLInputElement | null} */ (document.getElementById('search-page-jump-input'));
}

function clampJumpInputValue() {
  const input = getJumpInput();
  if (!input || input.value === '') return;
  const totalPages = currentTotalPages();
  const parsed = Number.parseInt(input.value, 10);
  if (!Number.isFinite(parsed)) {
    input.value = '';
    return;
  }
  if (parsed < 1) input.value = '1';
  else if (parsed > totalPages) input.value = String(totalPages);
}

function renderPagination() {
  const pager = document.getElementById('search-page-pager');
  const prevBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('search-page-prev'));
  const nextBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('search-page-next'));
  const pagesEl = document.getElementById('search-page-pager-pages');
  const totalEl = document.getElementById('search-page-pager-total');
  const jumpWrap = document.getElementById('search-page-pager-jump');
  const jumpBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('search-page-jump-btn'));
  if (!pager || !prevBtn || !nextBtn || !pagesEl) return;

  const page = currentPageNumber();
  const totalPages = currentTotalPages();
  const hasNext = currentHasNext();
  const hasResults = activeTab === 'user' ? userItems.length > 0 : resourceItems.length > 0;
  const showPager = Boolean(query) && (hasResults || page > 1);

  pager.hidden = !showPager;
  prevBtn.disabled = loading || page <= 1;
  nextBtn.disabled = loading || !hasNext;
  if (jumpBtn) jumpBtn.disabled = loading || totalPages <= 1;

  const pageItems = buildPaginationItems(page, totalPages);
  pagesEl.innerHTML = pageItems
    .map((item) => {
      if (item === 'ellipsis') {
        return '<span class="search-page__pager-ellipsis" aria-hidden="true">…</span>';
      }
      const active = item === page;
      return `<button type="button" class="search-page__pager-num${active ? ' is-active' : ''}" data-search-page="${item}" ${active ? 'aria-current="page"' : ''} ${loading ? 'disabled' : ''}>${item}</button>`;
    })
    .join('');

  if (totalEl) {
    const exact = activeTab === 'user' ? userTotalExact : resourceTotalExact;
    totalEl.textContent = exact ? `共 ${totalPages} 页` : `已加载至第 ${page} 页`;
  }

  const jumpInput = getJumpInput();
  if (jumpInput) {
    jumpInput.max = String(totalPages);
    jumpInput.min = '1';
    jumpInput.disabled = loading || totalPages <= 1;
    jumpInput.setAttribute('aria-valuemax', String(totalPages));
    clampJumpInputValue();
  }
  jumpWrap?.toggleAttribute('hidden', !showPager || totalPages <= 1);
}

function onJumpToPage() {
  if (loading) return;
  const input = getJumpInput();
  if (!input) return;
  const totalPages = currentTotalPages();
  const raw = input.value.trim();
  if (!raw) {
    setStatus('请输入要跳转的页码', true);
    input.focus();
    return;
  }
  let target = Number.parseInt(raw, 10);
  if (!Number.isFinite(target) || target < 1) {
    setStatus('请输入有效页码', true);
    input.focus();
    return;
  }
  if (target > totalPages) {
    setStatus(`页码不能大于总页数（${totalPages}）`, true);
    input.value = String(totalPages);
    target = totalPages;
  }
  setStatus('');
  if (target === currentPageNumber()) return;
  void runSearch(target);
}

function renderUserRow(user) {
  const bio = user.bio === '暂无简介' ? '这个人很神秘，什么也没写。' : user.bio;
  return `
    <button type="button" class="search-user" data-search-user="${user.id}">
      ${renderFramedAvatarHtml({
        avatar: user.avatar,
        frame: user.avatarFrame,
        size: 'list',
        imgClass: 'search-user__avatar',
        phClass: 'search-user__avatar--ph',
      })}
      <span class="search-user__text">
        <span class="search-user__name">${escapeHtml(user.name)}</span>
        <span class="search-user__bio">${escapeHtml(bio)}</span>
      </span>
      ${materialIcon('chevron_right', 'search-user__chevron')}
    </button>`;
}

function renderResults() {
  const resourceGrid = document.getElementById('search-page-resource');
  const userList = document.getElementById('search-page-users');

  if (resourceGrid) {
    if (!resourceItems.length) {
      if (loading && resourceGrid.querySelector('.skeleton-busy')) {
        /* 保留骨架屏 */
      } else if (loading) {
        resourceGrid.innerHTML = videoGridSkeletonHtml(8);
      } else {
        resourceGrid.innerHTML = `<p class="search-page__empty">${query ? '没有找到相关内容' : '输入关键词开始搜索'}</p>`;
      }
    } else {
      resourceGrid.innerHTML = resourceItems.map((item) => renderVideoCard(item)).join('');
    }
  }

  if (userList) {
    if (!userItems.length) {
      if (loading && userList.querySelector('.skeleton-busy')) {
        /* 保留骨架屏 */
      } else if (loading) {
        userList.innerHTML = searchUserListSkeletonHtml(8);
      } else {
        userList.innerHTML = `<p class="search-page__empty">${query ? '没有找到相关用户' : '输入关键词开始搜索'}</p>`;
      }
    } else {
      userList.innerHTML = userItems.map((user) => renderUserRow(user)).join('');
    }
  }

  renderPagination();
}

function resetLists() {
  resourceItems = [];
  userItems = [];
  resourcePage = 1;
  userPage = 1;
  resourceTotalPages = 1;
  userTotalPages = 1;
  resourceTotalCount = null;
  userTotalCount = null;
  resourceHasNext = false;
  userHasNext = false;
  resourceTotalExact = false;
  userTotalExact = false;
}

async function loadResourcePage(page) {
  if (!query || loading || activeTab === 'user') return;
  if (page < 1) return;
  loading = true;
  renderPagination();
  setStatus('');
  const resourceGrid = document.getElementById('search-page-resource');
  if (resourceGrid) resourceGrid.innerHTML = videoGridSkeletonHtml(8);
  try {
    const result = await searchResources(query, page, PAGE_SIZE, resourceTypeForTab(activeTab));
    if (result.items.length === 0 && page > 1) {
      resourceTotalPages = Math.max(1, page - 1);
      resourceTotalExact = true;
      resourceHasNext = false;
      resourcePage = Math.min(resourcePage, resourceTotalPages);
      setStatus('没有更多结果', true);
      renderResults();
      return;
    }
    resourceItems = result.items;
    resourcePage = page;
    applySearchPagination('resource', result, page);
    renderResults();
    setStatus('');
    scrollResultsToTop();
  } catch (err) {
    shrinkTotalPagesAfterError('resource', page);
    setStatus(err instanceof Error ? err.message : '搜索失败', true);
    renderPagination();
  } finally {
    loading = false;
    renderPagination();
  }
}

async function loadUserPage(page) {
  if (!query || loading || activeTab !== 'user') return;
  if (page < 1) return;
  loading = true;
  renderPagination();
  setStatus('');
  const userList = document.getElementById('search-page-users');
  if (userList) userList.innerHTML = searchUserListSkeletonHtml(8);
  try {
    const result = await searchUsers(query, page, PAGE_SIZE);
    if (result.items.length === 0 && page > 1) {
      userTotalPages = Math.max(1, page - 1);
      userTotalExact = true;
      userHasNext = false;
      userPage = Math.min(userPage, userTotalPages);
      setStatus('没有更多结果', true);
      renderResults();
      return;
    }
    userItems = result.items;
    userPage = page;
    applySearchPagination('user', result, page);
    renderResults();
    setStatus('');
    scrollResultsToTop();
  } catch (err) {
    shrinkTotalPagesAfterError('user', page);
    setStatus(err instanceof Error ? err.message : '搜索失败', true);
    renderPagination();
  } finally {
    loading = false;
    renderPagination();
  }
}

/**
 * @param {number} [page]
 */
export async function runSearch(page = 1) {
  const trimmed = query.trim();
  if (!trimmed) {
    setStatus('请输入搜索关键词', true);
    return;
  }
  query = trimmed;
  syncQueryHeading();
  const searchInput = getTopbarSearchInput();
  if (searchInput) searchInput.value = query;

  const targetPage = Math.max(1, page);

  if (activeTab === 'user') {
    await loadUserPage(targetPage);
    return;
  }

  await loadResourcePage(targetPage);
}

export function captureSearchPageState() {
  return {
    activeTab,
    query,
    resourceItems,
    userItems,
    resourcePage,
    userPage,
    resourceTotalPages,
    userTotalPages,
    resourceTotalCount,
    userTotalCount,
    resourceHasNext,
    userHasNext,
    resourceTotalExact,
    userTotalExact,
    resourceHtml: document.getElementById('search-page-resource')?.innerHTML ?? '',
    usersHtml: document.getElementById('search-page-users')?.innerHTML ?? '',
    usersHidden: document.getElementById('search-page-users')?.hidden ?? true,
    scrollTop: getScrollTop('main-content'),
  };
}

/**
 * @param {ReturnType<typeof captureSearchPageState>} state
 */
export function restoreSearchPageState(state) {
  activeTab = state.activeTab ?? 'all';
  query = state.query ?? '';
  resourceItems = state.resourceItems ?? [];
  userItems = state.userItems ?? [];
  resourcePage = state.resourcePage ?? 1;
  userPage = state.userPage ?? 1;
  resourceTotalPages = state.resourceTotalPages ?? 1;
  userTotalPages = state.userTotalPages ?? 1;
  resourceTotalCount = state.resourceTotalCount ?? null;
  userTotalCount = state.userTotalCount ?? null;
  resourceHasNext = state.resourceHasNext ?? false;
  userHasNext = state.userHasNext ?? false;
  resourceTotalExact = state.resourceTotalExact ?? false;
  userTotalExact = state.userTotalExact ?? false;
  loading = false;
  syncTabs();
  syncQueryHeading();
  const searchInput = getTopbarSearchInput();
  if (searchInput) searchInput.value = query;
  const resourceEl = document.getElementById('search-page-resource');
  if (resourceEl) resourceEl.innerHTML = state.resourceHtml ?? '';
  const usersEl = document.getElementById('search-page-users');
  if (usersEl) {
    usersEl.innerHTML = state.usersHtml ?? '';
    usersEl.hidden = state.usersHidden ?? true;
  }
  renderPagination();
  restoreScrollTop('main-content', state.scrollTop ?? 0);
}

async function enterSearchPage(params) {
  query = `${params.query ?? ''}`.trim();
  if (!query) return;
  activeTab = 'all';
  resetLists();
  syncTabs();
  syncQueryHeading();
  const searchInput = getTopbarSearchInput();
  if (searchInput) searchInput.value = query;
  await runSearch(1);
}

/**
 * @param {string} keyword
 */
export function openSearch(keyword) {
  const trimmed = `${keyword ?? ''}`.trim();
  if (!trimmed) return;
  void navigateTo('search', { query: trimmed });
}

function onTabClick(event) {
  const btn = /** @type {HTMLElement} */ (event.target).closest('[data-search-tab]');
  if (!btn) return;
  const tab = btn.getAttribute('data-search-tab');
  if (tab !== 'all' && tab !== 'video' && tab !== 'article' && tab !== 'user') return;
  if (tab === activeTab) return;
  activeTab = tab;
  resetLists();
  syncTabs();
  renderResults();
  void runSearch(1);
}

function onPagerClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  if (loading) return;

  const pageBtn = target.closest('[data-search-page]');
  if (pageBtn instanceof HTMLElement) {
    const num = Number.parseInt(pageBtn.getAttribute('data-search-page') ?? '', 10);
    if (!Number.isFinite(num) || num < 1 || num === currentPageNumber()) return;
    void runSearch(num);
    return;
  }

  if (target.closest('#search-page-prev')) {
    const page = currentPageNumber();
    if (page <= 1) return;
    void runSearch(page - 1);
    return;
  }
  if (target.closest('#search-page-next')) {
    const page = currentPageNumber();
    if (!currentHasNext()) return;
    void runSearch(page + 1);
  }
}

function onResultsClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const userBtn = target.closest('[data-search-user]');
  if (userBtn instanceof HTMLElement) {
    const id = Number.parseInt(userBtn.getAttribute('data-search-user') ?? '', 10);
    if (Number.isFinite(id) && id > 0) openUserSpace(id);
    return;
  }

  const card = target.closest('.video-card');
  if (!card) return;
  const preview = previewFromCard(card);
  if (!preview || (preview.type !== 0 && preview.type !== 1)) return;
  void openContentDetail(preview);
}

function onTopbarSearchKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = getTopbarSearchInput();
  const keyword = input?.value ?? '';
  query = keyword;
  resetLists();
  openSearch(keyword);
}

export function onSearchPageEnter() {
  syncTabs();
  syncQueryHeading();
  renderPagination();
}

export function bindSearchPage() {
  if (bound) return;
  bound = true;

  getTopbarSearchInput()?.addEventListener('keydown', onTopbarSearchKeydown);

  document.getElementById('search-page-tabs')?.addEventListener('click', onTabClick);
  document.getElementById('search-page-pager')?.addEventListener('click', onPagerClick);
  document.getElementById('search-page-resource')?.addEventListener('click', onResultsClick);
  document.getElementById('search-page-users')?.addEventListener('click', onResultsClick);

  document.getElementById('search-page-jump-btn')?.addEventListener('click', onJumpToPage);
  getJumpInput()?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onJumpToPage();
    }
  });
  getJumpInput()?.addEventListener('blur', clampJumpInputValue);
  getJumpInput()?.addEventListener('change', clampJumpInputValue);

  document.querySelector('.btn-refresh')?.addEventListener('click', () => {
    if (getCurrentPage() === 'search' && query.trim()) {
      void runSearch(currentPageNumber());
    }
  });

  registerPageNavigation('search', {
    capture: () => captureSearchPageState(),
    restore: (state) => {
      restoreSearchPageState(/** @type {ReturnType<typeof captureSearchPageState>} */ (state));
    },
    enter: (params) => enterSearchPage(params),
  });
}
