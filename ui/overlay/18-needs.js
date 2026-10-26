// SEQO overlay — zone-needs panel and Needs tab.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= zone-needs panel =================
  // Everything still obtainable in the CURRENT zone, grouped by why you need
  // it. Lives in its own slim window (persistent + minimizable); this side
  // builds the rows and pushes them whenever anything relevant changes.
  let needsOpen = false;
  let pendingNeedsFlash = null; // loot bursts coalesce to ONE rebuild in the 500ms loop
  $('l-needs').addEventListener('click', () => window.overlay.openNeeds());
  $('n-popout').addEventListener('click', () => window.overlay.openNeeds());

  function buildZoneNeeds() {
    if (!currentZone) return { zone: '', rows: [] };
    // candidate items obtainable here: your own loot DB + the wiki's zone page
    const sources = new Map(); // norm name -> { item, mobs: Set }
    const addSrc = (item, mob) => {
      if (!item) return;
      const k = normItemName(item);
      let e = sources.get(k);
      if (!e) sources.set(k, e = { item, mobs: new Set() });
      if (mob) e.mobs.add(mob);
    };
    for (const m of Object.values(lootDB.mobs || {})) {
      if ((m.zone || '') !== currentZone) continue;
      for (const d of Object.values(m.drops || {})) addSrc(d.name, m.name);
    }
    for (const n of (zoneData && zoneData.named) || [])
      for (const d of n.drops || []) addSrc(d.item, n.mob === '(zone drops)' ? '' : n.mob);
    const rows = [];
    const wishShown = new Set();
    for (const { item, mobs } of sources.values()) {
      const key = verdictKey(item);
      if (wishList[key]) {                                  // ⭐ starred gear
        if (!invHas(item)) { rows.push({ g: 'wish', item, mobs: [...mobs] }); wishShown.add(key); }
        continue;
      }
      const d = epicDemand(item);                           // ⚔ epic pieces
      if (d.total > 0 && d.have < d.total) {
        const who = d.per.filter(p => p.need).map(p => p.cls).join(' + ');
        rows.push({ g: 'epic', item, have: d.have, need: d.total, mobs: [...mobs],
                    reason: ((EPICDB.EPICS[(d.per[0] || {}).cls] || {}).epic || 'epic') + ' (' + who + ')' });
        continue;
      }
      const g = grindItemNeed(key);                         // 🔓 unlock mats
      if (g && (!g.total || g.have < g.total))
        rows.push({ g: 'unlock', item, have: g.have, need: g.total || 0,
                    left: g.left, faction: g.faction, mobs: [...mobs] });
    }
    // ⭐ wished items the item's OWN wiki page places in this zone — even when
    // the zone guide and your loot history don't know the drop yet
    for (const [key, e] of Object.entries(wishList)) {
      if (wishShown.has(key) || invHas(e.name)) continue;
      const hit = wishWikiHere(key, [currentZone, zoneData && zoneData.pageTitle, ...wikiCandidates(currentZone)]);
      if (hit) rows.push({ g: 'wish', item: e.name, mobs: hit.mobs.slice(0, 4) });
    }
    rows.push(...spellQuestNeeds(currentZone)); // 🧙 tracked spell-quest pieces here
    const order = { wish: 0, epic: 1, unlock: 2, spellq: 3 };
    rows.sort((a, b) => (order[a.g] - order[b.g]) || a.item.localeCompare(b.item));
    return { zone: currentZone, rows };
  }

  function pushNeeds(flash) {
    if (!needsOpen) return;
    const p = buildZoneNeeds();
    p.scale = (settings && settings.textScale) || 'normal';
    if (flash) p.flash = flash;
    window.overlay.needsPush(p);
  }

  window.overlay.onNeedsState((open) => {
    needsOpen = open;
    if (open) pushNeeds();
  });
  window.overlay.onNeedsCmd((cmd) => {
    if (!cmd) return;
    if (cmd.kind === 'refresh') pushNeeds();
    else if (cmd.kind === 'item' && cmd.name) openItem(cmd.name);
    else if (cmd.kind === 'wish' && cmd.name) toggleWish(cmd.name);
  });

  // ---- 🎯 Needs tab: the same rows as the pop-out, rendered in the overlay ----
  const NEED_GROUPS = [
    { g: 'wish', label: '⭐ WISH LIST' },
    { g: 'epic', label: '⚔ EPIC PREP' },
    { g: 'unlock', label: '🔓 UNLOCK TURN-INS' },
    { g: 'spellq', label: '🧙 SPELL QUESTS' }
  ];
  function renderNeedsTab(flashItem) {
    keepScroll($('n-rows'));
    const p = buildZoneNeeds();
    const rows = p.rows || [];
    $('n-zone').textContent = '🎯 Needs — ' + (p.zone || 'no zone yet') + (rows.length ? ' (' + rows.length + ')' : '');
    const box = $('n-rows');
    box.innerHTML = '';
    $('n-empty').style.display = rows.length ? 'none' : 'flex';
    if (!rows.length) {
      $('n-empty').innerHTML = p.zone
        ? 'Nothing you still need drops in ' + p.zone + ' —<br>or SEQO has no drop data here yet.<br>It fills in as you hunt (and from the wiki\'s zone page).'
        : 'Zone needs appear once SEQO<br>sees you enter a zone.';
      return;
    }
    for (const grp of NEED_GROUPS) {
      const inGrp = rows.filter(r => r.g === grp.g);
      if (!inGrp.length) continue;
      const h = document.createElement('div');
      h.className = 'l-divider';
      h.textContent = grp.label;
      box.appendChild(h);
      for (const r of inGrp) {
        const d = document.createElement('div');
        d.className = 'l-mob';
        d.style.cssText = 'cursor:pointer;gap:6px;align-items:baseline';
        if (flashItem && flashItem.toLowerCase() === r.item.toLowerCase())
          d.style.animation = 'needflash 2.2s';
        const nm = document.createElement('span');
        nm.textContent = r.item;
        nm.style.cssText = 'color:#ffd766;flex:none;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
                           'text-decoration:underline dotted rgba(255,215,102,.35);text-underline-offset:2px';
        const cnt = document.createElement('span');
        cnt.className = 'k';
        cnt.style.cssText = 'color:#7dffa0;font-variant-numeric:tabular-nums;flex:none';
        if (r.need > 0) {
          cnt.textContent = Math.min(r.have || 0, r.need) + '/' + r.need +
            (r.left != null && r.left > 0 ? ' · ~' + r.left + ' to max' : '');
          if (r.left != null)
            cnt.title = 'Full grind: ' + r.need + '. Your current faction standing already covers part of it — about ' + r.left + ' more turn-ins max it out.';
        } else if (r.g === 'unlock' && r.have) cnt.textContent = '×' + r.have;
        const mobs = document.createElement('span');
        mobs.style.cssText = 'color:#8fa9c7;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px';
        const mobTxt = (r.mobs || []).filter(Boolean);
        mobs.textContent = r.faction
          ? (mobTxt.length ? mobTxt.slice(0, 3).join(', ') + ' · ' : '') + r.faction
          : mobTxt.length ? mobTxt.slice(0, 3).join(', ') + (mobTxt.length > 3 ? ' +' + (mobTxt.length - 3) : '')
          : 'zone drop';
        mobs.title = (mobTxt.join('\n') || 'listed as a zone-wide drop') + (r.reason ? '\n' + r.reason : '');
        d.append(nm, cnt, mobs);
        if (r.g === 'wish') {
          const star = document.createElement('span');
          star.textContent = '★';
          star.style.cssText = 'flex:none;cursor:pointer;color:#ffd766;padding:0 3px';
          star.title = 'Un-star (stops watching this item)';
          star.addEventListener('click', (e) => { e.stopPropagation(); toggleWish(r.item); });
          d.appendChild(star);
        }
        d.title = 'Click for item details' + (r.reason ? ' — ' + r.reason : '');
        d.addEventListener('click', () => openItem(r.item));
        box.appendChild(d);
      }
    }
  }

