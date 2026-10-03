// Which leg of a flight number is this plane actually flying?
//
// Airlines reuse one flight number for several legs a day (e.g. HOU→DAL→LGA), and simple
// callsign→route databases keep only one of them. This picks the leg that fits what the plane is
// doing right now, and returns null (show the airline only) when nothing fits.
import { segmentClosest } from './geo.mjs';

const NEAR_AIRPORT_M = 40_000;   // "near" an airport on the chain
const TERMINAL_ALT_FT = 12_000;  // below this, climbing/descending near an airport means departing/arriving
const ON_PATH_M = 80_000;        // overflights must be within this of the leg's path
const ALIGN_DEG = 45;            // and heading roughly the same way

// VRS standing data (vrs-standing-data.adsb.lol) → chain of airports in the local frame.
export function chainFromVrs(vrs, frame) {
  return (vrs?._airports || [])
    .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
    .map((a) => ({ iata: a.iata || a.icao || '?', name: a.location || a.name || null, lat: a.lat, lon: a.lon, ...frame.toLocal(a.lat, a.lon) }));
}

// For saving: airports with their own (public) lat/lon only, never the position relative to home.
export const chainToDisk = (chain) => (chain || []).map(({ x, y, ...a }) => a);
// On loading: positions relative to this home worked out again; airports without lat/lon dropped.
export const chainFromDisk = (chain, frame) => (chain || []).filter((a) => a && Number.isFinite(a.lat) && Number.isFinite(a.lon)).map((a) => ({ ...a, ...frame.toLocal(a.lat, a.lon) }));

const bearing = (a, b) => ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const leg = (a, b) => ({ from: { iata: a.iata, name: a.name }, to: { iata: b.iata, name: b.name } });

export function pickLeg(chain, s) {
  if (!chain || chain.length < 2 || s == null || s.x == null) return null;
  const low = s.altFt != null && s.altFt < TERMINAL_ALT_FT;

  // Arriving at or departing from an airport on the chain. Every occurrence of that airport counts
  // (chains like A-B-A-C), and if no leg fits, there is no route; never fall through to a guess.
  if (low && s.vrate != null && Math.abs(s.vrate) > 300) {
    const near = chain.map((a, i) => ({ i, d: Math.hypot(s.x - a.x, s.y - a.y) })).filter((n) => n.d <= NEAR_AIRPORT_M);
    if (near.length) {
      const cands = [];
      for (const { i } of near) {
        if (s.vrate < 0 && i > 0) cands.push([chain[i - 1], chain[i]]);
        if (s.vrate > 0 && i < chain.length - 1) cands.push([chain[i], chain[i + 1]]);
      }
      // Several candidates: prefer the one the plane is pointed along (loosely; approaches turn).
      const fit = cands
        .map(([a, b]) => ({ a, b, off: s.track == null ? 0 : angDiff(s.track, bearing(a, b)) }))
        .filter((c) => c.off <= 90)
        .sort((x, y) => x.off - y.off)[0];
      return fit ? leg(fit.a, fit.b) : null;
    }
  }

  // Otherwise only a plane that is clearly cruising, with a known heading, can be matched to the leg
  // whose path it's on. Low traffic that isn't arriving/departing on its chain gets no route.
  if (low || s.track == null) return null;
  let pick = null, pickD = Infinity;
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = chain[i], b = chain[i + 1];
    if (a.iata === b.iata) continue;
    const d = segmentClosest({ x: a.x - s.x, y: a.y - s.y }, { x: b.x - s.x, y: b.y - s.y }).m;
    if (d > ON_PATH_M) continue;
    if (angDiff(s.track, bearing(a, b)) > ALIGN_DEG) continue;
    if (d < pickD) { pickD = d; pick = leg(a, b); }
  }
  return pick;
}
