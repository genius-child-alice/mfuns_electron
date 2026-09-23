import { notify } from './notice-ui.js';
import { marked } from '../../node_modules/marked/lib/marked.esm.js';
import { normalizeRichContent, quillOpsToMarkdown } from './rich-content.js';
import { bindQuillMentionAutocomplete } from './mention-autocomplete.js';
import { registerQuillMention } from './quill-mention.js';

/** @typedef {'article' | 'video' | 'feed'} EditorContentMode */
/** @typedef {import('../vendor/quill.mjs').default} QuillCtor */

/** @typedef {{
 *   containerId: string,
 *   wrapId: string | null,
 *   placeholder: string,
 *   compact: boolean,
 *   quill: import('../vendor/quill.mjs').default | null,
 *   mentionBound: boolean,
 * }} RichEditorSlot */

/** @type {Promise<QuillCtor> | null} */
let quillLoadPromise = null;

/** @type {QuillCtor | null} */
let QuillClass = null;

/** @type {Map<string, RichEditorSlot>} */
const editorSlots = new Map();

/** @type {Map<string, (file: File) => Promise<string>>} */
const imageUploadHandlers = new Map();

const TOOLBAR_OPTIONS = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block'],
  ['link', 'image'],
  ['clean'],
];

const FEED_TOOLBAR_OPTIONS = [
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link', 'image'],
  ['clean'],
];

/**
 * @param {string} editorKey
 * @param {{ containerId: string, wrapId?: string | null, placeholder?: string, compact?: boolean }} config
 */
function registerEditorSlot(editorKey, config) {
  editorSlots.set(editorKey, {
    containerId: config.containerId,
    wrapId: config.wrapId ?? null,
    placeholder: config.placeholder ?? '请输入内容',
    compact: config.compact === true,
    quill: null,
    mentionBound: false,
  });
}

registerEditorSlot('contribute', {
  containerId: 'contribute-editor-quill',
  wrapId: 'contribute-rich-editor',
  placeholder: '请输入正文内容',
});
registerEditorSlot('feed', {
  containerId: 'feed-compose-quill',
  wrapId: 'feed-compose-rich-editor',
  placeholder: '分享此刻的想法…',
  compact: true,
});

/**
 * @returns {Promise<QuillCtor>}
 */
function loadQuillClass() {
  if (QuillClass) return Promise.resolve(QuillClass);
  if (!quillLoadPromise) {
    quillLoadPromise = import('../vendor/quill.mjs')
      .then((mod) => {
        QuillClass = mod.default;
        registerQuillMention(QuillClass);
        return QuillClass;
      })
      .catch((err) => {
        quillLoadPromise = null;
        throw err;
      });
  }
  return quillLoadPromise;
}

/**
 * @param {string} editorKey
 * @param {(file: File) => Promise<string>} handler
 */
export function setRichEditorImageUpload(editorKey, handler) {
  imageUploadHandlers.set(editorKey, handler);
}

/** @deprecated Use setRichEditorImageUpload('contribute', handler) */
export function setContributeRichEditorImageUpload(handler) {
  setRichEditorImageUpload('contribute', handler);
}

/**
 * @param {string} editorKey
 * @returns {RichEditorSlot | null}
 */
function getSlot(editorKey) {
  return editorSlots.get(editorKey) ?? null;
}

/**
 * @param {InstanceType<QuillCtor>} quill
 * @param {string} editorKey
 */
function bindImageHandler(quill, editorKey) {
  const toolbar = quill.getModule('toolbar');
  if (!toolbar || typeof toolbar.addHandler !== 'function') return;
  toolbar.addHandler('image', () => {
    const handler = imageUploadHandlers.get(editorKey);
    if (!handler) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const url = await handler(file);
        const range = quill.getSelection(true);
        const index = range?.index ?? quill.getLength();
        quill.insertEmbed(index, 'image', url, 'user');
        quill.setSelection(index + 1);
      } catch (err) {
        notify(err instanceof Error ? err.message : '图片上传失败', 'error');
      }
    };
    input.click();
  });
}

/**
 * @param {string} [editorKey]
 * @returns {Promise<import('../vendor/quill.mjs').default | null>}
 */
export async function ensureRichEditor(editorKey = 'contribute') {
  const slot = getSlot(editorKey);
  const container = slot ? document.getElementById(slot.containerId) : null;
  if (!slot || !container) return null;

  const Quill = await loadQuillClass();

  if (!slot.quill) {
    slot.quill = new Quill(container, {
      theme: 'snow',
      modules: {
        toolbar: {
          container: editorKey === 'feed' ? FEED_TOOLBAR_OPTIONS : TOOLBAR_OPTIONS,
          handlers: {},
        },
      },
      placeholder: slot.placeholder,
    });
    bindImageHandler(slot.quill, editorKey);
    const wrap = slot.wrapId ? document.getElementById(slot.wrapId) : container.parentElement;
    if (wrap && !slot.mentionBound) {
      bindQuillMentionAutocomplete(slot.quill, wrap);
      slot.mentionBound = true;
    }
  }

  return slot.quill;
}

/** @deprecated */
export const ensureContributeRichEditor = () => ensureRichEditor('contribute');

/**
 * @param {InstanceType<QuillCtor>} quill
 * @param {string} markdown
 */
function loadMarkdownIntoQuill(quill, markdown) {
  const value = `${markdown ?? ''}`.trim();
  if (!value) {
    quill.setText('');
    return;
  }
  const html = marked.parse(value, { async: false });
  quill.clipboard.dangerouslyPasteHTML(typeof html === 'string' ? html : '', 'silent');
}

/**
 * @param {string | null | undefined} source
 * @param {EditorContentMode} mode
 * @param {string} [editorKey]
 */
export async function loadRichEditorContent(source, mode, editorKey = 'contribute') {
  const quill = await ensureRichEditor(editorKey);
  if (!quill) return;

  const value = `${source ?? ''}`.trim();
  quill.setText('');

  if (!value) return;

  if (mode === 'video' || mode === 'feed' || (value.startsWith('{') && value.includes('"ops"'))) {
    try {
      const parsed = JSON.parse(value);
      const ops = parsed?.ops ?? (Array.isArray(parsed) ? parsed : null);
      if (Array.isArray(ops)) {
        quill.setContents({ ops });
        return;
      }
    } catch {
      /* fall through */
    }
  }

  if (mode === 'article') {
    loadMarkdownIntoQuill(quill, normalizeRichContent(value));
    return;
  }

  quill.setText(value);
}

/** @deprecated */
export const loadContributeRichEditorContent = (source, mode) =>
  loadRichEditorContent(source, mode, 'contribute');

/**
 * @param {0 | 1} type
 */
export async function syncContributeRichEditorLayout(type) {
  const slot = getSlot('contribute');
  const wrap = slot?.wrapId ? document.getElementById(slot.wrapId) : null;
  const quill = await ensureRichEditor('contribute');
  if (!wrap || !quill || !slot) return;

  const isVideo = type === 1;
  wrap.classList.toggle('contribute-rich-editor--compact', isVideo);
  const placeholder = isVideo ? '视频简介' : '请输入正文内容';
  slot.placeholder = placeholder;
  quill.root.setAttribute('data-placeholder', placeholder);
}

/**
 * @param {string} [editorKey]
 */
export async function resetRichEditor(editorKey = 'contribute') {
  const quill = await ensureRichEditor(editorKey);
  if (!quill) return;
  quill.setText('');
}

/** @deprecated */
export const resetContributeRichEditor = () => resetRichEditor('contribute');

/**
 * @param {string} [editorKey]
 * @returns {Promise<boolean>}
 */
export async function isRichEditorEmpty(editorKey = 'contribute') {
  const quill = await ensureRichEditor(editorKey);
  if (!quill) return true;
  const text = quill.getText().replace(/\n/g, '').trim();
  if (text) return false;
  const ops = quill.getContents().ops ?? [];
  return !ops.some((op) => {
    if (!op || typeof op !== 'object') return false;
    const insert = /** @type {Record<string, unknown>} */ (op).insert;
    return insert != null && typeof insert !== 'string';
  });
}

/** @deprecated */
export const isContributeRichEditorEmpty = () => isRichEditorEmpty('contribute');

/**
 * @param {string} [editorKey]
 * @returns {Promise<string>}
 */
export async function getArticleMarkdownFromEditor(editorKey = 'contribute') {
  const quill = await ensureRichEditor(editorKey);
  if (!quill) return '';
  return quillOpsToMarkdown(quill.getContents().ops);
}

/**
 * @param {string} [editorKey]
 * @returns {Promise<string>}
 */
export async function getQuillJsonFromEditor(editorKey = 'contribute') {
  const quill = await ensureRichEditor(editorKey);
  if (!quill) return JSON.stringify({ ops: [{ insert: '\n' }] });
  const contents = quill.getContents();
  const ops = contents.ops ?? [];
  if (ops.length === 0) return JSON.stringify({ ops: [{ insert: '\n' }] });
  return JSON.stringify(contents);
}

/** @deprecated */
export const getVideoQuillJsonFromEditor = () => getQuillJsonFromEditor('contribute');
