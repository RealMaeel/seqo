// SEQO session history: every play session and loot run, saved so they can be
// browsed, compared and exported after SEQO closes. Kept in the LOCAL profile
// (not the shared sync folder): two PCs appending to one synced file would
// overwrite each other's sessions.
//
// create({ dir }) -> { list, upsert, remove, setNote, flush }
// Entries are plain JSON: { id, type: 'session'|'run', start, end, char, ... }.
// Pure helpers toCSV(entries) / toMarkdown(entries) are exported for tests.
'use strict';
const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 1000;

function create({ dir }) {
  const file = () => path.join(dir(), 'history.json');
  let entries = null;           // newest first
  let saveTimer = null;

  function load() {
    if (entries) return entries;
    try {
      const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
      entries = Array.isArray(j.entries) ? j.entries : [];
    } catch { entries = []; }
    return entries;
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!entries) return;
    try {
      const tmp = file() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, entries }));
      fs.renameSync(tmp, file());     // never leave a half-written history behind
    } catch (e) { console.error('history save failed:', e.message); }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1500); }

  function list() { return load().slice(); }
  function upsert(entry) {
    if (!entry || !entry.id) return false;
    const all = load();
    const i = all.findIndex(e => e.id === entry.id);
    if (i >= 0) all[i] = { ...all[i], ...entry, note: entry.note !== undefined ? entry.note : all[i].note };
    else all.unshift(entry);
    all.sort((a, b) => (b.start || 0) - (a.start || 0));
    if (all.length > MAX_ENTRIES) all.length = MAX_ENTRIES;
    saveSoon();
    return true;
  }
  function remove(id) {
    const all = load();
    const i = all.findIndex(e => e.id === id);
    if (i < 0) return false;
    all.splice(i, 1); saveSoon();
    return true;
  }
  function setNote(id, note) {
    const e = load().find(x => x.id === id);
    if (!e) return false;
    e.note = String(note || '').slice(0, 500); saveSoon();
    return true;
  }
  return { list, upsert, remove, setNote, flush };
}

// ---- export ----
const iso = (t) => t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) : '';
const mins = (e) => e.start && e.end ? Math.round((e.end - e.start) / 60000) : 0;
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const COLS = [
  ['type', e => e.type], ['start', e => iso(e.start)], ['end', e => iso(e.end)], ['minutes', mins],
  ['character', e => e.char || ''], ['zones', e => (e.zones || []).join('; ')],
  ['fights', e => e.fights || 0], ['combat_seconds', e => Math.round(e.durS || 0)],
  ['your_damage', e => e.dmg || 0], ['your_dps', e => e.dps ? Math.round(e.dps) : 0],
  ['max_hit', e => e.maxHit || 0], ['pet_damage', e => e.petDmg || 0],
  ['xp_percent', e => e.xpPct ? +e.xpPct.toFixed(2) : 0], ['levels', e => e.levels || 0], ['aa', e => e.aa || 0],
  ['kills', e => e.kills || 0], ['deaths', e => (e.deaths || []).length], ['coin_copper', e => e.coin || 0],
  ['items', e => e.items || 0], ['motes', e => e.motes || 0], ['rares', e => (e.rares || []).join('; ')],
  ['top_stance', e => (e.stances && e.stances[0] && e.stances[0].n) || ''], ['note', e => e.note || '']
];
function toCSV(list) {
  const lines = [COLS.map(c => c[0]).join(',')];
  for (const e of list) lines.push(COLS.map(c => csvCell(c[1](e))).join(','));
  return lines.join('\r\n') + '\r\n';
}
function coinText(cp) {
  cp = Math.round(cp || 0);
  const p = Math.floor(cp / 1000), g = Math.floor(cp / 100) % 10, s = Math.floor(cp / 10) % 10, c = cp % 10;
  return [p && p + 'pp', g && g + 'gp', s && s + 'sp', c && c + 'cp'].filter(Boolean).join(' ') || '0';
}
function toMarkdown(list) {
  const out = ['# SEQO history', ''];
  for (const e of list) {
    out.push('## ' + (e.type === 'run' ? 'Run' : 'Session') + ' — ' + iso(e.start) + (e.char ? ' — ' + e.char : ''));
    const facts = [];
    facts.push(mins(e) + ' min' + ((e.zones || []).length ? ' in ' + e.zones.join(', ') : ''));
    if (e.dmg) facts.push(e.dmg.toLocaleString('en-US') + ' damage' + (e.dps ? ' (' + Math.round(e.dps).toLocaleString('en-US') + ' DPS over ' + Math.round(e.durS || 0) + 's in combat)' : ''));
    if (e.maxHit) facts.push('max hit ' + e.maxHit.toLocaleString('en-US'));
    if (e.xpPct || e.levels || e.aa) facts.push('XP +' + (e.xpPct || 0).toFixed(1) + '%' + (e.levels ? ', ' + e.levels + ' level(s)' : '') + (e.aa ? ', ' + e.aa + ' AA' : ''));
    if (e.kills) facts.push(e.kills + ' kills');
    if (e.coin) facts.push(coinText(e.coin));
    if (e.items) facts.push(e.items + ' items' + (e.motes ? ' (' + e.motes + ' motes)' : ''));
    if ((e.deaths || []).length) facts.push(e.deaths.length + ' death(s)');
    out.push(facts.map(f => '- ' + f).join('\n'));
    if ((e.sources || []).length) {
      out.push('', '| Source | Damage | Share |', '|---|---:|---:|');
      const tot = e.sources.reduce((a, s) => a + s.total, 0) || 1;
      for (const s of e.sources.slice(0, 10)) out.push('| ' + s.source + ' | ' + s.total.toLocaleString('en-US') + ' | ' + Math.round(s.total * 100 / tot) + '% |');
    }
    if ((e.healed || []).length) out.push('', 'Healing: ' + e.healed.map(h => h.n + ' ' + h.total.toLocaleString('en-US')).join(' · '));
    if ((e.skills || []).length) out.push('', 'Skill-ups: ' + e.skills.map(k => k.k + ' ' + k.from + '→' + k.to).join(' · '));
    if ((e.factions || []).length) out.push('', 'Faction: ' + e.factions.map(f => f.k + ' ' + (f.net > 0 ? '+' : '') + f.net).join(' · '));
    if ((e.stances || []).length) out.push('', 'Stances: ' + e.stances.map(s => s.n + ' ' + Math.round(s.dps) + ' DPS').join(' · '));
    if ((e.rares || []).length) out.push('', 'Rares: ' + e.rares.join(', '));
    for (const d of e.deaths || []) out.push('', '> ☠ ' + d);
    if (e.note) out.push('', '_' + e.note + '_');
    out.push('');
  }
  return out.join('\n');
}

module.exports = { create, toCSV, toMarkdown, MAX_ENTRIES };
