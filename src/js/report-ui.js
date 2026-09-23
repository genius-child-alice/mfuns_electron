import { materialIcon } from './icons.js';
import { notify } from './notice-ui.js';
import { requireLogin } from './login-ui.js';
import { uploadCommentImage } from './video-api.js';
import { REPORT_REASONS, submitReport } from './member-api.js';

/** @type {{ resourceId: number, resourceType: number, title?: string } | null} */
let pending = null;

/** @type {string[]} */
let selectedImages = [];

function dialogEl() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('report-dialog'));
}

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

function renderReasons() {
  const wrap = document.getElementById('report-reason-list');
  if (!wrap) return;
  wrap.innerHTML = REPORT_REASONS.map(
    (reason, index) => `
      <label class="report-reason">
        <input type="radio" name="report-reason" value="${escapeHtml(reason)}" ${index === 0 ? 'checked' : ''} />
        <span>${escapeHtml(reason)}</span>
      </label>`,
  ).join('');
}

function renderImages() {
  const wrap = document.getElementById('report-image-list');
  if (!wrap) return;
  if (selectedImages.length === 0) {
    wrap.innerHTML = '';
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = selectedImages
    .map(
      (src, index) => `
      <span class="report-image-item">
        <img src="${escapeHtml(src)}" alt="" />
        <button type="button" class="report-image-item__remove" data-report-image-remove="${index}" aria-label="移除">${materialIcon('close')}</button>
      </span>`,
    )
    .join('');
}

function closeDialog() {
  pending = null;
  selectedImages = [];
  const dialog = dialogEl();
  dialog?.close();
  renderImages();
  const extra = document.getElementById('report-extra');
  if (extra instanceof HTMLTextAreaElement) extra.value = '';
}

/**
 * @param {{ resourceId: number, resourceType: number, title?: string }} options
 */
export async function openReportDialog(options) {
  const { ensureFeatureBound } = await import('./lazy-page-bind.js');
  await ensureFeatureBound('report-dialog');

  if (!requireLogin()) return;
  pending = options;
  selectedImages = [];
  renderReasons();
  renderImages();
  const titleEl = document.getElementById('report-dialog-title');
  if (titleEl) {
    titleEl.textContent = options.title ? `举报 · ${options.title}` : '举报';
  }
  const dialog = dialogEl();
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
}

export function reportDialogHtml() {
  return `
    <dialog class="report-dialog app-no-drag" id="report-dialog" aria-labelledby="report-dialog-title">
      <div class="report-dialog__card">
        <header class="report-dialog__head">
          <h2 class="report-dialog__title" id="report-dialog-title">举报</h2>
          <button type="button" class="report-dialog__close" id="report-dialog-close" aria-label="关闭">${materialIcon('close')}</button>
        </header>
        <div class="report-dialog__body">
          <p class="report-dialog__hint">请选择举报原因，我们会尽快处理。</p>
          <div class="report-reason-list" id="report-reason-list"></div>
          <label class="report-dialog__field">
            <span class="report-dialog__label">补充说明（选填）</span>
            <textarea id="report-extra" class="report-dialog__textarea" rows="3" maxlength="500" placeholder="描述具体情况"></textarea>
          </label>
          <div class="report-dialog__images">
            <label class="btn-secondary report-dialog__upload">
              ${materialIcon('image')}
              <span>添加截图</span>
              <input type="file" id="report-image-input" accept="image/*" multiple hidden />
            </label>
            <div class="report-image-list" id="report-image-list" hidden></div>
          </div>
        </div>
        <footer class="report-dialog__foot">
          <button type="button" class="btn-secondary" id="report-dialog-cancel">取消</button>
          <button type="button" class="btn-accent" id="report-dialog-submit">提交举报</button>
        </footer>
      </div>
    </dialog>`;
}

export function bindReportDialog() {
  document.getElementById('report-dialog-close')?.addEventListener('click', closeDialog);
  document.getElementById('report-dialog-cancel')?.addEventListener('click', closeDialog);
  dialogEl()?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog();
  });

  document.getElementById('report-image-input')?.addEventListener('change', async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const files = input.files ? [...input.files] : [];
    input.value = '';
    if (files.length === 0) return;
    try {
      for (const file of files.slice(0, 3 - selectedImages.length)) {
        const path = await uploadCommentImage(file);
        selectedImages.push(path);
      }
      renderImages();
    } catch (err) {
      notify(err instanceof Error ? err.message : '图片上传失败', 'error');
    }
  });

  document.getElementById('report-image-list')?.addEventListener('click', (event) => {
    const btn = /** @type {HTMLElement} */ (event.target).closest('[data-report-image-remove]');
    if (!btn) return;
    const index = Number.parseInt(btn.getAttribute('data-report-image-remove') ?? '', 10);
    if (!Number.isFinite(index)) return;
    selectedImages.splice(index, 1);
    renderImages();
  });

  document.getElementById('report-dialog-submit')?.addEventListener('click', async () => {
    if (!pending) return;
    const checked = document.querySelector('input[name="report-reason"]:checked');
    const reason = checked instanceof HTMLInputElement ? checked.value : REPORT_REASONS[0];
    const extra = document.getElementById('report-extra');
    const detail = extra instanceof HTMLTextAreaElement ? extra.value.trim() : '';
    const fullReason = detail ? `${reason}：${detail}` : reason;
    const btn = document.getElementById('report-dialog-submit');
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    try {
      await submitReport({
        resourceId: pending.resourceId,
        resourceType: pending.resourceType,
        reason: fullReason,
        images: selectedImages,
      });
      notify('举报已提交');
      closeDialog();
    } catch (err) {
      notify(err instanceof Error ? err.message : '提交失败', 'error');
    } finally {
      if (btn instanceof HTMLButtonElement) btn.disabled = false;
    }
  });
}
