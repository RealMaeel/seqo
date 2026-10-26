// SEQO — which three classes you were playing (v2.7), worked out from your own log.
// Legends characters swap trios, so a kill record keeps the makeup it was made with.
//
// Exact: your own /who row ("[50 RNG/SHD/BRD] Maeel ..."). Between /who rows the
// makeup is pieced together from the spells YOU cast ("You begin casting Drain
// Spirit VIII." → SHD or NEC) and, when you're solo, from the buffs that land on
// you (nobody else could have cast them — items and potions aside). Travel spells
// (gates, ports, Spirit of Wolf) don't count: in Legends those mostly come from items. Every 3-class
// combination that could have cast all of that is checked: classes in every one
// of them are certain, the rest show as "?" (or "SHD or NEC?" when it's down to a few).
// Seeing spells no 3 classes cover means you swapped: the oldest clues are dropped.
// Shared by main.js (old-log import) and the overlay (live kills).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLTrioGuess = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CLASSES = ['WAR', 'CLR', 'PAL', 'RNG', 'SHD', 'DRU', 'MNK', 'BRD', 'ROG', 'SHM', 'NEC', 'WIZ', 'MAG', 'ENC', 'BST', 'BER'];
  const BIT = Object.fromEntries(CLASSES.map((c, i) => [c, 1 << i]));
  const MAX_CLUES = 40;              // most recent distinct spells kept as clues
  const SWAP_MS = 30 * 60000;        // two off-trio spells within this = you swapped since /who
  const combos = [];
  for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) for (let c = b + 1; c < 16; c++) combos.push((1 << a) | (1 << b) | (1 << c));
  const names = (mask) => CLASSES.filter((c) => mask & BIT[c]);
  const popcount = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

  // the classes that can cast this spell at or below `maxLv` (rank suffix "Drain Spirit VIII" → "Drain Spirit")
  // travel spells are mostly cast from port items/potions in Legends — not a class clue
  const TRAVEL = /\b(Gate|Portal|Translocat\w*|Teleport|Succor|Evacuat\w*|Bind Affinity|Spirit of (the )?Wolf|Levitat\w*)\b|^(Ring|Circle) of /i;
  function classMask(book, name, maxLv) {
    if (!book || !name || TRAVEL.test(name)) return 0;
    const cls = book[name] || book[String(name).replace(/\s+[IVXL]+$/, '')];
    if (!cls) return 0;
    let m = 0;
    for (const [c, lv] of Object.entries(cls)) if (BIT[c] && lv <= maxLv) m |= BIT[c];
    return m;
  }

  // clues older than maxAgeMs are dropped: Legends lets you swap often, and on your
  // own logs (77 /who rows to check against) 30 min was right most often
  function create({ book, landMap, spells, maxAgeMs = 30 * 60000 } = {}) {
    let whoMask = 0, whoT = 0;       // exact trio from your last /who row
    const level = 60;   // not your /who level: Legends shows odd levels there (a level-2 row on a 50), so any player spell up to 60 counts
    let clues = [];                  // [{ name, mask, t }] newest last
    let offTrio = [];                // spells that don't fit the /who trio: [{ name, t }]
    const members = new Set();       // your group, from the join/leave lines ('?' = joined someone else's group)

    // a new session (login / long gap): you may have swapped while away — start over
    function reset() { clues = []; offTrio = []; }
    const fits = (cs) => combos.filter((k) => cs.every((x) => k & x.mask));
    function addClue(name, mask, t) {
      clues = clues.filter((x) => x.name !== name && !(maxAgeMs && t - x.t > maxAgeMs));
      clues.push({ name, mask, t });
      if (clues.length > MAX_CLUES) clues.shift();
      while (clues.length > 1 && !fits(clues).length) clues.shift();   // a swap: drop old clues until it fits again
    }
    function clue(name, mask, t) {
      if (!mask) return;
      if (whoMask) {
        if (mask & whoMask) return;                                     // fits the /who trio
        offTrio = offTrio.filter((x) => x.name !== name && t - x.t <= SWAP_MS);
        offTrio.push({ name, mask, t });
        if (offTrio.length < 2) return;                                 // one odd spell: likely a clicky
        whoMask = 0; clues = [];                                        // you've swapped since that /who
        for (const x of offTrio) addClue(x.name, x.mask, x.t);
        offTrio = [];
        return;
      }
      addClue(name, mask, t);
    }

    return {
      // your own /who row: the exact trio
      who(trio, t) {
        const m = (trio || []).reduce((s, c) => s | (BIT[c] || 0), 0);
        if (popcount(m) !== 3) return;
        whoMask = m; whoT = t || 0; clues = []; offTrio = [];
      },
      clues: () => clues.map((x) => ({ name: x.name, classes: names(x.mask), t: x.t })),
      // a new session (login / 30-min gap): spell clues start over; a /who trio stays
      // until two spells it can't cast say you swapped
      newSession() { reset(); },
      // "You begin casting X."
      cast(spell, t) { clue(spell, classMask(book, spell, level), t); },
      // "You have joined the group." / "X has joined|left the group." / "You have been removed from the group."
      groupLine(msg) {
        let m;
        if (msg === 'You have joined the group.') members.add('?');
        else if (msg === 'You have been removed from the group.' || msg === 'You have left the group.') members.clear();
        else if ((m = /^(\w+) has joined the group\.$/.exec(msg))) members.add(m[1]);
        else if ((m = /^(\w+) has left the group\.$/.exec(msg))) members.delete(m[1]);
        else return false;
        return true;
      },
      inGroup: () => members.size > 0,
      // a cast-on-you line ("You feel …"); only counts while solo (not in a group, nobody else fighting with you)
      landed(msg, t, solo) {
        if (!solo || members.size || !landMap || !spells) return false;
        const ids = landMap[msg];
        if (!ids || !ids.length) return false;
        let m = 0, name = '';
        for (const id of ids) { const r = spells[id]; if (r && r.n && r.ben) { const k = classMask(book, r.n, level); if (k) { m |= k; name = name || r.n; } } }
        if (!m) return false;
        clue('buff:' + msg, m, t);
        return true;
      },
      // { classes: [...certain], maybe: [...], exact, text } or null when nothing is known yet
      // t (optional): the moment asked about — clues older than maxAgeMs before it no longer count
      makeup(t) {
        if (whoMask) { const c = names(whoMask); return { classes: c, maybe: [], exact: true, text: c.join('/') }; }
        if (t && maxAgeMs) clues = clues.filter((x) => t - x.t <= maxAgeMs);
        if (!clues.length) return null;
        const ks = fits(clues);
        if (!ks.length) return null;
        const certain = ks.reduce((a, k) => a & k, 0xffff);
        const seen = clues.reduce((a, x) => a | x.mask, 0);
        const maybe = names(ks.reduce((a, k) => a | k, 0) & seen & ~certain);
        const c = names(certain);
        const open = 3 - c.length;
        let text = c.join('/');
        if (open > 0) {
          const tail = [];
          // clues the certain classes don't explain, each "one of these": BRD/RNG or DRU?/SHD or NEC?
          let need = [...new Set(clues.filter((x) => !(x.mask & certain)).map((x) => x.mask))];
          need = need.filter((m) => !need.some((o) => o !== m && (o & m) === o));          // keep the narrowest
          const disjoint = need.every((m, i) => need.every((o, j) => i === j || !(m & o)));
          if (need.length && need.length <= open && disjoint && need.every((m) => popcount(m) <= 3)) {
            for (const m of need) tail.push(names(m).join(' or ') + '?');
          } else if (maybe.length && maybe.length <= 3) tail.push(maybe.join(' or ') + '?');
          while (tail.length < open) tail.push('?');
          text += (text ? '/' : '') + tail.join('/');
        }
        return { classes: c, maybe, exact: false, text };
      }
    };
  }

  return { create, classMask, CLASSES };
});
