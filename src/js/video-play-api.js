import { apiPostJson } from './content-api.js';

/**
 * @param {{ video_id: number, start_position: number }} body
 */
export async function startVideoPlaySession(body) {
  const data = await apiPostJson('/v1/video-play/start', body);
  const root = data && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {};
  const sessionId = `${root.session_id ?? ''}`.trim();
  if (!sessionId) throw new Error('播放会话无效');
  return sessionId;
}

/**
 * @param {{
 *   session_id: string,
 *   video_id: number,
 *   current_position: number,
 *   play_duration: number,
 *   drag_events?: unknown[],
 *   is_final?: boolean,
 * }} body
 */
export async function sendVideoPlayHeartbeat(body) {
  await apiPostJson('/v1/video-play/heartbeat', body);
}

/**
 * @param {{
 *   session_id: string,
 *   video_id: number,
 *   end_position: number,
 *   total_play_duration: number,
 *   total_watch_duration: number,
 * }} body
 */
export async function endVideoPlaySession(body) {
  await apiPostJson('/v1/video-play/end', body);
}
