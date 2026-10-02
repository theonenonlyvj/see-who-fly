import test from 'node:test';
import assert from 'node:assert/strict';
import { wingspanM, apparentDeg, predictLook } from '../lib/visibility.mjs';

const opts = { groundFt: 500, lookupDeg: 2.0, headsDeg: 0.8, horizonS: 240 };

test('wingspan: known types, sensible default', () => {
  assert.ok(wingspanM('C17') > 50);
  assert.ok(wingspanM('B738') > 34 && wingspanM('B738') < 37);
  assert.ok(wingspanM('ZZZZ') > 10);
});

test('apparent size shrinks with distance', () => {
  assert.ok(apparentDeg(35.8, 762) > apparentDeg(35.8, 1500));
});

test('a GLF5 passing ~230 m off at ~600 ft AGL is a LOOK UP pass', () => {
  // 3 km south, flying north at 140 kt, offset 230 m east, 1100 ft MSL
  const p = predictLook({ x: 230, y: -3000, altFt: 1100, gs: 140, track: 0, vrate: 0, type: 'GLF5' }, opts);
  assert.equal(p.tier, 'lookup');
  assert.ok(p.etaS > 20 && p.etaS < 45);          // time until it looks big
  assert.ok(Math.abs(p.slantM - Math.hypot(230, 600 * 0.3048 * 1)) < 40);
});

test('a cruiser at 35,000 ft directly overhead is never a pass', () => {
  const p = predictLook({ x: 0, y: -5000, altFt: 35000, gs: 450, track: 0, vrate: 0, type: 'B738' }, opts);
  assert.equal(p.tier, null);
});

test('a C-17 at 1.4 km slant counts as LOOK UP because it is big', () => {
  const p = predictLook({ x: 1300, y: -4000, altFt: 2200, gs: 160, track: 0, vrate: 0, type: 'C17' }, opts);
  assert.equal(p.tier, 'lookup');
});

test('a 737 about 1.2 mi to the side at 3,000 ft is heads-up only', () => {
  const p = predictLook({ x: 2000, y: -4000, altFt: 3000, gs: 150, track: 0, vrate: 0, type: 'B738' }, opts);
  assert.equal(p.tier, 'heads');
});

test('moving away: no prediction', () => {
  const p = predictLook({ x: 0, y: 3000, altFt: 1500, gs: 150, track: 0, vrate: 0, type: 'B738' }, opts);
  assert.equal(p.tier, null);
});

test('overhead now = currently looks big', () => {
  const p = predictLook({ x: 20, y: -30, altFt: 1200, gs: 140, track: 0, vrate: -500, type: 'B738' }, opts);
  assert.equal(p.nowLookup, true);
  assert.equal(p.etaS, 0);
});

test('a plane that has already passed is not "next" (no heads-up at eta 0 while receding)', () => {
  const p = predictLook({ x: 0, y: 1500, altFt: 1500, gs: 150, track: 0, vrate: 0, type: 'B738' }, opts);
  assert.equal(p.tier, null);
});

test('an arrival about to land is not projected through the ground into a phantom low pass', () => {
  // 2 km out, 600 ft MSL (100 ft AGL), descending 700 fpm, heading for home 3 km beyond
  const p = predictLook({ x: 0, y: -5000, altFt: 800, gs: 140, track: 0, vrate: -700, type: 'B738' }, opts);
  assert.equal(p.tier, null);
});

test('look direction is where the plane will be when it looks big, not where it is now', () => {
  const p = predictLook({ x: 230, y: -3000, altFt: 1100, gs: 140, track: 0, vrate: 0, type: 'GLF5' }, opts);
  assert.ok(p.lookElev > 10);                       // now it is ~3° up; at eta it is much higher
  assert.ok(p.lookBearing > 90 && p.lookBearing < 270); // still to the south when it first looks big
});

test('unknown-type military traffic is assumed big', () => {
  const p = predictLook({ x: 1000, y: -4000, altFt: 2200, gs: 160, track: 0, vrate: 0, type: null, mil: true }, opts);
  assert.equal(p.tier, 'lookup');
});
