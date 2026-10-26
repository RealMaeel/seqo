// SEQO overlay — log feed: every log line in, dispatched to the features; toasts.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= log feed =================
  // your class makeup for each kill record (2.7, trioguess.js): /who rows, your casts,
  // and buffs landing on you while solo. Seeded with the trio your last /who showed.
  let trioG = null, trioGDB = null, lastGroupT = 0, lastFeedT = 0;
  const SOLO_MS = 10 * 60000;
  function trioGuess() {
    if (!window.EQLTrioGuess || !spellDB || !spellDB.book) return null;
    if (trioGDB !== spellDB) {
      trioG = EQLTrioGuess.create({ book: spellDB.book, landMap: spellDB.landMap, spells: spellDB.spells });
      trioGDB = spellDB;
      if (settings && Array.isArray(settings.myTrio)) trioG.who(settings.myTrio, Date.now());
    }
    return trioG;
  }
  function handleLogLines(lines) {
    const now = Date.now();
    if (now - lastFeedT > 30 * 60000 && trioG) trioG.newSession();   // back after a break: spell clues start over
    lastFeedT = now;
    for (const l of lines) {
      noteLogTime(l);   // login detection for the outputfile reminder
      if (caCompiled.length) checkCustomAlerts(l);
      // fade-watch: exact-line matches rename a fade to its spell name and
      // take priority over the generic fade handler below
      if (fadeWatch.size) {
        const msg = l.slice(l.indexOf('] ') + 2);
        const spell = fadeWatch.get(msg);
        if (spell) { buffAlert('Buff dropped: ' + spell, 'fw|' + spell); continue; }
      }
      const ev = EQLParser.parseLine(l);
      if (!ev) {
        // unparsed flavor line: remember it briefly for fade attribution,
        // and check it against the game's exact cast-on-you lines (a lasting
        // effect landing on you -> the live buff tracker)
        const msg = l.slice(l.indexOf('] ') + 2);
        if (msg) { noteBuffLand(msg); noteFlavor(msg, Date.now()); const g = trioGuess(); if (g && !g.groupLine(msg)) g.landed(msg, now, now - lastGroupT > SOLO_MS); }
        continue;
      }
      if (ev.type === 'cast') {
        lastAnyCast = { spell: ev.spell, when: Date.now() };
        if (ev.caster === 'You') onYouCast(ev.spell);
        else noteMobSpell(ev.caster, ev.spell);
      } else if (ev.type === 'castfail') {
        onCastFail(ev.spell);
        if (ev.reason === 'interrupted' || ev.reason === 'fizzled') cancelCooldown(ev.spell || (lastYouCast && lastYouCast.spell));
      }
      if (ev.type === 'cast' && ev.caster === 'You') { startCooldown(ev.spell); const g = trioGuess(); if (g) g.cast(ev.spell, now); }
      tracker.feed(ev);
      if (ev.type === 'damage' && ev.attacker !== 'You' && !ev.pet && /^[A-Z][a-z]+$/.test(ev.attacker || '') && tracker.current &&
          tracker.current.enemies.has(ev.target) && !tracker.current.enemies.has(ev.attacker)) lastGroupT = now;   // someone else in the fight
      noteHeal(ev);
      noteChat(ev);
      notePrices(ev);
      noteProgress(ev);
      if (ev.type === 'consider') {
        if (ev.rare && !isUserRare(ev.mob) && !isNotRare(mobKey(ev.mob))) setUserRare(ev.mob, true);
        showConsiderCard(ev);
      }
      noteRecap(ev);
      noteStance(ev);
      noteHistory(ev);
      checkAfk(ev);
      // learn spell alignment from what spells actually do
      if (ev.type === 'damage' && ev.spell) learnSpellClass(ev.spell, 'detrimental');
      else if (ev.type === 'heal' && ev.spell) learnSpellClass(ev.spell, 'beneficial');
      // rare-spawn detection + repop confirmation: any activity from a tracked mob
      if (ev.type === 'cast') {
        if (ev.caster === 'You') lastYouCast = { spell: ev.spell, when: ev.when };
        checkRare(ev.caster, ev.when); markUp(ev.caster);
      }
      else if (ev.type === 'damage') {
        checkRare(ev.attacker, ev.when); checkRare(ev.target, ev.when);
        markUp(ev.attacker); markUp(ev.target);
        if (ev.kind === 'melee' && ev.attacker !== 'You') noteMobHit(ev.attacker, ev.amount);
      } else if (ev.type === 'miss') {
        checkRare(ev.attacker, ev.when); checkRare(ev.target, ev.when);
        markUp(ev.attacker); markUp(ev.target);
      }

      if (ev.type === 'death' && ev.target !== 'You') {
        { const g = trioGuess(), mk = g && g.makeup(now);   // variant → difficulty tier 0-4; your makeup; group (1) or solo (0)
          window.overlay.recordKill(ev.target, currentZone, ev.when, tracker.engagedSecs(ev.target, ev.when), currentZoneVariant,
            mk ? mk.text : '', tracker.othersInFight().length ? 1 : 0); }
        lastCorpse = { mob: ev.target, when: ev.when };
        if (lootRun) { // run tracker: named/rare kills checklist
          const rk = mobKey(ev.target);
          if (isRunRare(rk)) {
            lootRun.rares.set(rk, (lootRun.rares.get(rk) || 0) + 1);
            toast('⭐ Rare down: ' + rk);
            if (activeTab === 'loot') renderRunBox();
          }
        }
        killNeedHeadsUp(ev.target); // "this corpse can hold something you need"
        // your charm pet died (killed by someone else - killing it yourself
        // means it was an ordinary enemy with the same name)
        if (activeCharm && mobKey(ev.target) === activeCharm && ev.killer !== 'You') {
          toast('💀 Your charmed ' + activeCharm + ' died');
          setActiveCharm(null);
        }
        onKill(ev);
      } else if (ev.type === 'loot') {
        // kept-item lines have no mob name: attribute to the last kill (2 min window)
        let mob = ev.mob;
        if (!mob && lastCorpse && ev.when - lastCorpse.when < 120000) mob = lastCorpse.mob;
        if (mob) window.overlay.recordDrop(mob, ev.item, currentZone);
        // verdict BEFORE the quest auto-check, so THIS copy isn't judged a spare
        const verdict = lootVerdict(ev.item);
        if (!ev.sold) posQuestLoot(ev.item); // an auto-sold item never reached your bags — no quest progress
        if (lootRun) { // run tracker: count every looted item (and instant-sells as coin)
          lootRun.items.set(ev.item, (lootRun.items.get(ev.item) || 0) + (ev.count || 1));
          if (ev.soldFor) lootRun.coin += ev.soldFor;
        }
        if (!ev.sold) { // live check-off: Epics/BiS/Unlocks see this drop immediately
          const lk = normItemName(ev.item);
          lootedLive.set(lk, (lootedLive.get(lk) || 0) + (ev.count || 1));
          if (activeTab === 'quests' && qView) renderQuests();
        }
        needsDirty = true; pendingNeedsFlash = ev.item; // live counters + row flash (coalesced in the 500ms loop)
        if (ev.mob) lastCorpse = { mob: ev.mob, when: ev.when };
        recentDrops.unshift({ item: ev.item, mob: mob || '(unknown)', verdict });
        recentDrops = recentDrops.slice(0, 8);
        if (ev.soldFor) sessionCoin += ev.soldFor;
        // notable-only toasts: personal keep/junk speak up; quest keeps already
        // toast via the quest tracker; everything else stays quiet
        if (ev.sold && (verdict.kind === 'wish' || verdict.kind === 'keep'))
          // the loot filter just sold something you actually NEED — shout
          alertFX('⚠ Your loot filter AUTO-SOLD ' + ev.item + ' — but you still need it! (' + verdict.reason + ')', 'afk');
        else if (verdict.kind === 'wish')
          alertFX('🌟 WISH LIST DROP: ' + ev.item + '!', 'rare');
        else if (verdict.toast)   // epic-prep / BiS drops you still need
          alertFX(verdict.toast, 'rare');
        else if (itemVerdicts[verdictKey(ev.item)])
          toast((verdict.kind === 'junk' ? '🗑 ' : '⭐ ') + ev.item + ' — ' + verdict.label + ' (' + verdict.reason + ')');
        else
          toast('\u{1F4B0} ' + ev.item + (mob ? '  —  ' + mob : '') + (priceTag(ev.item) ? '  ·  sells ' + priceTag(ev.item) : ''));
        lootDirty = true;
      } else if (ev.type === 'destroyed') {
        // it left your bags: the cleanup window and live counts follow
        const lk = normItemName(ev.item);
        if (lootedLive.has(lk)) {
          const left = (lootedLive.get(lk) || 0) - ev.count;
          if (left > 0) lootedLive.set(lk, left); else lootedLive.delete(lk);
        }
        if (gameFiles && gameFiles.inventory) {
          for (const [k, it] of Object.entries(gameFiles.inventory.items || {}))
            if (normItemName(k) === lk) {
              it.count -= ev.count;
              if (it.count <= 0) { delete gameFiles.inventory.items[k]; gameFiles.inventory.__idx = null; }
            }
        }
        cleanupDirty = true;
      } else if (ev.type === 'vendored') {
        // sold to a vendor: the cleanup window and live counts follow
        const vk2 = normItemName(ev.item);
        if (lootedLive.has(vk2)) {
          const left = (lootedLive.get(vk2) || 0) - ev.count;
          if (left > 0) lootedLive.set(vk2, left); else lootedLive.delete(vk2);
        }
        if (gameFiles && gameFiles.inventory) {
          for (const [k, it] of Object.entries(gameFiles.inventory.items || {}))
            if (normItemName(k) === vk2) {
              it.count -= ev.count;
              if (it.count <= 0) { delete gameFiles.inventory.items[k]; gameFiles.inventory.__idx = null; }
            }
        }
        cleanupDirty = true;
        needsDirty = true;
      } else if (ev.type === 'exp') {
        xp.kills++;
        if (!xp.first) xp.first = ev.when;
        xp.last = ev.when;
        if (ev.pct !== undefined) { xp.pct += ev.pct; if (xp.dingSeen) xp.sinceDing += ev.pct; }
        else xp.noPct++;
        renderXpStrip();
      } else if (ev.type === 'keyring') {
        // counts as held right away, like live loot
        const kk = normItemName(ev.item);
        lootedLive.set(kk, (lootedLive.get(kk) || 0) + 1);
        const kq = UNL.KEY_QUESTS && Object.values(UNL.KEY_QUESTS).find(q => q.keyItem && normItemName(q.keyItem) === kk);
        if (kq) toast('🔑 ' + ev.item + ' — ' + kq.opens + ' is open to you!');
        if (activeTab === 'quests' && qView === '__unlocks') renderQuests();
      } else if (ev.type === 'achievement') {
        achDoneLive.add(ev.name);
        const kq = UNL.KEY_QUESTS && UNL.KEY_QUESTS[ev.name];
        if (kq) toast('🔑 ' + ev.name + ' complete — ' + kq.opens + ' is open to you!');
        if (activeTab === 'quests' && qView === '__unlocks') renderQuests();
      } else if (ev.type === 'levelup') {
        xp.level = ev.level;
        xp.dingSeen = true;
        xp.sinceDing = 0;
        alertFX('🎉 DING! Welcome to level ' + ev.level + '!', 'repop');
        renderXpStrip();
      } else if (ev.type === 'aa') {
        xp.aaGained += ev.gained;
        xp.aaTotal = ev.total;
        toast('✦ +' + ev.gained + ' AA point' + (ev.gained === 1 ? '' : 's') + ' — ' + ev.total + ' total');
        renderXpStrip();
      } else if (ev.type === 'consider') {
        noteMobLevel(ev.mob, ev.level);
      } else if (ev.type === 'lootfull') {
        alertFX('🎒 Inventory FULL — item left on the corpse!', 'repop');
      } else if (ev.type === 'coin') {
        sessionCoin += ev.copper;
        if (lootRun) lootRun.coin += ev.copper;
        lootDirty = true;
      } else if (ev.type === 'zone') {
        currentZoneVariant = ev.variant || '';
        lastZoneChangeAt = ev.when;        // kill gaps never learn across a zone line
        currentZoneInst = !!ev.inst;       // instanced copies never teach timers
        setZone(ev.zone, { autoFetch: true });
        save({ lastZone: cleanZoneName(ev.zone) });
        if (currentZoneVariant) toast('Zone tier: ' + currentZoneVariant + ' — data recorded separately');
        // auto-start runs on zoning (optional): never stops one by itself —
        // ⏹ End run stays yours. Only fires on a real, recent zone change.
        if (settings && settings.autoRun && !lootRun && ev.zone && Date.now() - ev.when < 120000) {
          toggleRun();
        } else if (ev.inst && !lootRun && Date.now() - lastRunNudge > 180000 && Date.now() - ev.when < 120000) {
          // entering an instanced copy without a run going: nudge once
          lastRunNudge = Date.now();
          toast('▶ Instance entered — Start run on the Loot tab to track loot, coin & rare kills');
        }
      } else if (ev.type === 'petsay') {
        const pname = mobKey(ev.name);
        if (/^(a|an|the) /.test(pname)) {
          // article name = charmed mob: replaces any previous charm
          if (activeCharm !== pname) {
            setActiveCharm(pname);
            meterDirty = true;
          }
        } else if (!petNames.has(pname)) {
          petNames.add(pname);            // summoned pet: persists
          window.overlay.learnPet(pname);
          meterDirty = true;
        }
      } else if (ev.type === 'bufffade') {
        // exact resolution first: the game's own string table maps this fade
        // line to the spell(s) that produce it
        const exact = spellFadeNames(ev.effect, ev.verb || 'fades');
        if (exact && exact.length) {
          // if one of the candidates is tracked as active on you, it's THAT one
          const active = exact.find(n => activeBuffs.has(n.toLowerCase()));
          const b = active && activeBuffs.get(active.toLowerCase());
          if (active) { activeBuffs.delete(active.toLowerCase()); classDirty = true; }
          const label = active || (exact.length <= 3 ? exact.join(' / ') : exact[0] + ' (+' + (exact.length - 1) + ' alike)');
          if (b && b.ben === false) buffAlert('Debuff gone: ' + label, ev.effect);
          else buffAlert('Buff fade: ' + label, ev.effect);
        } else {
          const info = fadeInfo(ev.effect);
          if (!info) buffAlert('Faded: ' + ev.effect, ev.effect);
          else if (info.kind === 'debuff') buffAlert('Debuff gone: ' + info.label, ev.effect);
          else buffAlert('Buff fade: ' + info.label, ev.effect);
        }
      } else if (ev.type === 'invisfade') {
        invisAlert('👻 Invisibility is FADING — move to safety!');
      } else if (ev.type === 'invisdrop') {
        invisAlert('👁 You are VISIBLE!');
      } else if (ev.type === 'wornoffself') {
        onSpellWornOff(ev.spell);
        if (/invis|camouflage|gather shadows/i.test(ev.spell)) {
          invisAlert('👁 ' + ev.spell + ' wore off — you are VISIBLE!');
        } else if (spellClass[ev.spell] !== 'detrimental') {
          buffAlert('Buff dropped: ' + ev.spell, ev.spell);
        }
      } else if (ev.type === 'wornoffpet') {
        buffAlert("Pet's buff dropped: " + ev.spell, 'pet:' + ev.spell);
      } else if (ev.type === 'mezzed') {
        // AE mez: one landing line per target -> one labeled chip per mob
        onSpellLanded(mobKey(ev.target), ev.when);
        mezSeen.set(mobKey(ev.target), Date.now());
      } else if (ev.type === 'awakened') {
        // mez broken by damage: only THAT mob's chip retires
        onSpellBroken(mobKey(ev.target));
        const mk = mobKey(ev.target);
        if (Date.now() - (mezSeen.get(mk) || 0) < 10 * 60000) {   // a mez we saw land
          mezSeen.delete(mk);
          ccAlert(mk, 'mez', '😳 Mez broke: ' + mk + (ev.by && ev.by !== mk ? ' (woken by ' + ev.by + ')' : '') + '!');
        }
      } else if (ev.type === 'charmed') {
        // direct charm landing line: bulletproof charm identity
        setActiveCharm(mobKey(ev.target));
        meterDirty = true;
        toast('🐾 Charmed: ' + mobKey(ev.target));
      } else if (ev.type === 'wornoff') {
        // a tracked spell wore off one mob: retire that mob's timer chip
        onSpellWornOff(ev.spell, ev.target);
        // a charm spell wearing off IS a break, whether or not the pet ever spoke
        const ccK = ccKindOf(ev.spell);
        if (ccK && !CHARM_SPELLS.has(ev.spell)) {
          const mk = mobKey(ev.target);
          if (ccK === 'mez') mezSeen.delete(mk);
          ccAlert(mk, ccK, (ccK === 'mez' ? '😴 Mez wore off: ' : '🐢 Slow wore off: ') + mk + ' (' + ev.spell + ')');
        }
        if (CHARM_SPELLS.has(ev.spell)) {
          alertFX('💔 Charm broke: ' + mobKey(ev.target) + '!', 'charm');
          if (activeCharm === mobKey(ev.target)) setActiveCharm(null);
          meterDirty = true;
        } else {
          // buffs you cast on yourself-by-name, your pet, or a groupmate;
          // debuffs expiring on enemies stay silent
          const tgt = mobKey(ev.target);
          if ((tgt === charName || petNames.has(tgt)) && spellClass[ev.spell] !== 'detrimental') {
            buffAlert('Buff dropped: ' + ev.spell + ' (' + tgt + ')', ev.spell + '|' + tgt);
          }
        }
      } else if (ev.type === 'zonemap') {
        if (learnedZoneMap[ev.longName] !== ev.shortName) {
          learnedZoneMap[ev.longName] = ev.shortName;
          window.overlay.learnZoneMap(ev.longName, ev.shortName);
        }
        // YOUR OWN /who row is authoritative about where you are — the only
        // zone signal when a zone logs no entry line (the planes) or the log
        // was cleared mid-session
        if (ev.player && charName && ev.player.toLowerCase() === charName.toLowerCase()) {
          // your own /who row also carries your LEVEL and TRIO — remember both
          // (the Class tab auto-detects your makeup from this)
          if (ev.trio && ev.trio.length === 3) { const g = trioGuess(); if (g) g.who(ev.trio, now); }
          if (ev.trio && ev.trio.length === 3 && JSON.stringify(ev.trio) !== JSON.stringify(settings && settings.myTrio)) {
            save({ myTrio: ev.trio });
            if (settings) settings.myTrio = ev.trio;
            classDirty = true;
            toast('🛡 Trio detected from /who: ' + ev.trio.join('/'));
          }
          if (ev.level && settings && ev.level !== settings.myLevel) { save({ myLevel: ev.level }); settings.myLevel = ev.level; }
          if (cleanZoneName(ev.longName) !== currentZone) {
            lastZoneChangeAt = ev.when;
            currentZoneInst = !!ev.inst;
            setZone(ev.longName, { autoFetch: true });
            save({ lastZone: cleanZoneName(ev.longName) });
            toast('📍 Zone set from /who: ' + cleanZoneName(ev.longName));
          }
        }
        // fresh zone knowledge may change where "you are here" glows
        if (activeTab === 'map') drawMap();
      }
    }
    meterDirty = true;
  }
  window.overlay.onLogLines(handleLogLines);

  window.overlay.onLogStatus((st) => {
    const el = $('log-name');
    if (st.path) {
      const base = st.path.split(/[\\/]/).pop();
      el.textContent = base;
      const m = /^eqlog_(.+?)_(.+?)\.txt$/i.exec(base);
      const newChar = m ? m[1] : null;
      if (newChar !== charName) {
        charName = newChar;
        tracker.current = null; tracker.last = null; // fresh meter for new character
        meterDirty = true;
      }
    } else {
      el.textContent = 'none selected';
    }
  });

  window.overlay.onLootDB((db) => { lootDB = db; lootDirty = true; });

  window.overlay.onHotkeyWarn((keys) => {
    toast('⚠ Hotkey(s) ' + keys + ' taken by another app — use the on-screen 🔓 and tray icon instead', true);
  });

  window.overlay.appVersion().then(v => {
    $('dragzone').textContent = 'SEQO v' + v;
    $('version-line').textContent = 'SEQO v' + v;
  });
  window.overlay.getLootDB().then((db) => { lootDB = db; renderLoot(); });

  // ================= toast =================
  let toastTimer = null;
  function toast(msg, rare) {
    const t = $('toast');
    t.textContent = msg;
    t.style.borderColor = rare ? '#ff5d5d' : 'rgba(255,215,102,.5)';
    t.style.color = rare ? '#ff9d9d' : '#ffd766';
    t.style.fontSize = rare ? '14px' : '12px';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), rare ? 8000 : 4000);
  }

