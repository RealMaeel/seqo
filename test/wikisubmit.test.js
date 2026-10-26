// wikisubmit.js: posting observed drop rates (sandbox page or mob talk pages), wiki faked.
const WS = require('../wikisubmit.js');
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

function make(settings) {
  const log = [], sent = [];
  const w = WS.create({ getSettings: () => settings, updater: mkUpdater(log), getWin: () => ({ webContents: { send: (_c, p) => sent.push(p) } }), sleep: async () => {} });
  return { w, log, sent };
}
(async () => {
  let m = make({ wikiUser: '', wikiPass: '' });
  ok(/bot password/.test((await m.w.wikiSubmit({ mode: 'sandbox', fullText: 'x' })).error) && !m.log.length, 'no credentials: nothing sent');
  m = make({ wikiUser: 'Maeel@seqo', wikiPass: 'pw' });
  let r = await m.w.wikiSubmit({ mode: 'sandbox', fullText: 'ALL' });
  ok(r.edited === 1 && r.user === 'Maeel' && r.url === 'https://eqlwiki.com/User:Maeel/SEQO Drop Data', 'sandbox page');
  const mobs = Array.from({ length: 33 }, (_, i) => ({ mob: i === 2 ? 'bad mob' : 'mob ' + i, text: 'rates ' + i }));
  m = make({ wikiUser: 'Maeel@seqo', wikiPass: 'pw' });
  r = await m.w.wikiSubmit({ mode: 'talk', perMob: mobs });
  ok(r.edited === 29 && r.results.length === 30 && /bad mob ⚠ protected page/.test(r.results[2]), 'talk pages: at most 30, a failure is reported per mob');
  ok(m.log.filter((x) => x.startsWith('edit Talk:Mob 0 §')).length === 1, 'new section on the capitalized talk page');
  ok(m.sent.length === 30 && m.sent[29].done === 30 && m.sent[29].total === 30, 'progress after every mob');
  m = make({ wikiUser: 'Maeel@seqo', wikiPass: 'bad' });
  ok((await m.w.wikiSubmit({ mode: 'sandbox' })).error === 'Login failed', 'login failure reported');
  console.log(`wikisubmit: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
