// SEQO - classic Norrath world graph: zone nodes (schematic positions),
// connections (walk / boat / portal), for the world travel map.
// Positions are schematic "tube map" coordinates, not geography-exact:
// Odus far west, Antonica center, Faydwer east, Planes floating north.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLWorld = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // x grows east, y grows south
  const N = {
    // --- Planes (top) ---
    fearplane:   { name: 'Plane of Fear',      x: 620, y: 60 },
    hateplane:   { name: 'Plane of Hate',      x: 760, y: 60 },
    airplane:    { name: 'Plane of Sky',       x: 900, y: 60 },

    // --- Antonica: north-west (Qeynos side) ---
    halas:       { name: 'Halas',              x: 330, y: 120 },
    everfrost:   { name: 'Everfrost',          x: 330, y: 170 },
    permafrost:  { name: 'Permafrost',         x: 415, y: 150 },
    blackburrow: { name: 'Blackburrow',        x: 330, y: 225 },
    qrg:         { name: 'Surefall Glade',     x: 240, y: 225 },
    qeytoqrg:    { name: 'Qeynos Hills',       x: 300, y: 275 },
    qeynos2:     { name: 'North Qeynos',       x: 230, y: 320 },
    qeynos:      { name: 'South Qeynos',       x: 230, y: 365 },
    qcat:        { name: 'Qeynos Aqueducts',   x: 300, y: 395 },

    // --- Karanas ---
    qey2hh1:     { name: 'West Karana',        x: 400, y: 320 },
    northkarana: { name: 'North Karana',       x: 490, y: 300 },
    eastkarana:  { name: 'East Karana',        x: 585, y: 300 },
    southkarana: { name: 'South Karana',       x: 490, y: 380 },
    paw:         { name: 'Splitpaw',           x: 420, y: 415 },
    lakerathe:   { name: 'Lake Rathetear',     x: 500, y: 450 },
    arena:       { name: 'Arena',              x: 425, y: 470 },
    rathemtn:    { name: 'Rathe Mountains',    x: 520, y: 510 },
    gorge:       { name: "Beholder's Maze",    x: 650, y: 260 },
    runnyeye:    { name: 'Runnyeye',           x: 680, y: 315 },
    misty:       { name: 'Misty Thicket',      x: 745, y: 340 },
    rivervale:   { name: 'Rivervale',          x: 745, y: 290 },
    highpass:    { name: 'Highpass Hold',      x: 660, y: 210 },
    highkeep:    { name: 'High Keep',          x: 720, y: 185 },
    kithicor:    { name: 'Kithicor Forest',    x: 780, y: 240 },

    // --- Antonica: east (Freeport side) ---
    commons:     { name: 'West Commonlands',   x: 800, y: 300 },
    befallen:    { name: 'Befallen',           x: 770, y: 355 },
    ecommons:    { name: 'East Commonlands',   x: 870, y: 320 },
    nektulos:    { name: 'Nektulos Forest',    x: 880, y: 240 },
    neriaka:     { name: 'Neriak Foreign Q.',  x: 950, y: 200 },
    neriakb:     { name: 'Neriak Commons',     x: 1010, y: 215 },
    neriakc:     { name: 'Neriak Third Gate',  x: 1010, y: 170 },
    lavastorm:   { name: 'Lavastorm',          x: 950, y: 145 },
    soldunga:    { name: "Solusek's Eye",      x: 1010, y: 105 },
    soldungb:    { name: "Nagafen's Lair",     x: 950, y: 85 },
    najena:      { name: 'Najena',             x: 890, y: 105 },
    soltemple:   { name: 'Temple of Sol Ro',   x: 1035, y: 140 },
    freportw:    { name: 'West Freeport',      x: 930, y: 355 },
    freportn:    { name: 'North Freeport',     x: 985, y: 330 },
    freporte:    { name: 'East Freeport',      x: 990, y: 375 },

    // --- Antonica: desert & south ---
    nro:         { name: 'North Ro',           x: 900, y: 420 },
    oasis:       { name: 'Oasis of Marr',      x: 880, y: 475 },
    sro:         { name: 'South Ro',           x: 850, y: 530 },
    innothule:   { name: 'Innothule Swamp',    x: 740, y: 560 },
    grobb:       { name: 'Grobb',              x: 800, y: 600 },
    guktop:      { name: 'Upper Guk',          x: 690, y: 610 },
    gukbottom:   { name: 'Lower Guk',          x: 740, y: 645 },
    feerrott:    { name: 'The Feerrott',       x: 620, y: 560 },
    cazicthule:  { name: 'Cazic-Thule',        x: 560, y: 605 },
    oggok:       { name: 'Oggok',              x: 620, y: 620 },

    // --- Ocean & Faydwer ---
    oot:         { name: 'Ocean of Tears',     x: 1120, y: 375 },
    butcher:     { name: 'Butcherblock',       x: 1250, y: 350 },
    kaladima:    { name: 'South Kaladim',      x: 1210, y: 290 },
    kaladimb:    { name: 'North Kaladim',      x: 1265, y: 275 },
    cauldron:    { name: "Dagnor's Cauldron",  x: 1230, y: 430 },
    kedge:       { name: 'Kedge Keep',         x: 1175, y: 465 },
    unrest:      { name: 'Estate of Unrest',   x: 1290, y: 470 },
    gfaydark:    { name: 'Greater Faydark',    x: 1340, y: 350 },
    crushbone:   { name: 'Crushbone',          x: 1340, y: 285 },
    felwithea:   { name: 'North Felwithe',     x: 1425, y: 330 },
    felwitheb:   { name: 'South Felwithe',     x: 1470, y: 355 },
    lfaydark:    { name: 'Lesser Faydark',     x: 1360, y: 440 },
    mistmoore:   { name: 'Castle Mistmoore',   x: 1300, y: 510 },
    steamfont:   { name: 'Steamfont',          x: 1430, y: 480 },
    akanon:      { name: "Ak'Anon",            x: 1470, y: 530 },

    // --- Odus (far west) ---
    erudnext:    { name: 'Erudin',             x: 90,  y: 330 },
    erudnint:    { name: 'Erudin Palace',      x: 90,  y: 285 },
    erudsxing:   { name: "Erud's Crossing",    x: 160, y: 365 },
    tox:         { name: 'Toxxulia Forest',    x: 90,  y: 400 },
    kerraridge:  { name: 'Kerra Isle',         x: 35,  y: 430 },
    paineel:     { name: 'Paineel',            x: 130, y: 460 },
    hole:        { name: 'The Hole',           x: 130, y: 510 },
    warrens:     { name: 'The Warrens',        x: 60,  y: 490 },
    stonebrunt:  { name: 'Stonebrunt',         x: 60,  y: 545 }
  };

  // [from, to, type]  type: 0 walk, 1 boat, 2 portal/click
  const E = [
    ['halas', 'everfrost'], ['everfrost', 'permafrost'], ['everfrost', 'blackburrow'],
    ['blackburrow', 'qeytoqrg'], ['qeytoqrg', 'qrg'], ['qeytoqrg', 'qeynos2'],
    ['qeynos2', 'qeynos'], ['qeynos', 'qcat'], ['qeynos2', 'qcat'], ['qeytoqrg', 'qey2hh1'],
    ['qey2hh1', 'northkarana'], ['northkarana', 'eastkarana'], ['northkarana', 'southkarana'],
    ['southkarana', 'paw'], ['southkarana', 'lakerathe'], ['lakerathe', 'arena'],
    ['lakerathe', 'rathemtn'], ['rathemtn', 'feerrott'], ['eastkarana', 'gorge'],
    ['gorge', 'runnyeye'], ['runnyeye', 'misty'], ['misty', 'rivervale'],
    ['rivervale', 'kithicor'], ['eastkarana', 'highpass'], ['highpass', 'highkeep'],
    ['highpass', 'kithicor'], ['kithicor', 'commons'], ['commons', 'befallen'],
    ['commons', 'ecommons'], ['ecommons', 'nektulos'], ['nektulos', 'neriaka'],
    ['neriaka', 'neriakb'], ['neriakb', 'neriakc'], ['nektulos', 'lavastorm'],
    ['lavastorm', 'soldunga'], ['lavastorm', 'soldungb'], ['lavastorm', 'najena'],
    ['lavastorm', 'soltemple'], ['ecommons', 'freportw'], ['freportw', 'freportn'],
    ['freportw', 'freporte'], ['freportn', 'freporte'], ['ecommons', 'nro'],
    ['nro', 'freporte'], ['nro', 'oasis'], ['oasis', 'sro'], ['sro', 'innothule'],
    ['innothule', 'grobb'], ['innothule', 'guktop'], ['guktop', 'gukbottom'],
    ['innothule', 'feerrott'], ['feerrott', 'cazicthule'], ['feerrott', 'oggok'],
    ['feerrott', 'fearplane', 2],
    ['freporte', 'oot', 1], ['oot', 'butcher', 1],
    ['butcher', 'kaladima'], ['kaladima', 'kaladimb'], ['butcher', 'gfaydark'],
    ['butcher', 'cauldron'], ['cauldron', 'kedge'], ['cauldron', 'unrest'],
    ['gfaydark', 'crushbone'], ['gfaydark', 'felwithea'], ['felwithea', 'felwitheb'],
    ['gfaydark', 'lfaydark'], ['lfaydark', 'mistmoore'], ['lfaydark', 'steamfont'],
    ['steamfont', 'akanon'],
    ['qeynos', 'erudsxing', 1], ['erudsxing', 'erudnext', 1],
    ['erudnext', 'erudnint'], ['erudnext', 'tox'], ['tox', 'kerraridge'],
    ['tox', 'paineel'], ['paineel', 'hole'], ['paineel', 'warrens'],
    ['warrens', 'stonebrunt']
  ];

  const CONTINENTS = [
    { x: 500, y: 690, label: 'ANTONICA' },
    { x: 1340, y: 610, label: 'FAYDWER' },
    { x: 95, y: 610, label: 'ODUS' },
    { x: 760, y: 25, label: 'THE PLANES' }
  ];

  // adjacency for routing
  const ADJ = {};
  for (const short of Object.keys(N)) ADJ[short] = [];
  for (const [a, b, t] of E) {
    ADJ[a].push({ to: b, type: t || 0 });
    ADJ[b].push({ to: a, type: t || 0 });
  }

  // BFS shortest route (fewest zone lines)
  function route(from, to) {
    if (!N[from] || !N[to]) return null;
    const prev = { [from]: null };
    const q = [from];
    while (q.length) {
      const cur = q.shift();
      if (cur === to) break;
      for (const e of ADJ[cur]) {
        if (!(e.to in prev)) { prev[e.to] = { from: cur, type: e.type }; q.push(e.to); }
      }
    }
    if (!(to in prev)) return null;
    const path = [];
    let cur = to;
    while (cur) {
      const p = prev[cur];
      path.unshift({ short: cur, via: p ? p.type : 0 });
      cur = p ? p.from : null;
    }
    return path;
  }

  return { nodes: N, edges: E, continents: CONTINENTS, route };
});
