import { loadSession } from './auth.js';
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
 * @param {ContentPreview} preview
 * @returns {WatchLaterEntry | null}
 */
export function snapshotWatchLaterEntry(preview) {
  if (preview.type !== 1) return null;
  const id = `${preview.id ?? ''}`.trim();
  if (!id) return null;
  return {
    id,
    title: preview.title || '视频',
    cover: preview.cover ?? null,
    author: preview.author || '',
    authorId: preview.authorId ?? null,
    authorAvatar: preview.authorAvatar ?? null,
    type: 1,
    views: preview.views ?? 0,
    comments: preview.comments ?? 0,
    createdAt: preview.createdAt ?? null,
    addedAt: new Date().toISOString(),
  };
}

/**
 * @param {number | null | undefined} userId
 * @returns {WatchLaterEntry[]}
 */
export function listWatchLater(userId) {
  const id = resolveMineUserId(userId);
  if (id == null) return [];
  const list = loadBuckets()[bucketKey(id)];
  return Array.isArray(list) ? list.filter((entry) => entry && entry.type === 1) : [];
}

/**
 * @param {number | null | undefined} userId
 * @param {string | number} videoId
 */
export function isVideoInWatchLater(userId, videoId) {
  const id = `${videoId ?? ''}`.trim();
  if (!id) return false;
  return listWatchLater(userId).some((entry) => entry.id === id);
}

/**
 * @param {number | null | undefined} userId
 * @param {ContentPreview} preview
 */
export function addVideoToWatchLater(userId, preview) {
  const entry = snapshotWatchLaterEntry(preview);
  const uid = resolveMineUserId(userId);
  if (!entry || uid == null) return false;

  const buckets = loadBuckets();
  const key = bucketKey(uid);
  const list = Array.isArray(buckets[key]) ? buckets[key].filter((item) => item?.id !== entry.id) : [];
  list.unshift(entry);
  buckets[key] = list.slice(0, MAX_ITEMS);
  saveBuckets(buckets);
  notifyWatchLaterChanged();
  return true;
}

/**
 * @param {number | null | undefined} userId
 * @param {string | number} videoId
 */
export function removeVideoFromWatchLater(userId, videoId) {
  const uid = resolveMineUserId(userId);
  const id = `${videoId ?? ''}`.trim();
  if (!id || uid == null) return false;

  const buckets = loadBuckets();
  const key = bucketKey(uid);
  const list = buckets[key];
  if (!Array.isArray(list)) return false;
  const next = list.filter((entry) => entry?.id !== id);
  if (next.length === list.length) return false;
  buckets[key] = next;
  saveBuckets(buckets);
  notifyWatchLaterChanged();
  return true;
}

/**
 * @param {number | null | undefined} userId
 */
export function clearWatchLater(userId) {
  const uid = resolveMineUserId(userId);
  if (uid == null) return;
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
export function toggleVideoWatchLater(userId, preview) {
  const id = `${preview.id ?? ''}`.trim();
  if (!id) return false;
  if (isVideoInWatchLater(userId, id)) {
    removeVideoFromWatchLater(userId, id);
    return false;
  }
  addVideoToWatchLater(userId, preview);
  return true;
}

/**
 * 未登录时返回 null
 */
export function currentWatchLaterUserId() {
  if (!loadSession()?.token) return null;
  return resolveMineUserId(null);
}
