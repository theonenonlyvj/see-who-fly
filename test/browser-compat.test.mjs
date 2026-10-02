import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The living-room TV this was built for is a 2018 Samsung (Tizen 4, ~Chromium 56). Its parser
// rejects these, and one syntax error blanks the whole page. Keep the browser code free of them.
test('browser code avoids syntax newer than Chromium 56', () => {
  for (const f of ['public/app.js', 'public/look.js', 'public/marks.js']) {
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
