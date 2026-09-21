import { materialIcon } from './icons.js';
import { mediaSrcForCover } from './content-api.js';
import { fetchArticleDetail } from './article-api.js';
import { getCurrentPage } from './pages.js';
import { mountRichContent } from './rich-content.js';
import { fetchFeedDetail } from './user-profile-api.js';
import { fetchVideoDetail } from './video-api.js';
import { hydrateFeedCards, renderFeedCard } from './timeline-feed-ui.js';
import {
  MESSAGE_PAGE_SIZE,
  fetchNotifyCounts,
  fetchNotifications,
  fetchSiteNotifications,
  formatNotifyTime,
  notifyItemKey,
  resolveNotifyResource,
} from './message-api.js';
import { openUserSpace } from './user-space.js';

/** @typedef {import('./message-api.js').NotifyItem} NotifyItem */
/** @typedef {import('./message-api.js').NotifyCounts} NotifyCounts */

/** @type {Record<number, string>} */
export const NOTIFY_TABS = {
  1: '赞',
  2: '评论',
  3: '提及',
  4: '系统',
};

const SCROLL_PREFETCH_MIN_PX = 200;

/** @type {1 | 2 | 3 | 4} */
let activeNotifyType = 1;

/** @type {Record<number, NotifyItem[]>} */
const notifyItems = { 1: [], 2: [], 3: [], 4: [] };

/** @type {Record<number, number>} */
const notifyPages = { 1: 1, 2: 1, 3: 1, 4: 1 };

/** @type {Record<number, boolean>} */
const notifyHasMore = { 1: true, 2: true, 3: true, 4: true };

/** @type {Record<number, boolean>} */
const notifyLoading = { 1: false, 2: false, 3: false, 4: false };

/** @type {Record<number, boolean>} */
const notifyLoaded = { 1: false, 2: false, 3: false, 4: false };

/** @type {NotifyCounts | null} */
let latestCounts = null;

let bound = false;
let detailLoading = false;

/** @type {string | null} */
let selectedNotifyKey = null;

const NOTIFY_DETAIL_DOM = 'notify-detail';

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

function getNotifyScroll() {
  return document.getElementById('message-notify-scroll');
}

function getNotifyList() {
  return document.getElementById('message-notify-list');
}

function getNotifyDetail() {
  return document.getElementById('message-notify-detail');
}

function showNotifyDetailEmpty(message = '选择左侧通知查看详情') {
  const root = getNotifyDetail();
  if (!root) return;
  root.innerHTML = `<p class="message-page__empty">${escapeHtml(message)}</p>`;
}

function setNotifyFooter(html, visible = true) {
  const el = document.getElementById('message-notify-footer');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = !visible;
}

/**
 * @param {NotifyCounts} counts
 */
export function renderNotifySummary(counts) {
  latestCounts = counts;
  const el = document.getElementById('message-notify-summary');
  if (!el) return;
  el.innerHTML = `
    <span class="message-notify__summary-label">未读</span>
    <span class="message-notify__summary-text">
      赞 ${counts.like} · 评论 ${counts.comment} · 提及 ${counts.mention} · 系统 ${counts.system}
    </span>`;

  document.querySelectorAll('[data-notify-type]').forEach((btn) => {
    const type = Number.parseInt(btn.getAttribute('data-notify-type') ?? '', 10);
    const badge = btn.querySelector('.message-notify__tab-badge');
    if (!badge) return;
    const count =
      type === 1 ? counts.like : type === 2 ? counts.comment : type === 3 ? counts.mention : counts.system;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = false;
    } else {
      badge.textContent = '';
      badge.hidden = true;
    }
  });

  const notifyTabBadge = document.getElementById('message-tab-notify-badge');
  if (notifyTabBadge) {
    const notifyUnread = counts.like + counts.comment + counts.mention + counts.system;
    if (notifyUnread > 0) {
      notifyTabBadge.textContent = notifyUnread > 99 ? '99+' : String(notifyUnread);
      notifyTabBadge.hidden = false;
    } else {
      notifyTabBadge.textContent = '';
      notifyTabBadge.hidden = true;
    }
  }
}

function syncNotifyTabsActive() {
  document.querySelectorAll('[data-notify-type]').forEach((btn) => {
    const type = Number.parseInt(btn.getAttribute('data-notify-type') ?? '', 10);
    btn.classList.toggle('is-active', type === activeNotifyType);
    btn.setAttribute('aria-selected', type === activeNotifyType ? 'true' : 'false');
  });
}

/**
 * @param {NotifyItem} item
 */
function canOpenReference(item) {
  return item.resourceId != null || item.commentId != null || item.areaId != null;
}

/**
 * @param {NotifyItem} item
 * @param {boolean} [system]
 */
function renderNotifyCard(item, system = false) {
  const key = notifyItemKey(item);
  const active = selectedNotifyKey === key;
  const time = formatNotifyTime(item.createdAt);
  const text = item.text || '（空通知）';
  const avatar = item.senderAvatar;
  const initial = escapeHtml((item.senderName || 'U').slice(0, 1));
  const name = item.senderName || (item.senderUserId ? `用户 ${item.senderUserId}` : '用户');

  if (system) {
    return `
      <article class="message-notify-card message-notify-card--system${active ? ' is-active' : ''}" data-notify-key="${escapeHtml(key)}">
        <span class="message-notify-card__avatar message-notify-card__avatar--system">
          ${materialIcon('campaign', 'message-notify-card__system-icon')}
        </span>
        <div class="message-notify-card__body">
          <div class="message-notify-card__row">
            <span class="message-notify-card__name">系统通知</span>
            ${time ? `<time class="message-notify-card__time">${escapeHtml(time)}</time>` : ''}
          </div>
          <p class="message-notify-card__text">${escapeHtml(text)}</p>
        </div>
      </article>`;
  }

  return `
    <article class="message-notify-card${active ? ' is-active' : ''}" data-notify-key="${escapeHtml(key)}">
      <button type="button" class="message-notify-card__avatar" data-notify-user="${item.senderUserId}" aria-label="查看用户">
        ${
          avatar
            ? `<img src="${escapeHtml(avatar)}" alt="" />`
            : `<span class="message-notify-card__avatar-ph">${initial}</span>`
        }
      </button>
      <div class="message-notify-card__body">
        <div class="message-notify-card__row">
          <span class="message-notify-card__name">${escapeHtml(name)}</span>
          ${time ? `<time class="message-notify-card__time">${escapeHtml(time)}</time>` : ''}
        </div>
        <p class="message-notify-card__text">${escapeHtml(text)}</p>
        ${item.commentId != null ? `<p class="message-notify-card__meta">评论 ID ${item.commentId}</p>` : ''}
      </div>
    </article>`;
}

function renderNotifyList() {
  const list = getNotifyList();
  if (!list) return;

  const items = notifyItems[activeNotifyType] ?? [];
  const system = activeNotifyType === 4;

  if (!items.length && !notifyLoading[activeNotifyType]) {
    list.innerHTML = `<p class="message-page__empty">${system ? '暂无系统通知' : '暂无此类通知'}</p>`;
    setNotifyFooter('', false);
    return;
  }

  list.innerHTML = items.map((item) => renderNotifyCard(item, system)).join('');

  if (notifyLoading[activeNotifyType]) {
    setNotifyFooter(`${materialIcon('progress_activity', 'message-page__spin')}`, true);
  } else if (!notifyHasMore[activeNotifyType] && items.length > 0) {
    setNotifyFooter('没有更多了', true);
  } else {
    setNotifyFooter('', false);
  }
}

/**
 * @param {1 | 2 | 3 | 4} type
 */
async function loadNotifyPage(type, first) {
  if (notifyLoading[type]) return;
  notifyLoading[type] = true;
  if (first) {
    setNotifyFooter(`${materialIcon('progress_activity', 'message-page__spin')}加载中…`, true);
  }

  try {
    const page = first ? 1 : (notifyPages[type] ?? 1) + 1;
    const next =
      type === 4 ? await fetchSiteNotifications(page) : await fetchNotifications(type, page);

    if (first) {
      notifyItems[type] = next;
      notifyPages[type] = 1;
      notifyHasMore[type] = next.length >= MESSAGE_PAGE_SIZE;
    } else {
      const known = new Set((notifyItems[type] ?? []).map(notifyItemKey));
      const additions = next.filter((item) => known.add(notifyItemKey(item)));
      notifyItems[type] = [...(notifyItems[type] ?? []), ...additions];
      notifyPages[type] = page;
      notifyHasMore[type] = next.length > 0 && additions.length > 0;
    }

    notifyLoaded[type] = true;
    if (type === activeNotifyType) renderNotifyList();

    const counts = await fetchNotifyCounts();
    renderNotifySummary(counts);
  } catch (err) {
    if (first && (notifyItems[type] ?? []).length === 0) {
      const list = getNotifyList();
      if (list && type === activeNotifyType) {
        list.innerHTML = `<p class="message-page__empty message-page__empty--error">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`;
      }
    }
    setNotifyFooter('', false);
  } finally {
    notifyLoading[type] = false;
    if (type === activeNotifyType) renderNotifyList();
  }
}

function onNotifyScroll() {
  const el = getNotifyScroll();
  if (!el || notifyLoading[activeNotifyType] || !notifyHasMore[activeNotifyType]) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_PREFETCH_MIN_PX) {
    void loadNotifyPage(activeNotifyType, false);
  }
}

/**
 * @param {1 | 2 | 3 | 4} type
 */
export function selectNotifyType(type) {
  activeNotifyType = type;
  selectedNotifyKey = null;
  showNotifyDetailEmpty();
  syncNotifyTabsActive();
  if (!notifyLoaded[type] || (notifyItems[type] ?? []).length === 0) {
    void loadNotifyPage(type, true);
  } else {
    renderNotifyList();
  }
}

/**
 * @param {NotifyItem} item
 * @param {boolean} [system]
 */
function renderNotifyDetailHead(item, system = false) {
  const time = formatNotifyTime(item.createdAt);
  const text = item.text || '（空通知）';
  const name = system ? '系统通知' : item.senderName || (item.senderUserId ? `用户 ${item.senderUserId}` : '用户');
  const avatar = system ? '' : item.senderAvatar;
  const initial = escapeHtml(name.slice(0, 1) || '系');

  return `
    <header class="message-notify-detail__head">
      <div class="message-notify-detail__sender">
        ${
          system
            ? `<span class="message-notify-detail__sender-avatar message-notify-detail__sender-avatar--ph">${materialIcon('campaign')}</span>`
            : avatar
              ? `<img class="message-notify-detail__sender-avatar" src="${escapeHtml(avatar)}" alt="" />`
              : `<span class="message-notify-detail__sender-avatar message-notify-detail__sender-avatar--ph">${initial}</span>`
        }
        <div>
          <p class="message-notify-detail__sender-name">${escapeHtml(name)}</p>
          ${time ? `<p class="message-notify-detail__time">${escapeHtml(time)}</p>` : ''}
        </div>
      </div>
      <p class="message-notify-detail__notify-text">${escapeHtml(text)}</p>
    </header>`;
}

/**
 * @param {import('./content-api.js').ContentPreview} preview
 */
function minimalPreview(preview) {
  return {
    id: preview.id,
    title: preview.title || '通知内容',
    cover: preview.cover ?? null,
    author: preview.author || '',
    authorId: preview.authorId ?? null,
    authorAvatar: preview.authorAvatar ?? null,
    type: preview.type,
    views: preview.views ?? 0,
    comments: preview.comments ?? 0,
    duration: preview.duration ?? null,
    createdAt: preview.createdAt ?? null,
  };
}

/**
 * @param {number} resourceId
 * @param {number} resourceType
 */
async function loadResourcePreview(resourceId, resourceType) {
  const attempts =
    resourceType === 1 ? [1, 0, 4] : resourceType === 4 ? [4, 0, 1] : [0, 4, 1];

  for (const type of attempts) {
    try {
      if (type === 4) {
        const detail = await fetchFeedDetail(resourceId);
        return { kind: 'feed', detail, preview: detail.feed };
      }
      const preview = minimalPreview({
        id: resourceId,
        type,
        title: '',
        cover: null,
        author: '',
        authorId: null,
        authorAvatar: null,
        views: 0,
        comments: 0,
        duration: null,
        createdAt: null,
      });
      if (type === 1) {
        const detail = await fetchVideoDetail(preview);
        return { kind: 'video', detail, preview: detail.preview };
      }
      const detail = await fetchArticleDetail(preview);
      return { kind: 'article', detail, preview: detail.preview };
    } catch {
      /* try next type */
    }
  }
  return null;
}

/**
 * @param {NotifyItem} item
 * @param {string} bodyHtml
 * @param {{ resourceId?: number, resourceType?: number, preview?: import('./content-api.js').ContentPreview }} [options]
 */
function renderNotifyDetailShell(item, bodyHtml, options = {}) {
  const root = getNotifyDetail();
  if (!root) return;
  const system = activeNotifyType === 4;
  const canOpenFullscreen = options.preview != null;

  root.innerHTML = `
    ${renderNotifyDetailHead(item, system)}
    <div class="message-notify-detail__body">${bodyHtml}</div>
    ${
      canOpenFullscreen
        ? `<div class="message-notify-detail__actions">
            <button type="button" class="message-notify-detail__open-btn" id="message-notify-open-full"
              data-resource-id="${options.preview?.id ?? ''}"
              data-resource-type="${options.preview?.type ?? ''}">
              ${materialIcon('open_in_new', 'message-notify-card__link-icon')}
              在全屏查看
            </button>
          </div>`
        : ''
    }`;

  document.getElementById('message-notify-open-full')?.addEventListener('click', () => {
    if (!options.preview) return;
    void openResourceFullscreen(options.preview);
  });
}

/**
 * @param {import('./content-api.js').ContentPreview} preview
 */
async function openResourceFullscreen(preview) {
  if (preview.type === 1) {
    const { openVideoDetail } = await import('./video-detail.js');
    await openVideoDetail(preview);
    return;
  }
  if (preview.type === 4 || preview.type === 3) {
    const { openFeedDetail } = await import('./feed-detail.js');
    await openFeedDetail(preview.id);
    return;
  }
  const { openArticleDetail } = await import('./article-detail.js');
  await openArticleDetail(preview);
}

/**
 * @param {NotifyItem} item
 */
async function renderNotifyDetail(item) {
  if (detailLoading) return;
  detailLoading = true;

  const system = activeNotifyType === 4;
  renderNotifyDetailShell(
    item,
    `<p class="message-page__empty">${materialIcon('progress_activity', 'message-page__spin')}加载中…</p>`,
  );

  try {
    if (system || !canOpenReference(item)) {
      renderNotifyDetailShell(item, '');
      return;
    }

    const resolved = await resolveNotifyResource(item);
    if (!resolved) {
      renderNotifyDetailShell(item, '<p class="message-page__empty">无法定位原内容</p>');
      return;
    }

    const loaded = await loadResourcePreview(resolved.resourceId, resolved.resourceType);
    if (!loaded) {
      renderNotifyDetailShell(item, '<p class="message-page__empty">资源不存在或已删除</p>');
      return;
    }

    if (loaded.kind === 'feed') {
      const cardHtml = renderFeedCard(loaded.detail.feed, {
        domIdPrefix: NOTIFY_DETAIL_DOM,
        profileFallback: null,
        spaceOwnerId: null,
        hideCardActions: true,
      });
      renderNotifyDetailShell(
        item,
        `<div class="message-notify-detail__feed">${cardHtml}</div>`,
        { preview: loaded.preview, resourceId: loaded.preview.id, resourceType: loaded.preview.type },
      );
      hydrateFeedCards([loaded.detail.feed], NOTIFY_DETAIL_DOM, { clampBody: false });
      return;
    }

    if (loaded.kind === 'video') {
      const { detail, preview } = loaded;
      const cover = mediaSrcForCover(preview.cover);
      renderNotifyDetailShell(
        item,
        `
        <div class="message-notify-detail__video-cover">
          ${cover ? `<img src="${escapeHtml(cover)}" alt="" />` : ''}
          <button type="button" class="message-notify-detail__play" id="message-notify-play-video">播放视频</button>
        </div>
        <h3 class="message-notify-detail__resource-title">${escapeHtml(preview.title)}</h3>
        <p class="message-notify-detail__meta">${escapeHtml(preview.author)} · ${preview.views} 播放</p>
        <div class="message-notify-detail__content markdown-body" id="message-notify-video-desc"></div>`,
        { preview, resourceId: preview.id, resourceType: preview.type },
      );
      const descEl = document.getElementById('message-notify-video-desc');
      if (descEl && detail.rawDescription) mountRichContent(descEl, detail.rawDescription);
      document.getElementById('message-notify-play-video')?.addEventListener('click', () => {
        void openResourceFullscreen(preview);
      });
      return;
    }

    const { detail, preview } = loaded;
    renderNotifyDetailShell(
      item,
      `
      <h3 class="message-notify-detail__resource-title">${escapeHtml(preview.title)}</h3>
      <p class="message-notify-detail__meta">${escapeHtml(preview.author)} · ${preview.views} 阅读</p>
      <div class="message-notify-detail__content markdown-body" id="message-notify-article-body"></div>`,
      { preview, resourceId: preview.id, resourceType: preview.type },
    );
    const bodyEl = document.getElementById('message-notify-article-body');
    if (bodyEl && detail.rawContent) mountRichContent(bodyEl, detail.rawContent);
  } catch (err) {
    renderNotifyDetailShell(
      item,
      `<p class="message-page__empty message-page__empty--error">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`,
    );
  } finally {
    detailLoading = false;
  }
}

/**
 * @param {NotifyItem} item
 */
function selectNotifyItem(item) {
  selectedNotifyKey = notifyItemKey(item);
  renderNotifyList();
  void renderNotifyDetail(item);
}

export async function onNotifyPageEnter() {
  if (getCurrentPage() !== 'message') return;

  try {
    const counts = await fetchNotifyCounts();
    renderNotifySummary(counts);
  } catch {
    if (latestCounts) renderNotifySummary(latestCounts);
  }

  syncNotifyTabsActive();
  if (!notifyLoaded[activeNotifyType]) {
    await loadNotifyPage(activeNotifyType, true);
  } else {
    renderNotifyList();
  }
}

export function bindNotifyPage() {
  if (bound) return;
  bound = true;

  document.querySelectorAll('[data-notify-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = Number.parseInt(btn.getAttribute('data-notify-type') ?? '', 10);
      if (type === 1 || type === 2 || type === 3 || type === 4) {
        selectNotifyType(type);
      }
    });
  });

  getNotifyScroll()?.addEventListener('scroll', onNotifyScroll, { passive: true });

  getNotifyList()?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const userBtn = target.closest('[data-notify-user]');
    if (userBtn instanceof HTMLElement) {
      event.stopPropagation();
      const uid = Number.parseInt(userBtn.getAttribute('data-notify-user') ?? '', 10);
      if (Number.isFinite(uid) && uid > 0) openUserSpace(uid);
      return;
    }

    const card = target.closest('.message-notify-card');
    if (!card) return;
    const key = card.getAttribute('data-notify-key');
    const item = (notifyItems[activeNotifyType] ?? []).find((entry) => notifyItemKey(entry) === key);
    if (item) selectNotifyItem(item);
  });
}
