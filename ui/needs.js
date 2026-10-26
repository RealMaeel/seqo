// SEQO needs.html — the zone-needs strip window.
// Moved out of the page in v2.7 unchanged, so the page can run under a strict CSP.
  const $ = (id) => document.getElementById(id);
  let minimized = false;
  let last = { zone: '', rows: [] };

  const GROUPS = [
    { g: 'wish', label: '⭐ WISH LIST' },
    { g: 'epic', label: '⚔ EPIC PREP' },
    { g: 'unlock', label: '🔓 UNLOCK TURN-INS' },
    { g: 'spellq', label: '🧙 SPELL QUESTS' }
  ];

  function render(flashItem) {
    { const _el = $('list'), _st = _el ? _el.scrollTop : 0; if (_st) queueMicrotask(() => { _el.scrollTop = _st; }); } // live pushes must not snap the scroll to the top
    const rows = last.rows || [];
    $('title').textContent = minimized
      ? '🎯 ' + (rows.length ? rows.length + ' needed in ' + (last.zone || 'this zone') : 'nothing needed in ' + (last.zone || 'this zone'))
      : '🎯 Needs — ' + (last.zone || 'no zone yet') + (rows.length ? ' (' + rows.length + ')' : '');
    const list = $('list');
    list.innerHTML = '';
    $('empty').style.display = rows.length || minimized ? 'none' : 'block';
    if (!rows.length) {
      $('empty').textContent = last.zone
        ? 'Nothing you still need drops in ' + last.zone + ' — or SEQO has no drop data here yet. It fills in as you hunt (and from the wiki’s zone page).'
        : 'Zone needs appear once SEQO sees you enter a zone.';
      return;
    }
    for (const grp of GROUPS) {
      const inGrp = rows.filter(r => r.g === grp.g);
      if (!inGrp.length) continue;
      const h = document.createElement('div');
      h.className = 'grp';
      h.textContent = grp.label;
      list.appendChild(h);
      for (const r of inGrp) {
        const d = document.createElement('div');
        d.className = 'row' + (flashItem && flashItem.toLowerCase() === r.item.toLowerCase() ? ' flash' : '');
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = r.item;
        const cnt = document.createElement('span');
        cnt.className = 'cnt';
        if (r.need > 0) {
          cnt.textContent = Math.min(r.have || 0, r.need) + '/' + r.need +
            (r.left != null && r.left > 0 ? ' · ~' + r.left + ' to max' : '');
          if (r.left != null)
            cnt.title = 'Full grind: ' + r.need + '. Your current faction standing already covers part of it — about ' + r.left + ' more turn-ins max it out.';
        } else if (r.g === 'unlock' && r.have) cnt.textContent = '×' + r.have;
        const mobs = document.createElement('span');
        mobs.className = 'mobs';
        const mobTxt = (r.mobs || []).filter(Boolean);
        mobs.textContent = r.faction
          ? (mobTxt.length ? mobTxt.slice(0, 3).join(', ') + ' · ' : '') + r.faction
          : mobTxt.length ? mobTxt.slice(0, 3).join(', ') + (mobTxt.length > 3 ? ' +' + (mobTxt.length - 3) : '')
          : 'zone drop';
        mobs.title = (mobTxt.join('\n') || 'listed as a zone-wide drop') + (r.reason ? '\n' + r.reason : '');
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = r.g === 'wish' ? '★' : '';
        if (r.g === 'wish') {
          star.title = 'Un-star (stops watching this item)';
          star.addEventListener('click', (e) => {
            e.stopPropagation();
            window.overlay.needsCmd({ kind: 'wish', name: r.item, on: false });
          });
        }
        d.append(nm, cnt, mobs, star);
        d.title = 'Click for item details' + (r.reason ? ' — ' + r.reason : '');
        d.addEventListener('click', () => window.overlay.needsCmd({ kind: 'item', name: r.item }));
        list.appendChild(d);
      }
    }
  }

  window.overlay.onNeedsData((p) => {
    if (!p) return;
    if (p.scale) document.body.classList.toggle('large', p.scale === 'large');
    if (p.zone !== undefined) last = p;
    render(p.flash);
  });

  window.overlay.onUiScale((v) => document.body.classList.toggle('large', v === 'large'));

  window.overlay.onNeedsMin((v) => {
    minimized = !!v;
    document.body.classList.toggle('min', minimized);
    $('btn-min').textContent = minimized ? '▣' : '—';
    $('btn-min').title = minimized ? 'Restore the panel' : 'Minimize to a one-line bar';
    render();
  });

  let detached = false;
  $('btn-pin').addEventListener('click', (e) => {
    e.stopPropagation();
    detached = !detached;
    $('btn-pin').classList.toggle('detached', detached);
    $('btn-pin').title = detached ? 'Re-attach to the overlay' : 'Detach from the overlay (drag the title to move it)';
    window.overlay.needsDetach(detached);
  });
  $('btn-min').addEventListener('click', (e) => {
    e.stopPropagation();
    window.overlay.needsMinimize(!minimized);
  });
  $('btn-close').addEventListener('click', (e) => { e.stopPropagation(); window.overlay.closeNeeds(); });

  // locked overlay = this panel goes click-through too: rows and the title
  // bar come alive on hover (click + scroll still work there), everywhere
  // else your clicks reach the game underneath
  let lockedMode = false, hoverLive = false;
  const HOVER_SEL = '#topbar, .row, .grp';
  window.overlay.onLockState((locked) => {
    lockedMode = !!locked;
    hoverLive = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!lockedMode) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const want = !!(el && el.closest && el.closest(HOVER_SEL));
    if (want !== hoverLive) { hoverLive = want; window.overlay.setInteractive(want); }
  });

  // ask the overlay for a first fill
  window.overlay.needsCmd({ kind: 'refresh' });
