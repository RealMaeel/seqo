// SEQO overlay — custom alerts: rules, GINA tokens, speech, editor.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ---- custom alerts: your own "when this line shows up" rules ----
  const CA = window.SEQOAlerts;
  let caCompiled = [], caCompiledFor = '';
  const caFired = new Map();     // rule id -> { n, last }
  let caLog = [];                // [{ t, name, text }] newest first
  let caEditing = null;          // rule being edited (copy) or null
  let caLastText = '';           // the last line a custom alert fired on
  const caRules = () => (settings && Array.isArray(settings.customAlerts)) ? settings.customAlerts : [];
  const caNewId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function rebuildCustomAlerts() {
    const key = JSON.stringify(caRules()) + '|' + (charName || '');
    if (key === caCompiledFor) return;
    caCompiledFor = key;
    caCompiled = caRules().filter(r => r && r.on !== false).map(r => ({ r, c: CA ? CA.compileRule(r, { charName }) : null })).filter(x => x.c);
  }
  function checkCustomAlerts(l) {
    const i = l.indexOf('] ');
    if (i < 0) return;
    const msg = l.slice(i + 2);
    for (const { r, c } of caCompiled) {
      const hit = CA.matchLine(c, msg);
      if (!hit) continue;
      const now = Date.now(), f = caFired.get(r.id) || { n: 0, last: 0 };
      if (now - f.last < (r.cooldown != null ? +r.cooldown : 2) * 1000) continue;
      f.n++; f.last = now; caFired.set(r.id, f);
      const ctx = { charName };
      const text = CA.fill(r.msg || r.name || msg, hit, ctx, msg);
      if (r.sound === 'none') toast(text, true);
      else alertFX(text, CA.SOUNDS.includes(r.sound) ? r.sound : 'heads');
      if (r.speak) speak(CA.fill(r.say || r.msg || r.name, hit, ctx, msg));
      if (+r.timer > 0) startManualTimer(CA.fill(r.timerName || r.name || 'Timer', hit, ctx, msg), +r.timer, {
        warnSecs: +r.timerWarn || 0, speak: !!r.speak,
        doneText: r.timerEnd ? CA.fill(r.timerEnd, hit, ctx, msg) : ''
      });
      caLog.unshift({ t: now, name: r.name || r.pattern, text });
      caLastText = msg;
      caLog = caLog.slice(0, 30);
      renderCaLog();
    }
  }
  // text to speech: Chromium's speechSynthesis uses the Windows voices (offline)
  function speak(text) {
    if (!text || (settings && settings.ttsOn === false) || !window.speechSynthesis) return;
    const clean = String(text).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    try {
      if (speechSynthesis.pending && speechSynthesis.getVoices) speechSynthesis.cancel();  // never queue up a backlog
      const u = new SpeechSynthesisUtterance(clean);
      const vn = settings && settings.ttsVoice;
      const v = vn && speechSynthesis.getVoices().find(x => x.name === vn);
      if (v) u.voice = v;
      u.rate = (settings && settings.ttsRate) || 1.1;
      u.volume = Math.min(1, ((settings && settings.alertVolume !== undefined ? settings.alertVolume : 60) / 100) * 1.4);
      speechSynthesis.speak(u);
    } catch { /* no voices */ }
  }
  function fillVoices() {
    const sel = $('tts-voice');
    if (!sel || !window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices();
    const cur = (settings && settings.ttsVoice) || '';
    sel.innerHTML = '';
    const d = document.createElement('option'); d.value = ''; d.textContent = vs.length ? 'Default voice' : 'Default voice (none listed yet)';
    sel.appendChild(d);
    for (const v of vs) { const o = document.createElement('option'); o.value = v.name; o.textContent = v.name + (v.lang ? ' · ' + v.lang : ''); sel.appendChild(o); }
    sel.value = cur;
  }
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = fillVoices;
  function saveRules(rules) { save({ customAlerts: rules }); }
  function renderCaLog() {
    const el = $('ca-log');
    if (!el) return;
    el.textContent = '';
    if (!caLog.length) { el.textContent = 'nothing yet'; return; }
    for (const e of caLog) { const d = document.createElement('div'); d.textContent = new Date(e.t).toLocaleTimeString() + '  ' + e.name + ' → ' + e.text; el.appendChild(d); }
  }
  const caSel = new Set();
  function renderCustomAlertList() {
    const box = $('ca-list');
    if (!box) return;
    if (document.activeElement && box.contains(document.activeElement)) return;
    box.innerHTML = '';
    const rules = caRules();
    if ($('ca-test') && $('ca-test').value.trim()) caTest();   // keep the test result in step with the rules
    if (!rules.length) { box.innerHTML = '<div class="hint">No custom alerts yet — try ⭐ Starter set, or + New alert.</div>'; return; }
    let group = null;
    for (const r of rules) {
      if ((r.group || '') !== group) {
        group = r.group || '';
        if (group) { const g = document.createElement('div'); g.style.cssText = 'color:#ffd766;font-size:10px;margin-top:4px'; g.textContent = group; box.appendChild(g); }
      }
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:5px;align-items:center;padding:1px 0';
      const on = document.createElement('input'); on.type = 'checkbox'; on.checked = r.on !== false; on.title = 'On / off';
      on.addEventListener('change', () => saveRules(caRules().map(x => x.id === r.id ? { ...x, on: on.checked } : x)));
      const sel = document.createElement('input'); sel.type = 'checkbox'; sel.checked = caSel.has(r.id); sel.title = 'Tick to share';
      sel.style.opacity = '.55';
      sel.addEventListener('change', () => { sel.checked ? caSel.add(r.id) : caSel.delete(r.id); });
      const nm = document.createElement('span');
      nm.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' + (r.on === false ? ';opacity:.5' : '');
      const bad = CA && !CA.compileRule(r, { charName });
      nm.textContent = (bad ? '⚠ ' : '') + (r.name || r.pattern) + (r.speak ? ' 🗣' : '') + (+r.timer > 0 ? ' ⏱' + r.timer + 's' + (+r.timerWarn > 0 ? ' ⏳' + r.timerWarn + 's' : '') : '') + (r.on === false ? ' (off)' : '');
      nm.title = (bad ? 'This pattern is not a valid regex — fix it in ✎. ' : '') + 'Matches: ' + r.pattern + (r.regex ? ' (regex)' : '') + '\nShows: ' + (r.msg || '');
      const f = caFired.get(r.id);
      const cnt = document.createElement('span'); cnt.style.cssText = 'color:#778;font-size:9.5px;flex:none'; cnt.textContent = f ? f.n + '×' : '';
      const ed = document.createElement('span'); ed.textContent = '✎'; ed.style.cssText = 'cursor:pointer;flex:none;padding:0 3px'; ed.title = 'Edit';
      ed.addEventListener('click', () => openCaEditor(r));
      row.append(on, sel, nm, cnt, ed);
      box.appendChild(row);
    }
  }
  function openCaEditor(rule) {
    caEditing = rule ? { ...rule } : { id: caNewId(), name: '', pattern: '', regex: false, msg: '', sound: 'heads', speak: false, say: '', timer: 0, timerWarn: 0, timerName: '', timerEnd: '', cooldown: 2, group: '', on: true };
    const ed = $('ca-edit');
    ed.style.display = 'block';
    ed.innerHTML = '';
    const field = (label, key, ph, type) => {
      const w = document.createElement('div'); w.style.cssText = 'display:flex;gap:4px;align-items:center;margin:2px 0';
      const lb = document.createElement('span'); lb.style.cssText = 'width:62px;flex:none;color:#aab;font-size:10px'; lb.textContent = label;
      const inp = document.createElement('input'); inp.type = type || 'text'; inp.placeholder = ph || '';
      inp.style.cssText = 'flex:1;min-width:0;background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10.5px';
      inp.value = caEditing[key] != null ? caEditing[key] : '';
      inp.addEventListener('input', () => { caEditing[key] = type === 'number' ? +inp.value : inp.value; caPreview(); });
      w.append(lb, inp); ed.appendChild(w); return w;
    };
    const check = (wrap, label, key) => {
      const l = document.createElement('label'); l.style.cssText = 'display:flex;gap:3px;align-items:center;margin:0;font-size:10px;flex:none';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!caEditing[key];
      c.addEventListener('change', () => { caEditing[key] = c.checked; caPreview(); });
      l.append(c, document.createTextNode(label)); wrap.appendChild(l);
    };
    field('Name', 'name', 'e.g. Tell received');
    check(field('Line has', 'pattern', "e.g. {S} tells you, '{S1}'"), 'regex', 'regex');
    field('Message', 'msg', 'e.g. 💬 {S}: {S1}');
    const sw = document.createElement('div'); sw.style.cssText = 'display:flex;gap:4px;align-items:center;margin:2px 0';
    const sl = document.createElement('span'); sl.style.cssText = 'width:62px;flex:none;color:#aab;font-size:10px'; sl.textContent = 'Sound';
    const ss = document.createElement('select'); ss.style.cssText = 'flex:1;background:#26262f;color:#eee;border:1px solid #444;border-radius:4px;font-size:10.5px';
    const SN = { rare: 'triple ping', repop: 'double ping', heads: 'rising "look!"', charm: 'descending uh-oh', afk: 'siren', invis: 'rising sweep', buff: 'soft boop', cc: 'double + thud', death: 'falling notes', none: 'no sound (toast only)' };
    for (const k of CA.SOUNDS) { const o = document.createElement('option'); o.value = k; o.textContent = SN[k] || k; ss.appendChild(o); }
    ss.value = caEditing.sound || 'heads';
    ss.addEventListener('change', () => { caEditing.sound = ss.value; playPattern(ss.value); });
    sw.append(sl, ss); ed.appendChild(sw);
    check(field('Say', 'say', 'spoken text (blank = the message)'), '🗣 speak', 'speak');
    // timer: countdown chip; ⏳ heads-up before it ends right beside it (GINA's "timer ending")
    field('Timer (s)', 'timer', 'countdown seconds, 0 = none', 'number');
    const tw = field('⏳ Warn (s)', 'timerWarn', 'heads-up seconds before it ends, e.g. 60', 'number');
    tw.title = 'A heads-up this many seconds before the timer runs out — 60 on a respawn timer = "… in ~1 min"';
    tw.firstChild.style.color = '#ffd766';
    field('Timer name', 'timerName', 'chip label, e.g. {1} respawn (blank = alert name)');
    field('When it ends', 'timerEnd', 'optional, e.g. ⚔ {1} is up!');
    field('Cooldown', 'cooldown', 'seconds between alerts', 'number');
    field('Group', 'group', 'optional, e.g. Raid');
    const pv = document.createElement('div'); pv.id = 'ca-preview'; pv.className = 'hint'; pv.style.margin = '3px 0'; ed.appendChild(pv);
    const bar = document.createElement('div'); bar.className = 'row'; bar.style.gap = '4px';
    const mk = (t, fn, gold) => { const b = document.createElement('button'); b.textContent = t; if (gold) b.style.flex = '1'; b.addEventListener('click', fn); bar.appendChild(b); return b; };
    mk('💾 Save', () => {
      if (!String(caEditing.pattern || '').trim()) { toast('A rule needs some text to match'); return; }
      if (!CA.compileRule(caEditing, { charName })) { toast('That regex has an error — check brackets / backslashes'); return; }
      const rules = caRules().slice();
      const i = rules.findIndex(x => x.id === caEditing.id);
      if (!caEditing.name) caEditing.name = String(caEditing.pattern).slice(0, 40);
      if (i >= 0) rules[i] = caEditing; else rules.push(caEditing);
      caEditing = null; ed.style.display = 'none'; saveRules(rules);
    }, true);
    mk('Cancel', () => { caEditing = null; ed.style.display = 'none'; });
    if (rule) {
      const del = mk('🗑', () => {
        if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Delete?'; return; }
        saveRules(caRules().filter(x => x.id !== rule.id)); caEditing = null; ed.style.display = 'none';
      });
    }
    ed.appendChild(bar);
    caPreview();
  }
  function caPreview() {
    const pv = $('ca-preview');
    if (!pv || !caEditing) return;
    const c = CA.compileRule(caEditing, { charName });
    const sample = $('ca-test').value.trim();
    if (!String(caEditing.pattern || '').trim()) { pv.textContent = 'Type the part of the log line to watch for.'; return; }
    if (!c) { pv.textContent = '⚠ Not a valid regex yet.'; pv.style.color = '#ff9d9d'; return; }
    pv.style.color = '';
    if (!sample) { pv.textContent = 'Paste a log line into "Test a line" below to try it.'; return; }
    const msg = sample.replace(/^\[[^\]]*\]\s*/, '');
    const hit = CA.matchLine(c, msg);
    pv.textContent = hit ? '✔ Matches → ' + CA.fill(caEditing.msg || caEditing.name || msg, hit, { charName }, msg) : '✘ Does not match the test line.';
  }
  function caTest() {
    const sample = $('ca-test').value.trim(), out = $('ca-test-out');
    caPreview();
    if (!sample) { out.textContent = ''; return; }
    const msg = sample.replace(/^\[[^\]]*\]\s*/, '');
    const hits = [];
    // the saved alerts, plus the one open in the editor (even before it's saved)
    const editing = caEditing && String(caEditing.pattern || '').trim() ? caEditing : null;
    const rules = caRules().map(r => (editing && r.id === editing.id ? { ...editing } : r));
    if (editing && !rules.some(r => r.id === editing.id))
      rules.push({ ...editing, name: (editing.name || editing.pattern) + ' (not saved yet)' });
    let bad = 0;
    for (const r of rules) {
      const c = CA.compileRule(r, { charName });
      if (!c) { bad++; continue; }
      const h = CA.matchLine(c, msg);
      if (h) hits.push((r.on === false ? '(off) ' : '') + (r.name || r.pattern) + ' → ' + CA.fill(r.msg || r.name, h, { charName }, msg));
    }
    if (hits.length) { out.textContent = hits.join('  ·  ') + '  —  ▶ Fire plays them'; return; }
    out.textContent = !rules.length
      ? 'You have no custom alerts yet — add one, the ⭐ starter set, or import GINA triggers first.'
      : 'No rule matches this line (' + rules.length + ' checked' + (bad ? ', ' + bad + ' with a pattern SEQO can\'t read' : '') +
        '). Paste the line exactly as it appears in your log — the [timestamp] is optional — and check the trigger text in the rule.';
  }
  function addRules(list, label) {
    if (!list || !list.length) { toast('Nothing to import'); return; }
    const have = new Set(caRules().map(r => (r.pattern || '') + '|' + (r.msg || '')));
    const fresh = list.filter(r => !have.has((r.pattern || '') + '|' + (r.msg || ''))).map(r => ({ cooldown: 2, sound: 'heads', ...r, id: caNewId(), on: r.on !== false }));
    saveRules(caRules().concat(fresh));
    toast('🗣 Added ' + fresh.length + ' alert' + (fresh.length === 1 ? '' : 's') + (label ? ' from ' + label : '') + (list.length > fresh.length ? ' (' + (list.length - fresh.length) + ' already there)' : ''));
  }
  (() => {
    if (!$('ca-new')) return;
    $('ca-new').addEventListener('click', () => openCaEditor(null));
    $('ca-starter').addEventListener('click', () => addRules(CA.STARTER.map(r => ({ ...r })), 'the starter set'));
    $('ca-import-open').addEventListener('click', () => { $('ca-import').style.display = 'block'; $('ca-import-text').focus(); });
    $('ca-import-cancel').addEventListener('click', () => { $('ca-import').style.display = 'none'; });
    $('ca-import-go').addEventListener('click', () => {
      const t = $('ca-import-text').value;
      const list = CA.decodeShare(t) || (/<Trigger>/i.test(t) ? CA.ginaToRules(t) : null);
      if (!list) { toast('That is not a SEQO share code or GINA trigger XML'); return; }
      addRules(list, /<Trigger>/i.test(t) ? 'GINA' : 'the share code');
      $('ca-import-text').value = ''; $('ca-import').style.display = 'none';
    });
    $('ca-gina').addEventListener('click', async () => {
      const r = await window.overlay.importGinaFile();
      if (!r || r.canceled) return;
      if (r.error) { toast('GINA import: ' + r.error); return; }
      addRules(r.rules, r.file);
    });
    $('ca-share').addEventListener('click', () => {
      const pick = caRules().filter(r => !caSel.size || caSel.has(r.id));
      if (!pick.length) { toast('No alerts to share yet'); return; }
      window.overlay.copyText(CA.encodeShare(pick));
      toast('📤 Share code for ' + pick.length + ' alert' + (pick.length === 1 ? '' : 's') + ' copied — friends paste it with 📥 Paste');
    });
    $('ca-test').addEventListener('input', caTest);
    // ▶ Fire: run the test line through the alerts exactly like a real log line
    // (message, sound, spoken text, timer), ignoring cooldowns, so you can hear it
    $('ca-test-fire').addEventListener('click', () => {
      const sample = $('ca-test').value.trim(), out = $('ca-test-out');
      if (!sample) { out.textContent = 'Type or paste a line first.'; return; }
      const msg = sample.replace(/^\[[^\]]*\]\s*/, '');
      const editing = caEditing && String(caEditing.pattern || '').trim() ? caEditing : null;
      const rules = caRules().map(r => (editing && r.id === editing.id ? { ...editing } : r));
      if (editing && !rules.some(r => r.id === editing.id)) rules.push({ ...editing });
      let fired = 0;
      for (const r of rules) {
        const c = CA.compileRule(r, { charName }), hit = c && CA.matchLine(c, msg);
        if (!hit) continue;
        fired++;
        const ctx = { charName };
        const text = CA.fill(r.msg || r.name || msg, hit, ctx, msg);
        if (r.sound === 'none') toast(text, true);
        else alertFX(text, CA.SOUNDS.includes(r.sound) ? r.sound : 'heads');
        if (r.speak) {
          const was = settings && settings.ttsOn;
          if (settings) settings.ttsOn = true;            // hear it even if speech is switched off
          speak(CA.fill(r.say || r.msg || r.name, hit, ctx, msg));
          if (settings) settings.ttsOn = was;
        }
        if (fired >= 3) break;
      }
      if (!fired) caTest();
      else out.textContent = '▶ Fired ' + fired + ' alert' + (fired === 1 ? '' : 's') +
        (rules.some(r => r.speak) ? '' : ' — none of your alerts has 🗣 speak on, so nothing is said aloud');
    });
    $('tts-on').addEventListener('change', (e) => save({ ttsOn: e.target.checked }));
    $('tts-voice').addEventListener('change', (e) => save({ ttsVoice: e.target.value }));
    $('tts-rate').addEventListener('input', (e) => save({ ttsRate: +e.target.value }));
    $('tts-test').addEventListener('click', () => { const was = settings.ttsOn; settings.ttsOn = true; speak('Tell from Brannoc'); settings.ttsOn = was; });
    $('ca-details').addEventListener('toggle', () => { if ($('ca-details').open) { fillVoices(); renderCaLog(); } });
  })();

