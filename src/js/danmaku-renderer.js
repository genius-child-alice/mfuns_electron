/** @typedef {import('./danmaku-api.js').DanmakuItem} DanmakuItem */

/** @typedef {{
 *   item: DanmakuItem,
 *   x: number,
 *   y: number,
 *   width: number,
 *   speed: number,
 *   lane: number,
 *   mode: 'scroll' | 'top' | 'bottom',
 *   ttl: number,
 * }} ActiveDanmaku */

const SCROLL_DURATION_BASE = 8;

/**
 * @param {number} color
 */
export function danmakuColorCss(color) {
  const rgb = color & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

export class DanmakuRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    /** @type {DanmakuItem[]} */
    this.items = [];
    /** @type {ActiveDanmaku[]} */
    this.active = [];
    this.nextIndex = 0;
    this.enabled = true;
    this.opacity = 0.85;
    this.fontScale = 1;
    this.displayArea = 0.75;
    /** @type {number[]} */
    this.laneReleaseAt = [];
    this.rafId = 0;
    this.lastFrameTs = 0;
    this.videoTime = 0;
    this.playing = false;
    this.resizeObserver = null;
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.width = 0;
    this.height = 0;
    this.onResize();
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.stopLoop();
    this.active = [];
    this.items = [];
  }

  onResize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.width = w;
    this.height = h;
  }

  /**
   * @param {DanmakuItem[]} items
   */
  load(items) {
    this.items = items;
    this.resetTimeline(0);
  }

  /**
   * @param {number} time
   */
  resetTimeline(time) {
    this.active = [];
    this.nextIndex = lowerBound(this.items, time);
    this.videoTime = time;
    this.laneReleaseAt = [];
    this.drawFrame(0);
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.active = [];
      this.stopLoop();
      this.drawFrame(0);
      return;
    }
    this.resetTimeline(this.videoTime);
  }

  /**
   * @param {{ opacity?: number, fontScale?: number, displayArea?: number }} opts
   */
  setOptions(opts) {
    if (opts.opacity != null) this.opacity = clamp(opts.opacity, 0.2, 1);
    if (opts.fontScale != null) this.fontScale = clamp(opts.fontScale, 0.6, 1.6);
    if (opts.displayArea != null) this.displayArea = clamp(opts.displayArea, 0.25, 1);
  }

  /**
   * @param {DanmakuItem} item
   */
  addItem(item) {
    this.items.push(item);
    this.items.sort((a, b) => a.time - b.time);
    if (item.time >= this.videoTime - 0.05) {
      this.spawn(item);
    }
  }

  /**
   * @param {number} time
   * @param {boolean} playing
   */
  sync(time, playing) {
    this.videoTime = time;
    this.playing = playing;
    if (!this.enabled) return;

    while (this.nextIndex < this.items.length && this.items[this.nextIndex].time <= time + 0.05) {
      this.spawn(this.items[this.nextIndex]);
      this.nextIndex += 1;
    }

    if (playing && !this.rafId) this.startLoop();
    if (!playing) {
      this.stopLoop();
      this.drawFrame(0);
    }
  }

  /**
   * @param {number} time
   */
  seek(time) {
    this.resetTimeline(time);
  }

  startLoop() {
    if (this.rafId) return;
    this.lastFrameTs = performance.now();
    const tick = (ts) => {
      this.rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (ts - this.lastFrameTs) / 1000);
      this.lastFrameTs = ts;
      this.step(dt);
      this.drawFrame(dt);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /**
   * @param {number} dt
   */
  step(dt) {
    if (!this.enabled) return;
    const now = performance.now() / 1000;
    this.active = this.active.filter((bullet) => {
      if (bullet.mode === 'scroll') {
        bullet.x -= bullet.speed * dt;
        return bullet.x + bullet.width > -8;
      }
      bullet.ttl -= dt;
      return bullet.ttl > 0;
    });

    for (let lane = 0; lane < this.laneReleaseAt.length; lane += 1) {
      if (this.laneReleaseAt[lane] <= now) this.laneReleaseAt[lane] = 0;
    }
  }

  /**
   * @param {DanmakuItem} item
   */
  spawn(item) {
    if (!this.enabled || !this.ctx) return;
    const mode = danmakuMode(item.type);
    const fontSize = Math.round(item.size * this.fontScale);
    this.ctx.font = `${fontSize}px sans-serif`;
    const width = this.ctx.measureText(item.content).width;
    const stroke = fontSize >= 22;

    if (mode === 'scroll') {
      const lane = this.pickScrollLane(width);
      if (lane < 0) return;
      const lineHeight = fontSize + 8;
      const areaHeight = this.height * this.displayArea;
      const lanes = Math.max(1, Math.floor(areaHeight / lineHeight));
      const y = lineHeight * lane + fontSize;
      const speed = (this.width + width) / SCROLL_DURATION_BASE;
      this.active.push({
        item,
        x: this.width,
        y,
        width,
        speed,
        lane,
        mode: 'scroll',
        ttl: 0,
      });
      const duration = (this.width + width) / speed;
      while (this.laneReleaseAt.length <= lane) this.laneReleaseAt.push(0);
      this.laneReleaseAt[lane] = performance.now() / 1000 + duration * 0.55;
      return;
    }

    const y =
      mode === 'top'
        ? fontSize + 6
        : this.height * this.displayArea - 6;
    this.active.push({
      item,
      x: (this.width - width) / 2,
      y,
      width,
      speed: 0,
      lane: -1,
      mode,
      ttl: 3,
    });
    void stroke;
  }

  /**
   * @param {number} textWidth
   */
  pickScrollLane(textWidth) {
    const fontSize = 25 * this.fontScale;
    const lineHeight = fontSize + 8;
    const lanes = Math.max(1, Math.floor((this.height * this.displayArea) / lineHeight));
    const now = performance.now() / 1000;
    for (let lane = 0; lane < lanes; lane += 1) {
      const release = this.laneReleaseAt[lane] ?? 0;
      if (release <= now) return lane;
    }
    return lanes > 0 ? Math.floor(Math.random() * lanes) : -1;
  }

  /**
   * @param {number} _dt
   */
  drawFrame(_dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.enabled) return;

    ctx.globalAlpha = this.opacity;
    for (const bullet of this.active) {
      const fontSize = Math.round(bullet.item.size * this.fontScale);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = danmakuColorCss(bullet.item.color);
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = Math.max(2, fontSize / 12);
      if (bullet.mode === 'scroll' || bullet.mode === 'top' || bullet.mode === 'bottom') {
        ctx.strokeText(bullet.item.content, bullet.x, bullet.y);
        ctx.fillText(bullet.item.content, bullet.x, bullet.y);
      }
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * @param {number} type
 */
function danmakuMode(type) {
  if (type === 5) return 'top';
  if (type === 4) return 'bottom';
  return 'scroll';
}

/**
 * @param {DanmakuItem[]} items
 * @param {number} time
 */
function lowerBound(items, time) {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
