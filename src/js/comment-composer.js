import { materialIcon } from './icons.js';
import { requireLogin } from './login-ui.js';
import { createComment, createCommentReply, uploadCommentImage } from './video-api.js';

const DEFAULT_MAX_LENGTH = 200;
const MAX_IMAGES = 9;

const EMOJI_ITEMS = ['😀', '😂', '🥰', '😊', '😭', '👍', '❤️', '🎉', '🙏', '🔥', '✨', '🤔'];

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
          <textarea
            class="comment-composer__input"
            id="comment-composer-input"
            rows="6"
            placeholder="请输入内容"
            maxlength="${DEFAULT_MAX_LENGTH}"
          ></textarea>
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
            ${EMOJI_ITEMS.map((emoji) => `<button type="button" class="comment-composer__emoji" data-composer-emoji="${emoji}">${emoji}</button>`).join('')}
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

function getInput() {
  return /** @type {HTMLTextAreaElement | null} */ (document.getElementById('comment-composer-input'));
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
  const input = getInput();
  const countEl = document.getElementById('comment-composer-count');
  const max = maxLength();
  if (input) input.maxLength = max;
  if (countEl) {
    const len = input?.value.length ?? 0;
    countEl.textContent = `${len} / ${max}`;
    countEl.classList.toggle('comment-composer__count--limit', len >= max);
  }
}

function resetComposer() {
  imagePaths = [];
  const input = getInput();
  if (input) input.value = '';
  const fileInput = getFileInput();
  if (fileInput) fileInput.value = '';
  renderImagePreviews();
  hideEmojiPanel();
  syncCount();
}

function hideEmojiPanel() {
  document.getElementById('comment-composer-emoji-panel')?.setAttribute('hidden', '');
}

function toggleEmojiPanel() {
  const panel = document.getElementById('comment-composer-emoji-panel');
  if (!panel) return;
  panel.toggleAttribute('hidden');
}

/**
 * @param {HTMLTextAreaElement} input
 * @param {string} insert
 */
function insertAtCursor(input, insert) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = `${before}${insert}${after}`;
  const cursor = start + insert.length;
  input.setSelectionRange(cursor, cursor);
  input.focus();
  syncCount();
}

/**
 * @param {HTMLTextAreaElement} input
 * @param {string} wrap
 */
function wrapSelection(input, wrap) {
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? start;
  const selected = input.value.slice(start, end);
  let before = wrap;
  let after = wrap;
  if (wrap === '<u></u>') {
    before = '<u>';
    after = '</u>';
  }
  const next = `${input.value.slice(0, start)}${before}${selected}${after}${input.value.slice(end)}`;
  input.value = next;
  const cursor = start + before.length + selected.length + after.length;
  input.setSelectionRange(cursor, cursor);
  input.focus();
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
    alert(err instanceof Error ? err.message : '图片上传失败');
  } finally {
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    const fileInput = getFileInput();
  if (fileInput) fileInput.value = '';
  }
}

/**
 * @param {CommentComposerOptions} options
 */
export function openCommentComposer(options) {
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
  const input = getInput();
  if (!dialog || !input) return;

  if (titleEl) titleEl.textContent = context.title;
  resetComposer();

  if (!dialog.open) dialog.showModal();
  window.requestAnimationFrame(() => input.focus());
}

export function closeCommentComposer() {
  const dialog = getDialog();
  if (dialog?.open) dialog.close();
  context = null;
  resetComposer();
}

async function submitComposer() {
  const input = getInput();
  const submitBtn = document.getElementById('comment-composer-submit');
  if (!input || !context) return;

  const text = input.value.trim();
  if (!text && imagePaths.length === 0) {
    alert('请输入内容或添加图片');
    input.focus();
    return;
  }

  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
  try {
    if (context.areaId != null) {
      await createComment(context.areaId, text, imagePaths);
    } else if (context.commentId != null) {
      await createCommentReply(context.commentId, text, context.mention, imagePaths);
    } else {
      throw new Error('无法发布评论');
    }
    await context.onSuccess?.();
    closeCommentComposer();
  } catch (err) {
    alert(err instanceof Error ? err.message : '发布失败');
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
  const input = getInput();

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

  input?.addEventListener('input', syncCount);

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

  dialog?.querySelector('.comment-composer__toolbar')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const btn = target.closest('[data-composer-action], [data-composer-wrap]');
    if (!(btn instanceof HTMLElement) || !input) return;
    event.preventDefault();

    const action = btn.getAttribute('data-composer-action');
    if (action === 'emoji') {
      toggleEmojiPanel();
      return;
    }
    if (action === 'mention') {
      insertAtCursor(input, '@');
      hideEmojiPanel();
      return;
    }

    const wrap = btn.getAttribute('data-composer-wrap');
    if (wrap) {
      wrapSelection(input, wrap);
      hideEmojiPanel();
    }
  });

  document.getElementById('comment-composer-emoji-panel')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const btn = target.closest('[data-composer-emoji]');
    if (!(btn instanceof HTMLElement) || !input) return;
    const emoji = btn.getAttribute('data-composer-emoji');
    if (!emoji) return;
    insertAtCursor(input, emoji);
    hideEmojiPanel();
  });
}
