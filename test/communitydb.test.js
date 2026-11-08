// tests for communitydb.js (2.7.5: local community data store)
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cdb = require('../communitydb.js');
const parser = require('../parser.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-cdb-'));
let db = cdb.create({ dir: tmp });

// player deaths aren't kills; mobs are
assert.strictEqual(cdb.isMobKill('Soandso', 'a gnoll', false), false);
assert.strictEqual(cdb.isMobKill('Vox', 'You', false), true);
assert.strictEqual(cdb.isMobKill('Vox', 'Soandso', true), true);
assert.strictEqual(cdb.isMobKill('a gnoll pup', 'Soandso', false), true);
assert.strictEqual(cdb.isMobKill('You', 'a gnoll', true), false);

// feed real log lines the way all three sources do (zone from the caller, tracker for enemies)
function run(session, lines, zone = 'Castle Mistmoore', tier = 2) {
  const tracker = new parser.FightTracker();
  for (const raw of lines) {
    const ev = parser.parseLine(raw);
    if (ev) tracker.feed(ev);
    session.feed(raw, ev, { zone, tier, isEnemy: (n) => tracker.isEnemy(n) });
  }
  session.end();
  db.flush();
}
const L = (hms, msg) => '[Fri Oct 30 ' + hms + ' 2026] ' + msg;
const fight = [
  L('20:00:00', 'You slash the Game Master for 40 points of damage.'),
  L('20:00:05', 'Your faction standing with Castle Mistmoore has been adjusted by -5.'),
  L('20:00:05', "Your task 'Potential of the Void - Game Master - Weekly' has been updated."),
  L('20:00:05', 'You have been given: Void-Touched Potential'),
  L('20:00:05', 'You have slain the Game Master!'),
  L('20:00:09', "--You have looted a Warstaff of Hope's Demise from the Game Master's corpse.--"),
  L('20:00:20', 'Soandso has been slain by a bat!'),
  L('20:01:00', 'Targeted (NPC): Sarkis Ebonblade'),
  L('20:01:01', 'You say, \'Hail, Sarkis Ebonblade\''),
  L('20:01:01', "Sarkis Ebonblade says, 'Greetings, Maeel.  Have you come here to test your [dark powers] of skill and spell casting?'"),
  L('20:01:02', "Soandso tells you, 'hi Maeel'"),   // a player seen in chat (NPCs talk in say)
  L('20:01:03', "Sarkis Ebonblade says, 'Smash eh?  Go.  Smash, smash some more, and then return a silvery ring and a wind rune beza.  Then I'll give you the crimson ring of the djinni.'"),
  L('20:01:04', "Sarkis Ebonblade says, 'Proceed upward through the sky, then return to me a set of rusted pauldrons and a wind rune fana.  This will prove your abilities to me and I will reward you with the Blood Sky Faceplate.'"),
  L('20:01:10', 'You offered 1 Silvery Ring +1 to Sarkis Ebonblade.'),
  L('20:01:11', 'You offered 1 Wind Rune Beza to Sarkis Ebonblade.'),
  L('20:01:12', 'You gain experience!'),
  L('20:01:12', 'You complete the trade with Sarkis Ebonblade.'),
  L('20:01:12', 'You receive 5 gold from Sarkis Ebonblade.'),
  L('20:01:13', 'Your faction standing with Dark Bargainers has been adjusted by 10.'),
  L('20:01:14', "Sarkis Ebonblade says, 'Okay.  Soandso, you are next.'"),
  L('20:01:15', "Sarkis Ebonblade says, 'Greetings, Maeel.  Have you come here to test your [dark powers] of skill and spell casting?'"),
  L('20:01:20', "a bat says, 'Die!'"),
  L('20:01:21', 'You have slain Maeel`s warder!'),
  L('20:01:30', 'You have been assigned the task \'Crawl\'.'),
  L('20:05:00', 'You have completed the Dungeon Crawl and earned reward loot!')
];
run(db.session({ me: 'Maeel' }), fight);

let recs = [...db.records()];
const by = (r) => recs.filter((x) => x.r === r);
let s = db.stats();
assert.strictEqual(s.kills, 1, 'one kill (the player death is not one)');
assert.strictEqual(by('k')[0].m, 'the Game Master');
assert.strictEqual(by('k')[0].d, 2);
const drops = by('d');
assert.strictEqual(drops.length, 1);
assert.strictEqual(drops[0].kt, by('k')[0].t, 'drop tied to its kill');
const fac = by('f');
assert.strictEqual(fac.length, 2);
assert.strictEqual(fac.find((f) => f.f === 'Castle Mistmoore').m, 'the Game Master', 'faction before "slain" belongs to the kill');
assert.strictEqual(fac.find((f) => f.f === 'Dark Bargainers').n, 'Sarkis Ebonblade', 'faction after a turn-in belongs to the NPC');
const q = by('q');
assert.strictEqual(q.length, 1);
assert.deepStrictEqual(q[0].g, [['Silvery Ring', 1], ['Wind Rune Beza', 1]]);
assert.strictEqual(q[0].c, 500);
assert.strictEqual(q[0].x, 1);
const dlg = by('s');
assert.strictEqual(dlg.length, 4, 'NPC dialog kept once, players and mob taunts never');
assert.ok(dlg.some((d) => d.x === 'Okay.  {player}, you are next.'), 'other players are taken out');
assert.ok(dlg[0].x.includes('Greetings, {me}.') && !dlg[0].x.includes('Maeel'));
assert.strictEqual(by('g')[0].k, 'Potential of the Void - Game Master - Weekly');
assert.strictEqual(by('t').length, 2);
assert.strictEqual(by('c').length, 1);

// quest rewards aren't in the log: the NPC's promise goes on the turn-in, and the next inventory
// file (or a merge line) confirms it
assert.strictEqual(cdb.promised("Return with a finely woven cloth belt and a wind rune dena.  You will be rewarded with a pegasus hide belt."), 'pegasus hide belt');
assert.strictEqual(cdb.promised('I will give you something nice.'), '');
assert.strictEqual(q[0].p, 'crimson ring of the djinni', 'the promise that asked for what you handed in');
db.inventory({ mtime: new Date(2026, 9, 30, 19, 0).getTime(), items: { a: { name: 'Rusty Dagger', count: 1 } } });
assert.strictEqual(db.inventory({ mtime: new Date(2026, 9, 30, 21, 0).getTime(),
  items: { a: { name: 'Rusty Dagger', count: 1 }, b: { name: 'Crimson Ring of the Djinni', count: 1, id: '12345' }, c: { name: 'Bone Chips', count: 4 } } }), 1);
recs = [...db.records()];
let w = recs.filter((r) => r.r === 'w');
assert.strictEqual(w.length, 1);
assert.deepStrictEqual([w[0].n, w[0].i, w[0].id, w[0].ok, w[0].src], ['Sarkis Ebonblade', 'Crimson Ring of the Djinni', '12345', 1, 'inv']);
assert.strictEqual(db.inventory({ mtime: new Date(2026, 9, 30, 21, 0).getTime(), items: {} }), 0, 'the same file twice does nothing');

// a merge right after the turn-in confirms it from the log alone; with no promise, one turn-in +
// one new item is a likely reward
run(db.session({ me: 'Maeel' }), [
  L('22:00:00', 'Targeted (NPC): Sarkis Ebonblade'),
  L('22:00:01', "Sarkis Ebonblade says, 'Bring me a finely crafted amulet and a wind rune ozah.  In return I will give you the amulet of the sphinx eye.'"),
  L('22:00:10', 'You offered 1 Finely Crafted Amulet to Sarkis Ebonblade.'),
  L('22:00:11', 'You offered 1 Wind Rune Ozah to Sarkis Ebonblade.'),
  L('22:00:12', 'You complete the trade with Sarkis Ebonblade.'),
  L('22:01:00', 'You have successfully merged two items together to create a new item: Amulet of the Sphinx Eye +1'),
  L('22:10:00', 'Targeted (NPC): Tiam Khonsir'),
  L('22:10:05', 'You offered 4 Kobold Molar to Tiam Khonsir.'),
  L('22:10:06', 'You complete the trade with Tiam Khonsir.'),
  L('22:10:06', 'You receive 7 silver from Tiam Khonsir.')]);
db.inventory({ mtime: new Date(2026, 9, 30, 22, 30).getTime(), items: { d: { name: 'Kobold Pelt Cloak', count: 1 } } });
w = [...db.records()].filter((r) => r.r === 'w');
assert.strictEqual(w.length, 3);
assert.deepStrictEqual(w.find((r) => r.src === 'merge') && [w.find((r) => r.src === 'merge').i, w.find((r) => r.src === 'merge').ok], ['Amulet of the Sphinx Eye', 1]);
assert.deepStrictEqual(w.find((r) => r.n === 'Tiam Khonsir') && [w.find((r) => r.n === 'Tiam Khonsir').i, w.find((r) => r.n === 'Tiam Khonsir').ok], ['Kobold Pelt Cloak', 0]);

// several kills, then looting: each corpse still finds its own kill
run(db.session(), [
  L('23:00:00', 'You have slain an ice goblin!'),
  L('23:00:02', 'You have slain an elite goblin guard!'),
  L('23:00:20', "--You have looted a Raw-Hide Belt from an ice goblin's corpse.--")]);
assert.strictEqual([...db.records()].find((r) => r.i === 'Raw-Hide Belt').kt, new Date(2026, 9, 30, 23, 0, 0).getTime());

// mob details from the overlay: 5-second batches add up into one record
{ const s5 = db.session(); s5.mobs([{ mob: 'a bat', zone: 'Castle Mistmoore', maxHit: 4, hits: 2, total: 6, spells: [], t: new Date(2026, 9, 30, 23, 1).getTime() }]);
  s5.mobs([{ mob: 'a bat', zone: 'Castle Mistmoore', maxHit: 9, hits: 1, total: 9, spells: ['Bite'], t: new Date(2026, 9, 30, 23, 2).getTime() }]); db.flush();
  const bat = [...db.records()].filter((r) => r.r === 'm' && r.m === 'a bat');
  assert.strictEqual(bat.length, 1); assert.deepStrictEqual([bat[0].mh, bat[0].h, bat[0].ht, bat[0].s], [9, 3, 15, ['Bite']]); }

// mob details from the overlay
assert.strictEqual(db.session().mobs([{ mob: 'the Game Master', zone: 'Castle Mistmoore', level: 52, maxHit: 310, hits: 12, total: 2100, spells: ['Lifetap'], t: new Date(2026, 9, 30, 20, 2).getTime() }]), 1);
db.flush();
const before = [...db.records()].length;

// a restart, then the catch-up / old-logs import reads the same lines again: nothing doubled
db = cdb.create({ dir: tmp });
run(db.session({ me: 'Maeel' }), fight);
assert.strictEqual([...db.records()].length, before, 'reading the same log twice adds nothing');

// two same-name mobs dying in the same second are two kills — and stay two on a re-read
const bats = [L('21:00:00', 'You have slain a bat!'), L('21:00:00', 'You have slain a bat!')];
run(db.session(), bats);
run(db.session(), bats);
assert.strictEqual(db.stats().kills, 5);
run(db.session(), bats.concat([L('21:00:00', 'You have slain a bat!')]));
assert.strictEqual(db.stats().kills, 6);

// one file per month, one JSON record per line; a torn last line is ignored
const files = fs.readdirSync(path.join(tmp, 'community')).filter((f) => f.endsWith('.jsonl'));
assert.deepStrictEqual(files, ['2026-10.jsonl']);
fs.appendFileSync(path.join(tmp, 'community', files[0]), '{"r":"k","z":"x');
db = cdb.create({ dir: tmp });
assert.strictEqual(db.stats().kills, 6);

// the bundle carries the records and whatever extra the caller adds
const b = db.bundle({ spellsSeen: { Lifetap: 1 } });
assert.strictEqual(b.format, 'seqo-community');
assert.ok(b.records.length > 10 && b.spellsSeen.Lifetap);
assert.ok(!JSON.stringify(b).includes('Maeel'), 'your name is nowhere in the bundle');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('communitydb tests passed');
