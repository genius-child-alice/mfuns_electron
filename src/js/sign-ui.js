import { materialIcon } from './icons.js';
import { isLoggedIn, requireLogin } from './login-ui.js';
import { navigateTo } from './navigation.js';
import { fetchSignAccumulatedAwards, fetchSignInfo } from './sign-api.js';

export function openSignPage() {
  if (!requireLogin()) return;
  void navigateTo('sign');
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
  card.innerHTML = `
    <button type="button" class="mine-sign-entry" id="mine-sign-open">
      ${materialIcon('event_available', 'mine-sign-entry__icon')}
      <span class="mine-sign-entry__text">
        <span class="mine-sign-entry__title">每日签到</span>
        <span class="mine-sign-entry__meta" id="mine-sign-entry-meta">加载中…</span>
      </span>
      <span class="mine-sign-entry__action" id="mine-sign-entry-action">签到</span>
      ${materialIcon('chevron_right', 'mine-sign-entry__chevron')}
    </button>`;

  document.getElementById('mine-sign-open')?.addEventListener('click', () => {
    openSignPage();
  });

  try {
    const info = await fetchSignInfo();
    const meta = document.getElementById('mine-sign-entry-meta');
    const action = document.getElementById('mine-sign-entry-action');
    if (meta) {
      meta.textContent = `本月 ${info.monthTimes} 天 · 累计 ${info.allTimes} 天`;
    }
    if (action) {
      action.textContent = info.signedToday ? '今日已签到' : '去签到';
      action.classList.toggle('is-done', info.signedToday);
    }
  } catch {
    const meta = document.getElementById('mine-sign-entry-meta');
    if (meta) meta.textContent = '点击查看签到详情';
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
