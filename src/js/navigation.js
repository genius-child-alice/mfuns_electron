import { destroyWatchPlayer } from './watch-player.js';
import { ensurePageBound } from './lazy-page-bind.js';
import { setPage } from './pages.js';

/** @typedef {import('./pages.js').PageId} PageId */

/** @typedef {{
 *   capture?: (params?: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>,
 *   enter?: (params?: Record<string, unknown>, options?: { restored?: boolean }) => void | Promise<void>,
 *   restore?: (state: Record<string, unknown>, params?: Record<string, unknown>) => void | Promise<void>,
 *   leave?: () => void | Promise<void>,
 * }} PageNavigationHandler */

/** @typedef {{ pageId: PageId, params?: Record<string, unknown>, state?: Record<string, unknown> }} NavEntry */

/** @type {Map<PageId, PageNavigationHandler>} */
const handlers = new Map();

/** @type {NavEntry[]} */
let stack = [{ pageId: 'home' }];
let index = 0;
let navigating = false;

/** 导航锁卡死时由 unblockUi 调用 */
export function resetNavigationLock() {
  navigating = false;
}

/**
 * @param {PageId} pageId
 * @param {PageNavigationHandler} handler
 */
export function registerPageNavigation(pageId, handler) {
  handlers.set(pageId, handler);
}

export function canGoBack() {
  return index > 0;
}

export function getCurrentNavEntry() {
  return stack[index];
}

/**
 * @param {Record<string, unknown> | undefined} a
 * @param {Record<string, unknown> | undefined} b
 */
function paramsEqual(a, b) {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

/**
 * @param {string | HTMLElement | null | undefined} target
 */
export function getScrollTop(target) {
  if (typeof target === 'string') {
    return document.getElementById(target)?.scrollTop ?? 0;
  }
  return target?.scrollTop ?? 0;
}

/**
 * @param {string | HTMLElement | null | undefined} target
 * @param {number} scrollTop
 */
export function restoreScrollTop(target, scrollTop) {
  requestAnimationFrame(() => {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (el) el.scrollTop = scrollTop;
  });
}

async function captureCurrentEntry() {
  const entry = stack[index];
  const handler = handlers.get(entry.pageId);
  if (handler?.capture) {
    entry.state = await handler.capture(entry.params ?? {});
  }
}

/**
 * @param {PageId} pageId
 */
async function leavePage(pageId) {
  if (pageId === 'watch') {
    destroyWatchPlayer();
  }
  const handler = handlers.get(pageId);
  if (handler?.leave) await handler.leave();
}

/**
 * @param {PageId} pageId
 */
async function triggerLegacyPageEnter(pageId) {
  if (pageId === 'search') {
    await import('./search-page.js').then((mod) => mod.onSearchPageEnter());
    return;
  }
  if (pageId === 'tag') {
    await import('./tag-page.js').then((mod) => mod.onTagPageEnter());
    return;
  }
  if (pageId === 'mine') {
    await import('./mine-page.js').then((mod) => mod.onMinePageEnter());
    return;
  }
  if (pageId === 'feed') {
    await import('./feed-page.js').then((mod) => mod.onFeedPageEnter());
    return;
  }
  if (pageId === 'message') {
    await import('./message-page.js').then((mod) => mod.onMessagePageEnter());
    return;
  }
  if (pageId === 'sign') {
    await import('./sign-page.js').then((mod) => mod.onSignPageEnter());
    return;
  }
  if (pageId === 'series') {
    await import('./series-page.js').then((mod) => mod.onSeriesPageEnter());
    return;
  }
  if (pageId === 'contribute') {
    await import('./contribute-page.js').then((mod) => mod.onContributePageEnter());
  }
}

/**
 * @param {NavEntry} entry
 * @param {{ restored: boolean }} options
 */
async function applyEntry(entry, { restored }) {
  await ensurePageBound(entry.pageId);
  setPage(entry.pageId, { skipEnter: true });
  const handler = handlers.get(entry.pageId);
  if (restored && entry.state && handler?.restore) {
    await handler.restore(entry.state, entry.params ?? {});
    return;
  }
  if (handler?.enter) {
    await handler.enter(entry.params ?? {}, { restored: false });
    return;
  }
  await triggerLegacyPageEnter(entry.pageId);
}

/**
 * @param {PageId} pageId
 * @param {Record<string, unknown>} [params]
 * @param {{ push?: boolean, force?: boolean }} [options]
 */
export async function navigateTo(pageId, params = {}, options = {}) {
  if (navigating) {
    console.warn('[navigateTo] skipped while navigating', pageId);
    return;
  }
  const push = options.push !== false;
  const current = stack[index];
  if (
    !options.force &&
    current.pageId === pageId &&
    paramsEqual(current.params, params)
  ) {
    return;
  }

  navigating = true;
  const watchdog = window.setTimeout(() => {
    if (navigating) {
      console.warn('[navigateTo] watchdog cleared stuck lock');
      navigating = false;
    }
  }, 8000);
  try {
    await captureCurrentEntry();
    if (push) {
      stack = stack.slice(0, index + 1);
      stack.push({ pageId, params });
      index += 1;
    } else {
      stack[index] = { pageId, params };
    }
    await applyEntry(stack[index], { restored: false });
  } catch (err) {
    console.error('[navigateTo] failed', pageId, err);
  } finally {
    window.clearTimeout(watchdog);
    navigating = false;
  }
}

export async function navigateBack() {
  if (!canGoBack() || navigating) return false;
  navigating = true;
  try {
    await captureCurrentEntry();
    const leaving = stack[index].pageId;
    await leavePage(leaving);
    index -= 1;
    await applyEntry(stack[index], { restored: true });
    return true;
  } finally {
    navigating = false;
  }
}

/**
 * @param {PageId} pageId
 * @param {Record<string, unknown>} [params]
 */
export async function navigateReplace(pageId, params = {}) {
  if (navigating) return;
  navigating = true;
  try {
    await captureCurrentEntry();
    stack[index] = { pageId, params };
    await applyEntry(stack[index], { restored: false });
  } finally {
    navigating = false;
  }
}

/**
 * @param {PageId} pageId
 */
export async function navigateRoot(pageId, params = {}) {
  if (navigating) return;
  navigating = true;
  try {
    const leaving = stack[index].pageId;
    if (index > 0) {
      await captureCurrentEntry();
      await leavePage(leaving);
    }
    stack = [{ pageId, params }];
    index = 0;
    await applyEntry(stack[index], { restored: false });
  } finally {
    navigating = false;
  }
}

export function bindNavigationShortcuts() {
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }
    if (event.key === 'BrowserBack' || (event.altKey && event.key === 'ArrowLeft')) {
      event.preventDefault();
      void navigateBack();
    }
  });
}
