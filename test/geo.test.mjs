import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFrame, boxWindow, segmentClosest } from '../lib/geo.mjs';

test('toLocal: home is origin; north is +y, east is +x', () => {
  const f = makeFrame(18.04, -63.12);
  const o = f.toLocal(18.04, -63.12);
  assert.ok(Math.abs(o.x) < 1e-6 && Math.abs(o.y) < 1e-6);
  assert.ok(f.toLocal(18.05, -63.12).y > 1000);
  assert.ok(f.toLocal(18.04, -63.11).x > 900);
});

test('boxWindow: head-on track enters at the right time', () => {
  // 1000 m south, flying north at 100 m/s, box half-side 80 m -> enters at 9.2 s
  const w = boxWindow({ x: 0, y: -1000 }, { x: 0, y: 100 }, 80);
  assert.ok(Math.abs(w.tIn - 9.2) < 1e-9);
  assert.ok(Math.abs(w.tOut - 10.8) < 1e-9);
});

test('boxWindow: miss and moving-away return null', () => {
  assert.equal(boxWindow({ x: 500, y: -1000 }, { x: 0, y: 100 }, 80), null);
  assert.equal(boxWindow({ x: 0, y: 1000 }, { x: 0, y: 100 }, 80), null);
});

test('segmentClosest: finds the overhead point between two sparse samples', () => {
  // samples 300 m either side of home on a straight line 20 m east of it
  const c = segmentClosest({ x: 20, y: -300 }, { x: 20, y: 300 });
  assert.ok(Math.abs(c.m - 20) < 1e-9);
  assert.ok(Math.abs(c.f - 0.5) < 1e-9);
});
