import { materialIcon } from './icons.js';

/** @typedef {{
 *   title?: string,
 *   label?: string,
 *   defaultValue?: string,
 *   placeholder?: string,
 *   confirmText?: string,
 *   cancelText?: string,
 *   maxLength?: number,
 * }} PromptOptions */

/** @type {((value: string | null) => void) | null} */
let pendingResolve = null;

let bound = false;

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('prompt-dialog'));
}

function finish(value) {
  const dialog = getDialog();
  if (dialog?.open) dialog.close();
  if (pendingResolve) {
    pendingResolve(value);
    pendingResolve = null;
  }
}

/**
 * @param {PromptOptions} options
 * @returns {Promise<string | null>}
 */
export function promptInput(options) {
  const dialog = getDialog();
  const titleEl = document.getElementById('prompt-dialog-title');
  const labelEl = document.getElementById('prompt-dialog-label');
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('prompt-dialog-input'));
  const confirmBtn = document.getElementById('prompt-dialog-confirm');
  const cancelBtn = document.getElementById('prompt-dialog-cancel');
  if (!dialog || !titleEl || !labelEl || !input || !confirmBtn || !cancelBtn) {
    const fallback = window.prompt(options.label ?? options.title ?? '请输入', options.defaultValue ?? '');
    return Promise.resolve(fallback?.trim() ? fallback.trim() : null);
  }

  const {
    title = '请输入',
    label = '内容',
    defaultValue = '',
    placeholder = '',
    confirmText = '确定',
    cancelText = '取消',
    maxLength = 200,
  } = options;

  titleEl.textContent = title;
  labelEl.textContent = label;
  input.value = defaultValue;
  input.placeholder = placeholder;
  input.maxLength = maxLength;
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;

  return new Promise((resolve) => {
    pendingResolve = resolve;
    if (dialog.open) dialog.close();
    dialog.showModal();
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

export function promptDialogHtml() {
  return `
    <dialog class="prompt-dialog app-no-drag" id="prompt-dialog" aria-labelledby="prompt-dialog-title">
      <form class="prompt-dialog__card" id="prompt-dialog-form" method="dialog">
        <header class="prompt-dialog__head">
          <h2 class="prompt-dialog__title" id="prompt-dialog-title">请输入</h2>
          <button type="button" class="prompt-dialog__close" id="prompt-dialog-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="prompt-dialog__body">
          <label class="prompt-dialog__field" for="prompt-dialog-input">
            <span class="prompt-dialog__label" id="prompt-dialog-label">内容</span>
            <input class="prompt-dialog__input" id="prompt-dialog-input" name="value" type="text" autocomplete="off" />
          </label>
        </div>
        <footer class="prompt-dialog__actions">
          <button type="button" class="prompt-dialog__cancel" id="prompt-dialog-cancel">取消</button>
          <button type="submit" class="prompt-dialog__confirm" id="prompt-dialog-confirm">确定</button>
        </footer>
      </form>
    </dialog>`;
}

export function bindPromptDialog() {
  if (bound) return;
  bound = true;

  const dialog = getDialog();
  const form = document.getElementById('prompt-dialog-form');
  const input = document.getElementById('prompt-dialog-input');
  const cancelBtn = document.getElementById('prompt-dialog-cancel');
  const closeBtn = document.getElementById('prompt-dialog-close');

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input instanceof HTMLInputElement ? input.value.trim() : '';
    finish(value || null);
  });

  cancelBtn?.addEventListener('click', () => finish(null));
  closeBtn?.addEventListener('click', () => finish(null));
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) finish(null);
  });
  dialog?.addEventListener('close', () => {
    if (pendingResolve) finish(null);
  });
}
