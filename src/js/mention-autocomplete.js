import { loadSession } from './auth.js';
import { mediaSrcForCover } from './content-api.js';
import { searchUsersForMention } from './search-api.js';
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
function mapMentionUsers(users) {
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    avatar: user.avatar,
  }));
}

async function fetchMentionCandidates(query) {
  const keyword = `${query ?? ''}`.trim();
  const page = await searchUsersForMention(keyword, 1, MENTION_SEARCH_SIZE);
  if (page.items.length) return mapMentionUsers(page.items);
  if (!keyword) {
    const selfId = sessionUserId(loadSession()?.user);
    if (!selfId) return [];
    const following = await fetchFollowListPage(selfId, 'follow', -1);
    return mapMentionUsers(following.slice(0, MENTION_SEARCH_SIZE));
  }
  return [];
}

/**
 * @param {string} before
 * @param {number} at
 */
function isMentionTriggerAt(before, at) {
  if (at < 0) return false;
  if (at > 0) {
    const prev = before[at - 1];
    if (prev === '[') return false;
    if (/[A-Za-z0-9._-]/.test(prev)) return false;
  }
  return true;
}

/**
 * @param {string} before
 * @param {number} at
 */
function mentionQueryFromBefore(before, at) {
  const query = before.slice(at + 1);
  if (/[\s\n\r\[\]]/.test(query)) return null;
  return query;
}

/**
 * @param {string} text
 * @param {number} cursor
 */
export function getTextareaMentionState(text, cursor) {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (!isMentionTriggerAt(before, at)) return null;
  const query = mentionQueryFromBefore(before, at);
  if (query === null) return null;
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
  if (!isMentionTriggerAt(before, at)) return null;
  const query = mentionQueryFromBefore(before, at);
  if (query === null) return null;
  return { start: at, end: index, query };
}

/** @type {Set<MentionAutocompleteController>} */
const mentionControllers = new Set();
let mentionDismissBound = false;

/**
 * showModal 的 dialog 在浏览器 top layer，挂在 body 上的浮层会被挡在下面。
 * @param {HTMLElement} anchor
 */
function mentionPanelHost(anchor) {
  const dialog = anchor.closest('dialog');
  return dialog ?? document.body;
}

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
    this.panelHost = mentionPanelHost(anchor);
    this.panelHost.appendChild(this.panel);
    if (this.panelHost instanceof HTMLDialogElement) {
      this.panel.classList.add('mention-autocomplete--in-dialog');
    }
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

  showPending() {
    this.syncPanelPosition();
    this.panel.hidden = false;
    this.panel.innerHTML = '<p class="mention-autocomplete__empty">加载中…</p>';
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
        const latest = this.hooks.getState();
        if (!latest) {
          if (requestId === this.requestId) this.close();
          return;
        }
        const users = await fetchMentionCandidates(latest.query);
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
    this.showPending();
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

  const syncMention = () => controller.onInput();
  textarea.addEventListener('input', syncMention);
  textarea.addEventListener('keyup', syncMention);
  textarea.addEventListener('click', syncMention);
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
  const visual = getVisualMentionInput(input);
  if (visual) {
    visual.insertMention(userId, name);
    return;
  }
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

/** @type {WeakMap<HTMLTextAreaElement, VisualMentionInput>} */
const visualMentionInputs = new WeakMap();

/**
 * @param {HTMLTextAreaElement} textarea
 */
export function getVisualMentionInput(textarea) {
  return visualMentionInputs.get(textarea) ?? null;
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {string} text
 */
export function insertComposerText(textarea, text) {
  const visual = getVisualMentionInput(textarea);
  if (visual) {
    visual.insertText(text);
    return;
  }
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = `${before}${text}${after}`;
  const cursor = start + text.length;
  textarea.setSelectionRange(cursor, cursor);
  textarea.focus();
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {string} wrap
 */
export function wrapComposerSelection(textarea, wrap) {
  const visual = getVisualMentionInput(textarea);
  if (visual) {
    visual.wrapSelection(wrap);
    return;
  }
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = textarea.value.slice(start, end);
  let before = wrap;
  let after = wrap;
  if (wrap === '<u></u>') {
    before = '<u>';
    after = '</u>';
  }
  textarea.value = `${textarea.value.slice(0, start)}${before}${selected}${after}${textarea.value.slice(end)}`;
  const cursor = start + before.length + selected.length + after.length;
  textarea.setSelectionRange(cursor, cursor);
  textarea.focus();
}

/**
 * @param {HTMLTextAreaElement} textarea
 */
export function clearComposerInput(textarea) {
  const visual = getVisualMentionInput(textarea);
  if (visual) {
    visual.clear();
    return;
  }
  textarea.value = '';
}

/**
 * @param {string} name
 */
function mentionChipLabel(name) {
  const label = `${name ?? ''}`.trim() || '用户';
  return label.startsWith('@') ? label : `@${label}`;
}

/**
 * @param {Document} doc
 * @param {number | string} userId
 * @param {string} name
 */
function createMentionChip(doc, userId, name) {
  const chip = doc.createElement('span');
  chip.className = 'mention-chip';
  chip.contentEditable = 'false';
  chip.setAttribute('data-mention-id', `${userId ?? ''}`.trim());
  chip.setAttribute('data-mention-name', `${name ?? ''}`.trim());
  chip.textContent = mentionChipLabel(name);
  return chip;
}

/**
 * @param {HTMLElement} root
 */
function editorPlainBeforeCaret(root) {
  const full = serializeVisualEditor(root);
  const sel = root.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    return { text: full, cursor: full.length };
  }
  const marker = root.ownerDocument.createComment('caret');
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  range.insertNode(marker);
  const text = serializeUntilMarker(root, marker);
  marker.parentNode?.removeChild(marker);
  return { text, cursor: text.length };
}

/**
 * @param {HTMLElement} root
 * @param {Comment} marker
 */
function serializeUntilMarker(root, marker) {
  let out = '';
  let stopped = false;
  const walk = (node) => {
    if (stopped) return;
    if (node === marker) {
      stopped = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.classList.contains('mention-chip')) {
      out += '@';
      return;
    }
    if (node.tagName === 'BR') {
      out += '\n';
      return;
    }
    node.childNodes.forEach(walk);
    if (!stopped && (node.tagName === 'DIV' || node.tagName === 'P') && node !== root) out += '\n';
  };
  root.childNodes.forEach(walk);
  return out.replace(/\n+$/, '');
}

/**
 * @param {HTMLElement} root
 */
function serializeVisualEditor(root) {
  let out = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.classList.contains('mention-chip')) {
      out += formatMentionToken(node.getAttribute('data-mention-id'), node.getAttribute('data-mention-name') ?? '');
      return;
    }
    if (node.tagName === 'BR') {
      out += '\n';
      return;
    }
    node.childNodes.forEach(walk);
    if ((node.tagName === 'DIV' || node.tagName === 'P') && node !== root) out += '\n';
  };
  root.childNodes.forEach(walk);
  return out.replace(/\n+$/, '');
}

/**
 * @param {HTMLElement} editor
 */
function placeCaretAtEnd(editor) {
  const sel = editor.ownerDocument.getSelection();
  if (!sel) return;
  const range = editor.ownerDocument.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

class VisualMentionInput {
  /**
   * @param {HTMLTextAreaElement} textarea
   * @param {MentionAutocompleteController} controller
   */
  constructor(textarea, controller) {
    this.textarea = textarea;
    this.controller = controller;
    this.editor = document.createElement('div');
    this.editor.className = textarea.className;
    this.editor.classList.add('mention-visual-input');
    this.editor.setAttribute('contenteditable', 'true');
    this.editor.setAttribute('role', 'textbox');
    this.editor.setAttribute('aria-multiline', 'true');
    const placeholder = textarea.getAttribute('placeholder');
    if (placeholder) this.editor.setAttribute('data-placeholder', placeholder);
    textarea.setAttribute('hidden', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.tabIndex = -1;
    textarea.parentNode?.insertBefore(this.editor, textarea);
    this.syncEmpty();
  }

  syncTextarea() {
    this.textarea.value = serializeVisualEditor(this.editor);
    this.syncEmpty();
  }

  syncEmpty() {
    this.editor.classList.toggle('is-empty', serializeVisualEditor(this.editor).length === 0);
  }

  getState() {
    const { text, cursor } = editorPlainBeforeCaret(this.editor);
    return getTextareaMentionState(text, cursor);
  }

  /**
   * @param {MentionUser} user
   * @param {{ start: number, end: number, query: string }} state
   */
  applyUser(user, state) {
    const queryLen = Math.max(0, state.end - state.start);
    if (queryLen > 0) {
      const sel = this.editor.ownerDocument.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        for (let i = 0; i < queryLen; i += 1) {
          this.editor.ownerDocument.execCommand('delete', false);
        }
      }
    }
    this.insertChip(user.id, user.name);
    this.insertText(' ');
    this.syncTextarea();
  }

  /**
   * @param {number | string | null | undefined} userId
   * @param {string} name
   */
  insertChip(userId, name) {
    const id = `${userId ?? ''}`.trim();
    if (!id || !`${name ?? ''}`.trim()) return;
    const sel = this.editor.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0 || !this.editor.contains(sel.anchorNode)) {
      this.editor.appendChild(createMentionChip(document, id, name));
      placeCaretAtEnd(this.editor);
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const chip = createMentionChip(document, id, name);
    range.insertNode(chip);
    range.setStartAfter(chip);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * @param {number | null | undefined} userId
   * @param {string} name
   */
  insertMention(userId, name) {
    this.insertChip(userId, name);
    this.syncTextarea();
    this.editor.focus();
  }

  /**
   * @param {string} text
   */
  insertText(text) {
    if (!text) return;
    this.editor.focus();
    const sel = this.editor.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0 || !this.editor.contains(sel.anchorNode)) {
      placeCaretAtEnd(this.editor);
    }
    const range = this.editor.ownerDocument.getSelection()?.getRangeAt(0);
    if (!range) {
      this.editor.appendChild(document.createTextNode(text));
      this.syncTextarea();
      return;
    }
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    const nextSel = this.editor.ownerDocument.getSelection();
    nextSel?.removeAllRanges();
    nextSel?.addRange(range);
    this.syncTextarea();
  }

  /**
   * @param {string} wrap
   */
  wrapSelection(wrap) {
    let before = wrap;
    let after = wrap;
    if (wrap === '<u></u>') {
      before = '<u>';
      after = '</u>';
    }
    const sel = this.editor.ownerDocument.getSelection();
    const selected = sel && sel.rangeCount > 0 ? sel.toString() : '';
    this.insertText(`${before}${selected}${after}`);
  }

  clear() {
    this.editor.innerHTML = '';
    this.textarea.value = '';
    this.syncEmpty();
  }

  focus() {
    this.editor.focus();
    placeCaretAtEnd(this.editor);
  }
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {{ onSync?: () => void }} [options]
 */
export function bindVisualMentionInput(textarea, options = {}) {
  const existing = visualMentionInputs.get(textarea);
  if (existing) return { controller: existing.controller, visual: existing };

  const wrap = document.createElement('div');
  wrap.className = 'mention-autocomplete-anchor';
  textarea.parentNode?.insertBefore(wrap, textarea);
  wrap.appendChild(textarea);

  /** @type {VisualMentionInput | null} */
  let visual = null;
  const controller = new MentionAutocompleteController(wrap, {
    getState: () => visual?.getState() ?? null,
    getPositionEl: () => visual?.editor ?? textarea,
    applyUser: (user, state) => visual?.applyUser(user, state),
    onSync: options.onSync,
  });
  visual = new VisualMentionInput(textarea, controller);
  visualMentionInputs.set(textarea, visual);

  const syncMention = () => {
    visual?.syncTextarea();
    controller.onInput();
    options.onSync?.();
  };
  visual.editor.addEventListener('input', syncMention);
  visual.editor.addEventListener('keyup', syncMention);
  visual.editor.addEventListener('click', syncMention);
  visual.editor.addEventListener('keydown', (event) => {
    controller.handleKeydown(event);
  });
  visual.editor.addEventListener('blur', () => {
    window.setTimeout(() => controller.close(), 120);
  });

  return { controller, visual };
}
