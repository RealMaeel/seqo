// tests for communityupload.js (3.0: sending the local community data)
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { create } = require('../communityupload.js');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seqo-up-'));
  const cdir = path.join(tmp, 'community');
  fs.mkdirSync(cdir);
  const T = new Date(2026, 10, 5, 17, 0).getTime();
  const line = (i) => JSON.stringify({ r: 'k', z: 'Permafrost Keep', m: 'an ice goblin', t: T + i * 1000 }) + '\n';
  fs.writeFileSync(path.join(cdir, '2026-10.jsonl'), Array.from({ length: 1500 }, (_, i) => line(i)).join(''));
  fs.writeFileSync(path.join(cdir, '2026-11.jsonl'), line(2000) + line(2001) + '{"r":"k","z":"half');   // a half-written last line

  let settings = {};
  const sent = [];
  let fail = null;
  const fetchImpl = async (url, opt) => {
    if (fail === 'offline') throw new Error('ENOTFOUND');
    if (fail) return { ok: false, status: fail };
    sent.push(JSON.parse(opt.body));
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const up = create({ dir: tmp, getSettings: () => settings, saveSettings: (p) => { settings = { ...settings, ...p }; }, server: 'https://x.workers.dev', appVersion: '3.0.0', fetchImpl });

  // nothing goes out until the player says yes
  assert.deepStrictEqual(await up.run(), { sent: 0, records: 0, skipped: true });
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(settings.communityInstall, undefined, 'no ID is even made before yes');
  // the preview shows what would go out
  const pv = up.preview();
  assert.strictEqual(pv.total, 1502);
  assert.ok(pv.sample.includes('"made when you say yes"') || pv.sample.includes('(made when you say yes)'));

  settings.communityShare = true;
  // offline: nothing is lost, the next run sends it
  fail = 'offline';
  let r = await up.run();
  assert.ok(r.error && r.error.includes('offline'));
  assert.strictEqual(up.status().waiting, 1502);
  fail = null;
  r = await up.run();
  assert.deepStrictEqual([r.sent, r.records], [3, 1502], '1,000 + 500 from October, 2 from November (the half line waits)');
  assert.strictEqual(sent[0].records.length, 1000);
  assert.strictEqual(sent[0].schema, 1);
  assert.match(sent[0].install, /^[0-9a-f]{8}-[0-9a-f]{4}-4/);
  assert.strictEqual(sent[0].app, '3.0.0');
  assert.deepStrictEqual(Object.keys(sent[0]).sort(), ['app', 'install', 'records', 'schema'], 'nothing else goes out');
  assert.strictEqual(up.status().waiting, 0);

  // nothing is sent twice; new lines (and the finished half line) go next time
  fs.appendFileSync(path.join(cdir, '2026-11.jsonl'), 'x"}\n' + line(3000));
  r = await up.run();
  assert.deepStrictEqual([r.sent, r.records], [1, 2], 'the half line once finished, and the new one (the server drops what makes no sense)');
  r = await up.run();
  assert.deepStrictEqual([r.sent, r.records], [0, 0]);

  // a busy server (daily limit) pauses without losing anything
  fs.appendFileSync(path.join(cdir, '2026-11.jsonl'), line(4000));
  fail = 429;
  r = await up.run();
  assert.ok(r.error.includes('daily limit'));
  fail = null;
  assert.ok((await up.run()).error.includes('paused'));
  r = await up.run({ force: true });
  assert.strictEqual(r.records, 1);

  // a batch the server refuses outright (400) is skipped, not retried forever — the next one still goes
  fs.appendFileSync(path.join(cdir, '2026-11.jsonl'), line(4500));
  fail = 400;
  r = await up.run({ force: true });
  assert.ok(up.status().error.includes('refused') && up.status().waiting === 0, 'skipped: ' + up.status().error);
  fail = null;
  fs.appendFileSync(path.join(cdir, '2026-11.jsonl'), line(4600));
  r = await up.run({ force: true });
  assert.strictEqual(r.records, 1, 'uploads carry on after a refused one');

  // saying no stops it; a new ID is a different random UUID
  const id = settings.communityInstall;
  assert.notStrictEqual(up.resetId(), id);
  settings.communityShare = false;
  fs.appendFileSync(path.join(cdir, '2026-11.jsonl'), line(5000));
  assert.ok((await up.run()).skipped);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('communityupload tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
