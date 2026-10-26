// gameexports.js: /outputfile discovery + parsers + the Personal-Depot carry.
const fs = require('fs'), os = require('os'), path = require('path');
const ge = require('../gameexports.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-ge-'));
fs.mkdirSync(path.join(root, 'Logs'));
const logPath = path.join(root, 'Logs', 'eqlog_Maeel_neriak.txt');
fs.writeFileSync(logPath, '');
const w = (name, text, ageMs = 0) => {
  const p = path.join(root, name); fs.writeFileSync(p, text);
  const t = new Date(Date.now() - ageMs); fs.utimesSync(p, t, t); return p;
};

// pure helpers
ok(ge.gameRootFromLog(logPath) === root, 'game root is one level above Logs');
ok(ge.gameRootFromLog(path.join(root, 'eqlog_X_y.txt')) === root, 'a log outside Logs\\ uses its own folder');
ok(JSON.stringify(ge.charServerFromLog(logPath)) === '{"name":"Maeel","server":"neriak"}', 'name + server from the log name');
ok(ge.charServerFromLog('notalog.txt') === null, 'not a log name');

const INV_DEPOT = 'Location\tName\tID\tCount\tSlots\r\n' +
  'General1\tBone Chips\t13073\t12\t0\r\nGeneral2\tEmpty\t0\t0\t0\r\nPersonal-Depot1\tShadowed Scepter Frame\t555\t2\t0\r\n' +
  'Bank1\tBone Chips\t13073\t3\t0\r\nSharedBank1\tRat Whiskers\t1\t1\t0\r\nCharm\tAmulet of Necropotence\t9\t1\t0\r\n' +
  'KeyRing\tName\tID\t\r\nAugmentation\tGolem Metal Wand (Exaltation)\t14313\r\nEquipment\tStored Sword\t88\r\n';
const INV_FIELD = 'Location\tName\tID\tCount\tSlots\r\nGeneral1\tBone Chips\t13073\t5\t0\r\n';
const ACH = 'Slayer\r\nI\tVermin Exterminator\r\nI\t\tRats slain\t1,187/5,000\r\nC\tFirst Blood\r\nC\t\tKill anything\r\n';
const FAC = 'ID\tName\tStandingValue\tPointsToMax\r\n281\tKnights of Truth\t-500\t2500\r\n5\tBroken\tx\t1\r\n';
const BOOK = '1\tSiphon Strength\r\n9\tLifespike\r\nbad line\r\n';

w('Maeel_neriak-Inventory.txt', INV_DEPOT, 60000);
w('Maeel_neriak-Achievements.txt', ACH);
w('Maeel_neriak-SHD-Factions.txt', FAC, 90000);
w('Maeel_neriak-BRD-Factions.txt', FAC.replace('-500', '100'));   // newer file wins
w('Maeel_neriak-SHD-Spellbook.txt', BOOK);
w('Someoneelse_neriak-Inventory.txt', INV_FIELD);                 // other character: ignored

const settings = { logPath };
const gameDB = {};
let saves = 0; const sent = [];
const g = ge.create({ getSettings: () => settings, getGameDB: () => gameDB, saveGameDBSoon: () => saves++,
  getWin: () => ({ webContents: { send: (c, p) => sent.push([c, p]) } }) });

const found = g.discoverOutputFiles();
ok(found.root === root && found.prefix === 'maeel_neriak', 'discover root + prefix');
ok(/BRD-Factions/.test(found.factions), 'the newer factions file is picked: ' + found.factions);
ok(!/Someoneelse/.test(found.inventory || ''), 'another character\'s file is ignored');

g.refreshGameData(true);
const inv = g.gameData.inventory;
ok(inv.items['bone chips'].count === 15 && inv.items['bone chips'].by.bags === 12 && inv.items['bone chips'].by.bank === 3, 'counts by bucket');
ok(inv.items['shadowed scepter frame'].by.depot === 2, 'depot bucket');
ok(inv.items['rat whiskers'].by.shared === 1 && inv.items['amulet of necropotence'].by.worn === 1, 'shared bank + worn');
ok(inv.keyring.includes('Golem Metal Wand (Exaltation)') && inv.items['stored sword'].by.stored === 1, 'key ring + storage gear tab');
ok(!inv.items['empty'], 'Empty slots skipped');
ok(gameDB.lastDepot && gameDB.lastDepot.items['shadowed scepter frame'].count === 2 && saves === 1, 'an export with the depot is remembered');
ok(g.gameData.factions.factions['Knights of Truth'].value === 100 && !g.gameData.factions.factions.Broken, 'factions');
const vermin = g.gameData.achievements.sections[0].achievements[0];
ok(vermin.name === 'Vermin Exterminator' && !vermin.done && vermin.objectives[0].cur === 1187 && vermin.objectives[0].max === 5000, 'achievement progress column');
ok(g.gameData.achievements.sections[0].achievements[1].done === true, 'completed achievement');
ok(g.gameData.spellbook.spells.Lifespike === 9 && Object.keys(g.gameData.spellbook.spells).length === 2, 'spellbook');
ok(sent.length === 1 && sent[0][0] === 'gamedata-updated' && sent[0][1].spellbook === true, 'overlay notified');

// a newer export made away from the banker has no depot section: carry the last one
w('Maeel_neriak-Inventory.txt', INV_FIELD);
g.refreshGameData(false);
const inv2 = g.gameData.inventory;
ok(inv2.items['shadowed scepter frame'] && inv2.items['shadowed scepter frame'].by.depot === 2, 'depot carried into a field export');
ok(inv2.items['shadowed scepter frame'].locs.includes('Personal-Depot (carried)') && inv2.depotCarried, 'carried copy is marked');
ok(inv2.items['bone chips'].count === 5, 'field counts are the new ones');
ok(sent.length === 1, 'notify=false sends nothing');

// no log picked: nothing to discover
settings.logPath = '';
ok(g.discoverOutputFiles() === null, 'no log, no files');

fs.rmSync(root, { recursive: true, force: true });
console.log(`gameexports: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
