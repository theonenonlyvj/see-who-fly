// Builds the /tv copy of the page for old smart-TV browsers (2018 Samsung Tizen 4 = Chromium 56).
// The main page is written in modern JavaScript; esbuild lowers it to what Chromium 56 can parse.
// Output (public/tv/*.js, public/tv.html) is committed, so running see-who-fly needs no build step.
// Run after changing any public/*.js or page:  npm run build:tv
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tvHeader, tvPage, TV_SOURCES, TV_PAGES } from './tv-common.mjs';

for (const f of TV_SOURCES) {
  const out = execFileSync('npx', ['--yes', 'esbuild@0.28.2', `public/${f}`, '--target=chrome56', '--log-level=error'], { encoding: 'utf8' });
  fs.writeFileSync(`public/tv/${f}`, tvHeader(f) + out);
}
for (const [src, out] of TV_PAGES) fs.writeFileSync(`public/${out}`, tvPage(src));
console.log('built public/tv/', TV_SOURCES.join(', '), '+', TV_PAGES.map((p) => p[1]).join(', '));
