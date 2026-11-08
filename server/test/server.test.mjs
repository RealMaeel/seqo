// tests for the community server (src/worker.js) and the compiler (tools/compile.js)
// D1 is stood in for by Node's built-in SQLite running the real schema.sql; KV by a Map.
import assert from 'node:assert';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import worker, { cleanRecord } from '../src/worker.js';
const require = createRequire(import.meta.url);
const { compile } = require('../tools/compile.cjs');

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _run: () => db.prepare(sql).run(...args)
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s._run()) };
}
const kv = new Map();
const env = { DB: fakeD1(), DATA: { get: async (k) => kv.get(k) || null, put: async (k, v) => { kv.set(k, v); } }, ADMIN_KEY: 'test-admin-key-123' };
const NOW = Date.UTC(2026, 10, 5, 23, 0);
const call = (method, path, body, headers = {}) => worker.fetch(new Request('https://x.workers.dev' + path, {
  method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
}), env, {}, NOW);
const ADMIN = { authorization: 'Bearer test-admin-key-123' };
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const T = Date.UTC(2026, 10, 5, 22, 0);

// health
assert.strictEqual((await (await call('GET', '/v1/health')).json()).ok, true);

// record checks: good kinds kept, junk dropped, unknown fields stripped
assert.deepStrictEqual(cleanRecord({ r: 'k', z: 'Permafrost Keep', m: 'an ice goblin', t: T, d: 2, ip: '1.2.3.4' }, NOW), { r: 'k', z: 'Permafrost Keep', m: 'an ice goblin', t: T, d: 2 });
assert.strictEqual(cleanRecord({ r: 'k', z: 'x', m: 'a', t: 5 }, NOW), null, 'time before 2026');
assert.strictEqual(cleanRecord({ r: 'x', z: 'x' }, NOW), null);
assert.strictEqual(cleanRecord({ r: 'q', z: 'z', n: 'Sarkis', t: T, g: [['Ring', 'one']] }, NOW), null);

// a batch from install A: a kill, its drop, its faction hit, a turn-in with a promise, dialog, junk
const batchA = { schema: 1, install: A, app: '2.7.5', records: [
  { r: 'k', z: 'Permafrost Keep', m: 'an ice goblin', t: T, d: 2 },
  { r: 'k', z: 'Permafrost Keep', m: 'an ice goblin', t: T + 600000, d: 2 },
  { r: 'k', z: 'Permafrost Keep', m: 'an ice goblin', t: T + 1200000, d: 2 },
  { r: 'k', z: 'Permafrost Keep', m: 'an ice goblin', t: T + 1800000, d: 2 },
  { r: 'd', z: 'Permafrost Keep', m: 'an ice goblin', kt: T, i: 'Raw-Hide Belt', t: T + 2000 },
  { r: 'f', z: 'Permafrost Keep', m: 'an ice goblin', t: T, f: 'Vox', v: 0, c: 'min' },
  { r: 'q', z: 'Neriak', n: 'Sarkis Ebonblade', t: T, g: [['Wind Rune Beza', 1], ['Silvery Ring', 1]], c: 500, x: 1, p: 'crimson ring of the djinni' },
  { r: 'w', z: 'Neriak', n: 'Sarkis Ebonblade', qt: T, i: 'Crimson Ring of the Djinni', id: '27706', src: 'inv', ok: 1, t: T + 60000 },
  { r: 's', z: 'Neriak', n: 'Sarkis Ebonblade', t: T, x: 'Smash eh? …Then I\'ll give you the crimson ring of the djinni.' },
  { r: 'k', z: 'Permafrost Keep' },
  'junk'
] };
let res = await (await call('POST', '/v1/batch', batchA)).json();
assert.deepStrictEqual(res, { ok: true, accepted: 9, dropped: 2 });

// install B was in the group: the same first kill, logged a second later on their PC
res = await (await call('POST', '/v1/batch', { schema: 1, install: B, app: '2.7.5', records: [{ r: 'k', z: 'Permafrost Keep', m: 'an ice goblin', t: T + 1000, d: 2 }] })).json();
assert.strictEqual(res.accepted, 1);

// bad batches
assert.strictEqual((await call('POST', '/v1/batch', { schema: 1, install: 'Maeel', records: [] })).status, 400, 'install must be a random UUID');
assert.strictEqual((await call('POST', '/v1/batch', '{nope')).status, 400);
assert.strictEqual((await call('POST', '/v1/batch', { schema: 1, install: A, records: new Array(1001).fill({}) })).status, 413);

// admin needs the key
assert.strictEqual((await call('GET', '/v1/admin/stats')).status, 401);
assert.strictEqual((await call('GET', '/v1/admin/stats', undefined, { authorization: 'Bearer wrong' })).status, 401);
const stats = await (await call('GET', '/v1/admin/stats', undefined, ADMIN)).json();
assert.strictEqual(stats.installs.length, 2);

// compile from what the server holds
const page = await (await call('GET', '/v1/admin/batches?after=0&limit=500', undefined, ADMIN)).json();
assert.strictEqual(page.batches.length, 2);
const c = compile(page.batches, { now: NOW });
const gob = c.mobs['Permafrost Keep|an ice goblin'];
assert.strictEqual(gob.kills, 4, 'the group kill seen by both players counts once');
assert.strictEqual(gob.players, 2);
assert.deepStrictEqual(gob.drops, { 'Raw-Hide Belt': { n: 1, players: 1 } });
assert.deepStrictEqual(gob.factions, { Vox: { v: 'min', n: 1 } });
assert.deepStrictEqual(gob.respawn, { s: 600, n: 3 });
const sarkis = c.npcs['Neriak|Sarkis Ebonblade'];
assert.deepStrictEqual(sarkis.turnins[0], { items: [['Silvery Ring', 1], ['Wind Rune Beza', 1]], n: 1, players: 1, coin: 500, xp: 1 });
assert.deepStrictEqual(sarkis.rewards['Crimson Ring of the Djinni'], { confirmed: 1, likely: 0, id: '27706' });
assert.strictEqual(sarkis.dialog.length, 1);
// with 2 players required, the drop backed by one player is left out
assert.strictEqual(compile(page.batches, { minPlayers: 2, now: NOW }).mobs['Permafrost Keep|an ice goblin'].drops, undefined);

// the compiled file goes up and comes back down
assert.strictEqual((await call('GET', '/v1/data.json')).status, 404);
assert.strictEqual((await call('PUT', '/v1/admin/compiled', c, ADMIN)).status, 200);
const down = await (await call('GET', '/v1/data.json')).json();
assert.strictEqual(down.mobs['Permafrost Keep|an ice goblin'].kills, 4);

// ignore an install: its uploads are dropped and it disappears from the batches
await call('POST', '/v1/admin/ignore', { install: B }, ADMIN);
assert.deepStrictEqual(await (await call('POST', '/v1/batch', { schema: 1, install: B, records: [{ r: 'k', z: 'Z', m: 'a rat', t: T }] })).json(), { ok: true, accepted: 0, dropped: 1 });
assert.strictEqual((await (await call('GET', '/v1/admin/batches', undefined, ADMIN)).json()).batches.length, 1);
// delete everything one install sent
assert.strictEqual((await (await call('DELETE', '/v1/admin/install?id=' + A, undefined, ADMIN)).json()).deleted, 1);

// nothing about the sender is kept: no IP, no names — only the random install ID
const all = JSON.stringify((await env.DB.prepare('SELECT * FROM batches').all()).results);
assert.ok(all.includes('Permafrost') || all === '[]');
assert.ok(!/1\.2\.3\.4|Maeel/.test(all));

console.log('server tests passed');
