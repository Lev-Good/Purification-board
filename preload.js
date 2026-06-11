const { contextBridge, ipcRenderer } = require('electron');

// Expose safe storage methods securely to the frontend
contextBridge.exposeInMainWorld('api', {
  encrypt: (plainText) => ipcRenderer.invoke('encrypt-string', plainText),
  decrypt: (base64Cipher) => ipcRenderer.invoke('decrypt-string', base64Cipher)
});
