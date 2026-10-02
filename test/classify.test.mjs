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
  assert.equal(CLASSES.length, 6);
});

test('type facts: engines and a size comparison, or null for unknown types', () => {
  const c17 = typeFacts('C17');
  assert.match(c17.engines, /4/);
  assert.ok(c17.span > 50);
  assert.ok(typeFacts('B38M').engines);
  assert.equal(typeFacts('ZZZZ'), null);
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
