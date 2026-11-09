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
const ACCOUNTS_KEY = 'mfuns.accounts';

/** @typedef {{ token: string, user?: Record<string, unknown> | null }} Session */

/** @param {Record<string, unknown> | null | undefined} user */
export function sessionUserId(user) {
  if (!user) return null;
  const id = Number(user.id ?? user.user_id);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

/**
 * @param {Session | null | undefined} session
 * @returns {Session | null}
 */
function normalizeSession(session) {
  if (!session?.token) return null;
  return { token: String(session.token), user: session.user ?? null };
}

/** @returns {Session | null} */
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** @returns {Session[]} */
export function loadSavedAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    /** @type {Session[]} */
    let accounts = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        accounts = parsed
          .map((item) => normalizeSession(item))
          .filter(/** @returns {item is Session} */ (item) => Boolean(item));
      }
    }
    const current = loadSession();
    const currentId = sessionUserId(current?.user);
    if (current && currentId != null && !accounts.some((item) => sessionUserId(item.user) === currentId)) {
      accounts = [current, ...accounts];
      saveSavedAccounts(accounts);
    }
    return accounts;
  } catch {
    const current = loadSession();
    return current ? [current] : [];
  }
}

/** @param {Session[]} accounts */
function saveSavedAccounts(accounts) {
  const cleaned = accounts
    .map((item) => normalizeSession(item))
    .filter(/** @returns {item is Session} */ (item) => Boolean(item));
  /** @type {Map<number, Session>} */
  const byId = new Map();
  /** @type {Session[]} */
  const withoutId = [];
  for (const account of cleaned) {
    const id = sessionUserId(account.user);
    if (id == null) {
      withoutId.push(account);
      continue;
    }
    byId.set(id, account);
  }
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...byId.values(), ...withoutId]));
}

/**
 * @param {Session} session
 */
function upsertSavedAccount(session) {
  const next = normalizeSession(session);
  if (!next) return;
  const id = sessionUserId(next.user);
  const accounts = loadSavedAccounts().filter((item) => {
    const itemId = sessionUserId(item.user);
    if (id != null && itemId != null) return itemId !== id;
    return item.token !== next.token;
  });
  accounts.unshift(next);
  saveSavedAccounts(accounts);
}

/** @param {Session | null} session */
export function saveSession(session) {
  const next = normalizeSession(session);
  if (!next) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  upsertSavedAccount(next);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * 切换到已保存账号。
 * @param {number} userId
 * @returns {Session | null}
 */
export function switchToAccount(userId) {
  const id = Math.trunc(userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const account = loadSavedAccounts().find((item) => sessionUserId(item.user) === id) ?? null;
  if (!account) return null;
  localStorage.setItem(SESSION_KEY, JSON.stringify(account));
  upsertSavedAccount(account);
  return account;
}

/**
 * 从账号列表移除；若移除的是当前账号则切到下一个或退出。
 * @param {number} userId
 * @returns {Session | null} 移除后的当前会话
 */
export function removeSavedAccount(userId) {
  const id = Math.trunc(userId);
  if (!Number.isFinite(id) || id <= 0) return loadSession();
  const remaining = loadSavedAccounts().filter((item) => sessionUserId(item.user) !== id);
  saveSavedAccounts(remaining);
  const currentId = sessionUserId(loadSession()?.user);
  if (currentId === id) {
    const next = remaining[0] ?? null;
    if (next) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    }
    clearSession();
    return null;
  }
  return loadSession();
}

/**
 * 退出当前账号（从列表移除），有其他已保存账号则自动切过去。
 * @returns {Session | null}
 */
export function logoutCurrentAccount() {
  const currentId = sessionUserId(loadSession()?.user);
  if (currentId == null) {
    clearSession();
    return null;
  }
  return removeSavedAccount(currentId);
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
