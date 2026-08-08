// EQL Overlay - log parser + fight tracker
// Works in both Node (tests) and the Electron renderer.
// Line formats verified against a real EverQuest Legends log (Aug 2026).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // ---------- timestamp ----------
  const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
  const RE_TS = /^\[\w{3} (\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})\] (.*)$/;

  // ---------- combat lines ----------
  const VERBS = '(?:hits?|slash(?:es)?|pierc(?:es|e)|crush(?:es)?|bash(?:es)?|kick(?:s)?|punch(?:es)?|backstab(?:s)?|bit(?:es|e)|claw(?:s)?|gor(?:es|e)|maul(?:s)?|reav(?:es|e)|cleav(?:es|e)|sting(?:s)?|strik(?:es|e)|smash(?:es)?|slic(?:es|e)|rend(?:s)?|frenz(?:ies|y)(?: on)?)';

  // "You hit Drelzna for 222 points of magic damage by Spirit Tap." (Critical)
  const RE_SPELL = new RegExp('^(.+?) hit (.+?) for (\\d+) points? of ([\\w-]+) damage by (.+?)\\.(?: \\((.+?)\\))?$');
  // "You slash Drelzna for 49 points of damage." / "Drelzna pierces YOU for 28 points of damage." (Critical)
  const RE_MELEE = new RegExp('^(.+?) ' + VERBS + ' (.+?) for (\\d+) points? of damage\\.(?: \\((.+?)\\))?$');
  // "Drelzna has taken 22 damage from Tainted Breath by Gabn."
  const RE_DOT = /^(.+?) has taken (\d+) damage from (.+?) by (.+?)\.$/;
  // "A shin ghoul knight has taken 25 damage from your Heart Flutter."
  const RE_DOT_YOURS = /^(.+?) has taken (\d+) damage from your (.+?)\.$/;
  // "You have taken 15 damage from Blood Claw by Drelzna."
  const RE_DOT_ON_YOU = /^You have taken (\d+) damage from (.+?) by (.+?)\.$/;
  // "YOU are burned by a skeleton's flames for 7 points of non-melee damage!"
  const RE_NONMELEE = /^(.+?) (?:is|are) \w+ by (.+?) for (\d+) points? of non-melee damage[.!]$/;
  // "You healed Maeel for 222 hit points by Spirit Tap." / "... for 0 (20) hit points by Courage."
  const RE_HEAL = /^(.+?) healed (.+?) for (\d+)(?: \((\d+)\))? hit points?(?: by (.+?))?\.$/;
  // misses: "You try to reave Drelzna, but miss!" / "Drelzna tries to pierce YOU, but YOU parry!"
  const RE_MISS = new RegExp('^(.+?) tr(?:ies|y) to ' + VERBS.replace('(?: on)?', '') + ' (.+?), but .+[.!]$');
  const RE_SLAIN_BY_YOU = /^You have slain (.+?)!$/;
  const RE_SLAIN = /^(.+?) ha(?:s|ve) been slain by (.+?)!$/;
  const RE_YOU_SLAIN = /^You have been slain by (.+?)!$/;
  // "You begin casting Spirit Tap." / "A dread skeleton begins casting Alacrity."
  const RE_CAST = /^(.+?) begins? casting (.+?)\.$/;
  // All corpse-loot variants:
  //   "--You have looted a Lizard Tail from a lizard justicar's corpse.--"   (kept)
  //   "--You have looted 2 Phosphorous Powder from a ghoul savant's corpse.--" (stack)
  //   "You looted a Bloodstained Key from Drelzna's corpse and sold it for 1 copper."
  //   "You looted a Necromancer Blood from a necromancer's corpse and stored it in your Dragon Hoard"
  //   "You looted a Stiletto of the Bloodclaw +4 from Drelzna's corpse to create ..."
  const RE_LOOT = /^-{0,2}You (?:have )?looted (?:(\d+) )?(.+?) from (.+?)'s corpse\.?(?:\s+(?:and sold it for (.+?)\.|and stored it\b.*|to create\b.*))?-{0,2}$/;
  // "--You have looted a Rusty Sword.--"  (no corpse name in line)
  const RE_LOOT_SIMPLE = /^-{0,2}You (?:have )?looted (?:(\d+) )?(.+?)\.-{0,2}$/;
  // "You receive 7 silver and 5 copper from the corpse."
  const RE_COIN = /^You receive (.+?) from the corpse\.$/;

  const COIN_VALUES = { platinum: 1000, gold: 100, silver: 10, copper: 1 };
  function parseCoins(str) {
    let total = 0, m;
    const re = /(\d+) (platinum|gold|silver|copper)/g;
    while ((m = re.exec(str))) total += +m[1] * COIN_VALUES[m[2]];
    return total; // in copper
  }

  // "a Stiletto of the Bloodclaw +4" -> "Stiletto of the Bloodclaw"
  const normItem = (n) => n.replace(/^(?:a|an|the) /i, '').replace(/ \+\d+$/, '');

  const YOU = 'You';
  const isYou = (n) => n === 'You' || n === 'YOU' || n === 'you';
  // "a skeleton's flames" -> "a skeleton"
  const stripPossessive = (n) => { const m = /^(.+?)'s .+$/.exec(n); return m ? m[1] : n; };

  function parseLine(line) {
    const ts = RE_TS.exec(line);
    if (!ts) return null;
    const when = new Date(+ts[6], MONTHS[ts[1]] ?? 0, +ts[2], +ts[3], +ts[4], +ts[5]).getTime();
    const msg = ts[7];
    let m;

    if ((m = RE_SPELL.exec(msg)))
      return { type: 'damage', when, attacker: isYou(m[1]) ? YOU : m[1], target: isYou(m[2]) ? YOU : m[2],
               amount: +m[3], spell: m[5], crit: !!m[6], kind: 'spell' };

    if ((m = RE_MELEE.exec(msg)))
      return { type: 'damage', when, attacker: isYou(m[1]) ? YOU : m[1], target: isYou(m[2]) ? YOU : m[2],
               amount: +m[3], crit: !!m[4], kind: 'melee' };

    if ((m = RE_DOT_ON_YOU.exec(msg)))
      return { type: 'damage', when, attacker: m[3], target: YOU, amount: +m[1], spell: m[2], kind: 'dot' };

    if ((m = RE_DOT_YOURS.exec(msg)))
      return { type: 'damage', when, attacker: YOU, target: isYou(m[1]) ? YOU : m[1], amount: +m[2], spell: m[3], kind: 'dot' };

    if ((m = RE_DOT.exec(msg)))
      return { type: 'damage', when, attacker: isYou(m[4]) ? YOU : m[4], target: isYou(m[1]) ? YOU : m[1],
               amount: +m[2], spell: m[3], kind: 'dot' };

    if ((m = RE_NONMELEE.exec(msg))) {
      // "... burned by YOUR flames ..." = your damage shield;
      // "... pierced by a ghoul knight's thorns ..." = someone else's
      const src = m[2];
      const attacker = /^YOUR\b/i.test(src) ? YOU : stripPossessive(src);
      return { type: 'damage', when, attacker, target: isYou(m[1]) ? YOU : m[1],
               amount: +m[3], kind: 'proc' };
    }

    if ((m = RE_HEAL.exec(msg)))
      return { type: 'heal', when, healer: isYou(m[1]) ? YOU : m[1], target: isYou(m[2]) ? YOU : m[2],
               amount: +m[3], potential: m[4] ? +m[4] : +m[3], spell: m[5] };

    if ((m = RE_MISS.exec(msg)))
      return { type: 'miss', when, attacker: isYou(m[1]) ? YOU : m[1], target: isYou(m[2]) ? YOU : m[2] };

    if ((m = RE_SLAIN_BY_YOU.exec(msg)))
      return { type: 'death', when, target: m[1], killer: YOU };
    if ((m = RE_YOU_SLAIN.exec(msg)))
      return { type: 'death', when, target: YOU, killer: m[1] };
    if ((m = RE_SLAIN.exec(msg)))
      return { type: 'death', when, target: m[1], killer: m[2] };

    if ((m = RE_CAST.exec(msg)))
      return { type: 'cast', when, caster: isYou(m[1]) ? YOU : m[1], spell: m[2] };

    // casts that fail: these cancel manual spell timers
    if ((m = /^Your (.+?) spell is interrupted\.$/.exec(msg)))
      return { type: 'castfail', when, spell: m[1], reason: 'interrupted' };
    if ((m = /^(.+?) resisted your (.+?)!$/.exec(msg)))
      return { type: 'castfail', when, spell: m[2], reason: 'resisted', target: m[1] };
    if ((m = /^Your (.+?) spell did not take hold\./.exec(msg)))
      return { type: 'castfail', when, spell: m[1], reason: 'did not take hold' };
    if (/^Your spell fizzles!$/.test(msg))
      return { type: 'castfail', when, spell: null, reason: 'fizzled' };

    // "Your Cajoling Whispers spell has worn off of a zol ghoul knight."
    if ((m = /^Your (.+?) spell has worn off of (.+?)\.$/.exec(msg)))
      return { type: 'wornoff', when, spell: m[1], target: m[2] };

    // "Your pet's Inner Fire spell has worn off."
    if ((m = /^Your pet's (.+?) spell has worn off\.$/.exec(msg)))
      return { type: 'wornoffpet', when, spell: m[1] };

    // "Your Invisibility spell has worn off."  (self-buff, no target)
    if ((m = /^Your (.+?) spell has worn off\.$/.exec(msg)))
      return { type: 'wornoffself', when, spell: m[1] };

    // invisibility ending: warning first, then the drop
    if (/^You feel yourself starting to appear\.$/.test(msg))
      return { type: 'invisfade', when };
    if (/^You appear\.$/.test(msg))
      return { type: 'invisdrop', when };

    // EQ Legends uses a uniform fade format for effects ending on you:
    // "The cool breeze fades." / "Your strength fades."
    if ((m = /^(?:The|Your) (.+) fades\.$/.exec(msg)))
      return { type: 'bufffade', when, effect: m[1] };

    if ((m = RE_LOOT.exec(msg)))
      return { type: 'loot', when, item: normItem(m[2]), rawItem: m[2], mob: m[3],
               count: m[1] ? +m[1] : 1, soldFor: m[4] ? parseCoins(m[4]) : 0 };

    if ((m = RE_LOOT_SIMPLE.exec(msg)))
      return { type: 'loot', when, item: normItem(m[2]), rawItem: m[2], mob: null,
               count: m[1] ? +m[1] : 1, soldFor: 0 };

    if ((m = RE_COIN.exec(msg)))
      return { type: 'coin', when, copper: parseCoins(m[1]) };

    // pet speech addresses you as Master - covers summoned AND charmed pets:
    //   "Xonektik says, 'Sorry, Master... calming down.'"
    //   "A wan ghoul knight told you, 'Attacking a ghoul savant Master.'"
    if ((m = /^(.+?) (?:says|tells you|told you),? '(?:Attacking .+ [Mm]aster|At your service|Sorry,? [Mm]aster|I am unable to wake|Following you|Guarding with my life|As you wish|Changing position|Waiting here|I live again|Consider it done|It will be done|By your command)[^']*'\.?$/.exec(msg)))
      return { type: 'petsay', when, name: m[1] };

    if ((m = /^You have entered (.+?)\.$/.exec(msg)) && !/^an area\b|^the Arena\b/i.test(m[1])) {
      // "Temple of Cazic-Thule 4 (Refined)": the number is an instance id
      // (discard), the parenthetical is the DIFFICULTY tier (keep separately)
      const vm = /\(([^)]+)\)\s*$/.exec(m[1]);
      const variant = vm ? vm[1].trim() : '';
      const zone = m[1].replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+\d+\s*$/, '').trim();
      return { type: 'zone', when, zone, variant };
    }

    // "Your Location is -168.90, -240.49, 3.75"  (north-south, east-west, elevation)
    if ((m = /^Your Location is (-?[\d.]+), (-?[\d.]+), (-?[\d.]+)/.exec(msg)))
      return { type: 'loc', when, ns: +m[1], ew: +m[2], z: +m[3] };

    // /who all output includes the zone's short name:
    //   "... ZONE: The Feerrott (feerrott)"
    //   "... ZONE: Nagafen's Lair 1160 (soldungb_1160)"   (instanced)
    if ((m = /ZONE: (.+?)(?: \d+)? \(([a-z0-9]+?)(?:_\d+)?\)/i.exec(msg)))
      return { type: 'zonemap', when, longName: m[1].trim(), shortName: m[2].toLowerCase() };

    return null;
  }

  // ------------------------------------------------------------------
  // FightTracker: groups events into fights separated by idle gaps.
  // ------------------------------------------------------------------
  const FIGHT_GAP_MS = 8000;

  // Normalize NPC article capitalization: "A necromancer" === "a necromancer"
  const normName = (n) => n.replace(/^(A|An|The) /, (m) => m.toLowerCase());

  function newFight(when) {
    return {
      start: when, lastCombat: when,
      events: [],             // damage events (attacker, target, amount, crit)
      misses: new Map(),      // attacker -> miss count (vs non-you targets)
      healingBy: new Map(),   // name -> actual healing
      enemies: new Set(),     // entities you attacked or that attacked you
      kills: []
    };
  }

  const CAST_WINDOW_MS = 15000; // spell damage within 15s of its cast = cast, not proc

  class FightTracker {
    constructor() {
      this.current = null;
      this.last = null;
      this.lastFeedWallclock = 0;
      this.casts = new Map(); // "caster|spell" -> last cast timestamp
    }

    _isProc(ev) {
      if (ev.kind !== 'spell' || !ev.spell) return false;
      const t = this.casts.get(ev.attacker + '|' + ev.spell);
      return !(t && ev.when - t <= CAST_WINDOW_MS);
    }

    _maybeEnd(when) {
      if (this.current && when - this.current.lastCombat > FIGHT_GAP_MS) this.end();
    }

    end() {
      if (!this.current) return;
      const hadEvents = this.current.events.length > 0;
      if (hadEvents) this.last = this.current;
      this.current = null;
      if (hadEvents && this.onFightEnd) this.onFightEnd(this.summary());
    }

    feed(line) {
      const ev = typeof line === 'string' ? parseLine(line) : line;
      if (!ev) return null;

      if (ev.type === 'damage') {
        this._maybeEnd(ev.when);
        if (!this.current) this.current = newFight(ev.when);
        const f = this.current;
        f.lastCombat = ev.when;
        this.lastFeedWallclock = Date.now();

        const attacker = ev.attacker === YOU ? YOU : normName(ev.attacker);
        const target = ev.target === YOU ? YOU : normName(ev.target);
        const proc = this._isProc(ev);
        const source =
          ev.kind === 'melee' ? 'Melee' :
          ev.kind === 'proc' ? 'Damage Shield' :
          (ev.spell || 'Unknown');
        f.events.push({ attacker, target, amount: ev.amount, crit: !!ev.crit,
                        source, kind: ev.kind, proc,
                        pet: !!(this.petNames && this.petNames.has(attacker)) });

        // build the enemy set: whoever you attack, or attacks you, is an enemy
        if (attacker === YOU) f.enemies.add(target);
        if (target === YOU) f.enemies.add(attacker);
      } else if (ev.type === 'heal' && this.current) {
        const healer = ev.healer === YOU ? YOU : normName(ev.healer);
        this.current.healingBy.set(healer, (this.current.healingBy.get(healer) || 0) + ev.amount);
      } else if (ev.type === 'miss' && this.current && ev.target !== YOU) {
        const attacker = ev.attacker === YOU ? YOU : normName(ev.attacker);
        this.current.misses.set(attacker, (this.current.misses.get(attacker) || 0) + 1);
      } else if (ev.type === 'death' && this.current) {
        this.current.kills.push(ev.target);
      } else if (ev.type === 'cast') {
        const caster = ev.caster === YOU ? YOU : normName(ev.caster);
        this.casts.set(caster + '|' + ev.spell, ev.when);
        if (this.casts.size > 500) { // prune oldest
          const cutoff = ev.when - CAST_WINDOW_MS * 4;
          for (const [k, t] of this.casts) if (t < cutoff) this.casts.delete(k);
        }
      }
      return ev;
    }

    // wall-clock check: ends a live fight when the log goes quiet
    tick() {
      if (this.current && this.lastFeedWallclock && Date.now() - this.lastFeedWallclock > FIGHT_GAP_MS) this.end();
    }

    summary() {
      const f = this.current || this.last;
      if (!f) return null;
      const live = !!this.current;
      const durS = Math.max(1, (f.lastCombat - f.start) / 1000);

      // Meter rows: only damage dealt TO enemies (excludes enemy hits on allies).
      const byAttacker = new Map();
      const byTarget = new Map();
      let youTaken = 0;

      for (const e of f.events) {
        if (e.target === YOU) { youTaken += e.amount; continue; }
        if (!f.enemies.has(e.target)) continue;        // ally took a hit - not meter damage
        // enemy-on-enemy noise - EXCEPT damage flagged as pet's when it happened
        if (f.enemies.has(e.attacker) && e.attacker !== YOU && !e.pet) continue;
        let a = byAttacker.get(e.attacker);
        if (!a) byAttacker.set(e.attacker, a = { total: 0, maxHit: 0, crits: 0, hits: 0 });
        a.total += e.amount;
        a.hits += 1;
        if (e.amount > a.maxHit) a.maxHit = e.amount;
        if (e.crit) a.crits += 1;
        byTarget.set(e.target, (byTarget.get(e.target) || 0) + e.amount);
      }

      const rows = [...byAttacker.entries()]
        .map(([name, a]) => ({
          name, total: a.total, dps: a.total / durS, maxHit: a.maxHit,
          crits: a.crits, hits: a.hits, misses: f.misses.get(name) || 0
        }))
        .sort((x, y) => y.total - x.total);

      const grand = rows.reduce((s, r) => s + r.total, 0) || 1;
      rows.forEach(r => r.pct = r.total / grand);

      const targets = [...byTarget.entries()].sort((x, y) => y[1] - x[1]).map(t => t[0]);
      const you = rows.find(r => r.name === YOU) || { total: 0, dps: 0, maxHit: 0, crits: 0, hits: 0, misses: 0 };

      // Your damage by source (spell/melee/proc breakdown)
      const bySource = new Map();
      let youSwings = f.misses.get(YOU) || 0; // melee swings = melee hits + misses
      for (const e of f.events) {
        if (e.attacker !== YOU || e.target === YOU || !f.enemies.has(e.target)) continue;
        if (e.kind === 'melee') youSwings += 1;
        let s = bySource.get(e.source);
        if (!s) bySource.set(e.source, s = { source: e.source, total: 0, count: 0, crits: 0, max: 0, proc: !!e.proc });
        s.total += e.amount;
        s.count += 1;
        if (e.crit) s.crits += 1;
        if (e.amount > s.max) s.max = e.amount;
        if (!e.proc) s.proc = false; // any cast-confirmed use un-flags proc
      }
      const youBySource = [...bySource.values()].sort((a, b) => b.total - a.total);
      const youGrand = youBySource.reduce((s, r) => s + r.total, 0) || 1;
      for (const r of youBySource) {
        r.pct = r.total / youGrand;
        r.avg = r.total / r.count;
        if (r.proc && youSwings > 0) r.procRate = r.count / youSwings;
      }

      // pet damage aggregated from events flagged at the time they happened
      // (immune to charms breaking/dying before the fight ends)
      const petAgg = new Map();
      for (const e of f.events) {
        if (!e.pet || e.target === YOU || !f.enemies.has(e.target)) continue;
        let p = petAgg.get(e.attacker);
        if (!p) petAgg.set(e.attacker, p = { name: e.attacker, total: 0, hits: 0, crits: 0, maxHit: 0 });
        p.total += e.amount; p.hits += 1;
        if (e.crit) p.crits += 1;
        if (e.amount > p.maxHit) p.maxHit = e.amount;
      }
      const petRows = [...petAgg.values()].sort((a, b) => b.total - a.total);

      return {
        petRows, youBySource, youSwings,
        live, durS,
        title: targets.length ? targets[0] + (targets.length > 1 ? ` +${targets.length - 1}` : '') : '—',
        rows, you,
        youTaken,
        youHealed: f.healingBy.get(YOU) || 0,
        kills: f.kills.length
      };
    }
  }

  return { parseLine, FightTracker, YOU };
});
