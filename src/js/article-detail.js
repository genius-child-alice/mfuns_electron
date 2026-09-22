import { notify } from './notice-ui.js';
import { materialIcon, viewCountIcon } from './icons.js';
import { mediaSrcForCover, formatContentArchiveNo } from './content-api.js';
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
import { fetchArticleDetail } from './article-api.js';
import {
  COMMENT_LIST_PAGE_SIZE,
  fetchCommentList,
  fetchFollowStatus,
  fetchReactionStatus,
  setFollow,
  setResourceReaction,
} from './video-api.js';
import { renderAuthorAvatarHtml } from './avatar-frame-ui.js';
import { fetchUserProfile } from './user-profile-api.js';
import { resolveFavoriteStatus, resolveMineUserId } from './favorite-api.js';
import { toggleResourceFavorite } from './favorite-ui.js';
import { openRewardDialog } from './reward-ui.js';
import { openShareDialog } from './share-ui.js';
import { openReportDialog } from './report-ui.js';
import { REPORT_RESOURCE } from './member-api.js';
import { coinInteractLabel, favoriteInteractLabel } from './interact-bar-labels.js';
import {
  isInWatchLater,
  resolveWatchLaterUserId,
  toggleWatchLater,
} from './watch-later-store.js';
import {
  bindCommentSection,
  commentListFooterHtml,
  commentSortToolbarHtml,
  createCommentReplyStore,
  mountAllCommentRichText,
  renderCommentsHtml,
} from './comment-ui.js';
import { bindTagButtons, renderTagButtons } from './tag-page.js';
import { commentComposerTriggerHtml, openCommentComposer } from './comment-composer.js';
import { fetchSeriesContext } from './series-api.js';
import {
  bindCollectionNav,
  canManageContentSeries,
  openSeriesPickerDialog,
  renderCollectionNavHtml,
} from './series-ui.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */
/** @typedef {import('./article-api.js').ArticleDetail} ArticleDetail */


/** @type {ArticleDetail | null} */
let currentDetail = null;

let liked = false;
let likeCount = 0;
let disliked = false;
let dislikeCount = 0;
let following = false;
let authorFans = 0;
let authorTotalLikes = 0;
let favorited = false;
/** @type {number | null} */
let favoriteListId = null;
let rewardCount = 0;
let favoriteCount = 0;
let watchLater = false;

/** @type {import('./video-api.js').CommunityComment[]} */
let commentItems = [];

let collectionNavHtml = '';
let canManageSeries = false;

const commentReplyStore = createCommentReplyStore();

const COMMENT_BODY_PREFIX = 'article-comment-body';
const COMMENT_REPLY_PREFIX = 'article-comment-reply';

/** @type {'desc' | 'asc'} */
let commentOrder = 'desc';
let commentListPage = 1;
let commentListHasMore = false;
let commentListLoading = false;

function syncCommentChrome() {
  const toolbar = document.getElementById('article-comments-toolbar');
  if (toolbar) {
    toolbar.outerHTML = commentSortToolbarHtml(commentOrder, 'article-comments-toolbar');
  }
  const footer = document.getElementById('article-comments-footer');
  if (footer) {
    footer.innerHTML = commentListFooterHtml(commentListHasMore, commentListLoading);
  }
}

function refreshCommentsUi() {
  const list = document.getElementById('article-comments-list');
  if (!list) return;
  list.innerHTML = renderCommentsHtml(commentItems, {
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
    replyStore: commentReplyStore,
    resourceAuthorId: currentDetail?.authorId ?? null,
  });
  mountAllCommentRichText(commentItems, commentReplyStore, {
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
  });
  syncCommentChrome();
}

async function loadRootComments(page, { append = false } = {}) {
  const areaId = currentDetail?.commentAreaId;
  if (!areaId) return;
  commentListLoading = true;
  syncCommentChrome();
  try {
    const batch = await fetchCommentList(areaId, page, commentOrder);
    commentListPage = page;
    commentListHasMore = batch.length >= COMMENT_LIST_PAGE_SIZE;
    if (append) {
      const seen = new Set(commentItems.map((item) => item.id));
      commentItems = [...commentItems, ...batch.filter((item) => !seen.has(item.id))];
    } else {
      commentItems = batch;
      commentReplyStore.clear();
    }
  } catch {
    if (!append) commentItems = [];
    commentListHasMore = false;
  } finally {
    commentListLoading = false;
    refreshCommentsUi();
  }
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
  return document.getElementById('article-body-root');
}

function renderInteractBar() {
  return `
    <div class="article-interact watch-interact-bar" role="toolbar" aria-label="文章互动">
      <button type="button" class="watch-interact-bar__item ${liked ? 'is-active' : ''}" id="article-like-btn">
        <span class="watch-interact-bar__icon">${materialIcon('thumb_up')}</span>
        <span class="watch-interact-bar__label">${formatCount(likeCount)}</span>
      </button>
      <button type="button" class="watch-interact-bar__item ${disliked ? 'is-active' : ''}" id="article-dislike-btn">
        <span class="watch-interact-bar__icon">${materialIcon('thumb_down')}</span>
        <span class="watch-interact-bar__label">${formatCount(dislikeCount)}</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="article-coin-btn" title="投币支持">
        <span class="watch-interact-bar__icon">${materialIcon('paid')}</span>
        <span class="watch-interact-bar__label">${coinInteractLabel(rewardCount)}</span>
      </button>
      <button type="button" class="watch-interact-bar__item ${favorited ? 'is-active' : ''}" id="article-fav-btn">
        <span class="watch-interact-bar__icon">${materialIcon('star')}</span>
        <span class="watch-interact-bar__label">${favoriteInteractLabel(favoriteCount, favorited)}</span>
      </button>
      <button type="button" class="watch-interact-bar__item ${watchLater ? 'is-active' : ''}" id="article-later-btn" title="稍后再看">
        <span class="watch-interact-bar__icon">${materialIcon('schedule')}</span>
        <span class="watch-interact-bar__label">${watchLater ? '已添加' : '稍后再看'}</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="article-share-btn">
        <span class="watch-interact-bar__icon">${materialIcon('share')}</span>
        <span class="watch-interact-bar__label">分享</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="article-report-btn" title="举报">
        <span class="watch-interact-bar__icon">${materialIcon('flag')}</span>
        <span class="watch-interact-bar__label">举报</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="article-forward-feed-btn">
        <span class="watch-interact-bar__icon">${materialIcon('edit_note')}</span>
        <span class="watch-interact-bar__label">转动态</span>
      </button>
      ${
        canManageSeries
          ? `<button type="button" class="watch-interact-bar__item" id="article-series-manage-btn" title="加入合集">
              <span class="watch-interact-bar__icon">${materialIcon('video_library')}</span>
              <span class="watch-interact-bar__label">合集</span>
            </button>`
          : ''
      }
    </div>`;
}

async function reloadArticleCollectionNav() {
  if (!currentDetail) return;
  collectionNavHtml = '';
  try {
    const detail = await fetchArticleDetail(currentDetail.preview);
    currentDetail = detail;
    if (detail.seriesId) {
      const ctx = await fetchSeriesContext(detail.seriesId, Number(detail.preview.id), 0);
      collectionNavHtml = renderCollectionNavHtml(ctx);
    }
  } catch {
    /* ignore */
  }
  renderPage();
}

function renderPage() {
  const detail = currentDetail;
  const root = getRoot();
  if (!detail || !root) return;

  const { preview } = detail;
  const coverSrc = mediaSrcForCover(preview.cover);
  const coverHtml = coverSrc
    ? `<figure class="article-read__cover"><img src="${escapeHtml(coverSrc)}" alt="${escapeHtml(preview.title)}" decoding="async" /></figure>`
    : '';
  const publishIso = detail.publishedAt ?? preview.createdAt;
  const dateLabel = formatDateTime(publishIso);
  const authorMeta =
    authorFans > 0 || authorTotalLikes > 0
      ? `${formatCount(authorFans)}粉丝 · ${formatCount(authorTotalLikes)}获赞`
      : 'Mfuns 创作者';

  root.innerHTML = `
    <article class="article-read">
      ${coverHtml}
      <header class="article-read__head">
        <h1 class="article-read__title">${escapeHtml(preview.title)}</h1>
        <div class="article-read__meta">
          <div class="article-read__author">
            ${renderAuthorAvatarHtml({
              authorId: detail.authorId,
              avatar: detail.authorAvatar,
              frame: detail.authorAvatarFrame,
              size: 'article',
              imgClass: 'article-read__avatar',
              phClass: 'article-read__avatar--ph',
              btnClass: 'article-read__avatar-btn',
            })}
            <div class="article-read__author-info">
              ${
                detail.authorId
                  ? authorProfileLink(
                      detail.authorId,
                      escapeHtml(preview.author),
                      'article-read__author-name',
                    )
                  : `<p class="article-read__author-name">${escapeHtml(preview.author)}</p>`
              }
              <p class="article-read__author-meta">${escapeHtml(authorMeta)}</p>
            </div>
            ${
              detail.authorId
                ? `<button type="button" class="watch-follow-btn ${following ? 'is-followed' : ''}" id="article-follow-btn">${following ? '已关注' : '+ 关注'}</button>`
                : ''
            }
          </div>
          <div class="article-read__stats">
            <span>${viewCountIcon('article-read__stat-icon')}${formatCount(preview.views)}阅读</span>
            ${
              dateLabel
                ? `<span class="article-read__time">${materialIcon('schedule', 'article-read__stat-icon')}<time datetime="${escapeHtml(publishIso ?? '')}">${escapeHtml(dateLabel)}</time><span class="article-read__no">${escapeHtml(formatContentArchiveNo(preview.id, 0))}</span></span>`
                : `<span class="article-read__no">${escapeHtml(formatContentArchiveNo(preview.id, 0))}</span>`
            }
          </div>
        </div>
      </header>

      <div class="article-read__content markdown-body" id="article-rich-content"></div>

      ${collectionNavHtml}

      ${
        detail.tags.length
          ? `<div class="article-read__tags watch-tags">${renderTagButtons(detail.tags)}</div>`
          : ''
      }

      ${renderInteractBar()}

      <section class="article-read__comments">
        <h2 class="article-read__comments-title">评论 <span class="article-read__comments-count">${formatCount(preview.comments)}</span></h2>
        <div class="watch-comment-form" id="article-comment-form">
          ${commentComposerTriggerHtml('发一条友善的评论', 'article-comment-trigger', 'watch-comment-trigger')}
        </div>
        <div id="article-comments-toolbar">${commentSortToolbarHtml(commentOrder, 'article-comments-toolbar')}</div>
        <div class="watch-comments" id="article-comments-list">${renderCommentsHtml(commentItems, { bodyIdPrefix: COMMENT_BODY_PREFIX, replyBodyIdPrefix: COMMENT_REPLY_PREFIX, replyStore: commentReplyStore, resourceAuthorId: detail.authorId ?? null })}</div>
        <div id="article-comments-footer">${commentListFooterHtml(commentListHasMore, commentListLoading)}</div>
      </section>
    </article>`;

  bindPageEvents();
  hydrateRichMarkdown();
}

function hydrateRichMarkdown() {
  const detail = currentDetail;
  const contentEl = document.getElementById('article-rich-content');
  if (contentEl && detail?.rawContent) {
    mountRichContent(contentEl, detail.rawContent);
  }
  mountAllCommentRichText(commentItems, commentReplyStore, {
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
  });
}

async function toggleArticleReaction(dislike) {
  if (!currentDetail || !requireLogin()) return;
  try {
    const active = dislike ? disliked : liked;
    const action = active ? 'cancel' : dislike ? 'dislike' : 'like';
    await setResourceReaction(Number(currentDetail.preview.id), action, 0);
    const status = await fetchReactionStatus(Number(currentDetail.preview.id), 0);
    liked = status.liked;
    disliked = status.disliked;
    likeCount = status.likes;
    dislikeCount = status.dislikes;
    renderPage();
  } catch (err) {
    notify(err instanceof Error ? err.message : '操作失败', 'error');
  }
}

function bindPageEvents() {
  document.getElementById('article-fav-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    void toggleResourceFavorite({
      resourceId: currentDetail.preview.id,
      resourceType: 0,
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
        renderPage();
      },
    });
  });

  document.getElementById('article-coin-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    openRewardDialog({
      resourceId: currentDetail.preview.id,
      resourceType: 0,
      onSuccess: (count) => {
        rewardCount += count;
        renderPage();
      },
    });
  });

  document.getElementById('article-like-btn')?.addEventListener('click', () => {
    void toggleArticleReaction(false);
  });

  document.getElementById('article-dislike-btn')?.addEventListener('click', () => {
    void toggleArticleReaction(true);
  });

  document.getElementById('article-later-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    watchLater = toggleWatchLater(resolveWatchLaterUserId(), currentDetail.preview);
    notify(watchLater ? '已加入稍后再看' : '已移出稍后再看', 'success');
    renderPage();
  });

  document.getElementById('article-series-manage-btn')?.addEventListener('click', () => {
    if (!currentDetail || !requireLogin()) return;
    void openSeriesPickerDialog({
      resourceId: Number(currentDetail.preview.id),
      resourceType: 0,
      onComplete: () => void reloadArticleCollectionNav(),
    });
  });

  document.getElementById('article-forward-feed-btn')?.addEventListener('click', () => {
    if (!currentDetail || !requireLogin()) return;
    void import('./feed-forward.js').then(({ openFeedForward }) => {
      openFeedForward({
        resourceId: currentDetail.preview.id,
        resourceType: 0,
        resourceTitle: currentDetail.preview.title,
        resourceCover: currentDetail.preview.cover ?? '',
      });
    });
  });

  document.getElementById('article-share-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    openShareDialog({
      url: `https://m.mfuns.net/article/${currentDetail.preview.id}`,
      subtitle: currentDetail.preview.title || '复制链接分享给好友',
    });
  });

  document.getElementById('article-report-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    openReportDialog({
      resourceId: Number(currentDetail.preview.id),
      resourceType: REPORT_RESOURCE.article,
      title: currentDetail.preview.title,
    });
  });

  document.getElementById('article-follow-btn')?.addEventListener('click', async () => {
    if (!currentDetail?.authorId || !requireLogin()) return;
    try {
      const next = !following;
      await setFollow(currentDetail.authorId, next);
      following = next;
      renderPage();
    } catch (err) {
      notify(err instanceof Error ? err.message : '关注失败', 'error');
    }
  });

  document.querySelectorAll('[data-author-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-author-profile'));
      if (!Number.isFinite(id) || id <= 0) return;
      void import('./user-space.js').then(({ openUserSpace }) => openUserSpace(id));
    });
  });

}

function setLoading(loading) {
  const page = document.getElementById('article-page-root');
  page?.classList.toggle('article-page--loading', loading);
}

/**
 * @param {ContentPreview} preview
 */
async function loadArticlePage(preview) {
  if (preview.type !== 0) return;
  document.getElementById('article-scroll')?.scrollTo(0, 0);
  favorited = false;
  favoriteListId = null;
  rewardCount = 0;
  favoriteCount = 0;
  watchLater = isInWatchLater(resolveWatchLaterUserId(), preview.id, 0);
  disliked = false;
  dislikeCount = 0;
  commentReplyStore.clear();
  collectionNavHtml = '';
  canManageSeries = false;
  authorFans = 0;
  authorTotalLikes = 0;
  setLoading(true);

  void loadStickerUrlMap().catch(() => {});

  const root = getRoot();
  if (root) {
    root.innerHTML = '<p class="article-read__loading">正在加载文章…</p>';
  }

  try {
    const detail = await fetchArticleDetail(preview);
    currentDetail = detail;
    rewardCount = detail.rewardCount;
    favoriteCount = detail.favoriteCount;
    watchLater = isInWatchLater(resolveWatchLaterUserId(), detail.preview.id, 0);

    const session = loadSession();
    const likePromise = fetchReactionStatus(Number(detail.preview.id), 0).catch(() => ({
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
        ? resolveFavoriteStatus(resolveMineUserId(null), detail.preview.id, 0).catch(() => ({
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
    if (authorProfile) {
      authorFans = authorProfile.fans;
      authorTotalLikes = authorProfile.totalLikes;
      if (currentDetail) {
        if (!currentDetail.authorAvatarFrame && authorProfile.avatarFrame) {
          currentDetail.authorAvatarFrame = authorProfile.avatarFrame;
        }
        if (!currentDetail.authorAvatar && authorProfile.avatar) {
          currentDetail.authorAvatar = authorProfile.avatar;
        }
      }
    }

    commentOrder = 'desc';
    commentListPage = 1;
    commentListHasMore = false;
    if (detail.commentAreaId) {
      await loadRootComments(1, { append: false });
    } else {
      commentItems = [];
    }

    canManageSeries = await canManageContentSeries(detail.authorId);

    collectionNavHtml = '';
    if (detail.seriesId) {
      try {
        const ctx = await fetchSeriesContext(
          detail.seriesId,
          Number(detail.preview.id),
          0,
        );
        collectionNavHtml = renderCollectionNavHtml(ctx);
      } catch {
        /* ignore */
      }
    }

    renderPage();
  } catch (err) {
    if (root) {
      root.innerHTML = `<div class="article-read__error"><p>${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p></div>`;
    }
  } finally {
    setLoading(false);
  }
}

function captureArticlePageState() {
  return {
    hydrated: Boolean(currentDetail),
    currentDetail,
    liked,
    likeCount,
    disliked,
    dislikeCount,
    following,
    authorFans,
    authorTotalLikes,
    favorited,
    favoriteListId,
    rewardCount,
    favoriteCount,
    watchLater,
    commentItems,
    commentOrder,
    commentListPage,
    commentListHasMore,
    collectionNavHtml,
    canManageSeries,
    rootHtml: getRoot()?.innerHTML ?? '',
    scrollTop: getScrollTop('article-scroll') || getScrollTop('main-content'),
  };
}

/**
 * @param {ReturnType<typeof captureArticlePageState>} state
 */
function applyArticlePageState(state) {
  currentDetail = state.currentDetail ?? null;
  liked = state.liked ?? false;
  likeCount = state.likeCount ?? 0;
  disliked = state.disliked ?? false;
  dislikeCount = state.dislikeCount ?? 0;
  following = state.following ?? false;
  authorFans = state.authorFans ?? 0;
  authorTotalLikes = state.authorTotalLikes ?? 0;
  favorited = state.favorited ?? false;
  favoriteListId = state.favoriteListId ?? null;
  rewardCount = state.rewardCount ?? 0;
  favoriteCount = state.favoriteCount ?? 0;
  watchLater = state.watchLater ?? false;
  commentItems = state.commentItems ?? [];
  commentOrder = state.commentOrder === 'asc' ? 'asc' : 'desc';
  commentListPage = state.commentListPage ?? 1;
  commentListHasMore = state.commentListHasMore ?? false;
  commentListLoading = false;
  collectionNavHtml = state.collectionNavHtml ?? '';
  canManageSeries = state.canManageSeries ?? false;
  commentReplyStore.clear();

  const root = getRoot();
  if (root && state.rootHtml) {
    root.innerHTML = state.rootHtml;
    mountAllCommentRichText(commentItems, commentReplyStore, {
      bodyIdPrefix: COMMENT_BODY_PREFIX,
      replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
    });
  } else if (currentDetail) {
    renderPage();
  }
  restoreScrollTop('article-scroll', state.scrollTop ?? 0);
}

export async function openArticleDetail(preview) {
  if (preview.type !== 0) return;
  await navigateTo('article', { preview });
}

export function closeArticleDetail() {
  void navigateBack();
}

export function bindArticleDetail() {
  const articleRoot = document.getElementById('article-page-root');
  if (articleRoot) {
    bindTagButtons(articleRoot);
    bindCollectionNav(articleRoot);
  }

  bindCommentSection(articleRoot, {
    getComments: () => commentItems,
    setComments: (comments) => {
      commentItems = comments;
    },
    replyStore: commentReplyStore,
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
    onRefresh: refreshCommentsUi,
    onOrderChange: (order) => {
      if (order === commentOrder) return;
      commentOrder = order;
      void loadRootComments(1, { append: false });
    },
    onLoadMoreComments: () => {
      if (commentListLoading || !commentListHasMore) return;
      void loadRootComments(commentListPage + 1, { append: true });
    },
  });

  document.getElementById('article-back-btn')?.addEventListener('click', closeArticleDetail);

  articleRoot?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!target.closest('#article-comment-trigger')) return;
    if (!currentDetail?.commentAreaId || !requireLogin()) return;
    openCommentComposer({
      title: '发表一个评论',
      areaId: currentDetail.commentAreaId,
      onSuccess: async () => {
        await loadRootComments(1, { append: false });
        if (currentDetail.preview) {
          currentDetail.preview.comments = Math.max(
            currentDetail.preview.comments,
            commentItems.length,
          );
        }
        renderPage();
      },
    });
  });

  registerPageNavigation('article', {
    capture: () => captureArticlePageState(),
    restore: (state) => {
      applyArticlePageState(/** @type {ReturnType<typeof captureArticlePageState>} */ (state));
    },
    enter: async (params) => {
      const preview = /** @type {ContentPreview | undefined} */ (params.preview);
      if (preview) await loadArticlePage(preview);
    },
  });
}
