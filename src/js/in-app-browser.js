const params = new URLSearchParams(window.location.search);
const url = params.get('url');
const title = params.get('title');

const titleEl = document.getElementById('browser-title');
const webviewWrap = document.querySelector('.browser-webview-wrap');
const webview = /** @type {Electron.WebviewTag | null} */ (
  document.getElementById('browser-webview')
);

if (titleEl && title) {
  titleEl.textContent = title;
  document.title = title;
}

/** webview 不会自动跟随 flex 撑满，需按容器像素同步尺寸 */
function fitWebview() {
  if (!webview || !webviewWrap) return;
  const { width, height } = webviewWrap.getBoundingClientRect();
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  webview.style.width = `${w}px`;
  webview.style.height = `${h}px`;
}

if (webview && url) {
  webview.src = url;
  webview.addEventListener('dom-ready', fitWebview);
}

window.addEventListener('resize', fitWebview);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fitWebview);
} else {
  fitWebview();
}
requestAnimationFrame(fitWebview);

document.getElementById('browser-close')?.addEventListener('click', () => {
  window.electronAPI?.browser?.close();
});
