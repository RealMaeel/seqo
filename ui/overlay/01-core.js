// SEQO overlay — shared helpers (fmt, $, keepScroll) and the core state.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  const BASE_W = 480, BASE_H = 320, TOOLBAR_H = 30;
  let settings = null;
  let locked = false;

  const $ = (id) => document.getElementById(id);

  // Live events re-render the active view, and rebuilding a list snaps its
  // scroll to the top — mid-read, mid-scroll. Every renderer calls this on its
  // scroll container FIRST: the position is put back right after the rebuild.
  // A renderer that means to jump (e.g. Slayer's chain click) sets
  // scrollOverride AFTER its own scrollIntoView.
  let scrollOverride = false;
  function keepScroll(el) {
    if (!el) return;
    const st = el.scrollTop;
    if (!st) return;
    scrollOverride = false;
    queueMicrotask(() => { if (!scrollOverride) el.scrollTop = st; });
  }
  const fmt = (n) => n >= 100000 ? (n / 1000).toFixed(0) + 'k'
                   : n >= 10000 ? (n / 1000).toFixed(1) + 'k'
                   : Math.round(n).toLocaleString();
  const fmtDur = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const fmtCoin = (c) => {
    const pp = Math.floor(c / 1000), gp = Math.floor(c % 1000 / 100),
          sp = Math.floor(c % 100 / 10), cp = c % 10;
    const parts = [];
    if (pp) parts.push(pp + 'pp'); if (gp) parts.push(gp + 'gp');
    if (sp) parts.push(sp + 'sp'); if (cp || !parts.length) parts.push(cp + 'cp');
    return parts.join(' ');
  };

  // ================= state =================
  const tracker = new EQLParser.FightTracker();
  let charName = null;
  let meterDirty = false;
  let lootDB = { mobs: {} };
  let sessionCoin = 0;
  let recentDrops = [];           // [{item, mob}]
  // session-wide aggregation across all completed fights
  const session = { fights: 0, swings: 0, total: 0, durS: 0, sources: new Map(), pets: new Map(),
                    players: new Map() };  // everyone else: name -> { total, sources: Map }
  const petNames = new Set();   // summoned pets + the one active charm; shared with the tracker
  let activeCharm = null;       // only ONE charm at a time; generic names must not linger
  let lastYouCast = null;       // {spell, when} - to learn which spells are charms
  // curated charm list + whose charm a landing is: charms.js (2.7). A charm only becomes
  // YOUR pet when you cast it; another player's charm counts for that player.
  const CHARM_SPELLS = { has: (s) => window.EQLCharms ? EQLCharms.isCharmSpell(s) : false };
  const charms = window.EQLCharms ? EQLCharms.create() : null;
  const petOwners = new Map();  // another player's charmed mob -> that player (the meter credits them)
  window.overlay.getPets().then(p => { for (const n of p || []) petNames.add(n); });
  tracker.petNames = petNames; // tracker must not filter same-named charm pets as enemies
  tracker.petOwners = petOwners;

  function setActiveCharm(name) {
    if (activeCharm && activeCharm !== name) petNames.delete(activeCharm);
    activeCharm = name;
    if (name) petNames.add(name);
  }

  // manual pet marking: some pets never speak, so clicking a meter row
  // toggles "this is my pet" (persisted for named pets, charm-style for mobs)
  function togglePetRow(name) {
    if (name === 'You') return;
    if (petNames.has(name)) {
      petNames.delete(name);
      if (activeCharm === name) activeCharm = null;
      window.overlay.unlearnPet(name);
      session.pets.delete(name);   // drop its row from the session breakdown too
      toast('Unmarked as pet: ' + name);
    } else if (/^(a|an|the) /.test(name)) {
      setActiveCharm(name);
      toast('🐾 Marked as your charm: ' + name);
    } else {
      petNames.add(name);
      window.overlay.learnPet(name);
      toast('🐾 Marked as your pet: ' + name);
    }
    // re-flag this fight's events so attribution updates immediately
    if (tracker.current) {
      for (const e of tracker.current.events) {
        if (e.attacker === name) e.pet = petNames.has(name);
      }
    }
    meterDirty = true;
    renderMeter();
  }
  let expandedMobs = new Set();
  let lootDirty = false;
  let lastCorpse = null;   // {mob, when} - most recent kill, for kept-item attribution
  let sourceClass = {};    // user corrections: source -> 'ability'
  window.overlay.getSourceClasses().then(sc => { sourceClass = sc || {}; });
  let wasLiveFight = false;

