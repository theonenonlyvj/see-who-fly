import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFrame } from '../lib/geo.mjs';
import { chainFromVrs, pickLeg } from '../lib/routes.mjs';

// A frame ~1 km from a regional airport (the Maho Beach example); the chain below is SJU-SXM-ANU.
const f = makeFrame(18.0407, -63.1191);
const vrs = { airport_codes: 'TJSJ-TNCM-TAPA', _airports: [
  { iata: 'SJU', location: 'San Juan', lat: 18.4394, lon: -66.0018 },
  { iata: 'SXM', location: 'St. Maarten', lat: 18.0410, lon: -63.1089 },
  { iata: 'ANU', location: 'Antigua', lat: 17.1367, lon: -61.7927 },
] };
const chain = chainFromVrs(vrs, f);

test('a multi-leg flight number descending near the middle airport gets the leg that ends there', () => {
  const leg = pickLeg(chain, { x: -3000, y: 500, altFt: 1200, vrate: -800, track: 90 });
  assert.equal(leg.from.iata, 'SJU'); assert.equal(leg.to.iata, 'SXM');
});

test('the same flight number climbing out of that airport gets the leg that starts there', () => {
  const leg = pickLeg(chain, { x: 6000, y: -2000, altFt: 4000, vrate: 2000, track: 125 });
  assert.equal(leg.from.iata, 'SXM'); assert.equal(leg.to.iata, 'ANU');
});

test('a plane whose track fits no leg gets no route at all (airline only)', () => {
  // flying due north at cruise: not along any leg's direction
  const leg = pickLeg(chain, { x: 0, y: 0, altFt: 36000, vrate: 0, track: 0 });
  assert.equal(leg, null);
});

test('a single-leg route that does not fit is rejected, not shown with a question mark', () => {
  const one = chainFromVrs({ _airports: [vrs._airports[0], vrs._airports[2]] }, f); // SJU-ANU
  const leg = pickLeg(one, { x: -3000, y: 500, altFt: 1200, vrate: -800, track: 300 });
  assert.equal(leg, null);
});

test('an overflight along a leg at cruise gets that leg', () => {
  const one = chainFromVrs({ _airports: [vrs._airports[0], vrs._airports[2]] }, f); // SJU-ANU
  const a = one[0], b = one[1];
  const mid = { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 };
  const brg = (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
  const leg = pickLeg(one, { ...mid, altFt: 37000, vrate: 0, track: brg });
  assert.equal(leg.to.iata, 'ANU');
});

test('no heading: never guess between legs', () => {
  assert.equal(pickLeg(chain, { x: 50000, y: 0, altFt: 36000, vrate: 0, track: null }), null);
});

test('landing at the FIRST airport of the chain (no leg ends there) shows no route, not the outbound leg', () => {
  const outbound = chainFromVrs({ _airports: [vrs._airports[1], vrs._airports[2]] }, f); // SXM-ANU
  assert.equal(pickLeg(outbound, { x: -3000, y: 500, altFt: 1200, vrate: -800, track: 110 }), null);
});

test('a low plane landing somewhere off the chain is not matched to a leg that merely points the same way', () => {
  const one = chainFromVrs({ _airports: [vrs._airports[0], vrs._airports[2]] }, f); // SJU-ANU passes ~55 km away
  assert.equal(pickLeg(one, { x: -3000, y: 500, altFt: 1200, vrate: -800, track: 107 }), null);
});

test('a chain that visits the same airport twice picks the occurrence that fits (A-B-A-C climbing out of A the second time)', () => {
  const ap = vrs._airports;
  const loop = chainFromVrs({ _airports: [ap[1], ap[0], ap[1], ap[2]] }, f); // SXM-SJU-SXM-ANU
  const out = pickLeg(loop, { x: 6000, y: -2000, altFt: 4000, vrate: 2000, track: 125 });
  assert.equal(out.from.iata, 'SXM'); assert.equal(out.to.iata, 'ANU');
  const back = pickLeg(loop, { x: -3000, y: 500, altFt: 1200, vrate: -800, track: 90 });
  assert.equal(back.from.iata, 'SJU'); assert.equal(back.to.iata, 'SXM');
});
