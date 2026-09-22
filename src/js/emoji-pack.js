import { apiGet, mediaSrcForRichImage } from './content-api.js';

/** @type {Promise<Map<string, string>> | null} */
let stickerUrlMapPromise = null;

/**
 * @param {unknown} value
 */
function asMap(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * 与 Flutter `EmojiPackStore` / `EmojiData.stickerUrl` 一致。
 * @returns {Promise<Map<string, string>>}
 */
export async function loadStickerUrlMap() {
  if (!stickerUrlMapPromise) {
    stickerUrlMapPromise = fetchStickerUrlMap().catch((err) => {
      stickerUrlMapPromise = null;
      throw err;
    });
  }
  return stickerUrlMapPromise;
}

async function fetchStickerUrlMap() {
  const data = await apiGet('/v1/emoji_pack/list', { with_vip: 1 });
  const root = asMap(data);
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const [packKey, packVal] of Object.entries(root)) {
    const pack = asMap(packVal);
    const list = asMap(pack.list);
    for (const [stickerId, stickerVal] of Object.entries(list)) {
      const url = `${asMap(stickerVal).url ?? ''}`.trim();
      if (url) map.set(`${packKey}-${stickerId}`, url);
    }
  }
  return map;
}

/**
 * @param {string} stickerKey 如 `s-1`
 * @returns {Promise<string | null>} mfuns-media 或直连 URL
 */
export async function mediaSrcForStickerKey(stickerKey) {
  const key = `${stickerKey ?? ''}`.trim();
  if (!key) return null;
  const map = await loadStickerUrlMap();
  const url = map.get(key);
  if (!url) return null;
  return mediaSrcForRichImage(url);
}

/**
 * @typedef {{ key: string, name: string, stickers: { key: string, url: string }[] }} EmojiPackGroup
 */

/**
 * 与 Flutter EmojiData 一致的分组列表（评论/私信表情面板用）。
 * @returns {Promise<EmojiPackGroup[]>}
 */
export async function fetchEmojiPackGroups() {
  const data = await apiGet('/v1/emoji_pack/list', { with_vip: 1 });
  const root = asMap(data);
  /** @type {EmojiPackGroup[]} */
  const groups = [];
  for (const [packKey, packVal] of Object.entries(root)) {
    const pack = asMap(packVal);
    const name = `${pack.name ?? packKey}`.trim() || packKey;
    const list = asMap(pack.list);
    /** @type {{ key: string, url: string }[]} */
    const stickers = [];
    for (const [stickerId, stickerVal] of Object.entries(list)) {
      const url = `${asMap(stickerVal).url ?? ''}`.trim();
      if (!url) continue;
      const key = `${packKey}-${stickerId}`;
      stickers.push({ key, url: mediaSrcForRichImage(url) ?? url });
    }
    if (stickers.length > 0) groups.push({ key: packKey, name, stickers });
  }
  return groups;
}
