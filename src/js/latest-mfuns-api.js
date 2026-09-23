import { loadSession } from './auth.js';

/** 与 Flutter `AppConfig.latestMfunsHost` 一致；勿向该域名发送社区 Authorization */
const LATEST_MFUNS_ORIGIN = 'https://mfuns.wgen.top';
const DEFAULT_LIMIT = 20;

/**
 * @typedef {Object} LatestMfunsItem
 * @property {number} id
 * @property {'video' | 'article' | 'feed' | string} type
 * @property {string} title
 * @property {string} content
 * @property {string} cover
 * @property {string | null} createdAtIso
 * @property {string} author
 * @property {number | null} authorId
 * @property {string} authorAvatar
 * @property {number} likes
 * @property {number} comments
 * @property {number} views
 * @property {string} category
 * @property {string} sourceUrl
 * @property {string} stableId
 */

/**
 * @typedef {{ items: LatestMfunsItem[], nextBefore: number | null }} LatestMfunsPage
 */

/**
 * @param {unknown} value
 */
function asInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {unknown} value
 */
function asDouble(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(`${value ?? ''}`);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {unknown} value
 */
function imageUrl(value) {
  const url = `${value ?? ''}`.trim();
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/static/')) return `https://cdn2.mfuns.net${url}`;
  if (url.startsWith('static/')) return `https://cdn2.mfuns.net/${url}`;
  if (url.startsWith('https://resource.mfuns.net/static/')) {
    return url.replace('https://resource.mfuns.net', 'https://cdn2.mfuns.net');
  }
  return url;
}

/**
 * @param {unknown} value
 */
function asCreatedIso(value) {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value.includes(' ') ? value.replace(' ', 'T') : value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const seconds = asDouble(value);
  if (seconds == null || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * @param {Record<string, unknown>} json
 */
function parseLatestItem(json) {
  const user =
    json.user && typeof json.user === 'object'
      ? /** @type {Record<string, unknown>} */ (json.user)
      : {};
  const legacy = Object.keys(user).length === 0;
  const type = `${json.type ?? 'feed'}`;
  const id = asInt(json.id) ?? 0;
  return {
    id,
    type,
    title: `${json.title ?? ''}`,
    content: `${json.content ?? json.description ?? ''}`,
    cover: imageUrl(json.cover),
    createdAtIso: asCreatedIso(json.created_at ?? json.created_at_timestamp),
    author: `${user.name ?? (legacy ? json.author : '') ?? ''}`,
    authorId: asInt(user.id ?? (legacy ? json.author_id : null)),
    authorAvatar: imageUrl(user.avatar ?? (legacy ? json.author_avatar : null)),
    likes: asInt(json.like_count ?? json.likes) ?? 0,
    comments: asInt(json.comment_count ?? json.comments) ?? 0,
    views: asInt(json.view_count ?? json.views) ?? 0,
    category: `${json.category_name ?? json.category ?? ''}`,
    sourceUrl: `${json.source_url ?? json.url ?? ''}`,
    stableId: `${type}-${id}`,
  };
}

/**
 * @param {unknown} raw
 */
function parseItemList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => parseLatestItem(/** @type {Record<string, unknown>} */ (item)))
    .filter((item) => item.id > 0);
}

/**
 * @param {unknown} decoded
 */
function parseFlutterPage(decoded) {
  const root = decoded && typeof decoded === 'object' ? /** @type {Record<string, unknown>} */ (decoded) : {};
  if (asInt(root.code) !== 1) {
    throw new Error(`${root.msg ?? '最新内容服务请求失败'}`);
  }
  const payload =
    root.data && typeof root.data === 'object'
      ? /** @type {Record<string, unknown>} */ (root.data)
      : {};
  const items = parseItemList(payload.list);
  const nextBefore =
    asDouble(payload.next_before) ??
    (items.length > 0 ? timestampFromIso(items[items.length - 1].createdAtIso) : null);
  return { items, nextBefore };
}

/**
 * @param {string | null} iso
 */
function timestampFromIso(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return ms / 1000;
}

/**
 * @param {string} path
 * @param {Record<string, string>} query
 */
async function getJson(path, query) {
  const url = new URL(path, LATEST_MFUNS_ORIGIN);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== '') url.searchParams.set(key, value);
  });
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    /** @type {Error & { status: number }} */
    const err = new Error('最新内容服务不可用');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * @param {number | null | undefined} before
 * @param {number} [limit]
 * @param {string} [userId]
 * @returns {Promise<LatestMfunsPage>}
 */
export async function fetchLatestMfunsPage(before, limit = DEFAULT_LIMIT, userId = '') {
  const query = {
    limit: String(limit),
    ...(before != null ? { before: String(before) } : {}),
    ...(userId ? { user: userId } : {}),
  };

  try {
    const decoded = await getJson('/api/v1/flutter/latest', query);
    return parseFlutterPage(decoded);
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in err ? err.status : null;
    if (status !== 404) {
      throw err instanceof Error ? err : new Error('最新内容服务请求失败');
    }
    const legacy = await getJson('/latest', query);
    const items = parseItemList(legacy);
    const nextBefore =
      items.length > 0 ? timestampFromIso(items[items.length - 1].createdAtIso) : null;
    return { items, nextBefore };
  }
}

/**
 * @param {LatestMfunsItem} item
 */
export function latestItemToContentPreview(item) {
  return {
    id: String(item.id),
    title: item.title.trim() || item.content.trim() || '未命名内容',
    cover: item.cover || null,
    author: item.author,
    authorId: item.authorId,
    authorAvatar: item.authorAvatar || null,
    authorAvatarFrame: null,
    type: item.type === 'video' ? 1 : 0,
    views: item.views,
    likes: item.likes,
    comments: item.comments,
    duration: null,
    createdAt: item.createdAtIso,
  };
}

/**
 * 登录用户 UID，供 latest 服务个性化；未登录返回空字符串。
 */
export function latestMfunsUserParam() {
  const user = loadSession()?.user;
  if (!user || typeof user !== 'object') return '';
  const id = user.id ?? user.user_id;
  if (id == null) return '';
  return `${id}`;
}
