// "Overhead Now" lingers after a plane stops looking big: a plane is often still audible well after
// it has passed, and that's when you want to mark it. Each plane that looked big carries justPassedS
// (seconds since it last looked big) for holdS seconds; otherwise justPassedS is null.
export class OverheadHold {
  constructor({ holdS = 90 } = {}) { this.holdS = holdS; this.lastBig = new Map(); }

  // Call on every feed poll. Entries expire on time only: one feed missing a plane for a poll
  // (common for a low plane heading away) must not cut its hold short.
  track(list, nowMs) {
    for (const a of list) if (a.overheadNow) this.lastBig.set(a.hex, nowMs);
    for (const [hex, t] of this.lastBig) if (nowMs - t > this.holdS * 1000) this.lastBig.delete(hex);
  }

  // Call when serving state, so "Ns ago" is measured at that moment. A plane that's headed back
  // toward the house again (a trainer flying circuits) is inbound again, not "just passed".
  annotate(list, nowMs) {
    for (const a of list) {
      const t = this.lastBig.get(a.hex);
      const s = t == null || a.overheadNow || (a.tier && a.etaS > 0) ? null : Math.round((nowMs - t) / 1000);
      a.justPassedS = s != null && s <= this.holdS ? s : null;
    }
    return list;
  }

  apply(list, nowMs) { this.track(list, nowMs); return this.annotate(list, nowMs); }
}
