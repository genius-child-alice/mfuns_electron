import { apiGet, parsePreviewList } from './content-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

const TAG_PAGE_SIZE = 20;

/** @typedef {{ items: ContentPreview[], lastId: number | null, hasMore: boolean }} TagListPage */

/**
 * @param {ContentPreview | null | undefined} item
 */
function lastItemId(item) {
  if (!item) return null;
  const parsed = Number.parseInt(item.id, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {ContentPreview[]} items
 */
function pageMeta(items) {
  const lastId = lastItemId(items[items.length - 1]);
  return {
    items,
    lastId,
    hasMore: items.length >= TAG_PAGE_SIZE,
  };
}

/**
 * @param {string} tag
 * @param {number | null} [lastId]
 * @returns {Promise<TagListPage>}
 */
export async function fetchTagArticles(tag, lastId = null) {
  const name = `${tag ?? ''}`.trim();
  if (!name) return { items: [], lastId: null, hasMore: false };

  /** @type {Record<string, string | number>} */
  const query = { tag: name };
  if (lastId != null && lastId > 0) query.last_id = lastId;

  const data = await apiGet('/v1/tag/article_list', query);
  const items = parsePreviewList(data).map((item) => ({ ...item, type: 0 }));
  return pageMeta(items);
}

/**
 * @param {string} tag
 * @param {number | null} [lastId]
 * @returns {Promise<TagListPage>}
 */
export async function fetchTagVideos(tag, lastId = null) {
  const name = `${tag ?? ''}`.trim();
  if (!name) return { items: [], lastId: null, hasMore: false };

  /** @type {Record<string, string | number>} */
  const query = { tag: name };
  if (lastId != null && lastId > 0) query.last_id = lastId;

  const data = await apiGet('/v1/tag/video_list', query);
  const items = parsePreviewList(data).map((item) => ({ ...item, type: 1 }));
  return pageMeta(items);
}

/**
 * @param {string | null | undefined} createdAt
 */
function createdAtMs(createdAt) {
  if (createdAt == null || createdAt === '') return 0;
  const date = new Date(createdAt);
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * @param {ContentPreview[]} articles
 * @param {ContentPreview[]} videos
 * @returns {ContentPreview[]}
 */
export function mergeTagItemsByLatest(articles, videos) {
  return [...articles, ...videos].sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt));
}
