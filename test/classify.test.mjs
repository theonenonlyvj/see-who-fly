import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, CLASSES } from '../lib/classify.mjs';
import { typeFacts } from '../lib/typefacts.mjs';
import { inferEndpoint } from '../lib/infer.mjs';

test('categories: military, airline, cargo, private plus, private, helicopter', () => {
  assert.equal(classify({ callsign: 'FAMUS18', type: 'C17', mil: true }), 'military');
  assert.equal(classify({ callsign: 'SWA16', type: 'B38M' }), 'airline');
  assert.equal(classify({ callsign: 'UAL1234', type: 'A320' }), 'airline');
  assert.equal(classify({ callsign: 'JSX123', type: 'E145' }), 'airline');
  assert.equal(classify({ callsign: 'FDX1201', type: 'B763' }), 'cargo');
  assert.equal(classify({ callsign: 'EJA265', type: 'CL60' }), 'privateplus');   // NetJets
  assert.equal(classify({ callsign: 'LXJ513', type: 'CL35' }), 'privateplus');   // Flexjet
  assert.equal(classify({ callsign: 'KFB396', type: 'GLF4' }), 'privateplus');   // an operator code on a bizjet
  assert.equal(classify({ callsign: 'N82AB', type: 'C172' }), 'private');
  assert.equal(classify({ callsign: '', type: 'PA24' }), 'private');
  assert.equal(classify({ callsign: 'N911Q', type: 'EC35', category: 'A7' }), 'heli');
  assert.equal(classify({ callsign: 'N650GA', type: 'GLF6' }), 'privateplus'); // business jet on its own tail number
  assert.equal(classify({ callsign: 'KAL17', type: 'B77W' }), 'airline');       // Korean Air passenger, not cargo
  assert.equal(classify({ callsign: 'WIA531', type: 'DHC6' }), 'airline');      // commuter airline
  assert.equal(classify({ callsign: 'ENY3473', type: 'E75L' }), 'airline');     // regional
  assert.equal(classify({ callsign: 'BAE1', type: 'B463' }), 'airline');        // BAe 146 is not a helicopter
  assert.equal(classify({ callsign: 'DLH1', type: 'A19N' }), 'airline');        // A319neo is not a helicopter
  assert.equal(classify({ callsign: 'N1234', type: 'B350' }), 'private');       // King Air on a tail number
  assert.equal(classify({ callsign: 'N1234', type: 'R44' }), 'heli');
  assert.equal(CLASSES.length, 6);
});

test('type facts: engines and a size comparison, or null for unknown types', () => {
  const c17 = typeFacts('C17');
  assert.match(c17.engines, /4/);
  assert.ok(c17.span > 50);
  assert.match(c17.compare, /1\.8 basketball courts/);
  assert.ok(typeFacts('B38M').engines);
  assert.equal(typeFacts('ZZZZ'), null);
  assert.equal(typeFacts('PA24'), null); // no reliable wingspan on file: say nothing rather than guess
});

const airports = [{ iata: 'SXM', name: 'St. Maarten', x: 1000, y: 0 }];

test('a plane descending toward a nearby airport is landing there', () => {
  const e = inferEndpoint({ x: -5000, y: 200, altFt: 1200, vrate: -700, track: 88 }, airports, 0);
  assert.deepEqual(e, { kind: 'landing', airport: { iata: 'SXM', name: 'St. Maarten' } });
});

test('a plane climbing away from a nearby airport is departing it', () => {
  const e = inferEndpoint({ x: 6000, y: 300, altFt: 2500, vrate: 1800, track: 92 }, airports, 0);
  assert.equal(e.kind, 'departing'); assert.equal(e.airport.iata, 'SXM');
});

test('descending but pointed away, or high, is not inferred', () => {
  assert.equal(inferEndpoint({ x: -5000, y: 200, altFt: 1200, vrate: -700, track: 270 }, airports, 0), null);
  assert.equal(inferEndpoint({ x: -5000, y: 200, altFt: 15000, vrate: -700, track: 88 }, airports, 0), null);
});

test('a plane far too high or too low for its distance is not "landing" (glide-angle check)', () => {
  assert.equal(inferEndpoint({ x: -20000, y: 0, altFt: 900, vrate: -700, track: 90 }, airports, 0), null);  // ~0.8 deg: too flat
  assert.equal(inferEndpoint({ x: -2000, y: 0, altFt: 3900, vrate: -700, track: 90 }, airports, 0), null); // ~22 deg: too steep
});
