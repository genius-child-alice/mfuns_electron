import { apiGet, apiPostJson, parseContentPreview } from './content-api.js';
import { loadSession } from './auth.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

/** @typedef {{
 *   id: number,
 *   name: string,
 *   desc: string,
 *   count: number,
 * }} FavoriteFolder */

/** @typedef {{
 *   items: ContentPreview[],
 *   nextLastId: number | null,
 *   hasMore: boolean,
 * }} FavoriteItemsPage */

/** @typedef {{
 *   favorited: boolean,
 *   listId: number | null,
 * }} FavoriteStatus */

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
 * @param {unknown} data
 * @returns {unknown[]}
 */
function extractList(data) {
  if (Array.isArray(data)) return data;
  const root = asMap(data);
  const nested = asMap(root.data);
  for (const candidate of [root.list, root.items, nested.list, nested.items]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

/**
 * @param {unknown} raw
 * @returns {FavoriteFolder | null}
 */
function parseFavoriteFolder(raw) {
  const item = asMap(raw);
  const id = asInt(item.id ?? item.list_id ?? item.favorite_id);
  if (id == null || id <= 0) return null;
  const name = `${item.name ?? item.title ?? '收藏夹'}`.trim() || '收藏夹';
  const desc = `${item.desc ?? item.description ?? ''}`.trim();
  const count = asInt(item.count ?? item.item_count ?? item.total) ?? 0;
  return { id, name, desc, count };
}

/**
 * @param {unknown} data
 * @returns {FavoriteFolder[]}
 */
export function parseFavoriteFolderList(data) {
  return extractList(data)
    .map((raw) => parseFavoriteFolder(raw))
    .filter((folder) => folder != null);
}

/**
 * @param {unknown} data
 * @returns {FavoriteItemsPage}
 */
export function parseFavoriteItemsPage(data) {
  const root = asMap(data);
  const list = extractList(data);
  /** @type {ContentPreview[]} */
  const items = [];
  list.forEach((raw) => {
    const preview = parseContentPreview(raw);
    if (preview) items.push(preview);
  });

  let nextLastId =
    asInt(root.last_id ?? root.lastId ?? root.next_last_id ?? root.nextLastId) ?? null;
  if (nextLastId == null && list.length > 0) {
    const lastRaw = asMap(list[list.length - 1]);
    nextLastId = asInt(lastRaw.id ?? lastRaw.favorite_item_id ?? lastRaw.item_id);
  }

  let hasMore = root.has_more === true || root.has_more === 1 || root.hasMore === true;
  if (root.has_more === false || root.has_more === 0 || root.hasMore === false) {
    hasMore = false;
  } else if (root.has_more == null && root.hasMore == null) {
    hasMore = items.length > 0;
  }

  return { items, nextLastId, hasMore };
}

/**
 * @param {unknown} data
 * @returns {FavoriteStatus}
 */
export function parseFavoriteStatus(data) {
  const root = asMap(data);
  const favorited =
    root.is_favorite === true ||
    root.is_favorite === 1 ||
    root.isFavorite === true ||
    root.isFavorite === 1;
  const listId = asInt(
    root.list_id ?? root.favorite_id ?? root.listId ?? root.favorite_list_id,
  );
  return { favorited, listId };
}

/**
 * @param {number} userId
 */
export async function fetchFavoriteFolderList(userId) {
  const data = await apiGet('/v1/favorite/get_favorite_list', { user_id: userId });
  return parseFavoriteFolderList(data);
}

/**
 * @param {number} favoriteId
 * @param {number | null | undefined} [lastId]
 */
export async function fetchFavoriteItemsPage(favoriteId, lastId) {
  /** @type {Record<string, string | number>} */
  const query = { favorite_id: favoriteId };
  if (lastId != null && Number.isFinite(lastId) && lastId > 0) {
    query.last_id = lastId;
  }
  const data = await apiGet('/v1/favorite/get_favorite_item', query);
  return parseFavoriteItemsPage(data);
}

/**
 * @param {number | string} resourceId
 * @param {number} resourceType
 */
export async function fetchFavoriteStatus(resourceId, resourceType) {
  const data = await apiGet('/v1/favorite/is_favorite', {
    resource_id: resourceId,
    resource_type: resourceType,
  });
  return parseFavoriteStatus(data);
}

/**
 * @param {number} listId
 * @param {number | string} resourceId
 * @param {number} resourceType
 */
export async function addFavorite(listId, resourceId, resourceType) {
  await apiPostJson('/v1/favorite/add_favorite', {
    list_id: listId,
    resource_id: resourceId,
    type: resourceType,
  });
}

/**
 * @param {number} listId
 * @param {number | string} resourceId
 * @param {number} resourceType
 */
export async function removeFavorite(listId, resourceId, resourceType) {
  await apiPostJson('/v1/favorite/remove_favorite_by_resource', {
    list_id: listId,
    resource_id: resourceId,
    type: resourceType,
  });
}

/**
 * @param {unknown} data
 * @param {{ name: string, desc: string }} fallback
 * @returns {FavoriteFolder | null}
 */
export function parseCreatedFavoriteFolder(data, fallback) {
  const root = asMap(data);
  const nested = asMap(root.data ?? root.list ?? root.folder);
  const fromPayload =
    parseFavoriteFolder(root) || parseFavoriteFolder(nested) || parseFavoriteFolder(root.data);
  if (fromPayload) {
    if (!fromPayload.name && fallback.name) {
      return { ...fromPayload, name: fallback.name, desc: fallback.desc || fromPayload.desc };
    }
    return fromPayload;
  }
  const id = asInt(
    root.id ?? nested.id ?? root.list_id ?? nested.list_id ?? root.favorite_id ?? nested.favorite_id,
  );
  if (id == null || id <= 0) return null;
  return {
    id,
    name: fallback.name || '收藏夹',
    desc: fallback.desc,
    count: 0,
  };
}

/**
 * @param {number} listId
 * @param {string} name
 * @param {string} [desc]
 */
export async function updateFavoriteFolder(listId, name, desc = '') {
  const trimmedName = name.trim();
  const trimmedDesc = desc.trim();
  if (!trimmedName) {
    throw new Error('请填写收藏夹名称');
  }
  if (!Number.isFinite(listId) || listId <= 0) {
    throw new Error('无效的收藏夹');
  }
  await apiPostJson('/v1/favorite/update_favorite_list', {
    list_id: listId,
    favorite_id: listId,
    name: trimmedName,
    desc: trimmedDesc,
  });
  return { id: listId, name: trimmedName, desc: trimmedDesc, count: 0 };
}

/**
 * @param {number} listId
 */
export async function deleteFavoriteFolder(listId) {
  if (!Number.isFinite(listId) || listId <= 0) {
    throw new Error('无效的收藏夹');
  }
  await apiPostJson('/v1/favorite/delete_favorite_list', {
    list_id: listId,
    favorite_id: listId,
  });
}

/**
 * @param {number | null | undefined} userId
 * @param {string | number} resourceId
 * @param {number} resourceType
 * @returns {Promise<Set<number>>}
 */
export async function findFavoriteFoldersForResource(userId, resourceId, resourceType) {
  const uid = resolveMineUserId(userId);
  /** @type {Set<number>} */
  const hits = new Set();
  if (uid == null) return hits;

  const targetId = String(resourceId);
  const folders = await fetchFavoriteFolderList(uid);
  const candidates = folders.filter((folder) => folder.count > 0);
  const chunkSize = 4;

  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (folder) => {
        let lastId = null;
        for (let pageIndex = 0; pageIndex < 40; pageIndex += 1) {
          const page = await fetchFavoriteItemsPage(folder.id, lastId);
          const found = page.items.some(
            (item) => String(item.id) === targetId && item.type === resourceType,
          );
          if (found) {
            hits.add(folder.id);
            return;
          }
          if (!page.hasMore || page.items.length === 0 || page.nextLastId == null) break;
          lastId = page.nextLastId;
        }
      }),
    );
  }

  return hits;
}

/**
 * @param {number | null | undefined} userId
 * @param {string | number} resourceId
 * @param {number} resourceType
 */
export async function resolveFavoriteStatus(userId, resourceId, resourceType) {
  const [apiStatus, folderIds] = await Promise.all([
    fetchFavoriteStatus(resourceId, resourceType).catch(() => ({
      favorited: false,
      listId: null,
    })),
    findFavoriteFoldersForResource(userId, resourceId, resourceType).catch(() => new Set()),
  ]);
  const favorited = apiStatus.favorited || folderIds.size > 0;
  let listId = apiStatus.listId;
  if (listId == null && folderIds.size > 0) {
    listId = folderIds.values().next().value ?? null;
  }
  return { favorited, listId, folderIds };
}

export async function createFavoriteFolder(name, desc = '') {
  const trimmedName = name.trim();
  const trimmedDesc = desc.trim();
  if (!trimmedName) {
    throw new Error('请填写收藏夹名称');
  }
  const data = await apiPostJson('/v1/favorite/create_favorite_list', {
    name: trimmedName,
    desc: trimmedDesc,
  });
  const folder = parseCreatedFavoriteFolder(data, { name: trimmedName, desc: trimmedDesc });
  if (folder) return folder;

  const userId = resolveMineUserId(null);
  if (userId != null) {
    const folders = await fetchFavoriteFolderList(userId);
    const match =
      folders.find((entry) => entry.name === trimmedName) ??
      folders.find((entry) => entry.name.includes(trimmedName));
    if (match) return match;
  }
  throw new Error('创建成功但未返回收藏夹信息，请刷新列表查看');
}

/**
 * @param {number | null | undefined} userId
 */
export function resolveMineUserId(userId) {
  if (userId != null && userId > 0) return userId;
  const user = loadSession()?.user;
  if (!user) return null;
  const id = user.id ?? user.user_id;
  if (typeof id === 'number' && Number.isFinite(id)) return Math.trunc(id);
  const parsed = Number.parseInt(`${id ?? ''}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
