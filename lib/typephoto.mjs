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

// The search's first page, if its title shares a word with what we asked for (guards against a
// stray article). Returns { title, file, page }.
export function pickPage(json, query, maker) {
  const pages = Object.values((json && json.query && json.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const p = pages[0];
  if (!p || !p.pageimage || !p.title) return null;
  // The title must share a MODEL word with the query, not just the maker: the first word of a
  // multi-word query is usually the maker ("Cessna 208 Caravan" must not accept the "Cessna" company
  // article). Words match if equal, or one starts the other ("Citation" ~ "CitationJet", "800" ~ "800XP").
  // The maker's words come out of what must match (maker known: its words; unknown: the query's
  // first word, as in a feed description "CESSNA 525B Citation CJ3").
  const q = tokens(query);
  const makerWords = maker ? tokens(maker) : q.slice(0, 1);
  const rest = q.filter((t) => !makerWords.includes(t));
  const pool = rest.length ? rest : q;
  // A bare number ("300") isn't enough when the model has a word with letters ("Phenom"): "300 (film)".
  const lettered = pool.filter((t) => /[a-z]/.test(t));
  const want = lettered.length ? lettered : pool;
  const near = (a, b) => a === b || (Math.min(a.length, b.length) >= (/\d/.test(a + b) ? 3 : 4) && (a.startsWith(b) || b.startsWith(a)));
  if (!tokens(p.title).some((t) => want.some((w) => near(t, w)))) return null;
  const title = creditText(p.title, 60);
  return title ? { title, file: String(p.pageimage), page: p.fullurl || null } : null;
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
