import { clearGlobalPlayerBlackmask } from './watch-player.js';

/**
 * 清掉可能挡住整窗点击的残留层（关灯遮罩 / 未关 dialog / 全屏 / view transition / inert）。
 * @param {string} [reason]
 * @param {{ keepLogin?: boolean }} [options]
 */
export function unblockUi(reason = '', options = {}) {
  const keepLogin = options.keepLogin === true;

  clearGlobalPlayerBlackmask();

  document.body.classList.remove(
    'player-mode-blackmask',
    'image-viewer-open',
    'mfunsPlayer-web-fullscreen-fix',
  );
  document.documentElement.classList.remove(
    'player-mode-blackmask',
    'mfunsPlayer-web-fullscreen-fix',
  );

  // 残留的主题 view-transition 伪元素会吃掉全部点击
  const root = document.documentElement;
  root.style.setProperty('view-transition-name', 'none');

  document.querySelectorAll('.heimu').forEach((node) => {
    try {
      node.remove();
    } catch {
      /* ignore */
    }
  });

  document.querySelectorAll('dialog').forEach((dialog) => {
    if (keepLogin && dialog.id === 'login-panel' && dialog.open) return;
    if (!dialog.open && !dialog.hasAttribute('open')) return;
    try {
      dialog.close();
    } catch {
      /* ignore */
    }
    // close() 失败或非标准 open 时再兜底拔掉属性
    dialog.removeAttribute('open');
  });

  document.querySelectorAll('[inert]').forEach((el) => {
    el.removeAttribute('inert');
  });

  // Fullscreen API 残留层会盖住侧栏 + 内容区
  try {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    }
  } catch {
    /* ignore */
  }
  try {
    const doc = /** @type {Document & { webkitFullscreenElement?: Element, webkitExitFullscreen?: () => void }} */ (
      document
    );
    if (doc.webkitFullscreenElement) {
      doc.webkitExitFullscreen?.();
    }
  } catch {
    /* ignore */
  }

  if (reason) {
    console.info('[unblockUi]', reason);
  }
}
