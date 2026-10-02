// Shared marking widget: where am I (desk / front porch / back porch) + heard and seen, each
// yes / no / unmarked. Tapping the active choice clears it back to unmarked.
window.SWF = window.SWF || {};
// Everything shown comes from third-party feeds: escape before it touches innerHTML.
SWF.esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
SWF.SPOTS = [['desk', 'Desk'], ['front', 'Front porch'], ['back', 'Back porch']];
SWF.spot = () => localStorage.getItem('swf-spot') || (location.pathname === '/look' ? 'front' : 'desk');
SWF.setSpot = (s) => localStorage.setItem('swf-spot', s);

SWF.markRow = (plane) => {
  const m = (plane.marks && plane.marks[SWF.spot()]) || {};
  const btn = (field, val, label) =>
    `<button class="mk ${m[field] === val ? 'on' : ''} ${val ? 'yes' : 'no'}" data-hex="${SWF.esc(plane.hex)}" data-cs="${SWF.esc(plane.callsign || '')}" data-f="${field}" data-v="${val}">${label}</button>`;
  return `<div class="marks">${btn('heard', true, 'Heard')}${btn('heard', false, 'Not heard')}<span class="gap"></span>${btn('seen', true, 'Seen')}${btn('seen', false, 'Not seen')}</div>`;
};

// planesByHex: hex -> plane (with .marks); after a successful post, the local copy updates immediately.
SWF.wireMarks = (root, planesByHex, onChange) => {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button.mk');
    if (!b) return;
    const hex = b.dataset.hex, field = b.dataset.f, val = b.dataset.v === 'true';
    const plane = planesByHex()[hex] || { hex };
    const spot = SWF.spot();
    const cur = (plane.marks && plane.marks[spot]) || { heard: null, seen: null };
    const next = { heard: cur.heard == null ? null : cur.heard, seen: cur.seen == null ? null : cur.seen };
    next[field] = cur[field] === val ? null : val;
    let r;
    try {
      r = await fetch('/api/mark', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ hex, callsign: b.dataset.cs || null, spot }, next)) });
    } catch { b.classList.add('err'); return; }
    if (r.ok) {
      const { mark } = await r.json();
      plane.marks = Object.assign({}, plane.marks || {}, { [spot]: mark });
      onChange && onChange(true);
    }
  });
};

SWF.time = (ms, tz) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined });
