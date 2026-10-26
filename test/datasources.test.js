// datasources.js: wiki / eqlegendstools refreshers, freshness check, guide pages.
// The wiki and the site are faked with pages built from SEQO's own shipped data.
const path = require('path');
const dir = path.join(__dirname, '..');
const updater = require(path.join(dir, 'updater.js'));
const E = require(path.join(dir, 'epics.js')), P = require(path.join(dir, 'posquests.js'));
const BIS_CLASSES = ['Bard', 'Beastlord', 'Berserker', 'Cleric', 'Druid', 'Enchanter', 'Magician', 'Monk', 'Necromancer', 'Paladin', 'Ranger', 'Rogue', 'Shadow Knight', 'Shaman', 'Warrior', 'Wizard'];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

// ---- synthetic pages built from the shipped data ----
let epicsWiki = "Intro ’quoted’\n";
for (const [cls, e] of Object.entries(E.EPICS)) {
  epicsWiki += `== ${cls} ==\n* [[${e.epic} Epic Quest]]\n`;
  e.items.forEach((it, i) => { epicsWiki += (i % 3 === 0 ? `* 2x [[${it.n}]] from ''${it.src}''\n` : i % 3 === 1 ? `:* [[${it.n}|${it.n}]] x3 - [[${it.src}]] (unverified)\n` : `* [[${it.src}]] - [[${it.n}]].\n`); });
}
let unlocksWiki = '';
for (let i = 0; i < 18; i++) unlocksWiki += `== Race ${i} ==\n=== Requirements ===\n* Get maximum faction with [[Faction ${i}|F${i}]]\n* Get maximum faction with [[Faction ${i}b]]\n=== Recommended Method ===\n# Kill [[Mob ${i}]] for ‘faction’\n# Turn in 200 [[Lion Delight]] and 3x [[Bone Chips]] via [[Some Quest]]\n`;
let posHtml = '<html><script>x</script><style>y</style><body><table>';
for (const [cls, npc, reward, items, rune] of P.BUILTIN_ROWS) {
  posHtml += `<h3>${reward.replace(/'/g, '&#039;')} ⚖</h3><p>Turn in to ${npc}.</p><div><span>${cls}</span> ${items.length || 1} items</div><tr><td>Turn in quest items</td><td>x</td></tr>`;
  for (const [it, loc] of items) posHtml += `<tr><td>${it.replace(/&/g, '&amp;')}</td><td>${loc}</td></tr>`;
  if (rune) posHtml += `<tr><td>Wind Rune ${rune}</td><td>Isle</td></tr>`;
}
posHtml += '</table></body></html>';
const guideWiki = "Intro text with [[Link|shown]] and {{Template}}.\n== Start ==\n'''Bold''' step one\n* bullet [[A]]\n== Rewards ==\n=== Sub ===\nYou get [[B]]&nbsp;x\n<ref>note</ref>\n";

let mode = 'ok';
global.fetch = async (url) => {
  const u = String(url);
  const json = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
  if (mode === 'down') return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
  if (/prop=revisions/.test(u)) return json({ query: {
    normalized: [{ from: 'User:Manlaan/Epic_Items_To_Keep', to: 'User:Manlaan/Epic Items To Keep' }],
    redirects: [{ from: "Alanna's Race Unlock Guide", to: "Alanna's Race Unlock Guide (new)" }],
    pages: { 1: { title: 'User:Manlaan/Epic Items To Keep', revisions: [{ timestamp: '2026-10-20T10:00:00Z' }] },
             2: { title: "Alanna's Race Unlock Guide (new)", revisions: [{ timestamp: mode === 'stale' ? '2026-10-21T00:00:00Z' : '2026-09-01T00:00:00Z' }] } } } });
  if (/eqlegendstools/.test(u)) return { ok: true, status: 200, text: async () => mode === 'thin' ? '<p>nothing</p>' : posHtml };
  const page = decodeURIComponent((/page=([^&]+)/.exec(u) || [])[1] || '');
  if (/Epic_Items/.test(page)) return json({ parse: { title: page, wikitext: { '*': mode === 'thin' ? '== Bard ==\n* [[X]]' : epicsWiki } } });
  if (/Race Unlock/.test(page)) return json({ parse: { title: page, wikitext: { '*': mode === 'stale' ? 'broken' : unlocksWiki } } });
  return json({ parse: { title: page, revid: 42, wikitext: { '*': guideWiki } } });
};

function make() {
  const state = { settings: { lastDataCheckAt: 0 }, gameDB: { epicsData: { data: { old: 1 } } }, saves: 0, setSaves: 0 };
  const api = require(path.join(dir, 'datasources.js')).create({
    getSettings: () => state.settings, saveSettings: () => state.setSaves++,
    getGameDB: () => state.gameDB, saveGameDBSoon: () => state.saves++, updater, BIS_CLASSES,
    refreshCachedPages: async () => { if (state.swap) state.settings = { replaced: true }; return { pages: 1 }; },
    refreshItemKnowledge: async () => { throw new Error('knowledge offline'); }
  });
  return { api, state };
}

(async () => {
  const { api } = make();
  const epics = api.parseEpicsWikitext(epicsWiki);
  ok(Object.keys(epics).length === 16, 'epics: every class section parsed');
  const bard = epics.Bard;
  ok(bard[0].n === E.EPICS.Bard.items[0].n && bard[0].q === 2, '"2x [[Item]]" quantity: ' + JSON.stringify(bard[0]));
  ok(bard[1].u === true && !/unverified/.test(bard[1].src), '(unverified) flag');
  ok(!bard.some(it => /Epic Quest$/.test(it.n)), 'the "[[X Epic Quest]]" header link is not an item');
  const unl = api.parseUnlocksWikitext(unlocksWiki);
  ok(Object.keys(unl).length === 36 && unl['Faction 3b'].needs['Lion Delight'] === 200 && unl['Faction 3b'].needs['Bone Chips'] === 3, 'unlock factions + turn-in totals');
  ok(!('Some Quest' in unl['Faction 3'].needs) && /→/.test(unl['Faction 3'].hint), 'quest links are not items; steps joined');
  const rows = api.parsePosText(api.htmlToTextStream(posHtml));
  ok(rows.length === P.BUILTIN_ROWS.length, 'Plane of Sky: every quest row read back (' + rows.length + ')');
  ok(JSON.stringify(rows) === JSON.stringify(P.BUILTIN_ROWS), 'Plane of Sky rows identical to the shipped ones');
  ok(api.sliceWikiSection(guideWiki, 'Rewards').includes('Sub') && !api.sliceWikiSection(guideWiki, 'Rewards').includes('step one'), 'guide: one section');
  ok(!/\[\[|\{\{|'''/.test(api.wikitextToText(guideWiki)), 'guide: wiki markup flattened');
  ok((await api.fetchGuidePage('Some Page')).revid === 42, 'guide page fetched');

  mode = 'ok';
  const fresh = await api.checkDataSources();
  ok(fresh.checks.length === 2 && fresh.checks[0].revised === '2026-10-20' && fresh.checks[0].stale === true, 'normalized title resolved, newer revision = stale');
  ok(fresh.checks[1].revised === '2026-09-01' && fresh.checks[1].stale === false, 'redirect resolved, older revision = fresh');

  let m = make(); let r = await m.api.updateQuestData();
  ok(r.epics.ok && r.epics.changed && r.unlocks.ok && r.pos.ok && r.pos.count === 95, 'update: all three sources refreshed');
  ok(m.state.gameDB.epicsData.data.Bard && m.state.gameDB.epicsData.revised === '2026-10-20', 'epics stored with the wiki revision date');
  ok(r.knowledge.error === 'knowledge offline' && r.cached.pages === 1, 'cached pages + knowledge errors reported, not thrown');
  ok(m.state.settings.lastDataCheckAt > 0 && m.state.settings.staleData.length === 0 && m.state.setSaves === 1 && m.state.saves === 1, 'settings + game DB saved');

  mode = 'thin'; m = make(); r = await m.api.updateQuestData();
  ok(r.epics.error && m.state.gameDB.epicsData.data.old === 1, 'a thin parse keeps the current epics data');
  ok(JSON.stringify(m.state.settings.staleData) === '["Epic checklists"]', 'stale + not refreshable is remembered');

  mode = 'down'; m = make(); r = await m.api.updateQuestData();
  ok(r.epics.error && r.unlocks.error && r.pos.error && !m.state.settings.lastDataCheckAt, 'offline: errors, check time not moved');

  mode = 'ok'; m = make(); m.state.swap = true; await m.api.updateQuestData();
  ok(m.state.settings.replaced && m.state.settings.lastDataCheckAt > 0, 'settings replaced mid-refresh: results land on the current settings');

  console.log(`datasources: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
