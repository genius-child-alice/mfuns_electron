/**
 * Material Symbols Outlined (ligature names).
 * @see https://fonts.google.com/icons
 */
export function materialIcon(name, className = '') {
  const extra = className ? ` ${className}` : '';
  return `<span class="material-symbols-outlined${extra}" aria-hidden="true">${name}</span>`;
}

/** 播放量 / 阅读量统计图标（非播放器控制按钮） */
export function viewCountIcon(className = '') {
  return materialIcon('visibility', className);
}
