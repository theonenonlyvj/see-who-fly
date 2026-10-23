// The free feeds sometimes carry the same plane twice: its own ADS-B track (a real 24-bit hex) and
// a rebroadcast copy (TIS-B / ADS-R, hex starting with "~", often no callsign or type and a junk
// altitude). A "~" track that moves with a real airborne plane (close by, same heading and speed)
// at a fitting altitude is that plane's copy and is dropped. Once matched it stays hidden for a
// minute, so a copy that lags a little behind can't drift back in as a separate plane. "~" tracks
// that move on their own or fly at their own altitude (helicopters and older planes without ADS-B) stay.
const NEAR_M = 1500, JUNK_NEAR_M = 500, SAME_KT = 35, SAME_DEG = 30, SAME_FT = 800, JUNK_FT = 300, STICKY_MS = 60_000;
// A "~" track also has to move before it can alarm. Some radar-only tracks sit at one spot for half
// a minute with a jumping altitude: a fixed false target, not a plane (pass logs 10-20 to 10-23: up to
// 37 m of jitter over 36 s, the same spots recurring). Until a "~" track has moved MOVE_M from where it
// was first seen it stays on the radar, but with no LOOK UP / heads-up tier, no flash and no pass.
// A real plane covers MOVE_M in one or two polls; once it has moved it stays proven.
const MOVE_M = 100, FORGET_MS = 120_000;
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
  constructor() { this.matched = new Map(); this.seen = new Map(); } // "~" hex -> last matched (ms); "~" hex -> { x, y, last, moved }
  apply(list, nowMs) {
    const real = list.filter((a) => !a.hex.startsWith('~') && !a.onGround);
    for (const [hex, t] of this.matched) if (nowMs - t > STICKY_MS) this.matched.delete(hex);
    for (const [hex, s] of this.seen) if (nowMs - s.last > FORGET_MS) this.seen.delete(hex);
    return list.filter((a) => {
      if (!a.hex.startsWith('~')) return true;
      if (real.some((r) => isCopy(a, r))) { this.matched.set(a.hex, nowMs); return false; }
      return !this.matched.has(a.hex);
    }).map((a) => (a.hex.startsWith('~') && !a.onGround && !this.hasMoved(a, nowMs) ? stillTrack(a) : a));
  }
  hasMoved(a, nowMs) {
    let s = this.seen.get(a.hex);
    if (!s) { s = { x: a.x, y: a.y, last: nowMs, moved: false }; this.seen.set(a.hex, s); }
    s.last = nowMs;
    if (!s.moved && Math.hypot(a.x - s.x, a.y - s.y) >= MOVE_M) s.moved = true;
    return s.moved;
  }
}

// Shown on the radar, but nothing that alarms or counts: no tier, no flash, no pass.
const stillTrack = (a) => ({ ...a, still: true, mystery: false, tier: null, overheadNow: false, etaS: null, exitS: null, nowDeg: null, peakDeg: null });
