import { materialIcon } from './icons.js';
import { fetchCategories, mediaSrcForCover, resolveCoverUrl } from './content-api.js';
import { requireLogin } from './login-ui.js';
import { setPage } from './pages.js';
import { mountRichContent } from './rich-content.js';
import {
  ensureContributeRichEditor,
  getArticleMarkdownFromEditor,
  getVideoQuillJsonFromEditor,
  isContributeRichEditorEmpty,
  loadContributeRichEditorContent,
  resetContributeRichEditor,
  setContributeRichEditorImageUpload,
  syncContributeRichEditorLayout,
} from './rich-editor.js';
import { uploadCommentImage } from './video-api.js';
import {
  completeVideoUpload,
  createArticleSubmission,
  createVideoSubmission,
  deleteSubmission,
  fetchSubmissionDetail,
  fetchSubmissionsPage,
  formatSubmissionTime,
  getVideoUploadAuth,
  leafCategories,
  submissionStatusLabel,
  updateArticleSubmission,
  updateVideoSubmission,
} from './contribute-api.js';
import { uploadVideoToOss } from './video-uploader.js';
import {
  bindContributeFeedSection,
  onContributeFeedSectionEnter,
  openFeedComposeView,
} from './contribute-feed-section.js';
import {
  bindContributePublishedSection,
  onContributePublishedSectionEnter,
} from './contribute-published-section.js';

/** @typedef {import('./contribute-api.js').SubmissionItem} SubmissionItem */
/** @typedef {import('./contribute-api.js').SubmissionDetail} SubmissionDetail */
/** @typedef {import('./contribute-api.js').SubmissionVideoPart} SubmissionVideoPart */

const PAGE_SIZE = 20;

/** @type {0 | 1} */
let listTab = 0;

/** @type {'hub' | 'editor' | 'detail' | 'feed-compose'} */
let view = 'hub';

/** @type {'submission' | 'feed' | 'published'} */
let hubSection = 'submission';

/** @type {SubmissionItem[]} */
let items = [];
let listPage = 1;
let listHasMore = true;
let listLoading = false;
let listLoadingMore = false;
/** @type {unknown} */
let listError = null;
/** @type {unknown} */
let listLoadMoreError = null;
let listGeneration = 0;

/** @type {number | null} */
let editorContributeId = null;
/** @type {0 | 1} */
let editorType = 0;
let editorSaving = false;
let editorUploadingVideo = false;
let editorUploadProgress = 0;
let editorUploadingCover = false;
let editorCopyright = 2;
/** @type {number | null} */
let editorCategoryId = null;
/** @type {string[]} */
let editorTags = [];
/** @type {SubmissionVideoPart[]} */
let editorVideoParts = [];
/** @type {number | null} */
let editorReplacingPartIndex = null;

/** @type {number | null} */
let detailContributeId = null;
/** @type {0 | 1 | null} */
let detailType = null;
/** @type {SubmissionDetail | null} */
let detailData = null;
let detailLoading = false;
/** @type {unknown} */
let detailError = null;

/** @type {import('./content-api.js').CategoryNode[]} */
let categories = [];
let categoriesLoaded = false;

let bound = false;

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
 * @param {string} path
 */
function absoluteMediaUrl(path) {
  const resolved = resolveCoverUrl(path);
  return resolved ?? path;
}

function getRoot() {
  return document.getElementById('contribute-page-root');
}

function showView(next) {
  view = next;
  document.getElementById('contribute-hub-view')?.toggleAttribute('hidden', next !== 'hub');
  document.getElementById('contribute-editor-view')?.toggleAttribute('hidden', next !== 'editor');
  document.getElementById('contribute-detail-view')?.toggleAttribute('hidden', next !== 'detail');
  document.getElementById('contribute-feed-compose-view')?.toggleAttribute('hidden', next !== 'feed-compose');
}

function showHubSection(section) {
  hubSection = section;
  document.querySelectorAll('[data-contribute-section]').forEach((el) => {
    el.classList.toggle('is-active', el.getAttribute('data-contribute-section') === section);
  });
  document.getElementById('contribute-submission-section')?.toggleAttribute('hidden', section !== 'submission');
  document.getElementById('contribute-feed-section')?.toggleAttribute('hidden', section !== 'feed');
  document.getElementById('contribute-published-section')?.toggleAttribute('hidden', section !== 'published');
  if (section === 'submission') void loadListFirstPage();
  else if (section === 'feed') onContributeFeedSectionEnter();
  else if (section === 'published') onContributePublishedSectionEnter();
}

function renderListTabs() {
  document.querySelectorAll('[data-contribute-tab]').forEach((el) => {
    const tab = Number.parseInt(el.getAttribute('data-contribute-tab') ?? '0', 10);
    el.classList.toggle('is-active', tab === listTab);
    el.setAttribute('aria-selected', tab === listTab ? 'true' : 'false');
  });
}

/**
 * @param {SubmissionItem} item
 */
function renderSubmissionCard(item) {
  const coverSrc = item.cover ? mediaSrcForCover(item.cover) : '';
  const timeText = item.createdAt ? formatSubmissionTime(item.createdAt) : '';
  return `
    <article class="contribute-card" data-contribute-id="${item.id}">
      <button type="button" class="contribute-card__main" data-action="open-detail" data-id="${item.id}">
        <span class="contribute-card__cover">
          ${
            coverSrc
              ? `<img src="${escapeHtml(coverSrc)}" alt="" loading="lazy" />`
              : materialIcon('image', 'contribute-card__cover-icon')
          }
        </span>
        <span class="contribute-card__body">
          <h3 class="contribute-card__title">${escapeHtml(item.title || '未命名投稿')}</h3>
          <span class="contribute-card__meta">
            <span class="contribute-card__status">${escapeHtml(submissionStatusLabel(item.status))}</span>
            ${timeText ? `<span class="contribute-card__time">${escapeHtml(timeText)}</span>` : ''}
          </span>
        </span>
      </button>
      <div class="contribute-card__actions">
        <button type="button" class="contribute-card__action" data-action="edit-item" data-id="${item.id}" title="编辑">
          ${materialIcon('edit', 'contribute-card__action-icon')}
        </button>
        <button type="button" class="contribute-card__action contribute-card__action--danger" data-action="delete-item" data-id="${item.id}" title="删除">
          ${materialIcon('delete', 'contribute-card__action-icon')}
        </button>
      </div>
    </article>`;
}

function renderListBody() {
  const listEl = document.getElementById('contribute-list');
  const footerEl = document.getElementById('contribute-list-footer');
  if (!listEl || !footerEl) return;

  if (listLoading && items.length === 0) {
    listEl.innerHTML = '<p class="contribute-empty">加载中…</p>';
    footerEl.hidden = true;
    return;
  }

  if (listError && items.length === 0) {
    listEl.innerHTML = `
      <div class="contribute-empty">
        <p>加载失败：${escapeHtml(listError instanceof Error ? listError.message : `${listError}`)}</p>
        <button type="button" class="btn-accent" id="contribute-retry-list">重试</button>
      </div>`;
    footerEl.hidden = true;
    return;
  }

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="contribute-empty">
        ${materialIcon('edit_note', 'contribute-empty__icon')}
        <p>还没有投稿</p>
        <button type="button" class="btn-accent" id="contribute-create-first">发布第一篇投稿</button>
      </div>`;
    footerEl.hidden = true;
    return;
  }

  listEl.innerHTML = items.map(renderSubmissionCard).join('');
  footerEl.hidden = false;
  if (listLoadingMore) {
    footerEl.textContent = '加载中…';
  } else if (listLoadMoreError) {
    footerEl.innerHTML = `<button type="button" class="contribute-list-footer__btn" id="contribute-load-more">加载更多失败，点击重试</button>`;
  } else if (listHasMore) {
    footerEl.innerHTML = `<button type="button" class="contribute-list-footer__btn" id="contribute-load-more">加载更多</button>`;
  } else {
    footerEl.textContent = '已加载全部投稿';
  }
}

async function loadListFirstPage() {
  const generation = ++listGeneration;
  const type = listTab;
  listLoading = true;
  listError = null;
  listLoadMoreError = null;
  listPage = 1;
  listHasMore = true;
  renderListBody();

  try {
    const result = await fetchSubmissionsPage(type, 1, PAGE_SIZE);
    if (generation !== listGeneration || type !== listTab) return;
    items = result.items;
    listPage = 2;
    listHasMore = result.hasMore;
  } catch (err) {
    if (generation !== listGeneration || type !== listTab) return;
    if (items.length === 0) listError = err;
  } finally {
    if (generation === listGeneration && type === listTab) {
      listLoading = false;
      renderListBody();
    }
  }
}

async function loadListMore() {
  if (listLoading || listLoadingMore || !listHasMore) return;
  const generation = listGeneration;
  const type = listTab;
  const page = listPage;
  listLoadingMore = true;
  listLoadMoreError = null;
  renderListBody();

  try {
    const result = await fetchSubmissionsPage(type, page, PAGE_SIZE);
    if (generation !== listGeneration || type !== listTab) return;
    const known = new Set(items.map((item) => item.id));
    items = [...items, ...result.items.filter((item) => !known.has(item.id))];
    listPage = page + 1;
    listHasMore = result.hasMore;
  } catch (err) {
    if (generation !== listGeneration || type !== listTab) return;
    listLoadMoreError = err;
  } finally {
    if (generation === listGeneration && type === listTab) {
      listLoadingMore = false;
      renderListBody();
    }
  }
}

function onListScroll() {
  const scrollEl = document.getElementById('contribute-list-scroll');
  if (!scrollEl) return;
  const remaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
  if (remaining < 320) void loadListMore();
}

function resetEditorState() {
  editorContributeId = null;
  editorType = listTab;
  editorSaving = false;
  editorUploadingVideo = false;
  editorUploadProgress = 0;
  editorUploadingCover = false;
  editorCopyright = editorType === 1 ? 0 : 2;
  editorCategoryId = null;
  editorTags = [];
  editorVideoParts = [];
  editorReplacingPartIndex = null;
}

/**
 * @param {0 | 1} type
 * @param {number | null} [contributeId]
 */
async function openEditor(type, contributeId = null) {
  await ensureCategories();
  resetEditorState();
  editorType = type;
  editorContributeId = contributeId;
  showView('editor');

  const titleEl = document.getElementById('contribute-editor-title-input');
  const coverEl = document.getElementById('contribute-editor-cover');
  const tagInput = document.getElementById('contribute-editor-tag-input');
  const draftEl = document.getElementById('contribute-editor-draft');
  if (titleEl) titleEl.value = '';
  if (coverEl) coverEl.value = '';
  await resetContributeRichEditor();
  if (tagInput) tagInput.value = '';
  if (draftEl) draftEl.checked = false;
  const copyrightEl = document.getElementById('contribute-editor-copyright');
  if (copyrightEl) copyrightEl.value = String(editorCopyright);

  const headingEl = document.getElementById('contribute-editor-heading');
  if (headingEl) {
    if (contributeId == null) {
      headingEl.textContent = type === 1 ? '发布视频' : '发布文章';
    } else {
      headingEl.textContent = type === 1 ? '编辑视频投稿' : '编辑文章投稿';
    }
  }
  await syncEditorLayout(type);
  await ensureContributeRichEditor();

  renderEditorTags();
  renderEditorCoverPreview();
  renderEditorVideoParts();
  renderEditorCategoryOptions();

  if (contributeId != null) {
    try {
      const detail = await fetchSubmissionDetail(contributeId);
      if (titleEl) titleEl.value = detail.title;
      await loadContributeRichEditorContent(
        detail.rawContent,
        type === 0 ? 'article' : 'video',
      );
      if (coverEl) coverEl.value = detail.cover;
      editorCategoryId = detail.categoryId;
      editorTags = detail.tags.slice(0, 10);
      editorVideoParts = detail.videos.slice();
      renderEditorTags();
      renderEditorCoverPreview();
      renderEditorVideoParts();
      renderEditorCategoryOptions();
    } catch {
      /* allow editing with empty fields */
    }
  }
}

function renderEditorCategoryOptions() {
  const select = document.getElementById('contribute-editor-category');
  if (!select) return;
  const leaves = leafCategories(categories);
  select.innerHTML =
    '<option value="">请选择分类</option>' +
    leaves
      .map(
        (node) =>
          `<option value="${node.id}"${editorCategoryId === node.id ? ' selected' : ''}>${escapeHtml(node.name)}</option>`,
      )
      .join('');
}

function renderEditorTags() {
  const wrap = document.getElementById('contribute-editor-tags');
  if (!wrap) return;
  wrap.innerHTML = editorTags
    .map(
      (tag) => `
      <span class="contribute-tag">
        #${escapeHtml(tag)}
        <button type="button" class="contribute-tag__remove" data-action="remove-tag" data-tag="${escapeHtml(tag)}" aria-label="移除标签">×</button>
      </span>`,
    )
    .join('');
}

function renderEditorCoverPreview() {
  const preview = document.getElementById('contribute-editor-cover-preview');
  const coverInput = document.getElementById('contribute-editor-cover');
  if (!preview || !coverInput) return;
  const path = coverInput.value.trim();
  const src = path ? mediaSrcForCover(absoluteMediaUrl(path)) : '';
  preview.innerHTML = src
    ? `<img src="${escapeHtml(src)}" alt="封面预览" />`
    : `<span class="contribute-cover-placeholder">${materialIcon('image', 'contribute-cover-placeholder__icon')}</span>`;
}

function renderEditorVideoParts() {
  const wrap = document.getElementById('contribute-editor-video-parts');
  if (!wrap) return;
  if (editorVideoParts.length === 0) {
    wrap.innerHTML = '<p class="contribute-video-parts__empty">还没有分P，请先上传视频</p>';
    return;
  }
  wrap.innerHTML = editorVideoParts
    .map(
      (part, index) => `
      <div class="contribute-video-part">
        <div class="contribute-video-part__info">
          <strong>P${index + 1}</strong>
          <span>${escapeHtml(part.title || '未命名分P')}</span>
        </div>
        <div class="contribute-video-part__actions">
          <button type="button" data-action="rename-part" data-index="${index}">改名</button>
          <button type="button" data-action="replace-part" data-index="${index}">重传</button>
          <button type="button" data-action="remove-part" data-index="${index}">删除</button>
        </div>
      </div>`,
    )
    .join('');

  const progressEl = document.getElementById('contribute-editor-upload-progress');
  if (progressEl) {
    progressEl.hidden = !editorUploadingVideo;
    if (editorUploadingVideo) {
      progressEl.textContent = `上传中 ${Math.round(editorUploadProgress * 100)}%`;
    }
  }
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function addEditorTag(raw) {
  const tag = raw.trim().replace(/^#+/, '');
  if (!tag) return false;
  if (editorTags.some((item) => item.toLowerCase() === tag.toLowerCase())) return false;
  if (editorTags.length >= 10) {
    alert('最多添加 10 个标签');
    return false;
  }
  editorTags.push(tag);
  renderEditorTags();
  return true;
}

function commitTagInput() {
  const input = document.getElementById('contribute-editor-tag-input');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;
  if (addEditorTag(raw)) input.value = '';
}

async function syncEditorLayout(type) {
  const isArticle = type === 0;
  const isVideo = type === 1;
  document.getElementById('contribute-editor-video-only')?.toggleAttribute('hidden', !isVideo);
  document.getElementById('contribute-editor-draft-row')?.toggleAttribute('hidden', !isArticle);
  const contentLabel = document.getElementById('contribute-editor-content-label');
  const coverHint = document.getElementById('contribute-editor-cover-hint');
  if (contentLabel) contentLabel.textContent = isArticle ? '正文' : '简介';
  if (coverHint) coverHint.hidden = !isVideo;
  await syncContributeRichEditorLayout(type);
}

async function uploadCoverFile(file) {
  if (editorUploadingCover) return;
  editorUploadingCover = true;
  try {
    const path = await uploadCommentImage(file);
    const coverEl = document.getElementById('contribute-editor-cover');
    if (coverEl) coverEl.value = path;
    renderEditorCoverPreview();
  } catch (err) {
    alert(err instanceof Error ? err.message : '封面上传失败');
  } finally {
    editorUploadingCover = false;
  }
}

/**
 * @param {File} file
 * @param {number | null} [replaceIndex]
 */
async function uploadVideoFile(file, replaceIndex = null) {
  if (editorUploadingVideo) return;
  editorUploadingVideo = true;
  editorUploadProgress = 0;
  editorReplacingPartIndex = replaceIndex;
  renderEditorVideoParts();

  try {
    const auth = await getVideoUploadAuth(file.name, file.size);
    await uploadVideoToOss(auth, file, (sent, total) => {
      editorUploadProgress = total === 0 ? 0 : sent / total;
      renderEditorVideoParts();
    });
    const libraryId = await completeVideoUpload(auth.videoId);
    const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
    const partTitle =
      replaceIndex != null &&
      replaceIndex >= 0 &&
      replaceIndex < editorVideoParts.length &&
      editorVideoParts[replaceIndex].title.trim()
        ? editorVideoParts[replaceIndex].title
        : fallbackTitle;
    const part = { type: 'direct', content: libraryId, title: partTitle, meta: {}, extra: {} };
    if (
      replaceIndex != null &&
      replaceIndex >= 0 &&
      replaceIndex < editorVideoParts.length
    ) {
      editorVideoParts[replaceIndex] = part;
    } else {
      editorVideoParts.push(part);
    }
  } catch (err) {
    alert(err instanceof Error ? err.message : '视频上传失败');
  } finally {
    editorUploadingVideo = false;
    editorReplacingPartIndex = null;
    renderEditorVideoParts();
  }
}

async function saveEditor() {
  if (editorSaving) return;
  if (editorUploadingVideo) {
    alert('请等待视频上传完成');
    return;
  }

  const title = document.getElementById('contribute-editor-title-input')?.value.trim() ?? '';
  const content =
    editorType === 0
      ? (await getArticleMarkdownFromEditor()).trim()
      : await getVideoQuillJsonFromEditor();
  const cover = document.getElementById('contribute-editor-cover')?.value.trim() ?? '';
  const categorySelect = document.getElementById('contribute-editor-category');
  const categoryId = Number.parseInt(categorySelect?.value ?? '', 10);
  const draft = document.getElementById('contribute-editor-draft')?.checked ?? false;
  const copyright = Number.parseInt(
    document.getElementById('contribute-editor-copyright')?.value ?? `${editorCopyright}`,
    10,
  );

  if (!title) {
    alert('请输入标题');
    return;
  }
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    alert('请选择分类');
    return;
  }
  if (editorType === 0 && (await isContributeRichEditorEmpty())) {
    alert('请输入正文内容');
    return;
  }
  if (editorType === 1 && editorVideoParts.length === 0) {
    alert('请至少保留并上传一个分P');
    return;
  }
  if (editorType === 1 && editorContributeId == null && !cover) {
    alert('视频投稿必须上传封面图');
    return;
  }

  commitTagInput();
  editorSaving = true;
  const saveBtn = document.getElementById('contribute-editor-save');
  if (saveBtn) saveBtn.disabled = true;

  try {
    if (editorType === 0) {
      if (editorContributeId == null) {
        await createArticleSubmission({
          title,
          content,
          categoryId,
          tags: editorTags,
          cover,
          draft,
          copyright,
        });
      } else {
        await updateArticleSubmission({
          contributeId: editorContributeId,
          title,
          content,
          categoryId,
          tags: editorTags,
          cover,
          draft,
          copyright,
        });
      }
    } else if (editorContributeId == null) {
      await createVideoSubmission({
        title,
        content,
        categoryId,
        videos: editorVideoParts,
        tags: editorTags,
        cover,
        copyright,
      });
    } else {
      await updateVideoSubmission({
        contributeId: editorContributeId,
        title,
        content,
        categoryId,
        videos: editorVideoParts,
        tags: editorTags,
        cover,
        copyright,
      });
    }
    showView('hub');
    await loadListFirstPage();
  } catch (err) {
    alert(err instanceof Error ? err.message : '保存失败');
  } finally {
    editorSaving = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

/**
 * @param {number} contributeId
 * @param {0 | 1} type
 */
async function openDetail(contributeId, type) {
  detailContributeId = contributeId;
  detailType = type;
  detailData = null;
  detailError = null;
  detailLoading = true;
  showView('detail');
  renderDetail();

  try {
    detailData = await fetchSubmissionDetail(contributeId);
    detailError = null;
  } catch (err) {
    detailError = err;
  } finally {
    detailLoading = false;
    renderDetail();
  }
}

function renderDetail() {
  const body = document.getElementById('contribute-detail-body');
  if (!body) return;

  if (detailLoading) {
    body.innerHTML = '<p class="contribute-empty">加载中…</p>';
    return;
  }

  if (detailError) {
    body.innerHTML = `
      <div class="contribute-empty">
        <p>加载失败：${escapeHtml(detailError instanceof Error ? detailError.message : `${detailError}`)}</p>
        <button type="button" class="btn-accent" id="contribute-detail-retry">重试</button>
      </div>`;
    return;
  }

  if (!detailData) {
    body.innerHTML = '<p class="contribute-empty">暂无数据</p>';
    return;
  }

  const detail = detailData;
  const coverSrc = detail.cover ? mediaSrcForCover(detail.cover) : '';
  body.innerHTML = `
    <div class="contribute-detail">
      <div class="contribute-detail__status-row">
        <span class="contribute-card__status">${escapeHtml(submissionStatusLabel(detail.status))}</span>
        ${detail.resourceId != null ? `<span class="contribute-detail__resource">资源 ID ${detail.resourceId}</span>` : ''}
      </div>
      <h2 class="contribute-detail__title">${escapeHtml(detail.title || '未命名投稿')}</h2>
      ${
        detail.tags.length
          ? `<div class="contribute-detail__tags">${detail.tags.map((tag) => `<span class="contribute-tag contribute-tag--readonly">#${escapeHtml(tag)}</span>`).join('')}</div>`
          : ''
      }
      ${
        coverSrc
          ? `<div class="contribute-detail__cover"><img src="${escapeHtml(coverSrc)}" alt="" /></div>`
          : ''
      }
      <div class="contribute-detail__content markdown-body" id="contribute-detail-content"></div>
      ${
        detailType === 1 && detail.videos.length
          ? `<div class="contribute-detail__parts"><h3>分P（${detail.videos.length}）</h3><ul>${detail.videos.map((part, index) => `<li>P${index + 1}：${escapeHtml(part.title || '未命名分P')}</li>`).join('')}</ul></div>`
          : ''
      }
    </div>`;

  const contentEl = document.getElementById('contribute-detail-content');
  if (contentEl) {
    if (detail.rawContent) {
      mountRichContent(contentEl, detail.rawContent);
    } else {
      contentEl.textContent = '（暂无内容）';
    }
  }
}

/**
 * @param {number} contributeId
 */
async function confirmDelete(contributeId) {
  const item = items.find((entry) => entry.id === contributeId);
  const title = item?.title || '该投稿';
  if (!window.confirm(`确定删除投稿「${title}」吗？删除后无法恢复。`)) return;
  try {
    await deleteSubmission(listTab, contributeId);
    if (view === 'detail') {
      showView('hub');
    }
    await loadListFirstPage();
  } catch (err) {
    alert(err instanceof Error ? err.message : '删除失败');
  }
}

async function ensureCategories() {
  if (categoriesLoaded) return;
  try {
    categories = await fetchCategories();
  } catch {
    categories = [];
  } finally {
    categoriesLoaded = true;
  }
}

async function onContributePageEnterInternal() {
  renderListTabs();
  if (view === 'hub') {
    showHubSection(hubSection);
  }
}

export function onContributePageEnter() {
  void onContributePageEnterInternal();
}

/**
 * @param {'submission' | 'feed' | 'published'} [section]
 */
export function openContributePage(section = 'submission') {
  if (!requireLogin()) return;
  hubSection = section;
  view = 'hub';
  showView('hub');
  showHubSection(section);
  setPage('contribute');
}

export { openFeedComposeView };

export function bindContributePage() {
  if (bound) return;
  bound = true;

  void ensureCategories();
  bindContributeFeedSection(showView);
  bindContributePublishedSection();

  document.querySelectorAll('[data-contribute-section]').forEach((el) => {
    el.addEventListener('click', () => {
      const section = el.getAttribute('data-contribute-section');
      if (section === 'submission' || section === 'feed' || section === 'published') {
        showHubSection(section);
      }
    });
  });

  document.getElementById('contribute-create-btn')?.addEventListener('click', () => {
    void openEditor(listTab);
  });

  document.getElementById('contribute-list-scroll')?.addEventListener('scroll', onListScroll);

  getRoot()?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const actionEl = target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');
    const id = Number.parseInt(actionEl.getAttribute('data-id') ?? '', 10);

    if (action === 'open-detail' && Number.isFinite(id)) {
      void openDetail(id, listTab);
      return;
    }
    if (action === 'edit-item' && Number.isFinite(id)) {
      void openEditor(listTab, id);
      return;
    }
    if (action === 'delete-item' && Number.isFinite(id)) {
      void confirmDelete(id);
      return;
    }
    if (action === 'remove-tag') {
      const tag = actionEl.getAttribute('data-tag') ?? '';
      editorTags = editorTags.filter((item) => item !== tag);
      renderEditorTags();
      return;
    }
    if (action === 'rename-part') {
      const index = Number.parseInt(actionEl.getAttribute('data-index') ?? '', 10);
      if (!Number.isFinite(index) || index < 0 || index >= editorVideoParts.length) return;
      const next = window.prompt('请输入分P标题', editorVideoParts[index].title);
      if (!next?.trim()) return;
      const old = editorVideoParts[index];
      editorVideoParts[index] = { ...old, title: next.trim() };
      renderEditorVideoParts();
      return;
    }
    if (action === 'remove-part') {
      const index = Number.parseInt(actionEl.getAttribute('data-index') ?? '', 10);
      if (!Number.isFinite(index)) return;
      if (!window.confirm('保存后该分P将从投稿中移除，已直传的视频不会立即从媒体库删除。')) return;
      editorVideoParts.splice(index, 1);
      renderEditorVideoParts();
      return;
    }
  });

  getRoot()?.addEventListener('change', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.id === 'contribute-editor-category') {
      const value = Number.parseInt(
        /** @type {HTMLSelectElement} */ (target).value,
        10,
      );
      editorCategoryId = Number.isFinite(value) ? value : null;
    }
    if (target.id === 'contribute-editor-video-file') {
      const input = /** @type {HTMLInputElement} */ (target);
      const file = input.files?.[0];
      input.value = '';
      if (file) void uploadVideoFile(file, editorReplacingPartIndex);
    }
    if (target.id === 'contribute-editor-cover-file') {
      const input = /** @type {HTMLInputElement} */ (target);
      const file = input.files?.[0];
      input.value = '';
      if (file) void uploadCoverFile(file);
    }
  });

  document.querySelectorAll('[data-contribute-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      const tab = Number.parseInt(el.getAttribute('data-contribute-tab') ?? '0', 10);
      if (tab === listTab) return;
      listTab = tab === 1 ? 1 : 0;
      items = [];
      renderListTabs();
      void loadListFirstPage();
    });
  });

  document.getElementById('contribute-editor-back')?.addEventListener('click', () => {
    showView('hub');
  });
  document.getElementById('contribute-detail-back')?.addEventListener('click', () => {
    showView('hub');
  });
  document.getElementById('contribute-editor-save')?.addEventListener('click', () => {
    void saveEditor();
  });
  document.getElementById('contribute-detail-edit')?.addEventListener('click', () => {
    if (detailContributeId != null && detailType != null) {
      void openEditor(detailType, detailContributeId);
    }
  });
  document.getElementById('contribute-detail-delete')?.addEventListener('click', () => {
    if (detailContributeId != null) void confirmDelete(detailContributeId);
  });

  setContributeRichEditorImageUpload(async (file) => {
    const path = await uploadCommentImage(file);
    return absoluteMediaUrl(path);
  });

  document.getElementById('contribute-editor-tag-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTagInput();
    }
  });

  getRoot()?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.id === 'contribute-retry-list' || target.id === 'contribute-create-first') {
      if (target.id === 'contribute-create-first') void openEditor(listTab);
      else void loadListFirstPage();
      return;
    }
    if (target.id === 'contribute-load-more') {
      void loadListMore();
      return;
    }
    if (target.id === 'contribute-detail-retry' && detailContributeId != null && detailType != null) {
      void openDetail(detailContributeId, detailType);
      return;
    }
    if (target.id === 'contribute-editor-add-part' || target.closest('#contribute-editor-add-part')) {
      editorReplacingPartIndex = null;
      document.getElementById('contribute-editor-video-file')?.click();
      return;
    }
    const replaceBtn = target.closest('[data-action="replace-part"]');
    if (replaceBtn) {
      editorReplacingPartIndex = Number.parseInt(
        replaceBtn.getAttribute('data-index') ?? '',
        10,
      );
      document.getElementById('contribute-editor-video-file')?.click();
    }
  });
}
