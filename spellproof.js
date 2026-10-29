// SEQO — is this spell really in EverQuest Legends? (2.7.2)
//
// The game's spell file is live EQ's: it carries hundreds of spells Legends doesn't have
// (Velious/Kunark ports, Wuggan's/Reebo's research spells, Imbue gems, portals to zones that
// aren't in the game…). The buff planner only uses a spell once there is evidence for it:
//   1. you confirmed it yourself (✓ in the planner)          → yes
//   2. it's in your spellbook export (/outputfile spellbook)  → yes
//   3. someone cast or sang it in your logs (live, or 📥 Old logs) → yes
//   4. eqlwiki has a page for it                               → yes
//   5. you hid it (✕), or it's on SEQO's known not-in-Legends list → no
//   6. checked, and none of the above                          → no ("not confirmed")
//   7. the wiki hasn't answered yet                            → unknown (kept, for now)
// Ranked names count as their base spell: seeing "Allure VIII" confirms "Allure".
// UMD: overlay (window.EQLSpellProof) and main/tests (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLSpellProof = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const baseName = (n) => String(n || '').replace(/\s+[IVXL]+$/, '').trim();

  // ev: { mine: Set|[], hidden: Set|[], notInLegends: Set|[], scribed: {name:…}|Set, seen: {base: ms}, wiki: {name: bool} }
  // → { ok: true|false|null, why }
  function verdict(name, ev) {
    const has = (c, k) => !!c && (c instanceof Set ? c.has(k) : Array.isArray(c) ? c.includes(k) : Object.prototype.hasOwnProperty.call(c, k));
    const b = baseName(name);
    if (has(ev.mine, name) || has(ev.mine, b)) return { ok: true, why: 'you confirmed it' };
    if (has(ev.hidden, name)) return { ok: false, why: 'you hid it' };
    if (has(ev.notInLegends, name)) return { ok: false, why: 'known not to be in Legends' };
    if (has(ev.scribed, name) || has(ev.scribed, b)) return { ok: true, why: 'in your spellbook' };
    if (has(ev.seen, b) || has(ev.seen, name)) return { ok: true, why: 'seen cast in your logs' };
    const w = ev.wiki ? ev.wiki[name] : undefined;
    if (w === true) return { ok: true, why: 'eqlwiki has a page' };
    if (w === false) return { ok: false, why: 'no eqlwiki page, not in your spellbook, never seen cast' };
    return { ok: null, why: 'not checked yet' };
  }

  // seen-cast bookkeeping: { base: last seen ms }, newest kept, capped
  function noteSeen(seen, name, t, cap = 4000) {
    const b = baseName(name);
    if (!b || b.length > 60) return false;
    const was = seen[b];
    if (was && was >= t) return false;
    seen[b] = t;
    const keys = Object.keys(seen);
    if (keys.length > cap) {
      keys.sort((x, y) => seen[x] - seen[y]);
      for (const k of keys.slice(0, keys.length - cap)) delete seen[k];
    }
    return !was;
  }

  // "[…] Name begins casting X." / "You begin singing X." → X (null otherwise)
  const RE = /\] (?:.+? begins|You begin) (?:casting|singing) (.+?)\.\s*$/;
  function castInLine(raw) { const m = RE.exec(raw); return m ? m[1] : null; }

  return { baseName, verdict, noteSeen, castInLine };
});
