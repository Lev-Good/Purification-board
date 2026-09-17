const { contextBridge, ipcRenderer } = require('electron');

// Expose safe storage methods securely to the frontend
contextBridge.exposeInMainWorld('api', {
  encrypt: (plainText) => ipcRenderer.invoke('encrypt-string', plainText),
  decrypt: (base64Cipher) => ipcRenderer.invoke('decrypt-string', base64Cipher),
  oauthStart: (loginHint) => ipcRenderer.invoke('oauth-start', loginHint),
  oauthStatus: () => ipcRenderer.invoke('oauth-status'),
  oauthEnsureToken: () => ipcRenderer.invoke('oauth-ensure-token'),
  oauthSetMeta: (patch) => ipcRenderer.invoke('oauth-set-meta', patch),
  oauthDisconnect: () => ipcRenderer.invoke('oauth-disconnect'),
  oauthOpenSheet: () => ipcRenderer.invoke('oauth-open-sheet'),
  onOAuthLog: (cb) => ipcRenderer.on('oauth-log', (event, msg) => cb(msg)),
  onAutoBackupTick: (cb) => ipcRenderer.on('oauth-auto-backup-tick', (event, ts) => cb(ts))
});
