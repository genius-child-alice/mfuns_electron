import { resolveMineUserId } from './favorite-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

/** @typedef {ContentPreview & { addedAt: string }} WatchLaterEntry */

const STORAGE_KEY = 'mfuns.watch_later.v1';
const MAX_ITEMS = 500;

/**
 * @param {unknown} value
 */
function asMap(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @param {number} userId
 */
function bucketKey(userId) {
  return userId > 0 ? String(userId) : 'guest';
}

/**
 * @param {number | null | undefined} userId
 */
function resolveStorageUserId(userId) {
  if (userId != null && userId > 0) return userId;
  const sessionId = resolveMineUserId(null);
  return sessionId ?? 0;
}

/**
 * @returns {Record<string, WatchLaterEntry[]>}
 */
function loadBuckets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const buckets = asMap(parsed).buckets ?? parsed;
    if (!buckets || typeof buckets !== 'object') return {};
    return /** @type {Record<string, WatchLaterEntry[]>} */ (buckets);
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, WatchLaterEntry[]>} buckets
 */
function saveBuckets(buckets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ buckets }));
}

function notifyWatchLaterChanged() {
  window.dispatchEvent(new CustomEvent('mfuns:watch-later-changed'));
}

/**
 * @param {WatchLaterEntry | null | undefined} entry
 */
function isSupportedWatchLaterEntry(entry) {
  return Boolean(entry && (entry.type === 0 || entry.type === 1) && `${entry.id ?? ''}`.trim());
}

/**
 * 本机稍后再看用户桶：已登录用账号 id，未登录用 guest。
 */
export function resolveWatchLaterUserId() {
  return resolveStorageUserId(null);
}

/**
 * @param {ContentPreview} preview
 * @returns {WatchLaterEntry | null}
 */
export function snapshotWatchLaterEntry(preview) {
  const type = preview.type;
  if (type !== 0 && type !== 1) return null;
  const id = `${preview.id ?? ''}`.trim();
  if (!id) return null;
  return {
    id,
    title: preview.title || (type === 1 ? '视频' : '文章'),
    cover: preview.cover ?? null,
    author: preview.author || '',
    authorId: preview.authorId ?? null,
    authorAvatar: preview.authorAvatar ?? null,
    type,
    views: preview.views ?? 0,
    comments: preview.comments ?? 0,
    duration: preview.duration ?? 0,
    createdAt: preview.createdAt ?? null,
    addedAt: new Date().toISOString(),
  };
}

/**
 * @param {number | null | undefined} userId
 * @returns {WatchLaterEntry[]}
 */
export function listWatchLater(userId) {
  const id = resolveStorageUserId(userId);
  const list = loadBuckets()[bucketKey(id)];
  return Array.isArray(list) ? list.filter((entry) => isSupportedWatchLaterEntry(entry)) : [];
}

/**
 * @param {number | null | undefined} userId
 * @param {string | number} contentId
 * @param {0 | 1} contentType
 */
export function isInWatchLater(userId, contentId, contentType) {
  const id = `${contentId ?? ''}`.trim();
  if (!id) return false;
  return listWatchLater(userId).some((entry) => entry.id === id && entry.type === contentType);
}

/**
 * @param {number | null | undefined} userId
 * @param {string | number} videoId
 */
export function isVideoInWatchLater(userId, videoId) {
  return isInWatchLater(userId, videoId, 1);
}

/**
 * @param {number | null | undefined} userId
 * @param {ContentPreview} preview
 */
export function addToWatchLater(userId, preview) {
  const entry = snapshotWatchLaterEntry(preview);
  if (!entry) return false;

  const uid = resolveStorageUserId(userId);
  const buckets = loadBuckets();
  const key = bucketKey(uid);
  const list = Array.isArray(buckets[key])
    ? buckets[key].filter((item) => item?.id !== entry.id || item?.type !== entry.type)
    : [];
  list.unshift(entry);
  buckets[key] = list.slice(0, MAX_ITEMS);
  saveBuckets(buckets);
  notifyWatchLaterChanged();
  return true;
}

/** @deprecated 使用 addToWatchLater */
export const addVideoToWatchLater = addToWatchLater;

/**
 * @param {number | null | undefined} userId
 * @param {string | number} contentId
 * @param {0 | 1} contentType
 */
export function removeFromWatchLater(userId, contentId, contentType) {
  const uid = resolveStorageUserId(userId);
  const id = `${contentId ?? ''}`.trim();
  if (!id) return false;

  const buckets = loadBuckets();
  const key = bucketKey(uid);
  const list = buckets[key];
  if (!Array.isArray(list)) return false;
  const next = list.filter((entry) => entry?.id !== id || entry.type !== contentType);
  if (next.length === list.length) return false;
  buckets[key] = next;
  saveBuckets(buckets);
  notifyWatchLaterChanged();
  return true;
}

/**
 * @param {number | null | undefined} userId
 * @param {string | number} videoId
 */
export function removeVideoFromWatchLater(userId, videoId) {
  return removeFromWatchLater(userId, videoId, 1);
}

/**
 * @param {number | null | undefined} userId
 */
export function clearWatchLater(userId) {
  const uid = resolveStorageUserId(userId);
  const buckets = loadBuckets();
  delete buckets[bucketKey(uid)];
  saveBuckets(buckets);
  notifyWatchLaterChanged();
}

/**
 * @param {number | null | undefined} userId
 * @param {ContentPreview} preview
 * @returns {boolean} 当前是否在稍后再看中
 */
export function toggleWatchLater(userId, preview) {
  const type = preview.type;
  if (type !== 0 && type !== 1) return false;
  const id = `${preview.id ?? ''}`.trim();
  if (!id) return false;
  if (isInWatchLater(userId, id, type)) {
    removeFromWatchLater(userId, id, type);
    return false;
  }
  addToWatchLater(userId, preview);
  return true;
}

/** @deprecated 使用 toggleWatchLater */
export const toggleVideoWatchLater = toggleWatchLater;

/**
 * 登录后将 guest 桶合并进账号桶（同 id+type 保留较新 addedAt）。
 * @param {number} userId
 * @returns {number} 合并条数
 */
export function mergeGuestWatchLaterIntoUser(userId) {
  if (!Number.isFinite(userId) || userId <= 0) return 0;
  const buckets = loadBuckets();
  const guestList = buckets.guest;
  if (!Array.isArray(guestList) || guestList.length === 0) return 0;

  const userKey = bucketKey(userId);
  const userList = Array.isArray(buckets[userKey]) ? [...buckets[userKey]] : [];
  /** @type {Map<string, WatchLaterEntry>} */
  const merged = new Map();

  for (const entry of userList) {
    if (!isSupportedWatchLaterEntry(entry)) continue;
    merged.set(`${entry.type}:${entry.id}`, entry);
  }

  let added = 0;
  for (const entry of guestList) {
    if (!isSupportedWatchLaterEntry(entry)) continue;
    const key = `${entry.type}:${entry.id}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      added += 1;
      continue;
    }
    const existingTime = Date.parse(existing.addedAt ?? '') || 0;
    const guestTime = Date.parse(entry.addedAt ?? '') || 0;
    if (guestTime > existingTime) merged.set(key, entry);
  }

  const nextList = [...merged.values()].sort((a, b) => {
    const ta = Date.parse(a.addedAt ?? '') || 0;
    const tb = Date.parse(b.addedAt ?? '') || 0;
    return tb - ta;
  });

  buckets[userKey] = nextList.slice(0, MAX_ITEMS);
  delete buckets.guest;
  saveBuckets(buckets);
  if (added > 0) notifyWatchLaterChanged();
  return added;
}
