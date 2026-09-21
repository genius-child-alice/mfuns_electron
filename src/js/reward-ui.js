import { notify } from './notice-ui.js';
import { requireLogin } from './login-ui.js';
import { rewardResource } from './video-api.js';

/** @type {{ resourceId: number, resourceType: number, onSuccess?: (count: number) => void } | null} */
let rewardContext = null;

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('reward-dialog'));
}

function setDialogLoading(loading) {
  getDialog()?.classList.toggle('reward-dialog--loading', loading);
}

/**
 * @param {{ resourceId: number | string, resourceType: 0 | 1, onSuccess?: (count: number) => void }} options
 */
export function openRewardDialog(options) {
  if (!requireLogin()) return;
  const resourceId = Number(options.resourceId);
  if (!Number.isFinite(resourceId) || resourceId <= 0) return;

  rewardContext = {
    resourceId,
    resourceType: options.resourceType,
    onSuccess: options.onSuccess,
  };
  const subtitle = document.getElementById('reward-dialog-subtitle');
  if (subtitle) {
    subtitle.textContent =
      options.resourceType === 1 ? '为你喜欢的视频投币吧！' : '为你喜欢的文章投币吧！';
  }
  getDialog()?.showModal();
}

async function submitReward(count) {
  if (!rewardContext) return;
  setDialogLoading(true);
  try {
    const onSuccess = rewardContext.onSuccess;
    const message = await rewardResource(
      rewardContext.resourceId,
      rewardContext.resourceType,
      count,
    );
    rewardContext = null;
    getDialog()?.close();
    onSuccess?.(count);
    notify(message?.trim() ? message : '投币成功', 'success');
  } catch (err) {
    notify(err instanceof Error ? err.message : '投币失败', 'error');
  } finally {
    setDialogLoading(false);
  }
}

export function bindRewardDialog() {
  const dialog = getDialog();
  document.getElementById('reward-dialog-close')?.addEventListener('click', () => dialog?.close());
  document.getElementById('reward-dialog-cancel')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog?.addEventListener('close', () => {
    rewardContext = null;
    setDialogLoading(false);
  });

  document.querySelectorAll('[data-reward-count]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const count = Number(btn.getAttribute('data-reward-count'));
      if (!Number.isFinite(count) || count < 1) return;
      void submitReward(count);
    });
  });
}
