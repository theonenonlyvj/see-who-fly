// Where is this plane landing or departing, judged from what it's doing near a known airport?
// Needs no route list, so it works for charters and stale flight numbers alike.
const NEAR_M = 25_000, LOW_AGL_FT = 4000;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const bearingTo = (from, to) => ((Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI + 360) % 360;

export function inferEndpoint(s, airports, groundFt = 0) {
  if (!airports || !airports.length || s.track == null || s.vrate == null || s.altFt == null) return null;
  if (s.altFt - groundFt > LOW_AGL_FT || Math.abs(s.vrate) < 300) return null;
  let best = null;
  for (const a of airports) {
    const d = Math.hypot(a.x - s.x, a.y - s.y);
    if (d > NEAR_M) continue;
    const toward = angDiff(s.track, bearingTo(s, a));
    // Height must fit the distance: a real approach is a ~3 degree glide, climb-outs are steeper.
    const ang = (Math.atan2(Math.max(0, (s.altFt - groundFt) * 0.3048), Math.max(d, 1)) * 180) / Math.PI;
    if (s.vrate < 0 && (ang < 1.5 || ang > 7)) continue;
    if (s.vrate > 0 && (ang < 1.5 || ang > 15)) continue;
    if (s.vrate < 0 && toward <= 25 && (!best || d < best.d)) best = { d, kind: 'landing', a };
    if (s.vrate > 0 && toward >= 145 && (!best || d < best.d)) best = { d, kind: 'departing', a };
  }
  return best ? { kind: best.kind, airport: { iata: best.a.iata, name: best.a.name } } : null;
}
