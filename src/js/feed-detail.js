import { requireLogin } from './login-ui.js';
import { createComment, fetchCommentList } from './video-api.js';
import { fetchFeedDetail } from './user-profile-api.js';
import {
  bindTimelineFeedClick,
  handleTimelineFeedClick,
  hydrateFeedCards,
  renderFeedCard,
} from './timeline-feed-ui.js';
import {
  bindCommentLikeActions,
  mountCommentRichText,
  renderCommentsHtml,
} from './comment-ui.js';

/** @typedef {import('./user-profile-api.js').FeedDetail} FeedDetail */
/** @typedef {import('./video-api.js').CommunityComment} CommunityComment */

const FEED_DETAIL_DOM = 'feed-detail';

/** @type {FeedDetail | null} */
let currentDetail = null;

/** @type {CommunityComment[]} */
let commentItems = [];

let commentOrder = 'desc';

let detailTab = 'comment';

let bound = false;

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('feed-detail-dialog'));
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

function hydrateCommentRichText() {
  mountCommentRichText(commentItems, 'feed-detail-comment');
}

async function reloadComments() {
  if (!currentDetail?.commentAreaId) return;
  commentItems = await fetchCommentList(currentDetail.commentAreaId, 1, commentOrder).catch(
    () => [],
  );
  const list = document.getElementById('feed-detail-comment-list');
  if (list) {
    list.innerHTML = renderCommentsHtml(commentItems, { bodyIdPrefix: 'feed-detail-comment' });
    hydrateCommentRichText();
  }
}

/**
 * @param {FeedDetail} detail
 */
function renderDetailContent(detail) {
  const post = document.getElementById('feed-detail-post');
  if (!post) return;
  post.innerHTML = renderFeedCard(detail.feed, {
    domIdPrefix: FEED_DETAIL_DOM,
    profileFallback: null,
    spaceOwnerId: null,
  });
  hydrateFeedCards([detail.feed], FEED_DETAIL_DOM, { clampBody: false });

  const composer = document.getElementById('feed-detail-composer');
  if (composer) {
    composer.hidden = detail.commentAreaId == null;
  }

  syncTabsUi();
  syncSortUi();
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

  bindCommentLikeActions(getDialog(), {
    getComments: () => commentItems,
    setComments: (comments) => {
      commentItems = comments;
    },
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

  document.getElementById('feed-detail-comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentDetail?.commentAreaId || !requireLogin()) return;
    const input = /** @type {HTMLTextAreaElement | null} */ (
      document.getElementById('feed-detail-comment-input')
    );
    const text = input?.value.trim() ?? '';
    if (!text) return;
    try {
      await createComment(currentDetail.commentAreaId, text);
      if (input) input.value = '';
      await reloadComments();
    } catch (err) {
      alert(err instanceof Error ? err.message : '评论失败');
    }
  });

  bindTimelineFeedClick(document.getElementById('feed-detail-post'), {
    onOpenUserSpace: (uid) => {
      closeFeedDetail();
      void import('./user-space.js').then((mod) => mod.openUserSpace(uid));
    },
  });
}
