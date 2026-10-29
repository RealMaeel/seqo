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
  // upgrade tiers (+1…+10), checked against the game's own item windows (2.7.2):
  //   Windstriker +8 (base DMG 45, HP 50, STR/AGI/DEX 5, Range 200, WT 4.0):
  //     Base Dmg 81 · HP 90 · STR/AGI/DEX 13 · Range 280 · Weight 1.2 · Accuracy +20% · SV Void 8 · Delay 60
  //   Checkmate +5 (AC 6, Mana 10, Mana Regen 2, resists 5): AC 11 · Mana 15 · Mana Regen 7 · resists 10 · SV Void 5
  // So: stats AND weapon damage +10% a tier, round down, at least +1 a tier; Range +5% a tier;
  // weight -10% a tier but never below 30% of the base (and 0.1); delay unchanged; every upgraded
  // item gains SV Void +1 a tier, and every weapon Accuracy +2.5% a tier — even when the
  // base item has none (the wiki lists +0 items, so those lines are added here).
  const SCALE_STATS = /\b(MANA REGEN|HP REGEN|ENDURANCE REGEN|ENDUR REGEN|AC|HP|MANA|STR|STA|AGI|DEX|WIS|INT|CHA|ATK|HASTE|SV (?:FIRE|COLD|MAGIC|DISEASE|POISON))(:\s*\+?)(\d+)/gi;
  const upStat = (n, T) => (T && n > 0) ? Math.max(Math.floor(n * (1 + 0.10 * T)), n + T) : n;
  const upDmg = upStat;   // weapon damage scales like stats (was +5% before 2.7.2: Windstriker showed 63, the game 81)
  const upRange = (n, T) => (T && n > 0) ? Math.floor(n * (1 + 0.05 * T)) : n;
  const upWeight = (n, T) => T ? Math.max(0.1, +(Math.max(n * 0.3, n * (1 - 0.10 * T))).toFixed(1)) : n;
  const upVoid = (n, T) => (+n || 0) + (T || 0);
  const upAccuracy = (n, T) => (+n || 0) + 2.5 * (T || 0);
  const fmtPct = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  function scaledStats(block, T) {
    block = String(block || '');
    if (!T) return block;
    const isWeapon = /\bDMG:\s*\+?\d+/i.test(block);
    let out = block.replace(SCALE_STATS, (a, st, sep, n) => st + sep + upStat(+n, T));
    out = out.replace(/\b(DMG)(:\s*\+?)(\d+)/gi, (a, st, sep, n) => st + sep + upDmg(+n, T));
    out = out.replace(/\b(Range)(:\s*)(\d+)/g, (a, st, sep, n) => st + sep + upRange(+n, T));
    out = out.replace(/\b(WT)(:\s*)([\d.]+)/gi, (a, st, sep, n) => st + sep + upWeight(+n, T).toFixed(1));
    // granted by upgrading: SV Void (every item) and Accuracy (weapons)
    let hadVoid = false, hadAcc = false;
    out = out.replace(/\b(SV VOID)(:\s*\+?)(\d+)/gi, (a, st, sep, n) => { hadVoid = true; return st + sep + upVoid(+n, T); });
    out = out.replace(/\b(ACCURACY)(:\s*\+?)([\d.]+)%?/gi, (a, st, sep, n) => { hadAcc = true; return st + sep + fmtPct(upAccuracy(+n, T)) + '%'; });
    const add = [];
    if (!hadVoid) add.push('SV VOID: +' + upVoid(0, T));
    if (isWeapon && !hadAcc) add.push('ACCURACY: +' + fmtPct(upAccuracy(0, T)) + '%');
    if (add.length) {
      const at = out.search(/\n\s*(Size:|Class:)/i);
      out = at >= 0 ? out.slice(0, at) + '\n' + add.join('  ') + out.slice(at) : out + '\n' + add.join('  ');
    }
    return out;
  }
  // the stats + effects of a (scaled) block as short chat parts, in block order (2.7.2: regen,
  // SV Void and the effect's kind were missing from 📋 chat): ['AC 16', 'Mana Regen +12', 'Focus: Improved Damage III']
  const CHAT_STATS = /\b(MANA REGEN|HP REGEN|ENDURANCE REGEN|ENDUR REGEN|AC|HP|MANA|ENDURANCE|STR|STA|AGI|DEX|WIS|INT|CHA|ATK|HASTE|ACCURACY|SV (?:FIRE|COLD|MAGIC|DISEASE|POISON|VOID|CORRUPTION)):\s*(\+?-?[\d.]+%?)/gi;
  function chatParts(block) {
    const parts = [];
    for (const m of String(block || '').matchAll(CHAT_STATS)) parts.push(m[1] + ' ' + m[2]);
    for (const m of String(block || '').matchAll(/\b(Focus Effect|Effect):[ \t]*([^\n(]*[^\n(\s])[ \t]*(?:\(([^)\n]+)\))?[^\n]*/gi))
      parts.push((/^focus/i.test(m[1]) ? 'Focus: ' : 'Effect: ') + m[2].trim() + (m[3] ? ' (' + m[3].trim() + ')' : ''));
    return parts;
  }
  return { cleanStatsBlock, decodeEntities, scaledStats, upStat, upDmg, upVoid, upAccuracy, upRange, upWeight, chatParts };
});
