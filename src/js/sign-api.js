import { API_BASE, loadSession } from './auth.js';
import { apiGet, apiPostJson, resolveCoverUrl } from './content-api.js';

/** @typedef {{ day: number, signed: boolean }} SignDay */

/** @typedef {{
 *   signedDays: number[],
 *   monthTimes: number,
 *   allTimes: number,
 * }} SignInfo */

/** @typedef {{
 *   userId: number,
 *   userName: string,
 *   avatar: string | null,
 *   count: number,
 *   time: string | null,
 * }} SignRankEntry */

/** @typedef {{ desc: string, type: string }} SignAward */

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
 * @param {unknown} raw
 * @returns {number[]}
 */
function parseSignDays(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {number[]} */
  const days = [];
  for (const item of raw) {
    if (typeof item === 'number' && Number.isFinite(item)) {
      days.push(Math.trunc(item));
      continue;
    }
    const map = asMap(item);
    const day = asInt(map.day ?? map.date ?? map.sign_day);
    if (day != null) days.push(day);
  }
  return days;
}

/**
 * @param {unknown} data
 * @returns {SignInfo}
 */
function parseSignInfo(data) {
  const root = asMap(data);
  const list = root.list ?? root.sign_list ?? root.days;
  return {
    signedDays: parseSignDays(list),
    monthTimes: asInt(root.month_times ?? root.monthTimes) ?? 0,
    allTimes: asInt(root.all_times ?? root.allTimes ?? root.total) ?? 0,
  };
}

/**
 * @returns {Promise<string>}
 */
export async function performSignIn() {
  const token = loadSession()?.token;
  const res = await fetch(`${API_BASE}/v1/sign/sign`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
  });
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    throw new Error(res.ok ? '签到响应无效' : `签到失败 (${res.status})`);
  }
  const body = /** @type {{ code?: number, msg?: string }} */ (json);
  if (!res.ok || body.code !== 1) {
    throw new Error(body.msg || `签到失败 (${res.status})`);
  }
  return `${body.msg ?? ''}`.trim() || '签到成功';
}

/**
 * @returns {Promise<SignInfo>}
 */
export async function fetchSignInfo() {
  const data = await apiGet('/v1/sign/sign_list');
  return parseSignInfo(data);
}

/**
 * @param {number} day
 */
export async function signAgain(day) {
  await apiPostJson('/v1/sign/sign_again', { day });
}

/**
 * @returns {Promise<SignRankEntry[]>}
 */
export async function fetchSignRankToday() {
  const data = await apiGet('/v1/sign/sign_rank_today');
  const list = Array.isArray(data) ? data : asMap(data).list;
  if (!Array.isArray(list)) return [];
  return list
    .map((raw) => {
      const item = asMap(raw);
      const user = asMap(item.user);
      const userId = asInt(user.id ?? user.user_id ?? item.user_id) ?? 0;
      return {
        userId,
        userName: `${user.name ?? user.username ?? '用户'}`.trim(),
        avatar: resolveCoverUrl(user.avatar ?? user.face),
        count: asInt(item.count) ?? 0,
        time: typeof item.time === 'string' ? item.time : null,
      };
    })
    .filter((entry) => entry.userId > 0);
}

/**
 * @returns {Promise<Record<string, SignAward[]>>}
 */
export async function fetchSignAccumulatedAwards() {
  const data = await apiGet('/v1/sign/accumulated_awards');
  const root = asMap(data);
  const map = root.data && typeof root.data === 'object' ? root.data : data;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  /** @type {Record<string, SignAward[]>} */
  const result = {};
  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (map))) {
    if (!Array.isArray(value)) continue;
    result[key] = value
      .map((raw) => {
        const item = asMap(raw);
        return {
          desc: `${item.desc ?? item.description ?? ''}`.trim(),
          type: `${item.type ?? ''}`.trim(),
        };
      })
      .filter((award) => award.desc);
  }
  return result;
}
