// SEQO overlay — ⏲ camp timers: countdown rows, ★ pinned camps, the ⏳ spawn heads-up,
// manual timer start, and the 1-second tick that plays camp alerts (spawnwarn.js decides which).
// Moved out of 11-spells.js in 2.7. One of the ui/overlay/*.js files overlay.html loads in order
// as classic scripts: they share one global scope, exactly as when this was a single inline <script>.
  // ================= ⏲ camp timers =================
  function fmtCountdown(t, now) {
    if (t.up) return { txt: '⚔ UP NOW', due: true };
    const alive = (now - t.lastDeath) / 1000;
    const e = t.resp;
    if (e && e.min && e.max && e.max > e.min) {   // spawn window: "15–30m"
      if (alive < e.min) return { txt: 'window in ' + fmtDur(e.min - alive) + ' (' + fmtDur(e.min) + '–' + fmtDur(e.max) + ')', due: false };
      if (alive < e.max) return { txt: '🪟 WINDOW OPEN · ' + fmtDur(e.max - alive) + ' left', due: true };
      return { txt: 'DUE (' + fmtDur(alive - e.max) + ' past window)', due: true };
    }
    if (e && e.s) {
      const left = e.s - alive;
      if (left > 0) return { txt: 'repop in ' + fmtDur(left), due: false };
      return { txt: 'DUE (' + fmtDur(-left) + ' over)', due: true };
    }
    return { txt: 'died ' + fmtDur(alive) + ' ago — timing…', due: false };
  }

  // the 1s tick only refreshes countdown TEXT via these closures — the row
  // structure is rebuilt by renderTimers() on real changes (kills, pins, zone)
  let timerTickUpds = [];
  function tickTimerTexts() { for (const u of timerTickUpds) u(); }

  // the first time you pin a camp, say what pinning does (once)
  function pinnedTip() {
    if (!settings || settings.spawnWarnTipShown) return;
    save({ spawnWarnTipShown: true });
    const o = spawnWarnOpts();
    toast(o.heads ? '📌 Pinned — you’ll get a ⏳ heads-up ' + EQLSpawnWarn.lead(o.warnSecs) + ' before it spawns (change it at the top of Timers)'
                  : '📌 Pinned — on the camp bar, with an alert when it’s due', true);
  }
  function renderTimers() {
    renderSpawnWarnRow();
    keepScroll($('t-rows'));
    timerTickUpds = [];
    const rows = $('t-rows');
    // current-zone timers, PLUS pinned camps from anywhere — otherwise a camp
    // you zoned away from couldn't be unpinned until you went back
    const list = [...timers.values()]
      .filter(t => t.zone === currentZone || t.pinned)
      .sort((a, b) => (b.pinned - a.pinned) || (b.lastDeath - a.lastDeath))
      .slice(0, 20);
    $('t-empty').style.display = list.length ? 'none' : 'flex';
    $('t-zoneinfo').textContent = currentZone
      ? currentZone + (zoneData && zoneData.respawnSeconds ? ' · zone timer ' + fmtDur(zoneData.respawnSeconds) : '')
      : '';
    rows.innerHTML = '';
    const now = Date.now();
    // datalist suggestions: zone named mobs, your loot-db mobs, existing timers
    const sugg = new Set();
    for (const nm of ((zoneData && zoneData.named) || [])) if (nm.mob !== '(zone drops)') sugg.add(nm.mob);
    for (const m of Object.values(lootDB.mobs || {})) sugg.add(m.name);
    for (const t of timers.keys()) sugg.add(t);
    $('t-suggest').innerHTML = [...sugg].slice(0, 200)
      .map(s => '<option value="' + s.replace(/"/g, '&quot;') + '">').join('');

    for (const t of list) {
      if (!t.resp) t.resp = resolveRespawn(t.mob, t.zone); // zone data may have loaded late
      const c = t.lastDeath ? fmtCountdown(t, now) : { txt: 'waiting for kill', due: false };
      const div = document.createElement('div');
      div.className = 'l-mob';
      div.style.marginTop = '3px';
      const star = document.createElement('span');
      star.textContent = t.pinned ? '★ ' : '☆ ';
      star.style.color = t.pinned ? '#ffd766' : '#666';
      const wo = spawnWarnOpts();
      div.title = t.pinned
        ? 'Pinned camp: on the camp bar, alerts when it’s due' + (wo.heads ? ', and a ⏳ heads-up ' + EQLSpawnWarn.lead(wo.warnSecs) + ' before' : '') + '. Click to unpin.'
        : 'Click to pin this camp: camp bar + alerts when it’s due' + (wo.heads ? ' + a ⏳ heads-up ' + EQLSpawnWarn.lead(wo.warnSecs) + ' before it spawns' : '');
      const nm = document.createElement('span');
      nm.textContent = t.mob + (t.zone !== currentZone ? '  (' + t.zone + ')' : '');
      nm.style.flex = '1';
      nm.style.overflow = 'hidden'; nm.style.textOverflow = 'ellipsis'; nm.style.whiteSpace = 'nowrap';
      const cd = document.createElement('span');
      cd.className = 'k';
      cd.textContent = c.txt + respMark(t.resp);
      cd.title = !t.resp ? 'No timer source yet — SEQO learns the cycle from kill-to-kill gaps'
        : t.resp.src === 'manual' ? 'Manual timer (✎ to change or revert to auto)'
        : t.resp.src === 'wiki' ? 'Zone-wide timer from the wiki — unverified for this mob'
        : (t.resp.n || 0) >= 3 ? 'Learned from ' + t.resp.n + ' of your own kill cycles'
        : 'Tentative — learned from only ' + (t.resp.n || 1) + ' cycle' + ((t.resp.n || 1) === 1 ? '' : 's') + ' so far';
      if (c.due) { cd.style.color = '#7dffa0'; cd.style.fontWeight = '700'; }
      timerTickUpds.push(() => { // per-second text refresh, no DOM rebuild
        if (!t.resp) t.resp = resolveRespawn(t.mob, t.zone); // zone data may load late
        if (!t.lastDeath) return;
        const cc = fmtCountdown(t, Date.now());
        cd.textContent = cc.txt + respMark(t.resp);
        cd.style.color = cc.due ? '#7dffa0' : '';
        cd.style.fontWeight = cc.due ? '700' : '';
      });
      // ✎ manual override: fixed ("6:40", "25m") or window ("15-30" = minutes)
      const pen = document.createElement('span');
      pen.textContent = '✎';
      pen.style.cssText = 'flex:none;cursor:pointer;color:' + (t.resp && t.resp.src === 'manual' ? '#ffd766' : '#667') + ';padding:0 3px';
      pen.title = 'Set the timer yourself: "6:40" or "25m" fixed, "15-30" for a 15–30 minute window. Empty = back to auto.';
      pen.addEventListener('click', (e) => {
        e.stopPropagation();
        editTimerFor = editTimerFor === t.mob ? null : t.mob;
        renderTimers();
      });
      div.append(star, nm, cd);
      // ⏳ this camp will warn you (pinned, a respawn known, heads-up on)
      if (t.pinned && wo.heads) {
        const hw = document.createElement('span');
        hw.className = 't-headsup';
        const known = t.resp && (t.resp.s || (t.resp.min && t.resp.max));
        hw.textContent = known ? '⏳' + fmtDur(wo.warnSecs) : '⏳?';
        hw.title = known ? 'Heads-up ' + EQLSpawnWarn.lead(wo.warnSecs) + ' before it spawns (change it at the top of Timers)'
                         : 'Heads-up once SEQO knows the respawn — after your second kill, or set it with ✎';
        if (!known) hw.style.opacity = '.5';
        div.appendChild(hw);
      }
      div.append(pen);

      if (t.pinned) {
        const ph = document.createElement('span');
        ph.textContent = linkMode === t.mob ? 'click a row…' : '+PH';
        ph.style.cssText = 'flex:none;font-size:9.5px;padding:0 6px;border-radius:8px;cursor:pointer;' +
          (linkMode === t.mob ? 'background:rgba(125,255,160,.2);color:#7dffa0'
                              : 'background:rgba(255,255,255,.1);color:#aaa');
        ph.title = 'Link a placeholder: its kills reset this camp\'s spawn cycle';
        ph.addEventListener('click', (e) => {
          e.stopPropagation();
          linkMode = linkMode === t.mob ? null : t.mob;
          renderTimers();
        });
        div.appendChild(ph);
      }

      div.addEventListener('click', () => {
        if (linkMode && linkMode !== t.mob) {
          const camp = timers.get(linkMode);
          if (camp) {
            camp.phs.add(t.mob);
            savePhs(camp);
            toast('🔗 ' + t.mob + ' linked as placeholder for ' + camp.mob);
          }
          linkMode = null;
        } else {
          t.pinned = !t.pinned;
          if (t.pinned && !t.phs) t.phs = loadPhs(t.mob);
          if (t.pinned) pinnedTip();
        }
        renderTimers(); renderCampBar();
      });
      rows.appendChild(div);

      // inline ✎ editor
      if (editTimerFor === t.mob) {
        const ed = document.createElement('div');
        ed.style.cssText = 'display:flex;gap:5px;align-items:center;padding:2px 6px 3px 24px';
        const inp = document.createElement('input');
        inp.placeholder = (t.resp && t.resp.manual) || '6:40 · 25m · 15-30';
        inp.value = (t.resp && t.resp.src === 'manual' && t.resp.manual) || '';
        inp.style.cssText = 'width:110px;background:#26262f;color:#eee;border:1px solid #555;border-radius:4px;padding:1px 5px;font-size:10.5px';
        const apply = () => {
          const v = inp.value.trim();
          if (setManualRespawn(t.mob, v, t.zone)) {
            t.resp = resolveRespawn(t.mob, t.zone);
            EQLSpawnWarn.reset(t);
            editTimerFor = null;
            toast(v ? '✎ ' + t.mob + ' timer set to ' + v : '↩ ' + t.mob + ' back to automatic timing');
            renderTimers(); renderCampBar();
          } else {
            toast('⚠ Couldn\'t read "' + v + '" — try 6:40, 25m, or 15-30');
          }
        };
        const ok = document.createElement('button');
        ok.className = 'kbtn gold'; ok.textContent = 'set'; ok.style.fontSize = '10px';
        ok.addEventListener('click', (e) => { e.stopPropagation(); apply(); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') { editTimerFor = null; renderTimers(); } });
        inp.addEventListener('click', (e) => e.stopPropagation());
        const hint = document.createElement('span');
        hint.style.cssText = 'color:#778;font-size:9.5px';
        hint.textContent = t.resp && t.resp.src === 'manual' ? 'empty + set = back to auto' : '"15-30" = window in minutes';
        ed.append(inp, ok, hint);
        ed.addEventListener('click', (e) => e.stopPropagation());
        rows.appendChild(ed);
        setTimeout(() => inp.focus(), 0);
      }

      // placeholder list under a pinned camp (click a PH to unlink)
      if (t.pinned && t.phs && t.phs.size) {
        const phRow = document.createElement('div');
        phRow.style.cssText = 'padding:0 6px 2px 24px;font-size:10px;color:#8fa9c7';
        phRow.textContent = 'PH: ';
        for (const p of t.phs) {
          const chip = document.createElement('span');
          chip.textContent = p + ' ✕';
          chip.style.cssText = 'cursor:pointer;margin-right:8px';
          chip.title = 'Unlink this placeholder';
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            t.phs.delete(p);
            savePhs(t);
            renderTimers();
          });
          phRow.appendChild(chip);
        }
        rows.appendChild(phRow);
      }
    }
  }

  $('t-addbtn').addEventListener('click', () => { if (addCampTyped($('t-add').value)) $('t-add').value = ''; });
  $('t-add').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { if (addCampTyped($('t-add').value)) $('t-add').value = ''; }
  });

  // manual countdown timers: label + duration -> chip on every tab
  function mtStart() {
    const secs = parseDuration($('mt-dur').value);
    if (!secs || secs <= 0) { toast('Enter a time first — e.g. 90, 1:30, or 5m'); $('mt-dur').focus(); return; }
    startManualTimer($('mt-name').value.trim(), secs);
    $('mt-name').value = ''; $('mt-dur').value = '';
  }
  $('mt-start').addEventListener('click', mtStart);
  $('mt-dur').addEventListener('keydown', (e) => { if (e.key === 'Enter') mtStart(); });
  $('mt-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { $('mt-dur').focus(); } });

  // ⏳ spawn heads-up settings (top of the Timers tab): on by default, 60 s
  const spawnWarnOpts = () => ({
    heads: !settings || settings.spawnWarn !== false,
    warnSecs: settings && settings.spawnWarnSecs != null ? +settings.spawnWarnSecs : EQLSpawnWarn.DEFAULT_WARN
  });
  // spoken even when "Speak alerts aloud" is off — the Timers tab's 🗣 box asked for it
  function speakAlways(text) {
    if (!settings) return speak(text);
    const was = settings.ttsOn; settings.ttsOn = true;
    try { speak(text); } finally { settings.ttsOn = was; }
  }
  function renderSpawnWarnRow() {
    const o = spawnWarnOpts();
    if (!$('t-warn-on')) return;
    $('t-warn-on').checked = o.heads;
    if (document.activeElement !== $('t-warn-secs')) $('t-warn-secs').value = o.warnSecs;
    $('t-warn-say').checked = !!(settings && settings.spawnWarnSay);
    $('t-warn-row').classList.toggle('off', !o.heads);
  }
  (() => {
    if (!$('t-warn-on')) return;
    $('t-warn-on').addEventListener('change', (e) => { save({ spawnWarn: e.target.checked }); renderSpawnWarnRow(); renderTimers(); });
    $('t-warn-secs').addEventListener('change', (e) => {
      const v = Math.max(5, Math.min(1800, Math.round(+e.target.value || EQLSpawnWarn.DEFAULT_WARN)));
      e.target.value = v; save({ spawnWarnSecs: v });
      for (const t of timers.values()) t.soonNotified = false;   // the new lead time applies to camps already counting down
      renderTimers();
    });
    $('t-warn-say').addEventListener('change', (e) => save({ spawnWarnSay: e.target.checked }));
    $('t-warn-test').addEventListener('click', () => {
      const s = spawnWarnOpts().warnSecs;
      alertFX('⏳ Test camp spawns in ' + EQLSpawnWarn.lead(s), 'repop');
      if (settings && settings.spawnWarnSay) speakAlways('Test camp spawns in ' + EQLSpawnWarn.leadSaid(s));
    });
  })();

  // tick: countdowns + due / window-open notifications
  setInterval(() => {
    const now = Date.now();
    // ★ pinned camps: ⏳ heads-up before the spawn, then due / window open / past window (spawnwarn.js)
    for (const t of timers.values()) {
      if (!t.pinned || !window.EQLSpawnWarn) continue;
      for (const a of EQLSpawnWarn.check(t, now, spawnWarnOpts())) {
        alertFX(a.text, 'repop');
        if (settings && settings.spawnWarnSay) speakAlways(a.say);
      }
    }
    if (activeTab === 'timers' && !editTimerFor) tickTimerTexts(); // text-only refresh; rows rebuild on real changes
    if (activeTab === 'loot' && lootRun) renderRunBox(); // live run clock
    if (lootRun) updateRunButtons();                     // bottom-bar clock ticks everywhere
    renderCampBar();
  }, 1000);

