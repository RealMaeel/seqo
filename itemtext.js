// SEQO — an item page's statsblock as plain in-game inspect text (v2.7).
// The wiki's {{statsblock}} carries markup: <br>, [[links]], and HTML such as
// <span class='itemeff'>Supernova</span> on effect lines. Left in, it shows as
// code on the item card, hides DMG/Delay from the weapon ratio and breaks the
// effect lookup. Shared by updater.js (when an item is fetched) and the dock
// (items already cached before this fix).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLItemText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
    });
  }
  function cleanStatsBlock(raw) {
    return decodeEntities(String(raw || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\[\[([^\]|#]+?)\|([^\]]*)\]\]/g, '$2')       // [[Page|label]] → label
      .replace(/\[\[([^\]|#]+?)\]\]/g, '$1')                  // [[Page]] → Page
      .replace(/'''?([^'\n]+?)'''?/g, '$1')                   // '''bold''' / ''italic''
      .replace(/<\/?[a-z][^<>]*>/gi, ''))                      // <span …>, </span>, <b>, …
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }
  // upgrade tiers (+1…+10): the wiki's Item Upgrade System — round DOWN, stats +10% a tier,
  // DMG +5%, ACCURACY +2.5%, at least +1 a tier, weight -10% (floor 0.1). Regen stats scale
  // like the rest (Checkmate: Mana Regen 2 → 7 at +5 in game, Oct 26 2026). Moved here from the
  // dock in 2.7 so every caller uses one copy.
  const SCALE_STATS = /\b(MANA REGEN|HP REGEN|ENDURANCE REGEN|ENDUR REGEN|AC|HP|MANA|STR|STA|AGI|DEX|WIS|INT|CHA|ATK|HASTE|SV (?:FIRE|COLD|MAGIC|DISEASE|POISON))(:\s*\+?)(\d+)/gi;
  const upStat = (n, T) => (T && n > 0) ? Math.max(Math.floor(n * (1 + 0.10 * T)), n + T) : n;
  const upDmg = (n, T) => (T && n > 0) ? Math.max(Math.floor(n * (1 + 0.05 * T)), n + T) : n;
  function scaledStats(block, T) {
    block = String(block || '');
    if (!T) return block;
    let out = block.replace(SCALE_STATS, (a, st, sep, n) => st + sep + upStat(+n, T));
    out = out.replace(/\b(DMG)(:\s*\+?)(\d+)/gi, (a, st, sep, n) => st + sep + upDmg(+n, T));
    out = out.replace(/\b(ACCURACY)(:\s*\+?)(\d+)/gi, (a, st, sep, n) => st + sep + Math.floor(+n * (1 + 0.025 * T)));
    out = out.replace(/\b(WT)(:\s*)([\d.]+)/gi, (a, st, sep, n) => st + sep + Math.max(0.1, +(+n * (1 - 0.10 * T)).toFixed(1)));
    return out;
  }
  return { cleanStatsBlock, decodeEntities, scaledStats, upStat, upDmg };
});
