// SEQO - live quest data from the wiki / community sites (main process).
// Extracted from main.js in v2.7 with the code unchanged, except that the
// settings object and the game DB are read through getters (main.js replaces
// both, so they're never cached); main.js wires it up and keeps the IPC handlers.
// ---------------------------------------------------------------------------
// Data-source freshness: the Epics / Unlocks views are built from wiki pages
// that were verified on a fixed date (META.captured in epics.js/unlocks.js).
// This asks the wiki's revisions API whether those pages changed since, so
// the user knows when the shipped data is out of date. BiS gear has its own
// live Update button, so it isn't checked here.
// ---------------------------------------------------------------------------

// deps: getSettings(), saveSettings(s), getGameDB(), saveGameDBSoon(), updater
//       (updater.js), BIS_CLASSES, refreshCachedPages(), refreshItemKnowledge()
function create({ getSettings, saveSettings, getGameDB, saveGameDBSoon, updater, BIS_CLASSES,
                  refreshCachedPages, refreshItemKnowledge }) {
  const DATA_SOURCES = [
    { label: 'Epic checklists', meta: require('./epics.js').META },
    { label: 'Race unlock guide', meta: require('./unlocks.js').META }
  ];

  // The epic checklists can be re-read STRAIGHT FROM THE WIKI at runtime (like
  // the BiS Update button): fetch the page's wikitext and parse the bullet
  // lists back into the same shape epics.js ships with. The parsed result is
  // stored in getGameDB().epicsData and overrides the built-in list.
  function parseEpicsWikitext(text) {
    const byClass = {};
    let cur = null;
    text = String(text).replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
    for (const raw of text.split(/\r?\n/)) {
      const h = /^=+\s*(.+?)\s*=+\s*$/.exec(raw.trim());
      if (h) {
        cur = BIS_CLASSES.includes(h[1]) ? h[1] : null;
        if (cur && !byClass[cur]) byClass[cur] = [];
        continue;
      }
      if (!cur) continue;
      const line = raw.trim();
      if (!/^:*\*/.test(line)) continue;                      // items are bullet lines
      const links = [...line.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
      if (!links.length) continue;
      const last = links[links.length - 1];                   // the ITEM is the last link
      const item = (last[2] || last[1]).trim();
      if (!item || /Epic Quest$/i.test(item)) continue;       // "[[X Epic Quest]]" header link
      const u = /\(unverified\)/i.test(line) || /doesn'?t drop|does not drop/i.test(line);
      // quantity: "2x [[Item]]" before the link, or "[[Item]] x2" after it
      let q = 1;
      const beforeQ = /(\d+)\s*x\s*$/i.exec(line.slice(0, last.index).trimEnd());
      const afterQ = /^\s*x\s*(\d+)/i.exec(line.slice(last.index + last[0].length));
      if (beforeQ) q = +beforeQ[1]; else if (afterQ) q = +afterQ[1];
      // source: the rest of the line, links flattened, markup stripped
      let src = (line.slice(0, last.index) + line.slice(last.index + last[0].length))
        .replace(/^:*\*+\s*/, '')
        .replace(/\(unverified\)\s*/ig, '')
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
        .replace(/\{\{[^}]*\}\}/g, '')
        .replace(/'{2,}/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[\s\-–—.,:]+$/, '')
        .replace(/\b\d+\s*x$/i, '')
        .replace(/[\s\-–—.,:]+$/, '')
        .replace(/\bfor$/i, '')
        .replace(/[\s\-–—.,:]+$/, '')
        .trim();
      const prev = byClass[cur].find(it => it.n === item);
      if (prev) { if (q > (prev.q || 1)) prev.q = q; continue; }
      const entry = { n: item, src };
      if (q > 1) entry.q = q;
      if (u) entry.u = true;
      byClass[cur].push(entry);
    }
    return byClass;
  }

  async function fetchEpicsFromWiki() {
    const title = DATA_SOURCES[0].meta.sources[0];
    const url = 'https://eqlwiki.com/api.php?action=parse&prop=wikitext&format=json&redirects=1&page=' +
                encodeURIComponent(title);
    const res = await fetch(url, { headers: { 'User-Agent': updater.UA } });
    if (!res.ok) throw new Error('wiki answered HTTP ' + res.status);
    const j = await res.json();
    const text = j.parse && j.parse.wikitext && j.parse.wikitext['*'];
    if (!text) throw new Error('wiki gave no page text');
    const byClass = parseEpicsWikitext(text);
    const withItems = Object.keys(byClass).filter(c => byClass[c].length);
    // sanity: the page has ~14 populated class sections today; refuse a thin
    // parse rather than wiping good data because the page layout changed
    if (withItems.length < 10) {
      throw new Error('page did not parse cleanly (only ' + withItems.length +
                      ' classes found) — its layout may have changed, keeping current data');
    }
    return byClass;
  }

  async function checkDataSources() {
    const titles = [...new Set(DATA_SOURCES.flatMap(c => c.meta.sources))];
    const url = 'https://eqlwiki.com/api.php?action=query&prop=revisions&rvprop=timestamp' +
                '&format=json&redirects=1&titles=' + encodeURIComponent(titles.join('|'));
    try {
      const res = await fetch(url, { headers: { 'User-Agent': updater.UA } });
      if (!res.ok) return { error: 'wiki answered HTTP ' + res.status };
      const j = await res.json();
      const revByTitle = {};
      for (const p of Object.values((j.query && j.query.pages) || {}))
        if (p.title && p.revisions && p.revisions[0])
          revByTitle[p.title.replace(/_/g, ' ')] = p.revisions[0].timestamp;
      if (!Object.keys(revByTitle).length) return { error: 'wiki gave no page data' };
      // a requested title may be a redirect: follow query.normalized + query.redirects
      const alias = {};
      for (const r of [...((j.query && j.query.normalized) || []), ...((j.query && j.query.redirects) || [])])
        alias[r.from.replace(/_/g, ' ')] = r.to.replace(/_/g, ' ');
      const resolve = (t) => {
        t = t.replace(/_/g, ' ');
        for (let i = 0; i < 4 && alias[t]; i++) t = alias[t];
        return t;
      };
      // baseline = the date of the data we're actually running on: a stored
      // live update if one exists, otherwise the date baked into the js files
      const baselines = {
        'Epic checklists': (getGameDB().epicsData && getGameDB().epicsData.revised) || DATA_SOURCES[0].meta.captured,
        'Race unlock guide': (getGameDB().unlocksData && getGameDB().unlocksData.revised) || DATA_SOURCES[1].meta.captured
      };
      const checks = DATA_SOURCES.map(c => {
        const revs = c.meta.sources.map(s => revByTitle[resolve(s)]).filter(Boolean);
        const revised = revs.sort().pop() || null;
        const base = baselines[c.label] || c.meta.captured;
        return {
          label: c.label, captured: base,
          revised: revised ? revised.slice(0, 10) : null,
          stale: !!(revised && revised.slice(0, 10) > base)
        };
      });
      return { checks, checkedAt: Date.now() };
    } catch (e) {
      return { error: e.message || String(e) };
    }
  }

  // ---- dock "guide" mode: any wiki page (or one section) as readable text ----
  // Cached in the game DB, so after the first click it opens instantly and
  // works offline; a stale cache (>7 days) refreshes in the same call.
  function sliceWikiSection(text, anchor) {
    if (!anchor) return null;
    const want = String(anchor).replace(/_/g, ' ').trim().toLowerCase();
    const lines = String(text).split(/\r?\n/);
    let start = -1, level = 0;
    for (let i = 0; i < lines.length; i++) {
      const h = /^(={2,5})\s*(.+?)\s*={2,5}\s*$/.exec(lines[i].trim());
      if (!h) continue;
      const name = h[2].replace(/\[\[|\]\]/g, '').replace(/.*\|/, '').trim().toLowerCase();
      if (start < 0) { if (name === want) { start = i; level = h[1].length; } continue; }
      if (h[1].length <= level) return lines.slice(start, i).join('\n');
    }
    return start >= 0 ? lines.slice(start).join('\n') : null;
  }

  function wikitextToText(src) {
    let t = String(src);
    for (let i = 0; i < 4; i++) t = t.replace(/\{\{[^{}]*\}\}/g, '');  // templates (simple nesting)
    t = t.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '')
         .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
         .replace(/\[\[([^\]]+)\]\]/g, '$1')
         .replace(/\[https?:\/\/\S+ ([^\]]+)\]/g, '$1')
         .replace(/\[https?:\/\/\S+\]/g, '')
         .replace(/'{2,}/g, '')
         .replace(/<br\s*\/?>/gi, '\n')
         .replace(/<ref[\s\S]*?<\/ref>/gi, '')
         .replace(/<[^>]+>/g, '')
         .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
    const out = [];
    for (const raw of t.split('\n')) {
      let line = raw.trimEnd();
      const trimmed = line.trim();
      const h = /^(={2,5})\s*(.+?)\s*=+\s*$/.exec(trimmed);
      if (h) { out.push('', (h[1].length <= 2 ? '━ ' : '— ') + h[2] + (h[1].length <= 2 ? ' ━' : ' —'), ''); continue; }
      if (/^\{\||^\|\}|^\|-/.test(trimmed)) continue;   // table plumbing
      if (/^[|!]/.test(trimmed)) {                       // table cells → one line
        out.push('  ' + trimmed.replace(/^[|!]\s*/, '').split(/\s*\|\|\s*|\s*!!\s*/).join(' · '));
        continue;
      }
      line = line.replace(/^(\*+)\s*/, (m, s) => '  '.repeat(s.length - 1) + '• ')
                 .replace(/^(#+)\s*/, (m, s) => '  '.repeat(s.length - 1) + '· ');
      out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function fetchGuidePage(title) {
    const url = 'https://eqlwiki.com/api.php?action=parse&prop=wikitext|revid&format=json&redirects=1&page=' +
                encodeURIComponent(title);
    const res = await fetch(url, { headers: { 'User-Agent': updater.UA } });
    if (!res.ok) throw new Error('wiki answered HTTP ' + res.status);
    const j = await res.json();
    const wikitext = j.parse && j.parse.wikitext && j.parse.wikitext['*'];
    if (!wikitext) return null;
    return { wikitext, pageTitle: (j.parse.title || title), revid: j.parse.revid, updated: Date.now() };
  }


  // ---- Alanna's Race Unlock Guide → per-faction grind hints -----------------
  // Guide layout: "== Race ==" sections, each with "=== Requirements ==="
  // ("Get maximum faction with [[X]]" bullets) and "=== Recommended Method ==="
  // (numbered steps). The hint for each of a race's factions is that race's
  // recommended-method steps.
  function parseUnlocksWikitext(text) {
    const byFaction = {};
    text = String(text).replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
    const flat = (s) => s
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
      .replace(/\{\{[^}]*\}\}/g, '').replace(/'{2,}/g, '').replace(/\s+/g, ' ').trim();
    let race = null, sub = null, factions = [], steps = [], needs = {};
    const flush = () => {
      if (race && factions.length && steps.length) {
        const entry = { hint: steps.join(' → '), needs };
        for (const f of factions) byFaction[f] = entry;
      }
      factions = []; steps = []; needs = {};
    };
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      const h2 = /^==\s*([^=].*?)\s*==$/.exec(line);
      if (h2) { flush(); race = h2[1]; sub = null; continue; }
      const h3 = /^===+\s*(.+?)\s*===+$/.exec(line);
      if (h3) { sub = h3[1].toLowerCase(); continue; }
      if (!race || !sub) continue;
      if (/^requirements/.test(sub)) {
        const m = /Get maximum faction with \[\[([^\]|]+)(?:\|[^\]]+)?\]\]/i.exec(line);
        if (m) factions.push(m[1].trim());
      } else if (/^recommended method/.test(sub)) {
        if (/^#+\s*\S/.test(line)) {
          steps.push(flat(line.replace(/^#+\s*/, '')));
          // turn-in totals: "200 [[Lion Delight]]" (a number BEFORE an item
          // link; links ending in "Quest" are quest names, not items)
          let m2;
          const cre = /(\d+)\s*x?\s*\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
          while ((m2 = cre.exec(line))) {
            const item = (m2[3] || m2[2]).trim();
            if (/quest$/i.test(item)) continue;
            needs[item] = Math.max(needs[item] || 0, +m2[1]);
          }
        }
      }
    }
    flush();
    return byFaction;
  }

  async function fetchUnlocksFromWiki() {
    const title = DATA_SOURCES[1].meta.sources[0];
    const url = 'https://eqlwiki.com/api.php?action=parse&prop=wikitext&format=json&redirects=1&page=' +
                encodeURIComponent(title);
    const res = await fetch(url, { headers: { 'User-Agent': updater.UA } });
    if (!res.ok) throw new Error('wiki answered HTTP ' + res.status);
    const j = await res.json();
    const text = j.parse && j.parse.wikitext && j.parse.wikitext['*'];
    if (!text) throw new Error('wiki gave no page text');
    const byFaction = parseUnlocksWikitext(text);
    if (Object.keys(byFaction).length < 15)
      throw new Error('guide did not parse cleanly (' + Object.keys(byFaction).length +
                      ' factions found) — its layout may have changed, keeping current data');
    return byFaction;
  }

  // ---- eqlegendstools Plane of Sky quests → posquests rows ------------------
  // The page is server-rendered. Rather than depend on its exact tags, strip
  // it to a text stream (cells tab-separated, rows on their own lines) and
  // parse the repeating pattern: reward heading · "Turn in to <NPC>" ·
  // "<Class> N item(s)" · item|location rows ("Wind Rune X" rows set the rune).
  function htmlToTextStream(html) {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<\/(?:td|th)>/gi, '\t')
      .replace(/<\/(?:tr|p|div|h\d|li|table)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:span|a|strong|b|em|button|label)>/gi, ' ')  // spans butt together otherwise
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#0?39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
      .replace(/[’‘]/g, "'").replace(/[“”]/g, '"'); // the site's curly quotes → the game's straight ones
  }

  function parsePosText(text) {
    const rows = []; // [class, npc, reward, [[item, loc]...], rune]
    const lines = text.split(/\n/).map(l => l.replace(/[  ]+/g, ' ').trim());
    let reward = null, npc = null, cls = null, items = [], rune = null, prev = '';
    const flush = () => {
      if (reward && npc && cls && (items.length || rune))
        rows.push([cls, npc, reward, items, rune || '']);
      reward = npc = cls = rune = null; items = [];
    };
    for (const line of lines) {
      if (!line) continue;
      let m;
      if ((m = /^Turn in to (.+?)\.?$/.exec(line))) {
        flush();
        npc = m[1].trim();
        reward = prev.replace(/[⚖⚖©®™]+/g, '').trim(); // reward name precedes the turn-in line
      } else if (npc && (m = new RegExp('(?:^|[^A-Za-z])(' + BIS_CLASSES.join('|') + ')\\s+(\\d+)\\s*items?').exec(line))) {
        cls = m[1];
      } else if (npc && cls && /\t/.test(line) && !/turn in quest items/i.test(line)) {
        const [item, loc] = line.split('\t').map(s => s.trim());
        if (!item || !loc) continue;
        const rm = /^Wind Rune (\w+)/i.exec(item);
        if (rm) rune = rm[1];
        else items.push([item, loc]);
      }
      prev = line;
    }
    flush();
    return rows;
  }

  async function fetchPosFromSite() {
    const res = await fetch('https://eqlegendstools.com/plane-of-sky-quests/',
                            { headers: { 'User-Agent': updater.UA } });
    if (!res.ok) throw new Error('eqlegendstools answered HTTP ' + res.status);
    const rows = parsePosText(htmlToTextStream(await res.text()));
    const classes = new Set(rows.map(r => r[0]));
    if (rows.length < 60 || classes.size < 12)
      throw new Error('page did not parse cleanly (' + rows.length + ' quests / ' + classes.size +
                      ' classes) — its layout may have changed, keeping current data');
    return rows;
  }

  // ---- one entry point: refresh everything, report what changed --------------
  async function updateQuestData() {
    const out = { checkedAt: Date.now() };
    const fresh = await checkDataSources();               // wiki revision dates
    out.checks = fresh.checks || null;
    const revOf = (label) => {
      const c = fresh.checks && fresh.checks.find(x => x.label === label);
      return c ? c.revised : null;
    };
    const one = async (key, fn, store, revised) => {
      try {
        const data = await fn();
        const changed = JSON.stringify(data) !== JSON.stringify((getGameDB()[store] || {}).data);
        getGameDB()[store] = { data, updated: Date.now(), revised: revised || null };
        out[key] = { ok: true, changed, revised: revised || null,
                     count: Array.isArray(data) ? data.length : Object.keys(data).length };
      } catch (e) {
        out[key] = { error: e.message || String(e) };
      }
    };
    await one('epics', fetchEpicsFromWiki, 'epicsData', revOf('Epic checklists'));
    await one('unlocks', fetchUnlocksFromWiki, 'unlocksData', revOf('Race unlock guide'));
    await one('pos', fetchPosFromSite, 'posData', null);
    // cached zone + item pages: revision-compare, re-fetch changed only
    try { out.cached = await refreshCachedPages(); } catch (e) { out.cached = { error: e.message }; }
    // long-tail: re-check old "no quest found" item-knowledge entries
    try { out.knowledge = await refreshItemKnowledge(); } catch (e) { out.knowledge = { error: e.message }; }
    saveGameDBSoon();
    if (!fresh.error) getSettings().lastDataCheckAt = fresh.checkedAt;
    // remember which sources we could NOT refresh although the wiki moved on
    getSettings().staleData = (fresh.checks || [])
      .filter(c => c.stale)
      .filter(c => (c.label === 'Epic checklists' && out.epics.error) ||
                   (c.label === 'Race unlock guide' && out.unlocks.error))
      .map(c => c.label);
    saveSettings(getSettings());
    return out;
  }

  return {
    DATA_SOURCES, checkDataSources, updateQuestData,
    fetchEpicsFromWiki, parseEpicsWikitext, fetchUnlocksFromWiki, parseUnlocksWikitext,
    fetchPosFromSite, parsePosText, htmlToTextStream,
    fetchGuidePage, sliceWikiSection, wikitextToText
  };
}

module.exports = { create };
