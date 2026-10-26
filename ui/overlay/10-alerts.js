// SEQO overlay — alert sounds and flash, mez & slow alerts, invis alerts, fade attribution.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ---- alert effects: toast + border flash + a DISTINCT sound per alert kind ----
  // each pattern: [frequencyHz, durationS, gapAfterS]
  const SOUND_PATTERNS = {
    rare:  [[880, .18, .07], [880, .18, .07], [880, .18, 0]],                    // triple ping
    repop: [[880, .18, .07], [880, .18, 0]],                                     // double ping
    charm: [[620, .15, .05], [430, .32, 0]],                                     // descending "uh-oh"
    afk:   [[1250, .16, .04], [820, .16, .04], [1250, .16, .04], [820, .16, 0]], // hi-lo siren
    invis: [[500, .11, .04], [700, .11, .04], [950, .2, 0]],                     // rising sweep
    buff:  [[720, .14, .05], [540, .22, 0]],                                     // soft falling "boop"
    heads: [[700, .12, .05], [950, .2, 0]],                                      // rising "look!" (kill-time need)
    cc:    [[980, .09, .03], [980, .09, .03], [560, .26, 0]],                    // quick double + low thud (mez/slow gone)
    death: [[520, .2, .06], [390, .2, .06], [260, .45, 0]]                       // three falling notes (you died)
  };

  // ---- crowd control: a mez breaking or a mez/slow wearing off a mob ----
  // cc spells come from the game's own spell file (SPA 31 mez, SPA 11 < 100 slow)
  const mezSeen = new Map();   // mob -> when it was last seen mesmerized
  let ccLastAlert = new Map(); // mob|kind -> when, so one event never double-alerts

  function ccKindOf(spell) { return spellDB && spellDB.cc ? spellDB.cc[spell] || null : null; }
  function ccAlert(mob, kind, msg) {
    if (settings && settings.ccAlerts === false) return;
    const k = mob + '|' + kind, now = Date.now();
    if (now - (ccLastAlert.get(k) || 0) < 3000) return;
    ccLastAlert.set(k, now);
    alertFX(msg, 'cc');
  }

  let audioCtx = null;
  function alertGain() {
    const v = settings && settings.alertVolume !== undefined ? settings.alertVolume : 60;
    return 0.5 * Math.pow(v / 100, 1.6); // perceptual curve: 60% ≈ old default
  }
  function playPattern(kind) {
    const peak = alertGain();
    if (peak <= 0.001) return; // volume at 0 = silent
    try {
      audioCtx = audioCtx || new AudioContext();
      let t = audioCtx.currentTime;
      for (const [freq, dur, gap] of SOUND_PATTERNS[kind] || SOUND_PATTERNS.rare) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(audioCtx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
        t += dur + gap;
      }
    } catch { /* audio unavailable */ }
  }

  function alertFX(msg, kind = 'rare') {
    toast(msg, true);
    if (!settings || settings.alertFlash !== false) {
      document.body.classList.remove('alerting');
      void document.body.offsetWidth; // restart animation
      document.body.classList.add('alerting');
      setTimeout(() => document.body.classList.remove('alerting'), 3200);
    }
    if (!settings || settings.alertSound !== false) playPattern(kind);
  }

  // invis events often arrive as a pair ("worn off" + "You appear.") - dedupe
  let lastInvisAlert = 0;
  function invisAlert(msg) {
    if (Date.now() - lastInvisAlert < 3000) return;
    lastInvisAlert = Date.now();
    alertFX(msg, 'invis');
  }

  // beneficial vs detrimental, learned from the log itself: spells seen in
  // damage lines are detrimental (DoTs, nukes), spells seen healing are
  // beneficial. Unknown spells are treated as beneficial when they wear off
  // you or your pet (safe default for buff alerts).
  let spellClass = {};
  window.overlay.getSpellClasses().then(sc => { spellClass = sc || {}; });
  function learnSpellClass(spell, cls) {
    if (!spell || spellClass[spell] === cls) return;
    if (spellClass[spell] === 'detrimental' && cls === 'beneficial') return; // damage evidence wins (lifetaps heal too)
    spellClass[spell] = cls;
    window.overlay.learnSpellClass(spell, cls);
  }

  // ---- fade attribution: noun -> spell line ----
  // seed table (buffs.js) + learned entries; unknown nouns are correlated
  // against a ring buffer of recent flavor lines and the cast that preceded
  // them, so SEQO learns "vortex of shadows = Shadow Vortex" from the log itself
  let fadeLabels = {};
  window.overlay.getFadeLabels().then(f => { fadeLabels = f || {}; });
  const flavorBuffer = [];       // recent {msg, spell} - lines near a "begins casting"
  let lastAnyCast = null;        // {spell, when} - most recent cast by anyone

  function noteFlavor(msg, when) {
    if (lastAnyCast && when - lastAnyCast.when <= 5000) {
      flavorBuffer.push({ msg: msg.toLowerCase(), spell: lastAnyCast.spell });
      if (flavorBuffer.length > 300) flavorBuffer.shift();
    }
  }

  function fadeInfo(noun) {
    if (fadeLabels[noun]) {
      const seed = EQLBuffs[noun];
      return { label: fadeLabels[noun], kind: seed ? seed.kind : 'buff' };
    }
    // correlation beats the generic seed label: a recent flavor line containing
    // this noun names the exact spell ("Your strength surges" after casting
    // Strength of Stone -> "strength" = Strength of Stone, not just "STR buff")
    const n = noun.toLowerCase();
    for (let i = flavorBuffer.length - 1; i >= 0; i--) {
      if (flavorBuffer[i].msg.includes(n)) {
        fadeLabels[noun] = flavorBuffer[i].spell;
        window.overlay.learnFadeLabel(noun, flavorBuffer[i].spell);
        const seed = EQLBuffs[noun];
        return { label: flavorBuffer[i].spell, kind: seed ? seed.kind : 'buff' };
      }
    }
    if (EQLBuffs[noun]) return EQLBuffs[noun];
    return null;
  }

