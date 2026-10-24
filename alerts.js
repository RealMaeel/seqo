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
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SEQOAlerts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SOUNDS = ['rare', 'repop', 'charm', 'afk', 'invis', 'buff', 'heads', 'cc', 'death', 'none'];
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Builds a JS RegExp; tokens become named groups t0, t1.. so {S}/{N} fill
  // correctly even next to the rule's own (positional) groups. null = bad pattern.
  function compileRule(rule, ctx) {
    const charName = (ctx && ctx.charName) || '';
    const src = String(rule.pattern || '');
    if (!src.trim()) return null;
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
    try { return { re: new RegExp(out, 'i'), names }; } catch { return null; }
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
  const KEEP = ['name', 'pattern', 'regex', 'msg', 'say', 'speak', 'sound', 'timer', 'cooldown', 'group'];
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
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
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
        out.push({
          name: tag(b, 'Name') || pattern.slice(0, 40), pattern, regex: yes(tag(b, 'EnableRegex')),
          msg: display || tag(b, 'Name') || pattern, say: voice || '', speak: !!voice,
          sound: yes(tag(b, 'PlayMediaFile')) || (!voice && !display) ? 'rare' : (display ? 'heads' : 'none'),
          timer: /timer/i.test(timerType) && !/^no/i.test(timerType) && secs > 0 ? secs : 0,
          timerName: tag(b, 'TimerName') || '', cooldown: 2, group: group || 'GINA', on: true
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
    { name: 'Group invite', pattern: '{S} invites you to join a group.', msg: '👥 {S} invites you to a group', say: 'Group invite from {S}', speak: true, sound: 'heads', cooldown: 3, group: 'Starter' }
  ];

  return { SOUNDS, compileRule, matchLine, fill, encodeShare, decodeShare, ginaToRules, unzipFirstXml, STARTER };
});
