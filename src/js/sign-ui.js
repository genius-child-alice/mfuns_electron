import { mediaSrcForCover } from './content-api.js';
import { materialIcon } from './icons.js';
import { isLoggedIn } from './login-ui.js';
import { notify } from './notice-ui.js';
import {
  fetchSignAccumulatedAwards,
  fetchSignInfo,
  fetchSignRankToday,
  performSignIn,
} from './sign-api.js';

/**
 * @param {number} year
 * @param {number} month 1-12
 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * @param {number[]} signedDays
 */
function renderSignCalendar(signedDays) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();
  const total = daysInMonth(year, month);
  const signed = new Set(signedDays);

  const cells = [];
  for (let day = 1; day <= total; day += 1) {
    const isSigned = signed.has(day);
    const isToday = day === today;
    cells.push(
      `<span class="mine-sign__day${isSigned ? ' is-signed' : ''}${isToday ? ' is-today' : ''}" title="${month}月${day}日">${day}</span>`,
    );
  }
  return cells.join('');
}

/**
 * @param {import('./sign-api.js').SignInfo} info
 */
function renderSignCard(info) {
  const now = new Date();
  return `
    <div class="mine-sign">
      <div class="mine-sign__head">
        <div>
          <h3 class="mine-sign__title">每日签到</h3>
          <p class="mine-sign__meta">本月 ${info.monthTimes} 天 · 累计 ${info.allTimes} 天</p>
        </div>
        <button type="button" class="btn-accent btn-accent--sm" id="mine-sign-btn">签到</button>
      </div>
      <div class="mine-sign__calendar" aria-label="${now.getMonth() + 1}月签到日历">
        ${renderSignCalendar(info.signedDays)}
      </div>
      <details class="mine-sign__details">
        <summary>今日签到榜</summary>
        <div class="mine-sign__rank" id="mine-sign-rank">加载中…</div>
      </details>
    </div>`;
}

async function loadSignRank() {
  const rankEl = document.getElementById('mine-sign-rank');
  if (!rankEl) return;
  try {
    const list = await fetchSignRankToday();
    if (!list.length) {
      rankEl.innerHTML = '<p class="mine-sign__rank-empty">暂无排行</p>';
      return;
    }
    rankEl.innerHTML = list
      .slice(0, 8)
      .map((entry, index) => {
        const avatar = mediaSrcForCover(entry.avatar);
        return `
          <div class="mine-sign__rank-item">
            <span class="mine-sign__rank-no">${index + 1}</span>
            ${
              avatar
                ? `<img class="mine-sign__rank-avatar" src="${avatar}" alt="" />`
                : '<span class="mine-sign__rank-avatar mine-sign__rank-avatar--ph"></span>'
            }
            <span class="mine-sign__rank-name">${entry.userName}</span>
            <span class="mine-sign__rank-count">${entry.count} 天</span>
          </div>`;
      })
      .join('');
  } catch {
    rankEl.innerHTML = '<p class="mine-sign__rank-empty">排行加载失败</p>';
  }
}

export async function refreshSignCard() {
  const card = document.getElementById('mine-sign-card');
  if (!card) return;
  if (!isLoggedIn()) {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }
  card.hidden = false;
  card.innerHTML = `${materialIcon('progress_activity', 'mine-history__spin')}加载签到…`;
  try {
    const info = await fetchSignInfo();
    card.innerHTML = renderSignCard(info);
    document.getElementById('mine-sign-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('mine-sign-btn');
      if (btn) btn.disabled = true;
      try {
        const msg = await performSignIn();
        notify(msg || '签到成功', 'success');
        await refreshSignCard();
      } catch (err) {
        notify(err instanceof Error ? err.message : '签到失败', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    card.querySelector('.mine-sign__details')?.addEventListener('toggle', (event) => {
      const details = /** @type {HTMLDetailsElement} */ (event.currentTarget);
      if (details.open) void loadSignRank();
    });
  } catch {
    card.innerHTML = '<p class="mine-sign__error">签到信息加载失败</p>';
  }
}

export async function prefetchSignAwards() {
  if (!isLoggedIn()) return;
  try {
    await fetchSignAccumulatedAwards();
  } catch {
    /* 预取奖励配置，失败忽略 */
  }
}
