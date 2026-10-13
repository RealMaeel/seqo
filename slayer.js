// SEQO - Slayer achievement helper data.
// Hunting-ground suggestions per creature family and special faction warnings.
// Zone suggestions are classic-era knowledge — EverQuest Legends adds and
// remixes content, so treat them as starting points, not gospel. Race-kill
// faction warnings are derived LIVE from your own achievements export (the
// race-unlock requirements name the factions); entries here only add to that.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLSlayer = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // family key (lowercase, as the objective text spells it) ->
  //   spots: [{ zone, note? }]  suggested hunting grounds, best first
  //   warn:  [{ factions: [names], note }] faction trade-offs beyond race unlocks
  const FAMILIES = {
    // --- undead ---
    'skeletons': { spots: [{ zone: 'Befallen', note: 'wall-to-wall, trivial sweep' }, { zone: 'Unrest', note: 'dense, fast repops' }, { zone: 'Lower Guk', note: 'dead side' }, { zone: 'Kithicor Forest', note: 'night only — dangerous but packed' }] },
    'zombies': { spots: [{ zone: 'Unrest' }, { zone: 'Befallen' }, { zone: 'Kithicor Forest', note: 'night only' }] },
    'ghouls': { spots: [{ zone: 'Lower Guk', note: 'ghoul everything, dead side' }, { zone: 'Befallen' }] },
    'ghosts': { spots: [{ zone: 'Unrest' }, { zone: 'Mistmoore' }, { zone: 'Qeynos Catacombs' }] },
    'spectres': { spots: [{ zone: 'Oasis of Marr', note: 'spectre tower' }, { zone: 'Feerrott' }, { zone: 'The Plane of Fear' }] },
    'mummies': { spots: [{ zone: 'The Howling Stones' }, { zone: 'City of Mist' }, { zone: 'Befallen' }] },
    'vampires': { spots: [{ zone: 'Mistmoore', note: 'the castle is full of them' }, { zone: 'Kithicor Forest', note: 'night' }] },
    'shades': { spots: [{ zone: 'Unrest' }, { zone: 'Mistmoore' }] },
    'animated armors': { spots: [{ zone: 'Mistmoore' }, { zone: 'The Estate of Unrest' }] },

    // --- humanoid staples ---
    'gnolls': { spots: [{ zone: 'Blackburrow', note: 'endless respawns, the classic grind' }, { zone: 'South Karana', note: 'Splitpaw' }, { zone: 'Qeynos Hills' }],
                warn: [{ factions: ['Sabertooths of Blackburrow'], note: 'Blackburrow gnoll kills RAISE Qeynos-side factions — usually harmless, never wanted by unlocks' }] },
    'kobolds': { spots: [{ zone: 'Steamfont Mountains', note: 'mines' }, { zone: "Nagafen's Lair", note: 'dense, higher level' }, { zone: 'Warsliks Woods' }] },
    'orcs': { spots: [{ zone: 'Crushbone', note: 'the orc factory' }, { zone: 'East Commonlands / Oasis', note: 'Deathfist camps' }, { zone: 'Highpass Hold', note: 'orc caves' }, { zone: 'Frontier Mountains', note: 'Kunark orcs' }] },
    'goblins': { spots: [{ zone: 'Runnyeye Citadel', note: 'top to bottom goblins' }, { zone: 'Permafrost Keep' }, { zone: 'Butcherblock Mountains', note: 'goblin camps' }, { zone: 'Warsliks Woods', note: 'hobgoblins' }] },
    'nightmare goblins': { spots: [{ zone: 'The Plane of Fear', note: 'with a group' }] },
    'giants': { spots: [{ zone: 'Frontier Mountains', note: 'giant fort' }, { zone: 'Rathe Mountains', note: 'hill giants — coin too' }, { zone: 'The Burning Wood' }],
                warn: [{ factions: ['Kromzek', 'Kromrif'], note: 'giant faction only matters if Velious-style content exists on Legends — check before a deep grind' }] },
    'minotaurs': { spots: [{ zone: 'Steamfont Mountains', note: 'minotaur caves' }, { zone: 'The Arena' }] },
    'lizard men': { spots: [{ zone: 'Feerrott' }, { zone: 'Cazic-Thule', note: 'temple — dense' }, { zone: 'Lake of Ill Omen' }] },
    'sarnaks': { spots: [{ zone: 'Lake of Ill Omen', note: 'Sarnak fort' }, { zone: 'The Overthere' }, { zone: 'Chardok', note: 'dense, higher level' }],
                 warn: [{ factions: ['Brood of Di`Zok'], note: 'Chardok sarnaks carry faction some trade/quest turn-ins use — check your quest plans first' }] },
    'shissar': { spots: [{ zone: 'The Temple of Ssraeshza', note: 'if Legends has it — otherwise rare' }] },

    // --- vermin / critters ---
    'rats': { spots: [{ zone: 'Qeynos Catacombs' }, { zone: 'Befallen' }, { zone: 'Upper Guk' }] },
    'ratmen': { spots: [{ zone: 'Qeynos Catacombs', note: 'the aqueducts crawl with them' }, { zone: 'Highpass Hold' }] },
    'bats': { spots: [{ zone: 'Kithicor Forest' }, { zone: 'Mistmoore' }, { zone: 'Dalnir' }] },
    'snakes': { spots: [{ zone: 'North Ro / Oasis' }, { zone: 'The Feerrott' }, { zone: 'Kurn\'s Tower' }] },
    'spiders': { spots: [{ zone: 'East Karana' }, { zone: 'Dalnir' }, { zone: 'The Dreadlands' }] },
    'scorpions': { spots: [{ zone: 'North Ro', note: 'desert' }, { zone: 'Lake of Ill Omen' }] },
    'beetles': { spots: [{ zone: 'North Ro' }, { zone: 'Upper Guk' }, { zone: 'The Warrens' }] },
    'leeches': { spots: [{ zone: 'Innothule Swamp' }, { zone: 'Swamp of No Hope' }] },
    'armadillos': { spots: [{ zone: 'The Overthere' }, { zone: 'Frontier Mountains' }] },

    // --- animals ---
    'wolves': { spots: [{ zone: 'Everfrost Peaks' }, { zone: 'West Karana' }, { zone: 'The Dreadlands' }] },
    'bears': { spots: [{ zone: 'Everfrost Peaks' }, { zone: 'Butcherblock Mountains' }, { zone: 'West Karana' }] },
    'lions': { spots: [{ zone: 'North Karana' }, { zone: 'The Overthere' }] },
    'pumas': { spots: [{ zone: 'North Karana' }, { zone: 'Lavastorm Mountains' }] },
    'tigers': { spots: [{ zone: 'The Emerald Jungle' }, { zone: 'Timorous Deep' }] },
    'gorillas': { spots: [{ zone: 'The Emerald Jungle' }, { zone: 'Trakanon\'s Teeth' }] },
    'birds': { spots: [{ zone: 'South Karana', note: 'aviak village' }, { zone: 'Timorous Deep', note: 'aviak isle' }] },
    'sharks': { spots: [{ zone: 'Ocean of Tears' }, { zone: 'Timorous Deep' }, { zone: 'Kedge Keep' }] },
    'fishes': { spots: [{ zone: 'Kedge Keep', note: 'everything swims' }, { zone: 'Lake Rathetear' }] },
    'kedge': { spots: [{ zone: 'Kedge Keep', note: 'the only place — bring enduring breath' }] },
    'crocodiles': { spots: [{ zone: 'Upper Guk' }, { zone: 'Oasis of Marr' }, { zone: 'Swamp of No Hope' }] },
    'alligators': { spots: [{ zone: 'Innothule Swamp' }, { zone: 'Upper Guk' }] },
    'mammoths': { spots: [{ zone: 'Everfrost Peaks' }] },
    'elephants': { spots: [{ zone: 'The Overthere' }, { zone: 'Stonebrunt Mountains' }] },
    'griffins': { spots: [{ zone: 'East Commonlands' }, { zone: 'North Karana' }] },

    // --- magical / constructs / planar ---
    'golems': { spots: [{ zone: 'Najena' }, { zone: 'The Plane of Fear', note: 'with a group' }, { zone: 'Kurn\'s Tower' }] },
    'gargoyles': { spots: [{ zone: 'Najena' }, { zone: 'Ocean of Tears', note: 'gargoyle isle' }, { zone: 'The Plane of Sky' }] },
    'elementals': { spots: [{ zone: 'Najena' }, { zone: 'Solusek\'s Eye', note: 'fire' }, { zone: 'Butcherblock Mountains', note: 'corrupted earth' }] },
    'imps': { spots: [{ zone: 'Lavastorm Mountains' }, { zone: 'Najena' }, { zone: 'The Plane of Sky' }] },
    'efreetis': { spots: [{ zone: 'Nagafen\'s Lair', note: 'efreeti room' }, { zone: 'The Plane of Sky' }] },
    'dervishes': { spots: [{ zone: 'North Ro' }, { zone: 'East Commonlands' }] },
    'wraiths': { spots: [{ zone: 'Kithicor Forest', note: 'night' }, { zone: 'The Plane of Fear' }] },
    'treants': { spots: [{ zone: 'South Karana' }, { zone: 'Greater Faydark', note: 'watch faction — some are protected' }],
                 warn: [{ factions: ['Unkempt Druids'], note: 'druid-flavored factions can sour from treant kills — check the mob page if you play with druid rings' }] },
    'evil eyes': { spots: [{ zone: 'Runnyeye Citadel', note: 'the deep levels' }, { zone: 'Lower Guk' }] },
    'gelatinous cubes': { spots: [{ zone: 'Befallen' }, { zone: 'Runnyeye Citadel' }, { zone: 'Kurn\'s Tower' }] },
    'harpies': { spots: [{ zone: 'Rathe Mountains' }, { zone: 'South Karana' }] },
    'dragons': { spots: [{ zone: 'Nagafen\'s Lair / Permafrost', note: 'the big two' }, { zone: 'Kunark raid zones', note: 'ring of scale' }] },
    'drakes': { spots: [{ zone: 'Lavastorm Mountains' }, { zone: 'Nagafen\'s Lair' }, { zone: 'The Burning Wood' }] },
    'wurms': { spots: [{ zone: 'Lavastorm Mountains' }, { zone: 'The Burning Wood' }, { zone: 'Veeshan\'s Peak', note: 'raid' }] },
    'wyverns': { spots: [{ zone: 'The Dreadlands' }, { zone: 'Timorous Deep' }] },
    'raptors': { spots: [{ zone: 'Timorous Deep' }, { zone: 'The Dreadlands' }] },
    'fairies': { spots: [{ zone: 'Greater Faydark', note: 'watch for protected ones near Kelethin' }, { zone: 'Lesser Faydark' }] },
    'pixies': { spots: [{ zone: 'Greater Faydark' }, { zone: 'Lesser Faydark' }] },
    'brownies': { spots: [{ zone: 'Lesser Faydark', note: 'they hit HARD for their size' }] },
    'centaurs': { spots: [{ zone: 'South Karana' }, { zone: 'North Karana' }],
                  warn: [{ factions: ['Dar Khura'], note: 'Karana centaurs are friendly to many — their faction gates some quests' }] },
    'bixies': { spots: [{ zone: 'Misty Thicket' }, { zone: 'South Karana', note: 'hive' }] },
    'sphinxes': { spots: [{ zone: 'The Plane of Sky' }, { zone: 'Timorous Deep' }] },
    'sirens': { spots: [{ zone: 'Ocean of Tears', note: 'siren isle' }, { zone: 'Kedge Keep' }] },
    'mermaids': { spots: [{ zone: 'Kedge Keep' }, { zone: 'Ocean of Tears' }] },
    'clockwork': { spots: [{ zone: 'Ak\'Anon', note: '⚠ city clockworks hit gnome faction — use the Steamfont mino cave clockworks instead' }, { zone: 'Steamfont Mountains' }],
                   warn: [{ factions: ['Gem Choppers', 'Deeppockets', 'Merchants of Ak`Anon'], note: 'clockworks inside Ak`Anon are CITY property — killing them tanks gnome factions (Gnome race unlock uses these)' }] },
    'scarecrows': { spots: [{ zone: 'South Karana' }, { zone: 'West Karana' }, { zone: 'The Plane of Fear' }] },
    'ghouls bats werebats': { spots: [{ zone: 'Kithicor Forest', note: 'night' }] },
    'werewolves': { spots: [{ zone: 'Kithicor Forest', note: 'night' }, { zone: 'South Karana', note: 'night spawns' }] },
    'sporalis': { spots: [{ zone: 'Innothule Swamp' }, { zone: 'The Feerrott' }, { zone: 'Dalnir' }] },
    'shriekers': { spots: [{ zone: 'The Feerrott' }, { zone: 'Innothule Swamp' }] },
    'amygdalans': { spots: [{ zone: 'The Plane of Fear', note: 'with a group' }] },
    'tentacle terrors': { spots: [{ zone: 'The Plane of Fear', note: 'with a group' }] },
    'goos': { spots: [{ zone: 'The Plane of Hate' }, { zone: 'Permafrost Keep' }] }
  };

  // race objective token -> the race-unlock achievement name it maps to
  // (warnings are then read live from the achievements export's requirements)
  const RACE_UNLOCKS = {
    'humans': 'Human', 'barbarians': 'Barbarian', 'erudites': 'Erudite',
    'wood elves': 'Wood Elf', 'high elves': 'High Elf', 'dark elves': 'Dark Elf',
    'half elves': 'Half Elf', 'dwarves': 'Dwarf', 'halflings': 'Halfling',
    'gnomes': 'Gnome', 'trolls': 'Troll', 'ogres': 'Ogre', 'iksars': 'Iksar',
    'frogloks': 'Froglok', 'kerrans': 'Kerran', 'kerran': 'Kerran',
    'coldain': 'Coldain', 'drakkin': 'Drakkin', 'vah shir': 'Vah Shir'
  };

  // where playable-race NPCs actually stand around to be killed
  const RACE_SPOTS = {
    'humans': 'Qeynos & Freeport guards/citizens; Highpass guards',
    'barbarians': 'Halas & Everfrost guards/citizens',
    'erudites': 'Erudin & Paineel guards (Toxxulia Forest)',
    'wood elves': 'Kelethin guards/citizens (Greater Faydark)',
    'high elves': 'Felwithe guards (Greater Faydark)',
    'dark elves': 'Neriak guards/citizens; Nektulos Forest',
    'half elves': 'mixed among Qeynos / Freeport / Kelethin NPCs',
    'dwarves': 'Kaladim guards/citizens (Butcherblock)',
    'halflings': 'Rivervale guards/citizens (Misty Thicket)',
    'gnomes': 'Ak`Anon guards/citizens (Steamfont)',
    'trolls': 'Grobb guards/citizens (Innothule)',
    'ogres': 'Oggok guards/citizens (Feerrott)',
    'iksars': 'Cabilis guards/citizens; Kunark wilds',
    'frogloks': 'Upper & Lower Guk (the living side) — no city faction worries',
    'kerrans': 'Kerra Isle; Stonebrunt kejek villagers'
  };

  return {
    CREDITS: [{ label: 'Hunting suggestions: classic-era zone knowledge, verify on Legends', url: 'https://eqlwiki.com' }],
    FAMILIES, RACE_UNLOCKS, RACE_SPOTS
  };
});
