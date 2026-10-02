import fs from 'node:fs';
import path from 'node:path';

// A mark is what a person noticed about one aircraft from one spot. heard/seen are independent and
// each is true (yes), false (no: "tried and couldn't") or null (didn't say). Unmarked is not "no".
export const SPOTS = ['desk', 'front', 'back'];
const tri = (v) => (v === true || v === false ? v : v == null ? null : undefined);

export function parseMark(body, now) {
  if (!body || typeof body !== 'object') return null;
  const hex = String(body.hex || '');
  if (!/^~?[0-9a-z]{3,8}$/i.test(hex)) return null;
  if (!SPOTS.includes(body.spot)) return null;
  const heard = tri(body.heard), seen = tri(body.seen);
  if (heard === undefined || seen === undefined) return null;
  const callsign = /^[A-Z0-9-]{1,10}$/i.test(body.callsign || '') ? body.callsign : null;
  return { hex: hex.toLowerCase(), callsign, spot: body.spot, heard, seen, at: now };
}

// hex -> { spot -> latest mark }
export function latestMarks(marks) {
  const out = new Map();
  for (const m of [...marks].sort((a, b) => a.at - b.at)) {
    const per = out.get(m.hex) || {};
    per[m.spot] = m;
    out.set(m.hex, per);
  }
  return out;
}

export class MarkLog {
  constructor(dir, dayKey) { Object.assign(this, { dir, dayKey }); }
  file(day) { return path.join(this.dir, `marks-${day}.jsonl`); }
  append(m) { if (this.dir) fs.appendFileSync(this.file(this.dayKey(new Date(m.at))), JSON.stringify(m) + '\n'); }
  read(day) {
    if (!this.dir) return [];
    let text;
    try { text = fs.readFileSync(this.file(day), 'utf8'); } catch { return []; }
    return text.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  }
}
