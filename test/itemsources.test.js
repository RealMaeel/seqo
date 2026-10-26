// itemsources.js: other sources for items eqlwiki has no page for.
const S = require('../itemsources.js');
const U = require('../updater.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const P99 = "{{Itempage\n| itemname = Harpy Wing\n| statsblock = MAGIC ITEM<br>WT: 0.1 Size: SMALL<br>Class: NONE\n| dropsfrom = * [[Harpy|a harpy]]\n| relatedquests = * [[Harpy Wing Quest]]\n* [[Feathered Hat|Feathers for a Hat]]\n| playercrafted = \n| recipes = \n}}";
{
  const p = S.parseP99Item(P99, U.extractTemplateParam);
  ok(p.isItem && !p.gear && p.quests.join() === 'Harpy Wing Quest,Feathered Hat' && !p.ts && p.drops[0] === 'Harpy', 'P99 item page: quests, drops, not gear: ' + JSON.stringify(p));
  const g = S.parseP99Item("{{Itempage\n| statsblock = Slot: PRIMARY<br>DMG: 12 Atk Delay: 30\n| recipes = [[Smithing]]\n}}", U.extractTemplateParam);
  ok(g.gear && g.ts, 'P99: a Slot line = gear; recipes = tradeskill');
  ok(!S.parseP99Item('#REDIRECT [[Something]]', U.extractTemplateParam).isItem, 'not an item page');
}
(async () => {
  const fakeU = (p99) => ({ ...U, searchEqlTools: U.searchEqlTools, P99_BASE: 'https://wiki.project1999.com/',
    fetchP99Page: async (t, o) => { ok(o && o.exact, 'P99 asked for the exact title only'); if (p99 === 'offline') throw new Error('x'); return p99; } });
  const db = { toolsPages: { _updated: 1, 'BiS gear': { url: 'https://eqlegendstools.com/bis-gear/', lines: ['Primary | Pyrosilk Blade | Nektropos'] } } };
  const loot = { mobs: { a: { name: 'Melanie Everling', zone: 'Nektropos Castle', drops: { x: { name: "Melanie's Robe", count: 3 } } } } };
  const mk = (p99) => S.create({ updater: fakeU(p99), getGameDB: () => db, getLootDB: () => loot });
  const t = await mk(null).lookup('Pyrosilk Blade +3');
  ok(t.src === 'eqlegendstools' && t.gear && /BiS gear/.test(t.note), 'eqlegendstools first, gear from its BiS page: ' + JSON.stringify(t));
  const h = await mk({ wikitext: P99, pageTitle: 'Harpy Wing' }).lookup('Harpy Wing');
  ok(h.src === 'P99 (classic EQ)' && h.quests.length === 2 && /Harpy_Wing$/.test(h.url), 'then P99, with its link');
  const l = await mk(null).lookup("Melanie's Robe");
  ok(l.src === 'your loot' && /Melanie Everling \(Nektropos Castle\)/.test(l.note), 'then your loot records');
  const n = await mk(null).lookup('Nothing Knows Me');
  ok(n.src === '' && !n.error, 'nothing anywhere: empty answer (cached as checked)');
  const off = await mk('offline').lookup('Nothing Knows Me');
  ok(off.src === '' && off.error, 'P99 unreachable: an error, so it is asked again later');
  console.log(`itemsources: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
