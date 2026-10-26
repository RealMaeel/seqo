// SEQO — what else knows an item when eqlwiki has no page for it (v2.7, Cleanup).
// Order: eqlegendstools (cached item pages: BiS, weapons, procs, worn, clickies,
// focus), your own loot records (which mob dropped it, where), then the P99 wiki
// (classic EQ — a lead, labelled as such; exact page title only, never a search
// guess). Each answer names its source so the Cleanup window can show it.
// Main process only (network through updater.js). create({ updater, getGameDB, getLootDB }).

const GEAR_PAGES = /^(BiS gear|Weapon search|Weapon procs|Focus effects|Clickies|Worn effects)$/i;

// a P99 item page ({{Itempage …}}) → what the Cleanup window needs. Pure, tested.
function parseP99Item(wikitext, extractTemplateParam) {
  const wt = String(wikitext || '');
  const param = (p) => { try { return extractTemplateParam(wt, p) || ''; } catch { return ''; } };
  const links = (s) => [...String(s).matchAll(/\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim())
    .filter((t) => !/^(Category|File|Image):/i.test(t));
  const stats = param('statsblock');
  const quests = [...new Set(links(param('relatedquests')))].slice(0, 6);
  const crafted = (param('playercrafted') + ' ' + param('recipes') + ' ' + param('tradeskills')).replace(/\s+/g, ' ').trim();
  const drops = links(param('dropsfrom')).slice(0, 3);
  return {
    gear: /\bslot:\s*[a-z]/i.test(stats),
    quests,
    ts: !!crafted && !/^(none|no|-|n\/a)$/i.test(crafted),
    drops,
    isItem: /\{\{\s*itempage/i.test(wt) || !!stats
  };
}

function create({ updater, getGameDB, getLootDB }) {
  // offline: eqlegendstools pages already cached, and your loot DB
  function offline(name) {
    const base = String(name || '').replace(/\s*\+\d+$/, '');
    const db = getGameDB() || {};
    let tools = [];
    try { tools = updater.searchEqlTools(db.toolsPages, base) || []; } catch { tools = []; }
    const want = base.toLowerCase();
    const drops = [];
    for (const m of Object.values((getLootDB() || {}).mobs || {})) {
      for (const d of Object.values(m.drops || {})) {
        if (String(d.name).toLowerCase() === want) drops.push({ mob: m.name, zone: m.zone || '', count: d.count || 1 });
      }
    }
    drops.sort((a, b) => b.count - a.count);
    return { tools, drops: drops.slice(0, 3) };
  }

  // → { src, url, gear, quests, ts, note } or { src: '' } when nothing knows it
  async function lookup(name, { online = true } = {}) {
    const base = String(name || '').replace(/\s*\+\d+$/, '');
    const { tools, drops } = offline(base);
    const dropNote = drops.length ? 'drops from ' + drops.map((d) => d.mob + (d.zone ? ' (' + d.zone + ')' : '')).join(', ') : '';
    if (tools.length) {
      const t = tools[0];
      return { src: 'eqlegendstools', url: t.url, gear: tools.some((x) => GEAR_PAGES.test(x.source)), quests: [], ts: false,
               note: 'listed on ' + tools.map((x) => x.source).join(', ') + (dropNote ? ' · ' + dropNote : '') };
    }
    let unreachable = false;
    if (online) {
      try {
        const page = await updater.fetchP99Page(base, { exact: true });
        if (page && page.wikitext) {
          const p = parseP99Item(page.wikitext, updater.extractTemplateParam);
          if (p.isItem) {
            const bits = [];
            if (p.quests.length) bits.push('quests: ' + p.quests.join(', '));
            if (p.ts) bits.push('tradeskill');
            if (dropNote) bits.push(dropNote);
            return { src: 'P99 (classic EQ)', url: updater.P99_BASE + encodeURIComponent((page.pageTitle || base).replace(/ /g, '_')),
                     gear: p.gear, quests: p.quests, ts: p.ts, note: bits.join(' · ') || 'classic EQ item page' };
          }
        }
      } catch { unreachable = true; /* offline: fall through to what we know locally */ }
    }
    if (drops.length) return { src: 'your loot', url: '', gear: false, quests: [], ts: false, note: dropNote };
    // P99 couldn't be reached: say so, so the caller asks again later instead of caching "nothing"
    return unreachable ? { src: '', error: 'P99 wiki unreachable' } : { src: '' };
  }

  return { lookup, offline };
}

module.exports = { create, parseP99Item };
