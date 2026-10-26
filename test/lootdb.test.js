// lootdb.js: the loot database (kills, drops, combat notes per zone+mob).
const fs = require('fs'), os = require('os'), path = require('path');
const LDB = require('../lootdb.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-ldb-'));
  fs.writeFileSync(path.join(dir, 'lootdb.json'), JSON.stringify({ mobs: {
    '|a gnoll': { name: 'a gnoll', kills: 3, drops: { x: { name: '2 Bone Chips', count: 2 }, y: { name: 'Bone Chips', count: 1 } } },
    'Blackburrow|Lord Elgnub': { name: 'Lord Elgnub', zone: 'Blackburrow', kills: 1,
      drops: { a: { name: "Gnoll Hide from Lord Elgnub's corpse", count: 1 }, b: { name: 'Rusty Axe +3', count: 1 } } } } }));
  const sent = []; let writes = 0;
  const s = LDB.create({ dataDir: () => dir, getWin: () => ({ webContents: { send: (c, p) => sent.push([c, p]) } }), noteWrite: () => writes++ });

  s.loadLootDB();
  const g = s.db.mobs['|a gnoll'];
  ok(g.zone === '' && g.drops['Bone Chips'].count === 3 && Object.keys(g.drops).length === 1, 'old entries: zone filled, "2 Bone Chips" merged into Bone Chips');
  const e = s.db.mobs['Blackburrow|Lord Elgnub'].drops;
  ok(e['Gnoll Hide'] && e['Rusty Axe'] && Object.keys(e).length === 2, 'corpse suffix and +N stripped from old names');

  for (let i = 0; i < 4; i++) s.recordKill('Lord Rikantus Everling', 'Nektropos Castle');
  s.recordKill('A gnoll', 'Blackburrow');
  s.recordDrop('Lord Rikantus Everling', 'Reforged Blade Hilt', 'Nektropos Castle');
  s.recordDrop('Lord Rikantus Everling', 'Reforged Blade Hilt', 'Nektropos Castle');
  s.recordMobStats([{ mob: 'Lord Rikantus Everling', zone: 'Nektropos Castle', maxHit: 800, hits: 10, total: 4000, level: 55, spells: ['Lifetap'] },
                    { mob: 'Lord Rikantus Everling', zone: 'Nektropos Castle', maxHit: 600, hits: 2, total: 900, spells: ['Lifetap', 'Curse'] }]);
  const r = s.db.mobs['Nektropos Castle|Lord Rikantus Everling'];
  ok(r.kills === 4 && r.drops['Reforged Blade Hilt'].count === 2, 'kills and drops keyed per zone+mob');
  ok(r.maxHit === 800 && r.hitCount === 12 && r.hitTotal === 4900 && r.level === 55 && r.spells.join() === 'Lifetap,Curse', 'combat notes: max hit kept, totals add, spells merged');
  ok(s.db.mobs['Blackburrow|a gnoll'].kills === 1, '"A gnoll" stored as "a gnoll"');
  ok(s.mobKey('The Ghoul Lord') === 'the Ghoul Lord' && s.mobKey('Lord Elgnub') === 'Lord Elgnub', 'mobKey lowercases only a leading article');

  await new Promise((res) => setTimeout(res, 1300));
  const disk = JSON.parse(fs.readFileSync(s.lootDbPath(), 'utf8'));
  ok(disk.mobs['Nektropos Castle|Lord Rikantus Everling'].kills === 4 && writes === 1, 'saves once, debounced, and tells main.js');
  ok(sent.length === 1 && sent[0][0] === 'loot-db' && sent[0][1] === s.db, 'pushes the DB to the overlay once, debounced');

  // kill times (2.7)
  const T0 = Date.UTC(2026, 9, 24, 3, 0, 0);
  s.recordKill('Lord Rikantus Everling', 'Nektropos Castle', T0 + 600000, 85);
  s.recordKill('Lord Rikantus Everling', 'Nektropos Castle', T0);            // out of order
  s.recordKill('Lord Rikantus Everling', 'Nektropos Castle');                // no time: still a kill
  const rk = s.db.mobs['Nektropos Castle|Lord Rikantus Everling'];
  ok(rk.kills === 7 && rk.killTimes.map(k => k.t).join() === [T0, T0 + 600000].join() && rk.killTimes[1].s === 85 && rk.killTimes[0].s === undefined, 'kill times (+ time to kill) kept in order, kills still counted');
  const added = s.addKillTimes([{ mob: 'Lord Rikantus Everling', zone: 'Nektropos Castle', times: [{ t: T0, s: 70 }, T0 - 3600000, { t: T0 - 7200000, s: 95 }] },
                                { mob: 'Some Mob I Never Killed', zone: 'Nektropos Castle', times: [T0] }]);
  ok(added === 2 && rk.killTimes.length === 4 && rk.killTimes[0].t === T0 - 7200000 && rk.killTimes[0].s === 95 && rk.kills === 7, 'old-log times merged, no duplicates, counts untouched');
  ok(rk.killTimes.find(k => k.t === T0).s === 70, 'an old-log time to kill fills in a kill that had none');
  ok(!s.db.mobs['Nektropos Castle|Some Mob I Never Killed'], 'old-log times never create new mobs');
  s.recordKill('Lord Rikantus Everling', 'Nektropos Castle', T0 + 900000, 120, 4);
  ok(rk.killTimes.find(k => k.t === T0 + 900000).d === 4, 'a live kill keeps its difficulty tier');
  s.addKillTimes([{ mob: 'Lord Rikantus Everling', zone: 'Nektropos Castle', times: [{ t: T0, s: 70, d: 3 }, { t: T0 + 900000, d: 1 }] }]);
  ok(rk.killTimes.find(k => k.t === T0).d === 3 && rk.killTimes.find(k => k.t === T0).s === 70, 'old logs fill in the tier on a kill that had none');
  ok(rk.killTimes.find(k => k.t === T0 + 900000).d === 4, 'a tier already noted is never overwritten');
  s.recordKill('Lord Rikantus Everling', 'Nektropos Castle', T0 + 1200000, 95, 0, { c: 'RNG/SHD/BRD', g: 0 });
  ok(rk.killTimes.find(k => k.t === T0 + 1200000).c === 'RNG/SHD/BRD' && rk.killTimes.find(k => k.t === T0 + 1200000).g === 0, 'makeup + solo kept with the kill');
  s.addKillTimes([{ mob: 'Lord Rikantus Everling', zone: 'Nektropos Castle', times: [{ t: T0, c: 'SHD/BRD/?', g: 1 }, { t: T0 + 1200000, c: 'SHD/?/?', g: 1 }] }]);
  ok(rk.killTimes.find(k => k.t === T0).c === 'SHD/BRD/?' && rk.killTimes.find(k => k.t === T0).g === 1, 'old logs fill in makeup + group');
  ok(rk.killTimes.find(k => k.t === T0 + 1200000).c === 'RNG/SHD/BRD' && rk.killTimes.find(k => k.t === T0 + 1200000).g === 0, 'an exact makeup is never replaced by a guess');
  s.addKillTimes([{ mob: 'Lord Rikantus Everling', zone: 'Nektropos Castle', times: [{ t: T0, c: 'SHD/BRD/NEC' }] }]);
  ok(rk.killTimes.find(k => k.t === T0).c === 'SHD/BRD/NEC', 'a better guess replaces a partial one');
  s.recordKill('x', 'y', T0, null, 9);
  ok(s.db.mobs['y|x'].killTimes[0].d === undefined, 'a tier outside 0-4 is ignored');
  for (let i = 0; i < 60; i++) s.recordKill('a gnoll', 'Blackburrow', T0 + i * 1000);
  ok(s.db.mobs['Blackburrow|a gnoll'].killTimes.length === 50 && s.db.mobs['Blackburrow|a gnoll'].killTimes[49].t === T0 + 59000, 'only the last 50 kept');

  fs.writeFileSync(s.lootDbPath(), '{broken');
  s.loadLootDB();
  ok(JSON.stringify(s.db) === '{"mobs":{}}', 'a broken file starts an empty DB');

  await new Promise((res) => setTimeout(res, 1300));   // let the last debounced save finish
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`lootdb: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
