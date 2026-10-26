// SEQO overlay — AFK watch.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= AFK watch =================
  // Once attacked, the siren repeats until AFK is toggled off or the
  // CHARACTER acts (a deliberate melee/spell attack — pets, damage shields,
  // and DoT ticks do not count as "back at the keyboard").
  let afkMode = false;
  let afkAlarm = false;

  function stopAfkAlarm(msg) {
    if (!afkAlarm) return;
    afkAlarm = false;
    if (msg) toast(msg);
  }

  $('afk-btn').addEventListener('click', () => {
    afkMode = !afkMode;
    $('afk-btn').classList.toggle('on', afkMode);
    $('afk-btn2').classList.toggle('on', afkMode);   // the locked-mode twin
    if (!afkMode) stopAfkAlarm();
    toast(afkMode ? '😴 AFK watch ON — will alert if you\'re attacked' : '👋 AFK watch off, welcome back');
  });
  $('afk-btn2').addEventListener('click', () => $('afk-btn').click());

  setInterval(() => { // repeating siren while the alarm is active
    if (afkAlarm && afkMode) {
      if (!settings || settings.alertSound !== false) playPattern('afk');
      if (!settings || settings.alertFlash !== false) {
        document.body.classList.remove('alerting');
        void document.body.offsetWidth;
        document.body.classList.add('alerting');
      }
    }
  }, 2500);

  function checkAfk(ev) {
    if (!afkMode) return;
    // your own deliberate attack ends the alarm (kind 'dot'/'proc' are passive)
    if (afkAlarm && ev.attacker === 'You' &&
        ((ev.type === 'damage' && (ev.kind === 'melee' || ev.kind === 'spell')) || ev.type === 'miss')) {
      stopAfkAlarm('👋 Attack seen — AFK alarm stopped (AFK watch still on)');
      return;
    }
    const attacked =
      (ev.type === 'damage' && ev.target === 'You') ||
      (ev.type === 'miss' && ev.target === 'You') ||
      (ev.type === 'death' && ev.target === 'You');
    if (!attacked || afkAlarm) return;
    afkAlarm = true;
    alertFX('⚔ ATTACKED while AFK' + (ev.attacker || ev.killer ? ' by ' + (ev.attacker || ev.killer) : '') + '! (siren until you act)', 'afk');
  }
