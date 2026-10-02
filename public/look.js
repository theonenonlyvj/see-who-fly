// Phone page: pick where you are, then mark the plane(s) worth looking at. Big buttons, nothing else.
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const dir = (b) => COMPASS[Math.round(b / 22.5) % 16];
const esc = SWF.esc;
const fl = (ft) => (ft == null ? '' : `${Math.round(ft / 100) * 100} ft`);
let S = null, build = null, fetchedAt = 0;
const byHex = {};

function renderSpots() {
  document.getElementById('spots').innerHTML = SWF.SPOTS.map(([k, label]) =>
    `<button data-spot="${k}" class="${SWF.spot() === k ? 'on' : ''}">${label}</button>`).join('');
}
document.getElementById('spots').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-spot]'); if (!b) return;
  SWF.setSpot(b.dataset.spot); renderSpots(); render();
});

function card(p, kind) {
  byHex[p.hex] = p;
  const age = (Date.now() - fetchedAt) / 1000;
  const when = kind === 'now' ? 'OVERHEAD NOW' : kind === 'now passed' ? `JUST PASSED · ${Math.round(p.justPassedS + age)}s ago` : kind === 'soon' ? `IN ${Math.max(0, Math.round(p.etaS - age))}s` : SWF.time(p.at, S.config.tz);
  const end = (e) => (e && typeof e === 'object' ? e.iata : e) || '?';
  const route = !p.route ? '' : p.route.inferred === 'landing' ? ` · → ${end(p.route.to)} (landing)` : p.route.inferred === 'departing' ? ` · ${end(p.route.from)} → (departing)` : (p.route.from || p.route.to) ? ` · ${end(p.route.from)}→${end(p.route.to)}` : '';
  const dirn = kind === 'soon' ? `<div class="dirn">Look <b>${dir(p.lookBearing != null ? p.lookBearing : p.bearing)}</b>, ${Math.round(p.lookElev != null ? p.lookElev : (p.elevation != null ? p.elevation : 0))}° up</div>` : '';
  return `<div class="lk ${kind}"><div class="when">${when}${p.tier === 'heads' ? ' · small' : ''}</div>
    <div class="cs">${esc(p.callsign || p.reg || p.hex)}${p.mil ? ' <span class="mil on">MIL</span>' : ''}</div>
    <div class="meta">${esc(p.type || '?')} · ${fl(p.altFt)}${esc(route)}</div>${dirn}${SWF.markRow(p)}</div>`;
}

function render() {
  if (!S) return;
  const air = S.aircraft.filter((a) => !a.onGround);
  // Planes that just passed stay up as long as you can still hear them, so they can be marked.
  const now = air.filter((a) => a.overheadNow);
  const passed = air.filter((a) => !a.overheadNow && a.justPassedS != null && a.justPassedS + (Date.now() - fetchedAt) / 1000 <= S.config.holdS).sort((a, b) => a.justPassedS - b.justPassedS);
  const soon = air.filter((a) => !a.overheadNow && a.justPassedS == null && a.tier && a.etaS != null && a.etaS <= 240).sort((a, b) => a.etaS - b.etaS).slice(0, 3);
  const live = new Set([...now, ...soon, ...passed].map((a) => a.hex));
  const recent = (S.recent || []).filter((p) => !live.has(p.hex)).slice(0, 5);
  const html = [...now.map((p) => card(p, 'now')), ...soon.map((p) => card(p, 'soon')), ...passed.map((p) => card(p, 'now passed')), ...recent.map((p) => card(p, 'past'))].join('');
  document.getElementById('cards').innerHTML = html || `<div class="empty-look">${S.stale ? 'Flight feed is down right now.' : 'Nothing worth looking up at right now.'}</div>`;
}

async function tick() {
  try {
    S = await (await fetch('/api/state', { cache: 'no-store' })).json(); fetchedAt = Date.now();
    if (build && S.build !== build) return location.reload();
    build = S.build;
    if (!document.querySelector('.lk .mk:focus')) render();
  } catch (e) {}
}
SWF.wireMarks(document.getElementById('cards'), () => byHex, render);
renderSpots(); tick(); setInterval(tick, 2000);
