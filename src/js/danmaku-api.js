import { API_BASE, loadSession } from './auth.js';
import { apiGet } from './content-api.js';

/** @typedef {{
 *   time: number,
 *   type: number,
 *   color: number,
 *   content: string,
 *   size: number,
 * }} DanmakuItem */

/**
 * @param {unknown} raw
 * @returns {DanmakuItem | null}
 */
export function parseDanmakuItem(raw) {
  if (!Array.isArray(raw) || raw.length < 6) return null;
  const time = Number(raw[0]);
  const type = Number(raw[1]);
  const color = Number(raw[2]);
  const content = `${raw[4] ?? ''}`.trim();
  const size = Number(raw[5]);
  if (!Number.isFinite(time) || !content) return null;
  return {
    time: Math.max(0, time),
    type: Number.isFinite(type) ? Math.trunc(type) : 1,
    color: Number.isFinite(color) ? Math.trunc(color) : 16777215,
    content,
    size: Number.isFinite(size) && size > 0 ? size : 25,
  };
}

/**
 * @param {unknown} data
 * @returns {DanmakuItem[]}
 */
export function parseDanmakuList(data) {
  if (Array.isArray(data)) {
    return data
      .map((row) => parseDanmakuItem(row))
      .filter((item) => item != null)
      .sort((a, b) => a.time - b.time);
  }
  if (!data || typeof data !== 'object') return [];
  const root = /** @type {Record<string, unknown>} */ (data);
  const list = root.list ?? root.items ?? root.data;
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => parseDanmakuItem(row))
    .filter((item) => item != null)
    .sort((a, b) => a.time - b.time);
}

/**
 * @param {string | number} videoId
 * @param {number} part
 */
export async function fetchDanmakuList(videoId, part) {
  const data = await apiGet('/v1/danmaku/get_normal', {
    id: videoId,
    part,
  });
  return parseDanmakuList(data);
}

/**
 * @param {{
 *   videoId: string | number,
 *   part: number,
 *   time: number,
 *   content: string,
 *   color?: number,
 *   size?: number,
 *   type?: number,
 * }} payload
 */
export async function sendDanmaku(payload) {
  const body = {
    video_id: Number(payload.videoId),
    part: payload.part,
    time: Number(payload.time.toFixed(2)),
    content: payload.content,
    color: payload.color ?? 16777215,
    size: payload.size ?? 25,
    type: payload.type ?? 1,
  };

  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const token = loadSession()?.token;
  if (token) headers.Authorization = token;

  const params = new URLSearchParams();
  Object.entries(body).forEach(([key, value]) => {
    params.set(key, String(value));
  });

  const res = await fetch(`${API_BASE}/v1/danmaku/send_normal`, {
    method: 'POST',
    headers,
    body: params.toString(),
  });
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    throw new Error(res.ok ? '服务器响应无效' : `请求失败 (${res.status})`);
  }
  const parsed = /** @type {{ code?: number, msg?: string }} */ (json);
  if (!res.ok || parsed.code !== 1) {
    throw new Error(parsed.msg || `请求失败 (${res.status})`);
  }
}
