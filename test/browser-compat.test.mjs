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
  }
});
