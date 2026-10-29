// mobname.js: typed camp names → the mob's real name.
const M = require('../mobname.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const known = [{ name: 'the Game Master', zone: 'Nektropos Castle' }, { name: 'Lord Rikantus Everling', zone: 'Nektropos Castle' },
  { name: 'a game warden', zone: 'Qeynos Hills' }, { name: 'Guardian Golem', zone: 'Nektropos Castle' }];
ok(M.resolve('game master', known).name === 'the Game Master', '"game master" → the Game Master');
ok(M.resolve('the game master', known).name === 'the Game Master', 'case ignored');
ok(M.resolve('The Game Master', known).name === 'the Game Master', 'log-style capital The');
ok(M.resolve('lord rikantus everling', known).name === 'Lord Rikantus Everling', 'named mob, any case');
const r = M.resolve('rikantus', known);
ok(!r.name && r.suggest[0] === 'Lord Rikantus Everling', 'partial name → did you mean');
ok(!M.resolve('xyzzy', known).name && M.resolve('xyzzy', known).suggest.length === 0, 'unknown → no name, no suggestions');
ok(M.resolve('game', known).suggest.includes('the Game Master') && M.resolve('game', known).suggest.includes('a game warden'), 'several suggestions');
console.log(`mobname: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
