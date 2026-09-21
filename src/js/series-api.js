import { apiGet, apiPostJson, resolveCoverUrl } from './content-api.js';

/** @typedef {{
 *   id: number,
 *   userId: number,
 *   title: string,
 *   summary: string,
 *   cover: string | null,
 *   type: number,
 *   status: number,
 *   createdAt: number | null,
 *   updatedAt: number | null,
 *   isSubscribed: boolean,
 * }} SeriesInfo */

/** @typedef {{
 *   resourceId: number,
 *   resourceType: number,
 *   title: string,
 *   cover: string | null,
 *   likes: number,
 *   views: number,
 *   comments: number,
 *   order: number | null,
 * }} SeriesItem */

/** @typedef {{
 *   items: SeriesItem[],
 *   total: number,
 *   page: number,
 *   size: number,
 *   hasMore: boolean,
 * }} SeriesItemsPage */

/** @typedef {{
 *   items: SeriesInfo[],
 *   total: number,
 *   page: number,
 *   size: number,
 *   hasMore: boolean,
 * }} SeriesListPage */

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
 * @param {unknown} raw
 * @returns {SeriesInfo}
 */
function parseSeriesInfo(raw) {
  const item = asMap(raw);
  const id = asInt(item.id) ?? 0;
  return {
    id,
    userId: asInt(item.user_id ?? item.userId) ?? 0,
    title: `${item.title ?? ''}`.trim() || '未命名合集',
    summary: `${item.summary ?? item.desc ?? item.description ?? ''}`.trim(),
    cover: resolveCoverUrl(item.cover),
    type: asInt(item.type) ?? 0,
    status: asInt(item.status) ?? 1,
    createdAt: asInt(item.created_at ?? item.createdAt),
    updatedAt: asInt(item.updated_at ?? item.updatedAt),
    isSubscribed: Boolean(item.is_subscribed ?? item.isSubscribed),
  };
}

/**
 * @param {unknown} raw
 * @param {number} [index]
 * @returns {SeriesItem | null}
 */
function parseSeriesItem(raw, index = 0) {
  const item = asMap(raw);
  const resourceId = asInt(item.resource_id ?? item.id ?? item.resourceId);
  if (resourceId == null || resourceId <= 0) return null;
  const resourceType = asInt(item.resource_type ?? item.type ?? item.resourceType) ?? 1;
  return {
    resourceId,
    resourceType,
    title: `${item.title ?? ''}`.trim() || '未命名内容',
    cover: resolveCoverUrl(item.cover),
    likes: asInt(item.like_count ?? item.likes) ?? 0,
    views: asInt(item.view_count ?? item.views) ?? 0,
    comments: asInt(item.comment_count ?? item.comments) ?? 0,
    order: asInt(item.series_order ?? item.order ?? item.sort) ?? index + 1,
  };
}

/**
 * @param {unknown} data
 * @param {number} page
 * @param {number} size
 * @returns {SeriesItemsPage}
 */
function parseSeriesItemsPage(data, page, size) {
  const root = asMap(data);
  const list = Array.isArray(root.list) ? root.list : Array.isArray(data) ? data : [];
  const total = asInt(root.total) ?? list.length;
  const items = list
    .map((entry, index) => parseSeriesItem(entry, index))
    .filter((entry) => entry != null);
  return {
    items,
    total,
    page,
    size,
    hasMore: page * size < total,
  };
}

/**
 * @param {unknown} data
 * @param {number} page
 * @param {number} size
 * @returns {SeriesListPage}
 */
function parseSeriesListPage(data, page, size) {
  const root = asMap(data);
  const list = Array.isArray(root.list) ? root.list : Array.isArray(data) ? data : [];
  const total = asInt(root.total) ?? list.length;
  const items = list.map((entry) => parseSeriesInfo(entry)).filter((entry) => entry.id > 0);
  return {
    items,
    total,
    page,
    size,
    hasMore: page * size < total,
  };
}

/**
 * @param {SeriesItem} item
 * @returns {import('./content-api.js').ContentPreview}
 */
export function seriesItemToPreview(item) {
  return {
    id: String(item.resourceId),
    title: item.title,
    cover: item.cover,
    author: '',
    authorId: null,
    authorAvatar: null,
    type: item.resourceType === 0 ? 0 : 1,
    views: item.views,
    comments: item.comments,
    createdAt: null,
  };
}

/**
 * @param {number} seriesId
 */
export async function fetchSeriesInfo(seriesId) {
  const data = await apiGet('/v1/series/get', { id: seriesId });
  const root = asMap(data);
  const info = root.id != null ? root : asMap(root.data);
  const parsed = parseSeriesInfo(info.id != null ? info : data);
  if (parsed.id <= 0) throw new Error('合集不存在');
  return parsed;
}

/**
 * @param {number} seriesId
 * @param {number} [page]
 * @param {number} [size]
 * @param {number} [type]
 */
export async function fetchSeriesItems(seriesId, page = 1, size = 20, type = 0) {
  const data = await apiGet('/v1/series/items', {
    series_id: seriesId,
    page,
    size,
    type,
  });
  return parseSeriesItemsPage(data, page, size);
}

/**
 * @param {number} seriesId
 */
export async function subscribeSeries(seriesId) {
  await apiPostJson('/v1/series/subscribe', { series_id: seriesId });
}

/**
 * @param {number} seriesId
 */
export async function unsubscribeSeries(seriesId) {
  await apiPostJson('/v1/series/unsubscribe', { series_id: seriesId, unfollow: 1 });
}

/**
 * @param {number} [page]
 * @param {number} [size]
 */
export async function fetchSubscribedSeries(page = 1, size = 20) {
  const data = await apiGet('/v1/series/subscribed', { page, size });
  return parseSeriesListPage(data, page, size);
}

/**
 * @param {unknown} data
 * @returns {unknown[]}
 */
function extractList(data) {
  if (Array.isArray(data)) return data;
  const root = asMap(data);
  for (const key of ['list', 'items', 'data']) {
    if (Array.isArray(root[key])) return root[key];
  }
  return [];
}

/**
 * @param {number} userId
 */
async function collectSeriesIdsFromUserContent(userId) {
  /** @type {Set<number>} */
  const seriesIds = new Set();
  const sources = [
    { path: '/v1/video/user_list', cursorKey: 'vid' },
    { path: '/v1/article/user_list', cursorKey: 'aid' },
  ];
  for (const source of sources) {
    let cursor = 0;
    for (let page = 0; page < 8; page += 1) {
      const data = await apiGet(source.path, {
        user_id: userId,
        [source.cursorKey]: cursor,
        type: 'pass',
      });
      const list = extractList(data);
      if (!list.length) break;
      for (const raw of list) {
        const seriesId = asInt(asMap(raw).series_id);
        if (seriesId != null && seriesId > 0) seriesIds.add(seriesId);
      }
      const last = asMap(list[list.length - 1]);
      const next = asInt(last.id ?? last.resource_id);
      if (next == null || next <= 0 || next === cursor) break;
      cursor = next;
      if (list.length < 10) break;
    }
  }
  return seriesIds;
}

/**
 * @param {number} userId
 */
async function fetchUserSeriesListFallback(userId) {
  /** @type {Map<number, SeriesInfo>} */
  const map = new Map();
  const seriesIds = await collectSeriesIdsFromUserContent(userId);
  await Promise.all(
    [...seriesIds].map(async (id) => {
      try {
        const info = await fetchSeriesInfo(id);
        if (info.userId === userId) map.set(id, info);
      } catch {
        /* ignore */
      }
    }),
  );
  const items = [...map.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return {
    items,
    total: items.length,
    page: 1,
    size: items.length || 20,
    hasMore: false,
  };
}

/**
 * @param {number} userId
 * @param {number} page
 * @param {number} size
 */
async function fetchUserSeriesListDirect(userId, page, size) {
  const candidates = [
    () => apiGet('/v1/series/list', { user_id: userId, page, size }),
    () => apiGet('/v1/series/user', { id: userId, page, size }),
    () => apiGet('/v1/series/get_list', { user_id: userId, page, size }),
  ];
  for (const load of candidates) {
    try {
      const data = await load();
      const parsed = parseSeriesListPage(data, page, size);
      if (parsed.items.length > 0 || parsed.total > 0) return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * @param {number} userId
 * @param {number} [page]
 * @param {number} [size]
 */
export async function fetchUserSeriesList(userId, page = 1, size = 20) {
  const direct = await fetchUserSeriesListDirect(userId, page, size);
  if (direct && direct.items.length > 0) return direct;
  if (page === 1) {
    const fallback = await fetchUserSeriesListFallback(userId);
    if (fallback.items.length > 0) return fallback;
  }
  return direct ?? { items: [], total: 0, page, size, hasMore: false };
}

/**
 * @param {{ title: string, summary?: string, cover?: string, type?: number }} params
 */
export async function createSeries(params) {
  const body = {
    title: params.title,
    summary: params.summary ?? '',
    ...(params.cover ? { cover: params.cover } : {}),
    ...(params.type != null ? { type: params.type } : {}),
  };
  const paths = ['/v1/series/create', '/v1/series/save', '/v1/series/new', '/v1/series/create_list'];
  /** @type {Error | null} */
  let lastError = null;
  for (const path of paths) {
    try {
      const data = await apiPostJson(path, body);
      const root = asMap(data);
      const info = parseSeriesInfo(root.id != null ? root : asMap(root.data));
      if (info.id > 0) return info;
      const id = asInt(root.id ?? root.series_id);
      if (id != null && id > 0) return fetchSeriesInfo(id);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(`${err}`);
    }
  }
  throw lastError ?? new Error('创建合集失败');
}

/**
 * @param {{ id: number, title?: string, summary?: string, cover?: string }} params
 */
export async function updateSeries(params) {
  const body = {
    id: params.id,
    series_id: params.id,
    ...(params.title != null ? { title: params.title } : {}),
    ...(params.summary != null ? { summary: params.summary } : {}),
    ...(params.cover != null ? { cover: params.cover } : {}),
  };
  const paths = ['/v1/series/update', '/v1/series/edit', '/v1/series/update_list'];
  /** @type {Error | null} */
  let lastError = null;
  for (const path of paths) {
    try {
      await apiPostJson(path, body);
      return fetchSeriesInfo(params.id);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(`${err}`);
    }
  }
  throw lastError ?? new Error('更新合集失败');
}

/**
 * @param {number} seriesId
 */
export async function deleteSeries(seriesId) {
  const body = { id: seriesId, series_id: seriesId };
  const paths = ['/v1/series/delete', '/v1/series/del', '/v1/series/delete_list'];
  /** @type {Error | null} */
  let lastError = null;
  for (const path of paths) {
    try {
      await apiPostJson(path, body);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(`${err}`);
    }
  }
  throw lastError ?? new Error('删除合集失败');
}

/**
 * @param {{ seriesId: number, resourceId: number, resourceType: number }} params
 */
export async function addSeriesItem(params) {
  const body = {
    series_id: params.seriesId,
    resource_id: params.resourceId,
    resource_type: params.resourceType,
  };
  const paths = [
    '/v1/series/add_item',
    '/v1/series/add',
    '/v1/series/add_resource',
    '/v1/series/item/add',
  ];
  /** @type {Error | null} */
  let lastError = null;
  for (const path of paths) {
    try {
      await apiPostJson(path, body);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(`${err}`);
    }
  }
  throw lastError ?? new Error('添加到合集失败');
}

/**
 * @param {{ seriesId: number, resourceId: number, resourceType: number }} params
 */
export async function removeSeriesItem(params) {
  const body = {
    series_id: params.seriesId,
    resource_id: params.resourceId,
    resource_type: params.resourceType,
  };
  const paths = [
    '/v1/series/remove_item',
    '/v1/series/remove',
    '/v1/series/remove_resource',
    '/v1/series/item/remove',
  ];
  /** @type {Error | null} */
  let lastError = null;
  for (const path of paths) {
    try {
      await apiPostJson(path, body);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(`${err}`);
    }
  }
  throw lastError ?? new Error('从合集移除失败');
}

/**
 * @param {number} seriesId
 * @param {number} resourceId
 * @param {number} resourceType
 */
export async function fetchSeriesContext(seriesId, resourceId, resourceType) {
  const [info, page] = await Promise.all([
    fetchSeriesInfo(seriesId),
    fetchSeriesItems(seriesId, 1, 100, 0),
  ]);
  const items = page.items;
  const currentIndex = items.findIndex(
    (item) => item.resourceId === resourceId && item.resourceType === resourceType,
  );
  const current = currentIndex >= 0 ? items[currentIndex] : null;
  const prev = currentIndex > 0 ? items[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < items.length - 1 ? items[currentIndex + 1] : null;
  return { info, items, currentIndex, current, prev, next };
}

/**
 * @param {{ seriesId: number, resourceId: number, resourceType: number, order: number }} params
 */
export async function reorderSeriesItem(params) {
  const body = {
    series_id: params.seriesId,
    resource_id: params.resourceId,
    resource_type: params.resourceType,
    order: params.order,
    series_order: params.order,
    sort: params.order,
  };
  const paths = [
    '/v1/series/sort',
    '/v1/series/reorder',
    '/v1/series/item/sort',
    '/v1/series/update_order',
  ];
  /** @type {Error | null} */
  let lastError = null;
  for (const path of paths) {
    try {
      await apiPostJson(path, body);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(`${err}`);
    }
  }
  throw lastError ?? new Error('调整顺序失败');
}
