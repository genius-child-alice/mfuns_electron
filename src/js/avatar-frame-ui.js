import { mediaSrcForCover, resolveCoverUrl } from './content-api.js';

/**
 * @param {unknown} value
 */
function asMap(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * 从用户对象或 avatar_frame 字段解析头像框图片 URL。
 * @param {unknown} raw
 * @returns {string | null}
 */
export function pickAvatarFrameUrl(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return resolveCoverUrl(trimmed);
  }
  const map = asMap(raw);
  const nested = asMap(map.avatar_frame ?? map.avatarFrame);
  const fromNested = resolveCoverUrl(
    nested.image ?? nested.url ?? nested.preview ?? nested.src ?? nested.cover,
  );
  if (fromNested) return fromNested;
  const direct = resolveCoverUrl(
    map.avatar_frame_url ?? map.frame_url ?? map.avatar_frame_image ?? map.image ?? map.url,
  );
  return direct || null;
}

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
 * @param {{
 *   avatar: string | null | undefined,
 *   frame: string | null | undefined,
 *   size?: 'xs' | 'sm' | 'lg',
 *   imgClass?: string,
 *   phClass?: string,
 *   wrapClass?: string,
 * }} options
 * @returns {string}
 */
export function renderFramedAvatarHtml(options) {
  const size = options.size ?? 'sm';
  const imgClass = options.imgClass ?? '';
  const phClass = options.phClass ?? '';
  const wrapClass = options.wrapClass ?? '';
  const avatarSrc = options.avatar ? mediaSrcForCover(options.avatar) : null;
  const frameSrc = options.frame ? mediaSrcForCover(options.frame) : null;

  if (!frameSrc) {
    if (avatarSrc) {
      return `<img class="${escapeHtml(imgClass)}" src="${escapeHtml(avatarSrc)}" alt="" />`;
    }
    const phClasses = [imgClass, phClass].filter(Boolean).join(' ');
    return `<span class="${escapeHtml(phClasses)}"></span>`;
  }

  const photoClasses = ['framed-avatar__photo', imgClass].filter(Boolean).join(' ');
  const photo = avatarSrc
    ? `<img class="${escapeHtml(photoClasses)}" src="${escapeHtml(avatarSrc)}" alt="" />`
    : `<span class="${escapeHtml(photoClasses)} framed-avatar__photo--ph ${escapeHtml(phClass)}"></span>`;

  const wrapClasses = ['framed-avatar', `framed-avatar--${size}`, wrapClass].filter(Boolean).join(' ');
  return `<span class="${escapeHtml(wrapClasses)}">${photo}<img class="framed-avatar__frame" src="${escapeHtml(frameSrc)}" alt="" aria-hidden="true" /></span>`;
}
