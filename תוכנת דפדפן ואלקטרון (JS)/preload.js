const { contextBridge, ipcRenderer } = require('electron');

// Expose safe storage methods securely to the frontend
contextBridge.exposeInMainWorld('api', {
  oauthStart: (loginHint) => ipcRenderer.invoke('oauth-start', loginHint),
  oauthStatus: () => ipcRenderer.invoke('oauth-status'),
  oauthEnsureToken: () => ipcRenderer.invoke('oauth-ensure-token'),
  oauthSetMeta: (patch) => ipcRenderer.invoke('oauth-set-meta', patch),
  oauthDisconnect: () => ipcRenderer.invoke('oauth-disconnect'),
  oauthOpenSheet: () => ipcRenderer.invoke('oauth-open-sheet'),
  onOAuthLog: (cb) => ipcRenderer.on('oauth-log', (event, msg) => cb(msg)),
  onAutoBackupTick: (cb) => ipcRenderer.on('oauth-auto-backup-tick', (event, ts) => cb(ts)),
  localBackupWrite: (jsonString) => ipcRenderer.invoke('local-backup-write', jsonString),
  localBackupDir: () => ipcRenderer.invoke('local-backup-dir'),
  localBackupOpenFolder: () => ipcRenderer.invoke('local-backup-open-folder'),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
