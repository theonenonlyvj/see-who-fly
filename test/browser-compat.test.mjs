import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { tvHeader, tvHtml, tvLookHtml, TV_SOURCES } from '../scripts/tv-common.mjs';

// The living-room TV this was built for is a 2018 Samsung (Tizen 4, ~Chromium 56). Its parser
// rejects these, and one syntax error blanks the whole page. The main page is modern JavaScript;
// /tv (and / for old browsers) serves the esbuild-lowered copy in public/tv/, checked here.
test('the /tv build avoids syntax newer than Chromium 56', () => {
  for (const f of TV_SOURCES.map((n) => `public/tv/${n}`)) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\?\.(?!\d)/, `${f}: optional chaining`);
    assert.doesNotMatch(src, /\?\?/, `${f}: nullish coalescing`);
    assert.doesNotMatch(src, /\{\s*\.\.\.|,\s*\.\.\.\w+\s*\}/, `${f}: object spread`);
    assert.doesNotMatch(src, /catch\s*\{/, `${f}: catch without a binding (Chromium 66)`);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{6}['"]\s*\+\s*['"][0-9a-fA-F]{2}|col \+ '[0-9a-fA-F]{2}'/, `${f}: 8-digit hex colour (Chromium 62)`);
  }
});

test('stylesheets avoid 8-digit hex colours (Chromium 62)', () => {
  for (const f of ['public/style.css', 'public/look.css']) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /#[0-9a-fA-F]{8}\b/, f);
  }
});

test('the /tv build is up to date with its source (run npm run build:tv)', () => {
  for (const f of TV_SOURCES) {
    assert.equal(fs.readFileSync(`public/tv/${f}`, 'utf8').split('\n')[0] + '\n', tvHeader(f), `public/tv/${f} is stale`);
  }
  assert.equal(fs.readFileSync('public/tv.html', 'utf8'), tvHtml(), 'public/tv.html is stale');
  assert.equal(fs.readFileSync('public/tv-look.html', 'utf8'), tvLookHtml(), 'public/tv-look.html is stale');
  // The TV pages must load only the lowered scripts (a changed <script> tag would slip past the rewrite).
  for (const [f, want] of [['public/tv.html', ['/tv/marks.js', '/tv/app.js']], ['public/tv-look.html', ['/tv/marks.js', '/tv/look.js']]]) {
    const srcs = [...fs.readFileSync(f, 'utf8').matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(srcs, want, f);
  }
});

// esbuild lowers syntax but adds no missing built-ins: keep these (newer than Chromium 56) out of the TV build.
test('the /tv build avoids built-ins newer than Chromium 56', () => {
  for (const f of TV_SOURCES.map((n) => `public/tv/${n}`)) {
    const src = fs.readFileSync(f, 'utf8');
    for (const [re, what] of [[/\.padStart\(|\.padEnd\(/, 'padStart/padEnd (57)'], [/\.finally\(/, 'Promise.finally (63)'],
      [/\.flat\(|\.flatMap\(/, 'flat/flatMap (69)'], [/Object\.fromEntries/, 'Object.fromEntries (73)'], [/\.matchAll\(/, 'matchAll (73)'],
      [/\.replaceAll\(/, 'replaceAll (85)'], [/\.at\(-?\d/, '.at() (92)'], [/structuredClone|queueMicrotask|globalThis/, 'newer globals'],
      [/AbortSignal\.timeout|AbortController/, 'AbortController (66)'], [/\.toSorted\(|\.findLast\(/, 'array methods (97+)']]) {
      assert.doesNotMatch(src, re, `${f}: ${what}`);
    }
  }
});

// VJ 2026-10-02: the type-breakdown emoji looked dumb. Keep the counter text-only.
test('the type counter has no emoji (main page and TV build)', () => {
  for (const f of ['public/app.js', 'public/tv/app.js']) {
    const src = fs.readFileSync(f, 'utf8');
    const block = src.slice(src.indexOf('CLS = '), src.indexOf('s-types'));
    assert.ok(block.length > 0, f);
    assert.doesNotMatch(block.replace(/\u2708\uFE0E/g, ''), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/u, f);
  }
});

// VJ 2026-10-02: photos of common airliners are negative value; the page hides them by the server flag.
test('the photo gate uses the server commonAirliner flag (main page and TV build)', () => {
  for (const f of ['public/app.js', 'public/tv/app.js']) assert.match(fs.readFileSync(f, 'utf8'), /!a\.commonAirliner/, f);
});
