// layout.js: Zoom to fit vs More room.
const L = require('../layout.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const base = { baseW: 480, baseH: 290 };
ok(L.contentBox({ ...base, mode: 'zoom', availW: 960, availH: 580 }).scale === 2, 'zoom: twice the window = everything twice as big');
const r = L.contentBox({ ...base, mode: 'room', zoom: 100, availW: 1440, availH: 870 });
ok(r.scale === 1 && r.width === 1440 && r.height === 870, 'room: a bigger window = more space at the same size');
const z = L.contentBox({ ...base, mode: 'room', zoom: 125, availW: 1000, availH: 800 });
ok(z.scale === 1.25 && z.width === 800 && z.height === 640, 'room at 125%: bigger text, the space divided by it');
const t = L.contentBox({ ...base, mode: 'room', zoom: 100, availW: 300, availH: 200 });
ok(t.width === 480 && t.height === 290 && Math.abs(t.scale - 300 / 480) < 1e-9, 'room in a tiny window: the base layout, shrunk to fit');
ok(L.clampZoom(10) === 70 && L.clampZoom(999) === 150 && L.clampZoom('abc') === 100, 'zoom stays 70–150%');
console.log(`layout: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
