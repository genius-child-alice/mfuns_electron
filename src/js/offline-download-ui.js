import { materialIcon } from './icons.js';
import { notify } from './notice-ui.js';
import { listOfflineQualityChoices } from './offline-cache-store.js';
import { fetchVideoPlayParts, qualityPickerLabel } from './video-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */
/** @typedef {import('./video-api.js').VideoPart} VideoPart */
/** @typedef {import('./video-api.js').VideoQuality} VideoQuality */

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

/** @type {{ choices: { quality: VideoQuality, downloadable: boolean }[], onChosen: ((q: VideoQuality) => void) | null } | null} */
let dialogContext = null;

let bound = false;

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('offline-download-dialog'));
}

function getOptionsEl() {
  return document.getElementById('offline-download-options');
}

function getSubtitleEl() {
  return document.getElementById('offline-download-subtitle');
}

function renderOptions() {
  const list = getOptionsEl();
  if (!list || !dialogContext) return;

  if (dialogContext.choices.length === 0) {
    list.innerHTML =
      '<p class="offline-download-dialog__empty">没有可用的清晰度</p>';
    return;
  }

  list.innerHTML = dialogContext.choices
    .map((entry, index) => {
      const label = escapeHtml(qualityPickerLabel(entry.quality));
      const hint = entry.downloadable
        ? 'MP4 可缓存'
        : 'HLS 流，仅在线播放';
      return `
        <button
          type="button"
          class="reward-dialog__option offline-download-dialog__option"
          data-offline-quality-index="${index}"
          role="listitem"
          ${entry.downloadable ? '' : 'disabled'}
        >
          <span class="reward-dialog__option-icon">${materialIcon(entry.downloadable ? 'download' : 'stream')}</span>
          <span class="reward-dialog__option-main">
            <span class="reward-dialog__option-label">${label}</span>
            <span class="offline-download-dialog__hint">${escapeHtml(hint)}</span>
          </span>
          ${entry.downloadable ? materialIcon('chevron_right', 'reward-dialog__option-chevron') : ''}
        </button>`;
    })
    .join('');
}

/**
 * @param {{
 *   preview: ContentPreview,
 *   partIndex?: number,
 *   parts?: VideoPart[],
 *   onChosen: (quality: VideoQuality) => void,
 * }} options
 */
export async function openOfflineDownloadDialog(options) {
  const { ensureFeatureBound } = await import('./lazy-page-bind.js');
  await ensureFeatureBound('offline-download-dialog');

  if (!window.electronAPI?.offline?.download) {
    notify('离线缓存仅支持桌面客户端', 'error');
    return;
  }

  const partIndex = options.partIndex ?? 0;
  let parts = options.parts;
  if (!parts?.length) {
    try {
      parts = await fetchVideoPlayParts(options.preview.id);
    } catch (err) {
      notify(err instanceof Error ? err.message : '获取清晰度失败', 'error');
      return;
    }
  }

  const part = parts[partIndex];
  if (!part) {
    notify('分 P 不存在', 'error');
    return;
  }

  const choices = listOfflineQualityChoices(part.qualities);
  if (!choices.some((c) => c.downloadable)) {
    notify('没有可缓存的 MP4 清晰度（HLS 流暂不支持离线下载）', 'error');
    return;
  }

  dialogContext = { choices, onChosen: options.onChosen };

  const subtitle = getSubtitleEl();
  if (subtitle) {
    const partHint =
      parts.length > 1 && part.title
        ? `当前分 P：${part.title} · `
        : '';
    subtitle.textContent = `${partHint}选择要缓存的分辨率`;
  }

  renderOptions();
  getDialog()?.showModal();
}

export function bindOfflineDownloadDialog() {
  if (bound) return;
  bound = true;

  const dialog = getDialog();
  document.getElementById('offline-download-close')?.addEventListener('click', () => dialog?.close());
  document.getElementById('offline-download-cancel')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog?.addEventListener('close', () => {
    dialogContext = null;
    const list = getOptionsEl();
    if (list) list.innerHTML = '';
  });

  getOptionsEl()?.addEventListener('click', (event) => {
    const btn = /** @type {HTMLElement} */ (event.target).closest('[data-offline-quality-index]');
    if (!(btn instanceof HTMLButtonElement) || btn.disabled || !dialogContext) return;
    const index = Number.parseInt(btn.getAttribute('data-offline-quality-index') ?? '', 10);
    const entry = dialogContext.choices[index];
    if (!entry?.downloadable) return;
    const onChosen = dialogContext.onChosen;
    dialogContext = null;
    dialog?.close();
    onChosen?.(entry.quality);
  });
}
