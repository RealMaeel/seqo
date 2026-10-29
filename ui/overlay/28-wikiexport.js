// SEQO overlay — wiki export of observed drop rates.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= wiki export of observed drop rates =================
  // split "Zone (Fused)" into base zone + wiki tier label
  function tierOf(zone) {
    const m = /^(.*) \(([^)]+)\)$/.exec(zone || '');
    if (m && TIER_LABELS[m[2]]) return { base: m[1], tier: TIER_LABELS[m[2]] };
    return { base: zone || '', tier: '' };
  }

  // aggregate per base-zone+mob: drops POOL across tiers (same loot table,
  // just +N item levels), mob strength stays PER TIER (that's what scales)
  function aggregatedMobs() {
    const agg = new Map();
    for (const m of Object.values(lootDB.mobs || {})) {
      const { base, tier } = tierOf(m.zone);
      const key = base + '|' + m.name;
      let a = agg.get(key);
      if (!a) agg.set(key, a = { name: m.name, zone: base, kills: 0, drops: {}, tiers: new Map(), respawns: [] });
      a.kills += m.kills || 0;
      for (const d of Object.values(m.drops || {})) {
        const f = a.drops[d.name] || (a.drops[d.name] = { name: d.name, count: 0 });
        f.count += d.count;
      }
      if (m.maxHit || m.hitCount || m.level || (m.spells || []).length) {
        const tl = tier || 'D0 (base)';
        let t = a.tiers.get(tl);
        if (!t) a.tiers.set(tl, t = { maxHit: 0, hits: 0, total: 0, spells: new Set(), level: 0 });
        t.maxHit = Math.max(t.maxHit, m.maxHit || 0);
        t.hits += m.hitCount || 0;
        t.total += m.hitTotal || 0;
        if (m.level) t.level = m.level;
        for (const s of m.spells || []) t.spells.add(s);
      }
      const rs = normRespawn(respawnDB[(m.zone || '') + '|' + m.name]);
      if (rs && rs.src !== 'wiki') a.respawns.push({ tier: tier || 'D0 (base)', e: rs });
    }
    return [...agg.values()]
      .filter(a => a.kills > 0 || a.tiers.size)
      .sort((x, y) => y.kills - x.kills);
  }

  // everything SEQO observed about one mob, as wikitext
  function mobWikitext(a) {
    let t = 'Observed ' + (a.zone ? 'in ' + a.zone + ' ' : '') + 'over ' + a.kills +
      ' kill' + (a.kills === 1 ? '' : 's') +
      ' across all difficulty tiers (drops are tier-independent per [[Difficulty Level]] — ' +
      'higher tiers drop the same items at +N levels). Auto-parsed from combat logs by SEQO:\n';
    const items = Object.values(a.drops || {}).sort((x, y) => y.count - x.count);
    if (items.length && a.kills) {
      t += '{| class="wikitable"\n! Item !! Drops !! Kills !! Observed rate\n';
      for (const it of items) {
        const pct = (it.count / a.kills * 100);
        t += '|-\n| [[' + it.name + ']] || ' + it.count + ' || ' + a.kills +
          ' || ' + (pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)) + '%\n';
      }
      t += '|}\n';
    }
    if (a.tiers.size) {
      t += 'Mob strength by difficulty:\n';
      t += '{| class="wikitable"\n! Difficulty !! Level !! Max hit !! Avg hit !! Sample !! Casts seen\n';
      for (const [tl, st] of [...a.tiers.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
        t += '|-\n| ' + tl + ' || ' + (st.level || '—') + ' || ' + (st.maxHit || '—') +
          ' || ' + (st.hits ? Math.round(st.total / st.hits) : '—') +
          ' || ' + st.hits + ' hits || ' +
          ([...st.spells].map(s => '[[' + s + ']]').join(', ') || '—') + '\n';
      }
      t += '|}\n';
    }
    for (const r of a.respawns) {
      const e = r.e;
      const txt = e.min && e.max && e.max > e.min
        ? fmtDur(e.min) + '–' + fmtDur(e.max) + ' window'
        : '~' + fmtDur(e.s);
      const how = e.src === 'manual' ? 'set by hand' : 'measured from ' + (e.n || 1) + ' kill-to-kill cycle' + ((e.n || 1) === 1 ? '' : 's');
      t += '* Respawn at ' + r.tier + ': ' + txt + ' (' + how + ')\n';
    }
    return t.trim();
  }

  // per-mob chunks for talk-page submission
  function generatePerMob() {
    return aggregatedMobs().map(a => ({ mob: a.name, text: mobWikitext(a) }));
  }

  // the wiki's own difficulty terminology ([[Difficulty Level]]: D0-D4)
  const TIER_LABELS = { 'Awakened': 'D1 (Awakened)', 'Adaptive': 'D2 (Adaptive)',
                        'Fused': 'D3 (Fused)', 'Refined': 'D4 (Refined)' };
  function generateWikitext() {
    const mobs = aggregatedMobs();
    if (!mobs.length) return 'No drop data recorded yet — kill and loot some mobs first.';

    const today = new Date().toISOString().slice(0, 10);
    let out = '<!-- Observed mob data (drop rates, per-tier strength, casts, respawns),\n' +
      '     auto-generated from combat log parsing by SEQO on ' + today + '.\n' +
      '     Drop rates pool all difficulty tiers (same loot table, +N item levels\n' +
      '     per [[Difficulty Level]]); mob strength is broken out per tier. -->\n\n';

    // grouped by base zone: that's how the wiki organizes hunting data
    const byZone = new Map();
    for (const m of mobs) {
      const z = m.zone || 'Unattributed (recorded before zone tracking)';
      if (!byZone.has(z)) byZone.set(z, []);
      byZone.get(z).push(m);
    }
    for (const [zone, zmobs] of [...byZone.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      out += '== ' + zone + ' ==\n\n';
      for (const m of zmobs) {
        out += '=== ' + m.name + ' ===\n' + mobWikitext(m) + '\n\n';
      }
    }
    return out.trim();
  }

  $('l-export').addEventListener('click', () => {
    $('export-text').textContent = generateWikitext();
    $('export-status').textContent = '';
    $('export-modal').style.display = 'flex';
  });
  $('export-close').addEventListener('click', () => $('export-modal').style.display = 'none');
  $('login-close').addEventListener('click', () => $('login-modal').style.display = 'none');
  $('recap-close').addEventListener('click', () => { $('recap-modal').style.display = 'none'; });
  // first 2.6 launch: offer the old-logs read once (History + going rates start full).
  // Waits for the login popup to be gone so two popups never stack.
  (function offerOldLogs() {
    const tryShow = () => {
      if (!settings || settings.oldLogsOffered || window.__EQLTEST) return;
      if (!settings.logPath) { setTimeout(tryShow, 30000); return; }
      if ($('login-modal').style.display === 'flex' || $('recap-modal').style.display === 'flex') { setTimeout(tryShow, 5000); return; }
      $('oldlogs-modal').style.display = 'flex';
    };
    setTimeout(tryShow, 9000);
    $('oldlogs-later').addEventListener('click', () => { save({ oldLogsOffered: true }); $('oldlogs-modal').style.display = 'none'; toast('You can do it any time: Σ Session → 📚 History → 📥 Old logs'); });
    $('oldlogs-go').addEventListener('click', async () => {
      const go = $('oldlogs-go');
      if (go.dataset.done) { $('oldlogs-modal').style.display = 'none'; return; }
      if (go.disabled) return;
      go.disabled = true; $('oldlogs-later').style.display = 'none';
      $('oldlogs-text').textContent = 'Reading… 0%';
      const prog = (p) => { if (go.disabled) $('oldlogs-text').textContent = 'Reading ' + p.file + ' … ' + p.pct + '%'; };
      window.overlay.onHistoryImportProgress(prog);
      let r = null;
      try { r = await window.overlay.historyImportLogs(); } catch (e) { r = { error: e.message }; }
      go.disabled = false;
      save({ oldLogsOffered: true });
      if (r && r.ok) {
        refreshPriceMed();
        $('oldlogs-text').textContent = '✔ Added ' + r.added + ' past session' + (r.added === 1 ? '' : 's') + ' to History and ' + (r.prices || 0).toLocaleString() +
          ' prices' + (r.killTimes ? ' and ' + r.killTimes.toLocaleString() + ' kill times' : '') + ' from ' + r.files + ' log files. Going rates now show on loot, the item card and Lookup' + (r.killTimes ? '; kill cards list when each kill happened' : '') + '.';
      } else $('oldlogs-text').textContent = '⚠ ' + ((r && r.error) || 'could not read the logs') + ' — you can retry from Σ Session → 📚 History → 📥 Old logs.';
      go.textContent = 'Close';
      go.dataset.done = '1';
    });
  })();
  $('b-history').addEventListener('click', openHistory);
  $('hist-close').addEventListener('click', () => { $('hist-modal').style.display = 'none'; });
  $('hist-csv').addEventListener('click', () => exportHistory('csv'));
  $('hist-import').addEventListener('click', async () => {
    const b = $('hist-import');
    if (b.disabled) return;
    b.disabled = true; b.textContent = '📥 reading… 0%';
    try {
      const r = await window.overlay.historyImportLogs();
      if (r && r.ok) {
        toast('📥 Added ' + r.added + ' past session' + (r.added === 1 ? '' : 's') + (r.prices ? ' and ' + r.prices.toLocaleString() + ' WTS/WTB prices' : '') +
          (r.killTimes ? ', ' + r.killTimes.toLocaleString() + ' kill times' : '') +
          (r.spells ? ', ' + r.spells.toLocaleString() + ' spells seen cast' : '') +
          ' from ' + r.files + ' log file' + (r.files === 1 ? '' : 's') + (r.skipped ? ' (' + r.skipped + ' sessions already saved live)' : ''));
        refreshPriceMed();
        histList = (await window.overlay.historyList()) || [];
        renderHistory();
      } else toast('📥 Import: ' + ((r && r.error) || 'failed'));
    } finally { b.disabled = false; b.textContent = '📥 Old logs'; }
  });
  window.overlay.onHistoryImportProgress((p) => { for (const id of ['hist-import']) { const b = $(id); if (b && b.disabled) b.textContent = '📥 reading… ' + p.pct + '%'; } });
  $('hist-md').addEventListener('click', () => exportHistory('md'));
  $('recap-copy').addEventListener('click', () => {
    if (!lastRecap) return;
    navigator.clipboard.writeText(EQLShare.withCredit(recapText(lastRecap))).then(() => toast('📋 Death recap copied')).catch(() => toast('Copy failed'));
  });
  $('bb-death').addEventListener('click', () => renderRecap(true));
  $('export-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('export-text').textContent);
      $('export-status').textContent = '✓ copied';
    } catch { $('export-status').textContent = '⚠ copy failed — select and Ctrl+C'; }
  });

  window.overlay.onWikiSubmitProgress((p) => {
    $('export-status').textContent = 'Submitting… ' + p.done + '/' + p.total;
  });
  $('export-submit').addEventListener('click', async () => {
    const st = $('export-status');
    if (!settings.wikiUser || !settings.wikiPass) {
      st.textContent = '⚠ Set your wiki username + bot password in ⚙ Settings first';
      return;
    }
    const mode = $('export-dest').value;
    const b = $('export-submit');
    b.disabled = true;
    st.textContent = 'Logging in to eqlwiki.com…';
    const res = await window.overlay.wikiSubmit({
      mode,
      fullText: $('export-text').textContent,
      perMob: mode === 'talk' ? generatePerMob() : undefined
    });
    b.disabled = false;
    if (res.error) { st.textContent = '⚠ ' + res.error; return; }
    st.textContent = mode === 'sandbox'
      ? '✓ Published as ' + res.user + ' → ' + res.url
      : '✓ ' + res.edited + ' talk pages updated as ' + res.user +
        ((res.results || []).some(r => r.includes('⚠')) ? ' — some failed: ' + res.results.filter(r => r.includes('⚠')).join(', ') : '');
  });

