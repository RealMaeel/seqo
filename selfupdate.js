// SEQO - one-click update (main process, v2.7): download the new installer from
// the GitHub release and check it before main.js starts it.
//   - only from https://github.com/<repo>/releases/download/… (the release's own
//     Setup asset; GitHub redirects that to its download host)
//   - the file must be exactly the size GitHub lists, and match GitHub's SHA-256
//     digest when the release has one
//   - saved in the temp folder, never next to SEQO itself
// The Windows "unknown publisher" prompt still appears until SEQO is code-signed.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// deps: fetchImpl (global fetch), tempDir() -> folder for the download,
//       onProgress({ pct, got, total }) — optional
function create({ fetchImpl = (...a) => fetch(...a), tempDir, onProgress = () => {} }) {
  function checkInfo(info, repo) {
    if (!info || !info.setupUrl) return 'this release has no installer to download';
    const want = 'https://github.com/' + repo + '/releases/download/';
    if (!String(info.setupUrl).toLowerCase().startsWith(want.toLowerCase())) return 'the installer link is not from ' + repo + '\'s releases';
    if (!/^SEQO-Setup-[\w.-]+\.exe$/.test(info.setupName || '')) return 'unexpected installer name: ' + (info.setupName || '?');
    if (!(info.setupSize > 0)) return 'GitHub did not say how big the installer is';
    return null;
  }

  async function download(info, repo) {
    const bad = checkInfo(info, repo);
    if (bad) throw new Error(bad);
    const dir = path.join(tempDir(), 'SEQO-update');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, info.setupName);
    const part = file + '.part';
    try { fs.unlinkSync(part); } catch { /* none */ }
    const res = await fetchImpl(info.setupUrl, { headers: { 'User-Agent': 'SEQO-updater', Accept: 'application/octet-stream' } });
    if (!res.ok || !res.body) throw new Error('download failed: HTTP ' + res.status);
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(part);
    let got = 0, lastPct = -1;
    try {
      for await (const chunk of res.body) {
        const buf = Buffer.from(chunk);
        got += buf.length;
        if (got > info.setupSize) throw new Error('the download is bigger than GitHub said — stopped');
        hash.update(buf);
        if (!out.write(buf)) await new Promise((r) => out.once('drain', r));
        const pct = Math.floor(got / info.setupSize * 100);
        if (pct !== lastPct) { lastPct = pct; onProgress({ pct, got, total: info.setupSize }); }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    } catch (e) {
      out.destroy();
      try { fs.unlinkSync(part); } catch { /* ok */ }
      throw e;
    }
    if (got !== info.setupSize) { try { fs.unlinkSync(part); } catch { /* ok */ } throw new Error('the download was cut short (' + got + ' of ' + info.setupSize + ' bytes)'); }
    const digest = hash.digest('hex');
    const want = /^sha256:([0-9a-f]{64})$/i.exec(info.setupDigest || '');
    if (want && want[1].toLowerCase() !== digest) {
      try { fs.unlinkSync(part); } catch { /* ok */ }
      throw new Error('the download does not match GitHub\'s checksum — not starting it');
    }
    try { fs.unlinkSync(file); } catch { /* none */ }
    fs.renameSync(part, file);
    return { file, sha256: digest, verified: !!want };
  }

  return { download, checkInfo };
}

module.exports = { create };
