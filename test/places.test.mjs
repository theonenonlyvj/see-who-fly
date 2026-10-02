import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFrame } from '../lib/geo.mjs';
import { placesInView, loadPlaces } from '../lib/places.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

test('placesInView keeps only points inside the plotted radius, as relative x/y', () => {
  const f = makeFrame(18.0407, -63.1191);
  const out = placesInView([{ name: 'Near', lat: 18.0410, lon: -63.1089 }, { name: 'Far', lat: 18.2000, lon: -63.0500 }], f, 11112);
  assert.deepEqual(out.map((p) => p.name), ['Near']);
  assert.equal(out[0].lat, undefined);
  assert.ok(typeof out[0].x === 'number');
});

test('loadPlaces reads a private file and tolerates a missing one', () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'swf-')), 'places.json');
  fs.writeFileSync(p, JSON.stringify([{ name: 'X', lat: 1, lon: 2 }]));
  assert.equal(loadPlaces(p).length, 1);
  assert.deepEqual(loadPlaces('/nonexistent/places.json'), []);
  assert.deepEqual(loadPlaces(undefined), []);
});
