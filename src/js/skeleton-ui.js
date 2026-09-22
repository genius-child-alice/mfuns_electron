/**
 * @param {string} [mod]
 * @param {string} [style]
 */
function block(mod = '', style = '') {
  const cls = ['skeleton-block', mod].filter(Boolean).join(' ');
  const styleAttr = style ? ` style="${style}"` : '';
  return `<span class="${cls}"${styleAttr} aria-hidden="true"></span>`;
}

/**
 * 视频/文章卡片网格（用于首页、分区、搜索、标签等 content-grid）
 * @param {number} [count]
 * @param {string} [wrapperClass]
 */
export function videoGridSkeletonHtml(count = 12, wrapperClass = '') {
  const cards = Array.from({ length: count }, () => `
    <article class="video-card skeleton-video-card">
      <div class="skeleton-video-card__cover">${block('skeleton-block--cover')}</div>
      <div class="skeleton-video-card__meta">
        ${block('skeleton-block--line skeleton-block--title')}
        ${block('skeleton-block--line skeleton-block--sub')}
      </div>
    </article>`).join('');
  const wrapClass = ['skeleton-busy', wrapperClass].filter(Boolean).join(' ');
  return `<div class="${wrapClass}" aria-busy="true" aria-label="正在加载">${cards}</div>`;
}

/**
 * 动态流列表
 * @param {number} [count]
 */
export function feedListSkeletonHtml(count = 4) {
  const cards = Array.from({ length: count }, () => `
    <article class="skeleton-feed-card">
      <header class="skeleton-feed-card__head">
        ${block('skeleton-block--circle')}
        <div class="skeleton-feed-card__who">
          ${block('skeleton-block--line skeleton-block--name')}
          ${block('skeleton-block--line skeleton-block--meta')}
        </div>
      </header>
      <div class="skeleton-feed-card__body">
        ${block('skeleton-block--line skeleton-block--para')}
        ${block('skeleton-block--line skeleton-block--para skeleton-block--short')}
      </div>
      <div class="skeleton-feed-card__media">${block('skeleton-block--rect')}</div>
    </article>`).join('');
  return `<div class="user-space__list user-space__list--feed skeleton-busy" aria-busy="true" aria-label="正在加载">${cards}</div>`;
}

/** 动态详情弹层 */
export function feedDetailSkeletonHtml() {
  return `<div class="skeleton-feed-detail skeleton-busy" aria-busy="true" aria-label="正在加载">
    <header class="skeleton-feed-card__head skeleton-feed-card__head--lg">
      ${block('skeleton-block--circle skeleton-block--circle-lg')}
      <div class="skeleton-feed-card__who">
        ${block('skeleton-block--line skeleton-block--name')}
        ${block('skeleton-block--line skeleton-block--meta')}
      </div>
    </header>
    <div class="skeleton-feed-card__body">
      ${block('skeleton-block--line skeleton-block--para')}
      ${block('skeleton-block--line skeleton-block--para')}
      ${block('skeleton-block--line skeleton-block--para skeleton-block--short')}
    </div>
    <div class="skeleton-feed-card__media skeleton-feed-card__media--detail">${block('skeleton-block--rect')}</div>
  </div>`;
}

/** 视频详情右侧信息栏 */
export function watchSideSkeletonHtml() {
  return `<div class="skeleton-watch-side skeleton-busy" aria-busy="true" aria-label="正在加载">
    <div class="skeleton-watch-side__tabs">
      ${block('skeleton-block--tab')}
      ${block('skeleton-block--tab')}
      ${block('skeleton-block--tab')}
    </div>
    <div class="skeleton-watch-side__scroll">
      <div class="skeleton-watch-side__author">
        ${block('skeleton-block--circle')}
        <div class="skeleton-feed-card__who">
          ${block('skeleton-block--line skeleton-block--name')}
          ${block('skeleton-block--line skeleton-block--meta')}
        </div>
      </div>
      ${block('skeleton-block--line skeleton-block--watch-title')}
      ${block('skeleton-block--line skeleton-block--watch-title skeleton-block--short')}
      <div class="skeleton-watch-side__meta">
        ${block('skeleton-block--line skeleton-block--chip')}
        ${block('skeleton-block--line skeleton-block--chip')}
        ${block('skeleton-block--line skeleton-block--chip')}
      </div>
      <div class="skeleton-watch-side__bar">
        ${block('skeleton-block--pill')}
        ${block('skeleton-block--pill')}
        ${block('skeleton-block--pill')}
        ${block('skeleton-block--pill')}
        ${block('skeleton-block--pill')}
      </div>
    </div>
  </div>`;
}

/** 文章阅读页 */
export function articleReadSkeletonHtml() {
  return `<div class="skeleton-article skeleton-busy" aria-busy="true" aria-label="正在加载">
    ${block('skeleton-block--rect skeleton-block--article-cover')}
    ${block('skeleton-block--line skeleton-block--article-title')}
    ${block('skeleton-block--line skeleton-block--article-title skeleton-block--short')}
    <div class="skeleton-article__author">
      ${block('skeleton-block--circle')}
      <div class="skeleton-feed-card__who">
        ${block('skeleton-block--line skeleton-block--name')}
        ${block('skeleton-block--line skeleton-block--meta')}
      </div>
    </div>
    <div class="skeleton-article__stats">
      ${block('skeleton-block--line skeleton-block--chip')}
      ${block('skeleton-block--line skeleton-block--chip')}
    </div>
    <div class="skeleton-article__body">
      ${block('skeleton-block--line skeleton-block--para')}
      ${block('skeleton-block--line skeleton-block--para')}
      ${block('skeleton-block--line skeleton-block--para skeleton-block--short')}
      ${block('skeleton-block--line skeleton-block--para')}
      ${block('skeleton-block--line skeleton-block--para skeleton-block--short')}
    </div>
  </div>`;
}

/** 个人空间顶栏资料区 */
export function userSpaceProfileSkeletonHtml() {
  return `<div class="skeleton-user-space-profile skeleton-busy" aria-busy="true" aria-label="正在加载">
    <div class="skeleton-user-space-profile__head">
      ${block('skeleton-block--circle skeleton-block--circle-xl')}
      <div class="skeleton-user-space-profile__text">
        ${block('skeleton-block--line skeleton-block--space-name')}
        ${block('skeleton-block--line skeleton-block--para skeleton-block--short')}
      </div>
    </div>
    <div class="skeleton-user-space-profile__stats">
      ${block('skeleton-block--line skeleton-block--chip')}
      ${block('skeleton-block--line skeleton-block--chip')}
      ${block('skeleton-block--line skeleton-block--chip')}
    </div>
  </div>`;
}

/**
 * 个人空间 Tab 内容
 * @param {'video' | 'article' | 'feed' | 'default'} [kind]
 */
export function userSpaceBodySkeletonHtml(kind = 'video') {
  if (kind === 'feed') return feedListSkeletonHtml(3);
  if (kind === 'article') {
    const rows = Array.from({ length: 6 }, () => `
      <div class="skeleton-article-row">
        ${block('skeleton-block--rect skeleton-block--article-thumb')}
        <div class="skeleton-article-row__text">
          ${block('skeleton-block--line skeleton-block--title')}
          ${block('skeleton-block--line skeleton-block--sub')}
        </div>
      </div>`).join('');
    return `<div class="user-space__list skeleton-busy" aria-busy="true">${rows}</div>`;
  }
  return videoGridSkeletonHtml(8, 'content-grid user-space__grid');
}

/** 搜索用户列表 */
export function searchUserListSkeletonHtml(count = 8) {
  const rows = Array.from({ length: count }, () => `
    <div class="skeleton-search-user">
      ${block('skeleton-block--circle')}
      <div class="skeleton-search-user__text">
        ${block('skeleton-block--line skeleton-block--name')}
        ${block('skeleton-block--line skeleton-block--sub')}
      </div>
    </div>`).join('');
  return `<div class="skeleton-busy" aria-busy="true" aria-label="正在加载">${rows}</div>`;
}

/** 合集页稿件网格 */
export function seriesGridSkeletonHtml(count = 8) {
  return videoGridSkeletonHtml(count, 'series-page__grid content-grid');
}
