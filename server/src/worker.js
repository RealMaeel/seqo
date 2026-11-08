// SEQO community data — Cloudflare Worker (free plan).
//
// The Worker only takes in batches and hands out the compiled file. The free plan allows 10 ms of
// CPU per request and 100,000 database row writes a day, so each upload is checked and stored as ONE
// row (its records as JSON), and the adding-up happens elsewhere (tools/compile.cjs), which reads the
// batches through the admin API and uploads the compiled file back here.
//
// Public:
//   POST /v1/batch       { schema: 1, install: <random UUID>, app: "2.7.5", records: [...] }  (≤ 1,000 records, ≤ 512 KB)
//   GET  /v1/data.json   the compiled community file
//   GET  /v1/health      { ok: true }
// Admin (header  Authorization: Bearer <ADMIN_KEY>):
//   GET    /v1/admin/stats                 batches / records per install, ignored installs
//   GET    /v1/admin/batches?after=ID&limit=N   raw batches, oldest first (ignored installs left out)
//   PUT    /v1/admin/compiled              store the compiled file (body = JSON)
//   POST   /v1/admin/ignore                { install, ignore: true | false }
//   DELETE /v1/admin/install?id=<install>  delete everything one install sent
//
// Privacy: nothing about the sender is stored — no IP address, no user agent, no names. The install
// ID is a random UUID made by SEQO on first run, not linked to a character, and resettable.

const SCHEMA = 1;
const MAX_BODY = 512 * 1024;
const MAX_RECORDS = 1000;
const DAILY_BATCHES = 400;           // per install per UTC day (a first upload of old logs is ~150-300)
const MIN_T = Date.UTC(2026, 0, 1);  // EverQuest Legends era; older times are junk
const KINDS = new Set(['k', 'd', 'f', 'q', 's', 't', 'g', 'c', 'w', 'm']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// the tables are made on the first request (same as schema.sql), so deploying needs no database step
const SCHEMA_SQL = [
  'CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY AUTOINCREMENT, install TEXT NOT NULL, app TEXT, received INTEGER NOT NULL, n INTEGER NOT NULL, body TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS batches_install ON batches (install)',
  'CREATE TABLE IF NOT EXISTS daily (install TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (install, day))',
  'CREATE TABLE IF NOT EXISTS ignored (install TEXT PRIMARY KEY, at INTEGER NOT NULL)'
];
let ready = null;
function ensureTables(env) {
  if (!ready) ready = env.DB.batch(SCHEMA_SQL.map((q) => env.DB.prepare(q))).catch((e) => { ready = null; throw e; });
  return ready;
}

const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...extra }
});

// ---- record checks: known kinds, known fields, sane values; anything else is dropped ----
const str = (v, max = 120) => typeof v === 'string' && v.length > 0 && v.length <= max;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const optStr = (v, max) => v === undefined || v === '' || str(v, max);
const optNum = (v, lo, hi) => v === undefined || num(v, lo, hi);
const time = (v, now) => num(v, MIN_T, now + 864e5);

function cleanRecord(r, now) {
  if (!r || typeof r !== 'object' || !KINDS.has(r.r) || !str(r.z, 80)) return null;
  const out = { r: r.r, z: r.z };
  const keep = (k) => { if (r[k] !== undefined && r[k] !== '') out[k] = r[k]; };
  switch (r.r) {
    case 'k': if (!str(r.m) || !time(r.t, now) || !optNum(r.d, 0, 4)) return null; ['m', 't', 'd'].forEach(keep); break;
    case 'd': if (!str(r.m) || !str(r.i) || !time(r.t, now) || !time(r.kt, now) || !optNum(r.q, 1, 1000)) return null; ['m', 'i', 't', 'kt', 'q'].forEach(keep); break;
    case 'f':
      if (!str(r.f) || !time(r.t, now) || !num(r.v, -100000, 100000) || !optStr(r.c, 8) || !optStr(r.m, 120) || !optStr(r.n, 120) || !optStr(r.k, 160)) return null;
      ['f', 't', 'v', 'c', 'm', 'n', 'k'].forEach(keep); break;
    case 'q': {
      if (!str(r.n) || !time(r.t, now) || !Array.isArray(r.g) || r.g.length > 20 || !optNum(r.c, 0, 1e9) || !optNum(r.x, 0, 1) || !optStr(r.p, 120)) return null;
      if (!r.g.every((x) => Array.isArray(x) && x.length === 2 && str(x[0]) && num(x[1], 1, 10000))) return null;
      if (r.i !== undefined && !(Array.isArray(r.i) && r.i.length <= 10 && r.i.every((x) => str(x)))) return null;
      ['n', 't', 'g', 'c', 'x', 'i', 'p'].forEach(keep); break;
    }
    case 's': if (!str(r.n) || !str(r.x, 600) || !optNum(r.t, MIN_T, now + 864e5)) return null; ['n', 'x', 't'].forEach(keep); break;
    case 't': if (!str(r.k, 160) || !time(r.t, now) || (r.e !== 'a' && r.e !== 'u')) return null; ['k', 't', 'e'].forEach(keep); break;
    case 'g': if (!str(r.i) || !time(r.t, now) || !optStr(r.m, 120) || !optStr(r.n, 120) || !optStr(r.k, 160)) return null; ['i', 't', 'm', 'n', 'k'].forEach(keep); break;
    case 'c': if (!time(r.t, now) || !optNum(r.d, 0, 4)) return null; ['t', 'd'].forEach(keep); break;
    case 'w':
      if (!str(r.n) || !str(r.i) || !time(r.qt, now) || !time(r.t, now) || (r.src !== 'inv' && r.src !== 'merge') || !num(r.ok, 0, 1) || !optStr(r.id, 12)) return null;
      ['n', 'i', 'qt', 't', 'src', 'ok', 'id'].forEach(keep); break;
    case 'm': {
      if (!str(r.m) || !time(r.t, now) || !optNum(r.l, 1, 200) || !optNum(r.mh, 0, 1e6) || !optNum(r.h, 0, 1e7) || !optNum(r.ht, 0, 1e10)) return null;
      if (r.s !== undefined && !(Array.isArray(r.s) && r.s.length <= 25 && r.s.every((x) => str(x, 80)))) return null;
      ['m', 't', 'l', 'mh', 'h', 'ht', 's'].forEach(keep); break;
    }
  }
  return out;
}

// constant-time compare, so the admin key can't be guessed a character at a time
function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
const isAdmin = (req, env) => sameKey((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), env.ADMIN_KEY);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

async function takeBatch(req, env, now) {
  const len = +(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ error: 'too large' }, 413);
  let body;
  try { const text = await req.text(); if (text.length > MAX_BODY) return json({ error: 'too large' }, 413); body = JSON.parse(text); }
  catch { return json({ error: 'not JSON' }, 400); }
  if (!body || body.schema !== SCHEMA || !UUID.test(String(body.install || '')) || !Array.isArray(body.records)) return json({ error: 'bad batch' }, 400);
  if (body.records.length > MAX_RECORDS) return json({ error: 'too many records' }, 413);
  const install = body.install;
  const app = str(body.app, 20) ? body.app : '';
  const ign = await env.DB.prepare('SELECT 1 FROM ignored WHERE install = ?').bind(install).first();
  if (ign) return json({ ok: true, accepted: 0, dropped: body.records.length });   // quietly: nothing to fix on their side
  const day = dayOf(now);
  const used = await env.DB.prepare('SELECT n FROM daily WHERE install = ? AND day = ?').bind(install, day).first();
  if (used && used.n >= DAILY_BATCHES) return json({ error: 'daily limit', retryAfter: 'tomorrow' }, 429);
  const recs = [];
  let dropped = 0;
  for (const r of body.records) { const c = cleanRecord(r, now); if (c) recs.push(c); else dropped++; }
  if (recs.length) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO batches (install, app, received, n, body) VALUES (?, ?, ?, ?, ?)').bind(install, app, now, recs.length, JSON.stringify(recs)),
      env.DB.prepare('INSERT INTO daily (install, day, n) VALUES (?, ?, 1) ON CONFLICT (install, day) DO UPDATE SET n = n + 1').bind(install, day)
    ]);
  }
  return json({ ok: true, accepted: recs.length, dropped });
}

async function admin(req, env, url) {
  if (!isAdmin(req, env)) return json({ error: 'not allowed' }, 401);
  const p = url.pathname;
  if (p === '/v1/admin/stats' && req.method === 'GET') {
    const per = await env.DB.prepare('SELECT install, COUNT(*) AS batches, SUM(n) AS records, MIN(received) AS first, MAX(received) AS last, MAX(app) AS app FROM batches GROUP BY install').all();
    const ign = await env.DB.prepare('SELECT install FROM ignored').all();
    return json({ installs: per.results, ignored: ign.results.map((x) => x.install) });
  }
  if (p === '/v1/admin/batches' && req.method === 'GET') {
    const after = Math.max(0, parseInt(url.searchParams.get('after') || '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
    const rows = await env.DB.prepare('SELECT id, install, app, received, body FROM batches WHERE id > ? AND install NOT IN (SELECT install FROM ignored) ORDER BY id LIMIT ?').bind(after, limit).all();
    // each stored body is already JSON (written by JSON.stringify above): put it in as it is rather than
    // parse + re-encode megabytes, which the free plan's 10 ms of CPU per request can't afford
    const parts = rows.results.map((r) => '{"id":' + r.id + ',"install":' + JSON.stringify(r.install) + ',"app":' + JSON.stringify(r.app || '') +
      ',"received":' + r.received + ',"body":' + r.body + '}');
    const next = rows.results.length === limit ? rows.results[rows.results.length - 1].id : null;
    return new Response('{"batches":[' + parts.join(',') + '],"next":' + (next == null ? 'null' : next) + '}',
      { headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  if (p === '/v1/admin/compiled' && req.method === 'PUT') {
    const text = await req.text();
    try { const c = JSON.parse(text); if (!c || c.schema !== SCHEMA) throw 0; } catch { return json({ error: 'not a compiled file' }, 400); }
    await env.DATA.put('compiled', text);
    return json({ ok: true, bytes: text.length });
  }
  if (p === '/v1/admin/ignore' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json({ error: 'not JSON' }, 400); }
    if (!UUID.test(String(b.install || ''))) return json({ error: 'bad install' }, 400);
    if (b.ignore === false) await env.DB.prepare('DELETE FROM ignored WHERE install = ?').bind(b.install).run();
    else await env.DB.prepare('INSERT OR IGNORE INTO ignored (install, at) VALUES (?, ?)').bind(b.install, Date.now()).run();
    return json({ ok: true });
  }
  if (p === '/v1/admin/install' && req.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    if (!UUID.test(id)) return json({ error: 'bad install' }, 400);
    const r = await env.DB.prepare('DELETE FROM batches WHERE install = ?').bind(id).run();
    return json({ ok: true, deleted: (r.meta && r.meta.changes) || 0 });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(req, env, ctx, now = Date.now()) {
    const url = new URL(req.url);
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' } });
      if (url.pathname === '/v1/health') return json({ ok: true, schema: SCHEMA });
      if (url.pathname === '/v1/batch' || url.pathname.startsWith('/v1/admin/')) await ensureTables(env);
      if (url.pathname === '/v1/batch' && req.method === 'POST') return await takeBatch(req, env, now);
      if (url.pathname === '/v1/data.json' && req.method === 'GET') {
        const text = await env.DATA.get('compiled');
        if (!text) return json({ error: 'not built yet' }, 404);
        return new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=900', 'access-control-allow-origin': '*' } });
      }
      if (url.pathname.startsWith('/v1/admin/')) return await admin(req, env, url);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'server error' }, 500);
    }
  }
};

export { cleanRecord, sameKey };
