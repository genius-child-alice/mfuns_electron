import { apiGet, parseContentPreview } from './content-api.js';

/** @typedef {import('./content-api.js').ContentPreview} ContentPreview */

/** @typedef {{
 *   preview: ContentPreview,
 *   viewTime: string | null,
 *   viewTimeMs: number | null,
 *   progressRatio: number,
 *   finished: boolean,
 * }} HistoryEntry */

/** @typedef {{
 *   items: HistoryEntry[],
 *   nextStartTime: number | null,
 *   hasMore: boolean,
 *   total: number | null,
 * }} HistoryPage */

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
 * @param {unknown} value
 */
function asFloat(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number.parseFloat(`${value ?? ''}`);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} data
 * @returns {unknown[]}
 */
function extractList(data) {
  if (Array.isArray(data)) return data;
  const root = asMap(data);
  const nested = asMap(root.data);
  const candidates = [
    root.items,
    root.list,
    root.history,
    nested.items,
    nested.list,
    nested.history,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

/**
 * @param {unknown} raw
 * @returns {HistoryEntry | null}
 */
function parseHistoryEntry(raw) {
  const preview = parseContentPreview(raw);
  if (!preview) return null;

  const item = asMap(raw);
  const info = asMap(item.resource_info);
  const viewTimeRaw =
    item.view_time ??
    item.viewTime ??
    item.start_time ??
    item.time ??
    info.view_time ??
    preview.createdAt;

  let viewTime = typeof viewTimeRaw === 'string' ? viewTimeRaw : null;
  let viewTimeMs = asInt(viewTimeRaw);
  if (viewTime == null && viewTimeMs != null) {
    viewTime = new Date(viewTimeMs * (viewTimeMs < 1e12 ? 1000 : 1)).toISOString();
  }
  if (viewTimeMs == null && viewTime) {
    const parsed = Date.parse(viewTime);
    viewTimeMs = Number.isFinite(parsed) ? parsed : null;
  }

  const progress = asFloat(item.progress ?? item.watch_progress ?? item.view_progress ?? info.progress);
  const duration = asFloat(
    item.duration ?? item.video_duration ?? info.duration ?? info.video_duration,
  );
  let progressRatio = asFloat(item.progress_rate ?? item.progress_ratio) ?? 0;
  if (progressRatio > 1) progressRatio = progressRatio / 100;
  if (duration != null && duration > 0 && progress != null && progress >= 0) {
    progressRatio = Math.min(1, progress / duration);
  }

  const finished =
    item.is_finish === 1 ||
    item.is_finish === true ||
    item.finished === 1 ||
    item.finished === true ||
    progressRatio >= 0.98;

  return {
    preview,
    viewTime,
    viewTimeMs,
    progressRatio: Math.max(0, Math.min(1, progressRatio)),
    finished,
  };
}

/**
 * @param {unknown} data
 * @returns {HistoryPage}
 */
export function parseHistoryPage(data) {
  const root = asMap(data);
  const list = extractList(data);
  /** @type {HistoryEntry[]} */
  const items = [];
  list.forEach((raw) => {
    const entry = parseHistoryEntry(raw);
    if (entry) items.push(entry);
  });

  const last = items[items.length - 1];
  let nextStartTime =
    asInt(root.next_start_time ?? root.nextStartTime ?? root.next_cursor) ?? null;
  if (nextStartTime == null && last?.viewTimeMs != null) {
    nextStartTime = Math.trunc(last.viewTimeMs / 1000);
  }

  let hasMore = root.has_more === true || root.has_more === 1 || root.hasMore === true;
  if (root.has_more === false || root.has_more === 0 || root.hasMore === false) {
    hasMore = false;
  } else if (root.has_more == null && root.hasMore == null) {
    hasMore = items.length > 0 && nextStartTime != null;
  }

  const total = asInt(root.total ?? root.total_count);

  return { items, nextStartTime, hasMore, total };
}

/**
 * @param {number | null | undefined} [startTime]
 */
export async function fetchHistoryPage(startTime) {
  /** @type {Record<string, string | number>} */
  const query = {};
  if (startTime != null && Number.isFinite(startTime) && startTime > 0) {
    query.start_time = startTime;
  }
  const data = await apiGet('/v1/history/get', query);
  return parseHistoryPage(data);
}
