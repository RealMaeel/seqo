// errorlog.js: the error log behind "📋 Copy problem report".
const fs = require('fs'), os = require('os'), path = require('path');
const el = require('../errorlog.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-el-'));
const home = 'C:\\Users\\Ed';
let clock = Date.UTC(2026, 9, 24, 12, 0, 0);
const log = el.create({ dir: () => dir, home, now: () => clock });

log.record('overlay', "Uncaught TypeError: Cannot read properties of undefined (reading 'x')", 'file:///C:/Users/Ed/AppData/Local/Programs/SEQO/resources/app.asar/ui/overlay/24-meter.js:12');
ok(log.recent().length === 1, 'recorded');
ok(!/Users\/Ed|Users\\Ed/i.test(JSON.stringify(log.recent())) && /%USERPROFILE%/.test(log.recent()[0].at), 'user folder redacted: ' + log.recent()[0].at);

// the same error in a loop is one entry with a count
for (let i = 0; i < 30; i++) { clock += 100; log.record('overlay', "Uncaught TypeError: Cannot read properties of undefined (reading 'x')", 'file:///C:/Users/Ed/AppData/Local/Programs/SEQO/resources/app.asar/ui/overlay/24-meter.js:12'); }
ok(log.recent().length === 1 && log.recent()[0].n === 31, 'repeats folded: ' + log.recent()[0].n);
clock += 120000;
log.record('overlay', "Uncaught TypeError: Cannot read properties of undefined (reading 'x')", 'file:///C:/Users/Ed/AppData/Local/Programs/SEQO/resources/app.asar/ui/overlay/24-meter.js:12');
ok(log.recent().length === 2, 'the same error much later is a new entry');
log.record('main', 'outputfile watch failed: EPERM C:\\Users\\Ed\\EQ', null);
ok(log.recent()[2].msg === 'outputfile watch failed: EPERM %USERPROFILE%\\EQ', 'backslash paths redacted');

// survives a restart (read back from disk), torn lines skipped
log.flush();
fs.appendFileSync(log.file(), '{"t":1,"src":"x","msg":"tor');
const again = el.create({ dir: () => dir, home, now: () => clock });
ok(again.recent().length === 3, 'read back after restart, torn line skipped');

// cap
const big = el.create({ dir: () => fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-el2-')), now: () => clock });
for (let i = 0; i < 400; i++) big.record('main', 'error ' + i);
ok(big.recent(1000).length <= 350 && big.recent(1)[0].msg === 'error 399', 'capped, newest kept');

// report
const report = again.buildReport({
  version: '2.7.0', electron: '43.7.9', chrome: '140', node: '22', os: 'Windows 11 (10.0.26100)', locale: 'en-US',
  extras: { 'Log file': 'C:\\Users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends\\Logs\\eqlog_Maeel_neriak.txt', 'Data folder': 'C:\\Users\\Ed\\Dropbox\\SEQO' },
  settings: { opacity: 0.85, locked: false, wikiUser: 'Maeel', wikiPass: 'hunter2', wikiPassEnc: 'AAAA', text: 'my private notes', githubToken: 'ghp_x',
              logPath: 'C:\\Users\\Ed\\x\\eqlog_Maeel_neriak.txt', mutedAlerts: ['a', 'b'], customAlerts: [{}, {}, {}], bounds: { x: 1 }, lastSync: { at: 1, n: 2 } }
});
ok(/SEQO 2\.7\.0 · Electron 43\.7\.9/.test(report), 'versions in the report');
ok(!/hunter2|AAAA|my private notes|ghp_x|Maeel"|wikiUser/.test(report), 'no passwords, tokens, notes or wiki user');
ok(/eqlog_Maeel_neriak\.txt/.test(report) && /%USERPROFILE%\\Dropbox/.test(report) && !/Users\\Ed/i.test(report), 'paths kept but the user folder redacted');
ok(/mutedAlerts = \[2 items\]/.test(report) && /customAlerts = \[3 items\]/.test(report) && /lastSync = \{2 keys\}/.test(report), 'lists summarized, not dumped');
ok(/×31/.test(report) && /Recent errors \(3\)/.test(report), 'errors with repeat counts');
ok(!/bounds/.test(report), 'window position left out');

again.clear();
ok(again.recent().length === 0 && !fs.existsSync(again.file()), 'clear');
ok(/none recorded/.test(again.buildReport({})), 'empty report says so');

fs.rmSync(dir, { recursive: true, force: true });
// which SEQO file the error came from (2.7)
{
  const app = 'C:\\Users\\Ed\\AppData\\Local\\Programs\\SEQO\\resources\\app.asar';
  ok(el.moduleOf('TypeError: x\n    at Object.recordKill (' + app + '\\lootdb.js:88:12)\n    at IpcMainImpl.<anonymous> (' + app + '\\main.js:1696:60)') === 'lootdb.js:88 (Object.recordKill)', 'main stack → first SEQO frame + function');
  ok(el.moduleOf('file:///C:/Users/Ed/AppData/Local/Programs/SEQO/resources/app.asar/ui/overlay/24-meter.js:120') === 'ui/overlay/24-meter.js:120', 'page console source → ui file');
  ok(el.moduleOf('    at renderTargetChips (file:///C:/test_seqo/_v2.7/ui/overlay/24-meter.js:120:5)', 'C:\\test_seqo\\_v2.7') === 'ui/overlay/24-meter.js:120 (renderTargetChips)', 'dev build path');
  ok(el.moduleOf('    at x (node:internal/process/task_queues:95:5)\n    at y (C:\\a\\node_modules\\foo\\index.js:1:1)') === '', 'Node internals / node_modules are not SEQO');
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-el2-'));
  const l2 = el.create({ dir: () => d2, home, now: () => clock });
  for (let i = 0; i < 3; i++) { clock += 61000; l2.record('overlay', 'boom ' + i, 'file:///C:/x/app.asar/ui/overlay/24-meter.js:' + (100 + i)); }
  l2.record('main', 'bad db', 'Error: bad db\n    at load (' + 'C:\\x\\app.asar\\lootdb.js:40:3)');
  const rep = l2.buildReport({ version: '2.7.0' });
  ok(/Errors by module:\n  overlay · ui\/overlay\/24-meter\.js  ×3\n  main · lootdb\.js  ×1/.test(rep), 'report starts with errors per module: ' + rep.slice(0, 400));
  ok(/\] overlay · ui\/overlay\/24-meter\.js:102: boom 2/.test(rep) && /\] main · lootdb\.js:40 \(load\): bad db/.test(rep), 'each error names its module');
}

console.log(`errorlog: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
