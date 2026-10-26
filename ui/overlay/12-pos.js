// SEQO overlay — Plane of Sky tracker, loot verdicts, kill-time heads-up.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= Plane of Sky quest tracker =================
  const POS = window.EQLPosQuests;
  const ISLE_ORDER = ['1.5', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  let posDone = {};                 // reward -> { done: bool, items: {itemName: true} }
  const qExpanded = new Set();
  window.overlay.getPosQuests().then((d) => { posDone = d || {}; if (activeTab === 'quests') renderQuests(); });

  const qState = (reward) => posDone[reward] || { done: false, items: {} };
  function qSave(reward, st) {
    if (st.done || Object.keys(st.items).length) posDone[reward] = st;
    else delete posDone[reward];
    window.overlay.setPosQuest(reward, st);
  }
  const qSelClasses = () => (settings && settings.posClasses) || [];

  function renderQuestClasses() {
    const box = $('q-classes');
    box.innerHTML = '';
    const sel = qSelClasses();
    for (const c of POS.classes) {
      const chip = document.createElement('span');
      chip.className = 'q-cls' + (sel.includes(c) ? ' on' : '');
      chip.textContent = c;
      chip.addEventListener('click', () => {
        let next = qSelClasses().slice();
        if (next.includes(c)) next = next.filter(x => x !== c);
        else next.push(c);   // any number — game data syncs statically now
        save({ posClasses: next });
        settings.posClasses = next;   // reflect immediately
        renderQuestClasses(); renderQuests();
      });
      box.appendChild(chip);
    }
    // All / None toggle at the end of the chip row
    const allChip = document.createElement('span');
    const allOn = sel.length === POS.classes.length;
    allChip.className = 'q-cls' + (allOn ? ' on' : '');
    allChip.textContent = allOn ? 'None' : 'All';
    allChip.title = allOn ? 'Clear class selection' : 'Select all 16 classes';
    allChip.addEventListener('click', () => {
      const next = allOn ? [] : POS.classes.slice();
      save({ posClasses: next });
      settings.posClasses = next;
      renderQuestClasses(); renderQuests();
    });
    box.appendChild(allChip);
  }

  // lifetime looted counts per quest item (from the shared loot DB)
  function questLootCounts() {
    const counts = new Map();
    for (const m of Object.values(lootDB.mobs || {}))
      for (const d of Object.values(m.drops || {})) {
        const k = d.name.toLowerCase();
        counts.set(k, (counts.get(k) || 0) + d.count);
      }
    return counts;
  }

  function questIsles(q) {
    const set = new Set();
    for (const it of q.items) { const i = POS.isleOf(it.loc); if (i) set.add(i); }
    return set;
  }

  // which sub-view the Quests tab shows: '' = zone quests, or one of the
  // chip views ('__unlocks' / '__slayer' / '__spellq' / '__epics' / '__exalts')
  let qView = '';
  function setQuestView(v) {
    qView = v || '';
    document.querySelectorAll('#q-views .qview-chip')
      .forEach(c => c.classList.toggle('active', c.dataset.qview === qView));
    // remember which export-fed views this person actually uses, so the login
    // reminder only asks for the files that feed THEIR features
    if (qView === '__unlocks' && settings && !settings.usedUnlocks) save({ usedUnlocks: true });
    if (qView === '__slayer' && settings && !settings.usedSlayer) save({ usedSlayer: true });
  }
  document.querySelectorAll('#q-views .qview-chip').forEach(c =>
    c.addEventListener('click', () => { setQuestView(c.dataset.qview); renderQuests(); }));

  // which zone the Quests tab is looking at ('' in the select = follow the game)
  function questZone() {
    return qView || $('q-zone').value || currentZone || 'Plane of Sky';
  }
  const isPosZone = (z) => /plane of sky/i.test(z || '');

  function renderQuests() {
    keepScroll($('q-list'));
    const zone = questZone();
    renderSyncLine();
    const special = zone === '__unlocks' || zone === '__slayer' || zone === '__spellq' || zone === '__epics' || zone === '__exalts';
    const pos = !special && isPosZone(zone);
    // PoS-only controls hide for wiki-listed zones and the special views
    $('q-import').style.display = 'none'; // superseded by zero-click sync
    $('q-zone').style.display = special ? 'none' : '';  // the zone picker is for zone quests
    // the how-to only matters until game data is flowing — then free the space
    const synced = gameFiles && (gameFiles.inventory || gameFiles.achievements);
    $('q-help').style.display = pos && !synced ? '' : 'none';
    // class chips only where they filter something: PoS/zone quests and Epics
    $('q-classes').style.display = (special && zone !== '__epics') ? 'none' : 'flex';
    // export freshness: the data views carry their own compact refresh line
    // (only when something is stale), so the global line would just repeat it
    $('q-sync').style.display = special ? 'none' : '';
    $('q-posrow').style.display = special ? 'none' : 'flex';
    $('q-isle').style.display = pos ? '' : 'none';
    $('q-runehint').style.display = pos ? '' : 'none';
    $('q-summary').style.display = pos ? 'flex' : 'none';
    if (special) {
      $('q-progress').textContent = '';
      setQuestEmpty('');
      if (zone === '__unlocks') return renderUnlocks();
      if (zone === '__slayer') return renderSlayer();
      if (zone === '__spellq') return renderSpellQuests();
      if (zone === '__epics') return renderEpics();
      return renderExalts();
      // (the old 🏆 BiS view is gone — the ⚔ Class tab's Gear advisor replaced
      // it; the "Flag best-in-slot drops" alert option still works unchanged)
    }
    if (!pos) { renderWikiQuests(zone); return; }

    const list = $('q-list');
    list.innerHTML = '';
    const sel = qSelClasses();
    setQuestEmpty(sel.length ? '' :
      'Pick your class(es) above to see their\nPlane of Sky turn-in quests.\nItems check off automatically as you loot them;\nclick a quest\'s ✓ when you turn it in.');
    $('q-runehint').textContent = 'Wind Runes: trash mobs';
    if (!sel.length) { $('q-progress').textContent = ''; $('q-summary').style.display = 'none'; return; }

    const isle = $('q-isle').value;
    const hideDone = $('q-hidedone').checked;
    const counts = questLootCounts();
    let total = 0, done = 0;

    // summary strip: Turned in · Ready · Missing one — across selected classes
    let sumReady = 0, sumDone = 0, sumMiss1 = 0, sumAll = 0;
    for (const q of POS.quests.filter(q => sel.includes(q.cls))) {
      const st = qState(q.reward);
      sumAll++;
      const got = q.items.filter(it => st.items[it.name]).length;
      if (st.done) sumDone++;
      else if (got === q.items.length) sumReady++;
      else if (got === q.items.length - 1) sumMiss1++;
    }
    $('q-summary').innerHTML =
      '<span style="color:#7dffa0">✓ Turned in: <b>' + sumDone + '/' + sumAll + '</b></span>' +
      '<span style="color:#ffd766">● Ready: <b>' + sumReady + '</b></span>' +
      '<span style="color:#ff9d5c">◐ Missing one: <b>' + sumMiss1 + '</b></span>';

    for (const cls of sel) {
      const qs = POS.quests.filter(q => q.cls === cls);
      // ready first, then closest-to-done, turned-in last
      qs.sort((a, b) => {
        const rank = (q) => {
          const st = qState(q.reward);
          if (st.done) return 1000;
          const missing = q.items.filter(it => !st.items[it.name]).length;
          return missing === 0 ? -1 : missing;
        };
        return rank(a) - rank(b);
      });
      const div = document.createElement('div');
      div.className = 'l-divider';
      div.textContent = cls + ' — ' + qs[0].npc;
      list.appendChild(div);

      for (const q of qs) {
        const st = qState(q.reward);
        total++; if (st.done) done++;
        if (st.done && hideDone) continue;
        if (isle && !questIsles(q).has(isle)) continue;

        const got = q.items.filter(it => st.items[it.name]).length;
        const ready = !st.done && got === q.items.length;

        const card = document.createElement('div');
        card.className = 'q-quest' + (st.done ? ' done' : ready ? ' ready' : '');

        const head = document.createElement('div');
        head.className = 'q-head';
        head.innerHTML = '<span>' + (qExpanded.has(q.reward) ? '▾' : '▸') +
          '</span><span class="rw itemlink"></span><span class="st"></span><span class="q-donebtn" title="Mark turned in / not turned in">✓</span>';
        head.querySelector('.rw').textContent = q.reward;
        head.querySelector('.st').textContent = st.done ? 'TURNED IN' : ready ? 'READY — see ' + q.npc : got + '/' + q.items.length;
        head.querySelector('.rw').addEventListener('click', (e) => { e.stopPropagation(); openItemLink(q.reward); });
        head.querySelector('.q-donebtn').addEventListener('click', (e) => {
          e.stopPropagation();
          const s = qState(q.reward);
          qSave(q.reward, { ...s, done: !s.done });
          renderQuests();
        });
        head.addEventListener('click', () => {
          qExpanded.has(q.reward) ? qExpanded.delete(q.reward) : qExpanded.add(q.reward);
          renderQuests();
        });
        card.appendChild(head);

        if (qExpanded.has(q.reward)) {
          const npc = document.createElement('div');
          npc.className = 'q-npc';
          npc.textContent = 'Turn in to ' + q.npc;
          card.appendChild(npc);
          const box = document.createElement('div');
          box.className = 'q-items';
          for (const it of q.items) {
            const row = document.createElement('div');
            const have = !!st.items[it.name];
            const isRune = /^Wind Rune /.test(it.name);
            row.className = 'q-it' + (have ? ' have' : '');
            const looted = counts.get(it.name.toLowerCase()) || 0;
            row.innerHTML = '<span class="box">' + (have ? '☑' : '☐') +
              '</span><span class="nm itemlink"></span>' + (isRune ? '<span class="rune">💠</span>' : '') +
              (looted ? '<span class="cnt">×' + looted + ' looted</span>' : '') +
              '<span class="loc"></span>';
            row.querySelector('.nm').textContent = it.name;
            row.querySelector('.loc').textContent = it.loc;
            row.title = (isRune ? 'Currency: not visible to inventory import — loot it or check by hand. ' : '') +
                        it.loc + ' — click ☐ to check off, click the name for item details';
            // name opens the item in the Wiki tab; anywhere else toggles collected
            row.querySelector('.nm').addEventListener('click', (e) => { e.stopPropagation(); openItemLink(it.name); });
            row.addEventListener('click', () => {
              const s = qState(q.reward);
              const items = { ...s.items };
              if (items[it.name]) delete items[it.name]; else items[it.name] = true;
              qSave(q.reward, { ...s, items });
              renderQuests();
            });
            box.appendChild(row);
          }
          card.appendChild(box);
        }
        list.appendChild(card);
      }
    }
    $('q-progress').textContent = done + '/' + total + ' turned in';
  }

  // ---- loot verdicts: "should I keep this?" ----
  // Layer 1: your personal keep/junk list (always wins, synced).
  // Layer 2: the PoS quest database vs your live quest progress.
  // Unknown items stay quiet — flag them once (⚑) and SEQO remembers.
  let itemVerdicts = {};   // itemName(lower) -> 'keep' | 'junk'
  window.overlay.getItemVerdicts().then((v) => { itemVerdicts = v || {}; });
  const verdictKey = (n) => n.replace(/ \+\d+$/, '').toLowerCase();

  function lootVerdict(itemName) {
    const key = verdictKey(itemName);
    if (wishList[key]) return { kind: 'wish', label: 'WISH', reason: 'on your wish list!' };
    if (itemVerdicts[key] === 'keep') return { kind: 'keep', label: 'KEEP', reason: 'on your keep list' };
    if (itemVerdicts[key] === 'junk') return { kind: 'junk', label: 'JUNK', reason: 'on your junk list' };
    const sel = qSelClasses();
    const others = new Set();
    let dup = null, doneQ = null;
    for (const q of POS.quests) {
      const it = q.items.find(x => x.name.toLowerCase() === key);
      if (!it) continue;
      if (sel.includes(q.cls)) {
        const st = qState(q.reward);
        if (!st.done && !st.items[it.name]) {
          const got = q.items.filter(i => st.items[i.name]).length;
          return { kind: 'keep', label: 'KEEP', reason: q.reward + ' (' + (got + 1) + '/' + q.items.length + ')' };
        }
        if (!st.done) dup = q.reward; else doneQ = q.reward;
      } else others.add(q.cls);
    }
    // epic prep / race-grind / BiS needs outrank spare & sellable
    const extra = neededExtraVerdict(key, itemName);
    if (extra) return extra;
    if (dup) return { kind: 'spare', label: 'SPARE', reason: 'already collected for ' + dup };
    if (doneQ) return { kind: 'sell', label: 'SELLABLE', reason: doneQ + ' already turned in' };
    if (others.size) return { kind: 'other', label: 'OTHER CLASS', reason: 'PoS quest for ' + [...others].join(', ') };
    return { kind: 'unknown', label: '', reason: '' };
  }

  // ---- kill-time heads-up: fires when a mob DIES, before anyone touches the
  // loot window, if its known drop table holds something you still need
  // (epic/BiS/quest/wish — all suppressed once you own the item). Known drops
  // come from your own loot database plus the wiki's zone data.
  const needToastSeen = new Map(); // mob key -> last toast time
  function killNeedHeadsUp(mobName) {
    const mk = mobKey(mobName);
    const last = needToastSeen.get(mk.toLowerCase()) || 0;
    if (Date.now() - last < 300000) return; // 5 min per mob
    const drops = new Set();
    if (lootDB && lootDB.mobs)
      for (const m of Object.values(lootDB.mobs))
        if (m.name.toLowerCase() === mk.toLowerCase())
          for (const d of Object.keys(m.drops || {})) drops.add(d);
    for (const n of (zoneData && zoneData.named) || [])
      if (mobKey(n.mob).toLowerCase() === mk.toLowerCase())
        for (const d of n.drops || []) drops.add(d.item);
    if (!drops.size) return;
    const hits = [];
    for (const item of [...drops].slice(0, 40)) {
      const v = lootVerdict(item);
      if (v.kind !== 'wish' && v.kind !== 'keep') continue;
      if (/faction turn-in/.test(v.reason)) continue;      // grind mats drop constantly — loot toast covers them
      if (v.reason === 'on your keep list' && invHas(item)) continue;
      if (v.kind === 'wish' && invHas(item)) continue;
      hits.push({ item, reason: v.reason });
      if (hits.length >= 2) break;
    }
    if (!hits.length) return;
    needToastSeen.set(mk.toLowerCase(), Date.now());
    alertFX('👀 ' + mk + ' can drop ' +
      hits.map(h => h.item + ' — ' + h.reason).join(' · ') + '. Check the loot window!', 'heads');
  }

