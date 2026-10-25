const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  connectWithGesture: () => ipcRenderer.invoke('connect-with-gesture'),
  scanCubeMac: (name) => ipcRenderer.invoke('scan-cube-mac', name),
});
