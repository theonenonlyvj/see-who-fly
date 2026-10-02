import test from 'node:test';
import assert from 'node:assert/strict';
import { PassTracker, summarize } from '../lib/passlog.mjs';

const ac = (o) => ({ hex: 'abc', callsign: 'RCH999', type: 'C17', reg: '00-0000', mil: true, onGround: false, altFt: 700, ...o });

test('a sparse track straight over the house is logged as one overhead pass with interpolated closest approach', () => {
  const t = new PassTracker({ logWithinM: 805, closeAfterS: 30 });
  let out = [];
  out.push(...t.update([ac({ x: 10, y: -600 })], 0));
  out.push(...t.update([ac({ x: 10, y: -150 })], 5000));
  out.push(...t.update([ac({ x: 10, y: 300, altFt: 650 })], 10000));   // passed between samples
  out.push(...t.update([ac({ x: 10, y: 3000 })], 45000));
  out.push(...t.update([], 90000));
  assert.equal(out.length, 1);
  const p = out[0];
  assert.equal(p.overhead, true);
  assert.ok(p.cpaM <= 11);
  assert.equal(p.callsign, 'RCH999');
  assert.equal(p.mil, true);
  assert.ok(p.track.length >= 3);
});

test('a distant aircraft is never logged; ground traffic is ignored', () => {
  const t = new PassTracker({ logWithinM: 805, closeAfterS: 30 });
  let out = [];
  out.push(...t.update([ac({ x: 5000, y: -600 }), ac({ hex: 'g', onGround: true, x: 0, y: 0 })], 0));
  out.push(...t.update([ac({ x: 5000, y: 600 })], 5000));
  out.push(...t.update([], 60000));
  assert.equal(out.length, 0);
});

test('summarize: overhead count, lowest pass, type mix, military count', () => {
  const s = summarize([
    { overhead: true, altFt: 1500, type: 'B38M', callsign: 'SWA1', mil: false, at: 1 },
    { overhead: true, altFt: 700, type: 'C17', callsign: 'RCH999', mil: true, at: 2 },
    { overhead: false, altFt: 400, type: 'C56X', callsign: 'X', mil: false, at: 3 },
  ]);
  assert.equal(s.overheadCount, 2);
  assert.equal(s.nearCount, 1);
  assert.equal(s.lowest.callsign, 'RCH999');
  assert.deepEqual(s.types, { B38M: 1, C17: 1 });
  assert.equal(s.milCount, 1);
});

test('passes carry apparent size + tier; a big jet beyond the log radius is still logged if it looked big', () => {
  const t = new PassTracker({ logWithinM: 805, closeAfterS: 30, groundFt: 500, lookupDeg: 2, headsDeg: 0.8 });
  const c17 = (o) => ({ hex: 'c17', callsign: 'RCH1', type: 'C17', mil: true, onGround: false, altFt: 2200, ...o });
  let out = [];
  out.push(...t.update([c17({ x: 1300, y: -2000 })], 0));
  out.push(...t.update([c17({ x: 1300, y: 0 })], 12000));
  out.push(...t.update([c17({ x: 1300, y: 2000 })], 24000));
  out.push(...t.update([], 90000));
  assert.equal(out.length, 1);
  assert.equal(out[0].tier, 'lookup');
  assert.ok(out[0].peakDeg >= 2);
  assert.ok(out[0].slantM > 1300);
});

test('one straight heavy-jet pass is logged exactly once (no second "heads" pass while it recedes)', () => {
  const t = new PassTracker({ logWithinM: 805, closeAfterS: 30, groundFt: 500, lookupDeg: 2, headsDeg: 0.8 });
  const out = [];
  for (let i = 0; i <= 60; i++) {
    const y = -6000 + i * 5 * 82; // ~160 kt, sampled every 5 s
    out.push(...t.update([{ hex: 'c17', callsign: 'RCH1', type: 'C17', onGround: false, altFt: 2200, x: 600, y }], i * 5000));
  }
  out.push(...t.update([], 61 * 5000 + 60000));
  assert.equal(out.length, 1);
  assert.equal(out[0].tier, 'lookup');
});

test('PassLog.read skips a corrupt line instead of dropping the whole day', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const { PassLog } = await import('../lib/passlog.mjs');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'swf-'));
  fs.writeFileSync(path.join(d, 'passes-2026-01-01.jsonl'), '{"a":1}\n{broken\n{"a":2}\n');
  const log = new PassLog(d, () => '2026-01-01');
  assert.equal(log.read('2026-01-01').length, 2);
});

test('summarize re-classifies logged passes so rule fixes count today; a logged helicopter stands', () => {
  const s = summarize([
    { hex: 'a', callsign: 'EPI251', type: 'C172', cls: 'airline', overhead: false, at: 1 },
    { hex: 'b', callsign: 'N911Q', type: 'EC35', cls: 'heli', overhead: false, at: 2 },
  ]);
  assert.equal(s.byClass.private.all, 1);
  assert.equal(s.byClass.airline.all, 0);
  assert.equal(s.byClass.heli.all, 1);
});
