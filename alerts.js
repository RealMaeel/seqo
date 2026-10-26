// SEQO custom alerts: "when this line shows up in my log, tell me".
// Shared by the overlay (matching, UI) and Node (tests, GINA file import).
//
// rule = { id, name, on, pattern, regex, msg, say, speak, sound, timer, cooldown, group }
//   pattern  plain text (case-insensitive "contains") or a regex when regex:true
//            GINA tokens work in both: {S} {S1}.. any text, {N} {N1}.. a number,
//            {C} your character's name
//   msg      what the toast says; {1}..{9} / {S}.. / {N}.. fill from the match,
//            {C} = you, {line} = the whole log line
//   say      spoken text (defaults to msg) when speak is on
//   timer    seconds: also start a countdown chip that alerts when it runs out
//   timerName chip label ({1}/{S}.. fill), timerWarn = ⏳ heads-up that many seconds before
//            the end (GINA "timer ending"), timerEnd = what the alert says when it runs out
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SEQOAlerts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SOUNDS = ['rare', 'repop', 'charm', 'afk', 'invis', 'buff', 'heads', 'cc', 'death', 'none'];
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // EQ writes speech with straight single quotes, but people type (and paste from
  // Discord) " or curly quotes: any quote mark in a pattern matches any of them.
  // Skips quotes inside a [character class] so regexes like [^'] keep working.
  const QUOTES = "['\"\u2018\u2019\u201C\u201D]";
  function looseQuotes(re) {
    let out = '', inClass = false;
    for (let i = 0; i < re.length; i++) {
      const c = re[i];
      if (c === '\\') { out += c + (re[i + 1] || ''); i++; continue; }
      if (inClass) { if (c === ']') inClass = false; out += c; continue; }
      if (c === '[') { inClass = true; out += c; continue; }
      out += /['"\u2018\u2019\u201C\u201D]/.test(c) ? QUOTES : c;
    }
    return out;
  }

  // Builds a JS RegExp; tokens become named groups t0, t1.. so {S}/{N} fill
  // correctly even next to the rule's own (positional) groups. null = bad pattern.
  function compileRule(rule, ctx) {
    const charName = (ctx && ctx.charName) || '';
    let src = String(rule.pattern || '');
    if (!src.trim()) return null;
    // GINA regexes are .NET: drop what JavaScript doesn't understand. Matching is
    // case-insensitive anyway, so leading inline flags like (?i) just go;
    // (?#comments) go; \Z / \z (end of input) become $.
    if (rule.regex) src = src.replace(/^\(\?[imnsx-]+\)/i, '').replace(/\(\?#[^)]*\)/g, '').replace(/\\[Zz]/g, '$');
    const names = [];
    const tokenRe = /\{(S\d*|N\d*(?:[<>=!]+-?\d+)?|C|TS)\}/gi;
    let out = '', last = 0, m;
    const lit = (s) => rule.regex ? s : escRe(s);
    while ((m = tokenRe.exec(src))) {
      out += lit(src.slice(last, m.index));
      const t = m[1].toUpperCase();
      const atEnd = !src.slice(m.index + m[0].length).replace(/[.!?'"\s$)]*$/, '');
      const g = '(?<t' + names.length + '>';
      if (t === 'C') out += escRe(charName || 'You');
      else if (t === 'TS') { names.push('TS'); out += g + '\\d+:\\d+(?::\\d+)?|\\d+)'; }
      else if (t[0] === 'S') { names.push(t); out += g + (atEnd ? '.+)' : '.+?)'); }
      else { names.push(t.match(/^N\d*/)[0]); out += g + '-?\\d[\\d,]*)'; }
      last = m.index + m[0].length;
    }
    out += lit(src.slice(last));
    try { return { re: new RegExp(looseQuotes(out), 'i'), names }; } catch { return null; }
  }

  function matchLine(compiled, msg) {
    if (!compiled) return null;
    const m = compiled.re.exec(msg);
    if (!m) return null;
    const groups = m.groups || {};
    const named = {};
    compiled.names.forEach((t, i) => { if (named[t] == null) named[t] = groups['t' + i]; });
    if (named.S != null && named.S1 == null) named.S1 = named.S;
    if (named.N != null && named.N1 == null) named.N1 = named.N;
    return { caps: m.slice(1), named, groups };
  }

  function fill(template, hit, ctx, line) {
    return String(template || '').replace(/\{(\d|S\d*|N\d*|C|line|[A-Za-z_]\w*)\}/g, (all, k) => {
      if (/^\d$/.test(k)) return hit.caps[+k - 1] != null ? hit.caps[+k - 1] : '';
      if (k === 'C') return (ctx && ctx.charName) || 'You';
      if (k === 'line') return line || '';
      const u = k.toUpperCase();
      if (hit.named[u] != null) return hit.named[u];
      if (hit.groups[k] != null) return hit.groups[k];
      return all;
    });
  }

  // ---- sharing: one copy-paste string for a set of rules ----
  const PREFIX = 'SEQO-ALERTS:';
  const KEEP = ['name', 'pattern', 'regex', 'msg', 'say', 'speak', 'sound', 'timer', 'timerName', 'timerWarn', 'timerEnd', 'cooldown', 'group'];
  const clean = (r) => { const o = {}; for (const k of KEEP) if (r[k] !== undefined && r[k] !== '' && r[k] !== false) o[k] = r[k]; return o; };
  const b64e = (s) => typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64');
  const b64d = (s) => typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8');
  function encodeShare(rules) { return PREFIX + b64e(JSON.stringify((rules || []).map(clean))); }
  function decodeShare(text) {
    const t = String(text || '').trim();
    const i = t.indexOf(PREFIX);
    if (i < 0) return null;
    try {
      const arr = JSON.parse(b64d(t.slice(i + PREFIX.length).replace(/\s+/g, '')));
      return Array.isArray(arr) ? arr.filter(r => r && r.pattern).map(r => ({ ...clean(r), on: true })) : null;
    } catch { return null; }
  }

  // ---- GINA import: exported XML (or the ShareData.xml inside a .gtp) ----
  const xmlText = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&');
  const tag = (blk, name) => { const m = new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>', 'i').exec(blk); return m ? xmlText(m[1]).trim() : ''; };
  const yes = (v) => /^true$/i.test(v);
  function ginaToRules(xml) {
    const out = [];
    const src = String(xml || '');
    // walk groups so rules keep their group name; triggers outside groups still import
    const groupRe = /<TriggerGroup>([\s\S]*?)<\/TriggerGroup>/gi;
    const seen = new Set();
    const take = (blk, group) => {
      const trigRe = /<Trigger>([\s\S]*?)<\/Trigger>/gi;
      let t;
      while ((t = trigRe.exec(blk))) {
        const b = t[1];
        const pattern = tag(b, 'TriggerText');
        if (!pattern || seen.has(group + '|' + pattern)) continue;
        seen.add(group + '|' + pattern);
        const timerType = tag(b, 'TimerType');
        const secs = parseInt(tag(b, 'TimerDuration'), 10) || 0;
        const display = yes(tag(b, 'UseText')) ? tag(b, 'DisplayText') : '';
        const voice = yes(tag(b, 'UseTextToVoice')) ? tag(b, 'TextToVoiceText') : '';
        // GINA "timer ending": a heads-up N seconds before the timer runs out
        const ending = yes(tag(b, 'UseTimerEnding')) ? parseInt(tag(b, 'TimerEndingTime'), 10) || 0 : 0;
        const endedBlk = /<TimerEndedTrigger>([\s\S]*?)<\/TimerEndedTrigger>/i.exec(b);
        const endText = yes(tag(b, 'UseTimerEnded')) && endedBlk && yes(tag(endedBlk[1], 'UseText')) ? tag(endedBlk[1], 'DisplayText') : '';
        out.push({
          name: tag(b, 'Name') || pattern.slice(0, 40), pattern, regex: yes(tag(b, 'EnableRegex')),
          msg: display || tag(b, 'Name') || pattern, say: voice || '', speak: !!voice,
          sound: yes(tag(b, 'PlayMediaFile')) || (!voice && !display) ? 'rare' : (display ? 'heads' : 'none'),
          timer: /timer/i.test(timerType) && !/^no/i.test(timerType) && secs > 0 ? secs : 0,
          timerName: tag(b, 'TimerName') || '', timerWarn: ending > 0 && ending < secs ? ending : 0, timerEnd: endText,
          cooldown: 2, group: group || 'GINA', on: true
        });
      }
    };
    let g, any = false;
    while ((g = groupRe.exec(src))) {
      any = true;
      // a group's own name is the first <Name> before its <Triggers>
      const head = g[1].split(/<Triggers>/i)[0];
      take(g[1], tag(head, 'Name') || 'GINA');
    }
    if (!any) take(src, 'GINA');
    return out;
  }

  // Minimal .zip reader (GINA .gtp packages are zips holding ShareData.xml).
  // Node only (zlib); returns the first .xml entry's text or null.
  function unzipFirstXml(buf) {
    const zlib = require('zlib');
    let off = 0;
    while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
      const method = buf.readUInt16LE(off + 8), flags = buf.readUInt16LE(off + 6);
      let csize = buf.readUInt32LE(off + 18);
      const nlen = buf.readUInt16LE(off + 26), xlen = buf.readUInt16LE(off + 28);
      const name = buf.slice(off + 30, off + 30 + nlen).toString('utf8');
      const start = off + 30 + nlen + xlen;
      if (flags & 8 && !csize) {   // sizes in a data descriptor: find the next header
        const next = buf.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]), start);
        csize = (next > 0 ? next : buf.length) - start;
      }
      const data = buf.slice(start, start + csize);
      if (/\.xml$/i.test(name)) {
        const raw = method === 8 ? zlib.inflateRawSync(data) : data;
        // UTF-16 (byte-order mark) or UTF-8
        if (raw[0] === 0xff && raw[1] === 0xfe) return raw.slice(2).toString('utf16le');
        if (raw[0] === 0xfe && raw[1] === 0xff) return Buffer.from(raw.slice(2)).swap16().toString('utf16le');
        return raw.toString('utf8').replace(/^﻿/, '');
      }
      off = start + csize + (flags & 8 ? 16 : 0);
    }
    return null;
  }

  // Ready-made rules — every line format checked against real EQ Legends logs
  const STARTER = [
    { name: 'Tell received', pattern: "^(\\w+) tells you, '(.+)'$", regex: true, msg: '💬 {1}: {2}', say: 'Tell from {1}', speak: true, sound: 'heads', cooldown: 1, group: 'Starter' },
    { name: 'Summoned', pattern: 'You have been summoned!', msg: '🪝 You were summoned!', say: 'Summoned', speak: true, sound: 'afk', cooldown: 3, group: 'Starter' },
    { name: 'Stunned', pattern: 'You are stunned', msg: '💫 Stunned!', speak: false, sound: 'cc', cooldown: 3, group: 'Starter' },
    { name: 'Group invite', pattern: '{S} invites you to join a group.', msg: '👥 {S} invites you to a group', say: 'Group invite from {S}', speak: true, sound: 'heads', cooldown: 3, group: 'Starter' },
    // respawn timers for mobs you don't ★ pin in Timers (pinned camps warn on their own, from the
    // respawn SEQO learned). Added switched OFF: put your mob's name + its respawn in, then turn it on.
    { name: 'Spawn soon — a ghoul knight (edit me)', pattern: '^(?:You have slain |)(a ghoul knight)(?: has been slain by [^!]+)?!$', regex: true,
      msg: '💀 {1} down — respawn timer started', sound: 'none', speak: false, timer: 400, timerWarn: 60,
      timerName: '{1} respawn', timerEnd: '⚔ {1} should be up!', cooldown: 5, group: 'Starter', on: false },
    { name: 'Spawn window soon — a ghoul knight (edit me)', pattern: '^(?:You have slain |)(a ghoul knight)(?: has been slain by [^!]+)?!$', regex: true,
      msg: '💀 {1} down — spawn window timer started', sound: 'none', speak: false, timer: 900, timerWarn: 60,
      timerName: '{1} spawn window', timerEnd: '🪟 {1} spawn window is OPEN', cooldown: 5, group: 'Starter', on: false }
  ];

  return { SOUNDS, compileRule, matchLine, fill, encodeShare, decodeShare, ginaToRules, unzipFirstXml, STARTER };
});
