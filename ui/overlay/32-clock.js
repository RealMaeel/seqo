// SEQO overlay — the clock in the title bar (and in the locked-mode corner).
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= clock (2.7) =================
  // Full-screen players have no Windows clock on screen: SEQO shows the PC's
  // time in its title bar, and in the top-right corner while locked.
  // Hours and minutes in the PC's own 12/24-hour style. ⚙ Appearance → Clock.
  let clockText = '';
  function renderClock() {
    const on = !settings || settings.showClock !== false;
    const t = on ? new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    if (t === clockText) return;
    clockText = t;
    for (const id of ['tb-clock', 'lock-clock']) { const el = $(id); if (el) el.textContent = t; }
  }
  renderClock();
  setInterval(renderClock, 1000);   // cheap: only touches the page when the minute changes
