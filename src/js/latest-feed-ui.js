import { materialIcon } from './icons.js';
import { renderFramedAvatarHtml } from './avatar-frame-ui.js';
import { latestItemToContentPreview } from './latest-mfuns-api.js';

/** @typedef {import('./latest-mfuns-api.js').LatestMfunsItem} LatestMfunsItem */

/**
 * @param {string} html
 */
function stripHtml(html) {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();
  return text;
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

/**
 * @param {LatestMfunsItem} item
 */
function typeLabel(item) {
  if (item.type === 'video') return '视频';
  if (item.type === 'article') return '文章';
  return '动态';
}

/**
 * @param {LatestMfunsItem} item
 */
export function renderLatestFeedCard(item) {
  const excerpt = stripHtml(item.content);
  const headline = item.title.trim() || excerpt;
  const preview = latestItemToContentPreview(item);
  const cover = item.cover
    ? `<img class="latest-feed-card__cover" src="${escapeHtml(item.cover)}" alt="" loading="lazy" decoding="async" />`
    : '';
  const category = item.category
    ? `<span class="latest-feed-card__category">${escapeHtml(item.category)}</span>`
    : '';

  return `
    <article
      class="latest-feed-card"
      data-latest-stable-id="${escapeHtml(item.stableId)}"
      data-latest-type="${escapeHtml(item.type)}"
      data-latest-id="${item.id}"
      data-content-id="${escapeHtml(preview.id)}"
      data-content-type="${preview.type}"
    >
      <header class="latest-feed-card__head">
        <button type="button" class="latest-feed-card__author" data-latest-author-id="${item.authorId ?? ''}">
          ${renderFramedAvatarHtml({
            avatar: item.authorAvatar,
            frame: null,
            size: 'nav',
            imgClass: 'latest-feed-card__avatar',
            phClass: 'latest-feed-card__avatar--ph',
          })}
          <span class="latest-feed-card__author-name">${escapeHtml(item.author || 'Mfuns 用户')}</span>
        </button>
        <span class="latest-feed-card__type">${escapeHtml(typeLabel(item))}</span>
      </header>
      <div class="latest-feed-card__body">
        <h3 class="latest-feed-card__title">${escapeHtml(headline)}</h3>
        ${excerpt && excerpt !== headline ? `<p class="latest-feed-card__excerpt">${escapeHtml(excerpt)}</p>` : ''}
        ${cover}
        <div class="latest-feed-card__meta">
          ${category}
          <span class="latest-feed-card__stat">${materialIcon('thumb_up', 'latest-feed-card__stat-icon')}${item.likes}</span>
          <span class="latest-feed-card__stat">${materialIcon('chat_bubble', 'latest-feed-card__stat-icon')}${item.comments}</span>
          <span class="latest-feed-card__stat">${materialIcon('visibility', 'latest-feed-card__stat-icon')}${item.views}</span>
        </div>
      </div>
    </article>`;
}

/**
 * @param {LatestMfunsItem[]} items
 */
export function renderLatestFeedListHtml(items) {
  if (items.length === 0) return '';
  return `<div class="user-space__list user-space__list--feed latest-feed-list">${items
    .map((item) => renderLatestFeedCard(item))
    .join('')}</div>`;
}
