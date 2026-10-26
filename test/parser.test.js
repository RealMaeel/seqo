// Parser regression tests: line shapes seen in real EverQuest Legends logs.
// Run: npm test   (plain Node, no dependencies)
// When the game changes its wording, add the new line here first.
const assert = require('assert');
const { parseLine } = require('../parser.js');

const TS = '[Thu Oct 22 20:00:00 2026] ';
let pass = 0, fail = 0;
function check(line, expect) {
  const ev = parseLine(TS + line);
  try {
    assert.ok(ev, 'line did not parse');
    for (const [k, v] of Object.entries(expect)) assert.deepStrictEqual(ev[k], v, k);
    pass++;
  } catch (e) {
    fail++;
    console.error('FAIL  ' + line + '\n      ' + e.message + '\n      got ' + JSON.stringify(ev));
  }
}

// --- melee, incl. stacked suffixes: only "Critical" makes a crit ---
check('You slash a froglok tactician for 49 points of damage.', { type: 'damage', attacker: 'You', target: 'a froglok tactician', amount: 49, crit: false, kind: 'melee' });
check('You slash a froglok tactician for 49 points of damage. (Critical)', { amount: 49, crit: true });
check('A froglok tactician pierces YOU for 28 points of damage. (Riposte)', { target: 'You', amount: 28, crit: false });
check('You crush a spite golem for 120 points of damage. (Riposte Critical)', { amount: 120, crit: true });
check('You hit a spite golem for 300 points of damage. (Finishing Blow)', { amount: 300, crit: false });
check('You hit a spite golem for 90 points of damage. (Flurry)', { crit: false });
check('You crush a ghoul for 200 points of damage. (Slay Undead)', { crit: false });
check('You slash a ghoul for 75 points of damage. (Strikethrough Critical)', { crit: true });

// --- archery and smite (were dropped before v2.5.2) ---
check('You shoot a watchful guard for 312 points of damage.', { type: 'damage', attacker: 'You', amount: 312, kind: 'melee', crit: false });
check('Bowman shoots a spite golem for 401 points of damage. (Double Bow Shot)', { attacker: 'Bowman', amount: 401, crit: false });
check('Bowman shoots an elite dragoon for 802 points of damage. (Critical Double Bow Shot)', { amount: 802, crit: true });
check('Healer smites a spite golem for 55 points of damage.', { attacker: 'Healer', amount: 55 });

// --- spells ---
check('You hit Drelzna for 222 points of magic damage by Spirit Tap.', { type: 'damage', amount: 222, spell: 'Spirit Tap', crit: false, kind: 'spell' });
check('You hit Drelzna for 444 points of magic damage by Spirit Tap. (Critical)', { amount: 444, crit: true });

// --- DoTs, with and without "(Critical)" ---
check('Drelzna has taken 22 damage from Tainted Breath by Singer.', { type: 'damage', attacker: 'Singer', target: 'Drelzna', amount: 22, spell: 'Tainted Breath', kind: 'dot', crit: false });
check("A spite golem has taken 310 damage from Selo's Chords of Cessation IX by Singer. (Critical)", { attacker: 'Singer', amount: 310, spell: "Selo's Chords of Cessation IX", crit: true });
check('A shin ghoul knight has taken 25 damage from your Heart Flutter.', { attacker: 'You', amount: 25, spell: 'Heart Flutter', crit: false });
check('An azarack has taken 1240 damage from your Harm Touch X. (Critical)', { attacker: 'You', amount: 1240, spell: 'Harm Touch X', crit: true });
check('You have taken 15 damage from Blood Claw by Drelzna.', { target: 'You', attacker: 'Drelzna', amount: 15, crit: false });
check('You have taken 30 damage from Blood Claw by Drelzna. (Critical)', { amount: 30, crit: true });
check('A spiroc banisher has taken 188 damage by Drifting Death.', { attacker: '(unknown)', amount: 188 });

// --- misses, incl. suffixes and archery ---
check('You try to slash Drelzna, but miss!', { type: 'miss', attacker: 'You', target: 'Drelzna' });
check('A froglok tactician tries to hit YOU, but misses! (Riposte)', { type: 'miss', target: 'You' });
check('A spite golem tries to claw YOU, but misses! (Rampage)', { type: 'miss' });
check('You try to shoot a gorgalask, but miss!', { type: 'miss', attacker: 'You', target: 'a gorgalask' });
check('Healer tries to smite a spite golem, but misses!', { type: 'miss', attacker: 'Healer' });

// --- death recap + stances (v2.6) ---
check('You have been knocked unconscious!', { type: 'ko' });
check('You died.', { type: 'death', target: 'You', killer: null });
check('You have been slain by Lord Rikantus Everling!', { type: 'death', target: 'You', killer: 'Lord Rikantus Everling' });
check('You assume a striker stance.', { type: 'stance', stance: 'striker' });
check('You assume an evasive stance.', { type: 'stance', stance: 'evasive' });
check('You assume a mage hunter stance.', { type: 'stance', stance: 'mage hunter' });

// --- progress + chat (v2.6) ---
check('You have become better at Fishing! (11)', { type: 'skillup', skill: 'Fishing', value: 11 });
check('Your faction standing with Host of Nektropos has been adjusted by -2.', { type: 'faction', faction: 'Host of Nektropos', delta: -2 });
check('Your faction standing with Brownies of Faydwer could not possibly get any worse.', { type: 'faction', delta: 0, capped: 'worse' });
check("Cadogan tells you, 'naggy and yael also'", { type: 'chat', channel: 'tell', from: 'Cadogan', text: 'naggy and yael also' });
check("You told Cadogan, 'just doing vox?'", { type: 'chat', channel: 'tell', from: 'You', to: 'Cadogan' });
check("Stormbow tells the group, 'hey hey'", { type: 'chat', channel: 'group', from: 'Stormbow', text: 'hey hey' });
check("Eliseus tells General:1, 'anyone tried out rampage rank 2?'", { type: 'chat', channel: 'chan', chan: 'General:1', from: 'Eliseus' });
check("Ebear tells General1:1, 'WTS Blood Fire +6 10k'", { type: 'chat', channel: 'chan', chan: 'General1:1', from: 'Ebear' });
check("You tell General:1, 'how do you get in the basement?'", { type: 'chat', channel: 'chan', from: 'You' });
check("Lord Ollix Everling says, 'Ah, Maeel! Welcome to our castle.'", { type: 'chat', channel: 'say', from: 'Lord Ollix Everling' });
check("Xonektik says, 'Sorry, Master... calming down.'", { type: 'petsay' });
check('You healed Maeel for 222 hit points by Spirit Tap.', { type: 'heal', healer: 'You', amount: 222 });
check('Lyes healed herself for 0 (6) hit points by Blessing of the Lord Commander.', { type: 'heal', healer: 'Lyes', amount: 0, potential: 6 });

check('Tormentor Utzain - a rare creature - scowls at you, ready to attack -- looks like he would wipe the floor with you! (Lvl: 54)',
  { type: 'consider', mob: 'Tormentor Utzain', level: 54, rare: true, aggro: true, attitude: 'scowls at you, ready to attack', difficulty: 'looks like he would wipe the floor with you!' });
check('Bugroll regards you indifferently -- looks like quite a gamble. (Lvl: 50)', { type: 'consider', mob: 'Bugroll', level: 50, rare: false, aggro: false, difficulty: 'looks like quite a gamble.' });

// --- AA points: the real wording (fixed in 2.6; the old pattern never matched) ---
check('You have gained an ability point!  You now have 145 ability points.', { type: 'aa', gained: 1, total: 145 });
check('You have gained an ability point!  You now have 1 ability point.', { type: 'aa', gained: 1, total: 1 });
check('You have gained 2 ability point(s)!  You now have 147 ability point(s).', { type: 'aa', gained: 2, total: 147 });

check('You were hit by non-melee for 52 damage.', { type: 'damage', target: 'You', attacker: '(unknown)', amount: 52, spell: 'non-melee' });

// --- kills, heals, loot ---
check('You have slain a froglok tactician!', { type: 'death', target: 'a froglok tactician', killer: 'You' });
check('You healed Maeel for 222 hit points by Spirit Tap.', { type: 'heal', amount: 222, spell: 'Spirit Tap' });
check("--You have looted a Froglok Tongue from a froglok tactician's corpse.--", { type: 'loot' });

// --- achievements (live completion, before the next /outputfile) ---
check('You have completed achievement: Be Our Guest', { type: 'achievement', name: 'Be Our Guest' });
check('The Nektropos Library Key has been added to your key ring.', { type: 'keyring', item: 'Nektropos Library Key' });

// --- lines that must NOT become combat ---
for (const line of [
  "Someone tells General:1, 'LOL \"You cleave a basilisk for 900 points of damage.\"'",
  'You regain your concentration and continue your casting.',
  "You can't hit them from here."
]) {
  const ev = parseLine(TS + line);
  if (ev && (ev.type === 'damage' || ev.type === 'miss')) { fail++; console.error('FAIL  should not be combat: ' + line); } else pass++;
}

// --- meter: damage per mob in one fight (2.7) ---
{
  const { FightTracker } = require('../parser.js');
  const tr = new FightTracker();
  const at = (sec, line) => '[Sat Oct 24 22:24:' + String(sec).padStart(2, '0') + ' 2026] ' + line;
  const lines = [];
  for (let i = 0; i < 20; i++) {
    lines.push(at(i, 'You slash Lord Rikantus Everling for 300 points of damage.'));
    lines.push(at(i, 'Deathwish backstabs Lord Rikantus Everling for 500 points of damage.'));
    if (i >= 10) lines.push(at(i, 'You slash Guardian Golem for 200 points of damage.'));
    if (i >= 10 && i % 2) lines.push(at(i, 'You try to slash Guardian Golem, but miss!'));
  }
  lines.push(at(19, 'Lord Rikantus Everling punches YOU for 120 points of damage.'));
  lines.push(at(19, 'Guardian Golem punches YOU for 80 points of damage.'));
  for (const l of lines) { const ev = parseLine(l); if (ev) tr.feed ? tr.feed(ev) : tr.handle(ev); }
  const all = tr.summary();
  const t = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL  ' + m); } };
  t(all.targets.map(x => x.name).join() === 'Lord Rikantus Everling,Guardian Golem' && all.target === null, 'fight lists every mob, biggest first');
  t(Math.round(all.targets[0].pct * 100) === 89, 'mob share of the fight: ' + all.targets[0].pct);
  const g = tr.summary(undefined, 'Guardian Golem');
  t(g.title === 'Guardian Golem' && g.target === 'Guardian Golem', 'filtered title is the mob');
  t(g.rows.length === 1 && g.rows[0].name === 'You' && g.rows[0].total === 2000, 'only damage to that mob');
  t(g.durS === 9 && Math.round(g.rows[0].dps) === 222, 'DPS over the time that mob was fought: ' + g.durS);
  t(g.rows[0].misses === 5 && all.rows.find(r => r.name === 'You').misses === 5, 'misses on that mob');
  t(g.youTaken === 80 && all.youTaken === 200, 'damage taken from that mob');
  t(tr.attackerSources('You', undefined, 'Guardian Golem')[0].total === 2000, 'spell breakdown filtered too');
  const sum = all.targets.reduce((a, x) => a + tr.summary(undefined, x.name).rows.reduce((b, r) => b + r.total, 0), 0);
  t(sum === all.rows.reduce((a, r) => a + r.total, 0), 'per-mob totals add up to the fight');
  t(tr.summary(undefined, 'Nobody').target === null, 'unknown mob = the whole fight');
  t(tr.engagedSecs('Guardian Golem', Date.parse('Sat Oct 24 22:24:25 2026')) === 15 && tr.engagedSecs('Lord Rikantus Everling', Date.parse('Sat Oct 24 22:24:20 2026')) === 20, 'time to kill: first hit on that mob to its death');
  t(tr.engagedSecs('Nobody', Date.now()) === null, 'time to kill unknown for a mob not in the fight');
  t(JSON.stringify(tr.othersInFight()) === '["Deathwish"]', 'other players in the fight (group kill)');
  const solo = new FightTracker();
  for (const l of ['[Sat Oct 24 17:03:15 2026] You shoot Lord Rikantus Everling for 269 points of damage. (Double Bow Shot)',
                   '[Sat Oct 24 17:04:59 2026] Lord Rikantus Everling punches YOU for 153 points of damage.']) solo.feed(parseLine(l));
  t(solo.othersInFight().length === 0, 'nobody else hit it: solo');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
