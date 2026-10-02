import test from 'node:test';
import assert from 'node:assert/strict';
import { OverheadHold } from '../lib/hold.mjs';

const plane = (hex, overheadNow) => ({ hex, overheadNow });

test('a plane stays "just passed" for the hold window after it stops looking big', () => {
  const h = new OverheadHold({ holdS: 90 });
  let list = h.apply([plane('a', true)], 0);
  assert.equal(list[0].justPassedS, null);
  list = h.apply([plane('a', false)], 10_000);
  assert.equal(list[0].justPassedS, 10);
  list = h.apply([plane('a', false)], 89_000);
  assert.equal(list[0].justPassedS, 89);
  list = h.apply([plane('a', false)], 91_000);
  assert.equal(list[0].justPassedS, null);
});

test('planes that never looked big are never "just passed"', () => {
  const h = new OverheadHold({ holdS: 90 });
  const list = h.apply([plane('b', false)], 5_000);
  assert.equal(list[0].justPassedS, null);
});

test('looking big again resets the hold; the window counts from the last big moment', () => {
  const h = new OverheadHold({ holdS: 60 });
  h.apply([plane('a', true)], 0);
  h.apply([plane('a', true)], 30_000);
  const list = h.apply([plane('a', false)], 80_000);
  assert.equal(list[0].justPassedS, 50);
});

test('a plane missing from one feed poll keeps its hold', () => {
  const h = new OverheadHold({ holdS: 90 });
  h.apply([plane('a', true)], 0);
  h.apply([], 5_000);
  const list = h.apply([plane('a', false)], 10_000);
  assert.equal(list[0].justPassedS, 10);
});

test('a held plane headed back toward a look-up is inbound again, not "just passed"', () => {
  const h = new OverheadHold({ holdS: 90 });
  h.apply([plane('a', true)], 0);
  const list = h.apply([{ hex: 'a', overheadNow: false, tier: 'lookup', etaS: 40 }], 30_000);
  assert.equal(list[0].justPassedS, null);
});

test('"Ns ago" is measured when state is served, not when the feed was polled', () => {
  const h = new OverheadHold({ holdS: 90 });
  const a = plane('a', true);
  h.track([a], 0);
  a.overheadNow = false;
  h.track([a], 2_000);
  assert.equal(h.annotate([a], 7_000)[0].justPassedS, 7);
  assert.equal(h.annotate([a], 95_000)[0].justPassedS, null);
});

test('a held plane coming back as a small heads-up is inbound too', () => {
  const h = new OverheadHold({ holdS: 90 });
  h.apply([plane('a', true)], 0);
  assert.equal(h.apply([{ hex: 'a', overheadNow: false, tier: 'heads', etaS: 25 }], 30_000)[0].justPassedS, null);
});
