/**
 * 无边框窗口拖动时降低渲染负载（配合主进程 setFrameRate + CSS 暂停动画）。
 * 不改变拖拽区域与界面行为。
 */
export function initWindowDragPerf() {
  const api = window.electronAPI?.window;
  if (!api?.onDragState) return;

  const root = document.documentElement;
  let pointerDragPrimed = false;

  const setDragging = (on) => {
    root.classList.toggle('is-window-dragging', on);
  };

  api.onDragState(({ dragging }) => {
    setDragging(dragging);
    if (!dragging) pointerDragPrimed = false;
  });

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('.app-drag')) return;
      pointerDragPrimed = true;
      setDragging(true);
      api.dragPrepare?.();
    },
    true,
  );

  document.addEventListener(
    'pointerup',
    () => {
      if (!pointerDragPrimed) return;
      pointerDragPrimed = false;
      api.dragRelease?.();
    },
    true,
  );

  document.addEventListener(
    'pointercancel',
    () => {
      if (!pointerDragPrimed) return;
      pointerDragPrimed = false;
      api.dragRelease?.();
    },
    true,
  );
}
