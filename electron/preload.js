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
    close: () => ipcRenderer.send('window:close'),
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
