import {
  apiGet,
  parseContentPreview,
  parsePreviewList,
  resolveCoverUrl,
} from './content-api.js';

/** @typedef {{
 *   id: number,
 *   name: string,
 *   avatar: string | null,
 *   banner: string | null,
 *   bio: string,
 *   gender: string,
 *   level: number | null,
 *   exp: number | null,
 *   fans: number,
 *   follows: number,
 *   totalLikes: number,
 * }} UserProfile */

/** @typedef {{
 *   id: number,
 *   title: string,
 *   rawTitle: string,
 *   content: string,
 *   rawContent: string,
 *   createdAt: string | null,
 *   likes: number,
 *   comments: number,
 *   reposts: number,
 *   views: number,
 *   pinned: boolean,
 *   authorName: string,
 *   authorAvatar: string | null,
 *   images: string[],
 *   resource: import('./content-api.js').ContentPreview | null,
 * }} TimelineFeedItem */

/**
 * @param {unknown} value
 */
function asMap(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @param {unknown} value
 */
function asInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const n = Number.parseInt(`${value ?? ''}`, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} data
 */
function toRawList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (data);
    const list = obj.list ?? obj.feeds ?? obj.data ?? obj.items;
    if (Array.isArray(list)) return list;
  }
  return [];
}

/**
 * @param {string} raw
 */
function feedPlainText(raw) {
  const text = `${raw ?? ''}`.trim();
  if (!text.startsWith('[')) return text;
  try {
    const ops = JSON.parse(text);
    if (!Array.isArray(ops)) return text;
    return ops
      .map((op) => (op && typeof op.insert === 'string' ? op.insert : ''))
      .join('')
      .trim();
  } catch {
    return text;
  }
}

/**
 * @param {unknown} raw
 */
function parseUserProfile(raw) {
  const root = asMap(raw);
  const source = asMap(root.user).id != null || asMap(root.user).name ? asMap(root.user) : root;
  const info = asMap(source.info);
  const rawInfo = source.info;
  const bioRaw =
    source.bio ??
    source.signature ??
    (typeof rawInfo === 'string' ? rawInfo : info.bio ?? info.signature ?? '');
  let bio = `${bioRaw ?? ''}`.trim();
  if (!bio) bio = '暂无简介';

  return {
    id: asInt(source.id ?? source.user_id) ?? 0,
    name: `${source.name ?? source.username ?? 'MFuns 用户'}`,
    avatar: resolveCoverUrl(source.avatar ?? source.face),
    banner: resolveCoverUrl(source.banner_image ?? source.banner),
    bio,
    gender: `${source.gender ?? info.gender ?? ''}`,
    level: asInt(source.level_id ?? info.level_id),
    exp: asInt(source.exp ?? source.experience ?? info.exp),
    fans: asInt(source.fans ?? source.fans_count ?? info.fans) ?? 0,
    follows:
      asInt(source.follows ?? source.follow_count ?? source.following ?? info.follows) ?? 0,
    totalLikes: asInt(source.total_likes_count ?? info.total_likes_count) ?? 0,
  };
}

/**
 * @param {number} userId
 */
export async function fetchUserProfile(userId) {
  const [profileData, countData] = await Promise.all([
    apiGet('/v1/user/get_user', { id: userId }),
    apiGet('/v1/follow/count', { user_id: userId }).catch(() => null),
  ]);
  const profile = parseUserProfile(profileData);
  const counts = asMap(countData);
  return {
    ...profile,
    follows: asInt(counts.follow) ?? profile.follows,
    fans: asInt(counts.fans) ?? profile.fans,
  };
}

/** @typedef {{
 *   nekoCoin: number,
 *   videoCount: number,
 *   feedCount: number,
 *   follows: number,
 *   fans: number,
 * }} MineDashboardStats */

/**
 * @param {unknown} data
 */
function extractListTotal(data) {
  const root = asMap(data);
  return (
    asInt(root.total ?? root.total_count ?? root.num ?? root.count ?? root.video_count) ?? null
  );
}

/**
 * @param {Record<string, unknown>} source
 * @param {Record<string, unknown>} info
 */
function pickProfileContentCounts(source, info) {
  const videoCount =
    asInt(
      source.video_count ??
        source.video_num ??
        source.videos_count ??
        source.pass_video_count ??
        info.video_count ??
        info.video_num,
    ) ?? null;
  const feedCount =
    asInt(
      source.feed_count ??
        source.feeds_count ??
        source.feed_num ??
        source.feeds_num ??
        source.dynamic_count ??
        info.feed_count ??
        info.feeds_count,
    ) ?? null;
  const nekoCoin = asInt(source.neko_coin ?? info.neko_coin) ?? null;
  return { videoCount, feedCount, nekoCoin };
}

/**
 * @param {unknown} data
 */
function userFromInfoPayload(data) {
  const root = asMap(data);
  const nested = root.user ?? root.user_info;
  if (nested && typeof nested === 'object') return asMap(nested);
  return root;
}

/**
 * @param {number} userId
 */
async function fetchVideoCount(userId) {
  const data = await apiGet('/v1/video/user_list', {
    user_id: userId,
    vid: 0,
    type: 'pass',
  });
  const total = extractListTotal(data);
  if (total != null) return total;
  return parsePreviewList(data).length;
}

/**
 * @param {number} userId
 */
async function fetchFeedCount(userId) {
  const data = await apiGet('/v1/feeds/list', {
    user_id: userId,
    start_id: -1,
    html: 1,
  });
  const total = extractListTotal(data);
  if (total != null) return total;
  return parseTimelineFeedList(data).length;
}

/**
 * @param {number} userId
 * @returns {Promise<MineDashboardStats>}
 */
export async function fetchMineDashboard(userId) {
  const [profileData, countData, infoData] = await Promise.all([
    apiGet('/v1/user/get_user', { id: userId }),
    apiGet('/v1/follow/count', { user_id: userId }).catch(() => null),
    apiGet('/v1/user/info').catch(() => null),
  ]);

  const profile = parseUserProfile(profileData);
  const counts = asMap(countData);
  const root = asMap(profileData);
  const source = asMap(root.user).id != null ? asMap(root.user) : root;
  const info = asMap(source.info);
  const parsed = pickProfileContentCounts(source, info);

  const infoUser = infoData ? userFromInfoPayload(infoData) : null;
  let nekoCoin = asInt(infoUser?.neko_coin) ?? parsed.nekoCoin ?? 0;

  let videoCount = parsed.videoCount;
  let feedCount = parsed.feedCount;
  if (videoCount == null) {
    videoCount = await fetchVideoCount(userId).catch(() => 0);
  }
  if (feedCount == null) {
    feedCount = await fetchFeedCount(userId).catch(() => 0);
  }

  return {
    nekoCoin,
    videoCount,
    feedCount,
    follows: asInt(counts.follow) ?? profile.follows,
    fans: asInt(counts.fans) ?? profile.fans,
  };
}

/**
 * @param {number} userId
 * @param {number} [cursor]
 */
export async function fetchUserVideos(userId, cursor = 0) {
  const data = await apiGet('/v1/video/user_list', {
    user_id: userId,
    vid: cursor,
    type: 'pass',
  });
  return parsePreviewList(data);
}

/**
 * @param {number} userId
 * @param {number} [cursor]
 */
export async function fetchUserArticles(userId, cursor = 0) {
  const data = await apiGet('/v1/article/user_list', {
    user_id: userId,
    aid: cursor,
    type: 'pass',
  });
  return parsePreviewList(data);
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseFeedImages(raw) {
  if (typeof raw === 'string' && raw.trim()) {
    const text = raw.trim();
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parseFeedImages(parsed);
      } catch {
        return [resolveCoverUrl(text)].filter(Boolean);
      }
    }
    const resolved = resolveCoverUrl(text);
    return resolved ? [resolved] : [];
  }
  if (!Array.isArray(raw)) return [];
  /** @type {string[]} */
  const urls = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const u = resolveCoverUrl(item);
      if (u) urls.push(u);
    } else {
      const map = asMap(item);
      const u = resolveCoverUrl(map.url ?? map.src ?? map.image);
      if (u) urls.push(u);
    }
  }
  return urls;
}

/**
 * @param {unknown} raw
 * @returns {TimelineFeedItem | null}
 */
function parseTimelineFeedItem(raw) {
  const json = asMap(raw);
  const source = asMap(json.feed).id != null ? { ...json, ...asMap(json.feed) } : json;
  const extra = asMap(source.extra);
  const resourceRaw = extra.resource ?? source.resource;
  let resource = resourceRaw ? parseContentPreview(resourceRaw) : null;
  if (!resource) {
    const resourceId = source.resource_id ?? extra.resource_id;
    const resourceType = source.resource_type ?? extra.resource_type;
    if (resourceId != null && (resourceType === 1 || resourceType === '1' || resourceType === 'video')) {
      resource = parseContentPreview({
        resource_id: resourceId,
        id: resourceId,
        type: 1,
        ...asMap(resourceRaw),
      });
    }
  }
  const rawTitle = `${source.title ?? ''}`.trim();
  const rawContent = `${source.content ?? source.text ?? source.summary ?? ''}`;
  const id = asInt(source.id ?? source.feed_id);
  if (id == null) return null;
  const user =
    asMap(source.user).id != null || asMap(source.user).name
      ? asMap(source.user)
      : asMap(source.user_info);
  const like = asMap(asMap(source.like_status).like);
  return {
    id,
    title: feedPlainText(rawTitle) || rawTitle,
    rawTitle,
    content: feedPlainText(rawContent) || `${rawContent}`.trim(),
    rawContent,
    createdAt:
      (typeof source.created_at === 'string' && source.created_at) ||
      (typeof source.time === 'string' && source.time) ||
      null,
    likes: asInt(like.count ?? source.like_count ?? source.likes) ?? 0,
    comments: asInt(source.comment_count ?? source.comments) ?? 0,
    reposts: asInt(source.forward_count ?? source.repost_count ?? source.forwards) ?? 0,
    views: asInt(source.view_count ?? source.views) ?? 0,
    pinned: source.is_top === 1 || source.is_top === true || source.top === 1,
    authorName: `${user.name ?? user.username ?? user.nickname ?? ''}`.trim() || 'MFuns 用户',
    authorAvatar: resolveCoverUrl(user.avatar ?? user.face),
    images: parseFeedImages(source.images ?? source.image_list ?? source.pictures ?? extra.images),
    resource,
  };
}

/**
 * @param {unknown} data
 * @returns {TimelineFeedItem[]}
 */
export function parseTimelineFeedList(data) {
  return toRawList(data)
    .map((item) => parseTimelineFeedItem(item))
    .filter((item) => item != null);
}

/**
 * @param {number} userId
 * @param {number} [startId]
 */
export async function fetchUserFeeds(userId, startId = -1) {
  const data = await apiGet('/v1/feeds/list', {
    start_id: startId,
    html: 1,
    user_id: userId,
  });
  return parseTimelineFeedList(data);
}

/**
 * 关注流（与 Flutter `getFeeds(following: true, userId: session.userId)` 一致）
 * @param {number} startId
 * @param {number} viewerUserId 当前登录用户 id
 */
export async function fetchFollowingFeeds(startId, viewerUserId) {
  const data = await apiGet('/v1/feeds/list', {
    start_id: startId,
    html: 1,
    follow: 1,
    user_id: viewerUserId,
  });
  return parseTimelineFeedList(data);
}

/**
 * @param {number} userId
 * @param {number} [lastId]
 * @returns {Promise<UserProfile[]>}
 */
export async function fetchFollowList(userId, lastId = -1) {
  const data = await apiGet('/v1/follow/list', {
    user_id: userId,
    type: 'follow',
    last_id: lastId,
  });
  return toRawList(data)
    .map((item) => parseUserProfile(item))
    .filter((item) => item.id > 0);
}

/**
 * @param {number} userId
 * @returns {Promise<UserProfile[]>}
 */
export async function fetchAllFollowing(userId) {
  /** @type {UserProfile[]} */
  const all = [];
  let lastId = -1;
  for (let page = 0; page < 40; page += 1) {
    const batch = await fetchFollowList(userId, lastId);
    if (!batch.length) break;
    all.push(...batch);
    const nextLast = batch[batch.length - 1].id;
    if (nextLast === lastId) break;
    lastId = nextLast;
    if (batch.length < 20) break;
  }
  return all;
}
