import { renderFramedAvatarHtml } from './avatar-frame-ui.js';
import { confirmAction } from './confirm-dialog.js';
import { materialIcon } from './icons.js';
import { requireLogin } from './login-ui.js';
import { notify } from './notice-ui.js';
import {
  getScrollTop,
  navigateBack,
  navigateReplace,
  registerPageNavigation,
  restoreScrollTop,
} from './navigation.js';
import { openUserSpace } from './user-space.js';
import {
  fetchSignAccumulatedAwards,
  fetchSignInfo,
  fetchSignRankToday,
  performSignIn,
  signAgain,
} from './sign-api.js';
import { renderLevelBadgeHtml } from './user-level.js';

/** @type {string} */
let todayRewardHint = '';

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
 * @param {number} year
 * @param {number} month 1-12
 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * @param {string} msg
 */
function parseRewardHint(msg) {
  const parts = [];
  const coin = msg.match(/(\d+)\s*喵币/);
  const exp = msg.match(/(\d+)\s*经验/);
  if (coin) parts.push(`${coin[1]} 喵币`);
  if (exp) parts.push(`${exp[1]} 经验`);
  return parts.length ? parts.join(' · ') : msg.trim();
}

/**
 * @param {import('./sign-api.js').SignInfo} info
 */
function renderCalendarHtml(info) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();
  const total = daysInMonth(year, month);
  const signed = new Set(info.signedDays);
  const pad = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

  const headers = weekdays
    .map((label) => `<span class="sign-cal__weekday">${label}</span>`)
    .join('');
  const blanks = Array.from({ length: pad }, () => '<span class="sign-cal__cell sign-cal__cell--empty"></span>').join(
    '',
  );
  const cells = [];
  for (let day = 1; day <= total; day += 1) {
    const isSigned = signed.has(day);
    const isToday = day === today;
    const isPast = day < today;
    const canMakeup = isPast && !isSigned;
    const classes = [
      'sign-cal__cell',
      isSigned ? 'is-signed' : '',
      isToday ? 'is-today' : '',
      canMakeup ? 'is-makeup' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const attrs = canMakeup ? ` data-sign-makeup="${day}" role="button" tabindex="0"` : '';
    cells.push(`<span class="${classes}"${attrs}>${day}</span>`);
  }

  return `
    <section class="sign-card sign-card--calendar" aria-label="签到记录">
      <h2 class="sign-card__title">签到记录</h2>
      <p class="sign-card__subtitle">${year} 年 ${month} 月</p>
      <div class="sign-cal">
        <div class="sign-cal__head">${headers}</div>
        <div class="sign-cal__grid">${blanks}${cells.join('')}</div>
      </div>
      <p class="sign-card__hint">点击过去未签日期可使用补签卡补签</p>
    </section>`;
}

/**
 * @param {{ day: number, awards: import('./sign-api.js').SignAward[] }[]} awards
 * @param {number} monthTimes
 */
function renderAwardsHtml(awards, monthTimes) {
  if (!awards.length) {
    return `
      <section class="sign-card sign-card--awards">
        <h2 class="sign-card__title">本月累计签到奖励</h2>
        <p class="sign-card__empty">暂无奖励配置</p>
      </section>`;
  }
  const rows = awards
    .map(({ day, awards: items }) => {
      const met = monthTimes >= day;
      const rewardText = items.map((a) => escapeHtml(a.desc)).join(' · ');
      const status = met
        ? '<span class="sign-award__status is-met">已达成</span>'
        : '<span class="sign-award__status">未达到要求</span>';
      return `
        <div class="sign-award__row">
          <div class="sign-award__main">
            <span class="sign-award__day">第 ${day} 天</span>
            <span class="sign-award__desc">${rewardText}</span>
          </div>
          ${status}
        </div>`;
    })
    .join('');
  return `
    <section class="sign-card sign-card--awards">
      <h2 class="sign-card__title">本月累计签到奖励</h2>
      <div class="sign-award__list">${rows}</div>
    </section>`;
}

/**
 * @param {import('./sign-api.js').SignRankEntry[]} list
 */
function renderRankHtml(list) {
  if (!list.length) {
    return '<p class="sign-rank__empty">今天还没有人签到</p>';
  }
  return list
    .map((entry, index) => {
      const rank = index + 1;
      const timeLabel = entry.time ? `${escapeHtml(entry.time)} 签到` : '今日已签到';
      const badge = renderLevelBadgeHtml({ levelId: entry.levelId, showExp: false });
      return `
        <div class="sign-rank__item">
          <button type="button" class="sign-rank__avatar-btn" data-author-profile="${entry.userId}" title="进入主页">
            ${renderFramedAvatarHtml({
              avatar: entry.avatar,
              frame: entry.avatarFrame,
              size: 'rank',
              imgClass: 'sign-rank__avatar',
              phClass: 'sign-rank__avatar--ph',
            })}
          </button>
          <div class="sign-rank__info">
            <div class="sign-rank__name-row">
              <button type="button" class="sign-rank__name" data-author-profile="${entry.userId}">${escapeHtml(entry.userName)}</button>
              ${badge}
            </div>
            <p class="sign-rank__meta">
              <span>${timeLabel}</span>
              <span>累计签到 ${entry.count} 天</span>
            </p>
          </div>
          <span class="sign-rank__place">第 ${rank} 名</span>
        </div>`;
    })
    .join('');
}

/**
 * @param {import('./sign-api.js').SignInfo} info
 * @param {import('./sign-api.js').SignRankEntry[]} rank
 * @param {{ day: number, awards: import('./sign-api.js').SignAward[] }[]} awards
 */
function renderSignPageBody(info, rank, awards) {
  const rewardLine = todayRewardHint
    ? `今日奖励：${escapeHtml(todayRewardHint)}`
    : '完成签到即可领取今日奖励';
  const btnLabel = info.signedToday ? '今日已签到' : '立即签到';
  const btnDisabled = info.signedToday ? ' disabled' : '';

  return `
    <div class="sign-page__layout">
      <div class="sign-page__main">
        <section class="sign-hero">
          <div class="sign-hero__text">
            <h2 class="sign-hero__title">签到</h2>
            <p class="sign-hero__stats">
              已累计签到 <strong>${info.allTimes}</strong> 天，本月已签到 <strong>${info.monthTimes}</strong> 天
            </p>
            <p class="sign-hero__reward">${rewardLine}</p>
          </div>
          <button type="button" class="sign-hero__btn btn-accent" id="sign-page-sign-btn"${btnDisabled}>
            ${escapeHtml(btnLabel)}
          </button>
        </section>
        ${renderCalendarHtml(info)}
        ${renderAwardsHtml(awards, info.monthTimes)}
      </div>
      <aside class="sign-page__aside">
        <section class="sign-card sign-card--rank">
          <h2 class="sign-card__title">签到排行</h2>
          <div class="sign-rank" id="sign-page-rank">${renderRankHtml(rank)}</div>
        </section>
      </aside>
    </div>`;
}

function bindSignButton() {
  document.getElementById('sign-page-sign-btn')?.addEventListener('click', async () => {
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('sign-page-sign-btn'));
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      const msg = await performSignIn();
      todayRewardHint = parseRewardHint(msg) || todayRewardHint;
      notify(msg || '签到成功', 'success');
      await onSignPageEnter();
      void import('./sign-ui.js').then((mod) => mod.refreshSignCard());
    } catch (err) {
      notify(err instanceof Error ? err.message : '签到失败', 'error');
      btn.disabled = false;
    }
  });
}

export function bindSignPage() {
  document.getElementById('sign-page-back')?.addEventListener('click', () => {
    void navigateBack().then(() => {
      void import('./sign-ui.js').then((mod) => mod.refreshSignCard());
    });
  });

  document.getElementById('sign-page-body')?.addEventListener('click', async (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const profileBtn = target.closest('[data-author-profile]');
    if (profileBtn instanceof HTMLElement) {
      const uid = Number.parseInt(profileBtn.getAttribute('data-author-profile') ?? '', 10);
      if (Number.isFinite(uid) && uid > 0) openUserSpace(uid);
      return;
    }
    const cell = target.closest('[data-sign-makeup]');
    if (!cell) return;
    const day = Number.parseInt(cell.getAttribute('data-sign-makeup') ?? '', 10);
    if (!Number.isFinite(day)) return;
    const ok = await confirmAction({
      title: '补签确认',
      message: `将使用一张补签卡补签本月 ${day} 日，确定吗？`,
      confirmText: '补签',
    });
    if (!ok) return;
    try {
      await signAgain(day);
      notify('补签成功', 'success');
      await onSignPageEnter();
      void import('./sign-ui.js').then((mod) => mod.refreshSignCard());
    } catch (err) {
      notify(err instanceof Error ? err.message : '补签失败', 'error');
    }
  });

  registerPageNavigation('sign', {
    capture: () => ({
      bodyHtml: document.getElementById('sign-page-body')?.innerHTML ?? '',
      scrollTop: getScrollTop('main-content'),
    }),
    restore: (state) => {
      const body = document.getElementById('sign-page-body');
      if (body) body.innerHTML = `${state.bodyHtml ?? ''}`;
      restoreScrollTop('main-content', Number(state.scrollTop) || 0);
    },
    enter: () => onSignPageEnter(),
  });
}

export async function onSignPageEnter() {
  const body = document.getElementById('sign-page-body');
  if (!body) return;
  if (!requireLogin()) {
    void navigateReplace('mine');
    return;
  }
  body.innerHTML = `<p class="sign-page__status">${materialIcon('progress_activity', 'sign-page__spin')}加载签到信息…</p>`;
  try {
    const [info, rank, awards] = await Promise.all([
      fetchSignInfo(),
      fetchSignRankToday(),
      fetchSignAccumulatedAwards(),
    ]);
    body.innerHTML = renderSignPageBody(info, rank, awards);
    bindSignButton();
  } catch {
    body.innerHTML = '<p class="sign-page__status sign-page__status--error">签到信息加载失败，请稍后重试</p>';
  }
}
