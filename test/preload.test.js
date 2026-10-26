// The overlay page's IPC gate (preload.js): replies and events wait until the
// ui/*.js files have all loaded (DOMContentLoaded), other pages are untouched.
const Module = require('module');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

function load(pathname) {
  const handlers = {}, listeners = {};
  let exposed = null;
  const electron = {
    contextBridge: { exposeInMainWorld: (_n, api) => { exposed = api; } },
    ipcRenderer: {
      invoke: (ch) => Promise.resolve('reply:' + ch),
      send: () => undefined,
      on: (ch, h) => { handlers[ch] = h; return 'registered'; }
    }
  };
  global.location = { pathname };
  global.window = { addEventListener: (ev, fn) => { listeners[ev] = fn; } };
  const orig = Module._load;
  Module._load = function (req, ...rest) { return req === 'electron' ? electron : orig.call(this, req, ...rest); };
  const file = path.join(__dirname, '..', 'preload.js');
  delete require.cache[require.resolve(file)];
  try { require(file); } finally { Module._load = orig; }
  return { api: exposed, handlers, fire: (ev) => listeners[ev] && listeners[ev]() };
}

(async () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));

  // overlay page: gated until DOMContentLoaded
  const o = load('/C:/SEQO/resources/app.asar/overlay.html');
  const got = [];
  o.api.getLootDB().then((v) => got.push('db ' + v));
  o.api.onLogLines((lines) => got.push('lines ' + lines));
  await tick();                       // the reply comes in first…
  o.handlers['log-lines']({}, 'a');   // …then an event
  ok(o.api.updateSettings({ x: 1 }) === undefined, 'send passes straight through');
  await tick();
  ok(got.length === 0, 'nothing reaches the page before the files have loaded: ' + got);
  o.fire('DOMContentLoaded');
  await tick();
  ok(got.join('|') === 'db reply:get-loot-db|lines a', 'queued reply and event arrive after load, in order: ' + got);
  o.handlers['log-lines']({}, 'b');
  ok(got[got.length - 1] === 'lines b', 'after load, events are delivered synchronously');
  const p = o.api.getLootDB();
  ok(await p === 'reply:get-loot-db', 'after load, replies pass through unchanged');

  // the other way round: an event that came in before a reply stays first
  const o2 = load('/C:/SEQO/resources/app.asar/overlay.html');
  const g2 = [];
  o2.api.onLogLines((l) => g2.push('lines ' + l));
  o2.handlers['log-lines']({}, 'x');
  o2.api.getLootDB().then((v) => g2.push('db'));
  await tick();
  o2.fire('DOMContentLoaded');
  await tick();
  ok(g2.join('|') === 'lines x|db', 'arrival order kept: ' + g2);

  // dock / needs pages: never gated
  const d = load('/C:/SEQO/resources/app.asar/dock.html');
  const dg = [];
  d.api.onLogLines((l) => dg.push(l));
  d.handlers['log-lines']({}, 'z');
  ok(dg[0] === 'z', 'other pages get events immediately');
  ok(await d.api.getLootDB() === 'reply:get-loot-db', 'other pages get replies immediately');

  console.log(`preload gate: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
