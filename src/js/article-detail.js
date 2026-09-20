import { materialIcon, viewCountIcon } from './icons.js';
import { mediaSrcForCover } from './content-api.js';
import { mountRichContent } from './rich-content.js';
import { loadStickerUrlMap } from './emoji-pack.js';
import { loadSession } from './auth.js';
import { getCurrentPage, setPage } from './pages.js';
import { requireLogin } from './login-ui.js';
import { fetchArticleDetail } from './article-api.js';
import {
  createComment,
  fetchCommentList,
  fetchFollowStatus,
  fetchLikeStatus,
  setFollow,
  setResourceLike,
} from './video-api.js';
import { fetchUserProfile } from './user-profile-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */
/** @typedef {import('./article-api.js').ArticleDetail} ArticleDetail */

/** @type {import('./pages.js').PageId} */
let returnPage = 'home';

/** @type {ArticleDetail | null} */
let currentDetail = null;

let liked = false;
let likeCount = 0;
let following = false;
let authorFans = 0;
let authorTotalLikes = 0;

/** @type {import('./video-api.js').CommunityComment[]} */
let commentItems = [];

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

/**
 * @param {import('./video-api.js').CommunityComment[]} comments
 */
function renderComments(comments) {
  if (comments.length === 0) {
    return '<p class="watch-comments__empty">还没有评论，来抢沙发吧~</p>';
  }
  return comments
    .map((item) => {
      const avatarSrc = mediaSrcForCover(item.avatar);
      const avatarInner = avatarSrc
        ? `<img class="watch-comment__avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
        : `<span class="watch-comment__avatar watch-comment__avatar--ph"></span>`;
      const avatar = authorProfileLink(
        item.authorId,
        avatarInner,
        'watch-comment__avatar-btn',
      );
      const author = item.authorId
        ? authorProfileLink(
            item.authorId,
            escapeHtml(item.authorName),
            'watch-comment__author',
          )
        : `<p class="watch-comment__author">${escapeHtml(item.authorName)}</p>`;
      return `
        <article class="watch-comment">
          ${avatar}
          <div class="watch-comment__body">
            ${author}
            <div class="watch-comment__text markdown-body" id="article-comment-body-${item.id}"></div>
            <div class="watch-comment__meta">
              <span>${formatCount(item.likes)} 赞</span>
              ${item.replyCount > 0 ? `<span>${formatCount(item.replyCount)} 回复</span>` : ''}
            </div>
          </div>
        </article>`;
    })
    .join('');
}

function renderInteractBar() {
  return `
    <div class="article-interact watch-interact-bar" role="toolbar" aria-label="文章互动">
      <button type="button" class="watch-interact-bar__item ${liked ? 'is-active' : ''}" id="article-like-btn">
        <span class="watch-interact-bar__icon">${materialIcon('thumb_up')}</span>
        <span class="watch-interact-bar__label">${formatCount(likeCount)}</span>
      </button>
      <button type="button" class="watch-interact-bar__item" id="article-share-btn">
        <span class="watch-interact-bar__icon">${materialIcon('share')}</span>
        <span class="watch-interact-bar__label">分享</span>
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
          ? `<div class="article-read__tags watch-tags">${detail.tags.map((t) => `<span class="watch-tag">${escapeHtml(t)}</span>`).join('')}</div>`
          : ''
      }

      ${renderInteractBar()}

      <section class="article-read__comments">
        <h2 class="article-read__comments-title">评论 <span class="article-read__comments-count">${formatCount(preview.comments)}</span></h2>
        <form class="watch-comment-form" id="article-comment-form">
          <textarea class="watch-comment-input" id="article-comment-input" rows="3" placeholder="发一条友善的评论"></textarea>
          <button type="submit" class="btn-accent watch-comment-submit">发布</button>
        </form>
        <div class="watch-comments" id="article-comments-list">${renderComments(commentItems)}</div>
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
  commentItems.forEach((item) => {
    const el = document.getElementById(`article-comment-body-${item.id}`);
    if (el && item.rawContent) mountRichContent(el, item.rawContent);
  });
}

function bindPageEvents() {
  document.getElementById('article-like-btn')?.addEventListener('click', async () => {
    if (!currentDetail || !requireLogin()) return;
    try {
      const next = !liked;
      await setResourceLike(Number(currentDetail.preview.id), next, 0);
      liked = next;
      likeCount += next ? 1 : -1;
      renderPage();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
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

  document.getElementById('article-comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentDetail?.commentAreaId || !requireLogin()) return;
    const input = /** @type {HTMLTextAreaElement | null} */ (
      document.getElementById('article-comment-input')
    );
    const text = input?.value.trim() ?? '';
    if (!text) return;
    try {
      await createComment(currentDetail.commentAreaId, text);
      if (input) input.value = '';
      commentItems = await fetchCommentList(currentDetail.commentAreaId, 1);
      if (currentDetail.preview) {
        currentDetail.preview.comments = Math.max(
          currentDetail.preview.comments,
          commentItems.length,
        );
      }
      renderPage();
    } catch (err) {
      alert(err instanceof Error ? err.message : '发送失败');
    }
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
    const likePromise = fetchLikeStatus(Number(detail.preview.id), 0).catch(() => ({
      liked: false,
      likes: detail.likes,
    }));
    const followPromise =
      detail.authorId && session?.token
        ? fetchFollowStatus(detail.authorId).catch(() => false)
        : Promise.resolve(false);
    const authorProfilePromise =
      detail.authorId != null
        ? fetchUserProfile(detail.authorId).catch(() => null)
        : Promise.resolve(null);

    const [likeStatus, followStatus, authorProfile] = await Promise.all([
      likePromise,
      followPromise,
      authorProfilePromise,
    ]);
    liked = likeStatus.liked;
    likeCount = likeStatus.likes || detail.likes;
    following = followStatus;
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
  document.getElementById('article-back-btn')?.addEventListener('click', closeArticleDetail);
}
