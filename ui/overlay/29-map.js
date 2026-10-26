// SEQO overlay — world travel map.
// One of the ui/overlay/*.js files that overlay.html loads in order as classic scripts:
// they share one global scope, exactly as when this was a single inline <script>.
  // ================= map (world travel map) =================
  // Zone detection ("You have entered…" + /who) stays: quests, loot and
  // timers all key off currentZone, and the world map glows your zone.

  let learnedZoneMap = {};
  window.overlay.getZoneMap().then(zm => { learnedZoneMap = zm || {}; });

  // "Neriak - Commons" / "Neriak Commons" / "The Temple of Cazic-Thule 4 (Refined)"
  // must all match their base zone: drop parentheticals, digits, punctuation,
  // and a leading "the" before comparing
  const normZone = (n) => (n || '').toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/^the/, '');

  function zoneShortName(longName) {
    if (!longName) return null;
    const direct = learnedZoneMap[longName] || EQLZones.zones[longName];
    if (direct) return direct;
    const want = normZone(longName);
    for (const src of [learnedZoneMap, EQLZones.zones]) {
      for (const [k, v] of Object.entries(src)) {
        if (normZone(k) === want) return v;
      }
    }
    return null;
  }

  const worldState = { scale: 0, cx: 0, cy: 0, routeTarget: null, startOverride: null, dragging: null };

  function fitWorld(c) {
    const xs = Object.values(EQLWorld.nodes);
    const minX = Math.min(...xs.map(n => n.x)) - 40, maxX = Math.max(...xs.map(n => n.x)) + 40;
    const minY = Math.min(...xs.map(n => n.y)) - 30, maxY = Math.max(...xs.map(n => n.y)) + 50;
    worldState.scale = Math.min(c.width / (maxX - minX), c.height / (maxY - minY));
    worldState.cx = (minX + maxX) / 2;
    worldState.cy = (minY + maxY) / 2;
  }

  // frame a set of zones (your neighbourhood, a route) at a readable zoom
  function fitWorldTo(c, shorts, padX = 60, padY = 40) {
    const ns = shorts.map(k => EQLWorld.nodes[k]).filter(Boolean);
    if (!ns.length) return fitWorld(c);
    const minX = Math.min(...ns.map(n => n.x)) - padX, maxX = Math.max(...ns.map(n => n.x)) + padX;
    const minY = Math.min(...ns.map(n => n.y)) - padY, maxY = Math.max(...ns.map(n => n.y)) + padY;
    fitWorld(c);
    const whole = worldState.scale;
    const fit = Math.min(c.width / (maxX - minX), c.height / (maxY - minY));
    worldState.scale = Math.max(whole, Math.min(fit, whole * 5)); // never wider than the world, never absurdly deep
    worldState.cx = (minX + maxX) / 2;
    worldState.cy = (minY + maxY) / 2;
  }
  // zones within `hops` zone lines of a zone (for the opening view)
  function worldNeighbourhood(short, hops) {
    const seen = new Set([short]); let ring = [short];
    for (let h = 0; h < hops; h++) {
      const next = [];
      for (const z of ring) for (const [a, b] of EQLWorld.edges) {
        const o = a === z ? b : b === z ? a : null;
        if (o && !seen.has(o)) { seen.add(o); next.push(o); }
      }
      ring = next;
    }
    return [...seen];
  }

  function currentWorldStart() {
    return worldState.startOverride ||
      (zoneShortName(currentZone) in EQLWorld.nodes ? zoneShortName(currentZone) : null);
  }

  function drawWorld(c, ctx) {
    if (!worldState.scale) {
      // open on YOUR part of the world, readable — Fit shows the whole map
      const start = currentWorldStart();
      if (start) fitWorldTo(c, worldNeighbourhood(start, 2)); else fitWorld(c);
    }
    const s = worldState.scale;
    const toScreen = (x, y) => [(x - worldState.cx) * s + c.width / 2, (y - worldState.cy) * s + c.height / 2];
    const here = currentWorldStart();
    const path = (here && worldState.routeTarget) ? EQLWorld.route(here, worldState.routeTarget) : null;
    const onPath = new Set(path ? path.map(p => p.short) : []);

    // continent labels
    ctx.font = '700 ' + Math.max(9, 14 * s) + 'px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.textAlign = 'center';
    for (const cl of EQLWorld.continents) {
      const [x, y] = toScreen(cl.x, cl.y);
      ctx.fillText(cl.label, x, y);
    }

    // edges
    for (const [a, b, t] of EQLWorld.edges) {
      const na = EQLWorld.nodes[a], nb = EQLWorld.nodes[b];
      const [x1, y1] = toScreen(na.x, na.y), [x2, y2] = toScreen(nb.x, nb.y);
      const routed = onPath.has(a) && onPath.has(b) &&
        path && path.some((p, i) => i && ((p.short === a && path[i - 1].short === b) || (p.short === b && path[i - 1].short === a)));
      ctx.strokeStyle = routed ? '#ffd766' : t === 1 ? 'rgba(110,170,255,.5)' : t === 2 ? 'rgba(255,140,255,.5)' : 'rgba(255,255,255,.22)';
      ctx.lineWidth = routed ? 2.5 : 1;
      ctx.setLineDash(t === 1 ? [5, 4] : t === 2 ? [2, 3] : []);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.setLineDash([]);

    // nodes + labels
    ctx.font = Math.max(7, 8.5 * Math.min(1.4, s * 3)) + 'px sans-serif';
    const labels = []; // drawn after every dot, most important first, never overlapping
    for (const [short, n] of Object.entries(EQLWorld.nodes)) {
      const [x, y] = toScreen(n.x, n.y);
      const isHere = short === here;
      const isTarget = short === worldState.routeTarget;
      if (EQLWorld.PORTS[short]) { // teleport destination: gold ring marker
        ctx.strokeStyle = 'rgba(255,215,102,.55)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.stroke();
      }
      if (isHere) { // current-zone glow
        const g = ctx.createRadialGradient(x, y, 2, x, y, 15);
        g.addColorStop(0, 'rgba(125,255,160,.5)');
        g.addColorStop(1, 'rgba(125,255,160,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = isHere ? '#7dffa0' : isTarget ? '#ff9d5c' : onPath.has(short) ? '#ffd766' : 'rgba(220,220,235,.75)';
      ctx.beginPath();
      ctx.arc(x, y, isHere || isTarget ? 4.5 : onPath.has(short) ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (isHere || isTarget) { ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 1.2; ctx.stroke(); }
      labels.push({ x, y, name: n.name,
        pri: isHere ? 0 : isTarget ? 1 : onPath.has(short) ? 2 : EQLWorld.PORTS[short] ? 3 : 4,
        color: isHere ? '#7dffa0' : isTarget ? '#ff9d5c' : onPath.has(short) ? '#ffd766' : 'rgba(200,200,215,.65)' });
    }
    // label decluttering: zoomed out, only the labels that fit are drawn (you,
    // your target and the route always are); zooming in reveals the rest
    labels.sort((a, b) => a.pri - b.pri);
    const placed = [];
    const fh = parseFloat(ctx.font) || 9;
    ctx.textAlign = 'center';
    for (const L of labels) {
      if (L.x < -60 || L.x > c.width + 60 || L.y < -20 || L.y > c.height + 20) continue;
      const w = ctx.measureText(L.name).width + 4;
      const r = { x1: L.x - w / 2, x2: L.x + w / 2, y1: L.y - 6 - fh, y2: L.y - 4 };
      const hit = placed.some(p => r.x1 < p.x2 && r.x2 > p.x1 && r.y1 < p.y2 && r.y2 > p.y1);
      if (hit && L.pri > 2) continue;
      placed.push(r);
      ctx.fillStyle = L.color;
      ctx.fillText(L.name, L.x, L.y - 6);
    }

    // route text in the hint bar
    const hint = $('m-hint');
    if (path) {
      const names = path.map((p, i) => {
        const via = i && p.via === 1 ? '⛵ ' : i && p.via === 2 ? '✦ ' : '';
        return via + EQLWorld.nodes[p.short].name;
      });
      let txt = 'Route (' + (path.length - 1) + ' crossings): ' + names.join(' → ');
      const port = EQLWorld.nearestPort(worldState.routeTarget);
      if (port) {
        txt += port.dist === 0
          ? '  ·  ◎ this IS a port zone (' + port.kind + ')'
          : '  ·  ◎ nearest port: ' + EQLWorld.nodes[port.short].name + ' (' + port.kind +
            ', ' + port.dist + ' zone' + (port.dist > 1 ? 's' : '') + ' away)';
      }
      hint.textContent = txt;
      hint.style.color = '#ffd766';
    } else if (!here) {
      hint.textContent = 'Click your current zone first (green), then your destination. ◎ gold rings = druid/wizard ports';
      hint.style.color = '#888';
    } else {
      hint.textContent = 'You are in ' + (EQLWorld.nodes[here] ? EQLWorld.nodes[here].name : '?') +
        ' — click a destination or use Travel to… ⛵ boat · ✦ portal · ◎ druid/wizard port';
      hint.style.color = '#888';
    }
  }

  function drawMap() {
    const c = $('m-canvas');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const here = currentWorldStart();
    $('m-zone').textContent = '🌐 ' + (here && EQLWorld.nodes[here]
      ? 'World map — ' + EQLWorld.nodes[here].name : 'World map');
    drawWorld(c, ctx);
  }

  function sizeCanvas() {
    const c = $('m-canvas');
    const r = c.getBoundingClientRect();
    if (r.width && r.height) { c.width = Math.round(r.width); c.height = Math.round(r.height); }
    drawMap();
  }

  // pan / zoom + world node clicks
  (() => {
    const c = $('m-canvas');
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = worldState;
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      v.scale = Math.min(20, Math.max(0.01, v.scale * f));
      drawMap();
    }, { passive: false });
    c.addEventListener('mousedown', (e) => {
      const v = worldState;
      worldState.dragging = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, moved: false };
      c.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!worldState.dragging) return;
      const v = worldState;
      const dx = e.clientX - worldState.dragging.x, dy = e.clientY - worldState.dragging.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) worldState.dragging.moved = true;
      const zoom = contentScale() * v.scale;
      v.cx = worldState.dragging.cx - dx / zoom;
      v.cy = worldState.dragging.cy - dy / zoom;
      drawMap();
    });
    window.addEventListener('mouseup', (e) => {
      const wasDrag = worldState.dragging && worldState.dragging.moved;
      worldState.dragging = null;
      c.style.cursor = 'grab';
      if (!wasDrag && e.target === c) worldClick(e);
    });
  })();

  function worldClick(e) {
    const c = $('m-canvas');
    const rect = c.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (c.width / rect.width);
    const py = (e.clientY - rect.top) * (c.height / rect.height);
    const s = worldState.scale;
    let best = null, bestD = 15;
    for (const [short, n] of Object.entries(EQLWorld.nodes)) {
      const x = (n.x - worldState.cx) * s + c.width / 2;
      const y = (n.y - worldState.cy) * s + c.height / 2;
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; best = short; }
    }
    if (!best) { worldState.routeTarget = null; $('m-goto').value = ''; drawMap(); return; }
    if (!currentWorldStart()) worldState.startOverride = best;      // no known location: first click = you are here
    else if (best === currentWorldStart()) worldState.routeTarget = null;
    else worldState.routeTarget = best;
    $('m-goto').value = worldState.routeTarget || '';
    frameRoute();
    drawMap();
  }

  // destination picker: same as clicking the zone, but searchable
  (() => {
    const sel = $('m-goto');
    const opts = Object.entries(EQLWorld.nodes)
      .map(([short, n]) => ({ short, name: n.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const o of opts) {
      const el = document.createElement('option');
      el.value = o.short;
      el.textContent = (EQLWorld.PORTS[o.short] ? '◎ ' : '') + o.name;
      sel.appendChild(el);
    }
    sel.addEventListener('change', () => {
      worldState.routeTarget = sel.value || null;
      frameRoute();
      drawMap();
    });
  })();

  // a new destination: show the whole route, readable
  function frameRoute() {
    const here = currentWorldStart();
    const path = here && worldState.routeTarget ? EQLWorld.route(here, worldState.routeTarget) : null;
    if (path && path.length > 1) fitWorldTo($('m-canvas'), path.map(p => p.short));
  }

  function contentScale() {
    const t = $('content').style.transform;
    const m = /scale\(([\d.]+)\)/.exec(t);
    return m ? +m[1] : 1;
  }

  $('m-fit').addEventListener('click', () => { fitWorld($('m-canvas')); drawMap(); });

  function renderAll() {
    if (activeTab === 'meter') renderMeter();
    else if (activeTab === 'breakdown') renderBreakdown();
    else if (activeTab === 'loot') renderLoot();
    else if (activeTab === 'map') sizeCanvas();
    else if (activeTab === 'timers') renderTimers();
    else if (activeTab === 'quests') renderQuests();
    else if (activeTab === 'needs') renderNeedsTab();
    else if (activeTab === 'class') renderClassTab();
    else renderZone();
  }

