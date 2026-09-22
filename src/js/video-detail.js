import { notify } from './notice-ui.js';
import { materialIcon, viewCountIcon } from './icons.js';
import { mediaSrcForCover, formatContentArchiveNo } from './content-api.js';
import { getWatchPlayer } from './watch-player.js';
import { mountRichContent } from './rich-content.js';
import { loadStickerUrlMap } from './emoji-pack.js';
import { loadSession } from './auth.js';
import {
  getScrollTop,
  navigateBack,
  navigateTo,
  registerPageNavigation,
  restoreScrollTop,
} from './navigation.js';
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
import {
  downloadVideoToOffline,
  findOfflineEntry,
  offlinePlaybackSrc,
} from './offline-cache-store.js';
import {
  isInWatchLater,
  resolveWatchLaterUserId,
  toggleWatchLater,
} from './watch-later-store.js';
import {
  bindCommentSection,
  createCommentReplyStore,
  mountAllCommentRichText,
  renderCommentsHtml,
} from './comment-ui.js';
import { bindTagButtons, renderTagButtons } from './tag-page.js';
import { commentComposerTriggerHtml, openCommentComposer } from './comment-composer.js';
import { fetchSeriesContext, seriesItemToPreview } from './series-api.js';
import { getPlayerConfig } from './player-preferences.js';
import {
  bindCollectionNav,
  canManageContentSeries,
  openSeriesPickerDialog,
  renderCollectionNavHtml,
} from './series-ui.js';
import { openReportDialog } from './report-ui.js';
import { REPORT_RESOURCE } from './member-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */
/** @typedef {import('./video-api.js').VideoDetail} VideoDetail */
/** @typedef {import('./video-api.js').VideoPart} VideoPart */


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
let offlineCached = false;
let offlineDownloading = false;

/** @type {ContentPreview[]} */
let relatedItems = [];

/** @type {import('./video-api.js').CommunityComment[]} */
let commentItems = [];

let collectionNavHtml = '';
let canManageSeries = false;
/** @type {import('./series-api.js').SeriesItem[]} */
let seriesPlaylistItems = [];

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
function renderPartsPlaylist(parts, activeIndex, videoTitle, views) {
  if (parts.length <= 1) return '';
  return `
    <section class="watch-parts">
      <header class="watch-parts__head">
        <div class="watch-parts__head-main">
          <p class="watch-parts__title">分P列表 (${activeIndex + 1}/${parts.length})</p>
          <p class="watch-parts__sub">${formatCount(views)}播放</p>
        </div>
      </header>
      <ol class="watch-parts__list">
        ${parts
          .map(
            (part, index) => `
          <li>
            <button type="button" class="watch-parts__item ${index === activeIndex ? 'is-active' : ''}" data-part-index="${index}">
              ${
                index === activeIndex
                  ? materialIcon('graphic_eq', 'watch-parts__playing')
                  : '<span class="watch-parts__playing watch-parts__playing--ph"></span>'
              }
              <span class="watch-parts__name">${escapeHtml(part.title || videoTitle)}</span>
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
      <button type="button" class="watch-interact-bar__item ${offlineCached ? 'is-active' : ''}" id="watch-offline-btn" title="离线缓存" ${offlineDownloading ? 'disabled' : ''}>
        <span class="watch-interact-bar__icon">${materialIcon('download')}</span>
        <span class="watch-interact-bar__label">${offlineDownloading ? '缓存中' : offlineCached ? '已缓存' : '缓存'}</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="watch-share-btn">
        <span class="watch-interact-bar__icon">${materialIcon('share')}</span>
        <span class="watch-interact-bar__label">分享</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="watch-report-btn" title="举报">
        <span class="watch-interact-bar__icon">${materialIcon('flag')}</span>
        <span class="watch-interact-bar__label">举报</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="watch-forward-feed-btn">
        <span class="watch-interact-bar__icon">${materialIcon('edit_note')}</span>
        <span class="watch-interact-bar__label">转动态</span>
      </button>
      ${
        canManageSeries
          ? `<button type="button" class="watch-interact-bar__item" id="watch-series-manage-btn" title="加入合集">
              <span class="watch-interact-bar__icon">${materialIcon('video_library')}</span>
              <span class="watch-interact-bar__label">合集</span>
            </button>`
          : ''
      }
    </div>`;
}

async function reloadVideoCollectionNav() {
  if (!currentDetail) return;
  collectionNavHtml = '';
  try {
    const detail = await fetchVideoDetail(currentDetail.preview);
    currentDetail = detail;
    if (detail.seriesId) {
      const ctx = await fetchSeriesContext(detail.seriesId, Number(detail.preview.id), 1);
      collectionNavHtml = renderCollectionNavHtml(ctx);
    }
  } catch {
    /* ignore */
  }
  renderSidePanel();
}

/**
 * @param {import('./series-api.js').ReturnType<typeof fetchSeriesContext> extends Promise<infer T> ? T : never} ctx
 */
function buildMfunsSeriesPayload(ctx) {
  if (!ctx?.items?.length || !currentDetail) return null;
  const order = getPlayerConfig().seriesOrder;
  const items = ctx.items.filter((item) => item.resourceType === 1);
  if (!items.length) return null;
  const ordered = order === 'reverse' ? [...items].reverse() : items;
  return {
    title: ctx.info.title,
    currentId: Number(currentDetail.preview.id),
    order,
    items: ordered.map((item) => ({ id: item.resourceId, title: item.title })),
    shuffleKey: `series:${ctx.info.id}`,
  };
}

function handleSwitchSeriesVideo(videoId) {
  if (!Number.isFinite(videoId) || videoId <= 0) return;
  sessionStorage.setItem('mfuns_auto_continue', '1');
  const fromSeries = seriesPlaylistItems.find((item) => item.resourceId === videoId);
  const preview = fromSeries
    ? seriesItemToPreview(fromSeries)
    : {
        id: String(videoId),
        type: 1,
        title: '视频',
        cover: null,
        author: '',
        authorId: null,
        authorAvatar: null,
        views: 0,
        comments: 0,
        duration: null,
        createdAt: null,
      };
  void openVideoDetail(preview);
}

function loadWatchPlayerWithContext(seriesPayload = null) {
  if (!currentDetail || currentParts.length === 0) return;
  getWatchPlayer()?.load({
    parts: currentParts,
    partIndex: activePartIndex,
    videoId: currentDetail.preview.id,
    title: currentDetail.preview.title,
    series: seriesPayload,
    onPartChange: () => {
      const wp = getWatchPlayer();
      if (!wp) return;
      activePartIndex = wp.partIndex;
      updatePartsActiveState(activePartIndex);
    },
    onSwitchSeries: handleSwitchSeriesVideo,
  });
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
      : 'Mfuns 创作者';
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
        <button type="button" class="watch-tabs__btn ${activeTab === 'danmaku' ? 'is-active' : ''}" data-watch-tab="danmaku" role="tab">
          弹幕<span class="watch-tabs__count">${formatCount(danmakuCount)}</span>
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
          <span class="watch-video-meta__no">${escapeHtml(formatContentArchiveNo(preview.id, 1))}</span>
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

        ${collectionNavHtml}

        ${renderPartsPlaylist(currentParts, activePartIndex, preview.title, preview.views)}

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
      <div class="watch-tab-panel watch-tab-panel--danmaku" data-watch-panel="danmaku" ${activeTab === 'danmaku' ? '' : 'hidden'}>
        <div id="danmakuList" class="m-video__danmaku" aria-label="弹幕列表"></div>
      </div>
    </div>`;

  bindSidePanelEvents();
  hydrateRichMarkdown();
  getWatchPlayer()?.reattachDanmakuList();
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

function updatePartsActiveState(index) {
  document.querySelectorAll('.watch-parts__item[data-part-index]').forEach((btn) => {
    const partIndex = Number(btn.getAttribute('data-part-index'));
    const isActive = partIndex === index;
    btn.classList.toggle('is-active', isActive);
    const iconSlot = btn.querySelector('.watch-parts__playing, .watch-parts__playing--ph');
    if (!iconSlot) return;
    if (isActive) {
      iconSlot.outerHTML = materialIcon('graphic_eq', 'watch-parts__playing');
    } else {
      iconSlot.outerHTML = '<span class="watch-parts__playing watch-parts__playing--ph"></span>';
    }
  });
  const titleEl = document.querySelector('.watch-parts__title');
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
      if (tab !== 'intro' && tab !== 'comments' && tab !== 'danmaku') return;
      activeTab = tab;
      document.querySelectorAll('[data-watch-tab]').forEach((el) => {
        el.classList.toggle('is-active', el.getAttribute('data-watch-tab') === tab);
      });
      document.querySelectorAll('[data-watch-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-watch-panel') !== tab;
      });
      if (tab === 'danmaku') {
        getWatchPlayer()?.reattachDanmakuList();
      }
    });
  });

  document.getElementById('watch-later-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    watchLater = toggleWatchLater(resolveWatchLaterUserId(), currentDetail.preview);
    notify(watchLater ? '已加入稍后再看' : '已移出稍后再看', 'success');
    renderSidePanel();
  });

  document.getElementById('watch-offline-btn')?.addEventListener('click', () => {
    if (!currentDetail || offlineCached || offlineDownloading) return;
    if (!window.electronAPI?.offline?.download) {
      notify('离线缓存仅支持桌面客户端', 'error');
      return;
    }
    offlineDownloading = true;
    renderSidePanel();
    void downloadVideoToOffline(currentDetail.preview, activePartIndex, (msg) => {
      notify(msg, 'info');
    })
      .then(() => {
        offlineCached = true;
      })
      .catch((err) => {
        notify(err instanceof Error ? err.message : '缓存失败', 'error');
      })
      .finally(() => {
        offlineDownloading = false;
        renderSidePanel();
      });
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

  document.getElementById('watch-series-manage-btn')?.addEventListener('click', () => {
    if (!currentDetail || !requireLogin()) return;
    void openSeriesPickerDialog({
      resourceId: Number(currentDetail.preview.id),
      resourceType: 1,
      onComplete: () => void reloadVideoCollectionNav(),
    });
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

  document.getElementById('watch-report-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    openReportDialog({
      resourceId: Number(currentDetail.preview.id),
      resourceType: REPORT_RESOURCE.video,
      title: currentDetail.preview.title,
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
      updatePartsActiveState(index);
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
async function loadWatchPage(preview) {
  if (preview.type !== 1) return;
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
  collectionNavHtml = '';
  canManageSeries = false;
  seriesPlaylistItems = [];
  watchLater = isInWatchLater(resolveWatchLaterUserId(), preview.id, 1);
  offlineCached = Boolean(findOfflineEntry(preview.id, 0));
  offlineDownloading = false;
  authorFans = 0;
  authorTotalLikes = 0;
  setLoading(true);

  // 只重置播放器实例，保留主题监听（destroy 会卸掉监听且单例仍在）
  getWatchPlayer()?.reset();
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
    offlineCached = Boolean(findOfflineEntry(preview.id, activePartIndex));

    const offline = findOfflineEntry(preview.id, activePartIndex);
    const offlineSrc = offline ? offlinePlaybackSrc(offline.fileName) : null;
    if (offlineSrc && parts[activePartIndex]) {
      parts[activePartIndex].qualities = [
        {
          part: parts[activePartIndex].part,
          name: '离线',
          label: offline.qualityLabel,
          url: offlineSrc,
        },
      ];
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
    watchLater = isInWatchLater(resolveWatchLaterUserId(), detail.preview.id, 1);
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

    canManageSeries = await canManageContentSeries(detail.authorId);

    collectionNavHtml = '';
    /** @type {object | null} */
    let seriesPayload = null;
    if (detail.seriesId) {
      try {
        const ctx = await fetchSeriesContext(
          detail.seriesId,
          Number(detail.preview.id),
          1,
        );
        seriesPlaylistItems = ctx.items;
        collectionNavHtml = renderCollectionNavHtml(ctx);
        seriesPayload = buildMfunsSeriesPayload(ctx);
      } catch {
        /* ignore */
      }
    }

    renderSidePanel();
    if (parts.length > 0) {
      loadWatchPlayerWithContext(seriesPayload);
    }
  } catch (err) {
    const side = document.getElementById('watch-side-panel');
    if (side) {
      side.innerHTML = `<div class="watch-error"><p>${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p></div>`;
    }
  } finally {
    setLoading(false);
  }
}

function captureWatchPageState() {
  return {
    hydrated: Boolean(currentDetail),
    currentDetail,
    currentParts,
    activePartIndex,
    activeTab,
    liked,
    likeCount,
    disliked,
    dislikeCount,
    following,
    authorFans,
    authorTotalLikes,
    descExpanded,
    favorited,
    favoriteListId,
    rewardCount,
    favoriteCount,
    watchLater,
    offlineCached,
    offlineDownloading,
    relatedItems,
    commentItems,
    collectionNavHtml,
    canManageSeries,
    scrollTop: getScrollTop('main-content'),
  };
}

/**
 * @param {ReturnType<typeof captureWatchPageState>} state
 */
function applyWatchPageState(state) {
  currentDetail = state.currentDetail ?? null;
  currentParts = state.currentParts ?? [];
  activePartIndex = state.activePartIndex ?? 0;
  activeTab = state.activeTab ?? 'intro';
  liked = state.liked ?? false;
  likeCount = state.likeCount ?? 0;
  disliked = state.disliked ?? false;
  dislikeCount = state.dislikeCount ?? 0;
  following = state.following ?? false;
  authorFans = state.authorFans ?? 0;
  authorTotalLikes = state.authorTotalLikes ?? 0;
  descExpanded = state.descExpanded ?? false;
  favorited = state.favorited ?? false;
  favoriteListId = state.favoriteListId ?? null;
  rewardCount = state.rewardCount ?? 0;
  favoriteCount = state.favoriteCount ?? 0;
  watchLater = state.watchLater ?? false;
  offlineCached = state.offlineCached ?? false;
  offlineDownloading = state.offlineDownloading ?? false;
  relatedItems = state.relatedItems ?? [];
  commentItems = state.commentItems ?? [];
  collectionNavHtml = state.collectionNavHtml ?? '';
  canManageSeries = state.canManageSeries ?? false;
  commentReplyStore.clear();

  renderSidePanel();
  if (currentDetail && currentParts.length > 0) {
    loadWatchPlayerWithContext(null);
  }
  refreshCommentsUi();
  restoreScrollTop('main-content', state.scrollTop ?? 0);
}

/**
 * @param {ContentPreview} preview
 */
export async function openVideoDetail(preview) {
  if (preview.type !== 1) return;
  await navigateTo('watch', { preview });
}

export function closeVideoDetail() {
  void navigateBack().then((ok) => {
    if (ok) void import('./mine-page.js').then((mod) => mod.refreshWatchLaterIfActive());
  });
}

export function bindVideoDetail() {
  const watchRoot = document.getElementById('watch-page-root');
  if (watchRoot) bindTagButtons(watchRoot);

  const sidePanel = document.getElementById('watch-side-panel');
  if (sidePanel) bindCollectionNav(sidePanel);

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

  registerPageNavigation('watch', {
    capture: () => captureWatchPageState(),
    restore: (state) => {
      applyWatchPageState(/** @type {ReturnType<typeof captureWatchPageState>} */ (state));
    },
    enter: async (params) => {
      const preview = /** @type {ContentPreview | undefined} */ (params.preview);
      if (preview) await loadWatchPage(preview);
    },
  });
}
