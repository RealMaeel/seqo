// SEQO — catch up on what happened while SEQO was closed (2.7.2).
//
// SEQO tails the log from its END when it starts, so kills and loot from a play session
// without SEQO running were never counted. Now SEQO remembers the time of the last log line
// it read (per log file, in userData/logpos.json — logs are per PC, so this stays local),
// and at the next start it reads everything after that — the current log up to where the
// live tail begins, plus Logs\archive\<log name>-*.txt files written since (SEQO's own
// "clear log on exit" archives) — and records kills and drops exactly like the live overlay:
// every death that isn't yours, in the zone you were in; loot to the named corpse, or to the
// last kill within 2 minutes. A kill already in the database at that exact time is skipped.
// The very first start for a log replays from just after the newest kill in the loot records
// (if within a week); with no recent kill it only starts the clock.
// Main process only.  create({ parser, lootStore, tierNum, cleanZone, file, now })
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const STAMP = /^\[(\w{3} \w{3} +\d+ \d\d:\d\d:\d\d \d{4})\]/;
function lineTime(raw) {
  const m = STAMP.exec(raw);
  if (!m) return 0;
  const t = Date.parse(m[1]);
  return isNaN(t) ? 0 : t;
}

function create({ parser, lootStore, tierNum, cleanZone, file, now = () => Date.now(), saveDelayMs = 10000 }) {
  let pos = null, timer = null;
  const keyOf = (p) => path.resolve(String(p)).toLowerCase();
  function load() {
    if (pos) return pos;
    try { pos = JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch { pos = {}; }
    return pos;
  }
  function flush() {
    clearTimeout(timer); timer = null;
    if (!pos) return;
    try { fs.writeFileSync(file(), JSON.stringify(pos)); } catch { /* next time */ }
  }
  const saveSoon = () => { if (!timer) { timer = setTimeout(flush, saveDelayMs); if (timer.unref) timer.unref(); } };
  const lastSeen = (logPath) => load()[keyOf(logPath)] || 0;
  function mark(logPath, t) {
    const k = keyOf(logPath);
    if (t > (load()[k] || 0)) { pos[k] = t; saveSoon(); }
  }

  // the live tail read these lines: remember how far SEQO got
  function seen(logPath, lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lineTime(lines[i]);
      if (t) { mark(logPath, t); return; }
    }
  }

  // archived copies of this log changed since `since`, oldest first, then the log itself
  function sources(logPath, since) {
    const dir = path.join(path.dirname(logPath), 'archive');
    const stem = path.basename(logPath, path.extname(logPath)).toLowerCase() + '-';
    let arch = [];
    try {
      arch = fs.readdirSync(dir)
        .filter((f) => f.toLowerCase().startsWith(stem) && /\.txt$/i.test(f))
        .map((f) => { const p = path.join(dir, f); try { return { p, mtime: fs.statSync(p).mtimeMs }; } catch { return null; } })
        .filter((x) => x && x.mtime >= since)
        .sort((a, b) => a.mtime - b.mtime);
    } catch { /* no archive folder */ }
    return arch.map((x) => ({ p: x.p })).concat([{ p: logPath, current: true }]);
  }

  // where you were when the catch-up starts: the last "You have entered" line in the newest
  // archived copy from BEFORE the catch-up point (its tail is enough), or ''
  function zoneBefore(logPath, since) {
    const dir = path.join(path.dirname(logPath), 'archive');
    const stem = path.basename(logPath, path.extname(logPath)).toLowerCase() + '-';
    try {
      const prev = fs.readdirSync(dir)
        .filter((f) => f.toLowerCase().startsWith(stem) && /\.txt$/i.test(f))
        .map((f) => { const p = path.join(dir, f); try { return { p, mtime: fs.statSync(p).mtimeMs }; } catch { return null; } })
        .filter((x) => x && x.mtime < since)
        .sort((a, b) => b.mtime - a.mtime)[0];
      if (!prev) return { zone: '', variant: '' };
      const size = fs.statSync(prev.p).size, len = Math.min(size, 4 * 1024 * 1024);
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(prev.p, 'r');
      try { fs.readSync(fd, buf, 0, len, size - len); } finally { fs.closeSync(fd); }
      const lines = buf.toString('latin1').split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('You have entered')) continue;
        const ev = parser.parseLine(lines[i]);
        if (ev && ev.type === 'zone') return { zone: cleanZone(ev.zone), variant: ev.variant || '' };
      }
    } catch { /* none */ }
    return { zone: '', variant: '' };
  }

  // → null (first start for this log: clock started) | { kills, drops, files, from, to }
  async function catchUp(logPath, endOffset) {
    let since = lastSeen(logPath);
    if (!since) {
      // first start for this log: begin just after the newest kill in your records (+3 min, so
      // that kill's own loot isn't counted twice), if that's within a week — else just start the clock
      const newest = lootStore.newestKillTime ? lootStore.newestKillTime() : 0;
      if (!newest || now() - newest > 7 * 864e5) { mark(logPath, now()); flush(); return null; }
      since = newest + 3 * 60000;
    }
    const tracker = new parser.FightTracker();
    let { zone, variant } = zoneBefore(logPath, since);
    const sameSecond = new Set();
    let lastCorpse = null, kills = 0, drops = 0, newest = since, files = 0;
    for (const src of sources(logPath, since)) {
      let stream;
      try {
        if (src.current && !(endOffset > 0)) continue;
        stream = fs.createReadStream(src.p, src.current ? { start: 0, end: endOffset - 1, encoding: 'latin1' } : { encoding: 'latin1' });
      } catch { continue; }
      files++;
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      for await (const raw of rl) {
        const t = lineTime(raw);
        if (!t) continue;
        // before the catch-up point only the zone matters (cheap: no full parse)
        if (t <= since && !raw.includes('You have entered')) continue;
        const ev = parser.parseLine(raw);
        if (!ev || !ev.when) continue;
        if (ev.type === 'zone') { zone = cleanZone(ev.zone); variant = ev.variant || ''; }
        tracker.feed(ev);
        if (ev.when <= since) continue;
        if (ev.when > newest) newest = ev.when;
        if (ev.type === 'death' && ev.target !== parser.YOU && zone) {
          // a kill already in the database at that exact second is skipped — but two mobs of the
          // same name dying in the same second are two kills
          const k = zone + '|' + ev.target + '|' + ev.when;
          const again = sameSecond.has(k);
          sameSecond.add(k);
          if (again || !lootStore.hasKillAt(ev.target, zone, ev.when)) {
            lootStore.recordKill(ev.target, zone, ev.when, tracker.engagedSecs(ev.target, ev.when), tierNum(variant),
              { g: tracker.othersInFight().length ? 1 : 0 });
            kills++;
          }
          lastCorpse = { mob: ev.target, when: ev.when };
        } else if (ev.type === 'loot') {
          let mob = ev.mob;
          if (!mob && lastCorpse && ev.when - lastCorpse.when < 120000) mob = lastCorpse.mob;
          if (mob && zone) { lootStore.recordDrop(mob, ev.item, zone); drops++; }
        }
      }
    }
    mark(logPath, newest);
    flush();
    return { kills, drops, files, from: since, to: newest };
  }

  return { catchUp, seen, flush, lastSeen, lineTime };
}

module.exports = { create, lineTime };
