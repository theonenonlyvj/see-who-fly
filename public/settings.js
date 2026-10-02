// /settings: one set of settings for every screen, saved on the house server. Not linked from the
// dashboard on purpose; bookmark it.
const root = document.getElementById('view'), note = document.getElementById('note');
let S = null;
function render() {
  if (!S) return;
  for (const b of root.querySelectorAll('button')) b.className = b.dataset.view === S.settings.view ? 'on' : '';
  const house = typeof S.config.upDeg === 'number';
  note.textContent = house ? 'Applies to every screen. House view puts the front of the house at the top; the compass still shows true north.'
    : 'House view needs "up_deg" (the way the front door faces) in the home config.';
}
async function load() {
  try { S = await (await fetch('/api/state', { cache: 'no-store' })).json(); } catch (e) {}
  render();
}
root.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-view]'); if (!b || !S) return;
  try {
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ view: b.dataset.view }) });
    if (r.ok) { S.settings = (await r.json()).settings; render(); } else note.textContent = 'Could not save. Try again.';
  } catch (err) { note.textContent = 'Could not save. Try again.'; }
});
load();
