import { danmakuColorCss } from './danmaku-renderer.js';
import { materialIcon } from './icons.js';

/** @typedef {import('./danmaku-api.js').DanmakuItem} DanmakuItem */

/**
 * @param {number} seconds
 */
function formatDanmakuTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {DanmakuItem} item
 */
function danmakuTypeLabel(item) {
  if (item.type === 5) return '顶部';
  if (item.type === 4) return '底部';
  return '滚动';
}

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (
    document.getElementById('danmaku-manager-dialog')
  );
}

/**
 * @param {DanmakuItem[]} items
 * @param {string} query
 */
function filterItems(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.content.toLowerCase().includes(q));
}

/**
 * @param {DanmakuItem[]} items
 * @param {string} query
 */
function renderListHtml(items, query) {
  const filtered = filterItems(items, query);
  if (filtered.length === 0) {
    return '<p class="danmaku-manager__empty">没有匹配的弹幕</p>';
  }
  return filtered
    .map(
      (item) => `
    <button type="button" class="danmaku-manager__row" data-danmaku-time="${item.time}" data-danmaku-color="${item.color}">
      <span class="danmaku-manager__time">${formatDanmakuTime(item.time)}</span>
      <span class="danmaku-manager__type">${danmakuTypeLabel(item)}</span>
      <span class="danmaku-manager__text">${escapeHtml(item.content)}</span>
    </button>`,
    )
    .join('');
}

/** @type {DanmakuItem[]} */
let managerItems = [];
/** @type {((time: number) => void) | null} */
let managerOnSeek = null;

function applyDanmakuRowColors() {
  const list = document.getElementById('danmaku-manager-list');
  if (!list) return;
  list.querySelectorAll('[data-danmaku-time]').forEach((btn) => {
    const color = Number(btn.getAttribute('data-danmaku-color'));
    const text = btn.querySelector('.danmaku-manager__text');
    if (text instanceof HTMLElement && Number.isFinite(color)) {
      text.style.color = danmakuColorCss(color);
    }
  });
}

function bindListClicks() {
  const list = document.getElementById('danmaku-manager-list');
  if (!list) return;
  const query =
    /** @type {HTMLInputElement | null} */ (document.getElementById('danmaku-manager-search'))
      ?.value ?? '';
  applyDanmakuRowColors();
  list.querySelectorAll('[data-danmaku-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const time = Number(btn.getAttribute('data-danmaku-time'));
      if (!Number.isFinite(time)) return;
      managerOnSeek?.(time);
      getDialog()?.close();
    });
  });
}

function refreshList() {
  const list = document.getElementById('danmaku-manager-list');
  const countEl = document.getElementById('danmaku-manager-count');
  const search =
    /** @type {HTMLInputElement | null} */ (document.getElementById('danmaku-manager-search'));
  const query = search?.value ?? '';
  if (list) {
    list.innerHTML = renderListHtml(managerItems, query);
    bindListClicks();
  }
  if (countEl) {
    const shown = filterItems(managerItems, query).length;
    countEl.textContent =
      managerItems.length === 0
        ? '暂无弹幕'
        : query
          ? `显示 ${shown} / 共 ${managerItems.length} 条`
          : `共 ${managerItems.length} 条`;
  }
}

let managerBound = false;

export function bindDanmakuManagerDialog() {
  if (managerBound) return;
  managerBound = true;

  const dialog = getDialog();
  document.getElementById('danmaku-manager-close')?.addEventListener('click', () =>
    dialog?.close(),
  );
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.getElementById('danmaku-manager-search')?.addEventListener('input', () => {
    refreshList();
  });
}

/**
 * @param {{
 *   title: string,
 *   items: DanmakuItem[],
 *   onSeek: (time: number) => void,
 * }} options
 */
export function openDanmakuManagerDialog(options) {
  bindDanmakuManagerDialog();
  const dialog = getDialog();
  const titleEl = document.getElementById('danmaku-manager-title');
  const search = /** @type {HTMLInputElement | null} */ (
    document.getElementById('danmaku-manager-search')
  );
  if (!dialog || !titleEl) return;

  managerItems = options.items;
  managerOnSeek = options.onSeek;
  titleEl.textContent = options.title;
  if (search) search.value = '';
  refreshList();
  dialog.showModal();
  window.requestAnimationFrame(() => search?.focus());
}

export function closeDanmakuManagerDialog() {
  getDialog()?.close();
}
