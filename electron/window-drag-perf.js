const { BrowserWindow } = require('electron');

/** @typedef {{ dragging: boolean, endTimer: ReturnType<typeof setTimeout> | null }} DragPerfState */

/** 拖动时限制渲染帧率，减轻无边框窗口在 Windows 上移动时的合成压力 */
const DRAG_FRAME_FPS = 12;
/** 最后一次 moved 后多久视为拖动结束 */
const DRAG_END_DEBOUNCE_MS = 90;

/** @type {WeakMap<import('electron').BrowserWindow, DragPerfState>} */
const dragStateByWindow = new WeakMap();

/**
 * @param {import('electron').BrowserWindow} win
 */
function getState(win) {
  let state = dragStateByWindow.get(win);
  if (!state) {
    state = { dragging: false, endTimer: null };
    dragStateByWindow.set(win, state);
  }
  return state;
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function notifyRenderer(win, dragging) {
  const wc = win.webContents;
  if (win.isDestroyed() || wc.isDestroyed()) return;
  wc.send('window:drag-state', { dragging });
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function setDragFrameRate(win, fps) {
  const wc = win.webContents;
  if (win.isDestroyed() || wc.isDestroyed()) return;
  try {
    wc.setFrameRate(fps);
  } catch {
    /* 部分环境可能不支持 */
  }
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function enterWindowDragPerf(win) {
  const state = getState(win);
  if (state.endTimer) {
    clearTimeout(state.endTimer);
    state.endTimer = null;
  }
  if (state.dragging) return;
  state.dragging = true;
  setDragFrameRate(win, DRAG_FRAME_FPS);
  notifyRenderer(win, true);
}

/**
 * @param {import('electron').BrowserWindow} win
 * @param {boolean} [immediate]
 */
function exitWindowDragPerf(win, immediate = false) {
  const state = getState(win);
  const finish = () => {
    state.endTimer = null;
    if (!state.dragging) return;
    state.dragging = false;
    setDragFrameRate(win, 0);
    notifyRenderer(win, false);
  };

  if (immediate) {
    if (state.endTimer) clearTimeout(state.endTimer);
    finish();
    return;
  }

  if (state.endTimer) clearTimeout(state.endTimer);
  state.endTimer = setTimeout(() => {
    if (win.isDestroyed()) return;
    finish();
  }, DRAG_END_DEBOUNCE_MS);
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function attachWindowDragPerf(win) {
  if (!win || win.isDestroyed()) return;

  win.on('will-move', () => {
    enterWindowDragPerf(win);
  });

  win.on('moved', () => {
    exitWindowDragPerf(win, false);
  });

  win.on('closed', () => {
    const state = dragStateByWindow.get(win);
    if (state?.endTimer) clearTimeout(state.endTimer);
    dragStateByWindow.delete(win);
  });
}

/**
 * @param {import('electron').WebContents} webContents
 */
function handleDragPrepareFromRenderer(webContents) {
  const win = BrowserWindow.fromWebContents(webContents);
  if (win && !win.isDestroyed()) enterWindowDragPerf(win);
}

/**
 * @param {import('electron').WebContents} webContents
 */
function handleDragReleaseFromRenderer(webContents) {
  const win = BrowserWindow.fromWebContents(webContents);
  if (win && !win.isDestroyed()) exitWindowDragPerf(win, true);
}

module.exports = {
  attachWindowDragPerf,
  handleDragPrepareFromRenderer,
  handleDragReleaseFromRenderer,
};
