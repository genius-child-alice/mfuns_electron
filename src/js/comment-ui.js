import { notify } from './notice-ui.js';
import { materialIcon } from './icons.js';
import { mountRichContent, resolveCommentMountSource } from './rich-content.js';
import { requireLogin } from './login-ui.js';
import { resolveMineUserId } from './favorite-api.js';
import {
  deleteComment,
  fetchCommentById,
  fetchCommentReplies,
  fetchReactionStatus,
  pinComment,
  setCommentReaction,
  sortCommentsForDisplay,
} from './video-api.js';
import { renderFramedAvatarHtml } from './avatar-frame-ui.js';
import { renderUserBadgesHtml } from './badge-catalog.js';
import { openCommentComposer } from './comment-composer.js';
import { confirmAction } from './confirm-dialog.js';

/** @typedef {import('./video-api.js').CommunityComment} CommunityComment */
/** @typedef {import('./video-api.js').CommentListOrder} CommentListOrder */

/** @typedef {{
 *   items: CommunityComment[],
 *   page: number,
 *   hasMore: boolean,
 *   expanded: boolean,
 *   loading: boolean,
 *   loadingMore: boolean,
 *   error: string | null,
 *   replyDelta: number,
 * }} CommentReplyThread */

/** @typedef {{
 *   get: (commentId: number) => CommentReplyThread | undefined,
 *   ensure: (commentId: number) => CommentReplyThread,
 *   entries: () => IterableIterator<[number, CommentReplyThread]>,
 *   clear: () => void,
 *   replyTotal: (comment: CommunityComment, commentId: number) => number,
 * }} CommentReplyStore */

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
 * @param {number | string | null | undefined} value
 * @returns {number | null}
 */
function commentCreatedAtMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * @param {number | string | null | undefined} value
 */
export function commentCreatedAtIso(value) {
  const ms = commentCreatedAtMs(value);
  if (ms == null) return '';
  const t = new Date(ms);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString();
}

/**
 * 与官网 pipe.date 相近；超过 24 小时显示具体日期时间
 * @param {number | string | null | undefined} value
 */
export function formatCommentDate(value) {
  const ms = commentCreatedAtMs(value);
  if (ms == null) return '';
  const t = new Date(ms);
  if (Number.isNaN(t.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const clock = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const diff = Date.now() - t.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  if (t.getFullYear() === new Date().getFullYear()) {
    return `${t.getMonth() + 1}-${pad(t.getDate())} ${clock}`;
  }
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${clock}`;
}

/**
 * @returns {CommentReplyStore}
 */
export function createCommentReplyStore() {
  /** @type {Map<number, CommentReplyThread>} */
  const threads = new Map();

  return {
    get: (commentId) => threads.get(commentId),
    ensure(commentId) {
      if (!threads.has(commentId)) {
        threads.set(commentId, {
          items: [],
          page: 0,
          hasMore: false,
          expanded: false,
          loading: false,
          loadingMore: false,
          error: null,
          replyDelta: 0,
        });
      }
      return /** @type {CommentReplyThread} */ (threads.get(commentId));
    },
    entries: () => threads.entries(),
    clear() {
      threads.clear();
    },
    replyTotal(comment, commentId) {
      const state = threads.get(commentId);
      const delta = state?.replyDelta ?? 0;
      return Math.max(0, (comment.replyCount ?? 0) + delta);
    },
  };
}

/**
 * @param {CommunityComment[]} existing
 * @param {CommunityComment[]} incoming
 */
export function mergeCommentReplyPages(existing, incoming) {
  const ids = new Set(existing.map((entry) => entry.id));
  return [...existing, ...incoming.filter((entry) => ids.add(entry.id))];
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
function renderCommentReactionButtons(item) {
  const likeLabel = item.liked ? '取消赞' : '点赞';
  const dislikeLabel = item.disliked ? '取消踩' : '点踩';
  return `
    <button type="button" class="watch-comment__like ${item.liked ? 'is-active' : ''}" data-comment-like="${item.id}" aria-label="${likeLabel}" title="${likeLabel}">
      ${materialIcon('thumb_up', 'watch-comment__like-icon')}
      <span class="watch-comment__like-count">${formatCount(item.likes)}</span>
    </button>
    <button type="button" class="watch-comment__dislike ${item.disliked ? 'is-active' : ''}" data-comment-dislike="${item.id}" aria-label="${dislikeLabel}" title="${dislikeLabel}">
      ${materialIcon('thumb_down', 'watch-comment__dislike-icon')}
      <span class="watch-comment__dislike-count">${formatCount(item.dislikes)}</span>
    </button>`;
}

/**
 * @param {number} rootCommentId
 */
function renderRootReplyButton(rootCommentId) {
  return `<button type="button" class="watch-comment__reply-btn" data-comment-reply="${rootCommentId}">回复</button>`;
}

/**
 * @param {CommunityComment} reply
 * @param {number} rootCommentId
 */
function renderNestedReplyButton(reply, rootCommentId) {
  if (reply.authorId == null || reply.authorId <= 0) return '';
  return `<button type="button" class="watch-comment__reply-btn" data-comment-reply-to="${reply.id}" data-comment-reply-root="${rootCommentId}" data-comment-reply-name="${escapeHtml(reply.authorName)}" data-comment-reply-user="${reply.authorId}">回复</button>`;
}

/**
 * @param {CommunityComment} item
 * @param {{
 *   bodyIdPrefix: string,
 *   compact?: boolean,
 *   replyActionHtml?: string,
 *   currentUserId?: number | null,
 *   resourceAuthorId?: number | null,
 *   commentAreaOwnerId?: number | null,
 *   rootCommentId?: number,
 * }} options
 */
function renderCommentRow(item, options) {
  const compact = options.compact === true;
  const avatarSizeClass = compact ? ' watch-comment__avatar--sm' : '';
  const avatarInner = renderFramedAvatarHtml({
    avatar: item.avatar,
    frame: item.avatarFrame,
    size: compact ? 'xs' : 'sm',
    imgClass: `watch-comment__avatar${avatarSizeClass}`,
    phClass: 'watch-comment__avatar--ph',
  });
  const avatar = authorLink(item.authorId, avatarInner, 'watch-comment__avatar-btn');
  const badgesHtml = renderUserBadgesHtml(item.badges ?? [], compact ? 'sm' : 'sm');
  const isResourceAuthor =
    options.resourceAuthorId != null &&
    item.authorId != null &&
    item.authorId === options.resourceAuthorId;
  const authorLabel = escapeHtml(item.authorName);
  const authorInner = `${authorLabel}${badgesHtml}${
    item.pinned ? '<span class="watch-comment__pin">置顶</span>' : ''
  }${isResourceAuthor ? '<span class="watch-comment__landlord">作者</span>' : ''}`;
  const author = item.authorId
    ? authorLink(item.authorId, authorInner, 'watch-comment__author')
    : `<p class="watch-comment__author">${authorInner}</p>`;
  const extraMeta = options.replyActionHtml ?? '';
  const rootCommentId = options.rootCommentId ?? item.id;
  const dateLabel = formatCommentDate(item.createdAt);
  const dateIso = commentCreatedAtIso(item.createdAt);
  const floorHtml =
    !compact && item.floorNum != null && item.floorNum > 0
      ? `<span class="watch-comment__floor">${item.floorNum}F</span>`
      : '';
  const timeHtml =
    dateLabel && dateIso
      ? `<time class="watch-comment__time watch-comment__time--published" datetime="${escapeHtml(dateIso)}">${escapeHtml(dateLabel)}</time>`
      : '';
  const deleteBtn =
    options.currentUserId != null &&
    item.authorId != null &&
    item.authorId === options.currentUserId
      ? `<button type="button" class="watch-comment__delete" data-comment-delete="${item.id}" data-comment-delete-root="${rootCommentId}" aria-label="删除" title="删除">${materialIcon('delete_outline')}</button>`
      : '';
  const canPin =
    !compact &&
    options.commentAreaOwnerId != null &&
    options.currentUserId != null &&
    options.commentAreaOwnerId === options.currentUserId;
  const pinBtn = canPin
    ? `<button type="button" class="watch-comment__pin-btn" data-comment-pin="${item.id}" data-comment-pin-cancel="${item.pinned ? '1' : '0'}" aria-label="${item.pinned ? '取消置顶' : '置顶'}" title="${item.pinned ? '取消置顶' : '置顶'}">${materialIcon(item.pinned ? 'push_pin' : 'keep')}</button>`
    : '';

  return `
    <article class="watch-comment ${compact ? 'watch-comment--reply' : ''}" data-comment-id="${item.id}">
      ${avatar}
      <div class="watch-comment__body">
        <header class="watch-comment__head">
          <div class="watch-comment__head-main">${author}</div>
          <span class="watch-comment__cid">#${item.id}</span>
        </header>
        <div class="watch-comment__text markdown-body" id="${options.bodyIdPrefix}-${item.id}"></div>
        <div class="watch-comment__meta">
          <div class="watch-comment__meta-info">
            ${floorHtml}
            ${timeHtml}
          </div>
          <div class="watch-comment__meta-main">
            ${renderCommentReactionButtons(item)}
            ${extraMeta}
          </div>
          ${pinBtn}
          ${deleteBtn}
        </div>
      </div>
    </article>`;
}

/**
 * @param {CommunityComment} item
 * @param {CommentReplyThread} thread
 * @param {number} rootCommentId
 * @param {{
 *   replyBodyIdPrefix: string,
 *   currentUserId?: number | null,
 *   resourceAuthorId?: number | null,
 *   replyStore: CommentReplyStore,
 * }} options
 */
function renderSecondReplyPreviewHtml(item, thread, rootCommentId, options) {
  if (thread.expanded) return '';
  const previews = item.secondReply ?? [];
  if (previews.length === 0) return '';

  const total = options.replyStore.replyTotal(item, rootCommentId);
  const rows = previews
    .map((reply) =>
      renderCommentRow(reply, {
        bodyIdPrefix: options.replyBodyIdPrefix,
        compact: true,
        currentUserId: options.currentUserId,
        resourceAuthorId: options.resourceAuthorId ?? null,
        rootCommentId,
        replyActionHtml: renderNestedReplyButton(reply, rootCommentId),
      }),
    )
    .join('');

  const moreHtml =
    total > previews.length
      ? `<button type="button" class="watch-comment-second-replies__more" data-comment-replies-toggle="${rootCommentId}">
          ${materialIcon('expand_more', 'watch-comment-second-replies__more-icon')}
          <span>查看全部 ${formatCount(total)} 条回复</span>
        </button>`
      : '';

  return `<div class="watch-comment-second-replies" data-comment-second-replies="${rootCommentId}">${rows}${moreHtml}</div>`;
}

/**
 * @param {CommunityComment} comment
 * @param {CommentReplyThread} thread
 * @param {number} rootCommentId
 * @param {number} rootCommentId
 * @param {{ replyBodyIdPrefix: string, currentUserId?: number | null, resourceAuthorId?: number | null }} options
 */
function renderReplyThreadHtml(comment, thread, rootCommentId, options) {
  if (!thread.expanded) return '';

  const total = Math.max(comment.replyCount + thread.replyDelta, thread.items.length);
  let body = '';

  if (thread.loading) {
    body = `<p class="watch-comment-replies__hint">${materialIcon('progress_activity', 'watch-comment-replies__spin')}加载回复中…</p>`;
  } else if (thread.items.length === 0 && !thread.error) {
    body = '<p class="watch-comment-replies__hint">暂无回复</p>';
  } else {
    body = thread.items
      .map((reply) => {
        return renderCommentRow(reply, {
          bodyIdPrefix: options.replyBodyIdPrefix,
          compact: true,
          currentUserId: options.currentUserId,
          resourceAuthorId: options.resourceAuthorId ?? null,
          rootCommentId,
          replyActionHtml: renderNestedReplyButton(reply, rootCommentId),
        });
      })
      .join('');
  }

  if (thread.error) {
    body += `<p class="watch-comment-replies__error">${escapeHtml(thread.error)} <button type="button" class="watch-comment-replies__retry" data-comment-replies-retry="${rootCommentId}">重试</button></p>`;
  }

  if (thread.loadingMore) {
    body += `<p class="watch-comment-replies__hint">${materialIcon('progress_activity', 'watch-comment-replies__spin')}加载更多…</p>`;
  } else if (thread.hasMore && thread.items.length > 0) {
    body += `<button type="button" class="watch-comment-replies__more" data-comment-replies-more="${rootCommentId}">
      ${materialIcon('expand_more', 'watch-comment-replies__more-icon')}
      <span>加载更多回复（已显示 ${thread.items.length}/${total}）</span>
    </button>`;
  }

  return `<div class="watch-comment-replies" data-comment-replies="${rootCommentId}">${body}</div>`;
}

/**
 * @param {CommunityComment[]} comments
 * @param {{
 *   bodyIdPrefix: string,
 *   replyBodyIdPrefix: string,
 *   replyStore: CommentReplyStore,
 *   currentUserId?: number | null,
 *   resourceAuthorId?: number | null,
 * }} options
 */
/**
 * @param {CommentListOrder} [activeOrder]
 * @param {string} [toolbarId]
 */
export function commentSortToolbarHtml(activeOrder = 'desc', toolbarId = 'watch-comments-toolbar') {
  return `
    <div class="watch-comments__chrome" id="${toolbarId}" role="toolbar" aria-label="评论排序">
      <div class="watch-comments__sort" role="tablist" aria-label="评论排序">
        <button type="button" class="watch-comments__sort-btn ${activeOrder === 'hot' ? 'is-active' : ''}" data-comment-order="hot" role="tab" aria-selected="${activeOrder === 'hot'}">热门</button>
        <button type="button" class="watch-comments__sort-btn ${activeOrder === 'desc' ? 'is-active' : ''}" data-comment-order="desc" role="tab" aria-selected="${activeOrder === 'desc'}">最新</button>
        <button type="button" class="watch-comments__sort-btn ${activeOrder === 'asc' ? 'is-active' : ''}" data-comment-order="asc" role="tab" aria-selected="${activeOrder === 'asc'}">最早</button>
      </div>
    </div>`;
}

/**
 * @param {boolean} [hasMore]
 * @param {boolean} [loading]
 */
export function commentListFooterHtml(hasMore = false, loading = false) {
  if (!hasMore && !loading) return '';
  if (loading) {
    return `<p class="watch-comments__more-hint">${materialIcon('progress_activity', 'home-feed__spin')}加载更多评论…</p>`;
  }
  return `<button type="button" class="watch-comments__more" data-comment-list-more>加载更多评论</button>`;
}

export function renderCommentsHtml(comments, options) {
  const sorted = sortCommentsForDisplay(comments);
  if (sorted.length === 0) {
    return '<p class="watch-comments__empty">还没有评论，来抢沙发吧~</p>';
  }

  const currentUserId = options.currentUserId ?? resolveMineUserId(null);
  const resourceAuthorId = options.resourceAuthorId ?? null;
  const commentAreaOwnerId = options.commentAreaOwnerId ?? null;

  return sorted
    .map((item) => {
      const thread = options.replyStore.ensure(item.id);
      const replyTotal = options.replyStore.replyTotal(item, item.id);
      const toggleLabel = thread.expanded ? '收起回复' : `${formatCount(replyTotal)} 条回复`;
      const threadHtml = thread.expanded
        ? renderReplyThreadHtml(item, thread, item.id, {
            replyBodyIdPrefix: options.replyBodyIdPrefix,
            currentUserId,
            resourceAuthorId,
          })
        : '';
      const secondReplyHtml = renderSecondReplyPreviewHtml(item, thread, item.id, {
        replyBodyIdPrefix: options.replyBodyIdPrefix,
        currentUserId,
        resourceAuthorId,
        replyStore: options.replyStore,
      });

      const replyToggleHtml =
        replyTotal > 0 || thread.expanded
          ? `<div class="watch-comment-thread__actions">
              <button type="button" class="watch-comment__reply-toggle" data-comment-replies-toggle="${item.id}">
                ${materialIcon(thread.expanded ? 'expand_less' : 'expand_more', 'watch-comment__reply-toggle-icon')}
                <span>${toggleLabel}</span>
              </button>
            </div>`
          : '';

      return `
        <div class="watch-comment-thread" data-comment-thread="${item.id}">
          ${renderCommentRow(item, {
            bodyIdPrefix: options.bodyIdPrefix,
            currentUserId,
            resourceAuthorId,
            commentAreaOwnerId,
            rootCommentId: item.id,
            replyActionHtml: renderRootReplyButton(item.id),
          })}
          ${replyToggleHtml}
          ${secondReplyHtml}
          ${threadHtml}
        </div>`;
    })
    .join('');
}

/**
 * @param {CommunityComment[]} comments
 * @param {CommentReplyStore} replyStore
 * @param {{ bodyIdPrefix: string, replyBodyIdPrefix: string }} options
 */
function mountCommentRichTextById(bodyIdPrefix, comment) {
  const el = document.getElementById(`${bodyIdPrefix}-${comment.id}`);
  const source = resolveCommentMountSource(comment);
  if (el && source) mountRichContent(el, source);
}

export function mountAllCommentRichText(comments, replyStore, options) {
  comments.forEach((item) => {
    mountCommentRichTextById(options.bodyIdPrefix, item);
    (item.secondReply ?? []).forEach((reply) => {
      mountCommentRichTextById(options.replyBodyIdPrefix, reply);
    });
    const thread = replyStore.get(item.id);
    thread?.items.forEach((reply) => {
      mountCommentRichTextById(options.replyBodyIdPrefix, reply);
    });
  });
}

/**
 * @param {number} rootCommentId
 * @param {() => CommunityComment[]} getComments
 * @param {(comments: CommunityComment[]) => void} setComments
 */
async function mergeRootCommentFromServer(rootCommentId, getComments, setComments) {
  try {
    const updated = await fetchCommentById(rootCommentId);
    const list = getComments();
    const next = list.map((entry) =>
      entry.id === rootCommentId
        ? {
            ...entry,
            ...updated,
            secondReply: updated.secondReply ?? [],
            replyCount: updated.replyCount,
          }
        : entry,
    );
    setComments(next);
  } catch {
    /* ignore */
  }
}

/**
 * @param {CommunityComment[]} comments
 * @param {CommentReplyStore} replyStore
 * @param {number} commentId
 */
function findCommentEntry(comments, replyStore, commentId) {
  const root = comments.find((entry) => entry.id === commentId);
  if (root) return { item: root, list: comments };

  for (const [, thread] of replyStore.entries()) {
    const reply = thread.items.find((entry) => entry.id === commentId);
    if (reply) return { item: reply, list: thread.items };
  }
  return null;
}

/**
 * @param {HTMLElement} commentEl
 * @param {CommunityComment} item
 */
function syncCommentReactionUi(commentEl, item) {
  const likeBtn = commentEl.querySelector('[data-comment-like]');
  const dislikeBtn = commentEl.querySelector('[data-comment-dislike]');
  if (likeBtn instanceof HTMLButtonElement) {
    likeBtn.classList.toggle('is-active', item.liked);
    likeBtn.setAttribute('aria-label', item.liked ? '取消赞' : '点赞');
    likeBtn.setAttribute('title', item.liked ? '取消赞' : '点赞');
    const countEl = likeBtn.querySelector('.watch-comment__like-count');
    if (countEl) countEl.textContent = formatCount(item.likes);
  }
  if (dislikeBtn instanceof HTMLButtonElement) {
    dislikeBtn.classList.toggle('is-active', item.disliked);
    dislikeBtn.setAttribute('aria-label', item.disliked ? '取消踩' : '点踩');
    dislikeBtn.setAttribute('title', item.disliked ? '取消踩' : '点踩');
    const countEl = dislikeBtn.querySelector('.watch-comment__dislike-count');
    if (countEl) countEl.textContent = formatCount(item.dislikes);
  }
}

/**
 * @param {number} commentId
 * @param {HTMLButtonElement} btn
 * @param {{
 *   getComments: () => CommunityComment[],
 *   setComments: (comments: CommunityComment[]) => void,
 *   replyStore: CommentReplyStore,
 * }} options
 * @param {boolean} dislike
 */
async function toggleCommentReaction(commentId, btn, options, dislike) {
  if (!Number.isFinite(commentId) || commentId <= 0) return;
  if (!requireLogin()) return;
  const found = findCommentEntry(options.getComments(), options.replyStore, commentId);
  if (!found || btn.disabled) return;

  const { item } = found;
  const active = dislike ? item.disliked : item.liked;
  const action = active ? 'cancel' : dislike ? 'dislike' : 'like';
  const commentEl = btn.closest('.watch-comment');
  btn.disabled = true;
  const sibling = commentEl?.querySelector(
    dislike ? '[data-comment-like]' : '[data-comment-dislike]',
  );
  if (sibling instanceof HTMLButtonElement) sibling.disabled = true;

  try {
    await setCommentReaction(commentId, action);
    const status = await fetchReactionStatus(commentId, 4);
    item.liked = status.liked;
    item.disliked = status.disliked;
    item.likes = status.likes;
    item.dislikes = status.dislikes;
    if (commentEl instanceof HTMLElement) {
      syncCommentReactionUi(commentEl, item);
    }
  } catch (err) {
    notify(err instanceof Error ? err.message : '操作失败', 'error');
  } finally {
    btn.disabled = false;
    if (sibling instanceof HTMLButtonElement) sibling.disabled = false;
  }
}

/**
 * @param {number} rootCommentId
 * @param {CommentReplyStore} replyStore
 * @param {CommunityComment[]} comments
 * @param {{ loadMore?: boolean }} opts
 */
async function loadCommentReplies(rootCommentId, replyStore, comments, opts = {}) {
  const comment = comments.find((entry) => entry.id === rootCommentId);
  if (!comment) return;
  const thread = replyStore.ensure(rootCommentId);
  const loadMore = opts.loadMore === true;
  const page = loadMore ? thread.page + 1 : 1;

  if (loadMore) {
    thread.loadingMore = true;
  } else {
    thread.loading = true;
    thread.items = [];
    thread.page = 0;
    thread.hasMore = false;
  }
  thread.error = null;

  try {
    const incoming = await fetchCommentReplies(rootCommentId, page);
    const previous = loadMore ? thread.items : [];
    const merged = mergeCommentReplyPages(previous, incoming);
    const addedCount = merged.length - previous.length;
    const total = replyStore.replyTotal(comment, rootCommentId);
    thread.items = merged;
    thread.page = page;
    thread.hasMore = addedCount > 0 && merged.length < total;
  } catch (err) {
    thread.error = err instanceof Error ? err.message : '加载失败';
  } finally {
    thread.loading = false;
    thread.loadingMore = false;
  }
}

/**
 * @param {number} commentId
 * @param {number} rootCommentId
 * @param {{
 *   getComments: () => CommunityComment[],
 *   setComments: (comments: CommunityComment[]) => void,
 *   replyStore: CommentReplyStore,
 *   onRefresh: () => void,
 * }} options
 */
async function handleDeleteComment(commentId, rootCommentId, options) {
  if (!Number.isFinite(commentId) || commentId <= 0) return;
  if (!requireLogin()) return;
  const confirmed = await confirmAction({
    title: '删除评论',
    message: '删除后无法恢复，确定删除这条评论？',
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) return;

  try {
    await deleteComment(commentId);
    const comments = options.getComments();
    if (comments.some((entry) => entry.id === commentId)) {
      options.setComments(comments.filter((entry) => entry.id !== commentId));
    } else if (Number.isFinite(rootCommentId)) {
      const thread = options.replyStore.get(rootCommentId);
      if (thread) {
        thread.items = thread.items.filter((entry) => entry.id !== commentId);
        thread.replyDelta -= 1;
      }
    }
    options.onRefresh();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败', 'error');
  }
}

/**
 * @param {{
 *   rootCommentId: number,
 *   mentionUserId?: number | null,
 *   mentionName?: string | null,
 *   onSuccess?: () => void,
 * }} options
 */
export function openCommentReplyDialog(options) {
  if (!requireLogin()) return;
  openCommentComposer({
    title: options.mentionName ? `回复 ${options.mentionName}` : '回复评论',
    commentId: options.rootCommentId,
    mention: {
      userId: options.mentionUserId ?? null,
      name: options.mentionName ?? null,
    },
    onSuccess: options.onSuccess,
  });
}

/**
 * @param {HTMLElement | null} root
 * @param {{
 *   getComments: () => CommunityComment[],
 *   setComments: (comments: CommunityComment[]) => void,
 *   replyStore: CommentReplyStore,
 *   bodyIdPrefix: string,
 *   replyBodyIdPrefix: string,
 *   onRefresh: () => void,
 *   onOrderChange?: (order: CommentListOrder) => void,
 *   onLoadMoreComments?: () => void,
 *   onCommentsReload?: () => void | Promise<void>,
 *   onOpenUserProfile?: (userId: number) => void,
 * }} options
 */
export function bindCommentSection(root, options) {
  if (!root || root.dataset.commentSectionBound === '1') return;
  root.dataset.commentSectionBound = '1';

  root.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);

    const profileBtn = target.closest('[data-author-profile]');
    if (profileBtn instanceof HTMLElement && profileBtn.closest('.watch-comment')) {
      const userId = Number.parseInt(profileBtn.getAttribute('data-author-profile') ?? '', 10);
      if (!Number.isFinite(userId) || userId <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (options.onOpenUserProfile) {
        options.onOpenUserProfile(userId);
      } else {
        void import('./user-space.js').then(({ openUserSpace }) => openUserSpace(userId));
      }
      return;
    }

    const orderBtn = target.closest('[data-comment-order]');
    if (orderBtn instanceof HTMLButtonElement && options.onOrderChange) {
      const order = orderBtn.getAttribute('data-comment-order');
      if (order === 'hot' || order === 'desc' || order === 'asc') {
        options.onOrderChange(order);
      }
      return;
    }

    const pinBtn = target.closest('[data-comment-pin]');
    if (pinBtn instanceof HTMLButtonElement) {
      const commentId = Number(pinBtn.getAttribute('data-comment-pin'));
      const cancel = pinBtn.getAttribute('data-comment-pin-cancel') === '1';
      if (!Number.isFinite(commentId)) return;
      if (!requireLogin()) return;
      pinBtn.disabled = true;
      void pinComment(commentId, cancel)
        .then(async () => {
          if (options.onCommentsReload) {
            await options.onCommentsReload();
          } else {
            options.onRefresh();
          }
        })
        .catch((err) => {
          notify(err instanceof Error ? err.message : '置顶操作失败', 'error');
        })
        .finally(() => {
          pinBtn.disabled = false;
        });
      return;
    }

    const listMoreBtn = target.closest('[data-comment-list-more]');
    if (listMoreBtn instanceof HTMLButtonElement && options.onLoadMoreComments) {
      options.onLoadMoreComments();
      return;
    }

    const likeBtn = target.closest('[data-comment-like]');
    if (likeBtn instanceof HTMLButtonElement) {
      event.preventDefault();
      const commentId = Number(likeBtn.getAttribute('data-comment-like'));
      void toggleCommentReaction(commentId, likeBtn, options, false);
      return;
    }

    const dislikeBtn = target.closest('[data-comment-dislike]');
    if (dislikeBtn instanceof HTMLButtonElement) {
      event.preventDefault();
      const commentId = Number(dislikeBtn.getAttribute('data-comment-dislike'));
      void toggleCommentReaction(commentId, dislikeBtn, options, true);
      return;
    }

    const replyRootBtn = target.closest('[data-comment-reply]');
    if (replyRootBtn instanceof HTMLButtonElement) {
      const rootCommentId = Number(replyRootBtn.getAttribute('data-comment-reply'));
      if (!Number.isFinite(rootCommentId)) return;
      openCommentReplyDialog({
        rootCommentId,
        onSuccess: () => {
          const thread = options.replyStore.ensure(rootCommentId);
          thread.replyDelta += 1;
          if (thread.expanded) {
            void loadCommentReplies(rootCommentId, options.replyStore, options.getComments()).then(
              () => options.onRefresh(),
            );
          } else {
            void mergeRootCommentFromServer(
              rootCommentId,
              options.getComments,
              options.setComments,
            ).then(() => options.onRefresh());
          }
        },
      });
      return;
    }

    const replyToBtn = target.closest('[data-comment-reply-to]');
    if (replyToBtn instanceof HTMLButtonElement) {
      const rootCommentId = Number(
        replyToBtn.getAttribute('data-comment-reply-root') ||
          replyToBtn.closest('[data-comment-thread]')?.getAttribute('data-comment-thread'),
      );
      const mentionUserId = Number(replyToBtn.getAttribute('data-comment-reply-user'));
      const mentionName = replyToBtn.getAttribute('data-comment-reply-name') ?? '';
      if (!Number.isFinite(rootCommentId)) return;
      openCommentReplyDialog({
        rootCommentId,
        mentionUserId: Number.isFinite(mentionUserId) ? mentionUserId : null,
        mentionName: mentionName || null,
        onSuccess: () => {
          const thread = options.replyStore.ensure(rootCommentId);
          thread.replyDelta += 1;
          if (thread.expanded) {
            void loadCommentReplies(rootCommentId, options.replyStore, options.getComments()).then(
              () => options.onRefresh(),
            );
          } else {
            void mergeRootCommentFromServer(
              rootCommentId,
              options.getComments,
              options.setComments,
            ).then(() => options.onRefresh());
          }
        },
      });
      return;
    }

    const toggleBtn = target.closest('[data-comment-replies-toggle]');
    if (toggleBtn instanceof HTMLButtonElement) {
      const rootCommentId = Number(toggleBtn.getAttribute('data-comment-replies-toggle'));
      if (!Number.isFinite(rootCommentId)) return;
      const thread = options.replyStore.ensure(rootCommentId);
      if (thread.expanded) {
        thread.expanded = false;
        options.onRefresh();
        return;
      }
      thread.expanded = true;
      options.onRefresh();
      void loadCommentReplies(rootCommentId, options.replyStore, options.getComments()).then(() =>
        options.onRefresh(),
      );
      return;
    }

    const moreBtn = target.closest('[data-comment-replies-more]');
    if (moreBtn instanceof HTMLButtonElement) {
      const rootCommentId = Number(moreBtn.getAttribute('data-comment-replies-more'));
      if (!Number.isFinite(rootCommentId)) return;
      void loadCommentReplies(rootCommentId, options.replyStore, options.getComments(), {
        loadMore: true,
      }).then(() => options.onRefresh());
      return;
    }

    const retryBtn = target.closest('[data-comment-replies-retry]');
    if (retryBtn instanceof HTMLButtonElement) {
      const rootCommentId = Number(retryBtn.getAttribute('data-comment-replies-retry'));
      if (!Number.isFinite(rootCommentId)) return;
      const thread = options.replyStore.ensure(rootCommentId);
      void loadCommentReplies(rootCommentId, options.replyStore, options.getComments(), {
        loadMore: thread.page > 0,
      }).then(() => options.onRefresh());
      return;
    }

    const deleteBtn = target.closest('[data-comment-delete]');
    if (deleteBtn instanceof HTMLButtonElement) {
      const commentId = Number(deleteBtn.getAttribute('data-comment-delete'));
      const rootCommentId = Number(deleteBtn.getAttribute('data-comment-delete-root'));
      void handleDeleteComment(commentId, rootCommentId, options);
    }
  });
}

/** @deprecated 使用 bindCommentSection */
export function bindCommentLikeActions(root, options) {
  bindCommentSection(root, {
    getComments: options.getComments,
    setComments: options.setComments,
    replyStore: createCommentReplyStore(),
    bodyIdPrefix: 'watch-comment-body',
    replyBodyIdPrefix: 'watch-comment-reply',
    onRefresh: () => {},
  });
}

/** @deprecated 使用 mountAllCommentRichText */
export function mountCommentRichText(comments, bodyIdPrefix) {
  comments.forEach((item) => {
    const el = document.getElementById(`${bodyIdPrefix}-${item.id}`);
    const source = resolveCommentMountSource(item);
    if (el && source) mountRichContent(el, source);
  });
}
