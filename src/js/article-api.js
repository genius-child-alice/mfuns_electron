import {
  apiGet,
  parseContentPreview,
  resolveCoverUrl,
} from './content-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

/** @typedef {{
 *   preview: ContentPreview,
 *   rawContent: string,
 *   tags: string[],
 *   commentAreaId: number | null,
 *   authorId: number | null,
 *   authorAvatar: string | null,
 *   likes: number,
 *   rewardCount: number,
 *   favoriteCount: number,
 *   publishedAt: string | null,
 * }} ArticleDetail */

/**
 * @param {unknown} value
 */
function asMap(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @param {unknown} value
 */
function asInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const n = Number.parseInt(`${value ?? ''}`, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {...unknown} candidates
 * @returns {string | null}
 */
function parsePublishTime(...candidates) {
  for (const value of candidates) {
    if (value == null || value === '') continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ms = value < 1e12 ? value * 1000 : value;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

/**
 * @param {unknown} root
 * @param {unknown} resource
 */
function detailCommentCount(root, resource) {
  const r = asMap(root);
  const res = asMap(resource);
  let count = asInt(r.comment_count ?? res.comment_count);
  if (count != null) return count;
  const comments = asMap(r.comments);
  count = asInt(comments.floor_count ?? comments.floor_num);
  if (count != null) return count;
  return asInt(r.floor_num ?? res.floor_num) ?? 0;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((t) => `${t}`.trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

/**
 * @param {ContentPreview} seed
 * @param {unknown} data
 * @returns {ArticleDetail}
 */
function parseArticleDetail(seed, data) {
  const root = asMap(data);
  const article = asMap(root.article);
  const resource = article.id != null || article.resource_id != null ? article : root;
  const user =
    asMap(root.user).id != null || asMap(root.user).name
      ? asMap(root.user)
      : asMap(resource.user);
  const like = asMap(asMap(root.like_status).like);
  const category = asMap(resource.category ?? root.category);

  const mergedRaw = { ...root, ...resource, resource_info: resource };
  const parsed = parseContentPreview(mergedRaw);
  const preview = parsed
    ? {
        ...seed,
        ...parsed,
        type: 0,
        title: parsed.title || seed.title,
        cover: parsed.cover || seed.cover,
      }
    : { ...seed, type: 0 };

  const authorId = asInt(user.id ?? user.user_id ?? root.user_id);
  const likes = asInt(like.count) ?? asInt(resource.like_count ?? root.like_count) ?? 0;
  const rawContent = `${resource.content ?? resource.summary ?? root.content ?? ''}`;
  const publishedAt = parsePublishTime(
    resource.created_at,
    resource.publish_time,
    resource.published_at,
    resource.time,
    root.created_at,
    root.time,
    preview.createdAt,
  );

  return {
    preview: {
      ...preview,
      author: preview.author || `${user.name ?? user.username ?? ''}` || seed.author,
      comments: detailCommentCount(root, resource),
      views: asInt(root.view_count ?? resource.view_count) ?? preview.views,
      createdAt: publishedAt ?? preview.createdAt,
    },
    rawContent,
    tags: [
      ...new Set([
        ...parseTags(root.tags),
        ...parseTags(root.tag),
        ...parseTags(resource.tags ?? resource.tag),
        ...(category.name ? [`${category.name}`] : []),
      ]),
    ],
    commentAreaId:
      asInt(resource.comment_area_id ?? root.comment_area_id ?? root.commentId) ?? null,
    authorId,
    authorAvatar: resolveCoverUrl(user.avatar ?? user.face),
    likes,
    rewardCount: asInt(root.reward_count) ?? 0,
    favoriteCount: asInt(root.favorite_count) ?? 0,
    publishedAt: publishedAt ?? null,
  };
}

/**
 * @param {ContentPreview} preview
 */
export async function fetchArticleDetail(preview) {
  const data = await apiGet('/v1/article/get', { id: preview.id, html: 1 });
  return parseArticleDetail(preview, data);
}
