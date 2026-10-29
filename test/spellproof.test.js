// spellproof.js: the evidence a spell is really in Legends.
const P = require('../spellproof.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const ev = { mine: ['Shieldskin'], hidden: ['Spirit of Wolf'], notInLegends: new Set(['Temperance']), scribed: { 'Disease Cloud': 1 },
  seen: { Allure: 5 }, wiki: { 'Clarity': true, "Wuggan's Appraisal": false, 'Temperance': true } };
ok(P.verdict('Allure', ev).ok === true, 'seen cast (as Allure VIII) → yes');
ok(P.verdict('Allure VIII', ev).ok === true, 'ranked name counts as its base');
ok(P.verdict('Disease Cloud', ev).ok === true, 'in your spellbook → yes');
ok(P.verdict('Clarity', ev).ok === true, 'eqlwiki page → yes');
ok(P.verdict("Wuggan's Appraisal", ev).ok === false, 'no page, never seen, not scribed → no');
ok(P.verdict('Temperance', ev).ok === false, 'known not in Legends beats a wiki page');
ok(P.verdict('Spirit of Wolf', ev).ok === false, 'hidden → no');
ok(P.verdict('Shieldskin', ev).ok === true, 'your own ✓ → yes');
ok(P.verdict('Aegis', ev).ok === null, 'not checked yet → unknown');
const seen = {};
ok(P.noteSeen(seen, 'Conflagration X', 10) && seen.Conflagration === 10, 'noteSeen stores the base name');
ok(!P.noteSeen(seen, 'Conflagration IX', 5) && seen.Conflagration === 10, 'older sighting ignored');
ok(P.castInLine('[Thu Oct 08 14:03:04 2026] Olavn N`Mar begins casting Leatherskin.') === 'Leatherskin', 'other player cast line');
ok(P.castInLine('[Thu Oct 08 14:03:04 2026] You begin singing Selo\'s Accelerando.') === "Selo's Accelerando", 'your song line');
ok(P.castInLine('[Thu Oct 08 14:03:04 2026] Gaber says, hi.') === null, 'other lines → null');
console.log(`spellproof: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
