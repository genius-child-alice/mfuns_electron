import {
  apiGet,
  apiPostJson,
  parseContentPreview,
  parsePreviewList,
  resolveCoverUrl,
} from './content-api.js';
import { pickAvatarFrameUrl } from './avatar-frame-ui.js';
import { levelFromBadges } from './user-level.js';

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
 *   avatarFrame: string | null,
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
 *   authorId: number | null,
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
  if (!text.startsWith('{') && !text.startsWith('[')) return text;
  try {
    const decoded = JSON.parse(text);
    const ops = Array.isArray(decoded)
      ? decoded
      : decoded && typeof decoded === 'object'
        ? /** @type {Record<string, unknown>} */ (decoded).ops
        : null;
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
    name: `${source.name ?? source.username ?? 'Mfuns 用户'}`,
    avatar: resolveCoverUrl(source.avatar ?? source.face),
    avatarFrame: pickAvatarFrameUrl(source.avatar_frame ?? source.avatarFrame),
    banner: resolveCoverUrl(source.banner_image ?? source.banner),
    bio,
    gender: `${source.gender ?? info.gender ?? ''}`,
    level: asInt(source.level_id ?? info.level_id) ?? levelFromBadges(source.badges),
    exp: asInt(source.exp ?? source.experience ?? info.exp ?? info.experience),
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
 * @param {unknown} value
 * @returns {string | null}
 */
function parseFeedCreatedAt(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
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
    createdAt: parseFeedCreatedAt(
      source.created_at ??
        source.time ??
        source.createdAt ??
        source.published_at ??
        source.publish_time,
    ),
    likes: asInt(like.count ?? source.like_count ?? source.likes) ?? 0,
    comments: asInt(source.comment_count ?? source.comments) ?? 0,
    reposts: asInt(source.forward_count ?? source.repost_count ?? source.forwards) ?? 0,
    views: asInt(source.view_count ?? source.views) ?? 0,
    pinned: source.is_top === 1 || source.is_top === true || source.top === 1,
    authorName: `${user.name ?? user.username ?? user.nickname ?? ''}`.trim() || 'Mfuns 用户',
    authorId: asInt(user.id ?? user.user_id ?? source.user_id ?? source.author_id),
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
/**
 * @typedef {{
 *   feed: TimelineFeedItem,
 *   commentAreaId: number | null,
 *   rawContent: string,
 * }} FeedDetail
 */

/**
 * @param {number} feedId
 * @returns {Promise<FeedDetail>}
 */
export async function fetchFeedDetail(feedId) {
  const data = await apiGet('/v1/feeds/get', { id: feedId, html: 1 });
  const source = asMap(data);
  const merged = asMap(source.feed).id != null ? { ...source, ...asMap(source.feed) } : source;
  const feed = parseTimelineFeedItem(merged);
  if (!feed) throw new Error('动态不存在或已删除');
  return {
    feed,
    commentAreaId: asInt(source.comment_area_id ?? merged.comment_area_id),
    rawContent: `${source.content ?? merged.content ?? merged.text ?? ''}`,
  };
}

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
/**
 * @param {'follow' | 'fans'} type
 * @param {number} userId
 * @param {number} [lastId]
 * @returns {Promise<UserProfile[]>}
 */
export async function fetchFollowListPage(userId, type, lastId = -1) {
  const data = await apiGet('/v1/follow/list', {
    user_id: userId,
    type,
    last_id: lastId,
  });
  return toRawList(data)
    .map((item) => parseUserProfile(item))
    .filter((item) => item.id > 0);
}

/**
 * @param {number} userId
 * @param {number} [lastId]
 */
export async function fetchFollowList(userId, lastId = -1) {
  return fetchFollowListPage(userId, 'follow', lastId);
}

/**
 * @param {number} userId
 * @param {'follow' | 'fans'} type
 * @returns {Promise<UserProfile[]>}
 */
export async function fetchAllRelationList(userId, type) {
  /** @type {UserProfile[]} */
  const all = [];
  let lastId = -1;
  for (let page = 0; page < 40; page += 1) {
    const batch = await fetchFollowListPage(userId, type, lastId);
    if (!batch.length) break;
    all.push(...batch);
    const nextLast = batch[batch.length - 1].id;
    if (nextLast === lastId) break;
    lastId = nextLast;
    if (batch.length < 20) break;
  }
  return all;
}

/**
 * @param {number} userId
 * @returns {Promise<UserProfile[]>}
 */
export async function fetchAllFollowing(userId) {
  return fetchAllRelationList(userId, 'follow');
}

/**
 * @param {unknown} data
 * @returns {UserProfile[]}
 */
export function userProfilesFromListData(data) {
  return toRawList(data)
    .map((item) => parseUserProfile(item))
    .filter((item) => item.id > 0);
}

/**
 * @param {string} name
 */
export async function updateUserName(name) {
  const trimmed = `${name ?? ''}`.trim();
  if (!trimmed) throw new Error('昵称不能为空');
  await apiPostJson('/v1/user/set_name', { name: trimmed });
}

/**
 * @param {string} bio
 */
export async function updateUserBio(bio) {
  await apiPostJson('/v1/user/set_bio', { bio: `${bio ?? ''}`.trim() });
}

/**
 * @param {number} gender 0 保密 / 1 男 / 2 女
 */
export async function updateUserGender(gender) {
  await apiPostJson('/v1/user/set_gender', { gender });
}

/**
 * @param {string} avatarPath 上传接口返回的相对路径
 */
export async function updateUserAvatar(avatarPath) {
  const avatar = `${avatarPath ?? ''}`.trim();
  if (!avatar) throw new Error('无效的头像路径');
  await apiPostJson('/v1/user/set_avatar', { avatar });
}

/**
 * @param {unknown} value
 * @returns {0 | 1 | 2}
 */
export function normalizeGenderValue(value) {
  if (value === 1 || value === '1' || value === '男' || value === 'male') return 1;
  if (value === 2 || value === '2' || value === '女' || value === 'female') return 2;
  return 0;
}

/** @typedef {{ id: number, name: string, tag: string, description: string, icon: string | null, count: number }} BackpackItem */

/** @typedef {{ levelId: number, experience: number }} LevelSection */

/**
 * @param {unknown} data
 * @returns {BackpackItem[]}
 */
function parseBackpackList(data) {
  const root = asMap(data);
  const list = Array.isArray(data) ? data : root.list ?? root.items;
  if (!Array.isArray(list)) return [];
  return list
    .map((raw) => {
      const item = asMap(raw);
      const id = asInt(item.id) ?? 0;
      return {
        id,
        name: `${item.name ?? ''}`.trim() || '物品',
        tag: `${item.tag ?? ''}`.trim(),
        description: `${item.description ?? item.desc ?? ''}`.trim(),
        icon: resolveCoverUrl(item.icon),
        count: asInt(item.count) ?? 0,
      };
    })
    .filter((item) => item.id > 0);
}

/**
 * @returns {Promise<BackpackItem[]>}
 */
export async function fetchUserBackpack() {
  const data = await apiGet('/v1/user/get_user_backpack');
  return parseBackpackList(data);
}

/**
 * @param {unknown} data
 * @returns {LevelSection[]}
 */
function parseLevelSections(data) {
  const list = Array.isArray(data) ? data : asMap(data).list;
  if (!Array.isArray(list)) return [];
  return list
    .map((raw) => {
      const item = asMap(raw);
      const levelId = asInt(item.level_id ?? item.id) ?? 0;
      const experience = asInt(item.experience ?? item.exp) ?? 0;
      return { levelId, experience };
    })
    .filter((item) => item.levelId > 0)
    .sort((a, b) => a.levelId - b.levelId);
}

/**
 * @returns {Promise<LevelSection[]>}
 */
export async function fetchLevelSections() {
  const data = await apiGet('/v1/user/level_section');
  return parseLevelSections(data);
}

/**
 * @param {number} [page]
 * @param {number} [size]
 * @returns {Promise<TimelineFeedItem[]>}
 */
export async function fetchNewReplyFeeds(page = 1, size = 20) {
  const data = await apiGet('/v1/feeds/new_reply_list', { page, size, html: 1 });
  return parseTimelineFeedList(data);
}
