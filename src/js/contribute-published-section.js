import { loadSession } from './auth.js';
import { mediaSrcForCover } from './content-api.js';
import { openContentDetail } from './content-nav.js';
import { materialIcon } from './icons.js';
import { fetchUserArticles, fetchUserVideos } from './user-profile-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

/** @type {0 | 1} */
let publishedTab = 0;

/** @type {ContentPreview[]} */
let publishedItems = [];
let publishedLoading = false;
let publishedHasMore = true;
/** @type {number | null} */
let publishedCursor = null;

let bound = false;

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

function renderPublishedTabs() {
  document.querySelectorAll('[data-published-tab]').forEach((el) => {
    const tab = Number.parseInt(el.getAttribute('data-published-tab') ?? '0', 10);
    el.classList.toggle('is-active', tab === publishedTab);
    el.setAttribute('aria-selected', tab === publishedTab ? 'true' : 'false');
  });
}

/**
 * @param {ContentPreview} item
 */
function renderPublishedCard(item) {
  const coverSrc = item.cover ? mediaSrcForCover(item.cover) : '';
  const typeLabel = item.type === 1 ? '视频' : '文章';
  return `
    <article class="contribute-card" data-published-id="${item.id}" data-published-type="${item.type}">
      <button type="button" class="contribute-card__main" data-action="open-published" data-id="${item.id}" data-type="${item.type}">
        <span class="contribute-card__cover">
          ${
            coverSrc
              ? `<img src="${escapeHtml(coverSrc)}" alt="" loading="lazy" />`
              : materialIcon(item.type === 1 ? 'play_circle' : 'article', 'contribute-card__cover-icon')
          }
        </span>
        <span class="contribute-card__body">
          <h3 class="contribute-card__title">${escapeHtml(item.title || '未命名')}</h3>
          <span class="contribute-card__meta">
            <span class="contribute-card__status">${typeLabel}</span>
            <span class="contribute-card__time">${item.views} 播放/阅读</span>
          </span>
        </span>
      </button>
    </article>`;
}

function renderPublishedList() {
  const listEl = document.getElementById('contribute-published-list');
  const footerEl = document.getElementById('contribute-published-footer');
  if (!listEl || !footerEl) return;

  if (publishedLoading && publishedItems.length === 0) {
    listEl.innerHTML = '<p class="contribute-empty">加载中…</p>';
    footerEl.hidden = true;
    return;
  }

  if (publishedItems.length === 0) {
    listEl.innerHTML = `
      <div class="contribute-empty">
        ${materialIcon('inventory_2', 'contribute-empty__icon')}
        <p>还没有已发布的${publishedTab === 1 ? '视频' : '文章'}</p>
        <p class="contribute-empty__sub">审核通过后会出现在这里；修改请前往「投稿」</p>
      </div>`;
    footerEl.hidden = true;
    return;
  }

  listEl.innerHTML = publishedItems.map(renderPublishedCard).join('');
  footerEl.hidden = false;
  footerEl.textContent = publishedHasMore ? '滚动加载更多…' : '已加载全部内容';
}

export async function loadPublishedContent(reset = true) {
  const userId = sessionUserId(loadSession()?.user);
  if (userId == null || publishedLoading) return;
  publishedLoading = true;
  if (reset) {
    publishedItems = [];
    publishedCursor = null;
    publishedHasMore = true;
  }
  renderPublishedList();
  try {
    const cursor = publishedCursor ?? 0;
    const batch =
      publishedTab === 1
        ? await fetchUserVideos(userId, cursor)
        : await fetchUserArticles(userId, cursor);
    if (reset) publishedItems = batch;
    else publishedItems = [...publishedItems, ...batch];
    publishedHasMore = batch.length > 0;
    publishedCursor = batch.length ? batch[batch.length - 1].id : publishedCursor;
  } catch {
    if (publishedItems.length === 0) {
      const listEl = document.getElementById('contribute-published-list');
      if (listEl) listEl.innerHTML = '<p class="contribute-empty">加载失败</p>';
    }
  } finally {
    publishedLoading = false;
    renderPublishedList();
  }
}

async function loadMorePublished() {
  if (!publishedHasMore || publishedLoading) return;
  await loadPublishedContent(false);
}

export function bindContributePublishedSection() {
  if (bound) return;
  bound = true;

  document.querySelectorAll('[data-published-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      const tab = Number.parseInt(el.getAttribute('data-published-tab') ?? '0', 10);
      if (tab === publishedTab) return;
      publishedTab = tab === 1 ? 1 : 0;
      renderPublishedTabs();
      void loadPublishedContent(true);
    });
  });

  document.getElementById('contribute-published-scroll')?.addEventListener('scroll', (event) => {
    const el = /** @type {HTMLElement} */ (event.target);
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 320) void loadMorePublished();
  });

  document.getElementById('contribute-published-section')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const actionEl = target.closest('[data-action="open-published"]');
    if (!actionEl) return;
    const id = Number.parseInt(actionEl.getAttribute('data-id') ?? '', 10);
    const type = Number.parseInt(actionEl.getAttribute('data-type') ?? '', 10);
    if (!Number.isFinite(id)) return;
    const preview = publishedItems.find((item) => item.id === id && item.type === type);
    if (preview) void openContentDetail(preview);
  });
}

export function onContributePublishedSectionEnter() {
  renderPublishedTabs();
  void loadPublishedContent(true);
}
