const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1050,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: "לוח טהרת המשפחה",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  
  // Hide the default browser-like menu bar for a native app feel
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  // IPC handle for native encryption
  ipcMain.handle('encrypt-string', async (event, plainText) => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encryptedBuffer = safeStorage.encryptString(plainText);
        return encryptedBuffer.toString('base64');
      }
    } catch (err) {
      console.error("IPC safeStorage encryption failed:", err);
    }
    return plainText; // Fallback
  });

  // IPC handle for native decryption
  ipcMain.handle('decrypt-string', async (event, base64Cipher) => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(base64Cipher, 'base64');
        return safeStorage.decryptString(buffer);
      }
    } catch (err) {
      console.error("IPC safeStorage decryption failed:", err);
    }
    return base64Cipher; // Fallback
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
