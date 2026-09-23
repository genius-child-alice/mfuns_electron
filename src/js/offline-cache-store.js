import { resolveMineUserId } from './favorite-api.js';
import { notify } from './notice-ui.js';
import {
  fetchVideoPlayParts,
  qualityDisplayLabel,
  sortQualitiesDesc,
} from './video-api.js';

/** @typedef {{
 *   id: string,
 *   videoId: string,
 *   partIndex: number,
 *   partTitle: string,
 *   title: string,
 *   cover: string | null,
 *   author: string,
 *   qualityLabel: string,
 *   fileName: string,
 *   size: number,
 *   downloadedAt: string,
 * }} OfflineCacheEntry */

const STORAGE_KEY = 'mfuns.offline.cache.v1';

function notifyChanged() {
  window.dispatchEvent(new CustomEvent('mfuns:offline-cache-changed'));
}

/**
 * @returns {OfflineCacheEntry[]}
 */
function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.fileName);
  } catch {
    return [];
  }
}

/**
 * @param {OfflineCacheEntry[]} items
 */
function saveAll(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notifyChanged();
}

/**
 * @returns {OfflineCacheEntry[]}
 */
export function listOfflineCache() {
  return loadAll().sort((a, b) => {
    const ta = Date.parse(a.downloadedAt) || 0;
    const tb = Date.parse(b.downloadedAt) || 0;
    return tb - ta;
  });
}

/**
 * @param {string} videoId
 * @param {number} [partIndex]
 */
export function findOfflineEntry(videoId, partIndex = 0) {
  const id = `${videoId ?? ''}`.trim();
  return listOfflineCache().find((item) => item.videoId === id && item.partIndex === partIndex) ?? null;
}

/**
 * @param {string} entryId
 */
export function getOfflineEntry(entryId) {
  return listOfflineCache().find((item) => item.id === entryId) ?? null;
}

/**
 * @param {string} relPath
 */
export function offlinePlaybackSrc(relPath) {
  const api = window.electronAPI?.offline;
  if (api?.playbackSrc) return api.playbackSrc(relPath);
  return null;
}

/**
 * @param {OfflineCacheEntry} entry
 */
export async function removeOfflineEntry(entry) {
  await window.electronAPI?.offline?.delete(entry.fileName);
  saveAll(loadAll().filter((item) => item.id !== entry.id));
}

export async function clearOfflineCache() {
  await window.electronAPI?.offline?.clearAll();
  localStorage.removeItem(STORAGE_KEY);
  notifyChanged();
}

/**
 * @param {import('./video-api.js').VideoQuality} quality
 */
export function isOfflineDownloadableQuality(quality) {
  const url = `${quality?.url ?? ''}`.trim();
  if (!url) return false;
  const format = `${quality.format ?? ''}`.trim().toLowerCase();
  if (format === 'hls' || format === 'm3u8') return false;
  if (/\.m3u8(?:\?|$)/i.test(url)) return false;
  return true;
}

/**
 * @param {import('./video-api.js').VideoQuality[]} qualities
 * @returns {{ quality: import('./video-api.js').VideoQuality, downloadable: boolean }[]}
 */
export function listOfflineQualityChoices(qualities) {
  return sortQualitiesDesc(qualities.filter((q) => `${q.url ?? ''}`.trim())).map((quality) => ({
    quality,
    downloadable: isOfflineDownloadableQuality(quality),
  }));
}

/**
 * @param {import('./content-api.js').ContentPreview} preview
 * @param {number} partIndex
 * @param {import('./video-api.js').VideoQuality} quality
 * @param {(progress: string) => void} [onProgress]
 */
export async function downloadVideoToOffline(preview, partIndex, quality, onProgress) {
  if (!window.electronAPI?.offline?.download) {
    throw new Error('离线缓存仅支持桌面客户端');
  }
  const videoId = `${preview.id ?? ''}`.trim();
  if (!videoId) throw new Error('无效的视频');

  const existing = findOfflineEntry(videoId, partIndex);
  if (existing) return existing;

  if (!isOfflineDownloadableQuality(quality)) {
    throw new Error('所选清晰度不支持离线缓存');
  }
  if (!quality?.url) throw new Error('没有可下载的清晰度');

  onProgress?.('准备下载…');
  const parts = await fetchVideoPlayParts(videoId);
  const part = parts[partIndex];
  if (!part) throw new Error('分 P 不存在');

  const ext = /\.m3u8(?:\?|$)/i.test(quality.url) ? 'm3u8' : 'mp4';
  if (ext === 'm3u8') {
    throw new Error('当前清晰度为 HLS 流，请选择 MP4 清晰度');
  }

  const userId = resolveMineUserId(null) ?? 0;
  const fileName = `v${videoId}_p${partIndex + 1}_${userId}_${Date.now()}.${ext}`;
  onProgress?.('下载中…');
  const result = await window.electronAPI.offline.download(quality.url, fileName);
  if (!result?.ok) throw new Error(result?.error || '下载失败');

  const entry = {
    id: `${videoId}:${partIndex}`,
    videoId,
    partIndex,
    partTitle: part.title,
    title: preview.title || '视频',
    cover: preview.cover ?? null,
    author: preview.author || '',
    qualityLabel: qualityDisplayLabel(quality),
    fileName,
    size: Number(result.size) || 0,
    downloadedAt: new Date().toISOString(),
  };

  const all = loadAll().filter((item) => item.id !== entry.id);
  all.unshift(entry);
  saveAll(all);
  notify('已加入离线缓存', 'success');
  return entry;
}

/**
 * @returns {Promise<{ bytes: number, files: number }>}
 */
export async function fetchOfflineUsage() {
  const usage = await window.electronAPI?.offline?.getUsage?.();
  if (usage?.ok) return { bytes: usage.bytes ?? 0, files: usage.files ?? 0 };
  const items = listOfflineCache();
  return {
    bytes: items.reduce((sum, item) => sum + (item.size || 0), 0),
    files: items.length,
  };
}
