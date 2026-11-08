// tests for communitydata.js (3.0: downloading and looking up the community file)
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { create } = require('../communitydata.js');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-cd-'));
  const file = {
    schema: 1, built: '2026-11-06T00:46:00Z', installs: 3,
    mobs: {
      'The Plane of Hate|Cleric of Innoruuk': { zone: 'The Plane of Hate', mob: 'Cleric of Innoruuk', players: 3, kills: 573, respawn: { s: 300, n: 40 },
        drops: { 'Crystallized Sulfur': { n: 165, players: 3 } }, factions: { 'Inhabitants of Hate': { v: -5, n: 500 } }, level: 52 },
      'Permafrost Keep|an ice goblin': { zone: 'Permafrost Keep', mob: 'an ice goblin', players: 1, kills: 20, drops: { 'Raw-Hide Belt': { n: 4, players: 1 } } }
    },
    npcs: { 'Neriak|Sarkis Ebonblade': { zone: 'Neriak', npc: 'Sarkis Ebonblade', turnins: [{ items: [['Silvery Ring', 1], ['Wind Rune Beza', 1]], n: 3, coin: 500 }],
      promises: { 'crimson ring of the djinni': ['1xSilvery Ring + 1xWind Rune Beza'] }, rewards: { 'Crimson Ring of the Djinni': { confirmed: 3, likely: 0 } }, factions: { 'Dark Bargainers': { v: 10, n: 3 }, 'Heretics': { v: 'better', n: 1 } } } },
    tasks: {}, crawls: {}
  };
  let mode = 'ok', updates = 0;
  const fetchImpl = async () => {
    if (mode === 'offline') throw new Error('ENOTFOUND');
    if (mode === '404') return { ok: false, status: 404 };
    return { ok: true, status: 200, text: async () => JSON.stringify(file) };
  };
  const cd = create({ dir: tmp, server: 'https://x', fetchImpl, onUpdate: () => updates++ });
  cd.load();
  assert.strictEqual(cd.status().have, false);
  assert.deepStrictEqual(cd.mob('Cleric of Innoruuk'), []);

  mode = '404';
  assert.strictEqual(await cd.refresh(), false);
  assert.strictEqual(cd.status().error, 'not built yet');
  mode = 'ok';
  assert.strictEqual(await cd.refresh(), true);
  assert.strictEqual(updates, 1);
  const st = cd.status();
  assert.deepStrictEqual([st.have, st.installs, st.mobs, st.npcs, st.error], [true, 3, 2, 1, '']);

  // lookups: case, a/an/the and +N ignored
  assert.strictEqual(cd.mob('cleric of innoruuk')[0].kills, 573);
  assert.strictEqual(cd.mob('Ice Goblin')[0].zone, 'Permafrost Keep');
  const sulfur = cd.item('Crystallized Sulfur +2');
  assert.deepStrictEqual(sulfur.map((x) => [x.kind, x.mob, x.n, x.kills]), [['drop', 'Cleric of Innoruuk', 165, 573]]);
  const ring = cd.item('Crimson Ring of the Djinni +6');
  assert.deepStrictEqual(ring.map((x) => x.kind).sort(), ['promise', 'reward']);
  assert.strictEqual(cd.item('Wind Rune Beza')[0].kind, 'turnin');
  assert.deepStrictEqual(cd.respawns(), { 'The Plane of Hate|Cleric of Innoruuk': { s: 300, n: 40 } });

  // ⚖ factions: kills and turn-ins that raise / lower one, best first; at-the-limit sightings last
  const fac = cd.faction('inhabitants of hate');
  assert.strictEqual(fac.name, 'Inhabitants of Hate');
  assert.deepStrictEqual(fac.lowers.map((r) => [r.kind, r.mob, r.v]), [['kill', 'Cleric of Innoruuk', -5]]);
  assert.strictEqual(fac.raises.length, 0);
  assert.strictEqual(cd.faction('nobody'), null);
  const db = cd.faction('Dark Bargainers').raises[0];
  assert.deepStrictEqual([db.kind, db.npc, db.v, db.items], ['turnin', 'Sarkis Ebonblade', 10, [['Silvery Ring', 1], ['Wind Rune Beza', 1]]], 'a turn-in raises it, with what to hand in');
  assert.strictEqual(cd.faction('Heretics').raises[0].v, 'better', 'seen only at the limit: direction known');
  assert.ok(cd.item('Wind Rune Beza')[0].factions['Dark Bargainers'], 'item card turn-ins carry their factions');
  assert.deepStrictEqual(cd.factions('hate').map((x) => x.name), ['Inhabitants of Hate']);
  assert.ok(cd.search('inhabit').some((r) => r.kind === 'cfaction' && r.name === 'Inhabitants of Hate'));

  // offline: the copy on disk is still there next start
  mode = 'offline';
  assert.strictEqual(await cd.refresh(), false);
  assert.strictEqual(cd.status().error, 'offline');
  const again = create({ dir: tmp, server: 'https://x', fetchImpl });
  again.load();
  assert.strictEqual(again.mob('Cleric of Innoruuk')[0].kills, 573);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('communitydata tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
