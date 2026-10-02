// "Overhead Now" lingers after a plane passes: a plane is often still audible well after it has
// passed, and that's when you want to mark it. A plane counts once it looked big (LOOK UP) or at
// least visible (heads-up size, headsDeg) from the house. It then carries justPassedS (seconds since
// it last did) for holdS seconds; otherwise justPassedS is null.
export class OverheadHold {
  constructor({ holdS = 90, headsDeg = Infinity } = {}) { this.holdS = holdS; this.headsDeg = headsDeg; this.lastBig = new Map(); this.lastLookup = new Map(); }

  // Call on every feed poll. Entries expire on time only: one feed missing a plane for a poll
  // (common for a low plane heading away) must not cut its hold short.
  track(list, nowMs) {
    for (const a of list) {
      if (a.overheadNow || a.nowDeg >= this.headsDeg) this.lastBig.set(a.hex, nowMs);
      if (a.overheadNow) this.lastLookup.set(a.hex, nowMs); // it looked big (LOOK UP), not just visible
    }
    for (const [hex, t] of this.lastBig) if (nowMs - t > this.holdS * 1000) this.lastBig.delete(hex);
    for (const [hex, t] of this.lastLookup) if (nowMs - t > Math.max(this.holdS, 120) * 1000) this.lastLookup.delete(hex);
  }

  // Call when serving state, so "Ns ago" is measured at that moment. A plane that's headed back
  // toward the house again (a trainer flying circuits) is inbound again, not "just passed".
  annotate(list, nowMs) {
    for (const a of list) {
      const t = this.lastBig.get(a.hex);
      const s = t == null || a.overheadNow || (a.tier && a.etaS > 0) ? null : Math.round((nowMs - t) / 1000);
      a.justPassedS = s != null && s <= this.holdS ? s : null;
      // The /widget's clock: seconds since it stopped looking big (LOOK UP). justPassedS above keeps
      // running while it's still visible-but-small, which is right for marking but not for "overhead".
      const L = this.lastLookup.get(a.hex);
      a.sinceLookupS = L == null || a.overheadNow || (a.tier && a.etaS > 0) ? null : Math.round((nowMs - L) / 1000);
      a.passedLookup = a.sinceLookupS != null;
    }
    return list;
  }

  apply(list, nowMs) { this.track(list, nowMs); return this.annotate(list, nowMs); }
}
