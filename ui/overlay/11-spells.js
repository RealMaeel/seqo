// SEQO overlay — spell engine (the game's own spell files) and manual spell timers.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= 🧪 spell engine (the game's own spell files) ============
  // Main parses spells_us.txt / spells_us_str.txt / SpellStackingGroups.txt
  // from the install folder (cached per patch) and hands over compact maps:
  // exact cast-on-you lines, exact fade lines, stacking groups, the planner
  // pool of player buffs, and descriptions.
  let spellDB = null;
  let spellDbError = '';
  const spellByName = new Map();    // lower name -> [player-castable records]
  const activeBuffs = new Map();    // lower name -> {name,id,at,durS,est,ben}
  let classDirty = false;

  function spellDbInit() {
    window.overlay.getSpellDB().then((db) => {
      if (!db || db.error) { spellDbError = (db && db.error) || 'spell data unavailable'; return; }
      spellDB = db;
      spellDbError = '';
      spellByName.clear();
      for (const sp of Object.values(db.spells)) {
        if (!sp.cls) continue;
        const k = sp.n.toLowerCase();
        if (!spellByName.has(k)) spellByName.set(k, []);
        spellByName.get(k).push(sp);
      }
      classDirty = true;
      if (activeTab === 'class') renderClassTab();
    }).catch(() => { spellDbError = 'spell data unavailable'; });
  }
  setTimeout(spellDbInit, 2500); // off the startup path; cached loads are instant

  // classic duration formulas (ticks of 6s), capped at base
  function durTicks(formula, base, level) {
    let t;
    switch (+formula) {
      case 0: return 0;
      case 1: t = Math.ceil(level / 2); break;
      case 2: t = Math.ceil(level / 2) + 5; break;
      case 3: t = level * 30; break;
      case 4: t = 50; break;
      case 5: t = 2; break;
      case 6: t = Math.ceil(level / 2) + 2; break;
      case 7: t = level; break;
      case 8: t = level + 10; break;
      case 9: t = level * 2 + 10; break;
      case 10: t = level * 3 + 10; break;
      case 11: case 12: case 15: t = base; break;
      case 50: return -1; // permanent until cancelled
      default: t = base;
    }
    return base ? Math.min(t, base) : t;
  }
  const myLevel = () => (settings && settings.myLevel) || (typeof xp !== 'undefined' && xp.level) || 50;
  function buffDurS(sp, level) {
    const t = durTicks(sp.durF, sp.durB, level || 50);
    return t < 0 ? null : t * 6; // null = permanent-until-cancelled
  }

  // a cast-on-you line matched exactly: a lasting effect just landed on you
  function noteBuffLand(msg) {
    if (!spellDB) return false;
    const ids = spellDB.landMap[msg];
    if (!ids || !ids.length) return false;
    let sp = null;
    for (const id of ids) { // prefer the player-castable record
      const r = spellDB.spells[id];
      if (r && (!sp || (r.cls && !sp.cls))) sp = r;
    }
    if (!sp) return false;
    // my own cast within the last 8s = exact duration at my level
    const mine = lastYouCast && Date.now() - lastYouCast.when < 8000 &&
                 lastYouCast.spell.toLowerCase() === sp.n.toLowerCase();
    activeBuffs.set(sp.n.toLowerCase(), {
      name: sp.n, id: sp.id, at: Date.now(),
      durS: buffDurS(sp, myLevel()), est: !mine, ben: !!sp.ben,
      ids: ids.slice()   // every spell sharing this landing line (Chant of Battle / Verses of Victory…)
    });
    classDirty = true;
    return true;
  }

  // the exact fade line, straight from the game's string table
  function spellFadeNames(effect, verb) {
    if (!spellDB) return null;
    for (const c of ['The ' + effect + ' ' + verb + '.', 'Your ' + effect + ' ' + verb + '.',
                     'The ' + effect + ' fades.', 'Your ' + effect + ' fades.'])
      if (spellDB.fadeMap[c]) return spellDB.fadeMap[c];
    return null;
  }

  // why a cast "did not take hold": the game's own stacking groups
  function stackBlockInfo(spellName) {
    if (!spellDB) return null;
    const want = spellName.toLowerCase();
    for (const rec of spellByName.get(want) || []) {
      const st = spellDB.stacking[rec.id];
      if (!st) continue;
      for (const b of activeBuffs.values()) {
        if (b.name.toLowerCase() === want) continue;
        const bs = spellDB.stacking[b.id];
        if (bs && bs.g === st.g) return { blocker: b.name, mine: st.r, theirs: bs.r };
      }
    }
    return null;
  }

  // sweep: drop tracked buffs well past their run time (missed fade line)
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [k, b] of activeBuffs) {
      if (b.durS != null && now - b.at > (b.durS + 600) * 1000) { activeBuffs.delete(k); changed = true; }
    }
    if (changed) classDirty = true;
    if (classDirty && activeTab === 'class') { classDirty = false; renderClassTab(); }
  }, 2000);

  // ---- manual spell timers: "Mesmerization = 42" -> countdown on cast ----
  // Every cast gets its OWN timer instance (mez on 3 mobs = 3 chips).
  // A "worn off of X" removes one instance; the rest keep counting.
  let spellTimerConfig = [];        // [{name(lower), label, seconds}]
  let activeSpellTimers = [];       // [{label, cfgName, expires, seconds, castSpell, warned}]
  const MAX_TIMERS_PER_SPELL = 8;

  // "Mesmerization VI" -> "mesmerization" (rank-insensitive matching)
  const spellBase = (s) => s.toLowerCase().replace(/ (?:[ivxl]+|\d+)$/, '');

  function parseDuration(s) {
    s = s.trim();
    const mmss = /^(\d+):(\d{1,2})$/.exec(s);
    if (mmss) return +mmss[1] * 60 + +mmss[2];
    const suffixed = /^(\d+(?:\.\d+)?)\s*(h|hr|m|min|s|sec)?s?\.?$/i.exec(s);
    if (suffixed) {
      const n = +suffixed[1];
      const u = (suffixed[2] || 's').toLowerCase();
      return u.startsWith('h') ? n * 3600 : u.startsWith('m') ? n * 60 : n;
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function rebuildSpellTimerConfig() {
    spellTimerConfig = [];
    for (const row of (settings && settings.spellTimers || '').split('\n')) {
      const i = row.indexOf('=');
      if (i < 1) continue;
      const label = row.slice(0, i).trim();
      const seconds = parseDuration(row.slice(i + 1));
      if (label && seconds > 0) spellTimerConfig.push({ name: label.toLowerCase(), label, seconds });
    }
  }

  function onYouCast(spell) {
    const s = spell.toLowerCase();
    for (const cfg of spellTimerConfig) {
      // configured name matches the cast exactly or as a rank prefix
      // ("Mesmerization" tracks "Mesmerization VI")
      if (s === cfg.name || s.startsWith(cfg.name + ' ')) {
        const count = activeSpellTimers.filter(t => t.label === cfg.label).length;
        if (count >= MAX_TIMERS_PER_SPELL) {
          // safety cap: drop the oldest instead of growing forever
          const oldest = activeSpellTimers.findIndex(t => t.label === cfg.label);
          if (oldest >= 0) activeSpellTimers.splice(oldest, 1);
        }
        activeSpellTimers.push({
          label: cfg.label,
          cfgName: cfg.name,
          expires: Date.now() + cfg.seconds * 1000,
          seconds: cfg.seconds,
          castSpell: spell,
          warned: false
        });
        renderSpellTimers();
      }
    }
  }

  function onCastFail(spell) {
    // "did not take hold": the game's stacking table usually knows WHY
    if (spell) {
      const sb = stackBlockInfo(spell);
      if (sb) {
        toast('🚫 ' + spell + ' didn\'t take hold — blocked by ' + sb.blocker +
          (sb.mine > sb.theirs ? ' (yours is STRONGER — click the old buff off, then recast)'
                               : ' (what\'s on you is as strong or stronger — recasting gains nothing)'));
      }
    }
    // the cast never landed: kill the NEWEST young timer for it
    // (one fail = one cast; older instances are still live on their mobs)
    for (let i = activeSpellTimers.length - 1; i >= 0; i--) {
      const t = activeSpellTimers[i];
      if (t.manual || t.cooldown) continue;   // hand-started timers + reuse timers ignore this (see cancelCooldown)
      if (spell === null || t.castSpell.toLowerCase() === spell.toLowerCase()) {
        if (Date.now() - (t.expires - t.seconds * 1000) < 15000) {
          activeSpellTimers.splice(i, 1);
          break;
        }
      }
    }
    renderSpellTimers();
  }

  function onSpellWornOff(spell, target) {
    // "Your Mesmerization spell has worn off of X." - retire X's chip when we
    // have per-target chips; otherwise fall back to the oldest generic chip.
    // Wear-off lines may omit the rank, so match rank-insensitively.
    const base = spellBase(spell);
    const matches = (t) => !t.manual && (spellBase(t.castSpell) === base || t.cfgName === base);
    const tk = target ? mobKey(target) : null;
    let i = tk ? activeSpellTimers.findIndex(t => matches(t) && t.target === tk) : -1;
    if (i < 0) i = activeSpellTimers.findIndex(t => matches(t) && !t.target);
    if (i < 0 && !tk) i = activeSpellTimers.findIndex(matches);
    if (i >= 0) { activeSpellTimers.splice(i, 1); renderSpellTimers(); }
  }

  // AE-landing spells (mez): "X has been mesmerized." names each target,
  // so chips become per-mob - the generic chip from the cast is replaced.
  function onSpellLanded(target, when) {
    if (!lastYouCast || (when - lastYouCast.when) > 8000) return;
    const s = lastYouCast.spell.toLowerCase();
    const cfg = spellTimerConfig.find(c => s === c.name || s.startsWith(c.name + ' '));
    if (!cfg) return;
    // retire the untargeted chip this cast created
    const gi = activeSpellTimers.findIndex(t => !t.manual && !t.target &&
      t.castSpell.toLowerCase() === s);
    if (gi >= 0) activeSpellTimers.splice(gi, 1);
    // fresh landing on an already-mezzed mob refreshes its chip
    const existing = activeSpellTimers.find(t => t.target === target && t.cfgName === cfg.name);
    if (existing) { existing.expires = Date.now() + cfg.seconds * 1000; existing.warned = false; }
    else activeSpellTimers.push({
      label: cfg.label, cfgName: cfg.name, target,
      expires: Date.now() + cfg.seconds * 1000, seconds: cfg.seconds,
      castSpell: lastYouCast.spell, warned: false
    });
    renderSpellTimers();
  }

  function onSpellBroken(target) {
    const before = activeSpellTimers.length;
    activeSpellTimers = activeSpellTimers.filter(t => t.target !== target);
    if (activeSpellTimers.length !== before) renderSpellTimers();
  }

  function renderSpellTimers() {
    const bar = $('spelltimers');
    if (!activeSpellTimers.length) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = '';
    const now = Date.now();
    // soonest-to-expire first: the leftmost chip is the next re-cast you owe
    for (const t of [...activeSpellTimers].sort((a, b) => a.expires - b.expires)) {
      const left = (t.expires - now) / 1000;
      const chip = document.createElement('span');
      chip.className = 'stchip' + (left <= 6 ? ' low' : '');
      chip.innerHTML = (t.cooldown ? '⏳ ' : t.manual ? '⏲ ' : '⏱ ') + '<span class="sn"></span><span class="st"></span>';
      chip.querySelector('.sn').textContent = t.target
        ? t.label + ' · ' + t.target.replace(/^(?:a|an|the) /i, '')
        : t.label;
      if (t.target) chip.title = t.castSpell + ' on ' + t.target;
      chip.querySelector('.st').textContent = left > 0 ? fmtDur(Math.max(0, left)) : (t.cooldown ? 'READY' : 'UP!');
      if (t.cooldown) {
        chip.title = t.label + ' — reuse timer from the game\'s spell file. Click to dismiss.';
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', () => { activeSpellTimers = activeSpellTimers.filter(x => x !== t); renderSpellTimers(); });
      }
      if (t.manual) {
        chip.title = 'Manual timer — click to cancel';
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', () => {
          activeSpellTimers = activeSpellTimers.filter(x => x !== t);
          renderSpellTimers();
        });
      }
      bar.appendChild(chip);
    }
  }

  // reuse ("recast") timers for your own long-cooldown spells — Lay on Hands,
  // Harm Touch, Divine Aura… straight from the spell file, no per-class packs
  function startCooldown(spell) {
    if (!spell || !spellDB || !spellDB.recast || (settings && settings.cooldownTimers === false)) return;
    const rc = spellDB.recast[spell];
    if (!rc || rc.r < ((settings && settings.cooldownMin) || 30)) return;
    activeSpellTimers = activeSpellTimers.filter(t => !(t.cooldown && t.castSpell === spell));  // recast = restart
    const secs = rc.r + Math.round((rc.c || 0) / 1000);
    activeSpellTimers.push({ label: spell, cfgName: null, cooldown: true, expires: Date.now() + secs * 1000,
                             seconds: secs, castSpell: spell, startedAt: Date.now(), warned: false });
    renderSpellTimers();
  }
  function cancelCooldown(spell) {
    if (!spell) return;
    const before = activeSpellTimers.length;
    // the cast never went off: no reuse timer (only the one started in the last ~15s)
    activeSpellTimers = activeSpellTimers.filter(t => !(t.cooldown && t.castSpell === spell && Date.now() - t.startedAt < 15000));
    if (activeSpellTimers.length !== before) renderSpellTimers();
  }

  // opts (custom alerts, 2.7): warnSecs = ⏳ heads-up that long before the end (GINA's "timer ending"),
  // doneText = what to say when it runs out, speak = say the heads-up / end aloud too
  function startManualTimer(label, seconds, opts = {}) {
    label = label || 'Timer';
    // the same timer started again (the mob died again) restarts it instead of stacking a second chip
    activeSpellTimers = activeSpellTimers.filter(x => !(x.manual && x.label === label));
    activeSpellTimers.push({
      label, cfgName: null, manual: true,
      expires: Date.now() + seconds * 1000, seconds, castSpell: '', warned: false,
      warnSecs: +opts.warnSecs > 0 && +opts.warnSecs < seconds ? +opts.warnSecs : 0, soonWarned: false,
      doneText: opts.doneText || '', speak: !!opts.speak
    });
    renderSpellTimers();
  }

  setInterval(() => { // countdowns + expiry alerts
    if (!activeSpellTimers.length) return;
    const now = Date.now();
    for (const t of activeSpellTimers) {
      if (t.warnSecs && !t.soonWarned && now >= t.expires - t.warnSecs * 1000 && now < t.expires) {
        t.soonWarned = true;
        const left = (t.expires - now) / 1000;
        alertFX('⏳ ' + t.label + ' in ' + EQLSpawnWarn.lead(left), 'repop');
        if (t.speak) speak(t.label + ' in ' + EQLSpawnWarn.leadSaid(left));
        continue;
      }
      if (!t.warned && now >= t.expires && t.doneText) {
        t.warned = true;
        alertFX(t.doneText, 'repop');
        if (t.speak) speak(t.doneText);
      } else if (!t.warned && now >= t.expires && t.cooldown) {
        t.warned = true;
        alertFX('✅ ' + t.label + ' is ready', 'heads');
      } else if (!t.warned && now >= t.expires) {
        t.warned = true;
        alertFX('⏱ ' + t.label + (t.target ? ' up: ' + t.target.replace(/^(?:a|an|the) /i, '') + '!' : ' timer up!'), 'repop');
      }
    }
    activeSpellTimers = activeSpellTimers.filter(t => now - t.expires <= 5000); // linger 5s then clear
    renderSpellTimers();
  }, 500);

  // fade-watch: exact flavor lines mapped to spell names (self-buffs fade
  // without the spell name, e.g. Clarity -> "Your thoughts slow.")
  let fadeWatch = new Map();
  function rebuildFadeWatch() {
    fadeWatch = new Map();
    for (const row of (settings && settings.buffWatch || '').split('\n')) {
      const i = row.indexOf('=');
      if (i < 1) continue;
      const spell = row.slice(0, i).trim();
      const line = row.slice(i + 1).trim();
      if (spell && line) fadeWatch.set(line, spell);
    }
  }

  // buff drops: toast + soft sound, no border flash (informational, not urgent)
  const buffAlertSeen = new Map();      // subject -> last alert time (anti-spam)
  const sessionAlertSubjects = new Map(); // subject -> display label, for the mute list
  const muteKey = (s) => s.replace(/^fw\|/, '').toLowerCase();

  function buffAlert(msg, subject) {
    if (settings && settings.buffAlerts === false) return;
    const key = muteKey(subject);
    if (!sessionAlertSubjects.has(key)) {
      sessionAlertSubjects.set(key, msg.replace(/^(Buff (dropped|fade)|Debuff gone|Faded): /, ''));
      if (document.body.classList.contains('settings-open')) renderMuteList();
    }
    if ((settings.mutedAlerts || []).includes(key)) return; // user muted this one
    const last = buffAlertSeen.get(key) || 0;
    if (Date.now() - last < 5000) return;
    buffAlertSeen.set(key, Date.now());
    toast('🫧 ' + msg, true);
    if (!settings || settings.alertSound !== false) playPattern('buff');
  }

  function renderMuteList() {
    const el = $('mutelist');
    const muted = settings.mutedAlerts || [];
    const all = new Map(sessionAlertSubjects);
    for (const m of muted) if (!all.has(m)) all.set(m, m); // muted-but-not-seen still listed
    el.innerHTML = '';
    if (!all.size) { el.textContent = 'nothing alerted yet this session'; return; }
    for (const [key, label] of [...all.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:1px 0';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = muted.includes(key);
      cb.addEventListener('change', () => {
        let list = settings.mutedAlerts || [];
        list = cb.checked ? [...new Set([...list, key])] : list.filter(x => x !== key);
        save({ mutedAlerts: list });
        renderMuteList();
      });
      const span = document.createElement('span');
      span.textContent = label;
      span.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' +
        (cb.checked ? ';color:#666;text-decoration:line-through' : '');
      row.append(cb, span);
      el.appendChild(row);
    }
  }

  function checkRare(name, when) {
    if (!name || name === 'You') return;
    const key = mobKey(name);
    const camped = timers.get(key);
    if (!isRareMob(key) && !(camped && camped.pinned)) return;
    const last = rareSeen.get(key) || 0;
    if (Date.now() - last < 300000) return; // 5 min per-mob cooldown
    rareSeen.set(key, Date.now());
    alertFX('⭐ RARE UP: ' + key + '!', 'rare');
  }
