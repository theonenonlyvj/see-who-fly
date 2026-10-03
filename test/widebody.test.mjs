import test from 'node:test';
import assert from 'node:assert/strict';
import { isWidebody, lookupDegFor, predictLook } from '../lib/visibility.mjs';
import { PassTracker } from '../lib/passlog.mjs';

test('widebody list: 777/787/A330/A350/747/A380 yes, 737/bizjet no', () => {
  for (const t of ['B77W', 'B772', 'B789', 'A333', 'A359', 'B748', 'A388']) assert.equal(isWidebody(t), true, t);
  for (const t of ['B738', 'C650', 'E75L', null]) assert.equal(isWidebody(t), false, String(t));
});

test('lookupDegFor: widebody line applies only when configured', () => {
  assert.equal(lookupDegFor('B77W', 0.8, 0.4), 0.4);
  assert.equal(lookupDegFor('B738', 0.8, 0.4), 0.8);
  assert.equal(lookupDegFor('B77W', 0.8, null), 0.8);
});

// A 777 ~8.2 km lateral at ~9,300 ft, 517 ft ground -> ~0.43 deg as B77W
const wb = { x: 8236, y: -3000, altFt: 9309, type: 'B77W', gs: 300, track: 0, vrate: 0 };
test('a 777 at 0.43 deg is lookup with the widebody line, heads without it', () => {
  const base = { groundFt: 517, lookupDeg: 0.8, headsDeg: 0.4, horizonS: 240 };
  assert.equal(predictLook(wb, base).tier, 'heads');
  assert.equal(predictLook(wb, { ...base, widebodyLookupDeg: 0.4 }).tier, 'lookup');
  assert.equal(predictLook({ ...wb, type: 'B738' }, { ...base, widebodyLookupDeg: 0.4 }).tier !== 'lookup', true);
});

test('pass log counts a widebody as overhead at the widebody line', () => {
  const mk = (w) => new PassTracker({ logWithinM: 3219, closeAfterS: 30, groundFt: 517, lookupDeg: 0.8, headsDeg: 0.4, widebodyLookupDeg: w });
  for (const [w, want] of [[null, false], [0.4, true]]) {
    const t = mk(w); const out = [];
    const a = (y) => ({ hex: 'abc123', callsign: 'TST777', type: 'B77W', mil: false, onGround: false, altFt: 9309, x: 8236, y });
    out.push(...t.update([a(-2000)], 0)); out.push(...t.update([a(0)], 5000)); out.push(...t.update([a(2000)], 10000));
    out.push(...t.update([], 60000));
    assert.equal(out.length, 1); assert.equal(out[0].overhead, want, String(w));
  }
});
