// SEQO overlay — camp timers, rare detection, respawn knowledge, camp bar.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= camp timers + rare detection =================
  const timers = new Map();        // mob -> {mob, zone, lastDeath, resp, pinned, notified, windowNotified}
  let respawnDB = {};              // "zone|mob" -> seconds (legacy) or respawn entry object
  window.overlay.getRespawns().then(r => { respawnDB = r || {}; });
  let namedSet = new Set();        // lowercased named-mob names for current zone
  const rareSeen = new Map();      // mob -> last toast time

  // What counts as a RARE. The zone's "named" list is really "mobs the wiki
  // knows drops for", which includes generic mobs and even loot objects
  // ("a haunted chest" in Hate). A rare must: be on the zone list, not be an
  // object, carry a proper name (not all-lowercase like "a haunted chest" —
  // "The Ishva Mal" still counts), and not be on your not-a-rare list.
  const OBJECT_RE = /\b(chest|coffer|cache|crate|barrel|box|urn|vase|sack|corpse)s?\b/i;
  let bossSet = new Set();         // wiki-confirmed bosses/named for current zone
  let notRares = {};               // gameDB.notRares: { zone: [mob, ...] } — synced
  // mobs YOU marked as rare (or the game called "a rare creature" on /con), per zone
  const rareAdds = () => (settings && settings.rareAdds) || {};
  const isUserRare = (key) => !!(rareAdds()[currentZone || ''] || []).some(n => n.toLowerCase() === String(key).toLowerCase());
  function setUserRare(name, on) {
    const z = currentZone || '';
    const all = { ...rareAdds() };
    const set = new Set(all[z] || []);
    const k = mobKey(name);
    for (const n of [...set]) if (n.toLowerCase() === k.toLowerCase()) set.delete(n);
    if (on) { set.add(k); if (isNotRare(k)) setNotRare(k, false); }
    all[z] = [...set];
    save({ rareAdds: all });
  }
  // a named mob you actually fought: no article, capitalised, not an object, and it
  // was on the enemy side of the fight (keeps players who died out of the count)
  function looksNamedEnemy(name) {
    const k = mobKey(name);
    if (!k || /^(a|an|the) /i.test(k) || !/^[A-Z#]/.test(k) || OBJECT_RE.test(k)) return false;
    const f = tracker.current || tracker.last;
    return !!(f && (f.enemies.has(k) || f.enemies.has(name)));
  }
  // counts as a rare for the run checklist
  function isRunRare(name) {
    const k = mobKey(name);
    if (isNotRare(k)) return false;
    return isRareMob(k) || isUserRare(k) || looksNamedEnemy(k);
  }
  window.overlay.getNotRares().then((n) => { notRares = n || {}; });
  const isNotRare = (key) =>
    ((notRares[currentZone || ''] || []).some(n => n.toLowerCase() === key.toLowerCase()));
  function isRareMob(name) {
    const key = mobKey(name);
    if (isNotRare(key)) return false;
    if (bossSet.has(key.toLowerCase())) return true; // page says Boss/Named — trust it
    if (!namedSet.has(key.toLowerCase())) return false;
    if (OBJECT_RE.test(key)) return false;
    const bare = key.replace(/^(a|an|the) /i, '');
    if (!/^[A-Z#]/.test(bare)) return false;   // "a haunted chest" → generic, not a rare
    return true;
  }
  function setNotRare(name, ignored) {
    const z = currentZone || '';
    const arr = new Set(notRares[z] || []);
    if (ignored) arr.add(mobKey(name)); else arr.delete(mobKey(name));
    notRares[z] = [...arr];
    window.overlay.setNotRare(z, mobKey(name), ignored);
  }

  // ---- respawn knowledge (v2.4): entries are objects, legacy plain seconds
  // still load. { s, min?, max?, src: 'learned'|'manual'|'wiki', n, samples[] }
  // A min/max pair is a SPAWN WINDOW ("15–30m"); s alone is a fixed cycle.
  const normRespawn = (v) =>
    v == null ? null
    : typeof v === 'number' ? { s: v, src: 'learned', n: 1, samples: [v] }
    : v;
  let lastZoneChangeAt = 0;     // kills can't teach gaps that span a zone line
  let currentZoneInst = false;  // instanced copies never teach the base zone

  function resolveRespawn(mob, zone) {
    const e = normRespawn(respawnDB[(zone || lootZone()) + '|' + mob]);
    if (e) return e;
    if (zoneData && zoneData.respawnSeconds)
      return { s: zoneData.respawnSeconds, src: 'wiki', n: 0 };
    return null;
  }

  // pedigree marker shown after the countdown
  const respMark = (e) => !e ? ''
    : e.src === 'manual' ? ' ✎'
    : e.src === 'wiki' ? ' ~wiki'
    : (e.n || 0) >= 3 ? ' ⟲'
    : ' ~';

  // cluster-and-vote gap learning: collect kill-to-kill gaps, drop obvious
  // missed-cycle outliers, then decide fixed cycle vs spawn window.
  function learnGap(key, gap) {
    const dbKey = lootZone() + '|' + key;
    const cur = normRespawn(respawnDB[dbKey]);
    if (cur && cur.src === 'manual') return cur;     // ✎ beats everything
    const samples = ((cur && cur.samples) || []).concat(gap).slice(-12);
    // drop missed-cycle outliers: anything ≥ 2.8× the shortest sample
    const lo = Math.min(...samples);
    const used = samples.filter(s => s < lo * 2.8);
    const sorted = [...used].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const spread = sorted[sorted.length - 1] / sorted[0];
    let e;
    if (sorted.length >= 2 && spread > 1.15) {
      // consistent variance = spawn window (think 15–30 min wanderers)
      e = { min: sorted[0], max: sorted[sorted.length - 1], s: median,
            src: 'learned', n: sorted.length, samples };
    } else {
      e = { s: median, src: 'learned', n: sorted.length, samples };
    }
    respawnDB[dbKey] = e;
    window.overlay.learnRespawn(lootZone(), key, e);
    return e;
  }

  function setManualRespawn(mob, text, zone) {
    const zkey = zone || lootZone();
    const dbKey = zkey + '|' + mob;
    const cur = normRespawn(respawnDB[dbKey]);
    if (!text) { // revert to auto: keep learned samples if any, else forget
      if (cur && cur.samples && cur.samples.length) {
        const next = { ...cur, src: 'learned' };
        delete next.manual;
        respawnDB[dbKey] = next;
        window.overlay.learnRespawn(zkey, mob, next);
      } else {
        delete respawnDB[dbKey];
        window.overlay.learnRespawn(zkey, mob, null);
      }
      return true;
    }
    // "15-30" (bare numbers = minutes) is a window · "6:40" / "400" / "25m" is fixed
    const range = text.match(/^\s*(\d+(?::\d{2})?[smh]?)\s*[-–]\s*(\d+(?::\d{2})?[smh]?)\s*$/);
    let e = null;
    if (range) {
      const side = (s) => /[:smh]/.test(s) ? parseDuration(s) : (+s * 60);
      const a = side(range[1]), b = side(range[2]);
      if (a && b && b > a) e = { min: a, max: b, s: Math.round((a + b) / 2), src: 'manual', manual: text.trim() };
    } else {
      const s = parseDuration(text.trim());
      if (s > 0) e = { s, src: 'manual', manual: text.trim() };
    }
    if (!e) return false;
    if (cur && cur.samples) e.samples = cur.samples; // keep history for a later revert
    respawnDB[dbKey] = e;
    window.overlay.learnRespawn(zkey, mob, e);
    return true;
  }

  function onKill(ev) {
    const mob = mobKey(ev.target);
    const t = timers.get(mob);
    // teach the spawn cycle from death-to-death gaps — but never from
    // instanced copies, and never across a zone transition
    const learnCycle = (timer, key, when) => {
      if (!timer.lastDeath || currentZoneInst) return;
      if (timer.lastDeath < lastZoneChangeAt) return;   // gap spans a zone line
      const gap = Math.round((when - timer.lastDeath) / 1000);
      if (gap < 90 || gap > 21600) return;              // not a plausible cycle
      timer.resp = learnGap(key, gap);
    };

    if (t && t.zone === currentZone) {
      learnCycle(t, mob, ev.when);
      t.lastDeath = ev.when; EQLSpawnWarn.reset(t); t.up = false;
    } else {
      timers.set(mob, {
        mob, zone: currentZone, lastDeath: ev.when,
        resp: resolveRespawn(mob),
        pinned: false, notified: false, windowNotified: false, phs: loadPhs(mob)
      });
    }

    // placeholder mechanics: a PH death resets (and teaches) its named's cycle
    for (const camp of timers.values()) {
      if (camp.pinned && camp.zone === currentZone && camp.phs && camp.phs.has(mob) && camp.mob !== mob) {
        learnCycle(camp, camp.mob, ev.when);
        camp.lastDeath = ev.when; EQLSpawnWarn.reset(camp); camp.up = false;
      }
    }

    if (activeTab === 'timers') renderTimers();
    renderCampBar();
  }

  // persisted PH links: "zone|camp" -> [ph names]
  let phLinksDB = {};
  window.overlay.getPhLinks().then(p => { phLinksDB = p || {}; });
  function loadPhs(mob) {
    return new Set(phLinksDB[currentZone + '|' + mob] || []);
  }
  function savePhs(camp) {
    phLinksDB[currentZone + '|' + camp.mob] = [...camp.phs];
    window.overlay.setPhLinks(currentZone, camp.mob, [...camp.phs]);
  }

  // 2.7.2: a camp must be a real mob name — kills are matched by the exact name the log
  // prints ("the Game Master"), so "game master" would wait forever. Typed names are
  // resolved against the mobs SEQO knows (EQLMobName); an unknown one gets suggestions,
  // and pressing ★ Camp again with the same text adds it anyway (a mob you've never killed).
  let campForce = null;   // { text, at } — the unknown name you were warned about
  function knownMobs() {
    const out = [];
    for (const nm of ((zoneData && zoneData.named) || [])) if (nm.mob && nm.mob !== '(zone drops)') out.push({ name: nm.mob, zone: currentZone });
    for (const m of Object.values((lootDB && lootDB.mobs) || {})) if (m.name) out.push({ name: m.name, zone: m.zone });
    for (const t of timers.values()) out.push({ name: t.mob, zone: t.zone });
    for (const k of Object.keys(respawnDB || {})) { const i = k.indexOf('|'); if (i > 0) out.push({ name: k.slice(i + 1), zone: k.slice(0, i) }); }
    return out;
  }
  // → true when a camp was added (the box can be cleared); otherwise a toast says why
  function addCampTyped(text) {
    const typed = String(text || '').trim();
    if (!typed) return false;
    const r = EQLMobName.resolve(typed, knownMobs(), { zone: currentZone });
    if (r.name) { campForce = null; addCamp(r.name); if (EQLMobName.norm(r.name) !== EQLMobName.norm(typed)) toast('★ Camping ' + r.name); return true; }
    if (campForce && campForce.text === EQLMobName.norm(typed) && Date.now() - campForce.at < 30000) { campForce = null; addCamp(typed); return true; }
    campForce = { text: EQLMobName.norm(typed), at: Date.now() };
    if (r.suggest.length) {
      $('t-add').value = r.suggest[0];
      campForce = null;
      toast('No mob called "' + typed + '" — did you mean ' + r.suggest.map(n => '"' + n + '"').join(' or ') + '? The first is in the box: press ★ Camp.', true);
    } else {
      toast('No mob called "' + typed + '" in your kills or this zone — check the spelling as the game prints it. Press ★ Camp again to add it anyway.', true);
    }
    return false;
  }

  function addCamp(name) {
    const mob = mobKey(name.trim());
    if (!mob) return;
    const t = timers.get(mob);
    if (t) { t.pinned = true; if (!t.phs) t.phs = loadPhs(mob); }
    else {
      timers.set(mob, {
        mob, zone: currentZone, lastDeath: 0,
        resp: resolveRespawn(mob),
        pinned: true, notified: false, windowNotified: false, phs: loadPhs(mob)
      });
    }
    pinnedTip();
    renderTimers(); renderCampBar();
  }

  let linkMode = null;     // camp mob name currently selecting a placeholder
  let editTimerFor = null; // mob whose ✎ manual-timer editor is open

  function renderCampBar() {
    const bar = $('campbar');
    const pinned = [...timers.values()].filter(t => t.pinned);
    bar.style.display = pinned.length ? 'flex' : 'none';
    bar.innerHTML = '';
    const now = Date.now();
    for (const t of pinned.slice(0, 4)) {
      const chip = document.createElement('span');
      const c = t.lastDeath ? fmtCountdown(t, now) : { txt: 'waiting for kill', due: false };
      chip.className = 'campchip' + (c.due ? ' due' : '');
      chip.innerHTML = '★ <span class="cn"></span><span class="ct"></span>';
      chip.querySelector('.cn').textContent = t.mob + (t.zone !== currentZone ? ' (' + t.zone + ')' : '');
      chip.querySelector('.ct').textContent = c.txt;
      chip.title = 'Click to open Timers';
      chip.addEventListener('click', () => setTab('timers'));
      bar.appendChild(chip);
    }
  }

  // a mob with a running repop timer showed combat activity: it's up
  function markUp(name) {
    if (!name || name === 'You') return;
    const t = timers.get(mobKey(name));
    if (t && !t.up && t.lastDeath) {
      t.up = true;
      t.notified = true; // it's visibly up - no need for a "repop due" alert
      if (activeTab === 'timers') renderTimers();
      renderCampBar();
    }
  }
