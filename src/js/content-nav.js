import { ensurePageBound } from './lazy-page-bind.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

/**
 * @param {ContentPreview} preview
 */
export async function openContentDetail(preview) {
  if (preview.type === 1) {
    await ensurePageBound('watch');
    const { openVideoDetail } = await import('./video-detail.js');
    return openVideoDetail(preview);
  }
  if (preview.type === 0) {
    await ensurePageBound('article');
    const { openArticleDetail } = await import('./article-detail.js');
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
    authorAvatarFrame: defaults.authorAvatarFrame ?? null,
    type: Number.isFinite(type) ? type : 1,
    views: defaults.views ?? 0,
    likes: defaults.likes ?? 0,
    comments: defaults.comments ?? 0,
    createdAt: defaults.createdAt ?? null,
  };
}
