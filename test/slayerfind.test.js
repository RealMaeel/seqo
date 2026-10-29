// slayerfind.js: closest-to-done and "do I still need to kill X?"
const F = require('../slayerfind.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const data = { sections: [
  { name: 'Slayer: Conquest', achievements: [
    { name: 'Doesn\'t Play Well With Others', done: false, objectives: [{ text: 'The playable races.', done: false, cur: 9400, max: 10000 }] },
    { name: 'Dragon Bane', done: false, objectives: [{ text: 'Dragons.', done: false, cur: 10, max: 500 }] },
    { name: 'Rat Catcher', done: true, objectives: [{ text: 'Rats.', done: true }] }] },
  { name: 'Slayer: Special', achievements: [
    { name: 'People Person', done: false, objectives: [{ text: 'Humans', done: true }, { text: 'Barbarians', done: false, cur: 3, max: 10 },
      { text: 'Erudites', done: true }, { text: 'Wood Elves', done: false, cur: 8, max: 10 }, { text: 'This achievement is tracked.', done: false }] },
    { name: 'Untouched', done: false, objectives: [{ text: 'Gnomes', done: false, cur: 0, max: 10 }] }] },
  { name: 'EverQuest: Raids', achievements: [
    { name: 'Conqueror of The Permafrost Caverns', done: false, objectives: [{ text: 'Lady Vox', done: false }] },
    { name: 'Conqueror of Nagafen\'s Lair', done: false, objectives: [{ text: 'Lord Nagafen', done: true }] }] }
] };
const c = F.closest(data);
ok(c[0].ach.name === 'Doesn\'t Play Well With Others' && c[0].left === '600 to go', 'closest first: 94% with "600 to go"');
ok(c[1].ach.name === 'People Person' && /Barbarians 3\/10 · Wood Elves 8\/10/.test(c[1].left), 'multi-objective: lists what is left');
ok(!c.some(x => x.ach.name === 'Rat Catcher' || x.ach.name === 'Untouched'), 'done and untouched ones left out');
ok(!c.some(x => /Raids/.test(x.section)), 'closest only looks at Slayer sections by default');
const v = F.search(data, 'vox');
ok(v.verdict === 'needed' && v.hits[0].ach.name === 'Conqueror of The Permafrost Caverns', 'Vox: still needed for Permafrost');
const ng = F.search(data, 'Nagafen');
ok(ng.verdict === 'done', 'Nagafen: already killed for that one');
ok(F.search(data, 'dragon').verdict === 'needed', 'family words match the Conquest objective');
ok(F.search(data, 'zzz').verdict === 'none' && F.search(data, 'v').hits.length === 0, 'no match / too short');
const live = new Set(['Conqueror of The Permafrost Caverns']);
ok(F.search(data, 'vox', { live }).verdict === 'done', 'live completion from the log counts');
ok(Math.abs(F.pct(data.sections[1].achievements[0]) - 0.775) < 1e-9, 'pct ignores footnote objectives');
console.log(`slayerfind: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
