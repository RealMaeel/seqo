// SEQO overlay — settings, scaling, lock/edit, toolbar, character switcher, controls, self-update, notes, resize grip.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= settings =================
  function applySettings() {
    try { rebuildCustomAlerts(); renderCustomAlertList(); } catch (e) { console.error('custom alerts', e); }
    if (!settings) return;
    $('content').style.fontFamily = settings.fontFamily;
    const text = $('text');
    text.style.color = settings.fontColor;
    text.style.fontSize = settings.baseFontSize + 'px';
    if (text.innerText !== settings.text) text.innerText = settings.text;
    document.querySelectorAll('#c-title, .stat.hl b, .l-divider, #l-head .sect')
      .forEach(el => el.style.color = settings.fontColor);

    $('content').style.opacity = settings.opacity;
    $('opacity').value = Math.round(settings.opacity * 100);
    $('opacity-val').textContent = Math.round(settings.opacity * 100) + '%';
    $('fontsize').value = settings.baseFontSize;
    $('fontsize-val').textContent = settings.baseFontSize + 'px';
    $('fontfamily').value = settings.fontFamily;
    $('fontcolor').value = settings.fontColor;
    $('aspect').checked = settings.keepAspectRatio;
    $('shownotes').checked = !!settings.showNotes;
    $('mergepets').checked = settings.mergePets !== false;
    $('autozone').checked = !!settings.autoZoneUpdate;
    $('showclock').checked = settings.showClock !== false;
    if (typeof renderClock === 'function') renderClock();
    $('autoclear').checked = !!settings.autoClearLog;
    $('archiveclear').checked = settings.archiveOnClear !== false;
    $('autorun').checked = !!settings.autoRun;
    $('alertflash').checked = settings.alertFlash !== false;
    $('ccalerts').checked = settings.ccAlerts !== false;
    $('cdtimers').checked = settings.cooldownTimers !== false;
    $('concard').checked = settings.considerCard === true;
    if (document.activeElement !== $('cdmin')) $('cdmin').value = settings.cooldownMin || 30;
    $('tts-on').checked = settings.ttsOn !== false;
    $('tts-rate').value = settings.ttsRate || 1.1;
    $('deathrecap').checked = settings.deathRecap !== false;
    $('alertsound').checked = settings.alertSound !== false;
    $('buffalerts').checked = settings.buffAlerts !== false;
    $('loginremind').checked = settings.loginReminder !== false;
    $('bisflag').checked = !!settings.bisFlag;
    $('textscale').value = settings.textScale === 'large' ? 'large' : 'normal';
    const vol = settings.alertVolume !== undefined ? settings.alertVolume : 60;
    $('alertvol').value = vol;
    $('alertvol-val').textContent = vol + '%';
    if (document.activeElement !== $('buffwatch')) $('buffwatch').value = settings.buffWatch || '';
    rebuildFadeWatch();
    if (document.activeElement !== $('spelltimercfg')) $('spelltimercfg').value = settings.spellTimers || '';
    rebuildSpellTimerConfig();
    $('wiki-user').value = settings.wikiUser || '';
    $('wiki-pass').value = settings.wikiPass || '';
    if (document.activeElement !== $('upd-repo')) $('upd-repo').value = settings.updateRepo || '';
    $('autoupdcheck').checked = settings.autoCheckUpdates !== false;
    $('autodatacheck').checked = settings.autoDataCheck !== false;
    dataStaleLabels = settings.staleData || [];
    $('c-topn').value = String(Math.max(1, Math.min(10, +(settings.copyTopN || 5))));
    renderQuestClasses();
    if (activeTab === 'quests') renderQuests();
    document.body.classList.toggle('show-notes', !!settings.showNotes);
    document.body.classList.toggle('large', settings.textScale === 'large');
    // the Wiki export button only matters with a wiki account configured
    $('l-export').style.display = (settings.wikiUser && settings.wikiPass) ? '' : 'none';
    renderSyncLast(settings.lastSync);   // persistent sync record survives restarts
    if (settings.lastZone && !currentZone) setZone(settings.lastZone);
    rescale();
  }

  function save(partial) {
    Object.assign(settings, partial);
    window.overlay.updateSettings(partial);
    applySettings();
  }

  // ================= uniform content scaling =================
  function rescale() {
    const editing = document.body.classList.contains('edit');
    const availW = window.innerWidth;
    const availH = window.innerHeight - (editing ? TOOLBAR_H : 0);
    const baseH = BASE_H - TOOLBAR_H;
    const s = Math.min(availW / BASE_W, availH / baseH);
    $('content').style.transform = 'translate(-50%, -50%) scale(' + s + ')';
    if (typeof activeTab !== 'undefined' && activeTab === 'map') requestAnimationFrame(sizeCanvas);
  }
  window.addEventListener('resize', rescale);

  // ================= lock / edit modes =================
  function setLocked(v) {
    locked = v;
    document.body.classList.toggle('edit', !v);
    document.body.classList.toggle('locked', v);
    if (v) document.body.classList.remove('settings-open');
    else { document.body.classList.remove('hovering'); interactiveNow = false; }
    rescale();
  }

  window.overlay.onSettings((s) => { settings = s; setLocked(s.locked); applySettings(); });
  window.overlay.onLockState((v) => setLocked(v));

  // ================= toolbar =================
  $('help-btn').addEventListener('click', () => window.overlay.openDock('help'));
  $('btn-settings').addEventListener('click', async () => {
    const opening = !document.body.classList.contains('settings-open');
    document.body.classList.toggle('settings-open');
    if (opening) { refreshCharList(); refreshLogSize(); renderMuteList(); refreshPetChips(); }
  });

  // marked-pets chips: fix accidental pet marks (e.g. clicking a player on the meter)
  async function refreshPetChips() {
    const el = $('petchips');
    const saved = await window.overlay.getPets() || [];
    const names = new Set(saved);
    if (activeCharm) names.add(activeCharm);
    el.innerHTML = '';
    if (!names.size) { el.innerHTML = '<span style="color:#777;font-size:10.5px">none marked</span>'; return; }
    for (const n of [...names].sort()) {
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:rgba(125,255,160,.12);border:1px solid rgba(125,255,160,.35);border-radius:10px;padding:1px 7px;font-size:10.5px;color:#cfe3cf';
      const label = document.createElement('span');
      label.textContent = '🐾 ' + n + (n === activeCharm ? ' (charm)' : '');
      const x = document.createElement('span');
      x.textContent = '✕';
      x.style.cssText = 'cursor:pointer;color:#e88';
      x.title = 'Stop treating ' + n + ' as your pet';
      x.addEventListener('click', () => {
        petNames.delete(n);
        if (activeCharm === n) setActiveCharm(null);
        window.overlay.unlearnPet(n);
        if (tracker.current) {
          for (const e of tracker.current.events) if (e.attacker === n) e.pet = false;
        }
        meterDirty = true;
        toast('Unmarked as pet: ' + n);
        refreshPetChips();
      });
      chip.append(label, x);
      el.appendChild(chip);
    }
  }
  $('btn-lock').addEventListener('click', () => window.overlay.toggleLock());
  $('btn-min').addEventListener('click', () => window.overlay.minimizeOverlay());
  $('unlock-btn').addEventListener('click', () => window.overlay.toggleLock());
  $('btn-close').addEventListener('click', () => window.overlay.closeApp());

  // ================= character switcher =================
  async function refreshCharList() {
    const list = await window.overlay.scanLogs();
    const sel = $('charsel');
    sel.innerHTML = '';
    if (!list.length) {
      sel.innerHTML = '<option value="">— pick log below —</option>';
      return;
    }
    for (const c of list) {
      const opt = document.createElement('option');
      opt.value = c.path;
      opt.textContent = c.name + ' (' + c.server + ')';
      if (settings && settings.logPath === c.path) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  $('charsel').addEventListener('change', (e) => {
    if (e.target.value) {
      settings.logPath = e.target.value;
      window.overlay.switchLog(e.target.value);
    }
  });

  // ================= settings controls =================
  $('opacity').addEventListener('input', (e) => save({ opacity: e.target.value / 100 }));
  $('fontsize').addEventListener('input', (e) => save({ baseFontSize: +e.target.value }));
  $('fontfamily').addEventListener('change', (e) => save({ fontFamily: e.target.value }));
  $('fontcolor').addEventListener('input', (e) => save({ fontColor: e.target.value }));
  $('aspect').addEventListener('change', (e) => save({ keepAspectRatio: e.target.checked }));
  $('shownotes').addEventListener('change', (e) => save({ showNotes: e.target.checked }));
  $('mergepets').addEventListener('change', (e) => { save({ mergePets: e.target.checked }); meterDirty = true; });
  $('autozone').addEventListener('change', (e) => save({ autoZoneUpdate: e.target.checked }));
  $('showclock').addEventListener('change', (e) => { save({ showClock: e.target.checked }); renderClock(); });
  $('autoclear').addEventListener('change', (e) => save({ autoClearLog: e.target.checked }));
  $('autorun').addEventListener('change', (e) => save({ autoRun: e.target.checked }));
  $('archiveclear').addEventListener('change', (e) => save({ archiveOnClear: e.target.checked }));
  $('alertflash').addEventListener('change', (e) => save({ alertFlash: e.target.checked }));
  $('ccalerts').addEventListener('change', (e) => save({ ccAlerts: e.target.checked }));
  // settings search: show only the rows that match, open their sections
  $('set-search').addEventListener('input', () => {
    const q = $('set-search').value.trim().toLowerCase();
    for (const d of document.querySelectorAll('#settings > details')) {
      if (!d.dataset.wasOpen) d.dataset.wasOpen = d.open ? '1' : '0';
      let hit = false;
      const head = (d.querySelector('summary') || {}).textContent || '';
      for (const r of d.querySelectorAll('.setrow, label, .row, .hint, textarea, input[type=range], select')) {
        if (r.closest('.setrow') && r !== r.closest('.setrow')) continue;
        const txt = (r.textContent + ' ' + (r.placeholder || '')).toLowerCase();
        const show = !q || txt.includes(q) || head.toLowerCase().includes(q);
        r.style.display = show ? '' : 'none';
        if (show && q) hit = true;
      }
      d.style.display = !q || hit ? '' : 'none';
      d.open = q ? hit : d.dataset.wasOpen === '1';
      if (!q) delete d.dataset.wasOpen;
      // a section inside this one (Alerts & Sounds → 🗣 Custom alerts) opens when it holds a hit
      for (const sub of d.querySelectorAll('details')) {
        if (!sub.dataset.wasOpen) sub.dataset.wasOpen = sub.open ? '1' : '0';
        const subHead = ((sub.querySelector('summary') || {}).textContent || '').toLowerCase();
        const subHit = !!q && (subHead.includes(q) || [...sub.querySelectorAll('.setrow, label, .row, .hint, textarea, input[type=range], select')]
          .some(r => r.style.display !== 'none' && (r.textContent + ' ' + (r.placeholder || '')).toLowerCase().includes(q)));
        sub.open = q ? subHit : sub.dataset.wasOpen === '1';
        if (!q) delete sub.dataset.wasOpen;
      }
    }
  });
  $('cdtimers').addEventListener('change', (e) => save({ cooldownTimers: e.target.checked }));
  $('concard').addEventListener('change', (e) => save({ considerCard: e.target.checked }));
  $('cdmin').addEventListener('change', (e) => save({ cooldownMin: Math.max(20, +e.target.value || 30) }));
  $('deathrecap').addEventListener('change', (e) => save({ deathRecap: e.target.checked }));
  $('alertsound').addEventListener('change', (e) => save({ alertSound: e.target.checked }));
  $('buffalerts').addEventListener('change', (e) => save({ buffAlerts: e.target.checked }));
  $('loginremind').addEventListener('change', (e) => save({ loginReminder: e.target.checked }));
  $('bisflag').addEventListener('change', (e) => { save({ bisFlag: e.target.checked }); cleanupDirty = true; needsDirty = true; });
  $('textscale').addEventListener('change', (e) => {
    save({ textScale: e.target.value });
    document.body.classList.toggle('large', e.target.value === 'large');
    if (needsOpen) pushNeeds();
  });
  let volPreviewAt = 0;
  $('alertvol').addEventListener('input', (e) => {
    save({ alertVolume: +e.target.value });
    if (Date.now() - volPreviewAt > 350) { // live preview ping while dragging
      volPreviewAt = Date.now();
      playPattern('repop');
    }
  });
  $('buffwatch').addEventListener('change', (e) => { save({ buffWatch: e.target.value }); rebuildFadeWatch(); });
  $('spelltimercfg').addEventListener('change', (e) => { save({ spellTimers: e.target.value }); rebuildSpellTimerConfig(); });

  // demo every alert type in sequence so sounds/settings can be verified instantly
  $('btn-testalerts').addEventListener('click', () => {
    const demos = [
      () => alertFX('⭐ RARE UP: test named! (triple ping)', 'rare'),
      () => alertFX('⏲ test repop due! (double ping)', 'repop'),
      () => alertFX('💔 Charm broke: test! (descending)', 'charm'),
      () => alertFX('⚔ ATTACKED while AFK! (siren)', 'afk'),
      () => alertFX('👁 You are VISIBLE! (rising sweep)', 'invis'),
      () => alertFX('😳 Mez broke: test mob! (double + thud)', 'cc'),
      () => alertFX('☠ You died — test (falling notes)', 'death'),
      () => { buffAlertSeen.clear(); buffAlert('Buff dropped: Clarity (soft boop)', 'test'); }
    ];
    demos.forEach((d, i) => setTimeout(d, i * 1600));
  });
  $('wiki-user').addEventListener('change', (e) => { settings.wikiUser = e.target.value.trim(); window.overlay.updateSettings({ wikiUser: settings.wikiUser }); });
  $('wiki-pass').addEventListener('change', (e) => { settings.wikiPass = e.target.value; window.overlay.updateSettings({ wikiPass: settings.wikiPass }); });

  // ---- SEQO self-update via GitHub Releases ----
  let updateInfo = null;
  function showUpdateResult(r) {
    updateInfo = r;
    const st = $('appupd-status'), get = $('btn-appupd-get');
    if (!r) { st.textContent = ''; get.style.display = 'none'; return; }
    if (r.error) { st.textContent = '⚠ ' + r.error; get.style.display = 'none'; return; }
    if (r.newer) {
      st.textContent = '⬆ v' + r.latest + ' available (you have v' + r.current + ')';
      st.style.color = '#7dffa0';
      get.style.display = '';
    } else {
      st.textContent = '✔ Up to date (v' + r.current + ')';
      st.style.color = '#bbb';
      get.style.display = 'none';
    }
  }
  $('upd-repo').addEventListener('change', (e) => save({ updateRepo: e.target.value.trim() }));
  $('autoupdcheck').addEventListener('change', (e) => save({ autoCheckUpdates: e.target.checked }));
  $('autodatacheck').addEventListener('change', (e) => save({ autoDataCheck: e.target.checked }));
  $('btn-appupd').addEventListener('click', async () => {
    $('appupd-status').textContent = 'Checking GitHub…';
    showUpdateResult(await window.overlay.checkAppUpdate());
  });
  // one click: download, check, install, reopen (v2.7). From source or the
  // portable exe there's nothing to install, so the release page opens instead.
  let installing = false;
  async function installUpdate(info) {
    if (installing) return;
    const st = $('appupd-status'), get = $('btn-appupd-get'), tb = $('upd-btn');
    const page = () => window.overlay.openExternal((info && info.url) || 'https://github.com/' + ((settings && settings.updateRepo) || 'RealMaeel/seqo') + '/releases/latest');
    installing = true;
    get.disabled = true;
    st.style.color = '#bbb';
    st.textContent = 'Downloading the update…';
    const r = await window.overlay.installUpdate();
    installing = false;
    get.disabled = false;
    if (r && r.manual) { st.textContent = r.reason + ' — opening the download page'; page(); return; }
    if (!r || r.error) {
      st.textContent = '⚠ ' + ((r && r.error) || 'update failed') + ' — opening the download page instead';
      st.style.color = '#ffb070';
      page();
      return;
    }
    st.textContent = '✔ v' + r.version + ' downloaded' + (r.verified ? ' and checked' : '') + ' — SEQO closes now and the installer reopens it';
    st.style.color = '#7dffa0';
    if (tb) tb.textContent = '⬆ installing…';
  }
  window.overlay.onUpdateProgress((p) => {
    if (!installing) return;
    $('appupd-status').textContent = 'Downloading the update… ' + p.pct + '%';
    const tb = $('upd-btn'); if (tb && tb.style.display !== 'none') tb.textContent = '⬆ ' + p.pct + '%';
  });
  $('btn-appupd-get').addEventListener('click', () => installUpdate(updateInfo));
  window.overlay.onAppUpdate((r) => {
    showUpdateResult(r);
    alertFX('⬆ SEQO v' + r.latest + ' is available — click the green ⬆ in the title bar', 'repop');
    // persistent, clickable — a toast is easy to miss
    const b = $('upd-btn');
    b.style.display = '';
    b.textContent = '⬆ v' + r.latest;
    b.title = 'SEQO v' + r.latest + ' is available — click to download and install it (SEQO closes and reopens)';
    b.onclick = () => installUpdate(r);
  });

  const fmtBytes = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB'
                        : n >= 1024 ? (n / 1024).toFixed(0) + ' KB' : n + ' B';
  async function refreshLogSize() {
    $('logsize').textContent = fmtBytes(await window.overlay.logSize());
  }
  $('btn-clearlog').addEventListener('click', async () => {
    const res = await window.overlay.clearLog();
    if (res.error) { $('logsize').textContent = '⚠ ' + res.error; return; }
    toast('🧹 Log cleared (' + fmtBytes(res.cleared) + (res.archivePath ? ', archived' : '') + ')');
    refreshLogSize();
  });
  setInterval(() => {
    if (document.body.classList.contains('settings-open')) refreshLogSize();
  }, 3000);
  // ---- synced game files ----
  async function refreshSyncFiles() {
    const files = await window.overlay.getSyncFiles();
    const el = $('syncfiles');
    el.innerHTML = '';
    if (!files.length) { el.textContent = 'none — Add file… to sync loadouts/UI between PCs'; return; }
    for (const f of files) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:1px 0';
      const name = document.createElement('span');
      name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      name.textContent = f.split(/[\\/]/).pop();
      name.title = f;
      const x = document.createElement('span');
      x.textContent = '✕';
      x.style.cssText = 'cursor:pointer;color:#888';
      x.title = 'Stop syncing this file';
      x.addEventListener('click', () => { window.overlay.removeSyncFile(f); refreshSyncFiles(); });
      row.append(name, x);
      el.appendChild(row);
    }
  }
  $('btn-addsync').addEventListener('click', async () => {
    const res = await window.overlay.addSyncFile();
    refreshSyncFiles();
    if (res.error) $('sync-status').textContent = '⚠ ' + res.error;
    else if (res.results) $('sync-status').textContent = res.results.join(' · ');
  });
  $('btn-addsyncdir').addEventListener('click', async () => {
    const res = await window.overlay.addSyncFolder();
    refreshSyncFiles();
    if (res.error) $('sync-status').textContent = '⚠ ' + res.error;
    else if (res.results) $('sync-status').textContent = res.results.join(' · ');
  });

  // 💛 Data credits — every source that powers SEQO's data views
  (() => {
    const box = $('credits-list');
    const all = [...window.EQLUnlocks.CREDITS, window.EQLEpics.CREDIT];
    for (const c of all) {
      const row = document.createElement('div');
      row.innerHTML = '<b style="color:#cfc9a8"></b> — <span class="lnk" style="color:#7da7d9;cursor:pointer;text-decoration:underline dotted"></span><br><span style="color:#8a7a55"></span>';
      row.querySelector('b').textContent = c.what || c.by;
      row.querySelector('.lnk').textContent = c.url.replace(/^https?:\/\//, '');
      row.querySelector('.lnk').addEventListener('click', () => window.overlay.openExternal(c.url));
      row.querySelectorAll('span')[1].textContent = c.note;
      box.appendChild(row);
    }
  })();

  // ---- live quest-data refresh (Epics + unlock routes from the wiki, PoS
  //      quests from eqlegendstools; BiS keeps its own Update button) ----
  const QD_LABELS = { epics: 'Epics', unlocks: 'Unlock routes', pos: 'PoS quests' };
  function describeQuestUpdate(r) {
    const bit = (k) => {
      const x = r[k];
      if (!x) return QD_LABELS[k] + ': —';
      if (x.error) return '⚠ ' + QD_LABELS[k] + ': ' + x.error;
      return '✓ ' + QD_LABELS[k] + ': ' + (x.changed ? 'updated' : 'already current') +
             (x.revised ? ' (wiki page of ' + x.revised + ')' : '');
    };
    let out = ['epics', 'unlocks', 'pos'].map(bit).join('\n');
    if (r.cached && !r.cached.error)
      out += '\n✓ Cached wiki pages: ' + r.cached.checked + ' checked, ' + r.cached.updated + ' re-fetched' +
             (r.cached.details && r.cached.details.length ? ' (' + r.cached.details.slice(0, 4).join(', ') +
              (r.cached.details.length > 4 ? '…' : '') + ')' : '');
    else if (r.cached) out += '\n⚠ Cached pages: ' + r.cached.error;
    if (r.knowledge && !r.knowledge.error && r.knowledge.rechecked)
      out += '\n✓ Item knowledge: ' + r.knowledge.rechecked + ' old unknowns re-checked, ' + r.knowledge.learned + ' resolved';
    return out;
  }
  async function afterQuestUpdate(r, quiet) {
    applyQuestData(await window.overlay.getQuestData());
    dataStaleLabels = (r.epics && r.epics.error ? ['Epic checklists'] : [])
      .concat(r.unlocks && r.unlocks.error ? ['Race unlock guide'] : []);
    const changed = ['epics', 'unlocks', 'pos'].filter(k => r[k] && r[k].changed);
    if (changed.length)
      toast('📚 Quest data refreshed: ' + changed.map(k => QD_LABELS[k]).join(', ') + ' updated from the sources');
    else if (dataStaleLabels.length)
      toast('⚠ Quest data check: a source page changed but could not be re-read — see Settings → Data credits');
    else if (!quiet)
      toast('📚 Quest data checked — everything already current');
    if (activeTab === 'quests') renderQuests();
  }
  $('btn-datacheck').addEventListener('click', async () => {
    $('datacheck-status').textContent = 'updating from the wiki and eqlegendstools…';
    const r = await window.overlay.updateQuestData();
    $('datacheck-status').textContent = describeQuestUpdate(r);
    await afterQuestUpdate(r, true);
  });
  window.overlay.onQuestDataUpdated((r) => afterQuestUpdate(r, true));
  // sync status: a persistent "what happened last time" line, never a guess.
  // Shows push/pull counts, named failures, and WHICH COMPUTER wrote last.
  function renderSyncLast(summary) {
    const el = $('sync-last');
    if (!summary) { el.textContent = ''; return; }
    const bits = [];
    const moved = (summary.pushed || 0) + (summary.pulled || 0);
    bits.push((summary.failed && summary.failed.length ? '⚠' : '✓') + ' Last sync ' + fmtAge(summary.at) +
      ' on ' + (summary.host || 'this computer') + ' — ' +
      (moved ? (summary.pushed ? '📤 ' + summary.pushed + ' pushed' : '') +
               (summary.pushed && summary.pulled ? ' · ' : '') +
               (summary.pulled ? '📥 ' + summary.pulled + ' pulled' : '')
             : 'everything already in sync'));
    if (summary.from && summary.from.host)
      bits.push('📥 picked up changes from ' + summary.from.host +
                (summary.from.at ? ' (written ' + fmtAge(summary.from.at) + ')' : ''));
    else if (summary.pushed && !summary.pulled)
      bits.push('📤 this computer now has the newest data');
    if (summary.failed && summary.failed.length)
      bits.push('⚠ failed: ' + summary.failed.join(' · '));
    el.textContent = bits.join('\n');
  }
  const syncDoneText = (res) => {
    const s = res.summary;
    if (!s) return '✓ synced';
    if (s.failed && s.failed.length) return '⚠ synced with ' + s.failed.length + ' failure' + (s.failed.length === 1 ? '' : 's');
    if (s.pulled && s.from && s.from.host) return '✓ synced — picked up ' + s.pulled + ' from ' + s.from.host;
    if (s.pushed) return '✓ synced — ' + s.pushed + ' pushed to the shared folder';
    return '✓ synced — already up to date';
  };
  $('btn-syncnow').addEventListener('click', async () => {
    $('btn-syncnow').disabled = true;
    $('sync-status').textContent = '⟳ syncing…';
    const res = await window.overlay.syncGameFiles();
    $('btn-syncnow').disabled = false;
    $('sync-status').textContent = res.error ? '⚠ ' + res.error : (res.results || []).join('\n');
    if (res.summary) { renderSyncLast(res.summary); toast('🔄 ' + syncDoneText(res)); }
  });
  window.overlay.onGamefilesSynced((res) => {
    const results = (res && res.results) || res || [];
    if (res && res.summary) renderSyncLast(res.summary);
    toast('🔄 ' + (res && res.summary ? syncDoneText(res) :
      'Game files synced: ' + results.filter(r => !r.includes('in sync')).join(', ')));
    $('sync-status').textContent = results.join('\n');
  });
  refreshSyncFiles();

  async function refreshDataStatus() {
    const st = await window.overlay.dataDirStatus();
    $('data-status').textContent = st.shared
      ? '🔗 shared — ' + st.dir.split(/[\\/]/).slice(-2).join('/')
      : 'local only';
  }
  $('btn-datadir').addEventListener('click', async () => {
    const res = await window.overlay.chooseDataFolder();
    if (res && res.error) $('data-status').textContent = '⚠ ' + res.error;
    // on success the app relaunches itself
  });
  refreshDataStatus();

  // another computer's changes synced in: refresh all cached DB-derived state
  window.overlay.onSharedReload(async () => {
    respawnDB = await window.overlay.getRespawns() || {};
    learnedZoneMap = await window.overlay.getZoneMap() || {};
    sourceClass = await window.overlay.getSourceClasses() || {};
    posDone = await window.overlay.getPosQuests() || {};
    itemVerdicts = await window.overlay.getItemVerdicts() || {};
    wishList = await window.overlay.getWishList() || {};
    refreshWishDrops();
    if (activeTab === 'quests') renderQuests();
    // refill the shared pet set in place (the tracker holds a reference to it)
    const freshPets = await window.overlay.getPets() || [];
    petNames.clear();
    for (const n of freshPets) petNames.add(n);
    if (activeCharm) petNames.add(activeCharm);
    phLinksDB = await window.overlay.getPhLinks() || {};
    if (currentZone) zoneData = await window.overlay.getZoneData(currentZone);
    lootDirty = true; meterDirty = true;
    renderAll();
    toast('🔄 Shared data updated from your other computer');
  });

  $('btn-report').addEventListener('click', async () => {
    const st = $('report-status');
    const r = await window.overlay.problemReport();
    st.textContent = r && r.ok
      ? '✓ Copied (' + (r.errors ? r.errors + ' error' + (r.errors === 1 ? '' : 's') + ' logged' : 'no errors logged') + ') — paste it in a message to the SEQO author'
      : '⚠ ' + ((r && r.error) || 'could not copy');
  });

  $('btn-checkupd').addEventListener('click', async () => {
    const st = $('upd-status');
    st.textContent = 'checking wiki revisions…';
    const res = await window.overlay.checkUpdates();
    if (res.error) { st.textContent = '⚠ ' + res.error; return; }
    st.textContent = res.checked + ' cached pages checked, ' + res.updated + ' refreshed';
    if (res.updated && currentZone) setZone(currentZone); // re-render with fresh data
  });
  $('btn-log').addEventListener('click', async () => { await window.overlay.chooseLog(); refreshCharList(); });

  // ================= editable notes =================
  const textEl = $('text');
  textEl.addEventListener('click', () => { if (!locked) { textEl.contentEditable = 'true'; textEl.focus(); } });
  textEl.addEventListener('blur', () => {
    textEl.contentEditable = 'false';
    if (settings && textEl.innerText !== settings.text) {
      settings.text = textEl.innerText;
      window.overlay.updateSettings({ text: textEl.innerText });
    }
  });

  // ================= custom resize grip =================
  let resizing = null;
  $('grip').addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizing = { startX: e.screenX, startY: e.screenY, startW: window.outerWidth, startH: window.outerHeight };
  });
  window.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    let w = Math.max(180, resizing.startW + (e.screenX - resizing.startX));
    let h = Math.max(120, resizing.startH + (e.screenY - resizing.startY));
    if (settings && settings.keepAspectRatio) h = Math.round(w * BASE_H / BASE_W);
    window.overlay.resizeWindow(w, h);
  });
  window.addEventListener('mouseup', () => { resizing = null; });
