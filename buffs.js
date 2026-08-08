// SEQO - fade-noun attribution: maps the noun in "The <noun> fades." to the
// spell line that caused it. Seeded from log evidence + classic spell lines;
// unknown nouns are auto-learned by correlating fades with cast/landing lines.
// kind: 'buff' = a good effect ended (re-buff), 'debuff' = a bad effect ended (good news)

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLBuffs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    // verified from logs
    'cool breeze':              { label: 'Breeze/Clarity (mana regen)', kind: 'buff' },
    'intellectual advancement': { label: 'Insight/Brilliance (INT)', kind: 'buff' },
    'barking':                  { label: 'Tashani (magic-resist debuff)', kind: 'debuff' },
    'vortex of shadows':        { label: 'Shadow Vortex (AC debuff)', kind: 'debuff' },
    'darkness':                 { label: 'Engulfing/Dooming Darkness (snare+DoT)', kind: 'debuff' },
    'vulnerability':            { label: 'Malaisement/Malo (resist debuff)', kind: 'debuff' },
    'shroud':                   { label: 'anti-life shroud (Odium/Scourge line)', kind: 'debuff' },
    // classic spell lines
    'pulsing energy':           { label: 'Haste (Alacrity/Quickness line)', kind: 'buff' },
    'radiance':                 { label: 'Radiant Visage (CHA)', kind: 'buff' },
    'strength':                 { label: 'STR buff (Strengthen line)', kind: 'buff' },
    'dexterity':                { label: 'DEX buff (Dexterous Aura line)', kind: 'buff' },
    'magical dexterity':        { label: 'DEX/proc buff (Deftness line)', kind: 'buff' },
    'agility':                  { label: 'AGI buff (Feet like Cat line)', kind: 'buff' },
    'wisdom':                   { label: 'WIS buff (Insidious line)', kind: 'buff' },
    'brilliance':               { label: 'INT buff (Brilliance)', kind: 'buff' },
    'health':                   { label: 'HP buff (Aid/Health line)', kind: 'buff' },
    'spirit of wolf':           { label: 'Spirit of Wolf (run speed)', kind: 'buff' },
    'courageousness':           { label: 'Courage line (AC/HP)', kind: 'buff' },
    'holy armor':               { label: 'Holy Armor (AC)', kind: 'buff' },
    'grim aura':                { label: 'Grim Aura (ATK)', kind: 'buff' },
    'mystic aura':              { label: 'Mystic/Rune line', kind: 'buff' },
    'levitation':               { label: 'Levitate', kind: 'buff' },
    'enchanted armor':          { label: 'Enchant Armor line (AC)', kind: 'buff' },
    'thistle coat':             { label: 'Thistlecoat (damage shield)', kind: 'buff' },
    'fiery aura':               { label: 'Fire damage shield (Shield of Fire line)', kind: 'buff' }
  };
});
