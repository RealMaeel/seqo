#!/usr/bin/env node
// SEQO community data — compile: reads every batch from the server, adds it all up, and uploads the
// compiled file that every SEQO downloads. Runs on your PC (or a scheduled GitHub Action), not on
// Cloudflare: the free plan only allows 10 ms of CPU per request, far too little for this.
//
//   server-url.txt  https://seqo-community.<you>.workers.dev      (or set SEQO_SERVER)
//   admin-key.txt   your admin key — never commit it or paste it anywhere (or set SEQO_ADMIN_KEY)
//   node tools\compile.cjs            → compiles and uploads
//   node tools\compile.cjs --dry      → compiles and writes compiled.json here, uploads nothing
//
// Rules (from the 3.0 plan, "Keeping the numbers honest"):
//   - a group kill seen by several players counts once: the same zone + mob within 3 seconds from
//     different installs is one kill (PC clocks differ by a second or two)
//   - drops are never doubled (only the looter sees "You looted")
//   - a number is published only when it comes from at least MIN_PLAYERS installs (1 while testing)
'use strict';

const SKEW_MS = 3000;
const RESPAWN_MIN = 60e3, RESPAWN_MAX = 3 * 3600e3;

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const mode = (a) => { const c = new Map(); let best, n = 0; for (const v of a) { const k = (c.get(v) || 0) + 1; c.set(v, k); if (k > n) { n = k; best = v; } } return best; };

function compile(batches, { minPlayers = 1, now = Date.now() } = {}) {
  const kills = new Map();     // z|m -> [{ t, d, who }]
  const drops = new Map();     // z|m -> item -> { n, who:Set }
  const facs = new Map();      // z|m -> faction -> [delta]   (kill-caused)
  const npcs = new Map();      // z|n -> { turnins: Map(sig -> {...}), dialog: Set, promises: Map, rewards: Map, factions: Map, who:Set }
  const tasks = new Map();     // task -> { zones:Set, given: Map(item -> n), who:Set }
  const mobs = new Map();      // z|m -> { l:[], mh, h, ht, s:Set }
  const crawls = new Map();    // z -> { n, who:Set }
  const installs = new Set();
  let records = 0;

  const npc = (z, n) => { const k = z + '|' + n; let e = npcs.get(k); if (!e) npcs.set(k, e = { z, n, turnins: new Map(), dialog: new Set(), promises: new Map(), rewards: new Map(), factions: new Map(), who: new Set() }); return e; };
  const sub = (m, k, make) => { let e = m.get(k); if (!e) m.set(k, e = make()); return e; };

  for (const b of batches) {
    let recs;
    try { recs = typeof b.body === 'string' ? JSON.parse(b.body) : b.body; } catch { continue; }
    const who = b.install;
    installs.add(who);
    for (const r of recs || []) {
      records++;
      const zm = r.z + '|' + r.m;
      switch (r.r) {
        case 'k': sub(kills, zm, () => []).push({ t: r.t, d: r.d || 0, who }); break;
        case 'd': { const it = sub(sub(drops, zm, () => new Map()), r.i, () => ({ n: 0, who: new Set() })); it.n += r.q || 1; it.who.add(who); break; }
        case 'f':
          if (r.m) { const a = sub(sub(facs, zm, () => new Map()), r.f, () => []); a.push(r.c && !r.v ? r.c : r.v); }
          else if (r.n) { const e = npc(r.z, r.n); sub(e.factions, r.f, () => []).push(r.c && !r.v ? r.c : r.v); }
          break;
        case 'q': {
          const e = npc(r.z, r.n); e.who.add(who);
          const g = [...r.g].sort((a, b) => a[0].localeCompare(b[0]));
          const sig = g.map(([i, n]) => n + 'x' + i).join(' + ');
          const q = sub(e.turnins, sig, () => ({ items: g, n: 0, coin: [], xp: 0, back: new Map(), who: new Set() }));
          q.n++; q.who.add(who); if (r.c) q.coin.push(r.c); if (r.x) q.xp++;
          for (const i of r.i || []) q.back.set(i, (q.back.get(i) || 0) + 1);
          if (r.p) sub(e.promises, r.p, () => new Set()).add(sig);
          break;
        }
        case 's': { const e = npc(r.z, r.n); if (e.dialog.size < 60) e.dialog.add(r.x); break; }
        case 't': { const e = sub(tasks, r.k, () => ({ zones: new Set(), given: new Map(), who: new Set() })); e.zones.add(r.z); e.who.add(who); break; }
        case 'g': if (r.k) { const e = sub(tasks, r.k, () => ({ zones: new Set(), given: new Map(), who: new Set() })); e.given.set(r.i, (e.given.get(r.i) || 0) + 1); } break;
        case 'w': { const e = npc(r.z, r.n); const w = sub(e.rewards, r.i, () => ({ confirmed: 0, likely: 0, id: '', who: new Set() })); if (r.ok) w.confirmed++; else w.likely++; if (r.id) w.id = r.id; w.who.add(who); break; }
        case 'c': { const e = sub(crawls, r.z, () => ({ n: 0, who: new Set() })); e.n++; e.who.add(who); break; }
        case 'm': {
          const e = sub(mobs, zm, () => ({ l: [], mh: 0, h: 0, ht: 0, s: new Set(), who: new Set() }));
          if (r.l) e.l.push(r.l); e.mh = Math.max(e.mh, r.mh || 0); e.h += r.h || 0; e.ht += r.ht || 0; for (const s of r.s || []) e.s.add(s); e.who.add(who);
          break;
        }
      }
    }
  }

  // ---- mobs: kills (group kills counted once), tiers, respawn, drops, faction, details ----
  const out = {};
  const keys = new Set([...kills.keys(), ...drops.keys(), ...mobs.keys()]);
  for (const zm of keys) {
    const ks = (kills.get(zm) || []).sort((a, b) => a.t - b.t);
    // a kill from another player within 3 s of one already counted (and not yet paired with one of
    // theirs) is the same group kill — each counted kill can absorb one copy per other player
    let kc = 0;
    const recent = [];             // counted kills of the last few seconds: { t, who, paired:Set }
    for (const k of ks) {
      while (recent.length && k.t - recent[0].t > SKEW_MS) recent.shift();
      const m = recent.find((c) => c.who !== k.who && !c.paired.has(k.who));
      if (m) { m.paired.add(k.who); continue; }
      recent.push({ t: k.t, who: k.who, paired: new Set() });
      kc++;
    }
    const who = new Set(ks.map((k) => k.who));
    const dropMap = drops.get(zm) || new Map();
    for (const it of dropMap.values()) for (const w of it.who) who.add(w);
    const det = mobs.get(zm);
    if (det) for (const w of det.who) who.add(w);
    if (who.size < minPlayers) continue;
    const [z, m] = zm.split('|');
    const e = { zone: z, mob: m, players: who.size };
    if (kc) {
      e.kills = kc;
      const tiers = {}; for (const k of ks) tiers[k.d] = (tiers[k.d] || 0) + 1; e.tiers = tiers;
      // respawn: gaps between one player's kills of this mob (rough — a camp with several spawns shortens it)
      const gaps = [];
      const byWho = new Map(); for (const k of ks) sub(byWho, k.who, () => []).push(k.t);
      for (const ts of byWho.values()) for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g >= RESPAWN_MIN && g <= RESPAWN_MAX) gaps.push(g); }
      if (gaps.length >= 3) e.respawn = { s: Math.round(median(gaps) / 1000), n: gaps.length };
    }
    const dr = {};
    for (const [item, it] of [...dropMap].sort((a, b) => b[1].n - a[1].n)) if (it.who.size >= minPlayers) dr[item] = { n: it.n, players: it.who.size };
    if (Object.keys(dr).length) e.drops = dr;
    const fm = facs.get(zm);
    if (fm) { e.factions = {}; for (const [f, a] of fm) e.factions[f] = { v: mode(a), n: a.length }; }
    if (det) {
      if (det.l.length) e.level = mode(det.l);
      if (det.mh) e.maxHit = det.mh;
      if (det.h) e.avgHit = Math.round(det.ht / det.h);
      if (det.s.size) e.spells = [...det.s].sort();
    }
    out[zm] = e;
  }

  // ---- quest NPCs ----
  const npcOut = {};
  for (const [k, e] of npcs) {
    const who = new Set(e.who); for (const r of e.rewards.values()) for (const w of r.who) who.add(w);
    if (who.size < minPlayers && !e.dialog.size) continue;
    const o = { zone: e.z, npc: e.n };
    if (e.turnins.size) o.turnins = [...e.turnins.values()].sort((a, b) => b.n - a.n).map((q) => {
      const t = { items: q.items, n: q.n, players: q.who.size };
      if (q.coin.length) t.coin = median(q.coin);
      if (q.xp) t.xp = Math.round((q.xp / q.n) * 100) / 100;
      if (q.back.size) t.itemsBack = Object.fromEntries(q.back);
      return t;
    });
    if (e.promises.size) o.promises = Object.fromEntries([...e.promises].map(([p, sigs]) => [p, [...sigs]]));
    if (e.rewards.size) o.rewards = Object.fromEntries([...e.rewards].map(([i, r]) => [i, { confirmed: r.confirmed, likely: r.likely, id: r.id || undefined }]));
    if (e.factions.size) o.factions = Object.fromEntries([...e.factions].map(([f, a]) => [f, { v: mode(a), n: a.length }]));
    if (e.dialog.size) o.dialog = [...e.dialog];
    npcOut[k] = o;
  }

  const taskOut = {};
  for (const [k, e] of tasks) if (e.who.size >= minPlayers) taskOut[k] = { zones: [...e.zones], given: Object.fromEntries(e.given), players: e.who.size };
  const crawlOut = {};
  for (const [z, e] of crawls) if (e.who.size >= minPlayers) crawlOut[z] = { n: e.n, players: e.who.size };

  return { schema: 1, built: new Date(now).toISOString(), installs: installs.size, records, minPlayers, mobs: out, npcs: npcOut, tasks: taskOut, crawls: crawlOut };
}

async function main() {
  // the server address and your admin key: from the environment, or from two one-line files next to
  // this folder's wrangler.jsonc (server-url.txt, admin-key.txt) that only you can see
  const fs = require('fs'), path = require('path');
  const fromFile = (f) => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8').trim(); } catch { return ''; } };
  const server = (process.env.SEQO_SERVER || fromFile('server-url.txt')).replace(/\/+$/, '');
  const key = process.env.SEQO_ADMIN_KEY || fromFile('admin-key.txt');
  const dry = process.argv.includes('--dry');
  const minPlayers = +(process.env.SEQO_MIN_PLAYERS || 1);
  if (!server || !key) { console.error('Put the server address in server-url.txt and your admin key in admin-key.txt first (see README-SETUP.md).'); process.exit(1); }
  const auth = { authorization: 'Bearer ' + key };
  const batches = [];
  let after = 0;
  for (;;) {
    const r = await fetch(server + '/v1/admin/batches?limit=500&after=' + after, { headers: auth });
    if (!r.ok) { console.error('Reading batches failed: HTTP ' + r.status + ' ' + (await r.text())); process.exit(1); }
    const j = await r.json();
    batches.push(...j.batches);
    process.stdout.write('\rread ' + batches.length + ' batches');
    if (!j.next) break;
    after = j.next;
  }
  console.log('');
  const c = compile(batches, { minPlayers });
  const text = JSON.stringify(c);
  console.log(c.installs + ' installs, ' + c.records.toLocaleString() + ' records → ' + Object.keys(c.mobs).length + ' mobs, ' +
    Object.keys(c.npcs).length + ' NPCs, ' + Object.keys(c.tasks).length + ' tasks, ' + (text.length / 1024).toFixed(0) + ' KB');
  if (dry) { require('fs').writeFileSync('compiled.json', text); console.log('wrote compiled.json (nothing uploaded)'); return; }
  const r = await fetch(server + '/v1/admin/compiled', { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: text });
  console.log(r.ok ? 'uploaded — ' + server + '/v1/data.json' : 'upload failed: HTTP ' + r.status + ' ' + (await r.text()));
}

if (typeof require !== "undefined" && require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });
module.exports = { compile };
