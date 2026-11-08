// communitydb.js — 2.7.5: the local community data store.
//
// Everything SEQO sees in the log that a shared (community) database would want is written here
// as it happens — the same code reads the live log, the catch-up after SEQO was closed, and
// 📥 Old logs, so all three give the same records:
//   kills, drops, faction hits (and what caused them: a kill, a quest turn-in or a task),
//   quest turn-ins (what you handed which NPC, and the coin / experience / items it gave back),
//   NPC dialog (quest text, keywords, rewards they promise), tasks, Dungeon Crawl completions,
//   items handed to you, and mob details (level, hardest hit, hits, spells cast).
// Respawn gaps come from the kill times; item stats, spells seen and named/placeholder links
// already live in the game database and are added when a bundle is built.
//
// Nothing here is ever sent anywhere. The files stay on this PC (userData\community, never the
// shared Drive folder) as one JSON record per line, one file per month — append-only, so a crash
// or a Drive restore can never wipe what's already written. Nothing about you is kept: your name
// in NPC dialog is replaced with {me} (other players' names with {player}), pets aren't kills,
// and what players say is never kept.
//
// Records (short keys keep the files small):
//   kill     { r:'k', z: zone, d?: tier 1-4, m: mob, t: ms }
//   drop     { r:'d', z, m, kt: the kill's time (or the loot time), i: item, q?: count, t }
//   faction  { r:'f', z, t, f: faction, v: delta, c?: 'max'|'min', m?: mob killed | n?: NPC turned in to | k?: task }
//   turn-in  { r:'q', z, n: NPC, t, g: [[item, count]…], c?: copper received, x?: 1 (experience), i?: [items given back],
//              p?: the reward the NPC promised ("…I will reward you with the Blood Sky Faceplate") }
//   reward   { r:'w', z, n: NPC, qt: the turn-in's time, i: item, id?: item ID, src: 'inv' | 'merge', ok: 1 matches the
//              promise | 0 likely (the one new item after the one turn-in), t }
//              Item rewards aren't written to the log, so they're confirmed from your next /outputfile inventory
//              (an item that wasn't there before) or a merge line ("…create a new item: Crimson Ring of the Djinni +1").
//   dialog   { r:'s', z, n: NPC, t: first seen, x: text }
//   task     { r:'t', z, t, k: task, e: 'a' assigned | 'u' updated }
//   given    { r:'g', z, t, i: item, m?: mob | n?: NPC | k?: task }
//   crawl    { r:'c', z, t, d?: tier }                 (Dungeon Crawl completed; its chest loot is in drops)
//   mob      { r:'m', z, m, t: first seen, l?: level, mh?: max hit, h?: hits, ht?: hit total, s?: [spells] } — per 10 minutes
//
// The same thing seen twice (live, then again by the catch-up or 📥 Old logs) is written once.
// Two mobs of the same name dying in the same second are two kills: each source counts how many
// times it has seen a key, and a record is only written when that count passes what's on file.
'use strict';
const fs = require('fs');
const { scrubDialog, knownWords } = require('./dialogscrub.js');
const path = require('path');

const KILL_LINK_MS = 120000;     // loot up to 2 min after a kill belongs to that corpse
const SETTLE_MS = 3000;          // faction / coin / experience lines land within a few seconds
const PLAYERISH = /^[A-Z][a-z]+$/;
const COIN = { platinum: 1000, gold: 100, silver: 10, copper: 1 };
const coins = (s) => { let n = 0, m; const re = /(\d+) (platinum|gold|silver|copper)/g; while ((m = re.exec(s))) n += +m[1] * COIN[m[2]]; return n; };
const normItem = (n) => String(n || '').replace(/^(?:a|an|the|\d+) /i, '').replace(/ \+\d+$/, '').trim();
const TS = /^\[(\w{3}) (\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})\] (.*)$/;
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function splitLine(raw) {
  const m = TS.exec(raw || '');
  if (!m) return null;
  return { t: new Date(+m[7], MON[m[2]] ?? 0, +m[3], +m[4], +m[5], +m[6]).getTime(), msg: m[8] };
}

// is this death a kill of a real mob (not a player)? killer: who killed it; inFight: the fight
// tracker had it as an enemy (you hit it or it hit you)
function isMobKill(target, killer, inFight) {
  if (!target || target === 'You') return false;
  if (killer === 'You' || inFight) return true;
  return !PLAYERISH.test(target);   // "a gnoll", "Lord Nagafen" — a single capitalised word may be a player
}
// could this speaker be an NPC? players' names are one capitalised word
const npcish = (n) => !!n && !PLAYERISH.test(n);

function keyOf(r) {
  switch (r.r) {
    case 'k': return 'k|' + r.z + '|' + r.m + '|' + r.t;
    case 'd': return 'd|' + r.z + '|' + r.m + '|' + r.kt + '|' + r.i;
    case 'f': return 'f|' + r.z + '|' + r.t + '|' + r.f + '|' + r.v;
    case 'q': return 'q|' + r.z + '|' + r.n + '|' + r.t;
    case 's': return 's|' + r.z + '|' + r.n + '|' + r.x;
    case 't': return 't|' + r.k + '|' + r.e + '|' + r.t;
    case 'g': return 'g|' + r.i + '|' + r.t;
    case 'c': return 'c|' + r.z + '|' + r.t;
    case 'w': return 'w|' + r.n + '|' + r.qt;
    default: return null;            // mob details aren't deduplicated
  }
}
const ONE = new Set(['s']);
// "…I will reward you with the Blood Sky Faceplate." / "Then I'll give you the crimson ring of the djinni."
const PROMISE = /(?:reward you with|rewarded with|give you|you will receive|you shall receive|grant you)\s+(?:the |a |an |your |this |my |one )?([^.!?\[\]'",;]{3,60})/i;
function promised(text) {
  const m = PROMISE.exec(text || '');
  if (!m) return '';
  const x = m[1].replace(/\s+(?:as (?:a|your) reward|for your (?:trouble|efforts?|help)|in return|if you|when you|once you).*$/i, '').trim();
  return /^(?:it|that|this|them|something|anything|more|back|some|what|whatever)\b/i.test(x) ? '' : x;
}
// item names compared loosely: case, a/an/the, +N tier, punctuation
const itemKey = (n) => String(n || '').toLowerCase().replace(/^(?:a|an|the) /, '').replace(/\s*\+\d+$/, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const REWARD_MS = 2 * 3600000;   // a promise counts for a turn-in up to 2 hours later
const MERGE_MS = 15 * 60000;
const MOB_MS = 10 * 60000;       // mob details: one record per mob per 10 minutes, not one per 5-second batch     // a merge this soon after a turn-in can be its reward
// a player's pet / warder / mount ("Maeel`s warder") is never a kill worth keeping
const PET = /^[A-Z][a-z]+`s (?:warder|familiar|.*\bpet|.*\bmount)$/i;
const TOTALS = { k: 'kills', d: 'drops', f: 'factions', q: 'turnins', s: 'dialog', t: 'tasks', g: 'given', c: 'crawls', w: 'rewards', m: 'mobs' };

function create({ dir, log = () => {}, now = () => Date.now() } = {}) {
  const home = () => path.join(typeof dir === 'function' ? dir() : dir, 'community');
  const counts = new Map();          // key -> how many times it's on file
  const totals = {};
  for (const k of Object.keys(TOTALS)) totals[k] = 0;
  let first = 0, last = 0, loaded = false;
  let queue = [], timer = null;
  const open = new Set();            // sessions with things still settling

  function monthFile(t) {
    const d = new Date(t);
    return path.join(home(), d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '.jsonl');
  }
  function files() {
    try { return fs.readdirSync(home()).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort().map((f) => path.join(home(), f)); }
    catch { return []; }
  }
  function tally(r) {
    const k = keyOf(r);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
    if (totals[r.r] != null) totals[r.r]++;
    if (r.t) { if (!first || r.t < first) first = r.t; if (r.t > last) last = r.t; }
  }
  function load() {
    if (loaded) return;
    loaded = true;
    for (const f of files()) {
      let text = '';
      try { text = fs.readFileSync(f, 'utf8'); } catch (e) { log('community: cannot read ' + f + ': ' + e.message); continue; }
      for (const line of text.split('\n')) {
        if (!line) continue;
        try { tally(JSON.parse(line)); } catch { /* a half-written last line after a crash */ }
      }
    }
  }
  function write() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    const byFile = new Map();
    for (const r of queue) {
      const f = monthFile(r.t || now());
      byFile.set(f, (byFile.get(f) || '') + JSON.stringify(r) + '\n');
    }
    queue = [];
    try { fs.mkdirSync(home(), { recursive: true }); } catch { /* reported below */ }
    for (const [f, text] of byFile) {
      try { fs.appendFileSync(f, text); } catch (e) { log('community: cannot write ' + f + ': ' + e.message); }
    }
  }
  // flush: settle every session's waiting records (faction links, turn-ins), then write
  function flush() { for (const s of [...open]) s.end(); write(); }
  function put(r) {
    queue.push(r); tally(r);
    if (!timer) timer = setTimeout(write, 3000);
  }

  // one source of records (the live log, a catch-up run, an 📥 Old logs import)
  // me: your character's name (only used to take it out of NPC dialog)
  function session({ me = '' } = {}) {
    const mine = new Map();          // key -> how many times this source has seen it
    const meRe = me ? new RegExp('\\b' + me.replace(/[^\w]/g, '') + '\\b', 'gi') : null;
    let lastKill = null;             // { z, m, t }
    const looted = [];               // kills in the last 2 minutes: a corpse looted later still finds its kill
    const mobAgg = new Map();        // zone|mob -> one mob-details record, written every 10 minutes
    const kills = [];                // recent kills, for linking faction hits
    const tasks = [];                // recent task updates { k, t }
    let factions = [];               // faction hits waiting to be linked
    let trade = null;                // the turn-in in progress { n, z, t, g, c, x, i, last }
    const trades = [];               // recent finished turn-ins { n, t }
    const npcs = new Set();          // names seen as "Targeted (NPC)" / traded with
    const players = new Set();       // names seen talking in chat or in /who — taken out of NPC dialog
    let target = null;               // { n, t } the NPC you last targeted
    const promises = new Map();      // NPC -> [{ x: promised reward, k: the dialog (loose), t }…] (one NPC can offer several quests)
    const waiting = [];              // turn-ins with a promise, not yet seen in a merge { n, z, t, p }
    let zoneNow = '';
    let self;

    function once(r) {
      load();
      const k = keyOf(r);
      if (k && ONE.has(r.r)) { if (counts.get(k)) return false; }   // dialog: once ever
      else if (k) {
        const n = (mine.get(k) || 0) + 1;
        mine.set(k, n);
        if ((counts.get(k) || 0) >= n) return false;
      }
      put(r);
      return true;
    }
    const near = (list, t, before, after) => {
      let best = null;
      for (const a of list) if (a.t >= t - before && a.t <= t + after && (!best || Math.abs(a.t - t) < Math.abs(best.t - t))) best = a;
      return best;
    };
    function settleFaction(f) {
      // the faction lines come just before "You have slain…" in the same second; after a turn-in
      const k = near(kills, f.t, 1000, SETTLE_MS);
      const q = !k && near(trades.concat(trade && trade.done ? [trade] : []), f.t, SETTLE_MS, SETTLE_MS);
      const tk = !k && !q && near(tasks, f.t, 1500, 1500);
      const r = { r: 'f', z: f.z, t: f.t, f: f.f, v: f.v };
      if (f.c) r.c = f.c;
      if (k) r.m = k.m; else if (q) r.n = q.n; else if (tk) r.k = tk.k;
      return once(r);
    }
    function closeTrade() {
      if (!trade) return;
      const q = trade; trade = null;
      if (!q.done) return;           // offered but never completed (cancelled)
      trades.push({ n: q.n, t: q.t }); if (trades.length > 20) trades.shift();
      const r = { r: 'q', z: q.z, n: q.n, t: q.t, g: [...q.g.entries()] };
      if (q.c) r.c = q.c;
      if (q.x) r.x = 1;
      if (q.i.length) r.i = q.i;
      // the promise whose dialog asks for what you handed in ("return a silvery ring and a wind rune beza")
      let pr = null, best = -1;
      for (const o of promises.get(q.n) || []) {
        if (q.t - o.t > REWARD_MS || o.t > q.t) continue;
        const score = [...q.g.keys()].filter((it) => { const k = itemKey(it); return k && o.k.includes(k); }).length;
        if (score > best || (score === best && o.t >= pr.t)) { pr = o; best = score; }
      }
      if (pr && best < 1) pr = null;   // the dialog must ask for at least one thing you handed in
      if (pr) { r.p = pr.x; waiting.push({ n: q.n, z: q.z, t: q.t, p: pr.x }); if (waiting.length > 20) waiting.shift(); }
      once(r);
    }
    function settle(t) {
      if (trade && t - trade.last > SETTLE_MS) closeTrade();
      if (factions.length) {
        const keep = [];
        for (const f of factions) (t - f.t > SETTLE_MS ? settleFaction(f) : keep.push(f));
        factions = keep;
      }
      while (kills.length && t - kills[0].t > 15000) kills.shift();
      while (tasks.length && t - tasks[0].t > 15000) tasks.shift();
      while (trades.length && t - trades[0].t > 15000) trades.shift();
      if (factions.length || trade || mobAgg.size) open.add(self); else open.delete(self);
    }

    function kill(mob, zone, when, tier, { killer, inFight } = {}) {
      if (!zone || !when || !isMobKill(mob, killer, inFight) || PET.test(mob)) return false;
      lastKill = { z: zone, m: mob, t: when };
      kills.push(lastKill);
      looted.push(lastKill);
      while (looted.length && (when - looted[0].t > KILL_LINK_MS || looted.length > 200)) looted.shift();
      const r = { r: 'k', z: zone, m: mob, t: when };
      if (tier > 0) r.d = tier;
      return once(r);
    }
    function drop(mob, item, zone, when, count) {
      if (!zone || !item) return false;
      when = when || now();
      // the newest kill of that mob in this zone in the last 2 minutes (you often kill several, then loot)
      let lk = null;
      for (let i = looted.length - 1; i >= 0 && !lk; i--) {
        const k = looted[i];
        if (k.z === zone && (!mob || k.m.toLowerCase() === String(mob).toLowerCase()) && when - k.t >= 0 && when - k.t <= KILL_LINK_MS) lk = k;
      }
      if (lk && !mob) mob = lk.m;
      mob = mob || (lk && lk.m);
      if (!mob) return false;
      const r = { r: 'd', z: zone, m: mob, kt: lk ? lk.t : when, i: item, t: when };
      if (count > 1) r.q = count;
      return once(r);
    }
    function faction(fac, delta, zone, when, capped) {
      if (!fac || !when) return;
      factions.push({ f: fac, v: delta || 0, z: zone || '', t: when, c: capped || '' });
      open.add(self);
    }

    // one log line: raw is the line, ev what parser.parseLine made of it (or null);
    // ctx: { zone, tier, isEnemy(name) } — where you are, and the fight tracker's view
    function feed(raw, ev, ctx = {}) {
      const sp = splitLine(raw);
      const t = (ev && ev.when) || (sp && sp.t);
      if (!t) return;
      settle(t);
      const zone = ctx.zone || '';
      zoneNow = zone;
      if (ev && ev.type === 'death') {
        if (ev.target !== 'You') kill(ev.target, zone, t, ctx.tier || 0, { killer: ev.killer, inFight: ctx.isEnemy ? ctx.isEnemy(ev.target) : false });
        return;
      }
      if (ev && ev.type === 'loot') { drop(ev.mob, ev.item, zone, t, ev.count); return; }
      if (ev && ev.type === 'faction') { faction(ev.faction, ev.delta, zone, t, ev.capped); return; }
      // players: names seen in tells, group, guild, raid, channels, OOC and auction (NPCs talk in say and shout)
      if (ev && ev.type === 'chat' && ev.from && ev.from !== 'You' && ev.channel !== 'say' && ev.channel !== 'shout' && PLAYERISH.test(ev.from)) players.add(ev.from);
      if (ev && ev.type === 'zonemap' && ev.player) players.add(ev.player);
      if (!sp) return;
      const msg = sp.msg;
      let m;
      if ((m = /^Targeted \(NPC\): (.+)$/.exec(msg))) { npcs.add(m[1]); target = { n: m[1], t }; return; }
      if ((m = /^You offered (\d+) (.+) to (.+)\.$/.exec(msg))) {
        if (trade && (trade.n !== m[3] || trade.done)) closeTrade();   // a new hand-in after a completed trade is a new turn-in
        if (!trade) trade = { n: m[3], z: zone, t, g: new Map(), c: 0, x: 0, i: [], last: t, done: false };
        const it = normItem(m[2]);
        trade.g.set(it, (trade.g.get(it) || 0) + +m[1]);
        trade.last = t; npcs.add(m[3]);
        open.add(self);
        return;
      }
      if ((m = /^You complete the trade with (.+)\.$/.exec(msg))) {
        if (trade && trade.n !== m[1]) closeTrade();
        if (!trade) trade = { n: m[1], z: zone, t, g: new Map(), c: 0, x: 0, i: [], last: t, done: false };
        trade.done = true; trade.t = t; trade.last = t; npcs.add(m[1]);
        open.add(self);
        return;
      }
      if ((m = /^You receive (.+?) from (.+?)\.$/.exec(msg)) && !/ for the /.test(msg) && m[2] !== 'the corpse' && m[2] !== 'that item') {
        if (trade && trade.n === m[2]) { trade.c += coins(m[1]); trade.last = Math.max(trade.last, t); }
        return;
      }
      if ((m = /^You have successfully merged two items together to create a new item: (.+)$/.exec(msg))) {
        const k = itemKey(m[1]);
        const q = waiting.find((w) => itemKey(w.p) === k && t - w.t >= 0 && t - w.t <= MERGE_MS);
        if (q) { waiting.splice(waiting.indexOf(q), 1); once({ r: 'w', z: q.z, n: q.n, qt: q.t, i: normItem(m[1]), src: 'merge', ok: 1, t }); }
        return;
      }
      if (/^You gain (?:party )?experience/.test(msg)) { if (trade) trade.x = 1; return; }
      if ((m = /^You have been given: (.+)$/.exec(msg))) {
        const item = normItem(m[1]);
        const r = { r: 'g', z: zone, t, i: item };
        const tk = near(tasks, t, 2000, 0), k = near(kills, t, 2000, 0);
        if (trade && trade.done) { trade.i.push(item); r.n = trade.n; }
        else if (tk) r.k = tk.k;
        else if (k) r.m = k.m;
        once(r);
        return;
      }
      if ((m = /^You have been assigned the task '(.+)'\.$/.exec(msg))) { once({ r: 't', z: zone, t, k: m[1], e: 'a' }); return; }
      if ((m = /^Your task '(.+)' has been updated\.$/.exec(msg))) { tasks.push({ k: m[1], t }); once({ r: 't', z: zone, t, k: m[1], e: 'u' }); return; }
      if (/^You have completed the Dungeon Crawl/.test(msg)) { const r = { r: 'c', z: zone, t }; if (ctx.tier > 0) r.d = ctx.tier; once(r); return; }
      // NPC dialog: quest text, [keywords], the reward they promise. Players are never kept.
      if ((m = /^(.+?) (?:says|tells you|told you),? '(.+)'$/.exec(msg)) && (!ev || ev.type === 'chat')) {
        const n = m[1];
        if (n === 'You' || /:\d/.test(n)) return;
        // only the NPC you're talking to (targeted in the last 2 minutes, or trading with) —
        // keeps out mobs' combat taunts and anything said to other players
        const talking = (target && target.n === n && t - target.t <= 120000) || (trade && trade.n === n) ||
          trades.some((q) => q.n === n && t - q.t <= 60000);
        if (!talking) return;
        let x = m[2].trim();
        if (meRe) x = x.replace(meRe, '{me}');
        x = x.replace(/\b[A-Z][a-z]+\b/g, (w) => (players.has(w) && w !== n ? '{player}' : w));
        x = scrubDialog(x, knownWords([n, zone]));   // 3.0: "Greetings, Soandso." for a player never seen in chat
        if (x.length < 4) return;
        { const pr = promised(x);
          if (pr) { const a = promises.get(n) || []; a.push({ x: pr, k: itemKey(x), t }); if (a.length > 10) a.shift(); promises.set(n, a); } }
        once({ r: 's', z: zone, n, t, x: x.slice(0, 600) });
      }
    }
    // the source is done (end of the logs): settle what's still waiting
    function end() {
      writeMobs(true);
      closeTrade();
      for (const f of factions) settleFaction(f);
      factions = [];
      open.delete(self);
    }
    // batched observations from the overlay (level from /con, hardest hit, hits, spells cast)
    // batched observations from the overlay (level from /con, hardest hit, hits, spells cast), arriving
    // every 5 s — added up per mob and written as one record every 10 minutes (and when SEQO closes)
    function writeMobs(force, at) {
      for (const [k, r] of mobAgg) {
        if (!force && at - r.t < MOB_MS) continue;
        mobAgg.delete(k);
        const out = { r: 'm', z: r.z, m: r.m, t: r.t };
        if (r.l) out.l = r.l;
        if (r.mh) out.mh = r.mh;
        if (r.h) { out.h = r.h; out.ht = r.ht; }
        if (r.s.size) out.s = [...r.s].slice(0, 25);
        load(); put(out);
      }
    }
    function mobs(entries) {
      let n = 0;
      let at = 0;
      for (const e of entries || []) at = Math.max(at, (e && e.t) || now());
      for (const e of entries || []) {
        if (!e || !e.mob || !e.zone || !(e.level || e.maxHit || e.hits || (e.spells && e.spells.length))) continue;
        const k = e.zone + '|' + e.mob;
        let r = mobAgg.get(k);
        if (!r) mobAgg.set(k, r = { z: e.zone, m: e.mob, t: e.t || at, l: 0, mh: 0, h: 0, ht: 0, s: new Set() });
        if (e.level) r.l = e.level;
        r.mh = Math.max(r.mh, e.maxHit || 0);
        r.h += e.hits || 0; r.ht += e.total || 0;
        for (const sp of e.spells || []) r.s.add(sp);
        n++;
      }
      writeMobs(false, at);
      if (mobAgg.size) open.add(self);
      return n;
    }
    self = { feed, end, mobs, kill, drop, faction, settle };
    return self;
  }

  // a fresh /outputfile inventory: items that weren't in the last one are rewards for the turn-ins
  // since then — the promised one when the names match, else (one turn-in, one new item) a likely one.
  // inv: gameexports' inventory { items: { lower name: { name, count, id? } }, mtime }
  function inventory(inv) {
    if (!inv || !inv.items) return 0;
    const snapFile = path.join(home(), 'inventory-last.json');
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(snapFile, 'utf8')); } catch { /* first one */ }
    const snap = { mtime: inv.mtime || now(), items: {} };
    for (const it of Object.values(inv.items)) snap.items[itemKey(it.name)] = { name: it.name, count: it.count || 0, id: it.id || '' };
    if (prev && prev.mtime === snap.mtime) return 0;
    try { fs.mkdirSync(home(), { recursive: true }); fs.writeFileSync(snapFile, JSON.stringify(snap)); } catch (e) { log('community: ' + e.message); }
    if (!prev || !prev.items || snap.mtime <= prev.mtime) return 0;
    const fresh = Object.entries(snap.items).filter(([k, v]) => v.count > ((prev.items[k] && prev.items[k].count) || 0));
    if (!fresh.length) return 0;
    const done = new Set(), turnins = [];
    for (const r of records()) {
      if (r.r === 'w') done.add(r.n + '|' + r.qt);
      else if (r.r === 'q' && r.t > prev.mtime && r.t <= snap.mtime) turnins.push(r);
    }
    const open = turnins.filter((q) => !done.has(q.n + '|' + q.t));
    const used = new Set();
    let n = 0;
    const give = (q, k, v, ok) => { used.add(k); n++; const r = { r: 'w', z: q.z, n: q.n, qt: q.t, i: v.name, src: 'inv', ok, t: snap.mtime }; if (v.id) r.id = v.id; put(r); };
    load();
    for (const q of open) {
      if (!q.p) continue;
      const hit = fresh.find(([k]) => !used.has(k) && k === itemKey(q.p));
      if (hit) give(q, hit[0], hit[1], 1);
    }
    const left = open.filter((q) => !(q.p && used.has(itemKey(q.p))));
    const leftItems = fresh.filter(([k]) => !used.has(k));
    if (left.length === 1 && leftItems.length === 1 && !left[0].p) give(left[0], leftItems[0][0], leftItems[0][1], 0);
    write();
    return n;
  }

  function stats() {
    load();
    const s = { first, last, folder: home() };
    for (const [k, name] of Object.entries(TOTALS)) s[name] = totals[k];
    return s;
  }

  // every record on file, oldest first (the upload bundle; also handy for tests)
  function* records() {
    write();
    for (const f of files()) {
      let text = '';
      try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) { if (!line) continue; try { yield JSON.parse(line); } catch { /* skip */ } }
    }
  }

  // the bundle a future upload would send: records plus what the game database knows
  // (item stat fixes, spells seen, named/placeholder links) — still nothing about you
  function bundle(extra = {}) {
    const recs = [...records()];
    return { format: 'seqo-community', version: 1, made: now(), records: recs, ...extra };
  }

  // save: write what's queued without settling live sessions (the uploader uses it every 10 minutes)
  return { session, flush, save: write, stats, records, bundle, inventory, folder: home };
}

module.exports = { create, isMobKill, keyOf, splitLine, promised, itemKey };
