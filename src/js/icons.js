/**
 * Material Symbols Outlined (ligature names).
 * @see https://fonts.google.com/icons
 */
export function materialIcon(name, className = '') {
  const extra = className ? ` ${className}` : '';
  return `<span class="material-symbols-outlined${extra}" aria-hidden="true">${name}</span>`;
}
