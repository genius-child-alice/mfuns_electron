import {
  avatarImageSrc,
  pickAvatarFrameUrl,
  userAvatarFrameUrl,
} from './content-api.js';

export { pickAvatarFrameUrl, userAvatarFrameUrl };

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
 *   size?: string,
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
  const avatarSrc = options.avatar ? avatarImageSrc(options.avatar) : null;
  const frameSrc = options.frame ? avatarImageSrc(options.frame) : null;

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

/**
 * @param {{
 *   user?: Record<string, unknown> | null,
 *   avatar?: string | null,
 *   frame?: string | null,
 *   size: string,
 *   imgClass: string,
 *   phClass?: string,
 *   fallbackAvatarSrc?: string | null,
 * }} options
 * @returns {string}
 */
export function renderUserFramedAvatarHtml(options) {
  /** @type {string | null} */
  let avatarRaw = options.avatar ?? null;
  if (!avatarRaw && options.user) {
    const u = options.user;
    avatarRaw = `${u.avatar ?? u.face ?? u.user_avatar ?? ''}`.trim() || null;
  }
  if (!avatarRaw && options.fallbackAvatarSrc) {
    avatarRaw = options.fallbackAvatarSrc;
  }
  const frame = options.frame ?? (options.user ? userAvatarFrameUrl(options.user) : null);
  return renderFramedAvatarHtml({
    avatar: avatarRaw,
    frame,
    size: options.size,
    imgClass: options.imgClass,
    phClass: options.phClass,
  });
}

/**
 * 详情页作者头像（可点击进入空间）。
 * @param {{
 *   authorId?: number | null,
 *   avatar?: string | null,
 *   frame?: string | null,
 *   size: string,
 *   imgClass: string,
 *   phClass?: string,
 *   btnClass?: string,
 *   linkTitle?: string,
 * }} options
 * @returns {string}
 */
export function renderAuthorAvatarHtml(options) {
  const inner = renderFramedAvatarHtml({
    avatar: options.avatar,
    frame: options.frame,
    size: options.size,
    imgClass: options.imgClass,
    phClass: options.phClass ?? '',
  });
  const authorId = options.authorId;
  if (authorId != null && authorId > 0 && options.btnClass) {
    const title = options.linkTitle ?? '进入空间';
    return `<button type="button" class="watch-user-link ${options.btnClass}" data-author-profile="${authorId}" title="${escapeHtml(title)}">${inner}</button>`;
  }
  return inner;
}
