/** 与官网 MBadge 组件一致（resource.mfuns.net main-site） */

/** @type {Record<number, string>} */
export const BADGE_LABELS = {
  1: 'D',
  2: 'D+',
  3: 'C',
  4: 'C+',
  5: 'B',
  6: 'B+',
  7: 'A',
  8: 'A+',
  9: 'S',
  10: '未知领域',
  11: '花好月圆',
  12: '虎年大吉',
  13: '纯爱战士',
  14: '爱国者',
  15: 'NTR达人',
  16: 'NTR冠军',
  17: '靓号',
  18: '金皮卡',
  19: '月曼中秋',
  20: '喵爪印记',
  21: '劳动节',
};

/**
 * @param {number | null | undefined} badgeId
 * @param {number} [width]
 */
export function badgeImageUrl(badgeId, width = 120) {
  if (badgeId == null || !Number.isFinite(badgeId) || badgeId <= 0) return null;
  const id = Math.trunc(badgeId);
  return `https://resource.mfuns.net/image/badge/${id}.png?image_process=resize,w_${width}`;
}

/**
 * @param {number | null | undefined} badgeId
 */
export function badgeLabelFromId(badgeId) {
  if (badgeId == null || !Number.isFinite(badgeId)) return '';
  const id = Math.trunc(badgeId);
  return BADGE_LABELS[id] ?? `勋章 ${id}`;
}

/**
 * @param {unknown} value
 * @returns {number[]}
 */
export function parseUserBadgeIds(value) {
  if (!Array.isArray(value)) return [];
  /** @type {number[]} */
  const ids = [];
  for (const entry of value) {
    let id = null;
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      id = Math.trunc(entry);
    } else if (entry && typeof entry === 'object') {
      const row = /** @type {Record<string, unknown>} */ (entry);
      const raw = row.id ?? row.badge_id;
      id = Number.parseInt(`${raw ?? ''}`, 10);
      if (!Number.isFinite(id)) id = null;
    } else {
      id = Number.parseInt(`${entry ?? ''}`, 10);
      if (!Number.isFinite(id)) id = null;
    }
    if (id != null && id > 0) ids.push(id);
  }
  return ids.slice(0, 5);
}

/**
 * @param {string} text
 */
function escapeAttr(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * 与官网 MBadge（sm）一致：最多 5 枚，30px 图。
 * @param {number[]} badgeIds
 * @param {'sm' | 'md'} [size]
 */
export function renderUserBadgesHtml(badgeIds, size = 'sm') {
  if (!Array.isArray(badgeIds) || badgeIds.length === 0) return '';
  const width = size === 'md' ? 60 : 30;
  const items = badgeIds
    .slice(0, 5)
    .map((badgeId) => {
      const id = Math.trunc(badgeId);
      const label = badgeLabelFromId(id);
      const src = badgeImageUrl(id, width);
      if (!src) return '';
      return `<span class="m-badge__item watch-comment__badge-item" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"><img src="${escapeAttr(src)}" alt="" width="${width}" height="${width}" loading="lazy" /></span>`;
    })
    .filter(Boolean)
    .join('');
  if (!items) return '';
  return `<span class="m-badge m-badge--${size} watch-comment__badges">${items}</span>`;
}
