// SEQO - optional class spell quests: pick the one(s) you're chasing, SEQO
// tracks the pieces against your inventory and feeds the zone-needs list.
// Mechanics captured from the EQ Legends Tools quest guides (see CREDITS) —
// all credit to their authors; support the sites that document this stuff.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLSpellQuests = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // item.kind: 'drop' (mob drop — feeds zone needs with the mob named),
  //            'ground' (ground spawn — feeds zone needs as a zone pickup),
  //            'buy' / 'made' / 'given' (not hunted — shown, never fed to needs)
  const QUESTS = [
    {
      key: 'tashania', cls: 'ENC', spell: 'Tashania', spellLv: 41, startLv: 35,
      name: 'Coin of Tash', npc: 'Romar Sunto — Temple of Solusek Ro (+395, +95)',
      clicky: 'The upgraded Coin itself clicks Tashania — you can STOP before the final turn-in and keep the clicky instead of the spell.',
      items: [
        { name: 'Old Silver Coin (Azia)', kind: 'ground', zone: 'Ak`Anon', where: 'ground spawn in the city' },
        { name: 'Old Silver Coin (Geza)', kind: 'ground', zone: 'South Kaladim', where: 'ground spawn' },
        { name: 'Old Silver Coin (Beza)', kind: 'ground', zone: 'Erudin', where: 'palace pool' },
        { name: 'Old Silver Coin (Jaka)', kind: 'ground', zone: 'North Qeynos', where: 'Koalindl fish pool' },
        { name: 'Old Silver Coin (Fana)', kind: 'ground', zone: 'Halas', where: 'the lake' },
        { name: 'Old Silver Coin (Izah)', kind: 'ground', zone: 'Oggok', where: 'the lake' },
        { name: 'Old Silver Coin (Ena)', kind: 'ground', zone: 'Grobb', where: 'the pool' },
        { name: 'Old Silver Coin (Heda)', kind: 'ground', zone: 'Neriak Commons', where: 'outside The Blind Fish' },
        { name: 'Old Silver Coin (Dena)', kind: 'ground', zone: 'West Freeport', where: 'ground spawn' },
        { name: 'Old Silver Coin (Caza)', kind: 'ground', zone: 'North Felwithe', where: 'fishing pond' }
      ],
      steps: [
        'Ask Romar Sunto about the coin pouch → 10-slot Coin Pouch (the Tome of Tash, 50g, lists coin spots)',
        'Gather the ten Old Silver Coins (ground spawns — Enduring Breath helps) and COMBINE them in the pouch → Coin of Tash',
        'Tarn Visilin, High Keep library → Glowing Coin of Tash',
        'Mizr N`Mar, Neriak Third Gate library → Gleaming Coin of Tash',
        'Raine Beteria, Erudin library → Radiant Coin of Tash (low faction bounces it — Illusion: Erudite helps; NEVER hand in while invisible)',
        'Radiant Coin → Romar Sunto → Spell: Tashania (or keep the Radiant Coin as a clicky!)'
      ]
    },
    {
      key: 'icecomet', cls: 'WIZ', spell: 'Ice Comet', spellLv: 49, startLv: 35,
      name: 'Tarton\'s Wheel', npc: 'Sulgar — Everfrost Peaks (+3032, -2395)',
      items: [
        { name: 'Rod (Azia)', kind: 'ground', zone: 'Erud\'s Crossing', where: 'underwater' },
        { name: 'Rod (Beza)', kind: 'ground', zone: 'Everfrost Peaks', where: 'underwater ice cave' },
        { name: 'Rod (Caza)', kind: 'ground', zone: 'Lake Rathetear', where: 'submerged tower' },
        { name: 'Rod (Dena)', kind: 'ground', zone: 'Dagnor\'s Cauldron', where: 'underwater' },
        { name: 'Rod (Ena)', kind: 'ground', zone: 'Lower Guk', where: 'Reanimated Hand room — bring a group' },
        { name: 'Rod (Fana)', kind: 'ground', zone: 'Oasis of Marr', where: 'underwater tower' },
        { name: 'Rod (Geza)', kind: 'ground', zone: 'Highpass Hold', where: 'beneath the waterfall' },
        { name: 'Rod (Heda)', kind: 'ground', zone: 'Qeynos Aqueducts', where: 'shark pit' },
        { name: 'Rod (Izah)', kind: 'ground', zone: 'Neriak Commons', where: 'outside The Blind Fish' },
        { name: 'Rod (Jaka)', kind: 'ground', zone: 'The Estate of Unrest', where: 'outside the house' }
      ],
      steps: [
        'Get the Tome of the Wheel and the Glowing Chest from Sulgar — ⚠ the chest is TEMPORARY: anything inside is lost when it vanishes (camping!). Keep rods in normal bags until the combine.',
        'Gather the ten Rods (mostly underwater — Enduring Breath)',
        'Put all ten Rods in the Glowing Chest and combine → Staff of the Wheel + Star of Eyes',
        'Hand both to Sulgar → Spell: Ice Comet'
      ]
    },
    {
      key: 'divinemight', cls: 'PAL', spell: 'Divine Might', spellLv: 45, startLv: 40,
      name: 'Divine Might', npc: 'Diggs Duggun — Beholder\'s Maze (1260, -550)',
      items: [
        { name: 'Pick', kind: 'buy', where: 'vendor tool' },
        { name: 'Dwarven Ale', count: 2, kind: 'buy', where: 'vendor — keep UNSTACKED for the turn-in' },
        { name: 'A Dusty Old Skull', kind: 'ground', zone: 'Steamfont Mountains', where: 'Meldrath\'s room' },
        { name: 'A Dusty Old Backbone', kind: 'ground', zone: 'The Estate of Unrest', where: 'ghost room pit' },
        { name: 'Dusty Ribcage', kind: 'ground', zone: 'The Estate of Unrest', where: 'ghost room pit (also spawns in Mistmoore)' },
        { name: 'Dusty Old Finger Bones', kind: 'ground', zone: 'Kedge Keep', where: 'Phinigel\'s room, south alcove — dangerous' },
        { name: 'A Dusty Old Jawbone', kind: 'ground', zone: 'Everfrost Peaks', where: 'underwater ice cave (~4535, -5235)' },
        { name: 'A Dusty Broken Sword', kind: 'ground', zone: 'North Kaladim', where: 'underwater in the mines (~+761, +332)' },
        { name: 'A Dusty Broken Shield', kind: 'ground', zone: 'Erudin', where: 'swim from the docks, right cliff ledge' },
        { name: 'Diamond', kind: 'buy', where: 'gem — vendor/loot' },
        { name: 'Star Ruby', kind: 'buy', where: 'gem' },
        { name: 'Pearl', kind: 'buy', where: 'gem' },
        { name: 'Fire Emerald', kind: 'buy', where: 'gem' },
        { name: 'Sapphire', kind: 'buy', where: 'gem' },
        { name: 'Fire Opal', kind: 'buy', where: 'gem' },
        { name: 'Enchanted Platinum Bar', count: 2, kind: 'made', where: 'enchanter-made (L32+), keep unstacked' }
      ],
      steps: [
        'Diggs Duggun: 1 Pick + 2 Dwarven Ales (unstacked) → A Dusty Old Leg Bone',
        'Gather the six bones + broken sword + broken shield (ground spawns across six dungeons)',
        'Ping Fuzzlecutter (outside West Freeport), "What components?" → Empty Gem Bag',
        'Bag: Diamond, Star Ruby, Pearl, Fire Emerald, Sapphire, Fire Opal + 2 Enchanted Platinum Bars (unstacked) → combine → Full Gem Bag → Ping → Gem Encrusted Casket',
        'Put all six bones + sword + shield in the casket and combine',
        'Give the sealed casket to Simon Aldicott (West Commonlands lake) — a Tortured Revenant spawns IMMEDIATELY, have the group ready',
        'Kill it, loot Revenant Ash, hand to Simon → Spell: Divine Might'
      ]
    },
    {
      key: 'lifeleech', cls: 'SHD', spell: 'Life Leech', spellLv: 47, startLv: 46,
      name: 'Life Leech', npc: 'Kazzel D`Leryt — Rathe Mountains',
      items: [
        { name: 'Uncut Hyacinth', kind: 'buy', where: 'Kazzel — 2,000pp' },
        { name: 'Faceted Hyacinth', kind: 'given', where: 'Darfumpel Zirubbel — Uncut Hyacinth + 1,000pp' },
        { name: 'White Gold Necklace', kind: 'drop', zone: 'Lower Guk', mob: 'a froglok noble' },
        { name: 'Crystalline Orb', kind: 'drop', zone: 'Nagafen\'s Lair', mob: 'a stone spider' },
        { name: 'Prickly Pear', kind: 'drop', zone: 'Permafrost Keep', mob: 'an icy terror (among Vox\'s guardians)' }
      ],
      steps: [
        'Kazzel D`Leryt: 2,000pp → Uncut Hyacinth',
        'Darfumpel Zirubbel (same zone): Uncut Hyacinth + 1,000pp → Faceted Hyacinth',
        'Hunt: White Gold Necklace (froglok noble, Lower Guk) · Crystalline Orb (stone spider, Nagafen\'s Lair) · Prickly Pear (icy terror, Permafrost)',
        'Prickly Pear → Xenyari Lisariel → Bloodied Piece of Parchment',
        'Kazzel: Faceted Hyacinth + Necklace + Orb + Parchment → Faceted Hyacinth Telesm',
        'Telesm → Xenyari (she DIES) → Pulsating Hyacinth Telesm',
        'Pulsating Telesm → Kazzel — a level 53 Monstrous Zombie attacks; kill it, loot the Heart',
        'Monstrous Zombie Heart → Kazzel → Spell: Life Leech'
      ]
    },
    {
      key: 'callofflame', cls: 'RNG', spell: 'Call of Flame', spellLv: 49, startLv: 50,
      name: 'Call of Flame', npc: 'Lily Ashwood — Greater Faydark (near Kelethin)',
      items: [
        { name: 'Burnt Sash', kind: 'drop', zone: 'Nagafen\'s Lair', mob: 'an imp protector (rare)' },
        { name: 'Adamantite Band', kind: 'drop', zone: 'Lower Guk', mob: 'a reanimated hand (rare, ~9.5m respawn)' },
        { name: 'Electrum-Bladed Wakizashi', kind: 'given', zone: 'Mistmoore', where: 'Vampire Teeth sub-quest (Mistmoore) — the spell CONSUMES it' }
      ],
      steps: [
        'Lily Ashwood → Love Letter (Sealed) → Ganelorn Oast (East Karana) → Albino Rattlesnake Eggs',
        'Eggs → Kithicor (Kithicor Forest) → Symbol of Achievement → Ganelorn → Note of Credit',
        'Note → Aanina Rockfinder (North Kaladim) → Gift (hold it for the end)',
        'Hunt: Burnt Sash (imp protector, Nagafen\'s Lair) · Adamantite Band (reanimated hand, Lower Guk) · do the Vampire Teeth sub-quest → Electrum-Bladed Wakizashi',
        'Ganelorn: Gift + Sash + Band + Wakizashi in ONE turn-in — Vance Bearstalker spawns (L53, summons, magic-resistant)',
        'Kill Vance, loot Poacher\'s Head → Ganelorn → Spell: Call of Flame'
      ]
    }
  ];

  return {
    CREDITS: [{ note: 'Quest mechanics: EQ Legends Tools quest guides', url: 'https://eqlegendstools.com/quests/' }],
    QUESTS
  };
});
