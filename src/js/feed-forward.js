import { notify } from './notice-ui.js';
import { confirmAction } from './confirm-dialog.js';
import { materialIcon } from './icons.js';
import { mediaSrcForCover } from './content-api.js';
import { requireLogin } from './login-ui.js';
import { forwardFeed, feedForwardTypeLabel } from './feed-api.js';

/** @typedef {{ resourceId: number, resourceType: number, resourceTitle: string, resourceCover?: string }} FeedForwardContext */

/** @type {FeedForwardContext | null} */
let context = null;
let publishing = false;
let bound = false;

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('feed-forward-dialog'));
}

/**
 * @param {string | null | undefined} coverSrc
 * @param {number} resourceType
 */
function renderPreviewCover(coverSrc, resourceType) {
  if (coverSrc) {
    return `<img class="feed-forward-preview__cover" src="${escapeHtml(coverSrc)}" alt="" />`;
  }
  const icon =
    resourceType === 1 ? 'play_circle' : resourceType === 0 ? 'article' : 'dynamic_feed';
  return `<div class="feed-forward-preview__cover feed-forward-preview__cover--ph" aria-hidden="true">${materialIcon(icon)}</div>`;
}

function renderPreview() {
  const preview = document.getElementById('feed-forward-preview');
  if (!preview || !context) return;
  const title = context.resourceTitle.trim() || `未命名${feedForwardTypeLabel(context.resourceType)}`;
  const coverSrc = context.resourceCover ? mediaSrcForCover(context.resourceCover) : '';
  preview.innerHTML = `
    <div class="feed-forward-preview">
      ${renderPreviewCover(coverSrc, context.resourceType)}
      <div class="feed-forward-preview__body">
        <span class="feed-forward-preview__type">${escapeHtml(feedForwardTypeLabel(context.resourceType))}</span>
        <p class="feed-forward-preview__title">${escapeHtml(title)}</p>
      </div>
    </div>`;
}

async function submitForward() {
  if (!context || publishing) return;
  const input = document.getElementById('feed-forward-content');
  const content = input?.value.trim() ?? '';
  if (!content) {
    notify('说点什么吧', 'warning');
    return;
  }
  const confirmed = await confirmAction({
    title: '转发到动态',
    message: '确定将这条内容转发到动态吗？转发后将出现在全站时间线。',
    confirmText: '转发',
  });
  if (!confirmed) return;
  publishing = true;
  const btn = document.getElementById('feed-forward-submit');
  if (btn) btn.disabled = true;
  try {
    await forwardFeed({
      content,
      resourceId: context.resourceId,
      resourceType: context.resourceType,
    });
    getDialog()?.close();
    notify('已转发到动态', 'success');
  } catch (err) {
    notify(err instanceof Error ? err.message : '转发失败', 'error');
  } finally {
    publishing = false;
    if (btn) btn.disabled = false;
  }
}

/**
 * @param {FeedForwardContext} options
 */
export function openFeedForward(options) {
  if (!requireLogin()) return;
  context = options;
  const dialog = getDialog();
  const input = document.getElementById('feed-forward-content');
  if (input) input.value = '';
  renderPreview();
  dialog?.showModal();
}

export function bindFeedForward() {
  if (bound) return;
  bound = true;

  document.getElementById('feed-forward-close')?.addEventListener('click', () => {
    getDialog()?.close();
  });
  document.getElementById('feed-forward-cancel')?.addEventListener('click', () => {
    getDialog()?.close();
  });
  document.getElementById('feed-forward-submit')?.addEventListener('click', () => {
    void submitForward();
  });
  getDialog()?.addEventListener('cancel', (event) => {
    event.preventDefault();
    getDialog()?.close();
  });
}

export function feedForwardDialogHtml() {
  return `
    <dialog class="feed-forward app-no-drag" id="feed-forward-dialog" aria-labelledby="feed-forward-title">
      <div class="feed-forward__card">
        <header class="feed-forward__head">
          <h2 class="feed-forward__title" id="feed-forward-title">转发到动态</h2>
          <button type="button" class="feed-forward__close" id="feed-forward-close" aria-label="关闭">
            ${materialIcon('close')}
          </button>
        </header>
        <div class="feed-forward__body">
          <textarea id="feed-forward-content" class="feed-forward__input" rows="6" placeholder="说说转发理由…"></textarea>
          <div id="feed-forward-preview"></div>
          <p class="feed-forward__hint">转发后将出现在全站时间线</p>
        </div>
        <footer class="feed-forward__foot">
          <button type="button" class="feed-forward__btn" id="feed-forward-cancel">取消</button>
          <button type="button" class="btn-accent feed-forward__btn" id="feed-forward-submit">转发</button>
        </footer>
      </div>
    </dialog>`;
}
