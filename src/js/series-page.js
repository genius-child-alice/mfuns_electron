import { loadSession } from './auth.js';
import { mediaSrcForCover } from './content-api.js';
import { materialIcon } from './icons.js';
import { requireLogin } from './login-ui.js';
import { notify } from './notice-ui.js';
import { getCurrentPage } from './pages.js';
import {
  getScrollTop,
  navigateBack,
  navigateTo,
  registerPageNavigation,
  restoreScrollTop,
} from './navigation.js';
import {
  fetchSeriesInfo,
  fetchSeriesItems,
  subscribeSeries,
  unsubscribeSeries,
} from './series-api.js';
import {
  bindSeriesFolderList,
  bindSeriesGridEvents,
  confirmDeleteSeries,
  formatSeriesDate,
  openSeriesContentPickerDialog,
  openSeriesFormDialog,
  seriesCreateButtonHtml,
  seriesEscapeHtml,
  seriesGridItemHtml,
  seriesItemsGridHtml,
} from './series-ui.js';
import { openUserSpace } from './user-space.js';


/** @type {number} */
let currentSeriesId = 0;

/** @type {import('./series-api.js').SeriesInfo | null} */
let currentInfo = null;

let loading = false;
let page = 1;
let hasMore = true;

/** @type {import('./series-api.js').SeriesItem[]} */
let shownItems = [];

let bound = false;

function getBody() {
  return document.getElementById('series-page-body');
}

function sessionUserId() {
  const user = loadSession()?.user;
  if (!user) return null;
  const id = user.id ?? user.user_id;
  const parsed = Number.parseInt(`${id ?? ''}`, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOwner() {
  const uid = sessionUserId();
  return uid != null && currentInfo != null && uid === currentInfo.userId;
}

function syncTitle() {
  const titleEl = document.getElementById('series-page-title');
  if (titleEl) titleEl.textContent = currentInfo?.title ?? '合集';
}

function renderPageBody() {
  const info = currentInfo;
  if (!info) return '<p class="series-page__empty">加载中…</p>';
  const cover = info.cover ? mediaSrcForCover(info.cover) : null;
  const owner = isOwner();
  return `
    <section class="series-hero">
      <div class="series-hero__main">
        ${
          cover
            ? `<img class="series-hero__cover" src="${cover}" alt="" />`
            : `<span class="series-hero__cover series-hero__cover--ph">${materialIcon('video_library')}</span>`
        }
        <div class="series-hero__info">
          <h2 class="series-hero__title">${seriesEscapeHtml(info.title)}</h2>
          ${
            info.summary
              ? `<p class="series-hero__summary">${seriesEscapeHtml(info.summary)}</p>`
              : ''
          }
          <p class="series-hero__meta">
            <button type="button" class="series-hero__author" data-series-author="${info.userId}">
              查看作者空间
            </button>
            · ${formatSeriesDate(info.createdAt) || '未知日期'} 创建
          </p>
        </div>
      </div>
      <div class="series-hero__actions">
        ${
          owner
            ? `<button type="button" class="btn-accent btn-accent--sm" id="series-page-edit">编辑</button>`
            : `<button type="button" class="btn-accent btn-accent--sm" id="series-page-subscribe">${info.isSubscribed ? '已订阅' : '订阅'}</button>`
        }
        ${
          owner
            ? `<button type="button" class="series-page__danger" id="series-page-delete">删除</button>`
            : ''
        }
      </div>
    </section>
    ${
      owner
        ? `<div class="series-page__toolbar">
            <button type="button" class="series-page__add-btn" id="series-page-add-content">
              ${materialIcon('add', 'series-page__add-icon')}
              <span>添加内容</span>
            </button>
          </div>`
        : ''
    }
    <div id="series-page-items-root">
      ${seriesItemsGridHtml(shownItems, { manageable: owner, seriesId: info.id })}
    </div>
    <p class="series-page__hint" id="series-page-hint" hidden></p>`;
}

async function reloadSeries() {
  if (!currentSeriesId) return;
  loading = true;
  page = 1;
  hasMore = true;
  shownItems = [];
  const body = getBody();
  if (body) body.innerHTML = '<p class="series-page__empty">加载中…</p>';
  try {
    const [info, itemsPage] = await Promise.all([
      fetchSeriesInfo(currentSeriesId),
      fetchSeriesItems(currentSeriesId, 1, 20, 0),
    ]);
    currentInfo = info;
    shownItems = itemsPage.items;
    hasMore = itemsPage.hasMore;
    page = 1;
    syncTitle();
    if (body) {
      body.innerHTML = renderPageBody();
      bindPageBodyEvents();
    }
  } catch (err) {
    if (body) {
      body.innerHTML = `<p class="series-page__empty">${seriesEscapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`;
    }
  } finally {
    loading = false;
  }
}

async function loadMoreItems() {
  if (!currentSeriesId || loading || !hasMore) return;
  loading = true;
  const nextPage = page + 1;
  try {
    const itemsPage = await fetchSeriesItems(currentSeriesId, nextPage, 20, 0);
    if (!itemsPage.items.length) {
      hasMore = false;
      return;
    }
    shownItems = shownItems.concat(itemsPage.items);
    page = nextPage;
    hasMore = itemsPage.hasMore;
    const grid = document.querySelector('.series-page__grid');
    if (grid) {
      const startIndex = shownItems.length - itemsPage.items.length;
      grid.insertAdjacentHTML(
        'beforeend',
        itemsPage.items
          .map((item, offset) =>
            seriesGridItemHtml(item, {
              manageable: isOwner(),
              seriesId: currentSeriesId,
              index: startIndex + offset,
              total: shownItems.length,
            }),
          )
          .join(''),
      );
    }
  } catch {
    hasMore = false;
  } finally {
    loading = false;
  }
}

function bindPageBodyEvents() {
  document.getElementById('series-page-subscribe')?.addEventListener('click', async () => {
    if (!currentInfo || !requireLogin()) return;
    const btn = document.getElementById('series-page-subscribe');
    if (!btn) return;
    btn.disabled = true;
    try {
      if (currentInfo.isSubscribed) {
        await unsubscribeSeries(currentInfo.id);
        currentInfo = { ...currentInfo, isSubscribed: false };
        notify('已取消订阅', 'success');
      } else {
        await subscribeSeries(currentInfo.id);
        currentInfo = { ...currentInfo, isSubscribed: true };
        notify('订阅成功', 'success');
      }
      btn.textContent = currentInfo.isSubscribed ? '已订阅' : '订阅';
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('series-page-edit')?.addEventListener('click', () => {
    if (!currentInfo) return;
    void openSeriesFormDialog({ mode: 'edit', series: currentInfo, onComplete: () => void reloadSeries() });
  });

  document.getElementById('series-page-delete')?.addEventListener('click', () => {
    if (!currentInfo) return;
    void confirmDeleteSeries(currentInfo, () => closeSeriesPage());
  });

  document.querySelector('[data-series-author]')?.addEventListener('click', (event) => {
    const btn = /** @type {HTMLElement} */ (event.currentTarget);
    const uid = Number.parseInt(btn.getAttribute('data-series-author') ?? '', 10);
    if (Number.isFinite(uid) && uid > 0) openUserSpace(uid);
  });

  document.getElementById('series-page-add-content')?.addEventListener('click', () => {
    if (!currentInfo || !requireLogin()) return;
    void openSeriesContentPickerDialog({
      seriesId: currentInfo.id,
      existingItems: shownItems,
      onComplete: () => void reloadSeries(),
    });
  });

}

function onMainScroll() {
  if (getCurrentPage() !== 'series' || loading || !hasMore) return;
  const main = document.getElementById('main-content');
  if (!main) return;
  if (main.scrollTop + main.clientHeight >= main.scrollHeight - 480) {
    void loadMoreItems();
  }
}

export function captureSeriesPageState() {
  return {
    currentSeriesId,
    currentInfo,
    page,
    hasMore,
    shownItems,
    bodyHtml: getBody()?.innerHTML ?? '',
    scrollTop: getScrollTop('main-content'),
  };
}

/**
 * @param {ReturnType<typeof captureSeriesPageState>} state
 */
export function restoreSeriesPageState(state) {
  currentSeriesId = state.currentSeriesId ?? 0;
  currentInfo = state.currentInfo ?? null;
  page = state.page ?? 1;
  hasMore = state.hasMore ?? true;
  shownItems = state.shownItems ?? [];
  loading = false;
  syncTitle();
  const body = getBody();
  if (body) body.innerHTML = state.bodyHtml ?? '';
  restoreScrollTop('main-content', state.scrollTop ?? 0);
}

/**
 * @param {number} seriesId
 */
export function openSeriesPage(seriesId) {
  const id = Math.trunc(seriesId);
  if (!Number.isFinite(id) || id <= 0) return;
  void navigateTo('series', { seriesId: id });
}

export function closeSeriesPage() {
  void navigateBack();
}

export function onSeriesPageEnter() {
  syncTitle();
}

export function bindSeriesPage() {
  if (bound) return;
  bound = true;
  document.getElementById('series-page-back')?.addEventListener('click', closeSeriesPage);
  document.getElementById('main-content')?.addEventListener('scroll', onMainScroll, { passive: true });
  document.querySelector('.btn-refresh')?.addEventListener('click', () => {
    if (getCurrentPage() === 'series' && currentSeriesId) void reloadSeries();
  });
  const body = getBody();
  if (body) {
    bindSeriesGridEvents(body, {
      seriesId: 0,
      items: [],
      onChanged: () => void reloadSeries(),
      getContext: () => ({
        seriesId: currentInfo?.id ?? 0,
        items: shownItems,
      }),
    });
  }

  registerPageNavigation('series', {
    capture: () => captureSeriesPageState(),
    restore: (state) => {
      restoreSeriesPageState(/** @type {ReturnType<typeof captureSeriesPageState>} */ (state));
    },
    enter: async (params) => {
      const id = Math.trunc(Number(params.seriesId));
      if (!Number.isFinite(id) || id <= 0) return;
      currentSeriesId = id;
      currentInfo = null;
      document.getElementById('main-content')?.scrollTo(0, 0);
      await reloadSeries();
    },
  });
}

export { seriesCreateButtonHtml, bindSeriesFolderList };
