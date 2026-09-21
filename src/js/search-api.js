import { apiGet, parsePreviewList } from './content-api.js';

const PAGE_SIZE = 20;

/**
 * @param {string} keyword
 * @param {number} [page]
 * @param {number} [size]
 * @param {number} [type] -1 综合，0 文章，1 视频
 */
export async function searchResources(keyword, page = 1, size = PAGE_SIZE, type = -1) {
  const text = `${keyword ?? ''}`.trim();
  if (!text) return [];
  const data = await apiGet('/v1/search/resource', {
    text,
    type,
    page,
    size,
    sort: 'all',
  });
  return parsePreviewList(data);
}

export { searchUsers } from './user-profile-api.js';
