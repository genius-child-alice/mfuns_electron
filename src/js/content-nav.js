import { openArticleDetail } from './article-detail.js';
import { openVideoDetail } from './video-detail.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

/**
 * @param {ContentPreview} preview
 */
export function openContentDetail(preview) {
  if (preview.type === 1) {
    return openVideoDetail(preview);
  }
  if (preview.type === 0) {
    return openArticleDetail(preview);
  }
}

/**
 * @param {HTMLElement} card
 * @param {Partial<ContentPreview>} [defaults]
 * @returns {ContentPreview | null}
 */
export function previewFromCard(card, defaults = {}) {
  const id = card.getAttribute('data-content-id');
  if (!id) return null;
  const type = Number(card.getAttribute('data-content-type'));
  const titleEl =
    card.querySelector('.video-card__title') ||
    card.querySelector('.mine-history-card__title') ||
    card.querySelector('.user-space__article-title');
  const authorEl =
    card.querySelector('.video-card__sub span') ||
    card.querySelector('.mine-history-card__up-name');
  return {
    id,
    title: titleEl?.textContent?.trim() || defaults.title || '未命名内容',
    cover: defaults.cover ?? null,
    author: authorEl?.textContent?.trim() || defaults.author || '',
    authorId: defaults.authorId ?? null,
    authorAvatar: defaults.authorAvatar ?? null,
    type: Number.isFinite(type) ? type : 1,
    views: defaults.views ?? 0,
    comments: defaults.comments ?? 0,
    createdAt: defaults.createdAt ?? null,
  };
}
