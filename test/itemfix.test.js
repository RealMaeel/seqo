// itemfix.js: your corrections from the game's item window, applied over the wiki.
const F = require('../itemfix.js');
const G = require('../gameexports.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
// Checkmate: eqlwiki vs. Ed's in-game window at +5 (Oct 26 2026)
const wiki = 'Attunable\n\nSlot: EAR\n\nAC: 6\n\nWIS: +8  INT: +5  CHA: +5  MANA: +10  Mana Regen: +2\n\nSV MAGIC: +5  SV FIRE: +5\n\nSize: TINY WT: 0.1\n\nClass: WAR MNK ROG BER\n\nRace: ALL';
const game5 = [['AC', 11], ['MANA', 15], ['INT', 10], ['WIS', 10], ['CHA', 10], ['SV MAGIC', 10], ['SV FIRE', 10], ['MANA REGEN', 7], ['SV VOID', 5]].map(([stat, value]) => ({ stat, value }));
{
  ok(F.baseFrom('AC', 11, 5) === 6 && F.baseFrom('WIS', 10, 5) === 5 && F.baseFrom('MANA REGEN', 7, 5) === 2 && F.baseFrom('DMG', 20, 9) === 11, 'game value at +T → the +0 value');
  ok(F.baseFrom('SV VOID', 5, 5) === null, 'a value no +0 number explains is not guessed');
  const r = F.fromGame(game5, [{ type: 'Focus', name: 'Improved Damage III' }], 5, 1000);
  const fix = F.trim(r.fix, wiki);
  ok(JSON.stringify(fix.stats) === '{"WIS":5}', 'only what differs from the wiki is kept: ' + JSON.stringify(fix.stats));
  ok(fix.seen['SV VOID'].value === 5 && fix.seen['SV VOID'].tier === 5 && fix.effects[0].name === 'Improved Damage III' && fix.by === 'you', 'SV Void kept as seen at +5; the focus kept');
  const a5 = F.apply(wiki, fix, 5), a0 = F.apply(wiki, fix, 0);
  ok(/WIS: \+5/.test(a0.block) && a0.diffs[0].stat === 'WIS' && a0.diffs[0].wiki === 8 && a0.diffs[0].you === 5, 'fix applied, with what the wiki said');
  ok(/SV VOID: \+5/.test(a5.block) && /SV VOID: \(\+5 at \+5\)/.test(a0.block), 'SV Void shows as seen at +5, and where it was seen at other tiers');
  ok(/Focus Effect: Improved Damage III/.test(a0.block) && a0.block.indexOf('SV VOID') < a0.block.indexOf('Size:'), 'focus added; new stat line goes before Size');
  ok(F.trim(F.fromGame([{ stat: 'AC', value: 6 }], [], 0).fix, wiki) === null, 'a fix that matches the wiki = no fix');
  ok(F.apply(wiki, null).block === wiki, 'no fix: the wiki block as is');
  ok(F.exaltSource('Checkmate (Exaltation)') === 'Checkmate', 'an exaltation carries its source item’s effect');
  const noWiki = F.apply('', F.trim(F.fromGame([{ stat: 'AC', value: 9 }], [{ type: 'Worn', name: 'Haste' }], 0).fix, ''));
  ok(/AC: \+9/.test(noWiki.block) && /Worn Effect: Haste/.test(noWiki.block), 'an item with no wiki page at all comes from the fix alone');
}
// inventory export: Slot7–10 of an exaltable item (Slots 11) are its exaltations
{
  const g = G.create({ getSettings: () => ({}), getGameDB: () => ({}), saveGameDBSoon: () => {}, getWin: () => null });
  const inv = g.parseInventoryFile([
    'Location\tName\tID\tCount\tSlots',
    'Ear\tCheckmate +5\t1\t1\t11',
    'Ear-Slot7\tCheckmate (Exaltation)\t2\t1\t11',
    'General 1\tTreasure Hunter`s Satchel\t3\t1\t10',
    'General 1-Slot4\tKhyldorn the Blood Drinker +10\t4\t1\t11',
    'General 1-Slot4-Slot7\tBloodmoon (Exaltation)\t5\t1\t11',
    'General 1-Slot4-Slot10\tTorrid Corruptor (Exaltation)\t6\t1\t11',
    'General 1-Slot7\tBloodmoon (Exaltation)\t5\t1\t11'
  ].join('\n'));
  ok(inv.exalts['checkmate +5'][0].focus === 'Checkmate (Exaltation)' && inv.exalts['checkmate +5'][0].loc === 'Ear', 'worn item: Slot7 = Focus exaltation');
  const k = inv.exalts['khyldorn the blood drinker +10'][0];
  ok(k.focus === 'Bloodmoon (Exaltation)' && k.proc === 'Torrid Corruptor (Exaltation)' && !k.click, 'bag item: Slot7 Focus, Slot10 Proc');
  ok(inv.items['bloodmoon (exaltation)'].by.slotted === 1 && inv.items['bloodmoon (exaltation)'].by.bags === 1, 'slotted exaltations are part of their item; a loose one in a bag slot stays a bag item');
}
console.log(`itemfix: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
