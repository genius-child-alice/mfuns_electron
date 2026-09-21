import { materialIcon } from './icons.js';

let bound = false;

/** @type {ReturnType<typeof setTimeout> | null} */
let copyResetTimer = null;

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('share-dialog'));
}

/**
 * @param {string} url
 */
async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    const input = document.getElementById('share-dialog-url');
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
      try {
        return document.execCommand('copy');
      } catch {
        return false;
      }
    }
    return false;
  }
}

function resetCopyUi() {
  const btn = document.getElementById('share-dialog-copy');
  const hint = document.getElementById('share-dialog-hint');
  if (!btn || !hint) return;

  btn.classList.remove('share-dialog__copy--done');
  const label = btn.querySelector('.share-dialog__copy-label');
  const icon = btn.querySelector('.share-dialog__copy-icon');
  if (label) label.textContent = '复制链接';
  if (icon) icon.innerHTML = materialIcon('content_copy');
  hint.textContent = '可复制链接分享给好友';
}

/**
 * @param {boolean} success
 */
function setCopyState(success) {
  const btn = document.getElementById('share-dialog-copy');
  const hint = document.getElementById('share-dialog-hint');
  if (!btn || !hint) return;

  if (!success) {
    hint.textContent = '请手动选择链接后点击复制';
    return;
  }

  btn.classList.add('share-dialog__copy--done');
  const label = btn.querySelector('.share-dialog__copy-label');
  const icon = btn.querySelector('.share-dialog__copy-icon');
  if (label) label.textContent = '已复制';
  if (icon) icon.innerHTML = materialIcon('check');
  hint.textContent = '链接已复制到剪贴板';

  if (copyResetTimer) clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => resetCopyUi(), 2800);
}

/**
 * @param {{ url: string, title?: string, subtitle?: string }} options
 */
export function openShareDialog(options) {
  const dialog = getDialog();
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('share-dialog-url'));
  const titleEl = document.getElementById('share-dialog-title');
  const subtitleEl = document.getElementById('share-dialog-subtitle');
  const hint = document.getElementById('share-dialog-hint');
  if (!dialog || !input) return;

  const { url, title = '分享', subtitle = '复制链接分享给好友' } = options;
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  input.value = url;
  resetCopyUi();
  if (hint) hint.textContent = '正在复制到剪贴板…';

  if (dialog.open) dialog.close();
  dialog.showModal();

  void copyUrl(url).then((ok) => setCopyState(ok));
}

export function shareDialogHtml() {
  return `
    <dialog class="share-dialog app-no-drag" id="share-dialog" aria-labelledby="share-dialog-title">
      <div class="share-dialog__card">
        <header class="share-dialog__head">
          <div class="share-dialog__head-main">
            <h2 class="share-dialog__title" id="share-dialog-title">
              ${materialIcon('share', 'share-dialog__title-icon')}分享
            </h2>
            <p class="share-dialog__subtitle" id="share-dialog-subtitle">复制链接分享给好友</p>
          </div>
          <button type="button" class="share-dialog__close" id="share-dialog-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="share-dialog__body">
          <label class="share-dialog__field">
            <span class="share-dialog__field-label">链接</span>
            <div class="share-dialog__url-row">
              <input class="share-dialog__url" id="share-dialog-url" type="text" readonly />
              <button type="button" class="share-dialog__copy" id="share-dialog-copy">
                <span class="share-dialog__copy-icon">${materialIcon('content_copy')}</span>
                <span class="share-dialog__copy-label">复制链接</span>
              </button>
            </div>
          </label>
          <p class="share-dialog__hint" id="share-dialog-hint">可复制链接分享给好友</p>
        </div>
        <footer class="share-dialog__footer">
          <button type="button" class="share-dialog__done" id="share-dialog-done">完成</button>
        </footer>
      </div>
    </dialog>`;
}

export function bindShareDialog() {
  if (bound) return;
  bound = true;

  const dialog = getDialog();
  const copyBtn = document.getElementById('share-dialog-copy');
  const doneBtn = document.getElementById('share-dialog-done');
  const closeBtn = document.getElementById('share-dialog-close');
  const input = document.getElementById('share-dialog-url');

  const close = () => dialog?.close();

  closeBtn?.addEventListener('click', close);
  doneBtn?.addEventListener('click', close);
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog?.addEventListener('close', () => {
    if (copyResetTimer) {
      clearTimeout(copyResetTimer);
      copyResetTimer = null;
    }
  });

  copyBtn?.addEventListener('click', () => {
    const url = input instanceof HTMLInputElement ? input.value.trim() : '';
    if (!url) return;
    void copyUrl(url).then((ok) => setCopyState(ok));
  });

  input?.addEventListener('click', () => {
    if (input instanceof HTMLInputElement) input.select();
  });
}
