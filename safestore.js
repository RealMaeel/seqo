// SEQO — reading and writing the shared databases safely (2.7.2).
//
// What went wrong (Ed, Oct 28 2026): lootdb.json and gamedb.json live in a Google Drive
// folder. SEQO read one while Drive wasn't ready (or was mid-sync), got an error, started
// with an EMPTY database — and its next save wrote that empty database over months of data.
//
// Rules now:
//   • a file that exists but can't be read is never overwritten: writes are held, and the
//     read is retried until it works (then your new data is merged in and saved)
//   • a folder that isn't there (Drive not mounted yet) is never created or written to
//   • a reload that fails keeps what's in memory — it never swaps in an empty database
//   • a save that would shrink a big file to less than half first copies the old file to a
//     backup; writes go to a temp file first and are renamed into place
//   • one backup per day of each file in SEQO's own folder on this PC (last 7 kept)
// Main process only. create({ name, file(), backupDir(), createDir(), now() })

const fs = require('fs');
const path = require('path');

const SHRINK_MIN_BYTES = 50 * 1024;   // only big files get the shrink check
const KEEP_SHRINK_BACKUPS = 10, KEEP_DAILY = 7;

function create({ name, file, backupDir, createDir = () => false, now = () => Date.now() }) {
  let blocked = null;   // why writes are held, or null
  // the file's mtime as SEQO last read or wrote it: a different one at save time means something
  // else (Drive syncing another PC's copy, a restore) changed it — never save blindly over that
  let known = null;
  const mtimeOf = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return null; } };

  // → { state: 'ok', data } | { state: 'missing' } | { state: 'nodir' } | { state: 'unreadable', error }
  function read() {
    const p = file();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) return { state: 'nodir' };
    if (!fs.existsSync(p)) return { state: 'missing' };
    try {
      const text = fs.readFileSync(p, 'utf8');
      if (!text.trim()) return { state: 'unreadable', error: 'empty file' };
      const data = JSON.parse(text);
      known = mtimeOf(p);
      return { state: 'ok', data };
    } catch (e) { return { state: 'unreadable', error: e.message || String(e) }; }
  }

  const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  function prune(dir, prefix, keep) {
    try {
      const old = fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort();
      for (const f of old.slice(0, Math.max(0, old.length - keep))) fs.unlinkSync(path.join(dir, f));
    } catch { /* ok */ }
  }
  function backupTo(kind, keep) {
    try {
      const dir = backupDir();
      fs.mkdirSync(dir, { recursive: true });
      const dst = path.join(dir, name + '.' + kind + '-' + stamp(now()) + '.json');
      fs.copyFileSync(file(), dst);
      prune(dir, name + '.' + kind + '-', keep);
      return dst;
    } catch { return null; }
  }

  // text = the JSON to save → { ok, skipped?, backup? } | { ok: false, conflict: true } when the
  // file changed on disk since SEQO last read/wrote it (read() it, merge, write again)
  function write(text, { force = false } = {}) {
    if (blocked) return { ok: false, skipped: blocked };
    const p = file();
    const cur = mtimeOf(p);
    if (!force && known != null && cur != null && cur !== known) return { ok: false, conflict: true };
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      if (!createDir()) return { ok: false, skipped: 'folder not there: ' + dir };
      fs.mkdirSync(dir, { recursive: true });
    }
    let backup = null;
    try {
      const size = fs.statSync(p).size;
      if (size >= SHRINK_MIN_BYTES && Buffer.byteLength(text) < size / 2) backup = backupTo('before-shrink', KEEP_SHRINK_BACKUPS);
    } catch { /* no file yet */ }
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, text);
    try { fs.renameSync(tmp, p); }
    catch { fs.copyFileSync(tmp, p); try { fs.unlinkSync(tmp); } catch { /* ok */ } }   // some sync folders refuse rename-over
    known = mtimeOf(p);
    return { ok: true, backup };
  }

  // one copy a day in SEQO's own folder (cheap insurance against anything else)
  function dailyBackup() {
    try {
      const dir = backupDir();
      const day = new Date(now()).toISOString().slice(0, 10);
      const dst = path.join(dir, name + '.daily-' + day + '.json');
      if (fs.existsSync(dst) || !fs.existsSync(file())) return null;
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(file(), dst);
      prune(dir, name + '.daily-', KEEP_DAILY);
      return dst;
    } catch { return null; }
  }

  return {
    name, read, write, dailyBackup,
    block(why) { blocked = why || 'held'; },
    unblock() { blocked = null; },
    blockedWhy: () => blocked
  };
}

// load at startup: ok → the data; missing → a fresh one (writes allowed — but in a shared
// folder, missingGraceMs > 0 holds writes that long first, in case Drive just hasn't
// produced the file yet); nodir / unreadable → a fresh one in memory, writes HELD, and the
// read retried every retryMs until it works. Then onRecovered(loadedDataOrNull) — the caller
// merges what it recorded meanwhile and saves.   → { data, state }
function loadGuarded(store, { fresh, onRecovered, retryMs = 15000, missingGraceMs = 0, log = () => {}, now = () => Date.now() }) {
  const r = store.read();
  if (r.state === 'ok') return { data: r.data, state: 'ok' };
  if (r.state === 'missing' && !missingGraceMs) return { data: fresh(), state: 'missing' };
  store.block(r.state === 'nodir' ? 'data folder not available'
    : r.state === 'missing' ? 'file not there yet' : 'file unreadable: ' + r.error);
  log(store.name + ': holding saves: ' + store.blockedWhy());
  const since = now();
  const timer = setInterval(() => {
    const again = store.read();
    const ok = again.state === 'ok';
    // a missing file is accepted after the grace period; a missing FOLDER or a broken file never is
    const giveUp = again.state === 'missing' && (!missingGraceMs || now() - since >= missingGraceMs);
    if (!ok && !giveUp) return;
    clearInterval(timer);
    store.unblock();
    log(store.name + ': ' + (ok ? 'file readable again — merging and saving' : 'no file — starting it'));
    onRecovered(ok ? again.data : null);
  }, retryMs);
  if (timer.unref) timer.unref();
  return { data: fresh(), state: r.state, timer };
}

// ── merges: what was recorded while the file couldn't be read goes on top of the file ──

// loot: add kills (minus any kill whose time the file already has), drop counts and hit
// totals; union kill times and spells; the latest /con level wins
function mergeLoot(disk, mem) {
  const out = disk && disk.mobs ? disk : { mobs: {} };
  const tOf = (k) => (typeof k === 'number' ? k : k && k.t);
  for (const [key, m] of Object.entries((mem && mem.mobs) || {})) {
    const d = out.mobs[key];
    if (!d) { out.mobs[key] = m; continue; }
    const have = new Set((d.killTimes || []).map(tOf));
    const memTimes = (m.killTimes || []);
    const dup = memTimes.filter((k) => have.has(tOf(k))).length;
    d.kills = (d.kills || 0) + Math.max(0, (m.kills || 0) - dup);
    const times = (d.killTimes || []).concat(memTimes.filter((k) => !have.has(tOf(k))));
    times.sort((a, b) => tOf(a) - tOf(b));
    if (times.length) d.killTimes = times.slice(-50);
    d.drops = d.drops || {};
    for (const [n, x] of Object.entries(m.drops || {})) {
      const dd = d.drops[n] || (d.drops[n] = { name: x.name || n, count: 0 });
      dd.count += x.count || 0;
    }
    if (m.maxHit) d.maxHit = Math.max(d.maxHit || 0, m.maxHit);
    if (m.hitCount) d.hitCount = (d.hitCount || 0) + m.hitCount;
    if (m.hitTotal) d.hitTotal = (d.hitTotal || 0) + m.hitTotal;
    if (m.level) d.level = m.level;
    if (m.spells && m.spells.length) d.spells = [...new Set([...(d.spells || []), ...m.spells])].slice(0, 25);
    for (const [f, v] of Object.entries(m)) if (d[f] === undefined) d[f] = v;
  }
  return out;
}

// game data: section by section, entries learned since (in memory) win over the file's
function mergeGame(disk, mem) {
  const out = disk && typeof disk === 'object' ? disk : {};
  for (const [sec, v] of Object.entries(mem || {})) {
    const d = out[sec];
    if (v && typeof v === 'object' && !Array.isArray(v) && d && typeof d === 'object' && !Array.isArray(d)) Object.assign(d, v);
    else if (d === undefined || (v !== undefined && !(Array.isArray(v) && !v.length) && !(v && typeof v === 'object' && !Object.keys(v).length))) out[sec] = v;
  }
  return out;
}

module.exports = { create, loadGuarded, mergeLoot, mergeGame };
