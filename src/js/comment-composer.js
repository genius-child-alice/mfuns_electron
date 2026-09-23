import { notify } from './notice-ui.js';
import { materialIcon } from './icons.js';
import { requireLogin } from './login-ui.js';
import {
  COMMENT_MAX_LENGTH,
  createComment,
  createCommentReply,
  uploadCommentImage,
} from './video-api.js';
import { fetchEmojiPackGroups } from './emoji-pack.js';
import { bindQuillMentionAutocomplete } from './mention-autocomplete.js';
import { registerQuillMention } from './quill-mention.js';
import { registerQuillSticker } from './quill-sticker.js';

const DEFAULT_MAX_LENGTH = COMMENT_MAX_LENGTH;
const MAX_IMAGES = 9;

const EMOJI_ITEMS = ['😀', '😂', '🥰', '😊', '😭', '👍', '❤️', '🎉', '🙏', '🔥', '✨', '🤔'];

let stickerPanelLoaded = false;
/** @type {string} */
let activeStickerPackKey = '';

/** @typedef {{
 *   title?: string,
 *   maxLength?: number,
 *   areaId?: number,
 *   commentId?: number,
 *   mention?: { userId?: number | null, name?: string | null },
 *   onSuccess?: () => void | Promise<void>,
 * }} CommentComposerOptions */

/** @type {CommentComposerOptions | null} */
let context = null;

/** @type {string[]} */
let imagePaths = [];

let bound = false;
let mentionController = null;

/** @type {import('../vendor/quill.mjs').default | null} */
let commentQuill = null;

const FORMAT_WRAP = {
  '**': 'bold',
  '*': 'italic',
  '~~': 'strike',
  '<u></u>': 'underline',
};

/**
 * @param {string} [placeholder]
 * @param {string} [id]
 * @param {string} [className]
 */
export function commentComposerTriggerHtml(
  placeholder = '发一条友善的评论',
  id = '',
  className = 'comment-composer-trigger',
) {
  const idAttr = id ? ` id="${id}"` : '';
  return `<button type="button" class="${className}"${idAttr}>${placeholder}</button>`;
}

export function commentComposerDialogHtml() {
  return `
    <dialog class="comment-composer-dialog app-no-drag" id="comment-composer-dialog" aria-labelledby="comment-composer-title">
      <form class="comment-composer" id="comment-composer-form">
        <header class="comment-composer__head">
          <button type="button" class="comment-composer__icon-btn" id="comment-composer-close" aria-label="关闭">
            ${materialIcon('close')}
          </button>
          <h2 class="comment-composer__title" id="comment-composer-title">发表一个评论</h2>
          <button type="submit" class="comment-composer__submit" id="comment-composer-submit">提交</button>
        </header>
        <div class="comment-composer__body">
          <div class="comment-composer__editor mention-autocomplete-anchor" id="comment-composer-editor">
            <div id="comment-composer-quill"></div>
          </div>
          <div class="comment-composer__toolbar-row">
            <div class="comment-composer__toolbar" role="toolbar" aria-label="评论格式">
              <button type="button" class="comment-composer__tool" data-composer-action="emoji" title="表情" aria-label="表情">
                ${materialIcon('mood')}
              </button>
              <button type="button" class="comment-composer__tool" data-composer-action="mention" title="提及" aria-label="提及">@</button>
              <button type="button" class="comment-composer__tool comment-composer__tool--text" data-composer-wrap="**" title="粗体" aria-label="粗体"><strong>B</strong></button>
              <button type="button" class="comment-composer__tool comment-composer__tool--text" data-composer-wrap="*" title="斜体" aria-label="斜体"><em>I</em></button>
              <button type="button" class="comment-composer__tool comment-composer__tool--text" data-composer-wrap="~~" title="删除线" aria-label="删除线"><s>S</s></button>
              <button type="button" class="comment-composer__tool comment-composer__tool--text" data-composer-wrap="<u></u>" title="下划线" aria-label="下划线"><u>U</u></button>
            </div>
            <span class="comment-composer__count" id="comment-composer-count">0 / ${DEFAULT_MAX_LENGTH}</span>
          </div>
          <div class="comment-composer__emoji-panel" id="comment-composer-emoji-panel" hidden>
            <div class="comment-composer__sticker-tabs" id="comment-composer-sticker-tabs" role="tablist" aria-label="表情分组"></div>
            <div class="comment-composer__sticker-grid" id="comment-composer-sticker-grid"></div>
            <div class="comment-composer__emoji-fallback" id="comment-composer-emoji-fallback">
              ${EMOJI_ITEMS.map((emoji) => `<button type="button" class="comment-composer__emoji" data-composer-emoji="${emoji}">${emoji}</button>`).join('')}
            </div>
          </div>
          <div class="comment-composer__images" id="comment-composer-images"></div>
          <input type="file" id="comment-composer-file" accept="image/*" multiple hidden />
        </div>
      </form>
    </dialog>`;
}

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('comment-composer-dialog'));
}

function getEditorWrap() {
  return document.getElementById('comment-composer-editor');
}

function commentQuillIsEmpty(quill) {
  if (!quill) return true;
  const ops = quill.getContents().ops ?? [];
  return !ops.some((op) => {
    const insert = /** @type {{ insert?: unknown }} */ (op).insert;
    if (typeof insert === 'string') return insert.replace(/\n/g, '').trim().length > 0;
    return Boolean(insert && typeof insert === 'object');
  });
}

function serializeCommentQuill(quill) {
  return JSON.stringify({ ops: quill.getContents().ops ?? [] });
}

/**
 * @returns {Promise<import('../vendor/quill.mjs').default | null>}
 */
async function ensureCommentQuill() {
  if (commentQuill) return commentQuill;
  const container = document.getElementById('comment-composer-quill');
  const wrap = getEditorWrap();
  if (!container || !wrap) return null;
  const { default: Quill } = await import('../vendor/quill.mjs');
  registerQuillMention(Quill);
  registerQuillSticker(Quill);
  commentQuill = new Quill(container, {
    theme: 'snow',
    formats: ['mention', 'sticker', 'bold', 'italic', 'underline', 'strike'],
    modules: { toolbar: false },
    placeholder: '请输入内容',
  });
  mentionController = bindQuillMentionAutocomplete(commentQuill, wrap);
  commentQuill.on('text-change', () => syncCount());
  return commentQuill;
}

function getImagesRoot() {
  return document.getElementById('comment-composer-images');
}

function getFileInput() {
  return /** @type {HTMLInputElement | null} */ (document.getElementById('comment-composer-file'));
}

function maxLength() {
  return context?.maxLength ?? DEFAULT_MAX_LENGTH;
}

function syncCount() {
  const countEl = document.getElementById('comment-composer-count');
  const max = maxLength();
  const len = commentQuill ? Math.max(0, commentQuill.getLength() - 1) : 0;
  if (countEl) {
    countEl.textContent = `${len} / ${max}`;
    countEl.classList.toggle('comment-composer__count--limit', len >= max);
  }
}

function syncComposerReplyMode() {
  const isReply = context?.commentId != null;
  const imagesRoot = getImagesRoot();
  if (imagesRoot) imagesRoot.hidden = isReply;
}

function resetComposer() {
  imagePaths = [];
  commentQuill?.setText('');
  const fileInput = getFileInput();
  if (fileInput) fileInput.value = '';
  renderImagePreviews();
  hideEmojiPanel();
  syncComposerReplyMode();
  syncCount();
}

function hideEmojiPanel() {
  document.getElementById('comment-composer-emoji-panel')?.setAttribute('hidden', '');
}

function toggleEmojiPanel() {
  const panel = document.getElementById('comment-composer-emoji-panel');
  if (!panel) return;
  const willShow = panel.hasAttribute('hidden');
  if (willShow) void ensureOfficialStickerPanel();
  panel.toggleAttribute('hidden');
}

function renderStickerPack(packKey, groups) {
  const grid = document.getElementById('comment-composer-sticker-grid');
  const tabs = document.getElementById('comment-composer-sticker-tabs');
  if (!grid || !tabs) return;
  activeStickerPackKey = packKey;
  const pack = groups.find((group) => group.key === packKey) ?? groups[0];
  if (!pack) return;
  tabs.innerHTML = groups
    .map(
      (group) =>
        `<button type="button" class="comment-composer__sticker-tab ${group.key === pack.key ? 'is-active' : ''}" data-sticker-pack="${group.key}" role="tab">${group.name}</button>`,
    )
    .join('');
  grid.innerHTML = pack.stickers
    .map(
      (sticker) =>
        `<button type="button" class="comment-composer__sticker" data-composer-sticker="${sticker.key}" title="${sticker.key}">
          <img src="${sticker.url}" alt="" loading="lazy" />
        </button>`,
    )
    .join('');
  document.getElementById('comment-composer-emoji-fallback')?.setAttribute('hidden', '');
}

async function ensureOfficialStickerPanel() {
  if (stickerPanelLoaded) return;
  const grid = document.getElementById('comment-composer-sticker-grid');
  const tabs = document.getElementById('comment-composer-sticker-tabs');
  if (!grid || !tabs) return;
  grid.innerHTML = `<p class="comment-composer__sticker-loading">${materialIcon('progress_activity', 'home-feed__spin')}加载表情…</p>`;
  try {
    const groups = await fetchEmojiPackGroups();
    stickerPanelLoaded = true;
    if (groups.length === 0) return;
    renderStickerPack(groups[0].key, groups);
  } catch {
    grid.innerHTML = '<p class="comment-composer__sticker-loading">官方表情加载失败</p>';
  }
}

function focusComposerInput() {
  commentQuill?.focus();
}

/**
 * @param {string} text
 */
function insertComposerText(text) {
  if (!commentQuill || !text) return;
  const range = commentQuill.getSelection(true) ?? { index: Math.max(0, commentQuill.getLength() - 1), length: 0 };
  commentQuill.insertText(range.index, text, 'user');
  commentQuill.setSelection(range.index + text.length, 0, 'user');
  syncCount();
}

/**
 * @param {string} wrap
 */
function toggleComposerFormat(wrap) {
  if (!commentQuill) return;
  const format = FORMAT_WRAP[wrap];
  if (!format) return;
  commentQuill.focus();
  const active = Boolean(commentQuill.getFormat()[format]);
  commentQuill.format(format, !active, 'user');
}

/**
 * @param {string} key
 * @param {string} [src]
 */
function insertComposerSticker(key, src = '') {
  if (!commentQuill || !key) return;
  const range = commentQuill.getSelection(true) ?? { index: Math.max(0, commentQuill.getLength() - 1), length: 0 };
  commentQuill.insertEmbed(range.index, 'sticker', { key, src }, 'user');
  commentQuill.setSelection(range.index + 1, 0, 'user');
  syncCount();
}

function renderImagePreviews() {
  const root = getImagesRoot();
  if (!root) return;

  const previews = imagePaths
    .map(
      (path, index) => `
      <div class="comment-composer__image-item">
        <img class="comment-composer__image-thumb" src="" alt="" data-image-path="${path}" data-image-index="${index}" />
        <button type="button" class="comment-composer__image-remove" data-image-remove="${index}" aria-label="移除图片">×</button>
      </div>`,
    )
    .join('');

  const canAdd = imagePaths.length < MAX_IMAGES;
  root.innerHTML = `
    ${previews}
    ${
      canAdd
        ? `<button type="button" class="comment-composer__add-image" id="comment-composer-add-image" aria-label="添加图片">
            ${materialIcon('add', 'comment-composer__add-image-icon')}
          </button>`
        : ''
    }`;

  root.querySelectorAll('.comment-composer__image-thumb').forEach((img) => {
    const el = /** @type {HTMLImageElement} */ (img);
    const path = el.getAttribute('data-image-path');
    if (!path) return;
    void import('./content-api.js').then(({ mediaSrcForCover }) => {
      const src = mediaSrcForCover(path);
      if (src) el.src = src;
    });
  });
}

/**
 * @param {FileList | File[]} files
 */
async function handleImageFiles(files) {
  const list = [...files].filter((file) => file.type.startsWith('image/'));
  if (!list.length) return;

  const remaining = MAX_IMAGES - imagePaths.length;
  if (remaining <= 0) return;

  const submitBtn = document.getElementById('comment-composer-submit');
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;

  try {
    for (const file of list.slice(0, remaining)) {
      const path = await uploadCommentImage(file);
      imagePaths.push(path);
    }
    renderImagePreviews();
  } catch (err) {
    notify(err instanceof Error ? err.message : '图片上传失败', 'error');
  } finally {
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    const fileInput = getFileInput();
  if (fileInput) fileInput.value = '';
  }
}

/**
 * @param {CommentComposerOptions} options
 */
export async function openCommentComposer(options) {
  const { ensureFeatureBound } = await import('./lazy-page-bind.js');
  await ensureFeatureBound('comment-composer');

  if (!requireLogin()) return;

  context = {
    title: options.title ?? '发表一个评论',
    maxLength: options.maxLength ?? DEFAULT_MAX_LENGTH,
    areaId: options.areaId,
    commentId: options.commentId,
    mention: options.mention,
    onSuccess: options.onSuccess,
  };

  const dialog = getDialog();
  const titleEl = document.getElementById('comment-composer-title');
  if (!dialog) return;
  const quill = await ensureCommentQuill();
  if (!quill) return;

  if (titleEl) titleEl.textContent = context.title;
  resetComposer();
  syncComposerReplyMode();

  if (context.commentId != null && context.mention?.name) {
    quill.insertText(0, '回复', 'user');
    quill.insertEmbed(
      2,
      'mention',
      { id: `${context.mention.userId ?? ''}`, value: context.mention.name },
      'user',
    );
    quill.insertText(3, '：', 'user');
    quill.setSelection(4, 0, 'user');
    syncCount();
  }

  if (!dialog.open) dialog.showModal();
  window.requestAnimationFrame(() => {
    focusComposerInput();
  });
}

export function closeCommentComposer() {
  const dialog = getDialog();
  if (dialog?.open) dialog.close();
  context = null;
  resetComposer();
}

async function submitComposer() {
  const submitBtn = document.getElementById('comment-composer-submit');
  if (!commentQuill || !context) return;

  if (commentQuillIsEmpty(commentQuill) && imagePaths.length === 0) {
    notify('请输入内容或添加图片', 'warning');
    focusComposerInput();
    return;
  }

  const content = serializeCommentQuill(commentQuill);
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
  try {
    if (context.areaId != null) {
      await createComment(context.areaId, content, imagePaths);
    } else if (context.commentId != null) {
      await createCommentReply(context.commentId, content, context.mention);
    } else {
      throw new Error('无法发布评论');
    }
    await context.onSuccess?.();
    closeCommentComposer();
  } catch (err) {
    notify(err instanceof Error ? err.message : '发布失败', 'error');
  } finally {
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
  }
}

export function bindCommentComposer() {
  if (bound) return;
  bound = true;

  if (!document.getElementById('comment-composer-dialog')) {
    document.body.insertAdjacentHTML('beforeend', commentComposerDialogHtml());
  }

  const dialog = getDialog();
  const form = document.getElementById('comment-composer-form');
  void ensureCommentQuill();

  document.getElementById('comment-composer-close')?.addEventListener('click', () => {
    closeCommentComposer();
  });

  dialog?.addEventListener('close', () => {
    context = null;
    resetComposer();
    const submitBtn = document.getElementById('comment-composer-submit');
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
  });

  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) closeCommentComposer();
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitComposer();
  });

  document.getElementById('comment-composer-images')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const removeBtn = target.closest('[data-image-remove]');
    if (removeBtn instanceof HTMLElement) {
      const index = Number.parseInt(removeBtn.getAttribute('data-image-remove') ?? '', 10);
      if (Number.isFinite(index)) {
        imagePaths.splice(index, 1);
        renderImagePreviews();
      }
      return;
    }
    if (target.closest('#comment-composer-add-image')) {
      getFileInput()?.click();
    }
  });

  getFileInput()?.addEventListener('change', (event) => {
    const files = /** @type {HTMLInputElement} */ (event.target).files;
    if (files?.length) void handleImageFiles(files);
  });

  dialog?.querySelector('.comment-composer__toolbar')?.addEventListener('mousedown', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('[data-composer-wrap], [data-composer-action="mention"]')) {
      event.preventDefault();
    }
  });

  dialog?.querySelector('.comment-composer__toolbar')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const btn = target.closest('[data-composer-action], [data-composer-wrap]');
    if (!(btn instanceof HTMLElement)) return;
    event.preventDefault();

    const action = btn.getAttribute('data-composer-action');
    if (action === 'emoji') {
      toggleEmojiPanel();
      return;
    }
    if (action === 'mention') {
      insertComposerText('@');
      mentionController?.onInput();
      hideEmojiPanel();
      return;
    }

    const wrap = btn.getAttribute('data-composer-wrap');
    if (wrap) {
      toggleComposerFormat(wrap);
      hideEmojiPanel();
    }
  });

  const emojiPanel = document.getElementById('comment-composer-emoji-panel');
  emojiPanel?.addEventListener('mousedown', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('[data-composer-sticker], [data-composer-emoji]')) {
      event.preventDefault();
    }
  });
  emojiPanel?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const packTab = target.closest('[data-sticker-pack]');
    if (packTab instanceof HTMLElement) {
      const packKey = packTab.getAttribute('data-sticker-pack');
      if (!packKey) return;
      void fetchEmojiPackGroups().then((groups) => renderStickerPack(packKey, groups));
      return;
    }

    const stickerBtn = target.closest('[data-composer-sticker]');
    if (stickerBtn instanceof HTMLElement) {
      const key = stickerBtn.getAttribute('data-composer-sticker');
      if (!key) return;
      const src = stickerBtn.querySelector('img')?.getAttribute('src') ?? '';
      insertComposerSticker(key, src);
      focusComposerInput();
      return;
    }

    const btn = target.closest('[data-composer-emoji]');
    if (!(btn instanceof HTMLElement)) return;
    const emoji = btn.getAttribute('data-composer-emoji');
    if (!emoji) return;
    insertComposerText(emoji);
    focusComposerInput();
  });
}
