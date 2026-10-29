// SEQO — your own corrections to an item, from what the game shows (v2.7).
// eqlwiki is often behind: wrong numbers (Checkmate's WIS), missing stats (SV Void)
// and missing effects (its Focus). A fix records what YOU saw in game and wins over
// the wiki everywhere SEQO shows the item; wiki refreshes never overwrite it. Fixes
// live in the game DB, so they sync between your PCs like the rest of SEQO's data.
//
// fix = { stats: { 'WIS': 5 } (+0 values), seen: { 'SV VOID': { tier: 5, value: 5 } } (values no +0
//         number explains — SV Void shows up on upgraded items the wiki lists without it),
//         effects: [{ type: 'Focus', name }], seenAt: tier the numbers were read at, at: ms, by: 'you' }
// Pure: shared by the dock (item card, editor) and the overlay (Cleanup). Uses itemtext.js math.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./itemtext.js'));
  else root.EQLItemFix = factory(root.EQLItemText);
})(typeof self !== 'undefined' ? self : this, function (IT) {
  const EFFECT_TYPES = ['Focus', 'Click', 'Worn', 'Proc', 'Effect'];
  // every "NAME: +n" stat on the block, in order: [{ stat, value, label }]
  const STAT_RE = /\b(MANA REGEN|HP REGEN|ENDURANCE REGEN|ENDUR REGEN|AC|HP|MANA|ENDURANCE|STR|STA|AGI|DEX|WIS|INT|CHA|ATK|HASTE|DMG|ACCURACY|SV (?:FIRE|COLD|MAGIC|DISEASE|POISON|VOID|CORRUPTION)|Dmg Bon|BACKSTAB|Atk Delay)(:\s*)([+-]?\d+)/gi;
  const key = (s) => String(s).toUpperCase().replace(/\s+/g, ' ').trim();
  function parseStats(block) {
    const out = [];
    for (const m of String(block || '').matchAll(new RegExp(STAT_RE.source, 'gi'))) out.push({ stat: key(m[1]), label: m[1], value: +m[3] });
    return out;
  }
  // stats that don't change with upgrade tiers
  const FIXED = new Set(['ATK DELAY', 'BACKSTAB', 'DMG BON']);
  // the upgrade math per stat (itemtext.js, checked against the game in 2.7.2)
  const upFor = (stat) => stat === 'DMG' ? IT.upDmg : stat === 'ACCURACY' ? IT.upAccuracy : stat === 'SV VOID' ? IT.upVoid :
    stat === 'RANGE' ? IT.upRange : FIXED.has(stat) ? ((n) => n) : IT.upStat;

  // the +0 value that shows as `seen` at tier T (smallest that fits; null = no +0 value can)
  function baseFrom(stat, seen, T) {
    seen = +seen;
    if (!T || !(seen > 0)) return seen;
    const f = upFor(key(stat));
    for (let b = 0; b <= seen; b++) if (+f(b, T) === seen) return b;
    return null;
  }

  // the wiki block with your fix applied → { block, diffs: [{ stat, wiki, you }], added: [stat], effects }
  // T (optional) = the tier being shown: a 'seen' value shows as is at its own tier, else with where it was seen
  function apply(wikiBlock, fix, T) {
    let block = String(wikiBlock || '');
    const diffs = [], added = [];
    if (!fix) return { block, diffs, added, effects: [] };
    const seen = new Set();
    block = block.replace(new RegExp(STAT_RE.source, 'gi'), (all, name, sep, n) => {
      const k = key(name);
      seen.add(k);
      if (!fix.stats || fix.stats[k] == null || +fix.stats[k] === +n) return all;
      diffs.push({ stat: name, wiki: +n, you: +fix.stats[k] });
      const v = +fix.stats[k];
      return name + sep + (/^\+/.test(sep.trim() + n) || +n > 0 ? (v >= 0 ? '+' : '') : '') + v;
    });
    // stats the wiki doesn't have at all (SV Void) go on their own line before Size/Class
    const extra = Object.entries(fix.stats || {}).filter(([k, v]) => !seen.has(key(k)) && +v !== 0)
      .map(([k, v]) => k + ': ' + (v > 0 ? '+' : '') + v);
    for (const [k, o] of Object.entries(fix.seen || {})) {
      if (seen.has(key(k)) || !o || baseFrom(k, o.value, o.tier) != null) continue;   // the tier math explains it now (SV Void)
      extra.push(k + ': ' + (+o.tier === +(T || 0) ? '+' + o.value : '(+' + o.value + ' at +' + o.tier + ')'));
    }
    if (extra.length) {
      const line = extra.join('  ');
      for (const l of extra) added.push(l.split(':')[0]);
      const at = block.search(/\n\s*(Size:|Class:)/i);
      block = at >= 0 ? block.slice(0, at) + '\n' + line + block.slice(at) : block + '\n' + line;
    }
    const effects = (fix.effects || []).filter((e) => e && e.name);
    for (const e of effects) {
      const label = (e.type === 'Effect' ? 'Effect' : (e.type || 'Focus') + ' Effect') + ': ' + e.name;
      if (!new RegExp(e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(block)) block += '\n' + label;
    }
    return { block, diffs, added, effects };
  }

  // from the editor: values as the game shows them at tier T → a fix with +0 values
  // rows: [{ stat, value }] · effects: [{ type, name }] → { fix, unreadable: [stat] }
  function fromGame(rows, effects, T, now) {
    const stats = {}, seen = {}, unreadable = [];
    for (const r of rows || []) {
      if (!r || !r.stat || r.value === '' || r.value == null || isNaN(+r.value)) continue;
      const b = baseFrom(r.stat, +r.value, T);
      if (b != null) stats[key(r.stat)] = b;
      else { seen[key(r.stat)] = { tier: T || 0, value: +r.value }; unreadable.push(r.stat); }   // kept as seen
    }
    const fx = (effects || []).filter((e) => e && String(e.name || '').trim())
      .map((e) => ({ type: EFFECT_TYPES.includes(e.type) ? e.type : 'Focus', name: String(e.name).trim().slice(0, 80) }));
    return { fix: { stats, seen, effects: fx, seenAt: T || 0, at: now || Date.now(), by: 'you' }, unreadable };
  }

  // only what differs from the wiki is worth keeping (and a fix equal to the wiki = none)
  function trim(fix, wikiBlock) {
    if (!fix) return null;
    const wiki = new Map(parseStats(wikiBlock).map((s) => [s.stat, s.value]));
    const stats = {};
    for (const [k, v] of Object.entries(fix.stats || {})) {
      const w = wiki.has(key(k)) ? wiki.get(key(k)) : 0;
      if (+v !== +w) stats[key(k)] = +v;
    }
    const effects = (fix.effects || []).filter((e) => e && e.name);
    const seen = {};
    for (const [k, o] of Object.entries(fix.seen || {})) if (!wiki.has(key(k)) && o && +o.value) seen[key(k)] = o;
    if (!Object.keys(stats).length && !Object.keys(seen).length && !effects.length && !fix.note) return null;
    return { ...fix, stats, seen, effects };
  }

  // an exaltation's effect: "Checkmate (Exaltation)" carries Checkmate's effect of that slot type
  const exaltSource = (name) => String(name || '').replace(/\s*\(Exaltation\)\s*$/i, '').trim();

  return { parseStats, baseFrom, apply, fromGame, trim, exaltSource, EFFECT_TYPES };
});
