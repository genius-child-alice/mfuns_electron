import { materialIcon } from './icons.js';

/** @typedef {'tray' | 'quit' | 'cancel'} CloseAppChoice */

/** @type {((choice: CloseAppChoice) => void) | null} */
let pendingResolve = null;

let bound = false;

/**
 * @param {boolean} useTray
 * @returns {Promise<CloseAppChoice>}
 */
export function showCloseAppDialog(useTray) {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('close-app-dialog'));
  const actionsEl = document.getElementById('close-app-dialog-actions');
  if (!dialog || !actionsEl) {
    return Promise.resolve(window.confirm('确定要关闭主界面吗？') ? 'quit' : 'cancel');
  }

  actionsEl.innerHTML = useTray
    ? `
      <button type="button" class="close-app-dialog__btn close-app-dialog__btn--primary" data-close-choice="tray">
        ${materialIcon('minimize', 'close-app-dialog__btn-icon')}
        最小化到托盘
      </button>
      <button type="button" class="close-app-dialog__btn close-app-dialog__btn--danger" data-close-choice="quit">
        ${materialIcon('logout', 'close-app-dialog__btn-icon')}
        退出 Mfuns
      </button>
      <button type="button" class="close-app-dialog__btn close-app-dialog__btn--ghost" data-close-choice="cancel">取消</button>
    `
    : `
      <div class="close-app-dialog__row">
        <button type="button" class="close-app-dialog__btn close-app-dialog__btn--ghost close-app-dialog__btn--inline" data-close-choice="cancel">取消</button>
        <button type="button" class="close-app-dialog__btn close-app-dialog__btn--danger close-app-dialog__btn--inline" data-close-choice="quit">
          ${materialIcon('logout', 'close-app-dialog__btn-icon')}
          退出 Mfuns
        </button>
      </div>
    `;

  return new Promise((resolve) => {
    pendingResolve = resolve;
    if (dialog.open) dialog.close();
    dialog.showModal();
  });
}

/**
 * @param {CloseAppChoice} choice
 */
function finish(choice) {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('close-app-dialog'));
  if (dialog?.open) dialog.close();
  if (pendingResolve) {
    pendingResolve(choice);
    pendingResolve = null;
  }
}

export function bindCloseAppDialog() {
  if (bound) return;
  bound = true;

  const dialog = document.getElementById('close-app-dialog');
  const actionsEl = document.getElementById('close-app-dialog-actions');

  actionsEl?.addEventListener('click', (event) => {
    const btn = /** @type {HTMLElement} */ (event.target).closest('[data-close-choice]');
    if (!btn) return;
    const choice = btn.getAttribute('data-close-choice');
    if (choice === 'tray' || choice === 'quit' || choice === 'cancel') {
      finish(choice);
    }
  });

  dialog?.addEventListener('close', () => {
    if (pendingResolve) finish('cancel');
  });

  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) finish('cancel');
  });

  window.electronAPI?.window?.onClosePrompt?.(({ useTray }) => {
    void showCloseAppDialog(Boolean(useTray)).then((choice) => {
      window.electronAPI?.window?.closeChoice?.(choice);
    });
  });
}
