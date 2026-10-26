// SEQO overlay — going rates (WTS/WTB), progress (skill-ups, faction), consider card.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ---- 📈 market prices: WTS / WTB offers read from chat ----
  const PR = window.SEQOPrices;
  const MARKET_CH = new Set(['chan', 'auction', 'shout', 'ooc', 'say']);
  let pricePending = [], priceMed = new Map();   // key -> 30-day median ask (for the consider card)
  function notePrices(ev) {
    if (!PR || ev.type !== 'chat' || !MARKET_CH.has(ev.channel) || ev.from === 'You') return;
    for (const o of PR.parseOffers(ev.text)) pricePending.push({ ...o, t: ev.when || Date.now(), from: ev.from, raw: ev.text });
  }
  setInterval(() => {
    if (!pricePending.length) return;
    try { window.overlay.pricesAdd(pricePending); } catch { /* main not ready */ }
    pricePending = [];
  }, 4000);
  let priceName = new Map();   // key -> display name, for Lookup search
  async function refreshPriceMed() {
    try {
      const r = await window.overlay.pricesQuery({ days: 30, limit: 5000 });
      priceMed = new Map(((r && r.rows) || []).map(x => [x.key, x.median]));
      priceName = new Map(((r && r.rows) || []).map(x => [x.key, x.item]));
    } catch { /* no store yet */ }
  }
  setTimeout(refreshPriceMed, 4000);
  setInterval(refreshPriceMed, 10 * 60000);
  const ppText = (pp) => pp == null ? '?' : pp >= 1000 ? (pp / 1000).toFixed(pp % 1000 && pp < 100000 ? 1 : 0).replace(/\.0$/, '') + 'k' : pp + 'pp';
  // the going rate for an item: 30-day median asking price, "" when unknown
  const priceTag = (item) => { if (!PR) return ''; const v = priceMed.get(PR.keyOf(item)); return v ? '~' + ppText(v) : ''; };

  // ---- 📈 progress this session: skill-ups and faction changes ----
  const progSkills = new Map();    // skill -> { from, to, n }
  const progFactions = new Map();  // faction -> { net, n, capped }
  function noteProgress(ev) {
    if (ev.type === 'skillup') {
      const e = progSkills.get(ev.skill) || { from: ev.value - 1, to: ev.value, n: 0 };
      e.to = Math.max(e.to, ev.value); e.n++; progSkills.set(ev.skill, e);
      if (activeTab === 'breakdown' && bMode === 'session') breakdownDirty = true;
    } else if (ev.type === 'faction') {
      const e = progFactions.get(ev.faction) || { net: 0, n: 0, capped: '' };
      e.net += ev.delta; e.n++; if (ev.capped) e.capped = ev.capped; progFactions.set(ev.faction, e);
      if (activeTab === 'breakdown' && bMode === 'session') breakdownDirty = true;
    }
  }
  function progressRows() {
    return {
      skills: [...progSkills.entries()].map(([k, e]) => ({ k, from: e.from, to: e.to, n: e.n })).sort((a, b) => b.n - a.n),
      factions: [...progFactions.entries()].map(([k, e]) => ({ k, net: e.net, n: e.n, capped: e.capped })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    };
  }
  function renderProgress(rowsEl) {
    const p = progressRows();
    if (!p.skills.length && !p.factions.length) return;
    const dv = document.createElement('div');
    dv.className = 'l-divider'; dv.style.marginTop = '6px';
    dv.textContent = '📈 Progress this session';
    rowsEl.appendChild(dv);
    const line = (txt, title, color) => { const d = document.createElement('div'); d.className = 'q-it'; d.style.cursor = 'default'; d.innerHTML = '<span class="nm" style="white-space:normal"></span>'; d.querySelector('.nm').textContent = txt; if (color) d.querySelector('.nm').style.color = color; if (title) d.title = title; rowsEl.appendChild(d); };
    if (p.skills.length) line('Skills: ' + p.skills.map(s => s.k + ' ' + s.from + '→' + s.to).join(' · '), p.skills.reduce((a, s) => a + s.n, 0) + ' skill-ups');
    for (const f of p.factions.slice(0, 12))
      line((f.net > 0 ? '▲ ' : f.net < 0 ? '▼ ' : '■ ') + f.k + ' ' + (f.net > 0 ? '+' : '') + f.net + (f.capped ? ' (maxed ' + (f.capped === 'better' ? 'ally' : 'out') + ')' : ''),
        f.n + ' changes this session', f.net > 0 ? '#7dffa0' : f.net < 0 ? '#ff9d9d' : '#aab');
  }

  // ---- 🔎 consider card: what SEQO knows about the mob you just /con'd ----
  let conTimer = null;
  function showConsiderCard(ev) {
    if (!(settings && settings.considerCard === true)) return;   // off unless you turn it on
    const card = $('con-card');
    const mk = mobKey(ev.mob);
    const low = mk.toLowerCase();
    const recs = Object.values((lootDB && lootDB.mobs) || {}).filter(m => (m.name || '').toLowerCase() === low);
    const here = recs.find(m => m.zone === lootZone()) || recs[0] || null;
    const kills = recs.reduce((a, m) => a + (m.kills || 0), 0);
    const drops = new Map();
    for (const m of recs) for (const d of Object.values(m.drops || {})) drops.set(d.name, (drops.get(d.name) || 0) + (d.count || 0));
    for (const n of (zoneData && zoneData.named) || [])
      if (mobKey(n.mob).toLowerCase() === low) for (const d of n.drops || []) if (!drops.has(d.item)) drops.set(d.item, null);
    const maxHit = recs.reduce((a, m) => Math.max(a, m.maxHit || 0), 0);
    const hitAvg = recs.reduce((a, m) => a + (m.hitTotal || 0), 0) / (recs.reduce((a, m) => a + (m.hitCount || 0), 0) || 1);
    const spells = [...new Set(recs.flatMap(m => m.spells || []))];
    const resp = resolveRespawn(mk);
    card.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:6px;align-items:baseline';
    const nm = document.createElement('span'); nm.style.cssText = 'color:#ffd766;font-weight:600;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    nm.textContent = mk + (ev.level ? ' · L' + ev.level : '');
    const x = document.createElement('span'); x.textContent = '✕'; x.style.cssText = 'cursor:pointer;color:#778';
    x.addEventListener('click', () => { card.style.display = 'none'; });
    head.append(nm, x);
    card.appendChild(head);
    const add = (txt, color) => { const d = document.createElement('div'); d.textContent = txt; if (color) d.style.color = color; d.style.marginTop = '2px'; card.appendChild(d); return d; };
    const tags = [ev.rare || isRareMob(mk) ? '⭐ rare' : '', ev.aggro ? '⚠ aggressive' : '', ev.difficulty || ''].filter(Boolean);
    if (tags.length) add(tags.join(' · '), ev.aggro ? '#ffb27d' : '#aab');
    if (kills || maxHit) add('Seen: ' + [kills ? kills + ' kill' + (kills > 1 ? 's' : '') : '', maxHit ? 'max hit ' + fmt(maxHit) + (hitAvg > 1 ? ', avg ' + fmt(hitAvg) : '') : ''].filter(Boolean).join(' · '));
    if (resp && resp.s) add('Respawn: ' + fmtDur(resp.s) + respMark(resp));
    if (spells.length) add('Casts: ' + spells.slice(0, 6).join(', ') + (spells.length > 6 ? '…' : ''));
    // drops, with what you still need flagged first
    if (drops.size) {
      const rows = [...drops.entries()].map(([item, n]) => {
        const v = lootVerdict(item);
        const need = (v.kind === 'wish' || v.kind === 'keep') && !invHas(item);
        return { item, n, need, why: v.reason, pct: n != null && kills ? Math.round(n * 100 / kills) : null, pp: PR ? priceMed.get(PR.keyOf(item)) : null };
      }).sort((a, b) => (b.need - a.need) || ((b.n || 0) - (a.n || 0)));
      add('Drops' + (kills ? ' (your ' + kills + ' kills)' : ' (wiki)') + ':', '#99a');
      for (const r of rows.slice(0, 7)) {
        const d = add((r.need ? '🎯 ' : '· ') + r.item + (r.pct != null ? ' ' + r.pct + '%' : '') + (r.pp ? ' · ~' + ppText(r.pp) : ''), r.need ? '#7dffa0' : '#ccd');
        d.style.cursor = 'pointer';
        d.title = r.need ? 'You still need this — ' + r.why : 'Click for the item card';
        d.addEventListener('click', () => openItem(r.item));
      }
    } else if (!kills) add('No kills or drops recorded for this mob yet.', '#778');
    card.style.display = 'flex';
    clearTimeout(conTimer);
    conTimer = setTimeout(() => { if (!card.matches(':hover')) card.style.display = 'none'; }, 15000);
  }

