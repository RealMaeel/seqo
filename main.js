// EQL Overlay - main process
// Creates a transparent, frameless, always-on-top overlay window that can be
// toggled between Edit mode (interactive) and Locked mode (click-through).

const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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
  archiveOnClear: true,
  alertFlash: true,
  alertSound: true,
  alertVolume: 60,
  mergePets: true,
  buffAlerts: true,
  mutedAlerts: [],
  spellTimers: '',
  buffWatch: 'Clarity = Your thoughts slow.\nSpirit of Wolf = You feel your feet slow.\nLevitate = You feel your feet touch the ground.',
  wikiUser: '',
  wikiPass: '',
  text: 'Notes: click to edit.'
};

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
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
      setTimeout(async () => {
        try {
          const tabs = (process.env.EQL_TEST_TABS ||
            'meter;breakdown;loot;lookup;item:Flowing Black Silk Sash;export').split(';');
          const wait = +(process.env.EQL_TEST_WAIT || 700);
          for (let i = 0; i < tabs.length; i++) {
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
  };
  win.on('moved', rememberBounds);
  win.on('resized', rememberBounds);
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

function syncGameFiles() {
  if (!settings.dataDir) return { error: 'Set a shared data folder first' };
  const results = [];
  try { fs.mkdirSync(gamefilesDir(), { recursive: true }); } catch (e) { return { error: e.message }; }
  for (const local of settings.syncFiles || []) {
    const base = path.basename(local);
    const shared = path.join(gamefilesDir(), base);
    try {
      const le = fs.existsSync(local), se = fs.existsSync(shared);
      if (le && se) {
        const lm = fs.statSync(local).mtimeMs, sm = fs.statSync(shared).mtimeMs;
        if (Math.abs(lm - sm) < 2000) { results.push(base + ': in sync'); continue; }
        if (lm > sm) {
          copyPreservingTime(local, shared);
          results.push(base + ': → shared (local was newer)');
        } else {
          fs.copyFileSync(local, local + '.seqo.bak');
          copyPreservingTime(shared, local);
          results.push(base + ': ← shared (backup kept)');
        }
      } else if (le) {
        copyPreservingTime(local, shared);
        results.push(base + ': seeded to shared');
      } else if (se) {
        copyPreservingTime(shared, local);
        results.push(base + ': pulled from shared');
      } else {
        results.push(base + ': ⚠ missing on both sides');
      }
    } catch (e) {
      results.push(base + ': ⚠ ' + e.message);
    }
  }
  return { results };
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
      if (win && res.results) win.webContents.send('gamefiles-synced', res.results);
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

ipcMain.handle('update-item-data', async (_e, name) => {
  try {
    const data = await updater.fetchItemData(name);
    gameDB.items[name.toLowerCase()] = data;
    saveGameDBSoon();
    return data;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('search-wiki', async (_e, query) => {
  try { return { titles: await updater.searchWiki(query) }; }
  catch (err) { return { error: err.message }; }
});

// Manual "Check for updates": compare cached page revisions against the wiki,
// re-fetch only what actually changed.
ipcMain.handle('check-updates', async () => {
  try {
    const zoneEntries = Object.values(gameDB.zones);
    const itemEntries = Object.values(gameDB.items);
    const titles = [...new Set([
      ...zoneEntries.map(z => z.pageTitle),
      ...itemEntries.map(i => i.pageTitle)
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
    saveGameDBSoon();
    return { checked: titles.length, updated, details };
  } catch (err) {
    return { error: err.message };
  }
});

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

// ---------------------------------------------------------------------------
// Zone maps (Brewall / nParse format .txt vector files)
//   L x1, y1, z1, x2, y2, z2, r, g, b     line segment
//   P x, y, z, r, g, b, size, Label       labeled point
// ---------------------------------------------------------------------------
const mapCache = new Map();

function parseMapFile(text) {
  const lines = [], points = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t.startsWith('L')) {
      const p = t.slice(1).split(',').map(s => s.trim());
      if (p.length >= 9) {
        const [x1, y1, , x2, y2, , r, g, b] = p.map(Number);
        lines.push([x1, y1, x2, y2, (isNaN(r) ? 0 : r), (isNaN(g) ? 0 : g), (isNaN(b) ? 0 : b)]);
        grow(x1, y1); grow(x2, y2);
      }
    } else if (t.startsWith('P')) {
      const p = t.slice(1).split(',').map(s => s.trim());
      if (p.length >= 8) {
        const x = +p[0], y = +p[1];
        points.push([x, y, p.slice(7).join(',').replace(/_/g, ' ')]);
        grow(x, y);
      }
    }
  }
  if (!lines.length && !points.length) return null;
  return { lines, points, bounds: { minX, minY, maxX, maxY } };
}

function mapsDir() {
  return settings.mapsDir || path.join(app.getPath('userData'), 'maps');
}

// maps dir + immediate subdirectories (in case the user picked the parent
// folder of an unzipped map pack)
function mapSearchDirs() {
  const dirs = [mapsDir()];
  try {
    for (const e of fs.readdirSync(mapsDir(), { withFileTypes: true })) {
      if (e.isDirectory()) dirs.push(path.join(mapsDir(), e.name));
    }
  } catch { /* no maps folder yet */ }
  return dirs;
}

ipcMain.handle('get-map', (_e, shortName) => {
  if (!shortName) return null;
  if (mapCache.has(shortName)) return mapCache.get(shortName);
  let result = null;
  try {
    let combined = '';
    for (const dir of mapSearchDirs()) {
      let files = [];
      try {
        files = fs.readdirSync(dir).filter(f =>
          f.toLowerCase() === shortName + '.txt' ||
          new RegExp('^' + shortName + '_[0-9]+\\.txt$', 'i').test(f));
      } catch { continue; }
      for (const f of files) combined += fs.readFileSync(path.join(dir, f), 'latin1') + '\n';
    }
    if (combined) result = parseMapFile(combined);
  } catch { /* ignore */ }
  mapCache.set(shortName, result);
  return result;
});

ipcMain.handle('choose-maps-folder', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Select your zone maps folder (Brewall / nParse .txt maps)',
    properties: ['openDirectory']
  });
  if (res.canceled || !res.filePaths.length) return mapsStatus();
  settings.mapsDir = res.filePaths[0];
  saveSettings(settings);
  mapCache.clear();
  return mapsStatus();
});

function mapsStatus() {
  let n = 0;
  for (const dir of mapSearchDirs()) {
    try { n += fs.readdirSync(dir).filter(f => /\.txt$/i.test(f)).length; } catch { /* skip */ }
  }
  return { dir: mapsDir(), count: n };
}
ipcMain.handle('maps-status', () => mapsStatus());

// distinct map short-names available on disk (befallen_1.txt -> befallen)
ipcMain.handle('list-maps', () => {
  const names = new Set();
  for (const dir of mapSearchDirs()) {
    try {
      for (const f of fs.readdirSync(dir)) {
        const m = /^([a-z0-9]+?)(?:_\d+)?\.txt$/i.exec(f);
        if (m) names.add(m[1].toLowerCase());
      }
    } catch { /* skip */ }
  }
  return [...names].sort();
});

ipcMain.handle('download-legends-maps', async () => {
  try {
    const dir = mapsDir();
    fs.mkdirSync(dir, { recursive: true });
    const res = await updater.downloadMaps(dir, fs, path, (done, total) => {
      if (win) win.webContents.send('maps-progress', { done, total });
    });
    mapCache.clear();
    return { ...res, ...mapsStatus() };
  } catch (err) {
    return { error: err.message };
  }
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
ipcMain.on('learn-respawn', (_e, { zone, mob, seconds }) => {
  gameDB.mobRespawn = gameDB.mobRespawn || {};
  gameDB.mobRespawn[zone + '|' + mob] = Math.round(seconds);
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
ipcMain.on('set-interactive', (_e, interactive) => {
  if (!win || !settings.locked) return;
  if (interactive) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
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
