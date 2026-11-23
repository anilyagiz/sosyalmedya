'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sm', {
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  openApp: () => ipcRenderer.invoke('open-app'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  about: () => ipcRenderer.invoke('about'),
  retry: () => ipcRenderer.invoke('retry'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (payload) => ipcRenderer.invoke('save-settings', payload),
});
