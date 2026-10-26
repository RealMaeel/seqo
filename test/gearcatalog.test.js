// gearcatalog.js: the Class tab's gear catalog build (full and incremental), wiki faked.
const GC = require('../gearcatalog.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
function mkUpdater(log, opt = {}) {
  const pages = {};
  for (let i = 0; i < 130; i++) pages['Item ' + i] = 'text ' + i;
  return {
    UA: 'x', WIKI_PAGE: (t) => 'https://eqlwiki.com/' + t,
    getRecentChangeTitles: async () => { log.push('rc'); if (opt.rc === 'throw') throw new Error('rc down'); return opt.rc; },
    fetchPagesContent: async (titles) => { log.push('fetch ' + titles.length); return Object.fromEntries(titles.map(t => [t, pages[t] || 'new'])); },
    parseGearPage: (title, text, future) => {
      const n = +title.split(' ')[1];
      if (n % 7 === 0) return null;                                       // not gear
      if (n % 11 === 0) return { future: 'Banner ' + (n % 2), entry: { n: title } };
      return { n: title, s: text, fut: future.size };
    },
    getEraBanners: async () => { if (opt.banners === 'throw') throw new Error('no banners'); return { future: new Set(['Banner 0', 'Banner 1']), all: new Set(['Banner 0', 'Banner 1', 'Banner 2']) }; },
    getAllCategoryMembers: async (_c, cb) => { cb(50); return opt.noItems ? [] : Array.from({ length: 130 }, (_, i) => 'Item ' + i); },
    wikiLogin: async (u, p) => { log.push('login ' + u); if (p === 'bad') throw new Error('Login failed'); return u.split('@')[0]; },
    getCsrfToken: async () => 'tok',
    wikiEdit: async (o) => { log.push('edit ' + o.title + (o.newSectionTitle ? ' §' : '')); if (/Bad/.test(o.title)) throw new Error('protected page'); }
  };
}

function make(prior, inv, opt) {
  const log = [], sent = [];
  const st = { gameDB: { gearCatalog: prior ? { built: 1, items: [{ n: 'Item 3', s: 'old' }, { n: 'Item 14', s: 'old' }, { n: 'Item 1', s: 'old' }], futureBanners: ['Banner 1'] } : undefined }, saves: 0 };
  const g = GC.create({ getGameDB: () => st.gameDB, saveGameDBSoon: () => st.saves++, updater: mkUpdater(log, opt),
    getGameData: () => ({ inventory: inv }), getWin: () => ({ webContents: { send: (_c, m) => sent.push(m) } }) });
  return { g, st, log, sent };
}
(async () => {
  let m = make(null, { items: { 'item 22': {} } }, {});
  const first = m.g.buildGearCatalog();
  ok((await m.g.buildGearCatalog()).error === 'a catalog build is already running', 'one build at a time');
  let r = await first;
  ok(r.items === 106 && r.pages === 130 && r.skipped === 19 && r.reinstated === 5, 'full build: ' + JSON.stringify(r));
  ok(m.st.gameDB.gearCatalog.futureBanners.join() === 'Banner 1', 'a "future" banner you own an item from counts as current');
  ok(m.st.saves === 1 && m.sent[m.sent.length - 1] === '' && m.sent.some((x) => /Reading item pages/.test(x)), 'saved once, progress shown then cleared');
  ok(!m.g.isBuilding(), 'done building');

  m = make(null, null, { noItems: true });
  ok((await m.g.buildGearCatalog()).error === 'the wiki returned no item list' && !m.g.isBuilding(), 'empty wiki: error, lock released');

  m = make(true, null, { rc: [] });
  r = await m.g.buildGearCatalog();
  ok(r.unchanged && r.items === 3 && m.st.gameDB.gearCatalog.built > 1, 'nothing changed: just re-stamped');

  m = make(true, null, { rc: ['Item 3', 'Item 14', 'Item 21', 'Brand New 5', 'Item 33'] });
  r = await m.g.buildGearCatalog();
  const names = m.st.gameDB.gearCatalog.items.map((i) => i.n).sort().join();
  ok(r.incremental && r.updated === 1 && r.added === 1 && r.dropped === 1, 'incremental counts: ' + JSON.stringify(r));
  ok(names === 'Brand New 5,Item 1,Item 3', 'incremental: changed page re-read, no-longer-gear dropped, new one added: ' + names);

  m = make(true, null, { rc: 'throw' });
  ok((await m.g.buildGearCatalog()).pages === 130, 'recent-changes unavailable: falls back to a full build');
  m = make(true, null, { rc: [] });
  ok((await m.g.buildGearCatalog({ full: true })).pages === 130, '{ full: true } forces a full build');

  console.log(`gearcatalog: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
