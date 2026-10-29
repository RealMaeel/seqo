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
  ok(T.upDmg(11, 9) === 20 && T.upDmg(45, 8) === 81 && T.upStat(0, 5) === 0 && T.upStat(-5, 3) === -5, 'DMG +5%/tier (Gamblers Gambit 11 → 20 at +9); zero and negative stay');
  ok(/HP Regen: \+4/.test(T.scaledStats('HP Regen: +1', 3)), 'HP Regen scales the same way');
}
// 📋 chat parts (2.7.2): Checkmate +10 as Ed copied it was missing Mana Regen
{
  const b = T.scaledStats('Slot: EAR\nAC: 6\nWIS: +5  INT: +5  CHA: +5  MANA: +10  Mana Regen: +2\nSV MAGIC: +5  SV FIRE: +5\nSize: TINY WT: 0.1\nFocus Effect: Improved Damage III', 10);
  const p = T.chatParts(b);
  ok(p.join(' · ') === 'AC 16 · WIS +15 · INT +15 · CHA +15 · MANA +20 · Mana Regen +12 · SV MAGIC +15 · SV FIRE +15 · SV VOID +10 · Focus: Improved Damage III', 'chat parts: ' + p.join(' · '));
  ok(T.chatParts('Effect: Supernova (Combat, Rate -75%)').join() === 'Effect: Supernova (Combat, Rate -75%)', 'a proc stays Effect: with its details');
}
// upgrade math against the game's own item windows (2.7.2)
{
  const w = 'Slot: RANGE\nSkill: Archery  Atk Delay: 60\nDMG: 45\nRange: 200\nSTR: +5  AGI: +5  DEX: +5  HP: +50\nEffect: Whirlwind (Combat) at Level 50\nSize: MEDIUM  WT: 4.0\nClass: RNG';
  const u = T.scaledStats(w, 8);   // Windstriker +8 in game: Base Dmg 81, HP 90, STR/AGI/DEX 13, Range 280, Weight 1.2, Accuracy +20%, SV Void 8, Delay 60
  ok(/DMG: 81/.test(u) && /HP: \+90/.test(u) && /STR: \+13/.test(u) && /Range: 280/.test(u) && /WT: 1\.2/.test(u) && /Atk Delay: 60/.test(u), 'Windstriker +8 matches the game: ' + u.replace(/\n+/g, ' | '));
  ok(/SV VOID: \+8/.test(u) && /ACCURACY: \+20%/.test(u) && u.indexOf('ACCURACY') < u.indexOf('Size:'), 'upgrades grant SV Void (+1/tier) and, on weapons, Accuracy (+2.5%/tier)');
  ok(T.chatParts(u).join(' · ').endsWith('ACCURACY +20% · Effect: Whirlwind (Combat)'), 'chat: accuracy + the proc');
  const c = T.scaledStats('AC: 6\nSize: TINY WT: 0.1', 5);
  ok(/SV VOID: \+5/.test(c) && !/ACCURACY/.test(c), 'Checkmate +5: SV Void 5, no Accuracy on a non-weapon');
  ok(T.upWeight(4.0, 3) === 2.8 && T.upWeight(4.0, 10) === 1.2 && T.upWeight(0.1, 5) === 0.1, 'weight -10%/tier, never below 30% of base or 0.1');
  ok(T.chatParts('Focus Effect: Improved Damage III\nEffect: Supernova (Combat, Rate -75%)').join(' · ') === 'Focus: Improved Damage III · Effect: Supernova (Combat, Rate -75%)', 'focus and proc on consecutive lines');
}
console.log(`itemtext: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
