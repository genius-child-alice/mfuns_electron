import { materialIcon } from './icons.js';
import { loadSession } from './auth.js';
import { renderFramedAvatarHtml } from './avatar-frame-ui.js';
import { getCurrentPage } from './pages.js';
import {
  getScrollTop,
  navigateBack,
  navigateTo,
  registerPageNavigation,
  restoreScrollTop,
} from './navigation.js';
import { fetchAllRelationList } from './user-profile-api.js';
import { notify } from './notice-ui.js';
import { requireLogin } from './login-ui.js';
import { fetchFollowStatus, setFollow } from './video-api.js';
import { openUserSpace } from './user-space.js';

/** @typedef {import('./user-profile-api.js').UserProfile} UserProfile */
/** @typedef {import('./pages.js').PageId} PageId */

/** @typedef {'follow' | 'fans'} FollowListMode */

/** @typedef {UserProfile & { viewerFollows: boolean, mutual: boolean }} RelationUser */


/** @type {number} */
let ownerUserId = 0;

/** @type {FollowListMode} */
let listMode = 'follow';

/** @type {string} */
let ownerDisplayName = '';

/** @type {RelationUser[]} */
let users = [];

let loading = false;

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
 * @param {UserProfile[]} list
 * @param {number | null} viewerId
 */
async function enrichRelationFlags(list, viewerId) {
  if (viewerId == null || !loadSession()?.token) {
    return list.map((user) => ({ ...user, viewerFollows: false, mutual: false }));
  }

  const chunkSize = 6;
  /** @type {RelationUser[]} */
  const result = [];

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    const flags = await Promise.all(
      chunk.map(async (user) => {
        if (user.id === viewerId) {
          return { viewerFollows: false, mutual: false };
        }
        try {
          const viewerFollows = await fetchFollowStatus(user.id);
          const mutual =
            listMode === 'fans' && viewerId === ownerUserId && viewerFollows;
          return { viewerFollows, mutual };
        } catch {
          return { viewerFollows: false, mutual: false };
        }
      }),
    );
    chunk.forEach((user, index) => {
      result.push({ ...user, ...flags[index] });
    });
  }

  return result;
}

/**
 * @param {RelationUser} user
 */
function relationActionHtml(user) {
  const session = loadSession();
  if (!session?.token) return '';

  const viewerId = sessionUserId(session?.user);
  if (viewerId == null || user.id === viewerId) return '';

  const followed = user.viewerFollows;
  const isOwnFans = listMode === 'fans' && viewerId === ownerUserId;
  const label = followed ? (isOwnFans ? '已互粉' : '已关注') : '+ 关注';
  const icon =
    followed && isOwnFans
      ? materialIcon('done_all', 'follow-list__chip-icon')
      : '';

  return `<button
    type="button"
    class="follow-list__chip follow-list__action ${followed ? 'follow-list__action--followed' : ''} ${followed && isOwnFans ? 'follow-list__chip--mutual' : ''}"
    data-relation-follow="${user.id}"
    data-relation-followed="${followed ? '1' : '0'}"
    aria-pressed="${followed ? 'true' : 'false'}"
  >${icon}${escapeHtml(label)}</button>`;
}

function renderList() {
  const titleEl = document.getElementById('follow-list-title');
  const grid = document.getElementById('follow-list-grid');
  if (!grid) return;

  const modeLabel = listMode === 'fans' ? '粉丝' : '关注';
  if (titleEl) {
    titleEl.textContent = ownerDisplayName ? `${ownerDisplayName} 的${modeLabel}` : modeLabel;
  }

  const list = users;
  if (!list.length) {
    grid.innerHTML = `<p class="follow-list__empty">${listMode === 'fans' ? '还没有粉丝' : '还没有关注任何人'}</p>`;
    return;
  }

  grid.innerHTML = list
    .map((user) => {
      const bio = user.bio === '暂无简介' ? '这个人很神秘，什么也没写。' : user.bio;
      const relation = relationActionHtml(user);
      return `
        <article class="follow-list__card">
          <button type="button" class="follow-list__card-main" data-open-user="${user.id}">
            ${renderFramedAvatarHtml({
              avatar: user.avatar,
              frame: user.avatarFrame,
              size: 'list',
              imgClass: 'follow-list__avatar',
              phClass: 'follow-list__avatar--ph',
            })}
            <div class="follow-list__card-text">
              <h3 class="follow-list__name">${escapeHtml(user.name)}</h3>
              <p class="follow-list__bio">${escapeHtml(bio)}</p>
            </div>
          </button>
          ${relation ? `<div class="follow-list__card-foot">${relation}</div>` : ''}
        </article>`;
    })
    .join('');
}

function setLoadingState(on) {
  const root = document.getElementById('follow-list-root');
  root?.classList.toggle('follow-list--loading', on);
  const hint = document.getElementById('follow-list-loading');
  if (hint) hint.hidden = !on;
}

async function loadList() {
  loading = true;
  setLoadingState(true);
  users = [];
  renderList();
  try {
    const list = await fetchAllRelationList(ownerUserId, listMode);
    const session = loadSession();
    const viewerId = sessionUserId(session?.user);
    users = await enrichRelationFlags(list, viewerId);
    renderList();
  } catch (err) {
    const grid = document.getElementById('follow-list-grid');
    if (grid) {
      grid.innerHTML = `<p class="follow-list__empty">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`;
    }
  } finally {
    loading = false;
    setLoadingState(false);
  }
}

export function captureFollowListState() {
  return {
    ownerUserId,
    listMode,
    ownerDisplayName,
    users,
    gridHtml: document.getElementById('follow-list-grid')?.innerHTML ?? '',
    scrollTop: getScrollTop('main-content'),
  };
}

/**
 * @param {ReturnType<typeof captureFollowListState>} state
 */
export function restoreFollowListState(state) {
  ownerUserId = state.ownerUserId ?? 0;
  listMode = state.listMode ?? 'follow';
  ownerDisplayName = state.ownerDisplayName ?? '';
  users = state.users ?? [];
  loading = false;
  renderList();
  const grid = document.getElementById('follow-list-grid');
  if (grid) grid.innerHTML = state.gridHtml ?? '';
  restoreScrollTop('main-content', state.scrollTop ?? 0);
}

/**
 * @param {number} userId
 * @param {FollowListMode} mode
 * @param {{ ownerName?: string }} [options]
 */
export function openFollowList(userId, mode, options = {}) {
  if (!Number.isFinite(userId) || userId <= 0) return;
  void navigateTo('follow-list', {
    userId: Math.trunc(userId),
    mode,
    ownerName: options.ownerName?.trim() ?? '',
  });
}

export function closeFollowList() {
  void navigateBack();
}

async function handleRelationFollow(btn) {
  if (!requireLogin()) return;
  const userId = Number.parseInt(btn.getAttribute('data-relation-follow') ?? '', 10);
  if (!Number.isFinite(userId) || userId <= 0) return;
  const followed = btn.getAttribute('data-relation-followed') === '1';
  const next = !followed;
  btn.disabled = true;
  try {
    await setFollow(userId, next);
    const item = users.find((u) => u.id === userId);
    if (item) {
      const viewerId = sessionUserId(loadSession()?.user);
      item.viewerFollows = next;
      item.mutual = listMode === 'fans' && viewerId === ownerUserId && next;
    }
    renderList();
  } catch (err) {
    btn.disabled = false;
    notify(err instanceof Error ? err.message : '操作失败', 'error');
  }
}

function onListClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);

  const followBtn = target.closest('[data-relation-follow]');
  if (followBtn instanceof HTMLButtonElement) {
    event.preventDefault();
    event.stopPropagation();
    void handleRelationFollow(followBtn);
    return;
  }

  const openBtn = target.closest('[data-open-user]');
  if (openBtn instanceof HTMLElement) {
    const uid = Number.parseInt(openBtn.getAttribute('data-open-user') ?? '', 10);
    if (Number.isFinite(uid) && uid > 0) {
      openUserSpace(uid);
    }
  }
}

function onFollowChanged(event) {
  const detail = /** @type {CustomEvent<{ userId?: number, following?: boolean }>} */ (
    event
  ).detail;
  const userId = Number(detail?.userId);
  if (!Number.isFinite(userId)) return;
  const item = users.find((u) => u.id === userId);
  if (!item) return;
  const next = Boolean(detail.following);
  const viewerId = sessionUserId(loadSession()?.user);
  item.viewerFollows = next;
  item.mutual = listMode === 'fans' && viewerId === ownerUserId && next;
  if (getCurrentPage() === 'follow-list') renderList();
}

let followListBound = false;

export function bindFollowList() {
  if (followListBound) return;
  followListBound = true;

  document.getElementById('follow-list-back')?.addEventListener('click', closeFollowList);

  document.getElementById('follow-list-grid')?.addEventListener('click', onListClick);
  window.addEventListener('mfuns:follow-changed', onFollowChanged);

  registerPageNavigation('follow-list', {
    capture: () => captureFollowListState(),
    restore: (state) => {
      restoreFollowListState(/** @type {ReturnType<typeof captureFollowListState>} */ (state));
    },
    enter: async (params) => {
      ownerUserId = Math.trunc(Number(params.userId));
      listMode = params.mode === 'fans' ? 'fans' : 'follow';
      ownerDisplayName = `${params.ownerName ?? ''}`.trim();
      await loadList();
    },
  });
}
