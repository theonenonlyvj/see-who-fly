import test from 'node:test';
import assert from 'node:assert/strict';
import { originFromTrace as originRaw, nearestAirport, mergeTraces } from '../lib/origin.mjs';

// Traces here end 'now' (timestamp 1000 + last dt), unless a test says otherwise.
const originFromTrace = (tr, ap) => originRaw(tr && { timestamp: 1000, ...tr }, ap, 1000 + (tr && Array.isArray(tr.trace) && tr.trace.length ? tr.trace[tr.trace.length - 1][0] : 0));

// Synthetic airports and tracks around the Maho Beach example, not real flights.
const AP = [['SXM', 18.0410, -63.1089, 13], ['SBH', 17.9044, -62.8436, 49]];

test('origin is the airport the current leg took off from', () => {
  const tr = { trace: [[0, 17.9050, -62.8450, 'ground'], [30, 17.9060, -62.8460, 400], [120, 17.95, -62.90, 1500], [300, 18.00, -63.00, 3000], [600, 18.03, -63.09, 900]] };
  assert.deepEqual(originFromTrace(tr, AP), { code: 'SBH' });
});

test('a track that starts low next to an airport counts, even without ground points', () => {
  const tr = { trace: [[0, 17.9100, -62.8500, 1100], [120, 17.95, -62.90, 2400], [300, 18.00, -63.00, 3000]] };
  assert.equal(originFromTrace(tr, AP).code, 'SBH');
});

test('coverage that starts mid-air gives no origin', () => {
  const tr = { trace: [[0, 17.9100, -62.8500, 12000], [300, 18.00, -63.00, 3000]] };
  assert.equal(originFromTrace(tr, AP), null);
});

test('only the current leg counts: an earlier flight today is skipped', () => {
  const tr = { trace: [[0, 18.0410, -63.1089, 'ground'], [60, 18.05, -63.10, 800], [900, 17.9044, -62.8436, 'ground'],
    [4000, 17.9044, -62.8436, 'ground'], [4030, 17.9060, -62.8460, 500], [4150, 17.95, -62.90, 1600], [4300, 18.00, -63.00, 2500]] };
  assert.equal(originFromTrace(tr, AP).code, 'SBH');
  const parked = { trace: [[0, 18.0410, -63.1089, 300], [600, 17.9050, -62.8440, 300], [600 + 3600, 17.9050, -62.8440, 600], [600 + 3700, 17.95, -62.9, 1800], [600 + 3900, 18.0, -63.0, 2500]] };
  assert.equal(originFromTrace(parked, AP).code, 'SBH');
});

test('no airport nearby, junk input, or still on the ground: no origin', () => {
  assert.equal(originFromTrace({ trace: [[0, 16.5, -61.0, 500], [60, 16.6, -61.0, 900]] }, AP), null);
  assert.equal(originFromTrace(null, AP), null);
  assert.equal(originFromTrace({ trace: 'x' }, AP), null);
  assert.equal(originFromTrace({ trace: [[0, 18.0410, -63.1089, 'ground']] }, AP), null);
});

test('a missing altitude is no answer, not 0 ft', () => {
  assert.equal(originFromTrace({ trace: [[0, 17.9100, -62.8500, null], [60, 17.95, -62.9, 3000]] }, AP), null);
});

test('first seen low near an airport but descending: arriving there, not departing', () => {
  assert.equal(originFromTrace({ trace: [[0, 17.9100, -62.8500, 2000], [60, 17.9070, -62.8460, 1200], [120, 17.9050, -62.8440, 400]] }, AP), null);
});

test('a stale trace (ends well before now) gives no answer: it may predate a quick turn', () => {
  const tr = { timestamp: 1000, trace: [[0, 17.9050, -62.8450, 'ground'], [30, 17.9060, -62.8460, 400], [120, 17.95, -62.90, 1500]] };
  assert.equal(originRaw(tr, AP, 1000 + 120 + 600), null);
  assert.equal(originRaw(tr, AP, 1000 + 120 + 60).code, 'SBH');
});

test('the bundled airport list knows real airports', () => {
  assert.equal(nearestAirport(18.0410, -63.1089).code, 'SXM');
});

test('a quick turn with no ground reports still splits the legs: origin is the latest field', () => {
  // SXM -> SBH, a 10-minute turn seen only in the air, then SBH -> out over the sea.
  const tr = { trace: [[0, 18.0410, -63.1089, 200], [120, 18.00, -63.00, 3000], [600, 17.92, -62.86, 1500],
    [700, 17.9050, -62.8440, 300], [1300, 17.9060, -62.8460, 250], [1400, 17.95, -62.90, 1800], [1600, 18.10, -62.70, 4000]] };
  assert.equal(originFromTrace(tr, AP).code, 'SBH');
});

test('a stale full trace is completed by the recent one (fresh takeoff after hours parked)', () => {
  const full = { timestamp: 0, trace: [[0, 18.0410, -63.1089, 'ground'], [100, 18.0410, -63.1089, 'ground']] };
  const recent = { timestamp: 20000, trace: [[0, 18.0410, -63.1089, 'ground'], [30, 17.9060, -62.8460, 400], [150, 17.95, -62.90, 1900]] };
  const m = mergeTraces(full, recent);
  assert.equal(m.trace.length, 5);
  assert.equal(originRaw(m, AP, 20000 + 150 + 10).code, 'SBH');
  assert.equal(originRaw(full, AP, 20000 + 160), null); // the full trace alone is stale
  assert.equal(mergeTraces(null, recent), recent);
  assert.equal(mergeTraces(full, null), full);
});

test('climbing out past another airfield is not a new origin', () => {
  // Departs SXM, levels at 1,000 ft, dips, then climbs on past SBH at ~1,500 ft: still from SXM.
  const tr = { trace: [[0, 18.0410, -63.1089, 'ground'], [30, 18.0400, -63.1000, 400], [120, 18.00, -63.00, 1000],
    [400, 17.92, -62.86, 1500], [460, 17.91, -62.85, 1450], [520, 17.90, -62.83, 2500], [700, 17.80, -62.70, 5000]] };
  assert.equal(originFromTrace(tr, AP).code, 'SXM');
});

test('low level flight past another field, then a climb, is not a takeoff there', () => {
  const tr = { trace: [[0, 18.0410, -63.1089, 'ground'], [30, 18.0400, -63.1000, 400], [120, 18.00, -63.00, 900],
    [400, 17.92, -62.86, 900], [430, 17.91, -62.85, 900], [520, 17.90, -62.83, 2500]] };
  assert.equal(originFromTrace(tr, AP).code, 'SXM');
});

test('the recent trace alone (no full trace yet) gives a fresh takeoff its origin', () => {
  const recent = { timestamp: 5000, trace: [[0, 17.9050, -62.8450, 'ground'], [30, 17.9060, -62.8460, 400], [150, 17.95, -62.90, 1900]] };
  assert.equal(originRaw(mergeTraces(null, recent), AP, 5000 + 160).code, 'SBH');
});
