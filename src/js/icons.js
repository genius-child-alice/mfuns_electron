/**
 * Material Symbols Outlined (ligature names).
 * @see https://fonts.google.com/icons
 */
export function materialIcon(name, className = '') {
  const extra = className ? ` ${className}` : '';
  return `<span class="material-symbols-outlined${extra}" aria-hidden="true">${name}</span>`;
}

/** 阅读量 / 动态浏览量（官网「眼睛」） */
export function viewCountIcon(className = '') {
  const classes = [className, 'view-count-icon'].filter(Boolean).join(' ');
  return materialIcon('visibility', classes);
}

/** 视频播放量（Material smart_display，与文章/动态 visibility 区分） */
export function videoPlayCountIcon(className = '') {
  const classes = [className, 'video-play-count-icon'].filter(Boolean).join(' ');
  return materialIcon('smart_display', classes);
}
