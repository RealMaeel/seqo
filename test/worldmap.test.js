// World map / zone-name integrity. Run: npm test
// Catches typos when new zones are added to zones.js and worldmap.js.
const W = require('../worldmap.js');
const Z = require('../zones.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL  ' + m); } };

for (const [a, b, t] of W.edges) {
  ok(a in W.nodes, 'edge from unknown zone ' + a);
  ok(b in W.nodes, 'edge to unknown zone ' + b);
  ok(t === undefined || t === 0 || t === 1 || t === 2, 'bad edge type ' + a + '-' + b);
}
const start = 'commons';
// reached by portal/spell, not a zone line (no edges on purpose)
const OFF_GRAPH = new Set(['hateplane', 'airplane']);
for (const short of Object.keys(W.nodes))
  ok(short === start || OFF_GRAPH.has(short) || W.route(start, short), 'unreachable on the map: ' + short);


// Oct 22 2026 patch zones
const r = W.route('freportw', 'nektropos');
ok(r && r.map(p => p.short).join('>') === 'freportw>ecommons>nektulos>lakenerius>nektropos', 'route Freeport -> Nektropos Castle');
const u = W.route('nektulos', 'nektrunder');
ok(u && u[u.length - 1].via === 2, 'Undercrofts is a click-in from Lake Nerius');
for (const [name, short] of [['Lake Nerius', 'lakenerius'], ['Nektropos Castle', 'nektropos'], ['Nektropos Undercrofts', 'nektrunder']])
  ok(Z.zones[name] === short && short in W.nodes, name + ' resolves to a map node');

// every exact zone-entry name seen in real logs resolves (normalised like
// the overlay does: parentheticals, digits, punctuation, leading "the")
const norm = (n) => (n || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z]/g, '').replace(/^the/, '');
const idx = new Map(Object.entries(Z.zones).map(([k, v]) => [norm(k), v]));
const SEEN = ['The Northern Desert of Ro', 'The Castle of Mistmoore', 'The Rathe Mountains', 'Clan Crushbone',
  'The Northern Plains of Karana', 'The Southern Desert of Ro', 'The Southern Plains of Karana', 'Permafrost Keep',
  'The Western Plains of Karana', 'Northern Felwithe', 'The Eastern Plains of Karana', 'The Plane of Hate',
  "Ak'Anon", 'Lake Nerius', 'Nektropos Castle', 'Nektulos Forest', 'The Oasis of Marr', 'The Greater Faydark',
  'Butcherblock Mountains', 'The Steamfont Mountains'];
for (const n of SEEN) ok(Z.zones[n] || idx.get(norm(n)), 'zone-entry name not recognised: ' + n);

// key-quest steps name zones SEQO recognises
const U = require('../unlocks.js');
for (const [ach, kq] of Object.entries(U.KEY_QUESTS || {})) {
  ok(kq.opens && kq.task && kq.giver && Array.isArray(kq.steps) && kq.steps.length, 'key quest incomplete: ' + ach);
  for (const st of kq.steps) {
    ok(st.text && st.text.length > 10, ach + ': step without text');
    if (st.zone) ok(Z.zones[st.zone] || idx.get(norm(st.zone)), ach + ': step zone not recognised: ' + st.zone);
  }
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
