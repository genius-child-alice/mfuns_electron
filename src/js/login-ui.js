import { loadSession } from './auth.js';

/** @type {() => void} */
let openLoginHandler = () => {
  document.getElementById('btn-open-login')?.click();
};

/** @param {() => void} handler */
export function registerOpenLoginHandler(handler) {
  openLoginHandler = handler;
}

export function openLoginPanel() {
  openLoginHandler();
}

export function isLoggedIn() {
  return Boolean(loadSession()?.token);
}

/** @returns {boolean} 已登录为 true；未登录会弹出登录框并返回 false */
export function requireLogin() {
  if (isLoggedIn()) return true;
  openLoginPanel();
  return false;
}
