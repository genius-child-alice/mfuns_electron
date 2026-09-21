import { materialIcon } from './icons.js';
import { loadSession } from './auth.js';
import { deleteFeed } from './feed-api.js';
import { openFeedForward } from './feed-forward.js';
import { openCommentComposer } from './comment-composer.js';
import { requireLogin } from './login-ui.js';
import {
  fetchCommentList,
  fetchReactionStatus,
  setResourceReaction,
} from './video-api.js';
import { fetchFeedDetail } from './user-profile-api.js';
import {
  bindTimelineFeedClick,
  handleTimelineFeedClick,
  hydrateFeedCards,
  renderFeedCard,
} from './timeline-feed-ui.js';
import {
  bindCommentSection,
  createCommentReplyStore,
  mountAllCommentRichText,
  renderCommentsHtml,
} from './comment-ui.js';

/** @typedef {import('./user-profile-api.js').FeedDetail} FeedDetail */
/** @typedef {import('./video-api.js').CommunityComment} CommunityComment */

const FEED_DETAIL_DOM = 'feed-detail';
const COMMENT_BODY_PREFIX = 'feed-detail-comment';
const COMMENT_REPLY_PREFIX = 'feed-detail-reply';

/** @type {FeedDetail | null} */
let currentDetail = null;

/** @type {CommunityComment[]} */
let commentItems = [];

const commentReplyStore = createCommentReplyStore();

let commentOrder = 'desc';

let detailTab = 'comment';

let bound = false;

let liked = false;
let disliked = false;
let likeCount = 0;
let dislikeCount = 0;

/**
 * @param {number} n
 */
function formatCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

function renderFeedInteractBar() {
  const bar = document.getElementById('feed-detail-interact');
  if (!bar) return;
  bar.hidden = false;
  bar.innerHTML = `
    <button type="button" class="watch-interact-bar__item ${liked ? 'is-active' : ''}" id="feed-detail-like-btn">
      <span class="watch-interact-bar__icon">${materialIcon('thumb_up')}</span>
      <span class="watch-interact-bar__label">${formatCount(likeCount)}</span>
    </button>
    <button type="button" class="watch-interact-bar__item ${disliked ? 'is-active' : ''}" id="feed-detail-dislike-btn">
      <span class="watch-interact-bar__icon">${materialIcon('thumb_down')}</span>
      <span class="watch-interact-bar__label">${formatCount(dislikeCount)}</span>
    </button>`;

  document.getElementById('feed-detail-like-btn')?.addEventListener('click', () => {
    void toggleFeedReaction(false);
  });
  document.getElementById('feed-detail-dislike-btn')?.addEventListener('click', () => {
    void toggleFeedReaction(true);
  });
}

async function toggleFeedReaction(dislike) {
  if (!currentDetail || !requireLogin()) return;
  try {
    const active = dislike ? disliked : liked;
    const action = active ? 'cancel' : dislike ? 'dislike' : 'like';
    await setResourceReaction(currentDetail.feed.id, action, 3);
    const status = await fetchReactionStatus(currentDetail.feed.id, 3);
    liked = status.liked;
    disliked = status.disliked;
    likeCount = status.likes || currentDetail.feed.likes;
    dislikeCount = status.dislikes;
    renderFeedInteractBar();
  } catch (err) {
    alert(err instanceof Error ? err.message : '操作失败');
  }
}

async function loadFeedReactionStatus() {
  if (!currentDetail) return;
  likeCount = currentDetail.feed.likes;
  dislikeCount = 0;
  liked = false;
  disliked = false;
  const session = loadSession();
  if (!session?.token) {
    renderFeedInteractBar();
    return;
  }
  try {
    const status = await fetchReactionStatus(currentDetail.feed.id, 3);
    liked = status.liked;
    disliked = status.disliked;
    likeCount = status.likes || currentDetail.feed.likes;
    dislikeCount = status.dislikes;
  } catch {
    // keep feed card counts
  }
  renderFeedInteractBar();
}

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('feed-detail-dialog'));
}

function refreshCommentsUi() {
  const list = document.getElementById('feed-detail-comment-list');
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

function syncTabsUi() {
  document.querySelectorAll('[data-feed-detail-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-feed-detail-tab') === detailTab);
  });
  const repost = document.getElementById('feed-detail-repost-panel');
  const comment = document.getElementById('feed-detail-comment-panel');
  if (repost) repost.hidden = detailTab !== 'repost';
  if (comment) comment.hidden = detailTab !== 'comment';
}

function syncSortUi() {
  document.querySelectorAll('[data-feed-comment-order]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-feed-comment-order') === commentOrder);
  });
}

async function reloadComments() {
  if (!currentDetail?.commentAreaId) return;
  commentItems = await fetchCommentList(currentDetail.commentAreaId, 1, commentOrder).catch(
    () => [],
  );
  refreshCommentsUi();
}

/**
 * @param {FeedDetail} detail
 */
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

function syncFeedOwnerActions(detail) {
  const actions = document.getElementById('feed-detail-owner-actions');
  const forwardBtn = document.getElementById('feed-detail-forward-btn');
  const deleteBtn = document.getElementById('feed-detail-delete-btn');
  if (!actions || !forwardBtn || !deleteBtn) return;
  const viewerId = sessionUserId(loadSession()?.user);
  const isOwner = viewerId != null && detail.feed.authorId === viewerId;
  const loggedIn = Boolean(loadSession()?.token);
  forwardBtn.hidden = !loggedIn;
  deleteBtn.hidden = !isOwner;
  actions.hidden = !loggedIn && !isOwner;
}

function renderDetailContent(detail) {
  const post = document.getElementById('feed-detail-post');
  if (!post) return;
  syncFeedOwnerActions(detail);
  post.innerHTML = renderFeedCard(detail.feed, {
    domIdPrefix: FEED_DETAIL_DOM,
    profileFallback: null,
    spaceOwnerId: null,
    hideCardActions: true,
  });
  hydrateFeedCards([detail.feed], FEED_DETAIL_DOM, { clampBody: false });

  const composer = document.getElementById('feed-detail-composer');
  if (composer) {
    composer.hidden = detail.commentAreaId == null;
  }

  syncTabsUi();
  syncSortUi();
  void loadFeedReactionStatus();
}

function setLoading(on) {
  const post = document.getElementById('feed-detail-post');
  const hint = document.getElementById('feed-detail-loading');
  if (post) post.hidden = on;
  if (hint) hint.hidden = !on;
}

/**
 * @param {number} feedId
 */
export async function openFeedDetail(feedId) {
  const dialog = getDialog();
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  setLoading(true);
  const errEl = document.getElementById('feed-detail-error');
  if (errEl) {
    errEl.textContent = '';
    errEl.hidden = true;
  }
  const post = document.getElementById('feed-detail-post');
  if (post) post.innerHTML = '';
  detailTab = 'comment';
  commentOrder = 'desc';
  commentReplyStore.clear();
  const interact = document.getElementById('feed-detail-interact');
  if (interact) {
    interact.hidden = true;
    interact.innerHTML = '';
  }

  try {
    currentDetail = await fetchFeedDetail(feedId);
    renderDetailContent(currentDetail);
    setLoading(false);
    if (currentDetail.commentAreaId) {
      await reloadComments();
    } else {
      const list = document.getElementById('feed-detail-comment-list');
      if (list) {
        list.innerHTML = '<p class="watch-comments__empty">该动态暂不支持评论</p>';
      }
    }
  } catch (err) {
    setLoading(false);
    const errEl = document.getElementById('feed-detail-error');
    if (errEl) {
      errEl.textContent = err instanceof Error ? err.message : '加载失败';
      errEl.hidden = false;
    }
  }
}

export function closeFeedDetail() {
  getDialog()?.close();
  currentDetail = null;
  commentItems = [];
  commentReplyStore.clear();
}

function onDialogClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  if (target.id === 'feed-detail-dialog') closeFeedDetail();

  if (
    handleTimelineFeedClick(event, {
      onOpenUserSpace: (uid) => {
        closeFeedDetail();
        void import('./user-space.js').then((mod) => mod.openUserSpace(uid));
      },
    })
  ) {
    return;
  }

  const profileBtn = target.closest('[data-author-profile]');
  if (profileBtn instanceof HTMLElement) {
    const uid = Number.parseInt(profileBtn.getAttribute('data-author-profile') ?? '', 10);
    if (Number.isFinite(uid)) {
      closeFeedDetail();
      void import('./user-space.js').then((mod) => mod.openUserSpace(uid));
    }
  }
}

export function bindFeedDetail() {
  if (bound) return;
  bound = true;

  bindCommentSection(getDialog(), {
    getComments: () => commentItems,
    setComments: (comments) => {
      commentItems = comments;
    },
    replyStore: commentReplyStore,
    bodyIdPrefix: COMMENT_BODY_PREFIX,
    replyBodyIdPrefix: COMMENT_REPLY_PREFIX,
    onRefresh: refreshCommentsUi,
  });

  const dialog = getDialog();
  dialog?.addEventListener('click', onDialogClick);
  document.getElementById('feed-detail-close')?.addEventListener('click', () => closeFeedDetail());

  document.querySelectorAll('[data-feed-detail-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-feed-detail-tab');
      if (tab !== 'repost' && tab !== 'comment') return;
      detailTab = tab;
      syncTabsUi();
    });
  });

  document.querySelectorAll('[data-feed-comment-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = btn.getAttribute('data-feed-comment-order');
      if (order !== 'desc' && order !== 'asc') return;
      if (order === commentOrder) return;
      commentOrder = order;
      syncSortUi();
      void reloadComments();
    });
  });

  document.getElementById('feed-detail-comment-trigger')?.addEventListener('click', () => {
    if (!currentDetail?.commentAreaId || !requireLogin()) return;
    openCommentComposer({
      title: '发表一个评论',
      areaId: currentDetail.commentAreaId,
      onSuccess: async () => {
        commentReplyStore.clear();
        await reloadComments();
      },
    });
  });

  bindTimelineFeedClick(document.getElementById('feed-detail-post'), {
    onOpenUserSpace: (uid) => {
      closeFeedDetail();
      void import('./user-space.js').then((mod) => mod.openUserSpace(uid));
    },
  });

  document.getElementById('feed-detail-forward-btn')?.addEventListener('click', () => {
    if (!currentDetail || !requireLogin()) return;
    openFeedForward({
      resourceId: currentDetail.feed.id,
      resourceType: 3,
      resourceTitle: currentDetail.feed.title || currentDetail.feed.content,
      resourceCover: currentDetail.feed.images[0] ?? currentDetail.feed.resource?.cover ?? '',
    });
  });

  document.getElementById('feed-detail-delete-btn')?.addEventListener('click', () => {
    if (!currentDetail || !requireLogin()) return;
    if (!window.confirm('确定删除这条动态吗？删除后无法恢复。')) return;
    void deleteFeed(currentDetail.feed.id)
      .then(() => {
        closeFeedDetail();
      })
      .catch((err) => {
        alert(err instanceof Error ? err.message : '删除失败');
      });
  });
}
