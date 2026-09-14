// SEQO - race / class / deity unlock helper data for EverQuest Legends.
//
// The unlock STRUCTURE and live progress come straight from the game's own
// /outputfile achievements + faction files ("Untapped Potential" sections),
// so this module only supplies what the game files don't say:
//   - the fastest known faction grind for each unlock faction
//   - which farmable turn-in items to hoard (fed into loot KEEP verdicts)
//   - data credits
//
// Grind routes courtesy of Alanna's Race Unlock Guide on eqlwiki.com
// (https://eqlwiki.com/Alanna's_Race_Unlock_Guide) — please support her work.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLUnlocks = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const CREDITS = [
    {
      what: 'Race unlock grind routes',
      by: "Alanna's Race Unlock Guide",
      url: "https://eqlwiki.com/Alanna's_Race_Unlock_Guide",
      note: 'courtesy of Alanna on eqlwiki.com — please support her work'
    },
    {
      what: 'Zone, quest, item & mob data',
      by: 'EQL Wiki community',
      url: 'https://eqlwiki.com',
      note: 'courtesy of the eqlwiki.com editors — please support them'
    },
    {
      what: 'BiS gear & Plane of Sky layout inspiration',
      by: 'eqlegendstools.com',
      url: 'https://eqlegendstools.com',
      note: 'courtesy of eqlegendstools.com — please support them'
    }
  ];

  // Per-faction fastest grind, keyed by the EXACT faction name that appears in
  // "Get maximum faction with <name>." achievement objectives and in the
  // Factions outputfile. hint = one-line route; items = farmable turn-ins
  // worth keeping when they drop (buyable supplies are not listed as loot).
  const FACTION_GRINDS = {
    // Barbarian
    'Rogues of the White Rose': {
      hint: 'Lion Meat Shipment ×200 (Einhorst McMannus, West Karana) → trade 200 Lion Delight to Iceberg in Everfrost. Alt: Gnoll Bounty — 1200 Gnoll Fangs to Lysbith McNaff (Halas).',
      items: ['Gnoll Fang', 'Lion Meat', 'Lion Delight']
    },
    'Wolves of the North': {
      hint: 'Same runs as Rogues of the White Rose — Lion Meat Shipment / Gnoll Bounty raise all three Halas factions together.',
      items: ['Gnoll Fang', 'Lion Meat', 'Lion Delight']
    },
    'Merchants of Halas': {
      hint: 'Rides along with the Lion Meat / Gnoll Fang turn-ins above.',
      items: ['Gnoll Fang', 'Lion Meat', 'Lion Delight']
    },
    // Dark Elf
    'Dark Bargainers': {
      hint: 'Buy ~400 Red Wine and hand them to Lokar To`Biath in Neriak Third Gate.',
      items: []
    },
    'Dreadguard Outer': { hint: 'Red Wine to Lokar To`Biath (Neriak Third Gate) raises all three Neriak factions.', items: [] },
    'Dreadguard Inner': { hint: 'Red Wine to Lokar To`Biath (Neriak Third Gate) raises all three Neriak factions.', items: [] },
    // Dwarf
    'Storm Guard': {
      hint: 'Tumpy Tonics: brew Kiola Nuts (Cleonae Kalen, Ocean of Tears) + Flasks of Water, give ~800 tonics to Trantor Everhot in Kaladim.',
      items: ['Kiola Nut', 'Tumpy Tonic']
    },
    'Merchants of Kaladim': { hint: 'Tumpy Tonics to Trantor Everhot (Kaladim) — same run as Storm Guard.', items: ['Kiola Nut', 'Tumpy Tonic'] },
    'Kazon Stormhammer': { hint: 'Tumpy Tonics to Trantor Everhot (Kaladim) — same run as Storm Guard.', items: ['Kiola Nut', 'Tumpy Tonic'] },
    // Erudite
    'Deepwater Knights': {
      hint: 'Kobold Molars from The Warrens/Stonebrunt to Tiam Khonsir; Peacekeeper Staff runs (Lumi Stergnon, Erudin → Emil Parsini, Toxxulia) ×400.',
      items: ['Kobold Molar', 'Rolled Up Strip of Cloth']
    },
    'High Council of Erudin': { hint: 'Kobold Molars + Peacekeeper Staff runs — same grind as Deepwater Knights.', items: ['Kobold Molar', 'Rolled Up Strip of Cloth'] },
    'Heretics': { hint: 'Kill guards/good NPCs in Paineel routes per Alanna’s guide (killing Heretic enemies LOWERS this — check the guide before starting).', items: [] },
    // Froglok
    'Protectors of Gukta': {
      hint: 'Farm ~800 Phosphorous Powder from high-level ghouls in the Ruins of Old Guk, trade 2 at a time to Zok Zribb (Rathe Mountains).',
      items: ['Phosphorous Powder']
    },
    'Guktan Elders': { hint: 'Phosphorous Powder to Zok Zribb (Rathe Mountains) — same run.', items: ['Phosphorous Powder'] },
    'Guktan Suppliers': { hint: 'Phosphorous Powder to Zok Zribb (Rathe Mountains) — same run.', items: ['Phosphorous Powder'] },
    // Gnome
    'King Ak`Anon': {
      hint: 'Series C Black Boxes: say "new warrior" to Manik Compolten (Ak`Anon) for a Shiny Card, trade to Clockwork XIIC — ~400 rounds.',
      items: ['Shiny Card', 'Series C Black Box']
    },
    'Gem Choppers': { hint: 'Series C Black Box rounds with Clockwork XIIC — same grind.', items: ['Shiny Card', 'Series C Black Box'] },
    'Eldritch Collective': { hint: 'Series C Black Box rounds with Clockwork XIIC — same grind.', items: ['Shiny Card', 'Series C Black Box'] },
    // Halfling
    'Guardians of the Vale': {
      hint: 'Buy ~400 Bandages for Joogl Honeybugger (Misty Thicket); Cleric Supplies: Black Wolf Skins + Ruined Wolf Pelts + foraged Berries to Beek Guinders (Rivervale).',
      items: ['Black Wolf Skin', 'Ruined Wolf Pelt', 'Berries']
    },
    'Merchants of Rivervale': { hint: 'Bandages to Joogl Honeybugger / Cleric Supplies to Beek Guinders — same runs.', items: ['Black Wolf Skin', 'Ruined Wolf Pelt'] },
    'Priests of Mischief': { hint: 'Bandages to Joogl Honeybugger / Cleric Supplies to Beek Guinders — same runs.', items: ['Black Wolf Skin', 'Ruined Wolf Pelt'] },
    // High Elf
    'Clerics of Tunare': {
      hint: 'Muffins (Pincia Brownloe, W. Freeport) to Pandos Flintside; White Wine to Lady Shae (Hogcaller’s Inn); Bat Wings ×4 to Niola Impholder (S. Felwithe).',
      items: ['Bat Wing']
    },
    'Keepers of the Art': { hint: 'Muffin / White Wine / Bat Wing turn-ins — same Faydwer runs.', items: ['Bat Wing'] },
    'Merchants of Felwithe': { hint: 'Muffin / White Wine / Bat Wing turn-ins — same Faydwer runs.', items: ['Bat Wing'] },
    // Human (Freeport)
    'Coalition of Tradesfolk': {
      hint: 'Tumpy Tonics ×110 to Groflah Steadirt (East Freeport docks, night spawn); Message Intercept: Bottle of Milk to Mojax Hikspin → kill Duggin Scumber, note to Sir Lucan ×42.',
      items: ['Tumpy Tonic', 'Kiola Nut']
    },
    'Knights of Truth': { hint: 'Tumpy Tonics to Groflah Steadirt / Message Intercept runs — same grind.', items: ['Tumpy Tonic', 'Kiola Nut'] },
    'Freeport Militia': { hint: 'Tumpy Tonics to Groflah Steadirt / Message Intercept runs — same grind.', items: ['Tumpy Tonic', 'Kiola Nut'] },
    // Human (Qeynos)
    'Merchants of Qeynos': {
      hint: 'Buy ~400 Brandy for Captain Rohand; 1600 Honey Mead ×4 at a time to Trumpy Irontoe (South Qeynos).',
      items: []
    },
    'Guards of Qeynos': { hint: 'Brandy to Captain Rohand / Honey Mead to Trumpy Irontoe — same runs.', items: [] },
    'Corrupt Qeynos Guard': { hint: 'Brandy to Captain Rohand / Honey Mead to Trumpy Irontoe — same runs.', items: [] },
    // Iksar
    'New Sebilisian Expedition': {
      hint: 'Forge Metal Bits (2 Small Pieces of Ore + Water Flask) ×4 to Crusader Iktra (North Ro) ×160; or Small Pieces of High Quality Ore (brick + chisel) ×180.',
      items: ['Small Piece of Ore', 'Small Brick of High Quality Ore', 'Metal Bits', 'Small Piece of High Quality Ore']
    },
    // Ogre
    'Oggok Guards': {
      hint: 'Fresh Baked Muffins: bake ~400 Muffins (needs ~667 foraged Fruit, 135+ baking), crate via Gretta Mottle (S. Kaladim), deliver in Feerrott/Oggok. Very long — consider starting as Ogre.',
      items: ['Fruit']
    },
    'Clurg': { hint: 'Fresh Baked Muffin deliveries — same (very long) grind.', items: ['Fruit'] },
    'Merchants of Oggok': { hint: 'Fresh Baked Muffin deliveries — same (very long) grind.', items: ['Fruit'] },
    // Troll
    'Da Bashers': {
      hint: 'Farm ~400 Deathfist Slashed Belts (Commonlands orcs) for Bregna in Grobb; or Grub Locker runs: The Gobbler (Neriak FQ) → Nerbilik (Ocean of Tears) ×400.',
      items: ['Deathfist Slashed Belt', 'Grub Locker']
    },
    'Grobb Merchants': { hint: 'Deathfist Slashed Belts to Bregna / Grub Locker runs — same grind.', items: ['Deathfist Slashed Belt', 'Grub Locker'] },
    'Dark Ones': { hint: 'Deathfist Slashed Belts to Bregna / Grub Locker runs — same grind.', items: ['Deathfist Slashed Belt', 'Grub Locker'] },
    // Wood Elf
    'Emerald Warriors': {
      hint: 'Muffins to Pandos Flintside (buy from Pincia Brownloe, W. Freeport); White Wine to Lady Shae at Hogcaller’s Inn.',
      items: []
    },
    'Soldiers of Tunare': { hint: 'Muffin / White Wine turn-ins — same runs as Emerald Warriors.', items: [] },
    'Kelethin Merchants': { hint: 'Muffin / White Wine turn-ins — same runs as Emerald Warriors.', items: [] }
  };

  // Race-level notes for unlocks that aren't plain "max 3 factions"
  const RACE_NOTES = {
    'Half Elf': 'Autocompletes when you unlock Human or Wood Elf — no separate grind.',
    'Kerran': "Complete the 'Aid the Kerrans of Kerra Isle' task chain — hail a class GM on Kerra Isle.",
    'Iksar': 'Single faction: New Sebilisian Expedition (the Legends Kunark outpost in North Ro).',
    'Ogre': 'Alanna rates this the longest grind in the game — consider starting as an Ogre instead.'
  };

  const DEITY_NOTES = {
    'Agnostic': "Complete the 'Renouncing Your Faith' task for a mysterious Emissary.",
    '*': 'Future placeholder — no requirements exist in game yet (bypassable with a Deity Unlock Token).'
  };

  // Every farmable grind turn-in, for loot KEEP verdicts / "still needed" toasts
  const GRIND_ITEMS = (() => {
    const s = new Set();
    for (const f of Object.values(FACTION_GRINDS)) for (const it of f.items) s.add(it);
    return [...s];
  })();

  return { CREDITS, FACTION_GRINDS, RACE_NOTES, DEITY_NOTES, GRIND_ITEMS };
});
