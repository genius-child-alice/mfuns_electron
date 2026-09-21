import { loadSession } from './auth.js';
import { mediaSrcForCover } from './content-api.js';
import { createFeed, deleteFeed } from './feed-api.js';
import { openFeedDetail } from './feed-detail.js';
import { materialIcon } from './icons.js';
import { quillToText } from './message-quill.js';
import { mountRichContent } from './rich-content.js';
import { fetchUserFeeds } from './user-profile-api.js';
import { uploadCommentImage } from './video-api.js';
import { formatFeedDate } from './timeline-feed-ui.js';

/** @typedef {import('./user-profile-api.js').TimelineFeedItem} TimelineFeedItem */

/** @type {TimelineFeedItem[]} */
let feedItems = [];
let feedStartId = -1;
let feedHasMore = true;
let feedLoading = false;

/** @type {string[]} */
let composeImages = [];
let composeUploading = false;
let composePublishing = false;

let bound = false;

/** @type {(view: string) => void} */
let showViewFn = () => {};

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

function renderComposeImages() {
  const wrap = document.getElementById('contribute-feed-compose-images');
  if (!wrap) return;
  wrap.innerHTML = composeImages
    .map(
      (path) => {
        const src = mediaSrcForCover(path);
        return `
        <span class="contribute-feed-image">
          <img src="${escapeHtml(src ?? '')}" alt="" />
          <button type="button" class="contribute-feed-image__remove" data-compose-image-remove="${escapeHtml(path)}" aria-label="移除">×</button>
        </span>`;
      },
    )
    .join('');
  if (composeUploading) {
    wrap.innerHTML += `<span class="contribute-feed-image contribute-feed-image--loading">${materialIcon('progress_activity')}</span>`;
  }
}

function resetComposeForm() {
  const content = document.getElementById('contribute-feed-compose-content');
  const tags = document.getElementById('contribute-feed-compose-tags');
  if (content) content.value = '';
  if (tags) tags.value = '';
  composeImages = [];
  renderComposeImages();
}

export function openFeedComposeView() {
  resetComposeForm();
  showViewFn('feed-compose');
}

function renderFeedList() {
  const listEl = document.getElementById('contribute-feed-list');
  const footerEl = document.getElementById('contribute-feed-footer');
  if (!listEl || !footerEl) return;

  if (feedLoading && feedItems.length === 0) {
    listEl.innerHTML = '<p class="contribute-empty">加载中…</p>';
    footerEl.hidden = true;
    return;
  }

  if (feedItems.length === 0) {
    listEl.innerHTML = `
      <div class="contribute-empty">
        ${materialIcon('edit_note', 'contribute-empty__icon')}
        <p>还没有发布动态</p>
        <button type="button" class="btn-accent" id="contribute-feed-compose-first">发布第一条动态</button>
      </div>`;
    footerEl.hidden = true;
    return;
  }

  listEl.innerHTML = feedItems
    .map((item) => {
      const titleSource = item.rawTitle?.trim() || item.title?.trim() || '';
      const time = formatFeedDate(item.createdAt);
      return `
        <article class="contribute-feed-item" data-feed-id="${item.id}">
          <button type="button" class="contribute-feed-item__main" data-action="open-feed" data-id="${item.id}">
            ${
              titleSource
                ? `<div class="contribute-feed-item__title markdown-body markdown-body--feed" id="contribute-feed-title-${item.id}"></div>`
                : ''
            }
            <div class="contribute-feed-item__text markdown-body markdown-body--feed" id="contribute-feed-body-${item.id}"></div>
            <span class="contribute-feed-item__meta">${escapeHtml(time)} · ${item.likes} 赞 · ${item.comments} 评论</span>
          </button>
          <div class="contribute-feed-item__actions">
            <button type="button" class="contribute-card__action contribute-card__action--danger" data-action="delete-feed" data-id="${item.id}" title="删除">
              ${materialIcon('delete', 'contribute-card__action-icon')}
            </button>
          </div>
        </article>`;
    })
    .join('');

  feedItems.forEach((item) => {
    const titleSource = item.rawTitle?.trim() || item.title?.trim() || '';
    const titleEl = document.getElementById(`contribute-feed-title-${item.id}`);
    const bodyEl = document.getElementById(`contribute-feed-body-${item.id}`);
    if (titleEl && titleSource) mountRichContent(titleEl, titleSource);
    if (bodyEl) {
      const source = item.rawContent?.trim() || item.content?.trim() || '分享了一条动态';
      mountRichContent(bodyEl, source);
    }
  });

  footerEl.hidden = false;
  footerEl.textContent = feedHasMore ? '滚动加载更多…' : '已加载全部动态';
}

export async function loadMyFeeds(reset = true) {
  const userId = sessionUserId(loadSession()?.user);
  if (userId == null) return;
  if (feedLoading) return;
  feedLoading = true;
  if (reset) {
    feedItems = [];
    feedStartId = -1;
    feedHasMore = true;
  }
  renderFeedList();
  try {
    const batch = await fetchUserFeeds(userId, feedStartId);
    if (reset) feedItems = batch;
    else feedItems = [...feedItems, ...batch];
    if (batch.length === 0) feedHasMore = false;
    else feedStartId = batch[batch.length - 1].id;
  } catch {
    if (feedItems.length === 0) {
      const listEl = document.getElementById('contribute-feed-list');
      if (listEl) listEl.innerHTML = '<p class="contribute-empty">加载失败</p>';
    }
  } finally {
    feedLoading = false;
    renderFeedList();
  }
}

async function loadMoreFeeds() {
  if (!feedHasMore || feedLoading) return;
  await loadMyFeeds(false);
}

async function publishFeed() {
  if (composePublishing) return;
  const content = document.getElementById('contribute-feed-compose-content')?.value.trim() ?? '';
  if (!content) {
    alert('说点什么吧');
    return;
  }
  const tagsRaw = document.getElementById('contribute-feed-compose-tags')?.value ?? '';
  const tags = tagsRaw
    .split(/[,，]/)
    .map((tag) => tag.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .slice(0, 10);

  composePublishing = true;
  const btn = document.getElementById('contribute-feed-compose-submit');
  if (btn) btn.disabled = true;
  try {
    await createFeed({ content, images: composeImages, tags });
    showViewFn('hub');
    await loadMyFeeds(true);
  } catch (err) {
    alert(err instanceof Error ? err.message : '发布失败');
  } finally {
    composePublishing = false;
    if (btn) btn.disabled = false;
  }
}

async function removeFeed(feedId) {
  const item = feedItems.find((entry) => entry.id === feedId);
  const preview = item ? quillToText(item.rawContent).trim() || '该动态' : '该动态';
  if (!window.confirm(`确定删除动态「${preview.slice(0, 40)}」吗？`)) return;
  try {
    await deleteFeed(feedId);
    feedItems = feedItems.filter((entry) => entry.id !== feedId);
    renderFeedList();
  } catch (err) {
    alert(err instanceof Error ? err.message : '删除失败');
  }
}

async function addComposeImage(file) {
  if (composeUploading || composeImages.length >= 9) return;
  composeUploading = true;
  renderComposeImages();
  try {
    const path = await uploadCommentImage(file);
    composeImages.push(path);
  } catch (err) {
    alert(err instanceof Error ? err.message : '图片上传失败');
  } finally {
    composeUploading = false;
    renderComposeImages();
  }
}

/**
 * @param {(view: string) => void} showView
 */
export function bindContributeFeedSection(showView) {
  if (bound) return;
  bound = true;
  showViewFn = showView;

  document.getElementById('contribute-feed-compose-btn')?.addEventListener('click', () => {
    openFeedComposeView();
  });
  document.getElementById('contribute-feed-compose-back')?.addEventListener('click', () => {
    showViewFn('hub');
  });
  document.getElementById('contribute-feed-compose-submit')?.addEventListener('click', () => {
    void publishFeed();
  });
  document.getElementById('contribute-feed-compose-add-image')?.addEventListener('click', () => {
    document.getElementById('contribute-feed-compose-image-file')?.click();
  });

  document.getElementById('contribute-feed-compose-image-file')?.addEventListener('change', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const file = input.files?.[0];
    input.value = '';
    if (file) void addComposeImage(file);
  });

  document.getElementById('contribute-feed-scroll')?.addEventListener('scroll', (event) => {
    const el = /** @type {HTMLElement} */ (event.target);
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 320) void loadMoreFeeds();
  });

  const section = document.getElementById('contribute-feed-section');
  section?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.id === 'contribute-feed-compose-first') {
      openFeedComposeView();
      return;
    }
    const actionEl = target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');
    const id = Number.parseInt(actionEl.getAttribute('data-id') ?? '', 10);
    if (action === 'open-feed' && Number.isFinite(id)) {
      void openFeedDetail(id);
      return;
    }
    if (action === 'delete-feed' && Number.isFinite(id)) {
      void removeFeed(id);
    }
  });

  section?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const removePath = target.getAttribute('data-compose-image-remove');
    if (removePath) {
      composeImages = composeImages.filter((path) => path !== removePath);
      renderComposeImages();
    }
  });

}

export function onContributeFeedSectionEnter() {
  void loadMyFeeds(true);
}
