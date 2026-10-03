// A photo of the plane's TYPE (from Wikipedia) when the plane itself has none: most business jets
// and private planes have no photo anywhere free, and the point of the screen is seeing what the
// unusual planes look like. Always labelled as a type photo, with the photographer and license.

const STOP = new Set(['the', 'and', 'inc', 'co', 'corp', 'aircraft', 'aviation', 'aerospace', 'company', 'industries', 'ltd', 'llc']);
const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t));

const tidy = (q) => { const c = String(q || '').replace(/[^A-Za-z0-9 .\/-]/g, ' ').replace(/\s+/g, ' ').trim(); return c.length >= 3 ? c.slice(0, 60) : null; };

// What to search for: the registry's maker + model ("Embraer Phenom 300"), else the feed's description.
export function typeQuery({ maker, model } = {}, desc) {
  return tidy(maker && model ? `${maker} ${model}` : desc);
}

// Searches to try in order: maker + model, then the model alone (holding companies like "Textron
// Aviation" derail the search), then the feed's description.
export function typeQueries(info = {}, desc) {
  const out = [typeQuery(info, desc), info.model && /\d|[A-Z]{2}/.test(info.model) ? tidy(info.model) : null, tidy(desc)];
  return out.filter((q, i) => q && out.indexOf(q) === i);
}

// The type's designation: its first code with a digit, joined to a short letter prefix just before
// it ("EMB-550" -> emb550, "PC-12/47E" -> pc12, "DHC-6-300" -> dhc6, "KC-135R" -> kc135r, "R44 II"
// -> r44). Variant words after it ("II", "47E", "-300", "-214") are ignored.
const raw = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
function designation(toks) {
  const i = toks.findIndex((t) => /\d/.test(t));
  if (i < 0) return null;
  const prev = i > 0 && /^\d/.test(toks[i]) && /^[a-z]{1,3}$/.test(toks[i - 1]) ? toks[i - 1] : '';
  const code = prev + toks[i];
  return { code, prefix: prev || (code.match(/^[a-z]{3,}/) || [''])[0], num: (code.match(/\d+/) || [''])[0], at: prev ? i - 1 : i };
}
// Codes in a title: each word, plus a short letter word joined to the number after it ("F-16" -> f16).
function titleCodes(toks) {
  const out = new Set(toks);
  for (let i = 0; i + 1 < toks.length; i++) if (/^[a-z]{1,3}$/.test(toks[i]) && /^\d/.test(toks[i + 1])) out.add(toks[i] + toks[i + 1]);
  return out;
}
// Maker names never count as a match: the registry's maker and the feed's often differ (Textron vs
// Cessna, Airbus Helicopters vs Eurocopter), and "Cessna" alone is the company article.
const MAKERS = new Set(('aero aerospace aerospatiale agusta agustawestland airbus american aviat aviation beech beechcraft bell boeing bombardier '
  + 'british canada cessna cirrus company corp dassault de daher diamond douglas embraer eurocopter general dynamics grumman gulfstream '
  + 'havilland helicopter helicopters honda iai industries israel leonardo lockheed martin mcdonnell mooney north northrop piper pilatus '
  + 'raytheon robinson rockwell sikorsky socata textron').split(' '));

const EVENT = new Set(['grounding', 'groundings', 'crash', 'crashes', 'accident', 'accidents', 'incident', 'incidents', 'disappearance', 'hijacking', 'bombing', 'shootdown']);

// Backup for types with no entry in lib/typearticles.mjs: the search's first page, accepted only if
// it is unmistakably the same type. A missing photo is better than the wrong plane.
//   - the designation must be in the title ("Pilatus PC-12" for "PC-12/47E"; variant letters after it
//     are fine: "KC-135" for "KC-135R", "Hawker 800" for "800XP"), and
//   - every model word must be in it too ("Phenom 300" never takes "300 (film)"; "Citation Latitude"
//     never takes "Citation Sovereign"); with neither, nothing is accepted.
// Returns { title, file, page }.
export function pickPage(json, query, maker) {
  const pages = Object.values((json && json.query && json.query.pages) || {}).filter(Boolean).sort((a, b) => (a.index || 0) - (b.index || 0));
  const p = pages[0];
  if (!p || !p.pageimage || !p.title) return null;
  const q = raw(query);
  // The registry's maker; with none, the query's first word (a feed description starts with the maker).
  const drop = new Set(maker ? raw(maker) : q.length > 1 && /^[a-z]+$/.test(q[0]) ? [q[0]] : []);
  const pool = q.filter((t) => !drop.has(t) && !MAKERS.has(t) && !STOP.has(t));
  const tt = raw(p.title), codes = titleCodes(tt);
  // An event article about the type (a grounding, a crash) carries a news photo, not the plane.
  if (tt.some((t) => EVENT.has(t))) return null;
  const near = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
  const d = designation(pool);
  const named = pool.filter((t, i) => /^[a-z]{4,}$/.test(t) && !(d && i >= d.at && i <= d.at + 1));
  const codeHit = (code) => [...codes].some((c) => /\d/.test(c) && (c === code
    || ((code.startsWith(c) || c.startsWith(code)) && /^[a-z]+$/.test(code.length > c.length ? code.slice(c.length) : c.slice(code.length)))));
  // A bare number ("407", "737") also needs the maker in the title: "700 (number)" is not a Citation.
  const bare = d && /^\d+$/.test(d.code) && !named.length;
  const ok = (d || named.length) && (!d || codeHit(d.code)) && named.every((w) => tt.some((t) => near(t, w)))
    && (!bare || [...drop].some((w) => tt.includes(w)));
  if (!ok) return null;
  const shown = creditText(p.title, 60);
  return shown ? { title: shown, file: String(p.pageimage), page: p.fullurl || null } : null;
}

const safeDecode = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
const stripTags = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

// Thumbnail URL plus credit from a File: imageinfo query. Names keep their accents. With no
// photographer we can read, the photo is still shown when the credit can be given another way: a
// public-domain/CC0 photo needs none, and for a CC 4.0 photo the license allows crediting through the
// file page, which carries the author details (named on screen, linked where it can be clicked).
// CC 2.0/3.0 photos need the author's name, so without one they aren't shown.
export const creditText = (v, max) => stripTags(v).replace(/[^\p{L}\p{N}\p{M} .,'()&+:\/-]/gu, '').trim().slice(0, max);
export function creditFrom(json) {
  const p = Object.values((json && json.query && json.query.pages) || {})[0];
  const ii = p && p.imageinfo && p.imageinfo[0];
  if (!ii || !ii.thumburl) return null;
  const m = ii.extmetadata || {};
  const val = (k) => (m[k] && m[k].value) || '';
  const artist = creditText(val('Attribution') || val('Artist'), 60).replace(/^photo(graph)?( by)?\s*:?\s*/i, '');
  const license = creditText(val('LicenseShortName'), 30) || 'see source';
  const source = /^https:\/\/(commons\.wikimedia\.org|en\.wikipedia\.org)\/wiki\/File:/.test(ii.descriptionurl || '') ? String(ii.descriptionurl).slice(0, 300) : null;
  const publicDomain = /public domain|^pd\b|^cc0\b/i.test(license);
  const file = source ? creditText(safeDecode(source.split('File:')[1] || '').replace(/_/g, ' '), 40) || null : null;
  const viaPage = /^cc[ -]by(-sa)? 4\.0$/i.test(license) && file;
  if (!artist && !publicDomain && !viaPage) return null;
  return { thumb: String(ii.thumburl), artist: artist || null, license, source, file };
}
