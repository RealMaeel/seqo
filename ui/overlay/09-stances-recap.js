// SEQO overlay — stances and death recap.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ---- stances (EQ Legends): which one you're in, and your damage in each ----
  // "fighting time" per stance = time between your hits, gaps over 6s count 1s,
  // so DPS compares stances fairly even with downtime between pulls
  let curStance = null, curStanceSince = 0;
  const stanceStats = new Map();   // stance -> { dmg, hits, ms, last }
  function noteStance(ev) {
    if (ev.type === 'stance') {
      curStance = ev.stance; curStanceSince = ev.when || Date.now();
      renderStanceChip();
      if (activeTab === 'breakdown') renderBreakdown();
      return;
    }
    if (ev.type !== 'damage' || ev.attacker !== 'You' || !curStance || !(ev.amount > 0)) return;
    let st = stanceStats.get(curStance);
    if (!st) stanceStats.set(curStance, st = { dmg: 0, hits: 0, ms: 0, last: 0 });
    const t = ev.when || Date.now();
    st.ms += st.last && t - st.last <= 6000 ? Math.max(0, t - st.last) : 1000;
    st.last = t; st.dmg += ev.amount; st.hits++;
  }
  const stanceLabel = (n) => n.replace(/\b\w/g, c => c.toUpperCase());
  function renderStanceChip() {
    const el = $('c-stance');
    if (!el) return;
    if (!curStance) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = '🥋 ' + stanceLabel(curStance);
    el.title = 'Current stance (from "You assume a ' + curStance + ' stance.") since ' + new Date(curStanceSince).toLocaleTimeString() +
      '. Σ Session compares your damage per stance.';
  }
  function stanceRows() {
    return [...stanceStats.entries()].map(([n, st]) => ({ n, ...st, dps: st.ms ? st.dmg / (st.ms / 1000) : 0 }))
      .sort((a, b) => b.dps - a.dps);
  }

  // ---- death recap: a rolling window of what happened TO you ----
  const RECAP_WINDOW = 12000;          // ms shown before the moment you went down
  let recapBuf = [], lastRecap = null, recapPending = null;
  const recapName = (n) => (n || '?').replace(/^(A|An|The) /, (m) => m.toLowerCase());
  function noteRecap(ev) {
    const t = ev.when || Date.now();
    if (ev.type === 'damage' && ev.target === 'You' && ev.amount > 0)
      recapBuf.push({ t, k: 'hit', who: recapName(ev.attacker || '(unknown)'), what: ev.spell || (ev.kind === 'proc' ? 'damage shield' : 'melee'), amt: ev.amount, crit: !!ev.crit });
    else if (ev.type === 'selfdamage' && ev.amount > 0)
      recapBuf.push({ t, k: 'hit', who: 'You', what: ev.spell || 'self', amt: ev.amount, crit: false });
    else if (ev.type === 'heal' && ev.target === 'You' && ev.amount > 0)
      recapBuf.push({ t, k: 'heal', who: recapName(ev.healer), what: ev.spell || 'heal', amt: ev.amount });
    else if (ev.type === 'miss' && ev.target === 'You')
      recapBuf.push({ t, k: 'miss', who: recapName(ev.attacker) });
    else if (ev.type === 'ko') {
      // a death line usually follows within a second; wait for it so the card names the killer
      clearTimeout(recapPending && recapPending.timer);
      recapPending = { t, timer: setTimeout(() => { const p = recapPending; recapPending = null; buildRecap(p.t, null, true); }, 2500) };
    } else if (ev.type === 'death' && ev.target === 'You') {
      const at = recapPending ? recapPending.t : t;
      if (recapPending) { clearTimeout(recapPending.timer); recapPending = null; }
      if (lastRecap && Math.abs(lastRecap.at - at) < 5000 && !lastRecap.killer && ev.killer) {
        lastRecap.killer = ev.killer; lastRecap.died = true; renderRecap(); return;   // "You died." then "slain by"
      }
      if (lastRecap && Math.abs(lastRecap.at - at) < 5000) return;
      buildRecap(at, ev.killer, false);
    }
    if (recapBuf.length > 600) recapBuf = recapBuf.slice(-400);
    const cut = t - 60000;
    if (recapBuf.length && recapBuf[0].t < cut) recapBuf = recapBuf.filter(e => e.t >= cut);
  }
  function buildRecap(at, killer, koOnly) {
    const rows = recapBuf.filter(e => e.t >= at - RECAP_WINDOW && e.t <= at + 1000);
    const src = new Map();
    let dmg = 0, healed = 0, misses = 0, biggest = null;
    for (const e of rows) {
      if (e.k === 'hit') {
        dmg += e.amt;
        const key = e.who + ' — ' + e.what;
        src.set(key, (src.get(key) || 0) + e.amt);
        if (!biggest || e.amt > biggest.amt) biggest = e;
      } else if (e.k === 'heal') healed += e.amt;
      else if (e.k === 'miss') misses++;
    }
    // no named killer ("You died." to a DoT): the biggest source is the likely culprit
    const top = [...src.entries()].sort((a, b) => b[1] - a[1]);
    lastRecap = { at, killer: killer || null, likely: !killer && top.length ? top[0][0].split(' — ')[0] : null,
                  died: !koOnly, rows, top, dmg, healed, misses, biggest, zone: currentZone };
    try { $('bb-death').style.display = ''; } catch { /* bar not built */ }
    hist.deaths.push(recapText(lastRecap).split('\n').slice(0, 2).join(' — '));
    if (settings && settings.deathRecap === false) return;
    alertFX((koOnly ? '💫 Knocked out' : '☠ You died') + (lastRecap.killer ? ' — ' + lastRecap.killer : '') + ' · recap open', 'death');
    renderRecap(true);
  }
  function recapText(r) {
    const fmt = (n) => n.toLocaleString();
    const lines = [(r.died ? '☠ Slain' : '💫 Knocked out') + (r.killer ? ' by ' + r.killer : r.likely ? ' (likely ' + r.likely + ')' : '') +
      (r.zone ? ' in ' + r.zone : '') + ' — ' + new Date(r.at).toLocaleTimeString()];
    lines.push('Last ' + RECAP_WINDOW / 1000 + 's: took ' + fmt(r.dmg) + ' damage, healed ' + fmt(r.healed) + ', dodged/missed ' + r.misses +
      (r.biggest ? ' · biggest hit ' + fmt(r.biggest.amt) + ' (' + r.biggest.who + ', ' + r.biggest.what + ')' : ''));
    for (const [k, v] of r.top.slice(0, 5)) lines.push('  ' + k + ': ' + fmt(v));
    return lines.join('\n');
  }
  function renderRecap(open) {
    const r = lastRecap;
    if (!r) return;
    const m = $('recap-modal');
    if (open) m.style.display = 'flex';
    if (m.style.display === 'none') return;
    const fmt = (n) => n.toLocaleString();
    $('recap-title').textContent = (r.died ? '☠ Slain' : '💫 Knocked unconscious') +
      (r.killer ? ' by ' + r.killer : r.likely ? ' — most damage from ' + r.likely : '') + (r.zone ? ' · ' + r.zone : '');
    $('recap-sum').textContent = 'Last ' + RECAP_WINDOW / 1000 + ' seconds: took ' + fmt(r.dmg) + ' damage in ' +
      r.rows.filter(e => e.k === 'hit').length + ' hits, healed ' + fmt(r.healed) + ', ' + r.misses + (r.misses === 1 ? ' miss' : ' misses') + ' on you' +
      (r.biggest ? '. Biggest hit: ' + fmt(r.biggest.amt) + ' from ' + r.biggest.who + (r.biggest.what !== 'melee' ? ' (' + r.biggest.what + ')' : '') : '') + '.';
    const sb = $('recap-src'); sb.innerHTML = '';
    for (const [k, v] of r.top.slice(0, 5)) {
      const sp = document.createElement('span');
      sp.style.color = '#ffb9a0';
      sp.textContent = k + ' ' + (r.dmg ? Math.round(v * 100 / r.dmg) : 0) + '%';
      sp.title = fmt(v) + ' damage';
      sb.appendChild(sp);
    }
    const box = $('recap-rows'); box.innerHTML = '';
    if (!r.rows.length) box.textContent = 'Nothing hit you in the log in those seconds.';
    for (const e of [...r.rows].reverse().slice(0, 60)) {
      const d = document.createElement('div');
      const dt = ((e.t - r.at) / 1000).toFixed(0);
      d.style.color = e.k === 'heal' ? '#7dffa0' : e.k === 'miss' ? '#778' : e.crit ? '#ff8c7d' : '#ddd';
      d.textContent = (dt <= 0 ? dt : '+' + dt).toString().padStart(4) + 's  ' +
        (e.k === 'hit' ? '-' + fmt(e.amt) + (e.crit ? '!' : '') + '  ' + e.who + (e.what !== 'melee' ? ' · ' + e.what : '')
          : e.k === 'heal' ? '+' + fmt(e.amt) + '  ' + e.who + ' · ' + e.what
          : '   miss  ' + e.who);
      box.appendChild(d);
    }
  }

