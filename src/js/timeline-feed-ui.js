import { materialIcon } from './icons.js';
import { loadSession } from './auth.js';
import { mediaSrcForCover } from './content-api.js';
import { loadStickerUrlMap } from './emoji-pack.js';
import { mountRichContent } from './rich-content.js';
import { openVideoDetail } from './video-detail.js';
import { setFollow } from './video-api.js';
import { requireLogin } from './login-ui.js';

/** @typedef {import('./user-profile-api.js').TimelineFeedItem} TimelineFeedItem */

/**
 * @typedef {{
 *   domIdPrefix?: string,
 *   profileFallback?: { name?: string, avatar?: string | null } | null,
 *   spaceOwnerId?: number | null,
 *   hideCardActions?: boolean,
 * }} TimelineFeedContext
 */

/**
 * @param {number} n
 */
export function formatFeedCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

/**
 * @param {string | null} iso
 */
export function formatFeedDate(iso) {
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
 * @param {import('./content-api.js').ContentPreview} resource
 * @param {TimelineFeedContext} ctx
 */
function renderFeedEmbeddedVideo(resource, ctx) {
  const coverSrc = mediaSrcForCover(resource.cover);
  const author = resource.author || 'MFuns 用户';
  const authorId = resource.authorId;
  const session = loadSession();
  const selfId = sessionUserId(session?.user);
  const spaceOwnerId = ctx.spaceOwnerId ?? null;
  const showFollow =
    authorId != null && authorId !== selfId && authorId !== spaceOwnerId;

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

/**
 * @param {TimelineFeedItem} item
 * @param {TimelineFeedContext} [ctx]
 */
export function renderFeedCard(item, ctx = {}) {
  const domIdPrefix = ctx.domIdPrefix ?? 'timeline-feed';
  const profile = ctx.profileFallback;
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
      ? renderFeedEmbeddedVideo(resource, ctx)
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
            ? `<div class="user-space__feed-card__title markdown-body markdown-body--feed" id="${domIdPrefix}-title-${item.id}"></div>`
            : ''
        }
        <div class="user-space__feed-card__text markdown-body markdown-body--feed" id="${domIdPrefix}-body-${item.id}"></div>
        ${images ? `<div class="${imagesClass}">${images}</div>` : ''}
        ${resourceHtml}
      </div>
      ${
        ctx.hideCardActions
          ? ''
          : `<footer class="user-space__feed-card__actions">
        <button type="button" class="user-space__feed-card__action">${materialIcon('forward', 'user-space__feed-card__action-icon')}<span>${formatFeedCount(item.reposts)}</span></button>
        <button type="button" class="user-space__feed-card__action">${materialIcon('chat_bubble', 'user-space__feed-card__action-icon')}<span>${formatFeedCount(item.comments)}</span></button>
        <button type="button" class="user-space__feed-card__action">${materialIcon('thumb_up', 'user-space__feed-card__action-icon')}<span>${formatFeedCount(item.likes)}</span></button>
      </footer>`
      }
    </article>`;
}

/**
 * @param {TimelineFeedItem[]} items
 * @param {TimelineFeedContext} [ctx]
 */
export function renderFeedListHtml(items, ctx = {}) {
  return `<div class="user-space__list user-space__list--feed">${items.map((item) => renderFeedCard(item, ctx)).join('')}</div>`;
}

/**
 * @param {TimelineFeedItem[]} items
 * @param {string} [domIdPrefix]
 * @param {{ clampBody?: boolean }} [opts]
 */
export function hydrateFeedCards(items, domIdPrefix = 'timeline-feed', opts = {}) {
  const clampBody = opts.clampBody !== false;
  void loadStickerUrlMap().catch(() => {});
  items.forEach((item) => {
    const titleEl = document.getElementById(`${domIdPrefix}-title-${item.id}`);
    const bodyEl = document.getElementById(`${domIdPrefix}-body-${item.id}`);
    if (titleEl && item.rawTitle.trim()) {
      mountRichContent(titleEl, item.rawTitle);
    }
    if (bodyEl) {
      const source = item.rawContent.trim() || item.content || '分享了一条动态';
      mountRichContent(bodyEl, source);
      bodyEl.parentElement?.querySelector('.user-space__feed-card__expand')?.remove();
      if (clampBody) setupFeedTextExpand(bodyEl);
    }
  });
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

/**
 * @param {MouseEvent} event
 * @param {{
 *   onOpenUserSpace?: (userId: number) => void,
 *   profileName?: string,
 * }} options
 */
export function handleTimelineFeedClick(event, options = {}) {
  const target = /** @type {HTMLElement} */ (event.target);

  const feedFollow = target.closest('.user-space__feed-video__follow');
  if (feedFollow instanceof HTMLButtonElement) {
    event.preventDefault();
    event.stopPropagation();
    void handleFeedVideoFollow(feedFollow);
    return true;
  }

  const feedAuthor = target.closest('.user-space__feed-video__author[data-user-id]');
  if (feedAuthor instanceof HTMLButtonElement) {
    event.preventDefault();
    event.stopPropagation();
    const uid = Number.parseInt(feedAuthor.getAttribute('data-user-id') ?? '', 10);
    if (Number.isFinite(uid)) options.onOpenUserSpace?.(uid);
    return true;
  }

  const feedVideo = target.closest('.user-space__feed-video');
  if (feedVideo) {
    const id = feedVideo.getAttribute('data-video-id');
    if (!id) return true;
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
    return true;
  }

  const feedCard = target.closest('.user-space__feed-card');
  if (
    feedCard &&
    !target.closest(
      'button, a, .user-space__feed-video, .user-space__feed-card__expand, .user-space__feed-card__more',
    )
  ) {
    const id = Number.parseInt(feedCard.getAttribute('data-feed-id') ?? '', 10);
    if (Number.isFinite(id)) {
      void import('./feed-detail.js').then((mod) => mod.openFeedDetail(id));
      return true;
    }
  }

  const videoBtn = target.closest('[data-video-id]');
  if (videoBtn && !videoBtn.classList.contains('user-space__feed-video')) {
    const id = videoBtn.getAttribute('data-video-id');
    if (!id) return true;
    void openVideoDetail({
      id,
      title: videoBtn.textContent?.trim() ?? '',
      cover: null,
      author: options.profileName ?? '',
      authorId: null,
      authorAvatar: null,
      type: 1,
      views: 0,
      comments: 0,
      createdAt: null,
    });
    return true;
  }

  return false;
}

/**
 * @param {HTMLElement | null} root
 * @param {{
 *   onOpenUserSpace?: (userId: number) => void,
 *   profileName?: string,
 * }} options
 */
export function bindTimelineFeedClick(root, options = {}) {
  root?.addEventListener('click', (event) => {
    handleTimelineFeedClick(event, options);
  });
}
