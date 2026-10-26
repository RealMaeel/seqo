// SEQO overlay — Loot tab.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= render: loot =================
  function renderLoot() {
    keepScroll($('l-scroll'));
    $('l-coin').textContent = sessionCoin ? 'Session coin: ' + fmtCoin(sessionCoin) : '';
    renderRunBox();

    const rec = $('l-recent-box');
    rec.innerHTML = '';
    if (recentDrops.length) {
      const h = document.createElement('div');
      h.className = 'l-divider'; h.style.marginTop = '0';
      h.textContent = 'Recent drops';
      rec.appendChild(h);
      for (const d of recentDrops) {
        const div = document.createElement('div');
        div.className = 'l-recent';
        const a = document.createElement('span');
        a.className = 'itemlink';
        a.textContent = d.item;
        a.addEventListener('click', () => openItemLink(d.item));
        div.appendChild(a);
        // verdict badge: a user flag set later overrides the loot-time verdict
        const v = itemVerdicts[verdictKey(d.item)] ? lootVerdict(d.item) : (d.verdict || lootVerdict(d.item));
        if (v.label) {
          const b = document.createElement('span');
          b.className = 'v-badge v-' + v.kind;
          b.textContent = v.label;
          b.title = v.reason;
          div.appendChild(b);
        }
        // the going rate from WTS chat: is it worth carrying to a buyer?
        const pt = priceTag(d.item);
        if (pt && v.kind !== 'wish' && v.kind !== 'keep') {
          const ps = document.createElement('span');
          ps.className = 'v-badge';
          ps.style.cssText = 'background:rgba(255,215,102,.12);color:#ffd766';
          ps.textContent = pt;
          ps.title = 'Median asking price in WTS chat over the last 30 days — click the item for the full going rate';
          div.appendChild(ps);
        }
        const flag = document.createElement('span');
        flag.className = 'v-flag' + (itemVerdicts[verdictKey(d.item)] ? ' on' : '');
        flag.textContent = '⚑';
        flag.title = 'Flag this item: click cycles always-keep → junk → clear';
        flag.addEventListener('click', () => cycleItemVerdict(d.item));
        div.appendChild(flag);
        const m = document.createElement('span');
        m.className = 'mob';
        m.textContent = ' — ' + d.mob;
        div.appendChild(m);
        rec.appendChild(div);
      }
    }

    const mobsEl = $('l-mobs');
    mobsEl.innerHTML = '';
    const mobs = Object.values(lootDB.mobs || {})
      .filter(m => m.kills > 0) // stat-only tier entries don't belong in the drop list
      .sort((a, b) => b.kills - a.kills);
    $('l-empty').style.display = (mobs.length || recentDrops.length) ? 'none' : 'flex';

    for (const m of mobs.slice(0, 50)) {
      const row = document.createElement('div');
      row.className = 'l-mob';
      row.innerHTML = '<span></span><span class="k">' + m.kills + ' kill' + (m.kills === 1 ? '' : 's') +
        ' · ' + Object.keys(m.drops || {}).length + ' items ▾</span>';
      row.querySelector('span').textContent = m.name;
      row.addEventListener('click', () => {
        expandedMobs.has(m.name) ? expandedMobs.delete(m.name) : expandedMobs.add(m.name);
        renderLoot();
      });
      mobsEl.appendChild(row);

      if (expandedMobs.has(m.name)) {
        const items = Object.values(m.drops || {}).sort((a, b) => b.count - a.count);
        for (const it of items) {
          const div = document.createElement('div');
          div.className = 'l-item';
          const pct = m.kills ? (it.count / m.kills * 100) : 0;
          div.innerHTML = '<span class="itemlink"></span><span class="pct">' + it.count + '/' + m.kills +
            ' (' + (pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)) + '%)</span>';
          const a = div.querySelector('.itemlink');
          a.textContent = it.name;
          a.addEventListener('click', (e) => { e.stopPropagation(); openItemLink(it.name); });
          mobsEl.appendChild(div);
        }
        if (!items.length) {
          const div = document.createElement('div');
          div.className = 'l-item';
          div.textContent = 'no drops recorded';
          mobsEl.appendChild(div);
        }
      }
    }
  }

