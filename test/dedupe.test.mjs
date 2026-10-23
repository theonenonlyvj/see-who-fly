import test from 'node:test';
import assert from 'node:assert/strict';
import { GhostFilter } from '../lib/dedupe.mjs';

// Numbers from VJ's 2026-10-02 screenshot: the real jet at ~900 ft, its copy reading ~0 ft.
const real = { hex: 'a75eb4', callsign: 'EJA574', x: 0, y: 0, altFt: 910, gs: 120, track: 310 };
const ghost = { hex: '~281176', callsign: '', x: 250, y: -150, altFt: 20, gs: 118, track: 314 };

test('a copy that moves with a real plane is dropped, even with a junk altitude', () => {
  assert.deepEqual(new GhostFilter().apply([real, ghost], 0).map((a) => a.hex), ['a75eb4']);
});

test('a "~" plane moving on its own stays: a helicopter next to a jet, a lone one, near a jet on the ground', () => {
  const heli = { hex: '~aaaaaa', x: 300, y: 0, altFt: 900, gs: 90, track: 200 };
  const lone = { hex: '~bbbbbb', x: 9000, y: 9000, altFt: 3000, gs: 100, track: 10 };
  const parked = { hex: 'c0ffee', x: 0, y: 0, altFt: 0, onGround: true, gs: 10, track: 90 };
  const low = { hex: '~cccccc', x: 200, y: 0, altFt: 500, gs: 90, track: 270 };
  assert.deepEqual(new GhostFilter().apply([real, heli, lone, parked, low], 0).map((a) => a.hex), ['a75eb4', '~aaaaaa', '~bbbbbb', 'c0ffee', '~cccccc']);
});

test('two real planes in formation both stay', () => {
  const wing = { hex: 'a11111', x: 300, y: 0, altFt: 900, gs: 120, track: 310 };
  assert.equal(new GhostFilter().apply([real, wing], 0).length, 2);
});

test('once matched, a lagging copy that drifts out of range stays hidden for a minute', () => {
  const f = new GhostFilter();
  f.apply([real, ghost], 0);
  const drifted = { ...ghost, x: 2500, y: -1500 };
  assert.deepEqual(f.apply([real, drifted], 5_000).map((a) => a.hex), ['a75eb4']);
  assert.deepEqual(f.apply([real, drifted], 55_000).map((a) => a.hex), ['a75eb4']);
  assert.deepEqual(f.apply([real, drifted], 116_000).map((a) => a.hex), ['a75eb4', '~281176']); // 61 s after the last match
});

test('a real non-ADS-B plane on the same path but at its own altitude stays; no data to compare: stays', () => {
  const above = { hex: '~dddddd', x: 600, y: -300, altFt: 2400, gs: 115, track: 312 };   // a Cessna 1,500 ft above on the same final
  assert.deepEqual(new GhostFilter().apply([real, above], 0).map((a) => a.hex), ['a75eb4', '~dddddd']);
  const bare = { hex: '~eeeeee', x: 100, y: 0, altFt: null, gs: null, track: null };
  assert.equal(new GhostFilter().apply([real, bare], 0).length, 2);
  const junkNoMotion = { hex: '~ffffff', x: 200, y: 100, altFt: 0, gs: null, track: null };  // junk altitude, right on top
  assert.equal(new GhostFilter().apply([real, junkNoMotion], 0).length, 1);
});

test('a "~" track parked at one spot never alarms; a moving one does after it moves', () => {
  const f = new GhostFilter();
  // Shape of the 10-21 home case: ~600 m out at 1,625 ft, jittering a few metres for 20 s.
  const parked = (t, dx) => ({ hex: '~abcdef', x: -314 + dx, y: 522, altFt: 1625, gs: null, track: null, mystery: true, tier: 'lookup', overheadNow: true, etaS: 0, nowDeg: 2.05, peakDeg: 2.05 });
  for (const [t, dx] of [[0, 0], [2000, 2], [10000, 30], [36000, 37]]) {
    const [a] = f.apply([parked(t, dx)], t);
    assert.equal(a.still, true); assert.equal(a.mystery, false); assert.equal(a.tier, null); assert.equal(a.overheadNow, false); assert.equal(a.nowDeg, null);
  }
  const plane = (x) => ({ hex: '~123456', x, y: 0, altFt: 3000, gs: 120, track: 90, mystery: true, tier: 'lookup', overheadNow: true, nowDeg: 2 });
  assert.equal(f.apply([plane(-1000)], 0)[0].still, true);           // first sighting: not yet proven
  const [moved] = f.apply([plane(-940)], 2000);                       // 60 m: still not
  assert.equal(moved.still, true);
  const [proven] = f.apply([plane(-760)], 4000);                      // 240 m from first sight
  assert.equal(proven.still, undefined); assert.equal(proven.mystery, true); assert.equal(proven.tier, 'lookup');
  assert.equal(f.apply([plane(-760)], 6000)[0].still, undefined);     // once proven, a pause doesn't re-hide it
});

test('real ADS-B planes are never held back by the movement check', () => {
  const [a] = new GhostFilter().apply([{ ...real, tier: 'lookup', overheadNow: true }], 0);
  assert.equal(a.still, undefined); assert.equal(a.tier, 'lookup');
});
