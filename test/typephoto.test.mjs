import test from 'node:test';
import assert from 'node:assert/strict';
import { typeQuery, typeQueries, pickPage, creditFrom } from '../lib/typephoto.mjs';

test('the search uses maker + model, else the feed description', () => {
  assert.equal(typeQuery({ maker: 'Embraer', model: 'Phenom 300' }, 'X'), 'Embraer Phenom 300');
  assert.equal(typeQuery({}, 'CESSNA 560XL Citation XLS'), 'CESSNA 560XL Citation XLS');
  assert.equal(typeQuery({}, null), null);
  assert.equal(typeQuery({ maker: 'A<b>', model: 'x"y' }, null), 'A b x y');
});

test('the first search hit counts only if its title shares a word with the query', () => {
  const json = { query: { pages: { 5: { index: 1, title: 'Embraer Phenom 300', pageimage: 'Phenom.jpg', fullurl: 'https://en.wikipedia.org/wiki/Embraer_Phenom_300' } } } };
  assert.deepEqual(pickPage(json, 'Embraer Phenom 300'), { title: 'Embraer Phenom 300', file: 'Phenom.jpg', page: 'https://en.wikipedia.org/wiki/Embraer_Phenom_300' });
  assert.equal(pickPage(json, 'Robinson R44'), null);                                     // stray article
  const cj = { query: { pages: { 1: { index: 1, title: 'Cessna CitationJet/M2', pageimage: 'cj.jpg' } } } };
  assert.equal(pickPage(cj, 'Textron Aviation Citation CJ3').title, 'Cessna CitationJet/M2'); // Citation ~ CitationJet
  const co = (title) => ({ query: { pages: { 1: { index: 1, title, pageimage: 'x.jpg' } } } });
  assert.equal(pickPage(co('Cessna'), 'Cessna 208 Caravan'), null);                 // company article, maker-only match
  assert.equal(pickPage(co('Pilatus Aircraft'), 'Pilatus PC-12'), null);
  assert.equal(pickPage(co('300 (film)'), 'Phenom 300', 'Embraer'), null);          // model-only search: all model words count
  assert.equal(pickPage(co('Embraer Phenom 300'), 'Phenom 300', 'Embraer').title, 'Embraer Phenom 300');
  assert.equal(pickPage(co('Aérospatiale Alouette III'), 'Aerospatiale Alouette III').title, 'Aérospatiale Alouette III');
  assert.equal(pickPage(co('Hawker 800'), 'HAWKER 800XP').title, 'Hawker 800');
  assert.equal(pickPage(co('Honda HA-420 HondaJet'), 'HondaJet').title, 'Honda HA-420 HondaJet');
  assert.equal(pickPage({ query: { pages: { 1: { index: 1, title: 'Embraer Phenom 300' } } } }, 'Embraer Phenom 300'), null); // no image
  assert.equal(pickPage(null, 'x'), null);
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
