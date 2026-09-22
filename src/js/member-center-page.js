import { loadSession, fetchUserInfo, saveSession, userDisplayName } from './auth.js';
import { renderUserFramedAvatarHtml } from './avatar-frame-ui.js';
import { userAvatarMediaSrc } from './content-api.js';
import { materialIcon } from './icons.js';
import { notify } from './notice-ui.js';
import { confirmAction } from './confirm-dialog.js';
import { promptInput } from './prompt-dialog.js';
import { openInAppBrowser } from './legal.js';
import { isLoggedIn, requireLogin } from './login-ui.js';
import {
  getScrollTop,
  navigateBack,
  navigateTo,
  registerPageNavigation,
  restoreScrollTop,
} from './navigation.js';
import { loadAppSettings, saveAppSettings } from './app-preferences.js';
import { loadPreferences } from './theme.js';
import {
  addBlacklistUser,
  bindEmail,
  bindPhone,
  cancelAccountDelete,
  createApiKey,
  deleteDanmakuByIds,
  deleteLoginSession,
  fetchApiKeys,
  fetchAvatarFrameShop,
  fetchBlacklist,
  fetchMyAvatarFrames,
  fetchUserBadges,
  fetchUserDanmakuPage,
  fetchUserSecurityInfo,
  fetchVideoDanmakuPage,
  parsePremiumStatus,
  removeBlacklistUser,
  resetPassword,
  revokeApiKey,
  sendEmailCode,
  sendPhoneBindCode,
  setDisplayBadge,
  submitDeleteAccount,
  updateEmail,
  updatePhone,
  unwearAvatarFrame,
  wearAvatarFrame,
} from './member-api.js';

/** @typedef {'hub' | 'security' | 'security-phone' | 'security-email' | 'security-password' | 'security-delete' | 'premium' | 'blacklist' | 'api-keys' | 'badges' | 'avatar-frames' | 'accessibility' | 'customer' | 'creator' | 'danmaku'} MemberView */

/** @type {MemberView} */
let currentView = 'hub';

/** @type {Record<string, unknown> | null} */
let securityInfo = null;

let bound = false;

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return `${text ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {MemberView} view
 */
function viewTitle(view) {
  const map = {
    hub: '个人中心',
    security: '账号与安全',
    'security-phone': '手机绑定',
    'security-email': '邮箱绑定',
    'security-password': '重置密码',
    'security-delete': '注销账号',
    premium: '大会员',
    blacklist: '黑名单',
    'api-keys': 'API 密钥',
    badges: '勋章',
    'avatar-frames': '头像框',
    accessibility: '无障碍与阅读',
    customer: '联系客服',
    creator: '创作中心',
    danmaku: '弹幕管理',
  };
  return map[view] ?? '个人中心';
}

/**
 * @param {MemberView} view
 */
/**
 * @param {MemberView | string} [view]
 */
export function openMemberCenter(view = 'hub') {
  if (!requireLogin()) return;
  void navigateTo('member', { view });
}

function getBodyEl() {
  return document.getElementById('member-center-body');
}

/**
 * @param {MemberView} view
 */
async function setView(view) {
  currentView = view;
  const title = document.getElementById('member-center-title');
  if (title) title.textContent = viewTitle(view);
  await renderView();
}

/**
 * @param {string} view
 * @param {string} icon
 * @param {string} label
 * @param {string} [desc]
 */
function memberHubTile(view, icon, label, desc = '') {
  return `
    <button type="button" class="member-tile" data-member-view="${view}">
      <span class="member-tile__icon-wrap">${materialIcon(icon, 'member-tile__icon')}</span>
      <span class="member-tile__text">
        <span class="member-tile__label">${escapeHtml(label)}</span>
        ${desc ? `<span class="member-tile__desc">${escapeHtml(desc)}</span>` : ''}
      </span>
      ${materialIcon('chevron_right', 'member-tile__chevron')}
    </button>`;
}

function hubTiles() {
  const session = loadSession();
  const name = userDisplayName(session?.user);
  const avatarHtml = renderUserFramedAvatarHtml({
    user: session?.user ?? null,
    fallbackAvatarSrc: userAvatarMediaSrc(session?.user) || 'assets/mfuns_logo.png',
    size: 'member-hub',
    imgClass: 'member-hub-hero__avatar-img',
    phClass: 'member-hub-hero__avatar-img--ph',
  });

  return `
    <div class="member-hub-hero">
      <div class="member-hub-hero__avatar">
        ${avatarHtml}
      </div>
      <div class="member-hub-hero__main">
        <p class="member-hub-hero__greet">你好，${escapeHtml(name)}</p>
        <p class="member-hub-hero__sub">账号权益、装扮与创作工具</p>
      </div>
    </div>
    <section class="member-hub-group" aria-labelledby="member-hub-group-account">
      <h2 class="member-hub-group__title" id="member-hub-group-account">账号</h2>
      <div class="member-tiles member-tiles--list">
        ${memberHubTile('security', 'shield', '账号与安全', '手机、邮箱与登录设备')}
        ${memberHubTile('premium', 'workspace_premium', '大会员', '会员状态与权益')}
        ${memberHubTile('blacklist', 'block', '黑名单', '屏蔽的用户')}
        ${memberHubTile('api-keys', 'key', 'API 密钥', '开发者接口')}
      </div>
    </section>
    <section class="member-hub-group" aria-labelledby="member-hub-group-profile">
      <h2 class="member-hub-group__title" id="member-hub-group-profile">装扮</h2>
      <div class="member-tiles member-tiles--grid">
        ${memberHubTile('badges', 'military_tech', '勋章')}
        ${memberHubTile('avatar-frames', 'face_retouching_natural', '头像框')}
      </div>
    </section>
    <section class="member-hub-group" aria-labelledby="member-hub-group-more">
      <h2 class="member-hub-group__title" id="member-hub-group-more">更多</h2>
      <div class="member-tiles member-tiles--list">
        ${memberHubTile('accessibility', 'accessibility_new', '无障碍与阅读', '减弱动效等')}
        ${memberHubTile('customer', 'support_agent', '联系客服')}
        ${memberHubTile('creator', 'video_library', '创作中心', '投稿与数据')}
        ${memberHubTile('danmaku', 'subtitles', '弹幕管理')}
      </div>
    </section>`;
}

async function renderSecurityHub() {
  securityInfo = await fetchUserSecurityInfo();
  const phone = securityInfo.phone ? `${securityInfo.phone}` : '未绑定';
  const email = securityInfo.email ? `${securityInfo.email}` : '未绑定';
  const pendingDelete = Boolean(securityInfo.delete_pending ?? securityInfo.account_delete_pending);
  const sessions = Array.isArray(securityInfo.sessions)
    ? securityInfo.sessions
    : Array.isArray(securityInfo.login_sessions)
      ? securityInfo.login_sessions
      : [];

  const sessionRows = sessions
    .map((raw) => {
      const row = raw && typeof raw === 'object' ? raw : {};
      const id = row.session_id ?? row.id;
      const label = row.device ?? row.client ?? row.ip ?? '登录设备';
      const time = row.last_active ?? row.time ?? '';
      return `
        <div class="member-list-row">
          <div class="member-list-row__main">
            <p class="member-list-row__title">${escapeHtml(`${label}`)}</p>
            ${time ? `<p class="member-list-row__meta">${escapeHtml(`${time}`)}</p>` : ''}
          </div>
          <button type="button" class="btn-secondary btn-secondary--sm" data-session-kick="${escapeHtml(`${id}`)}">下线</button>
        </div>`;
    })
    .join('');

  return `
    <div class="member-section">
      <button type="button" class="member-link-row" data-member-view="security-phone">
        <span>手机号</span><span class="member-link-row__value">${escapeHtml(phone)}</span>
      </button>
      <button type="button" class="member-link-row" data-member-view="security-email">
        <span>邮箱</span><span class="member-link-row__value">${escapeHtml(email)}</span>
      </button>
      <button type="button" class="member-link-row" data-member-view="security-password">
        <span>重置密码</span><span class="member-link-row__value">通过短信验证</span>
      </button>
      <button type="button" class="member-link-row member-link-row--danger" data-member-view="security-delete">
        <span>注销账号</span><span class="member-link-row__value">${pendingDelete ? '注销处理中' : '永久删除'}</span>
      </button>
      ${
        pendingDelete
          ? `<button type="button" class="btn-secondary" id="member-cancel-delete">撤销注销申请</button>`
          : ''
      }
    </div>
    ${
      sessionRows
        ? `<section class="member-section"><h3 class="member-section__title">登录设备</h3>${sessionRows}</section>`
        : ''
    }`;
}

function formField(id, label, type = 'text', extra = '') {
  return `
    <label class="member-field">
      <span class="member-field__label">${escapeHtml(label)}</span>
      <input class="member-field__input" id="${id}" type="${type}" ${extra} />
    </label>`;
}

async function renderView() {
  const body = getBodyEl();
  if (!body) return;
  if (!isLoggedIn()) {
    body.innerHTML = '<p class="member-empty">请先登录</p>';
    return;
  }

  body.innerHTML = '<p class="member-empty">加载中…</p>';

  try {
    let html = '';
    switch (currentView) {
      case 'hub':
        html = hubTiles();
        break;
      case 'security':
        html = await renderSecurityHub();
        break;
      case 'security-phone':
        html = `
          <form class="member-form" id="member-phone-form">
            ${formField('member-phone', '手机号', 'tel')}
            <div class="member-form__row">
              ${formField('member-phone-code', '验证码', 'text', 'inputmode="numeric"')}
              <button type="button" class="btn-secondary" id="member-phone-send-code">获取验证码</button>
            </div>
            <p class="member-hint">未绑定直接提交；已绑定请使用「换绑」字段。</p>
            ${formField('member-new-phone', '新手机号（换绑）', 'tel')}
            ${formField('member-old-phone-code', '原手机验证码', 'text', 'inputmode="numeric"')}
            ${formField('member-new-phone-code', '新手机验证码', 'text', 'inputmode="numeric"')}
            <button type="submit" class="btn-accent">保存</button>
          </form>`;
        break;
      case 'security-email':
        html = `
          <form class="member-form" id="member-email-form">
            ${formField('member-email', '邮箱')}
            <div class="member-form__row">
              ${formField('member-email-code', '验证码', 'text', 'inputmode="numeric"')}
              <button type="button" class="btn-secondary" id="member-email-send-code">获取验证码</button>
            </div>
            <button type="submit" class="btn-accent">绑定 / 更新</button>
          </form>`;
        break;
      case 'security-password':
        html = `
          <form class="member-form" id="member-password-form">
            ${formField('member-pwd-phone', '手机号', 'tel')}
            <div class="member-form__row">
              ${formField('member-pwd-code', '短信验证码', 'text', 'inputmode="numeric"')}
              <button type="button" class="btn-secondary" id="member-pwd-send-code">获取验证码</button>
            </div>
            ${formField('member-pwd-new', '新密码', 'password')}
            ${formField('member-pwd-repeat', '确认新密码', 'password')}
            <button type="submit" class="btn-accent">重置密码</button>
          </form>`;
        break;
      case 'security-delete':
        html = `
          <div class="member-warning">
            <p>注销后账号数据将无法恢复，请谨慎操作。</p>
          </div>
          <form class="member-form" id="member-delete-form">
            ${formField('member-delete-phone', '绑定手机号', 'tel')}
            ${formField('member-delete-code', '短信验证码', 'text', 'inputmode="numeric"')}
            ${formField('member-delete-name', '确认昵称')}
            <button type="submit" class="btn-accent member-btn-danger">提交注销申请</button>
          </form>`;
        break;
      case 'premium': {
        securityInfo = await fetchUserSecurityInfo();
        const session = loadSession();
        const status = parsePremiumStatus(securityInfo, session?.user);
        html = `
          <div class="member-premium-card ${status.isPremium ? 'is-active' : ''}">
            <h3 class="member-premium-card__title">${escapeHtml(status.label)}</h3>
            <p class="member-premium-card__desc">此桌面端为民间第三方开发，仅展示大会员状态，不提供充值或兑换。如需开通请前往官网。</p>
            ${
              status.expireAt
                ? `<p class="member-premium-card__meta">到期时间：${escapeHtml(status.expireAt)}</p>`
                : ''
            }
          </div>`;
        break;
      }
      case 'blacklist': {
        const list = await fetchBlacklist();
        html =
          list.length === 0
            ? '<p class="member-empty">黑名单为空</p>'
            : `<div class="member-list">${list
                .map(
                  (user) => `
              <div class="member-list-row">
                ${renderUserFramedAvatarHtml({
                  avatar: user.avatar,
                  frame: user.avatarFrame,
                  size: 'member-list',
                  imgClass: 'member-list-row__avatar',
                  phClass: 'member-list-row__avatar--ph',
                })}
                <div class="member-list-row__main">
                  <p class="member-list-row__title">${escapeHtml(user.name)}</p>
                  <p class="member-list-row__meta">UID ${user.userId}</p>
                </div>
                <button type="button" class="btn-secondary btn-secondary--sm" data-blacklist-remove="${user.userId}">移除</button>
              </div>`,
                )
                .join('')}</div>
            <button type="button" class="btn-accent" id="member-blacklist-add">添加用户到黑名单</button>`;
        break;
      }
      case 'api-keys': {
        const keys = await fetchApiKeys();
        html = `
          <p class="member-hint">用于开放平台接口调用，完整 Key 仅在创建时展示一次。</p>
          <button type="button" class="btn-accent" id="member-api-create">创建 API Key</button>
          <div class="member-list">
            ${
              keys.length === 0
                ? '<p class="member-empty">暂无密钥</p>'
                : keys
                    .map(
                      (key) => `
                <div class="member-list-row">
                  <div class="member-list-row__main">
                    <p class="member-list-row__title">${escapeHtml(key.name)}</p>
                    <p class="member-list-row__meta">${escapeHtml(key.keyPreview)}</p>
                  </div>
                  <button type="button" class="btn-secondary btn-secondary--sm" data-api-revoke="${key.id}">吊销</button>
                </div>`,
                    )
                    .join('')
            }
          </div>`;
        break;
      }
      case 'badges': {
        const badges = await fetchUserBadges();
        html =
          badges.length === 0
            ? '<p class="member-empty">暂无勋章</p>'
            : `<div class="member-badge-grid">${badges
                .map(
                  (badge) => `
              <button type="button" class="member-badge-card ${badge.active ? 'is-active' : ''}" data-badge-set="${badge.id}">
                ${
                  badge.image
                    ? `<img src="${escapeHtml(badge.image)}" alt="" />`
                    : materialIcon('military_tech')
                }
                <span>${escapeHtml(badge.name)}</span>
              </button>`,
                )
                .join('')}</div>`;
        break;
      }
      case 'avatar-frames': {
        const [mine, shop] = await Promise.all([
          fetchMyAvatarFrames(),
          fetchAvatarFrameShop().catch(() => []),
        ]);
        const ownedIds = new Set(mine.map((item) => item.id));
        const combined = [...mine, ...shop.filter((item) => !ownedIds.has(item.id))];
        html =
          combined.length === 0
            ? '<p class="member-empty">暂无头像框</p>'
            : `<div class="member-frame-grid">${combined
                .map(
                  (frame) => `
              <div class="member-frame-card ${frame.wearing ? 'is-wearing' : ''}">
                ${frame.image ? `<img src="${escapeHtml(frame.image)}" alt="" />` : ''}
                <p>${escapeHtml(frame.name)}</p>
                <div class="member-frame-card__actions">
                  ${
                    frame.wearing
                      ? `<button type="button" class="btn-secondary btn-secondary--sm" data-frame-unwear="${frame.id}">摘下</button>`
                      : `<button type="button" class="btn-accent btn-accent--sm" data-frame-wear="${frame.id}">佩戴</button>`
                  }
                </div>
              </div>`,
                )
                .join('')}</div>
            <p class="member-hint">头像框获取与试用请前往官网；此处仅展示与佩戴。</p>`;
        break;
      }
      case 'accessibility': {
        const app = loadAppSettings();
        const prefs = loadPreferences();
        html = `
          <div class="member-section">
            <label class="member-check">
              <input type="checkbox" id="member-a11y-reduce-motion" ${app.reduceMotion ? 'checked' : ''} />
              <span>减少动效（主题切换等）</span>
            </label>
            <label class="member-field">
              <span class="member-field__label">弹幕默认不透明度（%）</span>
              <input type="range" id="member-a11y-danmaku-opacity" min="20" max="100" value="${Math.round(app.danmakuOpacity * 100)}" />
            </label>
            <p class="member-hint">当前主题：${prefs.colorScheme === 'dark' ? '深色' : '浅色'}。可在设置 → 外观中调整。</p>
          </div>`;
        break;
      }
      case 'customer':
        html = `
          <p class="member-hint">遇到问题可通过官网客服渠道反馈，桌面端将打开内置浏览器。</p>
          <button type="button" class="btn-secondary" id="member-open-contact">联系与反馈</button>`;
        break;
      case 'creator':
        html = `
          <div class="member-tiles member-tiles--creator">
            <button type="button" class="member-tile" data-go-contribute="submission">${materialIcon('upload_file', 'member-tile__icon')}<span>投稿管理</span></button>
            <button type="button" class="member-tile" data-go-contribute="feed">${materialIcon('edit_note', 'member-tile__icon')}<span>动态创作</span></button>
            <button type="button" class="member-tile" data-go-contribute="published">${materialIcon('inventory_2', 'member-tile__icon')}<span>已发布作品</span></button>
            <button type="button" class="member-tile" data-member-view="danmaku">${materialIcon('subtitles', 'member-tile__icon')}<span>弹幕管理</span></button>
            <button type="button" class="member-tile" id="member-open-creator-web">${materialIcon('open_in_new', 'member-tile__icon')}<span>创作指南（官网）</span></button>
          </div>`;
        break;
      case 'danmaku': {
        const page = await fetchUserDanmakuPage(1, 30);
        html = `
          <div class="member-danmaku-tools">
            <label class="member-field">
              <span class="member-field__label">按视频 ID 查询弹幕</span>
              <input class="member-field__input" id="member-danmaku-video-id" type="number" placeholder="视频 ID" />
            </label>
            <button type="button" class="btn-secondary" id="member-danmaku-video-load">查询</button>
          </div>
          <div id="member-danmaku-list" class="member-list">
            ${
              page.items.length === 0
                ? '<p class="member-empty">暂无弹幕记录</p>'
                : page.items
                    .map(
                      (row) => `
                <div class="member-list-row">
                  <div class="member-list-row__main">
                    <p class="member-list-row__title">${escapeHtml(row.content)}</p>
                    <p class="member-list-row__meta">视频 ${row.videoId} · P${row.part} · ${row.time.toFixed(1)}s</p>
                  </div>
                  <button type="button" class="btn-secondary btn-secondary--sm" data-danmaku-del="${row.id}">删除</button>
                </div>`,
                    )
                    .join('')
            }
          </div>`;
        break;
      }
      default:
        html = hubTiles();
    }
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<p class="member-empty">加载失败：${escapeHtml(err instanceof Error ? err.message : `${err}`)}</p>`;
  }
}

/**
 * @param {Event} event
 */
async function onMemberBodyClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const id = target.closest('[id]')?.id ?? '';

  if (id === 'member-cancel-delete' || target.closest('#member-cancel-delete')) {
    try {
      await cancelAccountDelete();
      notify('已撤销注销申请');
      await setView('security');
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    }
    return;
  }

  if (target.closest('#member-phone-send-code')) {
    const phone = /** @type {HTMLInputElement} */ (document.getElementById('member-phone'))?.value.trim();
    if (!phone) return notify('请填写手机号', 'error');
    try {
      await sendPhoneBindCode(phone);
      notify('验证码已发送');
    } catch (err) {
      notify(err instanceof Error ? err.message : '发送失败', 'error');
    }
    return;
  }

  if (target.closest('#member-email-send-code')) {
    const email = /** @type {HTMLInputElement} */ (document.getElementById('member-email'))?.value.trim();
    if (!email) return notify('请填写邮箱', 'error');
    try {
      await sendEmailCode(email);
      notify('验证码已发送');
    } catch (err) {
      notify(err instanceof Error ? err.message : '发送失败', 'error');
    }
    return;
  }

  if (target.closest('#member-pwd-send-code')) {
    const phone = /** @type {HTMLInputElement} */ (document.getElementById('member-pwd-phone'))?.value.trim();
    if (!phone) return notify('请填写手机号', 'error');
    try {
      await sendPhoneBindCode(phone);
      notify('验证码已发送');
    } catch (err) {
      notify(err instanceof Error ? err.message : '发送失败', 'error');
    }
    return;
  }

  if (target.closest('#member-blacklist-add')) {
    const raw = await promptInput({
      title: '加入黑名单',
      label: '用户 ID',
      placeholder: '输入要拉黑的用户 ID',
    });
    const userId = Number.parseInt(`${raw ?? ''}`, 10);
    if (!Number.isFinite(userId) || userId <= 0) return;
    try {
      await addBlacklistUser(userId);
      notify('已加入黑名单');
      await setView('blacklist');
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    }
    return;
  }

  if (target.closest('#member-api-create')) {
    const name = await promptInput({
      title: '创建 API Key',
      label: '名称',
      placeholder: '给密钥起个名字',
    });
    if (!name?.trim()) return;
    try {
      const created = await createApiKey({ name: name.trim() });
      const key = created.key ?? created.api_key;
      if (key) {
        await confirmAction({
          title: 'API Key 已创建',
          message: `请立即保存 Key（仅显示一次）：\n\n${key}`,
          confirmText: '我已保存',
          cancelText: '关闭',
        });
      } else {
        notify('API Key 已创建');
      }
      await setView('api-keys');
    } catch (err) {
      notify(err instanceof Error ? err.message : '创建失败', 'error');
    }
    return;
  }

  if (target.closest('#member-open-contact')) {
    openInAppBrowser('https://www.mfuns.net/customer/contact', '联系客服');
    return;
  }
  if (target.closest('#member-open-creator-web')) {
    openInAppBrowser('https://www.mfuns.net/creator', '创作指南');
    return;
  }

  if (target.closest('#member-danmaku-video-load')) {
    const videoId = Number.parseInt(
      /** @type {HTMLInputElement} */ (document.getElementById('member-danmaku-video-id'))?.value ?? '',
      10,
    );
    if (!Number.isFinite(videoId) || videoId <= 0) {
      notify('请输入有效视频 ID', 'error');
      return;
    }
    const listEl = document.getElementById('member-danmaku-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="member-empty">加载中…</p>';
    try {
      const page = await fetchVideoDanmakuPage(videoId, 1, 1, 50);
      listEl.innerHTML =
        page.items.length === 0
          ? '<p class="member-empty">该视频暂无弹幕</p>'
          : page.items
              .map(
                (row) => `
          <div class="member-list-row">
            <div class="member-list-row__main">
              <p class="member-list-row__title">${escapeHtml(row.content)}</p>
              <p class="member-list-row__meta">P${row.part} · ${row.time.toFixed(1)}s</p>
            </div>
            <button type="button" class="btn-secondary btn-secondary--sm" data-danmaku-del="${row.id}">删除</button>
          </div>`,
              )
              .join('');
    } catch (err) {
      listEl.innerHTML = `<p class="member-empty">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`;
    }
    return;
  }

  const viewBtn = target.closest('[data-member-view]');
  if (viewBtn) {
    const view = viewBtn.getAttribute('data-member-view');
    if (view) void setView(/** @type {MemberView} */ (view));
    return;
  }
  const contribute = target.closest('[data-go-contribute]');
  if (contribute) {
    const section = contribute.getAttribute('data-go-contribute');
    void navigateTo('contribute', { section });
    return;
  }
  const sessionKick = target.closest('[data-session-kick]');
  if (sessionKick) {
    const sid = sessionKick.getAttribute('data-session-kick');
    if (!sid) return;
    try {
      await deleteLoginSession(sid);
      notify('已下线该设备');
      await setView('security');
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    }
    return;
  }
  const blRemove = target.closest('[data-blacklist-remove]');
  if (blRemove) {
    const userId = Number.parseInt(blRemove.getAttribute('data-blacklist-remove') ?? '', 10);
    if (!Number.isFinite(userId)) return;
    try {
      await removeBlacklistUser(userId);
      notify('已移出黑名单');
      await setView('blacklist');
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    }
    return;
  }
  const apiRevoke = target.closest('[data-api-revoke]');
  if (apiRevoke) {
    const keyId = Number.parseInt(apiRevoke.getAttribute('data-api-revoke') ?? '', 10);
    if (!Number.isFinite(keyId)) return;
    const ok = await confirmAction({
      title: '吊销密钥',
      message: '确定吊销该 API Key？',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await revokeApiKey(keyId);
      notify('已吊销');
      await setView('api-keys');
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    }
    return;
  }
  const badgeBtn = target.closest('[data-badge-set]');
  if (badgeBtn) {
    const badgeId = Number.parseInt(badgeBtn.getAttribute('data-badge-set') ?? '', 10);
    if (!Number.isFinite(badgeId)) return;
    try {
      await setDisplayBadge(badgeId);
      notify('展示勋章已更新');
      await setView('badges');
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    }
    return;
  }
  const wear = target.closest('[data-frame-wear]');
  if (wear) {
    const frameId = Number.parseInt(wear.getAttribute('data-frame-wear') ?? '', 10);
    if (!Number.isFinite(frameId)) return;
    try {
      await wearAvatarFrame(frameId);
      notify('已佩戴头像框');
      await setView('avatar-frames');
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    }
    return;
  }
  const unwear = target.closest('[data-frame-unwear]');
  if (unwear) {
    const frameId = Number.parseInt(unwear.getAttribute('data-frame-unwear') ?? '', 10);
    if (!Number.isFinite(frameId)) return;
    try {
      await unwearAvatarFrame(frameId);
      notify('已摘下头像框');
      await setView('avatar-frames');
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    }
    return;
  }
  const danDel = target.closest('[data-danmaku-del]');
  if (danDel) {
    const danmakuId = Number.parseInt(danDel.getAttribute('data-danmaku-del') ?? '', 10);
    if (!Number.isFinite(danmakuId)) return;
    const ok = await confirmAction({
      title: '删除弹幕',
      message: '确定删除该弹幕？',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteDanmakuByIds([danmakuId]);
      notify('已删除');
      await setView('danmaku');
    } catch (err) {
      notify(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }
}

/**
 * @param {Event} event
 */
async function onMemberBodySubmit(event) {
  const form = /** @type {HTMLFormElement | null} */ (
    /** @type {HTMLElement} */ (event.target).closest('form')
  );
  if (!form) return;
  event.preventDefault();

  if (form.id === 'member-phone-form') {
    const phone = /** @type {HTMLInputElement} */ (document.getElementById('member-phone'))?.value.trim();
    const code = /** @type {HTMLInputElement} */ (document.getElementById('member-phone-code'))?.value.trim();
    const newPhone = /** @type {HTMLInputElement} */ (document.getElementById('member-new-phone'))?.value.trim();
    const oldCode = /** @type {HTMLInputElement} */ (document.getElementById('member-old-phone-code'))?.value.trim();
    const newCode = /** @type {HTMLInputElement} */ (document.getElementById('member-new-phone-code'))?.value.trim();
    try {
      if (newPhone) {
        await updatePhone({
          old_phone: phone,
          old_code: oldCode,
          new_phone: newPhone,
          new_code: newCode,
        });
      } else {
        await bindPhone(phone, code);
      }
      notify('手机号已更新');
      await setView('security');
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', 'error');
    }
    return;
  }

  if (form.id === 'member-email-form') {
    const email = /** @type {HTMLInputElement} */ (document.getElementById('member-email'))?.value.trim();
    const code = /** @type {HTMLInputElement} */ (document.getElementById('member-email-code'))?.value.trim();
    try {
      if (securityInfo?.email) {
        await updateEmail({ email, code: Number(code) });
      } else {
        await bindEmail(email, code);
      }
      notify('邮箱已更新');
      await setView('security');
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', 'error');
    }
    return;
  }

  if (form.id === 'member-password-form') {
    const phone = /** @type {HTMLInputElement} */ (document.getElementById('member-pwd-phone'))?.value.trim();
    const phone_code = /** @type {HTMLInputElement} */ (document.getElementById('member-pwd-code'))?.value.trim();
    const password = /** @type {HTMLInputElement} */ (document.getElementById('member-pwd-new'))?.value;
    const reenteredPassword = /** @type {HTMLInputElement} */ (
      document.getElementById('member-pwd-repeat')
    )?.value;
    if (password !== reenteredPassword) {
      notify('两次密码不一致', 'error');
      return;
    }
    try {
      await resetPassword({ phone, phone_code, password, reenteredPassword });
      notify('密码已重置');
      await setView('security');
    } catch (err) {
      notify(err instanceof Error ? err.message : '重置失败', 'error');
    }
    return;
  }

  if (form.id === 'member-delete-form') {
    const ok = await confirmAction({
      title: '注销账号',
      message: '确定提交账号注销申请？',
      variant: 'danger',
      confirmText: '提交注销',
    });
    if (!ok) return;
    const phone = /** @type {HTMLInputElement} */ (document.getElementById('member-delete-phone'))?.value.trim();
    const code = /** @type {HTMLInputElement} */ (document.getElementById('member-delete-code'))?.value.trim();
    const name = /** @type {HTMLInputElement} */ (document.getElementById('member-delete-name'))?.value.trim();
    try {
      await submitDeleteAccount({ phone, code: Number(code), name });
      notify('注销申请已提交');
      await setView('security');
    } catch (err) {
      notify(err instanceof Error ? err.message : '提交失败', 'error');
    }
  }
}

/**
 * @param {Event} event
 */
function onMemberBodyInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === 'member-a11y-danmaku-opacity') {
    saveAppSettings({ danmakuOpacity: Number(target.value) / 100 });
  }
  if (target.id === 'member-a11y-reduce-motion') {
    saveAppSettings({ reduceMotion: target.checked });
    document.documentElement.classList.toggle('reduce-motion', target.checked);
  }
}

export function memberCenterPageHtml() {
  return `
    <div class="page-view page-view--member" data-page="member" hidden>
      <div class="member-center-page">
        <header class="member-center-page__head app-no-drag">
          <button type="button" class="member-center-page__back" id="member-center-back" aria-label="返回">
            ${materialIcon('arrow_back', 'member-center-page__back-icon')}
          </button>
          <h1 class="member-center-page__title" id="member-center-title">个人中心</h1>
        </header>
        <div class="member-center-page__scroll" id="member-center-scroll">
          <div id="member-center-body" class="member-center-page__body"></div>
        </div>
      </div>
    </div>`;
}

export function bindMemberCenterPage() {
  if (bound) return;
  bound = true;

  document.getElementById('member-center-back')?.addEventListener('click', () => {
    if (currentView === 'hub') {
      void navigateBack();
      return;
    }
    if (currentView.startsWith('security-')) void setView('security');
    else void setView('hub');
  });

  const body = getBodyEl();
  body?.addEventListener('click', (event) => {
    void onMemberBodyClick(event);
  });
  body?.addEventListener('submit', (event) => {
    void onMemberBodySubmit(event);
  });
  body?.addEventListener('input', onMemberBodyInput);

  registerPageNavigation('member', {
    capture: () => ({
      view: currentView,
      scrollTop: getScrollTop('member-center-scroll'),
    }),
    restore: (state) => {
      currentView = /** @type {MemberView} */ (state.view ?? 'hub');
      void setView(currentView).then(() => {
        restoreScrollTop('member-center-scroll', Number(state.scrollTop) || 0);
      });
    },
    enter: async (params) => {
      if (!requireLogin()) return;
      const view = /** @type {MemberView} */ (params.view ?? 'hub');
      await setView(view);
    },
  });
}

export async function refreshMemberSecurityUser() {
  const session = loadSession();
  if (!session?.token) return;
  try {
    const user = await fetchUserInfo(session.token);
    saveSession({ token: session.token, user });
  } catch {
    /* ignore */
  }
}
