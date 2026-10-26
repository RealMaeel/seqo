// spawnwarn.js: alerts for ★ pinned camps — the ⏳ heads-up, then due / window open / past window.
const W = require('../spawnwarn.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const B = Date.UTC(2026, 9, 26, 18, 0, 0);
const at = (camp, s, opts) => W.check(camp, B + s * 1000, opts).map(a => a.kind + ':' + a.text);
{
  const c = { mob: 'Lord Rikantus Everling', lastDeath: B, resp: { s: 400 } };
  ok(at(c, 300).length === 0, 'nothing early');
  ok(at(c, 340).join() === 'soon:⏳ Lord Rikantus Everling spawns in ~1 min', 'heads-up 60 s before (default)');
  ok(at(c, 341).length === 0, 'once');
  ok(at(c, 400).join() === 'due:⏲ Lord Rikantus Everling repop due!', 'then due');
  ok(at(c, 500).length === 0, 'due once');
  W.reset(c); c.lastDeath = B + 1000 * 1000;
  ok(W.check(c, B + 1340 * 1000, {}).length === 1, 'a new kill starts the alerts over');
}
{
  const c = { mob: 'a ghoul knight', lastDeath: B, resp: { min: 900, max: 1800 } };
  ok(at(c, 780, { warnSecs: 120 }).join() === 'soon:⏳ a ghoul knight spawn window opens in ~2 min', 'window: heads-up before it opens, own lead time');
  ok(at(c, 900, { warnSecs: 120 }).join() === 'due:🪟 a ghoul knight spawn window OPEN (15:00–30:00)', 'window open');
  ok(at(c, 1800).join() === 'due:⏲ a ghoul knight past its spawn window — can be up any moment!', 'past window');
}
{
  const c = { mob: 'x', lastDeath: B, resp: { s: 400 } };
  ok(at(c, 350, { heads: false }).length === 0 && at(c, 400, { heads: false }).length === 1, 'heads-up off: only the due alert');
  const short = { mob: 'y', lastDeath: B, resp: { s: 45 } };
  ok(at(short, 10).length === 0 && at(short, 45).join().startsWith('due:'), 'a 60 s warning on a 45 s respawn: no heads-up');
  const late = { mob: 'z', lastDeath: B, resp: { s: 400 } };
  ok(at(late, 410).join() === 'due:⏲ z repop due!', 'started after the spawn time: no stale heads-up');
  ok(at({ mob: 'w', lastDeath: B, resp: null }, 9999).length === 0 && at({ mob: 'v', lastDeath: 0, resp: { s: 5 } }, 9999).length === 0, 'no respawn known / no kill yet: nothing');
  ok(at({ mob: 'u', lastDeath: B, resp: { s: 400 }, up: true }, 350).length === 0, 'already up: nothing');
}
ok(W.lead(60) === '~1 min' && W.lead(150) === '~3 min' && W.lead(30) === '30 s' && W.leadSaid(60) === '1 minute' && W.leadSaid(30) === '30 seconds', 'wording');
ok(W.check({ mob: 'S', lastDeath: B, resp: { s: 400 } }, B + 340000, {})[0].say === 'S spawns in 1 minute', 'spoken text');
console.log(`spawnwarn: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
