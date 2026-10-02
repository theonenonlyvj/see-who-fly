// Local flat-earth frame around one point (accurate to well under 1% over a few miles).
const R_EARTH = 6371008.8;
export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;

export function makeFrame(lat0, lon0) {
  const k = Math.cos(rad(lat0));
  return {
    toLocal(lat, lon) {
      return { x: rad(lon - lon0) * R_EARTH * k, y: rad(lat - lat0) * R_EARTH }; // east, north (m)
    },
  };
}

// Time window [tIn, tOut] (s from now) during which a straight track p + v·t is inside the
// square of half-side `half` centred on the origin. Slab method. null if it never enters.
export function boxWindow(p, v, half) {
  let tIn = -Infinity, tOut = Infinity;
  for (const [pi, vi] of [[p.x, v.x], [p.y, v.y]]) {
    if (Math.abs(vi) < 1e-9) {
      if (Math.abs(pi) > half) return null;
      continue;
    }
    let a = (-half - pi) / vi, b = (half - pi) / vi;
    if (a > b) [a, b] = [b, a];
    tIn = Math.max(tIn, a); tOut = Math.min(tOut, b);
  }
  if (tIn > tOut || tOut < 0) return null;
  return { tIn: Math.max(tIn, 0), tOut };
}

// Closest approach to the origin along the segment p1→p2: distance m and fraction f in [0,1].
export function segmentClosest(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, L2 = dx * dx + dy * dy;
  const f = L2 > 0 ? Math.min(1, Math.max(0, -(p1.x * dx + p1.y * dy) / L2)) : 0;
  return { m: Math.hypot(p1.x + dx * f, p1.y + dy * f), f };
}
