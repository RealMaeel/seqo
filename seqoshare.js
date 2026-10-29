// SEQO — the credit on every report you copy for chat or Discord (v2.7; shortened in 2.7.2),
// so whoever reads a pasted DPS line or drop table knows where it came from.
// One place for the wording; used by the overlay and the dock.
//   separators: " · " becomes " ■ " in everything copied
//   one-liners (pasted in game chat): " - via SEQO (github.com/RealMaeel/seqo)" — plain ASCII,
//     the game's chat shows markdown and fancy dashes literally
//   multi-line reports (Discord): a last line in Discord's small grey subtext, the link in < >
//     so Discord doesn't add a big preview card

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLShare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const URL = 'github.com/RealMaeel/seqo';
  const CREDIT_CHAT = 'via SEQO (' + URL + ')';
  const CREDIT_FULL = '-# via SEQO ■ <https://' + URL + '>';
  // separators in copied reports (Ed, 2.7.2): the small middle dot is hard to read in game chat,
  // so every " · " in a copied report becomes " ■ " (on screen SEQO keeps the dot)
  const SEP = ' ■ ';
  const CREDIT = CREDIT_FULL;   // (older name)
  const OLD = '**Compliments of Simple EverQuest Overlay - https://github.com/RealMaeel/seqo**';

  function withCredit(text) {
    const t = String(text == null ? '' : text).replace(/\s+$/, '').replace(/ · /g, SEP);
    if (!t) return t;
    if (t.includes(CREDIT_CHAT) || t.includes(CREDIT_FULL) || t.includes(OLD)) return t;
    return t.includes('\n') ? t + '\n\n' + CREDIT_FULL : t + ' - ' + CREDIT_CHAT;
  }

  return { CREDIT, CREDIT_CHAT, CREDIT_FULL, SEP, withCredit };
});
