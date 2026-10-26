// SEQO overlay — Σ Session breakdown, session copy, loot run tracker.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= render: breakdown =================
  let bMode = 'fight'; // 'fight' | 'session'

  function classBadge(source, nocast, count, swings) {
    const cls = effectiveClass(source, nocast);
    const b = document.createElement('span');
    b.className = 'badge';
    b.setAttribute('data-interactive', '');
    b.style.cursor = 'pointer';
    if (cls === 'ability') {
      b.style.background = 'rgba(160,160,180,.15)'; b.style.color = '#a9a9c0';
      b.textContent = 'ability';
    } else if (cls === 'proc') {
      b.textContent = swings > 0 ? 'proc ' + (count / swings * 100).toFixed(1) + '%' : 'proc';
    } else {
      b.style.background = 'rgba(140,160,220,.13)'; b.style.color = '#9db4e8';
      b.textContent = 'cast';
    }
    b.title = 'Click to cycle: cast → proc → ability → auto';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      // cycle relative to the effective class
      const next = cls === 'cast' ? 'proc' : cls === 'proc' ? 'ability' : null;
      if (next) sourceClass[source] = next; else delete sourceClass[source];
      window.overlay.setSourceClass(source, next);
      renderBreakdown();
    });
    return b;
  }

  function renderBreakdown() {
    keepScroll($('b-rows'));
    $('b-mode-fight').classList.toggle('gold', bMode === 'fight');
    $('b-mode-session').classList.toggle('gold', bMode === 'session');
    $('b-mode-heals').classList.toggle('gold', bMode === 'heals');
    const rowsEl = $('b-rows');
    if (bMode === 'heals') {
      $('b-empty').style.display = 'none'; rowsEl.style.display = '';
      renderHeals(rowsEl);
      return;
    }

    let rows, swings, title, sub;
    if (bMode === 'session') {
      rows = [...session.sources.entries()]
        .map(([source, e]) => ({ source, ...e, avg: e.total / (e.count || 1) }))
        .sort((a, b) => b.total - a.total);
      const grand = rows.reduce((s, r) => s + r.total, 0) || 1;
      rows.forEach(r => r.pct = r.total / grand);
      swings = session.swings;
      const petTotal = [...session.pets.values()].reduce((a, b) => a + b, 0);
      title = 'Session — ' + session.fights + ' fights';
      sub = session.swings + ' swings · ' + fmt(session.total) + ' dmg' +
        (petTotal ? ' + ' + fmt(petTotal) + ' pet = ' + fmt(session.total + petTotal) : '') +
        ' · ' + fmtDur(session.durS) + ' in combat';
      // pets appear as their own rows in the session list
      for (const [pname, ptotal] of session.pets) {
        rows.push({ source: '🐾 ' + pname + ' (pet)', total: ptotal, count: 0, crits: 0,
                    max: 0, avg: 0, pct: 0, nocast: false, isPet: true, petName: pname });
      }
      const grandAll = session.total + petTotal || 1;
      rows.forEach(r => r.pct = r.total / grandAll);
      rows.sort((a, b) => b.total - a.total);
    } else {
      const s = tracker.summary(viewFight || undefined);
      if (!s || !s.youBySource || !s.youBySource.length) {
        $('b-empty').style.display = 'flex'; rowsEl.style.display = 'none';
        $('b-title').textContent = 'Your damage by source'; $('b-swings').textContent = '';
        return;
      }
      rows = s.youBySource.map(r => ({ source: r.source, total: r.total, count: r.count,
        crits: r.crits, max: r.max, avg: r.avg, pct: r.pct, nocast: r.procRate !== undefined }));
      swings = s.youSwings;
      // pets are part of your output: show them alongside your sources
      for (const p of s.petRows || []) {
        rows.push({ source: '🐾 ' + p.name + (p.name === activeCharm ? ' (charm)' : ' (pet)'),
          total: p.total, count: p.hits, crits: p.crits, max: p.maxHit,
          avg: p.total / (p.hits || 1), pct: 0, nocast: false, isPet: true, petName: p.name });
      }
      const grand = rows.reduce((a, r) => a + r.total, 0) || 1;
      rows.forEach(r => r.pct = r.total / grand);
      rows.sort((a, b) => b.total - a.total);
      title = 'vs ' + s.title + (s.live ? '' : ' (last)');
      sub = s.youSwings + ' swings';
    }

    if (!rows.length) {
      $('b-empty').style.display = 'flex'; rowsEl.style.display = 'none';
      $('b-title').textContent = title; $('b-swings').textContent = '';
      return;
    }
    $('b-empty').style.display = 'none';
    rowsEl.style.display = 'flex';
    $('b-title').textContent = title;
    $('b-swings').textContent = sub;

    rowsEl.innerHTML = '';
    for (const r of rows.slice(0, 40)) {
      const div = document.createElement('div');
      div.className = 'mrow gold';
      div.innerHTML = '<div class="bar" style="width:' + Math.max(2, r.pct * 100) + '%"></div>' +
        '<div class="lbl"><span class="nm"></span><span class="nums"></span></div>';
      const nm = div.querySelector('.nm');
      nm.textContent = r.source;
      if (!r.isPet && r.source !== 'Melee' && r.source !== 'Damage Shield') {
        nm.appendChild(classBadge(r.source, r.nocast, r.count, swings));
      }
      div.querySelector('.nums').textContent = (r.isPet && !r.count)
        ? fmt(r.total)
        : fmt(r.total) + ' · ' + r.count + 'x · avg ' + fmt(r.avg) +
          (r.crits ? ' · ' + r.crits + ' crit' : '');
      if (r.isPet && r.petName) {
        // accidental marks (e.g. a player) are un-done right here
        div.style.cursor = 'pointer';
        div.title = 'Click to UNMARK ' + r.petName + ' as your pet';
        div.addEventListener('click', () => { togglePetRow(r.petName); renderBreakdown(); });
      }
      rowsEl.appendChild(div);
    }

    // Σ Session: your damage per stance, highest DPS first
    if (bMode === 'session' && stanceStats.size) {
      const sr = stanceRows();
      const dv = document.createElement('div');
      dv.className = 'l-divider';
      dv.style.marginTop = '6px';
      dv.textContent = '🥋 Stances — your damage in each (time between your hits)';
      dv.title = 'DPS per stance = your damage while in it ÷ your fighting time in it (gaps over 6s between hits count as 1s). Pet damage not included.';
      rowsEl.appendChild(dv);
      const topD = sr[0].dps || 1;
      for (const r of sr) {
        const div = document.createElement('div');
        div.className = 'mrow';
        div.innerHTML = '<div class="bar" style="width:' + Math.max(2, r.dps / topD * 100) + '%"></div>' +
          '<div class="lbl"><span class="nm"></span><span class="nums"></span></div>';
        div.querySelector('.nm').textContent = stanceLabel(r.n) + (r.n === curStance ? ' (now)' : '');
        div.querySelector('.nums').textContent = fmt(r.dps) + ' DPS · ' + fmtDur(r.ms / 1000) + ' · ' + fmt(r.dmg);
        div.title = r.hits + ' hits in ' + stanceLabel(r.n);
        rowsEl.appendChild(div);
      }
    }

    if (bMode === 'session') renderProgress(rowsEl);

    // Σ Session also shows the WHOLE GROUP: everyone's session damage across
    // every fight, each row expandable to their damage by source
    if (bMode === 'session' && session.players.size) {
      const others = [...session.players.entries()]
        .filter(([name]) => !petNames.has(name))     // pets already shown above
        .sort((a, b) => b[1].total - a[1].total);
      if (others.length) {
        const dv = document.createElement('div');
        dv.className = 'l-divider';
        dv.style.marginTop = '6px';
        dv.textContent = '👥 Group — whole session (click a player for their breakdown)';
        rowsEl.appendChild(dv);
        const top = others[0][1].total || 1;
        for (const [name, p] of others.slice(0, 15)) {
          const div = document.createElement('div');
          div.className = 'mrow';
          div.style.cursor = 'pointer';
          div.innerHTML = '<div class="bar" style="width:' + Math.max(2, p.total / top * 100) + '%"></div>' +
            '<div class="lbl"><span class="nm"></span><span class="nums"></span></div>';
          div.querySelector('.nm').textContent = (sessExpanded.has(name) ? '▾ ' : '▸ ') + name;
          div.querySelector('.nums').textContent = fmt(p.total) +
            (session.durS ? ' (' + fmt(p.total / session.durS) + ')' : '');
          div.title = name + '’s damage across every fight this session — click for the by-source breakdown';
          div.addEventListener('click', () => {
            if (sessExpanded.has(name)) sessExpanded.delete(name); else sessExpanded.add(name);
            renderBreakdown();
          });
          rowsEl.appendChild(div);
          if (sessExpanded.has(name)) {
            const srcs = [...p.sources.entries()]
              .map(([source, e]) => ({ source, ...e, avg: e.total / (e.count || 1) }))
              .sort((a, b) => b.total - a.total);
            const sub = document.createElement('div');
            sub.className = 'msub';
            sub.setAttribute('data-interactive', '');
            if (!srcs.length) sub.textContent = 'no attributed damage recorded';
            const grand = srcs.reduce((a, x) => a + x.total, 0) || 1;
            for (const sr of srcs.slice(0, 12)) {
              const row = document.createElement('div');
              row.className = 'srow';
              row.innerHTML = '<span class="sn"></span><span class="sv"></span>';
              row.querySelector('.sn').textContent = sr.source;
              row.querySelector('.sv').textContent = fmt(sr.total) + ' · ' + Math.round(sr.total / grand * 100) + '%' +
                ' · ×' + sr.count + ' · avg ' + fmt(sr.avg) + (sr.crits ? ' · ' + sr.crits + ' crit' : '');
              sub.appendChild(row);
            }
            rowsEl.appendChild(sub);
          }
        }
      }
    }
  }
  const sessExpanded = new Set(); // Σ Session: players whose breakdown is open

  // ---- whole-session group DPS copy: same style as the fight copy buttons ----
  function sessionRowsForCopy() {
    const merged = settings && settings.mergePets !== false;
    const petTotal = [...session.pets.values()].reduce((a, b) => a + b, 0);
    const agg = (srcMap) => {
      let crits = 0, max = 0;
      for (const e of srcMap.values()) { crits += e.crits || 0; max = Math.max(max, e.max || 0); }
      return { crits, max };
    };
    const youAgg = agg(session.sources);
    const rows = [{ name: charName || 'You', total: session.total + (merged ? petTotal : 0),
                    crits: youAgg.crits, max: youAgg.max }];
    if (!merged) for (const [pname, ptotal] of session.pets)
      rows.push({ name: pname + ' (pet)', total: ptotal, crits: 0, max: 0 });
    for (const [name, p] of session.players) {
      if (petNames.has(name)) continue;
      const a = agg(p.sources);
      rows.push({ name, total: p.total, crits: a.crits, max: a.max });
    }
    return rows.sort((a, b) => b.total - a.total);
  }

  function copySession(full) {
    if (!session.fights) { toast('Nothing to copy — no fights this session yet'); return; }
    const n = Math.max(1, Math.min(10, +((settings && settings.copyTopN) || 5)));
    const rows = sessionRowsForCopy();
    const top = rows.slice(0, n);
    const durS = session.durS || 1;
    let text;
    if (!full) {
      text = 'Session (' + session.fights + ' fights, ' + fmtDur(session.durS) + ') — ' +
        top.map(r => r.name + ' ' + fmt(r.total) + ' @' + fmt(r.total / durS)).join(' | ');
    } else {
      const lines = ['SEQO — whole session · ' + session.fights + ' fights · ' + fmtDur(session.durS) + ' in combat'];
      for (const [i, r] of top.entries())
        lines.push((i + 1) + '. ' + r.name + ' — ' + fmt(r.total) + ' dmg · ' + fmt(r.total / durS) + ' dps' +
                   (r.max ? ' · max ' + fmt(r.max) : '') + (r.crits ? ' · ' + r.crits + ' crits' : ''));
      text = lines.join('\n');
    }
    text = EQLShare.withCredit(text);
    window.overlay.copyText(text);
    toast('📋 Copied session ' + (full ? 'breakdown' : 'chat line') + ' (top ' + top.length + ')');
    return text;
  }
  $('b-copy').addEventListener('click', () => copySession(false));
  $('b-copyfull').addEventListener('click', () => copySession(true));

  // Meter and Spells are ONE tab now: ⚔ Fight is the live meter, Σ Session is
  // the whole-session damage-by-source view (the old Spells tab). Per-fight
  // sources live on the meter itself — click any bar to expand them.
  bMode = 'session';
  $('b-mode-fight').addEventListener('click', () => setTab('meter'));
  $('b-mode-session').addEventListener('click', () => { bMode = 'session'; renderBreakdown(); });
  $('c-mode-fight').addEventListener('click', () => setTab('meter'));
  $('c-mode-session').addEventListener('click', () => { bMode = 'session'; setTab('breakdown'); });
  $('c-mode-heals').addEventListener('click', () => { bMode = 'heals'; setTab('breakdown'); });
  $('b-mode-heals').addEventListener('click', () => { bMode = 'heals'; renderBreakdown(); });
  $('c-fights').addEventListener('click', () => { $('c-menu').style.display = 'none'; openFightHistory(); });
  $('c-more').addEventListener('click', (e) => { e.stopPropagation(); const m = $('c-menu'); m.style.display = m.style.display === 'none' ? 'flex' : 'none'; });
  document.addEventListener('click', (e) => { const m = $('c-menu'); if (m && m.style.display !== 'none' && !m.contains(e.target) && e.target !== $('c-more')) m.style.display = 'none'; });
  $('chat-search').addEventListener('input', () => renderChat());
  $('bb-chat').addEventListener('click', openChat);
  $('chat-close').addEventListener('click', () => { $('chat-modal').style.display = 'none'; });

  $('chat-clear').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Clear saved?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '🗑'; }, 4000); return; }
    await window.overlay.chatClear();
    chatMsgs = chatMsgs.filter(m => !m.saved && !CHAT_PERSONAL.has(m.channel));
    b.dataset.armed = ''; b.textContent = '🗑';
    renderChat(); toast('🗑 Saved chat history cleared');
  });
  $('fh-close').addEventListener('click', () => { $('fh-modal').style.display = 'none'; });
  $('c-viewing').addEventListener('click', () => { viewFight = null; renderMeter(); });
  $('c-chart-btn').addEventListener('click', () => { save({ meterChart: !(settings && settings.meterChart) }); renderMeter(); });

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- run tracker: loot & coin between Start/End (instance clears, camps) ----
  let lootRun = null;          // active run: { startedAt, coin, items: Map(name -> count) }
  let lootRunHistory = [];     // ended runs this app session, newest first
  let lastRunNudge = 0;        // throttle for the "start a run?" instance reminder

  const fmtRunDur = (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    return (h ? h + 'h ' : '') + (m % 60) + 'm ' + (s % 60) + 's';
  };

  // compact h:mm:ss / m:ss clock for the bottom-bar run button
  const fmtClock = (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    return (h ? h + ':' + String(m % 60).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0');
  };

  // the Loot-tab button and the bottom-bar button drive the same run
  function updateRunButtons() {
    const bb = $('bb-run'), lr = $('l-run');
    if (lootRun) {
      const clock = fmtClock(Date.now() - lootRun.startedAt);
      bb.textContent = '⏹ End run · ' + clock;
      bb.classList.add('running');
      lr.innerHTML = '⏹ End run';
      lr.classList.add('gold');
    } else {
      bb.textContent = '▶ Start run';
      bb.classList.remove('running');
      lr.innerHTML = '▶ Start run';
      lr.classList.remove('gold');
    }
    updateBottomBar();
  }

  function toggleRun() {
    if (!lootRun) {
      lootRun = { startedAt: Date.now(), startLog: lastLineAt || Date.now(), coin: 0, items: new Map(), rares: new Map() };
      toast('▶ Run started — tracking loot, coin, motes & rare kills until you end it');
      // zone data parsed before the boss/named extraction existed (or never
      // fetched): refresh it once so the rare checklist is complete
      if (currentZone && (!zoneData || (zoneData.parserV || 0) < 2))
        updateZoneNow().then(() => { if (lootRun) renderRunBox(); }).catch(() => {});
    } else {
      lootRun.endedAt = Date.now();
      saveRunToHistory(lootRun);
      lootRunHistory.unshift(lootRun);
      lootRunHistory = lootRunHistory.slice(0, 8);
      const r = lootRun;
      lootRun = null;
      const items = [...r.items.values()].reduce((a, b) => a + b, 0);
      toast('⏹ Run ended — ' + (fmtCoin(r.coin) || 'no coin') + ' · ' + items + ' items' +
            (r.rares && r.rares.size ? ' · ' + r.rares.size + ' rare' + (r.rares.size === 1 ? '' : 's') : '') +
            ' · ' + fmtRunDur(r.endedAt - r.startedAt));
    }
    updateRunButtons();
    renderLoot();
  }
  $('l-run').addEventListener('click', toggleRun);
  $('bb-run').addEventListener('click', toggleRun);

  let runListOpen = false;   // full item list expanded?

  function copyRun(r, live, full) {
    const dur = (live ? Date.now() : r.endedAt) - r.startedAt;
    const items = [...r.items.values()].reduce((a, b) => a + b, 0);
    const moteRows = [...r.items.entries()].filter(([n]) => /mote/i.test(n)).sort((a, b) => b[1] - a[1]);
    const motes = moteRows.reduce((a, [, c]) => a + c, 0);
    const motesHr = motes && dur > 30000 ? (motes * 3600000 / dur).toFixed(1) : '';
    const rares = r.rares ? r.rares.size : 0;
    const known = live ? knownRares().length : 0;
    let text;
    if (!full) {
      text = 'Run ' + fmtRunDur(dur) + ' — ' + (fmtCoin(r.coin) || 'no coin') + ' · ' + items + ' items' +
        (motes ? ' · ' + motes + ' motes' + (motesHr ? ' (' + motesHr + '/hr)' : '') : '') +
        (rares || known ? ' · rares ' + rares + (known ? '/' + Math.max(known, rares) : '') : '');
    } else {
      const lines = ['SEQO run — ' + fmtRunDur(dur) + (live ? ' (live)' : '') +
                     ' · ' + (fmtCoin(r.coin) || 'no coin') +
                     (dur > 30000 && r.coin ? ' (' + fmtCoin(Math.round(r.coin * 3600000 / dur)) + '/hr)' : '')];
      if (moteRows.length)
        lines.push('Motes (' + motes + (motesHr ? ' · ' + motesHr + '/hr' : '') + '): ' + moteRows.map(([n, c]) => n + ' ×' + c).join(', '));
      if (r.rares && r.rares.size)
        lines.push('Rares down (' + r.rares.size + '): ' + [...r.rares.entries()]
          .map(([n, c]) => n + (c > 1 ? ' ×' + c : '')).join(', '));
      const top = [...r.items.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (top.length) {
        lines.push('Loot (' + items + '):');
        for (const [n, c] of top) lines.push('  ' + n + (c > 1 ? ' ×' + c : ''));
      }
      text = lines.join('\n');
    }
    text = EQLShare.withCredit(text);
    window.overlay.copyText(text);
    toast('📋 Copied run ' + (full ? 'report' : 'summary'));
  }

  // Known rares for the current zone: the wiki's named-mob list when we have
  // it, otherwise named mobs you've personally killed here before (lootDB).
  function knownRares() {
    const out = new Set();
    for (const n of rareAdds()[currentZone || ''] || []) if (!isNotRare(n)) out.add(n);
    for (const n of (zoneData && zoneData.named) || []) {
      const k = mobKey(n.mob);
      if (k && k !== '(zone drops)' && isRareMob(k)) out.add(k);
    }
    if (!out.size && lootDB && lootDB.mobs) {
      for (const m of Object.values(lootDB.mobs)) {
        if ((m.zone || '') !== (currentZone || '') || !m.kills) continue;
        if (/^(a|an|the) /i.test(m.name) || !/^[A-Z#]/.test(m.name)) continue;
        if (OBJECT_RE.test(m.name) || isNotRare(m.name)) continue;
        out.add(m.name);
      }
    }
    return [...out];
  }

  // "+ rare": type or pick a mob (recent kills in this zone are suggested)
  let rareAddOpen = false;
  function rareAddControl() {
    const w = document.createElement('div');
    w.style.cssText = 'display:flex;gap:4px;align-items:center;margin:1px 0 2px';
    if (!rareAddOpen) {
      const b = document.createElement('span');
      b.style.cssText = 'color:#7dc8ff;cursor:pointer;font-size:9.5px';
      b.textContent = '＋ mark a mob as rare';
      b.title = 'Add a mob to this zone’s rare list — it then counts in the checklist (click a rare to remove it)';
      b.addEventListener('click', () => { rareAddOpen = true; renderRunBox(); });
      w.appendChild(b);
      return w;
    }
    const inp = document.createElement('input');
    inp.setAttribute('list', 'rare-sugg');
    inp.placeholder = 'mob name…';
    inp.style.cssText = 'flex:1;min-width:0;background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;padding:1px 4px;font-size:10px';
    const dl = document.createElement('datalist'); dl.id = 'rare-sugg';
    const seen = new Set();
    for (const m of Object.values((lootDB && lootDB.mobs) || {}))
      if ((m.zone || '') === (currentZone || '') && m.kills && !seen.has(m.name)) { seen.add(m.name); const o = document.createElement('option'); o.value = m.name; dl.appendChild(o); }
    for (const f of tracker.history.slice(0, 10)) for (const k of f.kills || []) if (!seen.has(k)) { seen.add(k); const o = document.createElement('option'); o.value = mobKey(k); dl.appendChild(o); }
    const go = () => {
      const v = inp.value.trim();
      if (!v) return;
      setUserRare(v, true);
      // already killed this run? count it now
      const f = [...(tracker.current ? [tracker.current] : []), ...tracker.history];
      const n = f.reduce((a, x) => a + (x.kills || []).filter(k => mobKey(k).toLowerCase() === v.toLowerCase() && (!lootRun || x.lastCombat >= (lootRun.startLog || lootRun.startedAt))).length, 0);
      if (lootRun && n) lootRun.rares.set(mobKey(v), Math.max(lootRun.rares.get(mobKey(v)) || 0, n));
      toast('⭐ ' + v + ' marked rare in ' + (currentZone || 'this zone'));
      rareAddOpen = false; renderRunBox();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') { rareAddOpen = false; renderRunBox(); } });
    const ok = document.createElement('button'); ok.className = 'kbtn'; ok.textContent = 'Add'; ok.style.fontSize = '9.5px';
    ok.addEventListener('click', go);
    const x = document.createElement('button'); x.className = 'kbtn'; x.textContent = '✕'; x.style.fontSize = '9.5px';
    x.addEventListener('click', () => { rareAddOpen = false; renderRunBox(); });
    w.append(inp, dl, ok, x);
    setTimeout(() => inp.focus(), 0);
    return w;
  }

  function renderRunBox() {
    const box = $('l-run-box');
    box.innerHTML = '';
    const mk = (r, live, label) => {
      const dur = (live ? Date.now() : r.endedAt) - r.startedAt;
      const items = [...r.items.values()].reduce((a, b) => a + b, 0);
      const moteRows = [...r.items.entries()].filter(([n]) => /mote/i.test(n))
        .sort((a, b) => b[1] - a[1]);
      const motes = moteRows.reduce((a, [, c]) => a + c, 0);
      const motesHr = motes && dur > 30000 ? (motes * 3600000 / dur) : 0;
      const perHr = dur > 30000 && r.coin ? Math.round(r.coin * 3600000 / dur) : 0;
      const d = document.createElement('div');
      d.style.cssText = 'background:rgba(255,215,102,' + (live ? '.10' : '.05') + ');border:1px solid rgba(255,215,102,.3);border-radius:6px;padding:4px 8px;margin-bottom:4px';
      const h = document.createElement('div');
      h.style.cssText = 'display:flex;gap:10px;font-size:11px;flex-wrap:wrap;color:' + (live ? '#ffd766' : '#cfc9a8');
      h.innerHTML = '<b></b><span style="color:#7dffa0"></span>' +
        (motes ? '<span class="rmotes" style="color:#7da7d9;cursor:help">✨ ' + motes + ' mote' + (motes === 1 ? '' : 's') +
                 (motesHr ? ' (' + motesHr.toFixed(1) + '/hr)' : '') + '</span>' : '') +
        '<span></span>' + (perHr ? '<span>' + fmtCoin(perHr) + ' /hr</span>' : '') +
        '<span class="rtoggle" style="margin-left:auto;cursor:pointer;color:#9ab"></span>';
      const sp = h.querySelectorAll('b,span:not(.rtoggle)');
      sp[0].textContent = (live ? '⏺ RUN — ' : label + ' — ') + fmtRunDur(dur);
      sp[1].textContent = fmtCoin(r.coin) || 'no coin';
      sp[motes ? 3 : 2].textContent = items + ' item' + (items === 1 ? '' : 's');
      const mo = h.querySelector('.rmotes');
      if (mo) mo.title = moteRows.map(([n, c]) => n + ' ×' + c).join('\n');
      const tog = h.querySelector('.rtoggle');
      tog.textContent = runListOpen ? 'hide list ▴' : 'full list ▾';
      tog.addEventListener('click', () => { runListOpen = !runListOpen; renderRunBox(); });
      // copy-to-chat buttons for this run
      const mkCopy = (label, title, full) => {
        const b = document.createElement('span');
        b.style.cssText = 'margin-left:8px;cursor:pointer;color:#9ab';
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', (e) => { e.stopPropagation(); copyRun(r, live, full); });
        return b;
      };
      tog.before(mkCopy('📋 chat', 'Copy a one-line run summary for in-game chat', false),
                 mkCopy('📋 full', 'Copy the full run report (motes, rares, every item) for Discord', true));
      d.appendChild(h);

      const top = [...r.items.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (top.length && !runListOpen) {
        // collapsed: one compact line, motes first so they're always visible
        const first = [...top.filter(([n]) => /mote/i.test(n)), ...top.filter(([n]) => !/mote/i.test(n))];
        const list = document.createElement('div');
        list.style.cssText = 'color:#aab;font-size:10px;line-height:1.45;white-space:normal';
        list.textContent = first.slice(0, 10).map(([n, c]) => n + (c > 1 ? ' ×' + c : '')).join(' · ') +
          (first.length > 10 ? ' · +' + (first.length - 10) + ' more (full list ▾)' : '');
        d.appendChild(list);
      } else if (top.length && runListOpen) {
        // expanded: every item on its own row, motes highlighted
        const list = document.createElement('div');
        list.style.cssText = 'font-size:10px;line-height:1.5;margin-top:2px;column-width:170px;column-gap:14px';
        for (const [n, c] of top) {
          const row = document.createElement('div');
          const isMote = /mote/i.test(n);
          row.style.cssText = 'color:' + (isMote ? '#7da7d9' : '#aab') + ';break-inside:avoid';
          row.textContent = (isMote ? '✨ ' : '') + n + (c > 1 ? '  ×' + c : '');
          list.appendChild(row);
        }
        d.appendChild(list);
      }

      // rare checklist: which named mobs are down, which are still up
      const killed = r.rares ? new Map(r.rares) : new Map();
      const known = live ? knownRares() : [];
      if (killed.size || known.length || live) {
        const killedLc = new Map([...killed].map(([n, c]) => [n.toLowerCase(), c]));
        const rd = document.createElement('div');
        rd.style.cssText = 'font-size:10px;line-height:1.5;margin-top:3px;border-top:1px dashed rgba(255,215,102,.25);padding-top:2px';
        const bits = [];
        for (const n of known)
          bits.push({ n, c: killedLc.get(n.toLowerCase()) || 0, down: killedLc.has(n.toLowerCase()) });
        for (const [n, c] of killed) // rares killed in another zone earlier in the run
          if (!known.some(k => k.toLowerCase() === n.toLowerCase())) bits.push({ n, c, down: true });
        const downN = bits.filter(b => b.down).length;
        const hd = document.createElement('div');
        hd.style.cssText = 'color:#ffd766';
        hd.textContent = bits.length ? '⭐ Rares — ' + downN + ' of ' + bits.length + ' down' +
          (live && known.length ? ' (' + currentZone + ')' : '') : '⭐ Rares — none known here yet';
        const hidden = (notRares[currentZone || ''] || []).length;
        if (live && hidden) {
          const restore = document.createElement('span');
          restore.style.cssText = 'margin-left:8px;color:#778;cursor:pointer;font-size:9.5px';
          restore.textContent = hidden + ' removed — restore';
          restore.title = 'Bring back the mobs you removed from this zone’s rare list';
          restore.addEventListener('click', () => {
            for (const n of (notRares[currentZone || ''] || []).slice()) setNotRare(n, false);
            renderRunBox();
          });
          hd.appendChild(restore);
        }
        rd.appendChild(hd);
        if (live) rd.appendChild(rareAddControl());
        const line = document.createElement('div');
        line.style.cssText = 'white-space:normal';
        for (const b of bits.sort((a, x) => (x.down - a.down) || a.n.localeCompare(x.n))) {
          const sp = document.createElement('span');
          sp.style.cssText = 'margin-right:9px;color:' + (b.down ? '#7dffa0' : '#99a') + (live ? ';cursor:pointer' : '');
          sp.textContent = (b.down ? '✓ ' : '○ ') + b.n + (b.c > 1 ? ' ×' + b.c : '');
          if (live) {
            sp.title = 'Not actually a rare? Click to remove ' + b.n + ' from this zone’s rare list (undo via "restore" on the Rares line)';
            sp.addEventListener('click', () => {
              if (isUserRare(b.n)) setUserRare(b.n, false);
              setNotRare(b.n, true);
              if (lootRun && lootRun.rares) lootRun.rares.delete(mobKey(b.n));
              toast('⭐ ' + b.n + ' removed from ' + (currentZone || 'this zone') + '’s rares');
              renderRunBox();
            });
          }
          line.appendChild(sp);
        }
        rd.appendChild(line);
        d.appendChild(rd);
      }
      return d;
    };
    if (lootRun) box.appendChild(mk(lootRun, true));
    else if (lootRunHistory.length) {
      box.appendChild(mk(lootRunHistory[0], false, 'Last run'));
      for (const [i, r] of lootRunHistory.slice(1, 4).entries()) {
        const line = document.createElement('div');
        line.style.cssText = 'color:#777;font-size:9.5px;padding:0 2px';
        const items = [...r.items.values()].reduce((a, b) => a + b, 0);
        line.textContent = 'Run -' + (i + 2) + ': ' + fmtRunDur(r.endedAt - r.startedAt) + ' · ' +
          (fmtCoin(r.coin) || 'no coin') + ' · ' + items + ' items';
        box.appendChild(line);
      }
    }
  }

