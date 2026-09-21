import { materialIcon } from './icons.js';
import { notify } from './notice-ui.js';
import { requireLogin } from './login-ui.js';
import { confirmAction } from './confirm-dialog.js';
import {
  addFavorite,
  createFavoriteFolder,
  DEFAULT_FAVORITE_FOLDER_STATUS,
  deleteFavoriteFolder,
  favoriteFolderStatusLabel,
  fetchFavoriteFolderList,
  findFavoriteFoldersForResource,
  FAVORITE_FOLDER_STATUS,
  normalizeFavoriteFolderStatus,
  removeFavorite,
  resolveFavoriteStatus,
  resolveMineUserId,
  updateFavoriteFolder,
} from './favorite-api.js';

/** @typedef {import('./favorite-api.js').FavoriteFolder} FavoriteFolder */

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

/** @type {{ resourceId: string, resourceType: number, onChange: ((next: { favorited: boolean, listId: number | null }) => void) | null }} */
let pickerContext = {
  resourceId: '',
  resourceType: 0,
  onChange: null,
};

/** @type {FavoriteFolder[]} */
let pickerFolders = [];

/** @type {Set<number>} */
let pickerMemberIds = new Set();

/** @type {{ mode: 'create' | 'edit', listId: number | null, onComplete: (() => void) | null }} */
let folderFormContext = {
  mode: 'create',
  listId: null,
  onComplete: null,
};

function getDialog() {
  return /** @type {HTMLDialogElement | null} */ (document.getElementById('favorite-picker-dialog'));
}

function getListEl() {
  return document.getElementById('favorite-picker-list');
}

function getTitleEl() {
  return document.getElementById('favorite-picker-title');
}

function getHintEl() {
  return document.getElementById('favorite-picker-hint');
}

function setPickerLoading(loading) {
  const dialog = getDialog();
  dialog?.classList.toggle('favorite-picker--loading', loading);
}

function notifyFavoriteChanged() {
  window.dispatchEvent(new CustomEvent('mfuns:favorite-changed'));
}

/**
 * @param {number} n
 */
function formatCount(n) {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(Math.trunc(n));
}

/**
 * @param {FavoriteFolder} folder
 * @param {{ openAttr: string, openValue: number, manageable?: boolean }} options
 */
export function favoriteFolderRowHtml(folder, options) {
  const manageable = options.manageable !== false;
  const statusTag =
    manageable && folder.status !== FAVORITE_FOLDER_STATUS.PUBLIC
      ? `<span class="mine-favorite-folder__status">${escapeHtml(favoriteFolderStatusLabel(folder.status))}</span>`
      : '';
  const actionsHtml = manageable
    ? `<div class="mine-favorite-folder__actions">
        <button type="button" class="mine-favorite-folder__action" data-favorite-folder-edit="${folder.id}" aria-label="编辑收藏夹" title="编辑">
          ${materialIcon('edit')}
        </button>
        <button type="button" class="mine-favorite-folder__action mine-favorite-folder__action--danger" data-favorite-folder-delete="${folder.id}" aria-label="删除收藏夹" title="删除">
          ${materialIcon('delete_outline')}
        </button>
      </div>`
    : '';
  return `
    <div class="mine-favorite-folder-wrap${manageable ? '' : ' mine-favorite-folder-wrap--readonly'}">
      <button type="button" class="mine-favorite-folder" ${options.openAttr}="${options.openValue}">
        <span class="mine-favorite-folder__icon">${materialIcon('folder')}</span>
        <span class="mine-favorite-folder__main">
          <span class="mine-favorite-folder__name">
            ${escapeHtml(folder.name)}
            ${statusTag}
          </span>
          ${
            folder.desc
              ? `<span class="mine-favorite-folder__desc">${escapeHtml(folder.desc)}</span>`
              : ''
          }
        </span>
        <span class="mine-favorite-folder__count">${formatCount(folder.count)}</span>
        ${materialIcon('chevron_right', 'mine-favorite-folder__chevron')}
      </button>
      ${actionsHtml}
    </div>`;
}

/**
 * @param {string} [extraClass]
 */
export function favoriteFolderCreateButtonHtml(extraClass = '') {
  const cls = ['favorite-folder-create-btn', extraClass].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" data-create-favorite-folder>
    ${materialIcon('add', 'favorite-folder-create-btn__icon')}
    <span>新建收藏夹</span>
  </button>`;
}

/**
 * @param {FavoriteFolder[]} folders
 * @param {Set<number>} memberIds
 */
function renderPickerList(folders, memberIds) {
  const list = getListEl();
  if (!list) return;
  if (folders.length === 0) {
    list.innerHTML = '<p class="favorite-picker__empty">暂无收藏夹，可先新建一个</p>';
    return;
  }
  list.innerHTML = folders
    .map((folder) => {
      const active = memberIds.has(folder.id);
      return `
      <button type="button" class="favorite-picker__item ${active ? 'is-active' : ''}" data-favorite-list-id="${folder.id}">
        <span class="favorite-picker__item-icon">${materialIcon(active ? 'folder_special' : 'folder')}</span>
        <span class="favorite-picker__item-main">
          <span class="favorite-picker__item-name">${escapeHtml(folder.name)}</span>
          ${
            folder.desc
              ? `<span class="favorite-picker__item-desc">${escapeHtml(folder.desc)}</span>`
              : ''
          }
        </span>
        <span class="favorite-picker__item-count">${folder.count}</span>
        ${active ? materialIcon('check', 'favorite-picker__item-check') : ''}
      </button>`;
    })
    .join('');

  list.querySelectorAll('[data-favorite-list-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void togglePickerFolder(Number(btn.getAttribute('data-favorite-list-id')));
    });
  });
}

async function syncPickerChangeState() {
  const userId = resolveMineUserId(null);
  if (userId == null || !pickerContext.resourceId) return;
  const status = await resolveFavoriteStatus(userId, pickerContext.resourceId, pickerContext.resourceType);
  pickerMemberIds = status.folderIds;
  pickerContext.onChange?.({
    favorited: status.favorited,
    listId: status.listId,
  });
  notifyFavoriteChanged();
}

/**
 * @param {number} listId
 */
async function togglePickerFolder(listId) {
  if (!Number.isFinite(listId) || listId <= 0 || !pickerContext.resourceId) return;
  setPickerLoading(true);
  try {
    if (pickerMemberIds.has(listId)) {
      await removeFavorite(listId, pickerContext.resourceId, pickerContext.resourceType);
      pickerMemberIds.delete(listId);
    } else {
      await addFavorite(listId, pickerContext.resourceId, pickerContext.resourceType);
      pickerMemberIds.add(listId);
    }
    renderPickerList(pickerFolders, pickerMemberIds);
    await syncPickerChangeState();
  } catch (err) {
    notify(err instanceof Error ? err.message : '操作失败', 'error');
  } finally {
    setPickerLoading(false);
  }
}

async function loadPickerFolders() {
  const userId = resolveMineUserId(null);
  if (userId == null) {
    pickerFolders = [];
    pickerMemberIds = new Set();
    renderPickerList([], pickerMemberIds);
    return;
  }
  setPickerLoading(true);
  try {
    const [folders, memberIds] = await Promise.all([
      fetchFavoriteFolderList(userId),
      findFavoriteFoldersForResource(userId, pickerContext.resourceId, pickerContext.resourceType),
    ]);
    pickerFolders = folders;
    pickerMemberIds = memberIds;
    renderPickerList(pickerFolders, pickerMemberIds);
  } catch (err) {
    const list = getListEl();
    if (list) {
      list.innerHTML = `<p class="favorite-picker__empty">${escapeHtml(err instanceof Error ? err.message : '加载失败')}</p>`;
    }
  } finally {
    setPickerLoading(false);
  }
}

/**
 * @param {{ resourceId: string | number, resourceType: number, onChange?: (next: { favorited: boolean, listId: number | null }) => void }} options
 */
export function openFavoriteManager(options) {
  if (!requireLogin()) return;
  pickerContext = {
    resourceId: String(options.resourceId),
    resourceType: options.resourceType,
    onChange: options.onChange ?? null,
  };
  if (getTitleEl()) {
    getTitleEl().textContent = '收藏到收藏夹';
  }
  if (getHintEl()) {
    getHintEl().textContent = '点击加入或移出；同一内容可存在于多个收藏夹';
  }
  const dialog = getDialog();
  if (!dialog) return;
  dialog.showModal();
  void loadPickerFolders();
}

/** @deprecated 使用 openFavoriteManager */
export function openFavoritePicker(options) {
  openFavoriteManager(options);
}

/**
 * @param {{
 *   resourceId: string | number,
 *   resourceType: number,
 *   favorited: boolean,
 *   listId: number | null,
 *   onChange: (next: { favorited: boolean, listId: number | null }) => void,
 * }} options
 */
export function toggleResourceFavorite(options) {
  if (!requireLogin()) return;
  openFavoriteManager({
    resourceId: options.resourceId,
    resourceType: options.resourceType,
    onChange: options.onChange,
  });
}

function getFolderFormDialog() {
  return /** @type {HTMLDialogElement | null} */ (
    document.getElementById('favorite-folder-form-dialog')
  );
}

function setFolderFormLoading(loading) {
  getFolderFormDialog()?.classList.toggle('favorite-folder-create--loading', loading);
}

/**
 * @param {number | null | undefined} status
 */
function setFolderFormStatus(status) {
  const normalized = normalizeFavoriteFolderStatus(status);
  document.querySelectorAll('input[name="favorite-folder-status"]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.checked = Number(input.value) === normalized;
  });
}

function readFolderFormStatus() {
  const checked = document.querySelector('input[name="favorite-folder-status"]:checked');
  if (!(checked instanceof HTMLInputElement)) {
    return DEFAULT_FAVORITE_FOLDER_STATUS;
  }
  return normalizeFavoriteFolderStatus(checked.value);
}

/**
 * @param {{ onCreated?: (folder: FavoriteFolder) => void }} [options]
 */
export function openCreateFavoriteFolderDialog(options = {}) {
  openFavoriteFolderFormDialog({
    mode: 'create',
    onComplete: () => options.onCreated?.(),
  });
}

/**
 * @param {{ folder: FavoriteFolder, onComplete?: () => void }} options
 */
export function openEditFavoriteFolderDialog(options) {
  openFavoriteFolderFormDialog({
    mode: 'edit',
    folder: options.folder,
    onComplete: options.onComplete ?? null,
  });
}

/**
 * @param {{ mode: 'create' | 'edit', folder?: FavoriteFolder, onComplete?: (() => void) | null }} options
 */
export function openFavoriteFolderFormDialog(options) {
  if (!requireLogin()) return;
  folderFormContext = {
    mode: options.mode,
    listId: options.folder?.id ?? null,
    onComplete: options.onComplete ?? null,
  };

  const dialog = getFolderFormDialog();
  const form = document.getElementById('favorite-folder-form');
  const titleEl = document.getElementById('favorite-folder-form-title');
  const submitEl = document.getElementById('favorite-folder-form-submit');
  const nameInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('favorite-folder-form-name')
  );
  const descInput = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('favorite-folder-form-desc')
  );
  if (!dialog || !form || !nameInput || !titleEl || !submitEl) return;

  if (options.mode === 'edit' && options.folder) {
    titleEl.textContent = '编辑收藏夹';
    submitEl.textContent = '保存';
    nameInput.value = options.folder.name;
    if (descInput) descInput.value = options.folder.desc ?? '';
    setFolderFormStatus(options.folder.status);
  } else {
    titleEl.textContent = '新建收藏夹';
    submitEl.textContent = '创建';
    form.reset();
    if (descInput) descInput.value = '';
    setFolderFormStatus(DEFAULT_FAVORITE_FOLDER_STATUS);
  }

  dialog.showModal();
  window.requestAnimationFrame(() => nameInput.focus());
}

async function submitFavoriteFolderForm(event) {
  event.preventDefault();
  const nameInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('favorite-folder-form-name')
  );
  const descInput = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('favorite-folder-form-desc')
  );
  if (!nameInput) return;
  const name = nameInput.value.trim();
  if (!name) {
    notify('请填写收藏夹名称', 'warning');
    nameInput.focus();
    return;
  }
  const desc = descInput?.value ?? '';
  const status = readFolderFormStatus();
  setFolderFormLoading(true);
  try {
    if (folderFormContext.mode === 'edit' && folderFormContext.listId != null) {
      await updateFavoriteFolder(folderFormContext.listId, name, desc, status);
    } else {
      await createFavoriteFolder(name, desc, status);
    }
    folderFormContext.onComplete?.();
    folderFormContext.onComplete = null;
    getFolderFormDialog()?.close();
    notifyFavoriteChanged();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败', 'error');
  } finally {
    setFolderFormLoading(false);
  }
}

/**
 * @param {FavoriteFolder} folder
 * @param {() => void} [onComplete]
 */
export async function confirmDeleteFavoriteFolder(folder, onComplete) {
  if (!requireLogin()) return;
  const message =
    folder.count > 0
      ? `删除后，收藏夹「${folder.name}」及其中的 ${folder.count} 个收藏将无法恢复。`
      : `删除后，收藏夹「${folder.name}」将无法恢复。`;
  const confirmed = await confirmAction({
    title: '删除收藏夹',
    message,
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) return;
  try {
    await deleteFavoriteFolder(folder.id);
    onComplete?.();
    notifyFavoriteChanged();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败', 'error');
  }
}

/**
 * @param {number} listId
 * @param {import('./content-api.js').ContentPreview} item
 * @param {() => void} [onComplete]
 */
export async function removeItemFromFavoriteFolder(listId, item, onComplete) {
  if (!requireLogin()) return;
  const confirmed = await confirmAction({
    title: '移出收藏',
    message: `确定从当前收藏夹移出「${item.title}」？`,
    confirmText: '移出',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) return;
  try {
    await removeFavorite(listId, item.id, item.type);
    onComplete?.();
    notifyFavoriteChanged();
  } catch (err) {
    notify(err instanceof Error ? err.message : '移出失败', 'error');
  }
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   folders: FavoriteFolder[],
 *   openAttr: string,
 *   onOpen: (folder: FavoriteFolder) => void,
 *   onRefresh: () => void,
 *   manageable?: boolean,
 * }} options
 */
export function bindFavoriteFolderListActions(root, options) {
  const manageable = options.manageable !== false;

  if (manageable) {
    root.querySelectorAll('[data-create-favorite-folder]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openCreateFavoriteFolderDialog({ onCreated: options.onRefresh });
      });
    });
  }

  root.querySelectorAll(`[${options.openAttr}]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute(options.openAttr));
      const folder = options.folders.find((entry) => entry.id === id);
      if (!folder) return;
      options.onOpen(folder);
    });
  });

  if (manageable) {
    root.querySelectorAll('[data-favorite-folder-edit]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = Number(btn.getAttribute('data-favorite-folder-edit'));
        const folder = options.folders.find((entry) => entry.id === id);
        if (!folder) return;
        openEditFavoriteFolderDialog({ folder, onComplete: options.onRefresh });
      });
    });

    root.querySelectorAll('[data-favorite-folder-delete]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = Number(btn.getAttribute('data-favorite-folder-delete'));
        const folder = options.folders.find((entry) => entry.id === id);
        if (!folder) return;
        void confirmDeleteFavoriteFolder(folder, options.onRefresh);
      });
    });
  }
}

export function bindFavoritePicker() {
  const dialog = getDialog();
  document.getElementById('favorite-picker-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog?.addEventListener('close', () => {
    void syncPickerChangeState();
  });

  document.getElementById('favorite-picker-create')?.addEventListener('click', () => {
    openCreateFavoriteFolderDialog({
      onCreated: () => {
        void loadPickerFolders();
      },
    });
  });

  const formDialog = getFolderFormDialog();
  document
    .getElementById('favorite-folder-form-cancel')
    ?.addEventListener('click', () => formDialog?.close());
  document.getElementById('favorite-folder-form-close')?.addEventListener('click', () =>
    formDialog?.close(),
  );
  formDialog?.addEventListener('click', (event) => {
    if (event.target === formDialog) formDialog.close();
  });
  formDialog?.addEventListener('close', () => {
    folderFormContext.onComplete = null;
    setFolderFormLoading(false);
  });
  document.getElementById('favorite-folder-form')?.addEventListener('submit', (event) => {
    void submitFavoriteFolderForm(event);
  });
}
