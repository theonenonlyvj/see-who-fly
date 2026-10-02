import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMark, latestMarks } from '../lib/marks.mjs';

test('a mark is spot + independent heard/seen, each yes/no/unmarked', () => {
  const m = parseMark({ hex: 'abc123', callsign: 'SWA1', spot: 'front', heard: true, seen: null }, 1000);
  assert.deepEqual({ ...m, at: undefined }, { hex: 'abc123', callsign: 'SWA1', spot: 'front', heard: true, seen: null, at: undefined });
  assert.equal(parseMark({ hex: 'abc123', spot: 'desk', seen: false }, 1).seen, false); // tried, couldn't see
  assert.equal(parseMark({ hex: 'abc123', spot: 'desk' }, 1).heard, null);            // unmarked != not heard
});

test('bad marks are rejected', () => {
  assert.equal(parseMark({ hex: 'abc', spot: 'roof', heard: true }, 1), null);
  assert.equal(parseMark({ spot: 'desk', heard: true }, 1), null);
  assert.equal(parseMark({ hex: 'x;rm', spot: 'desk', heard: true }, 1), null);
  assert.equal(parseMark({ hex: 'abc123', spot: 'desk', heard: 'maybe' }, 1), null);
});

test('latest mark per aircraft+spot wins', () => {
  const l = latestMarks([
    { hex: 'a', spot: 'front', heard: true, seen: null, at: 1 },
    { hex: 'a', spot: 'front', heard: true, seen: false, at: 2 },
    { hex: 'a', spot: 'desk', heard: true, seen: null, at: 3 },
  ]);
  assert.equal(l.get('a').front.seen, false);
  assert.equal(l.get('a').desk.heard, true);
});
