// SEQO — your own kill records for one mob (v2.7), from the loot DB.
// Works for every mob you've killed, wiki page or not. Shared by main.js
// (Lookup search) and the dock's 🗡 kill card, which also copies the numbers
// for game chat or Discord so you can share them with your group.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLMobStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const norm = (s) => String(s || '').toLowerCase().replace(/[`’]/g, "'").trim();

  function pct(count, kills) {
    if (!kills) return '—';
    const p = count / kills * 100;
    return (p >= 10 ? Math.round(p) : p.toFixed(1)) + '%';
  }

  // every loot-DB entry for this mob name (one per zone it was killed in)
  function find(lootDB, name) {
    const want = norm(name);
    const zones = [];
    for (const m of Object.values((lootDB && lootDB.mobs) || {})) {
      if (norm(m.name) !== want || !(m.kills > 0 || Object.keys(m.drops || {}).length)) continue;
      const drops = Object.values(m.drops || {})
        .map((d) => ({ name: d.name, count: d.count, rate: pct(d.count, m.kills) }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      zones.push({
        zone: m.zone || '', kills: m.kills || 0, drops,
        level: m.level || null, maxHit: m.maxHit || 0,
        avgHit: m.hitCount ? Math.round((m.hitTotal || 0) / m.hitCount) : 0,
        spells: (m.spells || []).slice(),
        // each kill (2.7): when it happened, and how many seconds it took when known
        times: (m.killTimes || []).map((k) => (typeof k === 'number' ? { t: k } : k)).sort((a, b) => a.t - b.t)
      });
    }
    if (!zones.length) return null;
    zones.sort((a, b) => b.kills - a.kills);
    const display = Object.values(lootDB.mobs).find((m) => norm(m.name) === want).name;
    return { name: display, kills: zones.reduce((s, z) => s + z.kills, 0), zones };
  }

  // every mob you've killed whose name contains q (Lookup search)
  function search(lootDB, q, cap = 15) {
    const want = norm(q);
    if (!want) return [];
    const by = new Map();
    for (const m of Object.values((lootDB && lootDB.mobs) || {})) {
      if (!m.kills || !norm(m.name).includes(want)) continue;
      const k = norm(m.name);
      const e = by.get(k) || { name: m.name, kills: 0, items: 0, zones: [] };
      e.kills += m.kills;
      e.items += Object.values(m.drops || {}).reduce((s, d) => s + d.count, 0);
      if (m.zone && !e.zones.includes(m.zone)) e.zones.push(m.zone);
      by.set(k, e);
    }
    return [...by.values()].sort((a, b) => b.kills - a.kills).slice(0, cap);
  }

  // all the "Mote of …" drops as one "Motes" entry, so the chat line has room for the real loot
  function chatDrops(z) {
    const motes = z.drops.filter((d) => /^Mote of /i.test(d.name));
    if (motes.length < 2) return z.drops;
    const n = motes.reduce((s, d) => s + d.count, 0);
    return z.drops.filter((d) => !/^Mote of /i.test(d.name))
      .concat({ name: 'Motes', count: n, rate: pct(n, z.kills) })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  // one line for game chat (kept under the chat box limit)
  function chatLine(card, max = 240) {
    if (!card) return '';
    const z = card.zones[0];
    const head = card.name + (z.zone ? ' (' + z.zone + ')' : '') + ', ' + z.kills + ' kills: ';
    if (!z.drops.length) return head + 'no drops seen';
    const drops = chatDrops(z);
    let out = head;
    let shown = 0;
    for (const d of drops) {
      const part = (shown ? ' · ' : '') + d.name + ' ' + d.count + '/' + z.kills + ' ' + d.rate;
      const rest = drops.length - shown - 1;
      if ((out + part + (rest ? ' · +' + rest + ' more' : '')).length > max && shown) {
        out += ' · +' + (drops.length - shown) + ' more';
        return out;
      }
      out += part; shown++;
    }
    return out;
  }

  // a Discord / forum post: a fenced block keeps the columns lined up
  function markdown(card) {
    if (!card) return '';
    const L = ['**' + card.name + '** — my kills (SEQO)'];
    for (const z of card.zones) {
      L.push('');
      const info = [];
      if (z.level) info.push('level ' + z.level);
      if (z.maxHit) info.push('max hit ' + z.maxHit + (z.avgHit ? ', avg ' + z.avgHit : ''));
      L.push((z.zone || 'unknown zone') + ' · ' + z.kills + ' kill' + (z.kills === 1 ? '' : 's') + (info.length ? ' · ' + info.join(' · ') : ''));
      if (!z.drops.length) L.push('no drops seen');
      else {
        const w = Math.min(40, Math.max(4, ...z.drops.map((d) => d.name.length)));
        L.push('```');
        L.push('Item'.padEnd(w) + '  Drops   Rate');
        for (const d of z.drops)
          L.push(d.name.slice(0, w).padEnd(w) + '  ' + (d.count + '/' + z.kills).padStart(5) + '  ' + d.rate.padStart(5));
        L.push('```');
      }
      if (z.spells.length) L.push('Casts: ' + z.spells.join(', '));
      const sp = killSpeed(z);
      if (sp) L.push('Time to kill: ' + fmtSecs(sp.avg) + ' average, fastest ' + fmtSecs(sp.fastest) + ' (' + sp.n + ' kill' + (sp.n === 1 ? '' : 's') + ')');
      const tc = tierCounts(z);
      if (tc.length) L.push('By difficulty: ' + tc.map(({ d, n }) => {
        const s = killSpeed(z, d == null ? '?' : d);
        return tierLabel(d) + ' ' + n + ' kill' + (n === 1 ? '' : 's') + (s ? ', ' + fmtSecs(s.avg) + ' avg, best ' + fmtSecs(s.fastest) : '');
      }).join(' · '));
      const bm = byMakeup(z).slice(0, 4);
      if (bm.length) L.push('Fastest by class makeup: ' + bm.map((m) => m.c + (m.g != null ? ' ' + soloGroup(m.g) : '') + ' ' + fmtSecs(m.best) +
        (m.n > 1 ? ' (avg ' + fmtSecs(m.avg) + ', ' + m.n + ' kills)' : '')).join(' · '));
      const rk = recentKills(z, 5);
      if (rk.length) L.push('Recent kills: ' + rk.map((k) => {
        const d = new Date(k.t);
        const bits = [];
        if (k.secs != null) bits.push('killed in ' + fmtSecs(k.secs));
        if (k.c || k.g != null) bits.push([k.c, soloGroup(k.g)].filter(Boolean).join(' '));
        if (k.gapMin != null && k.gapMin <= 2880) bits.push(fmtGap(k.gapMin) + ' after the one before');
        return (tc.length ? '[' + tierLabel(k.d) + '] ' : '') + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
          (bits.length ? ' (' + bits.join(', ') + ')' : '');
      }).join(' · '));
    }
    return L.join('\n');
  }

  // difficulty tier (2.7): "You have entered Nektropos Castle 3 (Refined)." — the
  // parenthetical is the tier. D0 = base (no tier word), D1 Awakened … D4 Refined.
  const TIER_WORDS = ['Awakened', 'Adaptive', 'Fused', 'Refined'];
  function tierNum(variant) {
    const v = String(variant || '');
    for (let i = 0; i < TIER_WORDS.length; i++) if (new RegExp('\\b' + TIER_WORDS[i] + '\\b', 'i').test(v)) return i + 1;
    return 0;
  }
  const tierLabel = (d) => (d == null ? 'D?' : 'D' + d);
  // only the kills on one tier (tier null/undefined = all of them)
  const onTier = (zone, tier) => {
    const a = (zone && zone.times) || [];
    return tier == null ? a : a.filter((k) => (tier === '?' ? k.d == null : k.d === tier));
  };
  // how many kills per tier: [{ d: 0..4 or null, n }] in tier order, unknown last.
  // Empty when no kill was on a tier above D0 (open-world mobs: nothing to split).
  function tierCounts(zone) {
    const by = new Map();
    for (const k of (zone && zone.times) || []) by.set(k.d == null ? null : k.d, (by.get(k.d == null ? null : k.d) || 0) + 1);
    if (![...by.keys()].some((d) => d > 0)) return [];
    return [...by].map(([d, n]) => ({ d, n })).sort((a, b) => (a.d == null ? 9 : a.d) - (b.d == null ? 9 : b.d));
  }

  // the most recent kills, newest first, each with the gap since the kill before it
  // (that gap is what a respawn looks like): [{ t, secs, d, gapMin|null }]
  function recentKills(zone, n = 10, tier) {
    const a = onTier(zone, tier);
    const out = [];
    for (let i = a.length - 1; i >= 0 && out.length < n; i--)
      out.push({ ...extra(a[i]), gapMin: i > 0 ? Math.round((a[i].t - a[i - 1].t) / 60000) : null });
    return out;
  }
  // one kill as the card / post shows it: c = your class makeup, g = 1 group / 0 solo (null = not noted)
  const extra = (k) => ({ t: k.t, secs: k.s != null ? k.s : null, d: k.d != null ? k.d : null, c: k.c || '', g: k.g != null ? k.g : null });
  const soloGroup = (g) => (g === 1 ? 'group' : g === 0 ? 'solo' : '');
  // time to kill per class makeup (+ solo/group), best first: [{ c, g, n, avg, best }]
  function byMakeup(zone, tier) {
    const by = new Map();
    for (const k of onTier(zone, tier)) {
      if (!k.c || !(k.s > 0)) continue;
      const key = k.c + '\u0001' + (k.g != null ? k.g : '');
      const e = by.get(key) || { c: k.c, g: k.g != null ? k.g : null, s: [] };
      e.s.push(k.s); by.set(key, e);
    }
    return [...by.values()].map((e) => ({ c: e.c, g: e.g, n: e.s.length, avg: Math.round(e.s.reduce((a, b) => a + b, 0) / e.s.length), best: Math.min(...e.s) }))
      .sort((a, b) => a.best - b.best);
  }
  // the quickest kills (only ones with a time to kill), fastest first: [{ t, secs, d, c, g }]
  function fastestKills(zone, n = 10, tier) {
    return onTier(zone, tier).filter((k) => k.s != null && k.s > 0)
      .slice().sort((a, b) => a.s - b.s || b.t - a.t).slice(0, n)
      .map((k) => ({ ...extra(k), gapMin: null }));
  }
  // how long kills took: "1:25" per kill, plus the average/fastest over all known
  function fmtSecs(s) { return s == null ? '' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function killSpeed(zone, tier) {
    const s = onTier(zone, tier).map((k) => k.s).filter((x) => x != null && x > 0);
    if (!s.length) return null;
    return { n: s.length, avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length), fastest: Math.min(...s), slowest: Math.max(...s) };
  }
  function fmtGap(min) {
    if (min == null) return '';
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), m = min % 60;
    if (h >= 48) return Math.round(h / 24) + ' days';
    return h + 'h' + (m ? ' ' + String(m).padStart(2, '0') + 'm' : '');
  }

  return { find, search, chatLine, markdown, pct, recentKills, fmtGap, fmtSecs, killSpeed, tierNum, tierLabel, tierCounts, fastestKills, byMakeup, soloGroup };
});
