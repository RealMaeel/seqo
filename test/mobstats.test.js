// mobstats.js: your own kill records for a mob — find, search, chat line, Discord post.
const S = require('../mobstats.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

const lootDB = { mobs: {
  'Nektropos Castle|Lord Rikantus Everling': { name: 'Lord Rikantus Everling', zone: 'Nektropos Castle', kills: 23,
    drops: { 'Reforged Blade Hilt': { name: 'Reforged Blade Hilt', count: 5 }, 'Everling Signet': { name: 'Everling Signet', count: 2 },
             'Rotting Silk Cape': { name: 'Rotting Silk Cape', count: 9 } },
    level: 55, maxHit: 812, hitCount: 40, hitTotal: 16000, spells: ['Lifetap', 'Curse of the Everlings'] },
  'Nektropos Castle (Fused)|Lord Rikantus Everling': { name: 'Lord Rikantus Everling', zone: 'Nektropos Castle (Fused)', kills: 3,
    drops: { 'Reforged Blade Hilt +2': { name: 'Reforged Blade Hilt +2', count: 1 } } },
  'Nektropos Castle|Deirdre Everling': { name: 'Deirdre Everling', zone: 'Nektropos Castle', kills: 4, drops: {} },
  'Blackburrow|a gnoll': { name: 'a gnoll', zone: 'Blackburrow', kills: 300,
    drops: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['Gnoll Thing ' + i, { name: 'Gnoll Thing ' + i, count: 30 - i }])) },
  'Blackburrow|a gnoll pup': { name: 'a gnoll pup', zone: 'Blackburrow', kills: 0, drops: {} }
} };

const c = S.find(lootDB, 'lord rikantus everling');
ok(c && c.name === 'Lord Rikantus Everling' && c.kills === 26 && c.zones.length === 2, 'found in both zones, case-insensitive');
ok(c.zones[0].zone === 'Nektropos Castle' && c.zones[0].drops[0].name === 'Rotting Silk Cape' && c.zones[0].drops[0].rate === '39%', 'most kills first, most common drop first');
ok(c.zones[0].drops.find((d) => d.name === 'Everling Signet').rate === '8.7%', 'small rates keep a decimal');
ok(c.zones[0].avgHit === 400 && c.zones[0].level === 55, 'level and average hit');
ok(S.find(lootDB, 'Nobody') === null, 'unknown mob');
ok(S.find(lootDB, 'Deirdre Everling').zones[0].drops.length === 0, 'kills without drops still make a card');

const r = S.search(lootDB, 'everling');
ok(r.length === 2 && r[0].name === 'Lord Rikantus Everling' && r[0].kills === 26 && r[0].items === 17 && r[0].zones.length === 2, 'search folds zones, most kills first');
ok(S.search(lootDB, 'gnoll').length === 1, 'mobs with no kills are not listed');
ok(S.search(lootDB, '').length === 0, 'empty query');

const line = S.chatLine(c);
ok(line.startsWith('Lord Rikantus Everling (Nektropos Castle), 23 kills: Rotting Silk Cape 9/23 39%'), 'chat line: ' + line);
const long = S.chatLine(S.find(lootDB, 'a gnoll'));
ok(long.length <= 240 && /\+\d+ more$/.test(long), 'long chat line is cut with "+N more": ' + long.length);
ok(S.chatLine(S.find(lootDB, 'Deirdre Everling')).endsWith('4 kills: no drops seen'), 'no drops');

// Ed's real card: motes fold into one entry so every real drop fits
const rik = { mobs: { k: { name: 'Lord Rikantus Everling', zone: 'Nektropos Castle', kills: 13, drops: {
  a: { name: 'Signet Ring of Lord Everling', count: 10 }, b: { name: 'Idol of Forsaken Ideals', count: 3 },
  c: { name: 'Mote of Infinitesimal Potential', count: 1 }, d: { name: 'Mote of Minor Potential', count: 1 },
  e: { name: 'Robe of the Betrayed', count: 1 }, f: { name: 'Everling Family Crest', count: 1 } } } } };
const rl = S.chatLine(S.find(rik, 'Lord Rikantus Everling'));
ok(rl === 'Lord Rikantus Everling (Nektropos Castle), 13 kills: Signet Ring of Lord Everling 10/13 77% · Idol of Forsaken Ideals 3/13 23% · Motes 2/13 15% · Everling Family Crest 1/13 7.7% · Robe of the Betrayed 1/13 7.7%', 'motes folded: ' + rl);
ok(/Mote of Minor Potential/.test(S.markdown(S.find(rik, 'Lord Rikantus Everling'))), 'the Discord table still lists each mote');
const oneMote = { mobs: { k: { name: 'x', zone: 'z', kills: 2, drops: { a: { name: 'Mote of Minor Potential', count: 1 } } } } };
ok(/Mote of Minor Potential 1\/2/.test(S.chatLine(S.find(oneMote, 'x'))), 'a single mote keeps its name');

// recent kills (2.7)
{
  const T0 = Date.UTC(2026, 9, 24, 3, 0, 0);
  const db = { mobs: { k: { name: 'Lord Rikantus Everling', zone: 'Nektropos Castle', kills: 3, drops: {},
    killTimes: [T0 - 90 * 60000, T0 - 32 * 60000, T0] } } };
  const card = S.find(db, 'Lord Rikantus Everling');
  const rk = S.recentKills(card.zones[0], 10);
  ok(rk.length === 3 && rk[0].t === T0 && rk[0].gapMin === 32 && rk[1].gapMin === 58 && rk[2].gapMin === null, 'recent kills newest first with gaps');
  ok(S.fmtGap(32) === '32 min' && S.fmtGap(95) === '1h 35m' && S.fmtGap(120) === '2h' && S.fmtGap(4000) === '3 days', 'gap wording');
  ok(/Recent kills: .*\(32 min after the one before\)/.test(S.markdown(card)), 'Discord post lists recent kills');
  const db2 = { mobs: { k: { name: 'X', zone: 'Z', kills: 3, drops: {}, killTimes: [{ t: T0 - 3600000, s: 95 }, T0 - 1800000, { t: T0, s: 61 }] } } };
  const c2 = S.find(db2, 'X'), sp = S.killSpeed(c2.zones[0]);
  ok(sp && sp.n === 2 && sp.avg === 78 && sp.fastest === 61 && S.fmtSecs(95) === '1:35', 'time to kill: average / fastest');
  ok(S.recentKills(c2.zones[0])[0].secs === 61 && S.recentKills(c2.zones[0])[1].secs === null, 'per-kill time when known');
  ok(/Time to kill: 1:18 average, fastest 1:01 \(2 kills\)/.test(S.markdown(c2)) && /killed in 1:01/.test(S.markdown(c2)), 'Discord post: time to kill');
}

// difficulty tiers (2.7)
{
  ok(S.tierNum('Refined') === 4 && S.tierNum('Awakened, Solo') === 1 && S.tierNum('Fused') === 3 && S.tierNum('Adaptive') === 2 &&
     S.tierNum('') === 0 && S.tierNum('Solo') === 0 && S.tierNum(undefined) === 0, 'tier words → 0-4');
  const T0 = Date.UTC(2026, 9, 24, 3, 0, 0);
  const db = { mobs: { k: { name: 'R', zone: 'N', kills: 5, drops: {}, killTimes: [
    { t: T0 - 5e6, s: 100 }, { t: T0 - 4e6, s: 90, d: 0 }, { t: T0 - 3e6, s: 200, d: 4 }, { t: T0 - 2e6, s: 220, d: 4 }, { t: T0, s: 110, d: 0 }] } } };
  const z = S.find(db, 'R').zones[0];
  const tc = S.tierCounts(z);
  ok(JSON.stringify(tc) === JSON.stringify([{ d: 0, n: 2 }, { d: 4, n: 2 }, { d: null, n: 1 }]), 'kills per tier, unknown last: ' + JSON.stringify(tc));
  ok(S.killSpeed(z, 4).avg === 210 && S.killSpeed(z, 0).avg === 100 && S.killSpeed(z, '?').n === 1 && S.killSpeed(z).n === 5, 'time to kill per tier');
  const r4 = S.recentKills(z, 10, 4);
  ok(r4.length === 2 && r4.every(k => k.d === 4) && r4[0].gapMin === Math.round(1e6 / 60000), 'recent kills on one tier');
  ok(S.recentKills(z, 10)[0].d === 0 && S.recentKills(z, 10)[4].d === null, 'each recent kill carries its tier');
  const md = S.markdown(S.find(db, 'R'));
  ok(/By difficulty: D0 2 kills, 1:40 avg, best 1:30 · D4 2 kills, 3:30 avg, best 3:20 · D\? 1 kill, 1:40 avg, best 1:40/.test(md) && /\[D4\] /.test(md), 'Discord post: per-tier line + tier tags: ' + md);
  const f = S.fastestKills(z, 3);
  ok(f.map(k => k.secs).join() === '90,100,110' && S.fastestKills(z, 10, 4).map(k => k.secs).join() === '200,220', 'fastest kills overall and per tier');
  ok(/D4 2 kills, 3:30 avg, best 3:20/.test(md), 'Discord post: best per tier');
  const dbm = { mobs: { k: { name: 'M', zone: 'N', kills: 4, drops: {}, killTimes: [
    { t: 1, s: 120, c: 'RNG/SHD/BRD', g: 0 }, { t: 2, s: 90, c: 'RNG/SHD/BRD', g: 0 }, { t: 3, s: 80, c: 'SHD/BRD/NEC', g: 1 }, { t: 4, s: 70 }] } } };
  const zm = S.find(dbm, 'M').zones[0];
  const bm = S.byMakeup(zm);
  ok(bm.length === 2 && bm[0].c === 'SHD/BRD/NEC' && bm[0].g === 1 && bm[1].best === 90 && bm[1].avg === 105 && bm[1].n === 2, 'fastest per class makeup + solo/group');
  ok(S.fastestKills(zm, 2)[1].c === 'SHD/BRD/NEC' && S.recentKills(zm)[0].c === '', 'kills carry their makeup');
  const mdm = S.markdown(S.find(dbm, 'M'));
  ok(/Fastest by class makeup: SHD\/BRD\/NEC group 1:20 · RNG\/SHD\/BRD solo 1:30 \(avg 1:45, 2 kills\)/.test(mdm) && /killed in 1:20, SHD\/BRD\/NEC group/.test(mdm), 'Discord post: makeup: ' + mdm);
  const open = { mobs: { k: { name: 'g', zone: 'B', kills: 2, drops: {}, killTimes: [{ t: 1, d: 0 }, { t: 2 }] } } };
  ok(S.tierCounts(S.find(open, 'g').zones[0]).length === 0 && !/By difficulty|\[D/.test(S.markdown(S.find(open, 'g'))), 'never above D0 = no tier split');
}

const md = S.markdown(c);
ok(/^\*\*Lord Rikantus Everling\*\*/.test(md) && (md.match(/```/g) || []).length === 4, 'Discord post: header + one table per zone');
ok(/Nektropos Castle · 23 kills · level 55 · max hit 812, avg 400/.test(md), 'zone line with level / hits');
ok(/Reforged Blade Hilt\s+5\/23\s+22%/.test(md) && /Casts: Lifetap, Curse of the Everlings/.test(md), 'table rows + casts');

console.log(`mobstats: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
