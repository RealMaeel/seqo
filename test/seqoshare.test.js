// seqoshare.js: the credit on copied reports (short since 2.7.2).
const S = require('../seqoshare.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const one = 'Lord Rikantus Everling (Nektropos Castle), 10 kills: Signet Ring of Lord Everling 8/10 80% · Robe of the Betrayed 1/10 10%';
ok(S.withCredit(one) === one.replace(' · ', ' ■ ') + ' - via SEQO (github.com/RealMaeel/seqo)', 'one-liner (game chat): ■ separators, short credit on the same line');
ok(S.withCredit('a\nb\n') === 'a\nb\n\n-# via SEQO ■ <https://github.com/RealMaeel/seqo>', 'multi-line (Discord): small subtext line, link without preview');
ok(S.withCredit(S.withCredit(one)) === S.withCredit(one) && S.withCredit(S.withCredit('a\nb')) === S.withCredit('a\nb'), 'never added twice');
ok(S.withCredit('') === '' && S.withCredit(null) === '', 'nothing to credit');
ok(/^[\x20-\x7e]*$/.test(S.CREDIT_CHAT), 'chat credit is plain ASCII');
ok(S.withCredit('DMG 30 · AC 10 · STR 5').startsWith('DMG 30 ■ AC 10 ■ STR 5'), 'every dot separator becomes ■');
console.log(`seqoshare: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
