// SEQO - error log + problem report (main process, v2.7).
// Errors from the main process and from SEQO's own windows are kept in
// <userData>/seqo-errors.log (one JSON object per line, last few hundred only),
// so a player can hand the author a "📋 Copy problem report" instead of
// "it's broken". The report never contains passwords, notes or the Windows
// user folder; the game log's file name stays (it says which character).

const fs = require('fs');
const path = require('path');

const MAX_KEEP = 300;          // entries kept on disk / in memory
const MAX_TEXT = 1500;         // chars per message / stack

// settings that are never included, whatever their value
const PRIVATE_KEYS = new Set(['wikiPass', 'wikiPassEnc', 'wikiUser', 'text', 'buffWatch', 'spellTimers', 'bounds']);

function clip(s, n = MAX_TEXT) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// C:\Users\Ed\... -> %USERPROFILE%\...  (also forward-slash and file:/// forms)
function redact(text, home) {
  let t = String(text == null ? '' : text);
  if (home) {
    const variants = new Set([home, home.replace(/\\/g, '/'), encodeURI(home.replace(/\\/g, '/'))]);
    for (const v of variants) {
      if (!v) continue;
      const re = new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      t = t.replace(re, '%USERPROFILE%');
    }
  }
  return t;
}

// Which SEQO file an error came from (v2.7): the first stack frame (or console
// source) inside SEQO itself — "ui/overlay/24-meter.js:120 (renderTargetChips)",
// "lootdb.js:88". Electron/Node internals and node_modules are skipped, so the
// report points straight at the module to look at.
function moduleOf(detail, appDir) {
  const text = String(detail || '');
  if (!text) return '';
  const root = appDir ? String(appDir).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : '';
  for (const line of text.split('\n')) {
    const re = /([^\s()'"]+?\.(?:js|html)):(\d+)(?::\d+)?/g;
    let m;
    while ((m = re.exec(line))) {
      let p = m[1];
      try { p = decodeURI(p); } catch { /* keep as is */ }
      p = p.replace(/^file:\/+/i, '').replace(/\\/g, '/');
      if (/node_modules|^node:|^internal\/|electron\/js2c|^electron[/:]|<anonymous>/i.test(p)) continue;
      let rel = '';
      const low = p.toLowerCase();
      const asar = low.lastIndexOf('/app.asar/');
      if (asar >= 0) rel = p.slice(asar + 10);
      else if (root && low.startsWith(root + '/')) rel = p.slice(root.length + 1);
      else if (/\/ui\//i.test(p)) rel = p.slice(low.lastIndexOf('/ui/') + 1);
      else rel = p.split('/').pop();
      if (!rel) continue;
      const fn = /\bat\s+(?:async\s+)?([\w$.<>]+)\s+\(/.exec(line);
      return rel + ':' + m[2] + (fn && fn[1] !== '<anonymous>' && fn[1] !== 'Object.<anonymous>' ? ' (' + fn[1] + ')' : '');
    }
  }
  return '';
}

function summarizeSettings(s, home) {
  const out = {};
  for (const [k, v] of Object.entries(s || {})) {
    if (PRIVATE_KEYS.has(k) || /pass|token|secret/i.test(k)) continue;
    if (Array.isArray(v)) out[k] = '[' + v.length + ' items]';
    else if (v && typeof v === 'object') out[k] = '{' + Object.keys(v).length + ' keys}';
    else if (typeof v === 'string') out[k] = clip(redact(v, home), 120);
    else out[k] = v;
  }
  return out;
}

function create({ dir, home = '', now = () => Date.now(), appDir = '' }) {
  const file = () => path.join(dir(), 'seqo-errors.log');
  let entries = null;
  let pending = null;            // debounced rewrite after repeat counts change

  function load() {
    if (entries) return entries;
    entries = [];
    try {
      for (const line of fs.readFileSync(file(), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { entries.push(JSON.parse(line)); } catch { /* skip a torn line */ }
      }
    } catch { /* no log yet */ }
    if (entries.length > MAX_KEEP) { entries = entries.slice(-MAX_KEEP); rewrite(); }
    return entries;
  }

  function rewrite() {
    try { fs.writeFileSync(file(), entries.map(e => JSON.stringify(e)).join('\n') + '\n'); } catch { /* ok */ }
  }

  // source: 'main' | 'overlay' | 'dock' | 'needs' | ...; message: text; detail: stack / where
  function record(source, message, detail) {
    load();
    const e = { t: now(), src: String(source || '?'), msg: clip(redact(message, home)), at: detail ? clip(redact(detail, home)) : undefined };
    const mod = moduleOf(detail, appDir);
    if (mod) e.mod = mod;
    const last = entries[entries.length - 1];
    // the same error over and over (a render loop) is one entry with a count
    if (last && last.src === e.src && last.msg === e.msg && last.at === e.at && e.t - (last.last || last.t) < 60000) {
      last.n = (last.n || 1) + 1; last.last = e.t;
      if (!pending) {
        pending = setTimeout(flush, 2000);
        if (pending.unref) pending.unref();
      }
      return last;
    }
    entries.push(e);
    try { fs.mkdirSync(dir(), { recursive: true }); fs.appendFileSync(file(), JSON.stringify(e) + '\n'); } catch { /* ok */ }
    if (entries.length > MAX_KEEP + 50) { entries = entries.slice(-MAX_KEEP); rewrite(); }
    return e;
  }

  function flush() {
    if (pending) { clearTimeout(pending); pending = null; }
    if (entries) rewrite();
  }

  function recent(n = 40) { return load().slice(-n); }

  function clear() { if (pending) { clearTimeout(pending); pending = null; } entries = []; try { fs.unlinkSync(file()); } catch { /* ok */ } }

  // info: { version, electron, chrome, node, os, locale, settings, extras: {label: value} }
  function buildReport(info = {}) {
    const fmtT = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
    const L = [];
    L.push('SEQO problem report — ' + fmtT(now()) + ' UTC');
    L.push('SEQO ' + (info.version || '?') + ' · Electron ' + (info.electron || '?') + ' · Chrome ' + (info.chrome || '?') +
           ' · Node ' + (info.node || '?'));
    if (info.os) L.push('Windows: ' + info.os + (info.locale ? ' · ' + info.locale : ''));
    for (const [k, v] of Object.entries(info.extras || {})) L.push(k + ': ' + redact(v, home));
    L.push('');
    const errs = recent(40);
    // where to look first: errors per SEQO file (counting repeats)
    const byMod = new Map();
    for (const e of errs) {
      const k = e.src + ' · ' + (e.mod ? e.mod.replace(/:\d+.*$/, '') : 'file unknown');
      byMod.set(k, (byMod.get(k) || 0) + (e.n || 1));
    }
    if (byMod.size) {
      L.push('Errors by module:');
      for (const [k, n] of [...byMod].sort((a, b) => b[1] - a[1])) L.push('  ' + k + '  ×' + n);
      L.push('');
    }
    L.push('Recent errors (' + errs.length + (load().length > errs.length ? ' of ' + load().length : '') + '):');
    if (!errs.length) L.push('  none recorded');
    for (const e of errs) {
      L.push('  [' + fmtT(e.t) + '] ' + e.src + (e.mod ? ' · ' + e.mod : '') + ': ' + e.msg + (e.n > 1 ? '  (×' + e.n + ', last ' + fmtT(e.last) + ')' : ''));
      if (e.at) L.push('      ' + e.at.split('\n').slice(0, 6).join('\n      '));
    }
    L.push('');
    L.push('Settings (passwords, notes and paths to your user folder left out):');
    const s = summarizeSettings(info.settings, home);
    const raw = info.settings || {};
    for (const [k, v] of Object.entries(s))
      L.push('  ' + k + ' = ' + (typeof raw[k] === 'string' ? JSON.stringify(v) : String(v)));
    return L.join('\n');
  }

  return { record, recent, flush, clear, buildReport, file };
}

module.exports = { create, redact, summarizeSettings, moduleOf };
