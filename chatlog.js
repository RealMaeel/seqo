// SEQO chat history: your personal messages (tells, group, guild, raid) kept
// across restarts so a tell that arrived mid-fight or while you were away is
// still there. Public channels and says are session-only (renderer memory).
// Local profile only. create({ dir }) -> { list, add, clear, flush }
'use strict';
const fs = require('fs');
const path = require('path');
const MAX = 1500;
const KEEP = new Set(['tell', 'group', 'guild', 'raid']);

function create({ dir }) {
  const file = () => path.join(dir(), 'chatlog.json');
  let msgs = null, timer = null;
  function load() {
    if (msgs) return msgs;
    try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); msgs = Array.isArray(j.msgs) ? j.msgs : []; } catch { msgs = []; }
    return msgs;
  }
  function flush() {
    clearTimeout(timer); timer = null;
    if (!msgs) return;
    try { const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ v: 1, msgs })); fs.renameSync(tmp, file()); }
    catch (e) { console.error('chatlog save failed:', e.message); }
  }
  function add(batch) {
    const all = load();
    let n = 0;
    for (const m of batch || []) {
      if (!m || !KEEP.has(m.channel) || typeof m.text !== 'string') continue;
      all.push({ t: +m.t || Date.now(), channel: m.channel, from: String(m.from || '').slice(0, 64),
                 to: m.to ? String(m.to).slice(0, 64) : undefined, text: m.text.slice(0, 1000), char: m.char ? String(m.char).slice(0, 64) : undefined });
      n++;
    }
    if (all.length > MAX) all.splice(0, all.length - MAX);
    if (n) { clearTimeout(timer); timer = setTimeout(flush, 2000); }
    return n;
  }
  function list() { return load().slice(); }
  function clear() { msgs = []; flush(); }
  return { list, add, clear, flush };
}
module.exports = { create, MAX };
