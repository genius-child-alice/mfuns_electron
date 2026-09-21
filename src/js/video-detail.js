import { notify } from './notice-ui.js';
import { materialIcon, viewCountIcon } from './icons.js';
import { mediaSrcForCover } from './content-api.js';
import { destroyWatchPlayer, getWatchPlayer } from './watch-player.js';
import { mountRichContent } from './rich-content.js';
import { loadStickerUrlMap } from './emoji-pack.js';
import { loadSession } from './auth.js';
import { getCurrentPage, setPage } from './pages.js';
import { requireLogin } from './login-ui.js';
import {
  fetchCommentList,
  fetchFollowStatus,
  fetchReactionStatus,
  fetchRelatedVideos,
  fetchVideoDetail,
  fetchVideoPlayParts,
  formatVideoCopyrightLabel,
  setFollow,
  setResourceReaction,
} from './video-api.js';
import { fetchUserProfile } from './user-profile-api.js';
import { resolveFavoriteStatus, resolveMineUserId } from './favorite-api.js';
import { toggleResourceFavorite } from './favorite-ui.js';
import { openRewardDialog } from './reward-ui.js';
import { openShareDialog } from './share-ui.js';
import { coinInteractLabel, favoriteInteractLabel } from './interact-bar-labels.js';
import { isVideoInWatchLater, toggleVideoWatchLater } from './watch-later-store.js';
import {
  bindCommentSection,
  createCommentReplyStore,
  mountAllCommentRichText,
  renderCommentsHtml,
} from './comment-ui.js';
import { bindTagButtons, renderTagButtons } from './tag-page.js';
import { commentComposerTriggerHtml, openCommentComposer } from './comment-composer.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */
/** @typedef {import('./video-api.js').VideoDetail} VideoDetail */
/** @typedef {import('./video-api.js').VideoPart} VideoPart */

/** @type {import('./pages.js').PageId} */
let returnPage = 'home';

/** @type {VideoDetail | null} */
let currentDetail = null;

/** @type {VideoPart[]} */
let currentParts = [];

let activePartIndex = 0;
let activeTab = 'intro';
let liked = false;
let likeCount = 0;
let disliked = false;
let dislikeCount = 0;
let following = false;
let authorFans = 0;
let authorTotalLikes = 0;
let descExpanded = false;
let favorited = false;
/** @type {number | null} */
let favoriteListId = null;
let rewardCount = 0;
let favoriteCount = 0;
let watchLater = false;

/** @type {ContentPreview[]} */
let relatedItems = [];

/** @type {import('./video-api.js').CommunityComment[]} */
let commentItems = [];

const commentReplyStore = createCommentReplyStore();

const COMMENT_BODY_PREFIX = 'watch-comment-body';
const COMMENT_REPLY_PREFIX = 'watch-comment-reply';

function refreshCommentsUi() {
  const list = document.getElementById('watch-comments-list');
  if (!list) return;
  list.innerHTML = renderCommentsHtml(commentItems, {
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
    replyStore: commentReplyStore,
  });
  mountAllCommentRichText(commentItems, commentReplyStore, {
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
  });
}

/**
 * @param {number} n
 */
function formatCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
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
 * @param {number | null | undefined} userId
 * @param {string} innerHtml
 * @param {string} className
 * @param {string} [title]
 */
function authorProfileLink(userId, innerHtml, className, title = '进入空间') {
  if (userId == null || userId <= 0) return innerHtml;
  return `<button type="button" class="watch-user-link ${className}" data-author-profile="${userId}" title="${title}">${innerHtml}</button>`;
}

function getRoot() {
  return document.getElementById('watch-page-root');
}

/**
 * @param {ContentPreview[]} items
 */
function renderRelatedList(items) {
  if (items.length === 0) {
    return '<p class="watch-related__empty">暂无相关推荐</p>';
  }
  return items
    .map((item) => {
      const coverSrc = mediaSrcForCover(item.cover);
      const cover = coverSrc
        ? `<img class="watch-related__thumb" src="${escapeHtml(coverSrc)}" alt="" loading="lazy" />`
        : '<span class="watch-related__thumb watch-related__thumb--ph"></span>';
      return `
        <button type="button" class="watch-related__item" data-related-id="${escapeHtml(item.id)}">
          ${cover}
          <span class="watch-related__title">${escapeHtml(item.title)}</span>
        </button>`;
    })
    .join('');
}

function formatDateTime(iso) {
  if (iso == null || iso === '') return '';
  let d;
  if (typeof iso === 'number' && Number.isFinite(iso)) {
    d = new Date(iso < 1e12 ? iso * 1000 : iso);
  } else {
    d = new Date(`${iso}`);
  }
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * @param {VideoPart[]} parts
 * @param {number} activeIndex
 * @param {string} videoTitle
 * @param {number} views
 */
function renderSeriesPlaylist(parts, activeIndex, videoTitle, views) {
  if (parts.length <= 1) return '';
  return `
    <section class="watch-series">
      <header class="watch-series__head">
        <div class="watch-series__head-main">
          <p class="watch-series__title">分P列表 (${activeIndex + 1}/${parts.length})</p>
          <p class="watch-series__sub">${formatCount(views)}播放</p>
        </div>
      </header>
      <ol class="watch-series__list">
        ${parts
          .map(
            (part, index) => `
          <li>
            <button type="button" class="watch-series__item ${index === activeIndex ? 'is-active' : ''}" data-part-index="${index}">
              ${
                index === activeIndex
                  ? materialIcon('graphic_eq', 'watch-series__playing')
                  : '<span class="watch-series__playing watch-series__playing--ph"></span>'
              }
              <span class="watch-series__name">${escapeHtml(part.title || videoTitle)}</span>
            </button>
          </li>`,
          )
          .join('')}
      </ol>
    </section>`;
}

function renderIntroToolbar() {
  return `
    <div class="watch-interact-bar" role="toolbar" aria-label="视频互动">
      <button type="button" class="watch-interact-bar__item ${liked ? 'is-active' : ''}" id="watch-like-btn">
        <span class="watch-interact-bar__icon">${materialIcon('thumb_up')}</span>
        <span class="watch-interact-bar__label">${formatCount(likeCount)}</span>
      </button>
      <button type="button" class="watch-interact-bar__item ${disliked ? 'is-active' : ''}" id="watch-dislike-btn">
        <span class="watch-interact-bar__icon">${materialIcon('thumb_down')}</span>
        <span class="watch-interact-bar__label">${formatCount(dislikeCount)}</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="watch-coin-btn" title="投币支持">
        <span class="watch-interact-bar__icon">${materialIcon('paid')}</span>
        <span class="watch-interact-bar__label">${coinInteractLabel(rewardCount)}</span>
      </button>
      <button type="button" class="watch-interact-bar__item ${favorited ? 'is-active' : ''}" id="watch-fav-btn">
        <span class="watch-interact-bar__icon">${materialIcon('star')}</span>
        <span class="watch-interact-bar__label">${favoriteInteractLabel(favoriteCount, favorited)}</span>
      </button>
      <button type="button" class="watch-interact-bar__item ${watchLater ? 'is-active' : ''}" id="watch-later-btn" title="稍后再看">
        <span class="watch-interact-bar__icon">${materialIcon('schedule')}</span>
        <span class="watch-interact-bar__label">${watchLater ? '已添加' : '稍后再看'}</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="watch-share-btn">
        <span class="watch-interact-bar__icon">${materialIcon('share')}</span>
        <span class="watch-interact-bar__label">分享</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="watch-forward-feed-btn">
        <span class="watch-interact-bar__icon">${materialIcon('edit_note')}</span>
        <span class="watch-interact-bar__label">转动态</span>
      </button>
    </div>`;
}

function renderSidePanel() {
  const detail = currentDetail;
  if (!detail) return;
  const { preview } = detail;
  const avatarSrc = mediaSrcForCover(detail.authorAvatar);
  const side = document.getElementById('watch-side-panel');
  if (!side) return;

  const authorMeta =
    authorFans > 0 || authorTotalLikes > 0
      ? `${formatCount(authorFans)}粉丝 · ${formatCount(authorTotalLikes)}获赞`
      : 'MFuns 创作者';
  const hasDesc = Boolean(detail.rawDescription);
  const publishIso = detail.publishedAt ?? preview.createdAt;
  const dateLabel = formatDateTime(publishIso);
  const danmakuCount = detail.danmakuCount ?? 0;
  const copyrightLabel = formatVideoCopyrightLabel(detail.copyright);

  side.innerHTML = `
    <div class="watch-tabs" role="tablist">
      <div class="watch-tabs__list">
        <button type="button" class="watch-tabs__btn ${activeTab === 'intro' ? 'is-active' : ''}" data-watch-tab="intro" role="tab">简介</button>
        <button type="button" class="watch-tabs__btn ${activeTab === 'comments' ? 'is-active' : ''}" data-watch-tab="comments" role="tab">
          评论<span class="watch-tabs__count">${formatCount(preview.comments)}</span>
        </button>
      </div>
      <button type="button" class="watch-tabs__more" aria-label="更多" title="更多">
        ${materialIcon('more_vert')}
      </button>
    </div>
    <div class="watch-side-scroll">
      <div class="watch-tab-panel watch-tab-panel--intro" data-watch-panel="intro" ${activeTab === 'intro' ? '' : 'hidden'}>
        ${
          currentParts.length === 0
            ? '<p class="watch-playback-hint">暂无可用播放地址</p>'
            : ''
        }
        <div class="watch-author">
          <div class="watch-author__main">
            ${
              avatarSrc && detail.authorId
                ? `<button type="button" class="watch-user-link watch-author__avatar-btn" data-author-profile="${detail.authorId}" title="进入空间"><img class="watch-author__avatar" src="${escapeHtml(avatarSrc)}" alt="" /></button>`
                : avatarSrc
                  ? `<img class="watch-author__avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
                  : '<span class="watch-author__avatar watch-author__avatar--ph"></span>'
            }
            <div class="watch-author__info">
              ${
                detail.authorId
                  ? authorProfileLink(
                      detail.authorId,
                      escapeHtml(preview.author),
                      'watch-author__name',
                    )
                  : `<p class="watch-author__name">${escapeHtml(preview.author)}</p>`
              }
              <p class="watch-author__meta">${escapeHtml(authorMeta)}</p>
            </div>
          </div>
          ${
            detail.authorId
              ? `<button type="button" class="watch-follow-btn ${following ? 'is-followed' : ''}" id="watch-follow-btn">${following ? '已关注' : '+ 关注'}</button>`
              : ''
          }
        </div>

        <div class="watch-video-head">
          <h1 class="watch-video-title">${escapeHtml(preview.title)}</h1>
          ${
            hasDesc
              ? `<button type="button" class="watch-expand-btn" id="watch-desc-expand" aria-expanded="${descExpanded}">
                  ${descExpanded ? '收起' : '展开'}
                  ${materialIcon(descExpanded ? 'expand_less' : 'expand_more', 'watch-expand-btn__icon')}
                </button>`
              : ''
          }
        </div>

        <div class="watch-video-meta">
          <span>${viewCountIcon('watch-meta-icon')}${formatCount(preview.views)}</span>
          <span>${materialIcon('subtitles', 'watch-meta-icon')}${formatCount(danmakuCount)}</span>
          ${
            dateLabel
              ? `<span class="watch-video-meta__time">${materialIcon('schedule', 'watch-meta-icon')}<time datetime="${escapeHtml(publishIso ?? '')}">${escapeHtml(dateLabel)}</time></span>`
              : ''
          }
          ${
            copyrightLabel
              ? `<span class="watch-video-meta__copyright">${escapeHtml(copyrightLabel)}</span>`
              : ''
          }
        </div>

        ${renderIntroToolbar()}

        ${
          hasDesc
            ? `<div class="watch-desc-block ${descExpanded ? 'watch-desc-block--expanded' : ''}" id="watch-desc-block">
                <div class="watch-desc markdown-body" id="watch-desc-rich"></div>
                ${
                  detail.tags.length
                    ? `<div class="watch-tags">${renderTagButtons(detail.tags)}</div>`
                    : ''
                }
              </div>`
            : detail.tags.length
              ? `<div class="watch-tags watch-tags--solo">${renderTagButtons(detail.tags)}</div>`
              : ''
        }

        ${renderSeriesPlaylist(currentParts, activePartIndex, preview.title, preview.views)}

        <section class="watch-related">
          <h2 class="watch-related__heading">相关推荐</h2>
          <div class="watch-related__list">${renderRelatedList(relatedItems)}</div>
        </section>
      </div>
      <div class="watch-tab-panel" data-watch-panel="comments" ${activeTab === 'comments' ? '' : 'hidden'}>
        <div class="watch-comment-form" id="watch-comment-form">
          ${commentComposerTriggerHtml('发一条友善的评论', 'watch-comment-trigger', 'watch-comment-trigger')}
        </div>
        <div class="watch-comments" id="watch-comments-list">${renderCommentsHtml(commentItems, { bodyIdPrefix: COMMENT_BODY_PREFIX, replyBodyIdPrefix: COMMENT_REPLY_PREFIX, replyStore: commentReplyStore })}</div>
      </div>
    </div>`;

  bindSidePanelEvents();
  hydrateRichMarkdown();
}

function hydrateRichMarkdown() {
  const detail = currentDetail;
  const descEl = document.getElementById('watch-desc-rich');
  if (descEl && detail?.rawDescription) {
    mountRichContent(descEl, detail.rawDescription);
  }
  mountAllCommentRichText(commentItems, commentReplyStore, {
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
  });
}

function updateSeriesActiveState(index) {
  document.querySelectorAll('.watch-series__item[data-part-index]').forEach((btn) => {
    const partIndex = Number(btn.getAttribute('data-part-index'));
    const isActive = partIndex === index;
    btn.classList.toggle('is-active', isActive);
    const iconSlot = btn.querySelector('.watch-series__playing, .watch-series__playing--ph');
    if (!iconSlot) return;
    if (isActive) {
      iconSlot.outerHTML = materialIcon('graphic_eq', 'watch-series__playing');
    } else {
      iconSlot.outerHTML = '<span class="watch-series__playing watch-series__playing--ph"></span>';
    }
  });
  const titleEl = document.querySelector('.watch-series__title');
  if (titleEl && currentParts.length > 0) {
    titleEl.textContent = `分P列表 (${index + 1}/${currentParts.length})`;
  }
}

async function toggleVideoReaction(dislike) {
  if (!currentDetail || !requireLogin()) return;
  try {
    const active = dislike ? disliked : liked;
    const action = active ? 'cancel' : dislike ? 'dislike' : 'like';
    await setResourceReaction(Number(currentDetail.preview.id), action, 1);
    const status = await fetchReactionStatus(Number(currentDetail.preview.id), 1);
    liked = status.liked;
    disliked = status.disliked;
    likeCount = status.likes;
    dislikeCount = status.dislikes;
    renderSidePanel();
  } catch (err) {
    notify(err instanceof Error ? err.message : '操作失败', 'error');
  }
}

function bindSidePanelEvents() {
  document.querySelectorAll('[data-watch-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-watch-tab');
      if (tab !== 'intro' && tab !== 'comments') return;
      activeTab = tab;
      document.querySelectorAll('[data-watch-tab]').forEach((el) => {
        el.classList.toggle('is-active', el.getAttribute('data-watch-tab') === tab);
      });
      document.querySelectorAll('[data-watch-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-watch-panel') !== tab;
      });
    });
  });

  document.getElementById('watch-later-btn')?.addEventListener('click', () => {
    if (!currentDetail || !requireLogin()) return;
    const userId = resolveMineUserId(null);
    if (userId == null) return;
    watchLater = toggleVideoWatchLater(userId, currentDetail.preview);
    renderSidePanel();
  });

  document.getElementById('watch-fav-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    void toggleResourceFavorite({
      resourceId: currentDetail.preview.id,
      resourceType: 1,
      favorited,
      listId: favoriteListId,
      onChange: (next) => {
        const wasFavorited = favorited;
        favorited = next.favorited;
        favoriteListId = next.listId;
        if (next.favorited && !wasFavorited) favoriteCount += 1;
        else if (!next.favorited && wasFavorited) {
          favoriteCount = Math.max(0, favoriteCount - 1);
        }
        renderSidePanel();
      },
    });
  });

  document.getElementById('watch-coin-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    openRewardDialog({
      resourceId: currentDetail.preview.id,
      resourceType: 1,
      onSuccess: (count) => {
        rewardCount += count;
        renderSidePanel();
      },
    });
  });

  document.getElementById('watch-like-btn')?.addEventListener('click', () => {
    void toggleVideoReaction(false);
  });

  document.getElementById('watch-dislike-btn')?.addEventListener('click', () => {
    void toggleVideoReaction(true);
  });

  document.querySelectorAll('[data-author-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-author-profile'));
      if (!Number.isFinite(id) || id <= 0) return;
      void import('./user-space.js').then(({ openUserSpace }) => openUserSpace(id));
    });
  });

  document.getElementById('watch-follow-btn')?.addEventListener('click', async () => {
    if (!currentDetail?.authorId || !requireLogin()) return;
    try {
      const next = !following;
      await setFollow(currentDetail.authorId, next);
      following = next;
      renderSidePanel();
    } catch (err) {
      notify(err instanceof Error ? err.message : '关注失败', 'error');
    }
  });

  document.getElementById('watch-forward-feed-btn')?.addEventListener('click', () => {
    if (!currentDetail || !requireLogin()) return;
    void import('./feed-forward.js').then(({ openFeedForward }) => {
      openFeedForward({
        resourceId: currentDetail.preview.id,
        resourceType: 1,
        resourceTitle: currentDetail.preview.title,
        resourceCover: currentDetail.preview.cover ?? '',
      });
    });
  });

  document.getElementById('watch-share-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    openShareDialog({
      url: `https://m.mfuns.net/video/${currentDetail.preview.id}`,
      subtitle: currentDetail.preview.title || '复制链接分享给好友',
    });
  });

  document.getElementById('watch-desc-expand')?.addEventListener('click', () => {
    descExpanded = !descExpanded;
    const block = document.getElementById('watch-desc-block');
    const btn = document.getElementById('watch-desc-expand');
    block?.classList.toggle('watch-desc-block--expanded', descExpanded);
    if (btn) {
      btn.setAttribute('aria-expanded', String(descExpanded));
      btn.innerHTML = `${descExpanded ? '收起' : '展开'} ${materialIcon(descExpanded ? 'expand_less' : 'expand_more', 'watch-expand-btn__icon')}`;
    }
  });

  document.querySelectorAll('[data-part-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.getAttribute('data-part-index'));
      if (!Number.isFinite(index)) return;
      activePartIndex = index;
      getWatchPlayer()?.loadPart(index, { autoPlay: true });
      updateSeriesActiveState(index);
    });
  });

  document.querySelectorAll('[data-related-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-related-id');
      if (!id) return;
      const item = relatedItems.find((entry) => entry.id === id);
      if (item) void openVideoDetail(item);
    });
  });

}

function setLoading(loading) {
  const root = getRoot();
  if (!root) return;
  root.classList.toggle('watch-page--loading', loading);
}

/**
 * @param {ContentPreview} preview
 */
export async function openVideoDetail(preview) {
  if (preview.type !== 1) return;
  const currentPage = getCurrentPage();
  if (currentPage !== 'watch') {
    returnPage = currentPage;
  }
  setPage('watch');
  activePartIndex = 0;
  activeTab = 'intro';
  descExpanded = false;
  favorited = false;
  favoriteListId = null;
  rewardCount = 0;
  favoriteCount = 0;
  disliked = false;
  dislikeCount = 0;
  commentReplyStore.clear();
  const userId = resolveMineUserId(null);
  watchLater = userId != null && isVideoInWatchLater(userId, preview.id);
  authorFans = 0;
  authorTotalLikes = 0;
  setLoading(true);

  getWatchPlayer()?.destroy();
  void loadStickerUrlMap().catch(() => {});

  try {
    const [detail, parts, related] = await Promise.all([
      fetchVideoDetail(preview),
      fetchVideoPlayParts(preview.id),
      fetchRelatedVideos(preview),
    ]);
    currentDetail = detail;
    currentParts = parts;
    rewardCount = detail.rewardCount;
    favoriteCount = detail.favoriteCount;

    const poster = detail.preview.cover ? mediaSrcForCover(detail.preview.cover) : null;
    if (parts.length > 0) {
      getWatchPlayer()?.load({
        parts,
        partIndex: 0,
        videoId: detail.preview.id,
        poster: poster ?? undefined,
        onPartChange: () => {
          const wp = getWatchPlayer();
          if (!wp) return;
          activePartIndex = wp.partIndex;
          updateSeriesActiveState(activePartIndex);
        },
      });
    }

    const session = loadSession();
    const likePromise = fetchReactionStatus(Number(detail.preview.id), 1).catch(() => ({
      liked: false,
      disliked: false,
      likes: detail.likes,
      dislikes: 0,
    }));
    const followPromise =
      detail.authorId && session?.token
        ? fetchFollowStatus(detail.authorId).catch(() => false)
        : Promise.resolve(false);
    const favoritePromise =
      session?.token
        ? resolveFavoriteStatus(resolveMineUserId(null), detail.preview.id, 1).catch(() => ({
            favorited: false,
            listId: null,
            folderIds: new Set(),
          }))
        : Promise.resolve({ favorited: false, listId: null, folderIds: new Set() });
    const authorProfilePromise =
      detail.authorId != null
        ? fetchUserProfile(detail.authorId).catch(() => null)
        : Promise.resolve(null);

    const [likeStatus, followStatus, authorProfile, favoriteStatus] = await Promise.all([
      likePromise,
      followPromise,
      authorProfilePromise,
      favoritePromise,
    ]);
    liked = likeStatus.liked;
    disliked = likeStatus.disliked;
    likeCount = likeStatus.likes || detail.likes;
    dislikeCount = likeStatus.dislikes;
    following = followStatus;
    favorited = favoriteStatus.favorited;
    favoriteListId = favoriteStatus.listId;
    const uid = resolveMineUserId(null);
    watchLater = uid != null && isVideoInWatchLater(uid, detail.preview.id);
    if (authorProfile) {
      authorFans = authorProfile.fans;
      authorTotalLikes = authorProfile.totalLikes;
    }

    let comments = [];
    if (detail.commentAreaId) {
      comments = await fetchCommentList(detail.commentAreaId, 1).catch(() => []);
    }

    relatedItems = related;
    commentItems = comments;
    renderSidePanel();
  } catch (err) {
    const side = document.getElementById('watch-side-panel');
    if (side) {
      side.innerHTML = `<div class="watch-error"><p>${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p></div>`;
    }
  } finally {
    setLoading(false);
  }
}

export function closeVideoDetail() {
  destroyWatchPlayer();
  setPage(returnPage);
  void import('./mine-page.js').then((mod) => mod.refreshWatchLaterIfActive());
}

export function bindVideoDetail() {
  const watchRoot = document.getElementById('watch-page-root');
  if (watchRoot) bindTagButtons(watchRoot);

  bindCommentSection(watchRoot, {
    getComments: () => commentItems,
    setComments: (comments) => {
      commentItems = comments;
    },
    replyStore: commentReplyStore,
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
    onRefresh: refreshCommentsUi,
  });

  document.getElementById('watch-back-btn')?.addEventListener('click', closeVideoDetail);

  watchRoot?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!target.closest('#watch-comment-trigger')) return;
    if (!currentDetail?.commentAreaId || !requireLogin()) return;
    openCommentComposer({
      title: '发表一个评论',
      areaId: currentDetail.commentAreaId,
      onSuccess: async () => {
        commentItems = await fetchCommentList(currentDetail.commentAreaId, 1);
        commentReplyStore.clear();
        if (currentDetail.preview) {
          currentDetail.preview.comments = Math.max(
            currentDetail.preview.comments,
            commentItems.length,
          );
        }
        renderSidePanel();
      },
    });
  });

  window.addEventListener('mfuns:danmaku-sent', () => {
    if (!currentDetail) return;
    currentDetail.danmakuCount += 1;
    renderSidePanel();
  });

  window.addEventListener('mfuns:danmaku-loaded', (event) => {
    const detail = /** @type {CustomEvent<{ count?: number }>} */ (event).detail;
    const count = detail?.count;
    if (!currentDetail || typeof count !== 'number') return;
    if (currentDetail.danmakuCount < count) {
      currentDetail.danmakuCount = count;
      renderSidePanel();
    }
  });
}
