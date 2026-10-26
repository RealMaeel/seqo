// SEQO overlay — dev-only test hooks (onTestTab) used for screenshots and self-tests.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  window.overlay.onTestTab((tab) => {
    $('export-modal').style.display = 'none'; // reset transient panels between shots
    $('login-modal').style.display = 'none';
    if (tab.startsWith('item:')) { // dev-only: open item detail, slider mid-way
      setTab('lookup');
      openItem(tab.slice(5)); // details render in the dock (see dockshot)
      return;
    }
    if (tab === 'export') { setTab('loot'); $('l-export').click(); return; }
    if (tab.startsWith('camp:')) { addCamp(tab.slice(5)); setTab('timers'); return; }
    if (tab === 'bsession') { bMode = 'session'; setTab('breakdown'); return; }
    if (tab.startsWith('ph:')) { // dev-only: link "Camp|PH"
      const [c, p] = tab.slice(3).split('|');
      addCamp(c);
      const camp = timers.get(mobKey(c));
      if (camp && p) { camp.phs.add(mobKey(p)); savePhs(camp); }
      setTab('timers');
      return;
    }
    if (tab.startsWith('feed:')) { handleLogLines([tab.slice(5)]); return; }
    if (tab.startsWith('mtimer:')) { // dev-only: 'mtimer:Label=1:30'
      const [l, d] = tab.slice(7).split('=');
      startManualTimer(l, parseDuration(d || '60'));
      return;
    }
    if (tab === 'runloot') { // dev-only: toggle the loot run tracker
      $('l-run').click();
      setTab('loot');
      return;
    }
    if (tab === 'raredemo') { // dev-only: rare checklist inside a run
      zoneData = { parserV: 2,
                   named: [{ mob: 'Lord Ghiosk' }, { mob: 'Fippy Darkpaw' }, { mob: 'Najena' },
                           { mob: 'a haunted chest' }, { mob: 'an ashenbone drake' }, { mob: 'The Ishva Mal' },
                           { mob: 'the ghoul arch magi', boss: true }] };
      rebuildNamedSet();
      if (!lootRun) $('l-run').click();
      handleLogLines(['[Tue Sep 22 21:00:00 2026] Lord Ghiosk has been slain by Maeel!',
                      '[Tue Sep 22 21:00:30 2026] You have slain a haunted chest!',
                      '[Tue Sep 22 21:01:00 2026] You have slain Najena!']);
      setTab('loot');
      return;
    }
    if (tab.startsWith('meterx:')) { // dev-only: expand a meter row's spell list
      meterExpanded.add(tab.slice(7));
      setTab('meter');
      renderMeter();
      return;
    }
    if (tab === 'locktest') { // dev-only: prove controls stay hoverable while locked
      setLocked(true); setTab('loot');
      const probe = (id) => {
        const b = $(id).getBoundingClientRect();
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }));
        return id + '=' + interactiveNow;
      };
      console.log('LOCKTEST ' + ['l-run', 'l-needs', 'afk-btn2', 'unlock-btn', 'l-coin', 'bb-run'].map(probe).join(' '));
      return;
    }
    if (tab === 'qlive') { // dev-only: epics view with injected live wiki data
      epicsLive = { revised: '2026-09-20', updated: Date.now(), data: {
        'Shadow Knight': [
          { n: 'Darkforge Breastplate', src: 'Complete Darkforge Armor Quests' },
          { n: 'Decayed Chainmail', src: 'Temple of Cazic-Thule - A Lizard Crusader or A lizard ritualist' },
          { n: 'Enchanted Platinum Bar', q: 2, src: 'Buy and Enchant' },
          { n: 'LIVE-DATA-MARKER Sword', src: 'proves the live override renders', u: true }
        ] } };
      setTab('quests');
      setQuestView('__epics');
      renderQuests();
      return;
    }
    if (tab === 'repdemo') { // dev-only: unlocks view w/ rep counters (needs real faction+ach files)
      setTab('quests');
      setQuestView('__unlocks');
      unlExpanded.add('races|Race Unlock - Dwarf');
      renderQuests();
      return;
    }
    if (tab === 'needkill') { // dev-only: kill-time need toast
      zoneData = { named: [{ mob: 'The froglok shin lord', boss: true, drops: [{ item: 'Ghoulbane' }] }] };
      rebuildNamedSet();
      handleLogLines(['[Mon Sep 28 21:00:00 2026] You have slain The froglok shin lord!']);
      setTab('meter');
      return;
    }
    if (tab === 'needsdemo') { // dev-only: seed state for the zone-needs panel
      currentZone = 'Upper Guk';
      zoneData = { named: [
        { mob: 'The froglok shin lord', boss: true, drops: [{ item: 'Ghoulbane' }] },
        { mob: 'a froglok noble', drops: [{ item: 'Shiny Brass Idol' }] }
      ] };
      rebuildNamedSet();
      settings.posClasses = ['Shadow Knight'];
      wishList[verdictKey('Shiny Brass Idol')] = { name: 'Shiny Brass Idol', added: Date.now() };
      lootDB.mobs['Upper Guk|a gnoll elite'] = { name: 'a gnoll elite', zone: 'Upper Guk', kills: 12,
        drops: { 'gnoll fang': { name: 'Gnoll Fang', count: 9 } } };
      lootedLive.set(normItemName('Gnoll Fang'), 437);
      needsDirty = true;
      setTab('loot');
      return;
    }
    if (tab.startsWith('qview:')) { // dev-only: open a Quests sub-view for screenshots
      setTab('quests');
      setQuestView(tab.slice(6));
      renderQuests();
      return;
    }
    if (tab === 'logindemo') { // dev-only: the fresh-session outputfile reminder
      loginAt = Date.now();
      reminderAt = loginAt;
      loginReminded = false;
      maybeLoginReminder();
      setTab('meter');
      return;
    }
    if (tab === 'timerdemo') { // dev-only: respawn pedigrees + a spawn window
      currentZone = 'Lower Guk';
      respawnDB['Lower Guk|the ghoul arch magus'] = { s: 1230, src: 'learned', n: 5, samples: [1200, 1230, 1260, 1225, 1235] };
      respawnDB['Lower Guk|a ghoul sentinel'] = { s: 420, src: 'learned', n: 1, samples: [420] };
      respawnDB['Lower Guk|the froglok king'] = { min: 900, max: 1800, s: 1350, src: 'learned', n: 4, samples: [900, 1200, 1500, 1800] };
      respawnDB['Lower Guk|a reanimated hand'] = { s: 400, src: 'manual', manual: '6:40' };
      const base = Date.now();
      for (const [m, ago] of [['the ghoul arch magus', 300], ['a ghoul sentinel', 100], ['the froglok king', 1000], ['a reanimated hand', 250]])
        timers.set(m, { mob: m, zone: currentZone, lastDeath: base - ago * 1000, resp: resolveRespawn(m), pinned: m === 'the froglok king', notified: false, windowNotified: true, phs: new Set() });
      setTab('timers');
      return;
    }
    if (tab === 'notes') { $('notes-text').value = 'Test note: /tasko reopens the crawl tracker.'; setTab('notes'); return; }
    if (tab === 'settings') { document.body.classList.add('settings-open'); return; } // dev-only
    if (tab === 'verify') { // dev-only: logic assertions, results on the console
      const out = [];
      const chk = (name, cond, extra) => out.push((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra !== undefined ? ' = ' + JSON.stringify(extra) : ''));
      try {
        // respawn learning: cluster/median, window detection, outlier drop
        currentZone = 'VerifyZone'; currentZoneVariant = '';
        for (const m of ['steady mob', 'window mob', 'outlier mob', 'pen mob'])
          delete respawnDB['VerifyZone|' + m];   // idempotent across runs
        for (const g of [600, 610, 590, 605]) learnGap('steady mob', g);
        const e1 = respawnDB['VerifyZone|steady mob'];
        chk('learnGap fixed median', e1 && !e1.min && e1.s >= 600 && e1.s <= 610 && e1.n === 4, e1 && e1.s);
        for (const g of [900, 1500, 1200]) learnGap('window mob', g);
        const e2 = respawnDB['VerifyZone|window mob'];
        chk('learnGap spawn window', e2 && e2.min === 900 && e2.max === 1500, e2 && [e2.min, e2.max]);
        for (const g of [600, 610, 1900]) learnGap('outlier mob', g);
        const e3 = respawnDB['VerifyZone|outlier mob'];
        chk('learnGap outlier dropped', e3 && !e3.min && e3.s <= 620, e3 && e3.s);
        // manual override parsing + revert
        chk('manual 6:40', setManualRespawn('pen mob', '6:40') && respawnDB['VerifyZone|pen mob'].s === 400);
        chk('manual 15-30 window', setManualRespawn('pen mob', '15-30') &&
            respawnDB['VerifyZone|pen mob'].min === 900 && respawnDB['VerifyZone|pen mob'].max === 1800);
        chk('manual beats learning', (learnGap('pen mob', 333) || {}).src === 'manual');
        chk('manual revert', setManualRespawn('pen mob', '') && !(respawnDB['VerifyZone|pen mob'] || {}).manual);
        // epic demand engine against the REAL inventory file (Darkforge owned)
        const d1 = epicClassDemand('Shadow Knight', 'Decayed Chainmail');
        chk('Decayed Chainmail covered by owned Darkforge BP', d1.need === 0 && d1.coveredBy.length > 0, d1.coveredBy[0]);
        const d2 = epicClassDemand('Shadow Knight', 'Damaged Militia Helm');
        chk('Militia Helms covered by owned Darkforge Helm', d2.need === 0 && d2.coveredBy.length > 0);
        const d3 = epicClassDemand('Shadow Knight', 'Enchanted Platinum Bar');
        chk('EPB still needs 1 for the Decrepit Sheath', d3.need === 1 && d3.coveredBy.length === 1, d3);
        const d4 = epicClassDemand('Shadow Knight', 'Ghoulbane');
        chk('Ghoulbane needed (no Corrupted Ghoulbane)', d4.need === 1);
        // manual tick-off covers a turn-in
        toggleEpicTick('Shadow Knight', 'Ghoulbane');
        chk('ticked Ghoulbane now covered', epicClassDemand('Shadow Knight', 'Ghoulbane').need === 0);
        toggleEpicTick('Shadow Knight', 'Ghoulbane');
        // shared demand across classes (SK + MAG both list an item? use epicDemand with explicit classes on EPB)
        const dd = epicDemand('Enchanted Platinum Bar', ['Shadow Knight']);
        chk('epicDemand totals + have from inventory', dd.total === 1 && typeof dd.have === 'number', dd.have);
        // items whose only copy sits in the trailing Equipment/KeyRing section
        // (equipped gear with upgrade suffixes) must still COUNT as owned
        const dSL = epicClassDemand('Shadow Knight', 'Soul Leech, Dark Sword of Blood');
        chk('Soul Leech +5 (Equipment section) counts as owned',
            invCount('Soul Leech, Dark Sword of Blood') >= 1 &&
            (dSL.need === 0 || invCount('Soul Leech, Dark Sword of Blood') >= dSL.need),
            invCount('Soul Leech, Dark Sword of Blood'));
        chk('Ball of Everliving Golem +7 counts as owned', invCount('Ball of Everliving Golem') >= 1,
            invCount('Ball of Everliving Golem'));
        // live loot counters
        lootedLive.set(normItemName('Gnoll Fang'), (lootedLive.get(normItemName('Gnoll Fang')) || 0) + 3);
        chk('invCount merges live loot', invCount('Gnoll Fang') >= 3, invCount('Gnoll Fang'));
        const g1 = grindItemNeed(verdictKey('Gnoll Fang'));
        chk('grindItemNeed counts vs total', !!g1 && g1.total === 1200 && g1.have >= 3, g1 && g1.have + '/' + g1.total);
        // clock + quest view state
        chk('fmtClock m:ss', fmtClock(62000) === '1:02', fmtClock(62000));
        chk('fmtClock h:mm:ss', fmtClock(3723000) === '1:02:03', fmtClock(3723000));
        setQuestView('__slayer');
        chk('quest chips drive the view', questZone() === '__slayer');
        setQuestView('');
        // BiS stays quiet unless the flag is on
        settings.bisFlag = false; settings.bisClass = 'Shadow Knight';
        const quiet = neededExtraVerdict(verdictKey('Umbral Platemail Breastplate'), 'Umbral Platemail Breastplate');
        chk('BiS silent with flag off', !quiet || quiet.label !== 'BiS');
      } catch (err) { out.push('FAIL exception: ' + err.message); }
      for (const line of out) console.log('VERIFY|' + line);
      console.log('VERIFY|DONE ' + out.filter(l => l.startsWith('PASS')).length + '/' + out.length);
      return;
    }
    if (tab.startsWith('qscroll:')) { $('q-list').scrollTop = +tab.slice(8) || 0; return; } // dev-only
    if (tab.startsWith('sessx:')) { sessExpanded.add(tab.slice(6)); setTab('breakdown'); renderBreakdown(); return; } // dev-only
    if (tab === 'sesscopy') { console.log('SESSCHAT|' + copySession(false)); console.log('SESSFULL|' + copySession(true)); return; } // dev-only
    if (tab === 'copydemo') { console.log('COPYCHAT|' + copyMeter(false)); console.log('COPYFULL|' + copyMeter(true)); setTab('meter'); return; }
    if (tab === 'xpdemo') { // dev-only: XP strip with a session's worth of gains
      handleLogLines([
        '[Mon Sep 29 20:00:00 2026] You gain experience! (3.288%)',
        '[Mon Sep 29 20:04:00 2026] You gain party experience! (1.373%)',
        '[Mon Sep 29 20:09:00 2026] You gain experience! (2.940%)',
        '[Mon Sep 29 20:12:00 2026] You have gained a level! Welcome to level 47!',
        '[Mon Sep 29 20:15:00 2026] You gain experience! (2.104%)',
        '[Mon Sep 29 20:22:00 2026] You gain experience! (2.612%)',
        '[Mon Sep 29 20:30:00 2026] You gain party experience! (0.988%)',
        '[Mon Sep 29 20:38:00 2026] You gain experience! (2.771%)',
        '[Mon Sep 29 20:45:00 2026] You have gained 2 ability points! You now have 145 ability points.',
        '[Mon Sep 29 21:00:00 2026] You gain experience! (3.005%)'
      ]);
      setTab('meter');
      return;
    }
    if (tab === 'xpdemo50') { // dev-only: XP strip at the level cap
      const mk = (min, s) => '[Mon Sep 29 ' + String(20 + Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0') + ':00 2026] ' + s;
      const lines = [];
      for (let i = 0; i < 54; i++) lines.push(mk(i * 2, 'You gain experience!'));
      lines.push(mk(35, 'You have gained 1 ability point! You now have 146 ability points.'));
      lines.push(mk(70, 'You have gained 2 ability points! You now have 148 ability points.'));
      lines.push(mk(100, 'You have gained 1 ability point! You now have 149 ability points.'));
      handleLogLines(lines);
      setTab('meter');
      return;
    }
    if (tab === 'exaltdemo') { // dev-only: exaltations effect list
      exaltIndex = { types: { Focus: ['Affliction Haste I', 'Burning Affliction III', 'Improved Damage II', 'Mana Preservation II'], Worn: ['Flowing Thought I'], Proc: ['Anarchy'], Clicky: ['Levitation'] }, updated: Date.now() };
      exaltSel = null;
      setTab('quests'); setQuestView('__exalts'); renderQuests();
      return;
    }
    if (tab === 'exaltdemo2') { // dev-only: effect detail with stubbed items
      exaltIndex = exaltIndex || { types: { Focus: ['Mana Preservation II'] }, updated: Date.now() };
      getEffectItemsFn = async () => ({ effect: 'Mana Preservation II',
        desc: 'Reduces the mana cost of spells by up to 10%. This bonus will decay on spells over level 44.',
        items: ['Black Alloy Medallion', 'Mane Attraction', 'Nisch Mas Ilkvel'] });
      exaltSel = 'Mana Preservation II';
      setTab('quests'); setQuestView('__exalts'); renderQuests();
      return;
    }
    if (tab === 'cleanseed') { // dev-only: seed item knowledge so cleanup shows quest chips / ts / gear
      itemKnowledge[normItemName('Fresh Fish')] = { quests: ['Exotic Drinks', 'Fishy Deliveries', 'Cabilis Trade Run'], ts: ['baking'], page: 'Fresh Fish', checkedAt: Date.now(), chainChecked: true,
        chain: ['Exotic Drinks → Electrum-Bladed Wakizashi → needed for: Call of Flame Quest'] };
      itemKnowledge[normItemName('Snake Scales')] = { quests: [], ts: ['brewing'], page: 'Snake Scales', checkedAt: Date.now() };
      itemKnowledge[normItemName('Barbarian Spiritist`s Hammer')] = { quests: [], gear: true, page: 'Barbarian Spiritist`s Hammer', checkedAt: Date.now() };
      return;
    }
    if (tab === 'datastale') { // dev-only: show the stale-data banner + status line
      dataStaleLabels = ['Epic checklists', 'Race unlock guide'];
      setTab('quests');
      setQuestView('__epics');
      renderQuests();
      return;
    }
    if (tab.startsWith('unlockx:')) { // dev-only: expand one race unlock row
      unlExpanded.add('races|Race Unlock - ' + tab.slice(8));
      setTab('quests');
      setQuestView('__unlocks');
      renderQuests();
      return;
    }
    if (tab === 'spellverify') { // dev-only: buff-engine assertions against the REAL game files
      const t0 = Date.now();
      const waitDb = () => new Promise(res => {
        const h = setInterval(() => { if (spellDB || spellDbError || Date.now() - t0 > 40000) { clearInterval(h); res(); } }, 300);
      });
      (async () => {
        await waitDb();
        const ok = (name, cond, extra) => console.log('SPELLVERIFY|' + (cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' = ' + JSON.stringify(extra) : ''));
        ok('spell DB loaded', !!spellDB, spellDbError || (spellDB && Object.keys(spellDB.spells).length + ' spells'));
        if (!spellDB) { console.log('SPELLVERIFY|DONE'); return; }
        const breeze = (spellByName.get('breeze') || [])[0];
        ok('Breeze in planner pool (ENC 14)', !!breeze && breeze.cls && breeze.cls.ENC === 14, breeze && breeze.cls);
        ok('Breeze duration 27m at L50', !!breeze && buffDurS(breeze, 50) === 1620, breeze && buffDurS(breeze, 50));
        handleLogLines(['[Tue Oct 13 12:00:00 2026] A light breeze slips through your mind.']);
        ok('cast-on-you line starts tracking', activeBuffs.has('breeze'), [...activeBuffs.keys()]);
        handleLogLines(['[Tue Oct 13 12:00:05 2026] You become one with your weapons.']);
        ok('second buff tracked', activeBuffs.has("nature's precision"), [...activeBuffs.keys()]);
        const sb = stackBlockInfo('Firefist');
        ok('stacking group explains a blocked cast', !!sb && sb.blocker === "Nature's Precision" && sb.theirs > sb.mine, sb);
        const fn = spellFadeNames('light breeze', 'fades');
        ok('exact fade line resolves to the spell', !!fn && fn.includes('Breeze'), fn);
        handleLogLines(['[Tue Oct 13 12:01:00 2026] The light breeze fades.']);
        ok('fade ends tracking', !activeBuffs.has('breeze'), [...activeBuffs.keys()]);
        // loadout builder: gems + focus stats, against the real spell data
        const alac = (spellByName.get('alacrity') || [])[0];
        ok('effects parsed from game data (Alacrity haste 40)', !!(alac && alac.eff && alac.eff.haste === 40), alac && alac.eff);
        // song haste evaluated at L50 through the calc formula, not the raw cap
        const mcv = (spellByName.get("mcvaxius' berserker crescendo") || [])[0];
        ok('song haste level-scaled (McVaxius 20, not its 33 cap)', !!(mcv && mcv.eff && mcv.eff.haste === 20), mcv && mcv.eff);
        const lo = buildLoadout(['SHD', 'SHM', 'ENC'], ['hp', 'sta', 'dex'], 10);
        ok('loadout builder fills the gem budget', lo.length > 0 && lo.length <= 10, lo.map(e => e.sp.n + ' [' + effText(e.sp) + ']').slice(0, 6));
        let clash = false;
        for (let a = 0; a < lo.length; a++) for (let b = a + 1; b < lo.length; b++)
          if (!isSong(lo[a].sp) === !isSong(lo[b].sp) && slotClash(lo[a].sp, lo[b].sp)) clash = true;
        ok('no slot clash between picks (true stacking)', !clash);
        ok('focus stats each get covered', ['hp', 'sta', 'dex'].every(f => lo.some(e => effVal(e.sp, f) > 0)), lo.map(e => e.sp.n).slice(0, 6));
        ok('focused build leads with a focus stat', lo.length > 0 && ['hp', 'sta', 'dex'].some(f => effVal(lo[0].sp, f) > 0), lo[0] && lo[0].sp.n);
        ok('at most one illusion in a set', lo.filter(e => (e.sp.eff || {}).illusion).length <= 1, lo.filter(e => (e.sp.eff || {}).illusion).map(e => e.sp.n));
        // focus is optional now: no focus -> combat-weighted best overall set
        const lo0 = buildLoadout(['SHD', 'SHM', 'ENC'], [], 10);
        ok('no-focus default builds a full set', lo0.length > 0 && lo0.length <= 10, lo0.map(e => e.sp.n).slice(0, 6));
        ok('utility-only buffs never spend a gem', lo0.every(e => statKeys(e.sp).length > 0));
        // Ed's real trio: songs must coexist with spells, Item Benefits stay out
        const lo2 = buildLoadout(['SHD', 'DRU', 'BRD'], ['hp', 'haste', 'dex', 'ac'], 14);
        ok('SHD/DRU/BRD: songs AND spells both picked',
          lo2.some(e => isSong(e.sp)) && lo2.some(e => !isSong(e.sp)),
          lo2.map(e => (isSong(e.sp) ? '♪' : '✦') + e.sp.n + ' [' + effText(e.sp) + ']'));
        ok('no "Item Benefit" rows anywhere in the pool',
          ![...spellByName.keys()].some(k => /^item (benefit|effect)\b/.test(k)) &&
          !lo2.some(e => /^Item Benefit/i.test(e.sp.n)));
        // field-report round: resists = all five, DS/proc/vision parse
        const lo3 = buildLoadout(['SHD', 'DRU', 'BRD'], ['res'], 8);
        const resTypes = new Set();
        for (const e of lo3) for (const k of RES_KEYS) if ((e.sp.eff || {})[k]) resTypes.add(k);
        ok('Resists focus covers several resist types', resTypes.size >= 3, [...resTypes]);
        const thorn = (spellByName.get('thorncoat') || [])[0];
        ok('negative-base damage shields parse (Thorncoat DS 5)', !!(thorn && thorn.eff && thorn.eff.ds === 5), thorn && thorn.eff);
        const ss = (spellByName.get('shadow sight') || [])[0];
        ok('vision buffs parse (Shadow Sight ultra + see invis)', !!(ss && ss.eff && ss.eff.vision === 2 && ss.eff.seeinvis), ss && ss.eff);
        const sod = (spellByName.get('scream of death') || [])[0];
        ok('proc buffs parse (Scream of Death)', !!(sod && sod.eff && sod.eff.proc), sod && sod.eff);
        const dt = (spellByName.get('dark temptation') || [])[0];
        ok('Dark Temptation in pool with ATK 25', !!(dt && dt.eff && dt.eff.atk === 25), dt && dt.eff);
        ok('mixed spells keep their price (DT −3 HP/tick)', !!(dt && dt.cost && dt.cost.hpregen === 3), dt && dt.cost);
        ok('cost shows beside the gain', !!dt && /ATK \+25.*HP\/tick −3/.test(effText(dt)), dt && effText(dt));
        // slot-true stacking: Grim Aura's ATK (slot 1) stacks with DT's (slot 2)
        const ga = (spellByName.get('grim aura') || [])[0];
        ok('Grim Aura parses (SHD 16, ATK 10 capped)', !!(ga && ga.cls && ga.cls.SHD === 16 && ga.eff && ga.eff.atk === 10), ga && ga.eff);
        ok('slot-offset ATK buffs do NOT clash (Grim Aura + DT)', !!(ga && dt && !slotClash(ga, dt)), ga && dt && [ga.slots, dt.slots]);
        const loGA = buildLoadout(['SHD', 'ROG', 'BRD'], ['atk'], 14, 'both', 3);
        ok('SK/ROG/BRD ATK build takes Grim Aura AND Dark Temptation',
          loGA.some(e => e.sp.n === 'Grim Aura') && loGA.some(e => e.sp.n === 'Dark Temptation'),
          loGA.map(e => (isSong(e.sp) ? '♪' : '') + e.sp.n).slice(0, 8));
        // loadout modes: buff set has no songs, songs-only is all songs ≤ 5
        const loSp = buildLoadout(['SHD', 'DRU', 'BRD'], ['hp', 'haste', 'str', 'ac'], 14, 'spells', 3);
        ok('buff set (spells mode) excludes songs', loSp.length > 0 && loSp.every(e => !isSong(e.sp)), loSp.map(e => e.sp.n).slice(0, 5));
        const loSo = buildLoadout(['SHD', 'DRU', 'BRD'], ['hp', 'haste', 'str', 'ac', 'dex'], 5, 'songs', 5);
        ok('songs-only mode is all songs, max 5', loSo.length > 0 && loSo.length <= 5 && loSo.every(e => isSong(e.sp)), loSo.map(e => e.sp.n));
        const loMix = buildLoadout(['SHD', 'DRU', 'BRD'], ['hp', 'haste', 'str', 'ac', 'dex', 'agi', 'atk'], 14, 'both', 1);
        ok('fighting set caps songs at the aura limit', loMix.filter(e => isSong(e.sp)).length <= 1, loMix.map(e => (isSong(e.sp) ? '♪' : '') + e.sp.n).slice(0, 7));
        // proc-buff audit round: procs resolve to their actual spell, coverage is amount-aware
        const sod2 = (spellByName.get('scream of death') || [])[0];
        ok('Scream of Death proc resolves (AE ~30)', !!(sod2 && sod2.procInfo && sod2.procInfo.kind === 'AE' && sod2.procInfo.amt === 30), sod2 && sod2.procInfo);
        const ve2 = (spellByName.get('vampiric embrace') || [])[0];
        ok('Vampiric Embrace proc resolves (single lifetap, bigger)', !!(ve2 && ve2.procInfo && ve2.procInfo.kind !== 'AE' && ve2.procInfo.amt > 30), ve2 && ve2.procInfo);
        const loAtk = buildLoadout(['SHD', 'DRU', 'BRD'], ['atk', 'haste'], 14, 'both', 5);
        ok('ATK focus surfaces Dark Temptation (as pick or alternate)',
          loAtk.some(e => e.sp.n === 'Dark Temptation' || (e.alts || []).some(a => a.n === 'Dark Temptation')),
          loAtk.map(e => (isSong(e.sp) ? '♪' : '') + e.sp.n + (e.alts && e.alts.length ? ' or: ' + e.alts.map(a => a.n).join('/') : '')));
        // whole-pool audit: the overwhelming majority of castable buffs parse effects
        const poolAll = [...spellByName.values()].flat().filter(sp => sp.cls);
        const withEff = poolAll.filter(sp => sp.eff).length;
        ok('pool-wide effect coverage ≥ 85%', withEff / poolAll.length >= 0.85,
          withEff + '/' + poolAll.length + ' buffs parse effects (' + Math.round(withEff / poolAll.length * 100) + '%)');
        const withSlots = poolAll.filter(sp => sp.eff && sp.slots).length;
        ok('slot maps parse for every statful buff', withSlots === withEff, withSlots + '/' + withEff);
        // FULL-COVERAGE audit, every class: with unlimited gems, every castable
        // stat buff is either PICKED or provably BLOCKED by a pick (same slot,
        // same stacking group, or the one-illusion rule). Nothing silently drops.
        const accountable = (trio) => {
          const model = plannerModel(trio);
          const cands = [];
          for (const list of model.groups.values()) cands.push(list[0]);
          cands.push(...model.solo);
          // poisons are accounted for by their own section (poisonPlan), not gems
          const statful = cands.filter(e => e.sp.eff && statKeys(e.sp).some(k => COMBAT_W[k]) && !isDisc(e.sp) && !e.sp.poison);
          const lo = buildLoadout(trio, [], 99, 'both', null);
          const pickedN = new Set(lo.map(e => e.sp.n));
          const missing = [];
          for (const c of statful) {
            if (pickedN.has(c.sp.n)) continue;
            const cg = spellDB.stacking[c.sp.id];
            const blocked = lo.some(p => {
              const pg = spellDB.stacking[p.sp.id];
              if (cg && pg && cg.g === pg.g) return true;
              if ((c.sp.eff || {}).illusion && (p.sp.eff || {}).illusion) return true;
              if (isSong(p.sp) !== isSong(c.sp)) return false;
              return slotClash(c.sp, p.sp);
            });
            if (!blocked) missing.push(c.sp.n);
          }
          return missing;
        };
        let dropped = [];
        for (const c of spellDB.classes) dropped.push(...accountable([c, c, c]).map(n => c + ':' + n));
        ok('ALL 16 classes: every stat buff picked or provably blocked', dropped.length === 0,
          dropped.length ? dropped.slice(0, 8) : 'all accounted for');
        // and per stat: focusing a stat always lands its strongest castable source
        let badFocus = [];
        for (const trio of [['SHD', 'ROG', 'BRD'], ['SHD', 'SHM', 'ENC']]) {
          const model = plannerModel(trio);
          const cands = [];
          for (const list of model.groups.values()) cands.push(list[0]);
          cands.push(...model.solo);
          for (const f of Object.keys(COMBAT_W)) {
            const max = Math.max(0, ...cands.map(e => effVal(e.sp, f)));
            if (!max) continue;
            const lo = buildLoadout(trio, [f], 99, 'both', null);
            const got = Math.max(0, ...lo.map(e => effVal(e.sp, f)));
            if (got < max) badFocus.push(trio.join('/') + ' ' + f + ': got ' + got + ' < best ' + max);
          }
        }
        ok('every stat\'s strongest source is picked when focused', badFocus.length === 0,
          badFocus.length ? badFocus.slice(0, 6) : 'all ' + Object.keys(COMBAT_W).length + ' stats × 2 trios');
        // ⏳ long-buff preference: average spell duration must not get WORSE
        const meanDur = (lo) => {
          const ds = lo.filter(e => !isSong(e.sp)).map(e => buffDurS(e.sp, myLevel())).map(s => s == null ? 7200 : s);
          return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
        };
        const loShort = buildLoadout(['SHD', 'SHM', 'ENC'], [], 10, 'both', 3, false);
        const loLong = buildLoadout(['SHD', 'SHM', 'ENC'], [], 10, 'both', 3, true);
        ok('⏳ long-buff toggle raises average duration', loLong.length > 0 && meanDur(loLong) >= meanDur(loShort),
          Math.round(meanDur(loShort) / 60) + 'm → ' + Math.round(meanDur(loLong) / 60) + 'm');
        // disciplines: parsed, listed per class, never in the gem lineup
        // Legends has stances instead of the three low-level disciplines
        ok('Focused Will / Resistant / Fearless kept out (stances cover them)',
          !Object.values(spellDB.spells).some(sp => sp.cls && /^(Focused Will|Resistant|Fearless) Discipline$/.test(sp.n)));
        const rogModel = plannerModel(['SHD', 'ROG', 'BRD']);
        const rogDiscs = rogModel.pool.filter(e => isDisc(e.sp));
        ok('ROG trio at 50 has no discipline list', rogDiscs.length === 0, rogDiscs.map(e => e.cls + ':' + e.sp.n));
        const loD = buildLoadout(['SHD', 'ROG', 'BRD'], [], 99, 'both', null);
        ok('disciplines never spend a gem', !loD.some(e => isDisc(e.sp)));
        // whole-file: every player-castable Discipline shows in its class list
        const discAll = poolAll.filter(sp => isDisc(sp) && sp.ben);
        const discMiss = [];
        for (const sp of discAll) {
          for (const c of Object.keys(sp.cls || {})) {
            if (sp.cls[c] > myLevel()) continue;
            const m = plannerModel([c, c, c]);
            if (!m.pool.some(e => e.sp.n === sp.n && isDisc(e.sp))) discMiss.push(c + ':' + sp.n);
          }
        }
        ok('ALL ' + discAll.length + ' disciplines listed for their classes', discMiss.length === 0,
          discMiss.length ? discMiss.slice(0, 6) : 'every discipline accounted for');
        const evasive = (spellByName.get('evasive discipline') || [])[0];
        ok('disc combat SPAs decode (Evasive: avoidance, melee-dmg cost)',
          !!(evasive && evasive.eff && evasive.eff.avoid === 50 && evasive.cost && evasive.cost.acc === 33), evasive && [evasive.eff, evasive.cost]);
        ok('durFactor: songs exempt, short spells discounted', (() => {
          const breeze2 = (spellByName.get('breeze') || [])[0]; // 27m -> partial credit
          const mcv2 = (spellByName.get("mcvaxius' berserker crescendo") || [])[0]; // song -> exempt
          const f = breeze2 && durFactor(breeze2);
          return mcv2 && durFactor(mcv2) === 1 && f > 0.6 && f < 0.85 &&
            Math.abs(Math.pow(600 / 3600, 0.4) - 0.488) < 0.01;
        })());
        ok('audit spot-checks (Daring HP, accuracy, aggro)', (() => {
          const d = (spellByName.get('daring') || [])[0];
          const he = (spellByName.get('hawk eye') || [])[0];
          const vd = (spellByName.get('voice of darkness') || [])[0];
          return d && d.eff.hp > 0 && he && he.eff.acc > 0 && vd && vd.eff.hate > 0;
        })());
        ok('heals are not buffs: HoTs + Echo heals stay out of the planner pool', (() => {
          const heals = ['celestial healing', 'celestial elixir', 'echo of health', 'sacred echo', 'blooming heal'];
          return heals.every(n => !((spellByName.get(n) || []).some(sp => sp.cls)));
        })());
        ok('invulnerability spells are not mistaken for heals (Harmshield, Divine Barrier)', (() => {
          return ['harmshield', 'divine barrier', 'divine aura'].every(n => (spellByName.get(n) || []).some(sp => sp.cls));
        })());
        ok('audit decodes: extra haste, song power, spell dmg, reflect, all resists, fizzle', (() => {
          const g = (n) => (spellByName.get(n) || []).find(sp => sp.cls) || {};
          const e = (n) => g(n).eff || {};
          return e('melody of ervaj').haste2 === 5 && e('amplification').songmod > 0 && e("rizlona's embers").spelldmg === 15 &&
            e('bounce').reflect === 40 && e('savagery').svM === 50 && e('savagery').svP === 50 &&
            e('intellectual superiority').fizzle === 6;
        })());
        ok('utility spells land in utility keys, mob-calming spells leave the pool', (() => {
          const g = (n) => (spellByName.get(n) || []).find(sp => sp.cls);
          const e = (n) => (g(n) || {}).eff || {};
          return e('invisibility versus undead').ivu && e('invisibility versus animals').iva && e('eye of zomm').scout &&
            e('divine aura').invuln && e('calming visage').hatedown &&
            ['calm', 'lull', 'pacify', 'soothe', 'harmony of nature', 'promised renewal'].every(n => !g(n));
        })());
        ok('rogue poisons: classified from descriptions, no gems, ≤3 combat (Cobra over Asp) + utility list', (() => {
          const g = (n) => (spellByName.get(n) || []).find(sp => sp.cls) || {};
          if (g('cobra venom').poison !== 'combat' || g('paralytic poison').poison !== 'utility') return false;
          const lo = buildLoadout(['ROG', '', ''], [], 20, 'both', 3, false);
          if (lo.some(p => p.sp.poison)) return false;               // poisons never spend gems
          const pz = poisonPlan(plannerModel(['ROG', '', '']));
          const names = pz ? pz.combat.map(e => e.sp.n) : [];
          return names.length >= 1 && names.length <= 3 && names.includes('Cobra Venom') && !names.includes('Asp Venom') &&
            pz.utility.length >= 1;
        })());
        ok('cleric Blessing lines decode (heal per hit, cast speed)', (() => {
          const g = (n) => (spellByName.get(n) || []).find(sp => sp.cls && sp.cls.CLR);
          const pg = g('blessing of the page'), lc = g('blessing of the lord commander'), pi = g('blessing of piety'), fa = g('blessing of faith');
          return pg && pg.eff && pg.eff.meleeheal === 1 && lc && lc.eff && lc.eff.meleeheal === 6 &&
            pi && pi.eff && pi.eff.spellhaste === 10 && fa && fa.eff && fa.eff.spellhaste === 10 &&
            pi.hasteLv === 39 && fa.hasteLv === 61;
        })());
        ok('regen BUFFS still count (Regeneration, Chloroplast)', (() => {
          const r = (spellByName.get('regeneration') || [])[0], c = (spellByName.get('chloroplast') || [])[0];
          return r && r.eff && r.eff.hpregen > 0 && c && c.eff && c.eff.hpregen > 0;
        })());
        ok('not-yet-in-Legends spells stay out of the pool (Temperance)', (() => {
          const t = (spellByName.get('temperance') || [])[0], b = (spellByName.get('blessing of temperance') || [])[0];
          return !(t && t.cls) && !(b && b.cls);
        })());
        console.log('SPELLVERIFY|DONE');
      })();
      return;
    }
    if (tab === 'verify25') { // dev-only: v2.5.0 assertions against the REAL game files
      const ok = (name, cond, extra) => console.log('VERIFY25|' + (cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' = ' + JSON.stringify(extra) : ''));
      // tabs: nine, in the agreed order, needs + class present
      const tabOrder = [...document.querySelectorAll('.tab[data-tab]')].map(t => t.dataset.tab);
      ok('nine tabs in order', JSON.stringify(tabOrder) === JSON.stringify(['meter', 'loot', 'needs', 'quests', 'class', 'timers', 'map', 'lookup', 'notes']), tabOrder);
      // wiki export lives in settings now, not the loot bar
      ok('wiki export moved to settings', !!$('l-export').closest('#settings') && !$('l-export').closest('#view-loot'));
      // achievements parser: real Conquest counters carry cur/max
      const conq = achSection(/^Slayer: Conquest$/i);
      const dead = conq && conq.achievements.find(a => /We Are the Dead/i.test(a.name));
      const dobj = dead && dead.objectives.find(o => o.max);
      ok('Conquest counter parsed from export', !!dobj && dobj.cur > 0 && dobj.max >= 5000, dobj && dobj.cur + '/' + dobj.max);
      ok('slyPct sane', !!dead && slyPct(dead) > 0 && slyPct(dead) < 1, dead && Math.round(slyPct(dead) * 100) + '%');
      // race-target faction warning comes from the export itself
      const ru = slyRaceUnlockFactions('Barbarian');
      ok('Barbarian slayer warning factions from export', !!ru && ru.factions.includes('Wolves of the North') && ru.factions.length >= 3, ru && ru.factions);
      // slayer renders rows
      setTab('quests'); setQuestView('__slayer'); renderQuests();
      ok('Slayer view renders', $('q-list').children.length > 3, $('q-list').children.length + ' nodes');
      // own /who row teaches trio + level
      const who = EQLParser.parseLine('[Mon Oct 12 21:00:00 2026] [50 SHD/SHM/ENC] Maeel (Dark Elf) <The Walking Dads> ZONE: The Feerrott (feerrott)  ');
      ok('/who row parses trio + level', !!who && who.player === 'Maeel' && who.level === 50 && JSON.stringify(who.trio) === '["SHD","SHM","ENC"]', who && { p: who.player, l: who.level, t: who.trio });
      handleLogLines(['[Mon Oct 12 21:00:00 2026] [50 SHD/SHM/ENC] Maeel (Dark Elf) <The Walking Dads> ZONE: The Feerrott (feerrott)  ']);
      ok('trio detected into settings', JSON.stringify(settings.myTrio) === '["SHD","SHM","ENC"]', settings.myTrio);
      // gear scoring machinery
      const fake = { n: 'T', slots: ['CHEST'], classes: ['SHD'], stats: { ac: 10, hp: 20 }, ob: 'drop' };
      ok('gearScore weighs stats', gearScore(fake, { ac: 2, hp: 1 }) === 40, gearScore(fake, { ac: 2, hp: 1 }));
      // full-upgrade comparison: +10 doubles stats (10%/tier, floor, +1/tier min)
      ok('gearScore at +10 uses upgraded stats', gearScore(fake, { ac: 2, hp: 1 }, 10) === 80, gearScore(fake, { ac: 2, hp: 1 }, 10));
      ok('low stats get the +1/tier minimum', upStat(3, 10) === 13 && upDmg(12, 10) === 22, [upStat(3, 10), upDmg(12, 10)]);
      ok('trioCanWear class gate', trioCanWear(fake, ['SHD', 'SHM', 'ENC']) && !trioCanWear(fake, ['WAR', 'CLR', 'DRU']));
      const shield = { n: 'S', slots: ['SECONDARY'], stats: { ac: 20 } };
      ok('weapon filter: shield', weaponTypeOk(shield, 'SECONDARY', 'shield') && !weaponTypeOk({ skill: '1H SLASHING', slots: ['SECONDARY'], stats: {} }, 'SECONDARY', 'shield'));
      // worn gear read from the REAL inventory export
      const worn = wornBySlot('Chest');
      ok('worn Chest from inventory export', worn.some(n => /Lustrous Russet Breastplate/i.test(n)), worn);
      // spell quests: auto-check against the REAL inventory
      const llq = SPQ.QUESTS.find(q => q.key === 'lifeleech');
      const necklace = llq.items.find(i => /White Gold Necklace/i.test(i.name));
      ok('quest piece auto-checks from inventory', spqHave(spqState('lifeleech'), necklace));
      const orb = llq.items.find(i => /Crystalline Orb/i.test(i.name));
      ok('unowned quest piece stays open', !spqHave(spqState('lifeleech'), orb));
      const before = spellQuestNeeds('Nagafen\'s Lair').length;
      spellQuestState['lifeleech'] = { sel: true, done: false, items: {} };
      const after = spellQuestNeeds('Nagafen\'s Lair');
      ok('tracked quest feeds zone needs', before === 0 && after.length === 1 && after[0].item === 'Crystalline Orb', after);
      delete spellQuestState['lifeleech'];
      // login reminder gating
      const savedUS = settings.usedSlayer, savedPC = settings.posClasses, savedUU = settings.usedUnlocks;
      settings.usedSlayer = false; settings.usedUnlocks = false; settings.posClasses = [];
      ok('achievements reminder gated OFF when unused', !outfileWanted('achievements') && !outfileWanted('factions'));
      settings.usedSlayer = true;
      ok('achievements + factions reminder ON for slayer users', outfileWanted('achievements') && outfileWanted('factions'));
      ok('inventory reminder always on', outfileWanted('inventory'));
      settings.usedSlayer = savedUS; settings.posClasses = savedPC; settings.usedUnlocks = savedUU;
      // ⭐ wish list + the item page's own "Drops From" -> zone needs
      {
        const wk = verdictKey('Bow of the Underfoot');
        const savedZone = currentZone, savedZD = zoneData;
        wishList[wk] = { name: 'Bow of the Underfoot', added: Date.now() };
        wishDropCache.set(wk, { zones: [{ zone: 'The Hole', mobs: ['a rock golem'] }] });
        currentZone = 'The Hole'; zoneData = null;
        const zn = buildZoneNeeds();
        const row = zn.rows.find(r => r.g === 'wish' && r.item === 'Bow of the Underfoot');
        ok('wished item placed by ITS OWN wiki page (The Hole)', !!row && row.mobs.includes('a rock golem'), row);
        // Ed's exact field case: game name ≠ wiki name, bridged by the zone
        // guide's resolved page title
        currentZone = 'The Ruins of Old Paineel'; zoneData = { pageTitle: 'The Hole', named: [] };
        const znA = buildZoneNeeds();
        ok('game zone name bridges to wiki name (Ruins of Old Paineel = The Hole)',
          znA.rows.some(r => r.g === 'wish' && r.item === 'Bow of the Underfoot'), znA.rows.filter(r => r.g === 'wish'));
        currentZone = 'Lavastorm Mountains'; zoneData = null;
        const zn2 = buildZoneNeeds();
        ok('…and stays zone-scoped (not shown elsewhere)', !zn2.rows.some(r => r.g === 'wish' && r.item === 'Bow of the Underfoot'));
        ok('instance zones still match (The Hole (instance))', !!wishWikiHere(wk, ['The Hole (instance)']));
        // the exact cached shape on Ed's machine: dropsfrom TEXT, no sections
        const pz = parseDropsfromText('The Hole\n* a rock golem');
        ok('dropsfrom text parses (zone + mob)', pz.length === 1 && pz[0].zone === 'The Hole' && pz[0].mobs[0] === 'a rock golem', pz);
        ok('prose dropsfrom is not mistaken for a zone', parseDropsfromText('Rare drop off any rock golem in the depths.').length === 0);
        delete wishList[wk]; wishDropCache.delete(wk); currentZone = savedZone; zoneData = savedZD;
      }
      console.log('VERIFY25|DONE');
      return;
    }
    if (tab.startsWith('spellqdemo')) { // dev-only: track Life Leech, show the view ('spellqdemo:needs' shows the needs tab in Lower Guk)
      spellQuestState['lifeleech'] = { sel: true, done: false, items: {} };
      spqExpanded.add('lifeleech');
      if (tab.endsWith(':needs')) {
        setZone('Nagafen\'s Lair', { autoFetch: false });
        setTab('needs');
        renderNeedsTab();
        console.log('SPQNEEDS|' + JSON.stringify(buildZoneNeeds().rows.filter(r => r.g === 'spellq')));
      } else {
        setTab('quests');
        setQuestView('__spellq');
        renderQuests();
      }
      return;
    }
    if (tab.startsWith('classdemo')) { // dev-only: seeded Class tab ('classdemo:gear' | 'classdemo:buffs')
      (async () => {
        const t0 = Date.now();
        while (!spellDB && !spellDbError && Date.now() - t0 < 30000) await new Promise(r => setTimeout(r, 300));
        settings.myTrio = settings.myTrio || ['SHD', 'SHM', 'ENC'];
        settings.classChip = tab.endsWith(':buffs') ? 'buffs' : 'gear';
        handleLogLines([
          '[Tue Oct 13 12:00:00 2026] A light breeze slips through your mind.',
          '[Tue Oct 13 12:00:02 2026] You become one with your weapons.',
          '[Tue Oct 13 12:00:04 2026] Your body pulses with the spirit of the wolf.'
        ]);
        if (!gearCatalog) {
          gearCatalog = { built: Date.now(), items: [
            { n: 'Lustrous Russet Breastplate', slots: ['CHEST'], classes: ['WAR', 'PAL', 'SHD', 'CLR'], stats: { ac: 32, str: 9, sta: 9 }, ob: 'drop', src: 'Phase Spider Queen, Castle Mistmoore' },
            { n: 'Breastplate of Eradication', slots: ['CHEST'], classes: ['SHD'], stats: { ac: 40, str: 15, sta: 10, hp: 50 }, haste: 0, ob: 'drop', src: 'Innoruuk, The Plane of Hate' },
            { n: 'Woven Shadow Tunic', slots: ['CHEST'], classes: ['ALL'], stats: { ac: 18, agi: 9, hp: 35 }, ob: 'quest', src: 'reward: Shadows of Neriak' },
            { n: 'Blackened Alloy Breastplate', slots: ['CHEST'], classes: ['WAR', 'SHD'], stats: { ac: 25, sta: 5 }, ob: 'craft', src: 'Blacksmithing (trivial 188)' }
          ] };
          gearByName = null;
        }
        clExpanded.add('CHEST');
        setTab('class');
        renderClassTab();
      })();
      return;
    }
    if (tab.startsWith('slayerx:')) { // dev-only: expand one slayer achievement
      setTab('quests');
      setQuestView('__slayer');
      renderQuests();
      slyFindAndExpand(tab.slice(8));
      return;
    }
    if (tab.startsWith('slyroute:')) { // dev-only: open the 🧭 route read-out in the dock
      setTab('quests');
      setQuestView('__slayer');
      renderQuests();
      const want = tab.slice(9).toLowerCase();
      for (const s of SLY_SECTIONS) {
        const sec = achSection(s.re);
        const a = sec && sec.achievements.find(x => x.name.toLowerCase() === want);
        if (a) { openSlayerRoute(a, s.key); break; }
      }
      return;
    }
    if (tab.startsWith('qview:')) { // dev-only: 'qview:__unlocks' / '__epics' / '__bis' / zone name
      setTab('quests');
      const v = tab.slice(6);
      if (/^__/.test(v)) setQuestView(v); else { setQuestView(''); $('q-zone').value = v; }
      renderQuests();
      return;
    }
    if (tab.startsWith('world')) { // dev-only: 'world' or 'world:targetshort'
      setTab('map');
      const target = tab.split(':')[1];
      if (target) { worldState.routeTarget = target; drawMap(); }
      return;
    }
    if (tab === 'afkdemo') { // dev-only: AFK on + simulated incoming attack
      if (!afkMode) $('afk-btn').click();
      handleLogLines(['[Wed Aug 06 22:00:00 2026] Drelzna pierces YOU for 30 points of damage.']);
      return;
    }
    if (tab === 'settings') { setTab('meter'); document.body.classList.add('settings-open'); return; }
    if (tab === 'lockedview') { document.body.classList.remove('settings-open'); setLocked(true); return; }
    if (tab.startsWith('style:')) { // dev-only: apply style overrides and show meter
      try { Object.assign(settings, JSON.parse(tab.slice(6))); } catch {}
      document.body.classList.remove('settings-open');
      setLocked(false);
      applySettings();
      setTab('meter');
      return;
    }
    setTab(tab);
  });

