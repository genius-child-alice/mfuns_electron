import Hls from '../../node_modules/hls.js/dist/hls.mjs';
import { materialIcon } from './icons.js';
import { mediaPlaybackSrc } from './content-api.js';
import { createWatchDanmaku } from './watch-danmaku.js';
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
  if (url.startsWith('mfuns-offline://')) return url;
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
    this.nextBtn = root.querySelector('#watch-player-next');
    this.progress = /** @type {HTMLInputElement} */ (root.querySelector('#watch-player-progress'));
    this.progressPlayed = root.querySelector('#watch-player-played');
    this.progressBuffer = root.querySelector('#watch-player-buffer');
    this.timeEl = root.querySelector('#watch-player-time');
    this.qualityBtn = root.querySelector('#watch-player-quality-btn');
    this.qualityMenu = root.querySelector('#watch-player-quality-menu');
    this.speedBtn = root.querySelector('#watch-player-speed-btn');
    this.speedMenu = root.querySelector('#watch-player-speed-menu');
    this.volumeBtn = root.querySelector('#watch-player-volume-btn');
    this.volumePopup = root.querySelector('#watch-player-volume-popup');
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
    this.playbackRate = 1;
    this.videoId = '';
    /** @type {import('./watch-danmaku.js').WatchDanmaku | null} */
    this.danmaku = createWatchDanmaku(root);
    this.danmaku.attachVideo(this.video);

    this.bindEvents();
  }

  bindEvents() {
    this.root.addEventListener('mousemove', () => this.showControls());
    this.root.addEventListener('click', () => this.showControls());
    this.overlay?.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('.watch-player__bottom')) return;
      if (target === this.overlay || target.closest('.watch-player__center')) {
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
    this.nextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.partIndex + 1 < this.parts.length) {
        this.loadPart(this.partIndex + 1, { autoPlay: true });
      }
    });
    this.progress?.addEventListener('input', () => {
      this.progressDragging = true;
      const ratio = Number(this.progress.value) / 1000;
      if (this.progressPlayed) this.progressPlayed.style.width = `${ratio * 100}%`;
      const duration = this.video.duration;
      this.updateTimeLabel(
        ratio,
        Number.isFinite(duration) ? ratio * duration : 0,
        duration,
      );
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
      this.syncVolumeIcon();
    });
    this.volumeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.volumePopup?.toggleAttribute('hidden');
      this.qualityMenu?.setAttribute('hidden', '');
      this.speedMenu?.setAttribute('hidden', '');
    });
    this.qualityBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.qualityMenu?.toggleAttribute('hidden');
      this.speedMenu?.setAttribute('hidden', '');
      this.volumePopup?.setAttribute('hidden', '');
    });
    this.speedBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu?.toggleAttribute('hidden');
      this.qualityMenu?.setAttribute('hidden', '');
      this.volumePopup?.setAttribute('hidden', '');
    });
    this.speedMenu?.querySelectorAll('[data-playback-rate]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rate = Number(btn.getAttribute('data-playback-rate'));
        if (!Number.isFinite(rate)) return;
        this.setPlaybackRate(rate);
        this.speedMenu?.setAttribute('hidden', '');
      });
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
      const target = /** @type {Node} */ (e.target);
      if (!this.qualityBtn?.contains(target) && !this.qualityMenu?.contains(target)) {
        this.qualityMenu?.setAttribute('hidden', '');
      }
      if (!this.speedBtn?.contains(target) && !this.speedMenu?.contains(target)) {
        this.speedMenu?.setAttribute('hidden', '');
      }
      if (!this.volumeBtn?.contains(target) && !this.volumePopup?.contains(target)) {
        this.volumePopup?.setAttribute('hidden', '');
      }
    });
  }

  /**
   * @param {number} rate
   */
  setPlaybackRate(rate) {
    this.playbackRate = rate;
    this.video.playbackRate = rate;
    if (this.speedBtn) {
      this.speedBtn.textContent = rate === 1 ? '倍速' : `${rate}x`;
    }
    this.speedMenu?.querySelectorAll('[data-playback-rate]').forEach((btn) => {
      btn.classList.toggle(
        'is-active',
        Number(btn.getAttribute('data-playback-rate')) === rate,
      );
    });
  }

  syncVolumeIcon() {
    if (!this.volumeBtn || !this.volume) return;
    const v = Number(this.volume.value);
    const icon =
      v <= 0 ? 'volume_off' : v < 35 ? 'volume_mute' : v < 70 ? 'volume_down' : 'volume_up';
    this.volumeBtn.innerHTML = materialIcon(icon);
  }

  syncPartControls() {
    const hasNext = this.parts.length > 1 && this.partIndex < this.parts.length - 1;
    this.nextBtn?.toggleAttribute('hidden', !hasNext);
  }

  showControls() {
    this.overlay?.classList.remove('watch-player__overlay--hidden');
    window.clearTimeout(this.controlsTimer);
    if (!this.video.paused) {
      this.controlsTimer = window.setTimeout(() => {
        this.overlay?.classList.add('watch-player__overlay--hidden');
        this.qualityMenu?.setAttribute('hidden', '');
        this.speedMenu?.setAttribute('hidden', '');
        this.volumePopup?.setAttribute('hidden', '');
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
    const { currentTime, duration } = this.video;
    const ratio =
      Number.isFinite(duration) && duration > 0 ? Math.min(1, currentTime / duration) : 0;
    if (!this.progressDragging && Number.isFinite(duration) && duration > 0) {
      this.progress.value = String(Math.round(ratio * 1000));
    }
    if (this.progressPlayed) {
      this.progressPlayed.style.width = `${ratio * 100}%`;
    }
    if (this.progressBuffer && Number.isFinite(duration) && duration > 0) {
      let bufferedEnd = 0;
      const ranges = this.video.buffered;
      for (let i = 0; i < ranges.length; i += 1) {
        bufferedEnd = Math.max(bufferedEnd, ranges.end(i));
      }
      this.progressBuffer.style.width = `${Math.min(1, bufferedEnd / duration) * 100}%`;
    }
    this.updateTimeLabel(ratio, currentTime, duration);
    this.danmaku?.tick(currentTime, !this.video.paused);
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
    this.speedMenu?.setAttribute('hidden', '');
    this.volumePopup?.setAttribute('hidden', '');
    if (this.progress) this.progress.value = '0';
    if (this.progressPlayed) this.progressPlayed.style.width = '0%';
    if (this.progressBuffer) this.progressBuffer.style.width = '0%';
    if (this.timeEl) this.timeEl.textContent = '00:00 / 00:00';
    this.setPlaybackRate(1);
    this.nextBtn?.setAttribute('hidden', '');
    this.setError('');
    this.setLoading(false);
    this.videoId = '';
    this.danmaku?.resetForUnload();
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
        return `<button type="button" class="watch-player__menu-item ${active ? 'is-active' : ''}" data-quality-url="${encodeURIComponent(q.url)}">${qualityDisplayLabel(q)}</button>`;
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
    this.syncPartControls();
    void this.loadQuality(quality, { autoPlay: options.autoPlay ?? false });
    void this.reloadDanmaku();
  }

  reloadDanmaku() {
    if (!this.videoId) return;
    const part = this.parts[this.partIndex]?.part ?? this.partIndex + 1;
    void this.danmaku?.setContext({ videoId: this.videoId, part });
  }

  /**
   * @param {{ parts: VideoPart[], partIndex?: number, poster?: string | null, autoPlay?: boolean, onPartChange?: () => void, videoId?: string }} config
   */
  load(config) {
    this.parts = config.parts;
    this.videoId = config.videoId ? `${config.videoId}` : '';
    this.onPartChange = config.onPartChange ?? null;
    if (config.poster) this.video.poster = config.poster;
    this.video.volume = Number(this.volume?.value ?? 70) / 100;
    this.syncVolumeIcon();
    this.video.playbackRate = this.playbackRate;
    this.syncPartControls();
    this.loadPart(config.partIndex ?? 0, { autoPlay: config.autoPlay ?? false });
  }
}

/** @type {WatchPlayer | null} */
let instance = null;

export function getWatchPlayer() {
  const root = document.getElementById('watch-player-root');
  if (!root) return null;
  if (!instance) instance = new WatchPlayer(root);
  else if (!instance.danmaku) {
    instance.danmaku = createWatchDanmaku(root);
    instance.danmaku.attachVideo(instance.video);
  }
  return instance;
}

export function destroyWatchPlayer() {
  if (!instance) return;
  instance.danmaku?.destroy();
  instance.destroy();
  instance = null;
}

export function ensureWatchDanmaku() {
  const player = getWatchPlayer();
  if (!player) return null;
  const root = document.getElementById('watch-player-root');
  if (!root) return null;
  if (!player.danmaku) {
    player.danmaku = createWatchDanmaku(root);
    player.danmaku.attachVideo(player.video);
  }
  return player.danmaku;
}
