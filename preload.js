const { contextBridge, ipcRenderer } = require('electron');

const api = {
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onLockState: (cb) => ipcRenderer.on('lock-state', (_e, locked) => cb(locked)),
  updateSettings: (partial) => ipcRenderer.send('update-settings', partial),
  toggleLock: () => ipcRenderer.send('toggle-lock'),
  minimizeOverlay: () => ipcRenderer.send('minimize-overlay'),
  onHotkeyWarn: (cb) => ipcRenderer.on('hotkey-warn', (_e, keys) => cb(keys)),
  resizeWindow: (w, h) => ipcRenderer.send('resize-window', { width: w, height: h }),
  chooseLog: () => ipcRenderer.invoke('choose-log'),
  clearLog: () => ipcRenderer.invoke('clear-log'),
  logSize: () => ipcRenderer.invoke('log-size'),
  scanLogs: () => ipcRenderer.invoke('scan-logs'),
  switchLog: (p) => ipcRenderer.send('switch-log', p),
  onLogLines: (cb) => ipcRenderer.on('log-lines', (_e, lines) => cb(lines)),
  onLogStatus: (cb) => ipcRenderer.on('log-status', (_e, st) => cb(st)),
  recordKill: (mob, zone, when, secs, variant, makeup, group) => ipcRenderer.send('record-kill', { mob, zone, when, secs, variant, makeup, group }),
  recordMobStats: (entries) => ipcRenderer.send('record-mob-stats', entries),
  recordDrop: (mob, item, zone) => ipcRenderer.send('record-drop', { mob, item, zone }),
  getLootDB: () => ipcRenderer.invoke('get-loot-db'),
  onLootDB: (cb) => ipcRenderer.on('loot-db', (_e, db) => cb(db)),
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  getZoneData: (zone) => ipcRenderer.invoke('get-zone-data', zone),
  updateZoneData: (zone, aliases) => ipcRenderer.invoke('update-zone-data', zone, aliases),
  getItemData: (name) => ipcRenderer.invoke('get-item-data', name),
  updateItemData: (name) => ipcRenderer.invoke('update-item-data', name),
  searchLocal: (q) => ipcRenderer.invoke('search-local', q),
  searchWiki: (q) => ipcRenderer.invoke('search-wiki', q),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  setNotRare: (zone, mob, ignored) => ipcRenderer.send('set-not-rare', { zone, mob, ignored }),
  setEpicTick: (key, on) => ipcRenderer.send('set-epic-tick', { key, on }),
  getEpicTicks: () => ipcRenderer.invoke('get-epic-ticks'),
  setNotes: (text) => ipcRenderer.send('set-notes', text),
  copyText: (text) => ipcRenderer.send('copy-text', String(text)),
  // dock panel (shared preload: overlay pushes, dock consumes)
  openDock: (mode, payload) => ipcRenderer.send('open-dock', { mode, payload }),
  closeDock: () => ipcRenderer.send('close-dock'),
  dockDetach: (v) => ipcRenderer.send('dock-detach', v),
  onDockMode: (cb) => ipcRenderer.on('dock-mode', (_e, m) => cb(m)),
  openCleanup: () => ipcRenderer.send('open-cleanup'),
  // zone-needs panel (shared preload: overlay pushes, panel consumes)
  openNeeds: () => ipcRenderer.send('open-needs'),
  closeNeeds: () => ipcRenderer.send('close-needs'),
  needsMinimize: (v) => ipcRenderer.send('needs-minimize', v),
  needsDetach: (v) => ipcRenderer.send('needs-detach', v),
  onNeedsMin: (cb) => ipcRenderer.on('needs-min', (_e, v) => cb(v)),
  needsPush: (payload) => ipcRenderer.send('needs-data', payload),
  onNeedsData: (cb) => ipcRenderer.on('needs-data', (_e, p) => cb(p)),
  needsCmd: (cmd) => ipcRenderer.send('needs-cmd', cmd),
  onNeedsCmd: (cb) => ipcRenderer.on('needs-cmd', (_e, c) => cb(c)),
  onNeedsState: (cb) => ipcRenderer.on('needs-state', (_e, open) => cb(open)),
  onCleanupState: (cb) => ipcRenderer.on('cleanup-state', (_e, open) => cb(open)),
  cleanupPush: (payload) => ipcRenderer.send('cleanup-data', payload),
  onCleanupData: (cb) => ipcRenderer.on('cleanup-data', (_e, p) => cb(p)),
  cleanupCmd: (cmd) => ipcRenderer.send('cleanup-cmd', cmd),
  onCleanupCmd: (cb) => ipcRenderer.on('cleanup-cmd', (_e, c) => cb(c)),
  setItemKnowledge: (key, entry) => ipcRenderer.send('set-item-knowledge', { key, entry }),
  getExaltIndex: () => ipcRenderer.invoke('get-exalt-index'),
  updateExaltIndex: () => ipcRenderer.invoke('update-exalt-index'),
  getEffectItems: (name) => ipcRenderer.invoke('get-effect-items', name),
  getItemKnowledge: () => ipcRenderer.invoke('get-item-knowledge'),
  checkPagesExist: (titles) => ipcRenderer.invoke('check-pages-exist', titles),
  itemAltSource: (name) => ipcRenderer.invoke('item-alt-source', name),
  getItemFixes: () => ipcRenderer.invoke('get-item-fixes'),
  setItemFix: (key, fix) => ipcRenderer.invoke('set-item-fix', { key, fix }),
  getSpellDB: () => ipcRenderer.invoke('get-spell-db'),
  historyUpsert: (entry) => ipcRenderer.send('history-upsert', entry),
  spellWikiCheck: (names) => ipcRenderer.invoke('spell-wiki-check', names),
  importGinaFile: () => ipcRenderer.invoke('import-gina-file'),
  historyList: () => ipcRenderer.invoke('history-list'),
  historyImportLogs: () => ipcRenderer.invoke('history-import-logs'),
  onHistoryImportProgress: (cb) => ipcRenderer.on('history-import-progress', (_e, p) => cb(p)),
  chatAdd: (batch) => ipcRenderer.send('chat-add', batch),
  pricesAdd: (list) => ipcRenderer.send('prices-add', list),
  pricesQuery: (opts) => ipcRenderer.invoke('prices-query', opts),
  pricesDetail: (key, days) => ipcRenderer.invoke('prices-detail', { key, days }),
  chatList: () => ipcRenderer.invoke('chat-list'),
  chatClear: () => ipcRenderer.invoke('chat-clear'),
  historyRemove: (id) => ipcRenderer.invoke('history-remove', id),
  historyNote: (id, note) => ipcRenderer.invoke('history-note', { id, note }),
  historyExport: (ids, format) => ipcRenderer.invoke('history-export', { ids, format }),
  buildGearCatalog: (opts) => ipcRenderer.invoke('build-gear-catalog', opts || {}),
  getGearCatalog: () => ipcRenderer.invoke('get-gear-catalog'),
  onGearProgress: (cb) => ipcRenderer.on('gear-progress', (_e, msg) => cb(msg)),
  getGuidePage: (title, anchor, refresh, source) => ipcRenderer.invoke('get-guide-page', { title, anchor, refresh, source }),
  onUiScale: (cb) => ipcRenderer.on('ui-scale', (_e, v) => cb(v)),
  getNotes: () => ipcRenderer.invoke('get-notes'),
  getNotRares: () => ipcRenderer.invoke('get-not-rares'),
  updateQuestData: () => ipcRenderer.invoke('update-questdata'),
  getQuestData: () => ipcRenderer.invoke('get-questdata'),
  onQuestDataUpdated: (cb) => ipcRenderer.on('questdata-updated', (_e, r) => cb(r)),
  learnZoneMap: (longName, shortName) => ipcRenderer.send('learn-zonemap', { longName, shortName }),
  getZoneMap: () => ipcRenderer.invoke('get-zonemap'),
  learnRespawn: (zone, mob, seconds) => ipcRenderer.send('learn-respawn', { zone, mob, seconds }),
  getRespawns: () => ipcRenderer.invoke('get-respawns'),
  setSourceClass: (source, cls) => ipcRenderer.send('set-source-class', { source, cls }),
  getSourceClasses: () => ipcRenderer.invoke('get-source-classes'),
  learnPet: (name) => ipcRenderer.send('learn-pet', name),
  getPets: () => ipcRenderer.invoke('get-pets'),
  unlearnPet: (name) => ipcRenderer.send('unlearn-pet', name),
  learnSpellClass: (spell, cls) => ipcRenderer.send('learn-spell-class', { spell, cls }),
  getSpellClasses: () => ipcRenderer.invoke('get-spell-classes'),
  learnFadeLabel: (noun, spell) => ipcRenderer.send('learn-fade-label', { noun, spell }),
  getFadeLabels: () => ipcRenderer.invoke('get-fade-labels'),
  wikiSubmit: (payload) => ipcRenderer.invoke('wiki-submit', payload),
  appVersion: () => ipcRenderer.invoke('app-version'),
  onWikiSubmitProgress: (cb) => ipcRenderer.on('wiki-submit-progress', (_e, p) => cb(p)),
  setPhLinks: (zone, camp, phs) => ipcRenderer.send('set-ph-links', { zone, camp, phs }),
  getPhLinks: () => ipcRenderer.invoke('get-ph-links'),
  setPosQuest: (reward, state) => ipcRenderer.send('set-posquest', { reward, state }),
  setSpellQuest: (key, state) => ipcRenderer.send('set-spellquest', { key, state }),
  getSpellQuests: () => ipcRenderer.invoke('get-spellquests'),
  setItemVerdict: (item, verdict) => ipcRenderer.send('set-item-verdict', { item, verdict }),
  getItemVerdicts: () => ipcRenderer.invoke('get-item-verdicts'),
  setWishList: (list) => ipcRenderer.send('set-wishlist', list),
  getWishList: () => ipcRenderer.invoke('get-wishlist'),
  buildQuestIndex: (classes) => ipcRenderer.invoke('build-quest-index', classes),
  getQuestIndex: () => ipcRenderer.invoke('get-quest-index'),
  onQuestIndexProgress: (cb) => ipcRenderer.on('quest-index-progress', (_e, msg) => cb(msg)),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
  onAppUpdate: (cb) => ipcRenderer.on('app-update', (_e, r) => cb(r)),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_e, p) => cb(p)),
  getPosQuests: () => ipcRenderer.invoke('get-posquests'),
  importInventory: () => ipcRenderer.invoke('import-inventory'),
  chooseDataFolder: () => ipcRenderer.invoke('choose-data-folder'),
  dataDirStatus: () => ipcRenderer.invoke('data-dir-status'),
  onSharedReload: (cb) => ipcRenderer.on('shared-reload', () => cb()),
  getSyncFiles: () => ipcRenderer.invoke('get-sync-files'),
  addSyncFile: () => ipcRenderer.invoke('add-sync-file'),
  addSyncFolder: () => ipcRenderer.invoke('add-sync-folder'),
  getGameData: () => ipcRenderer.invoke('get-gamedata'),
  onGamedataUpdated: (cb) => ipcRenderer.on('gamedata-updated', (_e, s) => cb(s)),
  updateBis: () => ipcRenderer.invoke('update-bis'),
  getBisData: () => ipcRenderer.invoke('get-bisdata'),
  removeSyncFile: (p) => ipcRenderer.send('remove-sync-file', p),
  syncGameFiles: () => ipcRenderer.invoke('sync-game-files'),
  onGamefilesSynced: (cb) => ipcRenderer.on('gamefiles-synced', (_e, r) => cb(r)),
  onTestTab: (cb) => ipcRenderer.on('test-tab', (_e, tab) => cb(tab)),
  problemReport: () => ipcRenderer.invoke('problem-report'),
  closeApp: () => ipcRenderer.send('close-app')
};

// Since 2.7 the overlay's code is split into ui/*.js files that load one after
// another. An IPC reply or a main-process event must not reach the page while
// those files are still loading: a later file's functions wouldn't exist yet.
// (When it was one inline <script> that could never happen.) So on the
// overlay page, replies and events wait for DOMContentLoaded, which fires once
// every file has run. After that nothing is delayed.
const gated = /overlay\.html$/i.test((typeof location !== 'undefined' && location.pathname) || '');
if (gated) {
  // one queue for replies and events, so they still arrive in the order they came in
  let loaded = false;
  let queue = [];
  const later = (fn) => { if (loaded) fn(); else queue.push(fn); };
  window.addEventListener('DOMContentLoaded', () => {
    loaded = true;
    let chain = Promise.resolve();
    for (const fn of queue) chain = chain.then(fn);
    queue = null;
  }, { once: true });
  for (const [name, fn] of Object.entries(api)) {
    api[name] = /^on[A-Z]/.test(name)
      ? (cb) => fn((...a) => later(() => cb(...a)))
      : (...args) => {
          const r = fn(...args);
          if (loaded || !r || typeof r.then !== 'function') return r;
          return new Promise((resolve, reject) =>
            r.then((v) => later(() => resolve(v)), (e) => later(() => reject(e))));
        };
  }
}

contextBridge.exposeInMainWorld('overlay', api);
