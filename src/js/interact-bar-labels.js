/**
 * @param {number} n
 */
export function formatInteractCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

/**
 * @param {number} rewardCount
 */
export function coinInteractLabel(rewardCount) {
  return rewardCount > 0 ? formatInteractCount(rewardCount) : '投币';
}

/**
 * @param {number} favoriteCount
 * @param {boolean} favorited
 */
export function favoriteInteractLabel(favoriteCount, favorited) {
  if (favoriteCount > 0) return formatInteractCount(favoriteCount);
  return favorited ? '已收藏' : '收藏';
}
