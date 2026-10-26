// SEQO — spell slot values at a given caster level (v2.7). The game stores a
// slot as base + a level formula (calc) capped at max; this is that table.
// One copy for both sides: spelldb.js (main, values at the Legends cap) and the
// Class tab (re-scaled to your real level).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLSlotCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function calcSlotValue(base, calc, max, level) {
    let v = Math.abs(base);
    switch (+calc) {
      case 0: case 100: break;                                  // flat
      case 101: v += Math.floor(level / 2); break;
      case 102: v += level; break;
      case 103: v += level * 2; break;
      case 104: v += level * 3; break;
      case 105: v += level * 4; break;
      case 108: v += Math.floor(level / 3); break;
      case 109: v += Math.floor(level / 4); break;
      case 110: v += Math.floor(level / 6); break;              // Amplification
      default: v = Math.max(v, Math.abs(max) || v);             // unknown curve: the cap
    }
    if (max) v = Math.min(v, Math.abs(max));
    return v;
  }

  return { calcSlotValue };
});
