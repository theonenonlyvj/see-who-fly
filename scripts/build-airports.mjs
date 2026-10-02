// Rebuilds lib/airports.json from OurAirports (public domain, https://ourairports.com/data/).
// Kept: large and medium airports, plus small ones with scheduled service or an IATA code; each
// needs a real IATA or ICAO code (no local idents). Row: [code (IATA, else ICAO), lat, lon, elevFt].
// No names: the screens show codes only, and names would only bloat the file.
// Coordinates are rounded to 0.01° (~1 km): plenty for matching a takeoff within 8 km.
// Run:  npm run build:airports
import fs from 'node:fs';

const csv = await (await fetch('https://davidmegginson.github.io/ourairports-data/airports.csv')).text();
const parse = (line) => { const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out; };
const [head, ...lines] = csv.split('\n').filter(Boolean);
const H = parse(head); const col = (r, k) => r[H.indexOf(k)];
const rows = [];
for (const l of lines) {
  const r = parse(l), type = col(r, 'type'), iata = col(r, 'iata_code'), icao = col(r, 'icao_code');
  if (!['large_airport', 'medium_airport', 'small_airport'].includes(type)) continue;
  if (type === 'small_airport' && col(r, 'scheduled_service') !== 'yes' && !iata) continue;
  const code = iata || icao;
  if (!code) continue;
  rows.push([code, +(+col(r, "latitude_deg")).toFixed(2), +(+col(r, "longitude_deg")).toFixed(2), Math.round(+col(r, 'elevation_ft') || 0)]);
}
fs.writeFileSync('lib/airports.json', JSON.stringify(rows));
console.log(`lib/airports.json: ${rows.length} airports`);
