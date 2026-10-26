// SEQO overlay — /outputfile data, live quest data, epic demand, freshness reminders.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= game outputfile data (zero-click sync) =================
  const UNL = window.EQLUnlocks, EPICDB = window.EQLEpics, BISDB = window.EQLBis;

  // ---- live quest data (fetched from the source sites at runtime) ----
  // Built-in js files are the fallback; a successful ⟳ Update quest data (or
  // the weekly auto-refresh) stores fresh data in the game DB and it wins.
  let epicsLive = null, unlocksLive = null, posLive = null;
  const epicItemsFor = (cls) => {
    const live = epicsLive && epicsLive.data && epicsLive.data[cls];
    return (live && live.length) ? live : ((EPICDB.EPICS[cls] || {}).items || []);
  };
  // hint + turn-in totals for a faction: live guide data wins, built-in fills in.
  // (older cached live data stored plain hint strings — handle both shapes)
  const grindData = (f) => {
    const live = unlocksLive && unlocksLive.data && unlocksLive.data[f];
    const builtin = UNL.FACTION_GRINDS[f] || {};
    const hint = (typeof live === 'string' ? live : live && live.hint) || builtin.hint || null;
    const needs = Object.assign({}, builtin.needs || {},
                                (live && typeof live === 'object' && live.needs) || {});
    return { hint, needs, routes: builtin.routes || null };
  };
  const grindHintFor = (f) => grindData(f).hint;

  // ---- epic demand engine ----
  // How many of an item your selected classes still want, understanding the
  // sub-quest recipes in epics.js FEEDS: owning a crafted reward (Darkforge
  // Breastplate) silences the ingredients that make it (Decayed pieces), a
  // chain of rewards works (Decrepit Sheath → Corrupted Ghoulbane), owning
  // the finished epic silences the whole class, and manual tick-offs cover
  // turn-ins the inventory file can't see.
  const feedsFor = (cls) => (EPICDB.FEEDS && EPICDB.FEEDS[cls]) || [];
  let epicTicks = {};   // 'cls|item' -> true: manually marked as handed in
  window.overlay.getEpicTicks().then((t) => { epicTicks = t || {}; });
  const tickKey = (cls, n) => cls + '|' + normItemName(n);
  const isTicked = (cls, n) => !!epicTicks[tickKey(cls, n)];
  function toggleEpicTick(cls, name) {
    const k = tickKey(cls, name);
    if (epicTicks[k]) delete epicTicks[k]; else epicTicks[k] = true;
    window.overlay.setEpicTick(k, !!epicTicks[k]);
    needsDirty = true;
  }

  // a product (sub-quest reward) no longer needs its ingredients when you own
  // it, ticked it off, own something it feeds into, or own the finished epic
  function productSatisfied(cls, name, seen) {
    seen = seen || new Set();
    const k = normItemName(name);
    if (seen.has(k)) return false;
    seen.add(k);
    if (invHas(name) || isTicked(cls, name)) return true;
    for (const f of feedsFor(cls))
      if (Object.keys(f.parts).some(p => normItemName(p) === k) && productSatisfied(cls, f.product, seen))
        return true;
    return false;
  }

  // one class's remaining want for an item: { need, coveredBy[] }
  function epicClassDemand(cls, name) {
    const k = normItemName(name);
    if (isTicked(cls, name)) return { need: 0, coveredBy: ['ticked off by you'] };
    const epicName = (EPICDB.EPICS[cls] || {}).epic;
    if (epicName && epicName !== 'Epic Quest' && invHas(epicName))
      return { need: 0, coveredBy: [epicName + ' finished'] };
    const feeds = feedsFor(cls).filter(f => Object.keys(f.parts).some(p => normItemName(p) === k));
    if (feeds.length) {
      let need = 0; const coveredBy = [];
      for (const f of feeds) {
        const qty = f.parts[Object.keys(f.parts).find(p => normItemName(p) === k)] || 1;
        if (productSatisfied(cls, f.product)) coveredBy.push(f.product + ' owned');
        else need += qty;
      }
      return { need, coveredBy };
    }
    const flat = epicItemsFor(cls).find(it => normItemName(it.n) === k);
    if (flat) return { need: (flat.q > 1 ? flat.q : 1), coveredBy: [] };
    return { need: 0, coveredBy: [] };
  }

  // total demand across the classes selected on the Quests tab
  function epicDemand(name, classes) {
    const per = [];
    let total = 0;
    for (const cls of (classes || qSelClasses())) {
      const d = epicClassDemand(cls, name);
      if (d.need || d.coveredBy.length) per.push({ cls, need: d.need, coveredBy: d.coveredBy });
      total += d.need;
    }
    return { total, per, have: invCount(name) };
  }

  // race-unlock turn-in: still worth keeping only while a faction that eats
  // it isn't maxed. Returns { faction, have, total } or null.
  function grindItemNeed(key) {
    for (const [fname, g] of Object.entries(UNL.FACTION_GRINDS)) {
      const data = grindData(fname);
      const inNeeds = Object.keys(data.needs || {}).some(n => normItemName(n) === key);
      const inItems = (g.items || []).some(n => normItemName(n) === key);
      if (!inNeeds && !inItems) continue;
      const fi = factionInfo(fname);
      if (fi && fi.toMax === 0) continue;         // already maxed — no need
      const needName = Object.keys(data.needs || {}).find(n => normItemName(n) === key);
      const total = needName ? data.needs[needName] : 0;
      return { faction: fname, have: invCount(key), total,
               // partial faction credit: turn-ins left at the CURRENT standing
               left: total && fi && fi.toMax != null ? Math.ceil(total * fi.toMax / 2000) : null };
    }
    return null;
  }
  function applyQuestData(qd) {
    if (!qd) return;
    epicsLive = qd.epicsData || epicsLive;
    unlocksLive = qd.unlocksData || unlocksLive;
    if (qd.posData && Array.isArray(qd.posData.data) && qd.posData.data.length) {
      posLive = qd.posData;
      POS.swap(qd.posData.data);
    }
  }
  window.overlay.getQuestData().then((qd) => {
    applyQuestData(qd);
    if (activeTab === 'quests') renderQuests();
  });
  let gameFiles = null;          // { inventory, achievements, factions } from main
  let bisOverride = null;        // live-scraped BiS data (gameDB.bisData)
  window.overlay.getGameData().then((d) => {
    gameFiles = d;
    syncFromAchievements(true);
    syncFromInventory(true);
    if (activeTab === 'quests') renderQuests();
  });
  window.overlay.getBisData().then((d) => { bisOverride = d; });
  window.overlay.onGamedataUpdated(async () => {
    const prevInvAt = gameFiles && gameFiles.inventory && gameFiles.inventory.mtime;
    gameFiles = await window.overlay.getGameData();
    // a fresh inventory dump now CONTAINS everything looted since the last
    // one — reset the live overlay so counts don't double
    if (gameFiles && gameFiles.inventory && gameFiles.inventory.mtime !== prevInvAt)
      lootedLive.clear();
    syncFromAchievements(false);
    syncFromInventory(false);
    toast('🔄 Game data refreshed from your /outputfile files');
    if (activeTab === 'quests') renderQuests();
    cleanupDirty = true;
    needsDirty = true;
    checkLoginBarDone();   // fresh files may satisfy the login reminder
  });

  // ---- outputfile freshness: per-view reminder bars + a once-per-login toast ----
  const OUTFILES = [
    ['inventory', '/outputfile inventory'],
    ['achievements', '/outputfile achievements'],
    ['factions', '/outputfile faction'],
    ['spellbook', '/outputfile spellbook']
  ];
  const outfileMtime = (kind) => (gameFiles && gameFiles[kind] && gameFiles[kind].mtime) || 0;

  // a slim bar naming the game exports this view feeds on, each with a
  // one-click 📋 copy of the exact command — shown only when a file is
  // missing or stale, gone while everything is fresh
  function outfileBar(kinds) {
    const stale = [];
    for (const kind of kinds) {
      const mt = outfileMtime(kind);
      if (!mt || Date.now() - mt > 60 * 60000 || (loginAt && mt < loginAt)) stale.push({ kind, mt });
    }
    if (!stale.length) return null;
    const bar = document.createElement('div');
    bar.className = 'q-npc outfilebar';
    const lead = document.createElement('span');
    lead.textContent = '📂 Refresh:';
    lead.title = 'This view reads your game exports. Click a chip to copy its /outputfile command, then paste it into the game.';
    lead.style.marginRight = '6px';
    bar.appendChild(lead);
    for (const s of stale) {
      const cmd = OUTFILES.find(o => o[0] === s.kind)[1];
      const chip = document.createElement('span');
      chip.className = 'ofchip';
      chip.textContent = '📋 ' + cmd.replace(/^\/outputfile\s+/, '') + ' · ' + (s.mt ? fmtAge(s.mt) : 'never');
      chip.title = 'Click to copy ' + cmd + ', then paste it into the game’s chat. SEQO picks the new file up by itself within a second.';
      chip.addEventListener('click', () => { window.overlay.copyText(cmd); toast('📋 Copied ' + cmd + ' — paste it in game'); });
      bar.appendChild(chip);
    }
    return bar;
  }

  // login detection: the game's welcome line, or 30+ minutes of log silence
  let lastLineAt = 0, loginAt = 0, loginReminded = false;
  let reminderAt = 0; // the freshness baseline the login popup measures against
  function noteLogTime(l) {
    if (l.charCodeAt(0) !== 91) return; // not "[..." — not a timestamped line
    const ts = Date.parse(l.slice(1, l.indexOf(']')));
    if (isNaN(ts)) return;
    const isWelcome = l.includes('] Welcome to EverQuest');
    if ((lastLineAt && ts - lastLineAt > 30 * 60000) || isWelcome) {
      loginAt = ts;
      reminderAt = ts;
      loginReminded = false;
      setTimeout(maybeLoginReminder, 1200);
    }
    if (ts > lastLineAt) lastLineAt = ts;
  }

  // SEQO started AFTER the game did (no login line will ever scroll past):
  // treat launch as the session start — exports older than an hour are stale
  // enough to ask for. Runs once, after the game files have had time to load.
  setTimeout(() => {
    if (!reminderAt && !loginReminded && !window.__EQLTEST) {
      reminderAt = Date.now() - 60 * 60000;
      maybeLoginReminder();
    }
  }, 6000);

  // which exports feed features this person actually uses — the login bar
  // only nags about those (the per-view outfileBar stays view-scoped anyway)
  function outfileWanted(kind) {
    if (kind === 'inventory') return true; // cleanup/needs/epics all read it
    if (kind === 'achievements') return !!((settings && settings.usedSlayer) || qSelClasses().length);
    if (kind === 'factions') return !!(settings && (settings.usedUnlocks || settings.usedSlayer));
    if (kind === 'spellbook') return false;   // changes only when you scribe — the Spellbook view asks itself
    return true;
  }

  // fresh-login popup: each wanted /outputfile command, copy-paste ready,
  // ticking itself off live as the new files land next to your log
  function loginModalRows() {
    const rows = $('login-rows');
    rows.innerHTML = '';
    let open = 0;
    for (const [kind, cmd] of OUTFILES) {
      if (!outfileWanted(kind)) continue;
      const fresh = reminderAt && outfileMtime(kind) >= reminderAt;
      if (!fresh) open++;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center';
      const st = document.createElement('span');
      st.textContent = fresh ? '✅' : '⬜';
      st.style.flex = 'none';
      const code = document.createElement('span');
      code.textContent = cmd;
      code.style.cssText = 'flex:1;font-family:Consolas,monospace;font-size:12.5px;color:#cfe3cf;background:rgba(255,255,255,.06);border-radius:5px;padding:4px 9px;user-select:text' +
        (fresh ? ';opacity:.45;text-decoration:line-through' : '');
      const age = document.createElement('span');
      age.style.cssText = 'flex:none;color:#778;font-size:9.5px';
      const mt = outfileMtime(kind);
      age.textContent = fresh ? 'fresh ✓' : mt ? 'from ' + fmtAge(mt) : 'never seen';
      const btn = document.createElement('button');
      btn.className = 'kbtn gold';
      btn.textContent = '📋 Copy';
      btn.style.fontSize = '10.5px';
      btn.title = 'Copy, then paste into the game\'s chat';
      btn.addEventListener('click', () => { window.overlay.copyText(cmd); toast('📋 Copied ' + cmd + ' — paste it in game'); });
      if (fresh) btn.style.visibility = 'hidden';
      row.append(st, code, age, btn);
      rows.appendChild(row);
    }
    return open;
  }

  function maybeLoginReminder() {
    if (!settings || settings.loginReminder === false || loginReminded || !reminderAt) return;
    const stale = OUTFILES.filter(([k]) => outfileWanted(k) && outfileMtime(k) < reminderAt);
    if (!stale.length) return;
    loginReminded = true;
    loginModalRows();
    $('login-modal').style.display = 'flex';
  }

  function checkLoginBarDone() {
    const modal = $('login-modal');
    if (!reminderAt || modal.style.display === 'none') return;
    if (loginModalRows() === 0) { // every wanted file is fresher than the login
      modal.style.display = 'none';
      toast('✅ Tracking files all fresh — counters and checkmarks are live');
    }
  }

  const normClass = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

  // "Umbral Platemail Helm +5" in the inventory file must match the base
  // item name — strip upgrade suffixes and normalize apostrophes
  const normItemName = (s) => (s || '').toLowerCase().replace(/\s*\+\d+$/, '').replace(/`/g, "'").trim();

  // items looted while SEQO is running: checkmarks update on the fly,
  // without waiting for the next /outputfile inventory (name -> count)
  const lootedLive = new Map();

  function invHas(name) {
    const key = normItemName(name);
    if (lootedLive.has(key)) return true;
    const inv = gameFiles && gameFiles.inventory;
    if (!inv) return false;
    if (!inv.__idx) {
      const idx = new Set();
      for (const k of Object.keys(inv.items || {})) idx.add(normItemName(k));
      for (const n of inv.keyring || []) idx.add(normItemName(n));
      inv.__idx = idx;
    }
    return inv.__idx.has(key);
  }

  // how many of an item you hold: inventory file stacks + live loot since.
  // (A fresh /outputfile inventory clears lootedLive, so nothing double-counts.)
  function invCount(name) {
    const key = normItemName(name);
    let n = lootedLive.get(key) || 0;
    const inv = gameFiles && gameFiles.inventory;
    // the trailing Equipment/Augmentation/Activated sections are parsed as
    // real items too (count 1 each), so this single loop covers everything
    if (inv) for (const [k, it] of Object.entries(inv.items || {}))
      if (normItemName(k) === key) n += it.count || 1;
    return n;
  }
  const factionInfo = (name) =>
    (gameFiles && gameFiles.factions && gameFiles.factions.factions
      && gameFiles.factions.factions[name]) || null;
  const achSections = () =>
    (gameFiles && gameFiles.achievements && gameFiles.achievements.sections) || [];
  const achSection = (re) => achSections().find(s => re.test(s.name));

  // achievements file is ground truth: an "Obtain <reward>" objective marked C
  // means that PoS quest reward is in hand → mark the quest turned in.
  function syncFromAchievements(quiet) {
    const sec = achSection(/Untapped Potential: Class/i);
    if (!sec) return;
    let marked = 0;
    for (const ach of sec.achievements) {
      for (const obj of ach.objectives) {
        const m = /^Obtain (.+?)\.?$/.exec(obj.text);
        if (!m || !obj.done) continue;
        const q = POS.quests.find(x => x.reward.toLowerCase() === m[1].trim().toLowerCase());
        if (q && !qState(q.reward).done) {
          qSave(q.reward, { ...qState(q.reward), done: true });
          marked++;
        }
      }
    }
    if (marked && !quiet) toast('☑ ' + marked + ' PoS quest' + (marked > 1 ? 's' : '') + ' auto-marked done from your achievements file');
  }

  // inventory file (bags + bank + key ring) checks off collected quest items,
  // and a reward already on your key ring marks that quest done outright
  function syncFromInventory(quiet) {
    const inv = gameFiles && gameFiles.inventory;
    if (!inv) return;
    let checked = 0;
    for (const q of POS.quests) {
      const st = qState(q.reward);
      if (!st.done && (inv.keyring || []).some(n => n.toLowerCase() === q.reward.toLowerCase())) {
        qSave(q.reward, { ...st, done: true });
        continue;
      }
      if (st.done) continue;
      let changed = false;
      const items = { ...st.items };
      for (const it of q.items) {
        if (!items[it.name] && invHas(it.name)) { items[it.name] = true; changed = true; checked++; }
      }
      if (changed) qSave(q.reward, { ...st, items });
    }
    if (checked && !quiet) toast('☑ ' + checked + ' quest item' + (checked > 1 ? 's' : '') + ' checked off from your inventory file');
  }

  const fmtAge = (ms) => {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    return s < 90 ? 'now' : s < 5400 ? Math.round(s / 60) + 'm ago'
      : s < 129600 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago';
  };

  function renderSyncLine() {
    const el = $('q-sync');
    if (!gameFiles || (!gameFiles.inventory && !gameFiles.achievements && !gameFiles.factions)) {
      el.innerHTML = 'Game data: none yet — in game type <b style="color:#bbb">/outputfile inventory</b>, ' +
        '<b style="color:#bbb">/outputfile achievements</b> and <b style="color:#bbb">/outputfile faction</b>. ' +
        'SEQO finds the files next to your log and refreshes automatically.';
      return;
    }
    const part = (label, d) => d
      ? '<span style="color:#7dffa0">' + label + ' ✓ ' + fmtAge(d.mtime) + '</span>'
      : '<span style="color:#c96">' + label + ' ✗ (run /outputfile ' + label + ')</span>';
    el.innerHTML = 'Game data: ' + part('inventory', gameFiles.inventory) + ' · ' +
      part('achievements', gameFiles.achievements) + ' · ' + part('faction', gameFiles.factions);
  }

  // stale-data banner: shown in a data view when the weekly wiki check found
  // that its source page changed after this build's data was verified
  let dataStaleLabels = [];
  const staleBanner = (label) => {
    if (!dataStaleLabels.includes(label)) return null;
    const d = document.createElement('div');
    d.setAttribute('data-interactive', '');
    d.style.cssText = 'color:#ffb27d;font-size:9.5px;margin:2px 0 4px;padding:3px 6px;background:rgba(255,150,80,.1);border:1px solid rgba(255,150,80,.35);border-radius:5px;cursor:pointer';
    d.textContent = '⚠ The wiki page behind this data changed, and the last attempt to re-read it failed — some entries may be out of date. Click here to try again (or use ⟳ Update quest data in Settings → Data credits).';
    d.title = 'Fetch the latest data from the sources now';
    d.addEventListener('click', async () => {
      d.textContent = '⟳ updating from the sources…';
      const r = await window.overlay.updateQuestData();
      await afterQuestUpdate(r, false);
    });
    return d;
  };

  const creditLine = (c) => {
    const d = document.createElement('div');
    d.style.cssText = 'color:#8a7a55;font-size:9.5px;margin-top:6px';
    d.innerHTML = '💛 ';
    const a = document.createElement('span');
    a.textContent = c.note || (c.by + ' — please support them');
    a.style.cssText = 'cursor:pointer;text-decoration:underline dotted';
    a.title = c.url;
    a.addEventListener('click', () => window.overlay.openExternal(c.url));
    d.appendChild(a);
    return d;
  };

  // ---------- 🔓 Unlocks view ----------
  const unlExpanded = new Set();
  const unlGroupOpen = { keys: true, races: true, classes: true, deity: true };
  // achievements completed THIS session, from the log line — the export file
  // only catches up at the next /outputfile achievements
  const achDoneLive = new Set();
  let keyAutoOpened = false;

  function unlBar(pctRaw) {
    const pct = Math.max(0, Math.min(100, Math.round(pctRaw * 100)));
    return '<span style="display:inline-block;width:90px;height:7px;background:rgba(255,255,255,.1);border-radius:4px;vertical-align:middle;overflow:hidden">' +
      '<span style="display:block;width:' + pct + '%;height:100%;background:' + (pct >= 100 ? '#7dffa0' : '#ffd766') + '"></span></span>';
  }

  // the dock's 📖 guide mode: a wiki page (or one section) as readable text
  const GUIDE_TITLE = "Alanna's Race Unlock Guide";   // wiki redirect → User:Alanna/…
  const openGuide = (payload) => window.overlay.openDock('guide', payload);

