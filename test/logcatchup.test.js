// logcatchup.js: kills + loot from while SEQO was closed.
const fs = require('fs'), os = require('os'), path = require('path');
const C = require('../logcatchup.js');
const parser = require('../parser.js');
const { tierNum } = require('../mobstats.js');
const { cleanZone } = require('../historyimport.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-catch-'));
const logs = path.join(tmp, 'Logs'), data = path.join(tmp, 'data');
fs.mkdirSync(path.join(logs, 'archive'), { recursive: true }); fs.mkdirSync(data);
const log = path.join(logs, 'eqlog_Maeel_neriak.txt');
const L = (time, msg) => '[Thu Oct 29 ' + time + ' 2026] ' + msg;
const T = (time) => Date.parse('Thu Oct 29 ' + time + ' 2026');
const store = require('../lootdb.js').create({ dataDir: () => data, getWin: () => null, noteWrite: () => {} });
store.loadLootDB();
const mk = (now) => C.create({ parser, lootStore: store, tierNum, cleanZone, file: () => path.join(data, 'logpos.json'), now: () => now, saveDelayMs: 1 });

(async () => {
  // first start: nothing replayed, the clock starts
  fs.writeFileSync(log, L('10:00:00', 'You have entered The Plane of Hate.') + '\n' + L('10:01:00', 'A kiraikuei has been slain by Maeel!') + '\n');
  let c = mk(T('10:02:00'));
  ok(await c.catchUp(log, fs.statSync(log).size) === null && !store.db.mobs['The Plane of Hate|a kiraikuei'], 'first start, no kills on record: nothing replayed');
  // played without SEQO: the session was archived on exit, then a new log started
  fs.writeFileSync(path.join(logs, 'archive', 'eqlog_Maeel_neriak-2026-10-29-16-00.txt'), [
    L('10:00:00', 'You have entered The Plane of Hate.'),
    L('10:01:00', 'A kiraikuei has been slain by Maeel!'),        // before the clock: skipped
    L('11:00:00', 'You slash a kiraikuei for 100 points of damage.'),
    L('11:00:30', 'A kiraikuei has been slain by Maeel!'),
    L('11:00:40', '--You have looted a Kiraikuei Tail from a kiraikuei\'s corpse.--'),
    L('11:05:00', 'Lord Rikantus Everling has been slain by Maeel!')
  ].join('\r\n') + '\r\n');
  fs.writeFileSync(log, L('12:00:00', 'You have entered Lake Nerius.') + '\n' + L('12:01:00', 'A lake drake has been slain by Maeel!') + '\n' +
    L('12:30:00', 'A late drake has been slain by Maeel!') + '\n');
  const end = fs.readFileSync(log, 'utf8').indexOf(L('12:30:00', ''));   // the live tail starts here
  c = mk(T('13:00:00'));
  const r = await c.catchUp(log, end);
  ok(r && r.kills === 3 && r.drops === 1, 'archived + current log: 3 kills, 1 drop (' + JSON.stringify(r) + ')');
  ok(store.db.mobs['The Plane of Hate|a kiraikuei'].kills === 1, 'kill before the clock not counted');
  ok(store.db.mobs['The Plane of Hate|a kiraikuei'].drops['Kiraikuei Tail'].count === 1, 'loot recorded on the corpse');
  ok(store.db.mobs['Lake Nerius|a lake drake'].kills === 1, 'zone follows the log');
  ok(!store.db.mobs['Lake Nerius|a late drake'], 'lines the live tail will read are left to it');
  ok(store.db.mobs['The Plane of Hate|a kiraikuei'].killTimes[0].s === 30, 'time to kill kept');
  // started again: nothing twice
  c = mk(T('13:05:00'));
  const r2 = await c.catchUp(log, end);
  ok(r2 && r2.kills === 0 && r2.drops === 0, 'second start: nothing counted twice');
  // the live tail moves the clock
  c.seen(log, [L('12:30:00', 'A late drake has been slain by Maeel!'), 'partial']);
  ok(c.lastSeen(log) === T('12:30:00'), 'live lines move the clock');
  c.flush();
  ok(JSON.parse(fs.readFileSync(path.join(data, 'logpos.json'), 'utf8'))[path.resolve(log).toLowerCase()] === T('12:30:00'), 'clock saved to logpos.json');
  // first start for another log, with kills on record: starts 3 min after the newest kill
  const log2 = path.join(logs, 'eqlog_Alt_neriak.txt');
  fs.writeFileSync(log2, [L('12:01:30', '--You have looted a Drake Scale from a lake drake\'s corpse.--'),   // newest kill's loot: already counted
    L('12:10:00', 'You have entered Lake Nerius.'), L('12:20:00', 'A lake drake has been slain by Alt!')].join('\n') + '\n');
  c = mk(T('13:10:00'));
  const r3 = await c.catchUp(log2, fs.statSync(log2).size);
  ok(r3 && r3.kills === 1 && r3.drops === 0 && store.db.mobs['Lake Nerius|a lake drake'].kills === 2, 'first start: from the newest kill + 3 min (' + JSON.stringify(r3) + ')');
  // a kill already recorded at that exact time is skipped
  ok(store.hasKillAt('a kiraikuei', 'The Plane of Hate', T('11:00:30')), 'hasKillAt finds it');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`logcatchup: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
