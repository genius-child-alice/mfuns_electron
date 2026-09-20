const SPLASH_MIN_MS = 3000;
const SPLASH_FADE_MS = 520;

export function runSplash(onDone) {
  const splash = document.getElementById('splash');
  const app = document.getElementById('app');
  if (!splash || !app) {
    onDone?.();
    return;
  }

  const started = performance.now();

  const finish = () => {
    splash.classList.add('splash--hide');
    app.classList.remove('app--hidden');
    app.setAttribute('aria-hidden', 'false');

    window.setTimeout(() => {
      splash.remove();
      onDone?.();
    }, SPLASH_FADE_MS);
  };

  window.setTimeout(() => {
    const elapsed = performance.now() - started;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    window.setTimeout(finish, wait);
  }, 0);
}
