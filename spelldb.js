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
  return ['v14', fileKey(f.spells), fileKey(f.strs), fileKey(f.stacking)].join('|');
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
  79: 'hp',        // instant HP — counts ONLY next to a max-HP slot (69): HP buffs
                   // (Daring / Courage line) carry both so the new HP arrives full;
                   // alone it is a plain heal (the Legends Echo line) — see parseEffects
  // 100 (heal over time: Celestial Healing, Echo, Blooming Heal lines) is
  // deliberately NOT mapped: a HoT is healing, not a buff, and must never
  // compete for a gem in the buff planner.
  184: 'acc',      // chance-to-hit % (Hawk Eye line)
  185: 'meleedmg', // melee damage % (disciplines)
  114: 'hate',     // aggro modifier % (Voice of… line)
  78: 'rune', 161: 'rune', 162: 'rune', // absorb family: spell/melee wards
  12: 'invis', 58: 'illusion',
  // discipline round: the melee-combat SPAs the /disc abilities run on
  168: 'mit',       // melee mitigation (negative base = take less damage)
  169: 'crit',      // chance to critical hit
  171: 'cripp',     // crippling blow chance
  172: 'avoid',     // avoidance (Voiddance)
  173: 'riposte',   // riposte chance (Whirlwind)
  174: 'dodge',     // dodge chance (Nimble)
  175: 'parry',     // parry chance
  176: 'dualwield', // dual wield chance
  177: 'doubleatk', // double attack chance
  178: 'mlifetap',  // melee lifetap (Leechcurse)
  182: 'delay',     // weapon delay (negative = faster, Hundred Fists)
  183: 'hitchance', // chance to hit
  186: 'mindmg',    // minimum damage modifier (Innerflame)
  219: 'slayundead', // Holyforge
  // Legends cleric buff lines (Oct 2026):
  121: 'meleeheal',  // your melee hits heal you for N (Blessing of the Page/Squire/Knight/Lord Commander);
                     // negative on debuffs (Mark line) = attackers of the target heal, a cost here
  127: 'spellhaste', // cast time -N% (Blessing of Piety/Faith; level limit in slot 134)
  // full-pool audit (Oct 2026), every value confirmed against the spell's own description:
  98: 'haste2',       // extra attack speed, stacks with normal haste (Melody of Ervaj; stored 1xx like haste)
  118: 'songmod',     // song power % (Amplification)
  124: 'spelldmg',    // group direct-damage spell bonus, "up to" the limit field (Rizlona's Embers 15%)
  158: 'reflect',     // spell reflect chance % (Bounce)
  111: 'resall',      // all five resists (Resistant Discipline) — expanded to svF..svP in parseEffects
  112: 'fizzle',      // fizzle rate reduction % (Intellectual Advancement/Superiority)
  // utility: presence effects, cast on demand (never compete for a gem)
  28: 'ivu', 315: 'ivu',          // invisibility versus undead (+ improved)
  29: 'iva',                      // invisibility versus animals
  314: 'invis',                   // improved invisibility / superior camouflage
  87: 'magnify', 73: 'bindsight', 67: 'scout',
  115: 'sustenance', 117: 'magicweapon', 19: 'faction', 181: 'fearimmune',
  40: 'invuln',                   // Divine Aura / Divine Barrier / Harmshield
  323: 'ward'                     // defensive proc (Ward of the Divine)
};
// flag-type effects: presence matters, the number is an id or a 0/1 marker
const SPA_FLAG = { 13: 1, 14: 1, 57: 1, 65: 1, 66: 2, 85: 1, 12: 1, 58: 1, // ultravision(66) outranks infravision(65)
  28: 1, 315: 1, 29: 1, 314: 2, 87: 1, 73: 1, 67: 1, 115: 1, 117: 1, 19: 1, 181: 1, 40: 1, 323: 1 };
// damage-dealing beneficial slots store the damage as a NEGATIVE base —
// likewise mitigation (168) and weapon delay (182), where negative is the gain
const SPA_NEG_OK = new Set([59, 55, 168, 182]);

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
    case 110: v += Math.floor(level / 6); break;              // Amplification
    default: v = Math.max(v, Math.abs(max) || v);             // unknown curve: the cap
  }
  if (max) v = Math.min(v, Math.abs(max));
  return v;
}

function parseEffects(field) {
  if (!field || !field.includes('|')) return null;
  const eff = {};   // beneficial stat values at EFF_LEVEL (the overlay re-scales from raw)
  const cost = {};  // detrimental components of mixed spells (Dark Temptation's HP drain)
  const raw = [];   // scalable slots as [key, base, calc, max, isCost] for level-true values
  const slots = {}; // slot# -> SPA: the game's REAL stacking unit. Two buffs block
                    // each other only when the SAME slot carries the SAME effect —
                    // buff lines are slot-offset on purpose so Grim Aura (ATK in
                    // slot 1) stacks with Dark Temptation (ATK in slot 2).
  let procId = 0;
  const out0 = {};
  const hasMaxHp = field.split('$').some(part => part.split('|')[1] === '69');
  for (const part of field.split('$')) {
    const p = part.split('|');
    if (p.length < 3) continue;
    const slot = +p[0], spa = +p[1], base = +p[2] || 0, calc = +(p[4] || 0) || 0, max = +(p[5] || 0) || 0;
    if (slot && spa !== 254 && (base || max) && !(spa === 10 && base === 0)) slots[slot] = spa;
    if (spa === 134 && base > 0) out0.hasteLv = base;  // cast-speed limit: spells up to this level
    const key = SPA_MAP[spa];
    if (!key) continue;
    if (spa === 79 && !hasMaxHp) continue;       // instant heal, not an HP buff
    if (SPA_FLAG[spa]) {                         // presence flag (proc, vision…)
      if (base || max) eff[key] = Math.max(eff[key] || 0, SPA_FLAG[spa]);
      if (spa === 85 && base > 0 && !procId) procId = base; // the proc IS a spell
      continue;
    }
    if (spa === 10 && base === 0) continue;      // CHA 0 = filler slot
    if (spa === 114 && base < 0) { eff.hatedown = 1; continue; } // Calming Visage: LESS aggro, a utility
    const isCost = base < 0 && max <= 0 && !SPA_NEG_OK.has(spa);
    let val = calcSlotValue(base, calc, max, EFF_LEVEL);
    if (spa === 124) val = Math.max(val, Math.abs(+p[3] || 0)); // "up to" value lives in the limit field
    if (!val) continue;
    if (spa === 111) {                           // all resists: one slot, five stats
      for (const k of ['svF', 'svC', 'svM', 'svD', 'svP']) { raw.push([k, base, calc, max, 0]); eff[k] = Math.max(eff[k] || 0, val); }
      continue;
    }
    if (spa === 11 || spa === 98) {              // haste (and extra haste) stored as 1xx%
      if (val <= 100) continue;
      val -= 100;
    }
    raw.push([key, spa === 124 ? val : base, calc, max, isCost ? 1 : 0]); // 124: the 'up to' value travels as the base
    if (isCost) cost[key] = Math.max(cost[key] || 0, val);
    else eff[key] = Math.max(eff[key] || 0, val);
  }
  if (!Object.keys(eff).length) return null;
  const out = { eff };
  if (raw.length) out.raw = raw;
  if (Object.keys(cost).length) out.cost = cost;
  if (Object.keys(slots).length) out.slots = slots;
  if (procId) out.procId = procId;
  if (out0.hasteLv && eff.spellhaste) out.hasteLv = out0.hasteLv;
  return out;
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
      // a pure heal (heal over time, or an instant-heal slot without a max-HP
      // slot) is healing, not a buff: flagged so the pool can leave it out
      // (a NEGATIVE instant-HP slot is a price, not a heal: Harmshield costs 20 HP)
      const parts = c[c.length - 1].split('$').map(x => x.split('|'));
      const spas = new Set(parts.map(p => p[1]));
      const heals79 = parts.some(p => p[1] === '79' && +p[2] > 0);
      // invulnerability (SPA 40: Divine Aura/Barrier, Harmshield) is an emergency button, never 'just a heal'
      if (!spas.has('40') && (spas.has('100') || (heals79 && !spas.has('69')))) rec.heal = 1;
      if (spas.has('289') && spas.has('44')) rec.heal = 1;  // delayed heal on fade (Promised Renewal)
      // cast on a MOB, not a buff: calming / aggro-radius / memory blur only
      // (Calm, Lull, Pacify, Soothe, Harmony of Nature, Kelin's Lament, Reoccurring Amnesia)
      const sig = parts.filter(p => (+p[2] || +p[5]) && !(p[1] === '10' && +p[2] === 0)).map(p => p[1]);
      if (sig.length && sig.every(x => x === '30' || x === '86' || x === '63')) rec.mobOnly = 1;
      const pe = parseEffects(c[c.length - 1]);
      if (pe) {
        rec.eff = pe.eff;
        if (pe.raw) rec.effRaw = pe.raw;   // the overlay re-scales these at the real level
        if (pe.cost) rec.cost = pe.cost;   // mixed spells: the price shown next to the gain
        if (pe.slots) rec.slots = pe.slots; // slot map for true stacking checks
        if (pe.procId) rec._procId = pe.procId;
        if (pe.hasteLv) rec.hasteLv = pe.hasteLv; // Blessing of Piety: spells ≤39, Faith: ≤61
      }
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
  // In the client files but not obtainable in Legends yet (the client ships
  // data for unreleased content). Evidence, Oct 2026: zero casts across ~3
  // months of logs while the weaker Resolution (CLR 42) shows 362 — a cleric
  // who could get Temperance at 40 would be casting it. Remove an entry the
  // day the spell goes live.
  // The three sub-51 disciplines (Focused Will 10, Resistant 30, Fearless 40)
  // don't exist in Legends either — its stances cover that ground (Ed, Oct 23
  // 2026; zero uses in all logs vs 700+ stance changes).
  const NOT_IN_LEGENDS = new Set(['Temperance', 'Blessing of Temperance',
    'Focused Will Discipline', 'Resistant Discipline', 'Fearless Discipline']);
  const keep = new Set();
  const pool = new Set();
  for (const [id, sp] of spells) {
    if (!sp.ben || !sp.cls || sp.minLv > 60 || !POOL_TGT.has(sp.tgt)) continue;
    // "Item Benefit: X" rows are item-granted effects, not memorizable spells —
    // they still fade/land (tracker keeps them) but never belong in a loadout
    if (/^Item (Benefit|Effect)\b/i.test(sp.n)) { delete sp.cls; delete sp.eff; continue; }
    if (NOT_IN_LEGENDS.has(sp.n)) continue;     // tracker still names it if it ever lands
    if (sp.heal && !sp.eff) continue;           // heals (HoTs, Echo line) are not buffs
    if (sp.mobOnly) continue;                   // calming spells are cast on mobs
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
      // rogue poisons say what they are: "This is considered a Combat Poison" (up to 3
      // active) / "a utility poison, only one of which may be active at a time"
      if (c[1] === '6' && c[2]) {
        const sp = spells.get(id);
        if (/\bcombat poison\b/i.test(c[2])) sp.poison = 'combat';
        else if (/\butility poison\b/i.test(c[2])) sp.poison = 'utility';
      }
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
