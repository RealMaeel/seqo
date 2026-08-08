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
  const wikiNames = {
    gukbottom: 'Lower Guk', guktop: 'Upper Guk',
    soldungb: "Nagafen's Lair", soldunga: "Solusek's Eye",
    soltemple: 'Temple of Solusek Ro',
    qey2hh1: 'West Karana', qeytoqrg: 'Qeynos Hills',
    qeynos: 'South Qeynos', qeynos2: 'North Qeynos', qcat: 'Qeynos Aqueduct System',
    freporte: 'East Freeport', freportw: 'West Freeport', freportn: 'North Freeport',
    ecommons: 'East Commonlands', commons: 'West Commonlands',
    nro: 'North Ro', sro: 'South Ro',
    runnyeye: 'Runnyeye', paw: 'Splitpaw',
    lakerathe: 'Lake Rathetear', rathemtn: 'Rathe Mountains',
    erudnext: 'Erudin', tox: 'Toxxulia Forest', kerraridge: 'Kerra Isle',
    hole: 'The Hole', mistmoore: 'Castle Mistmoore', unrest: 'Estate of Unrest',
    kedge: 'Kedge Keep', cauldron: "Dagnor's Cauldron",
    butcher: 'Butcherblock Mountains', gfaydark: 'Greater Faydark',
    lfaydark: 'Lesser Faydark', steamfont: 'Steamfont Mountains',
    kaladima: 'South Kaladim', kaladimb: 'North Kaladim',
    felwithea: 'North Felwithe', felwitheb: 'South Felwithe',
    oot: 'Ocean of Tears', erudsxing: "Erud's Crossing",
    fearplane: 'Plane of Fear', hateplane: 'Plane of Hate', airplane: 'Plane of Sky',
    cazicthule: 'Cazic-Thule', highpass: 'Highpass Hold', highkeep: 'High Keep',
    neriaka: 'Neriak Foreign Quarter', neriakb: 'Neriak Commons', neriakc: 'Neriak Third Gate',
    feerrott: 'The Feerrott', everfrost: 'Everfrost Peaks', blackburrow: 'Blackburrow'
  };

  const zones = {
    // Antonica
    'East Commonlands': 'ecommons', 'West Commonlands': 'commons',
    'The Commonlands': 'commons',
    'East Freeport': 'freporte', 'West Freeport': 'freportw', 'North Freeport': 'freportn',
    'North Qeynos': 'qeynos2', 'South Qeynos': 'qeynos',
    'Qeynos Hills': 'qeytoqrg', 'Surefall Glade': 'qrg',
    'The Qeynos Aqueduct System': 'qcat', 'Qeynos Aqueducts': 'qcat',
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
    'Greater Faydark': 'gfaydark', 'Lesser Faydark': 'lfaydark', 'Kelethin': 'gfaydark',
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
