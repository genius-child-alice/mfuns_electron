import { apiPostJson } from './content-api.js';
import { messageQuillJson } from './message-quill.js';

/**
 * @param {object} params
 * @param {string} params.content
 * @param {string[]} [params.images]
 * @param {string[]} [params.tags]
 */
export async function createFeed(params) {
  const { content, images = [], tags = [] } = params;
  await apiPostJson('/v1/feeds/create', {
    content: messageQuillJson([{ text: content }], []),
    images: JSON.stringify(images),
    ...(tags.length ? { tags: tags.join(',') } : {}),
  });
}

/**
 * @param {object} params
 * @param {string} params.content
 * @param {number} params.resourceId
 * @param {number} params.resourceType 0=文章, 1=视频, 3=动态
 */
export async function forwardFeed(params) {
  const { content, resourceId, resourceType } = params;
  await apiPostJson('/v1/feeds/forward', {
    content: messageQuillJson([{ text: content }], []),
    resource_type: resourceType,
    resource_id: resourceId,
  });
}

/**
 * @param {number} feedId
 */
export async function deleteFeed(feedId) {
  await apiPostJson('/v1/feeds/delete', { id: feedId });
}

/**
 * @param {number} resourceType
 */
export function feedForwardTypeLabel(resourceType) {
  switch (resourceType) {
    case 0:
      return '文章';
    case 1:
      return '视频';
    case 3:
      return '动态';
    default:
      return '内容';
  }
}
