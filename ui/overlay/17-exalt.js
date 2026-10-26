// SEQO overlay — Exaltations view.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= render: ✨ Exaltations =================
  // Browse every effect that can be pulled into an exaltation slot (Focus /
  // Worn / Proc / Clicky), pick one, see every item that carries it — with a
  // ✓ on what you already own. Index and item lists come read-only from the
  // wiki's effect categories and effect pages, cached after first fetch.
  let exaltIndex = null, exaltType = 'Focus', exaltFilter = '', exaltSel = null, exaltBusy = false, exaltGen = 0;
  let getEffectItemsFn = (n) => window.overlay.getEffectItems(n); // indirection so dev hooks can stub it
  window.overlay.getExaltIndex().then((ix) => { exaltIndex = ix && !ix.error ? ix : null; });

  async function renderExalts() {
    const list = $('q-list');
    list.innerHTML = '';
    setQuestEmpty('');

    if (!exaltIndex) {
      const box = document.createElement('div');
      box.style.cssText = 'text-align:center;color:#999;font-size:11px;padding:18px 10px;line-height:1.7';
      box.innerHTML = 'Browse every Focus / Worn / Proc / Clicky effect that can be pulled<br>into an exaltation slot, and see which items carry it.<br><br>';
      const b = document.createElement('button');
      b.className = 'kbtn gold';
      b.textContent = exaltBusy ? 'Fetching effect index…' : '⟳ Fetch the effect index from the wiki';
      b.disabled = exaltBusy;
      b.addEventListener('click', async () => {
        exaltBusy = true; renderExalts();
        const ix = await window.overlay.updateExaltIndex();
        exaltBusy = false;
        if (ix && !ix.error) { exaltIndex = ix; toast('✨ Effect index fetched'); }
        else toast('⚠ Could not fetch the effect index: ' + ((ix && ix.error) || 'unknown'));
        renderExalts();
      });
      box.appendChild(b);
      list.appendChild(box);
      list.appendChild(creditLine(UNL.CREDITS[1])); // eqlwiki
      return;
    }

    // effect detail: the items that carry the selected effect
    if (exaltSel) {
      const back = document.createElement('div');
      back.className = 'q-npc';
      back.style.cssText = 'cursor:pointer;color:#7da7d9;margin-bottom:4px';
      back.textContent = '← all ' + exaltType.toLowerCase() + ' effects';
      back.addEventListener('click', () => { exaltSel = null; renderQuests(); });
      list.appendChild(back);
      const hdr = document.createElement('div');
      hdr.className = 'l-divider';
      hdr.textContent = '✨ ' + exaltSel;
      list.appendChild(hdr);
      const want = exaltSel, gen = ++exaltGen;
      const d = await getEffectItemsFn(want);
      // view changed or a newer render started while fetching — this one's stale
      if (questZone() !== '__exalts' || exaltSel !== want || gen !== exaltGen) return;
      if (!d || d.error) {
        const err = document.createElement('div');
        err.className = 'q-npc';
        err.textContent = '⚠ ' + ((d && d.error) || 'could not fetch this effect');
        list.appendChild(err);
        return;
      }
      if (d.desc) {
        const ds = document.createElement('div');
        ds.className = 'q-npc';
        ds.textContent = d.desc;
        list.appendChild(ds);
      }
      let owned = 0;
      for (const it of d.items) {
        const have = invHas(it);
        if (have) owned++;
        const row = document.createElement('div');
        row.className = 'q-it' + (have ? ' have' : '');
        row.innerHTML = '<span class="box">' + (have ? '☑' : '☐') + '</span><span class="nm itemlink"></span>';
        row.querySelector('.nm').textContent = it;
        row.title = 'Click for item details';
        row.addEventListener('click', () => openItemLink(it));
        list.appendChild(row);
      }
      if (!d.items.length) {
        const none = document.createElement('div');
        none.className = 'q-npc';
        none.textContent = 'The wiki page lists no items for this effect yet.';
        list.appendChild(none);
      }
      $('q-progress').textContent = d.items.length ? owned + '/' + d.items.length + ' owned' : '';
      list.appendChild(creditLine(UNL.CREDITS[1]));
      return;
    }

    // effect list: type chips + filter + effects of the chosen type
    const types = Object.keys(exaltIndex.types);
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:5px;flex-wrap:wrap';
    for (const t of types) {
      const chip = document.createElement('button');
      chip.className = 'kbtn' + (t === exaltType ? ' gold' : '');
      chip.style.cssText = 'font-size:10px;padding:1px 8px';
      chip.textContent = t + ' (' + exaltIndex.types[t].length + ')';
      chip.addEventListener('click', () => { exaltType = t; renderQuests(); });
      bar.appendChild(chip);
    }
    const search = document.createElement('input');
    search.placeholder = 'search effects…';
    search.value = exaltFilter;
    search.style.cssText = 'margin-left:auto;background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:10.5px;width:130px';
    search.addEventListener('input', () => {
      exaltFilter = search.value;
      renderQuests();
      const s2 = $('q-list').querySelector('input');
      if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
    });
    bar.appendChild(search);
    list.appendChild(bar);

    if (!types.includes(exaltType)) exaltType = types[0];
    const q = exaltFilter.trim().toLowerCase();
    const effects = (exaltIndex.types[exaltType] || []).filter(e => !q || e.toLowerCase().includes(q));
    for (const e of effects) {
      const row = document.createElement('div');
      row.className = 'q-it';
      row.innerHTML = '<span class="nm itemlink"></span>';
      row.querySelector('.nm').textContent = e;
      row.title = 'Click to see every item that carries ' + e;
      row.addEventListener('click', () => { exaltSel = e; renderQuests(); });
      list.appendChild(row);
    }
    if (!effects.length) {
      const none = document.createElement('div');
      none.className = 'q-npc';
      none.textContent = 'No ' + exaltType.toLowerCase() + ' effects match "' + exaltFilter + '".';
      list.appendChild(none);
    }
    $('q-progress').textContent = '';
    list.appendChild(creditLine(UNL.CREDITS[1]));
  }

  // ---------- needed-item engine: epic/grind/BiS drops get toasts + KEEP ----------
  function neededExtraVerdict(key, displayName) {
    const shown = displayName || key;
    // epic prep — the demand engine covers recipes, shared items and ×N counts
    const d = epicDemand(key);
    if (d.total > 0 && d.have < d.total) {
      const who = d.per.filter(p => p.need);
      const epicName = who.length ? ((EPICDB.EPICS[who[0].cls] || {}).epic || 'epic') : 'epic';
      const clsTxt = who.map(p => p.cls).join(' + ');
      const cnt = d.total > 1 ? ' — ' + d.have + '/' + d.total : '';
      return { kind: 'keep', label: 'KEEP',
               reason: 'epic prep: ' + epicName + ' (' + clsTxt + ')' + cnt,
               toast: '⚔ Epic prep: ' + shown + ' — needed for ' + epicName + ' (' + clsTxt + ')' + cnt };
    }
    // race-unlock turn-ins, only while a faction that eats them isn't maxed
    const g = grindItemNeed(key);
    if (g) {
      const cnt = g.total ? ' (' + g.have + '/' + g.total + ')' : '';
      return { kind: 'keep', label: 'KEEP', reason: 'faction turn-in — ' + g.faction + cnt, toast: null };
    }
    // BiS: opt-in (settings toggle, off by default), your class only
    const cls = settings && settings.bisClass;
    if (settings.bisFlag && cls && bisData()[cls]) {
      for (const [slot, items] of Object.entries(bisData()[cls])) {
        const hit = items.find(it => it.n.toLowerCase() === key);
        if (hit && !invHas(hit.n)) {
          return { kind: 'keep', label: 'BiS', reason: 'best-in-slot ' + slot.toLowerCase() + ' (' + cls + ')', toast: '🏆 BiS drop: ' + hit.n + ' — ' + slot.toLowerCase() + ' for ' + cls };
        }
      }
    }
    return null;
  }

  $('l-cleanup').addEventListener('click', () => window.overlay.openCleanup());

