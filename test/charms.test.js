// charms.js + FightTracker.petOwners: a charm is only YOUR pet when you cast it (Ed, Oct 26 2026).
const C = require('../charms.js');
const P = require('../parser.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const at = (hms, msg) => '[Mon Oct 26 ' + hms + ' 2026] ' + msg;
const ev = (hms, msg) => P.parseLine(at(hms, msg));
{
  ok(C.isCharmSpell('Allure VIII') && C.isCharmSpell('Dictate') && !C.isCharmSpell('Mesmerization VII'), 'charm spells, ranks included');
  const c = C.create();
  const T = (hms) => ev(hms, 'You feel better.') ? 0 : Date.parse('Mon Oct 26 ' + hms + ' 2026');
  // your own charm (Oct 23 log): cast, then the landing line
  let e = ev('13:07:28', 'You begin casting Allure VIII.'); c.cast(e.caster, e.spell, e.when);
  e = ev('13:07:32', 'a bloated brute has been charmed.');
  ok(e.type === 'charmed' && c.landed(e.target, e.when).owner === 'You', 'you cast Allure → your pet');
  // another player's charm with no cast line you could see (today's log): nobody's, never yours
  e = ev('17:07:03', 'Innoruuk`s Chosen has been charmed.');
  ok(c.landed(e.target, e.when).owner === null, '"has been charmed" alone is not your charm');
  // another player's charm you saw them cast: theirs
  e = ev('17:14:40', 'Nikilas begins casting Dictate.'); c.cast(e.caster, e.spell, e.when);
  e = ev('17:14:44', 'Innoruuk`s Chosen has been charmed.');
  ok(c.landed(e.target, e.when).owner === 'Nikilas' && c.ownerOf('Innoruuk`s Chosen') === 'Nikilas', 'credited to the player who cast it');
  // your charm resisted, then someone else's lands: not yours
  e = ev('17:20:00', 'You begin casting Allure VIII.'); c.cast(e.caster, e.spell, e.when);
  c.failed('You');
  e = ev('17:20:04', 'a ghoul has been charmed.');
  ok(c.landed(e.target, e.when).owner === null, 'a resisted charm of yours never claims the next landing');
  ok(c.landed('x', Date.parse('Mon Oct 26 17:30:00 2026')).owner === null, 'too long after any cast: nobody');
}
{
  const s = ev('13:08:00', "A bloated brute says, 'Following you, Master.'"), t = ev('13:08:01', "A bloated brute told you, 'Attacking a rat Master.'");
  ok(s.type === 'petsay' && !s.direct && t.type === 'petsay' && t.direct, 'pet lines: "says" is heard by everyone, "told you" is yours');
}
{
  // the meter: another player's charmed mob's damage goes to that player, not to you
  const tr = new P.FightTracker();
  tr.petNames = new Set(); tr.petOwners = new Map([['Innoruuk`s Chosen', 'Nikilas']]);
  for (const l of ['You shoot Avatar of Abhorrence for 300 points of damage.',
                   'Innoruuk`s Chosen hits Avatar of Abhorrence for 500 points of damage.',
                   'Nikilas hits Avatar of Abhorrence for 100 points of damage.',
                   'Innoruuk`s Chosen tries to hit Avatar of Abhorrence, but misses!'])
    tr.feed(at('17:08:00', l));
  const s = tr.summary();
  const nik = s.rows.find(r => r.name === 'Nikilas');
  ok(s.you.total === 300 && !(s.petRows || []).length, 'you: only your own 300');
  ok(nik && nik.total === 600, 'Nikilas: 100 + his charmed pet’s 500: ' + JSON.stringify(s.rows.map(r => [r.name, r.total])));
  ok(tr.attackerSources('Nikilas').some(x => x.source === 'Pet: Innoruuk`s Chosen' && x.total === 500), 'shown as "Pet: …" in his breakdown');
}
console.log(`charms: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
