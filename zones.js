// Classic EQ zone name -> map file short name.
// EQ Legends reuses classic zone geometry, so community map files
// (Brewall / nParse format) are named by these short names.
// Gaps are filled automatically at runtime from /who output in the log
// ("ZONE: The Feerrott (feerrott)").

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLZones = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Wiki page titles where they differ from the game's zone-entry names,
  // keyed by map short name ("The Ruins of Old Guk" in game = "Lower Guk" on the wiki)
  // short map name -> the wiki's EXACT page title (audited against
  // eqlwiki's Category:Zones page list, Aug 2026). Cities are merged
  // pages on the wiki (all Neriak districts -> "Neriak", etc.).
  const wikiNames = {
    gukbottom: 'Lower Guk', guktop: 'Upper Guk',
    soldungb: "Nagafen's Lair", soldunga: "Solusek's Eye",
    soltemple: 'The Temple of Solusek Ro',
    qey2hh1: 'Western Karana', northkarana: 'Northern Plains of Karana',
    eastkarana: 'Eastern Plains of Karana', southkarana: 'Southern Karana',
    qeytoqrg: 'Qeynos Hills',
    qeynos: 'Qeynos', qeynos2: 'Qeynos', qcat: 'Qeynos Aqueducts',
    freporte: 'Freeport', freportw: 'Freeport', freportn: 'Freeport',
    ecommons: 'East Commonlands', commons: 'West Commonlands',
    nro: 'The Northern Desert of Ro', sro: 'Southern Desert of Ro', soro: 'Southern Desert of Ro',
    runnyeye: 'Runnyeye', paw: 'Splitpaw Lair', permafrost: 'Permafrost',
    lakerathe: 'Lake Rathetear', rathemtn: 'Rathe Mountains',
    erudnext: 'Erudin', erudnint: 'Erudin',
    tox: 'Toxxulia Forest', kerraridge: 'Kerra Island',
    hole: 'The Hole', mistmoore: 'Mistmoore Castle', unrest: 'The Estate of Unrest',
    kedge: 'Kedge Keep', cauldron: "Dagnor's Cauldron",
    butcher: 'Butcherblock Mountains', gfaydark: 'Greater Faydark',
    lfaydark: 'Lesser Faydark', steamfont: 'Steamfont Mountains',
    kaladima: 'Kaladim', kaladimb: 'Kaladim',
    felwithea: 'Felwithe', felwitheb: 'Felwithe',
    akanon: "Ak'Anon", kelethin: 'Kelethin', arena: 'The Arena',
    oot: 'Ocean of Tears', erudsxing: "Erud's Crossing",
    fearplane: 'Plane of Fear', hateplane: 'Plane of Hate', airplane: 'Plane of Sky',
    growthplane: 'Plane of Growth', mischiefplane: 'Plane of Mischief',
    cazicthule: 'Cazic Thule (Zone)', highpass: 'Highpass Hold', highkeep: 'High Keep',
    neriaka: 'Neriak', neriakb: 'Neriak', neriakc: 'Neriak',
    beholder: 'Gorge of King Xorbb',
    feerrott: 'The Feerrott', everfrost: 'Everfrost Peaks', blackburrow: 'Blackburrow',
    newsebexp: 'New Sebilis Expedition', jaggedpine: 'Jaggedpine Forest'
  };

  const zones = {
    // Antonica
    'East Commonlands': 'ecommons', 'West Commonlands': 'commons',
    'The Commonlands': 'commons',
    'East Freeport': 'freporte', 'West Freeport': 'freportw', 'North Freeport': 'freportn',
    'North Qeynos': 'qeynos2', 'South Qeynos': 'qeynos',
    'Qeynos Hills': 'qeytoqrg', 'Surefall Glade': 'qrg',
    'The Qeynos Aqueduct System': 'qcat', 'Qeynos Aqueducts': 'qcat',
    'Qeynos Catacombs': 'qcat', 'The Qeynos Catacombs': 'qcat',
    'Jaggedpine Forest': 'jaggedpine', 'The Jaggedpine Forest': 'jaggedpine',
    'Blackburrow': 'blackburrow', 'Everfrost': 'everfrost', 'Everfrost Peaks': 'everfrost',
    'Halas': 'halas', 'Permafrost Caverns': 'permafrost',
    'The Plains of Karana': 'qey2hh1', 'West Karana': 'qey2hh1',
    'North Karana': 'northkarana', 'East Karana': 'eastkarana', 'South Karana': 'southkarana',
    'Highpass Hold': 'highpass', 'High Keep': 'highkeep', 'Kithicor Forest': 'kithicor',
    'Rivervale': 'rivervale', 'Misty Thicket': 'misty', 'Runnyeye Citadel': 'runnyeye',
    'The Liberated Citadel of Runnyeye': 'runnyeye',
    'Innothule Swamp': 'innothule', 'The Feerrott': 'feerrott', 'Grobb': 'grobb',
    'Temple of Cazic-Thule': 'cazicthule', 'The Temple of Cazic-Thule': 'cazicthule',
    'Cazic-Thule': 'cazicthule', 'The City of Guk': 'guktop',
    'Oggok': 'oggok', 'Mountains of Rathe': 'rathemtn', 'Lake Rathetear': 'lakerathe',
    'Arena': 'arena', 'South Ro': 'soro', 'North Ro': 'nro', 'Oasis of Marr': 'oasis',
    'The Desert of Ro': 'sro',
    'New Sebilis Expedition': 'newsebexp', 'The New Sebilis Expedition': 'newsebexp',
    'Gorge of King Xorbb': 'beholder', 'The Gorge of King Xorbb': 'beholder',
    "Beholder's Maze": 'beholder',
    'Nektulos Forest': 'nektulos', 'Lavastorm Mountains': 'lavastorm',
    'Neriak - Foreign Quarter': 'neriaka', 'Neriak - Commons': 'neriakb',
    'Neriak - Third Gate': 'neriakc', 'Neriak Foreign Quarter': 'neriaka',
    'Neriak Commons': 'neriakb', 'Neriak Third Gate': 'neriakc',
    'Befallen': 'befallen', 'Upper Guk': 'guktop', 'Lower Guk': 'gukbottom',
    'The Ruins of Old Guk': 'gukbottom',
    'Nagafen\'s Lair': 'soldungb', 'Solusek\'s Eye': 'soldunga',
    'The Temple of Solusek Ro': 'soltemple', 'Najena': 'najena',
    'The Estate of Unrest': 'unrest', 'Split Paw': 'paw', 'The Lair of the Splitpaw': 'paw',
    'Erud\'s Crossing': 'erudsxing', 'Kerra Isle': 'kerraridge',
    // Faydwer
    'Greater Faydark': 'gfaydark', 'Lesser Faydark': 'lfaydark', 'Kelethin': 'kelethin',
    'Crushbone': 'crushbone', 'Castle Mistmoore': 'mistmoore',
    'The Estate of Mistmoore': 'mistmoore',
    'Butcherblock Mountains': 'butcher', 'Kaladim': 'kaladima', 'North Kaladim': 'kaladimb',
    'South Kaladim': 'kaladima',
    'Ak\'Anon': 'akanon', 'Steamfont Mountains': 'steamfont',
    'Dagnor\'s Cauldron': 'cauldron', 'Kedge Keep': 'kedge',
    'Felwithe': 'felwithea', 'North Felwithe': 'felwithea', 'South Felwithe': 'felwitheb',
    'Ocean of Tears': 'oot',
    // Odus
    'Erudin': 'erudnext', 'Erudin Palace': 'erudnint', 'Toxxulia Forest': 'tox',
    'Paineel': 'paineel', 'The Warrens': 'warrens', 'Stonebrunt Mountains': 'stonebrunt',
    'The Hole': 'hole', 'The Ruins of Old Paineel': 'hole',
    // Planes
    'The Plane of Fear': 'fearplane', 'The Plane of Hate': 'hateplane',
    'The Plane of Sky': 'airplane', 'Plane of Fear': 'fearplane',
    'Plane of Hate': 'hateplane', 'Plane of Sky': 'airplane'
  };

  return { zones, wikiNames };
});
