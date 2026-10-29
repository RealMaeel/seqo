// SEQO — turn what you typed into a real mob name (2.7.2).
// Camp timers match kills by the exact name the log prints ("the Game Master"); a typed
// "game master" or "the game master" never matched, so the camp waited forever. resolve()
// finds the real name among the mobs SEQO knows (your kills, the zone's named list, running
// timers), ignoring case and a leading a/an/the; anything else gets "did you mean" suggestions.
// UMD: overlay (window.EQLMobName) + tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLMobName = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const bare = (s) => norm(s).replace(/^(a|an|the) /, '');

  // known: [{ name, zone? }] → { name } (a real mob) | { suggest: [names] } (nothing matched)
  function resolve(input, known, { zone } = {}) {
    const want = norm(input);
    if (!want) return { suggest: [] };
    const here = (k) => (zone && k.zone === zone ? 0 : 1);
    const list = (known || []).filter((k) => k && k.name).slice().sort((a, b) => here(a) - here(b));
    const exact = list.find((k) => norm(k.name) === want);
    if (exact) return { name: exact.name };
    const loose = list.find((k) => bare(k.name) === bare(want));
    if (loose) return { name: loose.name };
    // did you mean: every typed word appears in the name, then names containing the text
    const words = bare(want).split(' ').filter(Boolean);
    const seen = new Set(), out = [];
    const add = (n) => { const k = norm(n); if (!seen.has(k)) { seen.add(k); out.push(n); } };
    for (const k of list) if (words.every((w) => bare(k.name).includes(w))) add(k.name);
    for (const k of list) if (bare(want).length >= 3 && bare(k.name).includes(bare(want).slice(0, 4))) add(k.name);
    return { suggest: out.slice(0, 4) };
  }
  return { resolve, norm, bare };
});
