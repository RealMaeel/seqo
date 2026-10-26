// SEQO overlay — session accumulation, main loop, locked-mode hover.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= session accumulation =================
  tracker.onFightEnd = (s) => {
    if (!s) return;
    session.fights++;
    session.swings += s.youSwings;
    session.total += s.you.total;
    session.durS += s.durS;
    for (const p of s.petRows || []) { // pet damage counts toward your session output
      session.pets.set(p.name, (session.pets.get(p.name) || 0) + p.total);
    }
    for (const r of s.youBySource) {
      let e = session.sources.get(r.source);
      if (!e) session.sources.set(r.source, e = { total: 0, count: 0, crits: 0, max: 0, nocast: false });
      e.total += r.total; e.count += r.count; e.crits += r.crits;
      e.max = Math.max(e.max, r.max);
      if (r.procRate !== undefined) e.nocast = true;
    }
    // everyone ELSE's session damage too — totals plus their by-source rows,
    // so the Σ Session view can show the whole group, not just you
    // (onFightEnd fires with the ended fight still readable as tracker.last)
    for (const r of s.rows || []) {
      if (r.name === 'You') continue;
      let p = session.players.get(r.name);
      if (!p) session.players.set(r.name, p = { total: 0, sources: new Map() });
      p.total += r.total;
      for (const src of tracker.attackerSources(r.name)) {
        let e = p.sources.get(src.source);
        if (!e) p.sources.set(src.source, e = { total: 0, count: 0, crits: 0, max: 0 });
        e.total += src.total; e.count += src.count; e.crits += src.crits;
        e.max = Math.max(e.max, src.max);
      }
    }
  };

  // source classification: user override wins, else auto (no-cast = proc)
  function effectiveClass(source, nocast) {
    return sourceClass[source] || (nocast ? 'proc' : 'cast');
  }

  // ================= main loop =================
  setInterval(() => {
    tracker.tick();
    const liveNow = !!tracker.current;

    if (meterDirty || liveNow) {
      meterDirty = false;
      if (activeTab === 'meter') renderMeter();
      else if (activeTab === 'breakdown') renderBreakdown();
    }
    if (lootDirty) {
      lootDirty = false;
      if (activeTab === 'loot') renderLoot();
      cleanupDirty = true;
    }
    if (cleanupDirty && cleanupActive && !cleanupScanning) {
      cleanupDirty = false;
      pushCleanup();
      maybeAutoScan();   // new unknowns from fresh loot/inventory look themselves up
    }
    if (needsDirty && (needsOpen || activeTab === 'needs')) {
      needsDirty = false;
      const flash = pendingNeedsFlash;
      pendingNeedsFlash = null;
      if (needsOpen) pushNeeds(flash);
      if (activeTab === 'needs') renderNeedsTab(flash);
    }
  }, 500);

  // ================= locked-mode hover interactivity =================
  // Anything clickable counts, not only [data-interactive] containers: a
  // button that lives outside one (like Start run) must still work locked.
  const INTERACTIVE_SEL =
    '[data-interactive], button, select, input, textarea, label, a, summary, details, .tab, .kbtn, .chip, .badge';
  let interactiveNow = false;
  window.addEventListener('mousemove', (e) => {
    if (!locked) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = !!(el && (el.closest(INTERACTIVE_SEL) ||
                           getComputedStyle(el).cursor === 'pointer'));
    document.body.classList.toggle('hovering', over);
    if (over !== interactiveNow) {
      interactiveNow = over;
      window.overlay.setInteractive(over);
    }
  });

