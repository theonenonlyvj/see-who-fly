// Builds the /tv copy of the page for old smart-TV browsers (2018 Samsung Tizen 4 = Chromium 56).
// The main page is written in modern JavaScript; esbuild lowers it to what Chromium 56 can parse.
// Output (public/tv/*.js, public/tv.html) is committed, so running see-who-fly needs no build step.
// Run after changing public/{app,marks,look}.js or public/{index,look}.html:  npm run build:tv
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tvHeader, tvHtml, tvLookHtml, TV_SOURCES } from './tv-common.mjs';

for (const f of TV_SOURCES) {
  const out = execFileSync('npx', ['--yes', 'esbuild@0.28.2', `public/${f}`, '--target=chrome56', '--log-level=error'], { encoding: 'utf8' });
  fs.writeFileSync(`public/tv/${f}`, tvHeader(f) + out);
}
fs.writeFileSync('public/tv.html', tvHtml());
fs.writeFileSync('public/tv-look.html', tvLookHtml());
console.log('built public/tv/', TV_SOURCES.join(', '), '+ public/tv.html, public/tv-look.html');
