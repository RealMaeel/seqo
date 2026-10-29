// SEQO history import: rebuild past play sessions from old log files
// (Logs\ and Logs\archive\) so History, personal bests and comparisons start
// full instead of empty. Pure + streaming: feed lines one at a time.
//
// createImporter({ parser, char }) -> { line(raw), finish() -> sessions[] }
// A session ends after 30 minutes of log silence or at a "Welcome to EverQuest" line.
'use strict';
const GAP_MS = 30 * 60000;
const SOLO_MS = 10 * 60000;   // no other player in your fights for this long = solo (buffs on you are yours)

const MARKET = new Set(['chan', 'auction', 'shout', 'ooc', 'say']);

// the zone name the overlay files kills under (same rule as its cleanZoneName)
const { tierNum } = require('./mobstats.js');
const trioguess = require('./trioguess.js');
const spellproof = require('./spellproof.js');
function cleanZone(z) {
  if (!z) return '';
  let zone = String(z).replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+\d+\s*$/, '').trim();
  const mm = /\s+-\s+(Solo|Duo|Trio|Group|Raid|Party|Heroic|Event)$/i.exec(zone);
  if (mm) zone = zone.slice(0, mm.index).trim();
  return zone;
}

function createImporter({ parser, char, prices, spellDB }) {
  const sessions = [];
  const killTimes = new Map();   // zone + '\u0001' + mob -> [ms…] (2.7: kill card's recent kills)
  // your class makeup at each kill (2.7): /who rows, your casts and — solo — buffs landing on you
  const guess = spellDB && spellDB.book ? trioguess.create({ book: spellDB.book, landMap: spellDB.landMap, spells: spellDB.spells }) : null;
  let lastGroupT = 0;    // last time another player hit something you were fighting
  let zoneNow = '', tierNow = 0;   // tier: 0-4 difficulty of the zone copy (2.7)
  const offers = [];      // WTS/WTB lines seen in chat (when a prices parser is given)
  const spellsSeen = {};  // 2.7.2: base spell name -> last time anyone cast/sang it (spellproof.js)
  let cur = null, tracker = null, lastT = 0;
  const YOU = parser.YOU;

  function open(t) {
    cur = {
      type: 'session', imported: true, char: char || '', start: t, end: t, zones: [],
      fights: 0, durS: 0, dmg: 0, maxHit: 0, sources: new Map(), xpPct: 0, levels: 0, aa: 0, kills: 0,
      coin: 0, items: 0, motes: 0, deaths: [], skills: new Map(), factions: new Map(),
      stances: new Map(), stance: null, lines: 0
    };
    tracker = new parser.FightTracker();
    tracker.onFightEnd = (s) => {
      if (!s) return;
      cur.fights++; cur.durS += s.durS; cur.dmg += s.you.total;
      cur.maxHit = Math.max(cur.maxHit, s.you.maxHit || 0);
      for (const r of s.youBySource) {
        const e = cur.sources.get(r.source) || { source: r.source, total: 0, count: 0, crits: 0, max: 0 };
        e.total += r.total; e.count += r.count; e.crits += r.crits; e.max = Math.max(e.max, r.max);
        cur.sources.set(r.source, e);
      }
    };
  }
  function close() {
    if (!cur) return;
    tracker.end();
    const c = cur; cur = null;
    // a login that only idled isn't worth a History row
    if (!c.fights && !c.coin && !c.items && !c.xpPct && !c.kills && !c.skills.size) return;
    const stances = [...c.stances.entries()].map(([n, st]) => ({ n, dmg: st.dmg, ms: st.ms, dps: st.ms ? st.dmg / (st.ms / 1000) : 0 }))
      .sort((a, b) => b.dps - a.dps);
    sessions.push({
      id: 'imp-' + (c.char || 'x') + '-' + c.start, type: 'session', imported: true, char: c.char, start: c.start, end: c.end,
      zones: c.zones.slice(0, 20), fights: c.fights, durS: c.durS, dmg: c.dmg, dps: c.durS ? c.dmg / c.durS : 0, maxHit: c.maxHit,
      sources: [...c.sources.values()].sort((a, b) => b.total - a.total).slice(0, 12), stances,
      xpPct: c.xpPct, levels: c.levels, aa: c.aa, kills: c.kills, coin: c.coin, items: c.items, motes: c.motes,
      deaths: c.deaths.slice(0, 30),
      skills: [...c.skills.entries()].map(([k, e]) => ({ k, from: e.from, to: e.to, n: e.n })).sort((a, b) => b.n - a.n).slice(0, 30),
      factions: [...c.factions.entries()].map(([k, e]) => ({ k, net: e.net, n: e.n })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 30)
    });
  }
  function line(raw) {
    const ev = parser.parseLine(raw);
    let t = ev && ev.when;
    if (!t) {
      const m = /^\[(\w{3} \w{3} +\d+ \d\d:\d\d:\d\d \d{4})\]/.exec(raw);
      if (!m) return;
      t = Date.parse(m[1]);
      if (isNaN(t)) return;
    }
    const welcome = raw.includes('] Welcome to EverQuest');
    if (!cur || t - lastT > GAP_MS || welcome || t < lastT - 60000) { close(); open(t); if (guess) guess.newSession(); }
    lastT = t; cur.end = t; cur.lines++;
    { const sp = spellproof.castInLine(raw); if (sp) spellproof.noteSeen(spellsSeen, sp, t); }
    if (!ev) {
      if (guess) { const msg = raw.slice(raw.indexOf('] ') + 2); if (!guess.groupLine(msg)) guess.landed(msg, t, t - lastGroupT > SOLO_MS); }
      return;
    }
    tracker.feed(ev);
    if (guess) {
      if (ev.type === 'cast' && ev.caster === YOU) guess.cast(ev.spell, t);
      else if (ev.type === 'zonemap' && ev.trio && ev.player && char && ev.player.toLowerCase() === String(char).toLowerCase()) guess.who(ev.trio, t);
    }
    if (ev.type === 'damage' && ev.attacker !== YOU && !ev.pet && /^[A-Z][a-z]+$/.test(ev.attacker || '') && tracker.current &&
        tracker.current.enemies.has(ev.target) && !tracker.current.enemies.has(ev.attacker)) lastGroupT = t;
    switch (ev.type) {
      case 'zone': if (ev.zone && cur.zones[cur.zones.length - 1] !== ev.zone && !cur.zones.includes(ev.zone)) cur.zones.push(ev.zone); zoneNow = cleanZone(ev.zone); tierNow = tierNum(ev.variant); break;
      case 'exp': if (ev.pct) cur.xpPct += ev.pct; break;
      case 'levelup': cur.levels++; break;
      case 'aa': cur.aa += ev.gained || 0; break;
      case 'coin': cur.coin += ev.copper || 0; break;
      case 'loot': cur.items++; if (/\bmote\b/i.test(ev.item || '')) cur.motes++; if (ev.soldFor) cur.coin += ev.soldFor; break;
      case 'death':
        if (ev.target === YOU) { if (!cur.deaths.length || t - cur.lastDeath > 5000) cur.deaths.push((ev.killer ? 'Slain by ' + ev.killer : 'Died') + ' — ' + new Date(t).toLocaleTimeString()); cur.lastDeath = t; }
        else {
          cur.kills++;
          if (zoneNow && ev.target) {
            const k = zoneNow + '\u0001' + ev.target;
            const a = killTimes.get(k) || [];
            const secs = tracker.engagedSecs ? tracker.engagedSecs(ev.target, t) : null;
            const kt = { t, d: tierNow };
            if (secs != null) kt.s = secs;
            const mk = guess && guess.makeup(t);
            if (mk) kt.c = mk.text;
            kt.g = tracker.othersInFight().length ? 1 : 0;
            a.push(kt); killTimes.set(k, a);
          }
        }
        break;
      case 'skillup': { const e = cur.skills.get(ev.skill) || { from: ev.value - 1, to: ev.value, n: 0 }; e.to = Math.max(e.to, ev.value); e.n++; cur.skills.set(ev.skill, e); break; }
      case 'faction': { const e = cur.factions.get(ev.faction) || { net: 0, n: 0 }; e.net += ev.delta; e.n++; cur.factions.set(ev.faction, e); break; }
      case 'stance': cur.stance = ev.stance; break;
      case 'chat':
        if (prices && MARKET.has(ev.channel) && ev.from !== YOU)
          for (const o of prices.parseOffers(ev.text)) offers.push({ ...o, t, from: ev.from, raw: ev.text });
        break;
      case 'damage':
        if (ev.attacker === YOU && cur.stance && ev.amount > 0) {
          const st = cur.stances.get(cur.stance) || { dmg: 0, ms: 0, last: 0 };
          st.ms += st.last && t - st.last <= 6000 ? Math.max(0, t - st.last) : 1000;
          st.last = t; st.dmg += ev.amount; cur.stances.set(cur.stance, st);
        }
        break;
    }
  }
  function finish() { close(); return sessions; }
  return {
    line, finish, offers: () => offers, spellsSeen: () => spellsSeen,
    killTimes: () => [...killTimes].map(([k, times]) => { const [zone, mob] = k.split('\u0001'); return { zone, mob, times }; })
  };
}

module.exports = { createImporter, GAP_MS, SOLO_MS, cleanZone };
