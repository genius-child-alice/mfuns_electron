import { loadSession } from './auth.js';
import { mediaSrcForCover } from './content-api.js';
import { searchUsers } from './search-api.js';
import { fetchFollowListPage } from './user-profile-api.js';
import { registerQuillMention } from './quill-mention.js';

const MENTION_SEARCH_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 200;

/** @param {Record<string, unknown> | null | undefined} user */
function sessionUserId(user) {
  if (!user) return null;
  const id = user.id ?? user.user_id;
  if (typeof id === 'number' && Number.isFinite(id)) return Math.trunc(id);
  const parsed = Number.parseInt(`${id ?? ''}`, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** @typedef {{ id: number, name: string, avatar: string | null }} MentionUser */

/**
 * @param {number | null | undefined} userId
 * @param {string} name
 */
export function formatMentionToken(userId, name) {
  const id = `${userId ?? ''}`.trim();
  const label = `${name ?? ''}`.trim().replace(/\]/g, '');
  if (!id || !label) return label ? `@${label}` : '';
  return `[@${id}:${label}]`;
}

/**
 * @param {string} query
 * @returns {Promise<MentionUser[]>}
 */
async function fetchMentionCandidates(query) {
  const keyword = `${query ?? ''}`.trim();
  if (keyword) {
    const page = await searchUsers(keyword, 1, MENTION_SEARCH_SIZE);
    return page.items.map((user) => ({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
    }));
  }
  const selfId = sessionUserId(loadSession()?.user);
  if (!selfId) return [];
  const following = await fetchFollowListPage(selfId, 'follow', -1);
  return following.slice(0, MENTION_SEARCH_SIZE).map((user) => ({
    id: user.id,
    name: user.name,
    avatar: user.avatar,
  }));
}

/**
 * @param {string} text
 * @param {number} cursor
 */
export function getTextareaMentionState(text, cursor) {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0) {
    const prev = before[at - 1];
    if (prev !== ' ' && prev !== '\n' && prev !== '\r' && prev !== '\t') return null;
  }
  const query = before.slice(at + 1);
  if (/[\s\n\r\[\]]/.test(query)) return null;
  return { start: at, end: cursor, query };
}

/**
 * @param {import('../vendor/quill.mjs').default} quill
 */
export function getQuillMentionState(quill) {
  const sel = quill.getSelection();
  if (!sel) return null;
  const index = sel.index;
  const before = quill.getText(0, index);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0) {
    const prev = before[at - 1];
    if (prev !== ' ' && prev !== '\n' && prev !== '\r' && prev !== '\t') return null;
  }
  const query = before.slice(at + 1);
  if (/[\s\n\r\[\]]/.test(query)) return null;
  return { start: at, end: index, query };
}

/** @type {Set<MentionAutocompleteController>} */
const mentionControllers = new Set();
let mentionDismissBound = false;

function bindMentionDismiss() {
  if (mentionDismissBound) return;
  mentionDismissBound = true;
  document.addEventListener('mousedown', (event) => {
    const target = /** @type {Node} */ (event.target);
    for (const ctrl of mentionControllers) {
      if (!ctrl.isOpen()) continue;
      if (ctrl.panel.contains(target) || ctrl.anchor.contains(target)) continue;
      ctrl.close();
    }
  });
}

class MentionAutocompleteController {
  /**
   * @param {HTMLElement} anchor
   * @param {{
   *   getState: () => { start: number, end: number, query: string } | null,
   *   applyUser: (user: MentionUser, state: { start: number, end: number, query: string }) => void,
   *   onSync?: () => void,
   *   getPositionEl?: () => HTMLElement | null,
   * }} hooks
   */
  constructor(anchor, hooks) {
    this.anchor = anchor;
    this.hooks = hooks;
    this.panel = document.createElement('div');
    this.panel.className = 'mention-autocomplete mention-autocomplete--floating';
    this.panel.setAttribute('role', 'listbox');
    this.panel.hidden = true;
    document.body.appendChild(this.panel);
    mentionControllers.add(this);
    bindMentionDismiss();

    /** @type {MentionUser[]} */
    this.users = [];
    this.activeIndex = 0;
    this.searchTimer = 0;
    this.requestId = 0;

    this.panel.addEventListener('mousedown', (event) => {
      const item = /** @type {HTMLElement} */ (event.target).closest('[data-mention-user-id]');
      if (!item) return;
      event.preventDefault();
      const id = Number.parseInt(item.getAttribute('data-mention-user-id') ?? '', 10);
      const user = this.users.find((entry) => entry.id === id);
      if (user) this.selectUser(user);
    });
  }

  syncPanelPosition() {
    const el = this.hooks.getPositionEl?.() ?? this.anchor;
    const rect = el.getBoundingClientRect();
    this.panel.style.left = `${Math.max(8, rect.left)}px`;
    this.panel.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
    this.panel.style.top = `${rect.bottom + 4}px`;
  }

  isOpen() {
    return !this.panel.hidden;
  }

  close() {
    this.panel.hidden = true;
    this.users = [];
    this.activeIndex = 0;
    this.panel.innerHTML = '';
  }

  /**
   * @param {MentionUser[]} users
   */
  render(users) {
    this.users = users;
    this.activeIndex = 0;
    this.syncPanelPosition();
    if (!users.length) {
      this.panel.innerHTML = '<p class="mention-autocomplete__empty">未找到相关用户</p>';
      this.panel.hidden = false;
      return;
    }
    this.panel.innerHTML = users
      .map((user, index) => {
        const avatarSrc = user.avatar ? mediaSrcForCover(user.avatar) : '';
        const avatar = avatarSrc
          ? `<img class="mention-autocomplete__avatar" src="${avatarSrc.replace(/"/g, '&quot;')}" alt="" loading="lazy" />`
          : `<span class="mention-autocomplete__avatar mention-autocomplete__avatar--ph" aria-hidden="true">${(user.name || 'U').slice(0, 1)}</span>`;
        return `<button type="button" class="mention-autocomplete__item${index === 0 ? ' is-active' : ''}" role="option" data-mention-user-id="${user.id}">
          ${avatar}
          <span class="mention-autocomplete__name">${escapeHtml(user.name)}</span>
        </button>`;
      })
      .join('');
    this.panel.hidden = false;
  }

  setActiveIndex(next) {
    if (!this.users.length) return;
    this.activeIndex = (next + this.users.length) % this.users.length;
    this.panel.querySelectorAll('.mention-autocomplete__item').forEach((el, index) => {
      el.classList.toggle('is-active', index === this.activeIndex);
    });
    const active = this.panel.querySelector('.mention-autocomplete__item.is-active');
    active?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * @param {MentionUser} user
   */
  selectUser(user) {
    const state = this.hooks.getState();
    if (!state) {
      this.close();
      return;
    }
    this.hooks.applyUser(user, state);
    this.hooks.onSync?.();
    this.close();
  }

  scheduleSearch() {
    const state = this.hooks.getState();
    if (!state) {
      this.close();
      return;
    }
    window.clearTimeout(this.searchTimer);
    const requestId = ++this.requestId;
    this.searchTimer = window.setTimeout(async () => {
      try {
        const users = await fetchMentionCandidates(state.query);
        if (requestId !== this.requestId) return;
        if (!this.hooks.getState()) {
          this.close();
          return;
        }
        this.render(users);
      } catch {
        if (requestId === this.requestId) this.render([]);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  /**
   * @param {KeyboardEvent} event
   */
  handleKeydown(event) {
    if (!this.isOpen()) return false;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.setActiveIndex(this.activeIndex + 1);
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.setActiveIndex(this.activeIndex - 1);
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const user = this.users[this.activeIndex];
      if (user) {
        event.preventDefault();
        this.selectUser(user);
        return true;
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return true;
    }
    return false;
  }

  onInput() {
    const state = this.hooks.getState();
    if (!state) {
      this.close();
      return;
    }
    this.scheduleSearch();
  }
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {{ onSync?: () => void }} [options]
 */
export function bindTextareaMentionAutocomplete(textarea, options = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'mention-autocomplete-anchor';
  textarea.parentNode?.insertBefore(wrap, textarea);
  wrap.appendChild(textarea);

  const controller = new MentionAutocompleteController(wrap, {
    getState: () => getTextareaMentionState(textarea.value, textarea.selectionStart ?? 0),
    getPositionEl: () => textarea,
    applyUser: (user, state) => {
      const token = formatMentionToken(user.id, user.name);
      const before = textarea.value.slice(0, state.start);
      const after = textarea.value.slice(state.end);
      textarea.value = `${before}${token} ${after}`;
      const cursor = before.length + token.length + 1;
      textarea.setSelectionRange(cursor, cursor);
    },
    onSync: options.onSync,
  });

  textarea.addEventListener('input', () => controller.onInput());
  textarea.addEventListener('keydown', (event) => {
    controller.handleKeydown(event);
  });
  textarea.addEventListener('blur', () => {
    window.setTimeout(() => controller.close(), 120);
  });

  return controller;
}

/**
 * @param {import('../vendor/quill.mjs').default} quill
 * @param {HTMLElement} anchor
 */
export function bindQuillMentionAutocomplete(quill, anchor) {
  registerQuillMention(quill.constructor);

  const controller = new MentionAutocompleteController(anchor, {
    getState: () => getQuillMentionState(quill),
    getPositionEl: () => quill.root,
    applyUser: (user, state) => {
      const deleteLen = state.end - state.start;
      quill.deleteText(state.start, deleteLen, 'user');
      quill.insertEmbed(
        state.start,
        'mention',
        { id: `${user.id}`, value: user.name },
        'user',
      );
      quill.insertText(state.start + 1, ' ', 'user');
      quill.setSelection(state.start + 2, 0, 'user');
    },
  });

  quill.on('text-change', (_delta, _old, source) => {
    if (source === 'user') controller.onInput();
  });
  quill.root.addEventListener('keydown', (event) => {
    controller.handleKeydown(/** @type {KeyboardEvent} */ (event));
  });
  quill.root.addEventListener('blur', () => {
    window.setTimeout(() => controller.close(), 120);
  });

  return controller;
}

/**
 * @param {HTMLTextAreaElement} input
 * @param {number | null | undefined} userId
 * @param {string} name
 */
export function insertMentionTokenAtCursor(input, userId, name) {
  const token = formatMentionToken(userId, name);
  if (!token) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = `${before}${token}${after}`;
  const cursor = start + token.length;
  input.setSelectionRange(cursor, cursor);
}
