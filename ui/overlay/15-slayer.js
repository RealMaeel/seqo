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
  const slyGroupOpen = { general: false, conquest: true, special: true, skill: false };
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
  // uncounted ones contribute 1, untouched uncounted ones 0
  function slyPct(a) {
    if (a.done) return 1;
    const objs = slyObjs(a);
    if (!objs.length) return 0;
    let got = 0;
    for (const o of objs) got += o.done ? 1 : (o.max ? Math.min(1, (o.cur || 0) / o.max) : 0);
    return got / objs.length;
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
    let anySec = false;
    for (const s of SLY_SECTIONS) {
      const sec = achSection(s.re);
      if (!sec) continue;
      anySec = true;
      const doneCount = sec.achievements.filter(a => a.done).length;
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

