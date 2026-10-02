import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { newestExport, loadFlighty, flownMatch } from '../lib/flighty.mjs';

const HEAD = 'Date,Airline,Flight,From,To,Tail Number\n';
function dir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'swf-')); }

test('newestExport picks the latest-dated FlightyExport-*.csv', () => {
  const d = dir();
  for (const n of ['FlightyExport-2026-07-03.csv', 'FlightyExport-2026-09-22.csv', 'FlightyExport-2026-07-03_1351.csv', 'notes.md'])
    fs.writeFileSync(path.join(d, n), HEAD);
  assert.equal(path.basename(newestExport(d)), 'FlightyExport-2026-09-22.csv');
  assert.equal(newestExport(path.join(d, 'nope')), null);
});

test('flownMatch matches tail first, then ICAO->IATA flight number', () => {
  const d = dir(), p = path.join(d, 'FlightyExport-2026-10-01.csv');
  fs.writeFileSync(p, HEAD + '2025-01-02,WN,1333,AAA,BBB,N000XX\n2024-01-02,WN,1333,AAA,CCC,"N-123"\n');
  const idx = loadFlighty(p);
  const m = flownMatch(idx, 'N000XX', 'SWA999');
  assert.equal(m.tailCount, 1);
  assert.equal(m.tail[0].to, 'BBB');
  const f = flownMatch(idx, 'N000', 'SWA1333');
  assert.equal(f.tailCount, 0);
  assert.equal(f.flightCount, 2);
  assert.equal(flownMatch(idx, null, 'XYZ1'), null);
});
