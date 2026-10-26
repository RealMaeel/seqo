// SEQO — alerts for pinned camps (v2.7): the heads-up before a spawn, then the
// usual "repop due" / "spawn window OPEN" / "past its window" when it happens.
// Pure: given a camp timer and the time, it says which alerts are due and marks
// them fired on the camp, so each fires once per kill. The overlay's 1-second
// tick (11-spells.js) calls check() for every ★ pinned camp and plays them.
//
// camp = { mob, lastDeath (ms), resp: { s } fixed seconds | { min, max } window, flags… }

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLSpawnWarn = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_WARN = 60;
  const FLAGS = ['soonNotified', 'windowNotified', 'notified'];
  const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  // "~1 min", "~2 min", "30 s" — how a heads-up says how long is left
  function lead(secs) {
    const s = Math.max(0, Math.round(secs));
    return s >= 90 ? '~' + Math.round(s / 60) + ' min' : s >= 55 ? '~1 min' : s + ' s';
  }
  // spoken: "1 minute", "30 seconds"
  function leadSaid(secs) {
    const s = Math.max(0, Math.round(secs));
    if (s >= 55) { const m = Math.max(1, Math.round(s / 60)); return m + ' minute' + (m === 1 ? '' : 's'); }
    return s + ' seconds';
  }
  const isWindow = (e) => !!(e && e.min && e.max && e.max > e.min);

  // what the camp waits for next: { kind: 'repop' | 'window', inSecs } (or null: no respawn known)
  function next(camp, now) {
    const e = camp && camp.resp;
    if (!camp || !camp.lastDeath || !e) return null;
    const alive = (now - camp.lastDeath) / 1000;
    if (isWindow(e)) return { kind: 'window', inSecs: e.min - alive };
    if (e.s) return { kind: 'repop', inSecs: e.s - alive };
    return null;
  }

  // opts: { warnSecs (0 = no heads-up), heads (false = off) } → [{ text, say, kind }] to play now
  function check(camp, now, opts = {}) {
    const out = [];
    const e = camp && camp.resp;
    if (!camp || !camp.lastDeath || !e || camp.up) return out;
    const alive = (now - camp.lastDeath) / 1000;
    const warn = opts.heads === false ? 0 : Math.max(0, +(opts.warnSecs != null ? opts.warnSecs : DEFAULT_WARN) || 0);
    const at = isWindow(e) ? e.min : e.s;
    if (!at) return out;
    // ⏳ heads-up: only when the warning lands after the kill (a 60 s warning on a 45 s respawn can't)
    if (warn > 0 && !camp.soonNotified && at - warn > 0 && alive >= at - warn && alive < at) {
      camp.soonNotified = true;
      const left = at - alive;
      out.push(isWindow(e)
        ? { kind: 'soon', text: '⏳ ' + camp.mob + ' spawn window opens in ' + lead(left), say: camp.mob + ' spawn window in ' + leadSaid(left) }
        : { kind: 'soon', text: '⏳ ' + camp.mob + ' spawns in ' + lead(left), say: camp.mob + ' spawns in ' + leadSaid(left) });
    }
    if (isWindow(e)) {
      if (!camp.windowNotified && alive >= e.min) {
        camp.windowNotified = true; camp.soonNotified = true;
        out.push({ kind: 'due', text: '🪟 ' + camp.mob + ' spawn window OPEN (' + fmt(e.min) + '–' + fmt(e.max) + ')', say: camp.mob + ' window open' });
      }
      if (!camp.notified && alive >= e.max) {
        camp.notified = true;
        out.push({ kind: 'due', text: '⏲ ' + camp.mob + ' past its spawn window — can be up any moment!', say: camp.mob + ' past its window' });
      }
    } else if (!camp.notified && alive >= e.s) {
      camp.notified = true; camp.soonNotified = true;
      out.push({ kind: 'due', text: '⏲ ' + camp.mob + ' repop due!', say: camp.mob + ' repop due' });
    }
    return out;
  }

  // a new kill (or a new timer) starts every alert over
  function reset(camp) { for (const f of FLAGS) camp[f] = false; }

  return { check, next, reset, lead, leadSaid, DEFAULT_WARN };
});
