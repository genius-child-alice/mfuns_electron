import {
  apiGet,
  apiPostJson,
  parseContentPreview,
  parsePreviewList,
  resolveCoverUrl,
} from './content-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

/** @typedef {{ part: number, partIndex: number, title: string, qualities: VideoQuality[] }} VideoPart */

/** @typedef {{ part: number, name: string, label: string, url: string }} VideoQuality */

/** @typedef {{
 *   preview: ContentPreview,
 *   description: string,
 *   tags: string[],
 *   commentAreaId: number | null,
 *   authorId: number | null,
 *   authorAvatar: string | null,
 *   likes: number,
 * }} VideoDetail */

/** @typedef {{
 *   id: number,
 *   authorName: string,
 *   avatar: string | null,
 *   content: string,
 *   likes: number,
 *   liked: boolean,
 *   replyCount: number,
 *   createdAt: string | null,
 * }} CommunityComment */

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
 * @param {unknown} raw
 */
function commentPlainText(raw) {
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (!text.startsWith('[')) return text;
  try {
    const ops = JSON.parse(text);
    if (!Array.isArray(ops)) return text;
    return ops
      .map((op) => (op && typeof op.insert === 'string' ? op.insert : ''))
      .join('')
      .trim();
  } catch {
    return text;
  }
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
 * @returns {VideoDetail}
 */
function parseVideoDetail(seed, data) {
  const root = asMap(data);
  const resource = root;
  const user =
    asMap(root.user).id != null || asMap(root.user).name
      ? asMap(root.user)
      : asMap(resource.user);
  const like = asMap(asMap(root.like_status).like);

  const mergedRaw = { ...root, resource_info: resource };
  const parsed = parseContentPreview(mergedRaw);
  const preview = parsed
    ? {
        ...seed,
        ...parsed,
        title: parsed.title || seed.title,
        cover: parsed.cover || seed.cover,
      }
    : seed;

  const authorId = asInt(user.id ?? user.user_id ?? root.user_id);
  const avatarRaw = user.avatar ?? user.face;
  const likes = asInt(like.count) ?? asInt(resource.like_count ?? root.like_count) ?? 0;

  return {
    preview: {
      ...preview,
      comments: detailCommentCount(root, resource),
      views: asInt(root.view_count ?? resource.view_count) ?? preview.views,
    },
    description: commentPlainText(resource.content ?? resource.summary ?? root.content ?? ''),
    tags: [
      ...parseTags(root.tags),
      ...parseTags(resource.tags ?? resource.tag),
    ],
    commentAreaId:
      asInt(resource.comment_area_id ?? root.comment_area_id ?? root.commentId) ?? null,
    authorId,
    authorAvatar: resolveCoverUrl(avatarRaw),
    likes,
  };
}

/**
 * @param {unknown} data
 * @returns {VideoPart[]}
 */
function parseVideoParts(data) {
  const root = asMap(data);
  const parts = root.videos;
  if (!Array.isArray(parts)) return [];

  /** @type {VideoPart[]} */
  const result = [];
  parts.forEach((rawPart, index) => {
    const part = asMap(rawPart);
    const sources = part.video_url;
    if (!Array.isArray(sources)) return;
    /** @type {VideoQuality[]} */
    const qualities = [];
    sources.forEach((source) => {
      const item = asMap(source);
      const url = `${item.url ?? ''}`.trim();
      if (!url) return;
      qualities.push({
        part: index + 1,
        name: `${item.name ?? '默认清晰度'}`,
        label: `${item.label ?? ''}`,
        url,
      });
    });
    if (qualities.length === 0) return;
    result.push({
      part: index + 1,
      partIndex: index,
      title: `${part.title ?? part.name ?? `P${index + 1}`}`,
      qualities,
    });
  });
  return result;
}

/**
 * @param {unknown} raw
 * @returns {CommunityComment | null}
 */
function parseComment(raw) {
  const json = asMap(raw);
  const id = asInt(json.id);
  if (id == null || id === 0) return null;
  const user =
    asMap(json.user).id != null ? asMap(json.user) : asMap(json.user_info);
  const like = asMap(asMap(json.like_status).like);
  return {
    id,
    authorName:
      `${user.name ?? user.username ?? user.nickname ?? json.user_name ?? json.nickname ?? '用户'}`.trim(),
    avatar: resolveCoverUrl(user.avatar ?? user.face ?? json.avatar),
    content: commentPlainText(json.content),
    likes: asInt(like.count ?? json.like_count) ?? 0,
    liked: like.is_active === true || like.is_active === 1,
    replyCount: asInt(json.reply_count) ?? 0,
    createdAt: typeof json.created_at === 'string' ? json.created_at : null,
  };
}

/**
 * @param {unknown} data
 * @returns {CommunityComment[]}
 */
function parseCommentList(data) {
  const list = Array.isArray(data) ? data : asMap(data).list;
  if (!Array.isArray(list)) return [];
  return list.map((item) => parseComment(item)).filter((item) => item != null);
}

/**
 * @param {ContentPreview} preview
 */
export async function fetchVideoDetail(preview) {
  const data = await apiGet('/v1/video/get', { id: preview.id, html: 1 });
  return parseVideoDetail(preview, data);
}

/**
 * @param {string | number} videoId
 */
export async function fetchVideoPlayParts(videoId) {
  const data = await apiGet('/v1/video/getPlayAddress', { id: videoId });
  return parseVideoParts(data);
}

/**
 * @param {number} areaId
 * @param {number} [page]
 */
export async function fetchCommentList(areaId, page = 1) {
  const data = await apiGet('/v1/comment/list', {
    area_id: areaId,
    page,
    order: 'desc',
    html: 0,
  });
  return parseCommentList(data);
}

/**
 * @param {ContentPreview} preview
 */
export async function fetchRelatedVideos(preview) {
  const data = await apiGet('/v1/recommend/related', {
    resource_id: preview.id,
    resource_type: preview.type,
    type: preview.type,
    size: 8,
  });
  return parsePreviewList(data).filter((item) => item.id !== preview.id);
}

/**
 * @param {number} resourceId
 * @param {number} [resourceType]
 */
export async function fetchLikeStatus(resourceId, resourceType = 1) {
  const data = await apiGet('/v1/like/status', { id: resourceId, type: resourceType });
  const status = asMap(data).status ?? data;
  const like = asMap(asMap(status).like);
  return {
    liked: like.is_active === true || like.is_active === 1,
    likes: asInt(like.count) ?? 0,
  };
}

/**
 * @param {number} resourceId
 * @param {boolean} like
 * @param {number} [resourceType]
 */
export async function setResourceLike(resourceId, like, resourceType = 1) {
  await apiPostJson(like ? '/v1/like/like' : '/v1/like/cancel', {
    id: resourceId,
    type: resourceType,
  });
}

/**
 * @param {number} userId
 */
export async function fetchFollowStatus(userId) {
  const data = await apiGet('/v1/follow/status', { user_id: userId });
  const status = asMap(data).status;
  return status === true || status === 1 || status === '1';
}

/**
 * @param {number} userId
 * @param {boolean} follow
 */
export async function setFollow(userId, follow) {
  await apiPostJson('/v1/follow/follow', {
    user_id: userId,
    ...(follow ? {} : { unfollow: 1 }),
  });
}

/**
 * @param {number} areaId
 * @param {string} text
 */
export async function createComment(areaId, text) {
  const content = JSON.stringify([{ insert: `${text.trim()}\n` }]);
  await apiPostJson('/v1/comment/create', {
    area_id: areaId,
    content,
    images: '[]',
    html: 1,
  });
}

/**
 * @param {VideoPart[]} parts
 */
export function pickDefaultQuality(parts, partIndex = 0) {
  const part = parts[partIndex];
  if (!part || part.qualities.length === 0) return null;
  return part.qualities[part.qualities.length - 1];
}
