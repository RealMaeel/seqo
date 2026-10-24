// SEQO - game file sync (main process).
// Extracted from main.js in v2.6 with the code unchanged; main.js wires it up.
// Synced game files: user-chosen files (character loadouts like
// Maeel_neriak_LO1.ini, UI layouts, etc.) mirrored through the shared folder.
// Newest copy wins; the overwritten side gets a .seqo.bak backup first.
// Local paths are per-machine (installs differ); the shared side is keyed
// by filename under <dataDir>/gamefiles/.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// deps: getSettings() -> current settings object (main.js replaces it on every
//       update, so never cache it), saveSettings(s), dataDir() -> data folder,
//       getWin() -> overlay window or null
function create({ getSettings, saveSettings, dataDir, getWin }) {
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
    if (!getSettings().dataDir) return { error: 'Set a shared data folder first' };
    const results = [];
    try { fs.mkdirSync(gamefilesDir(), { recursive: true }); } catch (e) { return { error: e.message }; }
    for (const local of getSettings().syncFiles || []) {
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
    getSettings().lastSync = summary;
    saveSettings(getSettings());
    try { fs.writeFileSync(markerPath, JSON.stringify({ host, at: Date.now() })); } catch { /* read-only share */ }
    return { results, summary };
  }

  let gamefileWatchers = [];
  function watchGameFiles() {
    for (const p of gamefileWatchers) fs.unwatchFile(p);
    gamefileWatchers = [];
    if (!getSettings().dataDir) return;
    for (const local of getSettings().syncFiles || []) {
      const shared = path.join(gamefilesDir(), path.basename(local));
      gamefileWatchers.push(shared);
      fs.watchFile(shared, { interval: 5000 }, (curr, prev) => {
        if (curr.mtimeMs === prev.mtimeMs) return;
        const res = syncGameFiles();
        const win = getWin();
        if (win && res.results) win.webContents.send('gamefiles-synced', res);
      });
    }
  }

  return { syncGameFiles, watchGameFiles, gamefilesDir, syncOnePair, listFilesRel };
}

module.exports = { create };
