import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/view.js', 'utf8'), ctx);
const SWF = ctx.window.SWF;

test('house view: the front direction points up, compass words still available', () => {
  const r = SWF.rotate({ x: Math.sin(30 * Math.PI / 180), y: Math.cos(30 * Math.PI / 180) }, 30); // a point straight out the front
  assert.ok(Math.abs(r.x) < 1e-9 && Math.abs(r.y - 1) < 1e-9);
  assert.deepEqual(SWF.rotate({ x: 1, y: 2 }, 0), { x: 1, y: 2 });
  assert.equal(SWF.relDir(30, 30), 'front');
  assert.equal(SWF.relDir(120, 30), 'right');
  assert.equal(SWF.relDir(210, 30), 'back');
  assert.equal(SWF.relDir(350, 30), 'front-left');
  assert.equal(SWF.compass(359), 'N');
  const S = { settings: { view: 'house' }, config: { upDeg: 30 } };
  assert.equal(SWF.where(S, 350), 'front-left');
  assert.equal(SWF.where({ settings: { view: 'north' }, config: { upDeg: 30 } }, 1), 'N');
  assert.equal(SWF.upDeg({ settings: { view: 'house' }, config: {} }), 0); // no house direction configured: true north
});

const P = (o) => Object.assign({ onGround: false, tier: 'lookup', etaS: null, sinceLookupS: null, overheadNow: false, distM: 1000 }, o);

test('widget: a plane is "now" from 15 s before to 10 s after; two at once, closer wins, approaching favoured', () => {
  assert.equal(SWF.pickWidget([P({ hex: 'a', etaS: 14 })], 0).mode, 'now');
  assert.equal(SWF.pickWidget([P({ hex: 'a', etaS: 20 })], 0).mode, 'next');
  assert.equal(SWF.pickWidget([P({ hex: 'a', etaS: 20 })], 6).mode, 'now');            // 6 s since the fetch: 14 s left
  assert.equal(SWF.pickWidget([P({ hex: 'p', tier: null, sinceLookupS: 9 })], 0).mode, 'now');
  const two = SWF.pickWidget([P({ hex: 'gone', tier: null, sinceLookupS: 5, distM: 800 }), P({ hex: 'coming', etaS: 10, distM: 1000 })], 0);
  assert.equal(two.plane.hex, 'coming');                                                // 1000*0.7 < 800
  assert.equal(two.other.hex, 'gone');
  assert.equal(SWF.pickWidget([P({ hex: 'gone', tier: null, sinceLookupS: 5, distM: 500 }), P({ hex: 'coming', etaS: 10, distM: 1000 })], 0).plane.hex, 'gone');
});

test('widget: just-passed until 30 s unless the next is under 60 s; nothing coming: 90 s, then clear sky', () => {
  const passed = P({ hex: 'p', tier: null, sinceLookupS: 20 });
  assert.equal(SWF.pickWidget([passed, P({ hex: 'n', etaS: 120 })], 0).mode, 'passed');
  assert.equal(SWF.pickWidget([passed, P({ hex: 'n', etaS: 50 })], 0).plane.hex, 'n');
  const later = P({ hex: 'p', tier: null, sinceLookupS: 40 });
  const r = SWF.pickWidget([later, P({ hex: 'n', etaS: 120 })], 0);
  assert.equal(r.mode, 'next'); assert.equal(r.passed.hex, 'p');                      // footer: just passed
  assert.equal(SWF.pickWidget([later], 0).mode, 'passed');
  assert.equal(SWF.pickWidget([P({ hex: 'p', tier: null, sinceLookupS: 89 })], 0).mode, 'passed');
  assert.equal(SWF.pickWidget([P({ hex: 'p', tier: null, sinceLookupS: 91 })], 0).mode, 'clear');
  assert.equal(SWF.pickWidget([], 0).mode, 'clear');
  assert.equal(SWF.pickWidget([P({ hex: 'h', tier: 'heads', etaS: 30 })], 0).mode, 'clear'); // small ones don't count
  assert.equal(SWF.pickWidget([P({ hex: 's', tier: null, sinceLookupS: null })], 0).mode, 'clear'); // a small pass has no sinceLookupS
});

test('widget: two in the window, an overhead-now plane is not "approaching"', () => {
  const r = SWF.pickWidget([P({ hex: 'leaving', overheadNow: true, distM: 800 }), P({ hex: 'coming', etaS: 10, distM: 1000 })], 0);
  assert.equal(r.plane.hex, 'coming');                    // 1000*0.7 < 800: approach bias goes to the one not yet overhead
  const r2 = SWF.pickWidget([P({ hex: 'leaving', overheadNow: true, distM: 600 }), P({ hex: 'coming', etaS: 10, distM: 1000 })], 0);
  assert.equal(r2.plane.hex, 'leaving');
});
