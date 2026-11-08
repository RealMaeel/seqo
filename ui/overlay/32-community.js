// SEQO overlay — 3.0 community sharing: the first-run question, "see exactly what gets sent", and the
// ⚙ Community data switch. One of the ui/overlay/*.js files that overlay.html loads in order as
// classic scripts: they share one global scope.
  // ================= 🌐 community sharing =================
  let communityAsked = false;     // the question is shown once per start until it's answered

  // a simple box over the overlay (closes on ✕ or Escape)
  function communityModal(build) {
    const old = document.getElementById('cm-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'cm-modal';
    wrap.setAttribute('data-interactive', '');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(6,6,10,.72);display:flex;align-items:center;justify-content:center;padding:10px';
    const box = document.createElement('div');
    box.style.cssText = 'position:relative;max-width:440px;width:100%;max-height:100%;overflow:auto;background:#17171f;border:1px solid rgba(125,200,255,.4);border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,.6);padding:11px 13px;color:#d6d6de;font-size:11px;line-height:1.5';
    const x = document.createElement('span');
    x.textContent = '✕';
    x.title = 'Close';
    x.style.cssText = 'position:absolute;right:9px;top:6px;cursor:pointer;color:#888;font-size:12px';
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    x.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    box.appendChild(x);
    build(box, close);
    wrap.appendChild(box);
    document.body.appendChild(wrap);   // over the whole window, whatever the overlay's zoom
    return close;
  }
  const cmEl = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  const cmBtn = (label, primary) => {
    const b = cmEl('button', 'cursor:pointer;border-radius:5px;padding:4px 11px;font-size:11px;white-space:nowrap;border:1px solid ' +
      (primary ? '#d8b46a;background:#3d3423;color:#ffd766' : '#555;background:#2c2c36;color:#ddd'), label);
    return b;
  };

  // "See exactly what gets sent"
  async function communityPreview() {
    let pv = null;
    try { pv = await window.overlay.communityPreview(); } catch { /* shown below */ }
    communityModal((box) => {
      box.appendChild(cmEl('div', 'color:#ffd766;font-weight:600;font-size:12px;margin-bottom:4px', '🔍 What SEQO sends'));
      if (!pv) { box.appendChild(cmEl('div', '', 'Not available.')); return; }
      const names = { k: 'kills', d: 'drops', f: 'faction hits', q: 'quest turn-ins', s: 'NPC lines', t: 'task updates', g: 'items given', c: 'crawls', w: 'quest rewards', m: 'mob notes' };
      const parts = Object.entries(pv.kinds).map(([k, n]) => n.toLocaleString() + ' ' + (names[k] || k));
      box.appendChild(cmEl('div', 'margin-bottom:5px', pv.total
        ? 'Waiting to be sent: ' + pv.total.toLocaleString() + ' records (' + parts.join(', ') + '), in ' + pv.batches + ' upload' + (pv.batches === 1 ? '' : 's') + ' to ' + pv.server + '.'
        : 'Nothing waiting — everything collected so far has been sent.'));
      box.appendChild(cmEl('div', 'color:#9ab;margin-bottom:3px', 'This is the start of the next upload, exactly as it goes out. "install" is a random ID made on this PC; it isn’t linked to your character.'));
      box.appendChild(cmEl('pre', 'margin:0;max-height:260px;overflow:auto;background:#0f0f15;border:1px solid #333;border-radius:5px;padding:6px;font-size:9.5px;line-height:1.35;color:#cfe3cf;white-space:pre-wrap;word-break:break-word', pv.sample));
    });
  }

  // the first-run question (closing it without choosing asks again next start)
  function communityAsk() {
    if (communityAsked) return;
    communityAsked = true;
    communityModal((box, close) => {
      box.appendChild(cmEl('div', 'color:#ffd766;font-weight:600;font-size:13px;margin-bottom:5px', '🌐 Help build SEQO’s community data'));
      box.appendChild(cmEl('div', 'margin-bottom:6px', 'The wikis fall behind the game. SEQO 3.0 can pool what our logs already show, so every player gets up-to-date drop rates, respawn timers, faction and quest information.'));
      const p1 = cmEl('div', 'margin-bottom:4px');
      p1.append(cmEl('b', 'color:#e8e6da', 'What SEQO shares: '), document.createTextNode('kills and drops per mob, zone and difficulty tier, faction hits, quest turn-ins and their rewards, and what quest NPCs say — including what SEQO has already recorded for you.'));
      const p2 = cmEl('div', 'margin-bottom:4px');
      p2.append(cmEl('b', 'color:#e8e6da', 'Never shared: '), document.createTextNode('your character or account name, anyone’s name, chat or tells, your notes, or your log file. Nothing personal is ever sent.'));
      box.append(p1, p2, cmEl('div', 'margin-bottom:8px', 'Your own numbers stay yours; community numbers will show beside them.'));
      const row = cmEl('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center');
      const yes = cmBtn('✔ Share', true), no = cmBtn('No thanks');
      const see = cmEl('span', 'cursor:pointer;color:#7dc8ff;text-decoration:underline;font-size:10.5px', 'See exactly what gets sent');
      yes.addEventListener('click', async () => { close(); await communitySetShare(true); communityOfferOldLogs(); });
      no.addEventListener('click', async () => { close(); await communitySetShare(false); });
      see.addEventListener('click', () => communityPreview());
      row.append(yes, no, see);
      box.append(row, cmEl('div', 'color:#889;font-size:10px;margin-top:7px', 'You can change this any time in ⚙ Settings → 📊 Community data.'));
    });
  }

  // after ✔ Share: add the history in your old logs too (SEQO only collects from now on otherwise)
  function communityOfferOldLogs() {
    communityModal((box, close) => {
      box.appendChild(cmEl('div', 'color:#ffd766;font-weight:600;font-size:12px;margin-bottom:5px', '🌐 Thanks — sharing is on'));
      box.appendChild(cmEl('div', 'margin-bottom:8px', 'SEQO collects from now on. Your old logs (Logs and Logs\\archive) hold weeks or months of kills, drops, faction hits and quests — add them too? It takes a minute or two, reads each log once, and the same lines are never counted twice.'));
      const row = cmEl('div', 'display:flex;flex-wrap:wrap;gap:6px');
      const go = cmBtn('📥 Add my old logs', true), later = cmBtn('Later');
      go.addEventListener('click', () => {
        close();
        const b = $('hist-import');
        if (b && !b.disabled) { b.click(); toast('📥 Reading your old logs… this takes a minute or two'); }
      });
      later.addEventListener('click', close);
      row.append(go, later);
      box.append(row, cmEl('div', 'color:#889;font-size:10px;margin-top:7px', 'Any time later: ⚙ Settings → 📊 Community data → 📥 Old logs.'));
    });
  }

  async function communitySetShare(on) {
    try { await window.overlay.communityShareSet(on); } catch { /* ok */ }
    if (settings) settings.communityShare = on;
    if ($('communityshare')) $('communityshare').checked = on;
    toast(on ? '🌐 Thanks! Your community data will be sent in the background — ⚙ Settings → 📊 Community data shows how it’s going'
      : '🌐 Nothing will be sent. You can turn sharing on any time in ⚙ Settings → 📊 Community data');
    refreshCommunityUpload();
  }

  async function refreshCommunityUpload() {
    const el = $('community-upload');
    if (!el || !window.overlay.communityUploadStatus) return;
    let st = null;
    try { st = await window.overlay.communityUploadStatus(); } catch { /* shown below */ }
    if ($('communityshare')) $('communityshare').checked = !!(st && st.share === true);
    if (!st) { el.textContent = ''; return; }
    if (st.share !== true) { el.textContent = 'Not sharing — nothing is sent.'; return; }
    const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
    el.textContent = (st.last ? 'Last sent ' + ago(st.last) + ' (' + st.lastRecords.toLocaleString() + ' records)' : 'Nothing sent yet') +
      (st.waiting ? ' · ' + st.waiting.toLocaleString() + ' waiting' : ' · all sent') + (st.error ? ' · ⚠ ' + st.error : '');
  }

  window.overlay.onSettings((s) => {
    if ($('communityshow')) $('communityshow').checked = !(s && s.communityShow === false);
    if (s && s.communityShare === undefined && window.overlay.communityShareSet) setTimeout(communityAsk, 1500);
    refreshCommunityUpload();
  });
  if ($('communityshare')) $('communityshare').addEventListener('change', async (e) => {
    const on = e.target.checked;
    await communitySetShare(on);
    if (on && !(settings && settings.communityOldLogsOffered)) {   // the first time it's turned on here
      if (settings) settings.communityOldLogsOffered = true;
      window.overlay.updateSettings({ communityOldLogsOffered: true });
      communityOfferOldLogs();
    }
  });
  if ($('communityshow')) $('communityshow').addEventListener('change', async (e) => {
    if (settings) settings.communityShow = e.target.checked;
    try { await window.overlay.communityShowSet(e.target.checked); } catch { /* ok */ }
    toast(e.target.checked ? '🌐 Community numbers shown' : '🌐 Community numbers hidden — only your own');
  });
  if ($('btn-community-see')) $('btn-community-see').addEventListener('click', () => communityPreview());
  if ($('btn-community-send')) $('btn-community-send').addEventListener('click', async () => {
    const b = $('btn-community-send'); b.disabled = true;
    try {
      const r = await window.overlay.communitySendNow();
      toast(r && r.skipped ? '🌐 Sharing is off' : r && r.error ? '⚠ ' + r.error : '🌐 Sent ' + ((r && r.records) || 0).toLocaleString() + ' records');
    } finally { b.disabled = false; refreshCommunityUpload(); }
  });
  if ($('btn-community-newid')) $('btn-community-newid').addEventListener('click', async () => {
    await window.overlay.communityResetId();
    toast('🌐 New anonymous ID — the server can’t link what you send from now on to what you sent before');
    refreshCommunityUpload();
  });
  setInterval(refreshCommunityUpload, 60000);

  // the downloaded community file (everyone's data, added up)
  async function refreshCommunityDownload() {
    const el = $('community-download');
    if (!el || !window.overlay.communityDataStatus) return;
    let st = null;
    try { st = await window.overlay.communityDataStatus(); } catch { /* shown below */ }
    el.textContent = '';
    if (!st) return;
    const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
    el.append(document.createTextNode(st.have
      ? '🌐 Community file: ' + st.mobs.toLocaleString() + ' mobs, ' + st.npcs.toLocaleString() + ' NPCs from ' + st.installs + ' player' + (st.installs === 1 ? '' : 's') + ' · downloaded ' + ago(st.fetchedAt)
      : '🌐 Community file: not downloaded yet'));
    if (st.error) el.append(document.createTextNode(' · ⚠ ' + st.error));
    const a = document.createElement('span');
    a.textContent = ' ⟳'; a.title = 'Download it now'; a.style.cssText = 'cursor:pointer;color:#7dc8ff';
    a.addEventListener('click', async () => { a.textContent = ' …'; try { await window.overlay.communityDataRefresh(); } catch { /* shown */ } refreshCommunityDownload(); });
    el.appendChild(a);
  }
  refreshCommunityDownload();
  setInterval(refreshCommunityDownload, 60000);
  if (window.overlay.onCommunityDataUpdated) window.overlay.onCommunityDataUpdated((st) => {
    refreshCommunityDownload();
    if (st && st.quiet) return;
    toast('🌐 Community data updated — ' + st.mobs.toLocaleString() + ' mobs from ' + st.installs + ' player' + (st.installs === 1 ? '' : 's'));
  });
