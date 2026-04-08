const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store').default;
let keytar = null;
try {
  keytar = require('keytar');
} catch (err) {
  keytar = null;
}

const SERVICE_NAME = 'StarToPlanetDesktopAdmin';
const ACCOUNT_NAME = 'adminCreds';
const store = new Store({ name: 'desktop-admin-settings' });

function createWindow() {
  const win = new BrowserWindow({
    width: 1220,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function saveCreds(creds) {
  const safe = {
    baseUrl: String(creds.baseUrl || '').trim().replace(/\/+$/, ''),
    adminToken: String(creds.adminToken || '').trim(),
    adminTelegramId: String(creds.adminTelegramId || '').trim()
  };
  const payload = JSON.stringify(safe);
  if (!keytar) {
    store.set('fallbackCreds', payload);
    return { ok: true, fallback: true, message: 'keytar недоступен, использован fallback' };
  }
  try {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, payload);
    store.set('fallbackCreds', null);
    return { ok: true };
  } catch (err) {
    store.set('fallbackCreds', payload);
    return { ok: true, fallback: true, message: 'Системное хранилище недоступно, использован fallback' };
  }
}

async function readCreds() {
  if (keytar) {
    try {
      const raw = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (raw) {
        return { ok: true, creds: JSON.parse(raw), source: 'keytar' };
      }
    } catch (err) {
      // noop, fallback below
    }
  }

  const fallback = store.get('fallbackCreds');
  if (fallback) {
    try {
      return { ok: true, creds: JSON.parse(fallback), source: 'fallback' };
    } catch (err) {
      return { ok: false, message: 'Повреждены сохраненные credentials' };
    }
  }
  return { ok: true, creds: null };
}

async function clearCreds() {
  if (keytar) {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    } catch (err) {
      // ignore
    }
  }
  store.set('fallbackCreds', null);
  return { ok: true };
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('creds:save', async (_event, creds) => saveCreds(creds || {}));
ipcMain.handle('creds:read', async () => readCreds());
ipcMain.handle('creds:clear', async () => clearCreds());
