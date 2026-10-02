import fs from 'node:fs';
import path from 'node:path';

// Newest Flighty export in a directory, by the date in its name (FlightyExport-YYYY-MM-DD[_HHMM].csv).
export function newestExport(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return null; }
  const hits = names.filter((n) => /^FlightyExport-\d{4}-\d{2}-\d{2}.*\.csv$/.test(n)).sort();
  return hits.length ? path.join(dir, hits[hits.length - 1]) : null;
}

export function parseCsvLine(s) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}

const norm = (t) => (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function loadFlighty(file) {
  const idx = { file, byTail: new Map(), byFlight: new Map() };
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines.shift());
  const [iDate, iAir, iFl, iFrom, iTo, iTail] = ['Date', 'Airline', 'Flight', 'From', 'To', 'Tail Number'].map((n) => head.indexOf(n));
  const push = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
  for (const line of lines) {
    const c = parseCsvLine(line);
    const rec = { date: c[iDate], from: c[iFrom], to: c[iTo], flight: `${c[iAir]}${c[iFl]}` };
    const tail = norm(c[iTail]);
    if (tail) push(idx.byTail, tail, rec);
    if (c[iAir] && c[iFl]) push(idx.byFlight, `${c[iAir]}${c[iFl]}`.toUpperCase(), rec);
  }
  return idx;
}

// ICAO airline prefix -> the IATA code Flighty uses, for common US carriers.
const ICAO_TO_IATA = { SWA: 'WN', AAL: 'AA', DAL: 'DL', UAL: 'UA', ASA: 'AS', JBU: 'B6', NKS: 'NK', FFT: 'F9', ENY: 'MQ', SKW: 'OO', RPA: 'YX', EDV: '9E', JIA: 'OH', AAY: 'G4' };

export function flownMatch(idx, reg, callsign) {
  if (!idx) return null;
  const tail = norm(reg);
  const tailHits = tail ? idx.byTail.get(tail) || [] : [];
  let flightHits = [];
  const m = /^([A-Z]{3})(\d+)/.exec(callsign || '');
  if (m && ICAO_TO_IATA[m[1]]) flightHits = idx.byFlight.get(`${ICAO_TO_IATA[m[1]]}${m[2]}`) || [];
  if (!tailHits.length && !flightHits.length) return null;
  return { tail: tailHits.slice(-3), tailCount: tailHits.length, flight: flightHits.slice(-3), flightCount: flightHits.length };
}
