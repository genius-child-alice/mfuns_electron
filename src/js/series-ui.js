import { confirmAction } from './confirm-dialog.js';
import { mediaSrcForCover } from './content-api.js';
import { materialIcon } from './icons.js';
import { isLoggedIn, requireLogin } from './login-ui.js';
import { notify } from './notice-ui.js';
import { promptInput } from './prompt-dialog.js';
import { renderVideoCard } from './home-feed.js';
import {
  addSeriesItem,
  createSeries,
  deleteSeries,
  fetchUserSeriesList,
  removeSeriesItem,
  reorderSeriesItem,
  seriesItemToPreview,
  updateSeries,
} from './series-api.js';
import { fetchUserArticles, fetchUserVideos } from './user-profile-api.js';
import { uploadCommentImage } from './video-api.js';
import { openContentDetail, previewFromCard } from './content-nav.js';
import { openUserSpace } from './user-space.js';

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
 * @param {number} ts
 */
function formatSeriesDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {import('./series-api.js').SeriesInfo} series
 * @param {{ manageable?: boolean }} [options]
 */
export function seriesFolderRowHtml(series, options = {}) {
  const manageable = options.manageable !== false;
  const actionsHtml = manageable
    ? `<div class="series-folder__actions">
        <button type="button" class="series-folder__action" data-series-edit="${series.id}" aria-label="编辑合集" title="编辑">
          ${materialIcon('edit')}
        </button>
        <button type="button" class="series-folder__action series-folder__action--danger" data-series-delete="${series.id}" aria-label="删除合集" title="删除">
          ${materialIcon('delete_outline')}
        </button>
      </div>`
    : '';
  const summary = series.summary
    ? `<span class="series-folder__desc">${escapeHtml(series.summary)}</span>`
    : '';
  return `
    <div class="series-folder-wrap${manageable ? '' : ' series-folder-wrap--readonly'}">
      <button type="button" class="series-folder" data-open-series="${series.id}">
        <span class="series-folder__icon">${materialIcon('video_library')}</span>
        <span class="series-folder__main">
          <span class="series-folder__name">${escapeHtml(series.title)}</span>
          ${summary}
        </span>
        ${materialIcon('chevron_right', 'series-folder__chevron')}
      </button>
      ${actionsHtml}
    </div>`;
}

export function seriesCreateButtonHtml() {
  return `<button type="button" class="series-create-btn" data-create-series>
    ${materialIcon('add', 'series-create-btn__icon')}
    <span>新建合集</span>
  </button>`;
}

/**
 * @returns {Promise<number | null>}
 */
async function resolveSessionUserId() {
  const { loadSession } = await import('./auth.js');
  const sessionUser = loadSession()?.user;
  const userId = Number.parseInt(`${sessionUser?.id ?? sessionUser?.user_id ?? ''}`, 10);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

/**
 * @param {number | null | undefined} authorId
 */
export async function canManageContentSeries(authorId) {
  if (!isLoggedIn() || authorId == null || authorId <= 0) return false;
  const userId = await resolveSessionUserId();
  return userId === authorId;
}

/**
 * @param {import('./series-api.js').SeriesItem} item
 * @param {{ manageable?: boolean, seriesId?: number, index?: number, total?: number }} [options]
 */
export function seriesGridItemHtml(item, options = {}) {
  const preview = seriesItemToPreview(item);
  const manageable = options.manageable === true && options.seriesId != null;
  const index = options.index ?? 0;
  const total = options.total ?? 1;
  const typeLabel = item.resourceType === 0 ? '文章' : '视频';
  const manageHtml = manageable
    ? `<div class="series-grid-item__actions">
        <button type="button" class="series-grid-item__action" data-series-move-up="${item.resourceId}:${item.resourceType}"${index <= 0 ? ' disabled' : ''} title="上移">↑</button>
        <button type="button" class="series-grid-item__action" data-series-move-down="${item.resourceId}:${item.resourceType}"${index >= total - 1 ? ' disabled' : ''} title="下移">↓</button>
        <button type="button" class="series-grid-item__action series-grid-item__action--danger" data-series-remove="${item.resourceId}:${item.resourceType}" title="移出合集">
          ${materialIcon('close')}
        </button>
      </div>`
    : '';
  return `
    <div class="series-grid-item" data-series-resource="${item.resourceId}:${item.resourceType}">
      <span class="series-grid-item__badge">${typeLabel}</span>
      ${renderVideoCard(preview)}
      ${manageHtml}
    </div>`;
}

/**
 * @param {import('./series-api.js').SeriesItem[]} items
 * @param {{ manageable?: boolean, seriesId?: number }} [options]
 */
export function seriesItemsGridHtml(items, options = {}) {
  if (!items.length) {
    return '<p class="series-page__empty">这个合集还没有内容</p>';
  }
  return `<div class="content-grid series-page__grid">${items
    .map((item, index) =>
      seriesGridItemHtml(item, {
        manageable: options.manageable,
        seriesId: options.seriesId,
        index,
        total: items.length,
      }),
    )
    .join('')}</div>`;
}

/**
 * @param {{ seriesId: number, item: import('./series-api.js').SeriesItem, onComplete?: () => void }} options
 */
export async function confirmRemoveSeriesItem(options) {
  const ok = await confirmAction({
    title: '移出合集',
    message: `确定将「${options.item.title}」从合集中移除吗？投稿本身不会被删除。`,
    confirmText: '移出',
    variant: 'danger',
  });
  if (!ok) return;
  try {
    await removeSeriesItem({
      seriesId: options.seriesId,
      resourceId: options.item.resourceId,
      resourceType: options.item.resourceType,
    });
    notify('已从合集移除', 'success');
    options.onComplete?.();
  } catch (err) {
    notify(err instanceof Error ? err.message : '移除失败', 'error');
  }
}

/**
 * @param {{ seriesId: number, items: import('./series-api.js').SeriesItem[], item: import('./series-api.js').SeriesItem, direction: 'up' | 'down', onComplete?: () => void }} options
 */
export async function moveSeriesItemInList(options) {
  const { items, item, direction, seriesId, onComplete } = options;
  const index = items.findIndex(
    (entry) => entry.resourceId === item.resourceId && entry.resourceType === item.resourceType,
  );
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
  const neighbor = items[targetIndex];
  const nextOrder = neighbor.order ?? targetIndex + 1;
  try {
    await reorderSeriesItem({
      seriesId,
      resourceId: item.resourceId,
      resourceType: item.resourceType,
      order: nextOrder,
    });
    notify('顺序已更新', 'success');
    onComplete?.();
  } catch (err) {
    notify(err instanceof Error ? err.message : '调整顺序失败', 'error');
  }
}

/**
 * @returns {Promise<string | null>}
 */
async function pickSeriesCoverPath() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const path = await uploadCommentImage(file);
        resolve(path);
      } catch (err) {
        notify(err instanceof Error ? err.message : '封面上传失败', 'error');
        resolve(null);
      }
    });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * @param {import('./series-api.js').ReturnType<import('./series-api.js').fetchSeriesContext> extends Promise<infer T> ? T : never} context
 */
export function renderCollectionNavHtml(context) {
  const { info, items, currentIndex } = context;
  if (!info?.id || items.length === 0) return '';
  const currentNo = currentIndex >= 0 ? currentIndex + 1 : null;
  const list = items
    .map((item, index) => {
      const active = index === currentIndex;
      const typeLabel = item.resourceType === 0 ? '文章' : '视频';
      return `
        <li>
          <button type="button" class="watch-collection__item${active ? ' is-active' : ''}" data-series-item="${item.resourceId}:${item.resourceType}">
            ${
              active
                ? materialIcon('graphic_eq', 'watch-collection__playing')
                : '<span class="watch-collection__playing watch-collection__playing--ph"></span>'
            }
            <span class="watch-collection__item-main">
              <span class="watch-collection__item-title">${escapeHtml(item.title)}</span>
              <span class="watch-collection__item-meta">${typeLabel} · 第 ${index + 1} 集</span>
            </span>
          </button>
        </li>`;
    })
    .join('');
  return `
    <section class="watch-collection" aria-label="所属合集">
      <header class="watch-collection__head">
        <button type="button" class="watch-collection__title-btn" data-open-series="${info.id}">
          ${materialIcon('video_library', 'watch-collection__head-icon')}
          <span class="watch-collection__title-text">合集：${escapeHtml(info.title)}</span>
        </button>
        ${
          currentNo
            ? `<span class="watch-collection__progress">第 ${currentNo}/${items.length} 集</span>`
            : ''
        }
      </header>
      <ol class="watch-collection__list">${list}</ol>
    </section>`;
}

/**
 * @param {HTMLElement} root
 */
export function bindCollectionNav(root) {
  root.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const openBtn = target.closest('[data-open-series]');
    if (openBtn instanceof HTMLElement) {
      const id = Number.parseInt(openBtn.getAttribute('data-open-series') ?? '', 10);
      if (Number.isFinite(id) && id > 0) {
        void import('./series-page.js').then((mod) => mod.openSeriesPage(id));
      }
      return;
    }
    const itemBtn = target.closest('[data-series-item]');
    if (itemBtn instanceof HTMLElement) {
      const raw = itemBtn.getAttribute('data-series-item') ?? '';
      const [idText, typeText] = raw.split(':');
      const id = Number.parseInt(idText, 10);
      const type = Number.parseInt(typeText, 10);
      if (!Number.isFinite(id) || id <= 0) return;
      void openContentDetail({
        id: String(id),
        title: '',
        cover: null,
        author: '',
        authorId: null,
        authorAvatar: null,
        type: type === 0 ? 0 : 1,
        views: 0,
        comments: 0,
        createdAt: null,
      });
    }
  });
}

/**
 * @param {{ mode: 'create' | 'edit', series?: import('./series-api.js').SeriesInfo, onComplete?: () => void }} options
 */
export async function openSeriesFormDialog(options) {
  if (!requireLogin()) return;
  const { mode, series, onComplete } = options;
  const titleDefault = series?.title ?? '';
  const summaryDefault = series?.summary ?? '';
  const title = await promptInput({
    title: mode === 'create' ? '新建合集' : '编辑合集',
    label: '合集标题',
    defaultValue: titleDefault,
    confirmText: '下一步',
    maxLength: 50,
  });
  if (!title?.trim()) return;
  const summary = await promptInput({
    title: mode === 'create' ? '新建合集' : '编辑合集',
    label: '合集简介（可选）',
    defaultValue: summaryDefault,
    confirmText: mode === 'create' ? '创建' : '保存',
    maxLength: 200,
  });
  if (summary == null) return;

  let coverPath = series?.cover ?? null;
  const wantCover = await confirmAction({
    title: mode === 'create' ? '合集封面' : '更新封面',
    message: coverPath ? '是否更换合集封面图？' : '是否上传合集封面图？',
    confirmText: coverPath ? '更换封面' : '上传封面',
    cancelText: '跳过',
  });
  if (wantCover) {
    const uploaded = await pickSeriesCoverPath();
    if (uploaded) coverPath = uploaded;
  }

  try {
    if (mode === 'create') {
      const created = await createSeries({
        title: title.trim(),
        summary: summary.trim(),
        ...(coverPath ? { cover: coverPath } : {}),
      });
      notify('合集已创建', 'success');
      onComplete?.();
      void import('./series-page.js').then((mod) => mod.openSeriesPage(created.id));
      return;
    }
    if (series) {
      await updateSeries({
        id: series.id,
        title: title.trim(),
        summary: summary.trim(),
        ...(coverPath ? { cover: coverPath } : {}),
      });
      notify('合集已更新', 'success');
      onComplete?.();
    }
  } catch (err) {
    notify(err instanceof Error ? err.message : '操作失败', 'error');
  }
}

/**
 * @param {{ resourceId: number, resourceType: number, onComplete?: () => void }} options
 */
export async function openSeriesPickerDialog(options) {
  if (!requireLogin()) return;
  const userId = await resolveSessionUserId();
  if (userId == null) {
    notify('无法获取用户信息', 'warning');
    return;
  }
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('series-picker-dialog'));
  const listEl = document.getElementById('series-picker-list');
  if (!dialog || !listEl) return;
  listEl.innerHTML = '<p class="series-picker__empty">加载中…</p>';
  dialog.showModal();
  try {
    const page = await fetchUserSeriesList(userId, 1, 50);
    if (!page.items.length) {
      listEl.innerHTML = '<p class="series-picker__empty">暂无合集，可先新建一个</p>';
      return;
    }
    listEl.innerHTML = page.items
      .map(
        (series) => `
        <button type="button" class="series-picker__item" data-series-pick="${series.id}">
          <span class="series-picker__item-icon">${materialIcon('video_library')}</span>
          <span class="series-picker__item-main">
            <span class="series-picker__item-name">${escapeHtml(series.title)}</span>
            ${
              series.summary
                ? `<span class="series-picker__item-desc">${escapeHtml(series.summary)}</span>`
                : ''
            }
          </span>
        </button>`,
      )
      .join('');
    listEl.querySelectorAll('[data-series-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const seriesId = Number.parseInt(btn.getAttribute('data-series-pick') ?? '', 10);
        if (!Number.isFinite(seriesId)) return;
        btn.disabled = true;
        try {
          await addSeriesItem({
            seriesId,
            resourceId: options.resourceId,
            resourceType: options.resourceType,
          });
          notify('已加入合集', 'success');
          dialog.close();
          options.onComplete?.();
        } catch (err) {
          notify(err instanceof Error ? err.message : '加入失败', 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = `<p class="series-picker__empty">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`;
  }
}

/**
 * @param {import('./series-api.js').SeriesInfo} series
 * @param {() => void} [onComplete]
 */
export async function confirmDeleteSeries(series, onComplete) {
  const ok = await confirmAction({
    title: '删除合集',
    message: `确定删除合集「${series.title}」吗？合集内的投稿不会被删除。`,
    confirmText: '删除',
    variant: 'danger',
  });
  if (!ok) return;
  try {
    await deleteSeries(series.id);
    notify('合集已删除', 'success');
    onComplete?.();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败', 'error');
  }
}

/**
 * @param {HTMLElement} root
 * @param {{ manageable?: boolean, onChanged?: () => void }} [options]
 */
export function bindSeriesFolderList(root, options = {}) {
  root.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const openBtn = target.closest('[data-open-series]');
    if (openBtn instanceof HTMLElement) {
      const id = Number.parseInt(openBtn.getAttribute('data-open-series') ?? '', 10);
      if (Number.isFinite(id) && id > 0) {
        void import('./series-page.js').then((mod) => mod.openSeriesPage(id));
      }
      return;
    }
    const createBtn = target.closest('[data-create-series]');
    if (createBtn) {
      void openSeriesFormDialog({ mode: 'create', onComplete: options.onChanged });
      return;
    }
    const editBtn = target.closest('[data-series-edit]');
    if (editBtn instanceof HTMLElement && options.manageable !== false) {
      const id = Number.parseInt(editBtn.getAttribute('data-series-edit') ?? '', 10);
      if (!Number.isFinite(id)) return;
      void import('./series-api.js').then(async (mod) => {
        try {
          const series = await mod.fetchSeriesInfo(id);
          void openSeriesFormDialog({ mode: 'edit', series, onComplete: options.onChanged });
        } catch (err) {
          notify(err instanceof Error ? err.message : '加载失败', 'error');
        }
      });
      return;
    }
    const deleteBtn = target.closest('[data-series-delete]');
    if (deleteBtn instanceof HTMLElement && options.manageable !== false) {
      const id = Number.parseInt(deleteBtn.getAttribute('data-series-delete') ?? '', 10);
      if (!Number.isFinite(id)) return;
      void import('./series-api.js').then(async (mod) => {
        try {
          const series = await mod.fetchSeriesInfo(id);
          void confirmDeleteSeries(series, options.onChanged);
        } catch (err) {
          notify(err instanceof Error ? err.message : '加载失败', 'error');
        }
      });
    }
  });
}

/**
 * @param {{ seriesId: number, existingItems?: import('./series-api.js').SeriesItem[], onComplete?: () => void }} options
 */
export async function openSeriesContentPickerDialog(options) {
  if (!requireLogin()) return;
  const userId = await resolveSessionUserId();
  if (userId == null) {
    notify('无法获取用户信息', 'warning');
    return;
  }
  const dialog = /** @type {HTMLDialogElement | null} */ (
    document.getElementById('series-content-picker-dialog')
  );
  const listEl = document.getElementById('series-content-picker-list');
  if (!dialog || !listEl) return;
  listEl.innerHTML = '<p class="series-picker__empty">加载中…</p>';
  dialog.showModal();
  const existing = new Set(
    (options.existingItems ?? []).map((item) => `${item.resourceId}:${item.resourceType}`),
  );
  try {
    const [videos, articles] = await Promise.all([
      fetchUserVideos(userId, 0).catch(() => []),
      fetchUserArticles(userId, 0).catch(() => []),
    ]);
    const candidates = [
      ...articles.map((item) => ({
        resourceId: Number.parseInt(`${item.id}`, 10),
        resourceType: 0,
        title: item.title,
        cover: item.cover,
      })),
      ...videos.map((item) => ({
        resourceId: Number.parseInt(`${item.id}`, 10),
        resourceType: 1,
        title: item.title,
        cover: item.cover,
      })),
    ].filter(
      (item) =>
        Number.isFinite(item.resourceId) &&
        item.resourceId > 0 &&
        !existing.has(`${item.resourceId}:${item.resourceType}`),
    );
    if (!candidates.length) {
      listEl.innerHTML = '<p class="series-picker__empty">没有可添加的投稿，或已全部在合集中</p>';
      return;
    }
    listEl.innerHTML = candidates
      .map((item) => {
        const cover = item.cover ? mediaSrcForCover(item.cover) : null;
        const typeLabel = item.resourceType === 0 ? '文章' : '视频';
        return `
        <button type="button" class="series-content-picker__item" data-content-pick="${item.resourceId}:${item.resourceType}">
          ${
            cover
              ? `<img class="series-content-picker__cover" src="${escapeHtml(cover)}" alt="" />`
              : `<span class="series-content-picker__cover series-content-picker__cover--ph">${materialIcon(item.resourceType === 0 ? 'article' : 'play_circle')}</span>`
          }
          <span class="series-content-picker__main">
            <span class="series-content-picker__name">${escapeHtml(item.title)}</span>
            <span class="series-content-picker__meta">${typeLabel}</span>
          </span>
        </button>`;
      })
      .join('');
    listEl.querySelectorAll('[data-content-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const raw = btn.getAttribute('data-content-pick') ?? '';
        const [idText, typeText] = raw.split(':');
        const resourceId = Number.parseInt(idText, 10);
        const resourceType = Number.parseInt(typeText, 10);
        if (!Number.isFinite(resourceId) || resourceId <= 0) return;
        btn.disabled = true;
        try {
          await addSeriesItem({
            seriesId: options.seriesId,
            resourceId,
            resourceType,
          });
          notify('已添加到合集', 'success');
          dialog.close();
          options.onComplete?.();
        } catch (err) {
          notify(err instanceof Error ? err.message : '添加失败', 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = `<p class="series-picker__empty">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`;
  }
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   seriesId: number,
 *   items: import('./series-api.js').SeriesItem[],
 *   onChanged?: () => void,
 *   getContext?: () => { seriesId: number, items: import('./series-api.js').SeriesItem[] },
 * }} options
 */
export function bindSeriesGridEvents(root, options) {
  root.addEventListener('click', (event) => {
    const ctx = options.getContext?.() ?? {
      seriesId: options.seriesId,
      items: options.items,
    };
    const target = /** @type {HTMLElement} */ (event.target);
    const card = target.closest('.video-card');
    if (card && !target.closest('.series-grid-item__actions')) {
      const item = previewFromCard(/** @type {HTMLElement} */ (card));
      if (item) void openContentDetail(item);
      return;
    }
    const removeBtn = target.closest('[data-series-remove]');
    if (removeBtn instanceof HTMLElement) {
      const raw = removeBtn.getAttribute('data-series-remove') ?? '';
      const [idText, typeText] = raw.split(':');
      const resourceId = Number.parseInt(idText, 10);
      const resourceType = Number.parseInt(typeText, 10);
      const item = ctx.items.find(
        (entry) => entry.resourceId === resourceId && entry.resourceType === resourceType,
      );
      if (!item || ctx.seriesId <= 0) return;
      void confirmRemoveSeriesItem({ seriesId: ctx.seriesId, item, onComplete: options.onChanged });
      return;
    }
    const upBtn = target.closest('[data-series-move-up]');
    if (upBtn instanceof HTMLElement) {
      const raw = upBtn.getAttribute('data-series-move-up') ?? '';
      const [idText, typeText] = raw.split(':');
      const resourceId = Number.parseInt(idText, 10);
      const resourceType = Number.parseInt(typeText, 10);
      const item = ctx.items.find(
        (entry) => entry.resourceId === resourceId && entry.resourceType === resourceType,
      );
      if (!item || ctx.seriesId <= 0) return;
      void moveSeriesItemInList({
        seriesId: ctx.seriesId,
        items: ctx.items,
        item,
        direction: 'up',
        onComplete: options.onChanged,
      });
      return;
    }
    const downBtn = target.closest('[data-series-move-down]');
    if (downBtn instanceof HTMLElement) {
      const raw = downBtn.getAttribute('data-series-move-down') ?? '';
      const [idText, typeText] = raw.split(':');
      const resourceId = Number.parseInt(idText, 10);
      const resourceType = Number.parseInt(typeText, 10);
      const item = ctx.items.find(
        (entry) => entry.resourceId === resourceId && entry.resourceType === resourceType,
      );
      if (!item || ctx.seriesId <= 0) return;
      void moveSeriesItemInList({
        seriesId: ctx.seriesId,
        items: ctx.items,
        item,
        direction: 'down',
        onComplete: options.onChanged,
      });
    }
  });
}

let pickerBound = false;

export function bindSeriesPickerDialog() {
  if (pickerBound) return;
  pickerBound = true;
  document.getElementById('series-picker-close')?.addEventListener('click', () => {
    document.getElementById('series-picker-dialog')?.close();
  });
  document.getElementById('series-picker-create')?.addEventListener('click', () => {
    void openSeriesFormDialog({
      mode: 'create',
      onComplete: () => {
        document.getElementById('series-picker-dialog')?.close();
      },
    });
  });
  document.getElementById('series-content-picker-close')?.addEventListener('click', () => {
    document.getElementById('series-content-picker-dialog')?.close();
  });
}

export { formatSeriesDate, escapeHtml as seriesEscapeHtml };
