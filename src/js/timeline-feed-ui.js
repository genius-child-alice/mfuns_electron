import { materialIcon, viewCountIcon } from './icons.js';
import { notify } from './notice-ui.js';
import { loadSession } from './auth.js';
import { renderFramedAvatarHtml } from './avatar-frame-ui.js';
import { mediaSrcForCover } from './content-api.js';
import { loadStickerUrlMap } from './emoji-pack.js';
import { mountRichContent } from './rich-content.js';
import { openVideoDetail } from './video-detail.js';
import { fetchFollowStatus, setFollow } from './video-api.js';
import { requireLogin } from './login-ui.js';

/** @typedef {import('./user-profile-api.js').TimelineFeedItem} TimelineFeedItem */

/**
 * @typedef {{
 *   domIdPrefix?: string,
 *   profileFallback?: { name?: string, avatar?: string | null, avatarFrame?: string | null } | null,
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
 * @param {import('./user-profile-api.js').TimelineFeedItem} item
 */
function feedCardMetaTitle(item) {
  return (
    item.rawTitle?.trim() ||
    item.title?.trim() ||
    item.rawContent?.trim() ||
    item.content?.trim() ||
    ''
  ).slice(0, 240);
}

/**
 * @param {import('./user-profile-api.js').TimelineFeedItem} item
 */
function feedCardMetaCover(item) {
  const img = item.images?.[0];
  if (img) return img;
  const cover = item.resource?.cover;
  return cover ? mediaSrcForCover(cover) : '';
}

let feedCardMenuDocBound = false;

function closeAllFeedCardMenus() {
  document.querySelectorAll('.user-space__feed-card__menu').forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll('.user-space__feed-card__more[aria-expanded="true"]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
  });
}

/**
 * @param {HTMLElement} card
 */
function syncFeedCardMenuItems(card) {
  const menu = card.querySelector('.user-space__feed-card__menu');
  if (!menu) return;
  const viewerId = sessionUserId(loadSession()?.user);
  const authorId = Number.parseInt(card.getAttribute('data-feed-author-id') ?? '', 10);
  const isOwner = viewerId != null && authorId === viewerId;
  const loggedIn = Boolean(loadSession()?.token);

  menu.querySelector('[data-feed-action="forward"]')?.toggleAttribute('hidden', !loggedIn);
  menu.querySelector('[data-feed-action="delete"]')?.toggleAttribute('hidden', !isOwner);
  menu.querySelector('[data-feed-action="report"]')?.toggleAttribute('hidden', isOwner);
}

/**
 * @param {string} action
 * @param {HTMLElement} card
 */
async function runFeedCardAction(action, card) {
  const feedId = Number.parseInt(card.getAttribute('data-feed-id') ?? '', 10);
  if (!Number.isFinite(feedId)) return;

  const title = card.getAttribute('data-feed-title') ?? '';
  const cover = card.getAttribute('data-feed-cover') ?? '';
  closeAllFeedCardMenus();

  if (action === 'forward') {
    if (!requireLogin()) return;
    const { openFeedForward } = await import('./feed-forward.js');
    void openFeedForward({
      resourceId: feedId,
      resourceType: 3,
      resourceTitle: title,
      resourceCover: cover,
    });
    return;
  }

  if (action === 'report') {
    if (!requireLogin()) return;
    const [{ openReportDialog }, { REPORT_RESOURCE }] = await Promise.all([
      import('./report-ui.js'),
      import('./member-api.js'),
    ]);
    void openReportDialog({
      resourceId: feedId,
      resourceType: REPORT_RESOURCE.feed,
      title: title || '动态',
    });
    return;
  }

  if (action === 'delete') {
    if (!requireLogin()) return;
    const { confirmAction } = await import('./confirm-dialog.js');
    const { deleteFeed } = await import('./feed-api.js');
    const confirmed = await confirmAction({
      title: '删除动态',
      message: '确定删除这条动态吗？删除后无法恢复。',
      confirmText: '删除',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteFeed(feedId);
      notify('已删除', 'success');
      const wasInDetail = Boolean(card.closest('#feed-detail-post'));
      card.remove();
      if (wasInDetail) {
        const { closeFeedDetail } = await import('./feed-detail.js');
        closeFeedDetail();
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }
}

function ensureFeedCardMenuDocumentClose() {
  if (feedCardMenuDocBound) return;
  feedCardMenuDocBound = true;
  document.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('.user-space__feed-card__more-wrap')) return;
    closeAllFeedCardMenus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllFeedCardMenus();
  });
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
  const author = resource.author || 'Mfuns 用户';
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
  const authorName = item.authorName || profile?.name || 'Mfuns 用户';
  const dateLabel = formatFeedDate(item.createdAt);
  const viewsLabel = `${formatFeedCount(item.views)}浏览`;
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

  const authorId = item.authorId;
  const avatarInner = renderFramedAvatarHtml({
    avatar: item.authorAvatar || profile?.avatar,
    frame: item.authorAvatarFrame ?? profile?.avatarFrame ?? null,
    size: 'feed',
    imgClass: 'user-space__feed-card__avatar',
    phClass: 'user-space__feed-card__avatar--ph',
  });
  const avatarHtml =
    authorId != null
      ? `<button type="button" class="user-space__feed-card__profile user-space__feed-card__profile--avatar" data-author-profile="${authorId}" title="进入主页">${avatarInner}</button>`
      : avatarInner;
  const nameHtml =
    authorId != null
      ? `<button type="button" class="user-space__feed-card__profile user-space__feed-card__name" data-author-profile="${authorId}" title="进入主页">${escapeHtml(authorName)}</button>`
      : `<span class="user-space__feed-card__name">${escapeHtml(authorName)}</span>`;

  const metaTitle = escapeHtml(feedCardMetaTitle(item));
  const metaCover = escapeHtml(feedCardMetaCover(item));

  return `
    <article
      class="user-space__feed-card"
      data-feed-id="${item.id}"
      data-feed-author-id="${authorId ?? ''}"
      data-feed-title="${metaTitle}"
      data-feed-cover="${metaCover}"
    >
      <div class="user-space__feed-card__top">
        <header class="user-space__feed-card__head">
          ${avatarHtml}
          <div class="user-space__feed-card__who">
            <div class="user-space__feed-card__name-row">
              ${nameHtml}
              ${pinHtml}
            </div>
            <div class="user-space__feed-card__meta">
              <span class="user-space__feed-card__stat">
                ${viewCountIcon('user-space__feed-card__stat-icon')}${escapeHtml(viewsLabel)}
              </span>
              ${
                dateLabel
                  ? `<span class="user-space__feed-card__meta-sep" aria-hidden="true">·</span><time class="user-space__feed-card__time" datetime="${escapeHtml(item.createdAt ?? '')}">${escapeHtml(dateLabel)}</time>`
                  : ''
              }
            </div>
          </div>
        </header>
        <div class="user-space__feed-card__more-wrap">
          <button
            type="button"
            class="user-space__feed-card__more"
            aria-label="更多"
            aria-haspopup="menu"
            aria-expanded="false"
          >${materialIcon('more_vert')}</button>
          <div class="user-space__feed-card__menu" role="menu" hidden>
            <button type="button" class="user-space__feed-card__menu-item" role="menuitem" data-feed-action="forward">
              ${materialIcon('forward', 'user-space__feed-card__menu-icon')}转发
            </button>
            <button type="button" class="user-space__feed-card__menu-item user-space__feed-card__menu-item--danger" role="menuitem" data-feed-action="delete" hidden>
              ${materialIcon('delete', 'user-space__feed-card__menu-icon')}删除
            </button>
            <button type="button" class="user-space__feed-card__menu-item" role="menuitem" data-feed-action="report">
              ${materialIcon('flag', 'user-space__feed-card__menu-icon')}举报
            </button>
          </div>
        </div>
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
/**
 * @param {ParentNode} [root]
 */
async function hydrateFeedVideoFollowButtons(root = document) {
  if (!loadSession()?.token) return;
  const selfId = sessionUserId(loadSession()?.user);
  const buttons = root.querySelectorAll('.user-space__feed-video__follow[data-follow-user-id]');
  await Promise.all(
    [...buttons].map(async (btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const userId = Number.parseInt(btn.getAttribute('data-follow-user-id') ?? '', 10);
      if (!Number.isFinite(userId) || userId === selfId) return;
      try {
        const followed = await fetchFollowStatus(userId);
        if (!followed) return;
        btn.textContent = '已关注';
        btn.classList.add('is-followed');
      } catch {
        /* ignore */
      }
    }),
  );
}

export function hydrateFeedCards(items, domIdPrefix = 'timeline-feed', opts = {}) {
  const clampBody = opts.clampBody !== false;
  void loadStickerUrlMap().catch(() => {});
  items.forEach((item) => {
    const titleEl = document.getElementById(`${domIdPrefix}-title-${item.id}`);
    const bodyEl = document.getElementById(`${domIdPrefix}-body-${item.id}`);
    const titleSource = item.rawTitle?.trim() || item.title?.trim() || '';
    if (titleEl && titleSource) {
      mountRichContent(titleEl, titleSource);
    }
    if (bodyEl) {
      const source = item.rawContent?.trim() || item.content?.trim() || '分享了一条动态';
      mountRichContent(bodyEl, source);
      bodyEl.parentElement?.querySelector('.user-space__feed-card__expand')?.remove();
      if (clampBody) setupFeedTextExpand(bodyEl);
    }
  });
  void hydrateFeedVideoFollowButtons(document);
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
    notify(err instanceof Error ? err.message : '关注失败', 'error');
  }
}

/**
 * @param {MouseEvent} event
 * @param {{
 *   onOpenUserSpace?: (userId: number) => void,
 *   profileName?: string,
 *   openFeedOverride?: (feedId: number, card: HTMLElement) => boolean,
 * }} options
 */
export function handleTimelineFeedClick(event, options = {}) {
  const target = /** @type {HTMLElement} */ (event.target);

  const menuAction = target.closest('[data-feed-action]');
  if (menuAction instanceof HTMLElement) {
    event.preventDefault();
    event.stopPropagation();
    const card = menuAction.closest('.user-space__feed-card');
    const action = menuAction.getAttribute('data-feed-action');
    if (card && action) void runFeedCardAction(action, card);
    return true;
  }

  const moreBtn = target.closest('.user-space__feed-card__more');
  if (moreBtn instanceof HTMLButtonElement) {
    event.preventDefault();
    event.stopPropagation();
    const wrap = moreBtn.closest('.user-space__feed-card__more-wrap');
    const card = moreBtn.closest('.user-space__feed-card');
    const menu = wrap?.querySelector('.user-space__feed-card__menu');
    if (!card || !menu) return true;
    const wasOpen = !menu.hidden;
    closeAllFeedCardMenus();
    if (!wasOpen) {
      syncFeedCardMenuItems(card);
      menu.hidden = false;
      moreBtn.setAttribute('aria-expanded', 'true');
    }
    return true;
  }

  const feedFollow = target.closest('.user-space__feed-video__follow');
  if (feedFollow instanceof HTMLButtonElement) {
    event.preventDefault();
    event.stopPropagation();
    void handleFeedVideoFollow(feedFollow);
    return true;
  }

  const profileBtn = target.closest('[data-author-profile]');
  if (profileBtn instanceof HTMLElement) {
    event.preventDefault();
    event.stopPropagation();
    const uid = Number.parseInt(profileBtn.getAttribute('data-author-profile') ?? '', 10);
    if (Number.isFinite(uid)) options.onOpenUserSpace?.(uid);
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
      if (options.openFeedOverride?.(id, feedCard)) return true;
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
 *   openFeedOverride?: (feedId: number, card: HTMLElement) => boolean,
 * }} options
 */
export function bindTimelineFeedClick(root, options = {}) {
  ensureFeedCardMenuDocumentClose();
  root?.addEventListener('click', (event) => {
    handleTimelineFeedClick(event, options);
  });
}
