// communityupload.js — 3.0: sends the local community data (communitydb.js) to the SEQO community
// server, only when the player said yes (settings.communityShare === true).
//
// The month files in userData\community are append-only, so what's been sent is just a byte offset
// per file (community\upload.json). Each run reads what's past that offset, up to the last complete
// line, and sends it in batches of ≤ 1,000 records / ~400 KB. A batch the server accepted moves the
// offset on; a network error or a busy server leaves it for the next run, so nothing is lost or sent
// twice. The first run after saying yes sends everything already collected (your old logs), then
// only what's new.
//
// What goes out: the records exactly as they are in the files (game facts only — see communitydb.js),
// the random install ID and the SEQO version. Nothing else: no character, account or Windows names,
// no file paths. The server keeps no IP address.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_RECORDS = 1000;
const MAX_BYTES = 400 * 1024;
const EVERY_MS = 10 * 60000;
const FIRST_MS = 60000;
const MAX_BATCHES_PER_RUN = 60;      // a first upload of old logs (~150 batches) spreads over a few runs

function create({ dir, getSettings, saveSettings, server, appVersion, flush = () => {}, fetchImpl = (...a) => fetch(...a), now = () => Date.now(), log = () => {} }) {
  const home = () => path.join(typeof dir === 'function' ? dir() : dir, 'community');
  const stateFile = () => path.join(home(), 'upload.json');
  let timer = null, running = false;

  function readState() {
    try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return { sent: {}, last: 0, lastRecords: 0, lastKinds: {}, error: '' }; }
  }
  function writeState(st) {
    try { fs.mkdirSync(home(), { recursive: true }); fs.writeFileSync(stateFile() + '.tmp', JSON.stringify(st)); fs.renameSync(stateFile() + '.tmp', stateFile()); }
    catch (e) { log('community upload: ' + e.message); }
  }
  function installId() {
    const s = getSettings();
    if (!s.communityInstall || !/^[0-9a-f-]{36}$/.test(s.communityInstall)) saveSettings({ communityInstall: crypto.randomUUID() });
    return getSettings().communityInstall;
  }
  // a new random ID: the server can't tell it's the same PC (what was sent stays sent)
  function resetId() { saveSettings({ communityInstall: crypto.randomUUID() }); return getSettings().communityInstall; }

  const monthFiles = () => {
    try { return fs.readdirSync(home()).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort(); } catch { return []; }
  };

  // what hasn't been sent yet: [{ file, start, end, records: [...] }] in order, as batches
  function pending(st, limitBatches = Infinity) {
    const out = [];
    for (const f of monthFiles()) {
      const p = path.join(home(), f);
      let size = 0;
      try { size = fs.statSync(p).size; } catch { continue; }
      let from = st.sent[f] || 0;
      if (from > size) from = 0;                     // the file was replaced: start it over
      if (from >= size) continue;
      const buf = Buffer.alloc(size - from);
      const fd = fs.openSync(p, 'r');
      try { fs.readSync(fd, buf, 0, buf.length, from); } finally { fs.closeSync(fd); }
      const lastNl = buf.lastIndexOf(10);
      if (lastNl < 0) continue;                      // only a half-written line so far
      let cur = { file: f, start: from, end: from, records: [], bytes: 0 };
      let pos = 0;
      while (pos <= lastNl) {
        const nl = buf.indexOf(10, pos);
        const line = buf.toString('utf8', pos, nl);
        const lineEnd = from + nl + 1;
        pos = nl + 1;
        if (!line) { cur.end = lineEnd; continue; }
        let r;
        try { r = JSON.parse(line); } catch { cur.end = lineEnd; continue; }
        if (cur.records.length >= MAX_RECORDS || cur.bytes + line.length > MAX_BYTES) {
          out.push(cur);
          if (out.length >= limitBatches) return out;
          cur = { file: f, start: cur.end, end: cur.end, records: [], bytes: 0 };
        }
        cur.records.push(r); cur.bytes += line.length + 1; cur.end = lineEnd;
      }
      if (cur.records.length || cur.end > cur.start) out.push(cur);
      if (out.length >= limitBatches) return out;
    }
    return out;
  }

  // one upload run; → { sent, records, error? }
  async function run({ force = false } = {}) {
    const s = getSettings();
    if (s.communityShare !== true || running) return { sent: 0, records: 0, skipped: true };
    running = true;
    try {
      try { flush(); } catch { /* still send what's on disk */ }
      const st = readState();
      if (!force && st.pausedUntil && now() < st.pausedUntil) return { sent: 0, records: 0, error: 'paused until tomorrow (daily limit)' };
      const install = installId();
      let sent = 0, records = 0;
      const kinds = {};
      for (const b of pending(st, MAX_BATCHES_PER_RUN)) {
        if (b.records.length) {
          let res;
          try {
            res = await fetchImpl(server + '/v1/batch', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ schema: 1, install, app: appVersion, records: b.records })
            });
          } catch (e) { st.error = 'offline — will try again'; writeState(st); return { sent, records, error: st.error }; }
          if (res.status === 429) { st.pausedUntil = now() + 6 * 3600e3; st.error = 'daily limit reached — continues later'; writeState(st); return { sent, records, error: st.error }; }
          // the server refused this one for what it is (malformed / too big): retrying can't help, and stopping
          // here would stall every upload after it — skip it, keep count, carry on
          if (res.status === 400 || res.status === 413) {
            st.rejected = (st.rejected || 0) + 1;
            st.error = st.rejected + ' upload' + (st.rejected === 1 ? '' : 's') + ' refused by the server (HTTP ' + res.status + ') and skipped';
            st.sent[b.file] = b.end; writeState(st);
            continue;
          }
          if (!res.ok) { st.error = 'server said ' + res.status; writeState(st); return { sent, records, error: st.error }; }
          sent++; records += b.records.length;
          for (const r of b.records) kinds[r.r] = (kinds[r.r] || 0) + 1;
        }
        st.sent[b.file] = b.end;                      // only after the server took it
        writeState(st);
      }
      if (sent) { st.last = now(); st.lastRecords = records; st.lastKinds = kinds; }
      if (!st.rejected || sent) st.error = st.rejected ? st.rejected + ' upload' + (st.rejected === 1 ? '' : 's') + ' refused by the server earlier and skipped' : '';
      delete st.pausedUntil;
      writeState(st);
      return { sent, records };
    } finally { running = false; }
  }

  // "See exactly what gets sent": the next batch, as it would go out
  function preview(maxRecords = 60) {
    const st = readState();
    const all = pending(st, 1000);
    const total = all.reduce((a, b) => a + b.records.length, 0);
    const kinds = {};
    for (const b of all) for (const r of b.records) kinds[r.r] = (kinds[r.r] || 0) + 1;
    const first = all.length ? all[0].records.slice(0, maxRecords) : [];
    return {
      server, total, batches: all.length, kinds,
      sample: JSON.stringify({ schema: 1, install: getSettings().communityInstall || '(made when you say yes)', app: appVersion, records: first }, null, 1)
    };
  }

  function status() {
    const st = readState();
    let left = 0;
    try { left = pending(st, 1000).reduce((a, b) => a + b.records.length, 0); } catch { /* ok */ }
    return { share: getSettings().communityShare, install: getSettings().communityInstall || '', last: st.last || 0, lastRecords: st.lastRecords || 0, lastKinds: st.lastKinds || {}, error: st.error || '', waiting: left };
  }

  function start() {
    stop();
    timer = setTimeout(function tick() { run().catch((e) => log('community upload: ' + e.message)).finally(() => { timer = setTimeout(tick, EVERY_MS); }); }, FIRST_MS);
  }
  function stop() { if (timer) { clearTimeout(timer); timer = null; } }

  return { run, preview, status, resetId, start, stop, pending: () => pending(readState()) };
}

module.exports = { create, MAX_RECORDS, MAX_BYTES };
