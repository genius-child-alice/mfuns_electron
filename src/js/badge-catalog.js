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
