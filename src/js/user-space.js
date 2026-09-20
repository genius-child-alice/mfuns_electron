import { materialIcon } from './icons.js';
import { loadSession } from './auth.js';
import { mediaSrcForCover } from './content-api.js';
import { renderVideoCard } from './home-feed.js';
import { getCurrentPage, setPage } from './pages.js';
import { requireLogin } from './login-ui.js';
import { openVideoDetail } from './video-detail.js';
import { fetchFollowStatus, setFollow } from './video-api.js';
import { loadStickerUrlMap } from './emoji-pack.js';
import { mountRichContent } from './rich-content.js';
import {
  fetchUserArticles,
  fetchUserFeeds,
  fetchUserProfile,
  fetchUserVideos,
} from './user-profile-api.js';

/** @typedef {import('./user-profile-api.js').UserProfile} UserProfile */
/** @typedef {import('./pages.js').PageId} PageId */
/** @typedef {'feed' | 'article' | 'video'} SpaceTabId */

/** @type {PageId} */
let returnPage = 'mine';

/** @type {number} */
let currentUserId = 0;

/** @type {UserProfile | null} */
let currentProfile = null;

/** @type {SpaceTabId} */
let activeTab = 'video';

let loading = false;
let hasMore = true;

/** @type {number} */
let listCursor = 0;

/** @type {number} */
let feedStartId = -1;

let following = false;
let followBusy = false;

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
function formatFeedDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isSameDay(d, now)) return `今天 ${time}`;
  if (isSameDay(d, yesterday)) return `昨天 ${time}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * @param {HTMLElement} el
 */
function setupFeedTextExpand(el) {
  el.classList.add('user-space__feed-card__text--clamp');
  requestAnimationFrame(() => {
    if (el.scrollHeight <= el.clientHeight + 1) {
      el.classList.remove('user-space__feed-card__text--clamp');
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'user-space__feed-card__expand';
    btn.textContent = '展开全部';
    btn.addEventListener('click', () => {
      el.classList.remove('user-space__feed-card__text--clamp');
      btn.remove();
    });
    el.insertAdjacentElement('afterend', btn);
  });
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
 * @param {Record<string, unknown> | null | undefined} user
 */
function sessionUserId(user) {
  if (!user) return null;
  const id = user.id ?? user.user_id;
  if (typeof id === 'number' && Number.isFinite(id)) return Math.trunc(id);
  const parsed = Number.parseInt(`${id ?? ''}`, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getScrollEl() {
  return document.getElementById('user-space-scroll');
}

function setLoadingState(on) {
  const root = document.getElementById('user-space-root');
  root?.classList.toggle('user-space--loading', on);
}

/**
 * @param {UserProfile} profile
 */
function renderProfileHeader(profile) {
  const el = document.getElementById('user-space-profile');
  const bannerWrap = document.getElementById('user-space-banner-wrap');
  const barTitle = document.getElementById('user-space-bar-title');
  if (!el || !bannerWrap) return;

  const session = loadSession();
  const selfId = sessionUserId(session?.user);
  const isSelf = selfId != null && selfId === profile.id;
  const avatarSrc = mediaSrcForCover(profile.avatar);
  const bannerSrc = mediaSrcForCover(profile.banner);

  if (bannerSrc) {
    bannerWrap.innerHTML = `<img class="user-space__banner" src="${escapeHtml(bannerSrc)}" alt="" />`;
  } else {
    bannerWrap.innerHTML = '<div class="user-space__banner user-space__banner--ph"></div>';
  }

  if (barTitle) barTitle.textContent = profile.name;

  const bio =
    profile.bio === '暂无简介' ? '这个人很神秘，什么也没写。' : profile.bio;

  const levelBadge =
    profile.level != null && profile.level > 0
      ? `<span class="user-space__level">LV${profile.level}</span>`
      : '';

  el.innerHTML = `
    <div class="user-space__head">
      <div class="user-space__head-avatar">
        ${
          avatarSrc
            ? `<img class="user-space__avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
            : '<span class="user-space__avatar user-space__avatar--ph"></span>'
        }
      </div>
      <div class="user-space__head-text">
        <div class="user-space__head-title">
          <h1 class="user-space__name">${escapeHtml(profile.name)}</h1>
          ${levelBadge}
        </div>
        <p class="user-space__bio">${escapeHtml(bio)}</p>
      </div>
      <div class="user-space__head-right">
        <div class="user-space__stats">
          <div class="user-space__stat">
            <strong>${formatCount(profile.follows)}</strong>
            <span>关注</span>
          </div>
          <div class="user-space__stat">
            <strong>${formatCount(profile.fans)}</strong>
            <span>粉丝</span>
          </div>
          <div class="user-space__stat">
            <strong>${formatCount(profile.totalLikes)}</strong>
            <span>获赞</span>
          </div>
        </div>
        ${
          isSelf
            ? ''
            : `<div class="user-space__head-actions">
                <button type="button" class="user-space__follow ${following ? 'is-followed' : ''}" id="user-space-follow-btn">${following ? '已关注' : '+ 关注'}</button>
                <button type="button" class="user-space__message" id="user-space-message-btn">发消息</button>
              </div>`
        }
      </div>
    </div>`;

  document.getElementById('user-space-follow-btn')?.addEventListener('click', () => {
    void toggleFollow();
  });

  document.getElementById('user-space-message-btn')?.addEventListener('click', () => {
    if (!requireLogin()) return;
    alert('私信功能开发中');
  });
}

async function toggleFollow() {
  if (!currentProfile || followBusy) return;
  if (!requireLogin()) return;
  followBusy = true;
  const next = !following;
  try {
    await setFollow(currentProfile.id, next);
    following = next;
    renderProfileHeader(currentProfile);
  } catch (err) {
    alert(err instanceof Error ? err.message : '操作失败');
  } finally {
    followBusy = false;
  }
}

/**
 * @param {import('./content-api.js').ContentPreview} item
 */
function renderArticleRow(item) {
  return `
    <article class="user-space__article" data-content-id="${escapeHtml(item.id)}" data-content-type="${item.type}">
      <h3 class="user-space__article-title">${escapeHtml(item.title)}</h3>
      <p class="user-space__article-meta">
        <span>${materialIcon('thumb_up', 'user-space__meta-icon')}${formatCount(item.views)}</span>
        <span>${materialIcon('chat_bubble', 'user-space__meta-icon')}${formatCount(item.comments)}</span>
      </p>
    </article>`;
}

/**
 * @param {import('./user-profile-api.js').TimelineFeedItem[]} items
 */
function hydrateFeedCards(items) {
  if (activeTab !== 'feed') return;
  void loadStickerUrlMap().catch(() => {});
  items.forEach((item) => {
    const titleEl = document.getElementById(`user-space-feed-title-${item.id}`);
    const bodyEl = document.getElementById(`user-space-feed-body-${item.id}`);
    if (titleEl && item.rawTitle.trim()) {
      mountRichContent(titleEl, item.rawTitle);
    }
    if (bodyEl) {
      const source = item.rawContent.trim() || item.content || '分享了一条动态';
      mountRichContent(bodyEl, source);
      bodyEl.parentElement
        ?.querySelector('.user-space__feed-card__expand')
        ?.remove();
      setupFeedTextExpand(bodyEl);
    }
  });
}

/**
 * @param {import('./content-api.js').ContentPreview} resource
 */
function renderFeedEmbeddedVideo(resource) {
  const coverSrc = mediaSrcForCover(resource.cover);
  const author = resource.author || 'MFuns 用户';
  const authorId = resource.authorId;
  const session = loadSession();
  const selfId = sessionUserId(session?.user);
  const showFollow =
    authorId != null && authorId !== selfId && authorId !== currentUserId;

  const authorHtml =
    authorId != null
      ? `<button type="button" class="user-space__feed-video__author" data-user-id="${authorId}">@${escapeHtml(author)}</button>`
      : `<span class="user-space__feed-video__author user-space__feed-video__author--text">@${escapeHtml(author)}</span>`;

  return `
    <div
      class="user-space__feed-video"
      data-video-id="${escapeHtml(resource.id)}"
      data-video-title="${escapeHtml(resource.title)}"
      data-video-author="${escapeHtml(author)}"
      data-video-cover="${escapeHtml(coverSrc ?? '')}"
      role="button"
      tabindex="0"
    >
      <div class="user-space__feed-video__bar">
        ${authorHtml}
        ${
          showFollow
            ? `<button type="button" class="user-space__feed-video__follow" data-follow-user-id="${authorId}">+ 关注</button>`
            : ''
        }
      </div>
      <div class="user-space__feed-video__media">
        ${
          coverSrc
            ? `<img class="user-space__feed-video__cover" src="${escapeHtml(coverSrc)}" alt="" loading="lazy" />`
            : '<div class="user-space__feed-video__cover user-space__feed-video__cover--ph" aria-hidden="true"></div>'
        }
      </div>
    </div>`;
}

function renderFeedCard(item) {
  const profile = currentProfile;
  const authorName = item.authorName || profile?.name || 'MFuns 用户';
  const avatarSrc = mediaSrcForCover(item.authorAvatar || profile?.avatar);
  const dateLabel = formatFeedDate(item.createdAt);
  const titleSource = item.rawTitle?.trim() || item.title?.trim() || '';
  const imageUrls = item.images.slice(0, 9);
  const images = imageUrls
    .map((url) => {
      const src = mediaSrcForCover(url);
      return src
        ? `<img class="user-space__feed-card__img" src="${escapeHtml(src)}" alt="" loading="lazy" />`
        : '';
    })
    .join('');
  const imageCount = imageUrls.length;
  const imagesClass =
    imageCount > 0
      ? `user-space__feed-card__images user-space__feed-card__images--c${Math.min(imageCount, 9)}`
      : '';
  const resource = item.resource;
  const resourceHtml =
    resource && resource.type === 1
      ? renderFeedEmbeddedVideo(resource)
      : resource
        ? `<div class="user-space__feed-resource user-space__feed-resource--text">
            <span class="user-space__feed-resource__title">${escapeHtml(resource.title)}</span>
          </div>`
        : '';

  const pinHtml = item.pinned
    ? `<span class="user-space__feed-card__pin">${materialIcon('vertical_align_top', 'user-space__feed-card__pin-icon')}置顶</span>`
    : '';

  return `
    <article class="user-space__feed-card" data-feed-id="${item.id}">
      <div class="user-space__feed-card__top">
        <header class="user-space__feed-card__head">
          ${
            avatarSrc
              ? `<img class="user-space__feed-card__avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
              : '<span class="user-space__feed-card__avatar user-space__feed-card__avatar--ph"></span>'
          }
          <div class="user-space__feed-card__who">
            <div class="user-space__feed-card__name-row">
              <span class="user-space__feed-card__name">${escapeHtml(authorName)}</span>
              ${pinHtml}
            </div>
            ${dateLabel ? `<time class="user-space__feed-card__time" datetime="">${escapeHtml(dateLabel)}</time>` : ''}
          </div>
        </header>
        <button type="button" class="user-space__feed-card__more" aria-label="更多">${materialIcon('more_vert')}</button>
      </div>
      <div class="user-space__feed-card__body">
        ${
          titleSource
            ? `<div class="user-space__feed-card__title markdown-body markdown-body--feed" id="user-space-feed-title-${item.id}"></div>`
            : ''
        }
        <div class="user-space__feed-card__text markdown-body markdown-body--feed" id="user-space-feed-body-${item.id}"></div>
        ${images ? `<div class="${imagesClass}">${images}</div>` : ''}
        ${resourceHtml}
      </div>
      <footer class="user-space__feed-card__actions">
        <button type="button" class="user-space__feed-card__action">${materialIcon('forward', 'user-space__feed-card__action-icon')}<span>${formatCount(item.reposts)}</span></button>
        <button type="button" class="user-space__feed-card__action">${materialIcon('chat_bubble', 'user-space__feed-card__action-icon')}<span>${formatCount(item.comments)}</span></button>
        <button type="button" class="user-space__feed-card__action">${materialIcon('thumb_up', 'user-space__feed-card__action-icon')}<span>${formatCount(item.likes)}</span></button>
      </footer>
    </article>`;
}

function resetListState() {
  listCursor = 0;
  feedStartId = -1;
  hasMore = true;
}

function syncTabsUi() {
  document.querySelectorAll('[data-space-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-space-tab') === activeTab);
  });
  document.getElementById('user-space-body')?.classList.toggle('user-space__body--feed', activeTab === 'feed');
}

function setBodyHtml(html) {
  const body = document.getElementById('user-space-body');
  if (body) body.innerHTML = html;
}

function appendBodyHtml(html) {
  const body = document.getElementById('user-space-body');
  if (body) body.insertAdjacentHTML('beforeend', html);
}

async function loadFirstPage() {
  if (!currentUserId || loading) return;
  loading = true;
  setLoadingState(true);
  resetListState();
  syncTabsUi();
  setBodyHtml('<p class="user-space__hint">加载中…</p>');

  try {
    const items = await loadTabPage(true);
    if (items.length === 0) {
      setBodyHtml(`<p class="user-space__empty">${emptyTextForTab(activeTab)}</p>`);
      hasMore = false;
      return;
    }
    setBodyHtml(renderItems(items));
    if (activeTab === 'feed') {
      hydrateFeedCards(/** @type {import('./user-profile-api.js').TimelineFeedItem[]} */ (items));
    }
    updateCursor(items);
  } catch (err) {
    setBodyHtml(
      `<p class="user-space__empty">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`,
    );
    hasMore = false;
  } finally {
    loading = false;
    setLoadingState(false);
  }
}

async function loadMore() {
  if (!currentUserId || loading || !hasMore) return;
  loading = true;
  appendBodyHtml('<p class="user-space__hint user-space__hint--more" id="user-space-load-more">加载中…</p>');

  try {
    const items = await loadTabPage(false);
    document.getElementById('user-space-load-more')?.remove();
    if (items.length === 0) {
      hasMore = false;
      return;
    }
    appendBodyHtml(renderItems(items));
    if (activeTab === 'feed') {
      hydrateFeedCards(/** @type {import('./user-profile-api.js').TimelineFeedItem[]} */ (items));
    }
    updateCursor(items);
  } catch {
    document.getElementById('user-space-load-more')?.remove();
  } finally {
    loading = false;
  }
}

/**
 * @param {SpaceTabId} tab
 */
function emptyTextForTab(tab) {
  if (tab === 'feed') return 'TA 还没有发布动态';
  if (tab === 'article') return 'TA 还没有发布文章';
  return 'TA 还没有发布视频';
}

/**
 * @param {boolean} first
 */
async function loadTabPage(first) {
  if (activeTab === 'video') {
    const cursor = first ? 0 : listCursor;
    return fetchUserVideos(currentUserId, cursor);
  }
  if (activeTab === 'article') {
    const cursor = first ? 0 : listCursor;
    return fetchUserArticles(currentUserId, cursor);
  }
  const startId = first ? -1 : feedStartId;
  return fetchUserFeeds(currentUserId, startId);
}

/**
 * @param {unknown[]} items
 */
function renderItems(items) {
  if (activeTab === 'video') {
    return `<div class="content-grid user-space__grid">${items.map((item) => renderVideoCard(/** @type {import('./content-api.js').ContentPreview} */ (item))).join('')}</div>`;
  }
  if (activeTab === 'article') {
    return `<div class="user-space__list">${items.map((item) => renderArticleRow(/** @type {import('./content-api.js').ContentPreview} */ (item))).join('')}</div>`;
  }
  return `<div class="user-space__list user-space__list--feed">${items.map((item) => renderFeedCard(/** @type {import('./user-profile-api.js').TimelineFeedItem} */ (item))).join('')}</div>`;
}

/**
 * @param {unknown[]} items
 */
function updateCursor(items) {
  if (items.length === 0) {
    hasMore = false;
    return;
  }
  if (activeTab === 'feed') {
    const last = /** @type {import('./user-profile-api.js').TimelineFeedItem} */ (items[items.length - 1]);
    feedStartId = last.id;
    hasMore = items.length >= 10;
    return;
  }
  const last = /** @type {import('./content-api.js').ContentPreview} */ (items[items.length - 1]);
  const next = Number.parseInt(`${last.id}`, 10);
  if (!Number.isFinite(next) || next === listCursor) {
    hasMore = false;
    return;
  }
  listCursor = next;
  hasMore = items.length >= 10;
}

async function loadUserSpace(userId) {
  currentUserId = userId;
  setLoadingState(true);
  setBodyHtml('');
  document.getElementById('user-space-profile')?.replaceChildren();

  try {
    const profile = await fetchUserProfile(userId);
    currentProfile = profile;

    const session = loadSession();
    const selfId = sessionUserId(session?.user);
    if (selfId != null && selfId !== userId && session?.token) {
      following = await fetchFollowStatus(userId).catch(() => false);
    } else {
      following = false;
    }

    renderProfileHeader(profile);
    syncTabsUi();
    await loadFirstPage();
  } catch (err) {
    setBodyHtml(
      `<p class="user-space__empty">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`,
    );
  } finally {
    setLoadingState(false);
  }
}

/**
 * @param {number} userId
 */
export function openUserSpace(userId) {
  if (!Number.isFinite(userId) || userId <= 0) return;
  returnPage = getCurrentPage();
  activeTab = 'video';
  setPage('space');
  void loadUserSpace(userId);
}

export function openMySpace() {
  const session = loadSession();
  if (!session?.token) {
    requireLogin();
    return;
  }
  const userId = sessionUserId(session.user);
  if (!userId) {
    alert('无法获取用户 ID，请重新登录');
    return;
  }
  openUserSpace(userId);
}

export function closeUserSpace() {
  setPage(returnPage);
}

function onSpaceScroll() {
  const el = getScrollEl();
  if (!el || loading || !hasMore) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 480) {
    void loadMore();
  }
}

async function handleFeedVideoFollow(btn) {
  if (!requireLogin()) return;
  const userId = Number.parseInt(btn.getAttribute('data-follow-user-id') ?? '', 10);
  if (!Number.isFinite(userId)) return;
  btn.disabled = true;
  try {
    await setFollow(userId, true);
    btn.textContent = '已关注';
    btn.classList.add('is-followed');
  } catch (err) {
    btn.disabled = false;
    alert(err instanceof Error ? err.message : '关注失败');
  }
}

function onBodyClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);

  const feedFollow = target.closest('.user-space__feed-video__follow');
  if (feedFollow instanceof HTMLButtonElement) {
    event.preventDefault();
    event.stopPropagation();
    void handleFeedVideoFollow(feedFollow);
    return;
  }

  const feedAuthor = target.closest('.user-space__feed-video__author[data-user-id]');
  if (feedAuthor instanceof HTMLButtonElement) {
    event.preventDefault();
    event.stopPropagation();
    const uid = Number.parseInt(feedAuthor.getAttribute('data-user-id') ?? '', 10);
    if (Number.isFinite(uid)) openUserSpace(uid);
    return;
  }

  const feedVideo = target.closest('.user-space__feed-video');
  if (feedVideo) {
    const id = feedVideo.getAttribute('data-video-id');
    if (!id) return;
    void openVideoDetail({
      id,
      title: feedVideo.getAttribute('data-video-title')?.trim() || '视频',
      cover: feedVideo.getAttribute('data-video-cover') || null,
      author: feedVideo.getAttribute('data-video-author')?.trim() || '',
      authorId: null,
      authorAvatar: null,
      type: 1,
      views: 0,
      comments: 0,
      createdAt: null,
    });
    return;
  }

  const videoBtn = target.closest('[data-video-id]');
  if (videoBtn) {
    const id = videoBtn.getAttribute('data-video-id');
    if (!id) return;
    void openVideoDetail({
      id,
      title: videoBtn.textContent?.trim() ?? '',
      cover: null,
      author: currentProfile?.name ?? '',
      authorId: null,
      authorAvatar: null,
      type: 1,
      views: 0,
      comments: 0,
      createdAt: null,
    });
    return;
  }

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
    author: authorEl?.textContent?.trim() ?? currentProfile?.name ?? '',
    type: 1,
    views: 0,
    comments: 0,
    createdAt: null,
  });
}

export function bindUserSpace() {
  document.getElementById('user-space-back')?.addEventListener('click', closeUserSpace);
  document.getElementById('btn-open-my-space')?.addEventListener('click', openMySpace);

  document.querySelectorAll('[data-space-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-space-tab');
      if (tab !== 'feed' && tab !== 'article' && tab !== 'video') return;
      if (tab === activeTab) return;
      activeTab = tab;
      syncTabsUi();
      void loadFirstPage();
    });
  });

  getScrollEl()?.addEventListener('scroll', onSpaceScroll, { passive: true });
  document.getElementById('user-space-body')?.addEventListener('click', onBodyClick);
}
