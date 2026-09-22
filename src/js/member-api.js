import { badgeImageUrl, badgeLabelFromId } from './badge-catalog.js';
import { sendLoginCode } from './auth.js';
import { apiDelete, apiGet, apiPostJson, resolveCoverUrl } from './content-api.js';

/** 举报资源类型（与官网 MReportForm 一致时可再校准） */
export const REPORT_RESOURCE = {
  article: 0,
  video: 1,
  user: 2,
  comment: 3,
  feed: 4,
};

export const REPORT_REASONS = [
  '色情或低俗内容',
  '血腥暴力或令人不适',
  '涉政敏感',
  '违法违禁',
  '人身攻击',
  '侵权抄袭',
  '青少年不良内容',
  '其他',
];

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
 * @param {unknown} data
 */
function toList(data) {
  if (Array.isArray(data)) return data;
  const root = asMap(data);
  const list = root.list ?? root.items ?? root.data;
  return Array.isArray(list) ? list : [];
}

/** @returns {Promise<Record<string, unknown>>} */
export async function fetchUserSecurityInfo() {
  return asMap(await apiGet('/v1/auth/user_security_info'));
}

/** @param {{ phone: string, phone_code: string, password: string, reenteredPassword: string }} payload */
export async function resetPassword(payload) {
  await apiPostJson('/v1/auth/reset_password', {
    phone: payload.phone,
    phone_code: payload.phone_code,
    password: payload.password,
    reenteredPassword: payload.reenteredPassword,
  });
}

/** @param {string} email */
export async function sendEmailCode(email) {
  await apiPostJson('/v1/auth/send_email_code', { email });
}

/** @param {string} email @param {number | string} code */
export async function bindEmail(email, code) {
  await apiPostJson('/v1/auth/bind_email', { email, code: Number(code) });
}

/** @param {Record<string, unknown>} payload */
export async function updateEmail(payload) {
  await apiPostJson('/v1/auth/update_email', payload);
}

/** @param {string} phone */
export async function sendPhoneBindCode(phone) {
  await sendLoginCode(phone);
}

/** @param {string} phone @param {number | string} code */
export async function bindPhone(phone, code) {
  await apiPostJson('/v1/auth/bind_phone', { phone, code: Number(code) });
}

/** @param {{ old_phone: string, old_code: number | string, new_phone: string, new_code: number | string }} payload */
export async function updatePhone(payload) {
  await apiPostJson('/v1/auth/update_phone', {
    old_phone: payload.old_phone,
    old_code: Number(payload.old_code),
    new_phone: payload.new_phone,
    new_code: Number(payload.new_code),
  });
}

/** @param {Record<string, unknown>} payload */
export async function submitDeleteAccount(payload) {
  await apiPostJson('/v1/auth/submit_delete_account', payload);
}

export async function cancelAccountDelete() {
  await apiPostJson('/v1/auth/cancel_account_delete', {});
}

/** @param {string | number} sessionId */
export async function deleteLoginSession(sessionId) {
  await apiPostJson('/v1/auth/delete_login_session', { session_id: sessionId });
}

/**
 * @param {{ resourceId: number, resourceType: number, reason: string, images?: string[] }} params
 */
export async function submitReport(params) {
  await apiPostJson('/v1/reports/report', {
    resource_id: params.resourceId,
    resource_type: params.resourceType,
    reason: params.reason,
    images: params.images ?? [],
  });
}

/** @typedef {{ userId: number, name: string, avatar: string | null }} BlacklistUser */

/**
 * @param {unknown} raw
 */
function parseBlacklistUser(raw) {
  const row = asMap(raw);
  const user = asMap(row.user);
  const source = user.id != null ? user : row;
  const id = asInt(source.id ?? source.user_id ?? row.user_id);
  if (id == null || id <= 0) return null;
  return {
    userId: id,
    name: `${source.name ?? source.username ?? row.name ?? '用户'}`,
    avatar: resolveCoverUrl(source.avatar ?? source.face ?? row.avatar),
  };
}

/** @returns {Promise<BlacklistUser[]>} */
export async function fetchBlacklist() {
  const data = await apiGet('/v1/blacklist/get');
  if (Array.isArray(data)) {
    return data.map(parseBlacklistUser).filter((item) => item != null);
  }
  return toList(data)
    .map(parseBlacklistUser)
    .filter((item) => item != null);
}

/** @param {number} userId */
export async function addBlacklistUser(userId) {
  await apiPostJson('/v1/blacklist/add', { user_id: userId });
}

/** @param {number} userId */
export async function removeBlacklistUser(userId) {
  await apiPostJson('/v1/blacklist/delete', { user_id: userId });
}

/** @typedef {{ id: number, name: string, keyPreview: string, createdAt: string | null, expiresAt: string | null }} ApiKeyItem */

/**
 * @param {unknown} raw
 */
function parseApiKey(raw) {
  const row = asMap(raw);
  const id = asInt(row.id ?? row.key_id);
  if (id == null) return null;
  const full = `${row.key ?? row.api_key ?? ''}`;
  const preview = full.length > 12 ? `${full.slice(0, 8)}…${full.slice(-4)}` : full || '—';
  return {
    id,
    name: `${row.name ?? row.label ?? 'API Key'}`,
    keyPreview: preview,
    createdAt: row.created_at ? `${row.created_at}` : null,
    expiresAt: row.expires_at ? `${row.expires_at}` : null,
  };
}

/** @returns {Promise<ApiKeyItem[]>} */
export async function fetchApiKeys() {
  const data = await apiGet('/v1/user/api-keys');
  return toList(data)
    .map(parseApiKey)
    .filter((item) => item != null);
}

/** @param {{ name: string, expires_days?: number }} params */
export async function createApiKey(params) {
  const data = await apiPostJson('/v1/user/api-keys', params);
  return asMap(data);
}

/** @param {number} id */
export async function revokeApiKey(id) {
  await apiPostJson('/v1/user/api-keys/revoke', { id });
}

/** @typedef {{ id: number, name: string, image: string | null, wearing: boolean }} AvatarFrameItem */

/**
 * @param {unknown} raw
 */
function parseAvatarFrame(raw) {
  const row = asMap(raw);
  const id = asInt(row.id ?? row.frame_id);
  if (id == null) return null;
  return {
    id,
    name: `${row.name ?? row.title ?? '头像框'}`,
    image: resolveCoverUrl(row.image ?? row.url ?? row.preview),
    wearing: Boolean(row.wearing ?? row.is_wearing ?? row.wear),
  };
}

/** @returns {Promise<AvatarFrameItem[]>} */
export async function fetchMyAvatarFrames() {
  const data = await apiGet('/v1/avatar_frame/my');
  return (Array.isArray(data) ? data : toList(data))
    .map(parseAvatarFrame)
    .filter((item) => item != null);
}

/** @returns {Promise<AvatarFrameItem[]>} */
export async function fetchAvatarFrameShop() {
  const data = await apiGet('/v1/avatar_frame/list');
  return toList(data)
    .map(parseAvatarFrame)
    .filter((item) => item != null);
}

/** @param {number} frameId */
export async function wearAvatarFrame(frameId) {
  await apiPostJson('/v1/avatar_frame/wear', { id: frameId, frame_id: frameId });
}

/** @param {number} frameId */
export async function unwearAvatarFrame(frameId) {
  await apiPostJson('/v1/avatar_frame/unwear', { id: frameId, frame_id: frameId });
}

/** @typedef {{ id: number, name: string, image: string | null, active: boolean }} UserBadge */

/**
 * @param {unknown} raw
 */
function parseBadge(raw, wearingIds = /** @type {Set<number>} */ (new Set())) {
  const row = asMap(raw);
  const info = asMap(row.info ?? row.badge ?? row.badge_info);
  const id = asInt(info.id ?? row.badge_id);
  if (id == null) return null;
  const nameRaw =
    info.name ??
    info.title ??
    row.name ??
    row.title ??
    row.badge_name ??
    row.honor_name;
  const name =
    typeof nameRaw === 'string' && nameRaw.trim().length > 0
      ? nameRaw.trim()
      : badgeLabelFromId(id);
  const image =
    resolveCoverUrl(info.image ?? info.icon ?? info.url ?? row.image ?? row.icon) ??
    badgeImageUrl(id);
  const active =
    wearingIds.has(id) ||
    Boolean(row.active ?? row.is_active ?? row.wearing ?? row.wear);
  return {
    id,
    name,
    image,
    active,
  };
}

/** @returns {Promise<UserBadge[]>} */
export async function fetchUserBadges() {
  const data = await apiGet('/v1/user/user_badges');
  const wearingIds = new Set();
  try {
    const session = asMap(await apiGet('/v1/user/info'));
    const user = asMap(session.user ?? session.user_info ?? session);
    const worn = user.badges;
    if (Array.isArray(worn)) {
      for (const entry of worn) {
        const bid =
          typeof entry === 'object' && entry != null
            ? asInt(asMap(entry).id ?? asMap(entry).badge_id)
            : asInt(entry);
        if (bid != null) wearingIds.add(bid);
      }
    }
    const levelBadge = asInt(user.level_badge);
    if (levelBadge != null) wearingIds.add(levelBadge);
  } catch {
    /* 仅影响佩戴高亮 */
  }
  return (Array.isArray(data) ? data : toList(data))
    .map((row) => parseBadge(row, wearingIds))
    .filter((item) => item != null);
}

/** @param {number} badgeId */
export async function setDisplayBadge(badgeId) {
  await apiPostJson('/v1/user/set_badge', { badges: [badgeId] });
}

/** @typedef {{ isPremium: boolean, expireAt: string | null, label: string }} PremiumStatus */

/**
 * @param {unknown} security
 * @param {unknown} [user]
 */
export function parsePremiumStatus(security, user) {
  const sec = asMap(security);
  const u = asMap(user);
  const premium =
    sec.is_premium ??
    sec.premium ??
    u.is_premium ??
    u.premium ??
    sec.vip_status ??
    u.vip_status;
  const isPremium = premium === true || premium === 1 || `${premium}` === '1';
  const expireAt =
    sec.premium_expire ??
    sec.premium_expired_at ??
    sec.vip_expire ??
    u.premium_expire ??
    u.vip_expire ??
    null;
  const label = isPremium
    ? expireAt
      ? `大会员 · 至 ${formatDateLabel(expireAt)}`
      : '大会员 · 已开通'
    : '未开通大会员';
  return {
    isPremium,
    expireAt: expireAt ? `${expireAt}` : null,
    label,
  };
}

/**
 * @param {unknown} value
 */
function formatDateLabel(value) {
  const d = new Date(`${value}`);
  if (Number.isNaN(d.getTime())) return `${value}`;
  return d.toLocaleDateString('zh-CN');
}

/** @typedef {{ id: number, videoId: number, part: number, content: string, time: number, createdAt: string | null }} UserDanmakuRow */

/**
 * @param {unknown} raw
 */
function parseUserDanmakuRow(raw) {
  const row = asMap(raw);
  const id = asInt(row.id ?? row.danmaku_id);
  if (id == null) return null;
  return {
    id,
    videoId: asInt(row.video_id) ?? 0,
    part: asInt(row.part) ?? 1,
    content: `${row.content ?? row.text ?? ''}`,
    time: Number(row.time ?? row.play_time ?? 0) || 0,
    createdAt: row.created_at ? `${row.created_at}` : null,
  };
}

/** @param {number} page @param {number} limit */
export async function fetchUserDanmakuPage(page = 1, limit = 20) {
  const data = await apiGet('/v1/danmaku/user_danmaku', { page, limit, order: 'desc' });
  const list = toList(data);
  return {
    items: list.map(parseUserDanmakuRow).filter((item) => item != null),
    hasMore: list.length >= limit,
  };
}

/**
 * @param {number} videoId
 * @param {number} part
 * @param {number} page
 */
export async function fetchVideoDanmakuPage(videoId, part = 1, page = 1, limit = 30) {
  const data = await apiGet('/v1/danmaku/video_danmaku', {
    video_id: videoId,
    part,
    page,
    limit,
    order: 'desc',
  });
  const list = toList(data);
  return {
    items: list.map(parseUserDanmakuRow).filter((item) => item != null),
    hasMore: list.length >= limit,
  };
}

/** @param {number[]} ids */
export async function deleteDanmakuByIds(ids) {
  await apiDelete('/v1/danmaku/delete', { ids });
}
