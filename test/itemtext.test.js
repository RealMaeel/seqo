// itemtext.js: an item's statsblock as plain inspect text (no wiki markup).
const T = require('../itemtext.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
// Gamblers Gambit as eqlwiki has it (Ed, Oct 26 2026)
const raw = "Lore Equipped, No Trade<br>Slot: PRIMARY<br>Skill: Piercing  Atk Delay: 20<br>DMG: 11<br>BACKSTAB: 13<br>Dmg Bon: 10<br>" +
  "Effect: <span class='itemeff'>[[Supernova]]</span> (Combat, Rate -75%, Req Level 45)<br>Size: SMALL WT: 0.3<br>Class: ROG<br>Race: ALL";
const s = T.cleanStatsBlock(raw);
ok(!/[<>]/.test(s), 'no HTML left: ' + s);
ok(/^Effect: Supernova \(Combat, Rate -75%, Req Level 45\)$/m.test(s), 'effect line reads plainly');
ok(/^DMG: 11$/m.test(s) && /Atk Delay: 20/.test(s), 'DMG and delay still there for the ratio');
ok(T.cleanStatsBlock('[[Spell: Clarity|Clarity]] &amp; [[Haste]]&nbsp;x') === 'Clarity & Haste x', 'links + entities');
ok(T.cleanStatsBlock("Tuyen's Chant · '''bold'''") === "Tuyen's Chant · bold", 'apostrophes kept, wiki bold dropped');
ok(T.cleanStatsBlock(null) === '', 'nothing in, nothing out');
// upgrade tiers — Checkmate +5 as the game shows it (Ed, Oct 26 2026)
{
  const base = 'Slot: EAR\nAC: 6\nWIS: +5  INT: +5  CHA: +5  MANA: +10  Mana Regen: +2\nSV MAGIC: +5  SV FIRE: +5\nSize: TINY WT: 0.1';
  const up = T.scaledStats(base, 5);
  ok(/AC: 11/.test(up) && /MANA: \+15/.test(up) && /INT: \+10/.test(up) && /CHA: \+10/.test(up) && /SV MAGIC: \+10/.test(up) && /SV FIRE: \+10/.test(up), 'stats at +5 match the game: ' + up);
  ok(/Mana Regen: \+7/.test(up), 'Mana Regen scales too (2 → 7 at +5, as in game)');
  ok(/WT: 0\.1/.test(up) && T.scaledStats(base, 0) === base, 'weight floor 0.1; +0 unchanged');
  ok(T.upDmg(11, 9) === 20 && T.upStat(0, 5) === 0 && T.upStat(-5, 3) === -5, 'DMG +5%/tier (Gamblers Gambit 11 → 20 at +9); zero and negative stay');
  ok(/HP Regen: \+4/.test(T.scaledStats('HP Regen: +1', 3)), 'HP Regen scales the same way');
}
console.log(`itemtext: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
