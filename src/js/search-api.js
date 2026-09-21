import { apiGet, parsePreviewList } from './content-api.js';
import { userProfilesFromListData } from './user-profile-api.js';

export const SEARCH_PAGE_SIZE = 20;

/**
 * @typedef {{
 *   items: import('./content-api.js').ContentPreview[],
 *   total: number | null,
 *   totalPages: number,
 *   hasNext: boolean,
 *   exactTotalPages: boolean,
 *   page: number,
 * }} SearchResourcePage
 */

/**
 * @typedef {{
 *   items: import('./user-profile-api.js').UserProfile[],
 *   total: number | null,
 *   totalPages: number,
 *   hasNext: boolean,
 *   exactTotalPages: boolean,
 *   page: number,
 * }} SearchUserPage
 */

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
 * 搜索分页（对齐 Flutter `SubmissionItemsPage.fromData`）：
 * 只认 `total` / `total_count`（及少数接口的 `pages` 总条数），用 `page * size < total` 判断下一页。
 * 勿把 `total_page`、`page_num`、`count`、`num`、`all_count` 当作分页依据。
 * @param {unknown} data
 * @param {number} page
 * @param {number} size
 * @param {number} itemCount
 */
export function parseSearchPageMeta(data, page, size, itemCount) {
  const root = asMap(data);
  const nested = asMap(root.data);

  const totalHits =
    asInt(root.total ?? root.total_count) ??
    asInt(nested.total ?? nested.total_count) ??
    asInt(root.pages ?? nested.pages) ??
    null;

  if (itemCount === 0 && page > 1) {
    return {
      total: totalHits,
      totalPages: Math.max(1, page - 1),
      hasNext: false,
      exactTotalPages: true,
    };
  }

  if (totalHits != null && totalHits >= 0 && size > 0) {
    const totalPages = Math.max(1, Math.ceil(totalHits / size));
    const consumed = page * size;
    return {
      total: totalHits,
      totalPages,
      hasNext: consumed < totalHits,
      exactTotalPages: true,
    };
  }

  if (itemCount < size) {
    return {
      total: null,
      totalPages: Math.max(1, page),
      hasNext: false,
      exactTotalPages: true,
    };
  }

  return {
    total: null,
    totalPages: Math.max(1, page),
    hasNext: itemCount >= size,
    exactTotalPages: false,
  };
}

/**
 * @param {string} keyword
 * @param {number} [page]
 * @param {number} [size]
 * @param {number} [type] -1 综合，0 文章，1 视频
 * @returns {Promise<SearchResourcePage>}
 */
export async function searchResources(keyword, page = 1, size = SEARCH_PAGE_SIZE, type = -1) {
  const text = `${keyword ?? ''}`.trim();
  if (!text) {
    return {
      items: [],
      total: 0,
      totalPages: 1,
      hasNext: false,
      exactTotalPages: true,
      page: 1,
    };
  }
  const data = await apiGet('/v1/search/resource', {
    text,
    type,
    page,
    size,
    sort: 'all',
  });
  const items = parsePreviewList(data);
  const meta = parseSearchPageMeta(data, page, size, items.length);
  return { items, ...meta, page };
}

/**
 * @param {string} keyword
 * @param {number} [page]
 * @param {number} [size]
 * @returns {Promise<SearchUserPage>}
 */
export async function searchUsers(keyword, page = 1, size = SEARCH_PAGE_SIZE) {
  const user = `${keyword ?? ''}`.trim();
  if (!user) {
    return {
      items: [],
      total: 0,
      totalPages: 1,
      hasNext: false,
      exactTotalPages: true,
      page: 1,
    };
  }
  const data = await apiGet('/v1/search/user', { user, page, size });
  const items = userProfilesFromListData(data);
  const meta = parseSearchPageMeta(data, page, size, items.length);
  return { items, ...meta, page };
}
