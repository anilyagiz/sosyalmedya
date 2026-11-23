'use strict';
const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  dialog,
  nativeImage,
  Notification,
} = require('electron');
const cfg = require('./config');
const { ServiceManager } = require('./services');
const proxy = require('./proxy');
const smoke = require('./smoke');

const SMOKE = process.argv.includes('--smoke-test');
const HIDDEN = process.argv.includes('--hidden');
const SOURCE_URL = 'https://github.com/anilyagiz/sosyalmedya';

app.setAppUserModelId('com.sosyalmedya.app');

let manager;
let servers = [];
let tray;
let statusWindow;
let settingsWindow;
let state = { phase: 'starting', message: 'Hazırlanıyor…', services: {} };
let quitting = false;
let hintShown = false;

const icon = () =>
  nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));

if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (state.phase === 'ready') openInBrowser();
    else showStatus();
  });
  app.whenReady().then(SMOKE ? runSmoke : boot);
}

function broadcast() {
  for (const w of [statusWindow, settingsWindow]) {
    if (w && !w.isDestroyed()) w.webContents.send('state', state);
  }
  if (tray) {
    tray.setToolTip(
      state.phase === 'ready' ? 'sosyalmedya — çalışıyor' : `sosyalmedya — ${state.message}`
    );
  }
}

function openInBrowser() {
  shell.openExternal(cfg.PUBLIC_URL);
}

function showStatus() {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.show();
    statusWindow.focus();
    return;
  }
  statusWindow = new BrowserWindow({
    width: 520,
    height: 600,
    resizable: false,
    title: 'sosyalmedya',
    icon: icon(),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  statusWindow.loadFile(path.join(__dirname, '..', 'ui', 'status.html'));
  statusWindow.webContents.on('did-finish-load', broadcast);
  statusWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    statusWindow.hide();
    if (!hintShown && Notification.isSupported()) {
      hintShown = true;
      new Notification({
        title: 'sosyalmedya arka planda çalışıyor',
        body: 'Zamanlanmış gönderilerin paylaşılması için açık kalıyor. Sağ alttaki simgeden açabilir veya kapatabilirsiniz.',
        icon: icon(),
      }).show();
    }
  });
}

function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 760,
    height: 760,
    title: 'sosyalmedya — Ayarlar',
    icon: icon(),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWindow.loadFile(path.join(__dirname, '..', 'ui', 'settings.html'));
}

function createTray() {
  tray = new Tray(icon().resize({ width: 16, height: 16 }));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'sosyalmedya\'yı aç', click: () => (state.phase === 'ready' ? openInBrowser() : showStatus()) },
      { label: 'Durum penceresi', click: showStatus },
      { label: 'Sosyal ağ anahtarları (Ayarlar)', click: showSettings },
      { type: 'separator' },
      { label: 'Günlük dosyalarını göster', click: () => shell.openPath(cfg.paths().logs) },
      { label: 'Hakkında', click: showAbout },
      { type: 'separator' },
      { label: 'Tamamen kapat', click: () => quit() },
    ])
  );
  tray.on('click', () => (state.phase === 'ready' ? openInBrowser() : showStatus()));
  broadcast();
}

function showAbout() {
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Hakkında',
      icon: icon(),
      message: `sosyalmedya ${app.getVersion()}`,
      detail:
        'Sosyal medya gönderilerinizi tek yerden planlayın.\n\n' +
        'Açık kaynaklı Postiz (gitroomhq/postiz-app) üzerine kurulmuştur ve ' +
        'GNU AGPL-3.0 lisansı ile dağıtılır. Kaynak kodu aşağıdaki adreste.',
      buttons: ['Tamam', 'Kaynak kodu'],
    })
    .then(({ response }) => {
      if (response === 1) shell.openExternal(SOURCE_URL);
    });
}

function applyLoginItem(config) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: !!config.openAtLogin,
    args: ['--hidden'],
  });
}

async function startEverything() {
  state = { phase: 'starting', message: 'Hazırlanıyor…', services: {} };
  broadcast();
  try {
    servers = await proxy.listen(cfg.paths().uploads);
    await manager.startAll();
    state.phase = 'ready';
    state.message = 'Hazır!';
    broadcast();
    return true;
  } catch (err) {
    state.phase = 'error';
    state.message = err.message;
    manager.log(`HATA: ${err.stack || err.message}`);
    broadcast();
    return false;
  }
}

function createManager() {
  manager = new ServiceManager();
  manager.on('status', (services) => {
    state.services = services;
    broadcast();
  });
  manager.on('fatal', (name) => {
    state.phase = 'error';
    state.message = `${name} çalışmayı durdurdu. "Günlük dosyalarını göster" ile ayrıntılara bakabilirsiniz.`;
    broadcast();
    if (!SMOKE) showStatus();
  });
  return manager;
}

async function boot() {
  createManager();
  applyLoginItem(manager.config);
  createTray();
  if (!HIDDEN) showStatus();
  const ok = await startEverything();
  if (ok && !HIDDEN) {
    openInBrowser();
  }
}

async function runSmoke() {
  createManager();
  manager.on('log', (line) => process.stdout.write(line + '\n'));
  let code = 1;
  try {
    const ok = await startEverything();
    if (!ok) throw new Error(state.message);
    await smoke.run(manager);
    code = 0;
  } catch (err) {
    manager.log(`SMOKE TEST FAILED: ${err.stack || err.message}`);
  }
  await shutdown();
  app.exit(code);
}

async function shutdown() {
  for (const s of servers) {
    try {
      s.close();
    } catch {}
  }
  servers = [];
  if (manager) await manager.stopAll();
}

async function quit() {
  if (quitting) return;
  quitting = true;
  state.phase = 'stopping';
  state.message = 'Kapatılıyor…';
  broadcast();
  await shutdown();
  app.exit(0);
}

app.on('window-all-closed', () => {
  // Keep running in the tray.
});

app.on('before-quit', (e) => {
  if (!quitting && !SMOKE) {
    e.preventDefault();
    quit();
  }
});

ipcMain.handle('get-state', () => state);
ipcMain.handle('open-app', () => openInBrowser());
ipcMain.handle('open-settings', () => showSettings());
ipcMain.handle('open-logs', () => shell.openPath(cfg.paths().logs));
ipcMain.handle('open-url', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('about', () => showAbout());
ipcMain.handle('retry', async () => {
  await shutdown();
  createManager();
  return startEverything();
});
ipcMain.handle('get-settings', () => {
  const config = cfg.load();
  return {
    providers: cfg.PROVIDERS,
    keys: config.keys,
    openAtLogin: !!config.openAtLogin,
    publicUrl: cfg.PUBLIC_URL,
  };
});
ipcMain.handle('save-settings', async (_e, payload) => {
  let config = cfg.load();
  config = cfg.setKeys(config, payload && payload.keys);
  config.openAtLogin = !!(payload && payload.openAtLogin);
  cfg.save(config);
  applyLoginItem(config);
  if (state.phase !== 'ready') return { restarted: false };
  state.phase = 'starting';
  state.message = 'Yeni ayarlarla yeniden başlatılıyor…';
  broadcast();
  try {
    await manager.restartPostiz();
    state.phase = 'ready';
    state.message = 'Hazır!';
  } catch (err) {
    state.phase = 'error';
    state.message = err.message;
  }
  broadcast();
  return { restarted: true, ok: state.phase === 'ready' };
});
