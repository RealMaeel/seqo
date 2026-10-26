// SEQO — the credit line on every report you copy for chat or Discord (v2.7),
// so whoever reads a pasted DPS line or drop table knows where it came from.
// One place for the wording; used by the overlay and the dock.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLShare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CREDIT = '**Compliments of Simple EverQuest Overlay - https://github.com/RealMaeel/seqo**';

  // one-liners get it on the same line, multi-line reports on a line of its own
  function withCredit(text) {
    const t = String(text == null ? '' : text).replace(/\s+$/, '');
    if (!t) return t;
    if (t.includes(CREDIT)) return t;
    return t.includes('\n') ? t + '\n\n' + CREDIT : t + '  ' + CREDIT;
  }

  return { CREDIT, withCredit };
});
