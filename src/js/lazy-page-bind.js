/** @typedef {import('./pages.js').PageId} PageId */

/** @type {Map<PageId, Promise<void>>} */
const pagePromises = new Map();

/** @type {Map<string, Promise<void>>} */
const featurePromises = new Map();

/** @type {{ onSettingsUserUpdated?: () => void }} */
let hooks = {};

/**
 * @param {{ onSettingsUserUpdated?: () => void }} options
 */
export function initLazyPageBind(options = {}) {
  hooks = { ...options };
}

/**
 * @param {PageId} pageId
 */
export function ensurePageBound(pageId) {
  let pending = pagePromises.get(pageId);
  if (pending) return pending;

  pending = runPageBind(pageId).catch((err) => {
    pagePromises.delete(pageId);
    throw err;
  });
  pagePromises.set(pageId, pending);
  return pending;
}

/**
 * @param {PageId} pageId
 */
async function runPageBind(pageId) {
  switch (pageId) {
    case 'home': {
      const mod = await import('./home-feed.js');
      mod.bindHomeFeed();
      return;
    }
    case 'feed': {
      const mod = await import('./feed-page.js');
      mod.bindFeedPage();
      return;
    }
    case 'mine': {
      const mod = await import('./mine-page.js');
      mod.bindMinePage();
      return;
    }
    case 'settings': {
      const mod = await import('./settings-page.js');
      mod.bindSettingsPage({ onUserUpdated: hooks.onSettingsUserUpdated ?? (() => {}) });
      return;
    }
    case 'watch': {
      const [video, danmaku, series] = await Promise.all([
        import('./video-detail.js'),
        import('./danmaku-manager-ui.js'),
        import('./series-ui.js'),
      ]);
      video.bindVideoDetail();
      danmaku.bindDanmakuManagerDialog();
      series.bindSeriesPickerDialog();
      return;
    }
    case 'article': {
      const [article, series] = await Promise.all([
        import('./article-detail.js'),
        import('./series-ui.js'),
      ]);
      article.bindArticleDetail();
      series.bindSeriesPickerDialog();
      return;
    }
    case 'space': {
      const mod = await import('./user-space.js');
      mod.bindUserSpace();
      return;
    }
    case 'follow-list': {
      const mod = await import('./follow-list.js');
      mod.bindFollowList();
      return;
    }
    case 'search': {
      const mod = await import('./search-page.js');
      mod.bindSearchPage();
      return;
    }
    case 'tag': {
      const mod = await import('./tag-page.js');
      mod.bindTagPage();
      return;
    }
    case 'category-list': {
      const mod = await import('./category-list-page.js');
      mod.bindCategoryListPage();
      return;
    }
    case 'message': {
      const mod = await import('./message-page.js');
      mod.bindMessagePage();
      return;
    }
    case 'contribute': {
      const mod = await import('./contribute-page.js');
      mod.bindContributePage();
      return;
    }
    case 'sign': {
      const mod = await import('./sign-page.js');
      mod.bindSignPage();
      return;
    }
    case 'series': {
      const mod = await import('./series-page.js');
      mod.bindSeriesPage();
      return;
    }
    case 'member': {
      const mod = await import('./member-center-page.js');
      mod.bindMemberCenterPage();
      return;
    }
    default:
      return;
  }
}

/**
 * @param {string} featureId
 */
export function ensureFeatureBound(featureId) {
  let pending = featurePromises.get(featureId);
  if (pending) return pending;

  pending = runFeatureBind(featureId).catch((err) => {
    featurePromises.delete(featureId);
    throw err;
  });
  featurePromises.set(featureId, pending);
  return pending;
}

/**
 * @param {string} featureId
 */
async function runFeatureBind(featureId) {
  switch (featureId) {
    case 'feed-detail': {
      const mod = await import('./feed-detail.js');
      mod.bindFeedDetail();
      return;
    }
    case 'feed-forward': {
      const mod = await import('./feed-forward.js');
      mod.bindFeedForward();
      return;
    }
    case 'favorite-picker': {
      const mod = await import('./favorite-ui.js');
      mod.bindFavoritePicker();
      return;
    }
    case 'reward-dialog': {
      const mod = await import('./reward-ui.js');
      mod.bindRewardDialog();
      return;
    }
    case 'offline-download-dialog': {
      const mod = await import('./offline-download-ui.js');
      mod.bindOfflineDownloadDialog();
      return;
    }
    case 'share-dialog': {
      const mod = await import('./share-ui.js');
      mod.bindShareDialog();
      return;
    }
    case 'report-dialog': {
      const mod = await import('./report-ui.js');
      mod.bindReportDialog();
      return;
    }
    case 'image-viewer': {
      const mod = await import('./image-viewer.js');
      mod.bindImageViewer();
      return;
    }
    case 'comment-composer': {
      const mod = await import('./comment-composer.js');
      mod.bindCommentComposer();
      return;
    }
    default:
      return;
  }
}
