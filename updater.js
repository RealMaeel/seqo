// EQL Overlay - game database updater (main process)
// Pulls zone/item data from the EQL wiki's MediaWiki API on demand.
// Everything is cached locally in gamedb.json; the network is only touched
// when the user explicitly clicks Update (or enables auto-update on zone entry).

const WIKI_API = 'https://eqlwiki.com/api.php';
const WIKI_PAGE = (title) => 'https://eqlwiki.com/' + encodeURIComponent(title.replace(/ /g, '_'));

async function api(params) {
  const u = new URL(WIKI_API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('format', 'json');
  const res = await fetch(u, {
    headers: { 'User-Agent': 'SEQO/0.9 (personal overlay tool)' }
  });
  if (!res.ok) throw new Error('Wiki returned HTTP ' + res.status);
  return res.json();
}

async function searchTitles(query, limit = 8) {
  const j = await api({ action: 'query', list: 'search', srsearch: query, srlimit: String(limit) });
  return (j.query && j.query.search || []).map(s => s.title);
}

async function getWikitext(title) {
  const j = await api({ action: 'parse', page: title, prop: 'wikitext', redirects: '1' });
  if (j.error) return null;
  const wt = j.parse && j.parse.wikitext && j.parse.wikitext['*'];
  return wt ? { title: j.parse.title || title, wikitext: wt, revid: j.parse.revid || 0 } : null;
}

// Latest revision ids for a batch of page titles: { title: revid }
async function getLatestRevisions(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const j = await api({
      action: 'query', prop: 'revisions', rvprop: 'ids',
      titles: batch.join('|'), redirects: '1'
    });
    const pages = j.query && j.query.pages || {};
    for (const p of Object.values(pages)) {
      if (p.title && p.revisions && p.revisions[0]) out[p.title] = p.revisions[0].revid;
    }
    // map redirected/normalized names back to what we asked for
    for (const r of (j.query && j.query.redirects) || []) {
      if (out[r.to] !== undefined) out[r.from] = out[r.to];
    }
    for (const n of (j.query && j.query.normalized) || []) {
      if (out[n.to] !== undefined) out[n.from] = out[n.to];
    }
  }
  return out;
}

// Category members (e.g. "Category:Befallen Quests") -> page titles
async function getCategoryMembers(category, limit = 100) {
  const j = await api({
    action: 'query', list: 'categorymembers',
    cmtitle: 'Category:' + category, cmlimit: String(limit)
  });
  return (j.query && j.query.categorymembers || []).map(c => c.title);
}

// Extract a named parameter from an {{Itempage ...}} style template.
function extractTemplateParam(wikitext, param) {
  const re = new RegExp('\\|\\s*' + param + '\\s*=', 'i');
  const m = re.exec(wikitext);
  if (!m) return '';
  let i = m.index + m[0].length, depth = 0, out = '';
  while (i < wikitext.length) {
    const two = wikitext.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; out += two; i += 2; continue; }
    if (two === '}}' || two === ']]') {
      if (depth === 0 && two === '}}') break;
      depth = Math.max(0, depth - 1); out += two; i += 2; continue;
    }
    if (depth === 0 && wikitext[i] === '|' && /\|\s*\w+\s*=/.test(wikitext.slice(i, i + 30))) break;
    out += wikitext[i]; i++;
  }
  return out.trim();
}

// Resolve a page by exact title, falling back to search.
async function resolvePage(name) {
  let page = await getWikitext(name);
  if (page) return page;
  const titles = await searchTitles(name, 3);
  for (const t of titles) {
    page = await getWikitext(t);
    if (page) return page;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wikitext -> named mobs + drops
// Handles the wiki's prose style:
//   "Spawn area of [[The Thaumaturgist]] who drops [[Dagger of Marnek]]
//    (Common), [[Gossamer Armor|Gossamer Robe]] (Uncommon) and
//    [[Thaumaturgist's Robe]] (Rare)"
// plus bullet lists under Drops/Loot/Named headings.
// ---------------------------------------------------------------------------
function extractLinks(text) {
  const out = [];
  // [[Page]] / [[Page|Label]] links, and {{:Page}} template transclusions
  const re = /\[\[([^\]|#]+?)(?:\|([^\]]*))?\]\](?:\s*\(([^)]{1,24})\))?|\{\{:([^}|#]+?)\}\}(?:\s*\(([^)]{1,24})\))?/g;
  let m;
  while ((m = re.exec(text))) {
    const page = (m[1] || m[4] || '').trim();
    if (!page || /^(File|Image|Category):/i.test(page)) continue;
    out.push({ page, label: (m[2] || page).trim(), note: (m[3] || m[5] || '').trim() });
  }
  return out;
}

function parseZoneDrops(wikitext) {
  const mobs = new Map();
  const add = (mobName, drops) => {
    if (!drops.length) return;
    const key = mobName.trim();
    const cur = mobs.get(key) || { mob: key, drops: [] };
    for (const d of drops) {
      if (!cur.drops.some(x => x.item === d.item)) cur.drops.push(d);
    }
    mobs.set(key, cur);
  };

  // Pattern 1: "[[Mob]] ... drops <links...>" within a sentence/line
  const re = /\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]((?:(?!\[\[).){0,100}?)\bdrops?\b\s*:?\s*([^\n]+)/gi;
  let m;
  while ((m = re.exec(wikitext))) {
    const mobName = m[1].trim();
    const dropText = m[3];
    const items = extractLinks(dropText).map(l => ({ item: l.label, page: l.page, rarity: l.note }));
    add(mobName, items);
  }

  // Pattern 2: bullet lists under headings mentioning drops/loot/named
  const sections = wikitext.split(/^(?===+ *[^=\n]+ *==+ *$)/m);
  for (const sec of sections) {
    const head = /^==+ *([^=\n]+?) *==+/.exec(sec);
    if (!head || !/drop|loot|named|rare/i.test(head[1])) continue;
    for (const line of sec.split('\n')) {
      if (!/^\*/.test(line)) continue;
      const links = extractLinks(line);
      if (!links.length) continue;
      // "* [[Mob]]: [[item1]], [[item2]]" or "* [[item]]"
      if (links.length > 1 && /:\s*\[\[|drops/i.test(line)) {
        add(links[0].label, links.slice(1).map(l => ({ item: l.label, page: l.page, rarity: l.note })));
      } else {
        add('(zone drops)', links.map(l => ({ item: l.label, page: l.page, rarity: l.note })));
      }
    }
  }

  return [...mobs.values()];
}

// ---------------------------------------------------------------------------
// Wikitext -> readable plain text (for item pages)
// ---------------------------------------------------------------------------
function wikitextToText(wt) {
  let t = wt;
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  for (let i = 0; i < 5; i++) t = t.replace(/\{\{[^{}]*\}\}/g, ''); // nested templates
  t = t.replace(/\{\|[\s\S]*?\|\}/g, '');                           // tables
  t = t.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '');
  t = t.replace(/\[\[([^\]|#]+?)\|([^\]]*)\]\]/g, '$2');
  t = t.replace(/\[\[([^\]|#]+?)\]\]/g, '$1');
  t = t.replace(/'''?/g, '');
  t = t.replace(/^==+ *(.+?) *==+$/gm, '▸ $1');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t.slice(0, 2500);
}

// ---------------------------------------------------------------------------
// Public: update operations (each returns data to cache)
// ---------------------------------------------------------------------------
async function fetchZoneData(zoneName, aliases = []) {
  // try known wiki page titles first (game names and wiki names can differ,
  // e.g. game "The Ruins of Old Guk" = wiki "Lower Guk"), then fall back to search
  let page = null;
  for (const t of aliases) {
    page = await getWikitext(t);
    if (page) break;
  }
  if (!page) page = await resolvePage(zoneName);
  if (!page) throw new Error('No wiki page found for "' + zoneName + '"');
  const named = parseZoneDrops(page.wikitext);

  // "'''[[Zone Spawn Timer]]: ''' | 4:30"  -> seconds
  let respawnSeconds = null;
  const rt = /Spawn Timer[^0-9]{0,30}(\d{1,3}):(\d{2})/i.exec(page.wikitext);
  if (rt) respawnSeconds = (+rt[1]) * 60 + (+rt[2]);

  // quests that start in this zone, if the wiki has a category for it
  let quests = [];
  try {
    quests = await getCategoryMembers(page.title + ' Quests', 100);
  } catch { /* no category or API hiccup - fine */ }

  return {
    zone: zoneName,
    pageTitle: page.title,
    url: WIKI_PAGE(page.title),
    revid: page.revid,
    named,
    quests,
    respawnSeconds,
    updated: Date.now()
  };
}

async function fetchItemData(itemName) {
  const page = await resolvePage(itemName);
  if (!page) throw new Error('No wiki page found for "' + itemName + '"');
  const statsblock = extractTemplateParam(page.wikitext, 'statsblock')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[\[([^\]|#]+?)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]|#]+?)\]\]/g, '$1')
    .trim();
  const dropsfrom = wikitextToText(extractTemplateParam(page.wikitext, 'dropsfrom')).slice(0, 300);
  return {
    name: itemName,
    pageTitle: page.title,
    url: WIKI_PAGE(page.title),
    revid: page.revid,
    statsblock,
    dropsfrom,
    text: wikitextToText(page.wikitext),
    updated: Date.now()
  };
}

async function searchWiki(query) {
  return searchTitles(query, 10);
}

// ---------------------------------------------------------------------------
// EQ Legends community map repo (github.com/crande25/eql-maps):
// maps for zones Legends changed or added. Downloaded on demand into the
// user's maps folder, overwriting older copies of the same files.
// ---------------------------------------------------------------------------
// Base pack: nParse's classic map set (200+ zones, GPL, community-maintained).
// Overrides: the EQ Legends repo for zones the new game changed or added.
const MAP_SOURCES = [
  { repo: 'nomns/nparse', branch: 'master', filter: (p) => p.startsWith('data/maps/map_files/') && /\.txt$/i.test(p) },
  { repo: 'crande25/eql-maps', branch: 'main', filter: (p) => /\.txt$/i.test(p) } // last wins on same filename
];

async function listRepoFiles(repo, branch, filter) {
  const res = await fetch(
    'https://api.github.com/repos/' + repo + '/git/trees/' + branch + '?recursive=1',
    { headers: { 'User-Agent': 'SEQO', 'Accept': 'application/vnd.github+json' } });
  if (!res.ok) throw new Error('GitHub API returned HTTP ' + res.status + ' for ' + repo);
  const tree = await res.json();
  return (tree.tree || [])
    .filter(e => e.type === 'blob' && filter(e.path))
    .map(e => ({ repo, branch, path: e.path }));
}

async function downloadMaps(destDir, fsModule, pathModule, onProgress) {
  let files = [];
  for (const src of MAP_SOURCES) {
    try { files = files.concat(await listRepoFiles(src.repo, src.branch, src.filter)); }
    catch (e) { if (!files.length && src === MAP_SOURCES[0]) throw e; /* overrides repo optional */ }
  }
  if (!files.length) throw new Error('No map files found');

  let done = 0, downloaded = 0;
  const CONCURRENCY = 8;
  const queue = files.slice();
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      try {
        const raw = await fetch(
          'https://raw.githubusercontent.com/' + f.repo + '/' + f.branch + '/' + f.path,
          { headers: { 'User-Agent': 'SEQO' } });
        if (raw.ok) {
          const text = await raw.text();
          fsModule.writeFileSync(pathModule.join(destDir, pathModule.basename(f.path)), text, 'latin1');
          downloaded++;
        }
      } catch { /* skip failed file */ }
      done++;
      if (onProgress && done % 20 === 0) onProgress(done, files.length);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { total: files.length, downloaded };
}

// ---------------------------------------------------------------------------
// Authenticated wiki editing (bot password) - used to submit observed drop
// rates. MediaWiki auth is cookie-based, so we keep a small cookie jar.
// ---------------------------------------------------------------------------
const cookieJar = {};
const UA = 'SEQO/1.1 (personal overlay tool; drop-rate contributions)';

function cookieHeader() {
  return Object.entries(cookieJar).map(([k, v]) => k + '=' + v).join('; ');
}
function storeCookies(res) {
  const sc = (res.headers.getSetCookie && res.headers.getSetCookie()) || [];
  for (const c of sc) {
    const kv = c.split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) cookieJar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
}

async function apiAuthGet(params) {
  const u = new URL(WIKI_API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('format', 'json');
  const res = await fetch(u, { headers: { 'User-Agent': UA, 'Cookie': cookieHeader() } });
  storeCookies(res);
  if (!res.ok) throw new Error('Wiki returned HTTP ' + res.status);
  return res.json();
}

async function apiAuthPost(params) {
  const body = new URLSearchParams(params);
  body.set('format', 'json');
  const res = await fetch(WIKI_API, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Cookie': cookieHeader(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  storeCookies(res);
  if (!res.ok) throw new Error('Wiki returned HTTP ' + res.status);
  return res.json();
}

// Login with a bot password (Special:BotPasswords → "User@botname" + key).
// Returns the real account username.
async function wikiLogin(username, botPassword) {
  const t = await apiAuthGet({ action: 'query', meta: 'tokens', type: 'login' });
  const token = t.query && t.query.tokens && t.query.tokens.logintoken;
  if (!token) throw new Error('Could not get a login token from the wiki');
  const r = await apiAuthPost({
    action: 'login', lgname: username, lgpassword: botPassword, lgtoken: token
  });
  const result = r.login && r.login.result;
  if (result !== 'Success') {
    throw new Error('Wiki login failed: ' + (r.login && (r.login.reason || r.login.result) || 'unknown') +
      ' — use a bot password from Special:BotPasswords, format "YourName@botname"');
  }
  return r.login.lgusername;
}

async function getCsrfToken() {
  const t = await apiAuthGet({ action: 'query', meta: 'tokens' });
  const token = t.query && t.query.tokens && t.query.tokens.csrftoken;
  if (!token || token === '+\\') throw new Error('Not logged in (no CSRF token)');
  return token;
}

// Edit a page. Either replace its full text, or append a new section.
async function wikiEdit({ title, text, newSectionTitle, summary, csrf }) {
  const params = {
    action: 'edit', title, token: csrf, maxlag: '5',
    summary: summary || 'Observed drop rates from SEQO log parsing',
    bot: '1'
  };
  if (newSectionTitle) {
    params.section = 'new';
    params.sectiontitle = newSectionTitle;
    params.text = text;
  } else {
    params.text = text;
  }
  const r = await apiAuthPost(params);
  if (r.error) throw new Error(r.error.info || r.error.code);
  if (!(r.edit && r.edit.result === 'Success')) throw new Error('Edit failed on "' + title + '"');
  return r.edit;
}

module.exports = {
  fetchZoneData, fetchItemData, searchWiki, getLatestRevisions,
  parseZoneDrops, wikitextToText, extractTemplateParam, downloadMaps,
  wikiLogin, getCsrfToken, wikiEdit, WIKI_PAGE
};
