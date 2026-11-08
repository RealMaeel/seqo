// communitydata.js — 3.0: downloads the compiled community file (everyone's shared data, added up by
// the server's compile step) and answers lookups for the kill card, item card and camp timers.
//
// Downloaded at start (after 20 s) and every hour, whether or not you share — reading it sends
// nothing about you. The last copy is kept in userData\community\data.json, so it works offline.
'use strict';
const fs = require('fs');
const path = require('path');

const EVERY_MS = 3600e3;          // hourly, like the server's compile
const FIRST_MS = 20000;

const norm = (s) => String(s || '').toLowerCase().replace(/`/g, "'").replace(/^(?:a|an|the) /, '').replace(/\s*\+\d+$/, '').trim();

function create({ dir, server, fetchImpl = (...a) => fetch(...a), onUpdate = () => {}, log = () => {}, now = () => Date.now() }) {
  const file = () => path.join(typeof dir === 'function' ? dir() : dir, 'community', 'data.json');
  let data = null, fetchedAt = 0, error = '', timer = null;
  let byMob = new Map(), byItem = new Map();
  let byFaction = new Map();   // faction (lower case) -> { name, rows: [...] }

  function index() {
    byMob = new Map(); byItem = new Map(); byFaction = new Map();
    if (!data) return;
    const fac = (f) => { const k = String(f).toLowerCase(); let e = byFaction.get(k); if (!e) byFaction.set(k, e = { name: f, rows: [] }); return e; };
    for (const m of Object.values(data.mobs || {}))
      for (const [f, x] of Object.entries(m.factions || {}))
        fac(f).rows.push({ kind: 'kill', mob: m.mob, zone: m.zone, v: x.v, n: x.n, kills: m.kills || 0, players: m.players || 0, respawn: m.respawn ? m.respawn.s : 0 });
    for (const n of Object.values(data.npcs || {})) {
      const top = (n.turnins || [])[0];
      for (const [f, x] of Object.entries(n.factions || {}))
        fac(f).rows.push({ kind: 'turnin', npc: n.npc, zone: n.zone, v: x.v, n: x.n, items: top ? top.items : [], turnins: (n.turnins || []).reduce((a, t) => a + t.n, 0) });
    }
    const add = (k, v) => { const a = byItem.get(k); if (a) a.push(v); else byItem.set(k, [v]); };
    for (const m of Object.values(data.mobs || {})) {
      const k = norm(m.mob);
      (byMob.get(k) || byMob.set(k, []).get(k)).push(m);
      for (const [item, d] of Object.entries(m.drops || {})) add(norm(item), { kind: 'drop', zone: m.zone, mob: m.mob, n: d.n, kills: m.kills || 0, players: d.players });
    }
    for (const n of Object.values(data.npcs || {})) {
      for (const [item, r] of Object.entries(n.rewards || {})) add(norm(item), { kind: 'reward', zone: n.zone, npc: n.npc, confirmed: r.confirmed, likely: r.likely });
      for (const [promise, sigs] of Object.entries(n.promises || {})) add(norm(promise), { kind: 'promise', zone: n.zone, npc: n.npc, for: sigs });
      for (const t of n.turnins || []) for (const [item] of t.items) add(norm(item), { kind: 'turnin', zone: n.zone, npc: n.npc, items: t.items, n: t.n, coin: t.coin, xp: t.xp, factions: n.factions || {} });
    }
  }
  function load() {
    try {
      const st = fs.statSync(file());
      data = JSON.parse(fs.readFileSync(file(), 'utf8'));
      fetchedAt = st.mtimeMs;
    } catch { data = null; }
    index();
  }

  async function refresh() {
    try {
      const res = await fetchImpl(server + '/v1/data.json', { signal: AbortSignal.timeout(30000) });
      if (res.status === 404) { error = 'not built yet'; return false; }
      if (!res.ok) { error = 'server said ' + res.status; return false; }
      const text = await res.text();
      const d = JSON.parse(text);
      if (!d || d.schema !== 1 || !d.mobs) { error = 'unexpected file'; return false; }
      fs.mkdirSync(path.dirname(file()), { recursive: true });
      fs.writeFileSync(file() + '.tmp', text);
      fs.renameSync(file() + '.tmp', file());
      data = d; fetchedAt = now(); error = '';
      index();
      onUpdate(status());
      return true;
    } catch (e) {
      error = (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) ? 'server didn’t answer' : 'offline';
      log('community data: ' + (e && e.message));
      return false;
    }
  }

  function status() {
    return {
      have: !!data, fetchedAt, error,
      built: data ? data.built : '', installs: data ? data.installs : 0,
      mobs: data ? Object.keys(data.mobs || {}).length : 0, npcs: data ? Object.keys(data.npcs || {}).length : 0
    };
  }
  // every zone's entry for a mob name (case, a/an/the and backticks ignored)
  const mob = (name) => byMob.get(norm(name)) || [];
  // where an item comes from: drops (with rates), quest rewards, promises, turn-ins it's handed in for
  const item = (name) => byItem.get(norm(name)) || [];
  // "zone|mob" -> respawn seconds, for the camp timers
  function respawns() {
    const out = {};
    for (const m of Object.values((data && data.mobs) || {})) if (m.respawn && m.respawn.s) out[m.zone + '|' + m.mob] = { s: m.respawn.s, n: m.respawn.n };
    return out;
  }
  const players = () => (data ? data.installs || 0 : 0);
  // Lookup search: community mobs and items (by name), for the ones you have no record of yourself
  function search(q, limit = 10) {
    const k = norm(q);
    if (!k || k.length < 2 || !data) return [];
    const out = [];
    for (const [name, list] of byMob) {
      if (!name.includes(k)) continue;
      const kills = list.reduce((a, m) => a + (m.kills || 0), 0), pl = Math.max(...list.map((m) => m.players || 0));
      out.push({ kind: 'cmob', name: list[0].mob, detail: 'community: ' + kills.toLocaleString() + ' kills · ' + pl + ' player' + (pl === 1 ? '' : 's') + ' · ' + list[0].zone + (list.length > 1 ? ' +' + (list.length - 1) + ' more' : '') });
      if (out.length >= limit) break;
    }
    let nf = 0;
    for (const [key, e] of byFaction) {
      if (!key.includes(k)) continue;
      const up = e.rows.filter((r) => r.v === 'better' || r.v > 0).length, down = e.rows.filter((r) => r.v === 'worse' || r.v < 0).length;
      out.push({ kind: 'cfaction', name: e.name, detail: 'faction: ' + up + ' way' + (up === 1 ? '' : 's') + ' to raise it · ' + down + ' that lower it' });
      if (++nf >= 5) break;
    }
    let items = 0;
    for (const [name, list] of byItem) {
      if (!name.includes(k)) continue;
      // where it's been seen most (a tiny sample's 3 of 2 isn't the place to farm); a source with no kills
      // (a Dungeon Crawl's Reward Chest) has no rate, only a count
      const drop = list.filter((x) => x.kind === 'drop').sort((a, b) => (b.kills ? 1 : 0) - (a.kills ? 1 : 0) || b.n - a.n)[0];
      const rw = list.find((x) => x.kind === 'reward' || x.kind === 'promise');
      const label = list.map((x) => x.kind === 'drop' ? null : x).find(Boolean);
      if (!drop && !rw) continue;
      const nice = drop ? Object.keys((data.mobs[drop.zone + '|' + drop.mob] || {}).drops || {}).find((i) => norm(i) === name) : (label && label.kind === 'reward' ? Object.keys((data.npcs[rw.zone + '|' + rw.npc] || {}).rewards || {}).find((i) => norm(i) === name) : null);
      out.push({ kind: 'citem', name: nice || name, detail: 'community: ' + (drop ? (drop.kills ? 'drops from ' + drop.mob + ' ' + Math.round(drop.n / drop.kills * 100) + '%' : 'from ' + drop.mob + ' ×' + drop.n) : '') + (drop && rw ? ' · ' : '') + (rw ? 'quest reward from ' + rw.npc : '') });
      if (++items >= limit) break;
    }
    return out;
  }

  function start() { load(); stop(); timer = setTimeout(function tick() { refresh().finally(() => { timer = setTimeout(tick, EVERY_MS); }); }, FIRST_MS); }
  function stop() { if (timer) { clearTimeout(timer); timer = null; } }

  // ⚖ what changes a faction: raises (best first), lowers (worst first). A hit seen only at the limit
  // ("could not possibly get any better / worse") gives the direction but not the amount: those come last.
  function faction(name) {
    const e = byFaction.get(String(name || '').toLowerCase());
    if (!e) return null;
    const amt = (r) => (typeof r.v === 'number' ? r.v : 0);
    const raises = e.rows.filter((r) => r.v === 'better' || r.v === 'max' || amt(r) > 0)
      .sort((a, b) => (typeof b.v === 'number') - (typeof a.v === 'number') || amt(b) - amt(a) || b.n - a.n);
    const lowers = e.rows.filter((r) => r.v === 'worse' || r.v === 'min' || amt(r) < 0)
      .sort((a, b) => (typeof b.v === 'number') - (typeof a.v === 'number') || amt(a) - amt(b) || b.n - a.n);
    return { name: e.name, raises: raises.slice(0, 60), lowers: lowers.slice(0, 60), more: Math.max(0, raises.length - 60) + Math.max(0, lowers.length - 60) };
  }
  // faction names, for Lookup and the picker: [{ name, sources }]
  function factions(q = '') {
    const k = String(q || '').toLowerCase().trim();
    const out = [];
    for (const [key, e] of byFaction) if (!k || key.includes(k)) out.push({ name: e.name, sources: e.rows.length });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { start, stop, load, refresh, status, mob, item, respawns, players, search, faction, factions };
}

module.exports = { create, norm };
