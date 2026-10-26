// seqoshare.js: the credit line on copied reports.
const S = require('../seqoshare.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const one = 'Lord Rikantus Everling (Nektropos Castle), 10 kills: Signet Ring of Lord Everling 8/10 80% · Robe of the Betrayed 1/10 10%';
ok(S.withCredit(one) === one + '  **Compliments of Simple EverQuest Overlay - https://github.com/RealMaeel/seqo**', 'one-liner: same line, two spaces');
ok(S.withCredit('a\nb\n') === 'a\nb\n\n' + S.CREDIT, 'multi-line: own line after a blank one');
ok(S.withCredit(S.withCredit(one)) === S.withCredit(one), 'never added twice');
ok(S.withCredit('') === '' && S.withCredit(null) === '', 'nothing to credit');
console.log(`seqoshare: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
