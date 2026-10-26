// SEQO overlay — optional class spell quests.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= 🧙 optional class spell quests =================
  const SPQ = window.EQLSpellQuests;
  let spellQuestState = {};   // key -> { sel, done, items: {name: true} }
  const spqExpanded = new Set();
  window.overlay.getSpellQuests().then((d) => { spellQuestState = d || {}; if (activeTab === 'quests') renderQuests(); });

  const spqState = (key) => spellQuestState[key] || { sel: false, done: false, items: {} };
  function spqSave(key, st) {
    if (st.sel || st.done || Object.keys(st.items || {}).length) spellQuestState[key] = st;
    else delete spellQuestState[key];
    window.overlay.setSpellQuest(key, st);
    needsDirty = true;
  }
  // "do I have it": manual check, exact inventory name, or live loot
  function spqHave(st, it) {
    if (st.items[it.name]) return true;
    if (it.kind === 'drop' || it.kind === 'ground') return invHas(it.name);
    return false;
  }
  // fuzzy count for grouped collectibles ("Old Silver Coin (Azia)" → base name)
  function invCountContains(sub) {
    const inv = gameFiles && gameFiles.inventory;
    if (!inv) return 0;
    const s = sub.toLowerCase();
    let n = 0;
    for (const [k, it] of Object.entries(inv.items || {})) if (k.includes(s)) n += it.count || 1;
    for (const [k, c] of lootedLive) if (k.includes(s)) n += c;
    return n;
  }
  const spqBase = (name) => name.replace(/\s*\([^)]*\)\s*$/, '');
  const zoneEq = (a, b) => String(a || '').toLowerCase().replace(/^the /, '') === String(b || '').toLowerCase().replace(/^the /, '');

  // selected quests' uncollected hunted pieces in THIS zone → needs rows
  function spellQuestNeeds(zone) {
    const rows = [];
    if (!SPQ) return rows;
    for (const q of SPQ.QUESTS) {
      const st = spqState(q.key);
      if (!st.sel || st.done) continue;
      for (const it of q.items) {
        if (it.kind !== 'drop' && it.kind !== 'ground') continue;
        if (!it.zone || !zoneEq(it.zone, zone)) continue;
        if (spqHave(st, it)) continue;
        rows.push({ g: 'spellq', item: it.name, mobs: [it.mob || it.where || 'ground spawn'],
                    reason: q.spell + ' (' + q.cls + ') — ' + q.name });
      }
    }
    return rows;
  }

  function renderSpellQuests() {
    const list = $('q-list');
    list.innerHTML = '';
    $('q-progress').textContent = '';
    const of = outfileBar(['inventory']);
    if (of) list.appendChild(of);
    setQuestEmpty('');
    const intro = document.createElement('div');
    intro.className = 'q-npc';
    intro.textContent = '⭐ Track a quest and its hunted pieces join the zone-needs list. Checkmarks fill from your inventory and live loot; click any box by hand too.';
    list.appendChild(intro);
    const selFirst = SPQ.QUESTS.slice().sort((a, b) => {
      const sa = spqState(a.key), sb = spqState(b.key);
      return (sb.sel - sa.sel) || (sa.done - sb.done) || a.cls.localeCompare(b.cls);
    });
    for (const q of selFirst) {
      const st = spqState(q.key);
      const hunted = q.items.filter(it => it.kind === 'drop' || it.kind === 'ground');
      const got = q.items.filter(it => spqHave(st, it)).length;
      const card = document.createElement('div');
      card.className = 'q-quest' + (st.done ? ' done' : '');
      const head = document.createElement('div');
      head.className = 'q-head';
      head.innerHTML = '<span>' + (spqExpanded.has(q.key) ? '▾' : '▸') + '</span>' +
        '<span class="trk" title="Track this quest — its pieces feed the zone-needs list"></span>' +
        '<span class="rw"></span><span class="cls"></span><span class="st"></span>' +
        '<span class="q-donebtn" title="Mark the quest finished / unfinished">✓</span>';
      head.querySelector('.trk').textContent = st.sel ? '⭐' : '☆';
      head.querySelector('.trk').style.cssText = 'cursor:pointer;flex:none;color:' + (st.sel ? '#ffd766' : '#667');
      head.querySelector('.rw').textContent = q.spell + ' — ' + q.name;
      head.querySelector('.cls').textContent = q.cls + ' L' + q.spellLv;
      head.querySelector('.st').textContent = st.done ? 'DONE' : got + '/' + q.items.length;
      head.querySelector('.trk').addEventListener('click', (e) => {
        e.stopPropagation();
        spqSave(q.key, { ...st, sel: !st.sel });
        renderQuests();
        toast(st.sel ? '☆ ' + q.spell + ' untracked' : '⭐ Tracking ' + q.spell + ' — zone needs will flag its pieces');
      });
      head.querySelector('.q-donebtn').addEventListener('click', (e) => {
        e.stopPropagation();
        spqSave(q.key, { ...st, done: !st.done });
        renderQuests();
      });
      head.addEventListener('click', () => {
        spqExpanded.has(q.key) ? spqExpanded.delete(q.key) : spqExpanded.add(q.key);
        renderQuests();
      });
      card.appendChild(head);

      if (spqExpanded.has(q.key)) {
        const npc = document.createElement('div');
        npc.className = 'q-npc';
        npc.textContent = 'Starts: ' + q.npc + ' · quest from L' + q.startLv + ', spell usable at L' + q.spellLv;
        card.appendChild(npc);
        if (q.clicky) {
          const ck = document.createElement('div');
          ck.className = 'q-npc';
          ck.textContent = '💠 ' + q.clicky;
          card.appendChild(ck);
        }
        const box = document.createElement('div');
        box.className = 'q-items';
        // grouped collectibles get one live count line ("you hold 3 matching 'Rod'")
        const bases = new Map();
        for (const it of hunted) {
          const b = spqBase(it.name);
          if (b !== it.name) bases.set(b, (bases.get(b) || 0) + 1);
        }
        for (const [b, totalOfBase] of bases) {
          const n = invCountContains(b.toLowerCase());
          if (n > 0) {
            const line = document.createElement('div');
            line.className = 'q-npc';
            line.textContent = '📦 Your inventory holds ' + n + ' item' + (n === 1 ? '' : 's') + ' matching "' + b + '" (of ' + totalOfBase + ' needed) — tick off which spots you\'ve done below.';
            box.appendChild(line);
            break; // one summary line per quest is enough
          }
        }
        for (const it of q.items) {
          const row = document.createElement('div');
          const have = spqHave(st, it);
          row.className = 'q-it' + (have ? ' have' : '');
          row.innerHTML = '<span class="box">' + (have ? '☑' : '☐') + '</span><span class="nm itemlink"></span><span class="loc"></span>';
          row.querySelector('.nm').textContent = it.name + (it.count ? ' ×' + it.count : '');
          row.querySelector('.loc').textContent = (it.zone ? it.zone + ' — ' : '') + (it.mob || it.where || it.kind);
          row.title = 'Click ☐ to check off by hand · click the name for item details';
          row.querySelector('.nm').addEventListener('click', (e) => {
            e.stopPropagation();
            if (it.kind === 'drop' || it.kind === 'ground') openItemLink(it.name);
          });
          row.addEventListener('click', () => {
            const s = spqState(q.key);
            const items = { ...s.items };
            if (items[it.name]) delete items[it.name]; else items[it.name] = true;
            spqSave(q.key, { ...s, items });
            renderQuests();
          });
          box.appendChild(row);
        }
        card.appendChild(box);
        const stepsHd = document.createElement('div');
        stepsHd.className = 'q-npc';
        stepsHd.style.marginTop = '3px';
        stepsHd.textContent = '🗺 Route:';
        card.appendChild(stepsHd);
        const ol = document.createElement('div');
        ol.className = 'q-items';
        q.steps.forEach((s, i) => {
          const r = document.createElement('div');
          r.className = 'q-it';
          r.style.cursor = 'default';
          r.innerHTML = '<span class="box"></span><span class="nm" style="white-space:normal"></span>';
          r.querySelector('.box').textContent = (i + 1) + '.';
          r.querySelector('.nm').textContent = s;
          ol.appendChild(r);
        });
        card.appendChild(ol);
      }
      list.appendChild(card);
    }
    if (SPQ.CREDITS && SPQ.CREDITS[0]) list.appendChild(creditLine(SPQ.CREDITS[0]));
  }

  function renderUnlocks() {
    const list = $('q-list');
    list.innerHTML = '';
    $('q-progress').textContent = '';
    const sbU = staleBanner('Race unlock guide');
    if (sbU) list.appendChild(sbU);
    // unlocks read all three exports: status, progress bars AND rep counters
    const ofU = outfileBar(['achievements', 'factions', 'inventory']);
    if (ofU) list.appendChild(ofU);
    if (!achSections().length) {
      // the key quests still render without data, so the hint goes inline
      // instead of the full-height empty panel (which squeezed the Keys card)
      setQuestEmpty('');
      const hint = document.createElement('div');
      hint.style.cssText = 'color:#aaa;font-size:11px;margin:2px 0 8px';
      hint.textContent = 'No achievements data yet — in game type /outputfile achievements (and /outputfile faction for progress bars). SEQO reads them automatically.';
      list.appendChild(hint);
      renderKeyQuests(list, null);
      list.appendChild(creditLine(UNL.CREDITS[0]));
      return;
    }
    setQuestEmpty('');
    renderKeyQuests(list, achSection(/^General: Keys$/i));

    const groups = [
      { key: 'races', title: '🧬 Races', re: /Untapped Potential: Race/i, strip: /^Race Unlock - /i },
      { key: 'classes', title: '⚔ Classes', re: /Untapped Potential: Class/i, strip: /^Primary Class Unlock - /i },
      { key: 'deity', title: '🕯 Deities', re: /Untapped Potential: Deity/i, strip: /^Deity Unlock - /i }
    ];

    for (const g of groups) {
      const sec = achSection(g.re);
      if (!sec) continue;
      const realObjs = (a) => a.objectives.filter(o => !/^This achievement/i.test(o.text));
      // a placeholder race (achievement completes, race not playable yet) isn't counted as unlocked
      const isPlaceholder = (a) => g.key === 'races' && UNL.RACE_QUESTS &&
        (UNL.RACE_QUESTS[a.name.replace(g.strip, '')] || {}).placeholder;
      const doneCount = sec.achievements.filter(a => (a.done || achDoneLive.has(a.name)) && !isPlaceholder(a)).length;

      const hdr = document.createElement('div');
      hdr.className = 'l-divider';
      hdr.style.cursor = 'pointer';
      hdr.textContent = (unlGroupOpen[g.key] ? '▾ ' : '▸ ') + g.title + ' — ' + doneCount + '/' + sec.achievements.length + ' unlocked';
      hdr.addEventListener('click', () => { unlGroupOpen[g.key] = !unlGroupOpen[g.key]; renderQuests(); });
      list.appendChild(hdr);
      if (!unlGroupOpen[g.key]) continue;

      for (const ach of sec.achievements) {
        const label = ach.name.replace(g.strip, '');
        const rq = g.key === 'races' && UNL.RACE_QUESTS ? UNL.RACE_QUESTS[label] : null;
        // a quest-chain race shows its walkthrough instead of the export's placeholder objective
        const objs = realObjs(ach).filter(o => !(rq && /^Future Placeholder/i.test(o.text)));
        const achDone = !!(ach.done || achDoneLive.has(ach.name));   // live: the log line beats the next export
        const got = objs.filter(o => o.done).length;
        const key = g.key + '|' + ach.name;

        const card = document.createElement('div');
        card.className = 'q-quest' + (achDone ? ' done' : '');
        const head = document.createElement('div');
        head.className = 'q-head';
        head.innerHTML = '<span>' + (unlExpanded.has(key) ? '▾' : '▸') + '</span><span class="rw"></span><span class="gd" title="Read the guide for this unlock here, in the attached window">📖</span><span class="st"></span>';
        head.querySelector('.rw').textContent = label;
        head.querySelector('.st').textContent = achDone ? (rq && rq.placeholder ? 'DONE · race not live yet' : 'UNLOCKED') : rq ? 'guide' : (objs.length ? got + '/' + objs.length : '');
        if (rq && rq.placeholder) head.querySelector('.st').title = rq.placeholder;
        const gd = head.querySelector('.gd');
        gd.style.cssText = 'cursor:pointer;opacity:.55;flex:none';
        if (g.key === 'races') {
          gd.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openGuide({ title: GUIDE_TITLE, anchor: label, label: label + ' unlock' });
          });
        } else if (g.key === 'deity') {
          gd.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openGuide({ title: label, label: label + ' unlock',
                        fallback: { title: GUIDE_TITLE, label: 'Race Unlock Guide' } });
          });
        } else {
          gd.style.display = 'none'; // class unlocks jump to their PoS quests instead
        }
        head.addEventListener('click', () => {
          unlExpanded.has(key) ? unlExpanded.delete(key) : unlExpanded.add(key);
          renderQuests();
        });
        card.appendChild(head);

        if (unlExpanded.has(key)) {
          const box = document.createElement('div');
          box.className = 'q-items';
          for (const o of objs) {
            const row = document.createElement('div');
            row.className = 'q-it' + (o.done ? ' have' : '');
            const fm = /^Get maximum faction with (.+?)\.?$/.exec(o.text);
            const om = /^Obtain (.+?)\.?$/.exec(o.text);
            if (fm) {
              const fname = fm[1];
              const fi = factionInfo(fname);
              const pct = o.done ? 1 : fi ? (fi.toMax != null ? (2000 - fi.toMax) / 2000 : (fi.value + 2000) / 4000) : 0;
              row.innerHTML = '<span class="box">' + (o.done ? '☑' : '☐') + '</span><span class="nm"></span>' +
                unlBar(pct) + '<span class="fgd" title="Read this faction’s wiki page here">📖</span><span class="loc"></span>';
              row.querySelector('.nm').textContent = fname;
              row.querySelector('.loc').textContent = o.done ? 'MAX' : fi ? (fi.value + ' / 2000') : 'no faction data';
              const fgd = row.querySelector('.fgd');
              fgd.style.cssText = 'cursor:pointer;opacity:.55;flex:none;font-size:10px';
              fgd.addEventListener('click', (ev) => {
                ev.stopPropagation();
                openGuide({ title: fname, label: fname,
                            fallback: { title: GUIDE_TITLE, anchor: label, label: label + ' unlock' } });
              });
              const gh = grindHintFor(fname);
              if (gh) row.title = gh + '  (route courtesy of Alanna — eqlwiki.com)';
            } else if (om && g.key === 'classes') {
              row.innerHTML = '<span class="box">' + (o.done ? '☑' : '☐') + '</span><span class="nm itemlink"></span><span class="loc">→ PoS quest</span>';
              row.querySelector('.nm').textContent = om[1];
              row.title = 'Click to open this reward\'s Plane of Sky quest';
              row.addEventListener('click', () => selectPosQuest(om[1]));
            } else {
              row.innerHTML = '<span class="box">' + (o.done ? '☑' : '☐') + '</span><span class="nm"></span>';
              row.querySelector('.nm').textContent = o.text;
            }
            box.appendChild(row);
          }
          const noteTxt = g.key === 'races' ? UNL.RACE_NOTES[label]
            : g.key === 'deity' ? (UNL.DEITY_NOTES[label] || UNL.DEITY_NOTES['*']) : null;
          if (noteTxt) {
            const note = document.createElement('div');
            note.className = 'q-npc';
            note.textContent = noteTxt;
            box.appendChild(note);
          }
          if (rq) {   // quest-chain race: numbered steps, ticked from the items you hold
            const held = rq.steps.map(st => !!(st.item && invHas(st.item)));
            const lastHeld = held.lastIndexOf(true);
            rq.steps.forEach((st, i) => {
              const ok = achDone || i <= lastHeld;   // holding a later step's item means the earlier ones are done
              const row = document.createElement('div');
              row.className = 'q-it' + (ok ? ' have' : '');
              row.style.cursor = 'default';
              row.innerHTML = '<span class="box"></span><span class="nm" style="white-space:normal"></span><span class="loc" style="flex:none;max-width:34%;text-align:right"></span>';
              row.querySelector('.box').textContent = ok ? '☑' : '☐';
              row.querySelector('.nm').textContent = (i + 1) + '. ' + st.text;
              row.querySelector('.loc').textContent = st.zone || '';
              if (st.item) row.title = 'Ticks when ' + st.item + ' is in your bags';
              box.appendChild(row);
            });
            if (rq.placeholder) {
              const ph = document.createElement('div');
              ph.className = 'q-npc';
              ph.style.color = '#ffcf7d';
              ph.textContent = '⚠ ' + rq.placeholder;
              box.appendChild(ph);
            }
            const src = document.createElement('div');
            src.className = 'q-npc';
            src.style.fontSize = '10px';
            src.textContent = 'Tasks: ' + rq.tasks.join(' → ') + '. Source: ' + rq.source + '.';
            box.appendChild(src);
          }
          if (g.key === 'races') {
            const grindItems = new Set();
            // rep-item counters for one route (or the single grind): held vs total
            const addCounters = (needs, fname) => {
              const entries = Object.entries(needs || {});
              if (!entries.length) return;
              const cw = document.createElement('div');
              cw.className = 'q-npc q-counters';
              const fi = factionInfo(fname);
              for (const [item, total] of entries) {
                const have = invCount(item);
                // partial faction credit counts: at your CURRENT standing the
                // remaining turn-ins are a fraction of the full-grind total
                const left = fi && fi.toMax != null ? Math.ceil(total * fi.toMax / 2000) : null;
                const enough = left != null ? have >= left : have >= total;
                const sp = document.createElement('span');
                sp.style.cssText = 'margin-right:12px;color:' + (enough ? '#7dffa0' : '#9ab');
                sp.textContent = '📦 ' + item + ' ' + have + ' / ' + total +
                  (left == null ? ''
                    : left <= 0 ? ' · faction MAXED'
                    : ' · ~' + left + ' more at your standing' + (have >= left ? ' — you hold enough ✓' : ''));
                sp.title = (left != null
                  ? 'Full grind from scratch takes ' + total + '. Your current faction standing already covers part of it, so about ' + Math.max(0, left) + ' more turn-ins finish it. You hold ' + have + '.'
                  : 'Total for the full grind per Alanna’s guide (no faction file yet — run /outputfile faction for the remaining-count). The held count comes from your inventory file plus live loot.');
                cw.appendChild(sp);
              }
              box.appendChild(cw);
            };
            for (const o of objs) {
              const fm = /^Get maximum faction with (.+?)\.?$/.exec(o.text);
              const gd = fm && grindData(fm[1]);
              if (gd && (gd.hint || gd.routes) && !o.done) {
                if (gd.routes && gd.routes.length > 1) {
                  // the guide gives real alternatives: labeled options, each
                  // with its own route text and its own counters
                  gd.routes.forEach((rt, i) => {
                    const hint = document.createElement('div');
                    hint.className = 'q-npc q-route';
                    const tag = rt.tag === 'evil' ? ' 🌙 evil races' : rt.tag === 'good' ? ' 🌞 good races' : '';
                    hint.textContent = '🧭 Option ' + String.fromCharCode(65 + i) + ' — ' + rt.label + tag + ': ' + rt.hint;
                    box.appendChild(hint);
                    addCounters(rt.needs, fm[1]);
                  });
                } else {
                  const hint = document.createElement('div');
                  hint.className = 'q-npc';
                  hint.textContent = '🧭 ' + fm[1] + ': ' + gd.hint;
                  box.appendChild(hint);
                  addCounters(gd.needs, fm[1]);
                }
                const gr = UNL.FACTION_GRINDS[fm[1]];
                if (gr) for (const it of gr.items) grindItems.add(it);
                break; // grinds overlap within a city — one hint per race is enough
              }
            }
            if (grindItems.size) {
              const keep = document.createElement('div');
              keep.className = 'q-npc';
              keep.textContent = '⭐ Keep when looted: ' + [...grindItems].join(', ');
              box.appendChild(keep);
            }
          }
          card.appendChild(box);
        }
        list.appendChild(card);
      }
    }
    const bypass = document.createElement('div');
    bypass.style.cssText = 'color:#777;font-size:9.5px;margin-top:6px';
    bypass.textContent = 'Every unlock can also be bypassed with the matching Unlock Token from the store.';
    list.appendChild(bypass);
    list.appendChild(creditLine(UNL.CREDITS[0]));
  }

  // ---------- 🔑 Keys group (Unlocks view) ----------
  // Structure from the game's "General: Keys" achievements; walkthroughs for
  // the ones SEQO knows from unlocks.js KEY_QUESTS. Known walkthroughs show
  // even without an export, so new players can find them.
  function renderKeyQuests(list, sec) {
    const KQ = UNL.KEY_QUESTS || {};
    const achs = sec ? sec.achievements.slice() : [];
    for (const name of Object.keys(KQ))
      if (!achs.some(a => a.name === name)) achs.push({ name, done: false, objectives: [], unknown: !KQ[name].keyItem });
    if (!achs.length) return;
    const isDone = (a) => !!(a.done || achDoneLive.has(a.name) ||
      (KQ[a.name] && KQ[a.name].keyItem && invHas(KQ[a.name].keyItem)));
    // walkthroughs first, then the ones still to do
    achs.sort((a, b) => (!!KQ[b.name] - !!KQ[a.name]) || (isDone(a) - isDone(b)));
    if (!keyAutoOpened) {           // open an unfinished walkthrough once, so it's seen
      keyAutoOpened = true;
      for (const a of achs) if (KQ[a.name] && !isDone(a)) unlExpanded.add('keys|' + a.name);
    }

    const hdr = document.createElement('div');
    hdr.className = 'l-divider';
    hdr.style.cursor = 'pointer';
    const doneN = achs.filter(isDone).length;
    hdr.textContent = (unlGroupOpen.keys ? '▾ ' : '▸ ') + '🔑 Keys' + (sec ? ' — ' + doneN + '/' + achs.length + ' done' : '');
    hdr.addEventListener('click', () => { unlGroupOpen.keys = !unlGroupOpen.keys; renderQuests(); });
    list.appendChild(hdr);
    if (!unlGroupOpen.keys) return;

    for (const ach of achs) {
      const kq = KQ[ach.name];
      const done = isDone(ach);
      const key = 'keys|' + ach.name;
      const card = document.createElement('div');
      card.className = 'q-quest' + (done ? ' done' : '');
      const head = document.createElement('div');
      head.className = 'q-head';
      head.innerHTML = '<span>' + (unlExpanded.has(key) ? '▾' : '▸') + '</span><span class="rw"></span><span class="st"></span>';
      head.querySelector('.rw').textContent = ach.name + (kq ? ' — opens ' + kq.opens : '');
      const held = kq ? kq.steps.filter(st => st.item && invHas(st.item)).length : 0;
      head.querySelector('.st').textContent = done ? 'DONE' : ach.unknown && !sec ? '' : kq ? 'guide' : '';
      head.addEventListener('click', () => {
        unlExpanded.has(key) ? unlExpanded.delete(key) : unlExpanded.add(key);
        renderQuests();
      });
      card.appendChild(head);

      if (unlExpanded.has(key)) {
        const box = document.createElement('div');
        box.className = 'q-items';
        if (kq) {
          const meta = document.createElement('div');
          meta.className = 'q-npc';
          meta.textContent = '📜 Task “' + kq.task + '” from ' + kq.giver + ' in ' + kq.zone + '.' +
            (done ? '' : kq.keyItem ? '  Done once you have the key (bags or key ring).'
              : ach.unknown && !sec ? '  (Run /outputfile achievements to see whether you have it.)' : '');
          box.appendChild(meta);
          // the chain is sequential: holding a later step's item means every
          // step before it is already behind you
          let reached = -1;
          kq.steps.forEach((st, i) => { if (st.item && invHas(st.item)) reached = i; });
          kq.steps.forEach((st, i) => {
            const have = done || i <= reached;
            const row = document.createElement('div');
            row.className = 'q-it' + (have ? ' have' : '');
            row.innerHTML = '<span class="box">' + (have ? '☑' : '☐') + '</span><span class="nm"></span><span class="loc"></span>';
            row.querySelector('.nm').textContent = (i + 1) + '. ' + st.text + (st.unverified ? ' (player reports — unverified)' : '');
            row.querySelector('.loc').textContent = st.zone || '';
            row.style.whiteSpace = 'normal';
            if (st.item) row.title = invHas(st.item) && !done ? 'You hold ' + st.item : 'Item for this step: ' + st.item;
            box.appendChild(row);
          });
          if (!done && held) {
            const h = document.createElement('div');
            h.className = 'q-npc';
            h.textContent = '🎒 You hold ' + held + ' of the quest items right now.';
            box.appendChild(h);
          }
          if (kq.source) {
            const src = document.createElement('div');
            src.style.cssText = 'color:#777;font-size:9.5px;margin-top:3px';
            src.textContent = 'Route: ' + kq.source + '.';
            box.appendChild(src);
          }
        } else {
          // no walkthrough yet: the game's own objective text
          for (const o of ach.objectives.filter(o => !/^This achievement/i.test(o.text))) {
            const row = document.createElement('div');
            row.className = 'q-it' + (o.done || done ? ' have' : '');
            row.innerHTML = '<span class="box">' + (o.done || done ? '☑' : '☐') + '</span><span class="nm"></span>';
            row.querySelector('.nm').textContent = o.text;
            box.appendChild(row);
          }
        }
        card.appendChild(box);
      }
      list.appendChild(card);
    }
  }

  function selectPosQuest(reward) {
    const q = POS.quests.find(x => x.reward.toLowerCase() === reward.toLowerCase());
    setQuestView('');
    $('q-zone').value = 'Plane of Sky';
    if (q) {
      qExpanded.add(q.reward);
      // make sure the quest's class chip is on so the card is visible
      const sel = qSelClasses();
      if (!sel.includes(q.cls)) {
        settings.posClasses = [...sel, q.cls];
        save({ posClasses: settings.posClasses });
        renderQuestClasses();
      }
    }
    renderQuests();
  }

  // ---------- ⚔ Epics (prep) view ----------
  function renderEpics() {
    const list = $('q-list');
    list.innerHTML = '';
    const sel = qSelClasses();
    setQuestEmpty(sel.length ? '' : 'Pick your class(es) above to see what epic 1.0\npieces you can pre-farm in the old world.');
    if (!sel.length) return;

    const banner = document.createElement('div');
    banner.style.cssText = 'color:#d8b46a;font-size:10px;line-height:1.4;margin-bottom:5px';
    banner.textContent = 'Prep list from the community "Epic Items To Keep" checklist (Manlaan, eqlwiki.com) — ⚠ = unverified on the wiki. Checkmarks come from your inventory file (bags + bank + key ring). Full walkthroughs: each class\'s Epic Quest page on the wiki.';
    list.appendChild(banner);
    const sbE = staleBanner('Epic checklists');
    if (sbE) list.appendChild(sbE);
    const ofE = outfileBar(['inventory']);   // checkmarks read your inventory export
    if (ofE) list.appendChild(ofE);

    if (epicsLive && epicsLive.data) {
      const fresh = document.createElement('div');
      fresh.className = 'q-npc';
      fresh.textContent = '🔄 Live list from the wiki' +
        (epicsLive.revised ? ' (page of ' + epicsLive.revised + ')' : '') +
        ', fetched ' + fmtAge(epicsLive.updated) + '.';
      list.appendChild(fresh);
    }

    for (const cls of sel) {
      const builtin = EPICDB.EPICS[cls];
      const e = {
        epic: (builtin && builtin.epic) || 'Epic Quest',
        items: epicItemsFor(cls),
        notes: (builtin && builtin.notes) ||
               'The wiki has nothing confirmed to pre-farm for this class yet.'
      };
      const div = document.createElement('div');
      div.className = 'l-divider';
      div.textContent = '⚔ ' + cls + ' — ' + e.epic;
      list.appendChild(div);
      if (!e.items.length) {
        const none = document.createElement('div');
        none.className = 'q-npc';
        none.textContent = e.notes;
        list.appendChild(none);
        continue;
      }
      const card = document.createElement('div');
      card.className = 'q-quest';
      const box = document.createElement('div');
      box.className = 'q-items';
      for (const it of e.items) {
        const dCls = epicClassDemand(cls, it.n);
        const dAll = epicDemand(it.n);          // all selected classes: shared items show true totals
        const haveN = invCount(it.n);
        const covered = dCls.need === 0 && dCls.coveredBy.length > 0;
        const done = covered || (dAll.total > 0 ? haveN >= dAll.total : invHas(it.n));
        const row = document.createElement('div');
        row.className = 'q-it' + (covered ? ' covered' : done ? ' have' : '');
        row.innerHTML = '<span class="box">' + (done ? '☑' : '☐') + '</span><span class="nm itemlink"></span><span class="cnt"></span><span class="loc"></span>';
        row.querySelector('.nm').textContent = it.n;
        if (!covered && dAll.total > 1)
          row.querySelector('.cnt').textContent = Math.min(haveN, dAll.total) + '/' + dAll.total +
            (dAll.per.filter(p => p.need).length > 1 ? ' (shared)' : '');
        row.querySelector('.loc').textContent = covered
          ? '✔ ' + dCls.coveredBy[0]
          : (it.u ? '⚠ ' : '') + it.src;
        row.title = (covered
          ? 'Covered: ' + dCls.coveredBy.join(', ') + ' — this ingredient only exists to make that.'
          : it.src + (it.u ? ' — the wiki marks this entry unverified' : ''))
          + ' — click the name for item details, the checkbox to tick off a turn-in the inventory file can\'t see';
        row.querySelector('.nm').addEventListener('click', (ev) => { ev.stopPropagation(); openItemLink(it.n); });
        row.querySelector('.box').addEventListener('click', (ev) => {
          ev.stopPropagation();
          toggleEpicTick(cls, it.n);
          renderQuests();
        });
        row.insertBefore(wishStar(it.n), row.querySelector('.loc'));
        box.appendChild(row);
      }
      const note = document.createElement('div');
      note.className = 'q-npc';
      note.textContent = e.notes;
      box.appendChild(note);
      card.appendChild(box);
      list.appendChild(card);
    }
    list.appendChild(creditLine(EPICDB.CREDIT));
  }

  // ---------- 🏆 BiS gear view ----------
  const bisData = () => (bisOverride && bisOverride.data) || BISDB.DATA;

  // (renderBis removed in v2.5.0 — the ⚔ Class tab's Gear advisor replaced the
  // old 🏆 BiS view; the bisFlag drop alerts still read the cached BiS list)

