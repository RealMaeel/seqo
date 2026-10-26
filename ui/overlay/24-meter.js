// SEQO overlay — Meter tab and XP strip.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= render: meter =================
  const meterExpanded = new Set(); // names whose damage-by-spell sub-list is open

  // ---- XP strip (bottom of the meter) ----
  // Legends states the percent of the current level bar per kill, so below
  // the cap this is REAL progress; at the cap the lines have no percent and
  // only kill pace can be shown. AA lines carry a running total.
  const xp = { pct: 0, kills: 0, noPct: 0, first: 0, last: 0,
               level: 0, sinceDing: 0, dingSeen: false, aaGained: 0, aaTotal: 0 };

  function renderXpStrip() {
    // lives on the bottom bar now, visible on every tab
    const el = $('bb-xp');
    if (!xp.kills && !xp.aaGained) { el.textContent = ''; $('bb-reset').style.display = 'none'; updateBottomBar(); return; }
    $('bb-reset').style.display = 'inline-block';
    const bits = [];
    const hrs = xp.first && xp.last > xp.first ? (xp.last - xp.first) / 3600000 : 0;
    if (xp.pct > 0) {
      let s = '✦ XP +' + xp.pct.toFixed(1) + '% (' + xp.kills + ' kills)';
      if (hrs >= 0.1) s += ' · ' + (xp.pct / hrs).toFixed(1) + '%/hr';
      if (xp.dingSeen) {
        s += ' · ' + xp.sinceDing.toFixed(1) + '% into L' + (xp.level || '?');
        if (hrs >= 0.1) {
          const etaH = (100 - xp.sinceDing) / (xp.pct / hrs);
          if (etaH > 0 && etaH < 200)
            s += ' · ~' + (etaH >= 1 ? Math.round(etaH * 10) / 10 + 'h' : Math.round(etaH * 60) + 'm') + ' to ' + ((xp.level || 0) + 1);
        }
      }
      bits.push(s);
    }
    // at the level cap the exp lines carry no percent — only AA matters there
    if (xp.aaGained) {
      let a = 'AA +' + xp.aaGained;
      if (hrs >= 0.1) a += ' (' + (xp.aaGained / hrs).toFixed(1) + '/hr)';
      if (xp.aaTotal) a += ' · ' + xp.aaTotal + ' total';
      bits.push(a);
    }
    // level cap: "You gain (party) experience!" has no percent — the pace is still worth seeing
    if (!xp.pct && xp.kills) {
      let k = '✦ ' + xp.kills + ' XP kill' + (xp.kills === 1 ? '' : 's');
      if (hrs >= 0.1) k += ' · ' + Math.round(xp.kills / hrs) + '/hr';
      k += ' (max level — the log shows no XP %)';
      bits.unshift(k);
    }
    if (!bits.length) { el.textContent = ''; updateBottomBar(); return; }
    el.textContent = bits.join('  ·  ');
    updateBottomBar();
    el.title = el.textContent + '\n\nSession XP from your log. The percent is the game’s own per-kill share of your current level bar; the level position and time-to-level appear once a level-up has been seen this session. ↺ resets the pace counters.';
  }

  $('bb-reset').addEventListener('click', () => {
    xp.pct = 0; xp.kills = 0; xp.noPct = 0; xp.first = 0; xp.last = 0; xp.aaGained = 0;
    // level, sinceDing, dingSeen and aaTotal survive — only the pace resets
    renderXpStrip();
    toast('↺ XP/AA pace reset — level position and AA total kept');
  });

  // 🎯 one mob of a multi-mob fight (2.7): the meter, its copies and the spell
  // breakdowns then count only damage to that mob. Resets when the fight changes.
  let meterTarget = null, meterTargetFight = null;
  function meterFightTarget() {
    const f = viewFight || tracker.current || tracker.last;
    if (f !== meterTargetFight) { meterTargetFight = f; meterTarget = null; }
    return meterTarget;
  }
  function renderTargetChips(s) {
    const el = $('c-targets');
    const list = (s && s.targets) || [];
    if (list.length < 2) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'flex';
    el.innerHTML = '';
    const chip = (label, pct, name, title) => {
      const c = document.createElement('span');
      c.className = 'tchip' + ((name || null) === (s.target || null) ? ' on' : '');
      c.textContent = label;
      if (pct !== null) { const p = document.createElement('span'); p.className = 'p'; p.textContent = Math.round(pct * 100) + '%'; c.appendChild(p); }
      c.title = title;
      c.addEventListener('click', () => { meterTarget = name; renderMeter(); });
      el.appendChild(c);
    };
    chip('🎯 All', null, null, 'Damage to every mob in this fight');
    for (const t of list.slice(0, 6))
      chip(t.name, t.pct, t.name, 'Only damage to ' + t.name + ' — ' + fmt(t.total) + ' (' + Math.round(t.pct * 100) + '% of the fight); DPS over the time it was being fought');
    if (list.length > 6) {
      const more = document.createElement('span');
      more.className = 'tchip'; more.style.cursor = 'default';
      more.textContent = '+' + (list.length - 6) + ' more';
      more.title = list.slice(6).map(t => t.name + ' ' + fmt(t.total)).join('\n');
      el.appendChild(more);
    }
  }

  // meter rows exactly as displayed (pets folded into You when the setting is on)
  function meterRowsForCopy() {
    const s = tracker.summary(viewFight || undefined, meterFightTarget());
    if (!s) return null;
    let rows = s.rows.map(r => ({ ...r }));
    if (settings && settings.mergePets !== false) {
      const petNamesNow = new Set((s.petRows || []).map(p => p.name));
      const petRows = rows.filter(r => petNamesNow.has(r.name));
      const youRow = rows.find(r => r.name === 'You');
      if (petRows.length && youRow) {
        youRow.total += petRows.reduce((a, r) => a + r.total, 0);
        youRow.dps = youRow.total / s.durS;
        rows = rows.filter(r => !petNamesNow.has(r.name));
      }
    }
    rows.sort((a, b) => b.total - a.total);
    for (const r of rows) if (r.name === 'You') r.name = charName || 'You';
    return { s, rows };
  }

  function copyMeter(full) {
    const d = meterRowsForCopy();
    if (!d) { toast('Nothing to copy — no combat yet'); return; }
    const n = Math.max(1, Math.min(10, +((settings && settings.copyTopN) || 5)));
    const top = d.rows.slice(0, n);
    let text;
    if (!full) {
      text = d.s.title + ' (' + fmtDur(d.s.durS) + ') — ' +
        top.map(r => r.name + ' ' + fmt(r.total) + ' @' + fmt(r.dps)).join(' | ');
    } else {
      const lines = ['SEQO — ' + d.s.title + ' · ' + fmtDur(d.s.durS) + (d.s.live ? ' (live)' : '')];
      for (const [i, r] of top.entries())
        lines.push((i + 1) + '. ' + r.name + ' — ' + fmt(r.total) + ' dmg · ' + fmt(r.dps) + ' dps' +
                   (r.maxHit ? ' · max ' + fmt(r.maxHit) : '') + (r.crits ? ' · ' + r.crits + ' crits' : ''));
      text = lines.join('\n');
    }
    text = EQLShare.withCredit(text);
    window.overlay.copyText(text);
    toast('📋 Copied ' + (full ? 'full breakdown' : 'chat line') + ' (top ' + top.length + ')');
    return text;
  }

  function renderMeter() {
    keepScroll($('c-rows'));
    renderXpStrip();
    if (viewFight && !tracker.history.includes(viewFight)) viewFight = null;
    const s = tracker.summary(viewFight || undefined, meterFightTarget());
    renderTargetChips(s);
    const vEl = $('c-viewing');
    if (viewFight) {
      vEl.style.display = '';
      vEl.textContent = '🕘 Showing the ' + new Date(viewFight.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' fight — ✕ back to live';
    } else vEl.style.display = 'none';
    renderFightChart(viewFight || tracker.current || tracker.last, s);
    const view = $('view-meter');
    if (!s) { $('c-empty').style.display = 'flex'; $('c-rows').style.display = 'none'; return; }
    $('c-empty').style.display = 'none';
    $('c-rows').style.display = 'flex';

    view.classList.toggle('live', s.live);
    $('c-title').textContent = '⚔ ' + s.title;
    $('c-time').textContent = fmtDur(s.durS) + (s.live ? '' : ' (last)');

    // optionally fold pet damage into your row + stat tiles
    let rows = s.rows.slice();
    let youDps = s.you.dps, youTotal = s.you.total, merged = false;
    if (settings && settings.mergePets !== false) {
      const petNamesNow = new Set((s.petRows || []).map(p => p.name));
      const petRows = rows.filter(r => petNamesNow.has(r.name));
      const youRow = rows.find(r => r.name === 'You');
      if (petRows.length && youRow) {
        const grand = rows.reduce((a, r) => a + r.total, 0) || 1;
        youRow.total += petRows.reduce((a, r) => a + r.total, 0);
        youRow.dps = youRow.total / s.durS;
        youRow.pct = youRow.total / grand;
        rows = rows.filter(r => !petNamesNow.has(r.name)).sort((a, b) => b.total - a.total);
        youDps = youRow.dps; youTotal = youRow.total; merged = true;
      }
    }

    $('s-dps').textContent = fmt(youDps);
    $('s-total').textContent = fmt(youTotal);
    $('s-max').textContent = fmt(s.you.maxHit);
    $('s-crits').textContent = s.you.crits;
    $('s-taken').textContent = fmt(s.youTaken);
    $('s-healed').textContent = fmt(s.youHealed);

    const rowsEl = $('c-rows');
    rowsEl.innerHTML = '';
    for (const r of rows.slice(0, 20)) {
      const div = document.createElement('div');
      div.className = 'mrow' + (r.name === 'You' ? ' you' : '');
      div.setAttribute('data-interactive', '');
      div.style.cursor = 'pointer';
      div.title = 'Click to see ' + (r.name === 'You' ? 'your' : r.name + "'s") + ' damage by spell';
      div.innerHTML = '<div class="bar" style="width:' + Math.max(2, r.pct * 100) + '%"></div>' +
                      '<div class="lbl"><span class="nm"></span><span class="nums"></span></div>';
      div.querySelector('.nm').textContent =
        (r.name === 'You' ? (charName || 'You') + (merged ? ' +🐾' : '') : r.name) +
        (r.name !== 'You' && petNames.has(r.name) ? ' 🐾' : '');
      div.querySelector('.nums').textContent = fmt(r.total) + ' (' + fmt(r.dps) + ')';
      div.addEventListener('click', () => {
        if (meterExpanded.has(r.name)) meterExpanded.delete(r.name);
        else meterExpanded.add(r.name);
        renderMeter();
      });
      if (r.name !== 'You') { // add/remove-pet button, far right of the bar
        const pb = document.createElement('span');
        const isPet = petNames.has(r.name);
        pb.className = 'petbtn' + (isPet ? ' ispet' : '');
        pb.textContent = '🐾';
        pb.title = isPet
          ? 'Unmark ' + r.name + ' as your pet'
          : 'Mark ' + r.name + ' as your pet (for pets that never speak)';
        pb.addEventListener('click', (e) => { e.stopPropagation(); togglePetRow(r.name); });
        div.querySelector('.lbl').appendChild(pb);
      } else { // your row: an invisible paw-sized slot keeps the number column aligned
        const sp = document.createElement('span');
        sp.className = 'petbtn spacer';
        sp.textContent = '🐾';
        div.querySelector('.lbl').appendChild(sp);
      }
      rowsEl.appendChild(div);
      if (meterExpanded.has(r.name)) {
        let srcs = tracker.attackerSources(r.name, viewFight || undefined, s.target || undefined).map(s => ({ ...s }));
        if (r.name === 'You' && merged) // pets are folded into your row: show theirs too
          for (const p of (s.petRows || []))
            for (const ps of tracker.attackerSources(p.name, viewFight || undefined, s.target || undefined))
              srcs.push({ ...ps, source: '🐾 ' + p.name + ': ' + ps.source });
        const sub = document.createElement('div');
        sub.className = 'msub';
        sub.setAttribute('data-interactive', '');
        if (!srcs.length) sub.textContent = 'no attributed damage yet';
        const grand = srcs.reduce((a, x) => a + x.total, 0) || 1;
        for (const sr of srcs.slice(0, 10)) {
          const row = document.createElement('div');
          row.className = 'srow';
          row.innerHTML = '<span class="sn"></span><span class="sv"></span>';
          row.querySelector('.sn').textContent = sr.source;
          row.querySelector('.sv').textContent =
            fmt(sr.total) + ' · ' + Math.round(sr.total / grand * 100) + '% · ×' + sr.count +
            (sr.crits ? ' · ' + sr.crits + ' crit' : '');
          sub.appendChild(row);
        }
        if (srcs.length > 10) {
          const more = document.createElement('div');
          more.style.color = '#778';
          more.textContent = '+' + (srcs.length - 10) + ' more';
          sub.appendChild(more);
        }
        rowsEl.appendChild(sub);
      }
    }
  }

