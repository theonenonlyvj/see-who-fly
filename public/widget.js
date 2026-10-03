// /widget: the one plane worth knowing about right now, for a dashboard tile. The choice rules are
// SWF.pickWidget in view.js.
const box = document.getElementById('w');
// ?embed=1: inside another dashboard's cell (BabyOS row 4, col 5): square corners, tighter padding.
if (/[?&]embed=1\b/.test(location.search)) document.body.classList.add('embed');
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fl = (ft) => (ft == null ? '' : ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${Math.round(ft / 100) * 100} ft`);
const route = (r) => {
  if (!r) return '';
  const end = (e) => (e && e.iata) || '?';
  if (r.inferred === 'landing' && r.to) return `${r.from ? end(r.from) + ' ' : ''}→ ${end(r.to)} (landing)`;
  if (r.inferred === 'departing' && r.from) return `${end(r.from)} → (departing)`;
  if (r.inferred === 'origin' && r.from) return `from ${end(r.from)}`;
  return r.from || r.to ? `${end(r.from)} → ${end(r.to)}` : '';
};
const name = (a) => a.callsign || a.reg || a.hex;
const sub = (a) => [route(a.route), a.route && a.route.airline].filter(Boolean).join(' · '); // route first: it survives a cut
// Altitude first: on a narrow tile the end of a long type name is what gets cut, never the height.
const meta = (a) => [fl(a.altFt), a.desc || a.type].filter(Boolean).join(' · ');
// Tags under the plane: MIL, and whether you've flown it (exact tail, else the flight number) from Flighty.
const flown = (f) => !f ? '' : f.tailCount ? `✈︎ flew this plane ${f.tailCount}×` : f.flightCount ? `✈︎ flew this flight ${f.flightCount}×` : '';
const tags = (a) => (a.mil || flown(a.flown)) ? `<div class="tags">${a.mil ? '<span class="wmil">MIL</span>' : ''}${flown(a.flown) ? `<span class="wflown">${esc(flown(a.flown))}</span>` : ''}</div>` : '';
const look = (a) => `Look <b>${esc(SWF.where(S, a.lookBearing != null ? a.lookBearing : a.bearing))}</b>, ${Math.round(a.lookElev != null ? a.lookElev : (a.elevation || 0))}° up`;
const CLS = [['airline', 'airline'], ['privateplus', 'private plus'], ['private', 'private'], ['cargo', 'cargo'], ['heli', 'helicopter'], ['military', 'military']];

let S = null, build = null, fetchedAt = 0;
function render() {
  if (!S) return;
  const age = (Date.now() - fetchedAt) / 1000;
  // Lost the server (restart, Wi-Fi): say so rather than freeze on an old plane.
  const down = S.stale || age > 20;
  const pick = SWF.pickWidget(down ? [] : S.aircraft, age);
  const a = pick.plane;
  const eta = (p) => Math.max(0, Math.round(p.etaS - age));
  const ago = (p) => Math.round(p.sinceLookupS + age);
  let html;
  if (pick.mode === 'now') {
    html = `<div class="wl">OVERHEAD NOW</div><div class="cs">${esc(name(a))}</div><div class="sub">${esc(sub(a))}</div><div class="meta">${esc(meta(a))}</div>${tags(a)}<div class="lookw">${look(a)}</div>`
      + (pick.other ? `<div class="foot">also ${esc(name(pick.other))}</div>` : '');
  } else if (pick.mode === 'next') {
    // No title: the amber countdown says "next" on its own (VJ 10-02: "waste of space").
    html = `<div class="big">${eta(a)}s</div><div class="cs">${esc(name(a))}</div><div class="sub">${esc(sub(a))}</div><div class="meta">${esc(meta(a))}</div>${tags(a)}<div class="lookw">${look(a)}</div>`
      + (pick.passed ? `<div class="foot">just passed: ${esc(name(pick.passed))} · ${ago(pick.passed)}s ago</div>` : '');
  } else if (pick.mode === 'passed') {
    html = `<div class="wl">JUST PASSED · ${ago(a)}s ago</div><div class="cs">${esc(name(a))}</div><div class="sub">${esc(sub(a))}</div><div class="meta">${esc(meta(a))}</div>${tags(a)}`
      + (pick.next ? `<div class="foot">next: ${esc(name(pick.next))} in ${eta(pick.next)}s</div>` : '');
  } else {
    const bc = (S.today && S.today.byClass) || {};
    // Only classes with at least one overhead pass in the last 24 h (VJ 10-02: hide the "0" rows).
    const rows = CLS.filter(([k]) => bc[k] && bc[k].lookup).map(([k, label]) => `<b>${bc[k].lookup}</b> ${label} <i>of ${bc[k].all}</i>`);
    html = `<div class="wl">${down ? 'FLIGHT FEED IS DOWN' : 'CLEAR SKY · LAST 24 H'}</div>`
      + (rows.length ? `<div class="counts">${rows.join('<br>')}</div>` : '');
  }
  box.className = 'w ' + pick.mode + (box.clientHeight < 320 ? ' compact' : '');
  html = `<div class="in">${html}</div>`;
  const key = box.className + html;
  if (key !== shown) { shown = key; box.innerHTML = html; fit(); }
}
// Text as large as the box allows: the biggest base size at which the content still fits, so a
// wide tile, a tall one and a sparse state (clear sky) all fill their space. Capped so a near-empty
// card doesn't turn into a billboard.
function fit() {
  const inner = box.firstChild;
  if (!inner) return;
  const cs = getComputedStyle(box);
  const H = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const vmin = Math.min(innerWidth, innerHeight) / 100;
  let lo = 0.3 * vmin, hi = 2.4 * vmin;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    box.style.fontSize = mid + 'px';
    if (inner.scrollHeight <= H * 0.94 && inner.scrollWidth <= inner.clientWidth + 1) lo = mid; else hi = mid;
  }
  box.style.fontSize = lo + 'px';
}
let shown = '';
addEventListener('resize', fit);
async function tick() {
  try {
    S = await (await fetch('/api/state', { cache: 'no-store' })).json(); fetchedAt = Date.now();
    if (build && S.build !== build) return location.reload();
    build = S.build;
  } catch (e) {}
  render();
}
tick(); setInterval(tick, 2000); setInterval(render, 1000);
