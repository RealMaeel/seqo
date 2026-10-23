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
      url: "https://eqlwiki.com/User:Alanna/Alanna%27s_Race_Unlock_Guide",
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
    },
    {
      what: 'Dungeon-crawl rare lists (zone Notable NPCs)',
      by: 'EQLForge',
      url: 'https://eqlforge.com',
      note: 'courtesy of eqlforge.com — please support them'
    }
  ];

  // Per-faction fastest grind, keyed by the EXACT faction name that appears in
  // "Get maximum faction with <name>." achievement objectives and in the
  // Factions outputfile. hint = one-line route; items = farmable turn-ins
  // worth keeping when they drop (buyable supplies are not listed as loot).
  // routes[]: labeled alternatives ("Option A / Option B") where the guide
  // gives more than one way to grind the faction. Each route carries its OWN
  // needs{} so the rep counters only count what that route actually eats.
  // tag: 'evil' / 'good' marks race-restricted routes from the guide.
  // Top-level hint/items/needs stay as the union, for the loot engine and for
  // live guide data (which arrives in the old hint+needs shape).
  const FACTION_GRINDS = {
    // Barbarian
    'Rogues of the White Rose': {
      hint: 'Lion Meat Shipment ×200 (Einhorst McMannus, West Karana) → trade 200 Lion Delight to Iceberg in Everfrost. Alt: Gnoll Bounty — 1200 Gnoll Fangs to Lysbith McNaff (Halas).',
      items: ['Gnoll Fang', 'Lion Meat', 'Lion Delight'], needs: { 'Lion Delight': 200, 'Gnoll Fang': 1200 },
      routes: [
        { label: 'Lion Meat Shipment', hint: '×200: Einhorst McMannus (West Karana) → trade 200 Lion Delight to Iceberg in Everfrost.', needs: { 'Lion Delight': 200 } },
        { label: 'Gnoll Bounty', hint: '1200 Gnoll Fangs to Lysbith McNaff (Halas).', needs: { 'Gnoll Fang': 1200 } }
      ]
    },
    'Wolves of the North': {
      hint: 'Same runs as Rogues of the White Rose — Lion Meat Shipment / Gnoll Bounty raise all three Halas factions together.',
      items: ['Gnoll Fang', 'Lion Meat', 'Lion Delight'], needs: { 'Lion Delight': 200, 'Gnoll Fang': 1200 },
      routes: [
        { label: 'Lion Meat Shipment', hint: 'Same run as Rogues of the White Rose — raises all three Halas factions together.', needs: { 'Lion Delight': 200 } },
        { label: 'Gnoll Bounty', hint: '1200 Gnoll Fangs to Lysbith McNaff (Halas).', needs: { 'Gnoll Fang': 1200 } }
      ]
    },
    'Merchants of Halas': {
      hint: 'Rides along with the Lion Meat / Gnoll Fang turn-ins above.',
      items: ['Gnoll Fang', 'Lion Meat', 'Lion Delight'], needs: { 'Lion Delight': 200, 'Gnoll Fang': 1200 },
      routes: [
        { label: 'Lion Meat Shipment', hint: 'Rides along with the turn-ins above.', needs: { 'Lion Delight': 200 } },
        { label: 'Gnoll Bounty', hint: 'Rides along with the Gnoll Fang turn-ins above.', needs: { 'Gnoll Fang': 1200 } }
      ]
    },
    // Dark Elf
    'Dark Bargainers': {
      hint: 'Buy ~400 Red Wine and hand them to Lokar To`Biath in Neriak Third Gate.',
      items: [], needs: { 'Red Wine': 400 }
    },
    'Dreadguard Outer': { hint: 'Red Wine to Lokar To`Biath (Neriak Third Gate) raises all three Neriak factions.', items: [], needs: { 'Red Wine': 400 } },
    'Dreadguard Inner': { hint: 'Red Wine to Lokar To`Biath (Neriak Third Gate) raises all three Neriak factions.', items: [], needs: { 'Red Wine': 400 } },
    // Dwarf
    'Storm Guard': {
      hint: 'Tumpy Tonics: brew Kiola Nuts (Cleonae Kalen, Ocean of Tears) + Flasks of Water, give ~800 tonics to Trantor Everhot in Kaladim.',
      items: ['Kiola Nut', 'Tumpy Tonic'], needs: { 'Tumpy Tonic': 800, 'Kiola Nut': 800 }
    },
    'Merchants of Kaladim': { hint: 'Tumpy Tonics to Trantor Everhot (Kaladim) — same run as Storm Guard.', items: ['Kiola Nut', 'Tumpy Tonic'], needs: { 'Tumpy Tonic': 800, 'Kiola Nut': 800 } },
    'Kazon Stormhammer': { hint: 'Tumpy Tonics to Trantor Everhot (Kaladim) — same run as Storm Guard.', items: ['Kiola Nut', 'Tumpy Tonic'], needs: { 'Tumpy Tonic': 800, 'Kiola Nut': 800 } },
    // Erudite
    'Deepwater Knights': {
      hint: 'Kobold Molars from The Warrens/Stonebrunt to Tiam Khonsir; Peacekeeper Staff runs (Lumi Stergnon, Erudin → Emil Parsini, Toxxulia) ×400.',
      items: ['Kobold Molar', 'Rolled Up Strip of Cloth'], needs: { 'Kobold Molar': 400 },
      routes: [
        { label: 'Kobold Molars', hint: 'From The Warrens / Stonebrunt mobs, turned in to Tiam Khonsir.', needs: { 'Kobold Molar': 400 } },
        { label: 'Peacekeeper Staff runs', hint: 'Lumi Stergnon (Erudin) → Emil Parsini (Toxxulia), ×400 rounds — bought supplies, no farming.' }
      ]
    },
    'High Council of Erudin': {
      hint: 'Kobold Molars + Peacekeeper Staff runs — same grind as Deepwater Knights.',
      items: ['Kobold Molar', 'Rolled Up Strip of Cloth'], needs: { 'Kobold Molar': 400 },
      routes: [
        { label: 'Kobold Molars', hint: 'Same grind as Deepwater Knights.', needs: { 'Kobold Molar': 400 } },
        { label: 'Peacekeeper Staff runs', hint: 'Same rounds as Deepwater Knights — both factions rise together.' }
      ]
    },
    'Heretics': { hint: 'Kill guards/good NPCs in Paineel routes per Alanna’s guide (killing Heretic enemies LOWERS this — check the guide before starting).', items: [] },
    // Froglok
    'Protectors of Gukta': {
      hint: 'Farm ~800 Phosphorous Powder from high-level ghouls in the Ruins of Old Guk, trade 2 at a time to Zok Zribb (Rathe Mountains).',
      items: ['Phosphorous Powder'], needs: { 'Phosphorous Powder': 800 }
    },
    'Guktan Elders': { hint: 'Phosphorous Powder to Zok Zribb (Rathe Mountains) — same run.', items: ['Phosphorous Powder'], needs: { 'Phosphorous Powder': 800 } },
    'Guktan Suppliers': { hint: 'Phosphorous Powder to Zok Zribb (Rathe Mountains) — same run.', items: ['Phosphorous Powder'], needs: { 'Phosphorous Powder': 800 } },
    // Gnome
    'King Ak`Anon': {
      hint: 'Series C Black Boxes: say "new warrior" to Manik Compolten (Ak`Anon) for a Shiny Card, trade to Clockwork XIIC — ~400 rounds.',
      items: ['Shiny Card', 'Series C Black Box'], needs: { 'Shiny Card': 400 }
    },
    'Gem Choppers': { hint: 'Series C Black Box rounds with Clockwork XIIC — same grind.', items: ['Shiny Card', 'Series C Black Box'], needs: { 'Shiny Card': 400 } },
    'Eldritch Collective': { hint: 'Series C Black Box rounds with Clockwork XIIC — same grind.', items: ['Shiny Card', 'Series C Black Box'], needs: { 'Shiny Card': 400 } },
    // Halfling
    'Guardians of the Vale': {
      hint: 'Buy ~400 Bandages for Joogl Honeybugger (Misty Thicket); Cleric Supplies: Black Wolf Skins + Ruined Wolf Pelts + foraged Berries to Beek Guinders (Rivervale).',
      items: ['Black Wolf Skin', 'Ruined Wolf Pelt', 'Berries'], needs: { 'Bandages': 400 },
      routes: [
        { label: 'Bandages', hint: 'Buy ~400 Bandages and hand them to Joogl Honeybugger (Misty Thicket).', needs: { 'Bandages': 400 } },
        { label: 'Cleric Supplies', hint: 'Black Wolf Skins + Ruined Wolf Pelts + foraged Berries to Beek Guinders (Rivervale). Alanna’s guide no longer recommends this one.' }
      ]
    },
    'Merchants of Rivervale': { hint: 'Bandages to Joogl Honeybugger / Cleric Supplies to Beek Guinders — same runs.', items: ['Black Wolf Skin', 'Ruined Wolf Pelt'], needs: { 'Bandages': 400 } },
    'Priests of Mischief': { hint: 'Bandages to Joogl Honeybugger / Cleric Supplies to Beek Guinders — same runs.', items: ['Black Wolf Skin', 'Ruined Wolf Pelt'], needs: { 'Bandages': 400 } },
    // High Elf
    'Clerics of Tunare': {
      hint: 'Muffins (Pincia Brownloe, W. Freeport) to Pandos Flintside; White Wine to Lady Shae (Hogcaller’s Inn); Bat Wings ×4 to Niola Impholder (S. Felwithe).',
      items: ['Bat Wing'], needs: { 'Muffin': 400, 'White Wine': 400, 'Bat Wing': 1600 }
    },
    'Keepers of the Art': { hint: 'Muffin / White Wine / Bat Wing turn-ins — same Faydwer runs.', items: ['Bat Wing'], needs: { 'Muffin': 400, 'White Wine': 400, 'Bat Wing': 1600 } },
    'Merchants of Felwithe': { hint: 'Muffin / White Wine / Bat Wing turn-ins — same Faydwer runs.', items: ['Bat Wing'], needs: { 'Muffin': 400, 'White Wine': 400, 'Bat Wing': 1600 } },
    // Human (Freeport)
    'Coalition of Tradesfolk': {
      hint: 'Tumpy Tonics ×110 to Groflah Steadirt (East Freeport docks, night spawn); Message Intercept: Bottle of Milk to Mojax Hikspin → kill Duggin Scumber, note to Sir Lucan ×42.',
      items: ['Tumpy Tonic', 'Kiola Nut'], needs: { 'Tumpy Tonic': 110 },
      routes: [
        { label: 'Tumpy Tonics', hint: '×110 to Groflah Steadirt (East Freeport docks — he’s a night spawn).', needs: { 'Tumpy Tonic': 110 } },
        { label: 'Message Intercept', hint: 'Bottle of Milk to Mojax Hikspin → kill Duggin Scumber, note to Sir Lucan, ×42 rounds.' }
      ]
    },
    'Knights of Truth': { hint: 'Tumpy Tonics to Groflah Steadirt / Message Intercept runs — same grind.', items: ['Tumpy Tonic', 'Kiola Nut'], needs: { 'Tumpy Tonic': 110 } },
    'Freeport Militia': { hint: 'Tumpy Tonics to Groflah Steadirt / Message Intercept runs — same grind.', items: ['Tumpy Tonic', 'Kiola Nut'], needs: { 'Tumpy Tonic': 110 } },
    // Human (Qeynos)
    'Merchants of Qeynos': {
      hint: 'Buy ~400 Brandy for Captain Rohand; 1600 Honey Mead ×4 at a time to Trumpy Irontoe (South Qeynos).',
      items: [], needs: { 'Brandy': 400, 'Honey Mead': 1600 },
      routes: [
        { label: 'Brandy', hint: 'Buy ~400 Brandy for Captain Rohand.', needs: { 'Brandy': 400 } },
        { label: 'Honey Mead', hint: '1600 Honey Mead, handed over ×4 at a time to Trumpy Irontoe (South Qeynos). Mind: this trades guard/merchant faction against the corrupt guards.', needs: { 'Honey Mead': 1600 } }
      ]
    },
    'Guards of Qeynos': { hint: 'Brandy to Captain Rohand / Honey Mead to Trumpy Irontoe — same runs.', items: [], needs: { 'Brandy': 400, 'Honey Mead': 1600 } },
    'Corrupt Qeynos Guard': {
      hint: 'Brandy to Captain Rohand / Honey Mead to Trumpy Irontoe — same runs.',
      items: [], needs: { 'Brandy': 400, 'Honey Mead': 1600 },
      routes: [
        { label: 'Honey Mead', hint: 'Honey Mead to Trumpy Irontoe raises the corrupt guards (while lowering regular guard/merchant standing).', needs: { 'Honey Mead': 1600 } },
        { label: 'Evil-race routes', tag: 'evil', hint: 'Guard Shilster’s Stout / The Crate (Evil) / Slansin — the guide’s routes for evil races, which can’t run the good-city errands.' }
      ]
    },
    // Iksar
    'New Sebilisian Expedition': {
      hint: 'Forge Metal Bits (2 Small Pieces of Ore + Water Flask) ×4 to Crusader Iktra (North Ro) ×160; or Small Pieces of High Quality Ore (brick + chisel) ×180.',
      items: ['Small Piece of Ore', 'Small Brick of High Quality Ore', 'Metal Bits', 'Small Piece of High Quality Ore'], needs: { 'Metal Bits': 640, 'Small Piece of High Quality Ore': 180 },
      routes: [
        { label: 'Metal Bits', hint: 'Forge Metal Bits (2 Small Pieces of Ore + Water Flask), hand in ×4 to Crusader Iktra (North Ro), ~160 rounds.', needs: { 'Metal Bits': 640 } },
        { label: 'High Quality Ore', hint: 'Small Pieces of High Quality Ore (brick + chisel), ×180.', needs: { 'Small Piece of High Quality Ore': 180 } }
      ]
    },
    // Ogre
    'Oggok Guards': {
      hint: 'Fresh Baked Muffins: bake ~400 Muffins (needs ~667 foraged Fruit, 135+ baking), crate via Gretta Mottle (S. Kaladim), deliver in Feerrott/Oggok. Very long — consider starting as Ogre.',
      items: ['Fruit'], needs: { 'Fresh Baked Muffin': 400, 'Fruit': 667 }
    },
    'Clurg': { hint: 'Fresh Baked Muffin deliveries — same (very long) grind.', items: ['Fruit'], needs: { 'Fresh Baked Muffin': 400, 'Fruit': 667 } },
    'Merchants of Oggok': { hint: 'Fresh Baked Muffin deliveries — same (very long) grind.', items: ['Fruit'], needs: { 'Fresh Baked Muffin': 400, 'Fruit': 667 } },
    // Troll
    'Da Bashers': {
      hint: 'Farm ~400 Deathfist Slashed Belts (Commonlands orcs) for Bregna in Grobb; or Grub Locker runs: The Gobbler (Neriak FQ) → Nerbilik (Ocean of Tears) ×400.',
      items: ['Deathfist Slashed Belt', 'Grub Locker'], needs: { 'Deathfist Slashed Belt': 400, 'Grub Locker': 400 },
      routes: [
        { label: 'Deathfist Belts', hint: 'Farm ~400 Deathfist Slashed Belts from Commonlands orcs for Bregna in Grobb.', needs: { 'Deathfist Slashed Belt': 400 } },
        { label: 'Grub Locker runs', hint: 'The Gobbler (Neriak Foreign Quarter) → Nerbilik (Ocean of Tears), ×400.', needs: { 'Grub Locker': 400 } }
      ]
    },
    'Grobb Merchants': { hint: 'Deathfist Slashed Belts to Bregna / Grub Locker runs — same grind.', items: ['Deathfist Slashed Belt', 'Grub Locker'], needs: { 'Deathfist Slashed Belt': 400, 'Grub Locker': 400 } },
    'Dark Ones': { hint: 'Deathfist Slashed Belts to Bregna / Grub Locker runs — same grind.', items: ['Deathfist Slashed Belt', 'Grub Locker'], needs: { 'Deathfist Slashed Belt': 400, 'Grub Locker': 400 } },
    // Wood Elf
    'Emerald Warriors': {
      hint: 'Muffins to Pandos Flintside (buy from Pincia Brownloe, W. Freeport); White Wine to Lady Shae at Hogcaller’s Inn.',
      items: [], needs: { 'Muffin': 400, 'White Wine': 400 }
    },
    'Soldiers of Tunare': { hint: 'Muffin / White Wine turn-ins — same runs as Emerald Warriors.', items: [], needs: { 'Muffin': 400, 'White Wine': 400 } },
    'Kelethin Merchants': { hint: 'Muffin / White Wine turn-ins — same runs as Emerald Warriors.', items: [], needs: { 'Muffin': 400, 'White Wine': 400 } }
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

  // Key quests, keyed by the EXACT achievement name in the game's
  // "General: Keys" section. The section itself (which keys exist, done or
  // not) comes from /outputfile achievements; this only adds the walkthrough.
  // step.item = an item you hold during that step (checked against your
  // inventory + live loot), step.zone = where it happens.
  // Keys that are key-ring items rather than achievements carry keyItem:
  // the walkthrough counts as done once that item is on your key ring.
  // step.unverified marks a step taken from player reports, not a logged run.
  const KEY_QUESTS = {
    'Be Our Guest': {
      opens: 'Nektropos Castle',
      task: 'Hate, Betrayal, and Trust',
      giver: 'Retainer Ozval',
      zone: 'Lake Nerius',
      steps: [
        { zone: 'Lake Nerius', text: 'Hail Retainer Ozval, then say "dark times" and "peril" to get the task Hate, Betrayal, and Trust.' },
        { zone: 'Lake Nerius', item: 'Ancient Signet Ring of House Everling', text: 'Kill Corrupted Kedgespawn in the lake for the Ancient Signet Ring of House Everling, and hand it to Ozval.' },
        { zone: "Ak'Anon", item: 'Exquisite Gem Setter', text: 'Say "Ozval" to Rylin Coil, the tinker, for the Exquisite Gem Setter.' },
        { zone: 'Northern Felwithe', item: 'Peerless Sapphire', text: 'In the Shop of All Holos, say "Ozval sent me" to Merchant Tyslin for the Peerless Sapphire.' },
        { zone: 'Lake Nerius', text: 'Hand the Peerless Sapphire and Exquisite Gem Setter to Ozval.' },
        { zone: 'The Plane of Hate', item: 'Blessing of the Betrayer', text: 'Find the High Priestess of Ulkorruuk, hail her and say "swear" for the Blessing of the Betrayer. Stay out of the void-touched Plane of Hate.' },
        { zone: 'Lake Nerius', text: 'Hand the Blessing of the Betrayer to Ozval. That completes Be Our Guest; follow the road north to Nektropos Castle.' }
      ],
      source: 'Walked through in full on the Oct 22 2026 launch day (SEQO maintainer run)'
    },
    'Nektropos Library Key': {
      keyItem: 'Nektropos Library Key',
      opens: 'the Nektropos library',
      task: 'The Tragic Tale of House Everling',
      giver: 'Lord Ollix Everling',
      zone: 'Nektropos Castle',
      steps: [
        { zone: 'Nektropos Castle', text: 'Hail Lord Ollix Everling inside the castle for the task The Tragic Tale of House Everling.' },
        { zone: 'Nektropos Castle', item: 'Harpsichord Plectrum', text: 'Find the ruined harpsichord and gather its four missing pieces (a black key, a white key, a string and a Harpsichord Plectrum). They are glowing pickups on the first floor.' },
        { zone: 'Nektropos Castle', text: 'Put all four pieces into the harpsichord. The hammer strikes, a hidden panel opens and the Nektropos Library Key goes onto your key ring.' },
        { zone: 'Nektropos Castle', unverified: true, text: 'Take the key up to the library on the second floor.' }
      ],
      source: 'Harpsichord steps from the Oct 22 2026 launch-night run (SEQO maintainer log); library location from player reports'
    }
  };

  // Every farmable grind turn-in, for loot KEEP verdicts / "still needed" toasts
  const GRIND_ITEMS = (() => {
    const s = new Set();
    for (const f of Object.values(FACTION_GRINDS)) for (const it of f.items) s.add(it);
    return [...s];
  })();

  // for the data-freshness check
  const META = { captured: '2026-09-22', sources: ["Alanna's Race Unlock Guide"] };

  return { CREDITS, FACTION_GRINDS, RACE_NOTES, DEITY_NOTES, GRIND_ITEMS, META, KEY_QUESTS };
});
