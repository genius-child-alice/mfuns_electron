import { API_BASE, loadSession } from './auth.js';

/** @typedef {{ id: string, title: string, cover: string | null, author: string, type: number, views: number, comments: number, createdAt: string | null }} ContentPreview */

/**
 * @param {Response} res
 */
async function parseApiJson(res) {
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    throw new Error(res.ok ? '服务器响应无效' : `请求失败 (${res.status})`);
  }
  const body = /** @type {{ code?: number, msg?: string, data?: unknown }} */ (json);
  if (!res.ok || body.code !== 1) {
    throw new Error(body.msg || `请求失败 (${res.status})`);
  }
  return body.data;
}

/**
 * @param {string} path
 * @param {Record<string, string | number>} query
 */
export async function apiGet(path, query = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json' };
  const token = loadSession()?.token;
  if (token) headers.Authorization = token;

  const res = await fetch(url.toString(), { headers });
  return parseApiJson(res);
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} body
 */
export async function apiPostJson(path, body = {}) {
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const token = loadSession()?.token;
  if (token) headers.Authorization = token;

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return parseApiJson(res);
}

/**
 * @param {unknown} data
 * @returns {unknown[]}
 */
function toRawList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (data);
    const list = obj.list ?? obj.data ?? obj.items;
    if (Array.isArray(list)) return list;
  }
  return [];
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function mergeResourceInfo(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const item = /** @type {Record<string, unknown>} */ ({ ...raw });
  const info = item.resource_info;
  if (info && typeof info === 'object') {
    Object.assign(item, /** @type {Record<string, unknown>} */ (info));
  }
  return item;
}

/**
 * 与 Flutter `home_repository.dart` 中 `_coverUrl` 一致：相对路径走 CDN，避免误请求 api 域名。
 * @param {unknown} value
 * @returns {string | null}
 */
export function resolveCoverUrl(value) {
  let cover = `${value ?? ''}`.trim();
  if (!cover) return null;
  if (cover.startsWith('//')) cover = `https:${cover}`;
  if (cover.startsWith('/')) return `https://cdn2.mfuns.net${cover}`;
  if (cover.startsWith('static/')) return `https://cdn2.mfuns.net/${cover}`;
  // 与 Flutter latest_mfuns_repository：仅 resource 下的 /static/ 映射到 cdn2
  if (/^https?:\/\/resource\.mfuns\.net\/static\//i.test(cover)) {
    return cover.replace(/^https?:\/\/resource\.mfuns\.net/i, 'https://cdn2.mfuns.net');
  }
  if (/^https?:\/\/api\.mfuns\.net\//i.test(cover)) {
    return cover.replace(/^https?:\/\/api\.mfuns\.net/i, 'https://cdn2.mfuns.net');
  }
  if (/^http:\/\//i.test(cover) && /\.mfuns\.net(?:[/:]|$)/i.test(cover)) {
    cover = cover.replace(/^http:/i, 'https:');
  }
  return cover;
}

/**
 * 富文本正文图片 URL（对齐 Flutter `_coverUrl` + `safeHttpUri`）：保留
 * `resource.mfuns.net/image/...` 等完整地址，仅相对路径与 api 域名做 CDN 映射。
 * @param {unknown} raw
 * @returns {string | null}
 */
export function resolveRichImageUrl(raw) {
  const trimmed = `${raw ?? ''}`.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return resolveRichImageUrl(`https:${trimmed}`);
  if (trimmed.startsWith('/') || trimmed.startsWith('static/')) {
    return resolveCoverUrl(trimmed);
  }
  if (/^https?:\/\/api\.mfuns\.net\//i.test(trimmed)) {
    return resolveCoverUrl(trimmed);
  }
  if (/^https?:\/\/resource\.mfuns\.net\/static\//i.test(trimmed)) {
    return resolveCoverUrl(trimmed);
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const uri = new URL(trimmed);
      if (uri.protocol === 'http:') uri.protocol = 'https:';
      return uri.toString();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 富文本图片在 Electron 内走 mfuns-media 代理。
 * @param {unknown} raw
 * @returns {string | null}
 */
export function mediaSrcForRichImage(raw) {
  const resolved = resolveRichImageUrl(raw);
  return resolved ? mediaSrcForUrl(resolved) : null;
}

/**
 * Electron 内用主进程代拉 CDN（带 Referer / UA），避免 file:// 页面直连被防盗链拦截。
 * @param {string | null} resolvedHttpsUrl
 * @returns {string | null}
 */
export function mediaSrcForUrl(resolvedHttpsUrl) {
  if (!resolvedHttpsUrl) return null;
  if (typeof window !== 'undefined' && window.electronAPI) {
    return `mfuns-media://load/?u=${encodeURIComponent(resolvedHttpsUrl)}`;
  }
  return resolvedHttpsUrl;
}

/** @deprecated 别名，与 mediaSrcForUrl 相同 */
export const mediaSrcForCover = mediaSrcForUrl;

/**
 * 点播地址走同一代理，并支持 Range（HTMLVideoElement 分段加载）。
 * @param {string | null | undefined} playUrl
 * @returns {string | null}
 */
export function mediaPlaybackSrc(playUrl) {
  if (!playUrl) return null;
  const trimmed = `${playUrl}`.trim();
  if (!trimmed) return null;
  return mediaSrcForUrl(trimmed.startsWith('http') ? trimmed : resolveCoverUrl(trimmed));
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function resolveAvatarUrl(raw) {
  return resolveCoverUrl(raw);
}

/**
 * @param {Record<string, unknown> | null | undefined} user
 * @returns {string | null}
 */
export function userAvatarMediaSrc(user) {
  if (!user) return null;
  const raw = user.avatar ?? user.face ?? user.user_avatar;
  return mediaSrcForUrl(resolveCoverUrl(raw));
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function pickCoverUrl(value) {
  if (typeof value === 'string' && value.length > 0) return resolveCoverUrl(value);
  if (value && typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const url = obj.url ?? obj.src ?? obj.cover;
    if (typeof url === 'string' && url.length > 0) return resolveCoverUrl(url);
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function parseContentType(raw) {
  const item = mergeResourceInfo(raw);
  const typeValue = item.type ?? item.resource_type;
  if (typeof typeValue === 'number') return typeValue;
  if (typeof typeValue === 'string') {
    const lower = typeValue.toLowerCase();
    if (lower.includes('video')) return 1;
    const parsed = Number(typeValue);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/**
 * @param {unknown} raw
 * @returns {ContentPreview | null}
 */
export function parseContentPreview(raw) {
  const item = mergeResourceInfo(raw);
  const id = item.id ?? item.resource_id;
  if (id == null) return null;

  const user =
    item.user && typeof item.user === 'object'
      ? /** @type {Record<string, unknown>} */ (item.user)
      : null;

  const author =
    (typeof user?.name === 'string' && user.name) ||
    (typeof user?.username === 'string' && user.username) ||
    (typeof item.user_name === 'string' && item.user_name) ||
    'MFuns 用户';

  const title =
    (typeof item.title === 'string' && item.title.trim()) ||
    (typeof item.summary === 'string' && item.summary.trim().slice(0, 40)) ||
    '未命名内容';

  const resource =
    item.resource && typeof item.resource === 'object'
      ? /** @type {Record<string, unknown>} */ (item.resource)
      : null;

  return {
    id: String(id),
    title,
    cover: pickCoverUrl(item.cover ?? item.cover_url ?? resource?.cover),
    author,
    type: parseContentType(raw),
    views: Number(item.view_count ?? item.views ?? 0) || 0,
    comments: Number(item.comment_count ?? item.comments ?? 0) || 0,
    createdAt:
      (typeof item.created_at === 'string' && item.created_at) ||
      (typeof item.time === 'string' && item.time) ||
      (typeof item.createdAt === 'string' && item.createdAt) ||
      null,
  };
}

/**
 * @param {unknown} data
 * @returns {ContentPreview[]}
 */
export function parsePreviewList(data) {
  return toRawList(data)
    .map((item) => parseContentPreview(item))
    .filter((item) => item != null);
}

/**
 * 首页混合推荐（category=-1），文档无分页，仅 size。
 * @param {number} [size]
 */
export async function fetchRecommendList(size = 24) {
  const data = await apiGet('/v1/recommend/get', { category: -1, size });
  return parsePreviewList(data);
}

/**
 * 热门榜（公开），与推荐同为 ContentPreview 列表。
 */
export async function fetchHotList() {
  const data = await apiGet('/v1/leaderboards/hot', {});
  return parsePreviewList(data);
}
