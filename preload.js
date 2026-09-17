const { contextBridge, ipcRenderer } = require('electron');

// Expose safe storage + native app integration methods securely to the frontend
contextBridge.exposeInMainWorld('api', {
  encrypt: (plainText) => ipcRenderer.invoke('encrypt-string', plainText),
  decrypt: (base64Cipher) => ipcRenderer.invoke('decrypt-string', base64Cipher),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  }
});
