// cleanupview.js: the Cleanup window's All / By location / By category lists.
const V = require('../cleanupview.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const rows = [
  { name: 'Water Flask', count: 3, by: { bags: 2, bank: 1 }, cat: 'quest', pile: 'need', reason: 'used in: Gnoll Bounty', src: 'eqlwiki' },
  { name: 'Bone Chips', count: 5, by: { depot: 3, stored: 2 }, cat: 'tracked', track: 'Epic + Unlock', pile: 'need', src: 'SEQO trackers' },
  { name: 'ancient warsword', count: 2, by: { bank: 1, shared: 1 }, cat: 'gear', pile: 'gear', src: 'P99 (classic EQ)' },
  { name: 'Imp Blood', count: 1, by: { bags: 1 }, cat: 'tracked', track: 'Unlock', pile: 'need', src: 'SEQO trackers' },
  { name: 'Peerless Sapphire', count: 1, by: { bags: 1 }, cat: 'tracked', track: 'Unlock', pile: 'done' },
  { name: 'Spider Silk', count: 20, by: { depot: 20 }, cat: 'tradeskill', pile: 'need', reason: 'tradeskill – tailoring', src: 'eqlwiki' },
  { name: 'Odd Rock', count: 1, by: { bags: 1 }, cat: undefined, pile: 'unk', reason: '' }
];
const names = (g) => g.rows.map(r => r.name).join(',');
{
  const g = V.group(rows, 'all');
  ok(g.length === 1 && names(g[0]) === 'ancient warsword,Bone Chips,Imp Blood,Odd Rock,Peerless Sapphire,Spider Silk,Water Flask', 'All: one list, A–Z ignoring case: ' + names(g[0]));
  ok(V.locText(rows[0]) === 'Bags ×2 · Bank' && V.locText(rows[1]) === 'Storage ×5' && V.locText(rows[2]) === 'Bank · Shared bank', 'every place it is stored');
}
{
  const g = V.group(rows, 'location');
  ok(g.map(x => x.label).join('|') === '🎒 Bags|📦 Character storage|🏦 Bank|🤝 Shared bank', 'location groups in order, empty ones left out');
  ok(names(g[0]) === 'Imp Blood,Odd Rock,Peerless Sapphire,Water Flask' && names(g[2]) === 'ancient warsword,Water Flask', 'A–Z inside each place; an item in two places shows in both');
  ok(V.locCount(rows[1], 'depot') === 5 && g[1].loc === 'depot', 'storage gear tab counts as character storage');
}
{
  const g = V.group(rows, 'category');
  ok(g.map(x => x.label).join('|') === '🛡 Gear|📌 Tracked — Epic|📌 Tracked — Unlock|📜 Quest items|⚒ Tradeskill|📦 Misc', 'category groups, tracked split by tracker: ' + g.map(x => x.label).join('|'));
  ok(names(g[2]) === 'Imp Blood,Peerless Sapphire' && names(g[5]) === 'Odd Rock', 'A–Z inside; no category = Misc');
  ok(V.catText(rows[1]) === 'Tracked · Epic + Unlock' && V.catText(rows[6]) === 'Misc', 'category text');
}
ok(V.filterRows(rows, 'bank', 'all').length === 2 && V.filterRows(rows, '', 'need').length === 4 && V.filterRows(rows, 'p99', 'all')[0].name === 'ancient warsword', 'filter: text (incl. location/source) and verdict');
ok(V.group([], 'category').length === 0 && V.group([], 'all').length === 0, 'nothing in, nothing out');
console.log(`cleanupview: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
