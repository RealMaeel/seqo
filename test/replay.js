// Replays a real EQ Legends log through the parser + fight tracker.
// Usage: node test/replay.js <logfile> [maxFightsToPrint]
const fs = require('fs');
const { parseLine, FightTracker } = require('../parser.js');

const file = process.argv[2];
const lines = fs.readFileSync(file, 'latin1').split(/\r?\n/);

const tracker = new FightTracker();
const fights = [];

const origEnd = tracker.end.bind(tracker);
tracker.end = () => {
  if (tracker.current && tracker.current.events.length) fights.push(tracker.summary());
  origEnd();
};

let parsed = 0, combat = 0;
for (const line of lines) {
  if (!line.trim()) continue;
  const ev = parseLine(line);
  if (!ev) continue;
  parsed++;
  if (ev.type === 'damage') combat++;
  tracker.feed(ev);
}
tracker.end();

console.log(`lines=${lines.length} parsedEvents=${parsed} damageEvents=${combat} fights=${fights.length}\n`);

const show = +(process.argv[3] || 8);
for (const f of fights.slice(0, show)) {
  console.log(`--- vs ${f.title}  (${f.durS.toFixed(0)}s)  kills=${f.kills} taken=${f.youTaken} selfheal=${f.youHealed}`);
  for (const r of f.rows.slice(0, 5))
    console.log(`    ${r.name.padEnd(22)} ${String(r.total).padStart(6)} dmg  ${r.dps.toFixed(1).padStart(7)} dps  ${(r.pct * 100).toFixed(0).padStart(3)}%  max=${r.maxHit} crits=${r.crits} hits=${r.hits} misses=${r.misses}`);
}

let youTotal = 0, youMax = 0;
for (const f of fights) { youTotal += f.you.total; youMax = Math.max(youMax, f.you.maxHit); }
console.log(`\nTOTAL 'You' damage across ${fights.length} fights: ${youTotal}, biggest hit: ${youMax}`);
