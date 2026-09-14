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
  posClasses: [],          // Plane of Sky quest tracker: classes shown (max 3)
  updateRepo: 'RealMaeel/seqo',  // GitHub "user/repo" to check Releases for updates
  autoCheckUpdates: true,  // check for a new release at launch
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

function syncOnePair(local, shared, label, results) {
  try {
    const le = fs.existsSync(local), se = fs.existsSync(shared);
    if (le && se) {
      const lm = fs.statSync(local).mtimeMs, sm = fs.statSync(shared).mtimeMs;
      if (Math.abs(lm - sm) < 2000) { results.push(label + ': in sync'); return; }
      if (lm > sm) {
        copyPreservingTime(local, shared);
        results.push(label + ': → shared (local was newer)');
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
            const out = {};
            for (const cls of ${JSON.stringify(BIS_CLASSES)}) {
              s1.value = cls; fire(s1);
              await new Promise(r => setTimeout(r, 700));
              const bySlot = {};
              for (const tr of document.querySelectorAll('table tbody tr')) {
                const c = [...tr.cells].map(td => td.textContent.trim());
                const slot = c[2];
                if (!c[1] || !slot) continue;
                (bySlot[slot] = bySlot[slot] || []).push({ n: c[1], ac: num(c[3]), hp: num(c[4]), mana: num(c[5]), sp: c[19] || undefined, src: c[20] || '' });
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

// Plane of Sky quest progress: reward -> { done: bool, items: {itemName: true} }
// Lives in gameDB so it syncs across computers with the shared data folder.
ipcMain.on('set-posquest', (_e, { reward, state }) => {
  gameDB.posQuests = gameDB.posQuests || {};
  if (state && (state.done || Object.keys(state.items || {}).length)) gameDB.posQuests[reward] = state;
  else delete gameDB.posQuests[reward];
  saveGameDBSoon();
});
ipcMain.handle('get-posquests', () => gameDB.posQuests || {});

// personal loot verdicts: itemName(lower) -> 'keep' | 'junk' (synced)
ipcMain.on('set-item-verdict', (_e, { item, verdict }) => {
  gameDB.itemVerdicts = gameDB.itemVerdicts || {};
  const k = String(item).toLowerCase();
  if (verdict) gameDB.itemVerdicts[k] = verdict;
  else delete gameDB.itemVerdicts[k];
  saveGameDBSoon();
});
ipcMain.handle('get-item-verdicts', () => gameDB.itemVerdicts || {});

// vendor sell list: itemName(lower) -> { name, count, reason } (synced)
ipcMain.on('set-selllist', (_e, list) => {
  gameDB.sellList = list && Object.keys(list).length ? list : undefined;
  if (!gameDB.sellList) delete gameDB.sellList;
  saveGameDBSoon();
});
ipcMain.handle('get-selllist', () => gameDB.sellList || {});

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
function parseInventoryFile(text) {
  const items = {};   // lower name -> { name, count, locs: [] }
  const keyring = []; // key ring entries (Equipment = obtained PoS rewards)
  let inKeyRing = false;
  for (const raw of text.split(/\r?\n/)) {
    const cols = raw.replace(/\r$/, '').split('\t');
    if (!cols.length || !cols[0]) continue;
    if (cols[0] === 'Location' || cols[0] === 'KeyRing') { inKeyRing = cols[0] === 'KeyRing'; continue; }
    const name = (cols[1] || '').trim();
    if (!name || name === 'Empty') continue;
    if (inKeyRing) { keyring.push(name); continue; }
    const loc = cols[0];
    const count = parseInt(cols[3], 10) || 1;
    const k = name.toLowerCase();
    if (!items[k]) items[k] = { name, count: 0, locs: [] };
    items[k].count += count;
    if (items[k].locs.length < 6) items[k].locs.push(loc);
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
      ach.objectives.push({ text: m[3].trim(), done: m[1] === 'C' });
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
  gameData.inventory = readOne(found.inventory, parseInventoryFile);
  gameData.achievements = readOne(found.achievements, parseAchievementsFile);
  gameData.factions = readOne(found.factions, parseFactionsFile);
  if (notify && win) {
    win.webContents.send('gamedata-updated', {
      inventory: !!gameData.inventory, achievements: !!gameData.achievements,
      factions: !!gameData.factions
    });
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
      outputDebounce = setTimeout(() => refreshGameData(true), 700);
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
