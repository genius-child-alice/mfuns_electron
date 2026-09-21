import { materialIcon } from './icons.js';
import { openContentDetail, previewFromCard } from './content-nav.js';
import { getCurrentPage, setPage } from './pages.js';
import { renderVideoCard } from './home-feed.js';
import { mediaSrcForCover } from './content-api.js';
import { searchResources, searchUsers } from './search-api.js';
import { openUserSpace } from './user-space.js';

/** @typedef {'all' | 'video' | 'article' | 'user'} SearchTabId */
/** @typedef {import('./user-profile-api.js').UserProfile} UserProfile */
/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

const PAGE_SIZE = 20;
const SCROLL_PREFETCH_MIN_PX = 560;
const SCROLL_PREFETCH_VIEWPORT_RATIO = 1.5;

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

let hasMoreResources = true;

let hasMoreUsers = true;

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
  resourcePanel?.toggleAttribute('hidden', isUser);
  userPanel?.toggleAttribute('hidden', !isUser);
}

function renderUserRow(user) {
  const avatarSrc = mediaSrcForCover(user.avatar);
  const bio = user.bio === '暂无简介' ? '这个人很神秘，什么也没写。' : user.bio;
  return `
    <button type="button" class="search-user" data-search-user="${user.id}">
      ${
        avatarSrc
          ? `<img class="search-user__avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
          : '<span class="search-user__avatar search-user__avatar--ph"></span>'
      }
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
      resourceGrid.innerHTML = `<p class="search-page__empty">${query ? '没有找到相关内容' : '输入关键词开始搜索'}</p>`;
    } else {
      resourceGrid.innerHTML = resourceItems.map((item) => renderVideoCard(item)).join('');
    }
  }

  if (userList) {
    if (!userItems.length) {
      userList.innerHTML = `<p class="search-page__empty">${query ? '没有找到相关用户' : '输入关键词开始搜索'}</p>`;
    } else {
      userList.innerHTML = userItems.map((user) => renderUserRow(user)).join('');
    }
  }
}

function resetLists() {
  resourceItems = [];
  userItems = [];
  resourcePage = 1;
  userPage = 1;
  hasMoreResources = true;
  hasMoreUsers = true;
}

async function loadMoreResources() {
  if (!query || loading || !hasMoreResources || activeTab === 'user') return;
  loading = true;
  setStatus('加载中…');
  try {
    const batch = await searchResources(query, resourcePage, PAGE_SIZE, resourceTypeForTab(activeTab));
    if (resourcePage === 1) resourceItems = batch;
    else resourceItems = [...resourceItems, ...batch];
    hasMoreResources = batch.length >= PAGE_SIZE;
    if (batch.length > 0) resourcePage += 1;
    renderResults();
    setStatus('');
  } catch (err) {
    setStatus(err instanceof Error ? err.message : '搜索失败', true);
  } finally {
    loading = false;
  }
}

async function loadMoreUsers() {
  if (!query || loading || !hasMoreUsers || activeTab !== 'user') return;
  loading = true;
  setStatus('加载中…');
  try {
    const batch = await searchUsers(query, userPage, PAGE_SIZE);
    if (userPage === 1) userItems = batch;
    else userItems = [...userItems, ...batch];
    hasMoreUsers = batch.length >= PAGE_SIZE;
    if (batch.length > 0) userPage += 1;
    renderResults();
    setStatus('');
  } catch (err) {
    setStatus(err instanceof Error ? err.message : '搜索失败', true);
  } finally {
    loading = false;
  }
}

/**
 * @param {boolean} [reset]
 */
export async function runSearch(reset = true) {
  const trimmed = query.trim();
  if (!trimmed) {
    setStatus('请输入搜索关键词', true);
    return;
  }
  query = trimmed;
  syncQueryHeading();
  getTopbarSearchInput()?.value = query;

  if (reset) {
    resetLists();
    renderResults();
  }

  if (activeTab === 'user') {
    if (reset || (hasMoreUsers && userItems.length === 0)) {
      await loadMoreUsers();
    }
    return;
  }

  if (reset || (hasMoreResources && resourceItems.length === 0)) {
    await loadMoreResources();
  }
}

/**
 * @param {string} keyword
 */
export function openSearch(keyword) {
  const trimmed = `${keyword ?? ''}`.trim();
  if (!trimmed) return;
  query = trimmed;
  activeTab = 'all';
  syncTabs();
  setPage('search');
  syncQueryHeading();
  getTopbarSearchInput()?.value = query;
  void runSearch(true);
}

function shouldPrefetchMore(container) {
  const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
  const threshold = Math.max(
    SCROLL_PREFETCH_MIN_PX,
    container.clientHeight * SCROLL_PREFETCH_VIEWPORT_RATIO,
  );
  return remaining <= threshold;
}

function onMainScroll() {
  if (getCurrentPage() !== 'search' || loading) return;
  const main = document.getElementById('main-content');
  if (!main || !shouldPrefetchMore(main)) return;
  if (activeTab === 'user') {
    if (hasMoreUsers) void loadMoreUsers();
  } else if (hasMoreResources) {
    void loadMoreResources();
  }
}

function onTabClick(event) {
  const btn = /** @type {HTMLElement} */ (event.target).closest('[data-search-tab]');
  if (!btn) return;
  const tab = btn.getAttribute('data-search-tab');
  if (tab !== 'all' && tab !== 'video' && tab !== 'article' && tab !== 'user') return;
  if (tab === activeTab) return;
  activeTab = tab;
  syncTabs();
  void runSearch(true);
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
  openSearch(input?.value ?? '');
}

export function onSearchPageEnter() {
  syncTabs();
  syncQueryHeading();
}

export function bindSearchPage() {
  if (bound) return;
  bound = true;

  getTopbarSearchInput()?.addEventListener('keydown', onTopbarSearchKeydown);

  document.getElementById('search-page-tabs')?.addEventListener('click', onTabClick);
  document.getElementById('search-page-resource')?.addEventListener('click', onResultsClick);
  document.getElementById('search-page-users')?.addEventListener('click', onResultsClick);

  document.getElementById('main-content')?.addEventListener('scroll', onMainScroll, {
    passive: true,
  });

  document.querySelector('.btn-refresh')?.addEventListener('click', () => {
    if (getCurrentPage() === 'search' && query.trim()) {
      void runSearch(true);
    }
  });
}
