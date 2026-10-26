// SEQO overlay — tells toast, chat history popup and badge.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ---- 💬 chat history ----
  let chatMsgs = [], chatUnread = 0, chatFilter = 'personal', chatPending = [];
  const CHAT_PERSONAL = new Set(['tell', 'group', 'guild', 'raid']);
  window.overlay.chatList().then((list) => {
    if (Array.isArray(list)) chatMsgs = list.map(m => ({ ...m, saved: true })).concat(chatMsgs);
    try { renderChatBadge(); } catch { /* bar not built yet */ }
    if (chatOpen()) renderChat();
  }).catch(() => {});
  function noteChat(ev) {
    if (ev.type !== 'chat') return;
    const m = { t: ev.when || Date.now(), channel: ev.channel, chan: ev.chan, from: ev.from, to: ev.to, text: ev.text, char: charName || undefined };
    chatMsgs.push(m);
    if (chatMsgs.length > 4000) chatMsgs.splice(0, chatMsgs.length - 3000);
    if (CHAT_PERSONAL.has(m.channel)) {
      chatPending.push(m);
      if (m.from !== 'You' && !chatOpen()) {
        chatUnread++; renderChatBadge();
        // a tell pops a quiet toast — unless one of your custom alerts already called it out
        if (m.channel === 'tell' && !(caLastText && caLastText.includes(m.text)))
          toast('💬 ' + m.from + ': ' + (m.text.length > 90 ? m.text.slice(0, 88) + '…' : m.text));
      }
    }
    if (chatOpen()) chatDirty = true;
  }
  let chatDirty = false;
  const chatOpen = () => { const c = $('chat-modal'); return !!c && c.style.display !== 'none'; };
  function openChat() { $('chat-modal').style.display = 'flex'; $('chat-rows').dataset.seen = ''; renderChat(); }
  setInterval(() => {
    if (chatPending.length) { try { window.overlay.chatAdd(chatPending); } catch { /* main not ready */ } chatPending = []; }
    if (chatDirty && chatOpen()) { chatDirty = false; renderChat(); }
  }, 1500);
  function renderChatBadge() {
    const b = $('chat-badge');
    if (!b) return;
    b.style.display = chatUnread ? '' : 'none';
    b.textContent = chatUnread > 99 ? '99+' : String(chatUnread);
    // the 💬 sits on the bottom bar once there is any personal chat to look at
    const has = chatUnread || chatMsgs.some(x => CHAT_PERSONAL.has(x.channel));
    $('bb-chat').style.display = has ? '' : 'none';
    updateBottomBar();
  }
  const CHAT_FILTERS = [['personal', 'Tells & group'], ['tell', 'Tells'], ['all', 'Everything']];
  const chatColor = { tell: '#d9a6ff', group: '#7dc8ff', guild: '#7dffa0', raid: '#ffb27d', chan: '#bbb', say: '#ddd', shout: '#ff9d7d', ooc: '#9fd', auction: '#9fd' };
  function renderChat() {
    chatUnread = 0; renderChatBadge();
    const fb = $('chat-filters'); fb.innerHTML = '';
    for (const [k, label] of CHAT_FILTERS) {
      const c = document.createElement('span');
      c.className = 'qview-chip' + (chatFilter === k ? ' active' : '');
      c.style.fontSize = '10px';
      c.textContent = label;
      c.addEventListener('click', () => { chatFilter = k; renderChat(); });
      fb.appendChild(c);
    }
    const q = ($('chat-search').value || '').trim().toLowerCase();
    const want = (m) => (chatFilter === 'all' || (chatFilter === 'personal' ? CHAT_PERSONAL.has(m.channel)
      : chatFilter === 'say' ? (m.channel === 'say' || m.channel === 'shout' || m.channel === 'ooc') : m.channel === chatFilter))
      && (!q || (m.text + ' ' + m.from + ' ' + (m.to || '') + ' ' + (m.chan || '')).toLowerCase().includes(q));
    const box = $('chat-rows');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
    box.innerHTML = '';
    const shown = chatMsgs.filter(want).slice(-400);
    if (!shown.length) { box.innerHTML = '<div class="q-npc" style="padding:6px">Nothing here yet' + (q ? ' for “' + q.replace(/[<>&]/g, '') + '”' : '') + '.</div>'; return; }
    let lastDay = '';
    for (const m of shown) {
      const d = new Date(m.t), day = d.toLocaleDateString();
      if (day !== lastDay) {
        lastDay = day;
        const dv = document.createElement('div'); dv.style.cssText = 'color:#667;font-size:9.5px;text-align:center;margin:3px 0'; dv.textContent = '— ' + day + ' —';
        box.appendChild(dv);
      }
      const row = document.createElement('div');
      row.style.cssText = 'padding:1px 0;color:' + (chatColor[m.channel] || '#ddd') + (m.saved ? ';opacity:.8' : '');
      const ts = document.createElement('span'); ts.style.cssText = 'color:#667;font-size:9.5px;margin-right:4px';
      ts.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const who = document.createElement('span');
      who.style.cssText = 'font-weight:600;cursor:pointer';
      const label = m.channel === 'tell' ? (m.from === 'You' ? '→ ' + m.to : m.from) : m.channel === 'chan' ? '[' + m.chan + '] ' + m.from
        : m.channel === 'say' || m.channel === 'shout' || m.channel === 'ooc' || m.channel === 'auction' ? m.from : '[' + m.channel + '] ' + m.from;
      who.textContent = label + ': ';
      const tellTo = m.channel === 'tell' && m.from === 'You' ? m.to : m.from;
      who.title = tellTo && tellTo !== 'You' ? 'Click to copy /tell ' + tellTo : '';
      who.addEventListener('click', () => { if (tellTo && tellTo !== 'You') { window.overlay.copyText('/tell ' + tellTo + ' '); toast('📋 Copied /tell ' + tellTo + ' — paste it in game'); } });
      const tx = document.createElement('span'); tx.textContent = m.text; tx.style.userSelect = 'text';
      row.append(ts, who, tx);
      box.appendChild(row);
    }
    if (atBottom || !box.dataset.seen) { box.scrollTop = box.scrollHeight; box.dataset.seen = '1'; }
  }

