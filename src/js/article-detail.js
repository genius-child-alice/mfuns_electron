import { materialIcon, viewCountIcon } from './icons.js';
import { mediaSrcForCover } from './content-api.js';
import { mountRichContent } from './rich-content.js';
import { loadStickerUrlMap } from './emoji-pack.js';
import { loadSession } from './auth.js';
import { getCurrentPage, setPage } from './pages.js';
import { requireLogin } from './login-ui.js';
import { fetchArticleDetail } from './article-api.js';
import {
  fetchCommentList,
  fetchFollowStatus,
  fetchReactionStatus,
  setFollow,
  setResourceReaction,
} from './video-api.js';
import { fetchUserProfile } from './user-profile-api.js';
import { resolveFavoriteStatus, resolveMineUserId } from './favorite-api.js';
import { toggleResourceFavorite } from './favorite-ui.js';
import { openRewardDialog } from './reward-ui.js';
import {
  bindCommentSection,
  createCommentReplyStore,
  mountAllCommentRichText,
  renderCommentsHtml,
} from './comment-ui.js';
import { bindTagButtons, renderTagButtons } from './tag-page.js';
import { commentComposerTriggerHtml, openCommentComposer } from './comment-composer.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */
/** @typedef {import('./article-api.js').ArticleDetail} ArticleDetail */

/** @type {import('./pages.js').PageId} */
let returnPage = 'home';

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

/** @type {import('./video-api.js').CommunityComment[]} */
let commentItems = [];

const commentReplyStore = createCommentReplyStore();

const COMMENT_BODY_PREFIX = 'article-comment-body';
const COMMENT_REPLY_PREFIX = 'article-comment-reply';

function refreshCommentsUi() {
  const list = document.getElementById('article-comments-list');
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
        <span class="watch-interact-bar__label">投币</span>
      </button>
      <button type="button" class="watch-interact-bar__item ${favorited ? 'is-active' : ''}" id="article-fav-btn">
        <span class="watch-interact-bar__icon">${materialIcon('star')}</span>
        <span class="watch-interact-bar__label">${favorited ? '已收藏' : '收藏'}</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="article-share-btn">
        <span class="watch-interact-bar__icon">${materialIcon('share')}</span>
        <span class="watch-interact-bar__label">分享</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="article-forward-feed-btn">
        <span class="watch-interact-bar__icon">${materialIcon('edit_note')}</span>
        <span class="watch-interact-bar__label">转动态</span>
      </button>
    </div>`;
}

function renderPage() {
  const detail = currentDetail;
  const root = getRoot();
  if (!detail || !root) return;

  const { preview } = detail;
  const avatarSrc = mediaSrcForCover(detail.authorAvatar);
  const publishIso = detail.publishedAt ?? preview.createdAt;
  const dateLabel = formatDateTime(publishIso);
  const authorMeta =
    authorFans > 0 || authorTotalLikes > 0
      ? `${formatCount(authorFans)}粉丝 · ${formatCount(authorTotalLikes)}获赞`
      : 'MFuns 创作者';

  root.innerHTML = `
    <article class="article-read">
      <header class="article-read__head">
        <h1 class="article-read__title">${escapeHtml(preview.title)}</h1>
        <div class="article-read__meta">
          <div class="article-read__author">
            ${
              avatarSrc && detail.authorId
                ? `<button type="button" class="watch-user-link article-read__avatar-btn" data-author-profile="${detail.authorId}" title="进入空间"><img class="article-read__avatar" src="${escapeHtml(avatarSrc)}" alt="" /></button>`
                : avatarSrc
                  ? `<img class="article-read__avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
                  : '<span class="article-read__avatar article-read__avatar--ph"></span>'
            }
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
                ? `<span class="article-read__time">${materialIcon('schedule', 'article-read__stat-icon')}<time datetime="${escapeHtml(publishIso ?? '')}">${escapeHtml(dateLabel)}</time></span>`
                : ''
            }
          </div>
        </div>
      </header>

      <div class="article-read__content markdown-body" id="article-rich-content"></div>

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
        <div class="watch-comments" id="article-comments-list">${renderCommentsHtml(commentItems, { bodyIdPrefix: COMMENT_BODY_PREFIX, replyBodyIdPrefix: COMMENT_REPLY_PREFIX, replyStore: commentReplyStore })}</div>
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
    alert(err instanceof Error ? err.message : '操作失败');
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
        favorited = next.favorited;
        favoriteListId = next.listId;
        renderPage();
      },
    });
  });

  document.getElementById('article-coin-btn')?.addEventListener('click', () => {
    if (!currentDetail) return;
    openRewardDialog({
      resourceId: currentDetail.preview.id,
      resourceType: 0,
    });
  });

  document.getElementById('article-like-btn')?.addEventListener('click', () => {
    void toggleArticleReaction(false);
  });

  document.getElementById('article-dislike-btn')?.addEventListener('click', () => {
    void toggleArticleReaction(true);
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

  document.getElementById('article-share-btn')?.addEventListener('click', async () => {
    if (!currentDetail) return;
    const url = `https://m.mfuns.net/article/${currentDetail.preview.id}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('链接已复制');
    } catch {
      prompt('复制链接', url);
    }
  });

  document.getElementById('article-follow-btn')?.addEventListener('click', async () => {
    if (!currentDetail?.authorId || !requireLogin()) return;
    try {
      const next = !following;
      await setFollow(currentDetail.authorId, next);
      following = next;
      renderPage();
    } catch (err) {
      alert(err instanceof Error ? err.message : '关注失败');
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
export async function openArticleDetail(preview) {
  if (preview.type !== 0) return;
  returnPage = getCurrentPage();
  setPage('article');
  document.getElementById('article-scroll')?.scrollTo(0, 0);
  favorited = false;
  favoriteListId = null;
  disliked = false;
  dislikeCount = 0;
  commentReplyStore.clear();
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
    }

    let comments = [];
    if (detail.commentAreaId) {
      comments = await fetchCommentList(detail.commentAreaId, 1).catch(() => []);
    }
    commentItems = comments;
    renderPage();
  } catch (err) {
    if (root) {
      root.innerHTML = `<div class="article-read__error"><p>${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p></div>`;
    }
  } finally {
    setLoading(false);
  }
}

export function closeArticleDetail() {
  setPage(returnPage);
}

export function bindArticleDetail() {
  const articleRoot = document.getElementById('article-page-root');
  if (articleRoot) bindTagButtons(articleRoot);

  bindCommentSection(articleRoot, {
    getComments: () => commentItems,
    setComments: (comments) => {
      commentItems = comments;
    },
    replyStore: commentReplyStore,
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
    onRefresh: refreshCommentsUi,
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
        commentItems = await fetchCommentList(currentDetail.commentAreaId, 1);
        commentReplyStore.clear();
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
}
