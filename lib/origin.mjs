// Where did this flight take off? Read from the plane's own track for the day (the public
// adsb.lol trace): the start of its current leg, if it starts low and next to an airport.
// Works for private jets and charters that no route list knows. No answer unless the track is
// current, its leg starts low next to an airport, and the plane climbs away from there; a track
// that starts mid-air (coverage began after takeoff) or with no altitude gives nothing.
import fs from 'node:fs';

const LEG_GAP_S = 20 * 60;     // a gap this long means the plane was parked: a new leg starts after it
const NEAR_AIRPORT_M = 8000;
const LOW_AGL_FT = 3000;
const FRESH_S = 300;           // the trace must reach to within 5 minutes of now
const CLIMB_WINDOW_S = 180;
const TURN_AGL_FT = 1000;      // a mid-trace bottom counts as a takeoff only this close to the field
const BOTTOM_MAX_FT = 15000;   // MSL; no airport's field + 1,000 ft is above this

// [code, lat, lon, elevationFt] rows; OurAirports data (public domain), large/medium airports
// plus small ones with scheduled service or an IATA code.
let AIRPORTS = null;
export function airports() {
  if (!AIRPORTS) AIRPORTS = JSON.parse(fs.readFileSync(new URL('./airports.json', import.meta.url), 'utf8'));
  return AIRPORTS;
}

const R = 6371000, rad = Math.PI / 180;
export function distM(lat1, lon1, lat2, lon2) {
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestAirport(lat, lon, list = airports()) {
  let best = null;
  for (const a of list) {
    if (Math.abs(a[1] - lat) > 0.2 || Math.abs(a[2] - lon) > 0.25) continue;
    const d = distM(lat, lon, a[1], a[2]);
    if (d <= NEAR_AIRPORT_M && (!best || d < best.d)) best = { d, a };
  }
  return best && { code: best.a[0], elevFt: best.a[3] };
}

// adsb.lol writes the whole-day trace (trace_full) only every few minutes, and hours late for a plane
// that has just taken off; trace_recent is current. Append the recent points the full trace lacks.
export function mergeTraces(full, recent) {
  const ok = (t) => t && Number.isFinite(t.timestamp) && Array.isArray(t.trace);
  if (!ok(full)) return ok(recent) ? recent : null;
  if (!ok(recent)) return full;
  const lastFull = full.trace.length ? full.timestamp + full.trace[full.trace.length - 1][0] : -Infinity;
  const extra = recent.trace.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && recent.timestamp + p[0] > lastFull)
    .map((p) => [recent.timestamp + p[0] - full.timestamp, ...p.slice(1)]);
  return { timestamp: full.timestamp, trace: full.trace.concat(extra) };
}

// A low point next to an airport that the plane then climbs away from: a takeoff (or touch-and-go),
// even when no ground points were reported (small fields, a quick turn with no coverage on the ground).
function climbsAwayFrom(pts, i, list, maxAglFt = LOW_AGL_FT) {
  const a0 = alt(pts[i]);
  if (a0 == null) return null;
  const ap = nearestAirport(pts[i][1], pts[i][2], list);
  if (!ap || a0 - ap.elevFt > maxAglFt) return null;
  const later = pts.slice(i + 1).filter((p) => p[0] - pts[i][0] <= CLIMB_WINDOW_S && alt(p) != null);
  return later.length && Math.max(...later.map(alt)) >= a0 + 300 ? ap : null;
}

// trace: readsb trace_full JSON ({ timestamp, trace: [[dtS, lat, lon, alt|'ground'|null, ...], ...] }).
const alt = (p) => (typeof p[3] === 'number' ? p[3] : null);
export function originFromTrace(trace, list = airports(), nowS = Date.now() / 1000) {
  const pts = trace && Array.isArray(trace.trace) ? trace.trace.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) : [];
  if (!pts.length || !Number.isFinite(trace.timestamp)) return null;
  // A stale trace may end before this leg began (a quick turn): then its "current leg" is the last one.
  const last = pts[pts.length - 1];
  if (nowS - (trace.timestamp + last[0]) > FRESH_S || last[3] === 'ground') return null;
  // Walk back from now to where the current leg began: the first point after a ground point or a long
  // gap, or (a quick turn with no ground reports) a low point near an airport that the plane bottomed
  // out at and then climbed away from. Either way it must be low next to an airport and climb away:
  // a plane first seen low near an airport while descending is arriving there.
  for (let i = pts.length - 1; i >= 0; i--) {
    const prev = i > 0 ? pts[i - 1] : null;
    const legStart = !prev || prev[3] === 'ground' || pts[i][0] - prev[0] > LEG_GAP_S;
    if (legStart) { const ap = climbsAwayFrom(pts, i, list); return ap ? { code: ap.code } : null; }
    // A real bottom: low, and reached by descending (before the low stretch it sits in, the plane was
    // 300+ ft higher), so level flight past another field doesn't count. Cheap checks first: most
    // points are far too high to be near a runway.
    const a = alt(pts[i]);
    let j = i - 1;
    if (a != null && a < BOTTOM_MAX_FT) while (j >= 0 && i - j < 200 && alt(pts[j]) != null && alt(pts[j]) < a + 300) j--;
    const bottom = a != null && a < BOTTOM_MAX_FT && alt(prev) != null && alt(prev) >= a && j >= 0 && alt(pts[j]) != null && alt(pts[j]) >= a + 300;
    const ap = bottom && climbsAwayFrom(pts, i, list, TURN_AGL_FT);
    if (ap) return { code: ap.code };
  }
  return null;
}
