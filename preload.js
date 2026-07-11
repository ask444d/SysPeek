const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getProcesses: () => ipcRenderer.invoke('get-processes'),
    searchProcesses: (q) => ipcRenderer.invoke('search-processes', q),
    startMonitoring: (pid, name) => ipcRenderer.invoke('start-monitoring', pid, name),
    stopMonitoring: () => ipcRenderer.invoke('stop-monitoring'),
    getMetrics: () => ipcRenderer.invoke('get-metrics'),
    getHistory: () => ipcRenderer.invoke('get-history'),
    getProcessDetails: (pid) => ipcRenderer.invoke('get-process-details', pid),
    killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),
    getFavorites: () => ipcRenderer.invoke('get-favorites'),
    addFavorite: (proc) => ipcRenderer.invoke('add-favorite', proc),
    removeFavorite: (pid) => ipcRenderer.invoke('remove-favorite', pid),
    exportData: (opts) => ipcRenderer.invoke('export-data', opts),
    exportPng: (dataUrl) => ipcRenderer.invoke('export-png', dataUrl),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
});
