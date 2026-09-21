import { materialIcon } from './icons.js';
import { loadSession, userDisplayName } from './auth.js';
import { userAvatarMediaSrc } from './content-api.js';
import { destroyWatchPlayer } from './watch-player.js';

const DEFAULT_AVATAR = 'assets/mfuns_logo.png';

/** @typedef {'home' | 'feed' | 'mine' | 'settings' | 'watch' | 'article' | 'space' | 'follow-list' | 'search' | 'tag' | 'message' | 'contribute' | 'sign' | 'series'} PageId */

/** @type {PageId} */
let currentPage = 'home';

function guestBanner(subtitle) {
  return `
    <div class="guest-banner" data-guest-only>
      <div class="guest-banner__text">
        <h2 class="guest-banner__title">你还未登录</h2>
        <p class="guest-banner__sub">${subtitle}</p>
      </div>
      <button type="button" class="btn-accent" data-action="open-login">登录</button>
    </div>`;
}

function guestEmpty(message = '没有你想要的内容~', showBadge = true) {
  return `
    <div class="guest-empty" data-guest-only>
      <div class="guest-empty__art">
        <img src="${DEFAULT_AVATAR}" alt="" class="guest-empty__img" />
        ${showBadge ? '<span class="guest-empty__badge">空</span>' : ''}
      </div>
      <p class="guest-empty__text">${message}</p>
    </div>`;
}

function guestCenterBlock(title, subtitle) {
  return `
    <div class="guest-center" data-guest-only>
      <div class="guest-empty__art guest-empty__art--lg">
        <img src="${DEFAULT_AVATAR}" alt="" class="guest-empty__img" />
      </div>
      <h2 class="guest-center__title">${title}</h2>
      <p class="guest-center__sub">${subtitle}</p>
      <button type="button" class="btn-accent btn-accent--lg" data-action="open-login">登录</button>
    </div>`;
}

export function homePageHtml() {
  return `
    <div class="page-view page-view--home" data-page="home">
      <nav class="home-category-strip" id="home-category-strip" hidden aria-label="内容分区">
        <div class="home-category-strip__row home-category-strip__row--parent" id="home-category-parent-list" role="tablist" aria-label="大分区"></div>
        <div class="home-category-strip__row home-category-strip__row--child" id="home-category-child-list" role="tablist" aria-label="小分区"></div>
      </nav>
      <p class="home-feed__status" id="home-feed-status" hidden role="status"></p>
      <div class="content-grid" id="home-feed-grid"></div>
    </div>`;
}

export function signPageHtml() {
  return `
    <div class="page-view page-view--sign" data-page="sign" hidden>
      <div class="sign-page">
        <header class="sign-page__head">
          <button type="button" class="sign-page__back app-no-drag" id="sign-page-back">
            ${materialIcon('arrow_back', 'sign-page__back-icon')}
            <span>返回</span>
          </button>
          <h1 class="sign-page__title">签到</h1>
        </header>
        <div class="sign-page__body" id="sign-page-body">
          <p class="sign-page__status">加载签到信息…</p>
        </div>
      </div>
    </div>`;
}

export function seriesPageHtml() {
  return `
    <div class="page-view page-view--series" data-page="series" hidden>
      <div class="series-page">
        <header class="series-page__head">
          <button type="button" class="series-page__back app-no-drag" id="series-page-back">
            ${materialIcon('arrow_back', 'series-page__back-icon')}
            <span>返回</span>
          </button>
          <h1 class="series-page__title" id="series-page-title">合集</h1>
        </header>
        <div class="series-page__body" id="series-page-body">
          <p class="series-page__empty">加载中…</p>
        </div>
      </div>
    </div>`;
}

export function tagPageHtml() {
  return `
    <div class="page-view page-view--tag" data-page="tag" hidden>
      <div class="tag-page">
        <header class="tag-page__head">
          <button type="button" class="tag-page__back app-no-drag" id="tag-page-back">
            ${materialIcon('arrow_back', 'tag-page__back-icon')}
            <span>返回</span>
          </button>
          <h1 class="tag-page__title" id="tag-page-title">标签广场</h1>
        </header>
        <nav class="tag-page__tabs" id="tag-page-tabs" aria-label="标签内容分类">
          <button type="button" class="tag-page__tab is-active" data-tag-tab="latest">最新</button>
          <button type="button" class="tag-page__tab" data-tag-tab="video">视频</button>
          <button type="button" class="tag-page__tab" data-tag-tab="article">文章</button>
        </nav>
        <p class="home-feed__status" id="tag-page-status" hidden role="status"></p>
        <div class="content-grid tag-page__grid" id="tag-page-grid"></div>
        <p class="tag-page__hint" id="tag-page-hint" hidden></p>
      </div>
    </div>`;
}

export function searchPageHtml() {
  return `
    <div class="page-view page-view--search" data-page="search" hidden>
      <div class="search-page">
        <header class="search-page__head">
          <h1 class="search-page__title" id="search-page-query">搜索</h1>
        </header>
        <nav class="search-page__tabs" id="search-page-tabs" aria-label="搜索分类">
          <button type="button" class="search-page__tab is-active" data-search-tab="all">综合</button>
          <button type="button" class="search-page__tab" data-search-tab="video">视频</button>
          <button type="button" class="search-page__tab" data-search-tab="article">文章</button>
          <button type="button" class="search-page__tab" data-search-tab="user">用户</button>
        </nav>
        <p class="home-feed__status" id="search-page-status" hidden role="status"></p>
        <div class="content-grid search-page__resource" id="search-page-resource"></div>
        <div class="search-page__users" id="search-page-users" hidden></div>
        <nav class="search-page__pager" id="search-page-pager" hidden aria-label="搜索结果分页">
          <div class="search-page__pager-main">
            <button type="button" class="search-page__pager-link" id="search-page-prev" disabled>上一页</button>
            <div class="search-page__pager-pages" id="search-page-pager-pages"></div>
            <button type="button" class="search-page__pager-link" id="search-page-next" disabled>下一页</button>
            <span class="search-page__pager-total" id="search-page-pager-total"></span>
          </div>
          <div class="search-page__pager-jump" id="search-page-pager-jump">
            <span class="search-page__pager-jump-label">跳至</span>
            <input
              type="number"
              class="search-page__pager-jump-input"
              id="search-page-jump-input"
              min="1"
              step="1"
              inputmode="numeric"
              aria-label="页码"
            />
            <span class="search-page__pager-jump-label">页</span>
            <button type="button" class="search-page__pager-jump-btn" id="search-page-jump-btn">确定</button>
          </div>
        </nav>
      </div>
    </div>`;
}

export function messagePageHtml() {
  return `
    <div class="page-view page-view--message" data-page="message" hidden>
      <div class="message-page">
        <header class="message-page__header app-no-drag">
          <h1 class="message-page__title">我的消息</h1>
          <div class="message-page__tabs" role="tablist" aria-label="消息分类">
            <button type="button" class="message-page__tab is-active" data-message-tab="dm" role="tab" aria-selected="true">私信</button>
            <button type="button" class="message-page__tab" data-message-tab="notify" role="tab" aria-selected="false">
              通知
              <span class="message-page__tab-badge" id="message-tab-notify-badge" hidden></span>
            </button>
          </div>
        </header>
        ${guestBanner('登录账号，查看私信与通知')}
        <div class="message-page__body" data-auth-only hidden>
          <div class="message-page__panel" data-message-panel="dm">
            <aside class="message-page__aside" aria-label="会话列表">
              <div class="message-page__conv-scroll" id="message-conv-scroll">
                <div id="message-conv-list"></div>
              </div>
              <p class="message-page__conv-footer" id="message-conv-footer" hidden></p>
            </aside>
            <section class="message-page__thread" aria-label="聊天">
              <header class="message-thread__head app-no-drag">
                <span class="message-thread__avatar" id="message-thread-avatar">${materialIcon('forum', 'message-thread__avatar-icon')}</span>
                <h2 class="message-thread__title" id="message-thread-title">选择会话</h2>
              </header>
              <div class="message-page__thread-scroll" id="message-thread-scroll">
                <div class="message-page__thread-list" id="message-thread-list">
                  <p class="message-page__empty">选择左侧会话开始聊天</p>
                </div>
              </div>
              <footer class="message-page__composer app-no-drag">
                <div class="message-composer__row">
                  <textarea
                    class="message-composer__input"
                    id="message-composer-input"
                    rows="2"
                    placeholder="说点什么…"
                  ></textarea>
                  <div class="message-composer__tools">
                    <button type="button" class="message-composer__tool" id="message-composer-image" title="图片" aria-label="图片">
                      ${materialIcon('image')}
                    </button>
                    <button type="button" class="message-composer__tool" id="message-composer-sticker" title="表情" aria-label="表情">
                      ${materialIcon('mood')}
                    </button>
                    <button type="button" class="message-composer__send" id="message-composer-send" title="发送" aria-label="发送">
                      ${materialIcon('send')}
                    </button>
                  </div>
                </div>
                <div class="message-composer__images" id="message-composer-images"></div>
                <div class="message-sticker-panel" id="message-sticker-panel" hidden></div>
                <input type="file" id="message-composer-file" accept="image/*" multiple hidden />
              </footer>
            </section>
          </div>
          <div class="message-page__panel message-page__panel--notify" data-message-panel="notify" hidden>
            <aside class="message-notify__aside" aria-label="通知列表">
              <div class="message-notify__summary" id="message-notify-summary"></div>
              <div class="message-notify__tabs" role="tablist" aria-label="通知分类">
                <button type="button" class="message-notify__tab is-active" data-notify-type="1" role="tab" aria-selected="true">
                  赞<span class="message-notify__tab-badge" hidden></span>
                </button>
                <button type="button" class="message-notify__tab" data-notify-type="2" role="tab" aria-selected="false">
                  评论<span class="message-notify__tab-badge" hidden></span>
                </button>
                <button type="button" class="message-notify__tab" data-notify-type="3" role="tab" aria-selected="false">
                  提及<span class="message-notify__tab-badge" hidden></span>
                </button>
                <button type="button" class="message-notify__tab" data-notify-type="4" role="tab" aria-selected="false">
                  系统<span class="message-notify__tab-badge" hidden></span>
                </button>
              </div>
              <div class="message-notify__scroll" id="message-notify-scroll">
                <div class="message-notify__list" id="message-notify-list"></div>
                <p class="message-notify__footer" id="message-notify-footer" hidden></p>
              </div>
            </aside>
            <section class="message-notify__detail" id="message-notify-detail" aria-label="通知详情">
              <p class="message-page__empty">选择左侧通知查看详情</p>
            </section>
          </div>
        </div>
        ${guestEmpty('登录后查看私信')}
      </div>
    </div>`;
}

export function contributePageHtml() {
  return `
    <div class="page-view page-view--contribute" data-page="contribute" hidden>
      <div class="contribute-page" id="contribute-page-root">
        <div id="contribute-hub-view">
          <header class="contribute-page__header app-no-drag">
            <h1 class="contribute-page__title">创作中心</h1>
            <nav class="contribute-hub-nav" aria-label="创作中心分类">
              <button type="button" class="contribute-hub-nav__item is-active" data-contribute-section="submission">投稿</button>
              <button type="button" class="contribute-hub-nav__item" data-contribute-section="feed">动态</button>
              <button type="button" class="contribute-hub-nav__item" data-contribute-section="published">已发布</button>
            </nav>
          </header>
          ${guestBanner('登录账号，管理投稿与动态')}
          <div class="contribute-page__body" data-auth-only hidden>
            <section id="contribute-submission-section" class="contribute-hub-section">
              <div class="contribute-section-toolbar">
                <div class="contribute-page__tabs" role="tablist" aria-label="投稿类型">
                  <button type="button" class="contribute-page__tab is-active" data-contribute-tab="0" role="tab" aria-selected="true">文章</button>
                  <button type="button" class="contribute-page__tab" data-contribute-tab="1" role="tab" aria-selected="false">视频</button>
                </div>
                <button type="button" class="btn-accent" id="contribute-create-btn" title="发布投稿">
                  ${materialIcon('add', 'contribute-page__add-icon')}
                  <span>发布投稿</span>
                </button>
              </div>
              <div class="contribute-status-filters" id="contribute-status-filters" role="tablist" aria-label="投稿状态筛选"></div>
              <div class="contribute-list-scroll" id="contribute-list-scroll">
                <div class="contribute-list" id="contribute-list"></div>
              </div>
              <p class="contribute-list-footer" id="contribute-list-footer" hidden></p>
            </section>
            <section id="contribute-feed-section" class="contribute-hub-section" hidden>
              <div class="contribute-section-toolbar">
                <p class="contribute-section-desc">管理你发布的动态</p>
                <button type="button" class="btn-accent" id="contribute-feed-compose-btn">
                  ${materialIcon('edit_note', 'contribute-page__add-icon')}
                  <span>发布动态</span>
                </button>
              </div>
              <div class="contribute-list-scroll" id="contribute-feed-scroll">
                <div class="contribute-list" id="contribute-feed-list"></div>
              </div>
              <p class="contribute-list-footer" id="contribute-feed-footer" hidden></p>
            </section>
            <section id="contribute-published-section" class="contribute-hub-section" hidden>
              <div class="contribute-section-toolbar">
                <div class="contribute-page__tabs" role="tablist" aria-label="已发布类型">
                  <button type="button" class="contribute-page__tab is-active" data-published-tab="0" role="tab" aria-selected="true">文章</button>
                  <button type="button" class="contribute-page__tab" data-published-tab="1" role="tab" aria-selected="false">视频</button>
                </div>
              </div>
              <div class="contribute-list-scroll" id="contribute-published-scroll">
                <div class="contribute-list" id="contribute-published-list"></div>
              </div>
              <p class="contribute-list-footer" id="contribute-published-footer" hidden></p>
            </section>
          </div>
          ${guestEmpty('登录后使用创作中心')}
        </div>

        <div class="contribute-subview" id="contribute-feed-compose-view" hidden>
          <header class="contribute-subview__header app-no-drag">
            <button type="button" class="contribute-subview__back" id="contribute-feed-compose-back">
              ${materialIcon('arrow_back')}
              <span>返回</span>
            </button>
            <h2 class="contribute-subview__heading">发布动态</h2>
            <div class="contribute-subview__actions">
              <button type="button" class="btn-accent" id="contribute-feed-compose-submit">发布</button>
            </div>
          </header>
          <div class="contribute-subview__body">
            <form class="contribute-form contribute-editor-card" onsubmit="return false">
              <div class="contribute-field">
                <label for="feed-compose-quill">正文</label>
                <div class="contribute-rich-editor contribute-rich-editor--feed app-no-drag" id="feed-compose-rich-editor">
                  <div id="feed-compose-quill" class="contribute-rich-editor__host"></div>
                </div>
              </div>
              <div class="contribute-field">
                <label>图片（最多 9 张）</label>
                <div class="contribute-feed-compose-images" id="contribute-feed-compose-images"></div>
                <button type="button" class="btn-accent" id="contribute-feed-compose-add-image">添加图片</button>
                <input type="file" class="contribute-hidden-input" id="contribute-feed-compose-image-file" accept="image/*" />
              </div>
              <div class="contribute-field">
                <label>标签</label>
                <div class="contribute-tag-editor">
                  <div class="contribute-tags" id="contribute-feed-compose-tags"></div>
                  <input type="text" id="contribute-feed-compose-tag-input" class="contribute-tag-editor__input" maxlength="24" placeholder="输入标签后按回车添加，最多 10 个" />
                </div>
              </div>
              <p class="contribute-section-desc">动态发布后将出现在全站时间线</p>
            </form>
          </div>
        </div>

        <div class="contribute-subview" id="contribute-editor-view" hidden>
          <header class="contribute-subview__header app-no-drag">
            <button type="button" class="contribute-subview__back" id="contribute-editor-back">
              ${materialIcon('arrow_back')}
              <span>返回</span>
            </button>
            <h2 class="contribute-subview__heading" id="contribute-editor-heading">发布投稿</h2>
            <div class="contribute-subview__actions">
              <button type="button" class="btn-accent" id="contribute-editor-save">发布投稿</button>
            </div>
          </header>
          <div class="contribute-subview__body">
            <form class="contribute-form contribute-editor-form" id="contribute-editor-form" onsubmit="return false">
              <section class="contribute-editor-card" id="contribute-editor-video-only" hidden>
                <header class="contribute-editor-card__head">
                  <h3 class="contribute-editor-card__title">分P管理</h3>
                  <button type="button" class="btn-accent contribute-editor-card__action" id="contribute-editor-add-part">
                    ${materialIcon('add')}
                    <span>添加分P</span>
                  </button>
                </header>
                <div id="contribute-editor-video-parts"></div>
                <p class="contribute-editor-upload-progress" id="contribute-editor-upload-progress" hidden></p>
                <input type="file" class="contribute-hidden-input" id="contribute-editor-video-file" accept="video/*" />
              </section>

              <section class="contribute-editor-card">
                <h3 class="contribute-editor-card__title">基本信息</h3>
                <div class="contribute-editor-grid">
                  <div class="contribute-field contribute-field--full">
                    <label for="contribute-editor-title-input">标题</label>
                    <input type="text" id="contribute-editor-title-input" maxlength="30" placeholder="请输入标题（最多 30 字）" />
                  </div>
                  <div class="contribute-category-pickers contribute-field--full">
                    <div class="contribute-field">
                      <label for="contribute-editor-category-parent">大分区</label>
                      <select id="contribute-editor-category-parent">
                        <option value="">请选择大分区</option>
                      </select>
                    </div>
                    <div class="contribute-field">
                      <label for="contribute-editor-category">小分区</label>
                      <select id="contribute-editor-category">
                        <option value="">请选择小分区</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section class="contribute-editor-card" id="contribute-editor-content-card">
                <header class="contribute-editor-card__head">
                  <h3 class="contribute-editor-card__title" id="contribute-editor-content-label">正文</h3>
                </header>
                <div class="contribute-rich-editor app-no-drag" id="contribute-rich-editor">
                  <div id="contribute-editor-quill" class="contribute-rich-editor__host"></div>
                </div>
              </section>

              <section class="contribute-editor-card">
                <h3 class="contribute-editor-card__title">标签</h3>
                <div class="contribute-tag-editor">
                  <div class="contribute-tags" id="contribute-editor-tags"></div>
                  <input type="text" id="contribute-editor-tag-input" class="contribute-tag-editor__input" maxlength="24" placeholder="输入标签后按回车添加，最多 10 个" />
                </div>
              </section>

              <section class="contribute-editor-card">
                <h3 class="contribute-editor-card__title">封面</h3>
                <input type="hidden" id="contribute-editor-cover" />
                <div class="contribute-cover-row">
                  <div class="contribute-cover-preview" id="contribute-editor-cover-preview"></div>
                  <div class="contribute-cover-actions">
                    <label class="btn-accent" for="contribute-editor-cover-file">
                      ${materialIcon('photo_library')}
                      <span>从相册选择封面</span>
                    </label>
                    <input type="file" class="contribute-hidden-input" id="contribute-editor-cover-file" accept="image/*" />
                    <p class="contribute-field-hint" id="contribute-editor-cover-hint">视频投稿必须上传封面</p>
                  </div>
                </div>
              </section>

              <section class="contribute-editor-card contribute-editor-card--footer">
                <div class="contribute-editor-grid contribute-editor-grid--footer">
                  <div class="contribute-field">
                    <label for="contribute-editor-copyright">版权</label>
                    <select id="contribute-editor-copyright">
                      <option value="2">原创</option>
                      <option value="1">转载</option>
                      <option value="0">其他</option>
                    </select>
                  </div>
                  <div class="contribute-draft-row" id="contribute-editor-draft-row">
                    <input type="checkbox" id="contribute-editor-draft" />
                    <label for="contribute-editor-draft">仅存草稿，不直接发布</label>
                  </div>
                  <div class="contribute-field">
                    <label for="contribute-editor-series">所属合集</label>
                    <select id="contribute-editor-series">
                      <option value="">不加入合集</option>
                    </select>
                  </div>
                  <div class="contribute-schedule-row" id="contribute-editor-schedule-row">
                    <input type="checkbox" id="contribute-editor-schedule-enabled" />
                    <label for="contribute-editor-schedule-enabled">定时发布</label>
                    <input type="datetime-local" id="contribute-editor-schedule-time" class="contribute-schedule-row__time" hidden />
                  </div>
                </div>
              </section>
            </form>
          </div>
        </div>

        <div class="contribute-subview" id="contribute-detail-view" hidden>
          <header class="contribute-subview__header app-no-drag">
            <button type="button" class="contribute-subview__back" id="contribute-detail-back">
              ${materialIcon('arrow_back')}
              <span>返回</span>
            </button>
            <h2 class="contribute-subview__heading">投稿详情</h2>
            <div class="contribute-subview__actions">
              <button type="button" class="contribute-btn contribute-btn--ghost" id="contribute-detail-edit">编辑</button>
              <button type="button" class="contribute-btn contribute-btn--danger" id="contribute-detail-delete">删除</button>
            </div>
          </header>
          <div class="contribute-subview__body" id="contribute-detail-body"></div>
        </div>
      </div>
    </div>`;
}

export function feedPageHtml() {
  return `
    <div class="page-view page-view--feed" data-page="feed" hidden>
      <div class="feed-page">
        <aside class="feed-page__aside" aria-label="关注的人">
          <nav class="feed-page__aside-inner" id="feed-page-aside" data-auth-only hidden>
            <button type="button" class="feed-page__nav feed-page__nav--all is-active" data-feed-filter="all">
              ${materialIcon('auto_awesome', 'feed-page__nav-icon')}
              <span>关注动态</span>
            </button>
            <button type="button" class="feed-page__nav feed-page__nav--global" data-feed-filter="global">
              ${materialIcon('public', 'feed-page__nav-icon')}
              <span>全站动态</span>
            </button>
            <div class="feed-page__aside-divider" aria-hidden="true"></div>
            <div class="feed-page__follow-list" id="feed-page-follow-list"></div>
          </nav>
          <p class="feed-page__aside-guest" data-guest-only>登录后查看关注列表</p>
        </aside>
        <div class="feed-page__main">
          <header class="feed-page__toolbar app-no-drag" data-auth-only hidden>
            <h2 class="feed-page__toolbar-title">动态</h2>
            <button type="button" class="btn-accent feed-page__compose-btn" id="feed-page-compose-btn">
              ${materialIcon('edit_note', 'feed-page__compose-icon')}
              <span>发布动态</span>
            </button>
          </header>
          ${guestBanner('登录账号，查看你关注的 UP 主内容')}
          <div class="feed-page__stream">
            <div class="feed-page__scroll" id="feed-page-scroll">
              <div id="feed-page-list"></div>
              <p class="feed-page__hint" id="feed-page-hint" hidden></p>
            </div>
          </div>
          ${guestEmpty()}
        </div>
      </div>
    </div>`;
}

export function minePageHtml() {
  return `
    <div class="page-view page-view--mine" data-page="mine" hidden>
      <div class="mine-page">
        <div class="mine-page__head">
          <div class="mine-profile" data-guest-only>
            <button type="button" class="mine-profile__avatar" data-action="open-login" aria-label="登录">
              <img src="${DEFAULT_AVATAR}" alt="" />
            </button>
            <div class="mine-profile__info">
              <button type="button" class="mine-profile__login" data-action="open-login">点击登录</button>
              <p class="mine-profile__coins">喵币：-</p>
            </div>
            <div class="mine-profile__stats">
              <div><strong>-</strong><span>视频</span></div>
              <div><strong>-</strong><span>动态</span></div>
              <div><strong>-</strong><span>关注</span></div>
              <div><strong>-</strong><span>粉丝</span></div>
            </div>
            <button type="button" class="mine-profile__space" data-action="open-login">空间 &gt;</button>
          </div>
          <div class="mine-profile mine-profile--auth" data-auth-only hidden>
            <div class="mine-profile__avatar mine-profile__avatar--static">
              <img id="mine-avatar-img" src="${DEFAULT_AVATAR}" alt="" />
            </div>
            <div class="mine-profile__info">
              <p class="mine-profile__name" id="mine-display-name">Mfuns 用户</p>
              <p class="mine-profile__coins">喵币：<span id="mine-neko-coin">-</span></p>
            </div>
            <div class="mine-profile__stats">
              <div><strong id="mine-stat-videos">-</strong><span>视频</span></div>
              <div><strong id="mine-stat-feeds">-</strong><span>动态</span></div>
              <button type="button" class="mine-profile__stat-btn" id="mine-open-follows"><strong id="mine-stat-follows">-</strong><span>关注</span></button>
              <button type="button" class="mine-profile__stat-btn" id="mine-open-fans"><strong id="mine-stat-fans">-</strong><span>粉丝</span></button>
            </div>
            <button type="button" class="mine-profile__space" id="btn-open-my-space">空间 &gt;</button>
          </div>
          <div class="mine-sign-card" id="mine-sign-card" data-auth-only hidden></div>
        </div>

        <div class="mine-page__toolbar">
          <nav class="mine-tabs" aria-label="个人内容">
            <button type="button" class="mine-tabs__item is-active" data-mine-tab="history">历史记录</button>
            <button type="button" class="mine-tabs__item" data-mine-tab="offline">离线缓存</button>
            <button type="button" class="mine-tabs__item" data-mine-tab="favorite">我的收藏</button>
            <button type="button" class="mine-tabs__item" data-mine-tab="watchlater">稍后再看</button>
            <button type="button" class="mine-tabs__item" data-mine-tab="series">订阅合集</button>
          </nav>
          <label class="mine-search">
            ${materialIcon('search', 'mine-search__icon')}
            <input type="search" id="mine-history-search" placeholder="搜索你的历史记录" aria-label="搜索历史记录" />
          </label>
        </div>

        <div class="mine-page__body" id="mine-page-body">
          <div class="mine-history" id="mine-history-root"></div>
        </div>
        ${guestCenterBlock('你还未登录', '登录注册解锁更多精彩内容')}
      </div>
    </div>`;
}

export function watchPageHtml() {
  return `
    <div class="page-view page-view--watch" data-page="watch" hidden>
      <div class="watch-page" id="watch-page-root">
        <div class="watch-layout">
          <div class="watch-main">
            <header class="watch-toolbar app-no-drag">
              <button type="button" class="watch-back" id="watch-back-btn">
                ${materialIcon('arrow_back', 'watch-back-icon')}
                <span>返回</span>
              </button>
            </header>
            <div class="watch-player-wrap app-no-drag" id="watch-player-root">
              <video id="watch-player" class="watch-player" playsinline></video>
              <canvas class="watch-player__danmaku" id="watch-player-danmaku" aria-hidden="true"></canvas>
              <div class="watch-player__overlay" id="watch-player-overlay">
                <div class="watch-player__center">
                  <button type="button" class="watch-player__big-play" id="watch-player-big-play" aria-label="播放">
                    ${materialIcon('play_arrow', 'watch-player__big-play-icon')}
                  </button>
                </div>
                <p class="watch-player__loading" id="watch-player-loading" hidden>正在缓冲…</p>
                <p class="watch-player__error" id="watch-player-error" hidden></p>
                <div class="watch-player__bottom">
                  <div class="watch-player__progress-wrap">
                    <div class="watch-player__progress-track">
                      <div class="watch-player__progress-buffer" id="watch-player-buffer"></div>
                      <div class="watch-player__progress-played" id="watch-player-played"></div>
                      <input type="range" class="watch-player__progress" id="watch-player-progress" min="0" max="1000" value="0" aria-label="进度" />
                    </div>
                  </div>
                  <div class="watch-player__controls">
                    <div class="watch-player__controls-left">
                      <button type="button" class="watch-player__btn" id="watch-player-play" aria-label="播放/暂停">
                        ${materialIcon('play_arrow')}
                      </button>
                      <button type="button" class="watch-player__btn" id="watch-player-next" aria-label="下一P" hidden>
                        ${materialIcon('skip_next')}
                      </button>
                      <span class="watch-player__time" id="watch-player-time">00:00 / 00:00</span>
                    </div>
                    <div class="watch-danmaku-bar">
                      <button type="button" class="watch-danmaku-bar__toggle is-on" id="watch-danmaku-toggle" aria-label="弹幕开关" title="弹幕">
                        ${materialIcon('subtitles', 'watch-danmaku-bar__toggle-icon')}
                      </button>
                      <div class="watch-player__menu-wrap watch-danmaku-bar__menu">
                        <button type="button" class="watch-danmaku-bar__settings" id="watch-danmaku-settings-btn" aria-label="弹幕设置" title="弹幕设置">
                          ${materialIcon('tune')}
                        </button>
                        <div class="watch-player__popup-menu watch-danmaku-settings watch-danmaku-settings--panel" id="watch-danmaku-settings-menu" hidden>
                          <div class="watch-danmaku-compose" id="watch-danmaku-compose">
                            <p class="watch-danmaku-compose__label">颜色与位置</p>
                            <div class="watch-danmaku-compose__color-row">
                              <div class="watch-danmaku-compose__colors" id="watch-danmaku-compose-colors"></div>
                              <label class="watch-danmaku-compose__custom" title="自定义颜色">
                                <span class="sr-only">自定义颜色</span>
                                <input type="color" class="watch-danmaku-compose__picker" id="watch-danmaku-compose-custom" value="#ffffff" />
                              </label>
                            </div>
                            <div class="watch-danmaku-compose__types" id="watch-danmaku-compose-types"></div>
                          </div>
                          <button type="button" class="watch-danmaku-settings__action" id="watch-danmaku-open-list-btn">打开弹幕列表</button>
                          <label class="watch-danmaku-settings__row">
                            <span>不透明度</span>
                            <input type="range" id="watch-danmaku-opacity" min="20" max="100" value="85" />
                          </label>
                          <label class="watch-danmaku-settings__row">
                            <span>字号</span>
                            <input type="range" id="watch-danmaku-scale" min="60" max="160" value="100" />
                          </label>
                          <label class="watch-danmaku-settings__row">
                            <span>显示区域</span>
                            <input type="range" id="watch-danmaku-area" min="25" max="100" value="75" />
                          </label>
                        </div>
                      </div>
                      <div class="watch-danmaku-bar__input-wrap">
                        <span class="watch-danmaku-bar__input-prefix" aria-hidden="true">A</span>
                        <input type="text" class="watch-danmaku-bar__input" id="watch-danmaku-input" maxlength="100" placeholder="点击发送弹幕" autocomplete="off" />
                        <button type="button" class="watch-danmaku-bar__send" id="watch-danmaku-send" hidden>发送</button>
                      </div>
                    </div>
                    <div class="watch-player__controls-right">
                      <div class="watch-player__menu-wrap watch-player__quality-wrap">
                        <button type="button" class="watch-player__text-btn" id="watch-player-quality-btn">自动</button>
                        <div class="watch-player__popup-menu" id="watch-player-quality-menu" hidden></div>
                      </div>
                      <div class="watch-player__menu-wrap watch-player__speed-wrap">
                        <button type="button" class="watch-player__text-btn" id="watch-player-speed-btn">倍速</button>
                        <div class="watch-player__popup-menu" id="watch-player-speed-menu" hidden>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="2">2.0x</button>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="1.5">1.5x</button>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="1.25">1.25x</button>
                          <button type="button" class="watch-player__menu-item is-active" data-playback-rate="1">1.0x</button>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="0.75">0.75x</button>
                          <button type="button" class="watch-player__menu-item" data-playback-rate="0.5">0.5x</button>
                        </div>
                      </div>
                      <div class="watch-player__menu-wrap watch-player__volume-wrap">
                        <button type="button" class="watch-player__btn" id="watch-player-volume-btn" aria-label="音量">
                          ${materialIcon('volume_up')}
                        </button>
                        <div class="watch-player__volume-popup" id="watch-player-volume-popup" hidden>
                          <input type="range" class="watch-player__volume" id="watch-player-volume" min="0" max="100" value="70" aria-label="音量" />
                        </div>
                      </div>
                      <button type="button" class="watch-player__btn" id="watch-player-fullscreen" aria-label="全屏">
                        ${materialIcon('fullscreen')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <aside class="watch-side" id="watch-side-panel" aria-label="视频信息"></aside>
        </div>
      </div>
    </div>`;
}

export function articlePageHtml() {
  return `
    <div class="page-view page-view--article" data-page="article" hidden>
      <div class="article-page" id="article-page-root">
        <header class="article-toolbar app-no-drag">
          <button type="button" class="article-back" id="article-back-btn">
            ${materialIcon('arrow_back', 'article-back-icon')}
            <span>返回</span>
          </button>
        </header>
        <div class="article-scroll" id="article-scroll">
          <div class="article-body" id="article-body-root"></div>
        </div>
      </div>
    </div>`;
}

export function followListPageHtml() {
  return `
    <div class="page-view page-view--follow-list" data-page="follow-list" hidden>
      <div class="follow-list" id="follow-list-root">
        <header class="follow-list__bar app-no-drag">
          <button type="button" class="follow-list__back" id="follow-list-back">
            ${materialIcon('arrow_back', 'follow-list__back-icon')}
            <span>返回</span>
          </button>
          <h1 class="follow-list__bar-title" id="follow-list-title">关注</h1>
        </header>
        <div class="follow-list__scroll">
          <p class="follow-list__loading" id="follow-list-loading" hidden>${materialIcon('progress_activity', 'follow-list__spin')}加载中…</p>
          <div class="follow-list__grid" id="follow-list-grid"></div>
        </div>
      </div>
    </div>`;
}

export function spacePageHtml() {
  return `
    <div class="page-view page-view--space" data-page="space" hidden>
      <div class="user-space" id="user-space-root">
        <header class="user-space__bar app-no-drag">
          <button type="button" class="user-space__back" id="user-space-back">
            ${materialIcon('arrow_back')}
            <span>返回</span>
          </button>
          <span class="user-space__bar-title" id="user-space-bar-title">个人空间</span>
        </header>
        <div class="user-space__scroll" id="user-space-scroll">
          <div class="user-space__banner-wrap" id="user-space-banner-wrap">
            <div class="user-space__banner user-space__banner--ph"></div>
          </div>
          <div class="user-space__profile" id="user-space-profile"></div>
          <nav class="user-space__tabs" role="tablist" aria-label="空间内容">
            <button type="button" class="user-space__tab is-active" data-space-tab="video" role="tab">视频</button>
            <button type="button" class="user-space__tab" data-space-tab="feed" role="tab">动态</button>
            <button type="button" class="user-space__tab" data-space-tab="article" role="tab">文章</button>
            <button type="button" class="user-space__tab" data-space-tab="favorite" role="tab">收藏</button>
            <button type="button" class="user-space__tab" data-space-tab="series" role="tab">合集</button>
          </nav>
          <div class="user-space__body" id="user-space-body"></div>
        </div>
      </div>
    </div>`;
}

export function settingsPageHtml() {
  return `
    <div class="page-view page-view--settings" data-page="settings" hidden>
      <div class="settings-page">
        <div class="settings-page__grid">
          <div class="settings-page__main">
            <header class="settings-page__head">
              <h1 class="settings-page__title">设置</h1>
              <p class="settings-page__sub">账号资料与外观偏好</p>
            </header>
            <div id="settings-account-card" class="settings-account-card"></div>
            <hr class="settings-divider" aria-hidden="true" />

            <section
              class="settings-block settings-section"
              id="settings-section-profile"
              aria-labelledby="settings-profile-heading"
              hidden
            >
              <h2 class="settings-block__title" id="settings-profile-heading">个人资料</h2>
              <div class="settings-row settings-row--avatar">
                <div class="settings-row__label">
                  <span class="settings-row__title">头像</span>
                  <span class="settings-row__hint">支持 JPG、PNG，建议 200×200 以上</span>
                </div>
                <div class="settings-row__control">
                  <button type="button" class="settings-profile-avatar-btn" id="settings-avatar-btn" aria-label="更换头像">
                    <img class="settings-profile-avatar" id="settings-profile-avatar" src="assets/mfuns_logo.png" alt="" />
                    <span class="settings-profile-avatar-btn__mask">更换</span>
                  </button>
                  <input type="file" id="settings-avatar-input" accept="image/*" hidden />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span class="settings-row__title">昵称</span>
                </div>
                <div class="settings-row__control settings-row__control--inline">
                  <input type="text" class="settings-input" id="settings-profile-name" maxlength="24" autocomplete="nickname" />
                  <button type="button" class="btn-accent btn-accent--sm" id="btn-save-profile-name">保存</button>
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span class="settings-row__title">性别</span>
                </div>
                <div class="settings-row__control">
                  <div class="settings-radio-group" role="radiogroup" aria-label="性别">
                    <label class="settings-radio"><input type="radio" name="settings-profile-gender" value="0" checked /> 保密</label>
                    <label class="settings-radio"><input type="radio" name="settings-profile-gender" value="1" /> 男</label>
                    <label class="settings-radio"><input type="radio" name="settings-profile-gender" value="2" /> 女</label>
                  </div>
                </div>
              </div>
              <div class="settings-row settings-row--top">
                <div class="settings-row__label">
                  <span class="settings-row__title">个人简介</span>
                </div>
                <div class="settings-row__control settings-row__control--stack">
                  <textarea class="settings-textarea" id="settings-profile-bio" maxlength="70" rows="3" placeholder="填写个人简介"></textarea>
                  <button type="button" class="btn-accent btn-accent--sm settings-row__save" id="btn-save-profile-bio">保存</button>
                </div>
              </div>
            </section>

            <hr class="settings-divider" aria-hidden="true" />

            <section
              class="settings-block settings-section"
              id="settings-section-appearance"
              aria-labelledby="settings-appearance-heading"
            >
              <h2 class="settings-block__title" id="settings-appearance-heading">外观</h2>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span class="settings-row__title">主题模式</span>
                  <span class="settings-row__hint">（更改后即时生效）</span>
                </div>
                <div class="settings-row__control">
                  <select class="settings-select" id="setting-color-scheme">
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </div>
              </div>
              <div class="settings-row settings-row--top">
                <div class="settings-row__label">
                  <span class="settings-row__title">主题色</span>
                  <span class="settings-row__hint">保存在本机</span>
                </div>
                <div class="settings-row__control settings-row__control--stack">
                  <div class="field-row">
                    <input type="color" id="setting-accent-picker" />
                    <input type="text" class="settings-input" id="setting-accent-text" spellcheck="false" placeholder="rgb(123, 127, 247)" />
                  </div>
                  <button type="button" class="btn-secondary" id="btn-reset-accent">恢复默认主题色</button>
                </div>
              </div>
            </section>

            <hr class="settings-divider" aria-hidden="true" />

            <section class="settings-block settings-section" id="settings-section-account-extra" aria-labelledby="settings-account-extra-heading" hidden>
              <h2 class="settings-block__title" id="settings-account-extra-heading">账号与背包</h2>
              <div class="settings-row settings-row--top">
                <div class="settings-row__label">
                  <span class="settings-row__title">等级经验</span>
                  <span class="settings-row__hint">当前账号段位与经验</span>
                </div>
                <div class="settings-row__control settings-row__control--stack settings-level-panel">
                  <div id="settings-my-level" class="settings-my-level">加载中…</div>
                  <details class="settings-level-chart">
                    <summary>段位经验表</summary>
                    <ul class="settings-level-list" id="settings-level-sections"></ul>
                  </details>
                </div>
              </div>
              <div class="settings-row settings-row--top">
                <div class="settings-row__label">
                  <span class="settings-row__title">我的背包</span>
                </div>
                <div class="settings-row__control" id="settings-backpack-list">加载中…</div>
              </div>
            </section>

            <hr class="settings-divider" aria-hidden="true" />

            <section class="settings-block settings-section" id="settings-section-playback" aria-labelledby="settings-playback-heading">
              <h2 class="settings-block__title" id="settings-playback-heading">播放设置</h2>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span class="settings-row__title">默认清晰度</span>
                </div>
                <div class="settings-row__control">
                  <select class="settings-select" id="setting-default-quality">
                    <option value="auto">自动（最高）</option>
                    <option value="1080">1080P</option>
                    <option value="720">720P</option>
                    <option value="480">480P</option>
                    <option value="360">360P</option>
                  </select>
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span class="settings-row__title">弹幕显示</span>
                </div>
                <div class="settings-row__control">
                  <label class="settings-checkbox"><input type="checkbox" id="setting-danmaku-enabled" checked /> 开启弹幕</label>
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span class="settings-row__title">弹幕不透明度</span>
                </div>
                <div class="settings-row__control settings-row__control--inline">
                  <input type="range" id="setting-danmaku-opacity" min="20" max="100" value="100" />
                  <span id="setting-danmaku-opacity-label">100%</span>
                </div>
              </div>
            </section>

            <hr class="settings-divider" aria-hidden="true" />

            <section class="settings-block settings-section" id="settings-section-general" aria-labelledby="settings-general-heading">
              <h2 class="settings-block__title" id="settings-general-heading">常规设置</h2>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span class="settings-row__title">开机自启</span>
                  <span class="settings-row__hint">（仅桌面客户端）</span>
                </div>
                <div class="settings-row__control">
                  <label class="settings-checkbox"><input type="checkbox" id="setting-auto-launch" /> 登录系统时自动启动 Mfuns</label>
                </div>
              </div>
              <div id="settings-desktop-client-block" hidden>
                <div class="settings-row settings-row--top">
                  <div class="settings-row__label">
                    <span class="settings-row__title">禁用 GPU 加速</span>
                    <span class="settings-row__hint">界面异常或模糊时可尝试勾选，需重启应用</span>
                  </div>
                  <div class="settings-row__control settings-row__control--stack">
                    <label class="settings-checkbox"><input type="checkbox" id="setting-disable-gpu" /> 禁用 GPU 加速</label>
                    <button type="button" class="btn-secondary settings-row__save" id="setting-relaunch-app" hidden>重启应用</button>
                  </div>
                </div>
                <div class="settings-row settings-row--top">
                  <div class="settings-row__label">
                    <span class="settings-row__title">关闭主界面时</span>
                  </div>
                  <div class="settings-row__control settings-row__control--stack">
                    <div class="settings-radio-group" role="radiogroup" aria-label="关闭主界面时">
                      <label class="settings-radio">
                        <input type="radio" name="setting-close-action" value="tray" />
                        最小化到系统托盘
                      </label>
                      <label class="settings-radio">
                        <input type="radio" name="setting-close-action" value="quit" checked />
                        退出 Mfuns
                      </label>
                    </div>
                  </div>
                </div>
                <div class="settings-row">
                  <div class="settings-row__label">
                    <span class="settings-row__title">关闭时提示</span>
                    <span class="settings-row__hint">点击关闭按钮时弹出确认</span>
                  </div>
                  <div class="settings-row__control">
                    <label class="settings-checkbox"><input type="checkbox" id="setting-prompt-on-close" checked /> 关闭时提示</label>
                  </div>
                </div>
              </div>
            </section>

            <hr class="settings-divider" aria-hidden="true" />

            <section class="settings-block settings-section" id="settings-section-cache" aria-labelledby="settings-cache-heading">
              <h2 class="settings-block__title" id="settings-cache-heading">缓存管理</h2>
              <div class="settings-row settings-row--top">
                <div class="settings-row__label">
                  <span class="settings-row__title">离线缓存</span>
                  <span class="settings-row__hint" id="settings-offline-usage">计算中…</span>
                </div>
                <div class="settings-row__control settings-row__control--stack">
                  <button type="button" class="btn-secondary" id="btn-clear-offline-cache">清空离线视频</button>
                </div>
              </div>
              <div class="settings-row settings-row--top">
                <div class="settings-row__label">
                  <span class="settings-row__title">稍后再看</span>
                  <span class="settings-row__hint">本机列表</span>
                </div>
                <div class="settings-row__control">
                  <button type="button" class="btn-secondary" id="btn-clear-watch-later">清空稍后再看</button>
                </div>
              </div>
            </section>

            <hr class="settings-divider" aria-hidden="true" />

            <section class="settings-block settings-section" id="settings-section-shortcuts" aria-labelledby="settings-shortcuts-heading">
              <h2 class="settings-block__title" id="settings-shortcuts-heading">快捷键</h2>
              <ul class="settings-shortcuts">
                <li><kbd>Space</kbd><span>播放 / 暂停</span></li>
                <li><kbd>F</kbd><span>全屏</span></li>
                <li><kbd>M</kbd><span>静音</span></li>
                <li><kbd>←</kbd> / <kbd>→</kbd><span>快退 / 快进 5 秒</span></li>
                <li><kbd>↑</kbd> / <kbd>↓</kbd><span>音量加减</span></li>
              </ul>
            </section>

            <hr class="settings-divider" aria-hidden="true" />

            <section class="settings-block settings-section" id="settings-section-about" aria-labelledby="settings-about-heading">
              <h2 class="settings-block__title" id="settings-about-heading">关于 Mfuns</h2>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span class="settings-row__title">版本</span>
                </div>
                <div class="settings-row__control" id="settings-app-version">-</div>
              </div>
              <p class="settings-about__text">Mfuns 桌面客户端 · 社区 API <code>api.mfuns.net</code></p>
            </section>
          </div>
          <nav class="settings-anchor" aria-label="设置目录">
            <ul class="settings-anchor__list">
              <li><a class="settings-anchor__link" href="#settings-section-profile" data-settings-anchor="profile">个人资料</a></li>
              <li><a class="settings-anchor__link" href="#settings-section-account-extra" data-settings-anchor="account-extra">账号与背包</a></li>
              <li><a class="settings-anchor__link is-active" href="#settings-section-appearance" data-settings-anchor="appearance">外观</a></li>
              <li><a class="settings-anchor__link" href="#settings-section-playback" data-settings-anchor="playback">播放设置</a></li>
              <li><a class="settings-anchor__link" href="#settings-section-general" data-settings-anchor="general">常规设置</a></li>
              <li><a class="settings-anchor__link" href="#settings-section-cache" data-settings-anchor="cache">缓存管理</a></li>
              <li><a class="settings-anchor__link" href="#settings-section-shortcuts" data-settings-anchor="shortcuts">快捷键</a></li>
              <li><a class="settings-anchor__link" href="#settings-section-about" data-settings-anchor="about">关于</a></li>
            </ul>
          </nav>
        </div>
      </div>
    </div>`;
}

export function getCurrentPage() {
  return currentPage;
}

/** @param {PageId} pageId @param {{ skipEnter?: boolean }} [options] */
export function setPage(pageId, options = {}) {
  const { skipEnter = false } = options;
  if (currentPage === 'watch' && pageId !== 'watch') {
    destroyWatchPlayer();
  }
  currentPage = pageId;

  document.querySelectorAll('.page-view').forEach((el) => {
    el.hidden = el.getAttribute('data-page') !== pageId;
  });

  document.querySelectorAll('.sidebar__main [data-nav]').forEach((el) => {
    el.classList.toggle('is-active', el.getAttribute('data-nav') === pageId);
  });

  document.querySelectorAll('[data-sidebar-tool]').forEach((el) => {
    const tool = el.getAttribute('data-sidebar-tool');
    el.classList.toggle(
      'is-active',
      (pageId === 'settings' && tool === 'settings') ||
        (pageId === 'message' && tool === 'message') ||
        (pageId === 'contribute' && tool === 'upload'),
    );
  });

  const main = document.getElementById('main-content');
  main?.classList.toggle('content--home', pageId === 'home');
  main?.classList.toggle('content--feed', pageId === 'feed');
  main?.classList.toggle('content--mine', pageId === 'mine');
  main?.classList.toggle('content--settings', pageId === 'settings');
  main?.classList.toggle('content--watch', pageId === 'watch');
  main?.classList.toggle('content--article', pageId === 'article');
  main?.classList.toggle('content--space', pageId === 'space');
  main?.classList.toggle('content--follow-list', pageId === 'follow-list');
  main?.classList.toggle('content--search', pageId === 'search');
  main?.classList.toggle('content--tag', pageId === 'tag');
  main?.classList.toggle('content--message', pageId === 'message');
  main?.classList.toggle('content--contribute', pageId === 'contribute');
  main?.classList.toggle('content--sign', pageId === 'sign');
  main?.classList.toggle('content--series', pageId === 'series');

  const homeTabs = document.getElementById('topbar-tabs-home');
  homeTabs?.toggleAttribute('hidden', pageId !== 'home');

  document
    .querySelector('.btn-refresh')
    ?.toggleAttribute(
      'hidden',
      pageId === 'watch' ||
        pageId === 'article' ||
        pageId === 'space' ||
        pageId === 'follow-list' ||
        pageId === 'tag' ||
        pageId === 'message' ||
        pageId === 'contribute' ||
        pageId === 'sign' ||
        pageId === 'series' ||
        pageId === 'feed',
    );

  syncPagesAuthState();

  if (skipEnter) return;

  if (pageId === 'search') {
    void import('./search-page.js').then((mod) => mod.onSearchPageEnter());
  }
  if (pageId === 'tag') {
    void import('./tag-page.js').then((mod) => mod.onTagPageEnter());
  }
  if (pageId === 'mine') {
    void import('./mine-page.js').then((mod) => mod.onMinePageEnter());
  }
  if (pageId === 'feed') {
    void import('./feed-page.js').then((mod) => mod.onFeedPageEnter());
  }
  if (pageId === 'message') {
    void import('./message-page.js').then((mod) => mod.onMessagePageEnter());
  }
  if (pageId === 'sign') {
    void import('./sign-page.js').then((mod) => mod.onSignPageEnter());
  }
  if (pageId === 'series') {
    void import('./series-page.js').then((mod) => mod.onSeriesPageEnter());
  }
  if (pageId === 'contribute') {
    void import('./contribute-page.js').then((mod) => mod.onContributePageEnter());
  }
}

export function syncPagesAuthState() {
  const session = loadSession();
  const loggedIn = Boolean(session?.token);

  document.querySelectorAll('[data-guest-only]').forEach((el) => {
    el.hidden = loggedIn;
  });
  document.querySelectorAll('[data-auth-only]').forEach((el) => {
    el.hidden = !loggedIn;
  });

  const nameEl = document.getElementById('mine-display-name');
  const imgEl = /** @type {HTMLImageElement | null} */ (document.getElementById('mine-avatar-img'));
  if (loggedIn && nameEl) {
    nameEl.textContent = userDisplayName(session?.user);
  }
  if (loggedIn && imgEl) {
    imgEl.src = userAvatarMediaSrc(session?.user) || DEFAULT_AVATAR;
  }
}

export function bindOpenLoginTriggers(root = document) {
  root.querySelectorAll('[data-action="open-login"]').forEach((el) => {
    el.addEventListener('click', () => {
      document.getElementById('btn-open-login')?.click();
    });
  });
}
