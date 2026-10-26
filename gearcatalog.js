// SEQO - the Class tab's gear catalog builder (main process).
// Extracted from main.js in v2.7 with the code unchanged, except that the game DB
// and the game exports are read through getters (both get replaced, and the build
// runs for minutes); main.js wires it up and keeps the IPC handlers.
// ---------------------------------------------------------------------------
// Gear catalog: every wearable item on the wiki, parsed into compact scored-
// comparison records. Built on demand (a few minutes, with progress), cached
// in the game DB (synced between computers), refreshed by the same button.
// ---------------------------------------------------------------------------

// deps: getGameDB(), saveGameDBSoon(), updater (updater.js), getGameData() -> the
//       /outputfile data (gameexports.js), getWin() -> overlay or null
function create({ getGameDB, saveGameDBSoon, updater, getGameData, getWin }) {
  let gearBuilding = false;

  async function buildGearCatalog(opts = {}) {
    if (gearBuilding) return { error: 'a catalog build is already running' };
    gearBuilding = true;
    const progress = (msg) => { try { getWin().webContents.send('gear-progress', msg); } catch { /* window gone */ } };
    try {
      const prior = getGameDB().gearCatalog;

      // ---- incremental update: only pages that CHANGED since the last build ----
      if (prior && prior.items && prior.built && !opts.full) {
        progress('Asking the wiki what changed since the last build…');
        let changed = null;
        try { changed = await updater.getRecentChangeTitles(prior.built - 3600 * 1000); } catch { changed = null; }
        if (changed) {
          if (!changed.length) {
            prior.built = Date.now();
            saveGameDBSoon();
            progress('');
            gearBuilding = false;
            return { items: prior.items.length, unchanged: true };
          }
          progress(changed.length + ' wiki pages changed — re-reading only those…');
          // the banner verdicts settled at full-build time (incl. inventory proof)
          const futureSet = new Set(prior.futureBanners || []);
          const byName = new Map(prior.items.map(it => [it.n, it]));
          let updated = 0, added = 0, dropped = 0;
          for (let i = 0; i < changed.length; i += 50) {
            const pages = await updater.fetchPagesContent(changed.slice(i, i + 50));
            for (const [title, text] of Object.entries(pages)) {
              const res = updater.parseGearPage(title, text, futureSet);
              if (!res || res.future) { // no longer gear (or provably future-era)
                if (byName.delete(title)) dropped++;
                continue;
              }
              if (byName.has(title)) updated++; else added++;
              byName.set(title, res);
            }
            progress('Re-reading changed pages… ' + Math.min(i + 50, changed.length) + ' / ' + changed.length);
          }
          getGameDB().gearCatalog = { ...prior, built: Date.now(), items: [...byName.values()] };
          saveGameDBSoon();
          progress('');
          gearBuilding = false;
          return { items: getGameDB().gearCatalog.items.length, updated, added, dropped, incremental: true };
        }
        progress('A lot changed since the last build — doing a full rebuild…');
      }

      // ---- full build ----
      // Era banners mark eras, CURRENT ones included — only banners whose own
      // template text says "not yet available / future" skip items. And if the
      // player OWNS an item from a "future" banner, that banner is provably
      // current: all its items come back in.
      progress('Reading the wiki\'s era banners…');
      let futureBanners = new Set();
      try {
        const eb = await updater.getEraBanners();
        futureBanners = eb.future;
        progress(eb.future.size + ' of ' + eb.all.size + ' era banners mark FUTURE content — only those skip items');
      } catch { progress('era banner list unavailable — keeping everything'); }
      progress('Listing every item on the wiki…');
      const titles = await updater.getAllCategoryMembers('Items', (n) => progress('Listing items… ' + n));
      if (!titles.length) throw new Error('the wiki returned no item list');
      progress(titles.length + ' item pages — reading in batches of 50…');
      const items = [];
      const futureStash = new Map(); // banner -> parsed entries held aside
      let read = 0, skipped = 0, futureSkipped = 0;
      for (let i = 0; i < titles.length; i += 50) {
        const pages = await updater.fetchPagesContent(titles.slice(i, i + 50));
        for (const [title, text] of Object.entries(pages)) {
          read++;
          const res = updater.parseGearPage(title, text, futureBanners);
          if (!res) { skipped++; continue; }             // not wearable gear
          if (res.future) {                              // held aside, maybe reinstated below
            futureSkipped++;
            if (res.entry) {
              if (!futureStash.has(res.future)) futureStash.set(res.future, []);
              futureStash.get(res.future).push(res.entry);
            }
            continue;
          }
          items.push(res);
        }
        progress('Reading item pages… ' + Math.min(i + 50, titles.length) + ' / ' + titles.length +
                 ' (' + items.length + ' wearable, ' + futureSkipped + ' future-era held aside)');
      }
      // inventory ground truth: a banner whose item the player HOLDS is current
      const ownedBase = new Set();
      const invItems = getGameData().inventory && getGameData().inventory.items;
      if (invItems) for (const k of Object.keys(invItems))
        ownedBase.add(k.replace(/\s*\+\d+$/, '').replace(/`/g, "'").trim());
      const reinstSet = new Set();
      let reinstated = 0;
      for (const [banner, list] of futureStash) {
        if (list.some(e => ownedBase.has(e.n.toLowerCase().replace(/`/g, "'").trim()))) {
          items.push(...list);
          futureSkipped -= list.length;
          reinstated += list.length;
          reinstSet.add(banner);
        }
      }
      if (reinstated) progress('You own items from ' + reinstSet.size + ' "future" banner(s) — ' + reinstated + ' items reinstated as current content');
      getGameDB().gearCatalog = {
        built: Date.now(), total: titles.length, items, futureSkipped,
        futureBanners: [...futureBanners].filter(b => !reinstSet.has(b))
      };
      saveGameDBSoon();
      progress('');
      gearBuilding = false;
      return { items: items.length, pages: read, skipped, futureSkipped, reinstated };
    } catch (err) {
      gearBuilding = false;
      progress('');
      return { error: err.message || String(err) };
    }
  }

  return { buildGearCatalog, isBuilding: () => gearBuilding };
}

module.exports = { create };
