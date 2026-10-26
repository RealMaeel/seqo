// SEQO dock.html — the docked side panel (item card, guides, routes, help).
// Moved out of the page in v2.7 unchanged, so the page can run under a strict CSP.
  const $ = (id) => document.getElementById(id);
  let mode = null;
  // back navigation: cleanup → item → item → … and back out again
  const navStack = [];
  function pushNav() {
    if (mode === 'cleanup') navStack.push({ mode: 'cleanup' });
    else if (mode === 'item' && itemName) navStack.push({ mode: 'item', name: itemName });
    else if (mode === 'mob' && mobName) navStack.push({ mode: 'mob', name: mobName });
    else if (mode === 'guide' && guidePayload && guidePayload.helpTopic !== undefined)
      navStack.push({ mode: 'helptopic', i: guidePayload.helpTopic });
    else if (mode === 'guide' && guidePayload) navStack.push({ mode: 'guide', payload: guidePayload });
    else if (mode === 'guide') navStack.push({ mode: 'help' });
    $('back').style.display = navStack.length ? '' : 'none';
  }

  // ---------- top bar ----------
  let detached = false;
  $('close').addEventListener('click', () => window.overlay.closeDock());
  $('back').addEventListener('click', goBack);
  $('pin').addEventListener('click', () => {
    detached = !detached;
    $('pin').classList.toggle('detached', detached);
    $('pin').title = detached ? 'Re-attach to the overlay' : 'Detach from the overlay (float free)';
    window.overlay.dockDetach(detached);
  });

  function goBack() {
    const prev = navStack.pop();
    $('back').style.display = navStack.length ? '' : 'none';
    if (!prev) return;
    if (prev.mode === 'cleanup') { setMode('cleanup'); render(); }
    else if (prev.mode === 'guide') showGuide(prev.payload, false, true);
    else if (prev.mode === 'help') showHelp(true);
    else if (prev.mode === 'helptopic') showHelpTopic(prev.i, true);
    else if (prev.mode === 'mob') showMob(prev.name, true);
    else showItem(prev.name, false, true);
  }

  function setMode(m) {
    mode = m;
    $('cleanup-root').classList.toggle('active', m === 'cleanup');
    $('item-root').classList.toggle('active', m === 'item');
    $('guide-root').classList.toggle('active', m === 'guide');
    $('mob-root').classList.toggle('active', m === 'mob');
    $('mode-title').textContent = m === 'cleanup' ? '🧹 Cleanup' : m === 'guide' ? '📖 Guide' : m === 'mob' ? '🗡 Your kills' : '🔎 Item detail';
  }

  // =========================================================================
  // HELP — how every feature works, shipped inside the app (works offline)
  // =========================================================================
  const HELP = [
    ['Getting started', 'Pick your character’s log file in ⚙ Settings → General — everything SEQO shows comes from that log plus your /outputfile exports.\n\nThe overlay has two modes. EDIT mode: title bar visible, drag to move, resize from the corner. LOCKED mode (🔒 or Ctrl+Alt+O): clicks pass through to the game, and controls work on mouse-over only — hover and the tabs light up. Ctrl+Alt+H hides/shows the whole overlay.\n\nThe title bar shows your PC’s clock — and it stays in the top-right corner while locked, so you can see the time in full-screen (⚙ Appearance → Clock to hide it). The 😴 button in the title bar is the AFK watch: turn it on when you step away and SEQO sirens if anything attacks you. In locked mode 😴 and 🔓 float at the top-right.'],
    ['Game exports (/outputfile)', 'Three in-game commands feed SEQO’s trackers — paste each into the game’s chat:\n\n/outputfile inventory — bags, bank, worn gear. Drives Cleanup, epic checkmarks, rep counters.\n/outputfile achievements — unlock status.\n/outputfile faction — faction progress bars.\n\nSEQO finds the files next to your log and picks up a fresh one within a second, no clicks. Views that read an export show a 📋 reminder bar whenever their file is missing or stale. On a fresh login a popup lists the commands with copy buttons and ticks each one off as its new file lands — it only asks for the exports your features actually use (turn it off in ⚙ Alerts & Sounds).'],
    ['Meter', 'The ⚔ Meter shows the current fight; Σ Session shows the whole session’s damage by source — the old Spells tab. Fighting several mobs at once? 🎯 chips under the numbers split the fight by mob — click Lord Rikantus Everling to see who did what to him alone (DPS over the time he was being fought), click 🎯 All to go back; 📋 copies whichever you’re looking at. Click any player bar to see their damage by spell; the 🐾 button on a bar marks them as your pet (pets fold into your own number when "Merge pet damage" is on). ✚ Heals ranks every healer in your group (total, HPS, overheal %) — click one for spells and targets. The header shows your current 🥋 stance; Σ Session ranks your stances by DPS and lists skill-ups and faction changes.\n\n📋 copies a one-line summary for in-game chat. The ⋯ menu holds 🕘 Recent fights (reopen any of the last 25), the 📈 DPS chart, 📋 Copy full breakdown and "top N" for the chat line.\n\nWhen you die or get knocked out, ☠ Death recap shows the last 12 seconds — every hit, heal and miss on you, and who did most of the damage.\n\nSpell timers: define "Spell = seconds" lines in ⚙ Alerts & Sounds and casting starts a countdown chip visible on every tab.'],
    ['Bottom bar: runs & XP', 'The bar at the overlay’s bottom edge is on every tab.\n\n▶ Start run begins a run (instance clear, camp, farm session): loot, coin, motes and rare kills are tracked until you press ⏹ End run — the button carries a live clock while a run is going. The Loot tab’s button is the same run.\n\nNext to it is the session XP/AA readout: percent gained, kills, per-hour pace, position in your level and time-to-ding once a level-up has been seen. At max level the log has no XP percent, so it shows your XP-kill pace and AA per hour instead. 💬 appears when tells or group chat arrive (click for the recent list, kept between sessions) and ☠ recap reopens the last death recap. ↺ reset starts the pace over (kills, %, per-hour) and keeps your level position and AA total.'],
    ['Loot tab', 'Every drop SEQO witnesses, with a verdict: 🌟 WISH (starred), KEEP (a quest, epic, grind or your own flag wants it), SPARE / SELLABLE / OTHER CLASS for Plane of Sky pieces, nothing for the rest. Click a verdict chip on a drop to cycle your own keep/junk flag.\n\nIf your advanced-loot filter AUTO-SELLS something you still need, SEQO shouts — fix the filter, the item is gone.\n\nThe run box shows the live run: coin, items, ✨ motes with per-hour rate, rares down vs known. A rare counts when the wiki lists it, the game calls it "a rare creature" on /con, it’s a named mob you fought — or you marked it (＋ mark a mob as rare; click one to remove it).\n\nGoing rates: drops show what they sell for in WTS chat ("sells ~2k"), so you can tell what’s worth carrying. In the run box, 📋 chat copies a one-liner for game chat and 📋 full the whole report for Discord.\n\n🧹 Cleanup and 🎯 Needs open their windows. (The Wiki export button lives in ⚙ Advanced with the wiki account setup.)'],
    ['Cleanup window', 'Judges every stored item: can this go? Each row reads Item · Location · Category · Use · Source.\n\nPick a view at the top: 📋 All items (A–Z, every place it’s stored in Location), 📍 By location (🎒 Bags, 📦 Character storage, 🏦 Bank, 🤝 Shared bank) or 🗂 By category (🛡 Gear · 📌 Tracked quest items — Epic, Plane of Sky, Spell quest, Unlock · 📜 Quest · ⚒ Tradeskill · 📦 Misc). Chips filter by verdict: Needed / Gear / Unknown / Job done.\n\nSource says where the answer came from: eqlwiki, SEQO’s own trackers, or — when eqlwiki has no page — eqlegendstools, your loot records (which mob dropped it) or the P99 wiki (classic EQ, a lead). Click it to open the page.\n\nUnknown items look themselves up automatically (each only once; answers are cached and synced). Quest rows show every quest plus the chain: "↳ quest → reward → needed for: …". 🗑 flags junk forever. Ground truth is your inventory export — run /outputfile inventory before a big cleanout.'],
    ['Zone needs (tab & panel)', 'Everything you still need that drops where you\'re standing: ⭐ starred gear, ⚔ epic pieces (with true counts), 🔓 unlock turn-ins with live counters, 🧙 tracked spell-quest pieces. Each row names the mobs that drop it; click a row for full item details. Counters tick the moment the loot line hits your log, and rows flash green when their item just dropped.\n\nIt lives in two places with the same list: the 🎯 Needs TAB in the overlay, and the slim pop-out strip (⧉ Pop-out, or 🎯 Needs on the Loot tab) that docks under the overlay and stays visible while you play. The pop-out is persistent — it follows you between zones and reopens where you left it after a restart; — collapses it to a one-line bar.'],
    ['Lookup tab', 'Search box: local caches first (your loot DB, cached wiki pages), Sources ⟳ asks eqlwiki and eqlegendstools — and the Project 1999 wiki (🏛, classic EverQuest: Legends often differs, so it’s a lead, not gospel). Items seen for sale in chat show as 🏷 with their going rate. Mobs you’ve killed show as 🗡 — click one for your own drop rates, when your recent kills happened and how long each took (wiki page or not; 📚 History → 📥 Old logs fills in kill times from your old logs) and 📋 chat / 📋 full copy them for game chat or Discord, to share with your group. Click any result for the full item panel in the attached window: stats with the +1…+10 upgrade slider (weapons show their damage and ratio at each tier; 📋 chat / 📋 full copy the item at that tier — game item links can only come from the game, so link it in game and paste the line after), effects explained, drop sources, your own drop rates, and deep links to the community databases, plus 💰 Going rate: asking and wanted prices from WTS / WTB chat for the item and each +N version, over a window you type (last 36 hours, 2 weeks…).\n\nThe zone block lists the current zone’s named mobs and their drops — with your personal kill counts and drop rates next to the wiki’s word. ☆ on any row stars it onto your wish list.\n\n✎ Fix (item card): the wiki wrong or missing something? Pick the tier your copy shows and type what the in-game item window says. SEQO keeps it (synced), shows it everywhere instead of the wiki’s numbers and notes what the wiki says. 💠 Exaltations on your copies lists what’s slotted in each copy you own (from /outputfile inventory); ✎ type it records an effect no source has.'],
    ['Quests tab', 'The chip row picks the view: 📜 Quests (zone quests + the Plane of Sky tracker), 🔓 Unlocks, 💀 Slayer, 🧙 Spells, ⚔ Epics, ✨ Exalts. (Best-in-slot gear moved to the ⚔ Class tab’s Gear advisor.)\n\nPoS: pick your classes, and quest items check off automatically as you loot; the summary strip counts turned-in / ready / missing-one. Items you already own check off from your inventory export. Click a quest’s ✓ when you hand it in.\n\nOther zones list the wiki’s quests for wherever you are — the zone dropdown follows you as you zone.'],
    ['Slayer achievements', 'The 💀 Slayer view reads your achievements export: four groups (General meta-achievements, Conquest family counters, Special, Skill), each with live progress bars, sorted closest-to-done first. In General, chain rows are clickable — jump straight to the achievement they require.\n\n🧭 on any target opens a route read-out in this window: where that family hunts, and what the kills COST you — race targets list the exact factions their race unlock needs, with YOUR current standing, so you never torch a grind you\'re mid-way through by accident.\n\nCounts come from /outputfile achievements — run it again after a hunt to update. Zone suggestions are classic-era knowledge; Legends may differ.'],
    ['Class tab: gear advisor', 'The 🛡 Gear view scores every wearable item on the wiki for YOUR trio and shows, per slot: 👤 what you wear, 🎒 the best you own, 🌍 the best obtainable with where it comes from. ☆ stars an upgrade onto your wish list so zone needs flags where it drops.\n\nPick a Purpose (Balanced, Tank, Melee ST, AoE, Caster DPS, Healer) — each is just a stat-weight table, and ⚙ weights lets you edit every number (saved per purpose). The weapon-type filter keeps a sword-and-board build from being told a two-hander is an upgrade; the obtained-by chips (Drop/Quest/Craft/Vendor) match how you actually play.\n\nFirst use: ⬇ Build catalog reads every item page off the wiki once (a few minutes, progress shown). After that it\'s cached, synced between your computers, and instant. "+N" upgrades score as their base item.'],
    ['Class tab: buffs & stacking', 'The 🧪 Buffs view runs on the GAME\'S OWN spell files (read from your install, refreshed automatically each patch) — not wiki guesses.\n\nSpells in your lineup turn GREEN while they’re on you (time left on hover) — SEQO tracks every lasting effect the moment its landing line hits your log. Fade lines are matched exactly, so fade alerts name the real spell.\n\nYOUR LINEUP builds itself: set your spell-gem count (AAs raise it) and SEQO picks the strongest non-conflicting buff set your trio can memorize at YOUR level — balanced for fighting by default, no setup needed. Tap 🎯 Focus to lean it toward specific stats (Resists means all five). Every pick shows its real numbers from the game data — including the price on mixed spells like Dark Temptation (ATK +25 · HP/tick −3) — and hover any pick for full details and swap options. Stacking is checked the way the game checks it, slot by slot plus the stacking-group table: same-stat buffs that genuinely stack (Grim Aura + Dark Temptation) are both picked, because their values add.\n\n⏳ LONG BUFFS trades a little stat strength for durations you don\'t babysit — and shows the exact trade in one line (STA −5 · DEX −1, avg duration 12m → 40m). Songs are unaffected: Symphonic Aura keeps them running either way, which is also why bard songs sit at the BOTTOM of the lineup as the optional block.\n\n⚔ DISCIPLINES lists /disc abilities above level 50 (Legends covers the low ones with stances). Spot a spell that isn’t really in Legends? The ✕ on its row hides it from your lineup (restore anytime).\n\n📕 SPELLBOOK: /outputfile spellbook, then this view lists what you haven’t scribed yet for each class, checked against eqlwiki so live-EQ leftovers stay out.\n\nUTILITY lists invisibility, levitate, see invisible, water breathing and night vision separately — cast those when needed, they never spend a lineup gem.\n\nALL BUFFS (collapsed by default) lists everything your trio can cast, and uses the game\'s own stacking table to call out groups that DON\'T stack — cast the ✔ one, skip the overridden. And when a cast fails with "did not take hold", SEQO names the blocking buff and says whether yours was stronger.\n\nYour trio fills in automatically from your own /who row; the three dropdowns let you preplan any other makeup and ☆ gear for it.'],
    ['Spell quests', 'The 🧙 Spells view tracks the optional class spell quests (Tashania, Ice Comet, Divine Might, Life Leech, Call of Flame). ⭐ Track one and its hunted pieces join the zone-needs list — walk into Nagafen\'s Lair and the needs panel reminds you the stone spiders there drop your Crystalline Orb.\n\nCheckmarks fill from your inventory export and live loot; anything the auto-match misses, click the box by hand. Each quest card carries the full route, turn-in by turn-in, with the gotchas (temporary containers, don\'t-hand-in-invisible, fights that spawn on turn-in) called out.\n\nSome quests have a clicky-vs-spell choice — the card says when you can stop early and keep the clicky instead.'],
    ['Unlocks', 'Live status from your achievements export, faction bars from the faction export, rep-item counters from your inventory — all three commands are on the view’s 📋 reminder bar when stale.\n\n🔑 Keys sit at the top: every key achievement the game lists, with a step-by-step walkthrough where SEQO knows the route (Be Our Guest — the Nektropos Castle access quest; the Nektropos Library Key). Steps tick off from the quest items you hold, and the card turns DONE the moment the game announces the achievement.\n\nWhere the guide gives real alternatives, routes show as Option A / Option B, each with its own counters, so 437/1200 Gnoll Fangs only counts against the route that eats fangs. 🌙 marks evil-race-specific routes.\n\n📖 on a race, faction or deity opens the relevant guide text right here in this window — cached, works offline, with a link to the full page.'],
    ['Epics', 'The prep checklist understands how epics are actually built. Own a crafted reward (say, Darkforge Breastplate) and its ingredients show ✔ covered — you don’t need rotted pieces for armor you’re wearing. Chains work (Decrepit Sheath → Corrupted Ghoulbane), owning the finished epic silences the whole class, and shared items show true totals: if two of your classes each need one, the row reads 1/2 until you have both.\n\nThe game can’t show items you already handed to an NPC, so click a row’s checkbox to tick off a turn-in yourself. ☆ stars a piece onto your wish list for loud drop alerts.'],
    ['BiS drop alerts', 'Best-in-slot browsing lives on the ⚔ Class tab now — the Gear advisor scores every item for YOUR trio with editable weights and filters, which the old 🏆 BiS list never could.\n\nWhat remains here is the alert option: "Flag best-in-slot drops" in ⚙ Alerts & Sounds. Off (the default), nothing happens. On, drops that appear on the community BiS list for your class toast a 🏆 and get KEEP verdicts in the loot log. The better habit is still to ☆ the exact pieces you want — the Gear advisor\'s 🌍 rows have the star right there.'],
    ['Exaltations', '✨ Exalts lists every gear effect (Focus, Worn, Proc, Clicky…) from the wiki. Pick an effect to see every item that carries it, with ✓ on ones you own. Search finds "Mana Preservation II" style effects fast. Item pages link back here from their Effect lines.\n\nExaltation items in your bags (e.g. "… (Exaltation)") are always judged keep-worthy in Cleanup — they’re transferable effects.'],
    ['Timers & respawns', 'Kill a mob and SEQO starts timing it. ★ pins a camp: due alerts fire, and the chip bar shows the countdown on every tab.\n\n⏳ Heads-up (top of the Timers tab): every ★ pinned camp warns you a set number of seconds before it spawns — or before its spawn window opens. 60 by default; change the number, tick 🗣 to hear it, or untick to turn it off. A pinned row shows ⏳1:00 when it will warn you (⏳? until SEQO knows the respawn).\n\nTimers are learned from YOUR kill-to-kill gaps — several cycles vote, outliers are dropped, and nothing is learned inside instanced copies or across a zone line. Mobs with varying spawns get a WINDOW ("15–30m"): an alert when the window opens, another when it’s past.\n\nThe mark after a countdown says how much to trust it: ⟲ learned from 3+ cycles · ~ tentative (1–2 cycles) · ~wiki zone-wide default · ✎ set by you. Click ✎ to set a timer yourself — "6:40", "25m", or "15-30" for a window; empty puts it back on automatic.\n\n+PH links a placeholder: its deaths reset (and teach) the named’s cycle.'],
    ['Map', 'The world map shows zone connections with your current zone glowing green. Pick a destination (or click one) for a route; scroll zooms, drag pans. It follows your zoning automatically.'],
    ['Notes', '📝 is a free-form scratchpad — special commands, camp coordinates, trade prices. It saves as you type, survives forever, and syncs between computers through the shared data folder.'],
    ['Alerts & AFK', 'Every alert kind has a distinct sound; volume and flash are in ⚙ Alerts & Sounds, and 🔔 Test all alerts plays each one.\n\nBuff fades can alert (rename cryptic fade lines to spell names in the fade watch). Spammy alerts you’ve seen show in the mute list — tick one to silence it forever.\n\n😳 Mez & slow: a mez breaking or your mez/slow wearing off a mob. ⏳ Cooldowns: cast a long-reuse spell (Lay on Hands, Harm Touch…) and a chip counts down to ready. 🔎 Consider card (off by default): /con a mob for what SEQO knows about it.\n\n🗣 Custom alerts (⚙ Alerts & Sounds → 🗣 Custom alerts, under the shared volume slider): your own rules — any log line → message, sound, spoken words and/or a timer. GINA tokens work ({S} any text, {N} a number, {C} you), Test a line shows what fires, ⭐ Starter set, 📂 GINA file import and 📤 share codes. A timer can warn you before it ends (⏳ Warn, like GINA’s timer ending) — the starter set has two switched-off respawn timers (Spawn soon / Spawn window soon) to copy for mobs you don’t pin.\n\n😴 AFK watch (title bar): loud repeating siren if you’re attacked while away. In locked mode it floats top-right with the 🔓.'],
    ['History & old logs', 'Meter → Σ Session → 📚 History keeps every play session and loot run (saved each minute and on close, on this PC): personal bests, tick two to compare, notes, and ⬇ CSV / Markdown export.\n\n📥 Old logs reads every log in Logs and Logs\\archive once — months of past sessions plus every WTS / WTB price ever posted — in about a minute.'],
    ['Syncing between computers', 'Point ⚙ Game Data & Sync → Shared data folder at Dropbox/Drive/OneDrive and SEQO’s databases (loot history, item knowledge, notes, timers…) follow you between computers. One computer at a time — camp before switching.\n\nSynced game files mirror chosen game files (spell loadouts, UI layouts) through that folder, newest wins, with .seqo.bak backups. The status under Sync now never leaves you guessing: it names what was pushed and pulled, what failed and why, and WHICH computer wrote last — "picked up changes from ED-DESKTOP" means the other machine’s data arrived.'],
    ['Updating SEQO', 'When a new version is out, a green ⬆ appears in the title bar (and ⚙ → SEQO updates says so). Click it: SEQO downloads the new installer from its GitHub releases, checks it is exactly the file GitHub published, closes, installs and reopens itself. Your settings and databases stay. Windows may still ask about an unknown publisher — SEQO isn’t code-signed.\n\nThe portable version and SEQO run from source open the download page instead.'],
    ['Something went wrong?', 'SEQO keeps a small log of its own errors on this PC. ⚙ Settings → 📋 Copy problem report (bottom of Settings) copies SEQO’s version, the recent errors and your settings — never your passwords, notes or your Windows user folder — so you can paste it in a message to the author. Each error names the SEQO file it came from, and the report starts with a count per file, so the cause is quick to find.\n\nIt helps to say what you were doing when it happened, and which tab you were on.'],
    ['FAQ', 'Q: It says I need an item I already turned in.\nA: The inventory export only shows what you hold. On the Epics view, click the row’s checkbox to tick the turn-in off yourself.\n\nQ: My counters aren’t moving.\nA: Loot ticks live; totals ground in your last /outputfile inventory. Run it again — SEQO picks it up in a second.\n\nQ: Why did a respawn timer say ~tentative?\nA: It’s been learned from only one or two of your kill cycles. More cycles = solid ⟲. Or set it yourself with ✎.\n\nQ: A rare list / zone page looks wrong.\nA: Zone data comes from the wiki — ⟳ Update on the Lookup tab refetches it. Click-ignore a wrongly-listed "rare" and SEQO remembers.\n\nQ: What do the loot colors mean?\nA: Green KEEP = something still needs it. Gold WISH = you starred it. Grey = no known use. Orange SELLABLE/SPARE = PoS quest already served.\n\nQ: Where did the 🏆 BiS view go?\nA: It grew into the ⚔ Class tab’s Gear advisor — scored for your whole trio, with your own gear in the comparison. The "Flag best-in-slot drops" alert option still works from ⚙ Alerts & Sounds.\n\nQ: Why does the Gear view say "no catalog"?\nA: Press ⬇ Build catalog once — it reads every item page off the wiki (a few minutes, progress shown). After that, ⟳ updates take seconds because only changed pages are re-read.\n\nQ: Why do some buff countdowns show a ~?\nA: That duration depends on the CASTER\'s level, which SEQO can\'t always know. Your own casts are exact; others\' are honest estimates.\n\nQ: What does "experimental" on the Class tab mean?\nA: The data is the real thing (the game\'s own spell files, the wiki\'s item catalog), but the recommendations are young and still being tuned from field reports. Trust the numbers, sanity-check the advice, and report anything odd.\n\nQ: Where does my data live?\nA: Locally (or in your shared folder) — SEQO only READS the wiki and tool sites, and never sends your data anywhere.']
  ];

  function showHelp(noPush) {
    if (!noPush && mode) pushNav();
    setMode('guide');
    guidePayload = null;
    $('mode-title').textContent = '❓ Help';
    $('gtext').style.display = 'none';
    $('gfoot').style.display = 'none';
    const toc = $('gtoc');
    toc.style.display = 'block';
    toc.innerHTML = '';
    const intro = document.createElement('div');
    intro.style.cssText = 'color:#998;font-size:11.5px;margin-bottom:6px';
    intro.textContent = 'Pick a topic — short and practical, written for SEQO v' + (window.__appv || '2.4') + '.';
    toc.appendChild(intro);
    HELP.forEach(([title], i) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<span class="nm"></span>';
      row.querySelector('.nm').textContent = (i === HELP.length - 1 ? '💬 ' : '• ') + title;
      row.addEventListener('click', () => showHelpTopic(i));
      toc.appendChild(row);
    });
  }

  function showHelpTopic(i, noPush) {
    if (!noPush && mode) { navStack.push({ mode: 'help' }); $('back').style.display = ''; }
    setMode('guide');
    guidePayload = { helpTopic: i };
    $('gtoc').style.display = 'none';
    $('gfoot').style.display = 'none';
    $('gtext').style.display = 'block';
    $('mode-title').textContent = '❓ ' + HELP[i][0];
    $('gtext').textContent = HELP[i][1];
  }

  // =========================================================================
  // GUIDE MODE — a wiki page (or one section of it) as readable text, cached
  // =========================================================================
  let guidePayload = null;

  async function showGuide(payload, refresh, noPush) {
    if (!payload || !(payload.title || payload.localText)) return;
    if (!noPush && mode) pushNav();
    setMode('guide');
    $('gtoc').style.display = 'none';
    $('gtext').style.display = 'block';
    $('gfoot').style.display = 'flex';
    guidePayload = payload;
    $('mode-title').textContent = '📖 ' + (payload.label || payload.title);
    // overlay-composed read-out (e.g. a Slayer route): no wiki fetch at all
    if (payload.localText) {
      $('gtext').textContent = payload.localText;
      $('gage').textContent = payload.credit || 'composed by SEQO from your own game files';
      $('grefresh').style.display = 'none';
      $('gopen').style.display = 'none';
      return;
    }
    $('grefresh').style.display = '';
    $('gopen').style.display = '';
    $('gtext').textContent = 'loading…';
    $('gage').textContent = '';
    const d = await window.overlay.getGuidePage(payload.title, payload.anchor, !!refresh, payload.source);
    if (guidePayload !== payload) return;  // user already moved on
    if (d && d.error && payload.fallback) { showGuide(payload.fallback, refresh, true); return; }
    // the Legends wiki has nothing: offer the classic-EQ page instead of a dead end
    if (d && d.error && payload.source !== 'p99' && !payload.noP99) { showGuide({ ...payload, source: 'p99', label: 'P99: ' + (payload.label || payload.title), noP99: true }, refresh, true); return; }
    if (!d || d.error) {
      $('gtext').textContent = '⚠ ' + ((d && d.error) || 'could not load the page') +
        '\n\nThe wiki may be unreachable right now — the browser link below still works.';
      $('gopen').onclick = () => window.overlay.openExternal((payload.source === 'p99' ? 'https://wiki.project1999.com/' : 'https://eqlwiki.com/') + 'index.php?search=' + encodeURIComponent(payload.title));
      return;
    }
    $('mode-title').textContent = '📖 ' + (payload.label || d.title) + (d.anchor ? ' · ' + d.anchor : '');
    const p99 = d.source === 'p99';
    $('gtext').textContent = (p99 ? '⚠ From the Project 1999 wiki — classic EverQuest. EverQuest Legends often changes levels, drops and quest steps, so treat this as a lead, not gospel.\n\n' : '') +
      (d.text || '(the page is empty)');
    $('gage').textContent = 'cached ' + new Date(d.updated).toLocaleDateString() + (p99 ? ' · wiki.project1999.com (classic EQ)' : ' · eqlwiki.com') + ' — all credit to its editors';
    $('gopen').onclick = () => window.overlay.openExternal(d.url);
    $('grefresh').onclick = () => showGuide(payload, true, true);
  }

  // =========================================================================
  // CLEANUP MODE — rows pushed by the overlay; quest detail fetched here
  // =========================================================================
  let rows = [];
  const CV = window.EQLCleanupView;   // cleanupview.js: the All / By location / By category lists
  // verdict filter chips across all sections
  const CHIPS = [
    ['all',  'All',      ''],
    ['need', '✅ Needed', 'quests, epics, tradeskills, grinds or your own flags want these'],
    ['gear', '🛡 Gear',   'wearable equipment with no quest use'],
    ['unk',  '❓ Unknown', 'not in any database yet — the auto-scan is on it'],
    ['done', '🗑 Job done', 'nothing needs these anymore — vendor or destroy at will']
  ];
  let pileFilter = 'all';
  (function buildChips() {
    const box = $('chips');
    for (const [key, label, hint] of CHIPS) {
      const c = document.createElement('span');
      c.className = 'qchip';
      c.dataset.chip = key;
      c.textContent = label;
      if (hint) c.title = hint;
      c.addEventListener('click', () => { pileFilter = key; render(); });
      box.appendChild(c);
    }
  })();
  // view: all items A–Z · by location · by category (remembered on this PC)
  let cleanupView = 'all';
  try { cleanupView = localStorage.getItem('seqo.cleanupView') || 'all'; } catch { /* storage off: default */ }
  if (!CV.VIEWS.some(([k]) => k === cleanupView)) cleanupView = 'all';
  $('cview').value = cleanupView;
  $('cview').addEventListener('change', () => {
    cleanupView = $('cview').value;
    try { localStorage.setItem('seqo.cleanupView', cleanupView); } catch { /* fine */ }
    render();
  });

  // the Use cell: quest chips (click = rewards + chain), else the reason text
  function useCell(r) {
    const why = document.createElement('span');
    why.className = 'why';
    if (r.quests && r.quests.length) {
      const lead = /^used in \(([^)]+)\)/.exec(r.reason || '');
      why.textContent = lead ? 'used in (' + lead[1] + '): ' : 'used in: ';
      for (const qn of r.quests) {
        const chip = document.createElement('span');
        chip.className = 'qchip';
        chip.textContent = qn;
        chip.title = 'Click to see what ' + qn + ' rewards, and where those rewards lead';
        chip.addEventListener('click', () => showQuest(qn));
        why.appendChild(chip);
      }
      const extra = (r.reason || '').split(' · ')[1];
      if (extra) why.appendChild(document.createTextNode(' · ' + extra));
    } else if (r.cat === 'tracked' && r.trackWhat && !/^(epic|pos:|faction turn-in|used in)/i.test(r.reason || '')) {
      // the tracker says why it matters; the generic wiki verdict comes second
      why.textContent = r.trackWhat + (r.reason ? ' · ' + r.reason : '');
    } else {
      why.textContent = r.reason || '';
    }
    if (r.cat === 'tracked' && r.trackWhat) why.title = 'Tracked by SEQO: ' + r.trackWhat;
    else why.title = r.reason || '';
    return why;
  }

  function render() {
    { const _el = $('list'), _st = _el ? _el.scrollTop : 0; if (_st) queueMicrotask(() => { _el.scrollTop = _st; }); } // rebuilds must not snap the scroll to the top
    for (const c of $('chips').children) {
      const on = c.dataset.chip === pileFilter;
      c.style.background = on ? 'rgba(255,215,102,.25)' : '';
      c.style.color = on ? '#ffd766' : '';
    }
    const list = $('list');
    list.innerHTML = '';
    const shown = CV.filterRows(rows, $('filter').value, pileFilter);
    if (!shown.length) {
      list.innerHTML = '<div id="empty">' + (rows.length ? 'Nothing matches the filter.' :
        'Waiting for the overlay…<br>Make sure you\'ve run /outputfile inventory in game.') + '</div>';
      return;
    }
    // column headings (the table scrolls under them)
    const head = document.createElement('div');
    head.className = 'crow chdr';
    for (const t of ['', 'Item', 'Location', 'Category', 'Use', 'Source']) { const h = document.createElement('span'); h.textContent = t; head.appendChild(h); }
    list.appendChild(head);
    for (const g of CV.group(shown, cleanupView)) {
      if (g.label) {
        const needHere = g.rows.filter(r => r.pile === 'need').length;
        const d = document.createElement('div');
        d.className = 'divider';
        d.innerHTML = '<span></span> <small>· ' + g.rows.length + ' item' + (g.rows.length === 1 ? '' : 's') +
          (needHere ? ' · ' + needHere + ' still needed' : '') + '</small>';
        d.querySelector('span').textContent = g.label;
        list.appendChild(d);
      }
      for (const r of g.rows) {
        const row = document.createElement('div');
        row.className = 'crow ' + r.pile;
        const jb = document.createElement('span'); jb.className = 'junkbtn'; jb.textContent = '🗑';
        jb.title = 'Flag as junk: it drops into Job done and SEQO remembers forever';
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
        nm.title = 'Open this item’s full details';
        const here = g.loc ? CV.locCount(r, g.loc) : r.count;
        if (here > 1) { const c = document.createElement('span'); c.className = 'cnt'; c.textContent = ' ×' + here; nm.appendChild(c); }
        const loc = document.createElement('span'); loc.className = 'loc'; loc.textContent = CV.locText(r);
        loc.title = 'Where it’s stored (from your inventory export)';
        const cat = document.createElement('span'); cat.className = 'cat cat-' + (r.cat || 'misc'); cat.textContent = CV.catText(r);
        const src = document.createElement('span'); src.className = 'src';
        src.textContent = r.src || '—';
        if (r.url) {
          src.classList.add('link'); src.title = 'Open ' + r.url;
          src.addEventListener('click', () => window.overlay.openExternal(r.url));
        } else src.title = r.src === 'SEQO trackers' ? 'SEQO’s own quest trackers (epics, Plane of Sky, spell quests, unlocks)' : (r.src ? r.src : 'No source knows this item yet');
        row.append(jb, nm, loc, cat, useCell(r), src);
        nm.addEventListener('click', () => showItem(r.name));
        jb.addEventListener('click', () => {
          window.overlay.cleanupCmd({ kind: 'junk', name: r.name });
          r.pile = 'done'; r.reason = 'on your junk list'; delete r.quests; delete r.chain;
          render();
        });
        list.appendChild(row);
        if (r.chain && r.chain.length) {
          // the quest chain, right on the page: reward → what it's needed for
          for (const ch of r.chain) {
            const cl = document.createElement('div');
            cl.className = 'chainline';
            cl.textContent = '↳ ' + ch;
            list.appendChild(cl);
          }
        }
      }
    }
  }

  // quest detail WITH the chain: quest → rewards → what each reward is for
  async function showQuest(questName) {
    const qd = $('qdetail');
    qd.style.display = 'block';
    qd.innerHTML = '<span class="close2" title="close">✕</span><b></b> — fetching from the wiki…';
    qd.querySelector('b').textContent = questName;
    qd.querySelector('.close2').addEventListener('click', () => { qd.style.display = 'none'; });
    const d = await window.overlay.updateItemData(questName);
    qd.innerHTML = '<span class="close2" title="close">✕</span><b></b> ';
    qd.querySelector('b').textContent = questName;
    qd.querySelector('.close2').addEventListener('click', () => { qd.style.display = 'none'; });
    if (!d || d.error || !d.pageTitle) {
      qd.appendChild(document.createTextNode('— ⚠ ' + ((d && d.error) || 'no wiki page found')));
      return;
    }
    const rewards = d.rewards || [];
    if (!rewards.length) {
      qd.appendChild(document.createTextNode('— the wiki page lists no reward (click the quest name on the overlay’s Lookup tab for the full text)'));
      return;
    }
    qd.appendChild(document.createTextNode('rewards: '));
    for (const rw of rewards.slice(0, 4)) {
      const line = document.createElement('div');
      const s = document.createElement('span');
      s.className = 'rw';
      s.textContent = rw;
      s.title = 'Open ' + rw + '’s full details';
      s.addEventListener('click', () => showItem(rw));
      line.appendChild(s);
      qd.appendChild(line);
      // one link deeper: what is THIS reward needed for?
      (async () => {
        const rd = await window.overlay.updateItemData(rw);
        const uses = (rd && !rd.error && rd.questUses || []).filter(u => u.toLowerCase() !== questName.toLowerCase());
        if (uses.length) {
          const c = document.createElement('span');
          c.className = 'chain';
          c.textContent = '  → needed for: ' + uses.join(', ');
          line.appendChild(c);
        }
      })();
    }
  }

  window.overlay.onCleanupData((p) => {
    if (p.rows) { rows = p.rows; render(); }
    if (p.status !== undefined) $('status').textContent = p.status;
    if (p.scanning !== undefined) $('scan').disabled = p.scanning;
  });
  $('scan').addEventListener('click', () => window.overlay.cleanupCmd({ kind: 'scan' }));
  $('refresh').addEventListener('click', () => window.overlay.cleanupCmd({ kind: 'refresh' }));
  $('filter').addEventListener('input', render);
  $('copycmd').addEventListener('click', () => {
    window.overlay.copyText('/outputfile inventory');
    $('copied').style.display = '';
    setTimeout(() => { $('copied').style.display = 'none'; }, 2000);
  });

  // =========================================================================
  // ITEM MODE — self-driven: fetches from the same caches the overlay uses
  // =========================================================================
  let itemName = '', itemStats = '', wished = false, lootDB = null;

  // upgrade-tier math lives in itemtext.js (one copy: stats, regen, DMG, ACCURACY, weight)
  const scaledStats = (block, T) => EQLItemText.scaledStats(block, T);
  // weapons: damage and ratio (damage ÷ delay) at the slider's tier (2.7).
  // Damage scales like the stats block (+5%/tier, at least +1); delay doesn't scale.
  function weaponAt(block, T) {
    const up = String(block || '').toUpperCase();
    const d = /\bDMG:\s*\+?(\d+)/.exec(up), l = /\b(?:ATK\s*)?DELAY:\s*(\d+)/.exec(up);
    if (!d || !l || !+l[1]) return null;
    const base = +d[1], dly = +l[1];
    const dmg = EQLItemText.upDmg(base, T);
    return { dmg, dly, ratio: dmg / dly, baseDmg: base, baseRatio: base / dly };
  }
  function renderWeapon(T) {
    const el = $('iweap'), w = weaponAt(itemStats, T);
    if (!w) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = 'DMG ' + w.dmg + ' / ' + w.dly + ' · ratio ' + w.ratio.toFixed(3);
    el.title = 'Damage ' + w.dmg + ', delay ' + w.dly + ' at +' + T + ' — ratio (damage ÷ delay) ' + w.ratio.toFixed(3) +
      (T ? '\nat +0: damage ' + w.baseDmg + ', ratio ' + w.baseRatio.toFixed(3) + ' (+' + (((w.ratio / w.baseRatio) - 1) * 100).toFixed(0) + '%)' : '') +
      '\nDamage grows 5% per upgrade tier (at least +1); delay stays the same.';
  }
  // 📋 chat / 📋 full for the item at the slider's tier (2.7). Game item links
  // can only be made by the game itself, so this is text: link the item in game
  // and paste the line after it, or post the full version in Discord.
  let itemUrl = '';
  const ITEM_LINE_STATS = /\b(AC|HP|MANA|ENDURANCE|STR|STA|AGI|DEX|WIS|INT|CHA|ATK|HASTE|SV (?:FIRE|COLD|MAGIC|DISEASE|POISON)):\s*(\+?-?\d+%?)/gi;
  function itemChatLine(T) {
    const block = statsAt(T);
    const parts = [];
    const w = weaponAt(itemStats, T);
    if (w) parts.push('DMG ' + w.dmg + '/' + w.dly + ' (ratio ' + w.ratio.toFixed(3) + ')');
    for (const m of block.matchAll(ITEM_LINE_STATS)) parts.push(m[1].replace(/^SV /i, 'SV ') + ' ' + m[2]);
    for (const m of block.matchAll(/Effect:\s*([^\n(]+?)\s*(?:\(([^)\n]+)\))?(?=\s{2,}|\n|$)/gi))
      parts.push('Effect: ' + m[1].trim() + (m[2] ? ' (' + m[2].trim() + ')' : ''));
    let line = itemName + (T ? ' +' + T : '') + (parts.length ? ' — ' : '');
    for (let i = 0; i < parts.length; i++) {
      const next = (i ? ' · ' : '') + parts[i];
      if ((line + next).length > 230) { line += ' …'; break; }
      line += next;
    }
    return line;
  }
  function itemFullText(T) {
    const w = weaponAt(itemStats, T);
    return '**' + itemName + (T ? ' +' + T : '') + '**\n```\n' + statsAt(T).trim() + '\n```' +
      (w ? '\nDMG ' + w.dmg + ' / delay ' + w.dly + ' · ratio ' + w.ratio.toFixed(3) + (T ? ' (+0: ' + w.baseDmg + ' dmg, ratio ' + w.baseRatio.toFixed(3) + ')' : '') : '') +
      (itemUrl ? '\n' + itemUrl : '');
  }
  let iCopiedT = null;
  const itemCopy = (text) => {
    window.overlay.copyText(window.EQLShare ? EQLShare.withCredit(text) : text);
    $('icopied').style.display = '';
    clearTimeout(iCopiedT);
    iCopiedT = setTimeout(() => { $('icopied').style.display = 'none'; }, 2000);
  };
  $('icopy-chat').addEventListener('click', () => { if (itemStats) itemCopy(itemChatLine(+$('itier').value)); });
  $('icopy-full').addEventListener('click', () => { if (itemStats) itemCopy(itemFullText(+$('itier').value)); });

  $('itier').addEventListener('input', () => {
    const T = +$('itier').value;
    $('itierval').textContent = '+' + T;
    $('istats').textContent = statsAt(T);   // your ✎ fix applied (dock-itemfix.js)
    $('ititle').textContent = itemName + (T ? ' +' + T : '');
    renderWeapon(T);
  });

  const ITEM_SOURCES = [
    ['eqlwiki', (q) => 'https://eqlwiki.com/index.php?search=' + encodeURIComponent(q)],
    ['EQLBase', (q) => 'https://eqlbase.com/items/?q=' + encodeURIComponent(q)],
    ['EQ Legends Tools', (q) => 'https://eqlegendstools.com/?s=' + encodeURIComponent(q)],
    ['Loadout Legends', (q) => 'https://www.loadoutlegends.com/database?search=' + encodeURIComponent(q)],
    ['Gnoll Guard', (q) => 'https://www.gnollguard.com/items?search=' + encodeURIComponent(q)],
    ['P99 wiki (classic)', (q) => 'https://wiki.project1999.com/index.php?search=' + encodeURIComponent(q)]
  ];

  async function showItem(name, refetch, noPush) {
    if (!noPush && mode) pushNav();
    setMode('item');
    itemName = (name || '').replace(/\s*\+\d+$/, '');
    $('ititle').textContent = itemName;
    $('iwish').textContent = '☆';
    $('istats').style.display = 'none';
    $('itier-row').style.display = 'none';
    $('icopy').style.display = 'none';
    itemStats = ''; itemUrl = ''; itemWiki = ''; itemFix = null;
    $('ifx').innerHTML = ''; $('iexalt').innerHTML = ''; $('ifixnote').style.display = 'none';
    $('ifixed').style.display = 'none'; $('ifixed').innerHTML = '';
    $('idrops').innerHTML = '';
    $('isect').innerHTML = '<div class="sect-b">loading…</div>';
    $('isources').innerHTML = '';
    if (!lootDB) lootDB = await window.overlay.getLootDB().catch(() => null);
    window.overlay.cleanupCmd({ kind: 'wishstate', name: itemName }); // overlay answers via cleanup-data? simpler: ask directly below
    let cached = refetch ? null : await window.overlay.getItemData(itemName);
    if (!cached || cached.error) {
      $('isect').innerHTML = '<div class="sect-b">Fetching from the sources… (the first ever run also caches eqlegendstools — that one can take ~30s)</div>';
      cached = await window.overlay.updateItemData(itemName);
    }
    if ((!cached || cached.error) && window.EQLMobStats && EQLMobStats.find(lootDB, itemName)) {
      return showMob(itemName, true);   // no wiki page, but you've killed it: show your own numbers
    }
    await loadFixes();
    if (!cached || cached.error) {
      // no wiki page: what you recorded from the game still shows; else offer to record it
      if (itemFix) { cached = { pageTitle: itemName, statsblock: '', updated: itemFix.at }; }
      else {
        $('isect').innerHTML = '';
        const e = document.createElement('div'); e.className = 'sect-b';
        e.textContent = '⚠ ' + ((cached && cached.error) || 'nothing found') + ' — ';
        const b = document.createElement('button'); b.textContent = '✎ Add it from the game';
        b.title = 'Type what your in-game item window shows; SEQO keeps it (synced) until a source has it';
        b.addEventListener('click', () => { $('itier-row').style.display = 'flex'; openFixEditor(); });
        e.appendChild(b);
        $('isect').appendChild(e);
        renderExalts();
        return;
      }
    }
    renderItem(cached);
    renderMarket(itemName);
  }

  // ---- 🗡 your own kills: drop rates from YOUR loot records, wiki page or not ----
  let mobName = '', mobCard = null;
  let mobTier = null, mobTierFor = '', mobSort = 'new';   // mobSort: 'new' = newest first, 'fast' = fastest first   // difficulty filter on the kill list: null = all, 0-4, '?' = not noted
  // 📥 reads the old logs (kill times, times to kill and tiers), then redraws the card
  function readLogsButton(p) {
    const b = document.createElement('button');
    b.textContent = '📥 Read my old logs';
    b.title = 'Reads every log in Logs and Logs\\archive once (seconds to a minute) and adds kill times, difficulty tiers, past sessions and prices — same as 📚 History → 📥 Old logs';
    b.style.cssText = 'font-size:11px;padding:1px 8px;margin-left:2px';
    b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = '📥 reading your logs…';
      const r = await window.overlay.historyImportLogs().catch((e) => ({ error: e.message }));
      if (r && r.ok) showMob(mobName, true);
      else { b.disabled = false; b.textContent = '📥 Read my old logs'; p.appendChild(document.createTextNode(' ⚠ ' + ((r && r.error) || 'failed'))); }
    });
    p.appendChild(b);
    return b;
  }
  async function showMob(name, noPush) {
    if (!noPush && mode) pushNav();
    setMode('mob');
    if (name !== mobTierFor) { mobTier = null; mobSort = 'new'; mobTierFor = name; }
    mobName = name;
    mobCard = null;
    $('mtitle').textContent = name;
    $('mstatus').textContent = '';
    const body = $('mbody');
    body.innerHTML = '';
    lootDB = await window.overlay.getLootDB().catch(() => lootDB);   // fresh: kills keep coming in
    if (mobName !== name) return;                                     // moved on meanwhile
    mobCard = window.EQLMobStats ? EQLMobStats.find(lootDB, name) : null;
    const line = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; body.appendChild(d); return d; };
    if (!mobCard) { line('sect-b', 'No kills of this mob in your loot records yet.'); return; }
    $('mtitle').textContent = mobCard.name;
    for (const z of mobCard.zones) {
      const info = [z.kills + ' kill' + (z.kills === 1 ? '' : 's')];
      if (z.level) info.push('level ' + z.level);
      if (z.maxHit) info.push('max hit ' + z.maxHit + (z.avgHit ? ' · avg ' + z.avgHit : ''));
      const h = line('mz', (z.zone || 'unknown zone') + ' ');
      const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = '· ' + info.join(' · ');
      h.appendChild(sub);
      if (!z.drops.length) { line('sect-b', 'no drops seen yet'); continue; }
      for (const d of z.drops) {
        const r = document.createElement('div'); r.className = 'mrow';
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.name;
        nm.title = 'Item details';
        nm.addEventListener('click', () => showItem(d.name));
        const n = document.createElement('span'); n.className = 'n'; n.textContent = d.count + '/' + z.kills;
        const rt = document.createElement('span'); rt.className = 'r'; rt.textContent = d.rate;
        r.append(nm, n, rt); body.appendChild(r);
      }
      if (z.spells.length) line('sect-b', 'Casts: ' + z.spells.join(', ')).style.marginTop = '4px';
      // 🕘 when the kills happened, with the gap between them (2.7)
      const tc = EQLMobStats.tierCounts(z);   // [] = never on a tier above D0: no split
      const tier = tc.some((x) => (x.d == null ? '?' : x.d) === mobTier) ? mobTier : null;
      const fast = mobSort === 'fast' && EQLMobStats.killSpeed(z, tier);
      const rk = fast ? EQLMobStats.fastestKills(z, 10, tier) : EQLMobStats.recentKills(z, 10, tier);
      if (!rk.length && z === mobCard.zones[0]) {
        // no kill times yet: say where they come from, and offer to read them from the logs now
        const h = line('mz', '🕘 Recent kills ');
        const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = '· none with times yet'; h.appendChild(sub);
        const p = line('sect-b', 'SEQO 2.7 notes the time of every kill from now on. Your earlier kills are in your old logs — ');
        readLogsButton(p);
      }
      if (rk.length) {
        const h = line('mz', '🕘 Recent kills ');
        const sub = document.createElement('span'); sub.className = 'sub';
        const shownOf = tier == null ? z.times.length : (tc.find((x) => (x.d == null ? '?' : x.d) === tier) || { n: 0 }).n;
        sub.textContent = '· ' + (fast ? 'fastest ' + rk.length + ' of ' + shownOf : shownOf > rk.length ? 'last ' + rk.length + ' of ' + shownOf : rk.length) + ' with times' +
          (tier != null ? ' on ' + EQLMobStats.tierLabel(tier === '?' ? null : tier) : '');
        h.appendChild(sub);
        // difficulty filter (2.7): All · D0 · D1 … D4 — only the tiers you've killed it on
        if (tc.length) {
          const bar = document.createElement('div'); bar.className = 'mtiers';
          const chip = (label, val, n, tip) => {
            const b = document.createElement('button');
            b.textContent = label + ' ' + n;
            b.title = tip;
            if (val === tier) b.className = 'on';
            b.addEventListener('click', () => { mobTier = val; showMob(mobName, true); });
            bar.appendChild(b);
          };
          chip('All', null, z.times.length, 'Every kill with a time');
          for (const { d, n } of tc)
            chip(EQLMobStats.tierLabel(d), d == null ? '?' : d, n,
              d == null ? 'Kills from before SEQO noted the tier — 📥 Read my old logs fills them in' :
              d === 0 ? 'Base difficulty (no tier in the zone name)' : 'Difficulty ' + d + ' (' + ['', 'Awakened', 'Adaptive', 'Fused', 'Refined'][d] + ')');
          body.appendChild(bar);
        }
        // order: newest first (with respawn gaps) or fastest first (your best kills on this tier)
        if (EQLMobStats.killSpeed(z)) {
          const bar = document.createElement('div'); bar.className = 'mtiers';
          for (const [val, label, tip] of [['new', '🕘 Newest', 'Most recent kills first, with the time since the one before'],
                                           ['fast', '⚡ Fastest', 'Quickest kills first (first hit to death)' + (tc.length ? ' — pick a tier to see your best on that difficulty' : '')]]) {
            const b = document.createElement('button');
            b.textContent = label; b.title = tip;
            if ((fast ? 'fast' : 'new') === val) b.className = 'on';
            b.addEventListener('click', () => { mobSort = val; showMob(mobName, true); });
            bar.appendChild(b);
          }
          body.appendChild(bar);
        }
        const sp = EQLMobStats.killSpeed(z, tier);
        if (sp) {
          const ks = line('sect-b', '⏱ Time to kill' + (tier != null ? ' on ' + EQLMobStats.tierLabel(tier === '?' ? null : tier) : '') + ': ' +
            EQLMobStats.fmtSecs(sp.avg) + ' average · fastest ' + EQLMobStats.fmtSecs(sp.fastest) +
            ' · slowest ' + EQLMobStats.fmtSecs(sp.slowest) + ' (' + sp.n + ' kill' + (sp.n === 1 ? '' : 's') + ')');
          ks.title = 'From the first hit your side landed on it to its death';
        }
        // 👥 your class makeup: the quickest kills per makeup (and solo/group) on this tier
        const bm = EQLMobStats.byMakeup(z, tier).slice(0, 5);
        if (bm.length) {
          const h2 = line('sect-b', '👥 Fastest by your class makeup' + (tier != null ? ' on ' + EQLMobStats.tierLabel(tier === '?' ? null : tier) : '') + ':');
          h2.style.marginTop = '3px';
          h2.title = 'From your /who rows, the spells you cast and — solo — the buffs that landed on you. "?" = a class SEQO couldn’t tell from that.';
          for (const m of bm) {
            const r = document.createElement('div'); r.className = 'mrow';
            const nm = document.createElement('span'); nm.className = 'nm'; nm.style.cursor = 'default'; nm.style.textDecoration = 'none';
            nm.textContent = m.c + (m.g != null ? ' · ' + EQLMobStats.soloGroup(m.g) : '');
            const n = document.createElement('span'); n.className = 'n';
            n.textContent = (m.n > 1 ? 'avg ' + EQLMobStats.fmtSecs(m.avg) + ' · ' : '') + m.n + ' kill' + (m.n === 1 ? '' : 's');
            const b = document.createElement('span'); b.className = 'r'; b.style.width = '46px'; b.textContent = EQLMobStats.fmtSecs(m.best);
            b.title = 'Fastest kill with this makeup';
            r.append(nm, n, b); body.appendChild(r);
          }
        }
        if (tc.length && tier == null) {   // all tiers: one average per tier side by side
          const per = tc.map(({ d }) => { const s = EQLMobStats.killSpeed(z, d == null ? '?' : d); return s ? EQLMobStats.tierLabel(d) + ' ' + EQLMobStats.fmtSecs(s.avg) + ' (best ' + EQLMobStats.fmtSecs(s.fastest) + ')' : ''; }).filter(Boolean);
          if (per.length > 1) line('sect-b', '⏱ By difficulty: ' + per.join(' · ')).title = 'Average time to kill on each tier, with your fastest in brackets';
        }
        if (z === mobCard.zones[0] && z.times.some((k) => k.d == null || !k.c)) {
          const p = line('sect-b', 'Difficulty, your class makeup and solo/group are noted for every kill from now on' + (tc.length ? ' (D? = not noted yet)' : '') + '. For earlier kills — ');
          p.style.marginTop = '2px';
          readLogsButton(p).textContent = '📥 Read my old logs';
        }
        let lastDay = '';
        for (const k of rk) {
          const d = new Date(k.t);
          const day = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
          const r = document.createElement('div'); r.className = 'mrow';
          const nm = document.createElement('span'); nm.className = 'nm'; nm.style.cursor = 'default'; nm.style.textDecoration = 'none';
          nm.textContent = (fast || day !== lastDay ? day + '  ' : '') + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          lastDay = day;
          const tg = document.createElement('span'); tg.className = 'tier';
          tg.textContent = tc.length && tier == null ? EQLMobStats.tierLabel(k.d) : '';
          if (tg.textContent) tg.title = 'Difficulty tier of that kill';
          const kt = document.createElement('span'); kt.className = 'r'; kt.style.width = '46px';
          kt.textContent = k.secs != null ? EQLMobStats.fmtSecs(k.secs) : '';
          kt.title = 'How long the kill took: first hit to death';
          const g = document.createElement('span'); g.className = 'n';
          const gapTxt = k.gapMin == null || k.gapMin > 2880 ? '' : EQLMobStats.fmtGap(k.gapMin) + ' after';
          g.textContent = [k.c, EQLMobStats.soloGroup(k.g), gapTxt].filter(Boolean).join(' · ');
          nm.style.whiteSpace = 'nowrap'; g.style.textAlign = 'right';
          g.title = 'Your class makeup then, solo or in a group' + (gapTxt ? ', and the time since the previous kill (short gaps are its respawn)' : '');
          if (tg.textContent) r.append(tg);
          r.append(nm, g, kt); body.appendChild(r);
        }
      }
    }
    line('cached', 'From your own kills (synced between your PCs if you use a shared data folder). Rate = items seen ÷ kills, so an item that can drop twice can pass 100%. Kill times are kept from 2.7 on — 📚 History → 📥 Old logs adds the ones already in your logs.');
  }
  // same pair and wording as Σ Session's 📋 chat / 📋 full; "copied ✓" like Cleanup's 📋 copy
  let mCopiedT = null;
  const mobCopy = (text) => {
    window.overlay.copyText(window.EQLShare ? EQLShare.withCredit(text) : text);
    $('mstatus').textContent = '';
    $('mcopied').style.display = '';
    clearTimeout(mCopiedT);
    mCopiedT = setTimeout(() => { $('mcopied').style.display = 'none'; }, 2000);
  };
  $('mcopy-chat').addEventListener('click', () => { if (mobCard) mobCopy(EQLMobStats.chatLine(mobCard)); });
  $('mcopy-md').addEventListener('click', () => { if (mobCard) mobCopy(EQLMobStats.markdown(mobCard)); });
  $('mwiki').addEventListener('click', async () => {
    if (!mobName) return;
    $('mstatus').textContent = 'looking it up…';
    let c = await window.overlay.getItemData(mobName);
    if (!c || c.error) c = await window.overlay.updateItemData(mobName);
    if (!c || c.error) { $('mstatus').textContent = 'the wiki has no page for this mob yet'; return; }
    showItem(mobName);
  });

  // 💰 going rate: WTS / WTB offers SEQO read from chat, for this item and its
  // +N versions, over a window you type (remembered)
  let mkName = '';
  async function renderMarket(name) {
    mkName = name;
    const box = $('imarket');
    if (!box || !window.overlay.pricesQuery) return;
    let win = { n: 7, u: 'd' };
    try { win = JSON.parse(localStorage.getItem('seqoMarketWin') || 'null') || win; } catch { /* storage off */ }
    const UNIT = { h: 1 / 24, d: 1, w: 7, m: 30 };
    const days = win.u === 'all' ? 0 : Math.max(1, +win.n || 7) * (UNIT[win.u] || 1);
    const base = name.toLowerCase().replace(/[`’']/g, "'").trim();
    const same = (k) => k === base || new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\+\\d+$').test(k);
    let sell = [], buy = [];
    try {
      sell = ((await window.overlay.pricesQuery({ q: base, days, side: 'sell', limit: 60 })).rows || []).filter(r => same(r.key));
      buy = ((await window.overlay.pricesQuery({ q: base, days, side: 'buy', limit: 60 })).rows || []).filter(r => same(r.key));
    } catch { /* main busy */ }
    if (mkName !== name) return;   // the user moved on to another item
    box.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'sect-h';
    h.style.cssText = 'display:flex;gap:5px;align-items:center;flex-wrap:wrap';
    const t = document.createElement('span'); t.textContent = '💰 Going rate'; t.style.flex = '1';
    const n = document.createElement('input');
    n.type = 'number'; n.min = '1'; n.value = win.n || 7; n.disabled = win.u === 'all';
    n.style.cssText = 'width:52px;background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;font-size:11px;padding:1px 3px';
    const u = document.createElement('select');
    u.style.cssText = 'background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;font-size:11px';
    for (const [v, l] of [['h', 'hours'], ['d', 'days'], ['w', 'weeks'], ['m', 'months'], ['all', 'all time']]) {
      const o = document.createElement('option'); o.value = v; o.textContent = l; u.appendChild(o);
    }
    u.value = win.u || 'd';
    const lab = document.createElement('span'); lab.textContent = 'last'; lab.style.cssText = 'color:#99a;font-weight:400';
    const apply = () => {
      try { localStorage.setItem('seqoMarketWin', JSON.stringify({ n: Math.max(1, +n.value || 7), u: u.value })); } catch { /* storage off */ }
      clearTimeout(renderMarket.t); renderMarket.t = setTimeout(() => renderMarket(name), 250);
    };
    n.addEventListener('input', apply); u.addEventListener('change', apply);
    h.append(t, lab, n, u);
    box.appendChild(h);
    const pp = (v) => v >= 1000 ? (v / 1000).toFixed(v % 1000 && v < 100000 ? 1 : 0).replace(/\.0$/, '') + 'k' : v + 'pp';
    const ago = (ts) => { const m = (Date.now() - ts) / 60000; return m < 60 ? Math.round(m) + 'm ago' : m < 2880 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };
    const b = document.createElement('div');
    b.className = 'sect-b';
    if (!sell.length && !buy.length) {
      b.textContent = 'No WTS / WTB offers for ' + name + ' in this window. SEQO reads them from General / auction chat as you play (📚 History → 📥 Old logs reads every offer already in your logs).';
    } else {
      const lines = [];
      const sorted = (rows) => rows.slice().sort((a, c) => (+((a.key.match(/\+(\d+)$/) || [0, 0])[1])) - (+((c.key.match(/\+(\d+)$/) || [0, 0])[1])));
      for (const r of sorted(sell)) lines.push('Asking  ' + r.item + ': ~' + pp(r.avg) + ' (median ' + pp(r.median) + ', ' + pp(r.low) + '–' + pp(r.high) + ', ' + r.n + ' offers / ' + r.sellers + ' sellers, last ' + ago(r.last.t) + ')');
      for (const r of sorted(buy)) lines.push('Wanted  ' + r.item + ': ~' + pp(r.avg) + ' (median ' + pp(r.median) + ', ' + r.n + ' offers, last ' + ago(r.last.t) + ')');
      b.textContent = lines.join('\n');
      b.title = 'Average drops the top and bottom 10%. A seller repeating the same ad counts once per 6 hours.';
    }
    box.appendChild(b);
  }

  function renderItem(cached) {
    $('ititle').textContent = cached.pageTitle || itemName;
    // stats + tier slider
    // plain text even for items cached before 2.7 cleaned the wiki markup (<span class='itemeff'>…)
    const statsText = cached.statsblock && window.EQLItemText ? EQLItemText.cleanStatsBlock(cached.statsblock) : (cached.statsblock || '');
    itemWiki = statsText;
    if (statsText || itemFix) {
      itemStats = fixedBase();   // the wiki's block with your ✎ fix from the game applied
      $('istats').style.display = 'block';
      $('itier-row').style.display = 'flex';
      $('itier').value = 0; $('itierval').textContent = '+0';
      $('istats').textContent = statsAt(0);
      renderWeapon(0);
      itemUrl = cached.url || ('https://eqlwiki.com/' + encodeURIComponent((cached.pageTitle || itemName).replace(/ /g, '_')));
      $('icopy').style.display = 'inline-flex';
    } else if (cached.mobsheet) {
      $('istats').style.display = 'block';
      $('istats').textContent = cached.mobsheet;
    }
    // effects (wiki + your fix), your fix note, and the exaltations on your own copies — dock-itemfix.js
    renderEffects(itemStats || statsText);
    renderFixNote();
    renderExalts();
    // known loot chips (mob pages)
    const dd = $('idrops');
    dd.innerHTML = '';
    for (const it of cached.dropsList || []) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = it;
      c.addEventListener('click', () => showItem(it));
      dd.appendChild(c);
    }
    // sections: your kills first, then wiki text, then eqlegendstools rows
    const sect = $('isect');
    sect.innerHTML = '';
    const add = (label, body) => {
      const h = document.createElement('div'); h.className = 'sect-h'; h.textContent = label;
      const b = document.createElement('div'); b.className = 'sect-b'; b.textContent = body;
      sect.appendChild(h); sect.appendChild(b);
    };
    const mobLower = (cached.pageTitle || itemName).toLowerCase();
    const obs = [];
    for (const m of Object.values((lootDB && lootDB.mobs) || {})) {
      if ((m.name || '').toLowerCase() !== mobLower || !m.kills) continue;
      for (const d2 of Object.values(m.drops || {}))
        obs.push(d2.name + '  ' + d2.count + '/' + m.kills +
          ' (' + (d2.count / m.kills * 100).toFixed(d2.count / m.kills >= 0.1 ? 0 : 1) + '%)' +
          (m.zone ? '  — ' + m.zone : ''));
    }
    if (obs.length) {
      add('Your own kills', obs.join('\n'));
      const k = document.createElement('span');
      k.className = 'chip'; k.textContent = '🗡 your kill card';
      k.addEventListener('click', () => showMob(cached.pageTitle || itemName));
      sect.appendChild(k);
    }
    if (cached.text) add('eqlwiki.com', (cached.dropsfrom ? 'Drops from: ' + cached.dropsfrom + '\n\n' : '') + cached.text);
    for (const t of cached.tools || []) add('eqlegendstools.com · ' + t.source, t.lines.join('\n'));
    const c2 = document.createElement('div');
    c2.className = 'cached';
    c2.textContent = 'cached ' + new Date(cached.updated || Date.now()).toLocaleDateString();
    sect.appendChild(c2);
    // deep links
    const src = $('isources');
    src.innerHTML = '';
    for (const [n, fn] of ITEM_SOURCES) {
      const b = document.createElement('span');
      b.className = 'chip';
      b.textContent = n + ' ↗';
      b.title = 'Search "' + itemName + '" on ' + n + ' (opens your browser) — community database, all credit to its maintainers';
      b.addEventListener('click', () => window.overlay.openExternal(fn(itemName)));
      src.appendChild(b);
    }
  }

  $('iupdate').addEventListener('click', () => showItem(itemName, true));
  $('iwish').addEventListener('click', () => {
    wished = !wished;
    $('iwish').textContent = wished ? '🌟' : '☆';
    window.overlay.cleanupCmd({ kind: 'wish', name: itemName, on: wished });
  });

  // wish-state answers ride the cleanup-data channel
  window.overlay.onCleanupData((p) => {
    if (p.wishState && p.wishState.name === itemName) {
      wished = !!p.wishState.on;
      $('iwish').textContent = wished ? '🌟' : '☆';
    }
  });

  // ---------- mode dispatch ----------
  window.overlay.onDockMode((m) => {
    if (!m) return;
    navStack.length = 0; // fresh entry from the overlay: history restarts
    $('back').style.display = 'none';
    if (m.mode === 'item' && m.payload && m.payload.name) showItem(m.payload.name, false, true);
    else if (m.mode === 'guide' && m.payload) showGuide(m.payload, false, true);
    else if (m.mode === 'mob' && m.payload && m.payload.name) showMob(m.payload.name, true);
    else if (m.mode === 'help') showHelp(true);
    else { setMode('cleanup'); render(); }
  });

  // Large-text setting from the overlay's settings
  window.overlay.onUiScale((v) => document.body.classList.toggle('large', v === 'large'));

  // locked overlay = this window goes click-through too: the title bar, rows,
  // chips and readable text come alive on hover (click + scroll still work
  // there), everywhere else your clicks reach the game underneath
  let lockedMode = false, hoverLive = false;
  const HOVER_SEL = '#topbar, #chips, .row, #gtext, #gtoc, #gfoot, button, input, select, .q-it';
  window.overlay.onLockState((locked) => {
    lockedMode = !!locked;
    hoverLive = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!lockedMode) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const want = !!(el && el.closest && el.closest(HOVER_SEL));
    if (want !== hoverLive) { hoverLive = want; window.overlay.setInteractive(want); }
  });
