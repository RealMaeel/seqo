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

  if (settings.keepAspectRatio) {
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

function loadGameDB() {
  try { gameDB = JSON.parse(fs.readFileSync(gameDbPath(), 'utf8')); } catch { gameDB = { zones: {}, items: {} }; }
  gameDB.zones = gameDB.zones || {};
  gameDB.items = gameDB.items || {};
  delete gameDB.charmSpells; // v1.1.1: purge poisoned auto-learned "charm spells"
  pruneGameDB(); // v2.5.0: keep the DB lean — it loads, saves and syncs whole
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

function saveGameDBSoon() {
  clearTimeout(gameSaveTimer);
  gameSaveTimer = setTimeout(() => {
    try { lastDbWrite = Date.now(); fs.writeFileSync(gameDbPath(), JSON.stringify(gameDB)); } catch (e) { console.error(e); }
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
  shared: !!settings.dataDir
}));

// ---------------------------------------------------------------------------
// Synced game files: user-chosen files (character loadouts like
// Maeel_neriak_LO1.ini, UI layouts, etc.) mirrored through the shared folder.
// Newest copy wins; the overwritten side gets a .seqo.bak backup first.
// Local paths are per-machine (installs differ); the shared side is keyed
// by filename under <dataDir>/gamefiles/.
// ---------------------------------------------------------------------------
const gamefilesDir = () => path.join(dataDir(), 'gamefiles');

function copyPreservingTime(src, dst) {
  fs.copyFileSync(src, dst);
  const st = fs.statSync(src);
  fs.utimesSync(dst, st.atime, st.mtime); // keep mtimes equal so sync converges
}

function syncOnePair(local, shared, label, results) {
  try {
    const le = fs.existsSync(local), se = fs.existsSync(shared);
    if (le && se) {
      const lm = fs.statSync(local).mtimeMs, sm = fs.statSync(shared).mtimeMs;
      if (Math.abs(lm - sm) < 2000) { results.push(label + ': in sync'); return; }
      if (lm > sm) {
        fs.copyFileSync(shared, shared + '.seqo.bak');
        copyPreservingTime(local, shared);
        results.push(label + ': → shared (local was newer, backup kept)');
      } else {
        fs.copyFileSync(local, local + '.seqo.bak');
        copyPreservingTime(shared, local);
        results.push(label + ': ← shared (backup kept)');
      }
    } else if (le) {
      fs.mkdirSync(path.dirname(shared), { recursive: true });
      copyPreservingTime(local, shared);
      results.push(label + ': seeded to shared');
    } else if (se) {
      fs.mkdirSync(path.dirname(local), { recursive: true });
      copyPreservingTime(shared, local);
      results.push(label + ': pulled from shared');
    } else {
      results.push(label + ': ⚠ missing on both sides');
    }
  } catch (e) {
    results.push(label + ': ⚠ ' + e.message);
  }
}

// list files (relative paths) under dir, up to `depth` levels down
function listFilesRel(dir, depth, prefix = '') {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.endsWith('.seqo.bak')) continue;
    if (e.isDirectory()) {
      if (depth > 0) out.push(...listFilesRel(path.join(dir, e.name), depth - 1, path.join(prefix, e.name)));
    } else {
      out.push(path.join(prefix, e.name));
    }
  }
  return out;
}

function syncGameFiles() {
  if (!settings.dataDir) return { error: 'Set a shared data folder first' };
  const results = [];
  try { fs.mkdirSync(gamefilesDir(), { recursive: true }); } catch (e) { return { error: e.message }; }
  for (const local of settings.syncFiles || []) {
    const base = path.basename(local);
    let isDir = false;
    try { isDir = fs.statSync(local).isDirectory(); } catch { /* may only exist on shared side */ }
    const sharedFolder = path.join(gamefilesDir(), 'folders', base);
    if (isDir || fs.existsSync(sharedFolder)) {
      // whole-folder sync (e.g. a custom UI skin folder): newest-wins per file,
      // union of both sides so files added later on either machine are picked up
      const rels = new Set([...listFilesRel(local, 3), ...listFilesRel(sharedFolder, 3)]);
      const sub = [];
      for (const rel of rels) syncOnePair(path.join(local, rel), path.join(sharedFolder, rel), rel, sub);
      const changed = sub.filter(r => !r.includes('in sync'));
      results.push('📁 ' + base + ': ' + (changed.length ? changed.length + ' of ' + rels.size + ' files updated' : rels.size + ' files in sync'));
      for (const c of changed.slice(0, 6)) results.push('   ' + c);
    } else {
      syncOnePair(local, path.join(gamefilesDir(), base), base, results);
    }
  }
  // sync status (v2.4): a persistent record of what just happened, plus a
  // marker in the shared folder saying WHICH COMPUTER wrote last — so after
  // switching machines you can see at a glance whether the other side's data
  // actually arrived or you forgot to sync before leaving it.
  const host = (() => { try { return require('os').hostname(); } catch { return 'this computer'; } })();
  let otherHost = null, otherAt = 0;
  const markerPath = path.join(gamefilesDir(), 'sync-marker.json');
  try {
    const m = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (m && m.host && m.host !== host) { otherHost = m.host; otherAt = m.at || 0; }
  } catch { /* first sync ever, or marker unreadable */ }
  const pulled = results.filter(r => /← shared|pulled from shared/.test(r)).length;
  const pushed = results.filter(r => /→ shared|seeded to shared/.test(r)).length;
  const failed = results.filter(r => r.includes('⚠'));
  const summary = {
    at: Date.now(), host, pulled, pushed,
    failed: failed.slice(0, 4),
    inSync: results.filter(r => r.includes('in sync')).length,
    from: pulled && otherHost ? { host: otherHost, at: otherAt } : null
  };
  settings.lastSync = summary;
  saveSettings(settings);
  try { fs.writeFileSync(markerPath, JSON.stringify({ host, at: Date.now() })); } catch { /* read-only share */ }
  return { results, summary };
}

let gamefileWatchers = [];
function watchGameFiles() {
  for (const p of gamefileWatchers) fs.unwatchFile(p);
  gamefileWatchers = [];
  if (!settings.dataDir) return;
  for (const local of settings.syncFiles || []) {
    const shared = path.join(gamefilesDir(), path.basename(local));
    gamefileWatchers.push(shared);
    fs.watchFile(shared, { interval: 5000 }, (curr, prev) => {
      if (curr.mtimeMs === prev.mtimeMs) return;
      const res = syncGameFiles();
      if (win && res.results) win.webContents.send('gamefiles-synced', res);
    });
  }
}

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
      loadLootDB();
      loadGameDB();
      if (win) {
        win.webContents.send('loot-db', lootDB);
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
function panelRect() {
  const b = win.getBounds();
  const tb = settings.locked ? 0 : 30;
  const availW = b.width, availH = b.height - tb;
  const s = Math.min(availW / 480, availH / 290);
  const w = Math.round(480 * s), h = Math.round(290 * s);
  return {
    x: b.x + Math.round((availW - w) / 2),
    bottom: b.y + tb + Math.round((availH + h) / 2),
    w
  };
}

function snapDock() {
  if (!win) return;
  const r = panelRect();
  const width = Math.max(320, r.w);
  let y = r.bottom;
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
  if (needsWin && !needsWin.isDestroyed()) { snapDock(); needsWin.focus(); return; }
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

// bulk wiki existence pre-check for the cleanup scan: one query per 50 titles
// instead of parse + search fallbacks per missing item
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
  if (wikiError && !out.titles.length && !out.tools.length) return { error: wikiError };
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
ipcMain.handle('search-local', (_e, query) => {
  const q = query.toLowerCase();
  const results = [];
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
  for (const m of Object.values(lootDB.mobs || {})) {
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
let gearBuilding = false;
ipcMain.handle('build-gear-catalog', async (_e, opts = {}) => {
  if (gearBuilding) return { error: 'a catalog build is already running' };
  gearBuilding = true;
  const progress = (msg) => { try { win.webContents.send('gear-progress', msg); } catch { /* window gone */ } };
  try {
    const prior = gameDB.gearCatalog;

    // ---- incremental update: only pages that CHANGED since the last build ----
    if (prior && prior.items && prior.built && !opts.full) {
      progress('Asking the wiki what changed since the last build…');
      let changed = null;
      try { changed = await updater.getRecentChangeTitles(prior.built - 3600 * 1000); } catch { changed = null; }
      if (changed) {
        if (!changed.length) {
          prior.built = Date.now();
          saveGameDBSoon();
          progress('');
          gearBuilding = false;
          return { items: prior.items.length, unchanged: true };
        }
        progress(changed.length + ' wiki pages changed — re-reading only those…');
        // the banner verdicts settled at full-build time (incl. inventory proof)
        const futureSet = new Set(prior.futureBanners || []);
        const byName = new Map(prior.items.map(it => [it.n, it]));
        let updated = 0, added = 0, dropped = 0;
        for (let i = 0; i < changed.length; i += 50) {
          const pages = await updater.fetchPagesContent(changed.slice(i, i + 50));
          for (const [title, text] of Object.entries(pages)) {
            const res = updater.parseGearPage(title, text, futureSet);
            if (!res || res.future) { // no longer gear (or provably future-era)
              if (byName.delete(title)) dropped++;
              continue;
            }
            if (byName.has(title)) updated++; else added++;
            byName.set(title, res);
          }
          progress('Re-reading changed pages… ' + Math.min(i + 50, changed.length) + ' / ' + changed.length);
        }
        gameDB.gearCatalog = { ...prior, built: Date.now(), items: [...byName.values()] };
        saveGameDBSoon();
        progress('');
        gearBuilding = false;
        return { items: gameDB.gearCatalog.items.length, updated, added, dropped, incremental: true };
      }
      progress('A lot changed since the last build — doing a full rebuild…');
    }

    // ---- full build ----
    // Era banners mark eras, CURRENT ones included — only banners whose own
    // template text says "not yet available / future" skip items. And if the
    // player OWNS an item from a "future" banner, that banner is provably
    // current: all its items come back in.
    progress('Reading the wiki\'s era banners…');
    let futureBanners = new Set();
    try {
      const eb = await updater.getEraBanners();
      futureBanners = eb.future;
      progress(eb.future.size + ' of ' + eb.all.size + ' era banners mark FUTURE content — only those skip items');
    } catch { progress('era banner list unavailable — keeping everything'); }
    progress('Listing every item on the wiki…');
    const titles = await updater.getAllCategoryMembers('Items', (n) => progress('Listing items… ' + n));
    if (!titles.length) throw new Error('the wiki returned no item list');
    progress(titles.length + ' item pages — reading in batches of 50…');
    const items = [];
    const futureStash = new Map(); // banner -> parsed entries held aside
    let read = 0, skipped = 0, futureSkipped = 0;
    for (let i = 0; i < titles.length; i += 50) {
      const pages = await updater.fetchPagesContent(titles.slice(i, i + 50));
      for (const [title, text] of Object.entries(pages)) {
        read++;
        const res = updater.parseGearPage(title, text, futureBanners);
        if (!res) { skipped++; continue; }             // not wearable gear
        if (res.future) {                              // held aside, maybe reinstated below
          futureSkipped++;
          if (res.entry) {
            if (!futureStash.has(res.future)) futureStash.set(res.future, []);
            futureStash.get(res.future).push(res.entry);
          }
          continue;
        }
        items.push(res);
      }
      progress('Reading item pages… ' + Math.min(i + 50, titles.length) + ' / ' + titles.length +
               ' (' + items.length + ' wearable, ' + futureSkipped + ' future-era held aside)');
    }
    // inventory ground truth: a banner whose item the player HOLDS is current
    const ownedBase = new Set();
    const invItems = gameData.inventory && gameData.inventory.items;
    if (invItems) for (const k of Object.keys(invItems))
      ownedBase.add(k.replace(/\s*\+\d+$/, '').replace(/`/g, "'").trim());
    const reinstSet = new Set();
    let reinstated = 0;
    for (const [banner, list] of futureStash) {
      if (list.some(e => ownedBase.has(e.n.toLowerCase().replace(/`/g, "'").trim()))) {
        items.push(...list);
        futureSkipped -= list.length;
        reinstated += list.length;
        reinstSet.add(banner);
      }
    }
    if (reinstated) progress('You own items from ' + reinstSet.size + ' "future" banner(s) — ' + reinstated + ' items reinstated as current content');
    gameDB.gearCatalog = {
      built: Date.now(), total: titles.length, items, futureSkipped,
      futureBanners: [...futureBanners].filter(b => !reinstSet.has(b))
    };
    saveGameDBSoon();
    progress('');
    gearBuilding = false;
    return { items: items.length, pages: read, skipped, futureSkipped, reinstated };
  } catch (err) {
    gearBuilding = false;
    progress('');
    return { error: err.message || String(err) };
  }
});
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
      notes: String(j.body || '').slice(0, 400)
    };
  } catch (err) {
    return { error: err.message };
  }
}
ipcMain.handle('check-app-update', () => checkAppUpdate());

// auto-check shortly after launch, quietly
app.whenReady().then(() => setTimeout(async () => {
  if (!settings.autoCheckUpdates || !settings.updateRepo) return;
  const r = await checkAppUpdate();
  if (r && r.newer && win) win.webContents.send('app-update', r);
}, 10000));

// ---------------------------------------------------------------------------
// Data-source freshness: the Epics / Unlocks views are built from wiki pages
// that were verified on a fixed date (META.captured in epics.js/unlocks.js).
// This asks the wiki's revisions API whether those pages changed since, so
// the user knows when the shipped data is out of date. BiS gear has its own
// live Update button, so it isn't checked here.
// ---------------------------------------------------------------------------
const DATA_SOURCES = [
  { label: 'Epic checklists', meta: require('./epics.js').META },
  { label: 'Race unlock guide', meta: require('./unlocks.js').META }
];

// The epic checklists can be re-read STRAIGHT FROM THE WIKI at runtime (like
// the BiS Update button): fetch the page's wikitext and parse the bullet
// lists back into the same shape epics.js ships with. The parsed result is
// stored in gameDB.epicsData and overrides the built-in list.
function parseEpicsWikitext(text) {
  const byClass = {};
  let cur = null;
  text = String(text).replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  for (const raw of text.split(/\r?\n/)) {
    const h = /^=+\s*(.+?)\s*=+\s*$/.exec(raw.trim());
    if (h) {
      cur = BIS_CLASSES.includes(h[1]) ? h[1] : null;
      if (cur && !byClass[cur]) byClass[cur] = [];
      continue;
    }
    if (!cur) continue;
    const line = raw.trim();
    if (!/^:*\*/.test(line)) continue;                      // items are bullet lines
    const links = [...line.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
    if (!links.length) continue;
    const last = links[links.length - 1];                   // the ITEM is the last link
    const item = (last[2] || last[1]).trim();
    if (!item || /Epic Quest$/i.test(item)) continue;       // "[[X Epic Quest]]" header link
    const u = /\(unverified\)/i.test(line) || /doesn'?t drop|does not drop/i.test(line);
    // quantity: "2x [[Item]]" before the link, or "[[Item]] x2" after it
    let q = 1;
    const beforeQ = /(\d+)\s*x\s*$/i.exec(line.slice(0, last.index).trimEnd());
    const afterQ = /^\s*x\s*(\d+)/i.exec(line.slice(last.index + last[0].length));
    if (beforeQ) q = +beforeQ[1]; else if (afterQ) q = +afterQ[1];
    // source: the rest of the line, links flattened, markup stripped
    let src = (line.slice(0, last.index) + line.slice(last.index + last[0].length))
      .replace(/^:*\*+\s*/, '')
      .replace(/\(unverified\)\s*/ig, '')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
      .replace(/\{\{[^}]*\}\}/g, '')
      .replace(/'{2,}/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[\s\-–—.,:]+$/, '')
      .replace(/\b\d+\s*x$/i, '')
      .replace(/[\s\-–—.,:]+$/, '')
      .replace(/\bfor$/i, '')
      .replace(/[\s\-–—.,:]+$/, '')
      .trim();
    const prev = byClass[cur].find(it => it.n === item);
    if (prev) { if (q > (prev.q || 1)) prev.q = q; continue; }
    const entry = { n: item, src };
    if (q > 1) entry.q = q;
    if (u) entry.u = true;
    byClass[cur].push(entry);
  }
  return byClass;
}

async function fetchEpicsFromWiki() {
  const title = DATA_SOURCES[0].meta.sources[0];
  const url = 'https://eqlwiki.com/api.php?action=parse&prop=wikitext&format=json&redirects=1&page=' +
              encodeURIComponent(title);
  const res = await fetch(url, { headers: { 'User-Agent': updater.UA } });
  if (!res.ok) throw new Error('wiki answered HTTP ' + res.status);
  const j = await res.json();
  const text = j.parse && j.parse.wikitext && j.parse.wikitext['*'];
  if (!text) throw new Error('wiki gave no page text');
  const byClass = parseEpicsWikitext(text);
  const withItems = Object.keys(byClass).filter(c => byClass[c].length);
  // sanity: the page has ~14 populated class sections today; refuse a thin
  // parse rather than wiping good data because the page layout changed
  if (withItems.length < 10) {
    throw new Error('page did not parse cleanly (only ' + withItems.length +
                    ' classes found) — its layout may have changed, keeping current data');
  }
  return byClass;
}

async function checkDataSources() {
  const titles = [...new Set(DATA_SOURCES.flatMap(c => c.meta.sources))];
  const url = 'https://eqlwiki.com/api.php?action=query&prop=revisions&rvprop=timestamp' +
              '&format=json&redirects=1&titles=' + encodeURIComponent(titles.join('|'));
  try {
    const res = await fetch(url, { headers: { 'User-Agent': updater.UA } });
    if (!res.ok) return { error: 'wiki answered HTTP ' + res.status };
    const j = await res.json();
    const revByTitle = {};
    for (const p of Object.values((j.query && j.query.pages) || {}))
      if (p.title && p.revisions && p.revisions[0])
        revByTitle[p.title.replace(/_/g, ' ')] = p.revisions[0].timestamp;
    if (!Object.keys(revByTitle).length) return { error: 'wiki gave no page data' };
    // a requested title may be a redirect: follow query.normalized + query.redirects
    const alias = {};
    for (const r of [...((j.query && j.query.normalized) || []), ...((j.query && j.query.redirects) || [])])
      alias[r.from.replace(/_/g, ' ')] = r.to.replace(/_/g, ' ');
    const resolve = (t) => {
      t = t.replace(/_/g, ' ');
      for (let i = 0; i < 4 && alias[t]; i++) t = alias[t];
      return t;
    };
    // baseline = the date of the data we're actually running on: a stored
    // live update if one exists, otherwise the date baked into the js files
    const baselines = {
      'Epic checklists': (gameDB.epicsData && gameDB.epicsData.revised) || DATA_SOURCES[0].meta.captured,
      'Race unlock guide': (gameDB.unlocksData && gameDB.unlocksData.revised) || DATA_SOURCES[1].meta.captured
    };
    const checks = DATA_SOURCES.map(c => {
      const revs = c.meta.sources.map(s => revByTitle[resolve(s)]).filter(Boolean);
      const revised = revs.sort().pop() || null;
      const base = baselines[c.label] || c.meta.captured;
      return {
        label: c.label, captured: base,
        revised: revised ? revised.slice(0, 10) : null,
        stale: !!(revised && revised.slice(0, 10) > base)
      };
    });
    return { checks, checkedAt: Date.now() };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

// ---- dock "guide" mode: any wiki page (or one section) as readable text ----
// Cached in the game DB, so after the first click it opens instantly and
// works offline; a stale cache (>7 days) refreshes in the same call.
function sliceWikiSection(text, anchor) {
  if (!anchor) return null;
  const want = String(anchor).replace(/_/g, ' ').trim().toLowerCase();
  const lines = String(text).split(/\r?\n/);
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = /^(={2,5})\s*(.+?)\s*={2,5}\s*$/.exec(lines[i].trim());
    if (!h) continue;
    const name = h[2].replace(/\[\[|\]\]/g, '').replace(/.*\|/, '').trim().toLowerCase();
    if (start < 0) { if (name === want) { start = i; level = h[1].length; } continue; }
    if (h[1].length <= level) return lines.slice(start, i).join('\n');
  }
  return start >= 0 ? lines.slice(start).join('\n') : null;
}

function wikitextToText(src) {
  let t = String(src);
  for (let i = 0; i < 4; i++) t = t.replace(/\{\{[^{}]*\}\}/g, '');  // templates (simple nesting)
  t = t.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '')
       .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
       .replace(/\[\[([^\]]+)\]\]/g, '$1')
       .replace(/\[https?:\/\/\S+ ([^\]]+)\]/g, '$1')
       .replace(/\[https?:\/\/\S+\]/g, '')
       .replace(/'{2,}/g, '')
       .replace(/<br\s*\/?>/gi, '\n')
       .replace(/<ref[\s\S]*?<\/ref>/gi, '')
       .replace(/<[^>]+>/g, '')
       .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
  const out = [];
  for (const raw of t.split('\n')) {
    let line = raw.trimEnd();
    const trimmed = line.trim();
    const h = /^(={2,5})\s*(.+?)\s*=+\s*$/.exec(trimmed);
    if (h) { out.push('', (h[1].length <= 2 ? '━ ' : '— ') + h[2] + (h[1].length <= 2 ? ' ━' : ' —'), ''); continue; }
    if (/^\{\||^\|\}|^\|-/.test(trimmed)) continue;   // table plumbing
    if (/^[|!]/.test(trimmed)) {                       // table cells → one line
      out.push('  ' + trimmed.replace(/^[|!]\s*/, '').split(/\s*\|\|\s*|\s*!!\s*/).join(' · '));
      continue;
    }
    line = line.replace(/^(\*+)\s*/, (m, s) => '  '.repeat(s.length - 1) + '• ')
               .replace(/^(#+)\s*/, (m, s) => '  '.repeat(s.length - 1) + '· ');
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchGuidePage(title) {
  const url = 'https://eqlwiki.com/api.php?action=parse&prop=wikitext|revid&format=json&redirects=1&page=' +
              encodeURIComponent(title);
  const res = await fetch(url, { headers: { 'User-Agent': updater.UA } });
  if (!res.ok) throw new Error('wiki answered HTTP ' + res.status);
  const j = await res.json();
  const wikitext = j.parse && j.parse.wikitext && j.parse.wikitext['*'];
  if (!wikitext) return null;
  return { wikitext, pageTitle: (j.parse.title || title), revid: j.parse.revid, updated: Date.now() };
}

ipcMain.handle('get-guide-page', async (_e, { title, anchor, refresh } = {}) => {
  if (!title) return { error: 'no page requested' };
  gameDB.guidePages = gameDB.guidePages || {};
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

// ---- Alanna's Race Unlock Guide → per-faction grind hints -----------------
// Guide layout: "== Race ==" sections, each with "=== Requirements ==="
// ("Get maximum faction with [[X]]" bullets) and "=== Recommended Method ==="
// (numbered steps). The hint for each of a race's factions is that race's
// recommended-method steps.
function parseUnlocksWikitext(text) {
  const byFaction = {};
  text = String(text).replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  const flat = (s) => s
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/\{\{[^}]*\}\}/g, '').replace(/'{2,}/g, '').replace(/\s+/g, ' ').trim();
  let race = null, sub = null, factions = [], steps = [], needs = {};
  const flush = () => {
    if (race && factions.length && steps.length) {
      const entry = { hint: steps.join(' → '), needs };
      for (const f of factions) byFaction[f] = entry;
    }
    factions = []; steps = []; needs = {};
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    const h2 = /^==\s*([^=].*?)\s*==$/.exec(line);
    if (h2) { flush(); race = h2[1]; sub = null; continue; }
    const h3 = /^===+\s*(.+?)\s*===+$/.exec(line);
    if (h3) { sub = h3[1].toLowerCase(); continue; }
    if (!race || !sub) continue;
    if (/^requirements/.test(sub)) {
      const m = /Get maximum faction with \[\[([^\]|]+)(?:\|[^\]]+)?\]\]/i.exec(line);
      if (m) factions.push(m[1].trim());
    } else if (/^recommended method/.test(sub)) {
      if (/^#+\s*\S/.test(line)) {
        steps.push(flat(line.replace(/^#+\s*/, '')));
        // turn-in totals: "200 [[Lion Delight]]" (a number BEFORE an item
        // link; links ending in "Quest" are quest names, not items)
        let m2;
        const cre = /(\d+)\s*x?\s*\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
        while ((m2 = cre.exec(line))) {
          const item = (m2[3] || m2[2]).trim();
          if (/quest$/i.test(item)) continue;
          needs[item] = Math.max(needs[item] || 0, +m2[1]);
        }
      }
    }
  }
  flush();
  return byFaction;
}

async function fetchUnlocksFromWiki() {
  const title = DATA_SOURCES[1].meta.sources[0];
  const url = 'https://eqlwiki.com/api.php?action=parse&prop=wikitext&format=json&redirects=1&page=' +
              encodeURIComponent(title);
  const res = await fetch(url, { headers: { 'User-Agent': updater.UA } });
  if (!res.ok) throw new Error('wiki answered HTTP ' + res.status);
  const j = await res.json();
  const text = j.parse && j.parse.wikitext && j.parse.wikitext['*'];
  if (!text) throw new Error('wiki gave no page text');
  const byFaction = parseUnlocksWikitext(text);
  if (Object.keys(byFaction).length < 15)
    throw new Error('guide did not parse cleanly (' + Object.keys(byFaction).length +
                    ' factions found) — its layout may have changed, keeping current data');
  return byFaction;
}

// ---- eqlegendstools Plane of Sky quests → posquests rows ------------------
// The page is server-rendered. Rather than depend on its exact tags, strip
// it to a text stream (cells tab-separated, rows on their own lines) and
// parse the repeating pattern: reward heading · "Turn in to <NPC>" ·
// "<Class> N item(s)" · item|location rows ("Wind Rune X" rows set the rune).
function htmlToTextStream(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<\/(?:td|th)>/gi, '\t')
    .replace(/<\/(?:tr|p|div|h\d|li|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:span|a|strong|b|em|button|label)>/gi, ' ')  // spans butt together otherwise
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"'); // the site's curly quotes → the game's straight ones
}

function parsePosText(text) {
  const rows = []; // [class, npc, reward, [[item, loc]...], rune]
  const lines = text.split(/\n/).map(l => l.replace(/[  ]+/g, ' ').trim());
  let reward = null, npc = null, cls = null, items = [], rune = null, prev = '';
  const flush = () => {
    if (reward && npc && cls && (items.length || rune))
      rows.push([cls, npc, reward, items, rune || '']);
    reward = npc = cls = rune = null; items = [];
  };
  for (const line of lines) {
    if (!line) continue;
    let m;
    if ((m = /^Turn in to (.+?)\.?$/.exec(line))) {
      flush();
      npc = m[1].trim();
      reward = prev.replace(/[⚖⚖©®™]+/g, '').trim(); // reward name precedes the turn-in line
    } else if (npc && (m = new RegExp('(?:^|[^A-Za-z])(' + BIS_CLASSES.join('|') + ')\\s+(\\d+)\\s*items?').exec(line))) {
      cls = m[1];
    } else if (npc && cls && /\t/.test(line) && !/turn in quest items/i.test(line)) {
      const [item, loc] = line.split('\t').map(s => s.trim());
      if (!item || !loc) continue;
      const rm = /^Wind Rune (\w+)/i.exec(item);
      if (rm) rune = rm[1];
      else items.push([item, loc]);
    }
    prev = line;
  }
  flush();
  return rows;
}

async function fetchPosFromSite() {
  const res = await fetch('https://eqlegendstools.com/plane-of-sky-quests/',
                          { headers: { 'User-Agent': updater.UA } });
  if (!res.ok) throw new Error('eqlegendstools answered HTTP ' + res.status);
  const rows = parsePosText(htmlToTextStream(await res.text()));
  const classes = new Set(rows.map(r => r[0]));
  if (rows.length < 60 || classes.size < 12)
    throw new Error('page did not parse cleanly (' + rows.length + ' quests / ' + classes.size +
                    ' classes) — its layout may have changed, keeping current data');
  return rows;
}

// ---- one entry point: refresh everything, report what changed --------------
async function updateQuestData() {
  const out = { checkedAt: Date.now() };
  const fresh = await checkDataSources();               // wiki revision dates
  out.checks = fresh.checks || null;
  const revOf = (label) => {
    const c = fresh.checks && fresh.checks.find(x => x.label === label);
    return c ? c.revised : null;
  };
  const one = async (key, fn, store, revised) => {
    try {
      const data = await fn();
      const changed = JSON.stringify(data) !== JSON.stringify((gameDB[store] || {}).data);
      gameDB[store] = { data, updated: Date.now(), revised: revised || null };
      out[key] = { ok: true, changed, revised: revised || null,
                   count: Array.isArray(data) ? data.length : Object.keys(data).length };
    } catch (e) {
      out[key] = { error: e.message || String(e) };
    }
  };
  await one('epics', fetchEpicsFromWiki, 'epicsData', revOf('Epic checklists'));
  await one('unlocks', fetchUnlocksFromWiki, 'unlocksData', revOf('Race unlock guide'));
  await one('pos', fetchPosFromSite, 'posData', null);
  // cached zone + item pages: revision-compare, re-fetch changed only
  try { out.cached = await refreshCachedPages(); } catch (e) { out.cached = { error: e.message }; }
  // long-tail: re-check old "no quest found" item-knowledge entries
  try { out.knowledge = await refreshItemKnowledge(); } catch (e) { out.knowledge = { error: e.message }; }
  saveGameDBSoon();
  if (!fresh.error) settings.lastDataCheckAt = fresh.checkedAt;
  // remember which sources we could NOT refresh although the wiki moved on
  settings.staleData = (fresh.checks || [])
    .filter(c => c.stale)
    .filter(c => (c.label === 'Epic checklists' && out.epics.error) ||
                 (c.label === 'Race unlock guide' && out.unlocks.error))
    .map(c => c.label);
  saveSettings(settings);
  return out;
}

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
ipcMain.handle('wiki-submit', async (_e, { mode, fullText, perMob }) => {
  if (!settings.wikiUser || !settings.wikiPass) {
    return { error: 'Set your wiki username and bot password in Settings first' };
  }
  try {
    const realUser = await updater.wikiLogin(settings.wikiUser, settings.wikiPass);
    const csrf = await updater.getCsrfToken();
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    if (mode === 'sandbox') {
      const title = 'User:' + realUser + '/SEQO Drop Data';
      await updater.wikiEdit({ title, text: fullText, csrf });
      return { edited: 1, url: updater.WIKI_PAGE(title), user: realUser };
    }

    // talk pages: one new section per mob, politely rate-limited
    const results = [];
    let edited = 0;
    const date = new Date().toISOString().slice(0, 10);
    for (const m of (perMob || []).slice(0, 30)) {
      try {
        const title = 'Talk:' + m.mob.charAt(0).toUpperCase() + m.mob.slice(1);
        await updater.wikiEdit({
          title, text: m.text + '\n~~~~',
          newSectionTitle: 'Observed drop rates (SEQO, ' + date + ')',
          csrf
        });
        edited++;
        results.push(m.mob + ' ✓');
      } catch (err) {
        results.push(m.mob + ' ⚠ ' + err.message);
      }
      if (win) win.webContents.send('wiki-submit-progress', { done: results.length, total: Math.min((perMob || []).length, 30) });
      await sleep(1800);
    }
    return { edited, results, user: realUser };
  } catch (err) {
    return { error: err.message };
  }
});

// ---------------------------------------------------------------------------
// Loot database (persistent drop tracking per mob)
// ---------------------------------------------------------------------------
const lootDbPath = () => path.join(dataDir(), 'lootdb.json');
let lootDB = { mobs: {} };
let lootSaveTimer = null;

function loadLootDB() {
  try { lootDB = JSON.parse(fs.readFileSync(lootDbPath(), 'utf8')); } catch { lootDB = { mobs: {} }; }
  if (!lootDB.mobs) lootDB.mobs = {};
  // migrate pre-zone entries: keep their data, mark zone unknown
  for (const [k, m] of Object.entries(lootDB.mobs)) {
    if (m.zone === undefined) m.zone = '';
  }
  // sanitize item names recorded by older parsers (stack counts, corpse
  // suffixes, +N upgrade levels) and merge duplicates
  for (const m of Object.values(lootDB.mobs)) {
    const fixed = {};
    for (const d of Object.values(m.drops || {})) {
      const name = d.name
        .replace(/^\d+ /, '')
        .replace(/ from .+?'s corpse$/i, '')
        .replace(/ \+\d+$/, '');
      const f = fixed[name] || (fixed[name] = { name, count: 0 });
      f.count += d.count;
    }
    m.drops = fixed;
  }
}

let lastDbWrite = 0;
function saveLootDBSoon() {
  clearTimeout(lootSaveTimer);
  lootSaveTimer = setTimeout(() => {
    try { lastDbWrite = Date.now(); fs.writeFileSync(lootDbPath(), JSON.stringify(lootDB)); } catch (e) { console.error(e); }
  }, 1000);
}

let lootPushTimer = null;
function pushLootDBSoon() {
  clearTimeout(lootPushTimer);
  lootPushTimer = setTimeout(() => { if (win) win.webContents.send('loot-db', lootDB); }, 400);
}

const mobKey = (name) => name.replace(/^(A|An|The) /, (m) => m.toLowerCase());

// kills and drops are keyed per zone+mob: the same mob name can have
// different loot tables in different zones, and the wiki wants zone data
function lootEntry(mob, zone) {
  const k = (zone || '') + '|' + mobKey(mob);
  return lootDB.mobs[k] ||
    (lootDB.mobs[k] = { name: mobKey(mob), zone: zone || '', kills: 0, drops: {} });
}

ipcMain.on('record-kill', (_e, { mob, zone }) => {
  lootEntry(mob, zone).kills += 1;
  saveLootDBSoon(); pushLootDBSoon();
});

ipcMain.on('record-drop', (_e, { mob, item, zone }) => {
  const m = lootEntry(mob, zone);
  const d = m.drops[item] || (m.drops[item] = { name: item, count: 0 });
  d.count += 1;
  saveLootDBSoon(); pushLootDBSoon();
});

// batched mob combat observations: max melee hit, hit counts, casts seen
ipcMain.on('record-mob-stats', (_e, entries) => {
  for (const s of entries || []) {
    const m = lootEntry(s.mob, s.zone);
    m.maxHit = Math.max(m.maxHit || 0, s.maxHit || 0);
    m.hitCount = (m.hitCount || 0) + (s.hits || 0);
    m.hitTotal = (m.hitTotal || 0) + (s.total || 0);
    if (s.level) m.level = s.level;   // latest /con wins
    if (s.spells && s.spells.length) {
      m.spells = [...new Set([...(m.spells || []), ...s.spells])].slice(0, 25);
    }
  }
  saveLootDBSoon(); pushLootDBSoon();
});

ipcMain.handle('get-loot-db', () => lootDB);

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
// Zero-click game data sync: EQ's /outputfile writes land in the game root
// (one level above Logs\). We derive the character's file names from the log
// path, parse them, and watch the folder so a fresh /outputfile inventory /
// achievements / faction refreshes SEQO within a second — no clicks.
// ---------------------------------------------------------------------------
let gameData = { inventory: null, factions: null, achievements: null };
let outputWatcher = null;
let outputDebounce = null;

function charServerFromLog(logPath) {
  const m = /^eqlog_(.+?)_(.+?)\.txt$/i.exec(path.basename(logPath || ''));
  return m ? { name: m[1], server: m[2] } : null;
}

function gameRootFromLog(logPath) {
  // <game>\Logs\eqlog_Name_server.txt -> <game>
  const dir = path.dirname(logPath);
  return /logs$/i.test(path.basename(dir)) ? path.dirname(dir) : dir;
}

function discoverOutputFiles() {
  const logPath = settings.logPath;
  const cs = charServerFromLog(logPath);
  if (!logPath || !cs) return null;
  const root = gameRootFromLog(logPath);
  const prefix = (cs.name + '_' + cs.server).toLowerCase();
  const found = { root, prefix, inventory: null, achievements: null, factions: null };
  let entries = [];
  try { entries = fs.readdirSync(root); } catch { return found; }
  for (const f of entries) {
    const lf = f.toLowerCase();
    if (!lf.startsWith(prefix) || !lf.endsWith('.txt')) continue;
    if (lf.includes('inventory')) found.inventory = pickNewer(found.inventory, path.join(root, f));
    else if (lf.includes('achievements')) found.achievements = pickNewer(found.achievements, path.join(root, f));
    else if (lf.includes('factions')) found.factions = pickNewer(found.factions, path.join(root, f));
  }
  return found;
}

function pickNewer(a, b) {
  if (!a) return b;
  try { return fs.statSync(b).mtimeMs > fs.statSync(a).mtimeMs ? b : a; } catch { return a; }
}

// Inventory: TSV  Location \t Name \t ID \t Count \t Slots
// plus a KeyRing section (KeyRing \t Name \t ID) with Equipment/Augmentation/
// Activated rows. Bank/SharedBank slots ARE included by the game.
// which storage bucket a location prefix belongs to. Real prefixes seen in
// the game's file: "General ", "General 1-Slot" (note the space variants),
// "Personal-Depot" (character storage), "Bank"/"Bank5-Slot", "SharedBank",
// and worn gear (Equipment / Augmentation / "Any Slot" / slot names).
// The game only writes the Personal-Depot section into /outputfile inventory
// while the depot is accessible (at the banker) — an export run in the field
// silently drops everything in storage, cratering counters and emptying the
// Cleanup storage section. So: remember the last export that HAD the depot
// and carry its contents forward whenever a newer export lacks the section;
// a fresh depot-bearing export replaces the carried copy on the spot.
function applyDepotCarry(inv) {
  if (!inv || !inv.items) return inv;
  const hasDepot = Object.values(inv.items).some(it => it.by && it.by.depot > 0);
  if (hasDepot) {
    const snap = {};
    for (const [k, it] of Object.entries(inv.items))
      if (it.by.depot > 0) snap[k] = { name: it.name, count: it.by.depot };
    gameDB.lastDepot = { at: inv.mtime || Date.now(), items: snap };
    saveGameDBSoon();
    return inv;
  }
  const last = gameDB.lastDepot;
  if (!last || !last.items) return inv;
  for (const [k, s] of Object.entries(last.items)) {
    const it = inv.items[k] ||
      (inv.items[k] = { name: s.name, count: 0, locs: [], by: { bags: 0, depot: 0, bank: 0, shared: 0, stored: 0, worn: 0 } });
    it.by = it.by || { bags: 0, depot: 0, bank: 0, shared: 0, stored: 0, worn: 0 };
    it.count += s.count;
    it.by.depot += s.count;
    if (it.locs.length < 6 && !it.locs.includes('Personal-Depot (carried)'))
      it.locs.push('Personal-Depot (carried)');
  }
  inv.depotCarried = { at: last.at };
  return inv;
}

function invBucketOf(loc) {
  if (/^(General|Held)/i.test(loc)) return 'bags';
  if (/^Personal-?Depot/i.test(loc)) return 'depot';
  if (/^SharedBank/i.test(loc)) return 'shared';
  if (/^Bank/i.test(loc)) return 'bank';
  if (/^Equipment/i.test(loc)) return 'stored';   // the storage's gear tab (trailing section)
  return 'worn';
}

function parseInventoryFile(text) {
  const items = {};   // lower name -> { name, count, locs: [], by: {bags,depot,bank,shared,stored,worn} }
  const keyring = []; // trailing-section names (PoS reward detection keys on these)
  let inKeyRing = false;
  const addItem = (name, loc, count) => {
    const k = name.toLowerCase();
    if (!items[k]) items[k] = { name, count: 0, locs: [], by: { bags: 0, depot: 0, bank: 0, shared: 0, stored: 0, worn: 0 } };
    items[k].count += count;
    items[k].by[invBucketOf(loc)] += count;
    if (items[k].locs.length < 6 && !items[k].locs.includes(loc)) items[k].locs.push(loc);
  };
  for (const raw of text.split(/\r?\n/)) {
    const cols = raw.replace(/\r$/, '').split('\t');
    if (!cols.length || !cols[0]) continue;
    if (cols[0] === 'Location' || cols[0] === 'KeyRing') { inKeyRing = cols[0] === 'KeyRing'; continue; }
    const name = (cols[1] || '').trim();
    if (!name || name === 'Empty') continue;
    if (inKeyRing) {
      // the file's trailing sections are real belongings, not just markers:
      // Equipment = the character storage's GEAR tab, Augmentation = the
      // exaltation collection, Activated = claimed activatables. No count
      // column down here — one each. Names also stay in keyring[] because
      // the PoS tracker marks quests done off obtained rewards listed here.
      keyring.push(name);
      addItem(name, cols[0], 1);
      continue;
    }
    addItem(name, cols[0], parseInt(cols[3], 10) || 1);
  }
  return { items, keyring };
}

// Factions: TSV  ID \t Name \t StandingValue \t PointsToMax   (max = 2000)
function parseFactionsFile(text) {
  const factions = {};
  for (const raw of text.split(/\r?\n/)) {
    const cols = raw.replace(/\r$/, '').split('\t');
    if (cols.length < 4 || cols[0] === 'ID') continue;
    const value = parseInt(cols[2], 10), toMax = parseInt(cols[3], 10);
    if (isNaN(value)) continue;
    factions[cols[1].trim()] = { value, toMax: isNaN(toMax) ? null : toMax };
  }
  return { factions };
}

// Achievements: section headers have no prefix; achievements are
// "[IC]\t<name>"; objectives are "[IC]\t\t<text>".  C = complete.
function parseAchievementsFile(text) {
  const sections = [];
  let sec = null, ach = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const m = /^([IC])\t(\t?)(.*)$/.exec(line);
    if (!m) {                       // section header
      sec = { name: line.trim(), achievements: [] };
      sections.push(sec);
      ach = null;
    } else if (!m[2]) {             // achievement line
      ach = { name: m[3].trim(), done: m[1] === 'C', objectives: [] };
      if (sec) sec.achievements.push(ach);
    } else if (ach) {               // objective line
      // Slayer-style rows carry a progress column: "<text>\t1187/5000"
      let text = m[3].trim(), cur, max;
      const c = /^(.*?)\t(\d[\d,]*)\s*\/\s*(\d[\d,]*)$/.exec(text);
      if (c) { text = c[1].trim(); cur = +c[2].replace(/,/g, ''); max = +c[3].replace(/,/g, ''); }
      const o = { text, done: m[1] === 'C' };
      if (cur !== undefined && !isNaN(cur) && !isNaN(max)) { o.cur = cur; o.max = max; }
      ach.objectives.push(o);
    }
  }
  return { sections };
}

function refreshGameData(notify) {
  const found = discoverOutputFiles();
  if (!found) return;
  const readOne = (p, parse) => {
    if (!p) return null;
    try {
      const st = fs.statSync(p);
      const parsed = parse(fs.readFileSync(p, 'latin1'));
      return { ...parsed, path: p, mtime: st.mtimeMs };
    } catch { return null; }
  };
  gameData.inventory = applyDepotCarry(readOne(found.inventory, parseInventoryFile));
  gameData.achievements = readOne(found.achievements, parseAchievementsFile);
  gameData.factions = readOne(found.factions, parseFactionsFile);
  if (notify && win) {
    win.webContents.send('gamedata-updated', {
      inventory: !!gameData.inventory, achievements: !!gameData.achievements,
      factions: !!gameData.factions
    });
  }
}

// A half-written export must never be parsed: the game writes these files
// over a second or two and the Personal-Depot section lands near the END,
// so an eager read sees bags and bank but no storage. Wait until the file's
// size has held still for two checks before reading it.
async function waitForStableFile(p, tries = 25) {
  let last = -1;
  for (let i = 0; i < tries; i++) {
    let size = -2;
    try { size = fs.statSync(p).size; } catch { /* file may appear shortly */ }
    if (size >= 0 && size === last) return;
    last = size;
    await new Promise(r => setTimeout(r, 400));
  }
}

function watchOutputFiles() {
  if (outputWatcher) { try { outputWatcher.close(); } catch { /* ok */ } outputWatcher = null; }
  const found = discoverOutputFiles();
  if (!found) return;
  refreshGameData(true);
  try {
    outputWatcher = fs.watch(found.root, (_ev, fname) => {
      if (!fname) return;
      const lf = fname.toLowerCase();
      if (!lf.startsWith(found.prefix)) return;
      if (!/inventory|achievements|factions/.test(lf)) return;
      clearTimeout(outputDebounce);
      outputDebounce = setTimeout(async () => {
        const f = discoverOutputFiles();
        for (const p of [f && f.inventory, f && f.achievements, f && f.factions].filter(Boolean))
          await waitForStableFile(p);
        refreshGameData(true);
      }, 700);
    });
  } catch (e) { console.error('outputfile watch failed:', e.message); }
}

ipcMain.handle('get-gamedata', () => gameData);

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
  if (win && Object.prototype.hasOwnProperty.call(partial, 'keepAspectRatio')) {
    win.setAspectRatio(settings.keepAspectRatio ? BASE_W / BASE_H : 0);
  }
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
  if (settings && settings.autoClearLog) clearLogFile();
  if (settings && settings.dataDir && (settings.syncFiles || []).length) syncGameFiles();
});

app.on('window-all-closed', () => app.quit());
