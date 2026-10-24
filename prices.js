// SEQO market prices: reads "WTS / WTB" offers out of chat and keeps a price
// history per item, so you can ask "what has a Blood Fire +4 gone for this week?"
// parseOffers() is shared (overlay + Node); createStore() is Node-only (main).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SEQOPrices = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // price: "2k", "2.5k", "1,500pp", "800 pp", "15kpp", "3K", "500p", "4k plat"
  const PRICE_RE = /(?:^|[\s(@:=\-–])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(kpp|kp|k|pp|p|plat(?:inum)?)?(?=$|[\s,.;)!/|]|ea\b|each\b)/gi;
  // how people say it: WTS / WTB / WTT, selling / sell, buying / buy, for sale,
  // want to sell / buy, LF (looking for = buying), FS, and the S> / B> shorthands
  const SIDE_RE = /(?:\b(wts|wtb|wtt|selling|sell|buying|buy|for sale|(?:want(?:ing)?|looking) to (?:sell|buy)|fs)\b|(?:^|\s)([sb])>)/gi;
  // plain "sell / buy / FS / want to… / looking to…" are everyday words ("trying to
  // sell that shield for 95k", "Buy one for 50k"): they only open an offer as the
  // FIRST word of a message, and never as "sell me / buy one". (LF is left out: in
  // real chat it's almost always groups or services.) WTS / WTB / selling / buying /
  // for sale / S> / B> count anywhere.
  const WEAK = /^(sell|buy|fs|(?:want(?:ing)?|looking) to (?:sell|buy))$/;
  const NOISE = /\b(wts|wtb|wtt|selling|sell|buying|buy|for sale|want to|lf|fs|pst|obo|or best offer|only|each|ea|price|cheap|now|lf|have|got|new|plus|also|paying|per|tell me|msg me|send tell|offers?|=\)|:\))\b/gi;

  function toPP(num, unit) {
    const n = parseFloat(String(num).replace(/,/g, ''));
    if (isNaN(n)) return null;
    const u = (unit || '').toLowerCase();
    if (u === 'k' || u === 'kp' || u === 'kpp') return Math.round(n * 1000);
    return Math.round(n);
  }
  function cleanItem(s) {
    let t = ' ' + s + ' ';
    t = t.replace(/[<>=~*`"]+(?![a-z])|\(.*?\)|\[|\]|-{1,2}>|<-{1,2}/g, ' ');
    t = t.replace(NOISE, ' ').replace(/\b(for|and|or|the|a|an|to|in|of the jewelry)\s*$/i, ' ');
    t = t.replace(/^\s*(for|and|or|my|a|an|some|my)\b/i, ' ');
    t = t.replace(/[\s:;,.!?/\\|&-]+$/g, '').replace(/^[\s:;,.!?/\\|&>-]+/g, '');
    return t.replace(/\s+/g, ' ').trim();
  }
  const keyOf = (item) => item.toLowerCase().replace(/[`’']/g, "'").replace(/\s+/g, ' ').trim();
  const looksLikeItem = (t) => t.length >= 3 && t.length <= 60 && /[a-z]{3}/i.test(t) && t.split(' ').length <= 9 &&
    !/\?|https?:|\b(anyone|who|where|need|lfg|guild|group|unlock quest)\b/i.test(t);

  // -> [{ side, item, key, pp, qty, each }]
  function parseOffers(text) {
    const msg = String(text || '');
    // cut the message into side-tagged chunks: "WTS a, b WTB c"
    const marks = [];
    let m;
    SIDE_RE.lastIndex = 0;
    while ((m = SIDE_RE.exec(msg))) {
      const w = (m[1] || m[2] || '').toLowerCase();
      if (WEAK.test(w) && (msg.slice(0, m.index).trim() || /^\s*(me|you|it|them|one|em)\b/i.test(msg.slice(m.index + m[0].length)))) continue;
      marks.push({ i: m.index, end: m.index + m[0].length, side: /^(wtb|buy|buying|b)$|to buy$/.test(w) ? 'buy' : w === 'wtt' ? 'trade' : 'sell' });
    }
    if (!marks.length) return [];
    const out = [];
    for (let k = 0; k < marks.length; k++) {
      if (marks[k].side === 'trade') continue;
      // asides never carry the asking price or the item: "(can provide +7)", "(1k a piece…"
      const chunk = msg.slice(marks[k].end, k + 1 < marks.length ? marks[k + 1].i : msg.length)
        .replace(/\([^)]*\)/g, ' ').replace(/\([^)]*$/, ' ');
      // walk the price tokens: the text since the previous price is what this price is for
      const prices = [];
      PRICE_RE.lastIndex = 0;
      while ((m = PRICE_RE.exec(chunk))) {
        const start = m.index + (m[0].length - m[0].replace(/^[\s(@:=\-–]/, '').length);
        const before = chunk.slice(Math.max(0, start - 1), start);
        if (before === '+' || before === 'x' || before === 'X') continue;                 // "+4" upgrade, "x5" quantity
        if (/^\s*x\b/i.test(chunk.slice(m.index + m[0].length))) continue;                // "24 x Bone Chips"
        if (!m[2] && toPP(m[1]) < 100) continue;                                            // a bare small number is not a price
        prices.push({ start, end: m.index + m[0].length, pp: toPP(m[1], m[2]) });
      }
      let from = 0;
      for (const p of prices) {
        // asides never name the item for sale: "(plat diamond ring, black sapphire necklace)"
        const seg = chunk.slice(from, p.start).replace(/\([^)]*\)/g, ' ').replace(/\([^)]*$/, ' ');
        const after = chunk.slice(p.end, p.end + 8);
        const each = /^\s*(each|ea)\b/i.test(after) || /\beach\b/i.test(seg);
        from = p.end;
        if (!p.pp || p.pp > 10000000) continue;
        // several items before one price: "Gem of Invigoration // Golden Hilt 2k Each"
        const parts = seg.split(/\s*(?:\/\/|,|;|\||\s\/\s|\s\+\s|\s&\s|\band\b)\s*/i).map(x => x.trim()).filter(Boolean);
        const items = [];
        for (const part of parts) {
          let qty = 1;
          // "x5", "5x", "5 x", and glued "Invigorationx2"
          const QTY = /\bx\s?(\d{1,5})\b|\b(\d{1,5})\s?x\b|(?<=[a-z])x(\d{1,4})\b/i;
          const q = QTY.exec(part);
          if (q) qty = +(q[1] || q[2] || q[3]);
          let rest = part.replace(QTY, ' ');
          // a leading count is a quantity too: "1 Fleeting Quiver", "3 Golden Hilts", "one more …"
          const lead = /^\s*(one more|\d+ more|\d{1,4}|one|two|three|another)\s+(?=[a-z])/i.exec(rest);
          if (lead) {
            const w = lead[1].toLowerCase(), num = { one: 1, two: 2, three: 3, another: 1, 'one more': 1 }[w] || parseInt(w, 10) || 1;
            if (qty === 1) qty = num;
            rest = rest.slice(lead[0].length);
          }
          const name = cleanItem(rest);
          if (looksLikeItem(name)) items.push({ name, qty });
        }
        if (!items.length) continue;
        if (items.length > 1 && !each) continue;            // a bundle price says nothing about each item
        for (const it of items) {
          const unit = it.qty > 1 && !each ? Math.round(p.pp / it.qty) : p.pp;
          out.push({ side: marks[k].side, item: it.name, key: keyOf(it.name), pp: unit, qty: it.qty, each: each || it.qty === 1 });
        }
      }
    }
    return out;
  }

  // ---------- store (Node / main process) ----------
  const DAY = 864e5;
  function createStore({ dir, max = 40000 }) {
    const fs = require('fs'), path = require('path');
    const file = () => path.join(dir(), 'prices.json');
    let rows = null, timer = null;
    function load() {
      if (rows) return rows;
      try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); rows = Array.isArray(j.rows) ? j.rows : []; } catch { rows = []; }
      return rows;
    }
    function flush() {
      clearTimeout(timer); timer = null;
      if (!rows) return;
      try { const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ v: 1, rows })); fs.renameSync(tmp, file()); }
      catch (e) { console.error('prices save failed:', e.message); }
    }
    // a seller repeating the same ad must not outweigh ten honest listings:
    // one row per seller + item + side + price per 6 hours
    const recent = new Map();
    function add(list) {
      const all = load();
      if (!recent.size) for (const r of all) recent.set(r.from + '|' + r.key + '|' + r.side + '|' + r.pp, r.t);
      let n = 0;
      for (const o of list || []) {
        if (!o || !o.key || !(o.pp > 0) || !o.t) continue;
        const k = o.from + '|' + o.key + '|' + o.side + '|' + o.pp;
        const last = recent.get(k);
        if (last != null && Math.abs(o.t - last) < 6 * 3600e3) continue;
        recent.set(k, o.t);
        all.push({ t: o.t, side: o.side, item: o.item, key: o.key, pp: o.pp, qty: o.qty || 1, from: String(o.from || '').slice(0, 40), raw: String(o.raw || '').slice(0, 200) });
        n++;
      }
      if (n) {
        all.sort((a, b) => a.t - b.t);
        if (all.length > max) all.splice(0, all.length - max);
        clearTimeout(timer); timer = setTimeout(flush, 3000);
      }
      return n;
    }
    function stats(list) {
      const v = list.map(r => r.pp).sort((a, b) => a - b);
      const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
      // trimmed mean: drop the top/bottom 10% so one joke price can't move it
      const cut = v.length >= 10 ? Math.floor(v.length * 0.1) : 0;
      const tv = v.slice(cut, v.length - cut);
      return { n: v.length, avg: Math.round(tv.reduce((a, b) => a + b, 0) / tv.length), median: Math.round(med), low: v[0], high: v[v.length - 1],
               sellers: new Set(list.map(r => r.from)).size, last: list[list.length - 1] };
    }
    // summary rows for the market list
    function query({ q, days, side = 'sell', limit = 200 } = {}) {
      const since = days ? Date.now() - days * DAY : 0;
      const qq = (q || '').toLowerCase().trim();
      const groups = new Map();
      for (const r of load()) {
        if (r.t < since || r.side !== side) continue;
        if (qq && !r.key.includes(qq)) continue;
        let g = groups.get(r.key);
        if (!g) groups.set(r.key, g = []);
        g.push(r);
      }
      for (const k of [...groups.keys()]) {
        const one = k.replace(/s$/, '');
        if (one !== k && groups.has(one)) { groups.get(one).push(...groups.get(k)); groups.get(one).sort((a, b) => a.t - b.t); groups.delete(k); }
      }
      return [...groups.entries()].map(([key, list]) => ({ key, item: list[list.length - 1].item, ...stats(list) }))
        .sort((a, b) => b.n - a.n || b.last.t - a.last.t).slice(0, limit);
    }
    function detail(key, days) {
      const since = days ? Date.now() - days * DAY : 0;
      const list = load().filter(r => (r.key === key || r.key === key + 's') && r.t >= since);
      const sell = list.filter(r => r.side === 'sell'), buy = list.filter(r => r.side === 'buy');
      return { key, sell: sell.length ? stats(sell) : null, buy: buy.length ? stats(buy) : null, recent: list.slice(-40).reverse() };
    }
    function count() { return load().length; }
    return { add, query, detail, flush, count };
  }

  return { parseOffers, toPP, keyOf, createStore };
});
