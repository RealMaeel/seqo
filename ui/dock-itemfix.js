// SEQO dock — the item card's real-game data (v2.7): your ✎ fixes from the game's item
// window (they win over eqlwiki), and the exaltations slotted into your own copies
// (from the inventory export). Loaded after ui/dock.js; shares its scope (classic scripts).
// The data rules live in itemfix.js (pure, tested); this file only draws and saves.

const IF = window.EQLItemFix;
let itemWiki = '';          // the wiki's stats block, cleaned (empty when eqlwiki has no page)
let itemFix = null;         // your fix for this item, or null
let itemFixes = {};         // every fix (key = item name, lower, no +N)
// same key as the overlay's normItemName: lower case, no +N, backticks as apostrophes
const fixKey = (n) => String(n || '').toLowerCase().replace(/\s*\+\d+$/, '').replace(/`/g, "'").trim();
async function loadFixes() {
  try { itemFixes = (await window.overlay.getItemFixes()) || {}; } catch { itemFixes = {}; }
  itemFix = itemFixes[fixKey(itemName)] || null;
}
// the stats block with your fix applied: +0 for math and copies, at tier T for the card
const fixedBase = () => IF.apply(itemWiki, itemFix, 0).block;
const statsAt = (T) => scaledStats(IF.apply(itemWiki, itemFix, T).block, T);

// "✎ your fix from the game (Oct 26): WIS 8 → 5 · SV VOID +5 at +5 · Focus Effect: …"
function renderFixNote() {
  const box = $('ifixnote');
  box.innerHTML = '';
  if (!itemFix) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  const r = IF.apply(itemWiki, itemFix, 0);
  const bits = r.diffs.map((d) => d.stat + ' ' + d.wiki + ' → ' + d.you);
  for (const [k, o] of Object.entries(itemFix.seen || {})) bits.push(k + ' +' + o.value + ' at +' + o.tier);
  for (const [k, v] of Object.entries(itemFix.stats || {})) if (!r.diffs.some((d) => d.stat.toUpperCase() === k) && v) bits.push(k + ' ' + v + ' (not on the wiki)');
  for (const e of r.effects) bits.push((e.type === 'Effect' ? 'Effect' : e.type + ' Effect') + ': ' + e.name);
  const t = document.createElement('span');
  t.textContent = '✎ Your fix from the game (' + new Date(itemFix.at || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')' +
    (itemWiki ? ' — the wiki differs: ' : ': ') + (bits.join(' · ') || 'no changes');
  t.title = 'Recorded from your in-game item window. It wins over eqlwiki here, in Cleanup and in copies; a wiki refresh never overwrites it.';
  const ed = document.createElement('span'); ed.className = 'lnk'; ed.textContent = 'edit';
  ed.addEventListener('click', () => openFixEditor());
  const rm = document.createElement('span'); rm.className = 'lnk'; rm.textContent = 'remove';
  rm.title = 'Go back to the wiki’s numbers';
  rm.addEventListener('click', async () => { await saveFix(null); });
  box.append(t, ' ', ed, ' · ', rm);
}

async function saveFix(fix) {
  const key = fixKey(itemName);
  await window.overlay.setItemFix(key, fix);
  if (fix) itemFixes[key] = fix; else delete itemFixes[key];
  itemFix = fix;
  window.overlay.cleanupCmd({ kind: 'fixes' });     // Cleanup re-reads the fixes
  redrawItemStats();
}
// after a fix change: stats, weapon line, effects, note, exaltations
function redrawItemStats() {
  itemStats = fixedBase();
  const T = +$('itier').value || 0;
  if (itemStats) {
    $('istats').style.display = 'block';
    $('itier-row').style.display = 'flex';
    $('icopy').style.display = 'inline-flex';
  }
  $('istats').textContent = statsAt(T);
  renderWeapon(T);
  renderFixNote();
  renderEffects(itemStats);
  renderExalts();
}

// ✎ editor: type what the game's item window shows, at the tier it shows
const ADDABLE = ['SV VOID', 'SV CORRUPTION', 'HP REGEN', 'MANA REGEN', 'ENDURANCE REGEN', 'ATK', 'HASTE', 'AC', 'HP', 'MANA', 'ENDURANCE',
  'STR', 'STA', 'AGI', 'DEX', 'WIS', 'INT', 'CHA', 'SV MAGIC', 'SV FIRE', 'SV COLD', 'SV POISON', 'SV DISEASE', 'DMG', 'ATK DELAY'];
function openFixEditor() {
  const box = $('ifixed');
  box.innerHTML = '';
  box.style.display = 'block';
  const T0 = +$('itier').value || 0;
  const head = document.createElement('div'); head.className = 'fixhead';
  head.innerHTML = '<b>✎ Fix from the game</b> — type what your in-game item window shows. Values are at ';
  const tierSel = document.createElement('select');
  for (let i = 0; i <= 10; i++) { const o = document.createElement('option'); o.value = i; o.textContent = '+' + i; tierSel.appendChild(o); }
  tierSel.value = String(T0);
  head.appendChild(tierSel);
  head.appendChild(document.createTextNode(' (the "+N" on the item’s name).'));
  box.appendChild(head);
  const grid = document.createElement('div'); grid.className = 'fixgrid';
  box.appendChild(grid);
  const rows = [];
  const addRow = (stat, value) => {
    const l = document.createElement('label'); l.textContent = stat;
    const inp = document.createElement('input'); inp.type = 'number'; inp.value = value == null ? '' : value; inp.style.width = '58px';
    grid.append(l, inp);
    rows.push({ stat, inp });
  };
  const fill = (T) => {
    grid.innerHTML = ''; rows.length = 0;
    for (const s of IF.parseStats(statsAt(T))) addRow(s.label.toUpperCase(), s.value);
    for (const [k, o] of Object.entries((itemFix && itemFix.seen) || {})) if (!rows.some((r) => r.stat === k)) addRow(k, +o.tier === T ? o.value : '');
  };
  fill(T0);
  tierSel.addEventListener('change', () => fill(+tierSel.value));
  // + a stat the wiki doesn't list
  const addLine = document.createElement('div'); addLine.className = 'fixline';
  const addSel = document.createElement('select');
  for (const s of ADDABLE) { const o = document.createElement('option'); o.value = s; o.textContent = s; addSel.appendChild(o); }
  const addBtn = document.createElement('button'); addBtn.textContent = '+ add a stat';
  addBtn.title = 'For a stat the wiki doesn’t list at all (SV Void, a regen…)';
  addBtn.addEventListener('click', () => { if (!rows.some((r) => r.stat === addSel.value)) addRow(addSel.value, ''); });
  addLine.append(addSel, addBtn);
  box.appendChild(addLine);
  // effects: Focus / Click / Worn / Proc / Effect
  const fxBox = document.createElement('div'); fxBox.className = 'fixfx';
  const fxRows = [];
  const addFx = (type, name) => {
    const line = document.createElement('div'); line.className = 'fixline';
    const ts = document.createElement('select');
    for (const t of IF.EFFECT_TYPES) { const o = document.createElement('option'); o.value = t; o.textContent = t === 'Effect' ? 'Effect' : t + ' Effect'; ts.appendChild(o); }
    ts.value = type || 'Focus';
    const ni = document.createElement('input'); ni.type = 'text'; ni.placeholder = 'e.g. Improved Damage III'; ni.value = name || ''; ni.style.flex = '1';
    line.append(ts, ni); fxBox.appendChild(line);
    fxRows.push({ ts, ni });
  };
  for (const e of (itemFix && itemFix.effects) || []) addFx(e.type, e.name);
  if (!fxRows.length) addFx('Focus', '');
  box.appendChild(fxBox);
  const bar = document.createElement('div'); bar.className = 'fixline';
  const moreFx = document.createElement('button'); moreFx.textContent = '+ effect'; moreFx.addEventListener('click', () => addFx('Click', ''));
  const save = document.createElement('button'); save.className = 'gold'; save.textContent = '💾 Save';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
  const msg = document.createElement('span'); msg.className = 'fixmsg';
  bar.append(moreFx, save, cancel, msg);
  box.appendChild(bar);
  cancel.addEventListener('click', () => { box.style.display = 'none'; box.innerHTML = ''; });
  save.addEventListener('click', async () => {
    const T = +tierSel.value || 0;
    const r = IF.fromGame(rows.map((x) => ({ stat: x.stat, value: x.inp.value })), fxRows.map((x) => ({ type: x.ts.value, name: x.ni.value })), T);
    const fix = IF.trim(r.fix, itemWiki);
    box.style.display = 'none'; box.innerHTML = '';
    await saveFix(fix);
    if (!fix) toastDock('Matches the wiki — nothing to fix');
  });
}
function toastDock(t) { const s = $('istatus2'); if (!s) return; s.textContent = t; setTimeout(() => { s.textContent = ''; }, 3000); }

// effects listed on the card, each explained (wiki description), fix effects included
function renderEffects(block) {
  const fxBox = $('ifx');
  fxBox.innerHTML = '';
  const names = [...new Set([...String(block || '').matchAll(/Effect:\s*([^\n(]+)/gi)].map((m) => m[1].trim()).filter(Boolean))];
  const mine = new Set(((itemFix && itemFix.effects) || []).map((e) => e.name.toLowerCase()));
  for (const fx of names) {
    const d = document.createElement('div');
    d.className = 'fx';
    d.innerHTML = '✨ <b title="See every item that carries this effect (opens the overlay’s Exaltations view)"></b> <span style="color:#9ab">— looking up…</span>';
    d.querySelector('b').textContent = fx;
    d.querySelector('b').addEventListener('click', () => window.overlay.cleanupCmd({ kind: 'exaltview', name: fx }));
    fxBox.appendChild(d);
    window.overlay.getEffectItems(fx).then((ef) => {
      const sp = d.querySelector('span');
      const by = mine.has(fx.toLowerCase()) ? ' (from your fix)' : '';
      if (ef && !ef.error && ef.desc) sp.textContent = '— ' + ef.desc + by;
      else if (ef && !ef.error) sp.textContent = '— (no description on the wiki; click the name to see every item with it)' + by;
      else sp.textContent = '— could not fetch the effect page' + by;
    });
  }
}

// an effect of one slot type, read off an item's stats block
function effectOfType(block, type) {
  for (const line of String(block || '').split('\n')) {
    const m = /^\s*(Focus Effect|Effect):\s*([^(\n]+?)\s*(?:\(([^)]*)\))?\s*$/i.exec(line);
    if (!m) continue;
    const t = /focus/i.test(m[1]) ? 'Focus' : /combat|proc/i.test(m[3] || '') ? 'Proc' : /worn/i.test(m[3] || '') ? 'Worn' : 'Click';
    if (t === type) return m[2].trim();
  }
  return '';
}
// the effect an exaltation carries: your fix on its source item, else the source's wiki page
async function exaltEffect(exaltName, type) {
  const src = IF.exaltSource(exaltName);
  const f = itemFixes[fixKey(src)];
  const mine = f && (f.effects || []).find((e) => e.type === type);
  if (mine) return { name: mine.name, by: 'you' };
  try {
    const c = await window.overlay.getItemData(src);
    const block = c && !c.error && c.statsblock ? EQLItemText.cleanStatsBlock(c.statsblock) : '';
    const n = effectOfType(block, type);
    if (n) return { name: n, by: 'eqlwiki' };
  } catch { /* not cached: unknown */ }
  return null;
}

// your copies of this item and what's slotted in them (inventory export, Slot7–10)
const SLOT_TYPES = [['focus', 'Focus'], ['click', 'Click'], ['worn', 'Worn'], ['proc', 'Proc']];
async function renderExalts() {
  const box = $('iexalt');
  box.innerHTML = '';
  let gd = null;
  try { gd = await window.overlay.getGameData(); } catch { gd = null; }
  const ex = (gd && gd.inventory && gd.inventory.exalts) || {};
  const copies = Object.values(ex).flat().filter((c) => fixKey(c.name) === fixKey(itemName));
  if (!copies.length) return;
  const h = document.createElement('div'); h.className = 'sect-h'; h.textContent = '💠 Exaltations on your copies';
  h.title = 'From your inventory export (/outputfile inventory): the Focus / Click / Worn / Proc exaltation slots';
  box.appendChild(h);
  for (const c of copies.slice(0, 4)) {
    const tier = (/\+(\d+)$/.exec(c.name) || [])[1];
    const where = /^(General|Held)/i.test(c.loc) ? 'in your bags' : /^Bank/i.test(c.loc) ? 'in the bank' : /^Personal-?Depot|^Equipment/i.test(c.loc) ? 'in storage' : 'worn (' + c.loc + ')';
    const t = document.createElement('div'); t.className = 'sect-b'; t.style.margin = '2px 0 0';
    t.textContent = (tier ? '+' + tier + ' ' : '') + where;
    box.appendChild(t);
    for (const [k, label] of SLOT_TYPES) {
      const line = document.createElement('div'); line.className = 'exline';
      const lb = document.createElement('span'); lb.className = 'exl'; lb.textContent = label + ' Exaltation:';
      const nm = document.createElement('span');
      line.append(lb, nm);
      box.appendChild(line);
      if (!c[k]) { nm.textContent = 'empty'; nm.style.color = '#777'; continue; }
      nm.textContent = c[k];
      const fxs = document.createElement('span'); fxs.className = 'exfx'; fxs.textContent = ' — …';
      line.appendChild(fxs);
      const e = await exaltEffect(c[k], label);
      if (e) {
        fxs.textContent = ' → ' + label + ' Effect: ' + e.name + (e.by === 'you' ? ' (you)' : '');
      } else {
        fxs.textContent = ' — effect not on eqlwiki ';
        const pen = document.createElement('span'); pen.className = 'lnk'; pen.textContent = '✎ type it';
        pen.title = 'Type the effect your in-game item window shows (e.g. "' + label + ' Effect: Improved Damage III"). SEQO remembers it for ' + IF.exaltSource(c[k]) + ' and its exaltation.';
        pen.addEventListener('click', () => {
          const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'e.g. Improved Damage III'; inp.style.cssText = 'width:150px;font-size:11px';
          const ok = document.createElement('button'); ok.textContent = 'save'; ok.style.cssText = 'font-size:10.5px;padding:0 6px';
          pen.replaceWith(inp, ok); inp.focus();
          const go = async () => {
            const v = inp.value.trim(); if (!v) return;
            const sk = fixKey(IF.exaltSource(c[k]));
            const f = { ...(itemFixes[sk] || { stats: {}, seen: {}, by: 'you' }) };
            f.effects = (f.effects || []).filter((x) => x.type !== label).concat({ type: label, name: v.slice(0, 80) });
            f.at = Date.now();
            await window.overlay.setItemFix(sk, f);
            itemFixes[sk] = f;
            if (sk === fixKey(itemName)) itemFix = f;
            window.overlay.cleanupCmd({ kind: 'fixes' });
            redrawItemStats();
          };
          ok.addEventListener('click', go);
          inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
        });
        fxs.appendChild(pen);
      }
    }
  }
}

$('ifix').addEventListener('click', () => { if ($('ifixed').style.display === 'block') { $('ifixed').style.display = 'none'; } else openFixEditor(); });
