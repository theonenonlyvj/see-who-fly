import test from 'node:test';
import assert from 'node:assert/strict';
import { typeQuery, typeQueries, pickPage, creditFrom } from '../lib/typephoto.mjs';

test('the search uses maker + model, else the feed description', () => {
  assert.equal(typeQuery({ maker: 'Embraer', model: 'Phenom 300' }, 'X'), 'Embraer Phenom 300');
  assert.equal(typeQuery({}, 'CESSNA 560XL Citation XLS'), 'CESSNA 560XL Citation XLS');
  assert.equal(typeQuery({}, null), null);
  assert.equal(typeQuery({ maker: 'A<b>', model: 'x"y' }, null), 'A b x y');
});

test('backup search: the first hit counts only if it is unmistakably the same type', () => {
  const json = { query: { pages: { 5: { index: 1, title: 'Embraer Phenom 300', pageimage: 'Phenom.jpg', fullurl: 'https://en.wikipedia.org/wiki/Embraer_Phenom_300' } } } };
  assert.deepEqual(pickPage(json, 'Embraer Phenom 300'), { title: 'Embraer Phenom 300', file: 'Phenom.jpg', page: 'https://en.wikipedia.org/wiki/Embraer_Phenom_300' });
  assert.equal(pickPage({ query: { pages: { 1: { index: 1, title: 'Embraer Phenom 300' } } } }, 'Embraer Phenom 300'), null); // no image
  assert.equal(pickPage(null, 'x'), null);
  const co = (title) => ({ query: { pages: { 1: { index: 1, title, pageimage: 'x.jpg' } } } });
  const ok = (title, q, maker) => assert.equal(pickPage(co(title), q, maker)?.title, title, `${q} -> ${title}`);
  const no = (title, q, maker) => assert.equal(pickPage(co(title), q, maker), null, `${q} must not accept ${title}`);
  // VJ 2026-10-02 19:40: N600FX, a Praetor 600 (registry Embraer / EMB-550), showed a Bandeirante.
  no('Embraer EMB 110 Bandeirante', 'Embraer EMB-550', 'Embraer');
  no('Embraer EMB 110 Bandeirante', 'EMBRAER EMB-550 Praetor 600');
  // 10-03 cache check: 'Boeing 737-8' took the groundings article (a photo of parked, grounded jets).
  no('Boeing 737 MAX groundings', 'Boeing 737-8', 'Boeing');
  no('Boeing 737 MAX groundings', 'Boeing 737-8');
  no('Boeing 737 MAX groundings', 'BOEING 737 MAX 8');
  // Company articles, siblings, stray pages.
  no('Cessna', 'Cessna 208 Caravan');
  no('Pilatus Aircraft', 'Pilatus PC-12');
  no('300 (film)', 'Phenom 300', 'Embraer');
  no('Robinson R44', 'Robinson R22');
  no('Pilatus PC-6 Porter', 'Pilatus PC-XII 45', 'Pilatus');
  no('Learjet 35', 'LEARJET 45');
  no('Dassault Falcon 900', 'DASSAULT Falcon 2000');
  no('Embraer Phenom 100', 'Embraer Phenom 300');
  no('Bombardier Challenger 600 series', 'Bombardier Challenger 300');
  no('Boeing C-135 Stratolifter', 'KC-135R', 'Boeing');
  no('Cessna Citation Sovereign', 'CESSNA 680A Citation Latitude');
  no('Cessna Citation M2', 'CESSNA 510 Citation Mustang');
  no('Dassault Falcon 7X', 'DASSAULT Falcon 8X');
  no('Cessna', 'CESSNA 172S Skyhawk', 'Textron Aviation');                  // registry and feed makers differ
  no('Cessna 182 Skylane', 'CESSNA 172S Skyhawk', 'Textron Aviation');
  no('De Havilland Canada Dash 8', 'DE HAVILLAND CANADA DHC-6 Twin Otter');
  no('Airbus Helicopters H160', 'AIRBUS HELICOPTERS H145');
  no('Douglas DC-10', 'MCDONNELL DOUGLAS MD-11');
  no('700 (number)', '700');
  // The same type, spelled as registries and feeds spell it.
  ok('Embraer Phenom 300', 'Embraer Phenom 300');
  ok('Robinson R44', 'R44 II', 'Robinson Helicopter');
  ok('Robinson R44', 'Robinson R44');
  ok('Pilatus PC-12', 'PC-12/47E', 'Pilatus');
  ok('Pilatus PC-12', 'PILATUS PC-12');
  ok('Eurocopter EC135', 'EC135 P2+', 'Airbus Helicopters');
  ok('Eurocopter EC135', 'EUROCOPTER EC-135');
  ok('De Havilland Canada DHC-6 Twin Otter', 'DHC-6-300', 'De Havilland');
  ok('Airbus A320 family', 'A320-214', 'Airbus');
  ok('Boeing 737 Next Generation', 'BOEING 737-800');
  ok('Boeing KC-135 Stratotanker', 'KC-135R', 'Boeing');
  ok('General Dynamics F-16 Fighting Falcon', 'F-16C', 'General Dynamics');
  ok('Boeing C-17 Globemaster III', 'C-17A', 'Boeing');
  ok('Gulfstream G650/G700/G800', 'GVI(G650ER)', 'Gulfstream Aerospace');
  ok('Piper PA-28 Cherokee', 'PA-28-181', 'Piper');
  ok('Bell 407', '407', 'Bell');
  ok('Cirrus SR22', 'SR22T', 'Cirrus');
  ok('Hawker 800', 'HAWKER 800XP');
  ok('Learjet 45', 'LEARJET 45');
  ok('Aérospatiale Alouette III', 'Aerospatiale Alouette III');
  ok('Honda HA-420 HondaJet', 'HondaJet');
  assert.equal(pickPage(co('Robinson R44'), ''), null);                       // odd input
  assert.equal(pickPage(co('Robinson R44'), '日本'), null);
  assert.equal(pickPage({ query: { pages: { 1: null, 2: { index: 1, title: 'Robinson R44', pageimage: 'x.jpg' } } } }, 'R44', 'Robinson').title, 'Robinson R44');
});

test('type codes go straight to their Wikipedia article', async () => {
  const { articleFor, TYPE_ARTICLES } = await import('../lib/typearticles.mjs');
  assert.equal(articleFor('E550'), 'Embraer Legacy 450/500 and Praetor 500/600');   // N600FX
  assert.equal(articleFor('e55p'), 'Embraer Phenom 300');
  assert.equal(articleFor('PC12'), 'Pilatus PC-12');
  assert.equal(articleFor('C56X'), 'Cessna Citation Excel');
  assert.equal(articleFor('ZZZZ'), null);
  assert.equal(articleFor(null), null);
  assert.equal(articleFor('constructor'), null);
  assert.ok(Object.keys(TYPE_ARTICLES).length > 250);
  for (const [k, v] of Object.entries(TYPE_ARTICLES)) { assert.match(k, /^[A-Z0-9]{2,4}$|^BBJ$|^ACJ$|^CORS$|^SPIT$|^LANC$|^EXTR$/); assert.ok(v.length > 3); }
});

test('credit: thumbnail, photographer and license, tags stripped', () => {
  const json = { query: { pages: { '-1': { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/a.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
    extmetadata: { Artist: { value: '<div class="fn">\nA. Photographer</div>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } };
  assert.deepEqual(creditFrom(json), { thumb: 'https://upload.wikimedia.org/a.jpg', artist: 'A. Photographer', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:a.jpg', file: 'a.jpg' });
  assert.equal(creditFrom({ query: { pages: { 1: { imageinfo: [{}] } } } }), null);
  const named = (artist, extra = {}) => creditFrom({ query: { pages: { 1: { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/b.jpg', descriptionurl: 'https://evil.example/x', extmetadata: { Artist: { value: artist }, LicenseShortName: { value: 'CC BY-SA 3.0 & GFDL' }, ...extra } }] } } } });
  assert.equal(named('Aktuğ Ateş').artist, 'Aktuğ Ateş');                         // accents kept
  assert.equal(named('Aktuğ Ateş').license, 'CC BY-SA 3.0 & GFDL');
  assert.equal(named('Aktuğ Ateş').source, null);                                 // only Commons/Wikipedia file pages
  assert.equal(named('x', { Attribution: { value: 'Photo: Jane Doe / Airliners' } }).artist, 'Jane Doe / Airliners');
  assert.equal(named(''), null);                                                    // no name, no source page, not public domain: don't show it
  assert.equal(named('<script>alert(1)</script>').artist, 'alert(1)');             // tags stripped (and set as text anyway)
});

test('no photographer we can read: shown only if public domain, or CC 4.0 with its file page to credit through', () => {
  const photo = (artist, license, descriptionurl) => creditFrom({ query: { pages: { 1: { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/c.jpg', descriptionurl,
    extmetadata: { Artist: { value: artist }, LicenseShortName: { value: license } } }] } } } });
  const commons = 'https://commons.wikimedia.org/wiki/File:Embraer_Phenom_300_%28N300E%29.jpg';
  assert.deepEqual(photo('', 'CC BY-SA 4.0', commons), { thumb: 'https://upload.wikimedia.org/c.jpg', artist: null, license: 'CC BY-SA 4.0', source: commons, file: 'Embraer Phenom 300 (N300E).jpg' });
  assert.equal(photo('', 'CC BY 4.0', commons).artist, null);
  assert.equal(photo('', 'CC BY-SA 3.0', commons), null);                               // 2.0/3.0 need the name
  assert.equal(photo('', 'CC BY 2.0', commons), null);
  assert.equal(photo('', 'CC BY-SA 4.0', 'https://evil.example/x'), null);              // no real file page
  assert.equal(photo('', 'Public domain', 'https://evil.example/x').artist, null);       // US Air Force photos and the like
  assert.equal(photo('', 'Public domain', 'https://evil.example/x').file, null);
  assert.equal(photo('', 'CC0', null).license, 'CC0');
  assert.equal(photo('', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:%E0%A4%A.jpg').file, 'E0A4A.jpg'); // bad encoding: no crash
});

test('fallback searches: maker + model, the model alone, then the description, without repeats', () => {
  assert.deepEqual(typeQueries({ maker: 'Textron Aviation', model: 'Citation CJ3' }, 'CESSNA 525B Citation CJ3'), ['Textron Aviation Citation CJ3', 'Citation CJ3', 'CESSNA 525B Citation CJ3']);
  assert.deepEqual(typeQueries({}, 'HAWKER 800XP'), ['HAWKER 800XP']);
});
