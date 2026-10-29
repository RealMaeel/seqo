// EQL Overlay - main process
// Creates a transparent, frameless, always-on-top overlay window that can be
// toggled between Edit mode (interactive) and Locked mode (click-through).

const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, screen, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const spelldb = require('./spelldb.js');

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------
const settingsPath = () => path.join(app.getPath('userData'), 'overlay-settings.json');

const DEFAULT_SETTINGS = {
  bounds: { x: 100, y: 100, width: 480, height: 320 },
  opacity: 0.85,            // background panel opacity (0..1)
  fontFamily: 'Segoe UI',
  fontColor: '#ffd766',
  baseFontSize: 22,         // px at base design size; scales with window
  keepAspectRatio: true,
  windowMode: 'zoom',       // 'zoom' = the layout scales with the window · 'room' = a bigger window shows more (2.7.2)
  uiZoom: 100,              // More room: how big everything is, 70–150 %
  locked: false,
  showNotes: false,
  logPath: '',
  lastZone: '',
  autoZoneUpdate: false,
  autoClearLog: false,
  autoRun: false,          // zoning starts a run automatically (End run stays manual)
  archiveOnClear: true,
  alertFlash: true,
  alertSound: true,
  alertVolume: 60,
  mergePets: true,
  buffAlerts: true,
  mutedAlerts: [],
  spellTimers: '',
  posClasses: [],          // Plane of Sky quest tracker: classes shown (max 3)
  updateRepo: 'RealMaeel/seqo',  // GitHub "user/repo" to check Releases for updates
  autoCheckUpdates: true,  // check for a new release at launch
  autoDataCheck: true,     // weekly: did the wiki pages behind Epics/Unlocks change?
  buffWatch: 'Clarity = Your thoughts slow.\nSpirit of Wolf = You feel your feet slow.\nLevitate = You feel your feet touch the ground.',
  wikiUser: '',
  wikiPass: '',
  bisFlag: false,          // BiS drops flagged in toasts/verdicts (opt-in, own class only)
  textScale: 'normal',     // 'normal' | 'large' — fine-print size across overlay + docks
  loginReminder: true,     // once-per-login "/outputfile ..." reminder toast
  needsPanelOpen: false,   // zone-needs panel: restore open state across restarts
  needsPanelMin: false,    // ... and its minimized state
  text: 'Notes: click to edit.'
};

// The wiki bot password is encrypted at rest with Windows DPAPI (Electron
// safeStorage): on disk it lives as wikiPassEnc, only this Windows account can
// decrypt it, and in memory it stays plain wikiPass so nothing else changes.
// A pre-2.5.2 plaintext wikiPass is migrated on the next save. If encryption
// is unavailable, it falls back to the old plaintext behaviour.
function canEncrypt() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (s.wikiPassEnc) {
      try { s.wikiPass = safeStorage.decryptString(Buffer.from(s.wikiPassEnc, 'base64')); }
      catch { s.wikiPass = ''; } // e.g. settings copied from another PC/account
    }
    delete s.wikiPassEnc;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    const out = { ...s };
    if (out.wikiPass && canEncrypt()) {
      out.wikiPassEnc = safeStorage.encryptString(out.wikiPass).toString('base64');
      out.wikiPass = '';
    }
    fs.writeFileSync(settingsPath(), JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

let settings = null;
let win = null;
let tray = null;

// ---------------------------------------------------------------------------
// Error log (v2.7) — see errorlog.js. Errors in the main process and on SEQO's
// own pages land in <userData>/seqo-errors.log, behind ⚙ → 📋 Copy problem report.
// ---------------------------------------------------------------------------
const errorlog = require('./errorlog.js').create({
  dir: () => app.getPath('userData'),
  home: require('os').homedir(),
  appDir: __dirname          // errors name the SEQO file they came from ("lootdb.js:88", "ui/overlay/24-meter.js:120")
});
// a monitor only watches: Electron's own handling of the crash is unchanged
process.on('uncaughtExceptionMonitor', (err) =>
  errorlog.record('main', (err && err.message) || String(err), err && err.stack));
process.on('unhandledRejection', (err) => {
  errorlog.record('main', 'Unhandled promise rejection: ' + ((err && err.message) || String(err)), err && err.stack);
  console.warn('Unhandled promise rejection:', err);
});
{
  const origError = console.error;
  console.error = (...args) => {
    try {
      const text = args.map((x) => x instanceof Error ? x.message
        : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })()).join(' ');
      const errObj = args.find((x) => x instanceof Error);
      // no Error passed: where console.error was called from still names the module
      errorlog.record('main', text, errObj ? errObj.stack : String(new Error().stack || '').split('\n').slice(2).join('\n'));
    } catch { /* never let logging break anything */ }
    origError.apply(console, args);
  };
}
// only SEQO's own pages (file://) — not the hidden windows that read web pages
const seqoPage = (wc) => {
  try { const u = wc.getURL(); return u.startsWith('file:') ? path.basename(new URL(u).pathname, '.html') : null; }
  catch { return null; }
};
app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (ev, level, message, line, sourceId) => {
    const pick = (k, positional) => (ev && ev[k] !== undefined ? ev[k] : positional);
    const lv = pick('level', level);
    if (lv !== 'error' && lv !== 3) return;
    const page = seqoPage(wc);
    if (!page) return;
    const src = pick('sourceId', sourceId);
    errorlog.record(page, pick('message', message), src ? src + ':' + pick('lineNumber', line) : null);
  });
  wc.on('render-process-gone', (_e2, d) => errorlog.record(seqoPage(wc) || 'page',
    'window crashed: ' + ((d && d.reason) || '?') + (d && d.exitCode != null ? ' (exit ' + d.exitCode + ')' : '')));
  wc.on('unresponsive', () => { const page = seqoPage(wc); if (page) errorlog.record(page, 'window stopped responding'); });
});
app.on('will-quit', () => errorlog.flush());

// Base design size: content is authored against this size and uniformly
// scaled up/down as the window is resized, preserving its internal ratio.
const BASE_W = 480;
const BASE_H = 320;

// ---------------------------------------------------------------------------
// Overlay window
// ---------------------------------------------------------------------------
function clampToScreen(bounds) {
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
  const wa = display.workArea;
  const width = Math.min(bounds.width, wa.width);
  const height = Math.min(bounds.height, wa.height);
  const x = Math.min(Math.max(bounds.x, wa.x), wa.x + wa.width - width);
  const y = Math.min(Math.max(bounds.y, wa.y), wa.y + wa.height - height);
  return { x, y, width, height };
}

function createWindow() {
  const b = clampToScreen(settings.bounds);

  win = new BrowserWindow({
    ...b,
    minWidth: 180,
    minHeight: 120,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: false,
    skipTaskbar: true,
    // 'screen-saver' is the highest always-on-top level - needed to stay
    // above borderless-fullscreen games.
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (settings.keepAspectRatio && settings.windowMode !== 'room') {
    win.setAspectRatio(BASE_W / BASE_H);
  }

  win.loadFile('overlay.html');

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('settings', settings);
    applyLockState();
    if (settings.logPath) startTail(settings.logPath);
    else sendLogStatus();

    // Dev-only: replay a log file through the meter (EQL_REPLAY=/path/to/log)
    if (process.env.EQL_REPLAY) {
      try {
        const lines = fs.readFileSync(process.env.EQL_REPLAY, 'latin1')
          .split(/\r?\n/).filter(l => l.length);
        setTimeout(() => {
          for (let i = 0; i < lines.length; i += 2000) {
            win.webContents.send('log-lines', lines.slice(i, i + 2000));
          }
        }, 500);
      } catch (e) { console.error('Replay failed:', e.message); }
    }

    // Headless smoke-test hook (dev only): EQL_TEST=1 captures screenshots.
    if (process.env.EQL_TEST) {
      win.webContents.on('console-message', (_e, _lvl, msg) => console.log('[renderer]', msg));
      const shot = async (name) => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync('/tmp/overlay-' + name + '.png', img.toPNG());
      };
      win.webContents.executeJavaScript('window.__EQLTEST = true; true').catch(() => {});
      setTimeout(async () => {
        try {
          const tabs = (process.env.EQL_TEST_TABS ||
            'meter;breakdown;loot;lookup;item:Flowing Black Silk Sash;export').split(';');
          const wait = +(process.env.EQL_TEST_WAIT || 700);
          for (let i = 0; i < tabs.length; i++) {
            if (tabs[i] === 'syncdemo') { // dev-only: sync status with a pull from "another computer"
              settings.dataDir = '/tmp/eqshare';
              settings.syncFiles = ['/tmp/eqfake/Maeel_neriak_LO1.ini'];
              fs.mkdirSync('/tmp/eqshare/gamefiles', { recursive: true });
              fs.writeFileSync('/tmp/eqshare/gamefiles/sync-marker.json',
                JSON.stringify({ host: 'ED-DESKTOP', at: Date.now() - 20 * 60000 }));
              fs.writeFileSync('/tmp/eqfake/Maeel_neriak_LO1.ini', 'local version');
              await new Promise(r => setTimeout(r, 2100)); // mtime gap > the 2s tolerance
              fs.writeFileSync('/tmp/eqshare/gamefiles/Maeel_neriak_LO1.ini', 'shared newer version');
              const res = syncGameFiles();
              console.log('SYNCVERIFY|' + JSON.stringify(res.summary) + '|' + (res.results || []).join(' ~ '));
              if (win) win.webContents.send('gamefiles-synced', res);
              await win.webContents.executeJavaScript(
                'document.body.classList.add("settings-open");' +
                '[...document.querySelectorAll("#settings details")].forEach((d,x)=>d.open=x===3);true');
              await new Promise(r => setTimeout(r, wait));
              await shot(String(i + 1).padStart(2, '0') + '-sync');
              continue;
            }
            if (tabs[i].startsWith('needshot')) { // dev-only: open + screenshot the zone-needs panel ('needshot' or 'needshot:min')
              openNeeds();
              await new Promise(r => setTimeout(r, wait + 1200));
              if (tabs[i] === 'needshot:min') {
                settings.needsPanelMin = true;
                if (needsWin && !needsWin.isDestroyed()) needsWin.webContents.send('needs-min', true);
                snapDock();
                await new Promise(r => setTimeout(r, 500));
              }
              if (needsWin && !needsWin.isDestroyed()) {
                const img = await needsWin.webContents.capturePage();
                fs.writeFileSync('/tmp/overlay-' + String(i + 1).padStart(2, '0') + '-needs.png', img.toPNG());
              }
              continue;
            }
            if (tabs[i].startsWith('slydock:')) { // dev-only: Slayer route read-out in the dock
              win.webContents.send('test-tab', 'slyroute:' + tabs[i].slice(8));
              await new Promise(r => setTimeout(r, wait + 1500));
              if (dockWin && !dockWin.isDestroyed()) {
                const img = await dockWin.webContents.capturePage();
                fs.writeFileSync('/tmp/overlay-' + String(i + 1).padStart(2, '0') + '-slydock.png', img.toPNG());
              }
              continue;
            }
            if (tabs[i].startsWith('dockshot')) { // dev-only: open + screenshot the dock ('dockshot', 'dockshot:item:Name', 'dockshot:help', 'dockshot:helptopic:N', 'dockshot:guide:Title[:Anchor]')
              const spec = tabs[i].slice(9);
              if (spec.startsWith('item:')) openDock('item', { name: spec.slice(5) });
              else if (spec === 'help') openDock('help');
              else if (spec.startsWith('helptopic:')) {
                openDock('help');
                await new Promise(r => setTimeout(r, 1000));
                if (dockWin && !dockWin.isDestroyed())
                  await dockWin.webContents.executeJavaScript('showHelpTopic(' + (+spec.slice(10) || 0) + ');true');
              }
              else if (spec.startsWith('guide:')) {
                const [t, a] = spec.slice(6).split('|');
                // the sandboxed test env has no network: seed a cached page
                gameDB.guidePages = gameDB.guidePages || {};
                if (!gameDB.guidePages[t]) gameDB.guidePages[t] = {
                  pageTitle: t, revid: 1, updated: Date.now(),
                  wikitext: '== Dwarf ==\n=== Requirements ===\n* Get maximum faction with [[Storm Guard]]\n' +
                    '=== Recommended Method ===\n# Brew \'\'\'Tumpy Tonics\'\'\' from 800 [[Kiola Nut]]s and Flasks of Water.\n' +
                    '# Hand them to Trantor Everhot in [[South Kaladim]] four at a time.\n' +
                    '{| class="wikitable"\n! Item !! Total\n|-\n| Tumpy Tonic || 800\n|}\n'
                };
                openDock('guide', { title: t, anchor: a || undefined, label: t });
              }
              else openDock('cleanup');
              await new Promise(r => setTimeout(r, wait + 1800));
              if (spec.startsWith('filter:') && dockWin && !dockWin.isDestroyed()) {
                await dockWin.webContents.executeJavaScript(
                  'document.getElementById("filter").value=' + JSON.stringify(spec.slice(7)) +
                  ';document.getElementById("filter").dispatchEvent(new Event("input"));true');
                await new Promise(r => setTimeout(r, 400));
              }
              if (spec.startsWith('chip:') && dockWin && !dockWin.isDestroyed()) {
                await dockWin.webContents.executeJavaScript(
                  'pileFilter=' + JSON.stringify(spec.slice(5)) + ';render();true');
                await new Promise(r => setTimeout(r, 400));
              }
              if (dockWin && !dockWin.isDestroyed()) {
                const img = await dockWin.webContents.capturePage();
                fs.writeFileSync('/tmp/overlay-' + String(i + 1).padStart(2, '0') + '-dock.png', img.toPNG());
              }
              continue;
            }
            win.webContents.send('test-tab', tabs[i]);
            await new Promise(r => setTimeout(r, wait));
            await shot(String(i + 1).padStart(2, '0') + '-' + (tabs[i].split(':')[0].replace(/[^a-z]/gi, '') || 'tab'));
          }
          app.quit();
        } catch (e) { console.error(e); app.exit(1); }
      }, 3000);
    }
  });

  const rememberBounds = () => {
    if (!win) return;
    settings.bounds = win.getBounds();
    saveSettings(settings);
    snapDock(); // the dock rides along under the overlay
  };
  win.on('moved', rememberBounds);
  win.on('resized', rememberBounds);
  win.on('move', () => snapDock());
  // clicking the overlay must not bury its popups (same always-on-top layer): keep them above it
  win.on('focus', () => {
    for (const w of [needsWin, dockWin]) if (w && !w.isDestroyed()) { try { w.moveTop(); } catch { /* ok */ } }
  });
  win.on('restore', () => { // back from taskbar: overlay mode again
    win.setSkipTaskbar(true);
    win.setAlwaysOnTop(true, 'screen-saver');
  });
  win.on('closed', () => { win = null; });
}

function applyLockState() {
  if (!win) return;
  if (settings.locked) {
    // Click-through: mouse events pass to the game underneath.
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
  }
  win.webContents.send('lock-state', settings.locked);
  // the attached windows (needs panel, dock) follow the same rules: locked =
  // click-through with hover-to-interact (their renderers drive it), unlocked
  // = ordinary windows
  for (const w of [needsWin, dockWin]) {
    if (!w || w.isDestroyed()) continue;
    if (settings.locked) w.setIgnoreMouseEvents(true, { forward: true });
    else w.setIgnoreMouseEvents(false);
    w.webContents.send('lock-state', settings.locked);
  }
  snapDock();  // the drawn panel shifts between edit/locked — children follow
  updateTrayMenu();
}

function toggleLock() {
  settings.locked = !settings.locked;
  saveSettings(settings);
  applyLockState();
}

function toggleVisibility() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else win.show();
  updateTrayMenu();
}

// ---------------------------------------------------------------------------
// Tray icon
// ---------------------------------------------------------------------------
function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: settings.locked ? 'Unlock (edit mode)  Ctrl+Alt+O' : 'Lock (click-through)  Ctrl+Alt+O', click: toggleLock },
    { label: (win && win.isVisible()) ? 'Hide overlay  Ctrl+Alt+H' : 'Show overlay  Ctrl+Alt+H', click: toggleVisibility },
    { type: 'separator' },
    { label: 'Reset position', click: () => { if (win) win.setBounds({ x: 100, y: 100, width: BASE_W, height: BASE_H }); } },
    { type: 'separator' },
    { label: 'Quit SEQO', click: () => app.quit() }
  ]));
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
    tray.setToolTip('SEQO — Simple EQ Overlay');
    tray.on('click', toggleVisibility); // single-click tray = show/hide
    updateTrayMenu();
  } catch (e) {
    console.error('Tray icon unavailable:', e);
  }
}

// ---------------------------------------------------------------------------
// Game database (zone/item lookup cache, populated from the wiki on demand)
// ---------------------------------------------------------------------------
const updater = require('./updater.js');

// Shareable databases (loot + game data) live in the data folder, which can
// be pointed at a Dropbox / Google Drive / OneDrive folder to sync between
// computers. Machine-specific settings always stay in the local profile.
function dataDir() {
  return (settings && settings.dataDir) || app.getPath('userData');
}
const gameDbPath = () => path.join(dataDir(), 'gamedb.json');
let gameDB = { zones: {}, items: {} };
let gameSaveTimer = null;
// 2.7.2: never save over a database that couldn't be read (Oct 28: a Drive hiccup at startup
// let SEQO save an empty gamedb.json/lootdb.json over the real ones) — see safestore.js
const safestore = require('./safestore.js');
const dbLog = (msg) => { try { errorlog.record('safestore', msg); } catch { /* ok */ } };
const backupHome = () => app.getPath('userData');   // backups stay on this PC, never in the shared folder
const gameStore = safestore.create({
  name: 'gamedb', file: gameDbPath,
  backupDir: () => path.join(backupHome(), 'backups'),
  createDir: () => !settings.dataDir
});

// startup: the file, or (if it can't be read yet) an empty one with saves held until it can
// reload (the shared folder changed on disk): the file, or keep what's in memory → true if reloaded
function loadGameDB({ reload = false } = {}) {
  if (reload) {
    const r = gameStore.read();
    if (r.state !== 'ok') { dbLog('gamedb: reload skipped (' + r.state + ')'); return false; }
    gameDB = r.data;
  } else {
    const g = safestore.loadGuarded(gameStore, {
      fresh: () => ({ zones: {}, items: {} }),
      missingGraceMs: settings.dataDir ? 120000 : 0,
      log: dbLog,
      onRecovered: (data) => {
        gameDB = safestore.mergeGame(data, gameDB);
        tidyGameDB();
        saveGameDBSoon();
        if (win) win.webContents.send('shared-reload');
      }
    });
    gameDB = g.data;
    if (g.state === 'ok') gameStore.dailyBackup();
  }
  tidyGameDB();
  return true;
}
function tidyGameDB() {
  if (!gameDB || typeof gameDB !== 'object' || Array.isArray(gameDB)) gameDB = { zones: {}, items: {} };
  gameDB.zones = gameDB.zones || {};
  gameDB.items = gameDB.items || {};
  delete gameDB.charmSpells; // v1.1.1: purge poisoned auto-learned "charm spells"
  if (!gameStore.blockedWhy()) pruneGameDB(); // v2.5.0: keep the DB lean — it loads, saves and syncs whole
}

// Months of play grow two caches without bound: item-knowledge (every junk
// drop ever judged) and opened guide pages. Prune what hasn't been touched in
// a long while — anything pruned that's still wanted re-fetches cheaply (the
// cleanup scan bulk-checks existence 50 names per request).
function pruneGameDB() {
  try {
    let dropped = 0;
    const ik = gameDB.itemKnowledge || {};
    const entries = Object.entries(ik);
    if (entries.length > 1500) { // cap: keep the 1500 most recently checked
      entries.sort((a, b) => (b[1].checkedAt || 0) - (a[1].checkedAt || 0));
      for (const [k] of entries.slice(1500)) { delete ik[k]; dropped++; }
    }
    const gp = gameDB.guidePages || {};
    const cutoff = Date.now() - 60 * 864e5; // a guide untouched for 60 days re-fetches on next open
    for (const [t, p] of Object.entries(gp))
      if (!p || (p.updated || 0) < cutoff) { delete gp[t]; dropped++; }
    if (dropped) saveGameDBSoon();
  } catch { /* never let housekeeping break startup */ }
}

let lastDbWrite = 0;   // when SEQO itself last wrote a database (the shared-folder watcher skips those)
function saveGameDBSoon() {
  clearTimeout(gameSaveTimer);
  gameSaveTimer = setTimeout(() => {
    try {
      lastDbWrite = Date.now();
      let r = gameStore.write(JSON.stringify(gameDB));
      if (r.conflict) {
        // changed on disk since we read it (another PC via Drive, a restore): merge, newer entries
        // from this session win, then save
        const d = gameStore.read();
        if (d.state !== 'ok') { dbLog('gamedb: file changed and can\'t be read — save held'); return; }
        gameDB = safestore.mergeGame(d.data, gameDB);
        tidyGameDB();
        dbLog('gamedb: file changed on disk — merged before saving');
        lastDbWrite = Date.now();
        r = gameStore.write(JSON.stringify(gameDB));
      }
      if (!r.ok) dbLog('gamedb: save held — ' + (r.skipped || 'file changed'));
      else if (r.backup) dbLog('gamedb: saved much smaller than before; old copy kept at ' + r.backup);
    } catch (e) { dbLog('gamedb: save failed — ' + (e.message || e)); }
  }, 1000);
}

// ---------------------------------------------------------------------------
// Shared data folder: choose, migrate, and watch for changes synced in from
// another computer (Dropbox/Drive writes the file; we reload and re-push).
// ---------------------------------------------------------------------------
ipcMain.handle('choose-data-folder', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Select shared data folder (e.g. a folder inside Dropbox or Google Drive)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths.length) return { dir: dataDir(), changed: false };
  const newDir = res.filePaths[0];
  // migrate: if the shared folder doesn't have DBs yet, seed it with ours;
  // if it does, the shared copies win (that's the point of sharing)
  try {
    for (const f of ['lootdb.json', 'gamedb.json']) {
      const src = path.join(dataDir(), f);
      const dst = path.join(newDir, f);
      if (!fs.existsSync(dst) && fs.existsSync(src)) fs.copyFileSync(src, dst);
    }
  } catch (e) { return { error: e.message }; }
  settings.dataDir = newDir;
  saveSettings(settings);
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('data-dir-status', () => ({
  dir: dataDir(),
  shared: !!settings.dataDir,
  held: [lootStore.savesHeld() && 'loot', gameStore.blockedWhy() && 'game data'].filter(Boolean).join(' + ') + ((lootStore.savesHeld() || gameStore.blockedWhy()) ? ': ' + (lootStore.savesHeld() || gameStore.blockedWhy()) : '')
}));

// ---------------------------------------------------------------------------
// Synced game files: user-chosen files (character loadouts like
// Maeel_neriak_LO1.ini, UI layouts, etc.) mirrored through the shared folder.
// Newest copy wins; the overwritten side gets a .seqo.bak backup first.
// Local paths are per-machine (installs differ); the shared side is keyed
// by filename under <dataDir>/gamefiles/.
// ---------------------------------------------------------------------------
const gamesync = require('./gamesync.js').create({
  getSettings: () => settings,
  saveSettings,
  dataDir,
  getWin: () => win
});
const { syncGameFiles, watchGameFiles } = gamesync;

// Session history (v2.6): saved sessions + loot runs, browse/compare/export.
// Local profile only — see history.js for why it never goes in the sync folder.
const history = require('./history.js').create({ dir: () => app.getPath('userData') });
ipcMain.on('history-upsert', (_e, entry) => history.upsert(entry));
const chatlog = require('./chatlog.js').create({ dir: () => app.getPath('userData') });
// Market prices from WTS/WTB chat (prices.js): local profile, like history
const priceStore = require('./prices.js').createStore({ dir: () => app.getPath('userData') });
ipcMain.on('prices-add', (_e, list) => priceStore.add(list));
ipcMain.handle('prices-query', (_e, opts) => ({ rows: priceStore.query(opts || {}), total: priceStore.count() }));
ipcMain.handle('prices-detail', (_e, { key, days }) => priceStore.detail(key, days));
ipcMain.on('chat-add', (_e, batch) => chatlog.add(batch));
ipcMain.handle('chat-list', () => chatlog.list());
ipcMain.handle('chat-clear', () => { chatlog.clear(); return true; });
ipcMain.handle('history-list', () => history.list());
// Import old logs (Logs\ + Logs\archive\) into History, oldest first, one
// importer per character so a session that spans a log rotation stays whole.
// Sessions overlapping one SEQO already saved live are skipped.
let historyImporting = false;
ipcMain.handle('history-import-logs', async () => {
  if (historyImporting) return { error: 'an import is already running' };
  const logPath = settings.logPath;
  if (!logPath) return { error: 'pick your log file in Settings first' };
  const logsDir = path.dirname(logPath);
  const files = [];
  for (const d of [path.join(logsDir, 'archive'), logsDir]) {
    let names = [];
    try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names) {
      const m = /^eqlog_(.+?)_(.+?)(?:-\d{4}-\d\d-\d\d-\d\d-\d\d)?\.txt$/i.exec(n);
      if (!m) continue;
      const p = path.join(d, n);
      let st; try { st = fs.statSync(p); } catch { continue; }
      files.push({ p, char: m[1], mtime: st.mtimeMs, size: st.size });
    }
  }
  if (!files.length) return { error: 'no eqlog files found next to your log' };
  files.sort((a, b) => a.mtime - b.mtime);
  historyImporting = true;
  // the spell files tell which classes cast what: your class makeup per kill (2.7). Without them, no makeup.
  let spellDB = null;
  try {
    const root = gameRootFromLog(logPath);
    if (root) spellDB = await spelldb.getSpellDB(root, app.getPath('userData'));
  } catch { spellDB = null; }
  const parser = require('./parser.js');
  const { createImporter } = require('./historyimport.js');
  const readline = require('readline');
  const byChar = new Map();
  const totalBytes = files.reduce((a, f) => a + f.size, 0);
  let doneBytes = 0;
  try {
    for (const f of files) {
      if (!byChar.has(f.char)) byChar.set(f.char, createImporter({ parser, char: f.char, prices: require('./prices.js'), spellDB }));
      const imp = byChar.get(f.char);
      const rl = readline.createInterface({ input: fs.createReadStream(f.p, { encoding: 'latin1' }), crlfDelay: Infinity });
      let n = 0;
      for await (const line of rl) {
        if (line) imp.line(line);
        if (++n % 200000 === 0 && win) win.webContents.send('history-import-progress', { file: path.basename(f.p), pct: Math.round((doneBytes / totalBytes) * 100) });
      }
      doneBytes += f.size;
      if (win) win.webContents.send('history-import-progress', { file: path.basename(f.p), pct: Math.round((doneBytes / totalBytes) * 100) });
    }
    const live = history.list().filter(e => e.type === 'session' && !e.imported);
    let added = 0, skipped = 0;
    for (const [, imp] of byChar) {
      for (const s of imp.finish()) {
        const clash = live.some(e => (!e.char || e.char === s.char) && e.start <= s.end && (e.end || e.start) >= s.start);
        if (clash) { skipped++; continue; }
        history.upsert(s); added++;
      }
    }
    history.flush();
    let prices = 0;
    for (const [, imp] of byChar) prices += priceStore.add(imp.offers());
    priceStore.flush();
    // when each kill happened, for mobs you already have kill records for (2.7)
    let killTimes = 0;
    for (const [, imp] of byChar) killTimes += lootStore.addKillTimes(imp.killTimes());
    // spells seen cast or sung (2.7.2): proof they exist in Legends, for the buff planner
    let spells = 0;
    const seen = gameDB.spellsSeen = gameDB.spellsSeen || {};
    for (const [, imp] of byChar) for (const [n, t] of Object.entries(imp.spellsSeen())) if (spellproof.noteSeen(seen, n, t)) spells++;
    if (spells) saveGameDBSoon();
    return { ok: true, added, skipped, files: files.length, prices, killTimes, spells };
  } catch (e) {
    return { error: e.message || String(e) };
  } finally { historyImporting = false; }
});
ipcMain.handle('history-remove', (_e, id) => history.remove(id));
ipcMain.handle('history-note', (_e, { id, note }) => history.setNote(id, note));
// Custom alerts: import a GINA package (.gtp = zip with ShareData.xml) or an
// exported GINA .xml. Returns the triggers converted to SEQO rules.
ipcMain.handle('import-gina-file', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Import GINA triggers', properties: ['openFile'],
    filters: [{ name: 'GINA triggers', extensions: ['gtp', 'xml', 'txt'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  try {
    const A = require('./alerts.js');
    const buf = fs.readFileSync(res.filePaths[0]);
    // GINA writes UTF-8 or UTF-16 (with a byte-order mark) depending on how it was exported
    const text = (b) => b[0] === 0xff && b[1] === 0xfe ? b.slice(2).toString('utf16le')
      : b[0] === 0xfe && b[1] === 0xff ? Buffer.from(b.slice(2)).swap16().toString('utf16le')
      : b.toString('utf8').replace(/^\uFEFF/, '');
    const xml = buf.readUInt32LE(0) === 0x04034b50 ? A.unzipFirstXml(buf) : text(buf);
    if (!xml) return { error: 'no trigger XML found in that file' };
    const rules = A.ginaToRules(xml);
    return rules.length ? { rules, file: path.basename(res.filePaths[0]) } : { error: 'no triggers found in that file' };
  } catch (e) { return { error: e.message || String(e) }; }
});
ipcMain.handle('history-export', async (_e, { ids, format }) => {
  const H = require('./history.js');
  const all = history.list();
  const pick = Array.isArray(ids) && ids.length ? all.filter(e => ids.includes(e.id)) : all;
  if (!pick.length) return { ok: false, error: 'nothing to export' };
  const md = format === 'md';
  const res = await dialog.showSaveDialog(win, {
    title: 'Export SEQO history',
    defaultPath: 'seqo-history-' + new Date().toISOString().slice(0, 10) + (md ? '.md' : '.csv'),
    filters: md ? [{ name: 'Markdown', extensions: ['md'] }] : [{ name: 'CSV (Excel, Sheets)', extensions: ['csv'] }]
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  try {
    // CSV gets a BOM so Excel reads the UTF-8 names (Ak'Anon, ☠) correctly
    fs.writeFileSync(res.filePath, md ? H.toMarkdown(pick) : '\ufeff' + H.toCSV(pick), 'utf8');
    return { ok: true, path: res.filePath, count: pick.length };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('get-sync-files', () => settings.syncFiles || []);

ipcMain.handle('add-sync-file', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose game file(s) to sync (e.g. your _LO1 loadout file)',
    properties: ['openFile', 'multiSelections']
  });
  if (!res.canceled && res.filePaths.length) {
    settings.syncFiles = [...new Set([...(settings.syncFiles || []), ...res.filePaths])];
    saveSettings(settings);
    watchGameFiles();
    return { files: settings.syncFiles, ...syncGameFiles() };
  }
  return { files: settings.syncFiles || [] };
});

ipcMain.handle('add-sync-folder', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a folder to sync (e.g. your custom UI skin in uifiles\\<skinname>)',
    properties: ['openDirectory']
  });
  if (!res.canceled && res.filePaths.length) {
    settings.syncFiles = [...new Set([...(settings.syncFiles || []), ...res.filePaths])];
    saveSettings(settings);
    watchGameFiles();
    return { files: settings.syncFiles, ...syncGameFiles() };
  }
  return { files: settings.syncFiles || [] };
});

ipcMain.on('remove-sync-file', (_e, p) => {
  settings.syncFiles = (settings.syncFiles || []).filter(f => f !== p);
  saveSettings(settings);
  watchGameFiles();
});

ipcMain.handle('sync-game-files', () => syncGameFiles());

function watchSharedDBs() {
  if (!settings.dataDir) return; // only needed when sharing
  for (const p of [lootDbPath(), gameDbPath()]) {
    fs.watchFile(p, { interval: 3000 }, (curr, prev) => {
      if (curr.mtimeMs === prev.mtimeMs) return;
      if (Date.now() - lastDbWrite < 4000) return; // our own write, not a sync
      // 2.7.2: a file caught mid-sync (half written) is skipped, not loaded as empty —
      // the next change notice reloads it once Drive has finished
      const a = loadLootDB({ reload: true });
      const b = loadGameDB({ reload: true });
      if (!a && !b) return;
      if (win) {
        win.webContents.send('loot-db', lootStore.db);
        win.webContents.send('shared-reload');
      }
    });
  }
}

ipcMain.handle('get-zone-data', (_e, zone) => gameDB.zones[zone] || null);

ipcMain.handle('update-zone-data', async (_e, zone, aliases) => {
  try {
    const data = await updater.fetchZoneData(zone, aliases || []);
    gameDB.zones[zone] = data;
    saveGameDBSoon();
    return data;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('get-item-data', (_e, name) => gameDB.items[name.toLowerCase()] || null);

// eqlegendstools' data pages are JavaScript-rendered, so plain fetches see
// empty shells. SEQO is a browser: render each page in a hidden window and
// read the finished text. Used only on cache refresh (weekly), politely.
function scrapeRenderedText(url) {
  return new Promise((resolve) => {
    let w = null;
    let settled = false;
    const done = (txt) => {
      if (settled) return;
      settled = true;
      try { if (w && !w.isDestroyed()) w.destroy(); } catch {}
      resolve(String(txt || ''));
    };
    try {
      w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, images: false } });
      w.webContents.once('did-finish-load', async () => {
        await new Promise(r => setTimeout(r, 3500));   // let the JS render
        try { done(await w.webContents.executeJavaScript('document.body.innerText', true)); }
        catch { done(''); }
      });
      w.webContents.once('did-fail-load', () => done(''));
      w.loadURL(url).catch(() => done(''));
      setTimeout(() => done(''), 25000);               // hard cap
    } catch { done(''); }
  });
}

// Re-scrape the live BiS gear table from eqlegendstools.com (one hidden
// window, selecting each class in turn). Result is stored in gameDB.bisData
// and overrides the static seed in bis.js. Credit: eqlegendstools.com.
const BIS_CLASSES = ['Bard', 'Beastlord', 'Berserker', 'Cleric', 'Druid', 'Enchanter',
  'Magician', 'Monk', 'Necromancer', 'Paladin', 'Ranger', 'Rogue', 'Shadow Knight',
  'Shaman', 'Warrior', 'Wizard'];

function scrapeBisData() {
  return new Promise((resolve) => {
    let w = null, settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      try { if (w && !w.isDestroyed()) w.destroy(); } catch { /* ok */ }
      resolve(v);
    };
    try {
      w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, images: false } });
      w.webContents.once('did-finish-load', async () => {
        try {
          await new Promise(r => setTimeout(r, 3000));
          const script = `(async () => {
            const s1 = document.getElementById('gearClassSelect1');
            const s2 = document.getElementById('gearClassSelect2');
            const s3 = document.getElementById('gearClassSelect3');
            if (!s1) return null;
            const fire = (el) => el.dispatchEvent(new Event('change', { bubbles: true }));
            s2.value = ''; fire(s2); s3.value = ''; fire(s3);
            const allSlots = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'All Slots');
            if (allSlots) allSlots.click();
            const num = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
            // map columns by header text so new site columns (e.g. Accuracy)
            // don't break the scrape or get missed
            const findCols = () => {
              const ths = [...document.querySelectorAll('table thead th, table tr th')]
                .map(th => th.textContent.trim().toLowerCase());
              const at = (...names) => ths.findIndex(h => names.some(n => h === n || h.startsWith(n)));
              const idx = {
                name: at('name', 'item'), slot: at('slot'), ac: at('ac'),
                hp: at('hp'), mana: at('mana'), acc: at('accuracy', 'acc'),
                sp: at('special', 'effect'), src: at('source', 'drops', 'from')
              };
              // fall back to the known layout if headers aren't found
              if (idx.name < 0) Object.assign(idx, { name: 1, slot: 2, ac: 3, hp: 4, mana: 5, acc: -1, sp: 19, src: 20 });
              return idx;
            };
            const out = {};
            for (const cls of ${JSON.stringify(BIS_CLASSES)}) {
              s1.value = cls; fire(s1);
              await new Promise(r => setTimeout(r, 700));
              const col = findCols();
              const bySlot = {};
              for (const tr of document.querySelectorAll('table tbody tr')) {
                const c = [...tr.cells].map(td => td.textContent.trim());
                const g = (i) => (i >= 0 && c[i] !== undefined) ? c[i] : '';
                const slot = g(col.slot);
                if (!g(col.name) || !slot) continue;
                const row = { n: g(col.name), ac: num(g(col.ac)), hp: num(g(col.hp)), mana: num(g(col.mana)), sp: g(col.sp) || undefined, src: g(col.src) || '' };
                const acc = num(g(col.acc));
                if (acc) row.acc = acc;
                (bySlot[slot] = bySlot[slot] || []).push(row);
              }
              // keep top entries per slot: 6 by AC + 4 by HP + 4 by mana
              const trimmed = {};
              for (const [slot, rs] of Object.entries(bySlot)) {
                const pick = new Set();
                for (const r of [...rs].sort((a, b) => b.ac - a.ac).slice(0, 6)) pick.add(r);
                for (const r of [...rs].sort((a, b) => b.hp - a.hp).slice(0, 4)) pick.add(r);
                for (const r of [...rs].sort((a, b) => b.mana - a.mana).slice(0, 4)) pick.add(r);
                trimmed[slot] = [...pick];
              }
              out[cls] = trimmed;
            }
            return out;
          })()`;
          const data = await w.webContents.executeJavaScript(script, true);
          done(data && Object.keys(data).length === BIS_CLASSES.length ? data : null);
        } catch { done(null); }
      });
      w.webContents.once('did-fail-load', () => done(null));
      w.loadURL('https://eqlegendstools.com/bis-gear/').catch(() => done(null));
      setTimeout(() => done(null), 60000);
    } catch { done(null); }
  });
}

ipcMain.handle('update-bis', async () => {
  const data = await scrapeBisData();
  if (!data) return { error: 'Could not read the live BiS table — try again later (the built-in list still works).' };
  gameDB.bisData = { data, updated: Date.now() };
  saveGameDBSoon();
  return { classes: Object.keys(data).length, updated: gameDB.bisData.updated };
});

ipcMain.handle('get-bisdata', () => gameDB.bisData || null);

// "not a rare" list: mobs the wiki lists with drops (so they land in the
// zone's named set) that the player says aren't rares — e.g. haunted chests.
ipcMain.on('set-not-rare', (_e, { zone, mob, ignored }) => {
  if (!mob) return;
  gameDB.notRares = gameDB.notRares || {};
  const arr = new Set(gameDB.notRares[zone || ''] || []);
  if (ignored) arr.add(mob); else arr.delete(mob);
  if (arr.size) gameDB.notRares[zone || ''] = [...arr];
  else delete gameDB.notRares[zone || ''];
  saveGameDBSoon();
});
ipcMain.handle('get-not-rares', () => gameDB.notRares || {});

// epic checklist manual tick-offs ('cls|item' -> true): turn-ins the
// inventory file can't see. Synced with the game DB like everything else.
ipcMain.on('set-epic-tick', (_e, { key, on }) => {
  if (!key) return;
  gameDB.epicTicks = gameDB.epicTicks || {};
  if (on) gameDB.epicTicks[key] = true; else delete gameDB.epicTicks[key];
  saveGameDBSoon();
});
ipcMain.handle('get-epic-ticks', () => gameDB.epicTicks || {});

// free-form notes — plain text, synced with the rest of the game database
ipcMain.on('set-notes', (_e, text) => {
  gameDB.notes = String(text || '').slice(0, 200000);
  saveGameDBSoon();
});
ipcMain.handle('get-notes', () => gameDB.notes || '');

// ---------------------------------------------------------------------------
// Cleanup window: a separate resizable window listing every bag/bank item
// with a keep/toss verdict. The OVERLAY renderer owns all the logic and data;
// this window is a dumb view — main just relays rows one way, commands back.
// ---------------------------------------------------------------------------
// The dock: one always-on-top panel that SNAPS TO THE OVERLAY'S BOTTOM EDGE
// and follows it around — the roomy place for anything that needs space
// (Cleanup, item details). Closable from inside; height is remembered;
// 📌 detaches it into a free-floating window.
let dockWin = null;
let dockDetached = false;
let needsWin = null;          // zone-needs strip: its own slim window
let needsDetached = false;
const NEEDS_MIN_H = 32;       // minimized: one summary line

function needsHeight() {
  return settings.needsPanelMin ? NEEDS_MIN_H : Math.max(90, settings.needsHeight || 150);
}

// attached windows sit at ~the overlay's opacity (floored so they stay usable)
const childOpacity = () => Math.max(0.3, Math.min(1, settings.opacity !== undefined ? settings.opacity : 0.95));
function applyChildOpacity() {
  for (const w of [dockWin, needsWin])
    if (w && !w.isDestroyed()) { try { w.setOpacity(childOpacity()); } catch { /* ok */ } }
}

// The overlay DRAWS its panel centered inside the window (480×290 design,
// uniformly scaled; the 30px toolbar strip only exists in edit mode). Snapping
// children to the WINDOW bottom leaves a gap in locked mode — snap to the
// drawn panel instead. Mirrors rescale() in overlay.html exactly.
// 2.7.2: More room fills the whole window — use layout.js, the same math as rescale(), or the
// popups snapped to a 480×290 panel in the MIDDLE of a big window and sat behind it (Ed).
const EQLLayoutMain = require('./layout.js');
function panelRect() {
  const b = win.getBounds();
  const tb = settings.locked ? 0 : 30;
  const availW = b.width, availH = b.height - tb;
  const room = settings.windowMode === 'room';
  const box = EQLLayoutMain.contentBox({ mode: room ? 'room' : 'zoom', zoom: settings.uiZoom, availW, availH, baseW: 480, baseH: 290 });
  const w = Math.round((room ? box.width : 480) * box.scale), h = Math.round((room ? box.height : 290) * box.scale);
  return {
    x: b.x + Math.round((availW - w) / 2),
    top: b.y + tb + Math.round((availH - h) / 2),
    bottom: b.y + tb + Math.round((availH + h) / 2),
    w
  };
}

function snapDock() {
  if (!win) return;
  const r = panelRect();
  const width = Math.max(320, r.w);
  let y = r.bottom;
  // no room under the overlay on its screen (a tall More room window): stack ABOVE it instead,
  // and as a last resort inside the screen — popups must never end up hidden or off-screen
  const attachedH = ((needsWin && !needsWin.isDestroyed() && !needsDetached) ? needsHeight() : 0) +
    ((dockWin && !dockWin.isDestroyed() && !dockDetached) ? Math.max(160, settings.dockHeight || 300) : 0);
  if (attachedH) {
    try {
      const wa = screen.getDisplayMatching(win.getBounds()).workArea;
      if (y + attachedH > wa.y + wa.height) y = r.top - attachedH >= wa.y ? r.top - attachedH : Math.max(wa.y, wa.y + wa.height - attachedH);
    } catch { /* keep below */ }
  }
  // the zone-needs strip rides directly under the overlay's drawn panel…
  if (needsWin && !needsWin.isDestroyed() && !needsDetached) {
    const h = needsHeight();
    needsWin.setBounds({ x: r.x, y, width, height: h });
    y += h;
  }
  // …and the dock stacks under whatever is above it
  if (dockWin && !dockWin.isDestroyed() && !dockDetached) {
    const h = Math.max(160, settings.dockHeight || 300);
    dockWin.setBounds({ x: r.x, y, width, height: h });
  }
}

function openDock(mode, payload) {
  if (!dockWin || dockWin.isDestroyed()) {
    dockWin = new BrowserWindow({
      width: 480, height: Math.max(160, settings.dockHeight || 300),
      minWidth: 320, minHeight: 160,
      frame: false, transparent: false, backgroundColor: '#16161d',
      skipTaskbar: true, resizable: true, alwaysOnTop: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    dockWin.setAlwaysOnTop(true, 'screen-saver'); // same layer as the overlay
    dockWin.loadFile('dock.html');
    dockWin.on('closed', () => {
      dockWin = null;
      dockDetached = false;   // the next popup opens attached again (the 📌 in it detaches)
      if (win) win.webContents.send('cleanup-state', false);
    });
    dockWin.on('resized', () => { // user dragged: keep the height, re-snap position/width
      if (!dockWin || dockWin.isDestroyed()) return;
      settings.dockHeight = dockWin.getBounds().height;
      saveSettings(settings);
      snapDock();
    });
    dockWin.webContents.once('did-finish-load', () => {
      snapDock();
      dockWin.moveTop();
      applyChildOpacity();
      dockWin.webContents.send('ui-scale', settings.textScale || 'normal');
      if (settings.locked) { // born locked: click-through with hover-to-interact
        dockWin.setIgnoreMouseEvents(true, { forward: true });
        dockWin.webContents.send('lock-state', true);
      }
      dockWin.webContents.send('dock-mode', { mode, payload });
      if (win && mode === 'cleanup') win.webContents.send('cleanup-state', true);
    });
    return;
  }
  snapDock();
  dockWin.moveTop();   // never open behind the overlay
  dockWin.focus();
  dockWin.webContents.send('dock-mode', { mode, payload });
  if (win && mode === 'cleanup') win.webContents.send('cleanup-state', true);
}

ipcMain.on('open-dock', (_e, { mode, payload }) => openDock(mode, payload));
ipcMain.on('open-cleanup', () => openDock('cleanup'));
ipcMain.on('close-dock', () => { if (dockWin && !dockWin.isDestroyed()) dockWin.close(); });
ipcMain.on('dock-detach', (_e, detached) => {
  dockDetached = !!detached;
  if (!dockDetached) snapDock();
  else if (dockWin && !dockWin.isDestroyed()) dockWin.setResizable(true);
});

// overlay → dock (cleanup rows / scan progress)
ipcMain.on('cleanup-data', (_e, payload) => {
  if (dockWin && !dockWin.isDestroyed()) dockWin.webContents.send('cleanup-data', payload);
});
// dock → overlay (commands: scan / junk / refresh / lookup / exaltview / wish)
ipcMain.on('cleanup-cmd', (_e, cmd) => {
  if (win) win.webContents.send('cleanup-cmd', cmd);
});

// ---------------------------------------------------------------------------
// Zone-needs panel: a slim, PERSISTENT, minimizable strip glued under the
// overlay listing what you still need from the current zone. Its own window,
// so the dock (Cleanup / item details) can be open at the same time — the
// dock simply stacks below it. Open state and size survive restarts.
// ---------------------------------------------------------------------------
function openNeeds() {
  if (needsWin && !needsWin.isDestroyed()) { snapDock(); needsWin.moveTop(); needsWin.focus(); return; }
  needsWin = new BrowserWindow({
    width: 480, height: needsHeight(), minWidth: 320, minHeight: NEEDS_MIN_H,
    frame: false, transparent: false, backgroundColor: '#14141c',
    skipTaskbar: true, resizable: !settings.needsPanelMin, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  needsWin.setAlwaysOnTop(true, 'screen-saver');
  needsWin.loadFile('needs.html');
  needsWin.on('closed', () => {
    needsWin = null;
    needsDetached = false;
    settings.needsPanelOpen = false;
    saveSettings(settings);
    if (win) win.webContents.send('needs-state', false);
    snapDock();
  });
  needsWin.on('resized', () => {
    if (!needsWin || needsWin.isDestroyed()) return;
    if (!settings.needsPanelMin) {
      settings.needsHeight = needsWin.getBounds().height;
      saveSettings(settings);
    }
    snapDock();
  });
  needsWin.webContents.once('did-finish-load', () => {
    snapDock();
    needsWin.moveTop();
    applyChildOpacity();
    needsWin.webContents.send('ui-scale', settings.textScale || 'normal');
    needsWin.webContents.send('needs-min', !!settings.needsPanelMin);
    if (settings.locked) { // born locked: click-through with hover-to-interact
      needsWin.setIgnoreMouseEvents(true, { forward: true });
      needsWin.webContents.send('lock-state', true);
    }
    if (win) win.webContents.send('needs-state', true);
  });
  settings.needsPanelOpen = true;
  saveSettings(settings);
}
ipcMain.on('open-needs', () => openNeeds());
ipcMain.on('close-needs', () => { if (needsWin && !needsWin.isDestroyed()) needsWin.close(); });
ipcMain.on('needs-detach', (_e, detached) => {
  needsDetached = !!detached;
  if (!needsDetached) snapDock();
});
ipcMain.on('needs-minimize', (_e, minimized) => {
  settings.needsPanelMin = !!minimized;
  saveSettings(settings);
  if (needsWin && !needsWin.isDestroyed()) {
    needsWin.setResizable(!settings.needsPanelMin);
    needsWin.webContents.send('needs-min', settings.needsPanelMin);
  }
  snapDock();
});
// overlay → needs panel (rows) · needs panel → overlay (commands)
ipcMain.on('needs-data', (_e, payload) => {
  if (needsWin && !needsWin.isDestroyed()) needsWin.webContents.send('needs-data', payload);
});
ipcMain.on('needs-cmd', (_e, cmd) => { if (win) win.webContents.send('needs-cmd', cmd); });

// ---------------------------------------------------------------------------
// Exaltations browser: effect index (per exaltation type) + per-effect item
// lists, pulled read-only from the wiki and cached in the game DB.
// ---------------------------------------------------------------------------
ipcMain.handle('get-exalt-index', () => gameDB.exaltIndex || null);
ipcMain.handle('update-exalt-index', async () => {
  try {
    gameDB.exaltIndex = await updater.fetchExaltIndex();
    saveGameDBSoon();
    return gameDB.exaltIndex;
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle('get-effect-items', async (_e, name) => {
  gameDB.effects = gameDB.effects || {};
  if (gameDB.effects[name]) return gameDB.effects[name];
  try {
    const data = await updater.fetchEffectItems(name);
    gameDB.effects[name] = data;
    saveGameDBSoon();
    return data;
  } catch (e) { return { error: e.message }; }
});

// permanent item knowledge (what each item is for), synced with the game DB
ipcMain.on('set-item-knowledge', (_e, { key, entry }) => {
  if (!key) return;
  gameDB.itemKnowledge = gameDB.itemKnowledge || {};
  gameDB.itemKnowledge[key] = entry;
  saveGameDBSoon();
});
ipcMain.handle('get-item-knowledge', () => gameDB.itemKnowledge || {});
// your own corrections from the game (2.7, itemfix.js): they win over eqlwiki everywhere,
// live in the game DB (synced with your data folder) and no wiki refresh touches them
ipcMain.handle('get-item-fixes', () => gameDB.itemFixes || {});
ipcMain.handle('set-item-fix', (_e, { key, fix }) => {
  if (!key || typeof key !== 'string' || key.length > 120) return false;
  gameDB.itemFixes = gameDB.itemFixes || {};
  if (fix && typeof fix === 'object') gameDB.itemFixes[key] = JSON.parse(JSON.stringify(fix));
  else delete gameDB.itemFixes[key];
  saveGameDBSoon();
  return true;
});

// ---- spell database from the game's own files (spelldb.js) ----
// Parsed once per game patch, cached locally (machine-specific — NEVER in the
// shared/synced folder). The renderer gets the compact maps in one shot.
let spellDbBuilding = null;
ipcMain.handle('get-spell-db', async () => {
  const root = settings.logPath ? gameRootFromLog(settings.logPath) : null;
  if (!root) return { error: 'pick your log file first — the spell data lives next to it' };
  try {
    if (!spellDbBuilding) spellDbBuilding = spelldb.getSpellDB(root, app.getPath('userData'));
    const db = await spellDbBuilding;
    spellDbBuilding = null;
    return db || { error: 'no spells_us.txt next to your Logs folder — is the log inside the game folder?' };
  } catch (e) {
    spellDbBuilding = null;
    return { error: e.message || String(e) };
  }
});

// 2.7.2: spells seen cast/sung in your logs (anyone's casts) — evidence a spell is really in
// Legends (spellproof.js). { base name: last seen ms } in gameDB.spellsSeen.
const spellproof = require('./spellproof.js');
ipcMain.handle('get-spells-seen', () => gameDB.spellsSeen || {});
ipcMain.on('spells-seen', (_e, list) => {
  const seen = gameDB.spellsSeen = gameDB.spellsSeen || {};
  let changed = false;
  for (const x of Array.isArray(list) ? list.slice(0, 500) : [])
    if (x && typeof x.n === 'string' && spellproof.noteSeen(seen, x.n, +x.t || Date.now())) changed = true;
  if (changed) saveGameDBSoon();
});

// bulk wiki existence pre-check for the cleanup scan: one query per 50 titles
// instead of parse + search fallbacks per missing item
// Spellbook check: which client spells really exist in Legends? The client ships
// live-EQ data (later expansions' ports, illusions), so a spell counts as
// obtainable once eqlwiki has a page for it. Answers cached 30 days in gameDB.
ipcMain.handle('spell-wiki-check', async (_e, names) => {
  const cache = gameDB.spellPages = gameDB.spellPages || {};
  const now = Date.now(), fresh = 30 * 864e5;
  const want = (names || []).filter(n => typeof n === 'string' && n).slice(0, 2500);
  const unknown = want.filter(n => !cache[n] || now - cache[n].at > fresh);
  let error = null;
  for (let i = 0; i < unknown.length; i += 400) {
    try {
      const r = await updater.pagesExist(unknown.slice(i, i + 400));
      if (r && r.error) { error = r.error; break; }
      for (const n of unknown.slice(i, i + 400)) {
        const v = r && (r[n] !== undefined ? r[n] : r[n.replace(/ /g, '_')]);
        if (v !== undefined) cache[n] = { ok: !!v, at: now };
      }
    } catch (e) { error = e.message || String(e); break; }
  }
  saveGameDBSoon();
  const out = {};
  for (const n of want) if (cache[n]) out[n] = cache[n].ok;
  return { pages: out, error };
});

// Cleanup (2.7): items eqlwiki has no page for — eqlegendstools, your loot records, then
// the P99 wiki (classic EQ), each answer naming its source. See itemsources.js.
const itemSources = require('./itemsources.js').create({
  updater, getGameDB: () => gameDB, getLootDB: () => lootStore.db
});
ipcMain.handle('item-alt-source', async (_e, name) => {
  try { return await itemSources.lookup(String(name || '')); } catch (e) { return { src: '', error: e.message || String(e) }; }
});
ipcMain.handle('check-pages-exist', async (_e, titles) => {
  try {
    return await updater.pagesExist((titles || []).filter(Boolean).slice(0, 400));
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

// clipboard for the copy-to-chat buttons (renderer is sandboxed)
ipcMain.on('copy-text', (_e, text) => {
  try { require('electron').clipboard.writeText(String(text || '')); } catch { /* ok */ }
});

// ⚙ → 📋 Copy problem report: versions, recent errors, settings (no passwords,
// notes or user-folder paths), straight to the clipboard
ipcMain.handle('problem-report', () => {
  const os = require('os');
  let exports = 'none found';
  try { exports = ['inventory', 'achievements', 'factions', 'spellbook'].filter((k) => gameData[k]).join(', ') || 'none found'; } catch { /* ok */ }
  const text = errorlog.buildReport({
    version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
    os: (os.version ? os.version() : os.type()) + ' (' + os.release() + ', ' + process.arch + ')', locale: app.getLocale(),
    settings,
    extras: {
      'Log file': (settings && settings.logPath) || '(none picked)',
      'Log being read': tail ? 'yes' : 'no',
      'Data folder': dataDir(),
      'Loot DB': Object.keys((lootStore.db && lootStore.db.mobs) || {}).length + ' mobs',
      'Saves held': [lootStore.savesHeld() && 'lootdb: ' + lootStore.savesHeld(), gameStore.blockedWhy() && 'gamedb: ' + gameStore.blockedWhy()].filter(Boolean).join('; ') || 'no',
      'Game exports found': exports
    }
  });
  try { require('electron').clipboard.writeText(text); } catch (e) { return { error: e.message }; }
  return { ok: true, lines: text.split('\n').length, errors: errorlog.recent(1000).length };
});

async function refreshToolsPages() {
  const pages = { _updated: Date.now() };
  for (const [name, url] of updater.EQLTOOLS_PAGES) {
    const txt = await scrapeRenderedText(url);
    const lines = txt.replace(/\t/g, ' | ').split('\n')
      .map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 2);
    if (lines.length > 20) pages[name] = { url, lines, updated: Date.now() };
  }
  return pages;
}

ipcMain.handle('update-item-data', async (_e, name) => {
  // "Update from sources": eqlwiki page + eqlegendstools matches, together.
  let data = null, wikiError = null;
  try {
    data = await updater.fetchItemData(name);
  } catch (err) {
    wikiError = err.message;
    data = gameDB.items[name.toLowerCase()] ||
      { pageTitle: name, text: '', updated: Date.now() };
  }
  try {
    // refresh the eqlegendstools page cache at most every 7 days
    if (!gameDB.toolsPages || Date.now() - (gameDB.toolsPages._updated || 0) > 7 * 864e5) {
      const fresh = await refreshToolsPages();
      if (Object.keys(fresh).length > 1) gameDB.toolsPages = fresh;
      else gameDB.toolsPages = gameDB.toolsPages || fresh; // keep trying next time
    }
    data.tools = updater.searchEqlTools(gameDB.toolsPages, name);
  } catch { data.tools = data.tools || []; }
  if (wikiError && !data.text && !(data.tools || []).length)
    return { error: wikiError };
  data.wikiError = wikiError || undefined;
  gameDB.items[name.toLowerCase()] = data;
  saveGameDBSoon();
  return data;
});

ipcMain.handle('search-wiki', async (_e, query) => {
  const out = { titles: [], tools: [] };
  let wikiError = null;
  try { out.titles = await updater.searchWiki(query); }
  catch (err) { wikiError = err.message; }
  try { out.tools = updater.searchEqlTools(gameDB.toolsPages, query); } catch {}
  try { out.p99 = await updater.searchP99(query); } catch { out.p99 = []; }   // classic EQ, labelled as such
  if (wikiError && !out.titles.length && !out.tools.length && !(out.p99 || []).length) return { error: wikiError };
  return out;
});

// Manual "Check for updates": compare cached page revisions against the wiki,
// re-fetch only what actually changed. (Also runs as part of Sync data.)
async function refreshCachedPages() {
  try {
    const zoneEntries = Object.values(gameDB.zones);
    const itemEntries = Object.values(gameDB.items);
    const titles = [...new Set([
      ...zoneEntries.map(z => z.pageTitle),
      ...itemEntries.map(i => i.pageTitle),
      ...Object.values(gameDB.effects || {}).map(ef => ef.pageTitle),
      ...Object.values(gameDB.guidePages || {}).map(g => g && g.pageTitle)
    ].filter(Boolean))];
    if (!titles.length) return { checked: 0, updated: 0, details: [] };

    const latest = await updater.getLatestRevisions(titles);
    const details = [];
    let updated = 0;

    for (const z of zoneEntries) {
      const cur = latest[z.pageTitle];
      if (cur === undefined) continue;
      if (!z.revid || z.revid !== cur) {
        const fresh = await updater.fetchZoneData(z.zone);
        gameDB.zones[z.zone] = fresh;
        updated++; details.push('zone: ' + z.zone);
      }
    }
    for (const it of itemEntries) {
      const cur = latest[it.pageTitle];
      if (cur === undefined) continue;
      if (!it.revid || it.revid !== cur) {
        const fresh = await updater.fetchItemData(it.pageTitle);
        gameDB.items[it.name.toLowerCase()] = fresh;
        updated++; details.push('item: ' + it.pageTitle);
      }
    }
    // cached exaltation effect pages follow the same revision compare
    for (const ef of Object.values(gameDB.effects || {})) {
      const cur = latest[ef.pageTitle];
      if (cur === undefined || (ef.revid && ef.revid === cur)) continue;
      try {
        gameDB.effects[ef.effect] = await updater.fetchEffectItems(ef.pageTitle);
        updated++; details.push('effect: ' + ef.effect);
      } catch { /* keep the cached copy */ }
    }
    // cached 📖 guide pages follow the same revision compare
    for (const [title, page] of Object.entries(gameDB.guidePages || {})) {
      if (!page || !page.pageTitle) continue;
      const cur = latest[page.pageTitle];
      if (cur === undefined || (page.revid && page.revid === cur)) continue;
      try {
        const fresh = await fetchGuidePage(title);
        if (fresh) { gameDB.guidePages[title] = fresh; updated++; details.push('guide: ' + page.pageTitle); }
      } catch { /* keep the cached copy */ }
    }
    saveGameDBSoon();
    return { checked: titles.length, updated, details };
  } catch (err) {
    return { error: err.message };
  }
}
ipcMain.handle('check-updates', () => refreshCachedPages());

// item-knowledge entries that found nothing get a slow re-check — the wiki
// grows, and an unknown today may be documented next patch (capped per run)
async function refreshItemKnowledge(cap = 25) {
  const ik = gameDB.itemKnowledge || {};
  const stale = Object.entries(ik)
    .filter(([, e]) => (!e.quests || !e.quests.length) &&
                       Date.now() - (e.checkedAt || 0) > 30 * 864e5)
    .slice(0, cap);
  let learned = 0;
  for (const [key, e] of stale) {
    try {
      const data = await updater.fetchItemData(key);
      ik[key] = { quests: data.questUses || [], page: data.pageTitle, checkedAt: Date.now() };
      if (ik[key].quests.length) learned++;
    } catch {
      ik[key] = { ...e, notFound: true, checkedAt: Date.now() };
    }
    await new Promise(r => setTimeout(r, 400)); // be polite
  }
  if (stale.length) { gameDB.itemKnowledge = ik; saveGameDBSoon(); }
  return { rechecked: stale.length, learned };
}

// Local search across everything cached: item cache, zone drops, loot DB
const mobstats = require('./mobstats.js');
ipcMain.handle('search-local', (_e, query) => {
  const q = query.toLowerCase();
  const results = [];
  // mobs YOU killed (wiki page or not) come first: their own kill card
  for (const m of mobstats.search(lootStore.db, query, 8))
    results.push({ kind: 'kills', name: m.name,
      detail: 'your kills: ' + m.kills + ' · ' + m.items + ' item' + (m.items === 1 ? '' : 's') + ' looted' +
        (m.zones.length ? ' · ' + m.zones[0] + (m.zones.length > 1 ? ' +' + (m.zones.length - 1) + ' more' : '') : '') });
  for (const it of Object.values(gameDB.items)) {
    if (it.pageTitle && it.pageTitle.toLowerCase().includes(q))
      results.push({ kind: 'item', name: it.pageTitle, detail: 'cached item page' });
  }
  for (const z of Object.values(gameDB.zones)) {
    for (const nm of z.named || []) {
      for (const d of nm.drops || []) {
        if (d.item.toLowerCase().includes(q))
          results.push({ kind: 'drop', name: d.item, detail: nm.mob + ' — ' + z.zone + (d.rarity ? ' (' + d.rarity + ')' : ''), page: d.page });
        else if (nm.mob.toLowerCase().includes(q))
          results.push({ kind: 'mob', name: nm.mob, detail: 'drops ' + d.item + ' — ' + z.zone, page: d.page, itemName: d.item });
      }
    }
  }
  for (const m of Object.values(lootStore.db.mobs || {})) {
    for (const d of Object.values(m.drops || {})) {
      if (d.name.toLowerCase().includes(q))
        results.push({ kind: 'seen', name: d.name, detail: 'looted from ' + m.name + ' ' + d.count + '/' + m.kills + ' (' + (m.kills ? Math.round(d.count / m.kills * 100) : 0) + '%)' });
    }
  }
  // dedupe by kind+name+detail, cap
  const seen = new Set();
  return results.filter(r => {
    const k = r.kind + '|' + r.name + '|' + r.detail;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, 40);
});

// learned long->short zone names from /who lines and manual picks.
// A falsy shortName clears the entry (reverting that zone to pure auto-detect).
ipcMain.on('learn-zonemap', (_e, { longName, shortName }) => {
  gameDB.zoneMap = gameDB.zoneMap || {};
  if (!shortName) {
    delete gameDB.zoneMap[longName];
    saveGameDBSoon();
  } else if (gameDB.zoneMap[longName] !== shortName) {
    gameDB.zoneMap[longName] = shortName;
    saveGameDBSoon();
  }
});
ipcMain.handle('get-zonemap', () => gameDB.zoneMap || {});

// learned respawn intervals: measured gap between consecutive kills of a mob
// value is either legacy plain seconds or the v2.4 entry object
// { s, min, max, src: 'learned'|'manual'|..., n, samples[], manual }.
// null deletes the entry (manual override reverted with nothing learned).
ipcMain.on('learn-respawn', (_e, { zone, mob, seconds }) => {
  gameDB.mobRespawn = gameDB.mobRespawn || {};
  if (seconds === null || seconds === undefined) delete gameDB.mobRespawn[zone + '|' + mob];
  else gameDB.mobRespawn[zone + '|' + mob] = typeof seconds === 'number' ? Math.round(seconds) : seconds;
  saveGameDBSoon();
});
ipcMain.handle('get-respawns', () => gameDB.mobRespawn || {});

// user corrections: damage source classified as 'ability' vs 'proc'
ipcMain.on('set-source-class', (_e, { source, cls }) => {
  gameDB.sourceClass = gameDB.sourceClass || {};
  if (cls) gameDB.sourceClass[source] = cls;
  else delete gameDB.sourceClass[source];
  saveGameDBSoon();
});
ipcMain.handle('get-source-classes', () => gameDB.sourceClass || {});

// pet names learned from pet speech ("... Master ...")
ipcMain.on('learn-pet', (_e, name) => {
  gameDB.petNames = gameDB.petNames || [];
  if (!gameDB.petNames.includes(name)) {
    gameDB.petNames.push(name);
    if (gameDB.petNames.length > 50) gameDB.petNames.shift();
    saveGameDBSoon();
  }
});
ipcMain.handle('get-pets', () => gameDB.petNames || []);

// spell classification learned from observed behavior:
// damage lines mark a spell detrimental, heal lines mark it beneficial
ipcMain.on('learn-spell-class', (_e, { spell, cls }) => {
  gameDB.spellClass = gameDB.spellClass || {};
  if (gameDB.spellClass[spell] !== cls) {
    gameDB.spellClass[spell] = cls;
    saveGameDBSoon();
  }
});
ipcMain.handle('get-spell-classes', () => gameDB.spellClass || {});

// fade-noun -> spell attributions learned from cast/landing correlation
ipcMain.on('learn-fade-label', (_e, { noun, spell }) => {
  gameDB.fadeLabels = gameDB.fadeLabels || {};
  if (gameDB.fadeLabels[noun] !== spell) {
    gameDB.fadeLabels[noun] = spell;
    saveGameDBSoon();
  }
});
ipcMain.handle('get-fade-labels', () => gameDB.fadeLabels || {});

ipcMain.on('unlearn-pet', (_e, name) => {
  gameDB.petNames = (gameDB.petNames || []).filter(n => n !== name);
  saveGameDBSoon();
});

// placeholder links: "zone|camp" -> [ph names]
ipcMain.on('set-ph-links', (_e, { zone, camp, phs }) => {
  gameDB.phLinks = gameDB.phLinks || {};
  if (phs && phs.length) gameDB.phLinks[zone + '|' + camp] = phs;
  else delete gameDB.phLinks[zone + '|' + camp];
  saveGameDBSoon();
});
ipcMain.handle('get-ph-links', () => gameDB.phLinks || {});

// Plane of Sky quest progress: reward -> { done: bool, items: {itemName: true} }
// Lives in gameDB so it syncs across computers with the shared data folder.
ipcMain.on('set-posquest', (_e, { reward, state }) => {
  gameDB.posQuests = gameDB.posQuests || {};
  if (state && (state.done || Object.keys(state.items || {}).length)) gameDB.posQuests[reward] = state;
  else delete gameDB.posQuests[reward];
  saveGameDBSoon();
});
ipcMain.handle('get-posquests', () => gameDB.posQuests || {});

// spell-quest tracker state: questKey -> { sel, done, items: {name: true} } (synced)
ipcMain.on('set-spellquest', (_e, { key, state }) => {
  gameDB.spellQuests = gameDB.spellQuests || {};
  if (state && (state.sel || state.done || Object.keys(state.items || {}).length)) gameDB.spellQuests[key] = state;
  else delete gameDB.spellQuests[key];
  saveGameDBSoon();
});
ipcMain.handle('get-spellquests', () => gameDB.spellQuests || {});

// personal loot verdicts: itemName(lower) -> 'keep' | 'junk' (synced)
ipcMain.on('set-item-verdict', (_e, { item, verdict }) => {
  gameDB.itemVerdicts = gameDB.itemVerdicts || {};
  const k = String(item).toLowerCase();
  if (verdict) gameDB.itemVerdicts[k] = verdict;
  else delete gameDB.itemVerdicts[k];
  saveGameDBSoon();
});
ipcMain.handle('get-item-verdicts', () => gameDB.itemVerdicts || {});

// (the old vendor sell list was retired in v2.3 — Cleanup's "Job done" pile
// replaced it; its storage channels were removed in v2.4)

// wish list: itemName(lower) -> { name, added } (synced)
ipcMain.on('set-wishlist', (_e, list) => {
  gameDB.wishList = list && Object.keys(list).length ? list : undefined;
  if (!gameDB.wishList) delete gameDB.wishList;
  saveGameDBSoon();
});
ipcMain.handle('get-wishlist', () => gameDB.wishList || {});

// ---------------------------------------------------------------------------
// Class quest index: the wiki files quests by CLASS, so we fetch the class
// categories, pull each quest page, and detect which zone(s) it involves by
// scanning the text against the audited zone-name table. Cached + synced.
// ---------------------------------------------------------------------------
const EQLZonesTable = require('./zones.js');

function zoneMatcherList() {
  // candidate display-name -> canonical long zone name; longest first so
  // "Neriak Foreign Quarter" wins over "Neriak"
  const map = new Map();
  const add = (name, long) => {
    const k = String(name || '').trim();
    if (k.length >= 4 && !map.has(k.toLowerCase())) map.set(k.toLowerCase(), { name: k, long });
  };
  for (const [long, short] of Object.entries(EQLZonesTable.zones)) {
    add(long, long);
    if (long.startsWith('The ')) add(long.slice(4), long);
    if (EQLZonesTable.wikiNames[short]) add(EQLZonesTable.wikiNames[short], long);
  }
  return [...map.values()].sort((a, b) => b.name.length - a.name.length);
}

ipcMain.handle('build-quest-index', async (_e, classes) => {
  try {
    const matcher = zoneMatcherList();
    const progress = (msg) => { try { win.webContents.send('quest-index-progress', msg); } catch {} };
    const quests = [];
    for (const cls of classes || []) {
      progress('Fetching ' + cls + ' quest list…');
      let titles = [];
      try { titles = await updater.getCategoryMembers(cls + ' Quests', 300); } catch {}
      progress(cls + ': ' + titles.length + ' quests, reading pages…');
      const pages = await updater.fetchPagesContent(titles);
      for (const [title, text] of Object.entries(pages)) {
        // rank matched zones by where they first appear; keep the top 3
        const found = [];
        const lower = text.toLowerCase();
        for (const c of matcher) {
          const idx = lower.indexOf(c.name.toLowerCase());
          if (idx >= 0 && !found.some(f => f.long === c.long)) found.push({ long: c.long, idx });
        }
        found.sort((a, b) => a.idx - b.idx);
        quests.push({ title, cls, zones: found.slice(0, 3).map(f => f.long) });
      }
    }
    gameDB.questIndex = { classes: [...(classes || [])], built: Date.now(), quests };
    saveGameDBSoon();
    return { quests: quests.length, zoned: quests.filter(q => q.zones.length).length };
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('get-quest-index', () => gameDB.questIndex || null);

// ---------------------------------------------------------------------------
// Gear catalog: every wearable item on the wiki, parsed into compact scored-
// comparison records. Built on demand (a few minutes, with progress), cached
// in the game DB (synced between computers), refreshed by the same button.
// ---------------------------------------------------------------------------
// The builder lives in gearcatalog.js.
const gearcatalog = require('./gearcatalog.js').create({
  getGameDB: () => gameDB,
  saveGameDBSoon,
  updater,
  getGameData: () => gameData,
  getWin: () => win
});
ipcMain.handle('build-gear-catalog', (_e, opts = {}) => gearcatalog.buildGearCatalog(opts));
ipcMain.handle('get-gear-catalog', () => gameDB.gearCatalog || null);

// ---------------------------------------------------------------------------
// Update check: GitHub Releases API, no dependencies. Compares the latest
// release tag to the running version; the renderer offers the download link.
// ---------------------------------------------------------------------------
function cmpVersions(a, b) { // 1 if a>b
  const pa = String(a).replace(/^v/i, '').split('.').map(Number);
  const pb = String(b).replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function checkAppUpdate() {
  const repo = String(settings.updateRepo || '').trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: 'Set your GitHub repo (user/seqo) in Settings first.' };
  try {
    const res = await fetch('https://api.github.com/repos/' + repo + '/releases/latest', {
      headers: { 'User-Agent': 'SEQO/' + app.getVersion(), Accept: 'application/vnd.github+json' }
    });
    if (res.status === 404) return { error: 'No releases found for ' + repo + ' yet.' };
    if (!res.ok) return { error: 'GitHub returned HTTP ' + res.status };
    const j = await res.json();
    const latest = String(j.tag_name || j.name || '').replace(/^v/i, '');
    const setup = (j.assets || []).find(a => /Setup.*\.exe$/i.test(a.name));
    return {
      current: app.getVersion(),
      latest,
      newer: cmpVersions(latest, app.getVersion()) > 0,
      url: j.html_url || ('https://github.com/' + repo + '/releases/latest'),
      setupUrl: setup ? setup.browser_download_url : null,
      setupName: setup ? setup.name : null,
      setupSize: setup ? setup.size : 0,
      setupDigest: setup ? setup.digest || null : null,   // "sha256:…" on newer GitHub releases
      notes: String(j.body || '').slice(0, 400)
    };
  } catch (err) {
    return { error: err.message };
  }
}
ipcMain.handle('check-app-update', () => checkAppUpdate());

// one-click update (v2.7): download the new installer, check it (selfupdate.js),
// start it and close SEQO; the installer reopens SEQO when it's done. Running from
// source or the portable exe, there's nothing to install: the renderer opens the
// release page instead.
const selfupdate = require('./selfupdate.js').create({
  tempDir: () => app.getPath('temp'),
  onProgress: (p) => { if (win) win.webContents.send('update-progress', p); }
});
let updateDownloading = false;
ipcMain.handle('install-update', async () => {
  if (!app.isPackaged) return { manual: true, reason: 'SEQO is running from source' };
  if (process.env.PORTABLE_EXECUTABLE_DIR) return { manual: true, reason: 'this is the portable SEQO — download the new portable exe' };
  if (updateDownloading) return { error: 'already downloading' };
  updateDownloading = true;
  try {
    const info = await checkAppUpdate();
    if (info.error) return { error: info.error };
    if (!info.newer) return { error: 'you already have the latest version (v' + info.current + ')' };
    const r = await selfupdate.download(info, String(settings.updateRepo || '').trim());
    require('child_process').spawn(r.file, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 1000);
    return { ok: true, version: info.latest, verified: r.verified };
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    updateDownloading = false;
  }
});

// auto-check shortly after launch, quietly
app.whenReady().then(() => setTimeout(async () => {
  if (!settings.autoCheckUpdates || !settings.updateRepo) return;
  const r = await checkAppUpdate();
  if (r && r.newer && win) win.webContents.send('app-update', r);
}, 10000));

// ---------------------------------------------------------------------------
// Live quest data: Epics / race unlocks / Plane of Sky refreshed from the wiki,
// wiki freshness checks and the dock's guide pages — see datasources.js.
// ---------------------------------------------------------------------------
const datasources = require('./datasources.js').create({
  getSettings: () => settings,
  saveSettings,
  getGameDB: () => gameDB,
  saveGameDBSoon,
  updater,
  BIS_CLASSES,
  refreshCachedPages,
  refreshItemKnowledge
});
const { updateQuestData, fetchGuidePage, sliceWikiSection, wikitextToText } = datasources;

// ---- dock "guide" mode: any wiki page (or one section) as readable text ----
ipcMain.handle('get-guide-page', async (_e, { title, anchor, refresh, source } = {}) => {
  if (!title) return { error: 'no page requested' };
  gameDB.guidePages = gameDB.guidePages || {};
  if (source === 'p99') {   // Project 1999 wiki: classic EQ, cached under its own key
    const key = 'p99:' + title;
    let page = gameDB.guidePages[key];
    if (!page || refresh || Date.now() - (page.updated || 0) > 7 * 864e5) {
      try {
        const fresh = await updater.fetchP99Page(title);
        if (fresh) { page = fresh; gameDB.guidePages[key] = page; saveGameDBSoon(); }
        else if (!page) return { error: 'the P99 wiki has no page for "' + title + '"' };
      } catch (e) { if (!page) return { error: e.message || String(e) }; }
    }
    const section = anchor ? sliceWikiSection(page.wikitext, anchor) : null;
    return {
      title: page.pageTitle, anchor: section ? anchor : null, source: 'p99',
      text: wikitextToText(section || page.wikitext), updated: page.updated,
      url: updater.P99_BASE + encodeURIComponent(page.pageTitle.replace(/ /g, '_'))
    };
  }
  let page = gameDB.guidePages[title];
  const stale = !page || refresh || Date.now() - (page.updated || 0) > 7 * 24 * 3600 * 1000;
  if (stale) {
    try {
      const fresh = await fetchGuidePage(title);
      if (fresh) {
        page = fresh;
        gameDB.guidePages[title] = page;
        saveGameDBSoon();
      } else if (!page) {
        return { error: 'the wiki has no page named "' + title + '"' };
      }
    } catch (e) {
      if (!page) return { error: e.message || String(e) };
      // offline / fetch failed: the cached copy still serves
    }
  }
  const section = anchor ? sliceWikiSection(page.wikitext, anchor) : null;
  return {
    title: page.pageTitle, anchor: section ? anchor : null,
    text: wikitextToText(section || page.wikitext),
    updated: page.updated,
    url: 'https://eqlwiki.com/' + encodeURIComponent(page.pageTitle.replace(/ /g, '_')) +
         (section ? '#' + encodeURIComponent(String(anchor).replace(/ /g, '_')) : '')
  };
});

ipcMain.handle('update-questdata', () => updateQuestData());
ipcMain.handle('get-questdata', () => ({
  epicsData: gameDB.epicsData || null,
  unlocksData: gameDB.unlocksData || null,
  posData: gameDB.posData || null
}));

// quiet weekly auto-refresh (skippable in settings)
app.whenReady().then(() => setTimeout(async () => {
  if (settings.autoDataCheck === false) return;
  if (Date.now() - (settings.lastDataCheckAt || 0) < 7 * 24 * 3600 * 1000) return;
  const r = await updateQuestData();
  if (win) win.webContents.send('questdata-updated', r);
}, 15000));

// open a community database site in the user's default browser (https only)
ipcMain.on('open-external', (_e, url) => {
  try {
    if (/^https:\/\/[\w.-]+\//.test(String(url))) require('electron').shell.openExternal(url);
  } catch {}
});

// Inventory import (in game: /outputfile inventory). Returns the raw text;
// the renderer parses it and reconciles quest progress.
ipcMain.handle('import-inventory', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose your inventory file (type /outputfile inventory in game first)',
    filters: [{ name: 'Inventory dump (*.txt)', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return null;
  try { return { text: fs.readFileSync(res.filePaths[0], 'latin1') }; }
  catch (e) { return { error: e.message }; }
});

// ---------------------------------------------------------------------------
// Wiki submission: post observed drop rates using the user's bot password.
// mode 'sandbox': one page (User:<name>/SEQO Drop Data), replaced wholesale.
// mode 'talk': a new dated section on each mob's talk page.
// ---------------------------------------------------------------------------
// The upload lives in wikisubmit.js.
const wikisubmit = require('./wikisubmit.js').create({ getSettings: () => settings, updater, getWin: () => win });
ipcMain.handle('wiki-submit', (_e, { mode, fullText, perMob }) => wikisubmit.wikiSubmit({ mode, fullText, perMob }));

// ---------------------------------------------------------------------------
// Loot database (persistent drop tracking per mob) — see lootdb.js.
// ---------------------------------------------------------------------------
const lootStore = require('./lootdb.js').create({
  dataDir,
  getWin: () => win,
  noteWrite: () => { lastDbWrite = Date.now(); },
  backupDir: backupHome,
  shared: () => !!settings.dataDir,
  log: dbLog
});
const { lootDbPath, loadLootDB } = lootStore;

ipcMain.on('record-kill', (_e, { mob, zone, when, secs, variant, makeup, group }) => lootStore.recordKill(mob, zone, when, secs, mobstats.tierNum(variant), { c: makeup, g: group }));
ipcMain.on('record-drop', (_e, { mob, item, zone }) => lootStore.recordDrop(mob, item, zone));
// batched mob combat observations: max melee hit, hit counts, casts seen
ipcMain.on('record-mob-stats', (_e, entries) => lootStore.recordMobStats(entries));

ipcMain.handle('get-loot-db', () => lootStore.db);

// ---------------------------------------------------------------------------
// Locked-mode hover interactivity: renderer asks to become clickable while
// the cursor is over a control, click-through everywhere else.
// ---------------------------------------------------------------------------
ipcMain.on('set-interactive', (e, interactive) => {
  if (!settings.locked) return;
  // works for whichever window asked: the overlay, the needs panel or the dock
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed()) return;
  if (interactive) w.setIgnoreMouseEvents(false);
  else w.setIgnoreMouseEvents(true, { forward: true });
});

// ---------------------------------------------------------------------------
// Character log scanning
// ---------------------------------------------------------------------------
ipcMain.handle('scan-logs', () => {
  if (!settings.logPath) return [];
  const dir = path.dirname(settings.logPath);
  try {
    return fs.readdirSync(dir)
      .filter(f => /^eqlog_.+_.+\.txt$/i.test(f))
      .map(f => {
        const m = /^eqlog_(.+?)_(.+?)\.txt$/i.exec(f);
        let mtime = 0;
        try { mtime = fs.statSync(path.join(dir, f)).mtimeMs; } catch {}
        return { path: path.join(dir, f), name: m[1], server: m[2], mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return []; }
});

ipcMain.on('switch-log', (_e, logPath) => {
  settings.logPath = logPath;
  saveSettings(settings);
  startTail(logPath);
});

// ---------------------------------------------------------------------------
// Log file tailing
// ---------------------------------------------------------------------------
let tail = null; // { path, offset, remainder }

function stopTail() {
  if (tail) fs.unwatchFile(tail.path);
  tail = null;
}

function sendLogStatus() {
  if (!win) return;
  win.webContents.send('log-status', {
    path: tail ? tail.path : '',
    watching: !!tail
  });
}

// ---------------------------------------------------------------------------
// Zero-click game data sync (/outputfile inventory, achievements, factions,
// spellbook): see gameexports.js.
// ---------------------------------------------------------------------------
const gameexports = require('./gameexports.js');
const { gameRootFromLog } = gameexports;
const { gameData, watchOutputFiles } = gameexports.create({
  getSettings: () => settings,
  getGameDB: () => gameDB,
  saveGameDBSoon,
  getWin: () => win
});

ipcMain.handle('get-gamedata', () => gameData);

// 2.7.2: kills and loot from while SEQO was closed — see logcatchup.js
const logCatchup = require('./logcatchup.js').create({
  parser: require('./parser.js'), lootStore, tierNum: mobstats.tierNum,
  cleanZone: require('./historyimport.js').cleanZone,
  file: () => path.join(app.getPath('userData'), 'logpos.json')
});

function startTail(logPath) {
  stopTail();
  let size = 0;
  try {
    size = fs.statSync(logPath).size;
  } catch (e) {
    console.error('Cannot open log:', e.message);
    sendLogStatus();
    return;
  }
  tail = { path: logPath, offset: size, remainder: '' };
  // read what happened while SEQO was closed (up to where the live tail starts)
  logCatchup.catchUp(logPath, size).then((r) => {
    if (r && (r.kills || r.drops) && win) win.webContents.send('catchup-done', r);
  }).catch((e) => { try { errorlog.record('logcatchup', 'catch-up failed: ' + (e.message || e)); } catch { /* ok */ } });
  watchOutputFiles(); // game data files live next to this character's game root

  fs.watchFile(logPath, { interval: 250 }, (curr) => {
    if (!tail || tail.path !== logPath) return;
    if (curr.size < tail.offset) tail.offset = 0;      // log truncated/rotated
    if (curr.size === tail.offset) return;

    const stream = fs.createReadStream(logPath, {
      start: tail.offset, end: curr.size - 1, encoding: 'latin1'
    });
    let chunk = '';
    stream.on('data', (d) => { chunk += d; });
    stream.on('end', () => {
      tail.offset = curr.size;
      const data = tail.remainder + chunk;
      const lines = data.split(/\r?\n/);
      tail.remainder = lines.pop(); // last element may be a partial line
      const complete = lines.filter(l => l.length);
      if (complete.length && win) win.webContents.send('log-lines', complete);
      if (complete.length) logCatchup.seen(logPath, complete);
    });
    stream.on('error', (e) => console.error('Log read error:', e.message));
  });
  sendLogStatus();
}

// ---------------------------------------------------------------------------
// Log clearing: EQ appends forever and the file grows without bound.
// Truncation is safe while the game runs (it opens the log in append mode),
// and optional archiving keeps a copy first.
// ---------------------------------------------------------------------------
function clearLogFile() {
  const logPath = settings.logPath;
  if (!logPath) return { error: 'No log file selected' };
  let size = 0;
  try { size = fs.statSync(logPath).size; } catch (e) { return { error: e.message }; }

  let archivePath = '';
  try {
    if (settings.archiveOnClear && size > 0) {
      const dir = path.join(path.dirname(logPath), 'archive');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      archivePath = path.join(dir, path.basename(logPath, '.txt') + '-' + stamp + '.txt');
      fs.copyFileSync(logPath, archivePath);
    }
    fs.truncateSync(logPath, 0);
    if (tail && tail.path === logPath) { tail.offset = 0; tail.remainder = ''; }
    return { cleared: size, archivePath };
  } catch (e) {
    return { error: e.message };
  }
}

ipcMain.handle('clear-log', () => clearLogFile());
ipcMain.handle('log-size', () => {
  try { return settings.logPath ? fs.statSync(settings.logPath).size : 0; } catch { return 0; }
});

ipcMain.handle('choose-log', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Select your EverQuest Legends log file',
    filters: [{ name: 'EQ Log', extensions: ['txt'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return settings.logPath || '';
  settings.logPath = res.filePaths[0];
  saveSettings(settings);
  startTail(settings.logPath);
  return settings.logPath;
});

// ---------------------------------------------------------------------------
// IPC from renderer
// ---------------------------------------------------------------------------
ipcMain.on('update-settings', (_evt, partial) => {
  settings = { ...settings, ...partial };
  saveSettings(settings);
  if (win && (Object.prototype.hasOwnProperty.call(partial, 'keepAspectRatio') || Object.prototype.hasOwnProperty.call(partial, 'windowMode'))) {
    win.setAspectRatio(settings.keepAspectRatio && settings.windowMode !== 'room' ? BASE_W / BASE_H : 0);
  }
  if (['windowMode', 'uiZoom'].some((k) => Object.prototype.hasOwnProperty.call(partial, k))) snapDock();
  if (Object.prototype.hasOwnProperty.call(partial, 'textScale')) {
    for (const w of [dockWin, needsWin])
      if (w && !w.isDestroyed()) w.webContents.send('ui-scale', settings.textScale);
  }
  // the Appearance → Opacity slider drives the attached windows too
  if (Object.prototype.hasOwnProperty.call(partial, 'opacity')) applyChildOpacity();
});

ipcMain.handle('app-version', () => app.getVersion());

ipcMain.on('toggle-lock', toggleLock);

ipcMain.on('minimize-overlay', () => {
  if (win && !settings.locked) {
    win.setSkipTaskbar(false); // visible in the taskbar while minimized
    win.minimize();
    updateTrayMenu();
  }
});

ipcMain.on('resize-window', (_evt, { width, height }) => {
  if (!win) return;
  const b = win.getBounds();
  win.setBounds({ x: b.x, y: b.y, width: Math.round(width), height: Math.round(height) });
});
ipcMain.on('close-app', () => app.quit());

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
// One-time migration: earlier versions stored data under "EQL Overlay"
function migrateOldData() {
  try {
    const oldDir = path.join(app.getPath('appData'), 'EQL Overlay');
    const newDir = app.getPath('userData');
    if (!fs.existsSync(oldDir) || fs.existsSync(path.join(newDir, 'overlay-settings.json'))) return;
    fs.mkdirSync(newDir, { recursive: true });
    for (const f of ['overlay-settings.json', 'lootdb.json', 'gamedb.json']) {
      const src = path.join(oldDir, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(newDir, f));
    }
    const oldMaps = path.join(oldDir, 'maps');
    if (fs.existsSync(oldMaps)) {
      const newMaps = path.join(newDir, 'maps');
      fs.mkdirSync(newMaps, { recursive: true });
      for (const f of fs.readdirSync(oldMaps)) {
        fs.copyFileSync(path.join(oldMaps, f), path.join(newMaps, f));
      }
    }
  } catch (e) { console.error('Migration skipped:', e.message); }
}

app.whenReady().then(() => {
  migrateOldData();
  settings = loadSettings();
  loadLootDB();
  loadGameDB();
  watchSharedDBs();
  if (settings.dataDir && (settings.syncFiles || []).length) {
    syncGameFiles();
    watchGameFiles();
  }
  createWindow();
  createTray();
  // the zone-needs strip is persistent: reopen it where the player left it
  if (settings.needsPanelOpen) setTimeout(() => { try { openNeeds(); } catch {} }, 1500);

  const failed = [];
  if (!globalShortcut.register('Control+Alt+O', toggleLock)) failed.push('Ctrl+Alt+O');
  if (!globalShortcut.register('Control+Alt+H', toggleVisibility)) failed.push('Ctrl+Alt+H');
  if (failed.length && win) {
    win.webContents.on('did-finish-load', () =>
      win.webContents.send('hotkey-warn', failed.join(', ')));
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { history.flush(); chatlog.flush(); priceStore.flush(); logCatchup.flush(); } catch { /* never block quitting */ }
  if (settings && settings.autoClearLog) clearLogFile();
  if (settings && settings.dataDir && (settings.syncFiles || []).length) syncGameFiles();
});

app.on('window-all-closed', () => app.quit());
