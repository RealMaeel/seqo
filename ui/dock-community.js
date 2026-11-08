// SEQO dock — 🌐 community numbers on the kill card and the item card (3.0).
// Loaded after ui/dock.js and shares its scope (mobName, itemName, showItem, showMob, $).
  const cmPct = (n, k) => (k ? (n / k * 100 < 1 ? '<1%' : Math.round(n / k * 100) + '%') : '');
  const cmTime = (s) => (s >= 3600 ? (s / 3600).toFixed(1).replace(/\.0$/, '') + ' h' : s >= 60 ? Math.round(s / 60) + ' min' : s + ' s');
  const cmCoin = (c) => {
    const parts = [];
    for (const [v, w] of [[1000, 'p'], [100, 'g'], [10, 's'], [1, 'c']]) { const n = Math.floor(c / v); if (n) { parts.push(n + w); c -= n * v; } }
    return parts.join(' ') || '0';
  };
  const cmFac = (v) => (v === 'min' || v === 'worse' ? '(already as low as it goes)' : v === 'max' || v === 'better' ? '(already as high as it goes)' : (v > 0 ? '+' : '') + v);
  const cmPlayers = (n) => n + ' player' + (n === 1 ? '' : 's');
  function cmEl(parent, cls, text, title) {
    const d = document.createElement('div'); if (cls) d.className = cls; if (text != null) d.textContent = text; if (title) d.title = title;
    parent.appendChild(d); return d;
  }
  function cmBox(parent) {
    const b = document.createElement('div');
    b.style.cssText = 'border-left:2px solid rgba(125,200,255,.45);padding:0 0 2px 7px;margin:2px 0 8px';
    parent.appendChild(b); return b;
  }
  function cmHead(box, text, sub, title) {
    const h = cmEl(box, 'mz', text, title);
    h.style.color = '#7dc8ff';
    if (sub) { const s = document.createElement('span'); s.className = 'sub'; s.textContent = sub; h.appendChild(s); }
    return h;
  }
  function cmRow(box, name, n, rate, onClick, title) {
    const r = document.createElement('div'); r.className = 'mrow';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = name;
    if (onClick) { nm.addEventListener('click', onClick); nm.title = title || ''; } else { nm.style.cursor = 'default'; nm.style.textDecoration = 'none'; }
    const ns = document.createElement('span'); ns.className = 'n'; ns.textContent = n;
    const rs = document.createElement('span'); rs.className = 'r'; rs.textContent = rate;
    r.append(nm, ns, rs); box.appendChild(r); return r;
  }

  // numbers from fewer than this many players start folded into one line (click to open)
  const CM_OPEN_PLAYERS = 3;
  const cmOpen = new Set();          // boxes you opened (or closed) this session: key -> true/false
  const cmOpenState = new Map();
  // a folding box: the head line toggles the rest
  function cmFold(box, key, startOpen) {
    const open = cmOpenState.has(key) ? cmOpenState.get(key) : startOpen;
    const body = document.createElement('div');
    body.style.display = open ? '' : 'none';
    return { body, open, wire(head) {
      const tw = document.createElement('span');
      tw.textContent = open ? '▾ ' : '▸ ';
      tw.style.cssText = 'cursor:pointer;color:#7dc8ff';
      head.insertBefore(tw, head.firstChild);
      head.style.cursor = 'pointer';
      head.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'BUTTON') return;
        const now = body.style.display === 'none';
        body.style.display = now ? '' : 'none';
        tw.textContent = now ? '▾ ' : '▸ ';
        cmOpenState.set(key, now);
      });
      box.appendChild(body);
    } };
  }

  // kill card: what everyone's logs say about this mob, per zone
  async function fillCommunityMob(host, name) {
    let list = [];
    try { list = (await window.overlay.communityMob(name)) || []; } catch { /* no file yet */ }
    if (!list.length || mobName !== name) return;
    // your own kills first: once you have some, the community boxes go under them
    if (mobCard && host.parentNode) { host.parentNode.appendChild(host); host.style.marginTop = '8px'; }
    for (const e of list.sort((a, b) => (b.kills || 0) - (a.kills || 0))) {
      const outer = cmBox(host);
      const fold = cmFold(outer, 'm|' + e.zone + '|' + e.mob, !mobCard || (e.players || 0) >= CM_OPEN_PLAYERS);
      const box = fold.body;
      const info = [];
      if (e.kills) info.push(e.kills.toLocaleString() + ' kills');
      info.push(cmPlayers(e.players || 0));
      if (e.respawn) info.push('respawn ~' + cmTime(e.respawn.s));
      if (e.level) info.push('level ' + e.level);
      if (e.maxHit) info.push('max hit ' + e.maxHit + (e.avgHit ? ' · avg ' + e.avgHit : ''));
      const head = cmHead(outer, '🌐 Community · ' + e.zone + ' ', '· ' + info.join(' · '),
        'Everyone who shares their SEQO data, added up. A kill seen by several players in a group counts once.' +
        (e.respawn ? ' Respawn = the middle of ' + e.respawn.n + ' gaps between kills.' : ''));
      // 📋 copy this zone's community numbers as one line for game chat (your own stay on 📋 chat below)
      if (window.EQLMobStats && EQLMobStats.communityChatLine) {
        const cp = document.createElement('button');
        cp.textContent = '📋 chat';
        cp.title = 'Copy the community numbers for this zone as one line for game chat';
        cp.style.cssText = 'margin-left:6px;font-size:10px;padding:0 6px;border-radius:4px;border:1px solid rgba(125,200,255,.45);background:#1e2633;color:#bfe3ff;cursor:pointer;vertical-align:1px';
        cp.addEventListener('click', () => mobCopy(EQLMobStats.communityChatLine(e)));
        head.appendChild(cp);
      }
      fold.wire(head);
      const drops = Object.entries(e.drops || {}).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
      for (const [item, d] of drops) cmRow(box, item, d.n + '/' + (e.kills || '?'), cmPct(d.n, e.kills), () => showItem(item), 'Item details');
      if (!drops.length) cmEl(box, 'sect-b', 'no drops shared yet');
      const fac = Object.entries(e.factions || {});
      if (fac.length) {
        const fl = cmEl(box, 'sect-b', 'Faction per kill: ');
        fl.style.marginTop = '3px';
        fac.forEach(([f, x], i) => {
          if (i) fl.append(document.createTextNode(' · '));
          const a = document.createElement('span'); a.textContent = f; a.title = 'What else raises or lowers ' + f;
          a.style.cssText = 'cursor:pointer;text-decoration:underline dotted rgba(255,255,255,.3)';
          a.addEventListener('click', () => showFaction(f));
          fl.append(a, document.createTextNode(' ' + cmFac(x.v)));
        });
      }
      if (e.spells && e.spells.length) cmEl(box, 'sect-b', 'Casts: ' + e.spells.join(', '));
    }
  }

  // item card: where everyone has seen it drop, the quests that give it, the turn-ins it's used in
  async function fillCommunityItem(name) {
    const host = $('icommunity');
    if (!host) return;
    host.innerHTML = '';
    let list = [];
    try { list = (await window.overlay.communityItem(name)) || []; } catch { /* no file yet */ }
    if (!list.length || itemName !== name) return;
    let st = null;
    try { st = await window.overlay.communityDataStatus(); } catch { /* ok */ }
    const outer = cmBox(host);
    const nDrops = list.filter((x) => x.kind === 'drop').length, nQuest = list.length - nDrops;
    const fold = cmFold(outer, 'i|' + name, ((st && st.installs) || 0) >= CM_OPEN_PLAYERS);
    const box = fold.body;
    fold.wire(cmHead(outer, '🌐 Community ', '· ' + [nDrops ? 'drops from ' + nDrops + ' mob' + (nDrops === 1 ? '' : 's') : '', nQuest ? nQuest + ' quest note' + (nQuest === 1 ? '' : 's') : ''].filter(Boolean).join(' · ') +
      (st && st.installs ? ' · ' + cmPlayers(st.installs) : ''), 'Everyone who shares their SEQO data, added up'));
    // most often seen first (a big sample beats a lucky 3 of 2); sources with no kills (a Dungeon Crawl's
    // Reward Chest) have no rate and go last
    const drops = list.filter((x) => x.kind === 'drop').sort((a, b) => (b.kills ? 1 : 0) - (a.kills ? 1 : 0) || b.n - a.n).slice(0, 10);
    if (drops.length) {
      cmEl(box, 'sect-b', 'Drops from:');
      for (const d of drops) cmRow(box, d.mob + ' — ' + d.zone, d.n + '/' + (d.kills || '?'), cmPct(d.n, d.kills), () => showMob(d.mob), 'Kill card');
    }
    for (const r of list.filter((x) => x.kind === 'reward'))
      cmEl(box, 'sect-b', '🎁 Quest reward from ' + r.npc + ' (' + r.zone + ')' +
        (r.confirmed ? ' — seen ' + r.confirmed + '×' : ' — likely (' + r.likely + '×)')).style.marginTop = '3px';
    for (const p of list.filter((x) => x.kind === 'promise'))
      cmEl(box, 'sect-b', '📜 ' + p.npc + ' (' + p.zone + ') gives it for: ' + p.for.map((sig) => sig.replace(/(^|\+ )1x/g, '$1').replace(/(\d+)x/g, '$1× ')).join(' — or — '));
    const ti = list.filter((x) => x.kind === 'turnin').slice(0, 6);
    for (const t of ti)
      cmEl(box, 'sect-b', '🤝 Handed in to ' + t.npc + ' (' + t.zone + '): ' + t.items.map(([i, n]) => (n > 1 ? n + '× ' : '') + i).join(' + ') +
        ' — ' + t.n + '×' + (t.coin ? ' · ' + cmCoin(t.coin) : '') + (t.xp ? ' · experience' : '') +
        (t.factions && Object.keys(t.factions).length ? ' · ' + Object.entries(t.factions).map(([f, x]) => f + ' ' + cmFac(x.v)).join(', ') : ''));
  }

  window.overlay.onCommunityDataUpdated && window.overlay.onCommunityDataUpdated(() => {
    cmOpen.clear();
    if (mode === 'mob' && mobName) showMob(mobName, true);
    else if (mode === 'item' && itemName) fillCommunityItem(itemName);
  });
