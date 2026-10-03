import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
import { DiskCache } from '../lib/diskcache.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'swf-cache-'));

test('an entry survives a new cache object (a restart) and is shared by two servers on one directory', () => {
  const dir = tmp();
  const a = new DiskCache(dir, 'info');
  a.set('a1b2c3', { v: { owner: 'X' }, at: 1000, ttl: 5000 });
  const b = new DiskCache(dir, 'info');
  assert.deepEqual(b.get('a1b2c3'), { v: { owner: 'X' }, at: 1000, ttl: 5000 });
  assert.equal(b.get('ffffff'), null);
  assert.equal(new DiskCache(dir, 'type').get('a1b2c3'), null);          // kinds don't mix
});

test('a "nothing found" result is kept too, so it is not searched again and again', () => {
  const c = new DiskCache(tmp(), 'type');
  c.set('Robinson R44', { v: null, at: 1, ttl: 2 });
  assert.deepEqual(c.get('Robinson R44'), { v: null, at: 1, ttl: 2 });
});

test('keys of any text become safe file names, and a corrupt or foreign file reads as a miss', () => {
  const dir = tmp(), c = new DiskCache(dir, 'route');
  c.set('../../etc/passwd', { v: 1, at: 1, ttl: 1 });
  assert.deepEqual(c.get('../../etc/passwd').v, 1);
  for (const f of fs.readdirSync(path.join(dir, 'route'))) assert.match(f, /^[0-9a-f]{20}\.json$/);
  const f = path.join(dir, 'route', fs.readdirSync(path.join(dir, 'route'))[0]);
  fs.writeFileSync(f, '{not json'); assert.equal(c.get('../../etc/passwd'), null);
  fs.writeFileSync(f, JSON.stringify({ key: 'other', v: 2, at: 1, ttl: 1 })); assert.equal(c.get('../../etc/passwd'), null); // hash collision guard
});

test('image bytes: kept for a max age, then treated as missing', () => {
  const c = new DiskCache(tmp(), 'img');
  const buf = Buffer.from([0xff, 0xd8, 1, 2, 3]);
  c.setBytes('N136M', buf);
  assert.deepEqual(c.getBytes('N136M', 60_000), buf);
  assert.equal(c.getBytes('N136M', 60_000, Date.now() + 120_000), null);
  assert.equal(c.getBytes('nope', 60_000), null);
});

test('prune removes files not rewritten within the max age', () => {
  const dir = tmp(), c = new DiskCache(dir, 'info');
  c.set('old', { v: 1, at: 1, ttl: 1 }); c.set('new', { v: 2, at: 1, ttl: 1 });
  const old = path.join(dir, 'info', fs.readdirSync(path.join(dir, 'info')).find((f) => JSON.parse(fs.readFileSync(path.join(dir, 'info', f))).key === 'old'));
  const past = (Date.now() - 90 * 86400_000) / 1000; fs.utimesSync(old, past, past);
  assert.equal(c.prune(60 * 86400_000), 1);
  assert.equal(c.get('old'), null); assert.equal(c.get('new').v, 2);
});

test('no directory: a do-nothing cache', () => {
  const c = new DiskCache(null, 'info');
  c.set('x', { v: 1, at: 1, ttl: 1 }); c.setBytes('x', Buffer.from('a'));
  assert.equal(c.get('x'), null); assert.equal(c.getBytes('x', 1), null); assert.equal(c.prune(1), 0);
});

test('a folder that cannot be made, or that vanishes, never throws', () => {
  const file = path.join(tmp(), 'not-a-dir'); fs.writeFileSync(file, 'x');
  const c = new DiskCache(file, 'info');                 // parent is a file: no cache, no crash
  c.set('x', { v: 1, at: 1, ttl: 1 }); assert.equal(c.get('x'), null);
  const dir = tmp(), d = new DiskCache(dir, 'info');
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(d.prune(1), 0); d.set('y', { v: 1, at: 1, ttl: 1 }); assert.equal(d.get('y'), null);
});

test('files are private to the server user', () => {
  const dir = tmp(), c = new DiskCache(dir, 'info');
  c.set('k', { v: 1, at: 1, ttl: 1 });
  assert.equal(fs.statSync(path.join(dir, 'info')).mode & 0o077, 0);
  for (const f of fs.readdirSync(path.join(dir, 'info'))) assert.equal(fs.statSync(path.join(dir, 'info', f)).mode & 0o077, 0);
});
