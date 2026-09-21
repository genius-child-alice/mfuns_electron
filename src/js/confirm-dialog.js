/** @typedef {{ title?: string, message: string, confirmText?: string, cancelText?: string, variant?: 'default' | 'danger' }} ConfirmOptions */

/** @type {((value: boolean) => void) | null} */
let pendingResolve = null;

let bound = false;

/**
 * @param {ConfirmOptions} options
 * @returns {Promise<boolean>}
 */
export function confirmAction(options) {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('confirm-dialog'));
  const titleEl = document.getElementById('confirm-dialog-title');
  const messageEl = document.getElementById('confirm-dialog-message');
  const confirmBtn = document.getElementById('confirm-dialog-confirm');
  const cancelBtn = document.getElementById('confirm-dialog-cancel');
  if (!dialog || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(options.message));
  }

  const {
    title = '请确认',
    message,
    confirmText = '确定',
    cancelText = '取消',
    variant = 'default',
  } = options;

  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  confirmBtn.classList.toggle('confirm-dialog__confirm--danger', variant === 'danger');
  dialog.dataset.variant = variant;

  return new Promise((resolve) => {
    pendingResolve = resolve;
    if (dialog.open) dialog.close();
    dialog.showModal();
  });
}

function finish(result) {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('confirm-dialog'));
  if (dialog?.open) dialog.close();
  if (pendingResolve) {
    pendingResolve(result);
    pendingResolve = null;
  }
}

export function bindConfirmDialog() {
  if (bound) return;
  bound = true;

  const dialog = document.getElementById('confirm-dialog');
  const confirmBtn = document.getElementById('confirm-dialog-confirm');
  const cancelBtn = document.getElementById('confirm-dialog-cancel');

  confirmBtn?.addEventListener('click', () => finish(true));
  cancelBtn?.addEventListener('click', () => finish(false));
  dialog?.addEventListener('close', () => {
    if (pendingResolve) finish(false);
  });
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) finish(false);
  });
  dialog?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    const active = document.activeElement;
    if (active === cancelBtn) return;
    event.preventDefault();
    finish(true);
  });
}
