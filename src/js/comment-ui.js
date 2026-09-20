import { materialIcon } from './icons.js';
import { mediaSrcForCover } from './content-api.js';
import { mountRichContent } from './rich-content.js';
import { requireLogin } from './login-ui.js';
import { setResourceLike } from './video-api.js';

/** @typedef {import('./video-api.js').CommunityComment} CommunityComment */

/** 评论点赞资源类型 */
export const COMMENT_LIKE_RESOURCE_TYPE = 4;

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
 * @param {number} n
 */
function formatCount(n) {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(Math.trunc(n));
}

/**
 * @param {number | null} userId
 * @param {string} innerHtml
 * @param {string} className
 */
function authorLink(userId, innerHtml, className) {
  if (userId == null || userId <= 0) return innerHtml;
  return `<button type="button" class="watch-user-link ${className}" data-author-profile="${userId}">${innerHtml}</button>`;
}

/**
 * @param {CommunityComment} item
 */
function renderCommentLikeButton(item) {
  const label = item.liked ? '取消赞' : '点赞';
  return `<button type="button" class="watch-comment__like ${item.liked ? 'is-active' : ''}" data-comment-like="${item.id}" aria-label="${label}" title="${label}">
    ${materialIcon('thumb_up', 'watch-comment__like-icon')}
    <span class="watch-comment__like-count">${formatCount(item.likes)}</span>
  </button>`;
}

/**
 * @param {CommunityComment[]} comments
 * @param {{ bodyIdPrefix: string }} options
 */
export function renderCommentsHtml(comments, options) {
  if (comments.length === 0) {
    return '<p class="watch-comments__empty">还没有评论，来抢沙发吧~</p>';
  }
  const bodyIdPrefix = options.bodyIdPrefix;
  return comments
    .map((item) => {
      const avatarSrc = mediaSrcForCover(item.avatar);
      const avatarInner = avatarSrc
        ? `<img class="watch-comment__avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
        : `<span class="watch-comment__avatar watch-comment__avatar--ph"></span>`;
      const avatar = authorLink(item.authorId, avatarInner, 'watch-comment__avatar-btn');
      const author = item.authorId
        ? authorLink(item.authorId, escapeHtml(item.authorName), 'watch-comment__author')
        : `<p class="watch-comment__author">${escapeHtml(item.authorName)}</p>`;
      return `
        <article class="watch-comment" data-comment-id="${item.id}">
          ${avatar}
          <div class="watch-comment__body">
            ${author}
            <div class="watch-comment__text markdown-body" id="${bodyIdPrefix}-${item.id}"></div>
            <div class="watch-comment__meta">
              ${renderCommentLikeButton(item)}
              ${
                item.replyCount > 0
                  ? `<span class="watch-comment__replies">${formatCount(item.replyCount)} 回复</span>`
                  : ''
              }
            </div>
          </div>
        </article>`;
    })
    .join('');
}

/**
 * @param {CommunityComment[]} comments
 * @param {string} bodyIdPrefix
 */
export function mountCommentRichText(comments, bodyIdPrefix) {
  comments.forEach((item) => {
    const el = document.getElementById(`${bodyIdPrefix}-${item.id}`);
    if (el && item.rawContent) mountRichContent(el, item.rawContent);
  });
}

/**
 * @param {HTMLButtonElement} btn
 * @param {CommunityComment} item
 */
function syncCommentLikeButton(btn, item) {
  btn.classList.toggle('is-active', item.liked);
  btn.setAttribute('aria-label', item.liked ? '取消赞' : '点赞');
  btn.setAttribute('title', item.liked ? '取消赞' : '点赞');
  const countEl = btn.querySelector('.watch-comment__like-count');
  if (countEl) countEl.textContent = formatCount(item.likes);
}

/**
 * @param {number} commentId
 * @param {HTMLButtonElement} btn
 * @param {{
 *   getComments: () => CommunityComment[],
 *   setComments: (comments: CommunityComment[]) => void,
 * }} options
 */
async function toggleCommentLike(commentId, btn, options) {
  if (!Number.isFinite(commentId) || commentId <= 0) return;
  if (!requireLogin()) return;
  const comments = options.getComments();
  const item = comments.find((entry) => entry.id === commentId);
  if (!item || btn.disabled) return;

  const nextLiked = !item.liked;
  btn.disabled = true;
  try {
    await setResourceLike(commentId, nextLiked, COMMENT_LIKE_RESOURCE_TYPE);
    item.liked = nextLiked;
    item.likes = Math.max(0, item.likes + (nextLiked ? 1 : -1));
    options.setComments(comments);
    syncCommentLikeButton(btn, item);
  } catch (err) {
    alert(err instanceof Error ? err.message : '操作失败');
  } finally {
    btn.disabled = false;
  }
}

/**
 * @param {HTMLElement | null} root
 * @param {{
 *   getComments: () => CommunityComment[],
 *   setComments: (comments: CommunityComment[]) => void,
 * }} options
 */
export function bindCommentLikeActions(root, options) {
  if (!root || root.dataset.commentLikeBound === '1') return;
  root.dataset.commentLikeBound = '1';
  root.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const btn = target.closest('[data-comment-like]');
    if (!(btn instanceof HTMLButtonElement)) return;
    event.preventDefault();
    const commentId = Number(btn.getAttribute('data-comment-like'));
    void toggleCommentLike(commentId, btn, options);
  });
}
