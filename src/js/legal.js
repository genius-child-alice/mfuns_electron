export const LEGAL_URLS = {
  userAgreement: 'https://www.mfuns.net/agree/userAgreement.html',
  privacy: 'https://www.mfuns.net/agree/priv.html',
};

/**
 * @param {string} url
 * @param {string} [title]
 */
export function openInAppBrowser(url, title) {
  const browser = window.electronAPI?.browser;
  if (browser?.open) {
    browser.open(url, title);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function bindLegalLinks(root = document) {
  root.querySelectorAll('[data-legal-link]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = link.getAttribute('data-legal-link');
      const linkTitle = link.getAttribute('data-legal-title') || 'MFuns';
      if (url) openInAppBrowser(url, linkTitle);
    });
  });
}
