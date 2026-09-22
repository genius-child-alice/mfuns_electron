import { parseUserBadgeIds } from './badge-catalog.js';
import { API_BASE, loadSession } from './auth.js';
import { loadAppSettings } from './app-preferences.js';
import {
  apiGet,
  apiPostJson,
  parseContentPreview,
  parsePreviewList,
  resolveCoverUrl,
} from './content-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

/** @typedef {{ part: number, partIndex: number, title: string, qualities: VideoQuality[] }} VideoPart */

/** @typedef {{
 *   part: number,
 *   name: string,
 *   label: string,
 *   url: string,
 *   format?: string,
 *   needLogin?: boolean,
 *   needPremium?: boolean,
 * }} VideoQuality */

/** @typedef {{
 *   preview: ContentPreview,
 *   description: string,
 *   rawDescription: string,
 *   tags: string[],
 *   commentAreaId: number | null,
 *   authorId: number | null,
 *   authorAvatar: string | null,
 *   likes: number,
 *   rewardCount: number,
 *   favoriteCount: number,
 *   danmakuCount: number,
 *   publishedAt: string | null,
 *   copyright: number | null,
 *   seriesId: number | null,
 *   seriesOrder: number | null,
 * }} VideoDetail */

/** @typedef {{
 *   id: number,
 *   authorId: number | null,
 *   authorName: string,
 *   avatar: string | null,
 *   content: string,
 *   rawContent: string,
 *   likes: number,
 *   liked: boolean,
 *   dislikes: number,
 *   disliked: boolean,
 *   replyCount: number,
 *   floorNum: number | null,
 *   badges: number[],
 *   createdAt: number | string | null,
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
 * @param {number | null | undefined} copyright
 * @returns {string | null}
 */
export function formatVideoCopyrightLabel(copyright) {
  if (copyright == null) return null;
  switch (copyright) {
    case 2:
      return '原创';
    case 1:
      return '转载';
    case 0:
      return '其他';
    default:
      return null;
  }
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

  const rawDescription = `${resource.content ?? resource.summary ?? root.content ?? ''}`;
  const publishedAt = parsePublishTime(
    resource.created_at,
    resource.publish_time,
    resource.published_at,
    resource.pub_time,
    resource.time,
    root.created_at,
    root.publish_time,
    root.published_at,
    root.time,
    preview.createdAt,
  );

  return {
    preview: {
      ...preview,
      comments: detailCommentCount(root, resource),
      views: asInt(root.view_count ?? resource.view_count) ?? preview.views,
      createdAt: publishedAt ?? preview.createdAt,
    },
    description: commentPlainText(rawDescription),
    rawDescription,
    tags: [
      ...parseTags(root.tags),
      ...parseTags(resource.tags ?? resource.tag),
    ],
    commentAreaId:
      asInt(resource.comment_area_id ?? root.comment_area_id ?? root.commentId) ?? null,
    authorId,
    authorAvatar: resolveCoverUrl(avatarRaw),
    likes,
    rewardCount: asInt(root.reward_count ?? resource.reward_count) ?? 0,
    favoriteCount: asInt(root.favorite_count ?? resource.favorite_count) ?? 0,
    danmakuCount:
      asInt(resource.danmaku_count ?? root.danmaku_count ?? resource.bullet_count) ?? 0,
    publishedAt: publishedAt ?? null,
    copyright: asInt(resource.copyright ?? root.copyright),
    seriesId: asInt(resource.series_id ?? root.series_id),
    seriesOrder: asInt(resource.series_order ?? root.series_order),
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
        format: `${item.format ?? ''}`.trim() || guessStreamFormat(url),
        needLogin: Boolean(item.need_login ?? item.needLogin),
        needPremium: Boolean(item.need_premium ?? item.needPremium),
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
/**
 * @param {unknown} value
 */
function parseCommentCreatedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) return n;
    return trimmed;
  }
  return null;
}

function parseComment(raw) {
  const json = asMap(raw);
  const id = asInt(json.id);
  if (id == null || id === 0) return null;
  const user =
    asMap(json.user).id != null ? asMap(json.user) : asMap(json.user_info);
  const likeStatus = asMap(json.like_status);
  const like = asMap(likeStatus.like);
  const dislike = asMap(likeStatus.dislike);
  const rawContent = `${json.content ?? ''}`;
  const authorId = asInt(user.id ?? user.user_id ?? json.user_id);
  const badges = parseUserBadgeIds(user.badges ?? json.badges);
  return {
    id,
    authorId,
    authorName:
      `${user.name ?? user.username ?? user.nickname ?? json.user_name ?? json.nickname ?? '用户'}`.trim(),
    avatar: resolveCoverUrl(user.avatar ?? user.face ?? json.avatar),
    content: commentPlainText(rawContent),
    rawContent,
    likes: asInt(like.count ?? json.like_count) ?? 0,
    liked: like.is_active === true || like.is_active === 1,
    dislikes: asInt(dislike.count ?? json.dislike_count) ?? 0,
    disliked: dislike.is_active === true || dislike.is_active === 1,
    replyCount: asInt(json.reply_count) ?? 0,
    floorNum: asInt(json.floor_num ?? json.floor),
    badges: badges.slice(0, 5),
    createdAt: parseCommentCreatedAt(json.created_at ?? json.create_time),
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
/**
 * @param {string} url
 */
function guessStreamFormat(url) {
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8')) return 'm3u8';
  if (lower.includes('.flv')) return 'flv';
  if (lower.includes('.mpd')) return 'dash';
  return 'mp4';
}

export async function fetchVideoPlayParts(videoId) {
  const data = await apiGet('/v1/video/getPlayAddress', { id: videoId, showAll: 1 });
  return parseVideoParts(data);
}

/**
 * @param {number} areaId
 * @param {number} [page]
 * @param {string} [order]
 */
export async function fetchCommentList(areaId, page = 1, order = 'desc') {
  const data = await apiGet('/v1/comment/list', {
    area_id: areaId,
    page,
    order,
    html: 0,
  });
  return parseCommentList(data);
}

/**
 * @param {number} commentId
 * @param {number} [page]
 */
export async function fetchCommentReplies(commentId, page = 1) {
  const data = await apiGet('/v1/comment/reply_list', {
    comment_id: commentId,
    page,
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
 * @param {unknown} data
 */
export function parseReactionStatus(data) {
  const status = asMap(asMap(data).status ?? data);
  const like = asMap(status.like);
  const dislike = asMap(status.dislike);
  return {
    liked: like.is_active === true || like.is_active === 1,
    disliked: dislike.is_active === true || dislike.is_active === 1,
    likes: asInt(like.count) ?? 0,
    dislikes: asInt(dislike.count) ?? 0,
  };
}

/**
 * @param {number} resourceId
 * @param {number} [resourceType]
 */
export async function fetchReactionStatus(resourceId, resourceType = 1) {
  const data = await apiGet('/v1/like/status', { id: resourceId, type: resourceType });
  return parseReactionStatus(data);
}

/**
 * @param {number} resourceId
 * @param {number} [resourceType]
 */
export async function fetchLikeStatus(resourceId, resourceType = 1) {
  const reaction = await fetchReactionStatus(resourceId, resourceType);
  return {
    liked: reaction.liked,
    likes: reaction.likes,
  };
}

/**
 * @param {number} resourceId
 * @param {'like' | 'dislike' | 'cancel'} action
 * @param {number} [resourceType]
 */
export async function setResourceReaction(resourceId, action, resourceType = 1) {
  await apiPostJson(`/v1/like/${action}`, {
    id: resourceId,
    type: resourceType,
  });
}

/**
 * @param {number} resourceId
 * @param {boolean} like
 * @param {number} [resourceType]
 */
export async function setResourceLike(resourceId, like, resourceType = 1) {
  await setResourceReaction(resourceId, like ? 'like' : 'cancel', resourceType);
}

/**
 * 投币（文章 type=0，视频 type=1）
 * @param {number | string} resourceId
 * @param {number} resourceType
 * @param {number} [count]
 * @returns {Promise<string>} 服务端提示文案
 */
export async function rewardResource(resourceId, resourceType, count = 1) {
  const id = Number(resourceId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('无效的资源');
  }
  const coins = Math.trunc(count);
  if (coins < 1) {
    throw new Error('投币数量至少为 1');
  }

  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const token = loadSession()?.token;
  if (token) headers.Authorization = token;

  const res = await fetch(`${API_BASE}/v1/reward/reward`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, type: resourceType, count: coins }),
  });
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    throw new Error(res.ok ? '服务器响应无效' : `请求失败 (${res.status})`);
  }
  const body = /** @type {{ code?: number, msg?: string }} */ (json);
  if (!res.ok || body.code !== 1) {
    throw new Error(body.msg || `请求失败 (${res.status})`);
  }
  const msg = typeof body.msg === 'string' ? body.msg.trim() : '';
  return msg || '投币成功';
}

/**
 * @param {number} commentId
 * @param {'like' | 'dislike' | 'cancel'} action
 */
export async function setCommentReaction(commentId, action) {
  await setResourceReaction(commentId, action, 4);
}

/**
 * @param {string} text
 */
function commentQuillJson(text) {
  return JSON.stringify([{ insert: `${text}\n` }]);
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function uploadCommentImage(file) {
  const formData = new FormData();
  formData.append('file', file);

  /** @type {Record<string, string>} */
  const headers = {};
  const token = loadSession()?.token;
  if (token) headers.Authorization = token;

  const res = await fetch(`${API_BASE}/v1/media/upload_image`, {
    method: 'POST',
    headers,
    body: formData,
  });
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    throw new Error(res.ok ? '上传响应无效' : `上传失败 (${res.status})`);
  }
  const body = /** @type {{ code?: number, msg?: string, data?: unknown }} */ (json);
  if (!res.ok || body.code !== 1) {
    throw new Error(body.msg || `上传失败 (${res.status})`);
  }

  const data = body.data;
  const root = data && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {};
  const fileInfo =
    root.file && typeof root.file === 'object'
      ? /** @type {Record<string, unknown>} */ (root.file)
      : root;
  const path = fileInfo.file_path ?? fileInfo.path ?? root.file_path ?? root.path;
  if (typeof path !== 'string' || !path.trim()) {
    throw new Error('上传成功但未返回图片路径');
  }
  return path.trim();
}

/**
 * @param {number} commentId
 * @param {string} text
 * @param {{ userId?: number | null, name?: string | null }} [mention]
 * @param {string[]} [imagePaths]
 */
export async function createCommentReply(commentId, text, mention, imagePaths = []) {
  let payload = text.trim();
  if (!payload && imagePaths.length === 0) {
    throw new Error('请填写回复内容');
  }
  if (mention?.name) {
    const userId = mention.userId ?? '';
    payload = `[@${userId}:${mention.name}] ${payload}`;
  }
  await apiPostJson('/v1/comment/create_reply', {
    comment_id: commentId,
    content: commentQuillJson(payload),
    images: JSON.stringify(imagePaths),
  });
}

/**
 * @param {number} commentId
 */
export async function deleteComment(commentId) {
  if (!Number.isFinite(commentId) || commentId <= 0) {
    throw new Error('无效的评论');
  }
  await apiPostJson('/v1/comment/delete', { comment_id: commentId });
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
 * @param {string[]} [imagePaths]
 */
export async function createComment(areaId, text, imagePaths = []) {
  const trimmed = text.trim();
  if (!trimmed && imagePaths.length === 0) {
    throw new Error('请填写评论内容');
  }
  await apiPostJson('/v1/comment/create', {
    area_id: areaId,
    content: commentQuillJson(trimmed),
    images: JSON.stringify(imagePaths),
    html: 1,
  });
}

/**
 * @param {VideoQuality} quality
 */
export function qualityDisplayLabel(quality) {
  const label = `${quality.label ?? ''}`.trim();
  const name = `${quality.name ?? ''}`.trim();
  return label || name || '默认清晰度';
}

/**
 * @param {VideoQuality} quality
 */
export function qualityPixels(quality) {
  const label = qualityDisplayLabel(quality).toLowerCase();
  const match = label.match(/(\d{3,4})/);
  if (match) return Number.parseInt(match[1], 10);
  if (label.includes('4k')) return 2160;
  if (label.includes('2k')) return 1440;
  if (label.includes('hd')) return 720;
  if (label.includes('sd')) return 480;
  return 0;
}

/**
 * @param {VideoQuality[]} qualities
 */
export function sortQualitiesDesc(qualities) {
  return [...qualities].sort((a, b) => qualityPixels(b) - qualityPixels(a));
}

/**
 * @param {VideoPart[]} parts
 * @param {number} partIndex
 */
export function getQualitiesForPart(parts, partIndex) {
  return parts[partIndex]?.qualities ?? [];
}

/**
 * @param {VideoPart[]} parts
 * @param {number} [partIndex]
 */
export function pickDefaultQuality(parts, partIndex = 0) {
  const qualities = sortQualitiesDesc(getQualitiesForPart(parts, partIndex));
  if (qualities.length === 0) return null;
  const pref = loadAppSettings().defaultQuality;
  if (pref !== 'auto') {
    const target = Number.parseInt(pref, 10);
    const match =
      qualities.find((q) => qualityPixels(q) === target) ??
      qualities.find((q) => qualityPixels(q) <= target);
    if (match) return match;
  }
  return qualities[0];
}
