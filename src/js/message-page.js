import { loadSession } from './auth.js';
import { mediaSrcForCover, userAvatarMediaSrc } from './content-api.js';
import { loadStickerUrlMap } from './emoji-pack.js';
import { materialIcon } from './icons.js';
import { isLoggedIn, requireLogin } from './login-ui.js';
import { getCurrentPage, setPage } from './pages.js';
import {
  fetchConversationList,
  fetchMessageRecords,
  fetchNotifyCounts,
  formatMessageTime,
  sendMessage,
  uploadCommentImage,
} from './message-api.js';
import { openImageViewer } from './image-viewer.js';
import { mountRichContent } from './rich-content.js';
import { fetchUserProfile } from './user-profile-api.js';
import { openUserSpace } from './user-space.js';
import { bindNotifyPage, onNotifyPageEnter, renderNotifySummary } from './notify-page.js';

/** @typedef {import('./message-api.js').MessageConversation} MessageConversation */
/** @typedef {import('./message-api.js').MessageRecord} MessageRecord */

const SCROLL_PREFETCH_MIN_PX = 200;

/** @type {'dm' | 'notify'} */
let activeTab = 'dm';

/** @type {MessageConversation[]} */
let conversations = [];
let convPage = 1;
let convHasMore = true;
let convLoading = false;

/** @type {{ userId: number, userName: string, userAvatar: string } | null} */
let activePeer = null;

/** @type {MessageRecord[]} */
let records = [];
let nextCursor = null;
let recordsHasMore = true;
let recordsLoading = false;
let recordsLoadingMore = false;
let sending = false;

/** @type {string[]} */
let composerImages = [];

/** @type {number | null} */
let pendingPeerId = null;
let pendingPeerName = '';
let pendingPeerAvatar = '';

let lastDmUnread = -1;
let pollTimer = null;
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

function getConvScroll() {
  return document.getElementById('message-conv-scroll');
}

function getThreadScroll() {
  return document.getElementById('message-thread-scroll');
}

function getThreadList() {
  return document.getElementById('message-thread-list');
}

/**
 * @param {number} total
 */
export function syncMessageBadge(total) {
  const badge = document.getElementById('sidebar-message-badge');
  if (!badge) return;
  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.hidden = false;
  } else {
    badge.textContent = '';
    badge.hidden = true;
  }
}

async function refreshUnreadCounts() {
  if (!isLoggedIn()) {
    syncMessageBadge(0);
    renderNotifySummary({ like: 0, comment: 0, mention: 0, system: 0, message: 0 });
    return;
  }
  try {
    const counts = await fetchNotifyCounts();
    const total = counts.message + counts.like + counts.comment + counts.mention + counts.system;
    syncMessageBadge(total);
    renderNotifySummary(counts);

    if (counts.message !== lastDmUnread) {
      lastDmUnread = counts.message;
      if (getCurrentPage() === 'message' && activeTab === 'dm') {
        void reloadConversations();
        if (activePeer) void reloadThread(false);
      }
    }
  } catch {
    /* ignore polling errors */
  }
}

function startUnreadPolling() {
  if (pollTimer != null) return;
  void refreshUnreadCounts();
  pollTimer = window.setInterval(() => {
    void refreshUnreadCounts();
  }, 30_000);
}

/**
 * @param {MessageConversation[]} items
 */
function renderConversationList(items) {
  const root = document.getElementById('message-conv-list');
  if (!root) return;

  if (!items.length) {
    root.innerHTML = `<p class="message-page__empty">还没有私信会话</p>`;
    return;
  }

  root.innerHTML = items
    .map((item) => {
      const active = activePeer?.userId === item.userId;
      const avatar = mediaSrcForCover(item.userAvatar);
      const preview = item.lastMessage || '暂无消息';
      const time = formatMessageTime(item.lastTime);
      const initial = escapeHtml(item.userName.slice(0, 1) || 'U');
      return `
        <button
          type="button"
          class="message-conv${active ? ' is-active' : ''}"
          data-message-conv="${item.userId}"
          data-message-name="${escapeHtml(item.userName)}"
          data-message-avatar="${escapeHtml(item.userAvatar)}"
        >
          <span class="message-conv__avatar">
            ${
              avatar
                ? `<img src="${escapeHtml(avatar)}" alt="" />`
                : `<span class="message-conv__avatar-ph">${initial}</span>`
            }
          </span>
          <span class="message-conv__body">
            <span class="message-conv__row">
              <span class="message-conv__name">${escapeHtml(item.userName)}</span>
              ${time ? `<span class="message-conv__time">${escapeHtml(time)}</span>` : ''}
            </span>
            <span class="message-conv__row">
              <span class="message-conv__preview">${escapeHtml(preview)}</span>
              ${item.unread > 0 ? `<span class="message-conv__badge">${item.unread > 99 ? '99+' : item.unread}</span>` : ''}
            </span>
          </span>
        </button>`;
    })
    .join('');
}

function setConvFooter(html, visible = true) {
  const el = document.getElementById('message-conv-footer');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = !visible;
}

async function reloadConversations() {
  convPage = 1;
  convHasMore = true;
  conversations = [];
  await loadConversations(true);
}

/**
 * @param {boolean} first
 */
async function loadConversations(first) {
  if (convLoading) return;
  convLoading = true;

  if (first) {
    setConvFooter(`${materialIcon('progress_activity', 'message-page__spin')}加载中…`, true);
  }

  try {
    const page = first ? 1 : convPage + 1;
    const next = await fetchConversationList(page);
    if (first) {
      conversations = next;
      convPage = 1;
      convHasMore = next.length > 0;
      renderConversationList(conversations);
      if (!next.length) {
        setConvFooter('', false);
      } else {
        setConvFooter('', false);
      }
    } else {
      const known = new Set(conversations.map((item) => item.userId));
      const additions = next.filter((item) => !known.has(item.userId));
      conversations = [...conversations, ...additions];
      convPage = page;
      convHasMore = next.length > 0 && additions.length > 0;
      renderConversationList(conversations);
      if (!convHasMore) {
        setConvFooter('没有更多会话了', true);
      } else {
        setConvFooter('', false);
      }
    }
  } catch (err) {
    if (first && conversations.length === 0) {
      const root = document.getElementById('message-conv-list');
      if (root) {
        root.innerHTML = `<p class="message-page__empty message-page__empty--error">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`;
      }
    }
    setConvFooter('', false);
  } finally {
    convLoading = false;
  }
}

function onConvScroll() {
  const el = getConvScroll();
  if (!el || convLoading || !convHasMore) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_PREFETCH_MIN_PX) {
    void loadConversations(false);
  }
}

function updateThreadHeader() {
  const title = document.getElementById('message-thread-title');
  const avatarEl = document.getElementById('message-thread-avatar');
  if (!title || !avatarEl) return;

  if (!activePeer) {
    title.textContent = '选择会话';
    avatarEl.innerHTML = materialIcon('forum', 'message-thread__avatar-icon');
    return;
  }

  title.textContent = activePeer.userName;
  const avatar = mediaSrcForCover(activePeer.userAvatar);
  if (avatar) {
    avatarEl.innerHTML = `<img src="${escapeHtml(avatar)}" alt="" />`;
  } else {
    avatarEl.innerHTML = `<span class="message-thread__avatar-ph">${escapeHtml(activePeer.userName.slice(0, 1) || 'U')}</span>`;
  }
}

function showThreadEmpty(message) {
  const list = getThreadList();
  if (!list) return;
  list.innerHTML = `<p class="message-page__empty">${escapeHtml(message)}</p>`;
}

/**
 * @param {MessageRecord} record
 * @param {number | null} myId
 */
function renderMessageBubble(record, myId) {
  const isMine = myId != null && record.uid === myId;
  const session = loadSession();
  const myAvatar = userAvatarMediaSrc(session?.user) ?? '';
  const peerAvatar = activePeer?.userAvatar ?? '';
  const avatarSrc = mediaSrcForCover(isMine ? myAvatar : peerAvatar);
  const initial = isMine ? '我' : activePeer?.userName?.slice(0, 1) || 'U';
  const time = formatMessageTime(record.time);

  const imagesHtml = record.images.length
    ? `<div class="message-bubble__images">${record.images
        .map(
          (src, index) =>
            `<button type="button" class="message-bubble__image-btn" data-message-image="${escapeHtml(src)}">
              <img class="message-bubble__image" src="${escapeHtml(src)}" alt="私信图片" loading="lazy" />
            </button>`,
        )
        .join('')}</div>`
    : '';

  const contentId = `message-content-${record.id || `${record.uid}-${record.time}`}`;
  const hasContent = record.raw || record.message;

  return `
    <article class="message-bubble${isMine ? ' message-bubble--mine' : ''}" data-message-id="${escapeHtml(record.id)}">
      <button type="button" class="message-bubble__avatar" data-message-user="${record.uid}" aria-label="查看用户">
        ${
          avatarSrc
            ? `<img src="${escapeHtml(avatarSrc)}" alt="" />`
            : `<span class="message-bubble__avatar-ph">${escapeHtml(initial)}</span>`
        }
      </button>
      <div class="message-bubble__main">
        <div class="message-bubble__card">
          ${
            hasContent
              ? `<div class="message-bubble__text markdown-body" id="${contentId}"></div>`
              : record.images.length
                ? ''
                : '<p class="message-bubble__text">（空消息）</p>'
          }
          ${imagesHtml}
        </div>
        ${time ? `<time class="message-bubble__time">${escapeHtml(time)}</time>` : ''}
      </div>
    </article>`;
}

function hydrateMessageContent(recordsToHydrate) {
  for (const record of recordsToHydrate) {
    if (!record.raw && !record.message) continue;
    const id = `message-content-${record.id || `${record.uid}-${record.time}`}`;
    const el = document.getElementById(id);
    if (el) mountRichContent(el, record.raw || record.message);
  }
}

function setThreadFooter(html, visible = true) {
  if (!visible || !html) return;
  const list = getThreadList();
  if (!list) return;
  list.innerHTML = `<p class="message-page__thread-footer">${html}</p>`;
}

function renderThread() {
  const list = getThreadList();
  if (!list) return;

  const session = loadSession();
  const myId = sessionUserId(session?.user);

  if (!activePeer) {
    showThreadEmpty('选择左侧会话开始聊天');
    setThreadFooter('', false);
    return;
  }

  if (!records.length && !recordsLoading) {
    showThreadEmpty('和 TA 说点什么吧');
    setThreadFooter('', false);
    return;
  }

  let footerHtml = '';
  if (recordsLoadingMore) {
    footerHtml = `<p class="message-page__thread-footer">${materialIcon('progress_activity', 'message-page__spin')}</p>`;
  } else if (!recordsHasMore && records.length > 0) {
    footerHtml = '<p class="message-page__thread-footer">没有更早的消息了</p>';
  }

  list.innerHTML = `${footerHtml}${records.map((record) => renderMessageBubble(record, myId)).join('')}`;
  hydrateMessageContent(records);
  setThreadFooter('', false);
}

function scrollThreadToBottom() {
  const el = getThreadScroll();
  if (!el) return;
  window.requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

async function reloadThread(scrollBottom = true) {
  if (!activePeer) return;
  recordsLoading = true;
  setThreadFooter(`${materialIcon('progress_activity', 'message-page__spin')}加载中…`, true);

  try {
    const page = await fetchMessageRecords(activePeer.userId);
    records = page.items;
    nextCursor = page.nextCursor;
    recordsHasMore = page.hasMore;
    renderThread();
    if (scrollBottom) scrollThreadToBottom();
    void refreshUnreadCounts();
  } catch (err) {
    showThreadEmpty(err instanceof Error ? err.message : '加载聊天记录失败');
    setThreadFooter('', false);
  } finally {
    recordsLoading = false;
  }
}

async function loadOlderMessages() {
  if (!activePeer || recordsLoadingMore || !recordsHasMore) return;
  const cursor = nextCursor;
  if (!cursor) {
    recordsHasMore = false;
    renderThread();
    return;
  }

  recordsLoadingMore = true;
  renderThread();

  const scrollEl = getThreadScroll();
  const prevHeight = scrollEl?.scrollHeight ?? 0;

  try {
    const page = await fetchMessageRecords(activePeer.userId, cursor);
    const known = new Set(records.map((item) => item.id));
    const older = page.items.filter((item) => !item.id || known.add(item.id));
    records = [...older, ...records];
    nextCursor = page.nextCursor;
    recordsHasMore =
      page.hasMore && older.length > 0 && page.nextCursor != null && page.nextCursor !== cursor;
    renderThread();

    if (scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight + scrollEl.scrollTop;
    }
  } catch {
    /* ignore */
  } finally {
    recordsLoadingMore = false;
    renderThread();
  }
}

function onThreadScroll() {
  const el = getThreadScroll();
  if (!el || recordsLoadingMore || !recordsHasMore) return;
  if (el.scrollTop <= SCROLL_PREFETCH_MIN_PX) {
    void loadOlderMessages();
  }
}

/**
 * @param {number} userId
 * @param {string} [userName]
 * @param {string} [userAvatar]
 */
async function selectConversation(userId, userName = '', userAvatar = '') {
  activePeer = {
    userId,
    userName: userName || `用户 ${userId}`,
    userAvatar,
  };
  updateThreadHeader();
  renderConversationList(conversations);
  records = [];
  nextCursor = null;
  recordsHasMore = true;
  await reloadThread(true);

  if (!userAvatar) {
    try {
      const profile = await fetchUserProfile(userId);
      if (activePeer?.userId === userId) {
        activePeer.userAvatar = profile.avatar ?? '';
        activePeer.userName = profile.name || activePeer.userName;
        updateThreadHeader();
        renderConversationList(conversations);
      }
    } catch {
      /* optional */
    }
  }
}

function renderComposerImages() {
  const root = document.getElementById('message-composer-images');
  if (!root) return;

  const previews = composerImages
    .map(
      (path, index) => `
      <div class="message-composer__image-item">
        <img class="message-composer__image-thumb" src="" alt="" data-image-path="${escapeHtml(path)}" data-image-index="${index}" />
        <button type="button" class="message-composer__image-remove" data-image-remove="${index}" aria-label="移除图片">×</button>
      </div>`,
    )
    .join('');

  root.innerHTML = previews;
  root.querySelectorAll('.message-composer__image-thumb').forEach((img) => {
    const el = /** @type {HTMLImageElement} */ (img);
    const path = el.getAttribute('data-image-path');
    if (!path) return;
    const src = mediaSrcForCover(path);
    if (src) el.src = src;
  });
}

function clearComposer() {
  composerImages = [];
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('message-composer-input'));
  const fileInput = /** @type {HTMLInputElement | null} */ (document.getElementById('message-composer-file'));
  if (input) input.value = '';
  if (fileInput) fileInput.value = '';
  renderComposerImages();
  hideStickerPanel();
}

function hideStickerPanel() {
  document.getElementById('message-sticker-panel')?.setAttribute('hidden', '');
}

async function showStickerPanel() {
  const panel = document.getElementById('message-sticker-panel');
  if (!panel) return;

  panel.removeAttribute('hidden');
  if (panel.childElementCount > 0) return;

  panel.innerHTML = `${materialIcon('progress_activity', 'message-page__spin')}`;
  try {
    const map = await loadStickerUrlMap();
    const items = [...map.entries()].slice(0, 120);
    panel.innerHTML = items
      .map(
        ([key, url]) =>
          `<button type="button" class="message-sticker" data-sticker-key="${escapeHtml(key)}" title="${escapeHtml(key)}">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(key)}" loading="lazy" />
          </button>`,
      )
      .join('');
  } catch {
    panel.innerHTML = '<p class="message-page__empty">表情加载失败</p>';
  }
}

/**
 * @param {HTMLTextAreaElement} input
 * @param {string} insert
 */
function insertAtCursor(input, insert) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = `${input.value.slice(0, start)}${insert}${input.value.slice(end)}`;
  const cursor = start + insert.length;
  input.setSelectionRange(cursor, cursor);
  input.focus();
}

/**
 * @param {FileList | File[]} files
 */
async function handleComposerImages(files) {
  const list = [...files].filter((file) => file.type.startsWith('image/'));
  if (!list.length || composerImages.length >= 9) return;

  const submitBtn = document.getElementById('message-composer-send');
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;

  try {
    const remaining = 9 - composerImages.length;
    for (const file of list.slice(0, remaining)) {
      const path = await uploadCommentImage(file);
      composerImages.push(path);
    }
    renderComposerImages();
  } catch (err) {
    alert(err instanceof Error ? err.message : '图片上传失败');
  } finally {
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    const fileInput = /** @type {HTMLInputElement | null} */ (document.getElementById('message-composer-file'));
    if (fileInput) fileInput.value = '';
  }
}

async function submitMessage() {
  if (!activePeer || sending) return;
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('message-composer-input'));
  if (!input) return;

  const text = input.value.trim();
  if (!text && composerImages.length === 0) return;

  sending = true;
  const submitBtn = document.getElementById('message-composer-send');
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;

  try {
    await sendMessage(activePeer.userId, text, composerImages);
    clearComposer();
    await reloadThread(true);
    void reloadConversations();
  } catch (err) {
    alert(err instanceof Error ? err.message : '发送失败');
  } finally {
    sending = false;
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
  }
}

function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll('[data-message-tab]').forEach((btn) => {
    const isActive = btn.getAttribute('data-message-tab') === tab;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('[data-message-panel]').forEach((panel) => {
    panel.hidden = panel.getAttribute('data-message-panel') !== tab;
  });
  if (tab === 'notify') onNotifyPageEnter();
}

async function onMessagePageEnterInternal() {
  if (getCurrentPage() !== 'message') return;
  if (!isLoggedIn()) return;

  startUnreadPolling();

  if (pendingPeerId != null) {
    setActiveTab('dm');
    const userId = pendingPeerId;
    const userName = pendingPeerName;
    const userAvatar = pendingPeerAvatar;
    pendingPeerId = null;
    pendingPeerName = '';
    pendingPeerAvatar = '';
    await selectConversation(userId, userName, userAvatar);
    return;
  }

  if (activeTab === 'dm') {
    await reloadConversations();
  } else {
    onNotifyPageEnter();
  }
}

export function onMessagePageEnter() {
  void onMessagePageEnterInternal();
}

export function openMessagePage() {
  if (!requireLogin()) return;
  setPage('message');
}

/**
 * @param {number} userId
 * @param {{ name?: string, avatar?: string }} [options]
 */
export function openMessageThread(userId, options = {}) {
  if (!requireLogin()) return;
  pendingPeerId = userId;
  pendingPeerName = options.name ?? '';
  pendingPeerAvatar = options.avatar ?? '';
  setPage('message');
}

export function bindMessagePage() {
  if (bound) return;
  bound = true;

  document.querySelectorAll('[data-message-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-message-tab');
      if (tab === 'dm' || tab === 'notify') setActiveTab(tab);
    });
  });

  getConvScroll()?.addEventListener('scroll', onConvScroll, { passive: true });
  getThreadScroll()?.addEventListener('scroll', onThreadScroll, { passive: true });

  document.getElementById('message-conv-list')?.addEventListener('click', (event) => {
    const btn = /** @type {HTMLElement} */ (event.target).closest('[data-message-conv]');
    if (!btn) return;
    const userId = Number.parseInt(btn.getAttribute('data-message-conv') ?? '', 10);
    if (!Number.isFinite(userId)) return;
    void selectConversation(
      userId,
      btn.getAttribute('data-message-name') ?? '',
      btn.getAttribute('data-message-avatar') ?? '',
    );
  });

  getThreadList()?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const userBtn = target.closest('[data-message-user]');
    if (userBtn instanceof HTMLElement) {
      const uid = Number.parseInt(userBtn.getAttribute('data-message-user') ?? '', 10);
      if (Number.isFinite(uid) && uid > 0) openUserSpace(uid);
      return;
    }
    const imageBtn = target.closest('[data-message-image]');
    if (imageBtn instanceof HTMLElement) {
      const img = imageBtn.querySelector('img');
      if (img instanceof HTMLImageElement) openImageViewer(img);
    }
  });

  document.getElementById('message-composer-send')?.addEventListener('click', () => {
    void submitMessage();
  });

  document.getElementById('message-composer-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  });

  document.getElementById('message-composer-sticker')?.addEventListener('click', () => {
    const panel = document.getElementById('message-sticker-panel');
    if (panel?.hasAttribute('hidden')) void showStickerPanel();
    else hideStickerPanel();
  });

  document.getElementById('message-composer-image')?.addEventListener('click', () => {
    document.getElementById('message-composer-file')?.click();
  });

  document.getElementById('message-composer-file')?.addEventListener('change', (event) => {
    const files = /** @type {HTMLInputElement} */ (event.target).files;
    if (files?.length) void handleComposerImages(files);
  });

  document.getElementById('message-composer-images')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const removeBtn = target.closest('[data-image-remove]');
    if (!(removeBtn instanceof HTMLElement)) return;
    const index = Number.parseInt(removeBtn.getAttribute('data-image-remove') ?? '', 10);
    if (!Number.isFinite(index)) return;
    composerImages.splice(index, 1);
    renderComposerImages();
  });

  document.getElementById('message-sticker-panel')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const btn = target.closest('[data-sticker-key]');
    if (!(btn instanceof HTMLElement)) return;
    const key = btn.getAttribute('data-sticker-key');
    const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('message-composer-input'));
    if (!key || !input) return;
    insertAtCursor(input, `[${key}]`);
    hideStickerPanel();
  });

  bindNotifyPage();
  startUnreadPolling();
}
