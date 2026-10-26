// SEQO overlay — session history: snapshots, runs, bests, compare, export.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ---- session history: this play session + every ended run, saved to disk ----
  const hist = { start: Date.now(), kills: 0, levels: 0, items: 0, motes: 0, zones: [], deaths: [] };
  function noteHistory(ev) {
    if (ev.type === 'death' && ev.target !== 'You') hist.kills++;
    else if (ev.type === 'levelup') hist.levels++;
    else if (ev.type === 'loot') { hist.items++; if (/\bmote\b/i.test(ev.item || '')) hist.motes++; }
    else if (ev.type === 'zone') {
      const z = cleanZoneName(ev.zone);
      if (z && hist.zones[hist.zones.length - 1] !== z && !hist.zones.includes(z)) hist.zones.push(z);
    }
  }
  function sessionSnapshot() {
    const sources = [...session.sources.entries()].map(([source, e]) => ({ source, total: e.total, count: e.count, crits: e.crits, max: e.max }))
      .sort((a, b) => b.total - a.total).slice(0, 12);
    const petDmg = [...session.pets.values()].reduce((a, b) => a + b, 0);
    const group = [...session.players.entries()].filter(([n]) => !petNames.has(n))
      .map(([n, p]) => ({ n, total: p.total })).sort((a, b) => b.total - a.total).slice(0, 8);
    return {
      id: 's-' + hist.start, type: 'session', start: hist.start, end: Date.now(), char: charName || '',
      zones: hist.zones.slice(0, 20), fights: session.fights, durS: session.durS,
      dmg: session.total, dps: session.durS ? session.total / session.durS : 0,
      maxHit: sources.reduce((m, s) => Math.max(m, s.max || 0), 0), petDmg, sources, group,
      stances: stanceRows().map(r => ({ n: r.n, dps: r.dps, ms: r.ms, dmg: r.dmg })),
      xpPct: xp.pct, levels: hist.levels, aa: xp.aaGained, kills: hist.kills,
      coin: sessionCoin, items: hist.items, motes: hist.motes, deaths: hist.deaths.slice(0, 30),
      skills: progressRows().skills.slice(0, 30), factions: progressRows().factions.slice(0, 30),
      healed: [...healSession.entries()].map(([n, a]) => ({ n, total: a.total, pot: a.pot })).sort((a, b) => b.total - a.total).slice(0, 8)
    };
  }
  function checkpointHistory() {
    if (!session.fights && !sessionCoin && !hist.kills && !hist.items && !xp.pct && !progSkills.size) return;  // nothing worth saving yet
    try { window.overlay.historyUpsert(sessionSnapshot()); } catch { /* main not ready */ }
  }
  setInterval(checkpointHistory, 60000);
  window.addEventListener('beforeunload', checkpointHistory);
  function saveRunToHistory(r) {
    const items = [...r.items.entries()].sort((a, b) => b[1] - a[1]);
    const motes = items.filter(([n]) => /\bmote\b/i.test(n)).reduce((a, [, c]) => a + c, 0);
    try {
      window.overlay.historyUpsert({
        id: 'r-' + r.startedAt, type: 'run', start: r.startedAt, end: r.endedAt, char: charName || '',
        zones: currentZone ? [currentZone] : [], coin: r.coin, items: items.reduce((a, [, c]) => a + c, 0), motes,
        itemList: items.slice(0, 25).map(([n, c]) => ({ n, c })), rares: [...(r.rares ? r.rares.keys() : [])]
      });
    } catch { /* main not ready */ }
  }

  // History view
  let histList = [], histFilter = 'all', histSel = new Set(), histOpen = null;
  const histMins = (e) => Math.max(0, Math.round(((e.end || 0) - (e.start || 0)) / 60000));
  const perHr = (v, e) => { const h = ((e.end || 0) - (e.start || 0)) / 3600000; return h > 0.05 ? v / h : null; };
  async function openHistory() {
    checkpointHistory();
    await new Promise(r => setTimeout(r, 150));
    try { histList = (await window.overlay.historyList()) || []; } catch { histList = []; }
    if (!Array.isArray(histList)) histList = [];
    $('hist-modal').style.display = 'flex';
    renderHistory();
  }
  function histShown() { return histList.filter(e => histFilter === 'all' || e.type === histFilter); }
  function renderHistory() {
    const fb = $('hist-filter'); fb.innerHTML = '';
    for (const [k, label] of [['all', 'All'], ['session', 'Sessions'], ['run', 'Runs']]) {
      const c = document.createElement('span');
      c.className = 'qview-chip' + (histFilter === k ? ' active' : '');
      c.textContent = label;
      c.addEventListener('click', () => { histFilter = k; renderHistory(); });
      fb.appendChild(c);
    }
    const shown = histShown();
    // personal bests across everything saved
    const sess = histList.filter(e => e.type === 'session');
    const best = (arr, f) => arr.reduce((b, e) => (f(e) || 0) > (b ? f(b) || 0 : 0) ? e : b, null);
    const bd = best(sess.filter(e => (e.durS || 0) >= 60), e => e.dps), bh = best(sess, e => e.maxHit),
          bx = best(sess.filter(e => histMins(e) >= 15), e => perHr(e.xpPct || 0, e)),
          bc = best(histList.filter(e => histMins(e) >= 10), e => perHr(e.coin || 0, e));
    const day = (e) => new Date(e.start).toLocaleDateString();
    $('hist-best').textContent = histList.length ? '🏆 Bests — ' + [
      bd && fmt(bd.dps) + ' DPS (' + day(bd) + ')', bh && 'max hit ' + fmt(bh.maxHit) + ' (' + day(bh) + ')',
      bx && (perHr(bx.xpPct, bx)).toFixed(1) + '% XP/hr (' + day(bx) + ')', bc && fmtCoin(Math.round(perHr(bc.coin, bc))) + '/hr (' + day(bc) + ')'
    ].filter(Boolean).join(' · ') : '';
    // compare exactly two ticked entries
    const cmp = $('hist-compare');
    const two = histList.filter(e => histSel.has(e.id));
    if (two.length === 2) {
      const [a, b] = two.sort((x, y) => x.start - y.start);
      const diff = (label, fa, fb2, f) => {
        if (fa == null && fb2 == null) return null;
        const d = (fb2 || 0) - (fa || 0);
        return label + ' ' + f(fa || 0) + ' → ' + f(fb2 || 0) + (fa ? ' (' + (d >= 0 ? '+' : '') + Math.round(d * 100 / fa) + '%)' : '');
      };
      cmp.style.display = '';
      cmp.textContent = '⚖ ' + new Date(a.start).toLocaleString() + ' vs ' + new Date(b.start).toLocaleString() + ': ' + [
        a.type === 'session' && b.type === 'session' ? diff('DPS', a.dps, b.dps, fmt) : null,
        diff('XP/hr', perHr(a.xpPct || 0, a), perHr(b.xpPct || 0, b), v => v.toFixed(1) + '%'),
        diff('coin/hr', perHr(a.coin || 0, a), perHr(b.coin || 0, b), v => fmtCoin(Math.round(v)) || '0'),
        diff('kills', a.kills, b.kills, v => String(v))
      ].filter(Boolean).join(' · ');
    } else cmp.style.display = 'none';
    const box = $('hist-rows'); box.innerHTML = '';
    if (!shown.length) { box.innerHTML = '<div class="q-npc" style="padding:8px">Nothing saved yet — sessions save themselves every minute once you fight, loot or gain XP, and every run saves when you end it.</div>'; return; }
    for (const e of shown) {
      const row = document.createElement('div');
      row.className = 'q-it';
      row.style.cssText = 'align-items:center;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);padding:2px 0';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = histSel.has(e.id); cb.style.flex = 'none';
      cb.addEventListener('click', (ev) => { ev.stopPropagation(); cb.checked ? histSel.add(e.id) : histSel.delete(e.id); renderHistory(); });
      const nm = document.createElement('span');
      nm.className = 'nm';
      const bits = [e.type === 'run' ? '⏹ Run' : '⚔ Session', new Date(e.start).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
        histMins(e) + 'm', e.char, (e.zones || []).slice(0, 2).join(', '), e.imported ? '📥' : ''];
      nm.textContent = bits.filter(Boolean).join(' · ') + (e.note ? '  📝' : '');
      const loc = document.createElement('span');
      loc.className = 'loc'; loc.style.flex = 'none';
      loc.textContent = [e.dps ? fmt(e.dps) + ' DPS' : '', e.xpPct ? '+' + e.xpPct.toFixed(1) + '% XP' : '', e.coin ? fmtCoin(e.coin) : '',
        (e.deaths || []).length ? '☠' + e.deaths.length : ''].filter(Boolean).join(' · ');
      row.append(cb, nm, loc);
      row.addEventListener('click', () => { histOpen = histOpen === e.id ? null : e.id; renderHistory(); });
      box.appendChild(row);
      if (histOpen === e.id) box.appendChild(histDetail(e));
    }
  }
  function histDetail(e) {
    const d = document.createElement('div');
    d.style.cssText = 'padding:4px 6px 8px 20px;color:#bbb;font-size:10.5px';
    const lines = [];
    if (e.type === 'session') {
      lines.push(e.fights + ' fights · ' + fmtDur(e.durS || 0) + ' in combat · ' + fmt(e.dmg || 0) + ' damage' + (e.petDmg ? ' + ' + fmt(e.petDmg) + ' pet' : '') +
        (e.maxHit ? ' · max hit ' + fmt(e.maxHit) : ''));
      if ((e.sources || []).length) lines.push('Sources: ' + e.sources.slice(0, 6).map(s => s.source + ' ' + fmt(s.total)).join(' · '));
      if ((e.stances || []).length) lines.push('Stances: ' + e.stances.map(s => stanceLabel(s.n) + ' ' + fmt(s.dps) + ' DPS').join(' · '));
      if ((e.group || []).length) lines.push('Group: ' + e.group.slice(0, 6).map(g => g.n + ' ' + fmt(g.total)).join(' · '));
      if ((e.healed || []).length) lines.push('Healing: ' + e.healed.slice(0, 5).map(h => (h.n === 'You' ? 'you' : h.n) + ' ' + fmt(h.total)).join(' · '));
      if ((e.skills || []).length) lines.push('Skill-ups: ' + e.skills.slice(0, 8).map(k => k.k + ' ' + k.from + '→' + k.to).join(' · '));
      if ((e.factions || []).length) lines.push('Faction: ' + e.factions.slice(0, 6).map(f => f.k + ' ' + (f.net > 0 ? '+' : '') + f.net).join(' · '));
      lines.push('XP +' + (e.xpPct || 0).toFixed(1) + '%' + (e.levels ? ' · ' + e.levels + ' level(s)' : '') + (e.aa ? ' · ' + e.aa + ' AA' : '') +
        ' · ' + (e.kills || 0) + ' kills · ' + (e.items || 0) + ' items' + (e.motes ? ' (' + e.motes + ' motes)' : ''));
    } else {
      lines.push((fmtCoin(e.coin) || 'no coin') + ' · ' + (e.items || 0) + ' items' + (e.motes ? ' · ' + e.motes + ' motes' : '') +
        ((e.rares || []).length ? ' · rares: ' + e.rares.join(', ') : ''));
      if ((e.itemList || []).length) lines.push('Loot: ' + e.itemList.slice(0, 12).map(i => i.n + (i.c > 1 ? ' ×' + i.c : '')).join(', '));
    }
    for (const x of e.deaths || []) lines.push('☠ ' + x);
    for (const l of lines) { const p = document.createElement('div'); p.textContent = l; d.appendChild(p); }
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;margin-top:4px;align-items:center';
    const note = document.createElement('input');
    note.placeholder = 'note (e.g. "new bow", "duo with Brannoc")'; note.value = e.note || '';
    note.style.cssText = 'flex:1;background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;font-size:10.5px;padding:2px 4px';
    note.addEventListener('click', (ev) => ev.stopPropagation());
    note.addEventListener('change', async () => { e.note = note.value; await window.overlay.historyNote(e.id, note.value); });
    const del = document.createElement('button');
    del.className = 'kbtn'; del.textContent = '🗑 Delete';
    del.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Click again to delete'; return; }  // no confirm() dialogs in the overlay
      await window.overlay.historyRemove(e.id);
      histList = histList.filter(x => x.id !== e.id); histSel.delete(e.id); histOpen = null; renderHistory();
    });
    bar.append(note, del);
    d.appendChild(bar);
    return d;
  }
  async function exportHistory(format) {
    const ids = histSel.size ? [...histSel] : histShown().map(e => e.id);
    const r = await window.overlay.historyExport(ids, format);
    if (r && r.ok) toast('⬇ Saved ' + r.count + ' entr' + (r.count === 1 ? 'y' : 'ies') + ' to ' + r.path);
    else if (r && !r.canceled) toast('Export failed: ' + (r.error || 'unknown'));
  }

