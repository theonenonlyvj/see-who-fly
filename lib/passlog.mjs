import fs from 'node:fs';
import path from 'node:path';
import { segmentClosest } from './geo.mjs';
import { wingspanM, apparentDeg, lookupDegFor } from './visibility.mjs';
import { classify, CLASSES } from './classify.mjs';

// Tracks every airborne aircraft and emits one "pass" record when it has gone by.
// Closest approach is interpolated between samples, so a 2-5 s poll can't skip over the box.
export class PassTracker {
  constructor({ logWithinM, closeAfterS = 30, groundFt = 500, lookupDeg = 2, headsDeg = 0.8, widebodyLookupDeg = null }) {
    Object.assign(this, { logWithinM, closeAfterS, groundFt, lookupDeg, headsDeg, widebodyLookupDeg });
    this.live = new Map();
    this.done = new Map(); // hex -> last seen, for aircraft whose pass was already logged
  }

  update(aircraft, now) {
    const seen = new Set();
    for (const a of aircraft) {
      if (a.onGround || a.x == null) continue;
      seen.add(a.hex);
      if (this.done.has(a.hex)) { this.done.set(a.hex, now); continue; } // already logged; it's receding
      const p = { x: a.x, y: a.y, altFt: a.altFt, t: now };
      let s = this.live.get(a.hex);
      if (!s) {
        s = { hex: a.hex, first: now, last: now, prev: p, best: { m: Math.hypot(p.x, p.y), t: now, altFt: a.altFt }, track: [] };
        this.live.set(a.hex, s);
      } else {
        const c = segmentClosest(s.prev, p);
        if (c.m < s.best.m) {
          const alt = s.prev.altFt != null && p.altFt != null ? s.prev.altFt + (p.altFt - s.prev.altFt) * c.f : p.altFt ?? s.prev.altFt;
          s.best = { m: c.m, t: s.prev.t + (now - s.prev.t) * c.f, altFt: alt };
        }
        s.prev = p; s.last = now;
      }
      Object.assign(s, { callsign: a.callsign, type: a.type, reg: a.reg, desc: a.desc, mil: !!a.mil, cls: a.cls || s.cls || null, route: a.route || s.route || null });
      if (Math.hypot(p.x, p.y) <= this.logWithinM * 4) s.track.push([Math.round((now - s.first) / 100) / 10, Math.round(p.x), Math.round(p.y), p.altFt]);
    }
    const out = [];
    for (const [hex, s] of this.live) {
      const gone = !seen.has(hex) && now - s.last > this.closeAfterS * 1000;
      const receding = seen.has(hex) && now - s.best.t > this.closeAfterS * 1000;
      if (!gone && !receding) continue;
      this.live.delete(hex);
      if (receding) this.done.set(hex, now);
      const agl = s.best.altFt == null ? 0 : Math.max(0, (s.best.altFt - this.groundFt) * 0.3048);
      const slantM = Math.hypot(s.best.m, agl);
      const peakDeg = apparentDeg(wingspanM(s.type, s.mil), slantM);
      const tier = peakDeg >= lookupDegFor(s.type, this.lookupDeg, this.widebodyLookupDeg) ? 'lookup' : peakDeg >= this.headsDeg ? 'heads' : null;
      if (s.best.m > this.logWithinM && !tier) continue;
      out.push({
        at: Math.round(s.best.t), hex, callsign: s.callsign || null, reg: s.reg || null, type: s.type || null, desc: s.desc || null,
        mil: s.mil, cls: s.cls || classify({ callsign: s.callsign, type: s.type, mil: s.mil }), route: s.route, cpaM: Math.round(s.best.m), altFt: s.best.altFt == null ? null : Math.round(s.best.altFt),
        slantM: Math.round(slantM), peakDeg: Math.round(peakDeg * 100) / 100, tier,
        overhead: tier === 'lookup', // "overhead" in stats = it looked big
        track: s.track,
      });
    }
    for (const [hex, last] of this.done) if (now - last > 10 * 60_000) this.done.delete(hex);
    return out;
  }
}

export function summarize(passes) {
  const over = passes.filter((p) => p.overhead);
  const lowest = over.filter((p) => p.altFt != null).sort((a, b) => a.altFt - b.altFt)[0] || null;
  const types = {};
  for (const p of over) types[p.type || '?'] = (types[p.type || '?'] || 0) + 1;
  const byClass = {};
  for (const c of CLASSES) byClass[c] = { all: 0, lookup: 0 };
  for (const p of passes) {
    // Re-classified on read so rule fixes apply to the day's count; helicopter needs the live
    // broadcast category, so a logged 'heli' stands.
    const c = p.cls === 'heli' ? 'heli' : classify({ callsign: p.callsign, type: p.type, mil: p.mil });
    if (!byClass[c]) continue;
    byClass[c].all++;
    if (p.overhead) byClass[c].lookup++;
  }
  return {
    byClass,
    overheadCount: over.length, headsCount: passes.filter((p) => p.tier === 'heads').length, nearCount: passes.filter((p) => !p.tier && !p.overhead).length, milCount: passes.filter((p) => p.mil).length,
    lowest: lowest && { callsign: lowest.callsign, type: lowest.type, altFt: lowest.altFt, at: lowest.at }, types,
    last: over.length ? over[over.length - 1] : null,
  };
}

// Append-only JSONL, one file per household day.
export class PassLog {
  constructor(dir, dayKey) { Object.assign(this, { dir, dayKey }); if (dir) fs.mkdirSync(dir, { recursive: true }); }
  file(day) { return path.join(this.dir, `passes-${day}.jsonl`); }
  append(pass) { if (this.dir) fs.appendFileSync(this.file(this.dayKey(new Date(pass.at))), JSON.stringify(pass) + '\n'); }
  read(day) {
    if (!this.dir) return [];
    let text;
    try { text = fs.readFileSync(this.file(day), 'utf8'); } catch { return []; }
    return text.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  }
}
