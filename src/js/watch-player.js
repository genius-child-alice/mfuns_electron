import { loadSession } from './auth.js';
import { mediaPlaybackSrc } from './content-api.js';
import { sendDanmaku } from './danmaku-api.js';
import { requireLogin } from './login-ui.js';
import {
  endVideoPlaySession,
  sendVideoPlayHeartbeat,
  startVideoPlaySession,
} from './video-play-api.js';
import {
  getDanmakuPlayerConfig,
  getPlayerConfig,
  getPreferredResolution,
  resolvePlayerDarkMode,
  setPlayerDarkMode,
  clearPlayerDarkModeOverride,
  setPreferredResolution,
  setPlayerVolume,
  setSeriesOrder,
  updateDanmakuPlayerConfig,
  updatePlayerConfig,
} from './player-preferences.js';
import { accentToHex, loadPreferences } from './theme.js';

/** @typedef {import('./video-api.js').VideoPart} VideoPart */

const MFUNS_PLAYER_JS =
  'https://resource.mfuns.net/js/mfunsplayer/web/2.2.2/mfunsPlayer.min.umd.js';
const MFUNS_ECHARTS_JS = 'https://resource.mfuns.net/js/echarts/6.0.0/echarts.min.js';
const PLACEHOLDER_PIC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';

/** @type {Promise<void> | null} */
let sdkLoadPromise = null;

/**
 * @param {string} src
 * @param {string} globalName
 */
function loadExternalScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (globalName && window[globalName]) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[data-mfuns-src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.dataset.mfunsSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`加载失败: ${src}`));
    document.head.appendChild(script);
  });
}

/** mfunsPlayer.theme() 仅接受可被解析的十六进制色值，传 rgb() 会导致进度条等颜色异常 */
function resolveAccentThemeHex() {
  return accentToHex(loadPreferences().accent);
}

function ensureMfunsPlayerSdk() {
  if (!sdkLoadPromise) {
    sdkLoadPromise = Promise.all([
      loadExternalScript(MFUNS_PLAYER_JS, 'mfunsPlayer'),
      loadExternalScript(MFUNS_ECHARTS_JS, 'echarts'),
    ]).then(() => {});
  }
  return sdkLoadPromise;
}

/**
 * @param {string} url
 */
function playbackUrl(url) {
  return mediaPlaybackSrc(url) ?? url;
}

/**
 * @param {number} type
 */
function danmakuTypeToApi(type) {
  if (typeof type === 'number' && Number.isFinite(type)) return Math.trunc(type);
  const map = { right: 1, top: 5, bottom: 4, left: 6 };
  return map[type] ?? 1;
}

/**
 * @param {VideoPart[]} parts
 * @param {string} videoId
 * @param {string} [title]
 */
function buildMfunsVideoList(parts, videoId, title = '') {
  const pref = getPreferredResolution();
  const prefNum = Number.parseInt(pref, 10) || 1080;

  return parts.map((part, index) => {
    const partTitle = parts.length === 1 && title ? title : part.title;
    const sources = part.qualities.filter((q) => q.url);
    if (sources.length === 0) {
      return {
        pic: PLACEHOLDER_PIC,
        title: partTitle,
        url: '',
        type: 'mp4',
        danId: `${videoId}&part=${index + 1}`,
      };
    }

    const mapResolution = (q, isDefault) => ({
      url: playbackUrl(q.url),
      type: q.format || 'mp4',
      label: q.label || '',
      name: q.name,
      isDefault,
      needLogin: Boolean(q.needLogin),
      needPremium: Boolean(q.needPremium),
    });

    if (sources.length === 1) {
      const q = sources[0];
      return {
        pic: PLACEHOLDER_PIC,
        title: partTitle,
        url: playbackUrl(q.url),
        type: q.format || 'mp4',
        danId: `${videoId}&part=${index + 1}`,
      };
    }

    const numeric = sources.map((s) => Number.parseInt(s.name, 10) || 0);
    const closest =
      `${prefNum - Math.min(...numeric.map((n) => Math.abs(n - prefNum)))}P`;
    const pickIndex = Math.max(
      0,
      sources.findIndex((s) => s.name === closest),
    );
    const picked = sources[pickIndex] ?? sources[0];

    return {
      pic: PLACEHOLDER_PIC,
      title: partTitle,
      url: playbackUrl(picked.url),
      type: picked.format || 'mp4',
      danId: `${videoId}&part=${index + 1}`,
      resolution: sources.map((s, i) => mapResolution(s, i === pickIndex)),
    };
  });
}

/**
 * @param {string} videoId
 * @param {number} partIndex
 */
function readSavedPosition(videoId, partIndex) {
  try {
    const raw = localStorage.getItem(`mfuns:video-position:p:${videoId}:${partIndex}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const position = Number(data.position);
    if (!Number.isFinite(position) || position < 0) return null;
    return position;
  } catch {
    return null;
  }
}

/**
 * @param {string} videoId
 * @param {number} partIndex
 * @param {number} position
 */
function writeSavedPosition(videoId, partIndex, position) {
  localStorage.setItem(
    `mfuns:video-position:p:${videoId}:${partIndex}`,
    JSON.stringify({ position, time: Date.now() }),
  );
}

export class WatchPlayer {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.container = root.querySelector('#mfuns-player-container');
    this.placeholder = root.querySelector('#mfuns-player-placeholder');
    /** @type {any} */
    this.player = null;
    /** @type {VideoPart[]} */
    this.parts = [];
    this.partIndex = 0;
    this.videoId = '';
    this.title = '';
    /** @type {(() => void) | null} */
    this.onPartChange = null;
    /** @type {((videoId: number) => void) | null} */
    this.onSwitchSeries = null;
    /** @type {object | null} */
    this.series = null;
    this.ready = false;
    this.sessionId = '';
    this.heartbeatTimer = 0;
    this.isPlaying = false;
    this.lastHeartbeatAt = 0;
    this.lastPosition = 0;
    this.dragStart = 0;
    /** @type {Array<{ from: number, to: number, time: string }>} */
    this.dragEvents = [];
    this.totalPlayDuration = 0;
    this.totalWatchDuration = 0;
    this.sessionStartedAt = 0;
    this.heartbeatPlayTime = 0;
    this.sessionBootstrapped = false;
    this.skipResumeOnce = false;
    this.pendingAutoPlay = false;
    this._syncingColorScheme = false;

    this._themeListening = false;
    this.onThemeChange = (event) => {
      clearPlayerDarkModeOverride();
      this.syncThemeColor();
      const scheme = event?.detail?.colorScheme;
      // 以主题事件为准，避免读到旧偏好；并在下一帧再刷一次，防止 view transition 覆盖 DOM
      const dark = scheme === 'dark' ? true : scheme === 'light' ? false : resolvePlayerDarkMode();
      this.applyColorScheme(dark);
      requestAnimationFrame(() => this.applyColorScheme(dark));
      // view transition 结束后再刷一次，避免截图合成后类名回退
      window.setTimeout(() => this.applyColorScheme(dark), 560);
    };
    window.addEventListener('resize', () => this.onWindowResize());
    window.addEventListener('beforeunload', () => this.flushBeaconHeartbeat());
    this.bindThemeListener();
  }

  bindThemeListener() {
    if (this._themeListening) return;
    window.addEventListener('mfuns:theme-change', this.onThemeChange);
    this._themeListening = true;
  }

  unbindThemeListener() {
    if (!this._themeListening) return;
    window.removeEventListener('mfuns:theme-change', this.onThemeChange);
    this._themeListening = false;
  }

  onWindowResize() {
    const config = getPlayerConfig();
    this.player?.template?.buildVideo?.(config.blackBorder);
  }

  syncThemeColor() {
    const hex = resolveAccentThemeHex();
    document.documentElement.style.setProperty('--color-primary', hex);
    if (this.player?.theme) {
      this.player.theme(hex);
    }
  }

  /** 移除官网「关灯模式」的全页黑色遮罩（桌面端只保留播放器内深色控件） */
  clearPlayerBlackmask() {
    document.body.classList.remove('player-mode-blackmask');
    document.querySelectorAll('body > .heimu').forEach((node) => node.remove());
  }

  syncDarkmodeSwitch(dark) {
    const switchCmp = this.player?.components?.videoDarkmodeSwitch;
    if (!switchCmp) return;
    // 只同步开关外观，绝不调用 toggle()/onToggle：
    // SDK 关灯关闭时若 body 上已无 .heimu 遮罩，就不会移除 footBar.darkmode。
    if (switchCmp.value !== dark) {
      if (typeof switchCmp.setValue === 'function') switchCmp.setValue(dark);
      else {
        switchCmp.value = dark;
        switchCmp.el?.classList?.toggle('switch-on', dark);
      }
    } else {
      switchCmp.el?.classList?.toggle('switch-on', dark);
    }
  }

  /**
   * 同步应用深色主题到 mfunsPlayer 控制条（官网「关灯模式」样式，不遮罩整个窗口）
   * @param {boolean} [forcedDark] 若传入则强制使用该值（主题切换时用）
   */
  applyColorScheme(forcedDark) {
    const dark = typeof forcedDark === 'boolean' ? forcedDark : resolvePlayerDarkMode();
    this._syncingColorScheme = true;
    try {
      if (this.root) {
        this.root.classList.toggle('watch-mfuns-player--scheme-dark', dark);
        this.root.dataset.playerScheme = dark ? 'dark' : 'light';
      }

      const player = this.player;
      const scope = this.root ?? player?.container;
      if (!scope) return;

      // 不调用 SDK toggle(false)：遮罩被清掉后 SDK 不会移除 footBar.darkmode
      const setDarkClass = (el, className) => {
        if (!el?.classList) return;
        if (dark) el.classList.add(className);
        else el.classList.remove(className);
      };

      setDarkClass(player?.container, 'mfunsPlayer-darkmode');
      scope.querySelectorAll('.mfunsPlayer').forEach((el) => setDarkClass(el, 'mfunsPlayer-darkmode'));

      const footBars = new Set();
      if (player?.template?.footBar) footBars.add(player.template.footBar);
      scope.querySelectorAll('.mfunsPlayer-footBar').forEach((el) => footBars.add(el));
      footBars.forEach((el) => setDarkClass(el, 'darkmode'));

      this.syncDarkmodeSwitch(dark);
      this.clearPlayerBlackmask();
    } finally {
      this._syncingColorScheme = false;
    }
  }

  async ensurePlayer() {
    if (!this.container) throw new Error('播放器容器不存在');
    await ensureMfunsPlayerSdk();
    if (this.player) return;

    const config = getPlayerConfig();
    const danmakuConfig = getDanmakuPlayerConfig();
    const session = loadSession();
    const user = session?.user;
    const uid = user && (user.id ?? user.user_id);
    const videoList = buildMfunsVideoList(this.parts, this.videoId, this.title);

    const PlayerCtor = /** @type {any} */ (window).mfunsPlayer;
    this.player = new PlayerCtor({
      uid,
      container: this.container,
      theme: resolveAccentThemeHex(),
      draggable: true,
      hotkey: true,
      autoPlay: this.pendingAutoPlay || config.autoPlay,
      autoSwitch: config.autoSwitch,
      autoSkip: config.autoSkip,
      smallWindow: config.smallWindow,
      blackBorder: config.blackBorder,
      volume: config.volume,
      currentVideo: this.partIndex,
      video: videoList,
      series: this.series,
      widescreenSwitch: true,
      danmaku: {
        api: 'https://api.mfuns.net/v1/danmaku/get_normal',
        bottom: '0',
        showDanmaku: danmakuConfig.show,
        shields: danmakuConfig.shields,
        opacity: danmakuConfig.opacity,
        limitArea: danmakuConfig.limitArea,
        fontScale: danmakuConfig.fontScale,
        speed: danmakuConfig.speed,
        keepOutSubtitle: danmakuConfig.keepOutSubtitle,
        showHighEnergy: true,
        danmakuCatch: true,
      },
      mutex: true,
      danmakuListAutoScroll: true,
    });

    const danmakuMount = document.getElementById('danmakuList');
    if (danmakuMount) {
      this.player.mountDanmakuAuxiliary(danmakuMount);
    }

    this.syncThemeColor();
    this.bindPlayerEvents();
    // 启动时清掉历史 sticky darkMode，默认跟随应用主题
    clearPlayerDarkModeOverride();
    this.applyColorScheme();
    this.ready = true;
    this.placeholder?.setAttribute('hidden', '');
  }

  bindPlayerEvents() {
    const p = this.player;
    if (!p) return;

    p.on('toLogin', () => {
      requireLogin();
    });
    p.on('toPremium', () => {
      if (!loadSession()?.token) {
        requireLogin();
        return;
      }
      void import('./member-center-page.js').then(({ openMemberCenter }) =>
        openMemberCenter('premium'),
      );
    });

    p.on('danmaku_send', async (payload) => {
      if (!loadSession()?.token) {
        requireLogin();
        return;
      }
      try {
        await sendDanmaku({
          videoId: this.videoId,
          part: (p.currentVideo ?? this.partIndex) + 1,
          time: payload.time,
          content: payload.text,
          color: payload.color,
          size: payload.size,
          type: danmakuTypeToApi(payload.type),
        });
      } catch (err) {
        console.error(err);
      }
    });

    p.on('setPlayer', (item) => {
      if (item.key === 'volume') setPlayerVolume(item.value);
      else if (item.key === 'muted') setPlayerVolume(0);
      else if (item.key === 'darkMode') {
        if (!this._syncingColorScheme) setPlayerDarkMode(Boolean(item.value));
        this.applyColorScheme();
      } else updatePlayerConfig(item.key, item.value);
    });

    p.on('darkmode_on', () => {
      if (this._syncingColorScheme) return;
      setPlayerDarkMode(true);
      this.clearPlayerBlackmask();
      this.applyColorScheme();
    });
    p.on('darkmode_off', () => {
      if (this._syncingColorScheme) return;
      setPlayerDarkMode(false);
      this.clearPlayerBlackmask();
      this.applyColorScheme();
    });

    p.on('setDanmaku', (item) => {
      updateDanmakuPlayerConfig(item.key, item.value);
    });

    p.on('resolution_end', () => {
      const name = p.resolution?.name;
      if (name) setPreferredResolution(name);
    });

    p.on('series_order', () => {
      const order = getPlayerConfig().seriesOrder === 'reverse' ? 'sequential' : 'reverse';
      setSeriesOrder(order);
      if (this.series) {
        this.series = { ...this.series, order };
        p.setSeries?.(this.series);
      }
    });

    p.on('switch_series', (id) => {
      this.onSwitchSeries?.(Number(id));
    });

    p.on('switchVideo_start', (index) => {
      this.endPlaySession();
      this.sessionBootstrapped = false;
      this.partIndex = index;
      this.onPartChange?.();
    });

    p.on('update_video_position', () => {
      if (!p.video) return;
      writeSavedPosition(this.videoId, p.currentVideo ?? this.partIndex, p.video.currentTime);
    });

    p.on('loadedmetadata', async () => {
      if (sessionStorage.getItem('mfuns_auto_continue') === '1') {
        sessionStorage.removeItem('mfuns_auto_continue');
      } else if (this.skipResumeOnce) {
        this.skipResumeOnce = false;
      } else {
        await this.promptResumePosition();
      }
      if (!this.sessionBootstrapped) {
        await this.startPlaySession();
        this.sessionBootstrapped = true;
      }
    });

    p.on('play', () => {
      this.isPlaying = true;
      this.lastHeartbeatAt = Date.now();
      if (!this.sessionId) void this.startPlaySession();
      else this.scheduleHeartbeat();
    });

    p.on('pause', () => {
      this.isPlaying = false;
    });

    p.on('ended', () => {
      this.endPlaySession();
      this.sessionBootstrapped = false;
    });

    p.on('seeking', () => {
      this.dragStart = this.lastPosition;
    });

    p.on('seeked', async () => {
      const to = Math.floor(p.video?.currentTime || 0);
      if (to < 5 && this.dragStart > 0) {
        this.lastPosition = to;
        return;
      }
      this.dragEvents.push({
        from: this.dragStart,
        to,
        time: new Date().toISOString(),
      });
      this.lastPosition = to;
      if (p.video?.ended) {
        await this.startPlaySession();
        this.sessionBootstrapped = true;
      }
    });

    p.on('timeupdate', () => {
      if (p.video) this.lastPosition = Math.floor(p.video.currentTime);
    });
  }

  async promptResumePosition() {
    const config = getPlayerConfig();
    const part = this.player?.currentVideo ?? this.partIndex;
    const saved = readSavedPosition(this.videoId, part);
    if (saved == null || !this.player?.video) return;
    const duration = this.player.video.duration || 0;
    if (duration > 0 && saved > duration * 0.9) return;
    if (config.autoSkip) {
      this.player.skip?.('已为您自动跳转至', saved, config.autoSkip);
    } else {
      this.player.skip?.('是否跳转至上次观看位置', saved, config.autoSkip);
    }
  }

  scheduleHeartbeat() {
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => {
      void this.sendHeartbeat();
    }, 10000);
  }

  async startPlaySession() {
    if (!this.player?.video || this.sessionId) return;
    try {
      const startPosition = Math.floor(this.player.video.currentTime || 0);
      this.sessionId = await startVideoPlaySession({
        video_id: Number(this.videoId),
        start_position: startPosition,
      });
      this.sessionStartedAt = Date.now();
      this.lastHeartbeatAt = Date.now();
      this.lastPosition = startPosition;
      this.totalPlayDuration = 0;
      this.totalWatchDuration = 0;
      this.heartbeatPlayTime = 0;
      this.dragEvents = [];
      this.scheduleHeartbeat();
    } catch (err) {
      console.error('Failed to start play session:', err);
    }
  }

  async sendHeartbeat() {
    if (!this.sessionId || !this.player?.video) return;
    const now = Date.now();
    let playDuration = 0;
    if (this.isPlaying && this.lastHeartbeatAt > 0) {
      playDuration = (now - this.lastHeartbeatAt) / 1000;
      this.totalPlayDuration += playDuration;
      this.heartbeatPlayTime += playDuration;
    }
    this.totalWatchDuration = (now - this.sessionStartedAt) / 1000;
    const currentPosition = Math.floor(this.player.video.currentTime || 0);

    try {
      await sendVideoPlayHeartbeat({
        session_id: this.sessionId,
        video_id: Number(this.videoId),
        current_position: currentPosition,
        play_duration: Math.floor(playDuration) || 0,
        drag_events: this.dragEvents,
      });
    } catch (err) {
      console.error('Failed to send heartbeat:', err);
    }

    this.lastPosition = currentPosition;
    this.lastHeartbeatAt = now;
    this.heartbeatPlayTime = 0;
    this.dragEvents = [];
  }

  async endPlaySession() {
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = 0;
    if (!this.sessionId || !this.player?.video) {
      this.sessionId = '';
      return;
    }
    const sessionId = this.sessionId;
    const now = Date.now();
    if (this.isPlaying && this.lastHeartbeatAt > 0) {
      const delta = (now - this.lastHeartbeatAt) / 1000;
      this.totalPlayDuration += delta;
    }
    this.totalWatchDuration = (now - this.sessionStartedAt) / 1000;
    const endPosition = Math.floor(this.player.video.currentTime || 0);

    try {
      await endVideoPlaySession({
        session_id: sessionId,
        video_id: Number(this.videoId),
        end_position: endPosition,
        total_play_duration: Math.floor(this.totalPlayDuration) || 0,
        total_watch_duration: Math.floor(this.totalWatchDuration) || 0,
      });
    } catch (err) {
      console.error('Failed to end play session:', err);
    }

    if (this.sessionId === sessionId) {
      this.sessionId = '';
      this.sessionBootstrapped = false;
      this.isPlaying = false;
    }
  }

  flushBeaconHeartbeat() {
    if (!this.sessionId || !this.player?.video) return;
    const now = Date.now();
    if (this.isPlaying && this.lastHeartbeatAt > 0) {
      this.heartbeatPlayTime += (now - this.lastHeartbeatAt) / 1000;
    }
    const body = {
      session_id: this.sessionId,
      video_id: Number(this.videoId),
      current_position: Math.floor(this.player.video.currentTime || 0),
      play_duration: Math.floor(this.heartbeatPlayTime) || 0,
      drag_events: this.dragEvents,
      is_final: true,
    };
    try {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      navigator.sendBeacon('https://api.mfuns.net/v1/video-play/heartbeat', blob);
    } catch {
      /* ignore */
    }
  }

  reattachDanmakuList() {
    const el = document.getElementById('danmakuList');
    if (el && this.player?.mountDanmakuAuxiliary) {
      this.player.mountDanmakuAuxiliary(el);
    }
  }

  /**
   * @param {object | null} series
   */
  setSeries(series) {
    this.series = series;
    if (this.player?.setSeries) this.player.setSeries(series);
    else if (this.player?.loadSeriesVideo) {
      const list = buildMfunsVideoList(this.parts, this.videoId, this.title);
      this.player.loadSeriesVideo(list, series);
    }
  }

  /**
   * @param {number} partIndex
   * @param {{ autoPlay?: boolean }} [options]
   */
  loadPart(partIndex, options = {}) {
    if (partIndex < 0 || partIndex >= this.parts.length) return;
    this.partIndex = partIndex;
    if (this.player?.switchVideo) {
      this.player.switchVideo(partIndex);
      if (options.autoPlay) void this.player.video?.play?.();
    } else {
      void this.rebuildPlayer({ autoPlay: options.autoPlay ?? false });
    }
    this.onPartChange?.();
  }

  /**
   * @param {{ autoPlay?: boolean }} [options]
   */
  async rebuildPlayer(options = {}) {
    if (options.autoPlay) this.pendingAutoPlay = true;
    this.destroyPlayerInstance();
    this.placeholder?.removeAttribute('hidden');
    this.ready = false;
    await this.ensurePlayer();
    this.pendingAutoPlay = false;
    if (options.autoPlay && this.player?.video) {
      void this.player.video.play?.().catch(() => {});
    }
  }

  destroyPlayerInstance() {
    void this.endPlaySession();
    if (this.player) {
      this.player.destroy?.();
      this.player = null;
    }
    this.ready = false;
    this.root?.classList.remove('watch-mfuns-player--scheme-dark');
    if (this.root) delete this.root.dataset.playerScheme;
    if (this.container) this.container.innerHTML = '';
  }

  /**
   * 换片/重载时只拆播放器实例，保留主题监听（勿用 destroy，否则单例会变成“听不到主题”的僵尸）。
   */
  reset() {
    this.clearPlayerBlackmask();
    this.flushBeaconHeartbeat();
    this.destroyPlayerInstance();
    this.parts = [];
    this.partIndex = 0;
    this.videoId = '';
    this.title = '';
    this.onPartChange = null;
    this.onSwitchSeries = null;
    this.series = null;
    this.placeholder?.removeAttribute('hidden');
    this.bindThemeListener();
  }

  destroy() {
    this.unbindThemeListener();
    this.clearPlayerBlackmask();
    this.flushBeaconHeartbeat();
    this.destroyPlayerInstance();
    this.parts = [];
    this.partIndex = 0;
    this.videoId = '';
    this.title = '';
    this.onPartChange = null;
    this.onSwitchSeries = null;
    this.series = null;
    this.placeholder?.removeAttribute('hidden');
  }

  /**
   * @param {{
   *   parts: VideoPart[],
   *   partIndex?: number,
   *   videoId?: string,
   *   title?: string,
   *   autoPlay?: boolean,
   *   onPartChange?: () => void,
   *   onSwitchSeries?: (videoId: number) => void,
   *   series?: object | null,
   * }} config
   */
  load(config) {
    this.parts = config.parts;
    this.videoId = config.videoId ? `${config.videoId}` : '';
    this.title = config.title ?? '';
    this.partIndex = config.partIndex ?? 0;
    this.onPartChange = config.onPartChange ?? null;
    this.onSwitchSeries = config.onSwitchSeries ?? null;
    this.series = config.series ?? null;
    void this.rebuildPlayer({ autoPlay: config.autoPlay ?? false });
  }
}

/** @type {WatchPlayer | null} */
let instance = null;

export function getWatchPlayer() {
  const root = document.getElementById('watch-player-root');
  if (!root) return null;
  if (!instance) instance = new WatchPlayer(root);
  else if (instance.root !== root) {
    instance.destroy();
    instance = new WatchPlayer(root);
  } else {
    instance.bindThemeListener();
  }
  return instance;
}

export function destroyWatchPlayer() {
  if (!instance) return;
  instance.destroy();
  instance = null;
}

/** @deprecated mfunsPlayer 内置弹幕 */
export function ensureWatchDanmaku() {
  return null;
}
