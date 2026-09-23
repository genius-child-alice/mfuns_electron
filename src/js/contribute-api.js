import { apiGet, apiPostJson, resolveCoverUrl } from './content-api.js';

/** @typedef {{ id: number, resourceId: number | null, title: string, status: number, createdAt: Date | null, cover: string }} SubmissionItem */
/** @typedef {{ type: string, content: unknown, title: string, meta: Record<string, unknown>, extra: Record<string, unknown> }} SubmissionVideoPart */
/** @typedef {{ id: number, resourceId: number | null, title: string, content: string, status: number, categoryId: number | null, tags: string[], cover: string, rawContent: string, contentFormat: string, videos: SubmissionVideoPart[], copyright: number | null, draft: boolean, rejectReason: string, publishTime: Date | null, seriesId: number | null }} SubmissionDetail */
/** @typedef {{ videoId: string, accessKeyId: string, accessKeySecret: string, securityToken: string, endpoint: string, bucket: string, objectKey: string }} VideoUploadAuth */
/** @typedef {{ items: SubmissionItem[], hasMore: boolean, total: number | null }} SubmissionItemsPage */

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asInt(value) {
  if (value == null || value === '') return null;
  const n = Number.parseInt(`${value}`, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asMap(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {Date | null}
 */
function asDate(value) {
  if (!value) return null;
  const d = new Date(`${value}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function coverUrl(value) {
  return resolveCoverUrl(value) ?? '';
}

/**
 * @param {number} status
 */
export function submissionStatusLabel(status) {
  switch (status) {
    case 0:
      return '草稿';
    case 1:
      return '已发布';
    case 2:
      return '审核中';
    case 3:
      return '驳回';
    case 4:
      return '被驳回修改';
    case 5:
      return '定时发布';
    default:
      return `状态 ${status}`;
  }
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function toTags(raw) {
  if (Array.isArray(raw)) {
    return raw.map((item) => `${item ?? ''}`.trim()).filter(Boolean);
  }
  const text = `${raw ?? ''}`.trim();
  if (!text) return [];
  return text
    .split(/[,，]/)
    .map((item) => item.trim().replace(/^#+/, ''))
    .filter(Boolean);
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function quillToPlainText(raw) {
  const value = `${raw ?? ''}`.trim();
  if (!value) return '';
  if (value.startsWith('{')) {
    try {
      const decoded = JSON.parse(value);
      const ops = decoded && typeof decoded === 'object' ? decoded.ops : null;
      if (Array.isArray(ops)) {
        return ops
          .map((op) => (op && typeof op.insert === 'string' ? op.insert : ''))
          .join('')
          .trim();
      }
    } catch {
      /* fall through */
    }
  }
  return value;
}

/**
 * @param {string} textOrJson
 */
export function encodeVideoContent(textOrJson) {
  const value = `${textOrJson ?? ''}`.trim();
  if (!value) return JSON.stringify({ ops: [{ insert: '\n' }] });
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ops)) {
        return value;
      }
    } catch {
      /* fall through */
    }
  }
  return JSON.stringify({
    ops: [{ insert: `${value}\n` }],
  });
}

/**
 * @param {unknown} raw
 * @returns {SubmissionVideoPart[]}
 */
function parseSubmissionVideos(raw) {
  let list = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const json = /** @type {Record<string, unknown>} */ (item);
      const extra = { ...json };
      delete extra.type;
      delete extra.content;
      delete extra.title;
      delete extra.meta;
      return {
        type: `${json.type ?? 'direct'}`,
        content: json.content,
        title: `${json.title ?? ''}`,
        meta: asMap(json.meta),
        extra,
      };
    });
}

/**
 * @param {SubmissionVideoPart} part
 */
export function videoPartToJson(part) {
  return {
    ...part.extra,
    type: part.type,
    content: part.content,
    title: part.title,
    ...(Object.keys(part.meta).length ? { meta: part.meta } : {}),
  };
}

/**
 * @param {unknown} data
 */
function parseSubmissionItem(data) {
  const json = asMap(data);
  const resource = asMap(json.resource);
  const id = asInt(json.id) ?? 0;
  return {
    id,
    resourceId: asInt(json.resource_id),
    title: `${json.title ?? resource.title ?? ''}`,
    status: asInt(json.status) ?? 0,
    createdAt: asDate(json.created_at),
    cover: coverUrl(json.cover ?? resource.cover),
  };
}

/**
 * @param {unknown} data
 * @param {number} page
 * @param {number} size
 * @returns {SubmissionItemsPage}
 */
function parseSubmissionItemsPage(data, page, size) {
  const root = asMap(data);
  const nested = asMap(root.data);
  const rawList = Array.isArray(data)
    ? data
    : root.list ?? root.items ?? nested.list ?? nested.items;
  const items = Array.isArray(rawList)
    ? rawList
        .map(parseSubmissionItem)
        .filter((item) => item.id !== 0)
    : [];
  const total = asInt(root.total ?? nested.total);
  const hasMore =
    total != null ? page * size < total : Array.isArray(rawList) && rawList.length >= size;
  return { items, hasMore, total };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function pickRejectReason(...values) {
  for (const value of values) {
    const text = `${value ?? ''}`.trim();
    if (text) return text;
  }
  return '';
}

/**
 * @param {unknown} data
 * @returns {SubmissionDetail}
 */
function parseSubmissionDetail(data) {
  const root = asMap(data);
  const source = Object.keys(asMap(root.contribute)).length ? asMap(root.contribute) : root;
  const resource = asMap(source.resource ?? root.resource);
  const rawContent = `${source.content ?? source.summary ?? ''}`;
  const contentFormat = `${source.content_format ?? ''}`;
  const content =
    contentFormat === 'markdown' || !rawContent.startsWith('{')
      ? rawContent
      : quillToPlainText(rawContent);
  const status = asInt(source.status) ?? 0;
  const copyright = asInt(source.copyright ?? resource.copyright);
  const draftRaw = source.draft;
  const draft =
    draftRaw === true ||
    draftRaw === 1 ||
    `${draftRaw}` === '1' ||
    (draftRaw == null && status === 0);
  const publishTime = asDate(
    source.publish_time ??
      source.publish_at ??
      resource.publish_time ??
      root.publish_time,
  );
  const rejectReason = pickRejectReason(
    source.reject_reason,
    source.reject_msg,
    source.reason,
    source.audit_reason,
    source.audit_msg,
    resource.reject_reason,
    resource.reason,
    root.reject_reason,
  );
  return {
    id: asInt(source.id) ?? 0,
    resourceId: asInt(source.resource_id),
    title: `${source.title ?? ''}`,
    content,
    status,
    categoryId: asInt(source.category_id ?? source.cid),
    tags: toTags(source.tags),
    cover: `${source.cover ?? resource.cover ?? ''}`.trim(),
    rawContent,
    contentFormat,
    videos: parseSubmissionVideos(
      source.videos ?? source.video ?? root.videos ?? root.video,
    ),
    copyright,
    draft,
    rejectReason,
    publishTime,
    seriesId: asInt(source.series_id ?? resource.series_id ?? root.series_id),
  };
}

/**
 * @param {unknown} data
 * @returns {VideoUploadAuth}
 */
export function parseVideoUploadAuth(data) {
  const json = asMap(data);
  const authRaw = json.UploadAuth ?? json.upload_auth;
  const addressRaw = json.UploadAddress ?? json.upload_address;
  const auth = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(`${authRaw}`.trim()), (c) => c.charCodeAt(0)),
    ),
  );
  const address = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(`${addressRaw}`.trim()), (c) => c.charCodeAt(0)),
    ),
  );
  const authMap = asMap(auth);
  const addressMap = asMap(address);
  let endpoint = `${addressMap.Endpoint ?? ''}`;
  if (endpoint.startsWith('http://')) endpoint = endpoint.slice('http://'.length);
  else if (endpoint.startsWith('https://')) endpoint = endpoint.slice('https://'.length);
  return {
    videoId: `${json.VideoId ?? json.video_id ?? ''}`,
    accessKeyId: `${authMap.AccessKeyId ?? ''}`,
    accessKeySecret: `${authMap.AccessKeySecret ?? ''}`,
    securityToken: `${authMap.SecurityToken ?? ''}`,
    endpoint,
    bucket: `${addressMap.Bucket ?? ''}`,
    objectKey: `${addressMap.FileName ?? addressMap.ObjectName ?? ''}`,
  };
}

/**
 * @param {number} type 0=article, 1=video
 * @param {number} [page]
 * @param {number} [size]
 * @param {number | null} [status]
 */
export async function fetchSubmissionsPage(type, page = 1, size = 20, status = null) {
  const query = { type, page, size };
  if (status != null) query.status = status;
  const data = await apiGet('/v1/contribute/list', query);
  return parseSubmissionItemsPage(data, page, size);
}

/** @type {{ id: string, label: string, status: number | null }[]} */
export const SUBMISSION_STATUS_FILTERS = [
  { id: 'all', label: '全部', status: null },
  { id: 'draft', label: '草稿', status: 0 },
  { id: 'review', label: '审核中', status: 2 },
  { id: 'published', label: '已发布', status: 1 },
  { id: 'rejected', label: '驳回', status: 3 },
  { id: 'rejected-edit', label: '待修改', status: 4 },
  { id: 'scheduled', label: '定时', status: 5 },
];

/**
 * @param {number} type
 */
export async function fetchSubmissionTotal(type) {
  const data = await apiGet('/v1/contribute/list', { type, page: 1, size: 1 });
  const root = asMap(data);
  const total = asInt(root.total);
  if (total != null) return total;
  const rawList = Array.isArray(data) ? data : root.list;
  return Array.isArray(rawList) ? rawList.length : 0;
}

/**
 * @param {number} contributeId
 */
export async function fetchSubmissionDetail(contributeId) {
  const data = await apiGet('/v1/contribute/get', { contribute_id: contributeId });
  return parseSubmissionDetail(data);
}

/**
 * @param {string} fileName
 * @param {number} fileSize
 */
export async function getVideoUploadAuth(fileName, fileSize) {
  const data = await apiPostJson('/v1/contribute/video/get_upload_auth', {
    file_name: fileName,
    file_size: fileSize,
  });
  const auth = parseVideoUploadAuth(data);
  if (
    !auth.videoId ||
    !auth.accessKeyId ||
    !auth.accessKeySecret ||
    !auth.bucket ||
    !auth.objectKey
  ) {
    throw new Error('未获取到有效的上传凭证');
  }
  return auth;
}

/**
 * @param {string} videoId
 */
export async function completeVideoUpload(videoId) {
  const retries = 12;
  const delayMs = 5000;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const data = await apiPostJson('/v1/contribute/video/upload_complete', {
        videoId,
      });
      const root = asMap(data);
      const libraryId = asInt(root.id);
      if (root.status === 1 || libraryId != null) {
        if (libraryId != null) {
          return {
            id: libraryId,
            fileSize: asInt(root.file_size ?? root.size),
            duration: asInt(root.video_duration ?? root.duration),
          };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : `${err}`;
      if (!message.includes('未完成') || attempt === retries - 1) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('视频上传完成确认失败，请稍后重试');
}

/**
 * @param {object} params
 */
/**
 * @param {Date | null | undefined} value
 */
function publishTimePayload(value) {
  if (!value || Number.isNaN(value.getTime())) return {};
  return { publish_time: Math.floor(value.getTime() / 1000) };
}

export async function createArticleSubmission(params) {
  const {
    title,
    content,
    categoryId,
    tags = [],
    copyright = 2,
    cover = '',
    draft = false,
    publishTime = null,
    seriesId = null,
  } = params;
  await apiPostJson('/v1/contribute/article/create', {
    cid: categoryId,
    title,
    content,
    content_format: 'markdown',
    copyright,
    draft,
    ...(tags.length ? { tags: tags.join(',') } : {}),
    ...(cover ? { cover } : {}),
    ...(seriesId != null && seriesId > 0 ? { series_id: seriesId } : {}),
    ...publishTimePayload(publishTime),
  });
}

/**
 * @param {object} params
 */
export async function updateArticleSubmission(params) {
  const {
    contributeId,
    title,
    content,
    categoryId,
    tags = [],
    copyright = 2,
    cover = '',
    draft = false,
    publishTime = null,
    seriesId = null,
  } = params;
  await apiPostJson('/v1/contribute/article/update', {
    contribute_id: contributeId,
    cid: categoryId,
    title,
    content,
    content_format: 'markdown',
    copyright,
    draft,
    ...(tags.length ? { tags: tags.join(',') } : {}),
    ...(cover ? { cover } : {}),
    ...(seriesId != null && seriesId > 0 ? { series_id: seriesId } : {}),
    ...publishTimePayload(publishTime),
  });
}

/**
 * @param {object} params
 */
export async function createVideoSubmission(params) {
  const {
    title,
    content,
    categoryId,
    videos,
    tags = [],
    copyright = 0,
    cover = '',
    publishTime = null,
    seriesId = null,
  } = params;
  await apiPostJson('/v1/contribute/video/create', {
    cid: categoryId,
    title,
    content: encodeVideoContent(content),
    cover,
    video: JSON.stringify(videos.map(videoPartToJson)),
    copyright,
    ...(tags.length ? { tags: tags.join(',') } : {}),
    ...(seriesId != null && seriesId > 0 ? { series_id: seriesId } : {}),
    ...publishTimePayload(publishTime),
  });
}

/**
 * @param {object} params
 */
export async function updateVideoSubmission(params) {
  const {
    contributeId,
    title,
    content,
    categoryId,
    videos,
    tags = [],
    copyright = 0,
    cover = '',
    publishTime = null,
    seriesId = null,
  } = params;
  await apiPostJson('/v1/contribute/video/update', {
    contribute_id: contributeId,
    cid: categoryId,
    title,
    content: encodeVideoContent(content),
    video: JSON.stringify(videos.map(videoPartToJson)),
    copyright,
    ...(tags.length ? { tags: tags.join(',') } : {}),
    ...(cover ? { cover } : {}),
    ...(seriesId != null && seriesId > 0 ? { series_id: seriesId } : {}),
    ...publishTimePayload(publishTime),
  });
}

/**
 * @param {number} type
 * @param {number} contributeId
 */
export async function deleteSubmission(type, contributeId) {
  const path =
    type === 1 ? '/v1/contribute/video/delete' : '/v1/contribute/article/delete';
  await apiPostJson(path, { contribute_id: contributeId });
}

/**
 * @param {import('./content-api.js').CategoryNode[]} categories
 */
export function leafCategories(categories) {
  const parentIds = new Set(
    categories.map((node) => node.parentId).filter((id) => id != null),
  );
  const leaves = categories.filter((node) => !parentIds.has(node.id));
  return leaves.length ? leaves : categories;
}

/**
 * @param {import('./content-api.js').CategoryNode[]} categories
 * @param {import('./content-api.js').CategoryNode} node
 */
export function categoryDisplayName(categories, node) {
  if (!node.parentId) return node.name;
  const parent = categories.find((item) => item.id === node.parentId);
  return parent ? `${parent.name} · ${node.name}` : node.name;
}

/**
 * @param {Date} value
 */
export function formatSubmissionTime(value) {
  const now = new Date();
  const two = (n) => String(n).padStart(2, '0');
  if (
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate()
  ) {
    return `今天 ${two(value.getHours())}:${two(value.getMinutes())}`;
  }
  return `${value.getFullYear()}-${two(value.getMonth() + 1)}-${two(value.getDate())}`;
}
