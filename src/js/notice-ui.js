import { materialIcon } from './icons.js';

/** @typedef {'info' | 'success' | 'warning' | 'error'} NoticeType */

const TYPE_ICON = {
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  error: 'error_outline',
};

const DEFAULT_DURATION = {
  info: 3200,
  success: 2800,
  warning: 4000,
  error: 5000,
};

/**
 * @param {string} message
 * @param {NoticeType} [type]
 */
export function notify(message, type = 'info') {
  const text = `${message ?? ''}`.trim();
  if (!text) return;

  let host = document.getElementById('notice-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'notice-toast-host';
    host.className = 'notice-toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }

  const toast = document.createElement('div');
  toast.className = `notice-toast notice-toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <span class="notice-toast__icon">${materialIcon(TYPE_ICON[type] ?? TYPE_ICON.info)}</span>
    <p class="notice-toast__message"></p>
    <button type="button" class="notice-toast__close" aria-label="关闭">${materialIcon('close')}</button>
  `;
  const messageEl = toast.querySelector('.notice-toast__message');
  if (messageEl) messageEl.textContent = text;

  const dismiss = () => {
    toast.classList.add('notice-toast--leaving');
    toast.addEventListener(
      'animationend',
      () => {
        toast.remove();
      },
      { once: true },
    );
  };

  toast.querySelector('.notice-toast__close')?.addEventListener('click', dismiss);
  host.appendChild(toast);

  const duration = DEFAULT_DURATION[type] ?? DEFAULT_DURATION.info;
  const timer = window.setTimeout(dismiss, duration);
  toast.addEventListener('mouseenter', () => window.clearTimeout(timer), { once: true });
}
