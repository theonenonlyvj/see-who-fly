// see-who-fly client: radar + "next overhead" card. Positions are relative to home (x east, y north, metres).
const $ = (id) => document.getElementById(id);
const esc = SWF.esc;
const cvs = $('radar'), ctx = cvs.getContext('2d');
const M_PER_MI = 1609.344, M_PER_NM = 1852, KT = 0.514444;

let S = null, fetchedAt = 0;
const byHex = {};
SWF.wireMarks(document.getElementById('o-marks'), () => byHex, (force) => renderPanel(force));
const trails = new Map(); // hex -> [{x,y}]

async function tick() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    S = await r.json(); fetchedAt = performance.now();
    if (S.build && window.__build && S.build !== window.__build) return location.reload();
    window.__build = window.__build || S.build;
    for (const a of S.aircraft) {
      const t = trails.get(a.hex) || [];
      const last = t[t.length - 1];
      if (!last || Math.hypot(last.x - a.x, last.y - a.y) > 30) t.push({ x: a.x, y: a.y });
      if (t.length > 40) t.shift();
      trails.set(a.hex, t);
    }
    const live = new Set(S.aircraft.map((a) => a.hex));
    for (const k of trails.keys()) if (!live.has(k)) trails.delete(k);
    $('feed').textContent = S.stale ? `feed down${S.error ? ': ' + S.error : ''}, showing nothing` : `${S.feed || 'feed'} · ${S.aircraft.length} aircraft`;
    renderPanel();
  } catch (e) { $('feed').textContent = 'server unreachable'; }
}
setInterval(tick, 1000); tick();

// Dead-reckon between polls so motion is smooth.
function live(a, dt) {
  if (a.onGround || a.gs == null || a.track == null) return { x: a.x, y: a.y };
  const s = a.gs * KT, th = (a.track * Math.PI) / 180, age = (a.posAge || 0) + dt;
  return { x: a.x + s * Math.sin(th) * age, y: a.y + s * Math.cos(th) * age };
}

function resize() {
  const r = cvs.getBoundingClientRect(), d = devicePixelRatio || 1;
  cvs.width = r.width * d; cvs.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize); resize();

function draw() {
  requestAnimationFrame(draw);
  const w = cvs.clientWidth, h = cvs.clientHeight, cx = w / 2, cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  if (!S) return;
  const R = S.config.viewRadiusM, k = (Math.min(w, h) / 2 * 0.94) / R;
  // House view (from /settings) turns everything so the front door's direction points up.
  const up = SWF.upDeg(S);
  const P = (p) => { const q = SWF.rotate(p, up); return [cx + q.x * k, cy - q.y * k]; };
  const dt = (performance.now() - fetchedAt) / 1000;

  // Range rings (nm) + cardinal ticks.
  ctx.lineWidth = 1; ctx.font = '11px ui-monospace, monospace';
  for (let nm = 1; nm * M_PER_NM <= R + 1; nm++) {
    ctx.strokeStyle = nm % 2 ? '#0f2a26' : '#16403a';
    ctx.beginPath(); ctx.arc(cx, cy, nm * M_PER_NM * k, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#2a5a50'; ctx.fillText(`${nm} nm`, cx + 4, cy - nm * M_PER_NM * k + 12);
  }
  ctx.strokeStyle = '#0f2a26'; ctx.beginPath();
  ctx.moveTo(cx, cy - R * k); ctx.lineTo(cx, cy + R * k); ctx.moveTo(cx - R * k, cy); ctx.lineTo(cx + R * k, cy); ctx.stroke();

  // Sweep, for the vibe.
  const sw = ((performance.now() / 4000) % 1) * Math.PI * 2;
  if (ctx.createConicGradient) { // older TV browsers don't have it; the sweep is decoration
    const g = ctx.createConicGradient(sw - Math.PI / 2, cx, cy);
    g.addColorStop(0, 'rgba(92,242,176,0.16)'); g.addColorStop(0.08, 'rgba(92,242,176,0)'); g.addColorStop(1, 'rgba(92,242,176,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, Math.PI * 2); ctx.fill();
  }

  // Landmarks.
  for (const l of S.landmarks || []) {
    if (Math.hypot(l.x, l.y) > R) continue;
    const [x, y] = P(l); ctx.fillStyle = '#3d6b62';
    ctx.fillRect(x - 2, y - 2, 4, 4); ctx.fillText(l.name, x + 6, y + 4);
  }

  // House view: mark true north on the rim, and which way is the front.
  if (up) {
    const [nx, ny] = P({ x: 0, y: R * 0.97 });
    ctx.fillStyle = '#ffb547'; ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny + 4);
    ctx.fillStyle = '#5cf2b0'; ctx.textAlign = 'right'; ctx.fillText('front ↑', cx - 6, cy - R * k + 12);
    ctx.textAlign = 'left';
  }

  // Home.
  ctx.fillStyle = '#ffb547'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,181,71,.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillText('HOME', cx, cy + 26); ctx.textAlign = 'left';

  // Aircraft.
  for (const a of S.aircraft) {
    const p = live(a, dt); if (Math.hypot(p.x, p.y) > R * 1.02) continue;
    const [x, y] = P(p);
    const inbound = a.tier && a.etaS != null && a.etaS <= S.config.alertLeadS;
    const col = a.overheadNow ? '#ff5d5d' : inbound ? (a.tier === 'lookup' ? '#ffb547' : '#e8d58a') : a.onGround ? '#3d6b62' : a.mil ? '#9ad0ff' : '#5cf2b0';

    const t = trails.get(a.hex) || [];
    if (t.length > 1) {
      ctx.strokeStyle = col; ctx.globalAlpha = 0.33; ctx.lineWidth = 1.2; ctx.beginPath();
      t.forEach((q, i) => { const [qx, qy] = P(q); i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); });
      ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // Predicted path to the box for inbound traffic.
    if (inbound && a.track != null) {
      const s = a.gs * KT, th = a.track * Math.PI / 180, T = a.exitS != null ? a.exitS : a.etaS;
      const [ex, ey] = P({ x: p.x + s * Math.sin(th) * T, y: p.y + s * Math.cos(th) * T });
      ctx.setLineDash([4, 5]); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate((((a.track != null ? a.track : 0) - up) * Math.PI) / 180);
    ctx.fillStyle = col; ctx.beginPath();
    if (a.onGround) ctx.arc(0, 0, 2.5, 0, Math.PI * 2); else { ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); }
    ctx.fill(); ctx.restore();
    if (!a.onGround) {
      ctx.fillStyle = col; ctx.fillText(a.callsign || a.reg || a.hex, x + 10, y - 2);
      ctx.fillStyle = '#6c8a83';
      ctx.fillText(`${a.type || '?'} ${fl(a.altFt)}${a.vrate > 300 ? '↑' : a.vrate < -300 ? '↓' : ''}`, x + 10, y + 11);
    }
  }
}
requestAnimationFrame(draw);

const fl = (ft) => (ft == null ? '' : ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${Math.round(ft / 100) * 100}′`);
const mi = (m) => `${(m / M_PER_MI).toFixed(m < M_PER_MI ? 2 : 1)} mi`;
const routeTxt = (r) => {
  if (!r) return '';
  if (r.inferred === 'landing' && r.to) return `${r.from ? r.from.iata + ' ' : ''}→ ${r.to.iata} (landing)`;
  if (r.inferred === 'origin' && r.from) return `from ${r.from.iata}`;
  if (r.inferred === 'departing' && r.from) return `${r.from.iata} → (departing)`;
  return r.from || r.to ? `${(r.from && r.from.iata) || '?'} → ${(r.to && r.to.iata) || '?'}` : '';
};
const CLS = [['airline', 'airline'], ['privateplus', 'private plus'], ['private', 'private'], ['cargo', 'cargo'], ['heli', 'helicopter'], ['military', 'military']];
const num = (n) => (n == null ? '' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
// Plain-units live line: height above the house, mph, climbing/descending rate.
function liveLine(a) {
  const parts = [];
  if (a.aglFt != null) parts.push(`${num(Math.round(a.aglFt / 50) * 50)} ft up`);
  if (a.mph != null) parts.push(`${a.mph} mph`);
  if (a.vrate > 300) parts.push(`climbing ${num(Math.round(a.vrate / 100) * 100)} ft/min`);
  else if (a.vrate < -300) parts.push(`descending ${num(Math.round(-a.vrate / 100) * 100)} ft/min`);
  else parts.push('level');
  return parts.join(' · ');
}
function factsLine(a) {
  const f = a.facts, i = a.info, parts = [];
  if (i && i.owner) parts.push(i.owner);
  if (f) parts.push(`${f.engines} · ${f.spanFt} ft ${f.compare}`);
  return parts.join(' · ');
}
const badPhotos = {};
// No photos of everyday airliners (the server's commonAirliner: narrow-bodies and regionals on airline
// flights): the point is seeing the unusual planes, and a stock 737 shot only takes space.
const showPhoto = (a) => !a.commonAirliner;
function setPhoto(el, a) {
  // The plane's own photo first; else, for anything but an everyday airliner, a labelled photo of its type.
  const own = showPhoto(a) && a.info && a.info.photo;
  const type = !own && showPhoto(a) && a.typePhoto;
  const src = own || (type && type.src);
  const credit = $(el.id + '-credit');
  credit.textContent = type ? `${type.title} (type photo, not this plane) · photo: ${type.artist || (type.file ? `see Commons file “${type.file}”` : 'no photographer listed')}, ${type.license}, via Wikipedia` : '';
  if (type && type.source) credit.setAttribute('href', type.source); else credit.removeAttribute('href');
  credit.className = 'credit' + (type && src && !badPhotos[src] ? ' on' : '');
  if (!src || badPhotos[src]) { el.className = 'photo'; credit.className = 'credit'; return; }
  if (el.getAttribute('src') !== src) {
    el.onerror = function () { badPhotos[src] = true; el.className = 'photo'; credit.className = 'credit'; };
    el.setAttribute('src', src);
  }
  el.className = 'photo on';
}

function renderPanel(force) {
  const age = (performance.now() - fetchedAt) / 1000;
  const eta = (a) => Math.max(0, Math.round(a.etaS - age));
  // Old TV time-zone data may reject the zone: never let the clock take the panel down.
  try { $('clock').textContent = new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: S.config.tz }); }
  catch (e) { $('clock').textContent = new Date().toLocaleTimeString('en-US', { hour12: false }); }
  $('boxline').textContent = `LOOK UP ≥ ${S.config.lookupDeg}° · heads-up ≥ ${S.config.headsDeg}° · alert ${S.config.alertLeadS}s · ${(S.config.viewRadiusM / M_PER_NM).toFixed(0)} nm`;

  const airborne = S.aircraft.filter((a) => !a.onGround);
  const bigNow = airborne.filter((a) => a.overheadNow).sort((a, b) => a.distM - b.distM)[0];
  // Nothing big right now: keep the plane that just passed up while you can still hear it (and mark it).
  const justPassed = bigNow ? null : airborne.filter((a) => a.justPassedS != null && a.justPassedS + age <= S.config.holdS).sort((a, b) => a.justPassedS - b.justPassedS)[0];
  const overhead = bigNow || justPassed;
  const now = $('now');
  now.className = 'card ' + (bigNow ? '' : justPassed ? 'passed' : 'idle');
  $('o-label').textContent = justPassed ? `JUST PASSED · ${Math.round(justPassed.justPassedS + age)}s ago` : 'OVERHEAD NOW';
  if (overhead) {
    $('o-cs').textContent = overhead.callsign || overhead.reg || overhead.hex;
    $('o-mil').className = 'mil' + (overhead.mil ? ' on' : '');
    $('o-route').textContent = [overhead.route && overhead.route.airline, routeTxt(overhead.route)].filter(Boolean).join(' · ');
    $('o-meta').textContent = [overhead.desc || overhead.type, overhead.reg, liveLine(overhead)].filter(Boolean).join(' · ');
    $('o-facts').textContent = factsLine(overhead);
    setPhoto($('o-photo'), overhead);
    $('o-flown').textContent = flownTxt(overhead.flown);
    byHex[overhead.hex] = overhead;
    // Rebuild the marks when the plane changes, even with a button focused, so a tap never marks the previous plane.
    const marks = $('o-marks');
    if (force || marks.getAttribute('data-for') !== overhead.hex || !marks.contains(document.activeElement)) {
      marks.innerHTML = SWF.markRow(overhead);
      marks.setAttribute('data-for', overhead.hex);
    }
  } else {
    const l = S.today.last;
    $('o-last').textContent = l ? `Last: ${l.callsign || l.reg || l.hex} · ${l.type || '?'} · ${fl(l.altFt)} · ${SWF.time(l.at, S.config.tz)}` : 'Nothing overhead yet today.';
  }

  document.title = bigNow ? `LOOK UP · ${overhead.callsign || overhead.type || ''}` : 'see-who-fly';
  const inbound = airborne.filter((a) => a.tier && a.etaS != null && a !== overhead).sort((a, b) => a.etaS - b.etaS);
  const next = inbound[0];
  const card = $('next');
  card.className = 'card ' + (!next ? 'idle' : next.overheadNow ? 'now' : next.etaS <= S.config.alertLeadS ? 'hot' : '');
  if (next) {
    if (!bigNow && next.tier === 'lookup' && next.etaS - age <= S.config.alertLeadS) document.title = `LOOK UP in ${eta(next)}s`;
    $('n-eta').textContent = eta(next);
    $('n-tier').textContent = next.tier === 'lookup' ? 'LOOK UP' : 'heads-up · small';
    $('n-cs').textContent = `${next.callsign || next.reg || next.hex}`;
    $('n-mil').className = 'mil' + (next.mil ? ' on' : '');
    $('n-route').textContent = [next.route && next.route.airline, routeTxt(next.route)].filter(Boolean).join(' · ');
    $('n-meta').textContent = [next.desc || next.type, next.reg, liveLine(next)].filter(Boolean).join(' · ');
    $('n-facts').textContent = factsLine(next);
    setPhoto($('n-photo'), next);
    $('n-needle').setAttribute('transform', `rotate(${next.lookBearing})`);
    $('n-look').innerHTML = next.overheadNow
      ? `<b>Straight up.</b> ${fl(next.altFt)} above you.`
      : `Look <b>${SWF.where(S, next.lookBearing)}</b>, <b>${Math.round(next.lookElev != null ? next.lookElev : 0)}°</b> up.<br><span class="dim">${mi(next.distM)} out${next.track != null ? `, heading ${SWF.where(S, next.track)}` : ''}</span>`;
    $('n-flown').textContent = flownTxt(next.flown);
  }

  const rows = inbound.slice(1, 8);
  $('queue').innerHTML = rows.map((a) => `<li class="${a.tier === 'heads' ? 'miss' : ''}">
      <span class="t">${eta(a)}s</span>
      <span>${esc(a.callsign || a.reg || a.hex)} <span class="r">${esc(a.type || '')} ${fl(a.altFt)} ${esc(routeTxt(a.route))}${a.tier === 'heads' ? ' · small' : ''}${a.flown ? ' · ✈︎ flown' : ''}${a.mil ? ' · MIL' : ''}</span></span>
      <span class="r">${SWF.where(S, a.bearing)}</span></li>`).join('');

  $('s-count').textContent = S.today.overheadCount;
  $('s-low').textContent = S.today.lowest ? fl(S.today.lowest.altFt) : '—';
  $('s-near').textContent = airborne.length;
  const bc = S.today.byClass || {};
  // Big number = look-ups (planes worth stepping out for); small = everything that passed nearby.
  // The four categories asked for always show (0 is an answer); cargo and helicopter only when seen.
  $('s-cls').innerHTML = CLS.filter(([k]) => (k !== 'cargo' && k !== 'heli') || bc[k]?.all).map(([k, label]) => {
    const v = bc[k] ?? { all: 0, lookup: 0 };
    return `<span><b>${v.lookup}</b> ${label} <i>of ${v.all}</i></span>`;
  }).join('');
  $('s-types').textContent = Object.entries(S.today.types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join('  ');
}

function flownTxt(f) {
  if (!f) return '';
  const parts = [];
  if (f.tailCount) { const l = f.tail[f.tail.length - 1]; parts.push(`You've flown this exact plane ${f.tailCount}× · last ${l.date} ${l.from}→${l.to}`); }
  else if (f.flightCount) { const l = f.flight[f.flight.length - 1]; parts.push(`You've flown this flight number ${f.flightCount}× · last ${l.date} ${l.from}→${l.to}`); }
  return parts.join(' ');
}
