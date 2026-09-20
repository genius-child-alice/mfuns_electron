/** 官方社区 API，与 api_document/community-api.md 一致 */
export const API_BASE = 'https://api.mfuns.net';

/** @type {const} */
export const AUTH_API = {
  login: `${API_BASE}/v1/auth/login`,
  sendLoginCode: `${API_BASE}/v1/auth/send_login_code`,
  loginBySms: `${API_BASE}/v1/auth/login_by_sms`,
  userInfo: `${API_BASE}/v1/user/info`,
};

const SESSION_KEY = 'mfuns.session';

/** @typedef {{ token: string, user?: Record<string, unknown> | null }} Session */

/** @returns {Session | null} */
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return { token: String(parsed.token), user: parsed.user ?? null };
  } catch {
    return null;
  }
}

/** @param {Session | null} session */
export function saveSession(session) {
  if (!session?.token) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ token: session.token, user: session.user ?? null }),
  );
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * @param {unknown} payload
 * @returns {string | null}
 */
function extractToken(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const data = /** @type {Record<string, unknown>} */ (payload);
  const token = data.access_token ?? data.token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/**
 * @param {unknown} payload
 * @returns {Record<string, unknown> | null}
 */
function normalizeUser(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const data = /** @type {Record<string, unknown>} */ (payload);
  if (data.login === false) return null;
  const user = data.user ?? data.user_info;
  if (user && typeof user === 'object') return /** @type {Record<string, unknown>} */ (user);
  return data;
}

/**
 * @param {Response} res
 * @returns {Promise<unknown>}
 */
async function parseApiJson(res) {
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    throw new Error(res.ok ? '服务器响应无效' : `请求失败 (${res.status})`);
  }
  const body = /** @type {{ code?: number, msg?: string, data?: unknown }} */ (json);
  if (!res.ok || body.code !== 1) {
    throw new Error(body.msg || `请求失败 (${res.status})`);
  }
  return body.data;
}

/**
 * @param {string} token
 */
export async function fetchUserInfo(token) {
  const res = await fetch(AUTH_API.userInfo, {
    headers: {
      Accept: 'application/json',
      Authorization: token,
    },
  });
  const data = await parseApiJson(res);
  return normalizeUser(data);
}

/**
 * @param {string} account
 * @param {string} password
 */
export async function loginWithPassword(account, password) {
  const trimmedAccount = account.trim();
  if (!trimmedAccount || !password) {
    throw new Error('请填写账号和密码');
  }

  const res = await fetch(AUTH_API.login, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ account: trimmedAccount, password }),
  });

  const data = await parseApiJson(res);
  const token = extractToken(data);
  if (!token) {
    throw new Error('登录成功但未返回 token');
  }

  let user = null;
  try {
    user = await fetchUserInfo(token);
  } catch {
    user = null;
  }

  saveSession({ token, user });
  return { token, user };
}

/**
 * @param {string} phone
 * @param {string} code
 */
export async function loginWithSms(phone, code) {
  const trimmedPhone = phone.trim();
  if (!trimmedPhone || !code.trim()) {
    throw new Error('请填写手机号和验证码');
  }

  const res = await fetch(AUTH_API.loginBySms, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone: trimmedPhone, code: Number(code) }),
  });

  const data = await parseApiJson(res);
  const token = extractToken(data);
  if (!token) {
    throw new Error('登录成功但未返回 token');
  }

  let user = null;
  try {
    user = await fetchUserInfo(token);
  } catch {
    user = null;
  }

  saveSession({ token, user });
  return { token, user };
}

/** @param {string} phone */
export async function sendLoginCode(phone) {
  const trimmedPhone = phone.trim();
  if (!trimmedPhone) {
    throw new Error('请填写手机号');
  }

  const res = await fetch(AUTH_API.sendLoginCode, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone: trimmedPhone }),
  });

  await parseApiJson(res);
}

/** @param {Record<string, unknown> | null | undefined} user */
export function userDisplayName(user) {
  if (!user) return '已登录';
  const name = user.name ?? user.username;
  return typeof name === 'string' && name.length > 0 ? name : '已登录';
}

/** @param {Record<string, unknown> | null | undefined} user */
export function userAvatarUrl(user) {
  if (!user) return null;
  const avatar = user.avatar ?? user.user_avatar;
  return typeof avatar === 'string' && avatar.length > 0 ? avatar : null;
}
