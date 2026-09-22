import { API_BASE, loadSession } from './auth.js';

/** @typedef {{ id: string, title: string, cover: string | null, author: string, authorId: number | null, authorAvatar: string | null, authorAvatarFrame: string | null, type: number, views: number, likes: number, comments: number, duration: number | null, createdAt: string | null }} ContentPreview */

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
 * @param {string} path
 * @param {Record<string, string | number | boolean>} fields
 */
/**
 * @param {string} path
 * @param {Record<string, unknown>} [body]
 */
export async function apiDelete(path, body = {}) {
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const token = loadSession()?.token;
  if (token) headers.Authorization = token;

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  });
  return parseApiJson(res);
}

export async function apiPostForm(path, fields = {}) {
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const token = loadSession()?.token;
  if (token) headers.Authorization = token;

  const params = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    params.set(key, String(value));
  });

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: params.toString(),
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
 * 头像/头像框展示用 src：支持相对路径、CDN、本地 assets、已代理的 mfuns-media。
 * @param {unknown} raw
 * @returns {string | null}
 */
export function avatarImageSrc(raw) {
  if (raw == null || raw === '') return null;
  const s = `${raw}`.trim();
  if (!s) return null;
  if (s.startsWith('mfuns-media:') || s.startsWith('mfuns-offline:')) return s;
  if (s.startsWith('assets/') || s.startsWith('data:') || s.startsWith('blob:')) return s;
  const resolved = resolveCoverUrl(raw);
  if (!resolved) return null;
  if (resolved.startsWith('assets/')) return resolved;
  return mediaSrcForUrl(resolved);
}

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
 * 从用户对象或 avatar_frame 字段解析头像框图片 URL。
 * @param {unknown} raw
 * @returns {string | null}
 */
export function pickAvatarFrameUrl(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return resolveCoverUrl(trimmed);
  }
  if (typeof raw !== 'object') return null;
  const map = /** @type {Record<string, unknown>} */ (raw);
  const nested =
    map.avatar_frame != null && typeof map.avatar_frame === 'object'
      ? /** @type {Record<string, unknown>} */ (map.avatar_frame)
      : map.avatarFrame != null && typeof map.avatarFrame === 'object'
        ? /** @type {Record<string, unknown>} */ (map.avatarFrame)
        : null;
  if (nested) {
    const fromNested = resolveCoverUrl(
      nested.image ?? nested.url ?? nested.preview ?? nested.src ?? nested.cover ?? nested.icon,
    );
    if (fromNested) return fromNested;
  }
  const direct = resolveCoverUrl(
    map.image ??
      map.url ??
      map.preview ??
      map.src ??
      map.cover ??
      map.icon ??
      map.avatar_frame_url ??
      map.frame_url ??
      map.avatar_frame_image,
  );
  return direct || null;
}

/**
 * @param {Record<string, unknown> | null | undefined} user
 * @returns {string | null}
 */
export function userAvatarFrameUrl(user) {
  if (!user) return null;
  return pickAvatarFrameUrl(
    user.avatar_frame ??
      user.avatarFrame ??
      user.wearing_avatar_frame ??
      user.wearingAvatarFrame ??
      user.user_avatar_frame,
  );
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
 * @param {number | null | undefined} seconds
 * @returns {string}
 */
export function formatVideoDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * @param {Record<string, unknown>} item
 * @param {Record<string, unknown> | null} resource
 * @returns {number | null}
 */
function parseDuration(item, resource) {
  const raw =
    item.duration ?? item.video_duration ?? resource?.duration ?? resource?.video_duration;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  const parsed = Number.parseFloat(`${raw ?? ''}`);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeCreatedAt(value) {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
    'Mfuns 用户';

  const authorIdRaw = user?.id ?? user?.user_id ?? item.user_id ?? item.author_id;
  let authorId = null;
  if (typeof authorIdRaw === 'number' && Number.isFinite(authorIdRaw)) {
    authorId = Math.trunc(authorIdRaw);
  } else {
    const parsed = Number.parseInt(`${authorIdRaw ?? ''}`, 10);
    if (Number.isFinite(parsed)) authorId = parsed;
  }

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
    authorId,
    authorAvatar: pickCoverUrl(user?.avatar ?? user?.face ?? item.author_avatar),
    authorAvatarFrame: pickAvatarFrameUrl(user?.avatar_frame ?? user?.avatarFrame),
    type: parseContentType(raw),
    views: Number(item.view_count ?? item.views ?? resource?.view_count ?? 0) || 0,
    likes:
      Number(item.like_count ?? item.likes ?? resource?.like_count ?? resource?.likes ?? 0) || 0,
    comments: Number(item.comment_count ?? item.comments ?? 0) || 0,
    duration: parseDuration(item, resource),
    createdAt: normalizeCreatedAt(
      item.created_at ?? item.time ?? item.createdAt ?? item.publish_time,
    ),
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
 * 解析列表接口的分页元数据（`total`、`total_page` 等）。
 * @param {unknown} data
 * @param {number} page
 * @param {number} size
 * @param {number} itemCount
 * @returns {{ total: number | null, totalPages: number, hasNext: boolean }}
 */
export function parseListPageMeta(data, page, size, itemCount) {
  const root = data && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {};
  const pageInfo =
    root.page_info && typeof root.page_info === 'object'
      ? /** @type {Record<string, unknown>} */ (root.page_info)
      : null;

  const asInt = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    const n = Number.parseInt(`${value ?? ''}`, 10);
    return Number.isFinite(n) ? n : null;
  };

  const total =
    asInt(root.total ?? root.total_count ?? root.all_count ?? root.total_num) ??
    asInt(pageInfo?.total ?? pageInfo?.total_count ?? pageInfo?.all_count) ??
    null;

  let totalPages =
    asInt(root.total_page ?? root.page_count ?? root.last_page ?? root.max_page) ??
    asInt(pageInfo?.total_page ?? pageInfo?.page_count ?? pageInfo?.last_page) ??
    null;

  if (itemCount === 0 && page > 1) {
    const lastPage = Math.max(1, page - 1);
    return {
      total,
      totalPages: totalPages != null ? Math.min(totalPages, lastPage) : lastPage,
      hasNext: false,
    };
  }

  if (totalPages == null && total != null && size > 0) {
    totalPages = Math.max(1, Math.ceil(total / size));
  }
  if (totalPages == null && itemCount < size) {
    totalPages = Math.max(1, page);
  }
  if (totalPages == null) {
    totalPages = Math.max(1, page);
  }

  totalPages = Math.max(1, totalPages);
  return {
    total,
    totalPages,
    hasNext: page < totalPages,
  };
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

/** @typedef {{ id: number, name: string, parentId: number | null }} CategoryNode */

/**
 * @param {unknown} raw
 * @param {CategoryNode[]} output
 */
function collectCategories(raw, output) {
  if (Array.isArray(raw)) {
    raw.forEach((item) => collectCategories(item, output));
    return;
  }
  if (!raw || typeof raw !== 'object') return;
  const item = /** @type {Record<string, unknown>} */ (raw);
  if (item.id != null && item.name != null) {
    const id = Number.parseInt(`${item.id}`, 10);
    const name = `${item.name}`.trim();
    if (Number.isFinite(id) && id !== 0 && name) {
      const parentRaw = item.parent_id ?? item.parentId;
      const parentId = parentRaw == null ? null : Number.parseInt(`${parentRaw}`, 10);
      output.push({
        id,
        name,
        parentId: Number.isFinite(parentId) ? parentId : null,
      });
    }
  }
  collectCategories(item.children, output);
  collectCategories(item.list, output);
}

/**
 * @returns {Promise<CategoryNode[]>}
 */
export async function fetchCategories() {
  const data = await apiGet('/v1/category/all', {});
  /** @type {CategoryNode[]} */
  const all = [];
  collectCategories(data, all);
  /** @type {Map<number, CategoryNode>} */
  const unique = new Map();
  all.forEach((node) => unique.set(node.id, node));
  const ordered = [];
  const seen = new Set();
  for (const node of all) {
    const existing = unique.get(node.id);
    if (existing && !seen.has(node.id)) {
      ordered.push(existing);
      seen.add(node.id);
    }
  }
  for (const node of unique.values()) {
    if (!seen.has(node.id)) ordered.push(node);
  }
  return ordered;
}

/**
 * 一级大分区（接口约定 parent_id === 0），保留 `/v1/category/all` 树顺序。
 * @param {CategoryNode[]} all
 */
export function rootCategoryNodes(all) {
  /** @type {CategoryNode[]} */
  const roots = [];
  const seen = new Set();
  for (const node of all) {
    if (node.parentId === 0 && !seen.has(node.id)) {
      roots.push(node);
      seen.add(node.id);
    }
  }
  if (roots.length > 0) return roots;
  const idSet = new Set(all.map((node) => node.id));
  for (const node of all) {
    if (
      (node.parentId == null || (!idSet.has(node.parentId) && node.parentId !== 0)) &&
      !seen.has(node.id)
    ) {
      roots.push(node);
      seen.add(node.id);
    }
  }
  return roots;
}

/**
 * 某大分区下的小分区；若无子节点则返回该大分区自身（保留接口顺序）。
 * @param {CategoryNode[]} all
 * @param {number} parentId
 */
export function childCategoryNodes(all, parentId) {
  const children = all.filter((node) => node.parentId === parentId);
  if (children.length > 0) return children;
  const self = all.find((node) => node.id === parentId);
  return self ? [self] : [];
}

/**
 * @param {number} categoryId
 * @param {number} [size]
 */
export async function fetchRecommendByCategory(categoryId, size = 20) {
  const data = await apiGet('/v1/recommend/get', { category: categoryId, size });
  return parsePreviewList(data);
}

/**
 * 分区下完整稿件列表（分页），对应 legacy `GET /v1/category/list`。
 * @param {number} categoryId
 * @param {number} [page]
 * @param {number} [size]
 */
export async function fetchCategoryListPage(categoryId, page = 1, size = 20) {
  const data = await apiGet('/v1/category/list', { cid: categoryId, page, size });
  const items = parsePreviewList(data);
  return { items, hasNext: items.length >= size };
}

/**
 * 详情页信息栏编号：视频 MV、文章 MA。
 * @param {string | number | null | undefined} id
 * @param {0 | 1} type
 */
export function formatContentArchiveNo(id, type) {
  const raw = `${id ?? ''}`.trim();
  if (!raw) return '';
  if (type === 1) return `MV${raw}`;
  if (type === 0) return `MA${raw}`;
  return '';
}
