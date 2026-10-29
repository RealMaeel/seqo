// SEQO overlay — Class tab: gear advisor and buff lineup.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= ⚔ Class tab: gear advisor + buff lineup =================
  const TRIO_CLASSES = ['WAR', 'CLR', 'PAL', 'RNG', 'SHD', 'DRU', 'MNK', 'BRD', 'ROG', 'SHM', 'NEC', 'WIZ', 'MAG', 'ENC', 'BST', 'BER'];

  // purpose presets: starting stat weights, every one editable underneath
  const GEAR_PRESETS = {
    balanced: { label: '⚖ Balanced', ac: 2, hp: 1, mana: 0.7, str: 0.5, sta: 0.8, agi: 0.4, dex: 0.4, wis: 0.5, int: 0.5, cha: 0.1, atk: 0.5, end: 0.2, resists: 0.3, haste: 15, ratio: 12, effect: 10 },
    tank: { label: '🛡 Tank', ac: 4, hp: 1.6, mana: 0.2, str: 0.6, sta: 1.3, agi: 0.7, dex: 0.4, wis: 0.2, int: 0.2, cha: 0, atk: 0.3, end: 0.4, resists: 0.5, haste: 10, ratio: 8, effect: 10 },
    melee: { label: '⚔ Melee ST', ac: 1, hp: 0.8, mana: 0, str: 1, sta: 0.7, agi: 0.5, dex: 0.8, wis: 0, int: 0, cha: 0, atk: 1, end: 0.5, resists: 0.25, haste: 30, ratio: 20, effect: 12 },
    aoe: { label: '💥 AoE', ac: 0.8, hp: 0.6, mana: 1.6, str: 0, sta: 0.5, agi: 0.3, dex: 0, wis: 1.2, int: 1.2, cha: 0.3, atk: 0, end: 0, resists: 0.35, haste: 2, ratio: 2, effect: 10 },
    caster: { label: '🔥 Caster DPS', ac: 0.7, hp: 0.6, mana: 1.4, str: 0, sta: 0.5, agi: 0.3, dex: 0, wis: 1.3, int: 1.3, cha: 0.2, atk: 0, end: 0, resists: 0.35, haste: 2, ratio: 2, effect: 10 },
    healer: { label: '✚ Healer', ac: 1, hp: 0.9, mana: 1.6, str: 0, sta: 0.6, agi: 0.3, dex: 0, wis: 1.6, int: 0.3, cha: 0.5, atk: 0, end: 0, resists: 0.35, haste: 5, ratio: 2, effect: 10 }
  };
  const GEAR_WKEYS = [['ac', 'AC'], ['hp', 'HP'], ['mana', 'Mana'], ['str', 'STR'], ['sta', 'STA'], ['agi', 'AGI'],
    ['dex', 'DEX'], ['wis', 'WIS'], ['int', 'INT'], ['cha', 'CHA'], ['atk', 'ATK'], ['end', 'End'],
    ['resists', 'Resists'], ['haste', 'Haste %'], ['ratio', 'Wpn dmg/dly'], ['effect', 'Has effect']];
  // display name | inventory worn-row location | catalog slot token
  const GEAR_SLOTS = [
    ['Head', 'Head', 'HEAD'], ['Face', 'Face', 'FACE'], ['Ear', 'Ear', 'EAR'], ['Neck', 'Neck', 'NECK'],
    ['Shoulders', 'Shoulders', 'SHOULDERS'], ['Arms', 'Arms', 'ARMS'], ['Back', 'Back', 'BACK'],
    ['Wrist', 'Wrist', 'WRIST'], ['Hands', 'Hands', 'HANDS'], ['Finger', 'Fingers', 'FINGER'],
    ['Chest', 'Chest', 'CHEST'], ['Legs', 'Legs', 'LEGS'], ['Feet', 'Feet', 'FEET'], ['Waist', 'Waist', 'WAIST'],
    ['Primary', 'Primary', 'PRIMARY'], ['Secondary', 'Secondary', 'SECONDARY'], ['Range', 'Range', 'RANGE'],
    ['Any Slot', 'Any Slot', 'ANY']
  ];
  const GEAR_WEAPONS = [['any', 'Any weapon'], ['1H SLASHING', '1H Slash'], ['1H BLUNT', '1H Blunt'],
    ['PIERCING', 'Piercing'], ['2H SLASHING', '2H Slash'], ['2H BLUNT', '2H Blunt'], ['2H PIERCING', '2H Pierce'],
    ['HAND TO HAND', 'Hand to Hand'], ['ranged', 'Bow / Thrown'], ['shield', 'Shield']];
  const GEAR_OBTAIN = [['drop', '☠ Drop'], ['quest', '📜 Quest'], ['craft', '⚒ Craft'], ['vendor', '🪙 Vendor'], ['unknown', '❓ Unknown']];

  let gearCatalog = null;
  let gearProgressMsg = '';
  let gearBuildBusy = false;
  const clExpanded = new Set();
  let wEditOpen = false;
  let buffFilter = '';
  window.overlay.getGearCatalog().then((c) => { gearCatalog = c; classDirty = true; });
  window.overlay.onGearProgress((msg) => {
    gearProgressMsg = msg || '';
    if (activeTab === 'class') renderClassTab();
  });

  const clChip = () => (settings && settings.classChip) || 'gear';
  const detectedTrio = () => (settings && settings.myTrio) || null;
  const currentTrio = () => (settings && settings.plannerTrio) || detectedTrio();
  const gearPurpose = () => (settings && settings.gearPurpose) || 'balanced';
  function gearWeights() {
    const p = gearPurpose();
    const base = { ...GEAR_PRESETS[p] };
    delete base.label;
    return { ...base, ...((settings && settings.gearWeights && settings.gearWeights[p]) || {}) };
  }
  const gearObtainSel = () => (settings && settings.gearObtain) || { drop: true, quest: true, craft: true, vendor: true, unknown: false };

  // upgrade-tier scaling — same math as the item panel's slider (wiki Item
  // Upgrade System, checked in game 2.7.2): stats and DMG +10%/tier, round DOWN, minimum +1 per
  // tier. Only positive values improve.
  const upStat = (n, T) => window.EQLItemText ? EQLItemText.upStat(n, T) : n;   // itemtext.js: one copy of the upgrade math
  const upDmg = (n, T) => window.EQLItemText ? EQLItemText.upDmg(n, T) : n;

  function gearScore(e, W, T) {
    T = T || 0;
    let s = 0;
    for (const [k, v] of Object.entries(e.stats || {})) {
      const sv = upStat(v, T);
      if (k.startsWith('sv')) s += (W.resists || 0) * sv;
      else s += (W[k] || 0) * sv;
    }
    if (e.haste) s += (W.haste || 0) * upStat(e.haste, T);
    if (e.dmg && e.dly) s += (W.ratio || 0) * (upDmg(e.dmg, T) / e.dly) * 10;
    if (e.effect) s += (W.effect || 0);
    return s;
  }
  const trioCanWear = (e, trio) => !e.classes || !e.classes.length || e.classes.includes('ALL') ||
    trio.some(c => e.classes.includes(c));
  function weaponTypeOk(e, slotTok, wsel) {
    if (slotTok !== 'PRIMARY' && slotTok !== 'SECONDARY' && slotTok !== 'RANGE') return true;
    if (wsel === 'any') return true;
    if (wsel === 'shield') return !e.skill && (e.stats && e.stats.ac > 0);
    if (wsel === 'ranged') return e.skill === 'ARCHERY' || /^THROWING/.test(e.skill || '');
    return e.skill === wsel;
  }
  function slotMatches(e, tok) {
    if (!e.slots) return false;
    if (tok === 'ANY') return e.slots.includes('ANY');
    return e.slots.includes(tok) || (tok === 'EAR' && e.slots.includes('EARS')) ||
           (tok === 'WRIST' && e.slots.includes('WRISTS')) || (tok === 'FINGER' && e.slots.includes('FINGERS'));
  }

  // catalog lookups by normalized base name ("+7" upgrades match their base)
  let gearByName = null;
  function gearEntry(name) {
    if (!gearCatalog || !gearCatalog.items) return null;
    if (!gearByName) {
      gearByName = new Map();
      for (const e of gearCatalog.items) gearByName.set(normItemName(e.n), e);
    }
    return gearByName.get(normItemName(name)) || null;
  }

  // ---------- 2.7.2: is the spell really in Legends? (spellproof.js) ----------
  // the game's spell file is live EQ's; the planner uses a spell only with proof:
  // your ✓, your spellbook export, a cast seen in your logs, or an eqlwiki page
  let plannerWiki = null, plannerWikiBusy = false, plannerWikiErr = null, plannerWikiAsked = false;
  let scribedFor = null, scribedBase = null;   // the export's names AND their base names (Allure VIII → Allure)
  function scribedSet() {
    const sb = gameFiles && gameFiles.spellbook && gameFiles.spellbook.spells;
    if (sb !== scribedFor) {
      scribedFor = sb;
      scribedBase = new Set();
      for (const n of Object.keys(sb || {})) { scribedBase.add(n); scribedBase.add(EQLSpellProof.baseName(n)); }
    }
    return scribedBase;
  }
  function legendsVerdict(n) {
    return EQLSpellProof.verdict(n, {
      mine: (settings && settings.confirmedSpells) || [],
      hidden: (settings && settings.hiddenSpells) || [],
      notInLegends: (spellDB && spellDB.notInLegends) || [],
      scribed: scribedSet(),
      seen: spellsSeen,
      wiki: plannerWiki || {}
    });
  }
  // one wiki check for EVERY class's spells (cached 30 days by main), once per session
  function checkPlannerWiki() {
    if (plannerWikiAsked || !spellDB) return;
    plannerWikiAsked = true; plannerWikiBusy = true;
    const names = [...new Set(Object.values(spellDB.spells).filter(sp => sp.cls).map(sp => sp.n))];
    window.overlay.spellWikiCheck(names)
      .then((r) => { plannerWiki = (r && r.pages) || {}; plannerWikiErr = (r && r.error) || null; })
      .catch((e) => { plannerWikiErr = e.message || String(e); })
      .finally(() => { plannerWikiBusy = false; classDirty = true; if (activeTab === 'class') renderClassTab(); });
  }

  // ---------- buffs chip: live buffs + trio lineup ----------
  function plannerModel(trio) {
    const lvl = myLevel();
    applyEffLevel(lvl); // stat values at YOUR level, not a baked-in 50
    const pool = [], unconfirmed = [];
    for (const recs of spellByName.values()) {
      let best = null;
      for (const r of recs) {
        if (!r.cls) continue;
        for (const c of trio) {
          const lv = r.cls[c];
          if (lv && lv <= lvl && (!best || lv < best.lv)) best = { sp: r, cls: c, lv };
        }
      }
      if (!best) continue;
      // no proof it's in Legends (or you hid it): left out — listed under 🔎 so you can ✓ it
      best.proof = legendsVerdict(best.sp.n);
      if (best.proof.ok === false) { if (!isHiddenSpell(best.sp.n)) unconfirmed.push(best); continue; }
      pool.push(best);
    }
    const groups = new Map(), solo = [];
    for (const e of pool) {
      const st = spellDB.stacking[e.sp.id];
      if (st) {
        e.rank = st.r;
        if (!groups.has(st.g)) groups.set(st.g, []);
        groups.get(st.g).push(e);
      } else solo.push(e);
    }
    // within a group: the game's rank decides; among equals, the bigger
    // numbers win (so the fatter of two same-rank versions comes out on top)
    const effSum = (sp) => Object.values(sp.eff || {}).reduce((s, v) => s + v, 0);
    for (const list of groups.values())
      list.sort((a, b) => (b.rank - a.rank) || (effSum(b.sp) - effSum(a.sp)) || (b.lv - a.lv));
    return { groups, solo, pool, unconfirmed };
  }

  const fmtBuffDur = (sp) => {
    const s = buffDurS(sp, myLevel());
    if (s == null) return '∞';
    return s >= 3600 ? Math.round(s / 360) / 10 + 'h' : s >= 90 ? Math.round(s / 60) + 'm' : s + 's';
  };

  // ---------- loadout builder: "I have N gems, focus hp/sta/dex" ----------
  // focus options are STATS only — utility effects (invis, levitate, vision…)
  // live in their own list below and never spend a gem
  const BUFF_STATS = [['hp', 'HP'], ['hpregen', 'HP regen'], ['mana', 'Mana'], ['manaregen', 'Mana regen'],
    ['ac', 'AC'], ['atk', 'ATK'], ['str', 'STR'], ['sta', 'STA'], ['agi', 'AGI'], ['dex', 'DEX'],
    ['wis', 'WIS'], ['int', 'INT'], ['cha', 'CHA'], ['haste', 'Haste'], ['ds', 'Dmg shield'],
    ['rune', 'Rune'], ['proc', 'Weapon proc'], ['acc', 'Accuracy'], ['meleedmg', 'Melee dmg'],
    ['hate', 'Aggro'], ['move', 'Run speed'], ['spellhaste', 'Cast speed'], ['meleeheal', 'Heal per hit'],
    ['haste2', 'Extra haste'], ['spelldmg', 'Spell dmg'], ['reflect', 'Spell reflect'], ['songmod', 'Song power'],
    ['fizzle', 'Fewer fizzles'], ['res', 'Resists (all 5)']];
  // utility = presence effects, cast on demand: kept OUT of the gem lineup.
  // Illusions are NOT utility here — EQL illusions carry real stats (Ogre
  // Pirate HP +500), so they compete for gems like any buff, and the illusion
  // key stays a knockout key: you can only ever wear ONE illusion.
  const UTIL_KEYS = [['invis', 'Invisibility'], ['ivu', 'Invis vs undead'], ['iva', 'Invis vs animals'],
    ['seeinvis', 'See invisible'], ['lev', 'Levitate'], ['eb', 'Water breathing'], ['vision', 'Night vision'],
    ['magnify', 'Far sight'], ['bindsight', 'Bind sight'], ['scout', 'Scouting eye'],
    ['sustenance', 'No food/drink needed'], ['magicweapon', 'Magic weapons'], ['faction', 'Faction song'],
    ['fearimmune', 'Fear immunity'], ['hatedown', 'Lower aggro'], ['invuln', 'Invulnerability (emergency)'],
    ['ward', 'Divine ward']];
  const UTIL_SET = new Set(UTIL_KEYS.map(u => u[0]));
  // no focus chosen -> "best overall": every stat counts, weighted for fighting
  const COMBAT_W = { hp: 1, ac: 1, haste: 1, atk: .9, acc: .9, meleedmg: .9, hpregen: .8,
    manaregen: .8, ds: .7, rune: .6, proc: .6, sta: .6, mana: .6, str: .5, dex: .5, agi: .4,
    svF: .4, svC: .4, svM: .4, svD: .4, svP: .4, wis: .3, int: .3, hate: .3, move: .2, cha: .1,
    spellhaste: .5, meleeheal: .5, haste2: .9, spelldmg: .5, reflect: .4, songmod: .4, fizzle: .1 };
  const statKeys = (sp) => Object.keys(sp.eff || {}).filter(k => !UTIL_SET.has(k));
  // the game's REAL stacking rule: two buffs block each other only when the
  // same slot number carries the same effect. Buff lines are slot-offset on
  // purpose (Grim Aura's ATK in slot 1, Dark Temptation's in slot 2) so same
  // stat ≠ conflict — those values ADD when both are up.
  const slotClash = (a, b) => {
    if (!a.slots || !b.slots) return statKeys(a).some(k => (b.eff || {})[k]); // old heuristic as fallback
    for (const s in a.slots) if (b.slots[s] !== undefined && b.slots[s] === a.slots[s]) return true;
    return false;
  };

  // effect values re-scaled at the character's REAL level (spelldb ships the
  // raw slot formulas; flags and procs don't scale, so they carry over)
  function calcSlotValue(base, calc, max, level) { // the same table spelldb.js uses: slotcalc.js
    return EQLSlotCalc.calcSlotValue(base, calc, max, level);
  }
  const FLAG_KEYS = new Set(['proc', 'seeinvis', 'eb', 'lev', 'vision', 'invis', 'illusion',
    'ivu', 'iva', 'magnify', 'bindsight', 'scout', 'sustenance', 'magicweapon', 'faction', 'fearimmune',
    'hatedown', 'invuln', 'ward']);
  let effLevelApplied = 0;
  function applyEffLevel(lvl) {
    if (!spellDB || effLevelApplied === lvl) return;
    effLevelApplied = lvl;
    for (const recs of spellByName.values()) for (const sp of recs) {
      if (!sp.effRaw || !sp.eff) continue;
      const eff = {}, cost = {};
      for (const k of Object.keys(sp.eff)) if (FLAG_KEYS.has(k)) eff[k] = sp.eff[k];
      for (const [k, b, c, m, isCost] of sp.effRaw) {
        let v = calcSlotValue(b, c, m, lvl);
        if (k === 'haste' || k === 'haste2') { if (v <= 100) continue; v -= 100; }
        if (!v) continue;
        if (isCost) cost[k] = Math.max(cost[k] || 0, v);
        else eff[k] = Math.max(eff[k] || 0, v);
      }
      sp.eff = eff;
      if (Object.keys(cost).length) sp.cost = cost; else delete sp.cost;
    }
  }
  const EFF_LABEL = { hp: 'HP', hpregen: 'HP regen', mana: 'Mana', manaregen: 'Mana regen', ac: 'AC', atk: 'ATK',
    str: 'STR', sta: 'STA', agi: 'AGI', dex: 'DEX', wis: 'WIS', int: 'INT', cha: 'CHA', haste: 'Haste%',
    ds: 'DS', rune: 'Rune', move: 'Run%', acc: 'Accuracy%', meleedmg: 'Melee dmg%', hate: 'Aggro',
    svF: 'svFire', svC: 'svCold', svM: 'svMagic', svD: 'svDis', svP: 'svPoi',
    mit: 'Mitigation%', crit: 'Crit%', cripp: 'Crippling blow%', avoid: 'Avoidance', riposte: 'Riposte%',
    dodge: 'Dodge%', parry: 'Parry%', dualwield: 'Dual wield%', doubleatk: 'Double attack%',
    mlifetap: 'Melee lifetap', delay: 'Atk speed%', hitchance: 'Hit%', mindmg: 'Min dmg%', slayundead: 'Slay undead',
    meleeheal: 'Heal per hit', spellhaste: 'Cast speed%', haste2: 'Extra haste%', spelldmg: 'Spell dmg%',
    reflect: 'Spell reflect%', songmod: 'Song power%', fizzle: 'Fewer fizzles%' };
  // flag effects: the presence is the point, a number would be noise
  const EFF_FLAGS = { seeinvis: 'See invis', lev: 'Levitate', eb: 'Water breathing', invis: 'Invisibility', illusion: 'Illusion',
    ivu: 'Invis vs undead', iva: 'Invis vs animals', magnify: 'Far sight', bindsight: 'Bind sight', scout: 'Scouting eye',
    sustenance: 'No food/drink', magicweapon: 'Magic weapons', faction: 'Faction', fearimmune: 'Fear immunity',
    hatedown: 'Lower aggro', invuln: 'Invulnerable', ward: 'Divine ward' };
  const RES_KEYS = ['svF', 'svC', 'svM', 'svD', 'svP'];

  function effVal(sp, key) {
    const e = sp.eff || {};
    if (key === 'res') return Math.max(e.svF || 0, e.svC || 0, e.svM || 0, e.svD || 0, e.svP || 0);
    // cast speed only helps spells up to its level limit: Piety (≤39) is worth
    // less than Faith (≤61) once your own spells outgrow it
    if (key === 'spellhaste' && e.spellhaste && sp.hasteLv) return e.spellhaste * Math.min(1, sp.hasteLv / Math.max(1, myLevel()));
    return e[key] || 0;
  }
  const effEntryText = (sp, k, v) => k === 'proc'
      ? 'Proc: ' + (sp.procInfo
          ? sp.procInfo.n + ' (' + (sp.procInfo.kind === 'AE' ? 'hits nearby mobs' : sp.procInfo.kind) +
            (sp.procInfo.amt ? ' ~' + sp.procInfo.amt : '') + ')'
          : 'weapon proc')
    : EFF_FLAGS[k] ? EFF_FLAGS[k]
    : k === 'vision' ? (v >= 2 ? 'Ultravision' : 'Infravision')
    : v >= 10000 ? (EFF_LABEL[k] || k).replace(/%$/, '') + ' 100%' // 10000 = guaranteed
    : (EFF_LABEL[k] || k) + ' +' + v;
  const costText = (sp) => Object.entries(sp.cost || {})
    .map(([k, v]) => (k === 'hpregen' ? 'HP/tick' : EFF_LABEL[k] || k) + ' −' + v).join(' · ');
  const effText = (sp) => [Object.entries(sp.eff || {}).map(([k, v]) => effEntryText(sp, k, v)).join(' · '),
    costText(sp)].filter(Boolean).join(' · ');
  // short form for the lineup: the strongest few, the rest on hover
  const effTextShort = (sp, n) => {
    const ents = Object.entries(sp.eff || {})
      .sort((a, b) => (COMBAT_W[b[0]] || 0) * b[1] - (COMBAT_W[a[0]] || 0) * a[1]);
    const shown = ents.slice(0, n).map(([k, v]) => effEntryText(sp, k, v));
    const extra = ents.length - n;
    return [shown.join(' · '), costText(sp)].filter(Boolean).join(' · ') + (extra > 0 ? ' (+' + extra + ')' : '');
  };

  // group=the whole party, single=one target, self=caster only
  const tgtLabel = (sp) => [3, 40, 41].includes(sp.tgt) ? 'group'
    : [5, 51].includes(sp.tgt) ? 'single' : sp.tgt === 6 ? 'self' : '';

  // bard songs are BRD-only spells: they stack with regular buffs (the classic
  // rule), so they never knock spells out of the lineup — and vice versa
  const isSong = (sp) => !!(sp.cls && sp.cls.BRD && Object.keys(sp.cls).length === 1);
  // disciplines are /disc combat abilities — activated, short, one at a time.
  // They never occupy a spell gem, so they get their own list, not the lineup.
  const isDisc = (sp) => /\bdiscipline\b/i.test(sp.n);

  // greedy pick: best marginal coverage of the chosen stats. A pick knocks out
  // candidates that share its stacking group, or — among NON-songs, and among
  // songs — share an effect type (same-effect buffs usually block each other;
  // songs and spells coexist freely).
  // mode: 'both' = one fighting set (songs capped at what Symphonic Aura can
  // run) · 'spells' = a pure buff set, cast-and-swap, songs excluded ·
  // 'songs' = ONLY the songs Symphonic Aura keeps running (budget 1–5)
  // ⏳ long-buff preference: discount short buffs so a slightly weaker buff
  // that lasts an hour beats a stronger one you'd re-cast every few minutes.
  // Songs are exempt — Symphonic Aura keeps them running either way.
  const durFactor = (sp) => {
    if (isSong(sp)) return 1;
    const s = buffDurS(sp, myLevel());
    if (s == null) return 1;                       // permanent until cancelled
    return Math.min(1, Math.pow(s / 3600, 0.4));   // 1h+ counts full; 10m ≈ half
  };

  // 2.7.2: with ⏳ Long buffs on, a buff of 5 minutes or less (songs aside) is not a long
  // buff at all — it's left out of the lineup entirely (no discount games) and shown in
  // its own "short buffs" list instead. A stacking group whose best member is short
  // offers its best LONG member to the lineup.
  const SHORT_BUFF_S = 300;
  const isShortBuff = (sp) => {
    if (isSong(sp)) return false;
    const s = buffDurS(sp, myLevel());
    return s != null && s <= SHORT_BUFF_S;
  };

  const POISON_CAP = { combat: 3, utility: 1 };
  // rogue poisons, classified from the game's own descriptions: up to 3 combat
  // poisons at once (one per stacking line — Cobra replaces Asp) + 1 utility
  // poison picked for the fight (snare, slow, stun… — situational, so all listed)
  function poisonPlan(model) {
    const all = model.pool.filter(e => e.sp.poison);
    if (!all.length) return null;
    const procAmt = (e) => (e.sp.procInfo && e.sp.procInfo.amt) || 0;
    const line = new Map();
    for (const e of all.filter(x => x.sp.poison === 'combat')) {
      const g = spellDB.stacking[e.sp.id];
      const key = g ? 'g' + g.g : 'id' + e.sp.id;
      const cur = line.get(key);
      const rank = (x) => (spellDB.stacking[x.sp.id] || {}).r || 0;
      if (!cur || rank(e) > rank(cur) || (rank(e) === rank(cur) && procAmt(e) > procAmt(cur))) line.set(key, e);
    }
    const combat = [...line.values()].sort((a, b) => procAmt(b) - procAmt(a) || b.lv - a.lv).slice(0, POISON_CAP.combat);
    const utility = all.filter(x => x.sp.poison === 'utility').sort((a, b) => b.lv - a.lv || a.sp.n.localeCompare(b.sp.n));
    return { combat, utility };
  }
  function buildLoadout(trio, focus, gems, mode, songCap, longPref) {
    const model = plannerModel(trio);
    const cands = [];
    for (const list of model.groups.values()) {   // group winners
      const win = longPref ? list.find(e => !isShortBuff(e.sp)) : list[0];
      if (win) cands.push(win);
    }
    cands.push(...(longPref ? model.solo.filter(e => !isShortBuff(e.sp)) : model.solo));
    // utility-only spells (invis, levitate…) never spend a gem — see the
    // utility list — and /disc abilities live in the disciplines list;
    // a spell must bring at least one STAT to compete here
    // rogue poisons are applied to the weapon, not memorized: they get their own
    // section (poisonPlan) and never spend a gem here
    let rem = cands.filter(e => e.sp.eff && statKeys(e.sp).length && !isDisc(e.sp) && !e.sp.poison);
    if (mode === 'spells') rem = rem.filter(e => !isSong(e.sp));
    else if (mode === 'songs') rem = rem.filter(e => isSong(e.sp));
    // "Resists" means ALL FIVE: each resist is its own goal, so the builder
    // keeps picking until fire/cold/magic/disease/poison are each covered
    // (multi-resist buffs cover several in one gem and rank accordingly)
    // No focus -> best overall set: every stat counts at its combat weight.
    // Focus chosen -> emphasis, not a gate: focused stats dominate, the rest
    // still count a little, so spare gems go to the next-best buffs.
    const fset = new Set(focus.flatMap(f => f === 'res' ? RES_KEYS : [f]));
    const w = {};
    for (const k of Object.keys(COMBAT_W)) w[k] = fset.size ? (fset.has(k) ? 1 : 0.05) : COMBAT_W[k];
    const fkeys = Object.keys(w);
    const top = {};
    for (const f of fkeys) top[f] = Math.max(1, ...rem.map(e => effVal(e.sp, f)));
    const picked = [];
    // every candidate still in `rem` stacks with every pick (clashes are pruned
    // below), so values ADD — a buff scores its full weighted worth, no discount
    while (picked.length < gems && rem.length) {
      for (const e of rem)
        e._s = fkeys.reduce((s, f) => s + w[f] * effVal(e.sp, f) / top[f], 0) *
          (longPref ? durFactor(e.sp) : 1);
      rem.sort((a, b) => b._s - a._s);
      // in a mixed fighting set, Symphonic Aura can only run so many songs
      if (mode === 'both' && songCap != null) {
        const songsPicked = picked.filter(p => isSong(p.sp)).length;
        if (songsPicked >= songCap) rem = rem.filter(e => !isSong(e.sp));
        if (!rem.length) break;
      }
      const best = rem[0];
      if (!best || best._s <= 0.0001) break;
      // a same-group sibling with a different target (group vs single vs self)
      // is worth knowing about — attach it to the pick for display
      const bg = spellDB.stacking[best.sp.id];
      best.alts = [];
      if (bg) {
        const mates = model.groups.get(bg.g) || [];
        best.alts = mates
          .filter(e => e.sp.n !== best.sp.n) // pool is already level-filtered
          .slice(0, 2)
          .map(e => ({ n: e.sp.n, t: [tgtLabel(e.sp), e.sp.procInfo
              ? (e.sp.procInfo.kind === 'AE' ? 'AE proc' : e.sp.procInfo.kind + ' proc') + (e.sp.procInfo.amt ? ' ~' + e.sp.procInfo.amt : '')
              : ''].filter(Boolean).join(', ') }));
      }
      picked.push(best);
      const bestSong = isSong(best.sp);
      const bumped = []; // candidates this pick knocks out — the best become visible alternates
      rem = rem.filter(e => {
        if (e === best) return false;
        const eg = spellDB.stacking[e.sp.id];
        if (bg && eg && eg.g === bg.g) { bumped.push(e); return false; } // game says: same group
        if (isSong(e.sp) !== bestSong) return true;           // song + spell coexist
        if ((e.sp.eff || {}).illusion && (best.sp.eff || {}).illusion) { bumped.push(e); return false; } // one illusion at a time
        if (slotClash(e.sp, best.sp)) { bumped.push(e); return false; } // same slot, same effect: blocks
        return true;
      });
      bumped.sort((a, b) => b._s - a._s);
      for (const e of bumped.slice(0, 2 - best.alts.length)) {
        if (e._s <= 0.0001 || best.alts.some(a => a.n === e.sp.n)) continue;
        best.alts.push({ n: e.sp.n, t: [effText(e.sp), tgtLabel(e.sp)].filter(Boolean).join(' — ') });
      }
    }
    return picked;
  }

  // "not in Legends": a spell you hide never comes back into your lineup (restore anytime)
  const isHiddenSpell = (n) => !!(settings && Array.isArray(settings.hiddenSpells) && settings.hiddenSpells.includes(n));
  function addHideBtn(d, sp) {
    if (!sp || !sp.n) return;
    const x = document.createElement('span');
    x.textContent = '✕';
    x.className = 'bk-hide';
    x.style.cssText = 'flex:none;cursor:pointer;color:#667;padding:0 3px;font-size:10px;opacity:0';
    x.title = 'Not in EverQuest Legends (or you never use it)? Hide ' + sp.n + ' from your lineup — restore it from the line under YOUR LINEUP';
    x.addEventListener('click', (ev) => {
      ev.stopPropagation();
      save({ hiddenSpells: [...new Set([...((settings && settings.hiddenSpells) || []), sp.n])] });
      toast('✕ ' + sp.n + ' hidden from your buff lineup');
      renderClassTab();
    });
    d.addEventListener('mouseenter', () => { x.style.opacity = '1'; });
    d.addEventListener('mouseleave', () => { x.style.opacity = '0'; });
    d.appendChild(x);
  }

  // the spells your trio could use that have no proof of being in Legends — left out of
  // every list above; ✓ one you know is in the game and it joins the planner
  function renderLegendsCheck(root, trio) {
    const model = plannerModel(trio);
    const un = model.unconfirmed.sort((a, b) => a.cls.localeCompare(b.cls) || a.lv - b.lv || a.sp.n.localeCompare(b.sp.n));
    const mine = (settings && settings.confirmedSpells) || [];
    const unknown = model.pool.filter(e => e.proof && e.proof.ok === null).length;
    const open = !!(settings && settings.buffUnconfOpen);
    const h = document.createElement('div');
    h.className = 'l-divider';
    h.style.cursor = 'pointer';
    h.textContent = (open ? '▾' : '▸') + ' 🔎 LEGENDS CHECK — ' + un.length + ' left out, no proof they\'re in Legends' +
      (plannerWikiBusy ? ' (checking eqlwiki…)' : '');
    h.title = 'The game\'s spell file is live EverQuest\'s and lists spells Legends doesn\'t have. A spell is used only with proof: ' +
      'it\'s in your spellbook export, someone cast it in your logs, eqlwiki has a page, or you ✓ it here.';
    h.addEventListener('click', () => { save({ buffUnconfOpen: !open }); settings.buffUnconfOpen = !open; renderClassTab(); });
    root.appendChild(h);
    const notes = [];
    if (plannerWikiErr) notes.push('⚠ eqlwiki check failed (' + plannerWikiErr + ') — ' + unknown + ' unchecked spells are kept for now.');
    else if (unknown) notes.push(unknown + ' spells not checked yet — kept for now.');
    if (mine.length) notes.push(mine.length + ' confirmed by you');
    if (notes.length) {
      const n = document.createElement('div');
      n.className = 'q-npc';
      n.textContent = notes.join(' · ');
      if (mine.length) {
        const r = document.createElement('span');
        r.style.cssText = 'margin-left:6px;color:#778;cursor:pointer';
        r.textContent = '(reset)';
        r.title = 'You confirmed: ' + mine.join(', ') + '. Click to clear your confirmations.';
        r.addEventListener('click', () => { save({ confirmedSpells: [] }); settings.confirmedSpells = []; renderClassTab(); });
        n.appendChild(r);
      }
      root.appendChild(n);
    }
    if (!open) return;
    const cap = legendsShowAll ? un.length : 60;
    for (const e of un.slice(0, cap)) {
      const d = document.createElement('div');
      d.className = 'q-it';
      d.style.cssText = 'cursor:default;opacity:.75';
      d.innerHTML = '<span class="box">?</span><span class="nm"></span><span class="loc" style="flex:none"></span>';
      d.querySelector('.nm').textContent = e.sp.n + (e.sp.eff && statKeys(e.sp).length ? ' — ' + effTextShort(e.sp, 3) : '');
      d.querySelector('.nm').style.whiteSpace = 'normal';
      d.querySelector('.loc').textContent = e.cls + ' L' + e.lv;
      d.title = e.proof.why + (spellDB.desc[e.sp.id] ? '\n' + spellDB.desc[e.sp.id] : '');
      const ok = document.createElement('span');
      ok.textContent = '✓ in Legends';
      ok.style.cssText = 'flex:none;cursor:pointer;color:#7c7;padding:0 4px;font-size:10px';
      ok.title = 'You know ' + e.sp.n + ' is in Legends: use it in the planner';
      ok.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const next = [...new Set([...mine, e.sp.n])];
        save({ confirmedSpells: next }); settings.confirmedSpells = next;
        toast('✓ ' + e.sp.n + ' is back in your planner');
        renderClassTab();
      });
      d.appendChild(ok);
      root.appendChild(d);
    }
    if (un.length > cap) {
      const m = document.createElement('div');
      m.className = 'q-npc';
      m.style.cursor = 'pointer';
      m.textContent = '… ' + (un.length - cap) + ' more — show all';
      m.addEventListener('click', () => { legendsShowAll = true; renderClassTab(); });
      root.appendChild(m);
    }
  }
  let legendsShowAll = false;

  // a lineup spell that's on you right now: name goes green, time left on hover
  function markOnYou(d, sp) {
    if (!sp) return;
    // by name, or by a shared landing line: the log can't tell those spells apart,
    // so if the line landed, the lineup's spell counts as on you
    let b = activeBuffs.get(sp.n.toLowerCase());
    if (!b) for (const a of activeBuffs.values()) if (a.ids && a.ids.includes(sp.id)) { b = a; break; }
    if (!b || b.ben === false) return;
    d.classList.add('have');
    let left = '';
    if (b.durS != null) {
      const rem = Math.max(0, Math.round(b.durS - (Date.now() - b.at) / 1000));
      left = ' — ' + (b.est ? '~' : '') + (rem >= 90 ? Math.ceil(rem / 60) + 'm' : rem + 's') + ' left';
    }
    d.dataset.onyou = '✔ On you now' + left;
  }

  function renderBuffsChip(root) {
    const trio = currentTrio();
    checkPlannerWiki();
    if (!spellDB) {
      const d = document.createElement('div');
      d.className = 'q-npc';
      d.textContent = spellDbError ? '⚠ ' + spellDbError : 'Reading the game\'s spell files…';
      root.appendChild(d);
    }
    // --- loadout builder: gems + focus stats -> what to memorize ---
    const bh = document.createElement('div');
    bh.className = 'l-divider';
    bh.textContent = '🎛 YOUR LINEUP — the strongest set your trio can keep up';
    const hiddenN = ((settings && settings.hiddenSpells) || []).length;
    if (hiddenN) {
      const rs = document.createElement('span');
      rs.style.cssText = 'margin-left:8px;color:#778;cursor:pointer;font-size:9.5px;font-weight:400';
      rs.textContent = hiddenN + ' hidden — restore';
      rs.title = 'You hid: ' + settings.hiddenSpells.join(', ') + '. Click to bring them all back.';
      rs.addEventListener('click', () => { save({ hiddenSpells: [] }); toast('Hidden spells restored'); renderClassTab(); });
      bh.appendChild(rs);
    }
    bh.title = 'Built from the game\'s own spell data for your classes and level, honoring the stacking table. Balanced for fighting by default — use 🎯 Focus to steer it.';
    root.appendChild(bh);
    if (spellDB && trio) {
      const ctl = document.createElement('div');
      ctl.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:3px 0';
      // mode: one fighting set / pure buff set (swap-friendly) / Symphonic Aura songs
      const mode = (settings && settings.buffMode) || 'both';
      for (const [k, label, tip] of [
        ['both', '⚡ Fighting set', 'Spells AND songs together — the set you fight with. Songs are capped at what Symphonic Aura can run.'],
        ['spells', '✦ Buff set', 'Spells only, no songs: cast everything, then swap to your fighting loadout. Long timers do the rest.'],
        ['songs', '♪ Songs only', 'Just the songs Symphonic Aura keeps running (1–5) — the song slots of your fighting loadout.']
      ]) {
        const chip = document.createElement('span');
        chip.className = 'qview-chip' + (mode === k ? ' active' : '');
        chip.textContent = label;
        chip.title = tip;
        chip.addEventListener('click', () => { save({ buffMode: k }); settings.buffMode = k; renderClassTab(); });
        ctl.appendChild(chip);
      }
      const glab = document.createElement('span');
      glab.style.cssText = 'color:#889;font-size:10px;margin-left:6px';
      const gin = document.createElement('input');
      gin.type = 'number';
      gin.style.cssText = 'width:44px;background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;font-size:11px;padding:1px 4px';
      if (mode === 'songs') {
        glab.textContent = 'Songs:';
        gin.min = '1'; gin.max = '5'; // Symphonic Aura runs 1–5 songs
        gin.value = Math.max(1, Math.min(5, (settings && settings.buffSongs) || 3));
        gin.title = 'How many songs your Symphonic Aura keeps running (1–5)';
        gin.addEventListener('change', () => {
          const v = Math.max(1, Math.min(5, +gin.value || 3));
          save({ buffSongs: v });
          settings.buffSongs = v;
          renderClassTab();
        });
      } else {
        glab.textContent = 'Spell gems:';
        gin.min = '1'; gin.max = '14'; // the game caps at 14 gems with every AA
        gin.value = Math.min(14, (settings && settings.buffGems) || 8);
        gin.title = 'How many spell gems you have (AAs raise it, up to 14) — the lineup fits inside this budget';
        gin.addEventListener('change', () => {
          const v = Math.max(1, Math.min(14, +gin.value || 8));
          save({ buffGems: v });
          settings.buffGems = v;
          renderClassTab();
        });
      }
      const focus = (settings && settings.buffStats) || [];
      // focus is optional emphasis, and the 22 stat chips hide behind one toggle
      const ft = document.createElement('span');
      const fOpen = !!(settings && settings.buffFocusOpen);
      ft.className = 'qview-chip' + (focus.length ? ' active' : '');
      ft.textContent = '🎯 Focus' + (focus.length ? ': ' + focus.map(f => (BUFF_STATS.find(b => b[0] === f) || [f, f])[1]).join(', ') : '');
      ft.title = focus.length ? 'The build leans toward these stats — click to change' : 'Optional: lean the build toward specific stats';
      ft.addEventListener('click', () => { save({ buffFocusOpen: !fOpen }); settings.buffFocusOpen = !fOpen; renderClassTab(); });
      const longOn = !!(settings && settings.buffLong);
      const lt = document.createElement('span');
      lt.className = 'qview-chip' + (longOn ? ' active' : '');
      lt.textContent = '⏳ Long buffs';
      lt.title = 'Prefer buffs that LAST: trade a little stat strength for durations you don\'t have to babysit. Buffs of 5 minutes or less are left out of the lineup (listed separately). Songs are unaffected — Symphonic Aura keeps them running.';
      lt.addEventListener('click', () => { save({ buffLong: !longOn }); settings.buffLong = !longOn; renderClassTab(); });
      ctl.append(glab, gin, ft, lt);
      root.appendChild(ctl);
      if (fOpen) {
        const frow2 = document.createElement('div');
        frow2.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin:2px 0';
        for (const [k, label] of BUFF_STATS) {
          const chip = document.createElement('span');
          chip.className = 'qview-chip' + (focus.includes(k) ? ' active' : '');
          chip.textContent = label;
          chip.title = 'Lean the lineup toward ' + label;
          chip.addEventListener('click', () => {
            const next = focus.includes(k) ? focus.filter(x => x !== k) : [...focus, k];
            save({ buffStats: next });
            settings.buffStats = next;
            renderClassTab();
          });
          frow2.appendChild(chip);
        }
        root.appendChild(frow2);
      }
      {
        const songCap = Math.max(1, Math.min(5, (settings && settings.buffSongs) || 3));
        const gems = mode === 'songs' ? songCap : Math.min(14, (settings && settings.buffGems) || 8);
        const picked = buildLoadout(trio, focus, gems, mode, songCap, !!(settings && settings.buffLong));
        if (!picked.length) {
          const d = document.createElement('div');
          d.className = 'q-npc';
          d.textContent = 'Nothing castable at your level fits this set yet.';
          root.appendChild(d);
        } else {
          const row = (e, label) => {
            const d = document.createElement('div');
            d.className = 'q-it';
            d.style.cursor = 'default';
            d.innerHTML = '<span class="box"></span><span class="nm"></span><span class="loc" style="flex:none"></span>';
            d.querySelector('.box').textContent = label;
            const tl = tgtLabel(e.sp);
            d.querySelector('.nm').textContent = e.sp.n + (tl === 'single' ? ' (single)' : tl === 'self' ? ' (self)' : '') +
              ' — ' + effTextShort(e.sp, 3);
            d.querySelector('.nm').style.whiteSpace = 'normal';
            d.querySelector('.loc').textContent = e.cls + ' L' + e.lv + ' · ' + fmtBuffDur(e.sp);
            markOnYou(d, e.sp); addHideBtn(d, e.sp);
            // the detail lives on hover: full effects, and the swaps if you'd rather
            const tip = [effText(e.sp)];
            if (e.alts && e.alts.length) tip.push('Or: ' + e.alts.map(a => a.n + (a.t ? ' (' + a.t + ')' : '')).join(', '));
            if (spellDB.desc[e.sp.id]) tip.push(spellDB.desc[e.sp.id]);
            d.title = tip.join('\n');
            root.appendChild(d);
          };
          // spells first; bard songs go to the bottom as the optional block
          const spells = mode === 'songs' ? picked : picked.filter(e => !isSong(e.sp));
          const songs = mode === 'songs' ? [] : picked.filter(e => isSong(e.sp));
          spells.forEach((e, i) => row(e, (i + 1) + '.'));
          if (songs.length) {
            const sh = document.createElement('div');
            sh.className = 'q-npc';
            sh.textContent = '♪ Optional — if your bard runs Symphonic Aura (' + songs.length + ' of ' + songCap + ' song slots):';
            root.appendChild(sh);
            songs.forEach((e) => row(e, '♪'));
          }
          // ⏳ on: say what the longer set costs you vs the strongest one
          if (settings && settings.buffLong) {
            const strongest = buildLoadout(trio, focus, gems, mode, songCap, false);
            const totals = (lo) => {
              const t = {};
              for (const e of lo) for (const k of statKeys(e.sp)) t[k] = (t[k] || 0) + e.sp.eff[k];
              return t;
            };
            const a = totals(picked), b = totals(strongest);
            const diffs = [...new Set([...Object.keys(a), ...Object.keys(b)])]
              .map(k => [k, (a[k] || 0) - (b[k] || 0)]).filter(([, d]) => d !== 0)
              .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 6);
            const md = (lo) => {
              const ds = lo.filter(e => !isSong(e.sp)).map(e => buffDurS(e.sp, myLevel())).map(s => s == null ? 7200 : s);
              return ds.length ? ds.reduce((s, v) => s + v, 0) / ds.length : 0;
            };
            const fm = (s) => s >= 3600 ? Math.round(s / 360) / 10 + 'h' : Math.round(s / 60) + 'm';
            const tr = document.createElement('div');
            tr.className = 'q-npc';
            tr.textContent = '⏳ ' + (diffs.length
              ? 'Trade vs strongest set: ' + diffs.map(([k, d]) => (EFF_LABEL[k] || k) + ' ' + (d > 0 ? '+' : '−') + Math.abs(d)).join(' · ')
              : 'No stat lost — the long set is just as strong') +
              ' — avg spell duration ' + fm(md(strongest)) + ' → ' + fm(md(picked)) + '.';
            root.appendChild(tr);
            // the strong-but-short ones the long set left out: worth a cast right before a pull
            const shorts = strongest.filter(e => isShortBuff(e.sp));
            if (shorts.length) {
              const sh = document.createElement('div');
              sh.className = 'q-npc';
              sh.textContent = '⚡ Short buffs (5 min or less) — not in the long set; cast right before a big pull:';
              sh.title = 'These made the strongest set but last 5 minutes or less, so ⏳ Long buffs leaves them out of the lineup.';
              root.appendChild(sh);
              shorts.forEach((e) => row(e, '⚡'));
            }
          }
          const note = document.createElement('div');
          note.className = 'q-npc';
          note.textContent =
            (mode === 'songs'
              ? picked.length + '/' + gems + ' Symphonic Aura song slots.'
              : mode === 'spells'
                ? picked.length + '/' + gems + ' gems, songs excluded — cast the set, then swap loadouts.'
                : picked.length + '/' + gems + ' gems, songs capped at ' + songCap + '.') +
            ' Values at level ' + myLevel() + '. Hover a buff for details and swaps.';
          note.title = 'Stacking is checked the way the game does it — slot by slot, plus the stacking-group table — so same-stat buffs that genuinely stack (slot-offset lines like Grim Aura + Dark Temptation) are BOTH picked and their values add. Bard songs stack with spells. Song stat values are WITHOUT instruments (instruments raise everything except haste and mana regen).';
          root.appendChild(note);
        }
        // --- utility: presence effects, cast on demand, no gem spent ---
        const model = plannerModel(trio);
        const utilRows = [];
        for (const [k, label] of UTIL_KEYS) {
          let best = null;
          for (const e of model.pool) {
            if (isDisc(e.sp)) continue;            // /disc abilities have their own list
            const v = (e.sp.eff || {})[k];
            if (!v) continue;
            if (!best || v > (best.sp.eff[k] || 0) || (v === best.sp.eff[k] && e.lv > best.lv)) best = e;
          }
          if (best) utilRows.push([k, label, best]);
        }
        if (utilRows.length) {
          const uh = document.createElement('div');
          uh.className = 'l-divider';
          uh.textContent = '🧰 UTILITY — cast when needed, no gem to keep';
          root.appendChild(uh);
          for (const [k, label, e] of utilRows) {
            const d = document.createElement('div');
            d.className = 'q-it';
            d.style.cursor = 'default';
            d.innerHTML = '<span class="box">·</span><span class="nm"></span><span class="loc" style="flex:none"></span>';
            d.querySelector('.nm').textContent = label + ' — ' + e.sp.n +
              (k === 'vision' && e.sp.eff.vision >= 2 ? ' (ultravision)' : '');
            d.querySelector('.loc').textContent = e.cls + ' L' + e.lv + ' · ' + fmtBuffDur(e.sp);
            markOnYou(d, e.sp); addHideBtn(d, e.sp);
            if (spellDB.desc[e.sp.id]) d.title = spellDB.desc[e.sp.id];
            root.appendChild(d);
          }
        }
        // --- disciplines: /disc combat abilities — activated, one at a time ---
        const discs = model.pool.filter(e => isDisc(e.sp))
          .sort((a, b) => a.cls.localeCompare(b.cls) || b.lv - a.lv);
        if (discs.length) {
          const dh = document.createElement('div');
          dh.className = 'l-divider';
          dh.textContent = '⚔ DISCIPLINES — /disc, one at a time, no gem';
          dh.title = 'Activated combat abilities on the discipline reuse timer. They never spend a spell gem, so every one you can use is listed.';
          root.appendChild(dh);
          for (const e of discs) {
            const d = document.createElement('div');
            d.className = 'q-it';
            d.style.cursor = 'default';
            d.innerHTML = '<span class="box">·</span><span class="nm"></span><span class="loc" style="flex:none"></span>';
            d.querySelector('.nm').textContent = e.sp.n.replace(/\s*Discipline$/i, '') +
              (e.sp.eff ? ' — ' + effText(e.sp) : '');
            d.querySelector('.nm').style.whiteSpace = 'normal';
            d.querySelector('.loc').textContent = e.cls + ' L' + e.lv + ' · ' + fmtBuffDur(e.sp);
            markOnYou(d, e.sp); addHideBtn(d, e.sp);
            if (spellDB.desc[e.sp.id]) d.title = spellDB.desc[e.sp.id];
            root.appendChild(d);
          }
        }
        // --- rogue poisons: applied to the weapon, never a gem ---
        const pz = poisonPlan(model);
        if (pz) {
          const ph = document.createElement('div');
          ph.className = 'l-divider';
          ph.textContent = '🧪 POISONS — applied, no gem: up to ' + POISON_CAP.combat + ' combat + ' + POISON_CAP.utility + ' utility at once';
          ph.title = 'Read from each poison\'s own description: combat poisons stack with each other (one per line — Cobra replaces Asp), utility poisons are one at a time.';
          root.appendChild(ph);
          const row = (e, tag) => {
            const d = document.createElement('div');
            d.className = 'q-it';
            d.style.cursor = 'default';
            d.innerHTML = '<span class="box">·</span><span class="nm"></span><span class="loc" style="flex:none"></span>';
            d.querySelector('.nm').textContent = tag + e.sp.n + (e.sp.eff ? ' — ' + effText(e.sp) : '');
            d.querySelector('.nm').style.whiteSpace = 'normal';
            d.querySelector('.loc').textContent = e.cls + ' L' + e.lv + ' · ' + fmtBuffDur(e.sp);
            markOnYou(d, e.sp); addHideBtn(d, e.sp);
            if (spellDB.desc[e.sp.id]) d.title = spellDB.desc[e.sp.id];
            root.appendChild(d);
          };
          for (const e of pz.combat) row(e, '⚔ ');
          if (pz.utility.length) {
            const uh = document.createElement('div');
            uh.className = 'q-npc';
            uh.textContent = 'Utility — pick 1 for the fight:';
            root.appendChild(uh);
            for (const e of pz.utility) row(e, '🛠 ');
          }
        }
      }
    }

    // --- 🔎 Legends check: what was left out for lack of proof (2.7.2) ---
    if (spellDB && trio) renderLegendsCheck(root, trio);

    // --- the full list, out of the way: collapsed unless you open it ---
    if (!spellDB || !trio) return;
    const model = plannerModel(trio);
    const open = !!(settings && settings.buffListOpen);
    const hd = document.createElement('div');
    for (const d of root.querySelectorAll('.q-it[data-onyou]'))
      d.title = d.dataset.onyou + (d.title ? '\n' + d.title : '');
    hd.className = 'l-divider';
    hd.style.cursor = 'pointer';
    hd.textContent = (open ? '▾' : '▸') + ' 📋 ALL ' + model.pool.length + ' BUFFS — ' + trio.join('/');
    hd.title = open ? 'Click to collapse' : 'Click to browse everything your trio can cast, with the stacking conflicts';
    hd.addEventListener('click', () => { save({ buffListOpen: !open }); settings.buffListOpen = !open; renderClassTab(); });
    root.appendChild(hd);
    if (!open) return;
    // conflicts first: stacking groups with 2+ different spells
    const conflicts = [...model.groups.values()].filter(l => new Set(l.map(e => e.sp.n)).size > 1);
    if (conflicts.length) {
      const note = document.createElement('div');
      note.className = 'q-npc';
      note.textContent = '⚠ ' + conflicts.length + ' buff group' + (conflicts.length > 1 ? 's' : '') +
        ' in your trio DON\'T stack (the game\'s own stacking table). Cast only the ✔ one:';
      root.appendChild(note);
      for (const list of conflicts) {
        const d = document.createElement('div');
        d.className = 'q-it';
        d.style.flexWrap = 'wrap';
        const win = list[0];
        d.innerHTML = '<span style="color:#7dffa0">✔ </span><span class="nm"></span>' +
          '<span class="loc" style="flex:none"></span>' +
          '<span style="color:#778;flex-basis:100%;padding-left:14px;font-size:9.5px"></span>';
        const wtl = tgtLabel(win.sp);
        d.querySelector('.nm').textContent = win.sp.n + (wtl ? ' (' + wtl + ')' : '') +
          (win.sp.eff ? ' — ' + effText(win.sp) : '');
        d.querySelector('.loc').textContent = win.cls + ' L' + win.lv + ' · ' + fmtBuffDur(win.sp);
        d.children[3].textContent = 'overrides: ' +
          [...new Set(list.slice(1).map(e => e.sp.n + (tgtLabel(e.sp) ? ' (' + tgtLabel(e.sp) + ')' : '')))].join(', ');
        if (spellDB.desc[win.sp.id]) d.title = spellDB.desc[win.sp.id];
        root.appendChild(d);
      }
    }
    // full castable list with filter
    const frow = document.createElement('div');
    frow.style.cssText = 'display:flex;gap:6px;align-items:center;margin:4px 0 2px';
    const inp = document.createElement('input');
    inp.placeholder = 'filter your trio\'s ' + model.pool.length + ' buffs…';
    inp.value = buffFilter;
    inp.style.cssText = 'flex:1;background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;padding:2px 8px;font-size:11px;outline:none';
    inp.addEventListener('input', () => {
      buffFilter = inp.value;
      renderBuffList(listBox, model);
    });
    frow.appendChild(inp);
    root.appendChild(frow);
    const listBox = document.createElement('div');
    root.appendChild(listBox);
    renderBuffList(listBox, model);
    const foot = document.createElement('div');
    foot.className = 'q-npc';
    foot.style.marginTop = '4px';
    foot.textContent = 'Durations at your level (' + myLevel() + '). Groups come from the game\'s own stacking table; buffs outside it can still collide on effect slots — when a cast fails, SEQO names the blocker.';
    root.appendChild(foot);
  }

  function renderBuffList(box, model) {
    box.innerHTML = '';
    const f = buffFilter.trim().toLowerCase();
    const losers = new Set();
    for (const list of model.groups.values()) for (const e of list.slice(1)) losers.add(e.sp.n);
    const rows = model.pool
      .filter(e => !f || e.sp.n.toLowerCase().includes(f) || e.cls.toLowerCase() === f)
      .sort((a, b) => a.lv - b.lv || a.sp.n.localeCompare(b.sp.n));
    const lvl = myLevel();
    for (const e of rows.slice(0, f ? 400 : 120)) {
      const d = document.createElement('div');
      d.className = 'q-it';
      const over = losers.has(e.sp.n);
      d.innerHTML = '<span class="box"></span><span class="nm"></span><span class="loc" style="flex:none"></span>';
      d.querySelector('.box').textContent = over ? '✕' : e.lv > lvl ? '◌' : '•';
      d.querySelector('.nm').textContent = e.sp.n;
      d.querySelector('.loc').textContent = e.cls + ' L' + e.lv + ' · ' + fmtBuffDur(e.sp) + ' · ' + e.sp.mana + ' mana';
      if (over) { d.style.opacity = '.45'; d.title = 'Overridden by a stronger buff in the same stacking group (see above)'; }
      else if (e.lv > lvl) { d.style.opacity = '.6'; d.title = 'Not castable yet — needs level ' + e.lv; }
      if (spellDB.desc[e.sp.id]) d.title = (d.title ? d.title + '\n' : '') + spellDB.desc[e.sp.id];
      box.appendChild(d);
    }
    if (!f && rows.length > 120) {
      const more = document.createElement('div');
      more.className = 'q-npc';
      more.textContent = rows.length - 120 + ' more — type in the filter to find them';
      box.appendChild(more);
    }
  }

  // ---------- gear chip: BiS advisor ----------
  function wornBySlot(invLoc) {
    const inv = gameFiles && gameFiles.inventory;
    if (!inv) return [];
    const out = [];
    for (const it of Object.values(inv.items || {}))
      if ((it.locs || []).includes(invLoc)) out.push(it.name);
    return out;
  }

  function renderGearChip(root) {
    const trio = currentTrio();
    // controls
    const ctr = document.createElement('div');
    ctr.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:4px';
    const selP = document.createElement('select');
    selP.style.cssText = 'background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;font-size:10.5px';
    for (const [k, v] of Object.entries(GEAR_PRESETS)) {
      const o = document.createElement('option');
      o.value = k; o.textContent = v.label;
      selP.appendChild(o);
    }
    selP.value = gearPurpose();
    selP.title = 'Purpose: which stat weights to score gear with. Tweak every number under ⚙.';
    selP.addEventListener('change', () => { save({ gearPurpose: selP.value }); settings.gearPurpose = selP.value; renderClassTab(); });
    const selW = document.createElement('select');
    selW.style.cssText = selP.style.cssText;
    for (const [k, v] of GEAR_WEAPONS) {
      const o = document.createElement('option');
      o.value = k; o.textContent = v;
      selW.appendChild(o);
    }
    selW.value = (settings && settings.gearWeapon) || 'any';
    selW.title = 'Weapon slots only show this type (a sword-and-board knight never gets told a two-hander is their upgrade)';
    selW.addEventListener('change', () => { save({ gearWeapon: selW.value }); settings.gearWeapon = selW.value; renderClassTab(); });
    const selT = document.createElement('select');
    selT.style.cssText = selP.style.cssText;
    for (let t = 0; t <= 10; t++) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t === 0 ? 'at base (+0)' : t === 10 ? 'at max (+10)' : 'at +' + t;
      selT.appendChild(o);
    }
    selT.value = (settings && settings.gearTier) || 0;
    selT.title = 'Score every item at this upgrade tier — "+10" compares items by their FULLY UPGRADED potential (the fairest long-term comparison), "+0" by what drops. Same math as the item panel\'s slider: stats +10%/tier, DMG +5%/tier, +1 minimum.';
    selT.addEventListener('change', () => { save({ gearTier: +selT.value }); settings.gearTier = +selT.value; renderClassTab(); });
    const wbtn = document.createElement('button');
    wbtn.className = 'kbtn' + (wEditOpen ? ' gold' : '');
    wbtn.textContent = '⚙ weights';
    wbtn.style.fontSize = '10px';
    wbtn.addEventListener('click', () => { wEditOpen = !wEditOpen; renderClassTab(); });
    const upd = document.createElement('button');
    upd.className = 'kbtn gold';
    upd.style.fontSize = '10px';
    upd.textContent = gearCatalog ? '⟳ Update catalog' : '⬇ Build catalog';
    upd.disabled = gearBuildBusy;
    upd.title = gearCatalog
      ? 'Quick update: asks the wiki what changed since the last build and re-reads ONLY those pages (seconds, usually). Shift-click for a full rebuild of everything.'
      : 'First build reads every item page off the wiki (a few minutes, with progress). After that, updates only re-read what changed.';
    upd.addEventListener('click', async (ev) => {
      if (gearBuildBusy) return;
      gearBuildBusy = true;
      renderClassTab();
      const r = await window.overlay.buildGearCatalog({ full: !!ev.shiftKey });
      gearBuildBusy = false;
      gearByName = null;
      if (r && r.error) toast('⚠ Gear catalog: ' + r.error);
      else {
        gearCatalog = await window.overlay.getGearCatalog();
        if (r.unchanged) toast('🛡 Catalog already current — nothing changed on the wiki');
        else if (r.incremental) toast('🛡 Catalog updated: ' + (r.updated || 0) + ' refreshed, ' + (r.added || 0) + ' new' + (r.dropped ? ', ' + r.dropped + ' removed' : ''));
        else toast('🛡 Gear catalog ready: ' + (r.items || 0) + ' wearable items');
      }
      renderClassTab();
    });
    ctr.append(selP, selW, selT, wbtn, upd);
    root.appendChild(ctr);
    // obtain filter chips
    const ob = gearObtainSel();
    const obr = document.createElement('div');
    obr.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px';
    for (const [k, label] of GEAR_OBTAIN) {
      const chip = document.createElement('span');
      chip.className = 'qview-chip' + (ob[k] ? ' active' : '');
      chip.textContent = label;
      chip.title = 'Include items obtained this way in "best obtainable"';
      chip.addEventListener('click', () => {
        const next = { ...gearObtainSel(), [k]: !ob[k] };
        save({ gearObtain: next });
        settings.gearObtain = next;
        renderClassTab();
      });
      obr.appendChild(chip);
    }
    root.appendChild(obr);
    if (gearProgressMsg || gearBuildBusy) {
      const p = document.createElement('div');
      p.className = 'q-npc';
      p.textContent = '⏳ ' + (gearProgressMsg || 'building…');
      root.appendChild(p);
    }
    if (wEditOpen) {
      const we = document.createElement('div');
      we.className = 'q-npc';
      we.style.cssText += ';display:flex;flex-wrap:wrap;gap:4px 10px';
      const W = gearWeights();
      for (const [k, label] of GEAR_WKEYS) {
        const lab = document.createElement('label');
        lab.style.cssText = 'display:flex;gap:3px;align-items:center;font-size:9.5px;color:#9ab';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = '0.1';
        inp.value = W[k] || 0;
        inp.style.cssText = 'width:44px;background:#26262f;color:#eee;border:1px solid #444;border-radius:3px;font-size:10px;padding:0 2px';
        inp.addEventListener('change', () => {
          const p = gearPurpose();
          const gw = { ...((settings && settings.gearWeights) || {}) };
          gw[p] = { ...(gw[p] || {}), [k]: +inp.value || 0 };
          save({ gearWeights: gw });
          settings.gearWeights = gw;
          renderClassTab();
        });
        lab.append(label, inp);
        we.appendChild(lab);
      }
      const rst = document.createElement('button');
      rst.className = 'kbtn';
      rst.textContent = 'reset to preset';
      rst.style.fontSize = '9.5px';
      rst.addEventListener('click', () => {
        const gw = { ...((settings && settings.gearWeights) || {}) };
        delete gw[gearPurpose()];
        save({ gearWeights: gw });
        settings.gearWeights = gw;
        renderClassTab();
      });
      we.appendChild(rst);
      root.appendChild(we);
    }
    if (!gearCatalog || !gearCatalog.items) {
      const d = document.createElement('div');
      d.className = 'q-npc';
      d.innerHTML = 'No gear catalog yet. <b>⬇ Build catalog</b> reads every item page off the wiki once (a few minutes), then it\'s cached, synced between your computers, and scored instantly.';
      root.appendChild(d);
      return;
    }
    if (!trio) {
      const d = document.createElement('div');
      d.className = 'q-npc';
      d.textContent = 'Pick your trio above (or type /who in game once — SEQO reads your makeup from your own row).';
      root.appendChild(d);
      return;
    }
    // the slot board
    const W = gearWeights();
    const wsel = (settings && settings.gearWeapon) || 'any';
    const T = (settings && settings.gearTier) || 0;
    const age = document.createElement('div');
    age.className = 'q-npc';
    age.textContent = '📚 ' + gearCatalog.items.length + ' wearable items' +
      (gearCatalog.futureSkipped ? ' (current Legends content only — ' + gearCatalog.futureSkipped + ' future-era pages skipped)' : '') +
      ' · built ' + fmtAge(gearCatalog.built) + ' · scored for ' + trio.join('/') +
      ' (' + GEAR_PRESETS[gearPurpose()].label + (T ? ', everything at +' + T : ', at base') + ')';
    root.appendChild(age);
    const inv = gameFiles && gameFiles.inventory;
    for (const [disp, invLoc, tok] of GEAR_SLOTS) {
      const candidates = gearCatalog.items.filter(e =>
        slotMatches(e, tok) && trioCanWear(e, trio) && weaponTypeOk(e, tok, wsel));
      const scored = candidates.map(e => ({ e, s: gearScore(e, W, T) })).sort((a, b) => b.s - a.s);
      const obSel = gearObtainSel();
      const obtainable = scored.filter(x => obSel[x.e.ob]);
      // worn + owned — an item you hold is scored at BOTH tiers that matter:
      // what it is right now ("Breastplate +7" at +7) and what it would be at
      // the compare tier, so "+3 → at +10" is explicit instead of confusing
      const realTier = (name) => {
        const m = /\+(\d+)$/.exec(String(name).trim());
        return m ? Math.min(10, +m[1]) : 0;
      };
      const ownScore = (name, e) => {
        if (!e) return { now: null, cmp: null, rt: realTier(name), ct: T };
        const rt = realTier(name);
        const ct = Math.max(T, rt);
        return { rt, ct, now: gearScore(e, W, rt), cmp: gearScore(e, W, ct) };
      };
      const wornNames = wornBySlot(invLoc);
      const wornScored = wornNames.map(n => {
        const e = gearEntry(n);
        const sc = ownScore(n, e);
        return { n, e, ...sc, s: sc.cmp }; // comparisons use the potential value
      });
      let bestOwned = null;
      if (inv) {
        for (const it of Object.values(inv.items || {})) {
          const e = gearEntry(it.name);
          if (!e || !slotMatches(e, tok) || !trioCanWear(e, trio) || !weaponTypeOk(e, tok, wsel)) continue;
          const sc = ownScore(it.name, e);
          if (!bestOwned || sc.cmp > bestOwned.s) bestOwned = { n: it.name, e, ...sc, s: sc.cmp };
        }
      }
      const card = document.createElement('div');
      card.className = 'q-quest';
      const head = document.createElement('div');
      head.className = 'q-head';
      head.innerHTML = '<span>' + (clExpanded.has(tok) ? '▾' : '▸') + '</span><span class="rw"></span><span class="st"></span>';
      head.querySelector('.rw').textContent = disp +
        (wornScored.length ? ' — ' + wornScored.map(x => x.n).join(' · ') : ' — (empty)');
      const topUp = obtainable[0];
      const wornBest = wornScored.reduce((m, x) => x.s != null && (m == null || x.s > m) ? x.s : m, null);
      const upArrow = topUp && wornBest != null && topUp.s > wornBest * 1.02;
      head.querySelector('.st').textContent = topUp
        ? (upArrow ? '⬆ upgrade exists' : wornBest != null ? '✓ near best' : '')
        : '';
      if (upArrow) head.querySelector('.st').style.color = '#7dffa0';
      head.addEventListener('click', () => {
        clExpanded.has(tok) ? clExpanded.delete(tok) : clExpanded.add(tok);
        renderClassTab();
      });
      card.appendChild(head);
      if (clExpanded.has(tok)) {
        const box = document.createElement('div');
        box.className = 'q-items';
        const addRow = (tag, name, scoreText, e, star) => {
          const r = document.createElement('div');
          r.className = 'q-it';
          r.innerHTML = '<span class="box"></span><span class="nm itemlink"></span><span class="loc"></span>' + (star ? '<span class="str" style="flex:none;cursor:pointer;color:#ffd766;padding:0 3px">☆</span>' : '');
          r.querySelector('.box').textContent = tag;
          r.querySelector('.nm').textContent = name;
          r.querySelector('.loc').textContent = (scoreText || 'not in catalog') +
            (e && e.src ? ' · ' + e.src : e && e.ob ? ' · ' + e.ob : '');
          r.querySelector('.nm').addEventListener('click', (ev) => { ev.stopPropagation(); openItem(name); });
          if (star) r.querySelector('.str').addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleWish(name);
            toast('⭐ ' + name + ' added to your wish list — zone needs will flag where it drops');
          });
          if (e) r.title = [e.skill, e.dmg ? 'DMG ' + e.dmg + ' DLY ' + e.dly : '',
            Object.entries(e.stats || {}).map(([k, v]) => k.toUpperCase() + ' ' + (v > 0 ? '+' : '') + v).join(' '),
            e.haste ? 'Haste +' + e.haste + '%' : '', e.effect ? 'Effect: ' + e.effect : '']
            .filter(Boolean).join(' · ');
          box.appendChild(r);
        };
        // your items read "score 640 @+3 → 812 @+10": what it IS, then what it
        // would be at the compare tier — the name keeps its real +N
        const ownText = (x) => x.now == null ? null
          : 'score ' + Math.round(x.now) + ' @+' + x.rt +
            (x.ct > x.rt ? ' → ' + Math.round(x.cmp) + ' @+' + x.ct : '');
        for (const x of wornScored) addRow('👤', x.n, ownText(x), x.e, false);
        if (bestOwned && !wornNames.some(n => normItemName(n) === normItemName(bestOwned.n)))
          addRow('🎒', bestOwned.n, ownText(bestOwned), bestOwned.e, false);
        for (const x of obtainable.slice(0, 5))
          addRow('🌍', x.e.n, 'score ' + Math.round(x.s) + ' @+' + T, x.e, true);
        if (!obtainable.length) {
          const none = document.createElement('div');
          none.className = 'q-npc';
          none.textContent = 'Nothing matches the filters for this slot.';
          box.appendChild(none);
        }
        card.appendChild(box);
      }
      root.appendChild(card);
    }
    const foot = document.createElement('div');
    foot.className = 'q-npc';
    foot.style.marginTop = '4px';
    foot.textContent = '👤 worn · 🎒 best you own · 🌍 best obtainable (☆ = watch it in zone needs). "+N" upgrades score as their base item — the game\'s upgrade tiers only raise stats. Data: eqlwiki.com — all credit to its editors.';
    root.appendChild(foot);
  }

  // ---------- the tab shell: chips + trio selector ----------
  function renderClassTab() {
    const root = $('cl-root');
    if (!root) return;
    const prevBody = $('cl-body');
    const prevScroll = prevBody ? prevBody.scrollTop : 0;
    root.innerHTML = '';
    // header: chip switcher + trio selector
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:4px';
    for (const [key, label] of [['gear', '🛡 Gear'], ['buffs', '🧪 Buffs'], ['book', '📕 Spellbook']]) {
      const c = document.createElement('span');
      c.className = 'qview-chip' + (clChip() === key ? ' active' : '');
      c.textContent = label;
      c.addEventListener('click', () => { save({ classChip: key }); settings.classChip = key; renderClassTab(); });
      head.appendChild(c);
    }
    const spacer = document.createElement('span');
    spacer.style.cssText = 'color:#889;font-size:10px;margin-left:8px';
    spacer.textContent = 'Trio:';
    head.appendChild(spacer);
    const trio = currentTrio() || ['', '', ''];
    for (let i = 0; i < 3; i++) {
      const sel = document.createElement('select');
      sel.style.cssText = 'background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;font-size:10.5px';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '—';
      sel.appendChild(blank);
      for (const c of TRIO_CLASSES) {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        sel.appendChild(o);
      }
      sel.value = trio[i] || '';
      sel.addEventListener('change', () => {
        const next = [0, 1, 2].map(j => j === i ? sel.value : (currentTrio() || ['', '', ''])[j] || '');
        save({ plannerTrio: next });
        settings.plannerTrio = next;
        renderClassTab();
      });
      head.appendChild(sel);
    }
    const det = detectedTrio();
    if (settings && settings.plannerTrio && det) {
      const auto = document.createElement('button');
      auto.className = 'kbtn';
      auto.style.fontSize = '9.5px';
      auto.textContent = '↩ mine (' + det.join('/') + ')';
      auto.title = 'Back to your detected makeup';
      auto.addEventListener('click', () => { save({ plannerTrio: null }); settings.plannerTrio = null; renderClassTab(); });
      head.appendChild(auto);
    } else if (!det && !(settings && settings.plannerTrio)) {
      const hint = document.createElement('span');
      hint.style.cssText = 'color:#778;font-size:9.5px';
      hint.textContent = '(/who in game fills this in)';
      head.appendChild(hint);
    }
    root.appendChild(head);
    const body = document.createElement('div');
    body.id = 'cl-body';
    body.style.cssText = 'flex:1;min-height:0;overflow-y:auto;padding-right:4px';
    root.appendChild(body);
    if (clChip() === 'buffs') renderBuffsChip(body);
    else if (clChip() === 'book') renderSpellbookChip(body);
    else renderGearChip(body);
    body.scrollTop = prevScroll; // live re-renders must not snap the view to the top
  }

