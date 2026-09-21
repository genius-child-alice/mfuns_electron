import { marked } from '../../node_modules/marked/lib/marked.esm.js';
import { normalizeRichContent, quillOpsToMarkdown } from './rich-content.js';

/** @typedef {'article' | 'video'} EditorContentMode */
/** @typedef {import('../vendor/quill.mjs').default} QuillCtor */

/** @type {QuillCtor | null} */
let QuillClass = null;

/** @type {import('../vendor/quill.mjs').default | null} */
let quillInstance = null;

/** @type {Promise<QuillCtor> | null} */
let quillLoadPromise = null;

/** @type {((file: File) => Promise<string>) | null} */
let imageUploadHandler = null;

const TOOLBAR_OPTIONS = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block'],
  ['link', 'image'],
  ['clean'],
];

/**
 * @returns {Promise<QuillCtor>}
 */
function loadQuillClass() {
  if (QuillClass) return Promise.resolve(QuillClass);
  if (!quillLoadPromise) {
    quillLoadPromise = import('../vendor/quill.mjs')
      .then((mod) => {
        QuillClass = mod.default;
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
 * @param {(file: File) => Promise<string>} handler
 */
export function setContributeRichEditorImageUpload(handler) {
  imageUploadHandler = handler;
}

/**
 * @returns {import('../vendor/quill.mjs').default | null}
 */
export function getContributeRichEditor() {
  return quillInstance;
}

/**
 * @param {InstanceType<QuillCtor>} quill
 */
function bindImageHandler(quill) {
  const toolbar = quill.getModule('toolbar');
  if (!toolbar || typeof toolbar.addHandler !== 'function') return;
  toolbar.addHandler('image', () => {
    if (!imageUploadHandler) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const url = await imageUploadHandler(file);
        const range = quill.getSelection(true);
        const index = range?.index ?? quill.getLength();
        quill.insertEmbed(index, 'image', url, 'user');
        quill.setSelection(index + 1);
      } catch (err) {
        alert(err instanceof Error ? err.message : '图片上传失败');
      }
    };
    input.click();
  });
}

/**
 * @returns {Promise<import('../vendor/quill.mjs').default | null>}
 */
export async function ensureContributeRichEditor() {
  const container = document.getElementById('contribute-editor-quill');
  if (!container) return null;

  const Quill = await loadQuillClass();

  if (!quillInstance) {
    quillInstance = new Quill(container, {
      theme: 'snow',
      modules: {
        toolbar: {
          container: TOOLBAR_OPTIONS,
          handlers: {},
        },
      },
      placeholder: '请输入正文内容',
    });
    bindImageHandler(quillInstance);
  }

  return quillInstance;
}

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
 */
export async function loadContributeRichEditorContent(source, mode) {
  const quill = await ensureContributeRichEditor();
  if (!quill) return;

  const value = `${source ?? ''}`.trim();
  quill.setText('');

  if (!value) return;

  if (mode === 'video' || (value.startsWith('{') && value.includes('"ops"'))) {
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

/**
 * @param {0 | 1} type
 */
export async function syncContributeRichEditorLayout(type) {
  const wrap = document.getElementById('contribute-rich-editor');
  const quill = await ensureContributeRichEditor();
  if (!wrap || !quill) return;

  const isVideo = type === 1;
  wrap.classList.toggle('contribute-rich-editor--compact', isVideo);
  quill.root.setAttribute('data-placeholder', isVideo ? '视频简介' : '请输入正文内容');
}

export async function resetContributeRichEditor() {
  const quill = await ensureContributeRichEditor();
  if (!quill) return;
  quill.setText('');
}

/**
 * @returns {Promise<boolean>}
 */
export async function isContributeRichEditorEmpty() {
  const quill = await ensureContributeRichEditor();
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

/**
 * @returns {Promise<string>}
 */
export async function getArticleMarkdownFromEditor() {
  const quill = await ensureContributeRichEditor();
  if (!quill) return '';
  return quillOpsToMarkdown(quill.getContents().ops);
}

/**
 * @returns {Promise<string>}
 */
export async function getVideoQuillJsonFromEditor() {
  const quill = await ensureContributeRichEditor();
  if (!quill) return JSON.stringify({ ops: [{ insert: '\n' }] });
  const contents = quill.getContents();
  const ops = contents.ops ?? [];
  if (ops.length === 0) return JSON.stringify({ ops: [{ insert: '\n' }] });
  return JSON.stringify(contents);
}
