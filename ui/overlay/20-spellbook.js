// SEQO overlay — Spellbook: what you haven't scribed yet.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= 📕 Spellbook: what you haven't scribed yet =================
  // your /outputfile spellbook vs every spell your classes learn by your level
  // (from the game's own spell file), kept to spells eqlwiki has a page for —
  // the client also carries live-EQ spells that don't exist in Legends.
  let bookWiki = null, bookWikiBusy = false, bookWikiErr = null, bookShowUnverified = false, bookCls = null;
  function bookCandidates(cls, maxLv) {
    if (!spellDB || !spellDB.book) return [];
    const nil = new Set(spellDB.notInLegends || []);
    const have = (gameFiles && gameFiles.spellbook && gameFiles.spellbook.spells) || {};
    const out = [];
    for (const [n, c] of Object.entries(spellDB.book)) {
      const lv = c[cls];
      if (!lv || lv > maxLv || have[n] !== undefined || nil.has(n)) continue;
      out.push({ n, lv });
    }
    return out.sort((a, b) => a.lv - b.lv || a.n.localeCompare(b.n));
  }
  async function bookVerify(names) {
    if (bookWikiBusy) return;
    bookWikiBusy = true;
    try {
      const r = await window.overlay.spellWikiCheck(names);
      bookWiki = Object.assign(bookWiki || {}, (r && r.pages) || {});
      bookWikiErr = r && r.error || null;
    } catch (e) { bookWikiErr = e.message || String(e); }
    bookWikiBusy = false;
    if (activeTab === 'class' && clChip() === 'book') renderClassTab();
  }
  function renderSpellbookChip(root) {
    const sb = gameFiles && gameFiles.spellbook;
    const trio = (currentTrio() || []).filter(Boolean);
    if (!bookCls || !TRIO_CLASSES.includes(bookCls)) bookCls = trio[0] || 'WAR';
    const lvl = myLevel();
    // export status + copy chip
    const st = document.createElement('div');
    st.className = 'q-npc';
    st.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
    const stT = document.createElement('span');
    stT.textContent = sb ? '📕 Your spellbook: ' + Object.keys(sb.spells || {}).length + ' spells, exported ' + fmtAge(sb.mtime) : '📕 No spellbook export yet.';
    const chip = document.createElement('span');
    chip.className = 'ofchip';
    chip.textContent = '📋 /outputfile spellbook';
    chip.title = 'Copy the command, paste it in game after you scribe new spells — SEQO picks the file up by itself';
    chip.addEventListener('click', () => { window.overlay.copyText('/outputfile spellbook'); toast('📋 Copied /outputfile spellbook — paste it in game'); });
    st.append(stT, chip);
    root.appendChild(st);
    if (!spellDB) { const d = document.createElement('div'); d.className = 'q-npc'; d.textContent = spellDbError ? '⚠ ' + spellDbError : 'Reading the game\'s spell files…'; root.appendChild(d); return; }
    if (!sb) return;
    // class picker: your trio first, then every class (the book holds all of them)
    const cb = document.createElement('div');
    cb.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;margin:4px 0';
    const order = [...new Set([...trio, ...TRIO_CLASSES])];
    for (const c of order) {
      const k = document.createElement('span');
      k.className = 'qview-chip' + (c === bookCls ? ' active' : '');
      k.style.fontSize = '10px';
      k.textContent = c;
      if (!trio.includes(c)) k.style.opacity = '.6';
      k.addEventListener('click', () => { bookCls = c; renderClassTab(); });
      cb.appendChild(k);
    }
    root.appendChild(cb);
    const cand = bookCandidates(bookCls, lvl);
    const unknown = cand.filter(x => !bookWiki || bookWiki[x.n] === undefined).map(x => x.n);
    if (unknown.length && !bookWikiBusy && !bookWikiErr) bookVerify(cand.map(x => x.n));
    const verified = cand.filter(x => bookWiki && bookWiki[x.n] === true);
    const unver = cand.filter(x => !bookWiki || bookWiki[x.n] !== true);
    const hdr = document.createElement('div');
    hdr.className = 'l-divider';
    hdr.textContent = '📕 MISSING — ' + bookCls + ' spells up to level ' + lvl + ': ' + verified.length + (bookWikiBusy ? ' (checking the wiki…)' : '');
    hdr.title = 'Spells your ' + bookCls + ' learns by level ' + lvl + ' (game spell file) that are not in your spellbook export, and that eqlwiki documents for Legends.';
    root.appendChild(hdr);
    if (bookWikiErr) { const d = document.createElement('div'); d.className = 'q-npc'; d.textContent = '⚠ Wiki check failed (' + bookWikiErr + ') — showing every candidate, unverified.'; root.appendChild(d); }
    const quests = new Map();
    for (const q of (SPQ && SPQ.QUESTS) || []) quests.set(q.spell, q);
    const row = (x, dim) => {
      const d = document.createElement('div');
      d.className = 'q-it';
      d.style.cursor = 'pointer';
      if (dim) d.style.opacity = '.55';
      d.innerHTML = '<span class="box">L' + x.lv + '</span><span class="nm itemlink"></span><span class="loc" style="flex:none"></span>';
      d.querySelector('.box').style.width = '26px';
      d.querySelector('.nm').textContent = x.n;
      const q = quests.get(x.n);
      d.querySelector('.loc').textContent = q ? '📜 quest: ' + q.name : '';
      d.title = (q ? 'Quest spell — see Quests → 🧙 Spells. ' : '') + 'Click to look the spell up (where to buy, drop or quest it).';
      d.addEventListener('click', () => { try { openItem('Spell: ' + x.n); } catch { toast('Lookup unavailable'); } });
      root.appendChild(d);
    };
    if (!verified.length && !bookWikiBusy && !bookWikiErr) {
      const d = document.createElement('div'); d.className = 'q-npc';
      d.textContent = cand.length ? '✔ Nothing missing that the wiki knows of for ' + bookCls + ' — nice.' : '✔ Every ' + bookCls + ' spell up to level ' + lvl + ' is in your book.';
      root.appendChild(d);
    }
    for (const x of (bookWikiErr ? cand : verified)) row(x, false);
    if (!bookWikiErr && unver.length && !bookWikiBusy) {
      const t = document.createElement('div');
      t.className = 'q-npc';
      t.style.cursor = 'pointer';
      t.textContent = (bookShowUnverified ? '▾ ' : '▸ ') + unver.length + ' more in the game files but not on the wiki (likely not in Legends yet)';
      t.addEventListener('click', () => { bookShowUnverified = !bookShowUnverified; renderClassTab(); });
      root.appendChild(t);
      if (bookShowUnverified) for (const x of unver) row(x, true);
    }
  }

