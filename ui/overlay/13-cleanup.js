// SEQO overlay — cleanup engine and wish list.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= cleanup engine =================
  // Drives the separate Cleanup window: every bag/bank item classified as
  // still-needed / job-done / unknown, judged against ALL classes. Unknowns
  // resolve through the wiki once, then live forever in itemKnowledge
  // (synced via the game DB, so lookups done on one computer serve the other).
  let cleanupActive = false, cleanupScanning = false, cleanupDirty = false;
  let needsDirty = false;   // zone-needs panel: refresh on the next tick
  let itemKnowledge = {};
  window.overlay.getItemKnowledge().then((k) => { itemKnowledge = k || {}; });
  // your ✎ fixes from the game (2.7, itemfix.js) — the dock saves them, Cleanup shows them
  let itemFixes = {};
  const loadItemFixes = () => (window.overlay.getItemFixes ? window.overlay.getItemFixes().then((f) => { itemFixes = f || {}; }).catch(() => {}) : Promise.resolve());
  loadItemFixes();
  // "Focus: Bloodmoon → Furious Bash · Proc: Torrid Corruptor" for the first copy that has exaltations
  const EX_TYPES = [['focus', 'Focus'], ['click', 'Click'], ['worn', 'Worn'], ['proc', 'Proc']];
  function exaltText(name) {
    const inv = gameFiles && gameFiles.inventory;
    const copies = inv && inv.exalts && inv.exalts[String(name).toLowerCase()];
    const c = copies && copies[0];
    if (!c) return '';
    return EX_TYPES.filter(([k]) => c[k]).map(([k, label]) => {
      const src = c[k].replace(/\s*\(Exaltation\)\s*$/i, '');
      const f = itemFixes[normItemName(src)];
      const fx = f && (f.effects || []).find((e) => e.type === label);
      return label + ': ' + src + (fx ? ' → ' + fx.name : '');
    }).join(' · ');
  }
  const ALL_CLASSES = Object.keys(window.EQLEpics.EPICS); // window global: safe this early in the script

  // ---- what kind of item it is (2.7 Cleanup views): Gear · Tracked (epic, Plane of Sky,
  // spell quest, unlock/key) · Quest · Tradeskill · Misc — plus where that answer came from
  const isEpicPart = (cls, key) =>
    feedsFor(cls).some(f => Object.keys(f.parts).some(p => normItemName(p) === key)) ||
    epicItemsFor(cls).some(it => normItemName(it.n) === key);
  let trackIdx = null;   // item key -> [{ track, what }] from SEQO's own quest trackers (built once)
  function trackedOf(key) {
    if (!trackIdx) {
      trackIdx = new Map();
      const add = (n, track, what) => {
        if (!n) return;
        const k = normItemName(n);
        const a = trackIdx.get(k) || [];
        if (!a.some(x => x.track === track && x.what === what)) a.push({ track, what });
        trackIdx.set(k, a);
      };
      for (const q of POS.quests || []) for (const it of q.items || []) add(it.name, 'Plane of Sky', q.reward + ' (' + q.cls + ')');
      if (window.EQLSpellQuests) for (const q of EQLSpellQuests.QUESTS || []) for (const it of q.items || []) add(it.name, 'Spell quest', q.spell + ' (' + q.cls + ')');
      for (const [nm, rq] of Object.entries(UNL.RACE_QUESTS || {})) for (const st of rq.steps || []) add(st.item, 'Unlock', 'race: ' + nm);
      for (const [nm, kq] of Object.entries(UNL.KEY_QUESTS || {})) { for (const st of kq.steps || []) add(st.item, 'Unlock', 'key: ' + nm); if (kq.keyItem) add(kq.keyItem, 'Unlock', 'key: ' + nm); }
      for (const n of UNL.GRIND_ITEMS || []) add(n, 'Unlock', 'faction turn-in');
    }
    const out = (trackIdx.get(key) || []).slice();
    for (const cls of ALL_CLASSES) if (isEpicPart(cls, key)) out.push({ track: 'Epic', what: ((EPICDB.EPICS[cls] || {}).epic || 'epic') + ' (' + cls + ')' });
    return out;
  }
  // { cat, track, src, url } for a row — cat: 'gear' | 'tracked' | 'quest' | 'tradeskill' | 'misc'
  function cleanupCategory(name, key, k, v) {
    const tr = trackedOf(key);
    // race-unlock faction turn-ins the grind tracker counts (Bandages, wines…) — not all are in GRIND_ITEMS
    if (!tr.some(t => t.track === 'Unlock') && v && /^faction turn-in/.test(v.reason || '')) tr.push({ track: 'Unlock', what: v.reason });
    if (tr.length) {
      const tracks = [...new Set(tr.map(t => t.track))];
      return { cat: 'tracked', track: tracks.join(' + '), trackWhat: tr.slice(0, 3).map(t => t.what).join(' · '), src: 'SEQO trackers', url: '' };
    }
    const alt = k && k.notFound && k.alt && k.alt.src ? k.alt : null;
    const src = k && k.page ? 'eqlwiki' : alt ? alt.src : '';
    const url = k && k.page ? 'https://eqlwiki.com/' + encodeURIComponent(k.page.replace(/ /g, '_')) : alt ? (alt.url || '') : '';
    const bis = settings.bisClass && bisData()[settings.bisClass] &&
      Object.values(bisData()[settings.bisClass]).some(items => (items || []).some(it => it.n.toLowerCase() === key));
    if (/exaltation/i.test(name) || bis) return { cat: 'gear', src: src || (bis ? 'BiS list' : 'SEQO'), url };
    // a use beats the Slot line: Fishing Grubs (ammo slot) is bait, a ring a quest wants is a quest item
    if ((k && k.quests && k.quests.length) || (alt && alt.quests && alt.quests.length)) return { cat: 'quest', src, url };
    if ((k && k.ts !== undefined) || (alt && alt.ts)) return { cat: 'tradeskill', src, url };
    if ((k && k.gear) || (alt && alt.gear)) return { cat: 'gear', src, url };
    // "+3" on the end = an upgraded copy: only gear gets tier upgrades in Legends
    if (/\s\+\d+$/.test(name)) return { cat: 'gear', src: src || 'item name (+tier)', url };
    return { cat: 'misc', src: src || (k && k.notFound ? (k.altChecked ? 'not found anywhere' : 'no eqlwiki page — checking others') : ''), url };
  }

  function classifyForCleanup(name) {
    const key0 = normItemName(name);
    // the wiki's quest template placeholder ("Quest_Name") is not a quest
    const kq = itemKnowledge[key0];
    if (kq && kq.quests && kq.quests.some(q => /^quest[_ ]?name$/i.test(q))) kq.quests = kq.quests.filter(q => !/^quest[_ ]?name$/i.test(q));
    const v = classifyVerdict(name);
    const k = itemKnowledge[key0];
    // an item eqlwiki doesn't know, but another source does: its answer, labelled
    if (v.pile === 'unk' && k && k.notFound && k.alt && k.alt.src) {
      const a = k.alt;
      if (a.quests && a.quests.length) Object.assign(v, { pile: 'need', reason: 'used in (' + a.src + '): ' + a.quests.join(', '), quests: a.quests });
      else if (a.gear) Object.assign(v, { pile: 'gear', reason: 'gear (' + a.src + ')' + (a.note ? ' — ' + a.note : '') });
      else if (a.ts) Object.assign(v, { pile: 'need', reason: 'tradeskill (' + a.src + ')' });
      else Object.assign(v, { reason: a.note ? a.note + ' (' + a.src + ')' : 'no eqlwiki page — ' + a.src });
    }
    const c = cleanupCategory(name, key0, k, v);
    if (v.pile === 'unk' && c.cat === 'gear' && /\s\+\d+$/.test(name))
      Object.assign(v, { pile: 'gear', reason: 'gear (upgraded copy)' + (k && k.alt && k.alt.note ? ' — ' + k.alt.note : ' — no eqlwiki page') });
    return Object.assign(v, c);
  }

  function classifyVerdict(name) {
    const key = normItemName(name);
    const vk = verdictKey(name);
    // exaltations are pulled gear effects — no wiki page, always worth keeping
    if (/exaltation/i.test(name)) return { pile: 'need', reason: 'exaltation — transferable effect' };
    if (itemVerdicts[vk] === 'junk') return { pile: 'done', reason: 'on your junk list' };
    if (wishList[vk]) return { pile: 'need', reason: 'on your wish list' };
    if (itemVerdicts[vk] === 'keep') return { pile: 'need', reason: 'on your keep list' };
    let done = null;
    for (const q of POS.quests) {
      const it = q.items.find(x => x.name.toLowerCase() === key);
      if (!it) continue;
      const st = qState(q.reward);
      if (!st.done) return { pile: 'need', reason: 'PoS: ' + q.reward + ' (' + q.cls + ')' };
      done = q.reward + ' already turned in';
    }
    // epics: the demand engine understands recipes — ingredients whose crafted
    // reward you already own (or whose epic is finished) land in "job done"
    let epicCovered = null;
    for (const cls of ALL_CLASSES) {
      if (!isEpicPart(cls, key)) continue;   // a finished epic must not mark UNRELATED items "job done"
      const d = epicClassDemand(cls, key);
      if (d.need > 0) {
        const cnt = d.need > 1 ? ' — need ×' + d.need : '';
        return { pile: 'need', reason: 'Epic prep: ' + ((EPICDB.EPICS[cls] || {}).epic || 'epic') + ' (' + cls + ')' + cnt };
      }
      if (!epicCovered && d.coveredBy.length)
        epicCovered = d.coveredBy[0] + ' (' + cls + ')';
    }
    if (epicCovered) return { pile: 'done', reason: 'epic job done — ' + epicCovered };
    // BiS: only when the opt-in flag is on, and only your own class
    if (settings.bisFlag && settings.bisClass && bisData()[settings.bisClass]) {
      for (const [slot, items] of Object.entries(bisData()[settings.bisClass])) {
        if ((items || []).some(it => it.n.toLowerCase() === key))
          return { pile: 'need', reason: 'BiS ' + slot.toLowerCase() + ' (' + settings.bisClass + ')' };
      }
    }
    // faction turn-ins stay "needed" only while a faction that eats them isn't maxed
    const grind = grindItemNeed(key);
    if (grind)
      return { pile: 'need', reason: 'faction turn-in — ' + grind.faction + (grind.total ? ' (' + grind.have + '/' + grind.total + ')' : '') };
    if (UNL.GRIND_ITEMS.some(n => n.toLowerCase() === key))
      return { pile: 'done', reason: 'faction turn-in — all factions that use it are maxed' };
    if (done) return { pile: 'done', reason: done };
    const k = itemKnowledge[key];
    if (k) {
      const tsLabel = k.ts !== undefined
        ? 'tradeskill' + (Array.isArray(k.ts) && k.ts.length === 1 ? ' – ' + k.ts[0] : ' ingredient')
        : null;
      if (k.quests && k.quests.length) // every quest listed; the window renders them clickable
        return { pile: 'need', reason: 'used in: ' + k.quests.join(', ') + (tsLabel ? ' · ' + tsLabel : ''),
                 quests: k.quests, chain: k.chain };
      if (tsLabel) return { pile: 'need', reason: tsLabel };
      if (k.gear) return { pile: 'gear', reason: 'gear — no quest use' };
      if (k.notFound) return { pile: 'unk', reason: 'no wiki page found' };
      return { pile: 'done', reason: 'wiki: no quest or tradeskill use found' };
    }
    return { pile: 'unk', reason: '' };
  }

  function buildCleanupRows() {
    const inv = gameFiles && gameFiles.inventory;
    if (!inv) return [];
    const rows = [];
    for (const it of Object.values(inv.items || {})) {
      // per-bucket counts from main's parser; an old cached file (pre-2.4)
      // falls back to prefix-matching the stored location names
      const by = it.by || (() => {
        const b = { bags: 0, depot: 0, bank: 0, shared: 0, stored: 0, worn: 0 };
        for (const l of it.locs || []) {
          if (/^(General|Held)/i.test(l)) b.bags = b.bags || it.count;
          else if (/^Personal-?Depot/i.test(l)) b.depot = b.depot || it.count;
          else if (/^SharedBank/i.test(l)) b.shared = b.shared || it.count;
          else if (/^Bank/i.test(l)) b.bank = b.bank || it.count;
          else if (/^Equipment/i.test(l)) b.stored = b.stored || it.count;
        }
        return b;
      })();
      const stored = (by.bags || 0) + (by.depot || 0) + (by.bank || 0) + (by.shared || 0) + (by.stored || 0);
      if (!stored) continue; // worn gear, slotted augs and the exaltation registry aren't clutter
      const row = { name: it.name, count: stored, by, ...classifyForCleanup(it.name) };
      // the real game: exaltations slotted into your copy, effects you recorded with ✎ Fix
      const ex = exaltText(it.name);
      const fix = itemFixes[normItemName(it.name)];
      const own = fix ? (fix.effects || []).map((e) => (e.type === 'Effect' ? 'Effect' : e.type) + ': ' + e.name).join(' · ') : '';
      const extra = [own, ex ? 'exalted — ' + ex : ''].filter(Boolean).join(' · ');
      if (extra) {
        if (/^gear — no quest use$/.test(row.reason || '')) row.reason = 'gear · ' + extra;
        else row.reason = (row.reason ? row.reason + ' · ' : '') + extra;
      }
      if (fix) row.src = (row.src ? row.src + ' + ' : '') + 'your fix';
      rows.push(row);
    }
    return rows;
  }

  // auto-scan: uncached items look themselves up the moment the window opens
  // or new unknowns appear (fresh inventory file, new loot). The 🔎 button
  // stays as a manual re-run.
  function maybeAutoScan() {
    if (!cleanupActive || cleanupScanning) return;
    if (Date.now() - lastScanAbort < 600000) return; // wiki was unreachable — retry later, not in a loop
    const rows = buildCleanupRows();
    if (rows.some(r => r.pile === 'unk' && r.reason === '') ||
        rows.some(r => { const k = itemKnowledge[normItemName(r.name)]; return k && k.notFound && !k.altChecked; })) runCleanupScan();
  }
  let lastScanAbort = 0;

  const cleanupStatus = () => {
    const inv = gameFiles && gameFiles.inventory;
    if (!inv) return '⚠ no inventory file — run /outputfile inventory';
    let s = 'inventory file: ' + fmtAge(inv.mtime);
    if (inv.depotCarried)
      s += ' · 📦 storage carried from ' + fmtAge(inv.depotCarried.at) + ' (the game only exports the depot while you’re at it)';
    return s;
  };
  function pushCleanup(extra) {
    if (!cleanupActive) return;
    window.overlay.cleanupPush(Object.assign({ rows: buildCleanupRows(), status: cleanupStatus() }, extra || {}));
  }

  // page fetch that prefers the local cache (old cache entries predate the
  // rewards/questUses fields, so those force one refresh)
  async function cleanupPage(name) {
    const c = await window.overlay.getItemData(name);
    if (c && c.pageTitle && c.rewards !== undefined) return c;
    return window.overlay.updateItemData(name);
  }

  // quest chain: quest → reward(s) → what each reward is itself needed for.
  // Resolved once per item at scan time and remembered in itemKnowledge, so
  // "Butler Syncalls Fang — Vampire Teeth → Electrum-Bladed Wakizashi →
  // needed for: Call of Flame Quest" reads straight off the row.
  async function resolveChain(quests) {
    const chain = [];
    for (const q of (quests || []).slice(0, 3)) {
      try {
        const qd = await cleanupPage(q);
        if (!qd || qd.error || !qd.pageTitle) continue;
        for (const rw of (qd.rewards || []).slice(0, 2)) {
          const rd = await cleanupPage(rw);
          const uses = ((rd && !rd.error && rd.questUses) || [])
            .filter(u => u.toLowerCase() !== q.toLowerCase() && u.toLowerCase() !== rw.toLowerCase());
          if (uses.length) chain.push(q + ' → ' + rw + ' → needed for: ' + uses.slice(0, 2).join(', '));
          await new Promise(r => setTimeout(r, 350));
        }
      } catch { /* one bad page never stops the pass */ }
    }
    return chain;
  }

  async function runCleanupScan() {
    if (cleanupScanning) return;
    cleanupScanning = true;
    const unknowns = buildCleanupRows().filter(r => r.pile === 'unk' && r.reason === '');
    // bulk pre-check (one request per 50 names): items whose page provably
    // doesn't exist get cached notFound WITHOUT a lookup each. The slow 30-day
    // re-check still runs the full search-fallback path, so a renamed page
    // self-heals later. Single manual lookups are untouched.
    let exist = null;
    if (unknowns.length > 5) {
      window.overlay.cleanupPush({ status: '🔎 wiki: checking which of ' + unknowns.length + ' items have pages…', scanning: true });
      try {
        const r = await window.overlay.checkPagesExist(unknowns.map(u => u.name.replace(/\s*\+\d+$/, '')));
        if (r && !r.error) exist = r;
      } catch { /* fall back to per-item lookups */ }
    }
    let done = 0;
    for (const r of unknowns) {
      if (!cleanupActive) break; // window closed — stop fetching
      const baseName = r.name.replace(/\s*\+\d+$/, '');
      const key = normItemName(r.name);
      if (exist && exist[baseName] === false) { // provably no page: cache the answer, zero requests
        const entry = { quests: [], notFound: true, checkedAt: Date.now(), chainChecked: true };
        itemKnowledge[key] = entry;
        window.overlay.setItemKnowledge(key, entry);
        done++;
        if (done % 10 === 0 || done === unknowns.length) pushCleanup({ scanning: true });
        continue;
      }
      window.overlay.cleanupPush({ status: '🔎 wiki: ' + (done + 1) + ' / ' + unknowns.length + ' — ' + r.name, scanning: true });
      try {
        const data = await window.overlay.updateItemData(baseName);
        // "no page" is an ANSWER (cache it forever) — a network failure is
        // not: cache nothing and stop the pass, the wiki is unreachable
        if (data && data.error && !/no wiki page found/i.test(data.error)) {
          window.overlay.cleanupPush({ status: '⚠ wiki unreachable (' + data.error + ') — scan paused, nothing mis-cached', scanning: false });
          cleanupScanning = false;
          lastScanAbort = Date.now();
          return;
        }
        const entry = (data && !data.error && data.pageTitle)
          ? { quests: data.questUses || [], page: data.pageTitle, checkedAt: Date.now() }
          : { quests: [], notFound: true, checkedAt: Date.now() };
        if (data && data.tradeskill && data.tradeskill.is) entry.ts = data.tradeskill.skills || [];
        if (data && data.statsblock && /\bslot:\s*[a-z]/i.test(data.statsblock)) entry.gear = true;
        if (entry.quests.length) {
          const chain = await resolveChain(entry.quests);
          if (chain.length) entry.chain = chain;
        }
        entry.chainChecked = true;
        itemKnowledge[key] = entry;
        window.overlay.setItemKnowledge(key, entry);
      } catch { /* transient failure: leave it unknown, the next scan retries */ }
      done++;
      if (done % 5 === 0 || done === unknowns.length) pushCleanup({ scanning: true });
      await new Promise(res => setTimeout(res, 500)); // be polite to the wiki
    }
    // backfill pass: items scanned before chains existed get theirs now
    const chainless = Object.entries(itemKnowledge)
      .filter(([, e]) => e.quests && e.quests.length && !e.chainChecked);
    let chained = 0;
    for (const [key, e] of chainless) {
      if (!cleanupActive) break;
      window.overlay.cleanupPush({ status: '🔗 quest chains: ' + (chained + 1) + ' / ' + chainless.length, scanning: true });
      const chain = await resolveChain(e.quests);
      if (chain.length) e.chain = chain;
      e.chainChecked = true;
      itemKnowledge[key] = e;
      window.overlay.setItemKnowledge(key, e);
      chained++;
      if (chained % 5 === 0) pushCleanup({ scanning: true });
    }
    const other = await scanOtherSources();
    cleanupScanning = false;
    pushCleanup({ scanning: false, status: cleanupStatus() + ' · scan done (' + done + ' looked up' +
                  (chained ? ', ' + chained + ' chains resolved' : '') + (other ? ', ' + other + ' found elsewhere' : '') + ')' });
  }

  // items in your bags eqlwiki has no page for (2.7): first ask the wiki again (pages
  // get written — Gamblers Gambit had none when first scanned), then the other sources
  // (eqlegendstools, your loot records, the P99 wiki) — each answer keeps its source.
  const NF_RECHECK_MS = 3 * 864e5;
  async function scanOtherSources() {
    if (!window.overlay.itemAltSource) return 0;
    const nf = buildCleanupRows().map(r => ({ r, key: normItemName(r.name) }))
      .filter(x => itemKnowledge[x.key] && itemKnowledge[x.key].notFound);
    if (!nf.length) return 0;
    // 1) the wiki again, one request per 50 names, for answers older than 3 days
    const stale = nf.filter(x => Date.now() - (itemKnowledge[x.key].checkedAt || 0) > NF_RECHECK_MS);
    if (stale.length) {
      window.overlay.cleanupPush({ status: '🔎 wiki: re-checking ' + stale.length + ' items it had no page for…', scanning: true });
      try {
        const ex = await window.overlay.checkPagesExist(stale.map(x => x.r.name.replace(/\s*\+\d+$/, '')));
        for (const x of stale) {
          const e = itemKnowledge[x.key];
          if (ex && !ex.error && ex[x.r.name.replace(/\s*\+\d+$/, '')] === true) {
            delete itemKnowledge[x.key];                   // has a page now: the next scan looks it up properly
            window.overlay.setItemKnowledge(x.key, undefined);
          } else { e.checkedAt = Date.now(); window.overlay.setItemKnowledge(x.key, e); }
        }
      } catch { /* wiki unreachable: keep the old answers */ }
      if (nf.some(x => !itemKnowledge[x.key])) { setTimeout(() => { cleanupScanning = false; runCleanupScan(); }, 50); }
    }
    // 2) the other sources, once per item
    let found = 0, n = 0;
    const todo = nf.filter(x => itemKnowledge[x.key] && !itemKnowledge[x.key].altChecked);
    for (const x of todo) {
      if (!cleanupActive) break;
      window.overlay.cleanupPush({ status: '🔎 other sources: ' + (++n) + ' / ' + todo.length + ' — ' + x.r.name, scanning: true });
      let a = null;
      try { a = await window.overlay.itemAltSource(x.r.name); } catch { a = null; }
      if (a && a.error) continue;                          // offline: ask again next scan
      const e = itemKnowledge[x.key];
      if (a && a.src) { e.alt = a; found++; }
      e.altChecked = Date.now();
      window.overlay.setItemKnowledge(x.key, e);
      if (n % 5 === 0) pushCleanup({ scanning: true });
      await new Promise(res => setTimeout(res, 400));      // be polite to the P99 wiki
    }
    return found;
  }

  window.overlay.onCleanupState((open) => {
    cleanupActive = open;
    if (open) { pushCleanup(); setTimeout(maybeAutoScan, 400); }
  });
  window.overlay.onCleanupCmd(async (cmd) => {
    if (!cmd) return;
    if (cmd.kind === 'refresh') pushCleanup();
    else if (cmd.kind === 'fixes') loadItemFixes().then(() => pushCleanup());
    else if (cmd.kind === 'scan') runCleanupScan();
    else if (cmd.kind === 'lookup' && cmd.name) openItemLink(cmd.name.replace(/\s*\+\d+$/, ''));
    else if (cmd.kind === 'wish' && cmd.name) {
      // dock's ☆ button: keep the overlay's wish list as the single source
      const key = verdictKey(cmd.name);
      const on = !!cmd.on;
      if (on && !wishList[key]) wishList[key] = { name: cmd.name.replace(/ \+\d+$/, ''), added: Date.now() };
      if (!on && wishList[key]) delete wishList[key];
      pushWishList();
      renderWishList();
      window.overlay.cleanupPush({ wishState: { name: cmd.name, on } });
    }
    else if (cmd.kind === 'wishstate' && cmd.name)
      window.overlay.cleanupPush({ wishState: { name: cmd.name, on: isWished(cmd.name) } });
    else if (cmd.kind === 'exaltview' && cmd.name) {
      // dock's effect link: open the Exaltations view on that effect
      exaltSel = cmd.name;
      setTab('quests');
      setQuestView('__exalts');
      renderQuests();
    }
    else if (cmd.kind === 'junk' && cmd.name) {
      const key = verdictKey(cmd.name);
      itemVerdicts[key] = 'junk';
      window.overlay.setItemVerdict(key, 'junk');
      renderLoot();
    }
  });

  // (the old vendor sell list retired in 2.3 — 🧹 Cleanup's "Job done" pile
  //  does its work, live-updating as you vendor and destroy)

  // ---- wish list: items/spells you're hunting ----
  let wishList = {};   // key -> { name, added }
  // the item's OWN wiki page knows where it drops ("Drops From: The Hole — a
  // rock golem") — cache that per wished item so zone needs can use it
  const wishDropCache = new Map(); // key -> { zones: [{zone,mobs}] } ({} = nothing known)
  // the cached dropsfrom TEXT ("The Hole\n* a rock golem"): a short non-bullet
  // line is a zone header, bullets under it are that zone's mobs
  const parseDropsfromText = (txt) => {
    const out = [];
    let cur = null;
    for (const raw of String(txt || '').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (/^[*#]/.test(line)) {
        const mob = line.replace(/^[*#]+\s*/, '').trim();
        if (!mob) continue;
        if (!cur) out.push(cur = { zone: '', mobs: [] });
        if (cur.mobs.length < 12 && !cur.mobs.includes(mob)) cur.mobs.push(mob);
      } else if (line.length <= 40 && !/[.!?]$/.test(line)) { // prose is not a zone
        out.push(cur = { zone: line, mobs: [] });
      }
    }
    return out.filter(g => g.zone);
  };
  function refreshWishDrops() {
    for (const [key, e] of Object.entries(wishList)) {
      if (wishDropCache.has(key)) continue;
      wishDropCache.set(key, {}); // claim the slot so we fetch once
      (async () => {
        let d = await window.overlay.getItemData(e.name).catch(() => null);
        // nothing cached (or cached before drop parsing): one polite wiki
        // fetch — starring an item is exactly when you want its drop zones
        if (!d || (!d.dropZones && !(d.dropsList || []).length && !d.dropsfrom)) {
          const fresh = await window.overlay.updateItemData(e.name).catch(() => null);
          if (fresh && !fresh.error) d = fresh;
        }
        if (!d) return;
        let zones = (d.dropZones || []).filter(g => g.zone);
        // older caches: derive zones from the dropsfrom text, then from the
        // flat list (Title Case entries head it, lowercase "a …" are mobs)
        if (!zones.length) zones = parseDropsfromText(d.dropsfrom);
        if (!zones.length) {
          const list = d.dropsList || [];
          const mobs = list.filter(n => /^(a|an|the) [a-z]/.test(n));
          zones = list.filter(n => !mobs.includes(n)).map(z => ({ zone: z, mobs }));
        }
        if (zones && zones.length) {
          wishDropCache.set(key, { zones });
          needsDirty = true;
          renderWishList(); // the source line can now name the drop zone
        }
      })();
    }
  }
  // match against every name the current zone goes by: the game's log name
  // AND the wiki page title (game "The Ruins of Old Paineel" = wiki "The Hole")
  const wishWikiHere = (key, zoneNames) => {
    const c = wishDropCache.get(key);
    if (!c || !c.zones) return null;
    const zs = [].concat(zoneNames).filter(Boolean).map(z => z.toLowerCase());
    if (!zs.length) return null;
    return c.zones.find(g => g.zone &&
      zs.some(z => z.startsWith(g.zone.toLowerCase()) || g.zone.toLowerCase().startsWith(z))) || null;
  };
  window.overlay.getWishList().then((l) => { wishList = l || {}; refreshWishDrops(); });
  const pushWishList = () => window.overlay.setWishList(wishList);
  const isWished = (n) => !!wishList[verdictKey(n)];

  function toggleWish(name) {
    if (!name) return;
    const key = verdictKey(name);
    if (wishList[key]) { delete wishList[key]; toast('☆ Removed from wish list: ' + name); }
    else { wishList[key] = { name: name.replace(/ \+\d+$/, ''), added: Date.now() }; toast('🌟 Added to wish list: ' + name); }
    pushWishList();
    refreshWishDrops(); // pull the item page's drop zones for zone needs
    renderWishList();
    document.querySelectorAll('.wishstar[data-item]').forEach(s => {
      if (verdictKey(s.dataset.item) === key) {
        s.textContent = wishList[key] ? '★' : '☆';
        s.classList.toggle('on', !!wishList[key]);
      }
    });
    needsDirty = true;
  }

  // the universal ⭐ toggle: one star per item row, everywhere items are listed.
  // Starred items get toasts, KEEP verdicts, and a row in the zone-needs panel.
  function wishStar(name) {
    const s = document.createElement('span');
    s.className = 'wishstar' + (isWished(name) ? ' on' : '');
    s.dataset.item = name;
    s.textContent = isWished(name) ? '★' : '☆';
    s.title = 'Wish list: star what you\'re hunting — SEQO watches for it everywhere';
    s.addEventListener('click', (ev) => { ev.stopPropagation(); toggleWish(name); });
    return s;
  }

  // where can a wished item come from? your own drop history + PoS + cached wiki
  function wishObservedSources(key) {
    const out = [];
    for (const m of Object.values(lootDB.mobs || {})) {
      for (const d of Object.values(m.drops || {})) {
        if (d.name.toLowerCase() !== key) continue;
        out.push({ mob: m.name, zone: m.zone || '', count: d.count, kills: m.kills || 0 });
      }
    }
    return out.sort((a, b) => (b.count / Math.max(1, b.kills)) - (a.count / Math.max(1, a.kills)));
  }

  async function wishSourceText(e) {
    const key = verdictKey(e.name);
    const lines = [];
    for (const s of wishObservedSources(key).slice(0, 2)) {
      const pct = s.kills ? (s.count / s.kills * 100) : 0;
      lines.push('seen: ' + s.mob + (s.zone ? ' — ' + s.zone : '') + '  ' + s.count + '/' + s.kills +
                 (s.kills ? ' (' + (pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)) + '%)' : ''));
    }
    const pq = POS.quests.find(q => q.reward.toLowerCase() === key);
    if (pq) {
      lines.push('PoS quest (' + pq.cls + ') — turn in to ' + pq.npc + ':');
      for (const i of pq.items) {
        const st = qState(pq.reward);
        lines.push((st.items[i.name] ? ' ☑ ' : ' ☐ ') + i.name + ' — ' + i.loc);
      }
    }
    // a wished QUEST (from the class index): show which zones it involves
    const qi = questIndex && questIndex.quests &&
      questIndex.quests.find(q => q.title.toLowerCase() === key);
    if (qi && qi.zones.length) lines.push('quest zones (' + qi.cls + '): ' + qi.zones.join(', '));
    const cached = await window.overlay.getItemData(e.name);
    if (cached && cached.dropsfrom) lines.push('wiki: drops from ' + cached.dropsfrom);
    const wd = wishDropCache.get(key);
    if (wd && wd.zones && wd.zones.length)
      lines.push('🎯 needs will flag it in: ' + wd.zones.map(g => g.zone).filter(Boolean).join(', '));
    return lines.length ? lines.join('\n') : 'no known source yet — click the name and Update from wiki';
  }

  let wishSeq = 0;
  async function renderWishList() {
    const box = $('k-wishbox');
    const seq = ++wishSeq;
    const entries = Object.values(wishList);
    box.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'l-divider';
    head.textContent = '🌟 Wish list';
    box.appendChild(head);
    if (!entries.length) {
      const hint = document.createElement('div');
      hint.style.cssText = 'color:#888;font-size:10.5px;padding:1px 6px 4px';
      hint.textContent = 'Empty — open any item below and click ☆ Wish to track where it drops and get alerted when it does.';
      box.appendChild(hint);
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const row = document.createElement('div');
      row.className = 'wish-row';
      row.innerHTML = '<div style="display:flex;gap:6px;align-items:baseline"><span class="itemlink nm"></span>' +
        '<span style="flex:1"></span><span class="wish-x" title="Remove from wish list">✕</span></div>' +
        '<div class="wish-src"></div>';
      row.querySelector('.nm').textContent = e.name;
      row.querySelector('.nm').addEventListener('click', () => openItem(e.name));
      row.querySelector('.wish-x').addEventListener('click', () => toggleWish(e.name));
      box.appendChild(row);
      wishSourceText(e).then((t) => { if (seq === wishSeq) row.querySelector('.wish-src').textContent = t; });
    }
  }

  // zone-entry heads-up: something you wish for drops here (per your history / PoS)
  const wishZoneToasted = new Set();
  function wishZoneCheck(zone) {
    if (!zone || !Object.keys(wishList).length || wishZoneToasted.has(zone)) return;
    const hits = [];
    for (const e of Object.values(wishList)) {
      const key = verdictKey(e.name);
      const src = wishObservedSources(key).find(s => s.zone && zone.startsWith(s.zone.replace(/ \(.+\)$/, '')));
      const wiki = wishWikiHere(key, [zone, zone === currentZone && zoneData ? zoneData.pageTitle : null]);
      const iq = questIndex && questIndex.quests &&
        questIndex.quests.find(q => q.title.toLowerCase() === key && q.zones.includes(zone));
      if (src) hits.push(e.name + ' (' + src.mob + ')');
      else if (wiki) hits.push(e.name + (wiki.mobs.length ? ' (' + wiki.mobs[0] + ')' : ''));
      else if (/plane of sky/i.test(zone) && POS.quests.some(q => q.reward.toLowerCase() === key)) hits.push(e.name + ' (PoS quest)');
      else if (iq) hits.push(e.name + ' (quest here)');
    }
    if (hits.length) {
      wishZoneToasted.add(zone);
      toast('🌟 Wish list here: ' + hits.slice(0, 3).join(', ') + (hits.length > 3 ? ' +' + (hits.length - 3) : ''));
    }
  }

  function cycleItemVerdict(itemName) {
    const key = verdictKey(itemName);
    const cur = itemVerdicts[key];
    const next = cur === 'keep' ? 'junk' : cur === 'junk' ? null : 'keep';
    if (next) itemVerdicts[key] = next; else delete itemVerdicts[key];
    window.overlay.setItemVerdict(key, next);
    toast(next === 'keep' ? '⚑ ' + itemName + ' — always KEEP'
        : next === 'junk' ? '⚑ ' + itemName + ' — marked JUNK'
        : '⚑ ' + itemName + ' — flag cleared');
    renderLoot();
  }

  function setQuestEmpty(msg) {
    const el = $('q-empty');
    el.style.display = msg ? 'flex' : 'none';
    el.innerHTML = '';
    if (msg) msg.split('\n').forEach((line, i) => {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(line));
    });
  }

  // wiki-listed quests for any other zone: names from the local cache,
  // persistent ✓ done-state, click a name to read the quest on the Wiki tab
  const wikiQuestKey = (zone, title) => 'Z|' + zone + '|' + title;
  let wikiQuestSeq = 0;
  let questIndex = null;   // { classes, built, quests: [{title, cls, zones}] }
  window.overlay.getQuestIndex().then((qi) => { questIndex = qi; });
  window.overlay.onQuestIndexProgress((msg) => {
    const b = document.getElementById('q-buildindex');
    if (b) b.textContent = msg;
  });

  async function buildQuestIndex() {
    const sel = qSelClasses();
    if (!sel.length) { toast('Pick your class(es) above first — the index is built from class quest lists.'); return; }
    const b = $('q-buildindex');
    if (b) { b.disabled = true; b.textContent = 'Building…'; }
    const res = await window.overlay.buildQuestIndex(sel);
    if (res && res.error) toast('⚠ Index build failed: ' + res.error);
    else toast('📇 Quest index built: ' + res.quests + ' quests, ' + res.zoned + ' matched to zones');
    questIndex = await window.overlay.getQuestIndex();
    renderQuests();
  }

  async function renderWikiQuests(zone) {
    const seq = ++wikiQuestSeq;              // guard against out-of-order async renders
    const list = $('q-list');
    list.innerHTML = '';
    setQuestEmpty('');
    const hideDone = $('q-hidedone').checked;
    const data = await window.overlay.getZoneData(zone);
    if (seq !== wikiQuestSeq || activeTab !== 'quests' || questZone() !== zone) return;

    const head = document.createElement('div');
    head.className = 'l-divider';
    head.style.display = 'flex'; head.style.alignItems = 'baseline'; head.style.gap = '8px';
    head.innerHTML = '<span style="flex:1"></span>' +
      '<button class="kbtn" id="q-buildindex" title="Fetch your classes\' quest lists from the wiki and match each quest to its zone(s). One-time; cached and synced.">Index my classes 📇</button>' +
      '<button class="kbtn gold" id="q-wupdate" title="Fetch this zone\'s quest list from eqlwiki.com">Update ⟳</button>';
    head.querySelector('span').textContent = zone;
    list.appendChild(head);
    $('q-buildindex').addEventListener('click', buildQuestIndex);
    $('q-wupdate').addEventListener('click', async () => {
      $('q-wupdate').textContent = 'Fetching…';
      const res = await window.overlay.updateZoneData(zone, wikiCandidates(zone));
      if (res && res.error) toast('⚠ ' + res.error);
      renderQuests();
    });

    // a quest row shared by both sources (zone page + class index)
    let done = 0, shown = 0;
    const addQuestRow = (title, tag) => {
      const st = qState(wikiQuestKey(zone, title));
      if (st.done) done++;
      shown++;
      if (st.done && hideDone) return;
      const card = document.createElement('div');
      card.className = 'q-quest' + (st.done ? ' done' : '');
      const head2 = document.createElement('div');
      head2.className = 'q-head';
      head2.innerHTML = '<span class="rw itemlink"></span>' +
        (tag ? '<span class="cls"></span>' : '') +
        '<span class="st"></span><span class="q-p99" title="Read this quest on the Project 1999 wiki (classic EQ — Legends may differ)">P99</span><span class="q-donebtn" title="Mark done / not done">✓</span>';
      head2.querySelector('.rw').textContent = title;
      const p99 = head2.querySelector('.q-p99');
      p99.style.cssText = 'font-size:8.5px;color:#9ab;border:1px solid rgba(150,170,190,.35);border-radius:4px;padding:0 3px;cursor:pointer;flex:none;opacity:.7';
      p99.addEventListener('click', (e) => { e.stopPropagation(); openGuide({ title, source: 'p99', label: 'P99: ' + title }); });
      if (tag) head2.querySelector('.cls').textContent = tag;
      head2.querySelector('.st').textContent = st.done ? 'DONE' : '';
      head2.querySelector('.rw').addEventListener('click', (e) => { e.stopPropagation(); openItemLink(title); });
      head2.querySelector('.q-donebtn').addEventListener('click', () => {
        const s = qState(wikiQuestKey(zone, title));
        qSave(wikiQuestKey(zone, title), { done: !s.done, items: {} });
        renderQuests();
      });
      card.appendChild(head2);
      list.appendChild(card);
    };

    const quests = (data && data.quests) || [];
    for (const title of quests) addQuestRow(title, '');

    // class quest index: quests of YOUR classes the wiki text ties to this zone
    const sel = qSelClasses();
    const idx = (questIndex && questIndex.quests || [])
      .filter(q => (!sel.length || sel.includes(q.cls)) &&
                   q.zones.includes(zone) && !quests.includes(q.title));
    if (idx.length) {
      const d = document.createElement('div');
      d.className = 'l-divider';
      d.textContent = 'Class quests involving this zone (' + idx.length + ')';
      list.appendChild(d);
      for (const q of idx.sort((a, b) => a.cls.localeCompare(b.cls) || a.title.localeCompare(b.title)))
        addQuestRow(q.title, q.cls);
    }

    $('q-progress').textContent = shown ? done + '/' + shown + ' done' : '';

    if (!data && !idx.length)
      setQuestEmpty('No wiki data cached for "' + zone + '" yet.\nClick Update ⟳ above to fetch its quest list\nfrom eqlwiki.com (one-time, then it\'s local).');
    else if (!quests.length && !idx.length) {
      setQuestEmpty('The wiki has no quest list for "' + zone + '" —\nquests there are organized by class, not zone.\nTry 📇 Index my classes above: it scans your classes\'\nquest pages and matches them to zones.');
      // still give a path forward: full-text wiki search for this zone's quests
      const btn = document.createElement('button');
      btn.className = 'kbtn gold';
      btn.style.margin = '6px auto 0';
      btn.style.display = 'block';
      btn.textContent = 'Search the wiki: "' + zone.replace(/^The /, '') + ' quest" ⌕';
      btn.addEventListener('click', () => {
        setTab('lookup');
        $('k-query').value = zone.replace(/^The /, '') + ' quest';
        runWikiSearch();
      });
      list.appendChild(btn);
    }
  }

  // auto-mark: a looted item that an unfinished quest (for your classes) needs
  function posQuestLoot(itemName) {
    const sel = qSelClasses();
    if (!sel.length || !itemName) return;
    const want = itemName.toLowerCase();
    for (const q of POS.quests) {
      if (!sel.includes(q.cls)) continue;
      const st = qState(q.reward);
      if (st.done) continue;
      const it = q.items.find(x => x.name.toLowerCase() === want);
      if (!it || st.items[it.name]) continue;
      qSave(q.reward, { ...st, items: { ...st.items, [it.name]: true } });
      toast('📜 Quest item: ' + it.name + ' → ' + q.reward);
    }
    if (activeTab === 'quests') renderQuests();
  }

  // inventory reconcile: /outputfile inventory -> check off what you hold
  async function importInventory() {
    const res = await window.overlay.importInventory();
    if (!res) return;
    if (res.error) { toast('Import failed: ' + res.error); return; }
    const have = new Map(); // lower name -> count
    for (const line of res.text.split(/\r?\n/)) {
      const cols = line.split('\t');
      if (cols.length < 2 || cols[1] === 'Name' || cols[1] === 'Empty' || !cols[1]) continue;
      const k = cols[1].trim().replace(/ \+\d+$/, '').toLowerCase();
      have.set(k, (have.get(k) || 0) + (+(cols[3] || 1) || 1));
    }
    if (!have.size) { toast('That file had no inventory rows — use /outputfile inventory in game.'); return; }
    const sel = qSelClasses();
    const scope = sel.length ? POS.quests.filter(q => sel.includes(q.cls)) : POS.quests;
    let newDone = 0, newItems = 0;
    for (const q of scope) {
      const st = qState(q.reward);
      let changed = false;
      if (!st.done && have.has(q.reward.toLowerCase())) { st.done = true; newDone++; changed = true; }
      const items = { ...st.items };
      for (const it of q.items) {
        if (!items[it.name] && have.has(it.name.toLowerCase())) { items[it.name] = true; newItems++; changed = true; }
      }
      if (changed) qSave(q.reward, { done: st.done, items });
    }
    toast('Inventory: ' + newItems + ' quest item' + (newItems === 1 ? '' : 's') + ' found, ' +
          newDone + ' reward' + (newDone === 1 ? '' : 's') + ' marked turned in');
    renderQuests();
  }

  // quests view wiring
  (function initQuests() {
    const sels = $('q-isle');
    for (const i of ISLE_ORDER) {
      const o = document.createElement('option');
      o.value = i; o.textContent = 'Isle ' + i;
      sels.appendChild(o);
    }
    sels.addEventListener('change', renderQuests);
    const zsel = $('q-zone');
    const names = ['Plane of Sky', ...Object.keys(EQLZones.zones)].sort();
    for (const z of [...new Set(names)]) {
      const o = document.createElement('option');
      o.value = z; o.textContent = z;
      zsel.appendChild(o);
    }
    zsel.addEventListener('change', () => { setQuestView(''); renderQuests(); });
    $('q-hidedone').addEventListener('change', renderQuests);
    $('q-import').addEventListener('click', importInventory);
    renderQuestClasses();
  })();

