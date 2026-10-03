// "How big will this plane look from where I'm standing?" Apparent size (wingspan over 3-D distance)
// is what decides whether it's worth stepping outside: a C-17 a mile away looks as big as a regional
// jet a few hundred metres away, and a 737 at 35,000 ft is a dot no matter how "overhead" it is.

// Wingspans in metres by ICAO type code. Approximate public figures; good enough for apparent size.
const SPAN = {
  B736: 34.3, B737: 34.3, B738: 35.8, B739: 35.8, B37M: 35.9, B38M: 35.9, B39M: 35.9, B3XM: 35.9,
  A318: 34.1, A319: 35.8, A320: 35.8, A321: 35.8, A19N: 35.8, A20N: 35.8, A21N: 35.8, BCS1: 35.1, BCS3: 35.1,
  B752: 38.1, B753: 38.1, B762: 47.6, B763: 47.6, B764: 51.9, B772: 60.9, B77L: 64.8, B77W: 64.8,
  B788: 60.1, B789: 60.1, B78X: 60.1, B744: 64.4, B748: 68.4, A332: 60.3, A333: 60.3, A338: 64.0, A339: 64.0,
  A359: 64.8, A35K: 64.8, A388: 79.8, MD11: 51.7, MD88: 32.9, MD90: 32.9,
  E170: 26.0, E75L: 26.0, E75S: 26.0, E190: 28.7, E195: 28.7, E290: 33.7, E145: 20.0, E135: 20.0,
  CRJ2: 21.2, CRJ7: 23.2, CRJ9: 24.9, CRJX: 26.2, AT72: 27.1, AT76: 27.1, DH8D: 28.4,
  C17: 51.7, C5M: 67.9, C130: 40.4, C30J: 40.4, K35R: 39.9, KC46: 48.1, E3TF: 44.4, P8: 37.6, B52: 56.4,
  C2: 24.6, E6: 45.2, T38: 7.7, T6: 10.2, F16: 10.0, F18S: 13.6, F35: 10.7, A10: 17.5, V22: 25.8,
  GLF4: 23.7, GLF5: 28.5, GLF6: 30.4, GA6C: 30.4, GA7C: 30.4, GLEX: 28.7, GL7T: 31.7, CL30: 19.5, CL35: 21.0, CL60: 19.6,
  C25A: 15.5, C25B: 15.9, C25C: 16.3, C56X: 17.0, C560: 16.5, C68A: 22.0, C680: 19.2, C700: 22.0, C750: 19.4,
  E55P: 16.2, E50P: 12.3, E545: 20.0, E550: 20.0, H25B: 15.7, LJ45: 14.6, LJ75: 15.5, FA7X: 26.2, F2TH: 19.3, F900: 19.3,
  PC12: 16.3, PC24: 17.0, BE20: 16.6, B350: 17.7, BE9L: 15.3, C208: 15.9, SF50: 11.8,
  C172: 11.0, C182: 11.0, P28A: 10.7, SR22: 11.7, DA40: 11.9, BE36: 10.2,
  EC35: 10.2, EC45: 11.0, AS50: 10.7, A139: 13.8, B407: 10.7, H60: 16.4, S76: 13.4,
};
const DEFAULT_SPAN = 25; // unknown type: assume a mid-size jet

const MIL_DEFAULT_SPAN = 40; // military traffic often has no type; it's usually a big transport
export const hasWingspan = (type) => Object.prototype.hasOwnProperty.call(SPAN, (type || '').toUpperCase());
export const wingspanM = (type, mil = false) => SPAN[(type || '').toUpperCase()] ?? (mil ? MIL_DEFAULT_SPAN : DEFAULT_SPAN);
// Twin-aisle types. A house can count these as "look up" at a lower size than everything else:
// a 777 high overhead is worth stepping out for even when it looks no bigger than a bizjet down low.
const WIDEBODY = new Set(['B762', 'B763', 'B764', 'B772', 'B77L', 'B77W', 'B778', 'B779', 'B788', 'B789', 'B78X',
  'B744', 'B748', 'A332', 'A333', 'A338', 'A339', 'A359', 'A35K', 'A388', 'MD11']);
export const isWidebody = (type) => WIDEBODY.has((type || '').toUpperCase());
export const lookupDegFor = (type, lookupDeg, widebodyLookupDeg) =>
  widebodyLookupDeg != null && isWidebody(type) ? Math.min(lookupDeg, widebodyLookupDeg) : lookupDeg;
export const apparentDeg = (spanM, slantM) => (Math.atan2(spanM, Math.max(slantM, 1)) * 180) / Math.PI;

const KT = 0.514444, FT = 0.3048;
const VZ_TRUST_S = 60;
const LANDING_AGL_M = 90; // projected below ~300 ft while descending = it's landing, not passing

// Projects the aircraft forward along its current track (and climb/descent) and reports:
//   tier       'lookup' (peak size >= lookupDeg) | 'heads' (>= headsDeg) | null
//   etaS       seconds until it looks big (lookup) or until its closest point (heads); 0 if already
//   exitS      seconds until it stops looking big (lookup tier)
//   nowLookup  it looks big right now
//   peakDeg, slantM, peakT  apparent size, 3-D distance and time at its closest point
export function predictLook(ac, { groundFt = 500, lookupDeg: baseLookupDeg = 2, headsDeg = 0.8, horizonS = 240, widebodyLookupDeg = null } = {}) {
  if (ac.x == null || ac.altFt == null) return { tier: null };
  const lookupDeg = lookupDegFor(ac.type, baseLookupDeg, widebodyLookupDeg);
  const span = wingspanM(ac.type, ac.mil);
  const moving = ac.gs != null && ac.track != null;
  const s = moving ? ac.gs * KT : 0, th = moving ? (ac.track * Math.PI) / 180 : 0;
  const vx = s * Math.sin(th), vy = s * Math.cos(th), vz = ((ac.vrate || 0) / 60) * FT;
  const age = ac.posAge || 0;
  // Climb/descent is only trusted for a minute: beyond that, planes level off, land or turn.
  const at = (t) => {
    const tt = t + age;
    const x = ac.x + vx * tt, y = ac.y + vy * tt;
    const agl = Math.max(0, (ac.altFt - groundFt) * FT + vz * Math.min(tt, VZ_TRUST_S));
    const slant = Math.hypot(x, y, agl);
    return { x, y, agl, slant, deg: apparentDeg(span, slant) };
  };
  let peak = { deg: -1 }, peakT = 0, firstLook = null, lastLook = null;
  const end = moving ? horizonS : 0;
  for (let t = 0; t <= end; t++) {
    const p = at(t);
    if (p.deg > peak.deg) { peak = p; peakT = t; }
    if (p.deg >= lookupDeg) { if (firstLook == null) firstLook = t; lastLook = t; }
    else if (firstLook != null) break; // it has come and gone
  }
  const now = at(0);
  let tier = peak.deg >= lookupDeg ? 'lookup' : peak.deg >= headsDeg ? 'heads' : null;
  // Already past and getting smaller: nothing to look forward to (a big one still shows as "now").
  if (tier === 'heads' && peakT === 0 && (!moving || at(1).slant > now.slant)) tier = null;
  // Projected into the runway: an arrival short of the house, not a low pass over it.
  if (tier && peakT > 0 && vz < 0 && peak.agl < LANDING_AGL_M) tier = null;
  const etaS = tier === 'lookup' ? firstLook : tier === 'heads' ? peakT : null;
  // Where to look: the plane's position when it starts looking big, not where it is now.
  const there = etaS != null ? at(etaS) : now;
  const lookBearing = ((Math.atan2(there.x, there.y) * 180) / Math.PI + 360) % 360;
  const lookElev = (Math.atan2(there.agl, Math.hypot(there.x, there.y)) * 180) / Math.PI;
  return {
    tier,
    etaS, lookBearing, lookElev,
    exitS: tier === 'lookup' ? lastLook : null,
    nowLookup: now.deg >= lookupDeg,
    nowDeg: now.deg, peakDeg: peak.deg, slantM: peak.slant, peakT,
  };
}
