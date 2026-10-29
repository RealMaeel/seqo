// SEQO overlay — Slayer achievements tab.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= 💀 Slayer achievements =================
  // Pure read-out of the achievements export: progress bars, closest-to-done
  // sorting, meta-chain click-through, and a 🧭 route read-out per target with
  // hunting spots and faction trade-offs (personalized against YOUR faction
  // file and race-unlock progress).
  const SLY = window.EQLSlayer;
  const slyExpanded = new Set();
  const slyGroupOpen = { closest: true, general: false, conquest: true, special: true, skill: false };
  let slySearch = '';   // 🔎 box text, kept across redraws (2.7.2)
  const slySearchOpen = new Set();   // search hits opened to show their objectives
  let slyScrollTo = null;

  const SLY_SECTIONS = [
    { key: 'general', title: '🏅 General — meta-achievements', re: /^Slayer: General$/i },
    { key: 'conquest', title: '⚔ Conquest — creature families', re: /^Slayer: Conquest$/i },
    { key: 'special', title: '🎯 Special — focused groups', re: /^Slayer: Special$/i },
    { key: 'skill', title: '🔪 Skill — one of everything', re: /^Slayer: Skill$/i }
  ];

  // real objectives (drop the "This achievement..." footnotes some carry)
  const slyObjs = (a) => a.objectives.filter(o => !/^This achievement/i.test(o.text));

  // completion fraction: counted objectives contribute cur/max, completed
  // uncounted ones contribute 1, untouched uncounted ones 0 (slayerfind.js)
  const slyPct = (a) => EQLSlayerFind.pct(a);

  // 🔎 "Do I still need to kill X?" — every achievement (any section, not just Slayer)
  // whose name or objectives mention the words, with a plain verdict on top (2.7.2)
  function renderSlySearch(box, data, q) {
    box.innerHTML = '';
    const word = String(q || '').trim();
    if (word.length < 2) return;
    const r = EQLSlayerFind.search(data, word, { live: achDoneLive });
    const v = document.createElement('div');
    v.className = 'q-npc';
    v.style.cssText = 'font-size:11.5px;font-weight:600;margin:2px 0;color:' +
      (r.verdict === 'needed' ? '#ffd766' : r.verdict === 'done' ? '#7c7' : '#aab');
    const needN = r.hits.filter(h => h.needed).length;
    v.textContent = r.verdict === 'needed' ? '⚔ Still needed — "' + word + '" counts toward ' + needN + ' unfinished achievement' + (needN === 1 ? '' : 's') + ':'
      : r.verdict === 'done' ? '✔ You can stop — every achievement that names "' + word + '" is done.'
      : 'No achievement names "' + word + '". Its kills can still count toward a family counter (Conquest / Special) — try the family, e.g. "dragons".';
    box.appendChild(v);
    for (const h of r.hits.slice(0, 30)) {
      const row = document.createElement('div');
      row.className = 'q-it' + (h.needed ? '' : ' have');
      row.innerHTML = '<span class="box"></span><span class="nm"></span><span class="loc"></span>';
      const what = h.objs.length ? h.objs.map(o => o.text + (o.max && !o.done ? ' ' + (o.cur || 0).toLocaleString() + '/' + o.max.toLocaleString() : '')).join(' · ') + ' — ' : '';
      row.querySelector('.nm').textContent = what + h.ach.name + (h.done ? ' (done)' : '');
      row.querySelector('.nm').style.whiteSpace = 'normal';
      row.querySelector('.loc').textContent = h.section;
      // click: the whole achievement — every objective with its progress — right here (any section)
      const k = h.section + '|' + h.ach.name;
      const open = slySearchOpen.has(k);
      row.querySelector('.box').textContent = (open ? '▾ ' : '▸ ') + (h.needed ? '☐' : '☑');
      row.style.cursor = 'pointer';
      row.title = open ? 'Hide the details' : 'Show every objective of ' + h.ach.name + ' and your progress';
      row.addEventListener('click', () => {
        open ? slySearchOpen.delete(k) : slySearchOpen.add(k);
        renderSlySearch(box, data, q);
      });
      box.appendChild(row);
      if (open) {
        const det = document.createElement('div');
        det.className = 'q-items';
        det.style.margin = '0 0 4px 18px';
        const all = EQLSlayerFind.objs(h.ach);
        const pct = EQLSlayerFind.pct(h.ach, achDoneLive);
        const sum = document.createElement('div');
        sum.className = 'q-npc';
        sum.innerHTML = unlBar(pct) + ' <span></span>';
        sum.querySelector('span').textContent = h.done ? 'DONE' : Math.floor(pct * 100) + '% — ' + all.filter(o => o.done).length + '/' + all.length + ' objectives';
        det.appendChild(sum);
        for (const o of all) {
          const r2 = document.createElement('div');
          r2.className = 'q-it' + (o.done ? ' have' : '');
          r2.innerHTML = '<span class="box">' + (o.done ? '☑' : '☐') + '</span><span class="nm"></span><span class="loc"></span>';
          r2.querySelector('.nm').textContent = o.text.replace(/^Complete the achievement "(.+)"$/, '$1');
          if (o.text.toLowerCase().includes(word.toLowerCase())) r2.querySelector('.nm').style.color = '#ffd766';
          if (o.max) r2.querySelector('.loc').innerHTML = unlBar((o.cur || 0) / o.max) + ' <span style="color:#9ab">' + (o.cur || 0).toLocaleString() + '/' + o.max.toLocaleString() + '</span>';
          det.appendChild(r2);
        }
        if (/^Slayer:/i.test(h.section)) {
          const j = document.createElement('div');
          j.className = 'q-npc';
          j.style.cssText = 'cursor:pointer;color:#7da7d9';
          j.textContent = '↓ open it in the list below (🧭 hunting spots)';
          j.addEventListener('click', () => slyFindAndExpand(h.ach.name));
          det.appendChild(j);
        }
        box.appendChild(det);
      }
    }
    if (r.hits.length > 30) { const m = document.createElement('div'); m.className = 'q-npc'; m.textContent = '… ' + (r.hits.length - 30) + ' more — type more of the name'; box.appendChild(m); }
    const ach = gameFiles && gameFiles.achievements;
    if (r.hits.length && ach && ach.mtime) {
      const age = document.createElement('div');
      age.className = 'q-npc';
      age.style.opacity = '.7';
      age.textContent = 'As of your achievements export from ' + fmtAge(ach.mtime) + ' — run /outputfile achievements after a hunt to refresh.';
      box.appendChild(age);
    }
  }

  function slyProgressText(a) {
    if (a.done) return 'DONE';
    const objs = slyObjs(a);
    const counted = objs.filter(o => o.max && !o.done);
    if (objs.length === 1 && counted.length === 1)
      return counted[0].cur.toLocaleString() + ' / ' + counted[0].max.toLocaleString();
    const done = objs.filter(o => o.done).length;
    return done + '/' + objs.length;
  }

  // family tokens out of an objective's text: "Ghouls, Ghosts, and Zombies."
  function slyTokens(text) {
    let t = String(text).replace(/\.$/, '');
    const clock = /^Clockwork:/i.test(t);
    if (clock) return ['clockwork'];
    return t.split(/,| and | of /i).map(s => s.trim().toLowerCase())
      .filter(s => s && !/^the playable races$/.test(s));
  }

  function slyFamily(tok) {
    const F = SLY.FAMILIES;
    if (F[tok]) return { name: tok, ...F[tok] };
    const sing = tok.replace(/ies$/, 'y').replace(/ves$/, 'f').replace(/e?s$/, '');
    for (const k of Object.keys(F)) {
      const ks = k.replace(/ies$/, 'y').replace(/ves$/, 'f').replace(/e?s$/, '');
      if (ks === sing) return { name: k, ...F[k] };
    }
    return null;
  }

  // faction requirements of a race's unlock achievement, straight from the export
  function slyRaceUnlockFactions(race) {
    const sec = achSection(/Untapped Potential: Race/i);
    if (!sec) return null;
    const ach = sec.achievements.find(a => a.name.toLowerCase() === ('race unlock - ' + race).toLowerCase());
    if (!ach) return null;
    const factions = [];
    for (const o of ach.objectives) {
      const m = /^Get maximum faction with (.+?)\.?$/.exec(o.text);
      if (m) factions.push(m[1]);
    }
    return { unlocked: ach.done, factions };
  }

  function openSlayerRoute(a, secKey) {
    const lines = [];
    const objs = slyObjs(a);
    lines.push(a.done ? '✅ COMPLETED' : 'Progress: ' + slyProgressText(a));
    lines.push('');
    for (const o of objs) {
      lines.push((o.done ? '☑ ' : '☐ ') + o.text +
        (o.max ? '  — ' + (o.cur || 0).toLocaleString() + ' / ' + o.max.toLocaleString() : ''));
    }
    const toks = [...new Set(objs.flatMap(o => slyTokens(o.text.replace(/^\(Optional\)\s*/, ''))))];
    const spots = [], warns = [], misses = [], races = [];
    for (const tok of toks) {
      if (/^complete the achievement/i.test(tok)) continue;
      const race = SLY.RACE_UNLOCKS[tok];
      if (race) { races.push({ tok, race }); continue; }
      const fam = slyFamily(tok);
      if (fam) {
        spots.push('• ' + tok + ' — ' + fam.spots.map(s => s.zone + (s.note ? ' (' + s.note + ')' : '')).join(' · '));
        for (const w of fam.warn || []) warns.push('⚠ ' + tok + ': ' + w.note);
      } else misses.push(tok);
    }
    if (spots.length || races.length) {
      lines.push('', '━ WHERE TO HUNT ━', '(suggestions from classic-era zones — Legends may differ)', '');
      lines.push(...spots);
      for (const { tok, race } of races) {
        const where = SLY.RACE_SPOTS[tok];
        if (where) lines.push('• ' + tok + ' — ' + where);
      }
    }
    if (races.length || warns.length) {
      lines.push('', '━ FACTION TRADE-OFFS ━', '');
      for (const { tok, race } of races) {
        const ru = slyRaceUnlockFactions(race);
        if (!ru || !ru.factions.length) {
          lines.push('⚠ ' + tok + ': killing their guards/citizens hits their home-city factions — check the mob page first.');
          continue;
        }
        lines.push('⚠ ' + tok + ' — kills typically TANK the factions the ' + race + ' race unlock needs:');
        for (const f of ru.factions) {
          const fi = factionInfo(f);
          let status = fi ? 'your standing ' + fi.value + ' / 2000' : 'no faction data';
          if (ru.unlocked) status += ' · unlock already DONE — safe for you';
          else if (fi && fi.value > 0) status += ' · ⚠ you have POSITIVE progress here — these kills undo your grind!';
          lines.push('   · ' + f + ' (' + status + ')');
        }
        if (!ru.unlocked) lines.push('   → if you ever want to unlock ' + race + ', hunt a different target.');
      }
      lines.push(...warns);
    }
    if (misses.length) lines.push('', 'No stored suggestions for: ' + misses.join(', ') + ' — their wiki pages list spawns.');
    lines.push('', '━ NOTES ━', '',
      '• Counts come from /outputfile achievements — run it again after a hunt to update.',
      '• Before settling into a camp, check the mob\'s faction hits on its wiki page.',
      '• Conquest counters keep counting after the achievement completes — overlap with Special/Skill targets where you can.');
    openGuide({ label: '💀 ' + a.name, localText: lines.join('\n'),
                credit: 'progress from your achievements export · suggestions are classic-era knowledge' });
  }

  function slyFindAndExpand(name) {
    const want = name.toLowerCase();
    for (const s of SLY_SECTIONS) {
      const sec = achSection(s.re);
      if (!sec) continue;
      const a = sec.achievements.find(x => x.name.toLowerCase() === want);
      if (a) {
        slyGroupOpen[s.key] = true;
        slyExpanded.add(s.key + '|' + a.name);
        slyScrollTo = s.key + '|' + a.name;
        renderQuests();
        return true;
      }
    }
    return false;
  }

  function renderSlayer() {
    const list = $('q-list');
    list.innerHTML = '';
    $('q-progress').textContent = '';
    const of = outfileBar(['achievements']);
    if (of) list.appendChild(of);
    if (!achSections().length) {
      setQuestEmpty('No achievements data yet.\n\nIn game, type  /outputfile achievements\nSEQO reads the file automatically — no clicks needed.');
      return;
    }
    setQuestEmpty('');
    const achData = { sections: achSections() };

    // 🔎 search box (2.7.2): kept in place while you type; a redraw keeps the focus
    const hadFocus = document.activeElement && document.activeElement.id === 'sly-search';
    const caret = hadFocus ? document.activeElement.selectionStart : null;
    const si = document.createElement('input');
    si.id = 'sly-search';
    si.type = 'search';
    si.placeholder = '🔎 Do I still need to kill…? Search a mob, zone or family (e.g. Vox)';
    si.value = slySearch;
    si.style.cssText = 'width:100%;box-sizing:border-box;background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;font-size:11px;padding:3px 6px;margin:2px 0';
    const sr = document.createElement('div');
    si.addEventListener('input', () => { slySearch = si.value; renderSlySearch(sr, achData, si.value); });
    list.appendChild(si);
    list.appendChild(sr);
    renderSlySearch(sr, achData, slySearch);
    if (hadFocus) { si.focus(); try { si.setSelectionRange(caret, caret); } catch { /* ok */ } }

    // 🎯 closest to done (2.7.2): the unfinished Slayer achievements nearest the finish line
    const near = EQLSlayerFind.closest(achData, { re: /^Slayer:/i, count: 8, live: achDoneLive });
    if (near.length) {
      qGroup(slyGroupOpen, 'closest');
      const ch = document.createElement('div');
      ch.className = 'l-divider';
      ch.style.cursor = 'pointer';
      ch.textContent = (slyGroupOpen.closest ? '▾ ' : '▸ ') + '🎯 Closest to done — work on these first';
      ch.title = 'Unfinished Slayer achievements, nearest the finish line first. Click one to open it below.';
      ch.addEventListener('click', () => { slyGroupOpen.closest = !slyGroupOpen.closest; renderQuests(); });
      list.appendChild(ch);
      if (slyGroupOpen.closest) for (const c of near) {
        const row = document.createElement('div');
        row.className = 'q-it';
        row.style.cursor = 'pointer';
        row.innerHTML = '<span class="box">' + Math.floor(c.pct * 100) + '%</span><span class="nm"></span><span class="loc"></span>';
        row.querySelector('.box').style.cssText = 'min-width:30px;color:#ffd766;font-size:10px';
        row.querySelector('.nm').textContent = c.ach.name + (c.left ? ' — left: ' + c.left : '');
        row.querySelector('.nm').style.whiteSpace = 'normal';
        row.querySelector('.loc').textContent = c.section.replace(/^Slayer:\s*/i, '');
        row.title = 'Open ' + c.ach.name;
        row.addEventListener('click', () => slyFindAndExpand(c.ach.name));
        list.appendChild(row);
      }
    }

    let anySec = false;
    for (const s of SLY_SECTIONS) {
      const sec = achSection(s.re);
      if (!sec) continue;
      anySec = true;
      const doneCount = sec.achievements.filter(a => a.done).length;
      qGroup(slyGroupOpen, s.key);
      const hdr = document.createElement('div');
      hdr.className = 'l-divider';
      hdr.style.cursor = 'pointer';
      hdr.textContent = (slyGroupOpen[s.key] ? '▾ ' : '▸ ') + s.title + ' — ' + doneCount + '/' + sec.achievements.length;
      hdr.addEventListener('click', () => { slyGroupOpen[s.key] = !slyGroupOpen[s.key]; renderQuests(); });
      list.appendChild(hdr);
      if (!slyGroupOpen[s.key]) continue;

      // closest-to-done first, completed last
      const achs = sec.achievements.slice().sort((a, b) => {
        if (a.done !== b.done) return a.done - b.done;
        return slyPct(b) - slyPct(a);
      });

      for (const a of achs) {
        const key = s.key + '|' + a.name;
        qCard(slyExpanded, key);
        const card = document.createElement('div');
        card.className = 'q-quest' + (a.done ? ' done' : '');
        const head = document.createElement('div');
        head.className = 'q-head';
        head.innerHTML = '<span>' + (slyExpanded.has(key) ? '▾' : '▸') + '</span><span class="rw"></span>' +
          (s.key !== 'general' && !a.done ? '<span class="gd" title="Route read-out: where to hunt these, and what the kills cost you in faction">🧭</span>' : '') +
          '<span class="bar"></span><span class="st"></span>';
        head.querySelector('.rw').textContent = a.name;
        head.querySelector('.bar').innerHTML = a.done ? '' : unlBar(slyPct(a));
        head.querySelector('.st').textContent = slyProgressText(a);
        const gd = head.querySelector('.gd');
        if (gd) {
          gd.style.cssText = 'cursor:pointer;opacity:.6;flex:none';
          gd.addEventListener('click', (ev) => { ev.stopPropagation(); openSlayerRoute(a, s.key); });
        }
        head.addEventListener('click', () => {
          slyExpanded.has(key) ? slyExpanded.delete(key) : slyExpanded.add(key);
          renderQuests();
        });
        card.appendChild(head);

        if (slyExpanded.has(key)) {
          const box = document.createElement('div');
          box.className = 'q-items';
          for (const o of slyObjs(a)) {
            const row = document.createElement('div');
            row.className = 'q-it' + (o.done ? ' have' : '');
            const chain = /^(?:\(Optional\)\s*)?Complete the achievement "(.+)"$/.exec(o.text);
            const optional = /^\(Optional\)/.test(o.text);
            row.innerHTML = '<span class="box">' + (o.done ? '☑' : '☐') + '</span><span class="nm"></span><span class="loc"></span>';
            if (chain) {
              row.querySelector('.nm').textContent = (optional ? '(optional) ' : '') + chain[1];
              row.querySelector('.nm').style.textDecoration = 'underline dotted';
              row.style.cursor = 'pointer';
              row.title = 'Click to jump to this achievement';
              row.addEventListener('click', (ev) => { ev.stopPropagation(); slyFindAndExpand(chain[1]); });
            } else {
              row.querySelector('.nm').textContent = o.text;
              if (o.max) row.querySelector('.loc').innerHTML =
                unlBar((o.cur || 0) / o.max) + ' <span style="color:#9ab">' + (o.cur || 0).toLocaleString() + '/' + o.max.toLocaleString() + '</span>';
            }
            if (optional) row.style.opacity = '.65';
            box.appendChild(row);
          }
          card.appendChild(box);
        }
        card.dataset.slykey = key;
        list.appendChild(card);
      }
    }
    if (!anySec) setQuestEmpty('Your achievements export has no Slayer sections —\nrun /outputfile achievements in game and this view fills in.');
    if (SLY.CREDITS && SLY.CREDITS[0]) list.appendChild(creditLine({ note: SLY.CREDITS[0].label, url: SLY.CREDITS[0].url }));
    if (slyScrollTo) {
      const el = list.querySelector('[data-slykey="' + CSS.escape(slyScrollTo) + '"]');
      if (el) { el.scrollIntoView({ block: 'center' }); scrollOverride = true; }
      slyScrollTo = null;
    }
  }

