const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    /**
     * @param {(payload: { maximized: boolean }) => void} handler
     */
    onMaximizedChanged: (handler) => {
      ipcRenderer.on('window:maximized-changed', (_event, payload) => {
        handler({ maximized: Boolean(payload?.maximized) });
      });
    },
    close: () => ipcRenderer.send('window:close'),
    /**
     * @param {(payload: { useTray: boolean }) => void} handler
     */
    onClosePrompt: (handler) => {
      ipcRenderer.on('window:show-close-dialog', (_event, payload) => {
        handler({
          useTray: Boolean(payload?.useTray),
        });
      });
    },
    /**
     * @param {'tray' | 'quit' | 'cancel'} choice
     */
    closeChoice: (choice) => ipcRenderer.send('window:close-choice', choice),
    /** 在系统 will-move 之前，顶栏 drag 区按下时提前降负载 */
    dragPrepare: () => ipcRenderer.send('window:drag-prepare'),
    /** 在 drag 区按下但未发生窗口移动时恢复 */
    dragRelease: () => ipcRenderer.send('window:drag-release'),
    /**
     * @param {(payload: { dragging: boolean }) => void} handler
     */
    onDragState: (handler) => {
      ipcRenderer.on('window:drag-state', (_event, payload) => {
        handler({ dragging: Boolean(payload?.dragging) });
      });
    },
  },
  browser: {
    /**
     * @param {string} url
     * @param {string} [title]
     */
    open: (url, title) => ipcRenderer.invoke('browser:open', { url, title }),
  },
  offline: {
    /**
     * @param {string} url
     * @param {string} relPath
     */
    download: (url, relPath) => ipcRenderer.invoke('offline:download', { url, relPath }),
    /** @param {string} relPath */
    delete: (relPath) => ipcRenderer.invoke('offline:delete', { relPath }),
    clearAll: () => ipcRenderer.invoke('offline:clearAll'),
    getUsage: () => ipcRenderer.invoke('offline:getUsage'),
    /**
     * @param {string} relPath
     */
    playbackSrc: (relPath) => `mfuns-offline://load?f=${encodeURIComponent(relPath)}`,
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),
    getAutoLaunch: () => ipcRenderer.invoke('app:getAutoLaunch'),
    getDesktopSettings: () => ipcRenderer.invoke('app:getDesktopSettings'),
    setDesktopSettings: (patch) => ipcRenderer.invoke('app:setDesktopSettings', patch),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
  },
});
