// SEQO overlay — Lookup tab and mob combat observations.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= lookup =================
  let currentZone = '';
  let currentZoneVariant = ''; // difficulty tier: "Fused", "Refined", ...
  let zoneData = null;

  // zone name used for DATA RECORDING: includes the difficulty tier, so
  // Fused/Refined loot tables and respawns never pollute the base zone's data
  const lootZone = () => currentZone + (currentZoneVariant ? ' (' + currentZoneVariant + ')' : '');

  const RAR_CLASS = (r) => {
    const x = (r || '').toLowerCase();
    if (x.includes('common') && !x.includes('un')) return 'common';
    if (x.includes('uncommon')) return 'uncommon';
    if (x.includes('rare')) return 'rare';
    return 'other';
  };
  const mobKey = (n) => n.replace(/^(A|An|The) /, m => m.toLowerCase());

  function setStatus(msg) { $('k-status').textContent = msg || ''; }

  // instance decorations can arrive from old saved settings or /who lines,
  // not just entry events - sanitize EVERY path into currentZone
  function cleanZoneName(z) {
    if (!z) return z;
    let zone = z.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+\d+\s*$/, '').trim();
    const mm = /\s+-\s+(Solo|Duo|Trio|Group|Raid|Party|Heroic|Event)$/i.exec(zone);
    if (mm) zone = zone.slice(0, mm.index).trim();
    return zone;
  }

  async function setZone(zone, { autoFetch } = {}) {
    zone = cleanZoneName(zone);
    currentZone = zone;
    $('k-zonename').textContent = 'Zone: ' + (zone || 'unknown');
    if (activeTab === 'map') drawMap();
    // Quests tab in auto mode follows you as you zone
    if (activeTab === 'quests' && !qView && !$('q-zone').value) renderQuests();
    wishZoneCheck(zone);
    zoneData = zone ? await window.overlay.getZoneData(zone) : null;
    rebuildNamedSet();
    needsDirty = true;   // the zone-needs panel follows you between zones
    if (!zoneData && zone && autoFetch && settings && settings.autoZoneUpdate) {
      updateZoneNow();
      return;
    }
    renderZone();
  }

  function rebuildNamedSet() {
    namedSet = new Set(((zoneData && zoneData.named) || [])
      .map(n => mobKey(n.mob).toLowerCase())
      .filter(n => n !== '(zone drops)'));
    // mobs the wiki page explicitly calls Boss/Named/Rare — trusted as rares
    // even when their names look generic
    bossSet = new Set(((zoneData && zoneData.named) || [])
      .filter(n => n.boss)
      .map(n => mobKey(n.mob).toLowerCase()));
  }

  // best wiki page titles for a game zone name, most-likely first:
  // canonical wiki name (may differ from game name), then game name variants
  function wikiCandidates(longName) {
    const out = [];
    const short = zoneShortName(longName);
    if (short && EQLZones.wikiNames[short]) out.push(EQLZones.wikiNames[short]);
    out.push(longName);
    const noThe = longName.replace(/^The /, '');
    if (noThe !== longName) out.push(noThe);
    return [...new Set(out)];
  }

  async function updateZoneNow() {
    if (!currentZone) { setStatus('No zone detected yet — enter a zone in game.'); return; }
    setStatus('Fetching "' + currentZone + '" from eqlwiki.com…');
    const res = await window.overlay.updateZoneData(currentZone, wikiCandidates(currentZone));
    if (res && res.error) { setStatus('⚠ ' + res.error); return; }
    zoneData = res;
    rebuildNamedSet();
    needsDirty = true;
    setStatus('');
    renderZone();
  }

  function renderZone() {
    renderWishList();
    const el = $('k-zone');
    el.innerHTML = '';
    if (!zoneData) {
      if (currentZone) setStatus('No local data for this zone yet — click Update to fetch it once.');
      return;
    }
    setStatus('Updated ' + new Date(zoneData.updated).toLocaleDateString() +
      ' · ' + (zoneData.named || []).length + ' named' +
      ((zoneData.quests || []).length ? ' · ' + zoneData.quests.length + ' quests' : ''));
    for (const nm of zoneData.named || []) {
      const h = document.createElement('div');
      h.className = 'k-zonemob';
      h.textContent = nm.mob;
      // your own kill count for this mob, if any (zone-keyed, legacy fallback)
      const lk = lootDB.mobs &&
        (lootDB.mobs[currentZone + '|' + mobKey(nm.mob)] || lootDB.mobs[lootZone() + '|' + mobKey(nm.mob)] || lootDB.mobs[mobKey(nm.mob)]);
      if (lk) h.textContent += '  (' + lk.kills + ' kills by you)';
      el.appendChild(h);
      for (const d of nm.drops || []) {
        const row = document.createElement('div');
        row.className = 'k-drop';
        const left = document.createElement('span');
        left.textContent = d.item;
        if (d.rarity) {
          const b = document.createElement('span');
          b.className = 'rar ' + RAR_CLASS(d.rarity);
          b.textContent = d.rarity;
          left.appendChild(b);
        }
        row.appendChild(left);
        const seen = lk && Object.values(lk.drops || {}).find(x => x.name === d.item);
        if (seen && lk.kills) {
          const s = document.createElement('span');
          s.className = 'seen';
          s.textContent = seen.count + '/' + lk.kills + ' (' + Math.round(seen.count / lk.kills * 100) + '%)';
          row.appendChild(s);
        }
        row.appendChild(wishStar(d.item));
        row.addEventListener('click', () => openItem(d.page || d.item));
        el.appendChild(row);
      }
    }

    if ((zoneData.quests || []).length) {
      const h = document.createElement('div');
      h.className = 'k-zonemob';
      h.textContent = '📜 Quests in ' + (zoneData.pageTitle || currentZone);
      el.appendChild(h);
      for (const q of zoneData.quests) {
        const row = document.createElement('div');
        row.className = 'k-drop';
        const s = document.createElement('span');
        s.textContent = q;
        row.appendChild(s);
        row.addEventListener('click', () => openItem(q));
        el.appendChild(row);
      }
    }
  }

  async function runLocalSearch() {
    const q = $('k-query').value.trim();
    if (!q) { $('k-results').innerHTML = ''; return; }
    const results = await window.overlay.searchLocal(q);
    renderResults(results, q);
  }

  async function runWikiSearch() {
    const q = $('k-query').value.trim();
    if (!q) return;
    setStatus('Searching sources…');
    const res = await window.overlay.searchWiki(q);
    if (res.error) { setStatus('⚠ ' + res.error); return; }
    setStatus('');
    const results = (res.titles || []).map(t =>
      ({ kind: 'wiki', name: t, detail: 'eqlwiki — click to fetch & cache' }));
    const seen = new Set(results.map(r => r.name.toLowerCase()));
    for (const t of res.tools || []) {
      for (const line of t.lines) {
        const name = line.split(' | ')[0].replace(/ \+\d+$/, '').trim() || q;
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        results.push({ kind: 'tools', name, detail: 'eqlegendstools · ' + t.source, page: name });
      }
    }
    // Project 1999 wiki: classic EQ — after the Legends sources, and labelled
    for (const t of res.p99 || []) results.push({ kind: 'p99', name: t, detail: 'P99 wiki — classic EQ, Legends may differ' });
    renderResults(results, q);
  }

  function renderResults(results, q) {
    results = Array.isArray(results) ? results.slice() : [];
    const el = $('k-results');
    el.innerHTML = '';
    // items people are selling in chat right now, even ones SEQO has no page for yet
    const qk = (q || '').toLowerCase().trim();
    if (qk.length >= 3 && PR) {
      const have = new Set(results.map(r => PR.keyOf(r.page || r.itemName || r.name)));
      for (const [k, name] of priceName) {
        if (results.length >= 60) break;
        if (k.includes(qk) && !have.has(k)) { results.push({ kind: 'price', name, detail: 'seen for sale in chat' }); have.add(k); }
      }
    }
    if (!results.length) {
      el.innerHTML = '<div class="k-result"><span class="d">No local matches for “' +
        escapeHtml(q) + '” — try Sources ⟳ to search online.</span></div>';
      return;
    }
    for (const r of results) {
      const div = document.createElement('div');
      div.className = 'k-result';
      const icon = r.kind === 'kills' ? '🗡' : r.kind === 'seen' ? '💰' : r.kind === 'wiki' ? '🌐' : r.kind === 'tools' ? '🧰' : r.kind === 'mob' ? '👹' : r.kind === 'price' ? '🏷' : r.kind === 'p99' ? '🏛' : '📦';
      div.innerHTML = icon + ' <b></b> <span class="d"></span>';
      div.querySelector('b').textContent = r.name;
      const pt = r.kind !== 'mob' && r.kind !== 'kills' ? priceTag(r.page || r.itemName || r.name) : '';
      div.querySelector('.d').textContent = '— ' + r.detail + (pt ? ' · sells ' + pt : '');
      if (r.kind === 'kills') {   // your own kill card: works without a wiki page
        div.addEventListener('click', () => window.overlay.openDock('mob', { name: r.name }));
        el.appendChild(div);
        continue;
      }
      if (r.kind === 'p99') {
        div.addEventListener('click', () => openGuide({ title: r.name, source: 'p99', label: 'P99: ' + r.name }));
        el.appendChild(div);
        continue;
      }
      div.addEventListener('click', () => openItem(r.page || r.itemName || r.name));
      if (r.kind !== 'mob') div.appendChild(wishStar(r.page || r.itemName || r.name));
      el.appendChild(div);
    }
  }

  // open an item's lookup page from anywhere (loot tab, zone list, search)
  function openItemLink(name) {
    openItem(name); // the dock opens over whatever tab you're on
  }

  // Item details live in the DOCK now — a roomy always-on-top panel under
  // the overlay. Everything that used to squeeze into this tab's detail box
  // (stats, slider, effects with descriptions, sources) renders there.
  function openItem(name) {
    window.overlay.openDock('item', { name });
    return Promise.resolve();
  }
  $('k-go').addEventListener('click', runLocalSearch);
  $('k-wiki').addEventListener('click', runWikiSearch);
  $('k-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (e.shiftKey ? runWikiSearch : runLocalSearch)();
  });
  $('k-zoneupdate').addEventListener('click', updateZoneNow);

  // ---- mob combat observations (batched to main every 5s) ----
  const mobStatsPending = new Map(); // zone|mob -> {mob, zone, maxHit, hits, total, spells:Set}
  const isMobName = (n) => /^(a|an|the) /.test(n) || namedSet.has(n.toLowerCase());

  function pendingMobEntry(name) {
    const key = lootZone() + '|' + name;
    let e = mobStatsPending.get(key);
    if (!e) mobStatsPending.set(key, e = { mob: name, zone: lootZone(), maxHit: 0, hits: 0, total: 0, spells: new Set() });
    return e;
  }

  function noteMobHit(name, amount) {
    const n = mobKey(name);
    if (n === 'You' || petNames.has(n) || !isMobName(n)) return;
    const e = pendingMobEntry(n);
    e.maxHit = Math.max(e.maxHit, amount);
    e.hits++; e.total += amount;
  }

  function noteMobSpell(name, spell) {
    const n = mobKey(name);
    if (n === 'You' || petNames.has(n) || !isMobName(n)) return;
    pendingMobEntry(n).spells.add(spell);
  }

  // /con lines carry the mob's level - free wiki data. Named mobs don't use
  // articles, so also accept anything currently in the fight's enemy set.
  function noteMobLevel(name, level) {
    const n = mobKey(name);
    if (n === 'You' || petNames.has(n)) return;
    const enemy = tracker.current && tracker.current.enemies.has(n);
    if (!isMobName(n) && !enemy) return;   // avoids logging /con of players
    pendingMobEntry(n).level = level;
  }

  setInterval(() => {
    if (!mobStatsPending.size) return;
    window.overlay.recordMobStats([...mobStatsPending.values()]
      .map(e => ({ ...e, spells: [...e.spells] })));
    mobStatsPending.clear();
  }, 5000);

