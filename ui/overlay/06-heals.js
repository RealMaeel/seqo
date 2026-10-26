// SEQO overlay — healing meter, fight history and DPS chart.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ---- ✚ healing meter: every healer, overhealing, who got healed ----
  // Only heals inside "your" circle count — you, your pets, and anyone seen
  // fighting your fights' mobs — so another group healing nearby stays out.
  const healNorm = (n) => (n || '?').replace(/^(A|An|The) /, (m) => m.toLowerCase());
  const allies = new Set();
  const healSession = new Map();
  const healByFight = new WeakMap();   // tracker fight object -> Map(healer -> agg)
  let healScope = 'fight';
  function healAgg(map, healer) {
    let a = map.get(healer);
    if (!a) map.set(healer, a = { total: 0, pot: 0, count: 0, spells: new Map(), targets: new Map() });
    return a;
  }
  function noteHeal(ev) {
    if (ev.type === 'damage' && tracker.current) {
      const t = ev.target === 'You' ? 'You' : healNorm(ev.target);
      const a = ev.attacker === 'You' ? 'You' : healNorm(ev.attacker);
      if (a !== 'You' && tracker.current.enemies.has(t) && !tracker.current.enemies.has(a) && a !== '(unknown)') allies.add(a);
      return;
    }
    if (ev.type !== 'heal') return;
    const healer = ev.healer === 'You' ? 'You' : healNorm(ev.healer);
    let target = ev.target === 'You' ? 'You' : healNorm(ev.target);
    if (/^(?:him|her|it|your)self$/i.test(target)) target = healer;
    const ours = (n) => n === 'You' || n === charName || petNames.has(n) || allies.has(n) || session.players.has(n);
    if (!ours(healer) && !ours(target)) return;
    const pot = Math.max(ev.potential || ev.amount || 0, ev.amount || 0);
    const add = (map) => {
      const a = healAgg(map, healer);
      a.total += ev.amount || 0; a.pot += pot; a.count++;
      const sp = ev.spell || 'heal';
      const e = a.spells.get(sp) || { total: 0, pot: 0, count: 0 };
      e.total += ev.amount || 0; e.pot += pot; e.count++; a.spells.set(sp, e);
      a.targets.set(target, (a.targets.get(target) || 0) + (ev.amount || 0));
    };
    add(healSession);
    const f = tracker.current;
    if (f) { if (!healByFight.has(f)) healByFight.set(f, new Map()); add(healByFight.get(f)); }
    if (activeTab === 'breakdown' && bMode === 'heals') breakdownDirty = true;
  }
  let breakdownDirty = false;
  setInterval(() => { if (breakdownDirty && activeTab === 'breakdown') { breakdownDirty = false; renderBreakdown(); } }, 1000);
  function renderHeals(rowsEl) {
    const fightObj = viewFight || tracker.current || tracker.last;
    const map = healScope === 'session' ? healSession : (fightObj && healByFight.get(fightObj)) || new Map();
    const durS = healScope === 'session' ? Math.max(1, session.durS + (tracker.current ? (tracker.current.lastCombat - tracker.current.start) / 1000 : 0))
      : fightObj ? Math.max(1, (fightObj.lastCombat - fightObj.start) / 1000) : 1;
    $('b-title').textContent = '✚ Healing — ' + (healScope === 'session' ? 'this session' : viewFight ? 'that fight' : 'this fight');
    const rows = [...map.entries()].map(([n, a]) => ({ n, ...a })).sort((x, y) => y.total - x.total);
    const total = rows.reduce((s, r) => s + r.total, 0), pot = rows.reduce((s, r) => s + r.pot, 0);
    $('b-swings').textContent = rows.length ? fmt(total) + ' healed · ' + fmt(total / durS) + ' HPS · ' + (pot ? Math.round((pot - total) * 100 / pot) : 0) + '% overheal' : '';
    rowsEl.innerHTML = '';
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
    for (const [k, label] of [['fight', viewFight ? 'That fight' : 'This fight'], ['session', 'Session']]) {
      const c = document.createElement('span');
      c.className = 'qview-chip' + (healScope === k ? ' active' : '');
      c.textContent = label;
      c.addEventListener('click', () => { healScope = k; renderBreakdown(); });
      chips.appendChild(c);
    }
    rowsEl.appendChild(chips);
    if (!rows.length) {
      const d = document.createElement('div'); d.className = 'q-npc';
      d.textContent = 'No heals yet ' + (healScope === 'session' ? 'this session' : 'in this fight') + ' — heal lines ("X healed Y for N hit points") show up here, yours and your group\'s.';
      rowsEl.appendChild(d); return;
    }
    const top = rows[0].total || 1;
    for (const r of rows.slice(0, 15)) {
      const div = document.createElement('div');
      div.className = 'mrow' + (r.n === 'You' ? ' you' : '');
      div.style.cursor = 'pointer';
      div.innerHTML = '<div class="bar" style="width:' + Math.max(2, r.total / top * 100) + '%;background:rgba(125,255,160,.35)"></div><div class="lbl"><span class="nm"></span><span class="nums"></span></div>';
      div.querySelector('.nm').textContent = (sessExpanded.has('h|' + r.n) ? '▾ ' : '▸ ') + (r.n === 'You' ? (charName || 'You') : r.n);
      const oh = r.pot ? Math.round((r.pot - r.total) * 100 / r.pot) : 0;
      div.querySelector('.nums').textContent = fmt(r.total) + ' (' + fmt(r.total / durS) + ') · ' + oh + '% over';
      div.title = r.count + ' heals · ' + fmt(r.pot) + ' potential, ' + fmt(r.total) + ' landed';
      div.addEventListener('click', () => { const k = 'h|' + r.n; sessExpanded.has(k) ? sessExpanded.delete(k) : sessExpanded.add(k); renderBreakdown(); });
      rowsEl.appendChild(div);
      if (sessExpanded.has('h|' + r.n)) {
        const box = document.createElement('div');
        box.style.cssText = 'font-size:10px;color:#bbb;padding:1px 0 4px 14px';
        const sp = [...r.spells.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6)
          .map(([n, e]) => n + ' ' + fmt(e.total) + ' ×' + e.count + (e.pot ? ' (' + Math.round((e.pot - e.total) * 100 / e.pot) + '% over)' : ''));
        const tg = [...r.targets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => (n === 'You' ? (charName || 'you') : n) + ' ' + fmt(v));
        box.textContent = 'Spells: ' + sp.join(' · ') + '\nOn: ' + tg.join(' · ');
        box.style.whiteSpace = 'pre-wrap';
        rowsEl.appendChild(box);
      }
    }
    // what YOU received
    let recv = 0; const from = new Map();
    for (const r of rows) { const v = (r.targets.get('You') || 0) + (charName ? r.targets.get(charName) || 0 : 0); if (v) { recv += v; from.set(r.n, v); } }
    if (recv) {
      const d = document.createElement('div'); d.className = 'q-npc'; d.style.marginTop = '4px';
      d.textContent = 'You received ' + fmt(recv) + ': ' + [...from.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => (n === 'You' ? 'yourself' : n) + ' ' + fmt(v)).join(' · ');
      rowsEl.appendChild(d);
    }
  }

  // ---- 🕘 fight history + 📈 DPS chart ----
  let viewFight = null;    // an older fight shown on the meter, or null = live/last
  function openFightHistory() {
    const box = $('fh-rows'); box.innerHTML = '';
    const list = [...(tracker.current ? [tracker.current] : []), ...tracker.history];
    if (!list.length) box.innerHTML = '<div class="q-npc">No fights yet.</div>';
    for (const f of list) {
      const s = tracker.summary(f === tracker.current ? undefined : f);
      if (!s) continue;
      const row = document.createElement('div');
      row.className = 'q-it';
      row.style.cssText = 'cursor:pointer;align-items:center;border-bottom:1px solid rgba(255,255,255,.05);padding:2px 0';
      const nm = document.createElement('span'); nm.className = 'nm';
      const grand = s.rows.reduce((a, r) => a + r.total, 0);
      nm.textContent = new Date(f.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · ' + fmtDur(s.durS) + ' · ' + s.title +
        (f === tracker.current ? ' · LIVE' : '') + (viewFight === f ? ' · shown' : '');
      const loc = document.createElement('span'); loc.className = 'loc'; loc.style.flex = 'none';
      loc.textContent = 'you ' + fmt(s.you.dps) + ' · group ' + fmt(grand / s.durS) + ' DPS' + (s.kills ? ' · ' + s.kills + ' kill' + (s.kills > 1 ? 's' : '') : '');
      row.append(nm, loc);
      row.addEventListener('click', () => {
        viewFight = f === tracker.current ? null : f;
        $('fh-modal').style.display = 'none';
        setTab('meter');
      });
      box.appendChild(row);
    }
    $('fh-modal').style.display = 'flex';
  }
  // per-second damage for you (+ pets when merged) and the top 3 others, 5s smoothing
  function renderFightChart(fightObj, s) {
    const el = $('c-chart');
    const on = !!(settings && settings.meterChart);
    $('c-chart-btn').classList.toggle('gold', on);
    $('c-chart-btn').textContent = on ? '📈 Hide DPS chart' : '📈 Show DPS chart';
    if (!on || !fightObj || !s) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const t0 = fightObj.start, secs = Math.max(2, Math.ceil((fightObj.lastCombat - t0) / 1000) + 1);
    const merge = settings && settings.mergePets !== false;
    const petSet = new Set((s.petRows || []).map(p => p.name));
    const names = ['You', ...s.rows.map(r => r.name).filter(n => n !== 'You' && !(merge && petSet.has(n))).slice(0, 3)];
    const series = new Map(names.map(n => [n, new Float64Array(secs)]));
    for (const e of fightObj.events) {
      if (e.target === 'You' || !fightObj.enemies.has(e.target) || e.t == null) continue;
      const who = merge && petSet.has(e.attacker) ? 'You' : e.attacker;
      const arr = series.get(who);
      if (!arr) continue;
      const i = Math.min(secs - 1, Math.max(0, Math.floor((e.t - t0) / 1000)));
      arr[i] += e.amount;
    }
    const W = 400, H = 70, win = 5;
    let peak = 1;
    const smooth = new Map();
    for (const [n, arr] of series) {
      const out = new Float64Array(secs);
      for (let i = 0; i < secs; i++) { let sum = 0, c = 0; for (let j = Math.max(0, i - win + 1); j <= i; j++) { sum += arr[j]; c++; } out[i] = sum / c; }
      smooth.set(n, out);
      for (const v of out) if (v > peak) peak = v;
    }
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'width:100%;height:100%;background:rgba(255,255,255,.03);border-radius:5px';
    const COLORS = ['#ffd766', '#7dc8ff', '#ff9d7d', '#b59dff'];
    let k = 0;
    for (const [n, out] of smooth) {
      const pts = [];
      for (let i = 0; i < secs; i++) pts.push((i / (secs - 1) * W).toFixed(1) + ',' + (H - 3 - out[i] / peak * (H - 14)).toFixed(1));
      const pl = document.createElementNS(NS, 'polyline');
      pl.setAttribute('points', pts.join(' ')); pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke', COLORS[k % 4]); pl.setAttribute('stroke-width', n === 'You' ? '2' : '1.2');
      pl.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(pl);
      const lb = document.createElementNS(NS, 'text');
      lb.setAttribute('x', 4 + k * 98); lb.setAttribute('y', 10); lb.setAttribute('fill', COLORS[k % 4]); lb.setAttribute('font-size', '9');
      lb.textContent = (n === 'You' ? (charName || 'You') : n).slice(0, 16);
      svg.appendChild(lb);
      k++;
    }
    const pk = document.createElementNS(NS, 'text');
    pk.setAttribute('x', W - 4); pk.setAttribute('y', H - 4); pk.setAttribute('fill', '#778'); pk.setAttribute('font-size', '9'); pk.setAttribute('text-anchor', 'end');
    pk.textContent = 'peak ' + fmt(peak) + ' DPS (5s avg) · ' + fmtDur(secs);
    svg.appendChild(pk);
    el.innerHTML = '';
    el.appendChild(svg);
  }

