// safestore.js: never save over a database that couldn't be read (the Oct 28 wipe).
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('../safestore.js');
const L = require('../lootdb.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-safe-'));
const share = path.join(tmp, 'Drive', 'EQ'), home = path.join(tmp, 'home');
fs.mkdirSync(share, { recursive: true });
const file = path.join(share, 'gamedb.json');
const st = S.create({ name: 'gamedb', file: () => file, backupDir: () => path.join(home, 'backups') });

ok(st.read().state === 'missing', 'no file yet → missing');
fs.writeFileSync(file, '{"zones":{"a":1}');
ok(st.read().state === 'unreadable', 'half-written file → unreadable, not empty');
fs.writeFileSync(file, '');
ok(st.read().state === 'unreadable', 'empty file → unreadable');
ok(S.create({ name: 'x', file: () => path.join(tmp, 'G', 'EQ', 'x.json'), backupDir: () => home }).read().state === 'nodir', 'Drive not mounted → nodir');

// a held store never writes
const big = JSON.stringify({ zones: {}, items: Object.fromEntries(Array.from({ length: 3000 }, (_, i) => ['item ' + i, { n: i }])) });
fs.writeFileSync(file, big);
st.block('test');
ok(!st.write('{}').ok && fs.readFileSync(file, 'utf8') === big, 'held → the file is not touched');
st.unblock();
// a shrinking save keeps a backup
const w = st.write('{"zones":{}}');
ok(w.ok && w.backup && fs.readFileSync(w.backup, 'utf8') === big, 'save that shrinks a big file → old copy backed up first');
ok(!fs.existsSync(file + '.tmp'), 'temp file renamed into place');
const w2 = st.write(JSON.stringify({ zones: { b: 2 } }));
ok(w2.ok && !w2.backup, 'small file → no backup needed');
// the folder disappearing: no write, no folder created
const gone = S.create({ name: 'g', file: () => path.join(tmp, 'Gone', 'g.json'), backupDir: () => home });
ok(!gone.write('{}').ok && !fs.existsSync(path.join(tmp, 'Gone')), 'missing shared folder is never created/written');
// daily backup: once a day
const d1 = st.dailyBackup(), d2 = st.dailyBackup();
ok(d1 && fs.existsSync(d1) && d2 === null, 'one daily backup per day');

// merges
const disk = { mobs: { 'z|a rat': { name: 'a rat', zone: 'z', kills: 100, drops: { Tail: { name: 'Tail', count: 40 } }, killTimes: [{ t: 1 }, { t: 2 }] } } };
const mem = { mobs: { 'z|a rat': { name: 'a rat', zone: 'z', kills: 3, drops: { Tail: { name: 'Tail', count: 1 }, Fur: { name: 'Fur', count: 1 } }, killTimes: [{ t: 2 }, { t: 5 }, { t: 6 }] },
  'z|a bat': { name: 'a bat', zone: 'z', kills: 1, drops: {} } } };
const m = S.mergeLoot(JSON.parse(JSON.stringify(disk)), mem);
const rat = m.mobs['z|a rat'];
ok(rat.kills === 102, 'merge: kills added, a kill the file already has (same time) not counted twice');
ok(rat.drops.Tail.count === 41 && rat.drops.Fur.count === 1, 'merge: drop counts added');
ok(rat.killTimes.map((k) => k.t).join() === '1,2,5,6', 'merge: kill times unioned in order');
ok(m.mobs['z|a bat'].kills === 1, 'merge: new mobs kept');
const g = S.mergeGame({ zones: { a: 1 }, items: { x: 1 }, settingsX: 5 }, { zones: {}, items: { y: 2 }, spellPages: { s: 1 } });
ok(g.zones.a === 1 && g.items.x === 1 && g.items.y === 2 && g.spellPages.s === 1 && g.settingsX === 5, 'merge game data: file kept, new entries added');

// lootdb end to end: unreadable at start → held; recovered → merged and saved
(async () => {
  const lootFile = path.join(share, 'lootdb.json');
  fs.writeFileSync(lootFile, JSON.stringify(disk).slice(0, 30));   // mid-sync
  const realSetInterval = global.setInterval;
  let tick = null;
  global.setInterval = (fn) => { tick = fn; return { unref() {} }; };
  global.clearInterval = () => {};
  const store = L.create({ dataDir: () => share, getWin: () => null, noteWrite: () => {}, backupDir: () => home, shared: () => true });
  store.loadLootDB();
  global.setInterval = realSetInterval;
  ok(!!store.savesHeld(), 'lootdb: unreadable at startup → saves held');
  store.recordKill('a rat', 'z', 9, 30);
  await new Promise((r) => setTimeout(r, 1200));
  ok(fs.readFileSync(lootFile, 'utf8') === JSON.stringify(disk).slice(0, 30), 'lootdb: the file is not saved over while held');
  fs.writeFileSync(lootFile, JSON.stringify(disk));   // Drive finished
  tick();
  ok(!store.savesHeld() && store.db.mobs['z|a rat'].kills === 101, 'lootdb: recovered → file data + the kill made meanwhile');
  await new Promise((r) => setTimeout(r, 1200));
  ok(JSON.parse(fs.readFileSync(lootFile, 'utf8')).mobs['z|a rat'].kills === 101, 'lootdb: merged result saved');
  // someone else writes the file (Drive from another PC, a restore) — the next save merges, never overwrites
  await new Promise((r) => setTimeout(r, 30));
  const other = JSON.parse(fs.readFileSync(lootFile, 'utf8'));
  other.mobs['z|a rat'].kills = 500;   // e.g. a restored, bigger history
  other.mobs['z|a wolf'] = { name: 'a wolf', zone: 'z', kills: 7, drops: {} };
  fs.writeFileSync(lootFile, JSON.stringify(other));
  store.recordKill('a rat', 'z', 99, 10);
  await new Promise((r) => setTimeout(r, 1200));
  const after = JSON.parse(fs.readFileSync(lootFile, 'utf8'));
  ok(after.mobs['z|a rat'].kills === 501 && after.mobs['z|a wolf'].kills === 7, 'changed on disk → their file + only this session\'s new kill (' + after.mobs['z|a rat'].kills + ')');
  // a reload that hits a half-synced file keeps memory
  fs.writeFileSync(lootFile, '{"mo');
  ok(store.loadLootDB({ reload: true }) === false && store.db.mobs['z|a rat'].kills === 501, 'reload of a half-synced file → keep what is in memory');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`safestore: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
