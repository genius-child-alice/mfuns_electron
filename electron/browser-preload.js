const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  browser: {
    close: () => ipcRenderer.send('in-app-browser:close'),
  },
});
