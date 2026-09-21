import { apiGet, apiPostForm, resolveCoverUrl } from './content-api.js';
import { commentSpansFromText, messageQuillJson, quillToText } from './message-quill.js';
import { uploadCommentImage } from './video-api.js';

/** @typedef {import('./message-quill.js').CommentSpan} CommentSpan */

/** @typedef {{
 *   userId: number,
 *   userName: string,
 *   userAvatar: string,
 *   lastMessage: string,
 *   unread: number,
 *   lastTime: string | null,
 * }} MessageConversation */

/** @typedef {{
 *   id: string,
 *   uid: number,
 *   message: string,
 *   raw: string,
 *   spans: CommentSpan[],
 *   images: string[],
 *   time: string | null,
 * }} MessageRecord */

/** @typedef {{
 *   items: MessageRecord[],
 *   nextCursor: string | null,
 *   hasMore: boolean,
 * }} MessageRecordsPage */

/** @typedef {{
 *   like: number,
 *   comment: number,
 *   mention: number,
 *   system: number,
 *   message: number,
 * }} NotifyCounts */

/** @typedef {{
 *   senderUserId: number,
 *   senderName: string,
 *   senderAvatar: string,
 *   createdAt: string | null,
 *   text: string,
 *   commentId: number | null,
 *   areaId: number | null,
 *   resourceId: number | null,
 *   resourceType: number | null,
 * }} NotifyItem */

export const MESSAGE_PAGE_SIZE = 20;

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
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {unknown} value
 */
function nonEmptyString(value) {
  if (value == null) return null;
  const text = `${value}`.trim();
  return text ? text : null;
}

/**
 * @param {unknown} value
 */
function asBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = `${value}`.trim().toLowerCase();
  if (text === 'true' || text === '1') return true;
  if (text === 'false' || text === '0') return false;
  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asDateTime(value) {
  if (typeof value === 'string' && value) {
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const seconds = asInt(value);
  if (seconds == null || seconds <= 0) return null;
  const ms = seconds > 100_000_000_000 ? seconds : seconds * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * @param {string} a
 * @param {string} b
 */
function compareMessageIds(a, b) {
  const aParts = a.split('-');
  const bParts = b.split('-');
  const aTime = BigInt(aParts[0] || '0');
  const bTime = BigInt(bParts[0] || '0');
  if (aTime !== bTime) {
    return aTime < bTime ? -1 : 1;
  }
  const aSeq = aParts.length > 1 ? BigInt(aParts[1] || '0') : null;
  const bSeq = bParts.length > 1 ? BigInt(bParts[1] || '0') : null;
  if (aSeq != null && bSeq != null) {
    if (aSeq === bSeq) return 0;
    return aSeq < bSeq ? -1 : 1;
  }
  return a.localeCompare(b);
}

/**
 * @param {string} tag
 */
function isStickerImageTag(tag) {
  return /\bclass\s*=\s*['"][^'"]*\bsticker\b[^'"]*['"]/i.test(tag);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function feedImages(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (!text.startsWith('[')) {
      const url = resolveCoverUrl(text);
      return url ? [url] : [];
    }
    try {
      return feedImages(JSON.parse(text));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return resolveCoverUrl(item) ?? '';
      const source = asMap(item);
      return resolveCoverUrl(source.url ?? source.src ?? source.image) ?? '';
    })
    .filter(Boolean);
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
function contentImages(raw) {
  const value = `${raw ?? ''}`.trim();
  if (!value) return [];

  if (value.startsWith('{')) {
    try {
      const ops = asMap(JSON.parse(value)).ops;
      if (Array.isArray(ops)) {
        return ops
          .map((op) => {
            const insert = asMap(asMap(op).insert);
            const image = insert.image;
            return typeof image === 'string' && image ? resolveCoverUrl(image) ?? '' : '';
          })
          .filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }

  const imgPattern = /<img[^>]*\bsrc=['"]([^'"]+)['"][^>]*>/gi;
  /** @type {string[]} */
  const urls = [];
  for (const match of value.matchAll(imgPattern)) {
    const tag = match[0] ?? '';
    if (isStickerImageTag(tag)) continue;
    const url = resolveCoverUrl(match[1] ?? '');
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * @param {string[]} urls
 */
function uniqueImages(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

/**
 * @param {string} raw
 * @returns {CommentSpan[]}
 */
function parseCommentSpans(raw) {
  const value = `${raw ?? ''}`.trim();
  if (!value) return [];

  if (value.startsWith('{')) {
    try {
      const ops = asMap(JSON.parse(value)).ops;
      if (Array.isArray(ops)) {
        /** @type {CommentSpan[]} */
        const spans = [];

        const appendText = (text) => {
          if (!text) return;
          const last = spans[spans.length - 1];
          if (last && !last.stickerKey && !last.mentionName && last.text != null) {
            last.text = `${last.text}${text}`;
          } else {
            spans.push({ text });
          }
        };

        for (const op of ops) {
          const insert = asMap(op).insert;
          if (typeof insert === 'string') {
            appendText(insert.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
          } else if (insert && typeof insert === 'object') {
            const mention = asMap(insert.mention);
            const mentionName = `${mention.value ?? ''}`;
            if (mentionName) {
              spans.push({ mentionId: `${mention.id ?? ''}`, mentionName });
            }
            const sticker = insert.sticker;
            if (typeof sticker === 'string' && sticker) {
              spans.push({ stickerKey: sticker });
            }
          }
        }

        const last = spans[spans.length - 1];
        if (last?.text?.endsWith('\n')) {
          const text = last.text.slice(0, -1);
          if (!text) spans.pop();
          else last.text = text;
        }
        return spans;
      }
    } catch {
      /* fall through */
    }
  }

  if (/<[A-Za-z][^>]*>/.test(value)) {
    const stickerPattern = /<img[^>]*class=['"][^'"]*sticker[^'"]*['"][^>]*>/gi;
    /** @type {CommentSpan[]} */
    const spans = [];
    let cursor = 0;
    for (const match of value.matchAll(stickerPattern)) {
      const start = match.index ?? 0;
      const before = htmlToText(value.slice(cursor, start));
      cursor = start + match[0].length;
      if (before) spans.push({ text: before });

      const tag = match[0] ?? '';
      const alt = /alt=['"]([^'"]+)['"]/i.exec(tag)?.[1] ?? null;
      const src = /src=['"]([^'"]+)['"]/i.exec(tag)?.[1] ?? null;
      const key = stickerKeyFromTag(alt, src);
      if (key) spans.push({ stickerKey: key });
    }
    const tail = htmlToText(value.slice(cursor));
    if (tail) spans.push({ text: tail });
    return spans.length ? spans : [{ text: htmlToText(value) }];
  }

  return [{ text: value }];
}

/**
 * @param {string | null | undefined} alt
 * @param {string | null | undefined} src
 */
function stickerKeyFromTag(alt, src) {
  if (alt) {
    const trimmed = alt.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const key = trimmed.slice(1, -1).trim();
      if (key) return key;
    }
  }
  if (!src) return '';
  try {
    const segments = new URL(src, 'https://cdn2.mfuns.net').pathname.split('/').filter(Boolean);
    if (segments.length < 2) return '';
    const id = segments[segments.length - 1].replace(/\.[^.]+$/, '');
    return `${segments[segments.length - 2]}-${id}`;
  } catch {
    return '';
  }
}

/**
 * @param {string} raw
 */
function htmlToText(raw) {
  const withLineBreaks = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return withLineBreaks
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param {Record<string, unknown>} json
 */
function parseMessageConversation(json) {
  const user = asMap(json.user);
  const last = asMap(asMap(json.last_msg ?? json.last_message).data);
  const lastRaw = `${last.message ?? last.msg ?? ''}`;
  let lastMessage = quillToText(lastRaw);
  if (
    !lastMessage &&
    uniqueImages([...feedImages(last.images ?? '[]'), ...contentImages(lastRaw)]).length > 0
  ) {
    lastMessage = '[图片]';
  }

  const userId = asInt(user.id ?? user.user_id ?? json.user_id) ?? 0;
  const userName = `${user.name ?? user.username ?? (userId ? `用户 ${userId}` : '用户')}`;

  return {
    userId,
    userName,
    userAvatar: resolveCoverUrl(user.avatar ?? user.face) ?? '',
    lastMessage,
    unread: asInt(json.no_read ?? json.unread) ?? 0,
    lastTime: asDateTime(last.time ?? json.updated_at ?? json.time),
  };
}

/**
 * @param {Record<string, unknown>} json
 * @param {string | null} [streamId]
 */
function parseMessageRecord(json, streamId = null) {
  const data = asMap(json.data);
  const raw = `${data.message ?? data.msg ?? json.message ?? json.msg ?? ''}`;

  return {
    id: `${json.id ?? json.msg_id ?? data.id ?? data.msg_id ?? streamId ?? ''}`,
    uid: asInt(json.uid ?? data.uid ?? data.user_id) ?? 0,
    message: quillToText(raw),
    raw,
    spans: parseCommentSpans(raw),
    images: uniqueImages([...feedImages(data.images ?? json.images ?? '[]'), ...contentImages(raw)]),
    time: asDateTime(data.time ?? json.time ?? json.created_at),
  };
}

/**
 * @param {unknown} raw
 * @param {string | null} [streamId]
 */
function addMessageRecord(raw, streamId = null) {
  if (Array.isArray(raw) && raw.length >= 2) {
    return parseMessageRecord(asMap(raw[1]), nonEmptyString(raw[0]) ?? streamId);
  }
  if (!raw || typeof raw !== 'object') return null;
  const map = /** @type {Record<string, unknown>} */ (raw);
  const isRecord =
    map.uid != null ||
    map.message != null ||
    map.msg != null ||
    asMap(map.data).message != null ||
    asMap(map.data).msg != null;

  if (isRecord) {
    const id = streamId && !map.id && !map.msg_id ? streamId : null;
    return parseMessageRecord(id ? { id, ...map } : map);
  }

  const nested = map.list ?? map.records ?? map.items ?? map.messages ?? map.data;
  if (nested != null && nested !== raw) {
    return messageRecordsOf(nested);
  }

  return messageRecordsOf(map);
}

/**
 * @param {unknown} raw
 * @returns {MessageRecord[]}
 */
function messageRecordsOf(raw) {
  /** @type {MessageRecord[]} */
  const records = [];

  const collect = (value, streamId = null) => {
    if (Array.isArray(value)) {
      if (value.length >= 2 && !Array.isArray(value[0]) && typeof value[0] !== 'object') {
        const record = parseMessageRecord(asMap(value[1]), nonEmptyString(value[0]) ?? streamId);
        if (record.id || record.message || record.images.length) records.push(record);
        return;
      }
      for (const item of value) {
        const result = addMessageRecord(item);
        if (Array.isArray(result)) records.push(...result);
        else if (result) records.push(result);
      }
      return;
    }

    if (!value || typeof value !== 'object') return;
    const map = /** @type {Record<string, unknown>} */ (value);
    const isRecord =
      map.uid != null ||
      map.message != null ||
      map.msg != null ||
      asMap(map.data).message != null ||
      asMap(map.data).msg != null;

    if (isRecord) {
      const record = parseMessageRecord(
        streamId && !map.id && !map.msg_id ? { id: streamId, ...map } : map,
      );
      if (record.id || record.message || record.images.length) records.push(record);
      return;
    }

    const nested = map.list ?? map.records ?? map.items ?? map.messages ?? map.data;
    if (nested != null && nested !== value) {
      collect(nested);
      return;
    }

    for (const [key, entry] of Object.entries(map)) {
      collect(entry, nonEmptyString(key));
    }
  };

  collect(raw);
  return records;
}

/**
 * @param {MessageRecord[]} items
 */
function oldestMessageId(items) {
  const ids = items.map((item) => item.id).filter(Boolean);
  if (!ids.length) return null;
  return ids.reduce((oldest, id) => (compareMessageIds(id, oldest) < 0 ? id : oldest));
}

/**
 * @param {unknown} data
 * @returns {MessageRecordsPage}
 */
function parseMessageRecordsPage(data) {
  const root = asMap(data);
  const rawRecords = Array.isArray(data)
    ? data
    : root.list ?? root.records ?? root.items ?? root.messages ?? root.data ?? root;

  let items = messageRecordsOf(rawRecords);
  if (items.length && items.every((item) => item.id)) {
    items = [...items].sort((a, b) => compareMessageIds(a.id, b.id));
  }

  const explicitCursor = nonEmptyString(
    root.next_msg_id ?? root.next_cursor ?? root.last_id ?? root.cursor,
  );
  const nextCursor = explicitCursor ?? oldestMessageId(items);
  const explicitHasMore = asBool(root.has_more ?? root.hasMore ?? root.more);

  return {
    items,
    nextCursor,
    hasMore: explicitHasMore ?? (items.length > 0 && nextCursor != null),
  };
}

/**
 * @param {number} page
 */
export async function fetchConversationList(page = 1) {
  const data = await apiGet('/v1/message/list', { page });
  const rawList = Array.isArray(data) ? data : asMap(data).list;
  if (!Array.isArray(rawList)) return [];

  return rawList
    .filter((item) => item && typeof item === 'object')
    .map((item) => parseMessageConversation(/** @type {Record<string, unknown>} */ (item)))
    .filter((item) => item.userId > 0);
}

/**
 * @param {number} userId
 * @param {string} [msgId]
 */
export async function fetchMessageRecords(userId, msgId) {
  const query = { uid: userId, html: 1 };
  if (msgId) query.msg_id = msgId;
  const data = await apiGet('/v1/message/record', query);
  return parseMessageRecordsPage(data);
}

/**
 * @param {number} toUid
 * @param {string} text
 * @param {string[]} [imagePaths]
 */
export async function sendMessage(toUid, text, imagePaths = []) {
  const spans = commentSpansFromText(text.trim());
  const msg = messageQuillJson(spans, imagePaths);
  await apiPostForm('/v1/message/send', { to_uid: toUid, msg });
}

export { uploadCommentImage };

/**
 * @returns {Promise<NotifyCounts>}
 */
export async function fetchNotifyCounts() {
  const data = await apiGet('/v1/notify/count');
  const root = asMap(data);
  return {
    like: asInt(root.like) ?? 0,
    comment: asInt(root.comment) ?? 0,
    mention: asInt(root.mention) ?? 0,
    system: asInt(root.system) ?? 0,
    message: asInt(root.message) ?? 0,
  };
}

/**
 * @param {string} value
 */
function resourceTypeFromText(value) {
  const type = `${value ?? ''}`.trim().toLowerCase();
  if (type.includes('video')) return 1;
  if (type.includes('article') || type.includes('post')) return 0;
  if (type.includes('feed') || type.includes('dynamic') || type.includes('comment')) return 4;
  return null;
}

/**
 * @param {string} raw
 */
function notifyBodyText(raw) {
  const value = `${raw ?? ''}`.trim();
  if (!value) return '';
  if (value.startsWith('{')) return quillToText(value);
  if (value.includes('<')) return htmlToText(value);
  return value;
}

/**
 * @param {Record<string, unknown>} json
 */
function parseNotifyItem(json) {
  const params = asMap(json.notify_params ?? json.params);
  const sender = asMap(json.sender ?? json.user ?? json.user_info);
  const resource = asMap(params.resource);

  const resourceType =
    asInt(
      params.resource_type ??
        params.resourceType ??
        json.resource_type ??
        resource.type ??
        resource.resource_type ??
        json.content_type,
    ) ?? resourceTypeFromText(`${params.resource_type ?? resource.type ?? ''}`);

  return {
    senderUserId: asInt(json.sender_user_id ?? sender.id ?? sender.user_id) ?? 0,
    senderName: `${sender.name ?? sender.username ?? ''}`,
    senderAvatar: resolveCoverUrl(sender.avatar ?? sender.face) ?? '',
    createdAt: asDateTime(json.created_at ?? json.time),
    text: notifyBodyText(
      `${params.reply_text ?? params.text ?? params.content ?? json.content ?? json.text ?? json.title ?? ''}`,
    ),
    commentId: asInt(params.comment_id),
    areaId: asInt(params.area_id ?? json.area_id),
    resourceId: asInt(
      params.resource_id ??
        params.resourceId ??
        json.resource_id ??
        resource.id ??
        resource.resource_id ??
        json.content_id,
    ),
    resourceType,
  };
}

/**
 * @param {unknown} data
 * @returns {NotifyItem[]}
 */
function parseNotifyList(data) {
  const root = asMap(data);
  const rawList = Array.isArray(data)
    ? data
    : root.list ?? root.items ?? root.data ?? root.notifications;
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((item) => item && typeof item === 'object')
    .map((item) => parseNotifyItem(/** @type {Record<string, unknown>} */ (item)));
}

/**
 * @param {number} type
 * @param {number} page
 */
export async function fetchNotifications(type, page = 1) {
  const data = await apiGet('/v1/notify/get', { type, page });
  return parseNotifyList(data);
}

/**
 * @param {number} page
 */
export async function fetchSiteNotifications(page = 1) {
  const data = await apiGet('/v1/notify/site', { page, html: 1 });
  return parseNotifyList(data);
}

/**
 * @param {NotifyItem} item
 */
export function notifyItemKey(item) {
  const time = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  return `${item.senderUserId}|${item.commentId ?? ''}|${item.resourceId ?? ''}|${time}`;
}

/**
 * @param {number} commentId
 * @returns {Promise<{ resourceId: number, resourceType: number } | null>}
 */
export async function fetchCommentResource(commentId) {
  const data = await apiGet('/v1/comment/get_resource', { id: commentId });
  const root = asMap(data);
  const resourceId = asInt(root.resource_id);
  const resourceType = asInt(root.resource_type);
  if (resourceId == null || resourceType == null) return null;
  return { resourceId, resourceType };
}

/**
 * @param {number} commentId
 * @returns {Promise<number | null>}
 */
export async function fetchCommentAreaId(commentId) {
  const data = await apiGet('/v1/comment/get', { id: commentId, html: 0 });
  const comment = asMap(asMap(data).comment);
  return asInt(comment.comment_area_id);
}

/**
 * @param {number} areaId
 * @returns {Promise<{ resourceId: number, resourceType: number } | null>}
 */
export async function fetchCommentAreaInfo(areaId) {
  const data = await apiGet('/v1/comment/area_info', { area_id: areaId });
  const root = asMap(data);
  const resourceId = asInt(root.resource_id);
  const resourceType = asInt(root.resource_type);
  if (resourceId == null || resourceType == null) return null;
  return { resourceId, resourceType };
}

/**
 * @param {NotifyItem} item
 * @returns {Promise<{ resourceId: number, resourceType: number } | null>}
 */
export async function resolveNotifyResource(item) {
  if (item.resourceId != null && item.resourceType != null) {
    if (item.resourceType === 4) {
      const viaResource = await fetchCommentResource(item.resourceId).catch(() => null);
      if (viaResource) return viaResource;
    } else {
      return { resourceId: item.resourceId, resourceType: item.resourceType };
    }
  }

  if (item.commentId != null) {
    const viaComment = await fetchCommentResource(item.commentId).catch(() => null);
    if (viaComment) return viaComment;

    const areaId = await fetchCommentAreaId(item.commentId).catch(() => null);
    if (areaId != null) {
      return await fetchCommentAreaInfo(areaId).catch(() => null);
    }
  }

  return null;
}

/**
 * @param {string | null | undefined} iso
 */
/**
 * @param {string | null | undefined} iso
 */
export function formatNotifyTime(iso) {
  if (!iso) return '';
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - value.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;
  const hh = `${value.getHours()}`.padStart(2, '0');
  const mm = `${value.getMinutes()}`.padStart(2, '0');
  return `${value.getMonth() + 1}-${value.getDate()} ${hh}:${mm}`;
}

/**
 * @param {string | null | undefined} iso
 */
export function formatMessageTime(iso) {
  if (!iso) return '';
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const hh = `${value.getHours()}`.padStart(2, '0');
  const mm = `${value.getMinutes()}`.padStart(2, '0');
  const hhmm = `${hh}:${mm}`;

  if (day.getTime() === today.getTime()) return hhmm;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day.getTime() === yesterday.getTime()) return `昨天 ${hhmm}`;
  if (value.getFullYear() === now.getFullYear()) return `${value.getMonth() + 1}-${value.getDate()} ${hhmm}`;
  return `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
}
