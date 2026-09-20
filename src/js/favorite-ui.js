import { materialIcon } from './icons.js';
import { requireLogin } from './login-ui.js';
import {
  addFavorite,
  createFavoriteFolder,
  fetchFavoriteFolderList,
  fetchFavoriteStatus,
  removeFavorite,
  resolveMineUserId,
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

/** @type {{ resourceId: string, resourceType: number, onComplete: ((listId: number) => void) | null }} */
let pickerContext = {
  resourceId: '',
  resourceType: 0,
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

function setPickerLoading(loading) {
  const dialog = getDialog();
  dialog?.classList.toggle('favorite-picker--loading', loading);
}

/**
 * @param {FavoriteFolder[]} folders
 */
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

function renderPickerList(folders) {
  const list = getListEl();
  if (!list) return;
  if (folders.length === 0) {
    list.innerHTML = '<p class="favorite-picker__empty">暂无收藏夹，可先新建一个</p>';
    return;
  }
  list.innerHTML = folders
    .map(
      (folder) => `
      <button type="button" class="favorite-picker__item" data-favorite-list-id="${folder.id}">
        <span class="favorite-picker__item-icon">${materialIcon('folder')}</span>
        <span class="favorite-picker__item-main">
          <span class="favorite-picker__item-name">${escapeHtml(folder.name)}</span>
          ${
            folder.desc
              ? `<span class="favorite-picker__item-desc">${escapeHtml(folder.desc)}</span>`
              : ''
          }
        </span>
        <span class="favorite-picker__item-count">${folder.count}</span>
      </button>`,
    )
    .join('');

  list.querySelectorAll('[data-favorite-list-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void pickFolder(Number(btn.getAttribute('data-favorite-list-id')));
    });
  });
}

/**
 * @param {number} listId
 */
async function pickFolder(listId) {
  if (!Number.isFinite(listId) || listId <= 0 || !pickerContext.resourceId) return;
  setPickerLoading(true);
  try {
    await addFavorite(listId, pickerContext.resourceId, pickerContext.resourceType);
    pickerContext.onComplete?.(listId);
    getDialog()?.close();
  } catch (err) {
    alert(err instanceof Error ? err.message : '收藏失败');
  } finally {
    setPickerLoading(false);
  }
}

async function loadPickerFolders() {
  const userId = resolveMineUserId(null);
  if (userId == null) {
    renderPickerList([]);
    return;
  }
  setPickerLoading(true);
  try {
    const folders = await fetchFavoriteFolderList(userId);
    renderPickerList(folders);
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
 * @param {{ resourceId: string | number, resourceType: number, onComplete?: (listId: number) => void }} options
 */
export function openFavoritePicker(options) {
  if (!requireLogin()) return;
  pickerContext = {
    resourceId: String(options.resourceId),
    resourceType: options.resourceType,
    onComplete: options.onComplete ?? null,
  };
  if (getTitleEl()) {
    getTitleEl().textContent = '选择收藏夹';
  }
  const dialog = getDialog();
  if (!dialog) return;
  dialog.showModal();
  void loadPickerFolders();
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
export async function toggleResourceFavorite(options) {
  if (!requireLogin()) return;
  const resourceId = String(options.resourceId);
  const { resourceType, favorited, listId, onChange } = options;

  if (favorited) {
    let targetListId = listId;
    if (targetListId == null) {
      const status = await fetchFavoriteStatus(resourceId, resourceType).catch(() => ({
        favorited: true,
        listId: null,
      }));
      targetListId = status.listId;
    }
    if (targetListId == null) {
      alert('无法确定收藏夹，请在「我的收藏」中管理');
      return;
    }
    try {
      await removeFavorite(targetListId, resourceId, resourceType);
      onChange({ favorited: false, listId: null });
    } catch (err) {
      alert(err instanceof Error ? err.message : '取消收藏失败');
    }
    return;
  }

  openFavoritePicker({
    resourceId,
    resourceType,
    onComplete: (pickedListId) => {
      onChange({ favorited: true, listId: pickedListId });
    },
  });
}

/** @type {((folder: FavoriteFolder) => void) | null} */
let createFolderOnComplete = null;

function getCreateDialog() {
  return /** @type {HTMLDialogElement | null} */ (
    document.getElementById('favorite-folder-create-dialog')
  );
}

function setCreateDialogLoading(loading) {
  getCreateDialog()?.classList.toggle('favorite-folder-create--loading', loading);
}

/**
 * @param {{ onCreated?: (folder: FavoriteFolder) => void }} [options]
 */
export function openCreateFavoriteFolderDialog(options = {}) {
  if (!requireLogin()) return;
  createFolderOnComplete = options.onCreated ?? null;
  const dialog = getCreateDialog();
  const form = document.getElementById('favorite-folder-create-form');
  const nameInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('favorite-folder-create-name')
  );
  const descInput = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('favorite-folder-create-desc')
  );
  if (!dialog || !form || !nameInput) return;
  form.reset();
  if (descInput) descInput.value = '';
  dialog.showModal();
  window.requestAnimationFrame(() => nameInput.focus());
}

async function submitCreateFavoriteFolder(event) {
  event.preventDefault();
  const nameInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('favorite-folder-create-name')
  );
  const descInput = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('favorite-folder-create-desc')
  );
  if (!nameInput) return;
  const name = nameInput.value.trim();
  if (!name) {
    alert('请填写收藏夹名称');
    nameInput.focus();
    return;
  }
  setCreateDialogLoading(true);
  try {
    const folder = await createFavoriteFolder(name, descInput?.value ?? '');
    createFolderOnComplete?.(folder);
    createFolderOnComplete = null;
    getCreateDialog()?.close();
  } catch (err) {
    alert(err instanceof Error ? err.message : '创建失败');
  } finally {
    setCreateDialogLoading(false);
  }
}

export function bindFavoritePicker() {
  const dialog = getDialog();
  document.getElementById('favorite-picker-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  document.getElementById('favorite-picker-create')?.addEventListener('click', () => {
    openCreateFavoriteFolderDialog({
      onCreated: (folder) => {
        void loadPickerFolders().then(() => {
          if (pickerContext.resourceId && folder.id > 0) {
            void pickFolder(folder.id);
          }
        });
      },
    });
  });

  const createDialog = getCreateDialog();
  document
    .getElementById('favorite-folder-create-cancel')
    ?.addEventListener('click', () => createDialog?.close());
  document.getElementById('favorite-folder-create-close')?.addEventListener('click', () =>
    createDialog?.close(),
  );
  createDialog?.addEventListener('click', (event) => {
    if (event.target === createDialog) createDialog.close();
  });
  createDialog?.addEventListener('close', () => {
    createFolderOnComplete = null;
    setCreateDialogLoading(false);
  });
  document
    .getElementById('favorite-folder-create-form')
    ?.addEventListener('submit', (event) => {
      void submitCreateFavoriteFolder(event);
    });
}
