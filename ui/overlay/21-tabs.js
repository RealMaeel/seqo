// SEQO overlay — copy buttons, notes, tab switching.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= copy buttons =================
  (() => {
    const sel = $('c-topn');
    for (let i = 1; i <= 10; i++) {
      const o = document.createElement('option');
      o.value = i; o.textContent = 'top ' + i;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => save({ copyTopN: +sel.value }));
    $('c-copy').addEventListener('click', () => copyMeter(false));
    $('c-copyfull').addEventListener('click', () => copyMeter(true));
  })();

  // ================= notes =================
  let notesTimer = null;
  window.overlay.getNotes().then((t) => { $('notes-text').value = t || ''; });
  $('notes-text').addEventListener('input', () => {
    $('notes-status').textContent = 'saving…';
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      window.overlay.setNotes($('notes-text').value);
      $('notes-status').textContent = 'saved ✓';
      setTimeout(() => { if ($('notes-status').textContent === 'saved ✓') $('notes-status').textContent = ''; }, 2500);
    }, 600);
  });

  // ================= tabs =================
  let activeTab = 'meter';
  // the bottom bar (run + XP pace) costs a row of a small window: show it on
  // Meter/Loot, whenever a run is going, or once there is XP pace to read
  function updateBottomBar() {
    const bar = $('bottombar');
    if (!bar) return;
    let running = false;
    try { running = !!lootRun; } catch { /* run state not set up yet at startup */ }
    let unread = false;
    try { unread = chatUnread > 0; } catch { /* chat not set up yet */ }
    const show = activeTab === 'meter' || activeTab === 'breakdown' || activeTab === 'loot' ||
      running || unread || !!($('bb-xp').textContent || '').trim();
    bar.style.display = show ? '' : 'none';
  }

  function setTab(name) {
    activeTab = name;
    // Session view (old Spells) lives under the Meter tab now
    const hl = name === 'breakdown' ? 'meter' : name;
    document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === hl));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    updateBottomBar();
    renderAll();
  }
  document.querySelectorAll('.tab[data-tab]').forEach(t =>
    t.addEventListener('click', () => setTab(t.dataset.tab)));

