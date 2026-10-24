// Game-file sync tests: real files in a temp folder, no Electron needed.
// Run: npm test
const fs = require('fs'), os = require('os'), path = require('path');
const { create } = require('../gamesync.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('FAIL  ' + msg); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-sync-'));
const local = path.join(root, 'game'), shared = path.join(root, 'cloud');
fs.mkdirSync(local); fs.mkdirSync(shared);
const write = (p, text, ageSec) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  const t = new Date(Date.now() - ageSec * 1000); fs.utimesSync(p, t, t);
};
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
const G = (f) => path.join(shared, 'gamefiles', f);

let settings = { dataDir: shared, syncFiles: [] };
let saves = 0;
const sync = create({ getSettings: () => settings, saveSettings: () => { saves++; }, dataDir: () => settings.dataDir, getWin: () => null });
const run = (files) => { settings = { ...settings, syncFiles: files }; return sync.syncGameFiles(); };

// no shared folder -> clear error, nothing touched
settings = { syncFiles: [] };
ok(/shared data folder/.test(sync.syncGameFiles().error || ''), 'no dataDir gives an error');
settings = { dataDir: shared, syncFiles: [] };

// local only -> seeded to shared, mtime preserved
write(path.join(local, 'a.ini'), 'A1', 100);
let r = run([path.join(local, 'a.ini')]);
ok(read(G('a.ini')) === 'A1' && r.results[0].includes('seeded'), 'local-only file is seeded to shared');
ok(Math.abs(fs.statSync(G('a.ini')).mtimeMs - fs.statSync(path.join(local, 'a.ini')).mtimeMs) < 1000, 'seeded copy keeps the mtime');

// second run converges
r = run([path.join(local, 'a.ini')]);
ok(r.results[0].includes('in sync'), 'second run reports in sync');

// local newer -> shared overwritten, shared backed up (v2.5.2 behaviour)
write(path.join(local, 'a.ini'), 'A2', 10);
r = run([path.join(local, 'a.ini')]);
ok(read(G('a.ini')) === 'A2', 'newer local wins');
ok(read(G('a.ini') + '.seqo.bak') === 'A1', 'shared copy backed up before overwrite');

// shared newer -> local overwritten, local backed up
write(G('a.ini'), 'A3', 1);
r = run([path.join(local, 'a.ini')]);
ok(read(path.join(local, 'a.ini')) === 'A3' && r.results[0].includes('← shared'), 'newer shared wins');
ok(read(path.join(local, 'a.ini.seqo.bak')) === 'A2', 'local copy backed up before overwrite');

// shared only -> pulled
write(G('b.ini'), 'B', 50);
r = run([path.join(local, 'b.ini')]);
ok(read(path.join(local, 'b.ini')) === 'B' && r.results[0].includes('pulled'), 'shared-only file is pulled');

// neither side -> warning, no crash
r = run([path.join(local, 'nope.ini')]);
ok(r.results[0].includes('missing on both sides'), 'missing both sides warns');

// folder sync: union of both sides, nested files, backups never travel
write(path.join(local, 'skin', 'one.xml'), '1', 100);
write(path.join(local, 'skin', 'sub', 'two.xml'), '2', 100);
write(path.join(local, 'skin', 'old.xml.seqo.bak'), 'bak', 100);
write(G(path.join('folders', 'skin', 'three.xml')), '3', 100);
r = run([path.join(local, 'skin')]);
ok(read(G(path.join('folders', 'skin', 'one.xml'))) === '1', 'folder: local file pushed');
ok(read(G(path.join('folders', 'skin', 'sub', 'two.xml'))) === '2', 'folder: nested file pushed');
ok(read(path.join(local, 'skin', 'three.xml')) === '3', 'folder: shared file pulled');
ok(!fs.existsSync(G(path.join('folders', 'skin', 'old.xml.seqo.bak'))), 'folder: .seqo.bak files are not synced');
ok(r.results[0].startsWith('📁 skin'), 'folder: summary line');

// status: lastSync recorded on the CURRENT settings object, marker written
const before = saves;
r = run([path.join(local, 'a.ini')]);
ok(saves === before + 1 && settings.lastSync && settings.lastSync.host === os.hostname(), 'lastSync saved on current settings');
ok(JSON.parse(read(G('sync-marker.json'))).host === os.hostname(), 'sync marker names this computer');

// marker from another computer + a pull -> summary says where the data came from
fs.writeFileSync(G('sync-marker.json'), JSON.stringify({ host: 'OTHER-PC', at: 123 }));
write(path.join(local, 'a.ini'), 'A3', 100);
write(G('a.ini'), 'A4', 0);
r = run([path.join(local, 'a.ini')]);
ok(r.summary.pulled === 1 && r.summary.from && r.summary.from.host === 'OTHER-PC', 'summary credits the other computer');

fs.rmSync(root, { recursive: true, force: true });
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
