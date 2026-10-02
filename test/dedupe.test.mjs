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
