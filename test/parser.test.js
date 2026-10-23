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

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
