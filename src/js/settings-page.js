import {
  fetchUserInfo,
  loadSession,
  saveSession,
  userDisplayName,
} from './auth.js';
import { mediaSrcForCover, userAvatarMediaSrc } from './content-api.js';
import { openLoginPanel, isLoggedIn } from './login-ui.js';
import { notify } from './notice-ui.js';
import { loadAppSettings, saveAppSettings } from './app-preferences.js';
import { confirmAction } from './confirm-dialog.js';
import {
  clearOfflineCache,
  fetchOfflineUsage,
} from './offline-cache-store.js';
import {
  clearWatchLater,
  resolveWatchLaterUserId,
} from './watch-later-store.js';
import {
  fetchLevelSections,
  fetchUserBackpack,
  fetchUserProfile,
  normalizeGenderValue,
  updateUserAvatar,
  updateUserBio,
  updateUserGender,
  updateUserName,
} from './user-profile-api.js';
import { uploadCommentImage } from './video-api.js';

const DEFAULT_AVATAR_SRC = 'assets/mfuns_logo.png';

/** @type {(() => void) | null} */
let onUserUpdated = null;

/**
 * @param {{ onUserUpdated?: () => void }} [options]
 */
export function bindSettingsPage(options = {}) {
  onUserUpdated = options.onUserUpdated ?? null;

  document.getElementById('settings-account-card')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      target.closest('#settings-account-switch') ||
      target.closest('#settings-profile-login')
    ) {
      openLoginPanel();
    }
  });

  document.getElementById('settings-avatar-btn')?.addEventListener('click', () => {
    if (!isLoggedIn()) {
      openLoginPanel();
      return;
    }
    document.getElementById('settings-avatar-input')?.click();
  });

  /** @type {HTMLInputElement | null} */
  const avatarInput = document.getElementById('settings-avatar-input');
  avatarInput?.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    avatarInput.value = '';
    if (!file || !isLoggedIn()) return;
    if (!file.type.startsWith('image/')) {
      notify('请选择图片文件', 'error');
      return;
    }
    try {
      const path = await uploadCommentImage(file);
      await updateUserAvatar(path);
      await refreshSessionUser();
      await refreshSettingsProfile();
      notify('头像已更新');
    } catch (err) {
      notify(err instanceof Error ? err.message : '头像更新失败', 'error');
    }
  });

  document.getElementById('btn-save-profile-name')?.addEventListener('click', async () => {
    const input = /** @type {HTMLInputElement | null} */ (
      document.getElementById('settings-profile-name')
    );
    if (!input || !isLoggedIn()) return;
    try {
      await updateUserName(input.value);
      await refreshSessionUser();
      renderAccountCard();
      notify('昵称已更新');
    } catch (err) {
      notify(err instanceof Error ? err.message : '昵称更新失败', 'error');
    }
  });

  document.getElementById('btn-save-profile-bio')?.addEventListener('click', async () => {
    const input = /** @type {HTMLTextAreaElement | null} */ (
      document.getElementById('settings-profile-bio')
    );
    if (!input || !isLoggedIn()) return;
    try {
      await updateUserBio(input.value);
      await refreshSessionUser();
      notify('简介已更新');
    } catch (err) {
      notify(err instanceof Error ? err.message : '简介更新失败', 'error');
    }
  });

  document.querySelectorAll('input[name="settings-profile-gender"]').forEach((el) => {
    el.addEventListener('change', async () => {
      if (!isLoggedIn()) return;
      const checked = /** @type {HTMLInputElement | null} */ (
        document.querySelector('input[name="settings-profile-gender"]:checked')
      );
      if (!checked) return;
      const gender = normalizeGenderValue(Number.parseInt(checked.value, 10));
      try {
        await updateUserGender(gender);
        await refreshSessionUser();
        notify('性别已更新');
      } catch (err) {
        notify(err instanceof Error ? err.message : '性别更新失败', 'error');
        await refreshSettingsProfile();
      }
    });
  });

  bindSettingsAnchorNav();
  bindAppSettingsControls();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function syncAppSettingsForm() {
  const settings = loadAppSettings();
  const quality = document.getElementById('setting-default-quality');
  if (quality instanceof HTMLSelectElement) quality.value = settings.defaultQuality;
  const danmakuEnabled = document.getElementById('setting-danmaku-enabled');
  if (danmakuEnabled instanceof HTMLInputElement) {
    danmakuEnabled.checked = settings.danmakuEnabled;
  }
  const opacity = document.getElementById('setting-danmaku-opacity');
  const opacityLabel = document.getElementById('setting-danmaku-opacity-label');
  if (opacity instanceof HTMLInputElement) {
    const percent = Math.round(settings.danmakuOpacity * 100);
    opacity.value = String(percent);
    if (opacityLabel) opacityLabel.textContent = `${percent}%`;
  }
  const autoLaunch = document.getElementById('setting-auto-launch');
  if (autoLaunch instanceof HTMLInputElement) {
    autoLaunch.checked = settings.autoLaunch;
  }
  void refreshOfflineUsageLabel();
  void syncAutoLaunchFromSystem();
}

async function syncAutoLaunchFromSystem() {
  const autoLaunch = document.getElementById('setting-auto-launch');
  if (!(autoLaunch instanceof HTMLInputElement) || !window.electronAPI?.app?.getAutoLaunch) return;
  const res = await window.electronAPI.app.getAutoLaunch();
  if (res?.ok) {
    autoLaunch.checked = Boolean(res.enabled);
    saveAppSettings({ autoLaunch: autoLaunch.checked });
  }
}

async function refreshOfflineUsageLabel() {
  const el = document.getElementById('settings-offline-usage');
  if (!el) return;
  const usage = await fetchOfflineUsage();
  el.textContent = `${usage.files} 个文件 · ${formatBytes(usage.bytes)}`;
}

function bindAppSettingsControls() {
  document.getElementById('setting-default-quality')?.addEventListener('change', (event) => {
    const value = /** @type {HTMLSelectElement} */ (event.currentTarget).value;
    saveAppSettings({ defaultQuality: value });
    notify('默认清晰度已保存');
  });

  document.getElementById('setting-danmaku-enabled')?.addEventListener('change', (event) => {
    const checked = /** @type {HTMLInputElement} */ (event.currentTarget).checked;
    saveAppSettings({ danmakuEnabled: checked });
  });

  document.getElementById('setting-danmaku-opacity')?.addEventListener('input', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    const percent = Number(input.value);
    saveAppSettings({ danmakuOpacity: percent / 100 });
    const label = document.getElementById('setting-danmaku-opacity-label');
    if (label) label.textContent = `${percent}%`;
  });

  document.getElementById('setting-auto-launch')?.addEventListener('change', async (event) => {
    const checked = /** @type {HTMLInputElement} */ (event.currentTarget).checked;
    saveAppSettings({ autoLaunch: checked });
    if (window.electronAPI?.app?.setAutoLaunch) {
      await window.electronAPI.app.setAutoLaunch(checked);
    }
  });

  document.getElementById('btn-clear-offline-cache')?.addEventListener('click', () => {
    void (async () => {
      const confirmed = await confirmAction({
        title: '清空离线缓存',
        message: '将删除本机已下载的视频文件，确定继续？',
        confirmText: '清空',
        variant: 'danger',
      });
      if (!confirmed) return;
      await clearOfflineCache();
      await refreshOfflineUsageLabel();
      notify('离线缓存已清空');
    })();
  });

  document.getElementById('btn-clear-watch-later')?.addEventListener('click', () => {
    void (async () => {
      const confirmed = await confirmAction({
        title: '清空稍后再看',
        message: '确定清空当前账号/访客桶的稍后再看列表？',
        confirmText: '清空',
        variant: 'danger',
      });
      if (!confirmed) return;
      clearWatchLater(resolveWatchLaterUserId());
      notify('稍后再看已清空');
    })();
  });

  void window.electronAPI?.app?.getVersion?.().then((version) => {
    const el = document.getElementById('settings-app-version');
    if (el && version) el.textContent = String(version);
  });

  syncAppSettingsForm();
}

async function refreshAccountExtra() {
  const section = document.getElementById('settings-section-account-extra');
  const anchor = document.querySelector('.settings-anchor__link[data-settings-anchor="account-extra"]');
  const levelEl = document.getElementById('settings-level-sections');
  const backpackEl = document.getElementById('settings-backpack-list');
  if (!section || !levelEl || !backpackEl) return;

  const loggedIn = isLoggedIn();
  section.hidden = !loggedIn;
  anchor?.closest('li')?.toggleAttribute('hidden', !loggedIn);
  if (!loggedIn) return;

  levelEl.textContent = '加载中…';
  backpackEl.textContent = '加载中…';
  try {
    const [levels, backpack] = await Promise.all([
      fetchLevelSections().catch(() => []),
      fetchUserBackpack().catch(() => []),
    ]);
    levelEl.innerHTML =
      levels.length > 0
        ? `<ul class="settings-level-list">${levels
            .map((item) => `<li>LV${item.levelId} · 经验 ${item.experience}</li>`)
            .join('')}</ul>`
        : '<p class="settings-muted">暂无等级数据</p>';
    backpackEl.innerHTML =
      backpack.length > 0
        ? `<ul class="settings-backpack-list">${backpack
            .map((item) => {
              const icon = item.icon ? `<img src="${escapeHtml(mediaSrcForCover(item.icon) ?? '')}" alt="" />` : '';
              return `<li class="settings-backpack-item">${icon}<span>${escapeHtml(item.name)} × ${item.count}</span></li>`;
            })
            .join('')}</ul>`
        : '<p class="settings-muted">背包为空</p>';
  } catch {
    levelEl.innerHTML = '<p class="settings-muted">加载失败</p>';
    backpackEl.innerHTML = '<p class="settings-muted">加载失败</p>';
  }
}

async function refreshSessionUser() {
  const session = loadSession();
  if (!session?.token) return;
  try {
    const user = await fetchUserInfo(session.token);
    saveSession({ token: session.token, user });
    onUserUpdated?.();
  } catch {
    /* 资料已写入服务端，会话刷新失败不阻断 */
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} user
 */
function userLevel(user) {
  if (!user) return null;
  const level = user.level_id ?? user.level;
  if (typeof level === 'number' && Number.isFinite(level)) return Math.trunc(level);
  const parsed = Number.parseInt(`${level ?? ''}`, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function renderAccountCard() {
  const card = document.getElementById('settings-account-card');
  const profileSection = document.getElementById('settings-section-profile');
  const anchorProfile = document.querySelector('.settings-anchor__link[data-settings-anchor="profile"]');
  if (!card || !profileSection) return;

  const loggedIn = isLoggedIn();
  const session = loadSession();
  const user = session?.user;

  profileSection.hidden = !loggedIn;
  anchorProfile?.closest('li')?.toggleAttribute('hidden', !loggedIn);
  document
    .querySelector('.settings-anchor__link[data-settings-anchor="account-extra"]')
    ?.closest('li')
    ?.toggleAttribute('hidden', !loggedIn);

  if (!loggedIn) {
    card.innerHTML = `
      <div class="settings-account settings-account--guest">
        <p class="settings-account__guest-tip">登录后可修改头像、昵称、性别与简介</p>
        <button type="button" class="btn-accent" id="settings-profile-login">登录</button>
      </div>`;
    return;
  }

  const name = userDisplayName(user);
  const level = userLevel(user);
  const remoteAvatar = userAvatarMediaSrc(user);
  const avatarSrc = remoteAvatar || DEFAULT_AVATAR_SRC;
  const brandFallback = !remoteAvatar;

  card.innerHTML = `
    <div class="settings-account settings-account--logged">
      <div class="settings-account__avatar-wrap">
        <img class="settings-account__avatar${brandFallback ? ' settings-account__avatar--brand' : ''}" src="${escapeHtml(avatarSrc)}" alt="" />
      </div>
      <div class="settings-account__meta">
        <div class="settings-account__name-row">
          <span class="settings-account__name">${escapeHtml(name)}</span>
          ${level != null ? `<span class="settings-account__level">LV${level}</span>` : ''}
        </div>
        <button type="button" class="settings-account__switch" id="settings-account-switch">
          <span class="material-symbols-outlined" aria-hidden="true">sync_alt</span>
          切换或退出账号
        </button>
      </div>
    </div>`;
}

/**
 * @param {import('./user-profile-api.js').UserProfile | null} profile
 */
function fillProfileForm(profile) {
  const nameInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('settings-profile-name')
  );
  const bioInput = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('settings-profile-bio')
  );
  if (!nameInput || !bioInput) return;

  if (profile) {
    nameInput.value = profile.name === 'MFuns 用户' ? '' : profile.name;
    const bio = profile.bio === '暂无简介' ? '' : profile.bio;
    bioInput.value = bio;
    const gender = normalizeGenderValue(profile.gender);
    /** @type {HTMLInputElement | null} */
    const radio = document.querySelector(
      `input[name="settings-profile-gender"][value="${gender}"]`,
    );
    if (radio) radio.checked = true;
  }

  const avatarImg = /** @type {HTMLImageElement | null} */ (
    document.getElementById('settings-profile-avatar')
  );
  const session = loadSession();
  const remote =
    userAvatarMediaSrc(session?.user) ||
    (profile?.avatar ? userAvatarMediaSrc({ avatar: profile.avatar }) : null);
  if (avatarImg) {
    avatarImg.src = remote || DEFAULT_AVATAR_SRC;
    avatarImg.classList.toggle('settings-profile-avatar--brand', !remote);
  }
}

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return `${text}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let profileLoading = false;

export async function refreshSettingsProfile() {
  renderAccountCard();
  syncAppSettingsForm();
  if (!isLoggedIn()) {
    fillProfileForm(null);
    void refreshAccountExtra();
    return;
  }
  if (profileLoading) return;
  profileLoading = true;
  try {
    const session = loadSession();
    const userId = Number(session?.user?.id ?? session?.user?.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      fillProfileForm(null);
      return;
    }
    const profile = await fetchUserProfile(userId);
    fillProfileForm(profile);
    void refreshAccountExtra();
  } catch (err) {
    console.error(err);
    fillProfileForm(null);
    void refreshAccountExtra();
  } finally {
    profileLoading = false;
  }
}

function bindSettingsAnchorNav() {
  const links = document.querySelectorAll('.settings-anchor__link[data-settings-anchor]');
  const sections = document.querySelectorAll('.settings-block[id]');
  if (!links.length || !sections.length) return;

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const key = link.getAttribute('data-settings-anchor');
      const target = document.getElementById(`settings-section-${key}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const main = document.querySelector('.settings-page__main');
  if (!main || typeof IntersectionObserver === 'undefined') return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible?.target?.id) return;
      const key = visible.target.id.replace('settings-section-', '');
      links.forEach((link) => {
        link.classList.toggle(
          'is-active',
          link.getAttribute('data-settings-anchor') === key,
        );
      });
    },
    { root: null, rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.2, 0.5] },
  );

  sections.forEach((section) => observer.observe(section));
}
