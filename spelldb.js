// SEQO - spell database, parsed straight from the GAME'S OWN FILES (main process).
//
// Sources, all inside the EverQuest Legends install folder:
//   spells_us.txt                      - every spell: classes, duration, target
//   spells_us_str.txt                  - per spell: cast-on-you line + exact fade line
//   Resources/SpellStackingGroups.txt  - the game's own "these don't stack" table
//   dbstr_us.txt (type 6)              - human descriptions
//
// Parsed once per game patch: the extracted subset is cached in the app's
// LOCAL userData (never the shared/synced folder — it mirrors this machine's
// install) keyed on the files' size+mtime, so normal launches load in
// milliseconds and a patch triggers one background re-parse.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CLASSES = ['WAR', 'CLR', 'PAL', 'RNG', 'SHD', 'DRU', 'MNK', 'BRD', 'ROG', 'SHM', 'NEC', 'WIZ', 'MAG', 'ENC', 'BST', 'BER'];

// spells_us.txt columns (verified empirically against known spells)
const COL = { ID: 0, NAME: 1, CAST: 8, DUR_F: 11, DUR_B: 12, MANA: 14, BENEFICIAL: 28, TARGET: 30, SKILL: 32, CLS0: 36 };

// classic duration formulas (ticks of 6s), capped at base — EQEmu-compatible
function durationTicks(formula, base, level) {
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
    case 3600: return base || 3600;
    default: t = base;
  }
  return base ? Math.min(t, base) : t;
}

const fileKey = (p) => {
  try { const s = fs.statSync(p); return s.size + ':' + Math.round(s.mtimeMs); } catch { return 'missing'; }
};

function spellFiles(gameRoot) {
  return {
    spells: path.join(gameRoot, 'spells_us.txt'),
    strs: path.join(gameRoot, 'spells_us_str.txt'),
    stacking: path.join(gameRoot, 'Resources', 'SpellStackingGroups.txt'),
    dbstr: path.join(gameRoot, 'dbstr_us.txt')
  };
}

function cacheKeyFor(gameRoot) {
  const f = spellFiles(gameRoot);
  // the leading token is a parser version: bump it and every cache rebuilds
  return ['v7', fileKey(f.spells), fileKey(f.strs), fileKey(f.stacking)].join('|');
}

// ---------------------------------------------------------------------------
// Effect slots: the row's last field holds "$"-separated entries of
// slot|SPA|base|limit|calc|max. Map the SPAs a buff planner cares about to
// readable stat keys; value = the bigger of |base| and |max| (max-level value).
// ---------------------------------------------------------------------------
const SPA_MAP = {
  0: 'hpregen', 1: 'ac', 2: 'atk', 3: 'move', 4: 'str', 5: 'dex', 6: 'agi',
  7: 'sta', 8: 'int', 9: 'wis', 10: 'cha', 11: 'haste', 15: 'manaregen',
  46: 'svF', 47: 'svC', 48: 'svP', 49: 'svD', 50: 'svM', 55: 'rune',
  59: 'ds', 69: 'hp', 97: 'mana',
  13: 'seeinvis', 14: 'eb', 57: 'lev', 65: 'vision', 66: 'vision', 85: 'proc',
  // audit round (every castable buff checked against its slot data):
  79: 'hp',        // HP bump variant (Daring / Courage line)
  100: 'hpregen',  // heal over time (Celestial Healing line)
  184: 'acc',      // chance-to-hit % (Hawk Eye line)
  185: 'meleedmg', // melee damage % (disciplines)
  114: 'hate',     // aggro modifier % (Voice of… line)
  78: 'rune', 161: 'rune', 162: 'rune', // absorb family: spell/melee wards
  12: 'invis', 58: 'illusion'
};
// flag-type effects: presence matters, the number is an id or a 0/1 marker
const SPA_FLAG = { 13: 1, 14: 1, 57: 1, 65: 1, 66: 2, 85: 1, 12: 1, 58: 1 }; // ultravision(66) outranks infravision(65)
// damage-dealing beneficial slots store the damage as a NEGATIVE base
const SPA_NEG_OK = new Set([59, 55]);

// slot values scale with caster level through a calc formula (classic table),
// capped at max. Values are computed at the Legends level cap (50) — that is
// what the slot entry means in game at 50, not the theoretical cap.
const EFF_LEVEL = 50;
function calcSlotValue(base, calc, max, level) {
  let v = Math.abs(base);
  switch (+calc) {
    case 0: case 100: break;                                  // flat
    case 101: v += Math.floor(level / 2); break;
    case 102: v += level; break;
    case 103: v += level * 2; break;
    case 104: v += level * 3; break;
    case 105: v += level * 4; break;
    case 108: v += Math.floor(level / 3); break;
    case 109: v += Math.floor(level / 4); break;
    default: v = Math.max(v, Math.abs(max) || v);             // unknown curve: the cap
  }
  if (max) v = Math.min(v, Math.abs(max));
  return v;
}

function parseEffects(field) {
  if (!field || !field.includes('|')) return null;
  const eff = {};
  let procId = 0;
  for (const part of field.split('$')) {
    const p = part.split('|');
    if (p.length < 3) continue;
    const spa = +p[1], base = +p[2] || 0, calc = +(p[4] || 0) || 0, max = +(p[5] || 0) || 0;
    const key = SPA_MAP[spa];
    if (!key) continue;
    if (SPA_FLAG[spa]) {                         // presence flag (proc, vision…)
      if (base || max) eff[key] = Math.max(eff[key] || 0, SPA_FLAG[spa]);
      if (spa === 85 && base > 0 && !procId) procId = base; // the proc IS a spell
      continue;
    }
    if (base < 0 && max <= 0 && !SPA_NEG_OK.has(spa)) continue; // detrimental component
    if (spa === 10 && base === 0) continue;      // CHA 0 = filler slot
    let val = calcSlotValue(base, calc, max, EFF_LEVEL);
    if (!val) continue;
    if (spa === 11) {                            // haste stored as 1xx%
      if (val <= 100) continue;
      val -= 100;
    }
    eff[key] = Math.max(eff[key] || 0, val);
  }
  if (!Object.keys(eff).length) return null;
  return procId ? { eff, procId } : { eff };
}

async function eachLine(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'latin1' }), crlfDelay: Infinity });
  for await (const line of rl) fn(line);
}

// ---------------------------------------------------------------------------
async function parseSpellFiles(gameRoot) {
  const f = spellFiles(gameRoot);
  if (!fs.existsSync(f.spells)) throw new Error('spells_us.txt not found in the game folder');

  // pass 1: the spell table. Keep every spell with a duration (fades matter)
  // plus every beneficial spell a player class can cast (the planner pool).
  const spells = new Map(); // id -> record
  await eachLine(f.spells, (line) => {
    const c = line.split('^');
    if (c.length < 60 || !+c[COL.ID]) return;
    const name = c[COL.NAME];
    if (!name || /^(Test|Beta|GM |NPC|AVCReserved|SKU)/i.test(name)) return;
    const durB = +c[COL.DUR_B] || 0, durF = +c[COL.DUR_F] || 0;
    const ben = c[COL.BENEFICIAL] === '1';
    const cls = {};
    let castable = false;
    for (let i = 0; i < 16; i++) {
      const lv = +c[COL.CLS0 + i];
      if (lv >= 1 && lv < 255) { cls[CLASSES[i]] = lv; castable = true; }
    }
    const hasDur = durB > 0 || durF === 50 || durF === 3;
    if (!hasDur) return; // only lasting effects matter (tracking, planning, fades)
    let minLv = 999;
    for (const v of Object.values(cls)) minLv = Math.min(minLv, v);
    const rec = {
      id: +c[COL.ID], n: name, ben: ben ? 1 : 0,
      tgt: +c[COL.TARGET] || 0, mana: +c[COL.MANA] || 0,
      cast: +c[COL.CAST] || 0, durF, durB, minLv,
      cls: castable ? cls : null
    };
    if (ben && castable) { // planner pool spells carry their parsed effects
      const pe = parseEffects(c[c.length - 1]);
      if (pe) { rec.eff = pe.eff; if (pe.procId) rec._procId = pe.procId; }
    }
    spells.set(+c[COL.ID], rec);
  });

  // pass 2: stacking groups — SPELL_ID^GROUP^RANK^TYPE
  const stacking = {};
  if (fs.existsSync(f.stacking)) {
    await eachLine(f.stacking, (line) => {
      if (line.startsWith('#')) return;
      const c = line.split('^');
      const id = +c[0];
      if (id && spells.has(id)) stacking[id] = { g: +c[1], r: +c[2], t: +c[3] };
      else if (id) stacking[id] = { g: +c[1], r: +c[2], t: +c[3] }; // keep even unknown: rank checks
    });
  }

  // pass 3: strings — #SPELLINDEX^CASTERMETXT^CASTEROTHERTXT^CASTEDMETXT^CASTEDOTHERTXT^SPELLGONE
  // fadeMap:  exact fade line  -> [spell names]   (dedup by name)
  // landMap:  cast-on-you line -> [spell ids]     (ids so duration/stacking resolve)
  const fadeMap = {}, landMap = {};
  if (fs.existsSync(f.strs)) {
    await eachLine(f.strs, (line) => {
      if (line.startsWith('#')) return;
      const c = line.split('^');
      const id = +c[0];
      const sp = spells.get(id);
      if (!sp) return;
      const gone = (c[5] || '').trim();
      const landed = (c[3] || '').trim();
      if (gone) {
        const arr = fadeMap[gone] = fadeMap[gone] || [];
        if (!arr.includes(sp.n)) arr.push(sp.n);
      }
      if (landed) {
        const arr = landMap[landed] = landMap[landed] || [];
        if (!arr.includes(id)) arr.push(id);
      }
    });
  }

  // prune to what the overlay actually uses: the planner pool (castable
  // beneficials) in full, plus slim records for anything a cast-on-you line
  // can land (so the live buff tracker can name + time NPC debuffs too)
  // planner pool: real player buffs — beneficial, learnable by level 60,
  // aimed at a player or the group (the odd EQL target codes included)
  const POOL_TGT = new Set([3, 5, 6, 40, 41, 51]);
  const keep = new Set();
  const pool = new Set();
  for (const [id, sp] of spells) {
    if (!sp.ben || !sp.cls || sp.minLv > 60 || !POOL_TGT.has(sp.tgt)) continue;
    // "Item Benefit: X" rows are item-granted effects, not memorizable spells —
    // they still fade/land (tracker keeps them) but never belong in a loadout
    if (/^Item (Benefit|Effect)\b/i.test(sp.n)) { delete sp.cls; delete sp.eff; continue; }
    keep.add(id); pool.add(id);
  }
  // tracker records only matter for effects that LAST — drop instant landings
  // (and their landMap lines) so the payload stays lean
  for (const [line, ids] of Object.entries(landMap)) {
    const lasting = ids.filter(id => { const sp = spells.get(id); return sp && (sp.durB > 0 || sp.durF === 50 || sp.durF === 3); });
    if (!lasting.length) { delete landMap[line]; continue; }
    landMap[line] = lasting;
    for (const id of lasting) keep.add(id);
  }
  // fade lines for spells we do not track anywhere else still resolve by name,
  // so fadeMap stays complete — it is names, not records

  // pass 4: descriptions (dbstr type 6, keyed by spell id) for planner spells
  const desc = {};
  if (fs.existsSync(f.dbstr)) {
    await eachLine(f.dbstr, (line) => {
      const i = line.indexOf('^');
      if (i < 1) return;
      const id = +line.slice(0, i);
      if (!pool.has(id)) return;
      const c = line.split('^');
      if (c[1] === '6' && c[2]) desc[id] = c[2].length > 320 ? c[2].slice(0, 317) + '…' : c[2];
    });
  }

  // resolve weapon procs: the proc id IS a spell — read its name, targeting
  // and damage in one extra pass so "Proc: AE lifetap 30" can be shown
  const procIds = new Set();
  for (const id of pool) { const sp = spells.get(id); if (sp._procId) procIds.add(sp._procId); }
  if (procIds.size) {
    const procData = {};
    await eachLine(f.spells, (line) => {
      const c = line.split('^');
      const id = +c[COL.ID];
      if (!procIds.has(id)) return;
      let amt = 0;
      const m = /(?:^|\$)\d+\|(?:0|79)\|(-?\d+)\|\d+\|(\d+)\|(-?\d+)/.exec(c[c.length - 1]);
      if (m) amt = calcSlotValue(+m[1], +m[2], +m[3], EFF_LEVEL);
      const tgt = +c[COL.TARGET] || 0;
      procData[id] = {
        n: c[COL.NAME],
        kind: [4, 8, 24, 40, 41, 44, 45].includes(tgt) ? 'AE' : tgt === 13 ? 'lifetap' : 'single',
        amt
      };
    });
    for (const id of pool) {
      const sp = spells.get(id);
      if (sp._procId && procData[sp._procId]) sp.procInfo = procData[sp._procId];
    }
  }
  const byId = {}, stk = {};
  for (const id of keep) {
    const sp = spells.get(id);
    delete sp._procId;
    byId[id] = pool.has(id) ? sp
      : { id: sp.id, n: sp.n, ben: sp.ben, durF: sp.durF, durB: sp.durB }; // slim: tracker-only
    if (stacking[id]) stk[id] = stacking[id];
  }
  return { classes: CLASSES, spells: byId, stacking: stk, fadeMap, landMap, desc, builtAt: Date.now() };
}

// ---------------------------------------------------------------------------
// cache wrapper
let memo = null; // { key, data }

async function getSpellDB(gameRoot, cacheDir) {
  if (!gameRoot) return null;
  const key = cacheKeyFor(gameRoot);
  if (key.includes('missing')) return null; // not an EQ folder (or files absent)
  if (memo && memo.key === key) return memo.data;
  const cachePath = path.join(cacheDir, 'spelldb-cache.json');
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cached.key === key && cached.data && cached.data.spells) {
      memo = cached;
      return cached.data;
    }
  } catch { /* no cache yet */ }
  const data = await parseSpellFiles(gameRoot);
  memo = { key, data };
  try { fs.writeFileSync(cachePath, JSON.stringify(memo)); } catch { /* disk hiccup: parse again next boot */ }
  return data;
}

module.exports = { getSpellDB, parseSpellFiles, durationTicks, CLASSES };
