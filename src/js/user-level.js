/** 与 Flutter `user_profile_page.dart` 一致：level_id 1–10 → D … S+ */

export const LEVEL_RANKS = ['D', 'D+', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+'];

/** @type {Record<string, string>} */
const LEVEL_COLORS = {
  'S': '#E6A23C',
  'S+': '#E6A23C',
  'A': '#E04F4F',
  'A+': '#E04F4F',
  'B': '#4F7FE0',
  'B+': '#4F7FE0',
  'C': '#4FA36C',
  'C+': '#4FA36C',
  D: '#8A9096',
  'D+': '#8A9096',
};

/**
 * @param {number | null | undefined} levelId
 */
export function levelLabelFromId(levelId) {
  if (levelId == null || !Number.isFinite(levelId)) return '';
  const id = Math.trunc(levelId);
  if (id >= 1 && id <= LEVEL_RANKS.length) return LEVEL_RANKS[id - 1];
  return `Lv.${id}`;
}

/**
 * @param {string} label
 */
export function levelColorFromLabel(label) {
  return LEVEL_COLORS[label] ?? '#8A9096';
}

/**
 * @param {number | null | undefined} levelId
 */
export function levelColorFromId(levelId) {
  return levelColorFromLabel(levelLabelFromId(levelId));
}

/**
 * @param {unknown} value
 */
export function levelFromBadges(value) {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    let id = null;
    if (entry && typeof entry === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (entry);
      const raw = obj.badge_id ?? obj.id;
      id = Number.parseInt(`${raw ?? ''}`, 10);
    } else {
      id = Number.parseInt(`${entry ?? ''}`, 10);
    }
    if (Number.isFinite(id) && id >= 1 && id <= 10) return id;
  }
  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} user
 */
export function resolveUserLevelId(user) {
  if (!user) return null;
  const explicit = Number.parseInt(`${user.level_id ?? user.level ?? ''}`, 10);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return levelFromBadges(user.badges);
}

/**
 * @param {number | null | undefined} exp
 */
export function formatExperience(exp) {
  if (exp == null || !Number.isFinite(exp)) return '—';
  return `${Math.trunc(exp)}`;
}

/**
 * @param {{
 *   levelId: number | null | undefined,
 *   exp?: number | null,
 *   className?: string,
 *   showExp?: boolean,
 * }} options
 */
export function renderLevelBadgeHtml(options) {
  const { levelId, exp, className = '', showExp = true } = options;
  if (levelId == null || levelId < 1) return '';
  const label = levelLabelFromId(levelId);
  if (!label) return '';
  const color = levelColorFromLabel(label);
  const extraClass = className ? ` ${className}` : '';
  const expHtml =
    showExp && exp != null && Number.isFinite(exp)
      ? `<span class="user-level-badge__sep" aria-hidden="true"></span><span class="user-level-badge__exp">经验 ${formatExperience(exp)}</span>`
      : '';
  return `<span class="user-level-badge${extraClass}" style="--level-color: ${color}" title="段位 ${label}"><span class="user-level-badge__rank">${label}</span>${expHtml}</span>`;
}

/**
 * @param {number} exp
 * @param {number | null | undefined} levelId
 * @param {import('./user-profile-api.js').LevelSection[]} sections
 */
export function levelProgressHint(exp, levelId, sections) {
  if (levelId == null || levelId < 1 || !Array.isArray(sections) || sections.length === 0) {
    return { text: '', percent: 0 };
  }
  const sorted = [...sections].sort((a, b) => a.levelId - b.levelId);
  const current = sorted.find((s) => s.levelId === levelId);
  const next = sorted.find((s) => s.levelId === levelId + 1);
  if (!next) {
    return { text: '已达最高段位 S+', percent: 100 };
  }
  const floor = current?.experience ?? 0;
  const ceiling = next.experience;
  const span = Math.max(1, ceiling - floor);
  const gained = Math.max(0, exp - floor);
  const percent = Math.min(100, Math.round((gained / span) * 100));
  const need = Math.max(0, ceiling - exp);
  const nextLabel = levelLabelFromId(next.levelId);
  return {
    text: `距 ${nextLabel} 还需 ${need} 经验`,
    percent,
  };
}

/**
 * @param {import('./user-profile-api.js').LevelSection[]} sections
 */
export function renderLevelSectionsListHtml(sections) {
  if (!sections.length) return '';
  return sections
    .map((item) => {
      const label = levelLabelFromId(item.levelId);
      const color = levelColorFromLabel(label);
      return `<li class="settings-level-list__item" style="--level-color: ${color}">
        <span class="settings-level-list__rank">${label}</span>
        <span class="settings-level-list__exp">经验 ≥ ${item.experience}</span>
      </li>`;
    })
    .join('');
}
