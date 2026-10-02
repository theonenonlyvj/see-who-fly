// The free feeds sometimes carry the same plane twice: its own ADS-B track (a real 24-bit hex) and
// a rebroadcast copy (TIS-B / ADS-R, hex starting with "~", often no callsign or type and a junk
// altitude). A "~" track that moves with a real airborne plane (close by, same heading and speed)
// at a fitting altitude is that plane's copy and is dropped. Once matched it stays hidden for a
// minute, so a copy that lags a little behind can't drift back in as a separate plane. "~" tracks
// that move on their own or fly at their own altitude (helicopters and older planes without ADS-B) stay.
const NEAR_M = 1500, JUNK_NEAR_M = 500, SAME_KT = 35, SAME_DEG = 30, SAME_FT = 800, JUNK_FT = 300, STICKY_MS = 60_000;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// 800 ft is wide on purpose: the real track usually reports GPS altitude and the copy only pressure
// altitude, which differ by a few hundred feet on a non-standard day.
// A copy's altitude is either close to the real plane's, or junk: reading near sea level while the
// real plane is well above it (the 2026-10-02 case: real 910 ft, copy ~20 ft).
const altFits = (g, r) => Math.abs(g.altFt - r.altFt) <= SAME_FT || (g.altFt < JUNK_FT && r.altFt - g.altFt > SAME_FT);

export function isCopy(g, r) {
  if (r.onGround || g.altFt == null || r.altFt == null) return false; // nothing to compare: keep it
  const d = Math.hypot(r.x - g.x, r.y - g.y);
  if (d > NEAR_M || !altFits(g, r)) return false;
  if (g.gs != null && r.gs != null && g.track != null && r.track != null) {
    return Math.abs(g.gs - r.gs) <= SAME_KT && angDiff(g.track, r.track) <= SAME_DEG; // moves together
  }
  return d <= JUNK_NEAR_M; // no motion data: only when right on top of it
}

export class GhostFilter {
  constructor() { this.matched = new Map(); } // "~" hex -> last matched (ms)
  apply(list, nowMs) {
    const real = list.filter((a) => !a.hex.startsWith('~') && !a.onGround);
    for (const [hex, t] of this.matched) if (nowMs - t > STICKY_MS) this.matched.delete(hex);
    return list.filter((a) => {
      if (!a.hex.startsWith('~')) return true;
      if (real.some((r) => isCopy(a, r))) { this.matched.set(a.hex, nowMs); return false; }
      return !this.matched.has(a.hex);
    });
  }
}
