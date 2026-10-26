// SEQO - /outputfile game data (main process).
// Extracted from main.js in v2.7 with the code unchanged; main.js wires it up.
// ---------------------------------------------------------------------------
// Zero-click game data sync: EQ's /outputfile writes land in the game root
// (one level above Logs\). We derive the character's file names from the log
// path, parse them, and watch the folder so a fresh /outputfile inventory /
// achievements / faction refreshes SEQO within a second — no clicks.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

function charServerFromLog(logPath) {
  const m = /^eqlog_(.+?)_(.+?)\.txt$/i.exec(path.basename(logPath || ''));
  return m ? { name: m[1], server: m[2] } : null;
}

function gameRootFromLog(logPath) {
  // <game>\Logs\eqlog_Name_server.txt -> <game>
  const dir = path.dirname(logPath);
  return /logs$/i.test(path.basename(dir)) ? path.dirname(dir) : dir;
}

// deps: getSettings() -> current settings object (main.js replaces it on every
//       update, so never cache it), getGameDB() -> the game DB (reloaded from
//       disk, so never cache it either), saveGameDBSoon(), getWin() -> overlay or null
function create({ getSettings, getGameDB, saveGameDBSoon, getWin }) {
  let gameData = { inventory: null, factions: null, achievements: null };
  let outputWatcher = null;
  let outputDebounce = null;

  function discoverOutputFiles() {
    const logPath = getSettings().logPath;
    const cs = charServerFromLog(logPath);
    if (!logPath || !cs) return null;
    const root = gameRootFromLog(logPath);
    const prefix = (cs.name + '_' + cs.server).toLowerCase();
    const found = { root, prefix, inventory: null, achievements: null, factions: null, spellbook: null };
    let entries = [];
    try { entries = fs.readdirSync(root); } catch { return found; }
    for (const f of entries) {
      const lf = f.toLowerCase();
      if (!lf.startsWith(prefix) || !lf.endsWith('.txt')) continue;
      if (lf.includes('inventory')) found.inventory = pickNewer(found.inventory, path.join(root, f));
      else if (lf.includes('achievements')) found.achievements = pickNewer(found.achievements, path.join(root, f));
      else if (lf.includes('factions')) found.factions = pickNewer(found.factions, path.join(root, f));
      else if (lf.includes('spellbook')) found.spellbook = pickNewer(found.spellbook, path.join(root, f));
    }
    return found;
  }

  function pickNewer(a, b) {
    if (!a) return b;
    try { return fs.statSync(b).mtimeMs > fs.statSync(a).mtimeMs ? b : a; } catch { return a; }
  }

  // Inventory: TSV  Location \t Name \t ID \t Count \t Slots
  // plus a KeyRing section (KeyRing \t Name \t ID) with Equipment/Augmentation/
  // Activated rows. Bank/SharedBank slots ARE included by the game.
  // which storage bucket a location prefix belongs to. Real prefixes seen in
  // the game's file: "General ", "General 1-Slot" (note the space variants),
  // "Personal-Depot" (character storage), "Bank"/"Bank5-Slot", "SharedBank",
  // and worn gear (Equipment / Augmentation / "Any Slot" / slot names).
  // The game only writes the Personal-Depot section into /outputfile inventory
  // while the depot is accessible (at the banker) — an export run in the field
  // silently drops everything in storage, cratering counters and emptying the
  // Cleanup storage section. So: remember the last export that HAD the depot
  // and carry its contents forward whenever a newer export lacks the section;
  // a fresh depot-bearing export replaces the carried copy on the spot.
  function applyDepotCarry(inv) {
    if (!inv || !inv.items) return inv;
    const hasDepot = Object.values(inv.items).some(it => it.by && it.by.depot > 0);
    if (hasDepot) {
      const snap = {};
      for (const [k, it] of Object.entries(inv.items))
        if (it.by.depot > 0) snap[k] = { name: it.name, count: it.by.depot };
      getGameDB().lastDepot = { at: inv.mtime || Date.now(), items: snap };
      saveGameDBSoon();
      return inv;
    }
    const last = getGameDB().lastDepot;
    if (!last || !last.items) return inv;
    for (const [k, s] of Object.entries(last.items)) {
      const it = inv.items[k] ||
        (inv.items[k] = { name: s.name, count: 0, locs: [], by: { bags: 0, depot: 0, bank: 0, shared: 0, stored: 0, worn: 0 } });
      it.by = it.by || { bags: 0, depot: 0, bank: 0, shared: 0, stored: 0, worn: 0 };
      it.count += s.count;
      it.by.depot += s.count;
      if (it.locs.length < 6 && !it.locs.includes('Personal-Depot (carried)'))
        it.locs.push('Personal-Depot (carried)');
    }
    inv.depotCarried = { at: last.at };
    return inv;
  }

  function invBucketOf(loc) {
    if (/^(General|Held)/i.test(loc)) return 'bags';
    if (/^Personal-?Depot/i.test(loc)) return 'depot';
    if (/^SharedBank/i.test(loc)) return 'shared';
    if (/^Bank/i.test(loc)) return 'bank';
    if (/^Equipment/i.test(loc)) return 'stored';   // the storage's gear tab (trailing section)
    return 'worn';
  }

  // exaltation slots (2.7): an exaltable item (Slots column 11) has sub-slots 7–10 =
  // Focus / Click / Worn / Proc exaltation — "General 1-Slot4-Slot7" is the Focus
  // exaltation of the item in General 1-Slot4. A container's sub-slots are its contents.
  const EXALT_SLOTS = { 7: 'focus', 8: 'click', 9: 'worn', 10: 'proc' };
  function parseInventoryFile(text) {
    const items = {};   // lower name -> { name, count, locs: [], by: {bags,depot,bank,shared,stored,worn,slotted} }
    const keyring = []; // trailing-section names (PoS reward detection keys on these)
    const exalts = {};  // lower item name -> [{ loc, name, focus?, click?, worn?, proc? }] one per copy that has any
    const at = {};      // location -> { name, slots } (the last item seen there)
    let inKeyRing = false;
    const addItem = (name, loc, count, bucket) => {
      const k = name.toLowerCase();
      if (!items[k]) items[k] = { name, count: 0, locs: [], by: { bags: 0, depot: 0, bank: 0, shared: 0, stored: 0, worn: 0, slotted: 0 } };
      items[k].count += count;
      items[k].by[bucket || invBucketOf(loc)] += count;
      if (items[k].locs.length < 6 && !items[k].locs.includes(loc)) items[k].locs.push(loc);
    };
    for (const raw of text.split(/\r?\n/)) {
      const cols = raw.replace(/\r$/, '').split('\t');
      if (!cols.length || !cols[0]) continue;
      if (cols[0] === 'Location' || cols[0] === 'KeyRing') { inKeyRing = cols[0] === 'KeyRing'; continue; }
      const name = (cols[1] || '').trim();
      if (!name || name === 'Empty') continue;
      if (inKeyRing) {
        // the file's trailing sections are real belongings, not just markers:
        // Equipment = the character storage's GEAR tab, Augmentation = the
        // exaltation collection, Activated = claimed activatables. No count
        // column down here — one each. Names also stay in keyring[] because
        // the PoS tracker marks quests done off obtained rewards listed here.
        keyring.push(name);
        addItem(name, cols[0], 1);
        continue;
      }
      const loc = cols[0];
      const sm = /^(.+)-Slot(\d+)$/.exec(loc);
      const parent = sm && at[sm[1]];
      if (parent && parent.slots === 11 && EXALT_SLOTS[+sm[2]]) {
        // slotted into an item: part of that item, not a separate belonging (never Cleanup clutter)
        const pk = parent.name.toLowerCase();
        const list = exalts[pk] || (exalts[pk] = []);
        let copy = list.find((c) => c.loc === sm[1]);
        if (!copy) list.push(copy = { loc: sm[1], name: parent.name });
        copy[EXALT_SLOTS[+sm[2]]] = name;
        addItem(name, loc, 1, 'slotted');
        continue;
      }
      at[loc] = { name, slots: parseInt(cols[4], 10) || 0 };
      addItem(name, loc, parseInt(cols[3], 10) || 1);
    }
    return { items, keyring, exalts };
  }

  // Factions: TSV  ID \t Name \t StandingValue \t PointsToMax   (max = 2000)
  function parseFactionsFile(text) {
    const factions = {};
    for (const raw of text.split(/\r?\n/)) {
      const cols = raw.replace(/\r$/, '').split('\t');
      if (cols.length < 4 || cols[0] === 'ID') continue;
      const value = parseInt(cols[2], 10), toMax = parseInt(cols[3], 10);
      if (isNaN(value)) continue;
      factions[cols[1].trim()] = { value, toMax: isNaN(toMax) ? null : toMax };
    }
    return { factions };
  }

  // Spellbook (/outputfile spellbook): "<level>\t<spell name>" per line, written as
  // <Char>_<server>-<CLASS>-Spellbook.txt. It lists the whole book (every class the
  // character has), so the class in the file name is only the one active at export.
  function parseSpellbookFile(text) {
    const spells = {};
    for (const raw of text.split(/\r?\n/)) {
      const cols = raw.replace(/\r$/, '').split('\t');
      if (cols.length < 2) continue;
      const lv = parseInt(cols[0], 10), name = cols[1].trim();
      if (!name || isNaN(lv)) continue;
      spells[name] = lv;
    }
    return { spells };
  }

  // Achievements: section headers have no prefix; achievements are
  // "[IC]\t<name>"; objectives are "[IC]\t\t<text>".  C = complete.
  function parseAchievementsFile(text) {
    const sections = [];
    let sec = null, ach = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\r$/, '');
      if (!line.trim()) continue;
      const m = /^([IC])\t(\t?)(.*)$/.exec(line);
      if (!m) {                       // section header
        sec = { name: line.trim(), achievements: [] };
        sections.push(sec);
        ach = null;
      } else if (!m[2]) {             // achievement line
        ach = { name: m[3].trim(), done: m[1] === 'C', objectives: [] };
        if (sec) sec.achievements.push(ach);
      } else if (ach) {               // objective line
        // Slayer-style rows carry a progress column: "<text>\t1187/5000"
        let text = m[3].trim(), cur, max;
        const c = /^(.*?)\t(\d[\d,]*)\s*\/\s*(\d[\d,]*)$/.exec(text);
        if (c) { text = c[1].trim(); cur = +c[2].replace(/,/g, ''); max = +c[3].replace(/,/g, ''); }
        const o = { text, done: m[1] === 'C' };
        if (cur !== undefined && !isNaN(cur) && !isNaN(max)) { o.cur = cur; o.max = max; }
        ach.objectives.push(o);
      }
    }
    return { sections };
  }

  function refreshGameData(notify) {
    const found = discoverOutputFiles();
    if (!found) return;
    const readOne = (p, parse) => {
      if (!p) return null;
      try {
        const st = fs.statSync(p);
        const parsed = parse(fs.readFileSync(p, 'latin1'));
        return { ...parsed, path: p, mtime: st.mtimeMs };
      } catch { return null; }
    };
    gameData.inventory = applyDepotCarry(readOne(found.inventory, parseInventoryFile));
    gameData.achievements = readOne(found.achievements, parseAchievementsFile);
    gameData.factions = readOne(found.factions, parseFactionsFile);
    gameData.spellbook = readOne(found.spellbook, parseSpellbookFile);
    const win = getWin();
    if (notify && win) {
      win.webContents.send('gamedata-updated', {
        inventory: !!gameData.inventory, achievements: !!gameData.achievements,
        factions: !!gameData.factions, spellbook: !!gameData.spellbook
      });
    }
  }

  // A half-written export must never be parsed: the game writes these files
  // over a second or two and the Personal-Depot section lands near the END,
  // so an eager read sees bags and bank but no storage. Wait until the file's
  // size has held still for two checks before reading it.
  async function waitForStableFile(p, tries = 25) {
    let last = -1;
    for (let i = 0; i < tries; i++) {
      let size = -2;
      try { size = fs.statSync(p).size; } catch { /* file may appear shortly */ }
      if (size >= 0 && size === last) return;
      last = size;
      await new Promise(r => setTimeout(r, 400));
    }
  }

  function watchOutputFiles() {
    if (outputWatcher) { try { outputWatcher.close(); } catch { /* ok */ } outputWatcher = null; }
    const found = discoverOutputFiles();
    if (!found) return;
    refreshGameData(true);
    try {
      outputWatcher = fs.watch(found.root, (_ev, fname) => {
        if (!fname) return;
        const lf = fname.toLowerCase();
        if (!lf.startsWith(found.prefix)) return;
        if (!/inventory|achievements|factions|spellbook/.test(lf)) return;
        clearTimeout(outputDebounce);
        outputDebounce = setTimeout(async () => {
          const f = discoverOutputFiles();
          for (const p of [f && f.inventory, f && f.achievements, f && f.factions, f && f.spellbook].filter(Boolean))
            await waitForStableFile(p);
          refreshGameData(true);
        }, 700);
      });
    } catch (e) { console.error('outputfile watch failed:', e.message); }
  }

  return {
    gameData, discoverOutputFiles, refreshGameData, watchOutputFiles, waitForStableFile,
    applyDepotCarry, parseInventoryFile, parseFactionsFile, parseSpellbookFile, parseAchievementsFile
  };
}

module.exports = { create, charServerFromLog, gameRootFromLog };
