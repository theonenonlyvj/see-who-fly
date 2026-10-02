import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';

// Boots the real server with the example config and checks it answers. Catches startup crashes.
test('server starts and serves /api/state and the pages', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'swf-smoke-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, SEE_WHO_FLY_PORT: String(port), SEE_WHO_FLY_DATA_DIR: data, SEE_WHO_FLY_PLACES: 'places.example.json' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  try {
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try { ok = (await fetch(`http://127.0.0.1:${port}/api/state`)).status === 200; } catch {}
    }
    assert.ok(ok, `server did not come up: ${err}`);
    for (const p of ['/', '/tv', '/look']) assert.equal((await fetch(`http://127.0.0.1:${port}${p}`)).status, 200, p);
    assert.equal((await fetch(`http://127.0.0.1:${port}/photo/zzzzzz`)).status, 404);
    for (const [p, type] of [['/favicon.svg', 'image/svg+xml'], ['/favicon.ico', 'image/png'], ['/apple-touch-icon.png', 'image/png']]) {
      const r = await fetch(`http://127.0.0.1:${port}${p}`);
      assert.equal(r.status, 200, p); assert.equal(r.headers.get('content-type'), type, p);
    }
    for (const p of ['/', '/tv', '/look']) assert.match(await (await fetch(`http://127.0.0.1:${port}${p}`)).text(), /rel="icon" href="\/favicon\.svg"/, p);
  } finally { child.kill(); }
});
