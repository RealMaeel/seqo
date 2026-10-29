// SEQO - the loot database: kills, drops and combat notes per zone+mob (main process).
// Extracted from main.js in v2.7 with the code unchanged; main.js wires it up
// and keeps the IPC handlers.
// ---------------------------------------------------------------------------
// Loot database (persistent drop tracking per mob)
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const safestore = require('./safestore.js');

// deps: dataDir() -> data folder (local or the shared one), getWin() -> overlay or null,
//       noteWrite() -> tells main.js a database was just written, so the shared-folder
//       watcher doesn't mistake SEQO's own save for a sync from another PC
//       backupDir() -> SEQO's own folder on this PC for backups (2.7.2), shared() -> true when
//       dataDir is a shared (Drive/Dropbox) folder, log(msg) -> the error log
// 2.7.2: loading and saving go through safestore.js — a file that couldn't be read is never
// saved over (see the Oct 28 note there).
function create({ dataDir, getWin, noteWrite, backupDir = dataDir, shared = () => false, log = () => {} }) {
  const lootDbPath = () => path.join(dataDir(), 'lootdb.json');
  const store = safestore.create({
    name: 'lootdb', file: lootDbPath,
    backupDir: () => path.join(backupDir(), 'backups'),
    createDir: () => !shared()
  });
  let lootDB = { mobs: {} };
  let lootSaveTimer = null;
  // 2.7.2: what this session recorded since the last save, so it can be re-applied to a newer file
  const journal = [];
  let replaying = false;
  const note = (fn, args) => { if (!replaying) journal.push([fn, args]); };

  // startup: the file, or (if it can't be read yet) an empty one with saves held until it can
  // reload (the shared folder changed on disk): the file, or keep what's in memory → true if reloaded
  function loadLootDB({ reload = false } = {}) {
    if (reload) {
      const r = store.read();
      if (r.state !== 'ok') { log('lootdb: reload skipped (' + r.state + ')'); return false; }
      lootDB = r.data;
      tidy();
      // anything this session recorded but hadn't saved yet goes on top of the new copy
      if (journal.length) {
        replaying = true;
        try { for (const [fn, args] of journal) api[fn](...args); } finally { replaying = false; }
      }
    } else {
      const g = safestore.loadGuarded(store, {
        fresh: () => ({ mobs: {} }),
        missingGraceMs: shared() ? 120000 : 0,
        log,
        onRecovered: (data) => {
          lootDB = safestore.mergeLoot(data, lootDB);
          tidy();
          saveLootDBSoon(); pushLootDBSoon();
        }
      });
      lootDB = g.data;
      if (g.state === 'ok') store.dailyBackup();
    }
    tidy();
    return true;
  }

  function tidy() {
    if (!lootDB || typeof lootDB !== 'object') lootDB = { mobs: {} };
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

  function saveLootDBSoon() {
    clearTimeout(lootSaveTimer);
    lootSaveTimer = setTimeout(() => {
      try {
        noteWrite();
        let r = store.write(JSON.stringify(lootDB));
        if (r.conflict) {
          // someone else changed the file since we read it (Drive synced another PC, a restore):
          // take theirs and re-apply only what this session recorded since its last save
          const d = store.read();
          if (d.state !== 'ok') { log('lootdb: file changed and can\'t be read — save held'); return; }
          lootDB = d.data; tidy();
          replaying = true;
          try { for (const [fn, args] of journal) api[fn](...args); } finally { replaying = false; }
          clearTimeout(lootSaveTimer);
          log('lootdb: file changed on disk — merged ' + journal.length + ' new change(s) into it');
          noteWrite();
          r = store.write(JSON.stringify(lootDB));
          pushLootDBSoon();
        }
        if (r.ok) journal.length = 0;
        if (!r.ok) log('lootdb: save held — ' + (r.skipped || 'file changed'));
        else if (r.backup) log('lootdb: saved much smaller than before; old copy kept at ' + r.backup);
      } catch (e) { log('lootdb: save failed — ' + (e.message || e)); }
    }, 1000);
  }

  let lootPushTimer = null;
  function pushLootDBSoon() {
    clearTimeout(lootPushTimer);
    lootPushTimer = setTimeout(() => { const win = getWin(); if (win) win.webContents.send('loot-db', lootDB); }, 400);
  }

  const mobKey = (name) => name.replace(/^(A|An|The) /, (m) => m.toLowerCase());

  // kills and drops are keyed per zone+mob: the same mob name can have
  // different loot tables in different zones, and the wiki wants zone data
  function lootEntry(mob, zone) {
    const k = (zone || '') + '|' + mobKey(mob);
    return lootDB.mobs[k] ||
      (lootDB.mobs[k] = { name: mobKey(mob), zone: zone || '', kills: 0, drops: {} });
  }

  // kills, drops and combat notes as the overlay reports them (main.js's IPC handlers call these)
  // each kill (2.7): when it happened and how long it took — the last KILL_TIMES_MAX
  // per zone+mob, oldest first, as { t: ms, s: seconds to kill (or absent) }
  const KILL_TIMES_MAX = 50;
  const asKill = (k) => (typeof k === 'number' ? { t: k } : k);
  const known = (c) => (String(c).match(/(?:^|\/)[A-Z]{3}(?=\/|$)/g) || []).length;
  // d (2.7) = difficulty tier 0-4 of the zone copy it died in
  // c (2.7) = your class makeup then ("RNG/SHD/BRD", or "SHD/BRD/?" when only partly known), g = 1 in a group / 0 solo
  function noteKillTime(m, when, secs, d, extra) {
    if (!(when > 0)) return;
    const a = (m.killTimes || (m.killTimes = [])).map(asKill);
    const k = { t: when };
    if (secs != null && secs >= 0) k.s = secs;
    if (Number.isInteger(d) && d >= 0 && d <= 4) k.d = d;
    if (extra && typeof extra.c === 'string' && extra.c) k.c = extra.c.slice(0, 40);
    if (extra && (extra.g === 0 || extra.g === 1)) k.g = extra.g;
    const i = a.findIndex((x) => x.t === when);
    if (i >= 0) {
      for (const f of ['s', 'd', 'g']) if (k[f] != null && a[i][f] == null) a[i] = { ...a[i], [f]: k[f] };
      // a guess is replaced by a better one (exact, or more classes known), never the other way round
      if (k.c && (!a[i].c || (a[i].c.includes('?') && known(k.c) > known(a[i].c)))) a[i] = { ...a[i], c: k.c };
    }
    else { a.push(k); a.sort((x, y) => x.t - y.t); }
    m.killTimes = a.slice(-KILL_TIMES_MAX);
  }

  function recordKill(mob, zone, when, secs, tier, extra) {
    note('recordKill', [mob, zone, when, secs, tier, extra]);
    const m = lootEntry(mob, zone);
    m.kills += 1;
    noteKillTime(m, when, secs, tier, extra);
    saveLootDBSoon(); pushLootDBSoon();
  }

  // kill times found in old logs (📥 Old logs): merged into mobs you already have
  // kill records for — they never change kill counts or create new entries.
  // list: [{ mob, zone, times: [ms or { t, s, d }…] }]; returns how many new times were added
  // (a time to kill or a tier filled in on a kill already there saves too, but isn't counted)
  function addKillTimes(list) {
    note('addKillTimes', [list]);
    let added = 0, changed = false;
    for (const k of list || []) {
      const m = lootDB.mobs[(k.zone || '') + '|' + mobKey(k.mob || '')];
      if (!m || !m.kills) continue;
      const was = JSON.stringify(m.killTimes || []);
      const before = new Set((m.killTimes || []).map((x) => asKill(x).t));
      for (const x of k.times || []) { const v = asKill(x); if (v && v.t > 0) noteKillTime(m, v.t, v.s, v.d, v); }
      for (const x of m.killTimes || []) if (!before.has(x.t)) added++;
      if (JSON.stringify(m.killTimes || []) !== was) changed = true;
    }
    if (changed) { saveLootDBSoon(); pushLootDBSoon(); }
    return added;
  }

  // the newest kill time in the records (2.7.2: where a first log catch-up starts)
  function newestKillTime() {
    let t = 0;
    for (const m of Object.values(lootDB.mobs)) for (const k of m.killTimes || []) { const x = asKill(k).t; if (x > t) t = x; }
    return t;
  }

  // is a kill of this mob at exactly this time already recorded? (2.7.2: log catch-up)
  function hasKillAt(mob, zone, when) {
    const m = lootDB.mobs[(zone || '') + '|' + mobKey(mob)];
    return !!(m && (m.killTimes || []).some((k) => asKill(k).t === when));
  }

  function recordDrop(mob, item, zone) {
    note('recordDrop', [mob, item, zone]);
    const m = lootEntry(mob, zone);
    const d = m.drops[item] || (m.drops[item] = { name: item, count: 0 });
    d.count += 1;
    saveLootDBSoon(); pushLootDBSoon();
  }

  // batched mob combat observations: max melee hit, hit counts, casts seen
  function recordMobStats(entries) {
    note('recordMobStats', [entries]);
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
  }

  const api = {
    get db() { return lootDB; },          // loadLootDB() replaces the object: always read it through here
    lootDbPath, loadLootDB, savesHeld: () => store.blockedWhy(), saveLootDBSoon, pushLootDBSoon, mobKey, lootEntry,
    recordKill, recordDrop, recordMobStats, addKillTimes, hasKillAt, newestKillTime
  };
  return api;
}

module.exports = { create };
