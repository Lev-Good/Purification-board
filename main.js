const { app, BrowserWindow, ipcMain, safeStorage, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let win = null;
let tray = null;
let isQuitting = false;
let backgroundModeEnabled = false;

function createWindow () {
  win = new BrowserWindow({
    width: 1050,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: "לוח טהרת המשפחה",
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');

  // Open external links (http/https) in the default web browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Hide the default browser-like menu bar for a native app feel
  win.setMenuBarVisibility(false);

  // When background mode (auto-launch setting) is enabled, minimize to the system tray
  // instead of quitting, so daily/event notifications can keep firing from the renderer.
  win.on('close', (event) => {
    if (!isQuitting && backgroundModeEnabled) {
      event.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('לוח טהרת המשפחה');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'פתח את לוח טהרה', click: () => { if (win) { win.show(); win.focus(); } } },
    { type: 'separator' },
    { label: 'יציאה', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', () => { if (win) { win.isVisible() ? win.focus() : win.show(); } });
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

  // IPC handle: toggle auto-launch-at-login + tray background mode (single user setting)
  ipcMain.handle('set-auto-launch', (event, enabled) => {
    backgroundModeEnabled = Boolean(enabled);
    try {
      app.setLoginItemSettings({ openAtLogin: backgroundModeEnabled });
    } catch (err) {
      console.error("setLoginItemSettings failed:", err);
    }
    if (backgroundModeEnabled) {
      createTray();
    } else if (tray) {
      tray.destroy();
      tray = null;
    }
    return true;
  });

  ipcMain.handle('get-app-version', () => app.getVersion());

  // --- Auto-update (electron-updater, GitHub Releases provider) ---
  autoUpdater.autoDownload = false;

  const sendUpdateStatus = (status, data = {}) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { status, ...data });
    }
  };

  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
  autoUpdater.on('update-available', (info) => sendUpdateStatus('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'));
  autoUpdater.on('error', (err) => sendUpdateStatus('error', { message: String(err && err.message || err) }));
  autoUpdater.on('download-progress', (progress) => sendUpdateStatus('downloading', { percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', () => sendUpdateStatus('downloaded'));

  ipcMain.handle('check-for-update', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      sendUpdateStatus('error', { message: String(err && err.message || err) });
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      sendUpdateStatus('error', { message: String(err && err.message || err) });
    }
  });

  ipcMain.handle('quit-and-install', () => {
    isQuitting = true;
    autoUpdater.quitAndInstall();
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (win) {
      win.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
