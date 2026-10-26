// SEQO — the Cleanup window's three ways to list your stored items (v2.7):
//   all       one row per item, A–Z, with every place it's stored in the Location column
//   location  A–Z inside 🎒 Bags / 📦 Character storage / 🏦 Bank / 🤝 Shared bank
//   category  A–Z inside 🛡 Gear / 📌 Tracked (Epic, Plane of Sky, Spell quest, Unlock) /
//             📜 Quest / ⚒ Tradeskill / 📦 Misc
// Every row reads Item · Location · Category · Use · Source. Pure (no DOM): the dock
// draws what this returns. The overlay's cleanup engine (13-cleanup.js) fills each
// row's cat / track / src; rows: { name, count, by: { bags, depot, stored, bank, shared }, pile, reason, cat, track, src, url }

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLCleanupView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LOCS = [['bags', '🎒 Bags'], ['depot', '📦 Character storage'], ['bank', '🏦 Bank'], ['shared', '🤝 Shared bank']];
  const LOC_SHORT = { bags: 'Bags', depot: 'Storage', bank: 'Bank', shared: 'Shared bank' };
  const CATS = [['gear', '🛡 Gear'], ['tracked', '📌 Tracked quest items'], ['quest', '📜 Quest items'], ['tradeskill', '⚒ Tradeskill'], ['misc', '📦 Misc']];
  const CAT_SHORT = { gear: 'Gear', tracked: 'Tracked', quest: 'Quest', tradeskill: 'Tradeskill', misc: 'Misc' };
  const TRACK_ORDER = ['Epic', 'Plane of Sky', 'Spell quest', 'Unlock'];
  const VIEWS = [['all', 'All items'], ['location', 'By location'], ['category', 'By category']];

  // how many of this item sit in one place (the depot's gear tab counts as character storage)
  function locCount(r, loc) {
    const by = (r && r.by) || {};
    if (loc === 'depot') return (by.depot || 0) + (by.stored || 0);
    return by[loc] || 0;
  }
  // "Bags ×2 · Bank" — every place it's stored
  function locText(r) {
    return LOCS.map(([k]) => [k, locCount(r, k)]).filter(([, n]) => n > 0)
      .map(([k, n]) => LOC_SHORT[k] + (n > 1 ? ' ×' + n : '')).join(' · ');
  }
  function catText(r) {
    const c = CAT_SHORT[r && r.cat] || 'Misc';
    return r && r.cat === 'tracked' && r.track ? c + ' · ' + r.track : c;
  }
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true });

  // filter: text (name, use, category, source) + verdict pile ('all' | 'need' | 'gear' | 'unk' | 'done')
  function filterRows(rows, q, pile) {
    const s = String(q || '').trim().toLowerCase();
    return (rows || []).filter((r) => (!pile || pile === 'all' || r.pile === pile) &&
      (!s || [r.name, r.reason, catText(r), r.src, locText(r)].some((x) => String(x || '').toLowerCase().includes(s))));
  }

  // → [{ key, label, rows, loc? }] in display order; empty groups left out
  function group(rows, view) {
    const list = (rows || []).slice().sort(byName);
    if (view === 'location') {
      return LOCS.map(([k, label]) => ({ key: k, label, loc: k, rows: list.filter((r) => locCount(r, k) > 0) }))
        .filter((g) => g.rows.length);
    }
    if (view === 'category') {
      const out = [];
      for (const [k, label] of CATS) {
        const inCat = list.filter((r) => (CAT_SHORT[r.cat] ? r.cat : 'misc') === k);
        if (!inCat.length) continue;
        if (k !== 'tracked') { out.push({ key: k, label, rows: inCat }); continue; }
        // tracked items split by tracker: Epic, Plane of Sky, Spell quest, Unlock
        const first = (r) => String(r.track || '').split(' + ')[0] || 'Other';
        const tracks = [...new Set(inCat.map(first))]
          .sort((a, b) => (TRACK_ORDER.indexOf(a) + 1 || 99) - (TRACK_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
        for (const t of tracks) out.push({ key: 'tracked:' + t, label: '📌 Tracked — ' + t, rows: inCat.filter((r) => first(r) === t) });
      }
      return out;
    }
    return list.length ? [{ key: 'all', label: '', rows: list }] : [];
  }

  return { LOCS, CATS, VIEWS, locCount, locText, catText, filterRows, group };
});
