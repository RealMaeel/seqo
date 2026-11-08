// SEQO dock — ⚖ Faction (3.0): what raises and lowers a faction, from the community file — every
// kill and quest turn-in players have seen change it, best first, with your own standing on top.
// Loaded after ui/dock.js and ui/dock-community.js and shares their scope ($, mode, setMode, pushNav,
// showMob, showItem, cmFac, cmTime).
  let factionName = '';

  function fEl(parent, tag, cls, text) {
    const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text;
    parent.appendChild(d); return d;
  }
  // your standing from /outputfile faction, if SEQO has the file: { value, toMax } | null
  async function myStanding(name) {
    let gd = null;
    try { gd = await window.overlay.getGameData(); } catch { /* no exports */ }
    const all = gd && gd.factions && gd.factions.factions;
    if (!all) return null;
    if (all[name]) return all[name];
    const k = Object.keys(all).find((x) => x.toLowerCase() === String(name).toLowerCase());
    return k ? all[k] : null;
  }

  function factionRow(host, r, up) {
    const d = fEl(host, 'div', 'frow');
    const nm = fEl(d, 'span', 'nm');
    const b = fEl(nm, 'b', '', r.kind === 'kill' ? r.mob : r.npc);
    fEl(nm, 'span', 'z', ' — ' + r.zone);
    const how = [];
    if (r.kind === 'kill') {
      how.push('🗡 per kill');
      if (r.kills) how.push(r.kills.toLocaleString() + ' kills');
      if (r.respawn) how.push('respawn ~' + cmTime(r.respawn));
      b.title = 'Kill card';
      b.addEventListener('click', () => showMob(r.mob));
    } else {
      how.push('🤝 per turn-in' + (r.items && r.items.length ? ': ' + r.items.map(([i, n]) => (n > 1 ? n + '× ' : '') + i).join(' + ') : ''));
      if (r.turnins) how.push(r.turnins + ' turn-in' + (r.turnins === 1 ? '' : 's') + ' seen');
      if (r.items && r.items.length) { b.title = 'What ' + r.npc + ' takes — item card'; b.addEventListener('click', () => showItem(r.items[0][0])); }
      else b.style.cursor = 'default';
    }
    fEl(nm, 'span', 'how', how.join(' · '));
    const v = fEl(d, 'span', 'v ' + (up ? 'up' : 'down'), typeof r.v === 'number' ? (r.v > 0 ? '+' : '') + r.v : 'at limit');
    v.title = typeof r.v === 'number' ? 'Seen most often (' + r.n + ' time' + (r.n === 1 ? '' : 's') + ')'
      : 'Only seen when the player was already at the ' + (up ? 'top' : 'bottom') + ': it ' + (up ? 'raises' : 'lowers') + ' it, by an amount nobody has seen yet';
  }

  async function showFaction(name, noPush) {
    if (!noPush && mode) pushNav();
    setMode('faction');
    factionName = name || '';
    const body = $('fbody');
    body.innerHTML = '';
    $('fsearch').value = '';
    if (!factionName) { $('ftitle').textContent = '⚖ Factions'; return factionPicker(''); }
    $('ftitle').textContent = '⚖ ' + factionName;
    let f = null;
    try { f = await window.overlay.communityFaction(factionName); } catch { /* none */ }
    const mine = await myStanding(factionName);
    if (factionName !== (name || '')) return;    // moved on meanwhile
    if (f && f.name) { factionName = f.name; $('ftitle').textContent = '⚖ ' + f.name; }
    if (mine) {
      const s = fEl(body, 'div', 'sect-b', 'Your standing: ' + mine.value.toLocaleString() + (mine.toMax != null ? ' · ' + mine.toMax.toLocaleString() + ' to go to the top' : ''));
      s.title = 'From your last /outputfile faction';
      s.style.margin = '2px 0 4px';
    }
    if (!f || (!f.raises.length && !f.lowers.length)) {
      fEl(body, 'div', 'sect-b', 'No one has shared a kill or turn-in that changes this faction yet.');
      return;
    }
    // a quick jump between the two lists (raises can run long)
    const heads = {};
    const jump = fEl(body, 'div', 'sect-b');
    jump.style.cssText = 'margin:0 0 2px;font-size:11px';
    for (const [lbl, key, color] of [['▲ ' + f.raises.length + ' raise it', 'up', '#7dffa0'], ['▼ ' + f.lowers.length + ' lower it', 'down', '#ff9d9d']]) {
      const a = fEl(jump, 'span', '', lbl);
      a.style.cssText = 'cursor:pointer;margin-right:12px;color:' + color;
      a.addEventListener('click', () => heads[key] && heads[key].scrollIntoView({ block: 'start' }));
    }
    for (const [title, list, up] of [['▲ Raises it', f.raises, true], ['▼ Lowers it', f.lowers, false]]) {
      const h = fEl(body, 'div', 'mz', title + ' ');
      heads[up ? 'up' : 'down'] = h;
      fEl(h, 'span', 'sub', '· ' + (list.length ? list.length + ' way' + (list.length === 1 ? '' : 's') : 'none seen yet'));
      for (const r of list) factionRow(body, r, up);
    }
    if (f.more) fEl(body, 'div', 'sect-b', '+' + f.more + ' more, seen less often, not listed').style.color = '#889';
    const n = fEl(body, 'div', 'sect-b', 'From everyone who shares their SEQO data (🌐). The amount is what was seen most often per kill or turn-in; "at limit" = only seen by players already at the top or bottom, so the direction is known but not the amount.');
    n.style.cssText = 'margin-top:8px;color:#889;font-size:10.5px';
  }

  // the list of factions anyone has seen change (filtered by the search box)
  async function factionPicker(q) {
    const body = $('fbody');
    body.innerHTML = '';
    let list = [];
    try { list = (await window.overlay.communityFactions(q)) || []; } catch { /* none */ }
    if (!list.length) { fEl(body, 'div', 'sect-b', q ? 'No faction matching “' + q + '” in the community data.' : 'No community faction data yet.'); return; }
    for (const x of list.slice(0, 200)) {
      const d = fEl(body, 'div', 'fpick');
      fEl(d, 'span', '', x.name);
      fEl(d, 'span', 'n', x.sources + ' source' + (x.sources === 1 ? '' : 's'));
      d.addEventListener('click', () => showFaction(x.name));
    }
  }

  let fTimer = null;
  $('fsearch').addEventListener('input', () => {
    clearTimeout(fTimer);
    fTimer = setTimeout(() => {
      const q = $('fsearch').value.trim();
      if (q) { $('ftitle').textContent = '⚖ Factions'; factionPicker(q); }
      else showFaction(factionName, true);
    }, 200);
  });
  $('fsearch').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const q = $('fsearch').value.trim();
    let list = [];
    try { list = (await window.overlay.communityFactions(q)) || []; } catch { /* none */ }
    const exact = list.find((x) => x.name.toLowerCase() === q.toLowerCase());
    if (exact || list.length === 1) showFaction((exact || list[0]).name);
  });
