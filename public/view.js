// Shared by every page: the house-view rotation, house-relative directions, and the /widget's
// choice of which plane to show. Plain functions on window.SWF so the tests can load this file too.
window.SWF = window.SWF || {};

// House view turns the radar so `upDeg` (the way the front door faces) points up.
SWF.upDeg = (S) => (S && S.settings && S.settings.view === 'house' && typeof S.config.upDeg === 'number' ? S.config.upDeg : 0);
SWF.rotate = (p, upDeg) => {
  if (!upDeg) return p;
  const t = (upDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

// "front-left" etc., as if standing at the front door. Eight sectors, 45° each.
const REL = ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left'];
SWF.relDir = (bearing, upDeg) => REL[Math.round((((bearing - upDeg) % 360) + 360) % 360 / 45) % 8];

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
SWF.compass = (b) => COMPASS[Math.round((((b % 360) + 360) % 360) / 22.5) % 16];
// Where to look, in the current view: house words in house view, compass points otherwise.
SWF.where = (S, bearing) => (SWF.upDeg(S) ? SWF.relDir(bearing, SWF.upDeg(S)) : SWF.compass(bearing));

// The /widget's one plane (VJ 2026-10-02):
// "Overhead" means looking big (LOOK UP, the same as the Overhead Now card), and "after" counts from
// when it stopped looking big (sinceLookupS from the server).
// 1. "Now": from 15 s before a look-up plane is overhead until 10 s after. Two at once: the closer
//    one, with a bias for one not yet overhead (still approaching).
// 2. A plane that just passed stays until 30 s after, unless the next look-up is under 60 s out.
// 3. Otherwise the next look-up within the tracking window.
// 4. Nothing coming: the last plane until 90 s after it passed, then clear sky.
SWF.W = { leadS: 15, afterS: 10, keepPassedS: 30, incomingWinsS: 60, clearAfterS: 90, approachBias: 0.7 };
SWF.pickWidget = (aircraft, age) => {
  const W = SWF.W, air = (aircraft || []).filter((a) => !a.onGround);
  const eta = (a) => (a.etaS == null ? null : Math.max(0, a.etaS - (age || 0)));
  const since = (a) => (a.sinceLookupS == null ? null : a.sinceLookupS + (age || 0));
  const ago = since;
  const lookup = (a) => a.tier === 'lookup';
  const coming = (a) => a.sinceLookupS == null && !a.overheadNow && lookup(a) && eta(a) != null;
  const approaching = (a) => !a.overheadNow && a.sinceLookupS == null;
  const inNow = air.filter((a) => a.overheadNow || (coming(a) && eta(a) <= W.leadS) || (since(a) != null && since(a) <= W.afterS));
  if (inNow.length) {
    const score = (a) => a.distM * (approaching(a) ? W.approachBias : 1);
    const plane = inNow.slice().sort((a, b) => score(a) - score(b))[0];
    const other = inNow.filter((a) => a !== plane).sort((a, b) => score(a) - score(b))[0] || null;
    return { mode: 'now', plane, other };
  }
  const incoming = air.filter(coming).sort((a, b) => eta(a) - eta(b))[0] || null;
  const passed = air.filter((a) => since(a) != null).sort((a, b) => ago(a) - ago(b))[0] || null;
  if (passed && ago(passed) <= W.keepPassedS && !(incoming && eta(incoming) < W.incomingWinsS)) return { mode: 'passed', plane: passed, next: incoming };
  if (incoming) return { mode: 'next', plane: incoming, passed: passed && ago(passed) <= W.clearAfterS ? passed : null };
  if (passed && ago(passed) <= W.clearAfterS) return { mode: 'passed', plane: passed, next: null };
  return { mode: 'clear' };
};
