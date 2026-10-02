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
  assert.deepEqual(creditFrom(json), { thumb: 'https://upload.wikimedia.org/a.jpg', artist: 'A. Photographer', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:a.jpg' });
  assert.equal(creditFrom({ query: { pages: { 1: { imageinfo: [{}] } } } }), null);
  const named = (artist, extra = {}) => creditFrom({ query: { pages: { 1: { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/b.jpg', descriptionurl: 'https://evil.example/x', extmetadata: { Artist: { value: artist }, LicenseShortName: { value: 'CC BY-SA 3.0 & GFDL' }, ...extra } }] } } } });
  assert.equal(named('Aktuğ Ateş').artist, 'Aktuğ Ateş');                         // accents kept
  assert.equal(named('Aktuğ Ateş').license, 'CC BY-SA 3.0 & GFDL');
  assert.equal(named('Aktuğ Ateş').source, null);                                 // only Commons/Wikipedia file pages
  assert.equal(named('x', { Attribution: { value: 'Photo: Jane Doe / Airliners' } }).artist, 'Jane Doe / Airliners');
  assert.equal(named(''), null);                                                    // can't credit it: don't show it
  assert.equal(named('<script>alert(1)</script>').artist, 'alert(1)');             // tags stripped (and set as text anyway)
});

test('fallback searches: maker + model, the model alone, then the description, without repeats', () => {
  assert.deepEqual(typeQueries({ maker: 'Textron Aviation', model: 'Citation CJ3' }, 'CESSNA 525B Citation CJ3'), ['Textron Aviation Citation CJ3', 'Citation CJ3', 'CESSNA 525B Citation CJ3']);
  assert.deepEqual(typeQueries({}, 'HAWKER 800XP'), ['HAWKER 800XP']);
});
