import Hls from '../../node_modules/hls.js/dist/hls.mjs';
import { materialIcon } from './icons.js';
import { mediaPlaybackSrc } from './content-api.js';
import {
  getQualitiesForPart,
  pickDefaultQuality,
  qualityDisplayLabel,
  sortQualitiesDesc,
} from './video-api.js';

/** @typedef {import('./video-api.js').VideoPart} VideoPart */
/** @typedef {import('./video-api.js').VideoQuality} VideoQuality */

/**
 * @param {string} url
 */
function isHlsUrl(url) {
  return /\.m3u8(?:\?|$)/i.test(url);
}

/** @param {string} url */
function proxyMediaUrl(url) {
  return mediaPlaybackSrc(url) ?? url;
}

function hlsConfig() {
  return {
    enableWorker: true,
    lowLatencyMode: false,
    xhrSetup: (xhr, url) => {
      xhr.open('GET', proxyMediaUrl(url), true);
    },
    fetchSetup: (context, initParams) => {
      return new Request(proxyMediaUrl(context.url), initParams);
    },
  };
}

/**
 * @param {number} seconds
 */
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export class WatchPlayer {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    /** @type {HTMLVideoElement} */
    this.video = /** @type {HTMLVideoElement} */ (root.querySelector('#watch-player'));
    this.overlay = root.querySelector('#watch-player-overlay');
    this.bigPlay = root.querySelector('#watch-player-big-play');
    this.playBtn = root.querySelector('#watch-player-play');
    this.progress = /** @type {HTMLInputElement} */ (root.querySelector('#watch-player-progress'));
    this.timeEl = root.querySelector('#watch-player-time');
    this.qualityBtn = root.querySelector('#watch-player-quality-btn');
    this.qualityMenu = root.querySelector('#watch-player-quality-menu');
    this.volume = /** @type {HTMLInputElement} */ (root.querySelector('#watch-player-volume'));
    this.fullscreenBtn = root.querySelector('#watch-player-fullscreen');
    this.errorEl = root.querySelector('#watch-player-error');
    this.loadingEl = root.querySelector('#watch-player-loading');

    /** @type {Hls | null} */
    this.hls = null;
    /** @type {VideoPart[]} */
    this.parts = [];
    this.partIndex = 0;
    /** @type {VideoQuality | null} */
    this.selectedQuality = null;
    /** @type {(() => void) | null} */
    this.onPartChange = null;
    this.controlsTimer = 0;
    this.progressDragging = false;

    this.bindEvents();
  }

  bindEvents() {
    this.root.addEventListener('mousemove', () => this.showControls());
    this.root.addEventListener('click', () => this.showControls());
    this.overlay?.addEventListener('click', (e) => {
      if (e.target === this.overlay || e.target === this.root.querySelector('.watch-player__center')) {
        this.togglePlay();
      }
    });
    this.bigPlay?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlay();
    });
    this.playBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlay();
    });
    this.progress?.addEventListener('input', () => {
      this.progressDragging = true;
      this.updateTimeLabel(Number(this.progress.value) / 1000);
    });
    this.progress?.addEventListener('change', () => {
      const duration = this.video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        this.video.currentTime = (Number(this.progress.value) / 1000) * duration;
      }
      this.progressDragging = false;
    });
    this.volume?.addEventListener('input', () => {
      this.video.volume = Number(this.volume.value) / 100;
    });
    this.qualityBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.qualityMenu?.toggleAttribute('hidden');
    });
    this.fullscreenBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        this.root.requestFullscreen?.();
      }
    });
    this.video.addEventListener('play', () => this.syncPlayUi());
    this.video.addEventListener('pause', () => this.syncPlayUi());
    this.video.addEventListener('timeupdate', () => this.syncProgress());
    this.video.addEventListener('waiting', () => this.setLoading(true));
    this.video.addEventListener('playing', () => this.setLoading(false));
    this.video.addEventListener('loadedmetadata', () => this.syncProgress());
    this.video.addEventListener('ended', () => {
      if (this.partIndex + 1 < this.parts.length) {
        this.loadPart(this.partIndex + 1, { autoPlay: true });
      }
    });
    document.addEventListener('click', (e) => {
      if (!this.qualityBtn?.contains(/** @type {Node} */ (e.target))) {
        this.qualityMenu?.setAttribute('hidden', '');
      }
    });
  }

  showControls() {
    this.overlay?.classList.remove('watch-player__overlay--hidden');
    window.clearTimeout(this.controlsTimer);
    if (!this.video.paused) {
      this.controlsTimer = window.setTimeout(() => {
        this.overlay?.classList.add('watch-player__overlay--hidden');
        this.qualityMenu?.setAttribute('hidden', '');
      }, 4000);
    }
  }

  syncPlayUi() {
    const playing = !this.video.paused;
    this.root.classList.toggle('watch-player-wrap--playing', playing);
    if (this.playBtn) {
      this.playBtn.innerHTML = materialIcon(playing ? 'pause' : 'play_arrow');
    }
    if (playing) this.showControls();
  }

  syncProgress() {
    if (this.progressDragging) return;
    const { currentTime, duration } = this.video;
    if (Number.isFinite(duration) && duration > 0) {
      this.progress.value = String(Math.round((currentTime / duration) * 1000));
    }
    this.updateTimeLabel(Number.isFinite(duration) ? currentTime / duration : 0, currentTime, duration);
  }

  /**
   * @param {number} ratio
   * @param {number} [current]
   * @param {number} [duration]
   */
  updateTimeLabel(ratio, current = 0, duration = 0) {
    if (!this.timeEl) return;
    if (duration > 0) {
      this.timeEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
      return;
    }
    this.timeEl.textContent = formatTime(ratio * (this.video.duration || 0));
  }

  setLoading(loading) {
    this.loadingEl?.toggleAttribute('hidden', !loading);
  }

  /**
   * @param {string} message
   */
  setError(message) {
    if (!this.errorEl) return;
    if (!message) {
      this.errorEl.hidden = true;
      this.errorEl.textContent = '';
      return;
    }
    this.errorEl.hidden = false;
    this.errorEl.textContent = message;
  }

  togglePlay() {
    if (this.video.paused) {
      void this.video.play().catch(() => this.setError('无法播放，请检查网络或清晰度'));
    } else {
      this.video.pause();
    }
  }

  pause() {
    this.video.pause();
  }

  destroy() {
    window.clearTimeout(this.controlsTimer);
    this.detachHls();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.removeAttribute('poster');
    this.video.load();
    this.root.classList.remove('watch-player-wrap--playing');
    this.overlay?.classList.remove('watch-player__overlay--hidden');
    this.qualityMenu?.setAttribute('hidden', '');
    if (this.progress) this.progress.value = '0';
    if (this.timeEl) this.timeEl.textContent = '00:00 / 00:00';
    this.setError('');
    this.setLoading(false);
  }

  detachHls() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  /**
   * @param {VideoQuality} quality
   * @param {{ resumeTime?: number, autoPlay?: boolean }} [options]
   */
  async loadQuality(quality, options = {}) {
    const resumeTime = options.resumeTime ?? 0;
    const autoPlay = options.autoPlay ?? false;
    this.selectedQuality = quality;
    this.setError('');
    this.setLoading(true);
    this.detachHls();

    const rawUrl = quality.url;
    const src = mediaPlaybackSrc(rawUrl) ?? rawUrl;

    if (isHlsUrl(rawUrl)) {
      if (Hls.isSupported()) {
        this.hls = new Hls(hlsConfig());
        this.hls.attachMedia(this.video);
        this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          this.hls?.loadSource(src);
        });
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
          this.setLoading(false);
          if (resumeTime > 0) this.video.currentTime = resumeTime;
          if (autoPlay) void this.video.play().catch(() => {});
          this.renderQualityMenu();
          this.updateQualityButton();
        });
        this.hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            this.setLoading(false);
            this.setError('视频流加载失败，可尝试切换清晰度');
          }
        });
        return;
      }
      if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
        this.video.src = src;
      } else {
        this.setError('当前环境不支持 HLS 播放');
        this.setLoading(false);
        return;
      }
    } else {
      this.video.src = src;
    }

    await new Promise((resolve) => {
      const onMeta = () => {
        this.video.removeEventListener('loadedmetadata', onMeta);
        resolve(null);
      };
      this.video.addEventListener('loadedmetadata', onMeta);
      this.video.load();
    });
    this.setLoading(false);
    if (resumeTime > 0) this.video.currentTime = resumeTime;
    if (autoPlay) void this.video.play().catch(() => {});
    this.renderQualityMenu();
    this.updateQualityButton();
  }

  updateQualityButton() {
    if (!this.qualityBtn || !this.selectedQuality) return;
    this.qualityBtn.textContent = qualityDisplayLabel(this.selectedQuality);
  }

  renderQualityMenu() {
    if (!this.qualityMenu) return;
    const qualities = sortQualitiesDesc(getQualitiesForPart(this.parts, this.partIndex));
    this.qualityMenu.innerHTML = qualities
      .map((q) => {
        const active =
          this.selectedQuality?.url === q.url && this.selectedQuality?.part === q.part;
        return `<button type="button" class="watch-player__quality-item ${active ? 'is-active' : ''}" data-quality-url="${encodeURIComponent(q.url)}">${qualityDisplayLabel(q)}</button>`;
      })
      .join('');
    this.qualityMenu.querySelectorAll('[data-quality-url]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = decodeURIComponent(btn.getAttribute('data-quality-url') ?? '');
        const quality = qualities.find((q) => q.url === url);
        if (!quality) return;
        const resumeTime = this.video.currentTime;
        this.qualityMenu.setAttribute('hidden', '');
        void this.loadQuality(quality, { resumeTime, autoPlay: !this.video.paused });
      });
    });
  }

  /**
   * @param {number} partIndex
   * @param {{ autoPlay?: boolean }} [options]
   */
  loadPart(partIndex, options = {}) {
    if (partIndex < 0 || partIndex >= this.parts.length) return;
    this.partIndex = partIndex;
    const quality = pickDefaultQuality(this.parts, partIndex);
    if (!quality) {
      this.setError('暂无可用播放地址');
      return;
    }
    this.onPartChange?.();
    void this.loadQuality(quality, { autoPlay: options.autoPlay ?? false });
  }

  /**
   * @param {{ parts: VideoPart[], partIndex?: number, poster?: string | null, autoPlay?: boolean, onPartChange?: () => void }} config
   */
  load(config) {
    this.parts = config.parts;
    this.onPartChange = config.onPartChange ?? null;
    if (config.poster) this.video.poster = config.poster;
    this.video.volume = Number(this.volume?.value ?? 70) / 100;
    this.loadPart(config.partIndex ?? 0, { autoPlay: config.autoPlay ?? false });
  }
}

/** @type {WatchPlayer | null} */
let instance = null;

export function getWatchPlayer() {
  const root = document.getElementById('watch-player-root');
  if (!root) return null;
  if (!instance) instance = new WatchPlayer(root);
  return instance;
}

export function destroyWatchPlayer() {
  instance?.destroy();
}
