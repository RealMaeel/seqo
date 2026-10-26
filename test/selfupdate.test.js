// selfupdate.js: the one-click update download and its checks (GitHub faked).
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const SU = require('../selfupdate.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

const payload = crypto.randomBytes(300000);
const sha = crypto.createHash('sha256').update(payload).digest('hex');
const REPO = 'RealMaeel/seqo';
const good = { setupUrl: 'https://github.com/RealMaeel/seqo/releases/download/v2.7.0/SEQO-Setup-2.7.0.exe',
  setupName: 'SEQO-Setup-2.7.0.exe', setupSize: payload.length, setupDigest: 'sha256:' + sha };
const fakeFetch = (bytes, status = 200) => async () => ({ ok: status === 200, status,
  body: (async function* () { for (let i = 0; i < bytes.length; i += 65536) yield bytes.subarray(i, i + 65536); })() });

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-su-'));
  const prog = [];
  let su = SU.create({ fetchImpl: fakeFetch(payload), tempDir: () => tmp, onProgress: (p) => prog.push(p.pct) });
  const r = await su.download(good, REPO);
  ok(r.verified && r.sha256 === sha && fs.readFileSync(r.file).equals(payload), 'downloaded, size + SHA-256 checked');
  ok(r.file === path.join(tmp, 'SEQO-update', 'SEQO-Setup-2.7.0.exe') && !fs.existsSync(r.file + '.part'), 'saved in the temp folder, no leftover .part');
  ok(prog[prog.length - 1] === 100 && prog.length > 3, 'progress reported');

  su = SU.create({ fetchImpl: fakeFetch(payload), tempDir: () => tmp });
  ok((await su.download({ ...good, setupDigest: null }, REPO)).verified === false, 'no digest on the release: size check only');

  const fails = async (label, info, fetchImpl, re) => {
    const s = SU.create({ fetchImpl, tempDir: () => tmp });
    try { await s.download(info, REPO); ok(false, label + ' should fail'); }
    catch (e) { ok(re.test(e.message), label + ': ' + e.message); }
    ok(!fs.existsSync(path.join(tmp, 'SEQO-update', (info.setupName || 'x') + '.part')), label + ': no partial file left');
  };
  const bad = Buffer.from(payload); bad[5] ^= 1;
  await fails('tampered file', good, fakeFetch(bad), /checksum/);
  await fails('cut short', good, fakeFetch(payload.subarray(0, 1000)), /cut short/);
  await fails('too big', good, fakeFetch(Buffer.concat([payload, Buffer.alloc(10)])), /bigger/);
  await fails('HTTP error', good, fakeFetch(payload, 404), /HTTP 404/);
  await fails('link from somewhere else', { ...good, setupUrl: 'https://evil.example/SEQO-Setup-2.7.0.exe' }, fakeFetch(payload), /not from/);
  await fails('another repo', { ...good, setupUrl: 'https://github.com/someone/seqo/releases/download/v1/SEQO-Setup-2.7.0.exe' }, fakeFetch(payload), /not from/);
  await fails('odd file name', { ...good, setupName: '..\\..\\evil.exe' }, fakeFetch(payload), /unexpected installer name/);
  await fails('no size', { ...good, setupSize: 0 }, fakeFetch(payload), /how big/);
  await fails('no installer', { setupUrl: null }, fakeFetch(payload), /no installer/);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`selfupdate: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
