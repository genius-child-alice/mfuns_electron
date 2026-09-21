import { loadAppSettings, saveAppSettings } from './app-preferences.js';
import { closeDanmakuManagerDialog, openDanmakuManagerDialog } from './danmaku-manager-ui.js';
import { notify } from './notice-ui.js';
import { fetchDanmakuList, sendDanmaku } from './danmaku-api.js';
import { DanmakuRenderer, danmakuColorCss } from './danmaku-renderer.js';
import { materialIcon } from './icons.js';
import { requireLogin } from './login-ui.js';

const COMPOSE_STORAGE_KEY = 'mfuns.danmaku.compose.v1';

/** @typedef {import('./danmaku-api.js').DanmakuItem} DanmakuItem */

export const DANMAKU_COLOR_OPTIONS = [
  { value: 16777215, label: '白' },
  { value: 16744228, label: '红' },
  { value: 16753920, label: '橙' },
  { value: 16776960, label: '黄' },
  { value: 65280, label: '绿' },
  { value: 65535, label: '青' },
  { value: 255, label: '蓝' },
  { value: 16711935, label: '紫' },
  { value: 16738740, label: '粉' },
];

export const DANMAKU_TYPE_OPTIONS = [
  { value: 1, label: '滚动' },
  { value: 5, label: '顶部' },
  { value: 4, label: '底部' },
];

/**
 * @returns {{ color: number, type: number }}
 */
function loadComposePrefs() {
  try {
    const raw = localStorage.getItem(COMPOSE_STORAGE_KEY);
    if (!raw) return { color: 16777215, type: 1 };
    const data = JSON.parse(raw);
    const color = Number(data.color);
    const type = Number(data.type);
    const colorOk = Number.isFinite(color) && color >= 0 && color <= 0xffffff;
    return {
      color: colorOk ? Math.trunc(color) : 16777215,
      type: DANMAKU_TYPE_OPTIONS.some((o) => o.value === type) ? type : 1,
    };
  } catch {
    return { color: 16777215, type: 1 };
  }
}

/**
 * @param {{ color: number, type: number }} prefs
 */
function saveComposePrefs(prefs) {
  localStorage.setItem(COMPOSE_STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * @param {HTMLElement} root
 */
export class WatchDanmaku {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    /** @type {AbortController} */
    this.abort = new AbortController();
    const signal = this.abort.signal;

    this.canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('#watch-player-danmaku'));
    this.toggleBtn = root.querySelector('#watch-danmaku-toggle');
    this.input = /** @type {HTMLInputElement | null} */ (root.querySelector('#watch-danmaku-input'));
    this.sendBtn = root.querySelector('#watch-danmaku-send');
    this.settingsBtn = root.querySelector('#watch-danmaku-settings-btn');
    this.openListBtn = root.querySelector('#watch-danmaku-open-list-btn');
    this.settingsMenu = root.querySelector('#watch-danmaku-settings-menu');
    this.opacityRange = /** @type {HTMLInputElement | null} */ (
      root.querySelector('#watch-danmaku-opacity')
    );
    this.scaleRange = /** @type {HTMLInputElement | null} */ (
      root.querySelector('#watch-danmaku-scale')
    );
    this.areaRange = /** @type {HTMLInputElement | null} */ (
      root.querySelector('#watch-danmaku-area')
    );
    this.composeColorRoot = root.querySelector('#watch-danmaku-compose-colors');
    this.composeTypeRoot = root.querySelector('#watch-danmaku-compose-types');
    this.composeCustomColor = /** @type {HTMLInputElement | null} */ (
      root.querySelector('#watch-danmaku-compose-custom')
    );

    this.renderer = this.canvas ? new DanmakuRenderer(this.canvas) : null;
    this.videoId = '';
    this.part = 1;
    this.loading = false;
    /** @type {DanmakuItem[]} */
    this.loadedItems = [];
    /** @type {HTMLVideoElement | null} */
    this.video = null;
    this.compose = loadComposePrefs();

    this.bindEvents(signal);
    this.renderComposeOptions();
    this.applyAppSettings();
    this.syncToggleIcon(Boolean(this.renderer?.enabled));
  }

  /**
   * @param {AbortSignal} signal
   */
  bindEvents(signal) {
    const opts = { signal };

    this.toggleBtn?.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        const next = !this.renderer?.enabled;
        this.renderer?.setEnabled(next);
        saveAppSettings({ danmakuEnabled: next });
        if (next && this.video) this.renderer?.seek(this.video.currentTime);
        this.toggleBtn?.classList.toggle('is-on', next);
        this.syncToggleIcon(next);
      },
      opts,
    );

    this.sendBtn?.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        void this.submitDanmaku();
      },
      opts,
    );

    this.input?.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          void this.submitDanmaku();
        }
      },
      opts,
    );

    this.input?.addEventListener('click', (e) => e.stopPropagation(), opts);

    this.input?.addEventListener(
      'focus',
      () => {
        this.sendBtn?.removeAttribute('hidden');
      },
      opts,
    );
    this.input?.addEventListener(
      'blur',
      () => {
        if (!this.input?.value.trim()) this.sendBtn?.setAttribute('hidden', '');
      },
      opts,
    );

    this.settingsBtn?.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        closeDanmakuManagerDialog();
        const open = this.settingsMenu?.hasAttribute('hidden');
        this.closeSettingsMenu();
        if (open) this.settingsMenu?.removeAttribute('hidden');
      },
      opts,
    );

    this.openListBtn?.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        this.closeSettingsMenu();
        void this.openManager();
      },
      opts,
    );

    window.addEventListener(
      'mfuns:app-settings-changed',
      () => {
        this.applyAppSettings();
      },
      opts,
    );

    this.opacityRange?.addEventListener(
      'input',
      () => {
        const value = Number(this.opacityRange?.value ?? 85) / 100;
        this.renderer?.setOptions({ opacity: value });
        saveAppSettings({ danmakuOpacity: value });
      },
      opts,
    );

    this.scaleRange?.addEventListener(
      'input',
      () => {
        const value = Number(this.scaleRange?.value ?? 100) / 100;
        this.renderer?.setOptions({ fontScale: value });
        saveAppSettings({ danmakuFontScale: value });
      },
      opts,
    );

    this.areaRange?.addEventListener(
      'input',
      () => {
        const value = Number(this.areaRange?.value ?? 75) / 100;
        this.renderer?.setOptions({ displayArea: value });
        saveAppSettings({ danmakuDisplayArea: value });
      },
      opts,
    );

    document.addEventListener(
      'click',
      (e) => {
        const target = /** @type {Node} */ (e.target);
        if (!this.settingsBtn?.contains(target) && !this.settingsMenu?.contains(target)) {
          this.closeSettingsMenu();
        }
      },
      opts,
    );

    this.composeColorRoot?.addEventListener(
      'click',
      (e) => {
        const btn = /** @type {HTMLElement} */ (e.target).closest('[data-danmaku-color]');
        if (!btn) return;
        e.stopPropagation();
        const color = Number(btn.getAttribute('data-danmaku-color'));
        if (!Number.isFinite(color)) return;
        this.compose = { ...this.compose, color };
        saveComposePrefs(this.compose);
        this.renderComposeOptions();
      },
      opts,
    );

    this.composeTypeRoot?.addEventListener(
      'click',
      (e) => {
        const btn = /** @type {HTMLElement} */ (e.target).closest('[data-danmaku-type]');
        if (!btn) return;
        e.stopPropagation();
        const type = Number(btn.getAttribute('data-danmaku-type'));
        if (!Number.isFinite(type)) return;
        this.compose = { ...this.compose, type };
        saveComposePrefs(this.compose);
        this.renderComposeOptions();
      },
      opts,
    );

    this.composeCustomColor?.addEventListener(
      'input',
      (e) => {
        e.stopPropagation();
        const hex = this.composeCustomColor?.value;
        if (!hex) return;
        const color = parseInt(hex.replace('#', ''), 16);
        if (!Number.isFinite(color)) return;
        this.compose = { ...this.compose, color: color & 0xffffff };
        saveComposePrefs(this.compose);
        this.renderComposeOptions();
      },
      opts,
    );
    this.composeCustomColor?.addEventListener('click', (e) => e.stopPropagation(), opts);
  }

  applyComposeSwatchColors() {
    this.composeColorRoot?.querySelectorAll('[data-danmaku-color]').forEach((btn) => {
      const color = Number(btn.getAttribute('data-danmaku-color'));
      if (!Number.isFinite(color)) return;
      /** @type {HTMLElement} */ (btn).style.backgroundColor = danmakuColorCss(color);
    });
  }

  renderComposeOptions() {
    if (this.composeColorRoot) {
      this.composeColorRoot.innerHTML = DANMAKU_COLOR_OPTIONS
        .map(
          (option) => `
        <button type="button" class="watch-danmaku-compose__color${option.value === this.compose.color ? ' is-active' : ''}" data-danmaku-color="${option.value}" title="${option.label}" aria-label="${option.label}"></button>`,
        )
        .join('');
      this.applyComposeSwatchColors();
    }

    if (this.composeCustomColor) {
      this.composeCustomColor.value = danmakuColorCss(this.compose.color);
      const preset = DANMAKU_COLOR_OPTIONS.some((o) => o.value === this.compose.color);
      this.composeCustomColor.classList.toggle('is-active', !preset);
    }

    if (this.composeTypeRoot) {
      this.composeTypeRoot.innerHTML = DANMAKU_TYPE_OPTIONS
        .map(
          (option) => `
        <button type="button" class="watch-danmaku-compose__type${option.value === this.compose.type ? ' is-active' : ''}" data-danmaku-type="${option.value}">${option.label}</button>`,
        )
        .join('');
    }
  }

  closeSettingsMenu() {
    this.settingsMenu?.setAttribute('hidden', '');
  }

  applyAppSettings() {
    const settings = loadAppSettings();
    const percent = Math.round(settings.danmakuOpacity * 100);
    const scalePercent = Math.round((settings.danmakuFontScale ?? 1) * 100);
    const areaPercent = Math.round((settings.danmakuDisplayArea ?? 0.75) * 100);
    if (this.opacityRange) this.opacityRange.value = String(percent);
    if (this.scaleRange) this.scaleRange.value = String(scalePercent);
    if (this.areaRange) this.areaRange.value = String(areaPercent);
    this.renderer?.setOptions({
      opacity: settings.danmakuOpacity,
      fontScale: settings.danmakuFontScale ?? 1,
      displayArea: settings.danmakuDisplayArea ?? 0.75,
    });
    this.renderer?.setEnabled(settings.danmakuEnabled);
    this.toggleBtn?.classList.toggle('is-on', settings.danmakuEnabled);
    this.syncToggleIcon(settings.danmakuEnabled);
  }

  /**
   * @param {boolean} on
   */
  syncToggleIcon(on) {
    if (!this.toggleBtn) return;
    this.toggleBtn.innerHTML = materialIcon(
      on ? 'subtitles' : 'subtitles_off',
      'watch-danmaku-bar__toggle-icon',
    );
  }

  /**
   * @param {HTMLVideoElement} video
   */
  attachVideo(video) {
    this.video = video;
    video.addEventListener('seeked', () => {
      this.renderer?.seek(video.currentTime);
    });
  }

  /**
   * @param {{ videoId: string, part: number }} ctx
   */
  async setContext(ctx) {
    this.videoId = ctx.videoId;
    this.part = ctx.part;
    await this.reload();
  }

  async reload() {
    if (!this.videoId || !this.renderer || this.loading) return;
    this.loading = true;
    try {
      const list = await fetchDanmakuList(this.videoId, this.part);
      this.loadedItems = list;
      this.renderer.load(list);
      if (this.video) this.renderer.seek(this.video.currentTime);
      window.dispatchEvent(
        new CustomEvent('mfuns:danmaku-loaded', { detail: { count: list.length } }),
      );
    } catch {
      this.loadedItems = [];
      this.renderer.load([]);
    } finally {
      this.loading = false;
    }
  }

  async openManager() {
    if (!this.videoId) {
      notify('请先播放视频', 'warning');
      return;
    }
    if (this.loadedItems.length === 0 && !this.loading) {
      await this.reload();
    }
    openDanmakuManagerDialog({
      title: `弹幕列表 · P${this.part}`,
      items: this.loadedItems,
      onSeek: (time) => {
        if (!this.video) return;
        this.video.currentTime = time;
        this.renderer?.seek(time);
      },
    });
  }

  /**
   * @param {number} time
   * @param {boolean} playing
   */
  tick(time, playing) {
    this.renderer?.sync(time, playing);
  }

  async submitDanmaku() {
    if (!this.video || !this.videoId || !this.input) return;
    const content = this.input.value.trim();
    if (!content) return;
    if (!requireLogin()) return;

    const time = this.video.currentTime;
    const scale = Number(this.scaleRange?.value ?? 100) / 100;
    const size = Math.max(18, Math.min(36, Math.round(25 * scale)));
    try {
      await sendDanmaku({
        videoId: this.videoId,
        part: this.part,
        time,
        content,
        color: this.compose.color,
        type: this.compose.type,
        size,
      });
      this.input.value = '';
      const item = {
        time,
        type: this.compose.type,
        color: this.compose.color,
        content,
        size,
      };
      this.renderer?.addItem(item);
      this.loadedItems = [...this.loadedItems, item].sort((a, b) => a.time - b.time);
      window.dispatchEvent(
        new CustomEvent('mfuns:danmaku-sent', { detail: { delta: 1 } }),
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : '弹幕发送失败', 'error');
    }
  }

  resetForUnload() {
    this.closeSettingsMenu();
    closeDanmakuManagerDialog();
    this.videoId = '';
    this.part = 1;
    this.loadedItems = [];
    this.loading = false;
    this.renderer?.load([]);
  }

  destroy() {
    this.resetForUnload();
    this.abort.abort();
    this.renderer?.destroy();
    this.renderer = null;
    this.video = null;
  }
}

/**
 * @param {HTMLElement} root
 */
export function createWatchDanmaku(root) {
  return new WatchDanmaku(root);
}
