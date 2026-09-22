import { API_BASE, loadSession } from './auth.js';
import { apiGet, apiPostJson, pickAvatarFrameUrl, resolveCoverUrl } from './content-api.js';
import { resolveUserLevelId } from './user-level.js';

/** @typedef {{ day: number, signed: boolean }} SignDay */

/** @typedef {{
 *   signedDays: number[],
 *   monthTimes: number,
 *   allTimes: number,
 *   signedToday: boolean,
 * }} SignInfo */

/** @typedef {{
 *   userId: number,
 *   userName: string,
 *   avatar: string | null,
 *   count: number,
 *   time: string | null,
 *   levelId: number | null,
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
  const statusLike = raw.every((entry) => {
    const text = `${entry ?? ''}`.trim();
    return text === '0' || text === '1';
  });
  if (statusLike && raw.length > 1) {
    /** @type {number[]} */
    const days = [];
    for (let i = 0; i < raw.length; i += 1) {
      if (i === 0) continue;
      if (`${raw[i]}`.trim() === '1') days.push(i);
    }
    return days;
  }
  /** @type {number[]} */
  const days = [];
  for (const item of raw) {
    if (typeof item === 'number' && Number.isFinite(item)) {
      days.push(Math.trunc(item));
      continue;
    }
    const text = `${item ?? ''}`.trim();
    const dateMatch = text.match(/(?:\d{4}-\d{2}-)?(\d{1,2})$/);
    if (dateMatch) {
      const day = Number.parseInt(dateMatch[1], 10);
      if (Number.isFinite(day)) days.push(day);
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
  const signedDays = parseSignDays(list);
  const today = new Date().getDate();
  return {
    signedDays,
    monthTimes: asInt(root.month_times ?? root.monthTimes) ?? 0,
    allTimes: asInt(root.all_times ?? root.allTimes ?? root.total) ?? 0,
    signedToday: signedDays.includes(today),
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
        avatarFrame: pickAvatarFrameUrl(user.avatar_frame ?? user.avatarFrame),
        count: asInt(item.count ?? item.all_times ?? item.sign_times) ?? 0,
        time: formatRankTime(item.time ?? item.sign_time),
        levelId: resolveUserLevelId(user),
      };
    })
    .filter((entry) => entry.userId > 0);
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function formatRankTime(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n) && n > 1e8) {
    const d = new Date(n > 1e12 ? n : n * 1000);
    return d.toTimeString().slice(0, 8);
  }
  const text = `${value}`.trim();
  return text || null;
}

/**
 * @returns {Promise<{ day: number, awards: SignAward[] }[]>}
 */
export async function fetchSignAccumulatedAwards() {
  const data = await apiGet('/v1/sign/accumulated_awards');
  const root = asMap(data);
  const map = root.data && typeof root.data === 'object' ? root.data : data;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return [];
  /** @type {{ day: number, awards: SignAward[] }[]} */
  const result = [];
  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (map))) {
    const day = asInt(key);
    if (day == null || !Array.isArray(value)) continue;
    const awards = value
      .map((raw) => {
        const item = asMap(raw);
        return {
          desc: `${item.desc ?? item.description ?? ''}`.trim(),
          type: `${item.type ?? ''}`.trim(),
        };
      })
      .filter((award) => award.desc);
    if (awards.length > 0) result.push({ day, awards });
  }
  result.sort((a, b) => a.day - b.day);
  return result;
}
