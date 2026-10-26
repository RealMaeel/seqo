// trioguess.js: your class makeup from /who rows, your casts and (solo) buffs landing on you.
const T = require('../trioguess.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
// a slice of the game's spell book (name -> class levels), as spelldb builds it
const book = { 'Drain Spirit': { SHD: 49, NEC: 39 }, Conflagration: { WIZ: 43 }, Mesmerization: { ENC: 16 }, Starfire: { DRU: 48 },
  "Tuyen's Chant of Frost": { BRD: 46 }, 'Nektulos Gate': { WIZ: 20 }, 'Promised Renewal': { CLR: 39 }, 'Spirit Armor': { CLR: 15, PAL: 30, NEC: 16 },
  'Siphon Life': { SHD: 30, NEC: 20 }, 'Strength of Earth': { DRU: 8, RNG: 35 } };
const spells = { 1: { n: "Tuyen's Chant of Frost", ben: 1 }, 2: { n: 'Strength of Earth', ben: 1 }, 3: { n: 'Siphon Life', ben: 0 } };
const landMap = { 'Your weapons are coated in frost.': [1], 'You feel stronger.': [2], 'You feel your life force drain away.': [3] };
const M = 60000;
{
  const g = T.create({ book, spells, landMap });
  ok(g.makeup() === null, 'nothing known yet');
  g.cast('Drain Spirit X', 1 * M);
  ok(g.makeup().text === 'SHD or NEC?/?/?' && !g.makeup().exact, 'one ranked spell: "Drain Spirit X" → SHD or NEC');
  g.cast('Conflagration X', 2 * M); g.cast('Mesmerization VII', 3 * M);
  ok(g.makeup().text === 'WIZ/ENC/SHD or NEC?', 'certain classes + the open one: ' + g.makeup().text);
  g.cast('Nektulos Gate', 4 * M);
  ok(g.makeup().text === 'WIZ/ENC/SHD or NEC?', 'travel spells (often from items) are no clue');
  g.cast('Starfire X', 5 * M); g.cast("Tuyen's Chant of Frost VI", 6 * M);
  ok(g.makeup().text === 'DRU/BRD/ENC', 'spells no 3 classes cover = a swap: oldest clues dropped → ' + g.makeup().text);
  g.who(['RNG', 'SHD', 'BRD'], 7 * M);
  ok(g.makeup().exact && g.makeup().text === 'RNG/SHD/BRD', 'your /who row is exact');
  g.cast('Siphon Life VIII', 8 * M);
  ok(g.makeup().text === 'RNG/SHD/BRD', 'a spell the trio can cast keeps it');
  g.cast('Conflagration X', 9 * M);
  ok(g.makeup().exact, 'one off-trio spell (a clicky?) does not drop the /who trio');
  g.cast('Mesmerization VII', 10 * M);
  ok(!g.makeup().exact && g.makeup().text === 'WIZ/ENC/?', 'two off-trio spells = swapped since /who: ' + g.makeup().text);
  g.newSession();
  ok(g.makeup() === null, 'a new session starts the clues over');
}
{
  const g = T.create({ book, spells, landMap });
  ok(!g.landed('You feel stronger.', M, false) && g.makeup() === null, 'buffs in a group: could be anyone\'s');
  ok(g.landed('You feel stronger.', M, true) && g.makeup().text === 'RNG or DRU?/?/?', 'solo buff = one of your classes');
  ok(!g.landed('You feel your life force drain away.', 2 * M, true), 'a detrimental landing (a mob\'s spell) is no clue');
  g.cast("Tuyen's Chant of Frost VI", 3 * M); g.cast('Siphon Life VIII', 4 * M);
  ok(g.makeup().text === 'BRD/RNG or DRU?/SHD or NEC?', 'buffs and casts combine: ' + g.makeup().text);
  ok(g.makeup(40 * M) === null, 'asked 36+ min after the last clue: unknown');
  g.cast("Tuyen's Chant of Frost VI", 3 * M); g.cast('Siphon Life VIII', 4 * M);
  g.cast('Promised Renewal', 40 * M);
  ok(g.makeup().text === 'CLR/?/?', 'clues older than 30 min are dropped: ' + g.makeup().text);
}
{
  const g = T.create({ book, spells, landMap });
  ok(g.groupLine('You have joined the group.') && g.inGroup(), 'joined a group');
  ok(!g.landed('You feel stronger.', M, true), 'in a group (from the join line) buffs are no clue, even between fights');
  g.groupLine('You have been removed from the group.');
  ok(!g.inGroup() && g.landed('You feel stronger.', M, true), 'out of the group again: buffs count');
  g.groupLine('Kwazimodo has joined the group.'); g.groupLine('Kwazimodo has left the group.');
  ok(!g.inGroup() && !g.groupLine('Kwazimodo tells the group, \'hi\''), 'members come and go; chat is not a group line');
}
{
  const g = T.create({ book, spells, landMap });
  g.who(['SHD', 'BRD', 'NEC'], M); g.newSession();
  ok(g.makeup().exact, 'a /who trio survives a new session (until spells say otherwise)');
  g.who(['SHD', 'BRD'], 2 * M);
  ok(g.makeup().text === 'SHD/BRD/NEC', 'a /who row without 3 classes is ignored');
}
console.log(`trioguess: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
