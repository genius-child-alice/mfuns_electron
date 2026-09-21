import { notify } from './notice-ui.js';
import { fetchDanmakuList, sendDanmaku } from './danmaku-api.js';
import { DanmakuRenderer } from './danmaku-renderer.js';
import { materialIcon } from './icons.js';
import { requireLogin } from './login-ui.js';

/**
 * @param {HTMLElement} root
 */
export class WatchDanmaku {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    this.canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('#watch-player-danmaku'));
    this.toggleBtn = root.querySelector('#watch-danmaku-toggle');
    this.input = /** @type {HTMLInputElement | null} */ (root.querySelector('#watch-danmaku-input'));
    this.sendBtn = root.querySelector('#watch-danmaku-send');
    this.settingsBtn = root.querySelector('#watch-danmaku-settings-btn');
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

    this.renderer = this.canvas ? new DanmakuRenderer(this.canvas) : null;
    this.videoId = '';
    this.part = 1;
    this.loading = false;
    /** @type {HTMLVideoElement | null} */
    this.video = null;

    this.bindEvents();
    this.syncToggleIcon(Boolean(this.renderer?.enabled));
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

  bindEvents() {
    this.toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !this.renderer?.enabled;
      this.renderer?.setEnabled(next);
      if (next && this.video) this.renderer?.seek(this.video.currentTime);
      this.toggleBtn?.classList.toggle('is-on', next);
      this.syncToggleIcon(next);
    });

    this.sendBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.submitDanmaku();
    });

    this.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        void this.submitDanmaku();
      }
    });

    this.input?.addEventListener('click', (e) => e.stopPropagation());

    this.settingsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.settingsMenu?.toggleAttribute('hidden');
    });

    this.opacityRange?.addEventListener('input', () => {
      const value = Number(this.opacityRange?.value ?? 85) / 100;
      this.renderer?.setOptions({ opacity: value });
    });

    this.scaleRange?.addEventListener('input', () => {
      const value = Number(this.scaleRange?.value ?? 100) / 100;
      this.renderer?.setOptions({ fontScale: value });
    });

    this.areaRange?.addEventListener('input', () => {
      const value = Number(this.areaRange?.value ?? 75) / 100;
      this.renderer?.setOptions({ displayArea: value });
    });

    document.addEventListener('click', (e) => {
      const target = /** @type {Node} */ (e.target);
      if (!this.settingsBtn?.contains(target) && !this.settingsMenu?.contains(target)) {
        this.settingsMenu?.setAttribute('hidden', '');
      }
    });
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
      this.renderer.load(list);
      if (this.video) this.renderer.seek(this.video.currentTime);
      window.dispatchEvent(
        new CustomEvent('mfuns:danmaku-loaded', { detail: { count: list.length } }),
      );
    } catch {
      this.renderer.load([]);
    } finally {
      this.loading = false;
    }
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
    try {
      await sendDanmaku({
        videoId: this.videoId,
        part: this.part,
        time,
        content,
      });
      this.input.value = '';
      this.renderer?.addItem({
        time,
        type: 1,
        color: 16777215,
        content,
        size: 25,
      });
      window.dispatchEvent(
        new CustomEvent('mfuns:danmaku-sent', { detail: { delta: 1 } }),
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : '弹幕发送失败', 'error');
    }
  }

  destroy() {
    this.renderer?.destroy();
    this.renderer = null;
    this.video = null;
    this.videoId = '';
  }
}

/**
 * @param {HTMLElement} root
 */
export function createWatchDanmaku(root) {
  return new WatchDanmaku(root);
}
