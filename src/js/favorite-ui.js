import { materialIcon } from './icons.js';
import { requireLogin } from './login-ui.js';
import {
  addFavorite,
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
function renderPickerList(folders) {
  const list = getListEl();
  if (!list) return;
  if (folders.length === 0) {
    list.innerHTML = '<p class="favorite-picker__empty">暂无收藏夹</p>';
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

export function bindFavoritePicker() {
  const dialog = getDialog();
  document.getElementById('favorite-picker-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
