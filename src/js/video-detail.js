import { materialIcon } from './icons.js';
import { mediaSrcForCover } from './content-api.js';
import { destroyWatchPlayer, getWatchPlayer } from './watch-player.js';
import { mountRichContent } from './rich-content.js';
import { loadStickerUrlMap } from './emoji-pack.js';
import { loadSession } from './auth.js';
import { getCurrentPage, setPage } from './pages.js';
import { requireLogin } from './login-ui.js';
import {
  createComment,
  fetchCommentList,
  fetchFollowStatus,
  fetchLikeStatus,
  fetchRelatedVideos,
  fetchVideoDetail,
  fetchVideoPlayParts,
  setFollow,
  setResourceLike,
} from './video-api.js';

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
let following = false;

/** @type {ContentPreview[]} */
let relatedItems = [];

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
      const avatar = avatarSrc
        ? `<img class="watch-comment__avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
        : `<span class="watch-comment__avatar watch-comment__avatar--ph"></span>`;
      return `
        <article class="watch-comment">
          ${avatar}
          <div class="watch-comment__body">
            <p class="watch-comment__author">${escapeHtml(item.authorName)}</p>
            <div class="watch-comment__text markdown-body" id="watch-comment-body-${item.id}"></div>
            <div class="watch-comment__meta">
              <span>${formatCount(item.likes)} 赞</span>
              ${item.replyCount > 0 ? `<span>${formatCount(item.replyCount)} 回复</span>` : ''}
            </div>
          </div>
        </article>`;
    })
    .join('');
}

/**
 * @param {VideoPart[]} parts
 */
function renderPlaylist(parts, activeIndex) {
  if (parts.length <= 1) return '';
  return `
    <section class="watch-playlist">
      <header class="watch-playlist__head">
        <span>分P列表</span>
        <span class="watch-playlist__count">${activeIndex + 1} / ${parts.length}</span>
      </header>
      <ol class="watch-playlist__list">
        ${parts
          .map(
            (part, index) => `
          <li>
            <button type="button" class="watch-playlist__item ${index === activeIndex ? 'is-active' : ''}" data-part-index="${index}">
              <span class="watch-playlist__idx">P${part.part}</span>
              <span class="watch-playlist__name">${escapeHtml(part.title)}</span>
            </button>
          </li>`,
          )
          .join('')}
      </ol>
    </section>`;
}

function renderSidePanel() {
  const detail = currentDetail;
  if (!detail) return;
  const { preview } = detail;
  const avatarSrc = mediaSrcForCover(detail.authorAvatar);
  const side = document.getElementById('watch-side-panel');
  if (!side) return;

  side.innerHTML = `
    <div class="watch-tabs" role="tablist">
      <button type="button" class="watch-tabs__btn ${activeTab === 'intro' ? 'is-active' : ''}" data-watch-tab="intro" role="tab">简介</button>
      <button type="button" class="watch-tabs__btn ${activeTab === 'comments' ? 'is-active' : ''}" data-watch-tab="comments" role="tab">
        评论<span class="watch-tabs__count">${formatCount(preview.comments)}</span>
      </button>
    </div>
    <div class="watch-side-scroll">
      <div class="watch-tab-panel" data-watch-panel="intro" ${activeTab === 'intro' ? '' : 'hidden'}>
        <div class="watch-uploader">
          <div class="watch-uploader__main">
            ${
              avatarSrc && detail.authorId
                ? `<button type="button" class="watch-uploader__avatar-btn" data-author-profile="${detail.authorId}" title="进入空间"><img class="watch-uploader__avatar" src="${escapeHtml(avatarSrc)}" alt="" /></button>`
                : avatarSrc
                  ? `<img class="watch-uploader__avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
                  : '<span class="watch-uploader__avatar watch-uploader__avatar--ph"></span>'
            }
            <div>
              <p class="watch-uploader__name">${escapeHtml(preview.author)}</p>
              <p class="watch-uploader__sub">MFuns 创作者</p>
            </div>
          </div>
          ${
            detail.authorId
              ? `<button type="button" class="watch-follow-btn ${following ? 'is-followed' : ''}" id="watch-follow-btn">${following ? '已关注' : '+ 关注'}</button>`
              : ''
          }
        </div>
        ${
          currentParts.length === 0
            ? '<p class="watch-playback-hint">暂无可用播放地址</p>'
            : ''
        }
        <h1 class="watch-side-title">${escapeHtml(preview.title)}</h1>
        <div class="watch-side-stats">
          <span>${materialIcon('play_arrow', 'watch-stat-icon')}${formatCount(preview.views)}</span>
          <span>${materialIcon('chat_bubble', 'watch-stat-icon')}${formatCount(preview.comments)}</span>
        </div>
        <div class="watch-actions">
          <button type="button" class="watch-action ${liked ? 'is-active' : ''}" id="watch-like-btn">
            ${materialIcon('thumb_up', 'watch-action-icon')}
            <span>${formatCount(likeCount)}</span>
          </button>
          <button type="button" class="watch-action" id="watch-share-btn">
            ${materialIcon('share', 'watch-action-icon')}
            <span>分享</span>
          </button>
        </div>
        ${
          detail.rawDescription
            ? `<div class="watch-desc markdown-body" id="watch-desc-rich"></div>`
            : ''
        }
        ${
          detail.tags.length
            ? `<div class="watch-tags">${detail.tags.map((t) => `<span class="watch-tag">${escapeHtml(t)}</span>`).join('')}</div>`
            : ''
        }
        ${renderPlaylist(currentParts, activePartIndex)}
        <section class="watch-related">
          <h2 class="watch-related__heading">相关推荐</h2>
          <div class="watch-related__list">${renderRelatedList(relatedItems)}</div>
        </section>
      </div>
      <div class="watch-tab-panel" data-watch-panel="comments" ${activeTab === 'comments' ? '' : 'hidden'}>
        <form class="watch-comment-form" id="watch-comment-form">
          <textarea class="watch-comment-input" id="watch-comment-input" rows="3" placeholder="发一条友善的评论"></textarea>
          <button type="submit" class="btn-accent watch-comment-submit">发布</button>
        </form>
        <div class="watch-comments" id="watch-comments-list">${renderComments(commentItems)}</div>
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
  commentItems.forEach((item) => {
    const el = document.getElementById(`watch-comment-body-${item.id}`);
    if (el && item.rawContent) mountRichContent(el, item.rawContent);
  });
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

  document.getElementById('watch-like-btn')?.addEventListener('click', async () => {
    if (!currentDetail || !requireLogin()) return;
    try {
      const next = !liked;
      await setResourceLike(Number(currentDetail.preview.id), next, 1);
      liked = next;
      likeCount += next ? 1 : -1;
      renderSidePanel();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
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
      alert(err instanceof Error ? err.message : '关注失败');
    }
  });

  document.getElementById('watch-share-btn')?.addEventListener('click', async () => {
    if (!currentDetail) return;
    const url = `https://m.mfuns.net/video/${currentDetail.preview.id}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('链接已复制');
    } catch {
      prompt('复制链接', url);
    }
  });

  document.querySelectorAll('[data-part-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.getAttribute('data-part-index'));
      if (!Number.isFinite(index)) return;
      activePartIndex = index;
      getWatchPlayer()?.loadPart(index, { autoPlay: true });
      document.querySelectorAll('[data-part-index]').forEach((el) => {
        el.classList.toggle('is-active', Number(el.getAttribute('data-part-index')) === index);
      });
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

  document.getElementById('watch-comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentDetail?.commentAreaId || !requireLogin()) return;
    const input = /** @type {HTMLTextAreaElement | null} */ (
      document.getElementById('watch-comment-input')
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
      renderSidePanel();
    } catch (err) {
      alert(err instanceof Error ? err.message : '发送失败');
    }
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
  returnPage = getCurrentPage();
  setPage('watch');
  activePartIndex = 0;
  activeTab = 'intro';
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

    const poster = detail.preview.cover ? mediaSrcForCover(detail.preview.cover) : null;
    if (parts.length > 0) {
      getWatchPlayer()?.load({
        parts,
        partIndex: 0,
        poster: poster ?? undefined,
        onPartChange: () => {
          const wp = getWatchPlayer();
          if (!wp) return;
          activePartIndex = wp.partIndex;
          document.querySelectorAll('[data-part-index]').forEach((el) => {
            el.classList.toggle(
              'is-active',
              Number(el.getAttribute('data-part-index')) === activePartIndex,
            );
          });
          const countEl = document.querySelector('.watch-playlist__count');
          if (countEl && currentParts.length > 0) {
            countEl.textContent = `${activePartIndex + 1} / ${currentParts.length}`;
          }
        },
      });
    }

    const session = loadSession();
    const likePromise = fetchLikeStatus(Number(detail.preview.id), 1).catch(() => ({
      liked: false,
      likes: detail.likes,
    }));
    const followPromise =
      detail.authorId && session?.token
        ? fetchFollowStatus(detail.authorId).catch(() => false)
        : Promise.resolve(false);

    const [likeStatus, followStatus] = await Promise.all([likePromise, followPromise]);
    liked = likeStatus.liked;
    likeCount = likeStatus.likes || detail.likes;
    following = followStatus;

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
}

export function bindVideoDetail() {
  document.getElementById('watch-back-btn')?.addEventListener('click', closeVideoDetail);
}
