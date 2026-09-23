import { materialIcon } from './icons.js';

let bound = false;

/** @type {HTMLDialogElement | null} */
let viewerEl = null;

/** @type {HTMLImageElement | null} */
let viewerImg = null;

function ensureViewerDom() {
  if (viewerEl) return;

  const root = document.createElement('dialog');
  root.id = 'image-viewer';
  root.className = 'image-viewer app-no-drag';
  root.setAttribute('aria-label', '图片查看');
  root.innerHTML = `
    <button type="button" class="image-viewer__close" data-image-viewer-close aria-label="关闭">
      ${materialIcon('close', 'image-viewer__close-icon')}
    </button>
    <div class="image-viewer__stage">
      <img class="image-viewer__img" alt="" decoding="async" />
    </div>`;

  document.body.appendChild(root);
  viewerEl = root;
  viewerImg = root.querySelector('.image-viewer__img');

  root.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('.image-viewer__img')) return;
    if (
      target.closest('[data-image-viewer-close]') ||
      target === root ||
      target.closest('.image-viewer__stage')
    ) {
      event.preventDefault();
      closeImageViewer();
    }
  });

  root.addEventListener('close', () => {
    document.body.classList.remove('image-viewer-open');
    if (viewerImg) {
      viewerImg.removeAttribute('src');
      viewerImg.alt = '';
    }
  });
}

/**
 * @param {HTMLImageElement} img
 */
function isExcludedImage(img) {
  if (img.closest('#image-viewer')) return true;
  if (img.closest('[data-no-image-viewer]')) return true;
  if (img.dataset.noImageViewer !== undefined) return true;
  if (img.hasAttribute('data-sticker-key') || img.classList.contains('mention-sticker')) return true;
  if (img.classList.contains('markdown-body__sticker')) return true;

  if (img.classList.contains('sidebar__avatar-img')) return true;
  if (img.classList.contains('splash__logo')) return true;
  if (img.classList.contains('guest-empty__img')) return true;
  if (img.classList.contains('video-card__cover-img')) return true;
  if (img.classList.contains('watch-related__thumb')) return true;
  if (img.classList.contains('user-space__feed-video__cover')) return true;

  if (/\bavatar\b/i.test(img.className)) return true;
  if (/\bcover\b/i.test(img.className) || /\bthumb\b/i.test(img.className)) return true;

  const excludedHost = img.closest(
    '[class*="avatar"], .sidebar__avatar, .mine-profile__avatar, .guest-empty__art, .splash, .video-card__cover-wrap, .mine-history-card__cover, .comment-composer__emoji-panel, .comment-composer__sticker, .message-sticker-panel, .message-sticker, .mention-visual-input',
  );
  return Boolean(excludedHost);
}

/**
 * @param {HTMLImageElement} img
 * @returns {string | null}
 */
function resolveViewerImageUrl(img) {
  const origin = img.getAttribute('src-origin') ?? img.dataset.originSrc ?? '';
  if (origin.trim()) return origin.trim();

  const src = img.currentSrc || img.src || '';
  if (!src || src.startsWith('data:')) return src || null;

  try {
    const url = new URL(src, window.location.href);
    if (url.searchParams.has('image_process')) {
      url.searchParams.delete('image_process');
      return url.toString();
    }
    return url.toString();
  } catch {
    return src;
  }
}

/**
 * @param {HTMLImageElement} img
 */
export async function openImageViewer(img) {
  const { ensureFeatureBound } = await import('./lazy-page-bind.js');
  await ensureFeatureBound('image-viewer');

  ensureViewerDom();
  if (!viewerEl || !viewerImg) return;

  const url = resolveViewerImageUrl(img);
  if (!url) return;

  viewerImg.src = url;
  viewerImg.alt = img.alt || '图片';
  if (!viewerEl.open) {
    viewerEl.showModal();
  }
  document.body.classList.add('image-viewer-open');
  viewerEl.querySelector('.image-viewer__close')?.focus();
}

export function closeImageViewer() {
  if (!viewerEl?.open) return;
  viewerEl.close();
}

/**
 * @param {MouseEvent} event
 */
function onDocumentClick(event) {
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;

  const target = /** @type {HTMLElement} */ (event.target);
  const img = target.closest('img');
  if (!(img instanceof HTMLImageElement)) return;
  if (isExcludedImage(img)) return;

  const url = resolveViewerImageUrl(img);
  if (!url) return;

  event.preventDefault();
  event.stopPropagation();
  openImageViewer(img);
}

export function bindImageViewer() {
  ensureViewerDom();
  if (bound) return;
  bound = true;
  document.addEventListener('click', onDocumentClick, true);
}
