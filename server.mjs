// see-who-fly: a real-time screen of the aircraft about to pass over one point.
// No dependencies. Node 18+ (global fetch).
//
// Personal data never lives in this repo:
//   SEE_WHO_FLY_HOME_CONFIG   path to { lat, lon, tz, ground_elev_ft, view_radius_nm, alert_lead_s, overhead_hold_s, lookup_deg, heads_deg }
//   SEE_WHO_FLY_PLACES        optional path to private reference points [{ name, lat, lon }]
//   SEE_WHO_FLY_FLIGHTY_DIR   optional dir of Flighty exports; the newest FlightyExport-*.csv is used and re-checked hourly
//   SEE_WHO_FLY_FLIGHTY_CSV   optional single export (used if no dir is given)
//   SEE_WHO_FLY_DATA_DIR      where the pass log and marks are saved (default ~/.see-who-fly/data)
//   SEE_WHO_FLY_HOST / _PORT  bind address (default 127.0.0.1:8093)
//   SEE_WHO_FLY_ALLOWED_HOSTS optional comma list of extra hostnames allowed in the Host header (IPs and localhost always are)
//
// Never expose this server to the internet: relative positions plus public ADS-B data reveal where it is.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { makeFrame, rad, deg } from './lib/geo.mjs';
import { predictLook } from './lib/visibility.mjs';
import { parseMark, latestMarks, MarkLog } from './lib/marks.mjs';
import { loadPlaces, placesInView } from './lib/places.mjs';
import { newestExport, loadFlighty, flownMatch } from './lib/flighty.mjs';
import { PassTracker, PassLog, summarize } from './lib/passlog.mjs';
import { chainFromVrs, pickLeg } from './lib/routes.mjs';
import { classify } from './lib/classify.mjs';
import { OverheadHold } from './lib/hold.mjs';
import { typeFacts } from './lib/typefacts.mjs';
import { inferEndpoint } from './lib/infer.mjs';
import { originFromTrace, mergeTraces } from './lib/origin.mjs';
import zlib from 'node:zlib';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BUILD = String(Date.now()); // changes on every restart; open screens reload themselves
const cfgPath = process.env.SEE_WHO_FLY_HOME_CONFIG || path.join(ROOT, 'config.example.json');
const cfg = {
  ground_elev_ft: 0, view_radius_nm: 6, feed_radius_nm: 10, alert_lead_s: 90, overhead_hold_s: 90, near_mi: 2, log_within_mi: 2, lookup_deg: 2.0, heads_deg: 0.8,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')),
};
const HOST = process.env.SEE_WHO_FLY_HOST || '127.0.0.1';
const PORT = Number(process.env.SEE_WHO_FLY_PORT || 8093);
const POLL_MS = 2000;          // while someone is watching
const IDLE_POLL_MS = 5000;     // otherwise (the pass log interpolates between samples)
const VIEWER_WINDOW_MS = 60_000;

const M_PER_MI = 1609.344, M_PER_FT = 0.3048, KT_TO_MS = 0.514444;
const VIEW_RADIUS_M = cfg.view_radius_nm * 1852;
// Feed fields are third-party text: keep only what an ICAO field can contain.
const clean = (v, max = 10) => (v == null ? null : String(v).replace(/[^A-Za-z0-9-]/g, '').slice(0, max) || null);
const cleanText = (v) => (v == null ? null : String(v).replace(/[^A-Za-z0-9 .,'()/-]/g, '').slice(0, 60) || null);

const frame = makeFrame(cfg.lat, cfg.lon);
const toLocal = frame.toLocal;

// Two free community feeds, alternated, each backed off exponentially on errors. The feed is asked
// for a wider circle than the radar shows, so fast traffic is seen early enough for a real heads-up.
const FEEDS = [
  { name: 'adsb.lol', url: `https://api.adsb.lol/v2/point/${cfg.lat}/${cfg.lon}/${cfg.feed_radius_nm}`, list: (j) => j.ac },
  { name: 'adsb.fi', url: `https://opendata.adsb.fi/api/v2/lat/${cfg.lat}/lon/${cfg.lon}/dist/${cfg.feed_radius_nm}`, list: (j) => j.aircraft },
];
const feedState = FEEDS.map(() => ({ backoffUntil: 0, fails: 0 }));
let feedTurn = 0;

// Reference points (airports, neighbourhoods, friends' places) come from SEE_WHO_FLY_PLACES, a file
// outside the repo. They're sent to the browser as relative x/y, and only if inside the plotted window.
const PLACES = loadPlaces(process.env.SEE_WHO_FLY_PLACES);
const LANDMARKS = placesInView(PLACES, frame, VIEW_RADIUS_M);
// Places with an "iata" code are treated as local airports for landing/departing inference.
const AIRPORTS = PLACES.filter((p) => p.iata).map((p) => ({ iata: clean(p.iata, 4), name: cleanText(p.name), ...toLocal(p.lat, p.lon) }));

// ---------- per-aircraft description ----------
// "Worth looking up?" is decided by how big the plane will look (wingspan over 3-D distance), not by a
// fixed box: see lib/visibility.mjs. Tiers: 'lookup' (red) and 'heads' (amber); everything else is radar only.
const LOOK = { groundFt: cfg.ground_elev_ft, lookupDeg: cfg.lookup_deg, headsDeg: cfg.heads_deg, horizonS: 240 };


function describe(ac, now) {
  if (ac.lat == null || ac.lon == null) return null;
  if (!/^~?[0-9a-f]{6}$/i.test(ac.hex || '')) return null;
  const p = toLocal(ac.lat, ac.lon);
  const distM = Math.hypot(p.x, p.y);
  const onGround = ac.alt_baro === 'ground';
  const altFt = onGround ? 0 : (ac.alt_geom ?? ac.alt_baro ?? null);
  const aglM = altFt == null ? null : Math.max(0, (altFt - cfg.ground_elev_ft) * M_PER_FT);
  const bearing = (deg(Math.atan2(p.x, p.y)) + 360) % 360;   // from home to aircraft
  const elevation = aglM == null ? null : deg(Math.atan2(aglM, distM));
  const vrate = ac.baro_rate ?? ac.geom_rate ?? null;
  const look = onGround ? { tier: null } : predictLook({ x: p.x, y: p.y, altFt, gs: ac.gs, track: ac.track, vrate, posAge: ac.seen_pos, type: clean(ac.t, 4), mil: ((ac.dbFlags ?? 0) & 1) === 1 }, LOOK);

  const callsign = clean(ac.flight) || '';
  const mil = ((ac.dbFlags ?? 0) & 1) === 1, type = clean(ac.t, 4), category = clean(ac.category, 2);
  const st = { x: p.x, y: p.y, altFt, vrate, track: ac.track ?? null };
  return {
    hex: ac.hex.toLowerCase(), callsign, reg: clean(ac.r), type: clean(ac.t, 4), desc: cleanText(ac.desc),
    category: clean(ac.category, 2), squawk: clean(ac.squawk, 4), emergency: ac.emergency && ac.emergency !== 'none' ? clean(ac.emergency, 12) : null,
    mil: ((ac.dbFlags ?? 0) & 1) === 1,
    x: p.x, y: p.y, distM, bearing, elevation,
    altFt, onGround, gs: ac.gs ?? null, track: ac.track ?? null, vrate,
    posAge: ac.seen_pos ?? null,
    tier: look.tier, overheadNow: !!look.nowLookup, etaS: look.etaS ?? null, exitS: look.exitS ?? null,
    peakDeg: look.peakDeg ?? null, nowDeg: look.nowDeg ?? null, slantM: look.slantM ?? null,
    lookBearing: look.lookBearing ?? bearing, lookElev: look.lookElev ?? elevation,
    flown: flownMatch(flighty, clean(ac.r), callsign),
    route: onGround ? null : routeFor(callsign, st, ac.hex.toLowerCase()),
    cls: classify({ callsign, type, mil, category }),
    facts: typeFacts(type),
    info: infoFor(ac.hex.toLowerCase()),
    mph: ac.gs != null ? Math.round(ac.gs * 1.15078) : null,
    aglFt: altFt == null ? null : Math.max(0, Math.round(altFt - cfg.ground_elev_ft)),
    t: now,
  };
}

// Route = the leg of this flight number that fits what the plane is doing (lib/routes.mjs), or the
// airline alone when no leg fits. Never a guessed route.
function routeFor(callsign, st, hex) {
  const c = callsign ? routeCache.get(callsign)?.v : null;
  const l = c ? pickLeg(c.chain, st) : null;
  if (l) return { airline: c.airline, ...l };
  // No listed leg fits: say what the plane itself shows. Landing/departing from its approach path
  // near a known local airport; where it took off from, from its own track today (lib/origin.mjs).
  const airline = c?.airline || null;
  const e = inferEndpoint(st, AIRPORTS, cfg.ground_elev_ft);
  const o = originFor(hex);
  if (e?.kind === 'landing') return { airline, inferred: 'landing', to: e.airport, ...(o && o.iata !== e.airport.iata ? { from: o } : {}) };
  if (e) return { airline, inferred: 'departing', from: e.airport };
  if (o) return { airline, inferred: 'origin', from: o };
  return airline ? { airline } : null;
}

// ---------- where it took off (adsb.lol public trace, cached per plane) ----------
const originCache = new Map(); // hex -> { v: { iata, name } | null, at, ttl }
const originQueue = new Map(); // hex -> when queued
const ORIGIN_MAX = 2000;
const originFresh = (hex) => { const c = originCache.get(hex); return c && Date.now() - c.at < c.ttl; };
const originFor = (hex) => (hex && originFresh(hex) && originCache.get(hex).v) || null; // never past its TTL
let originPauseUntil = 0; // any 429 from adsb.lol pauses all trace lookups, so the feed itself isn't starved
async function readCapped(r, max) {
  const chunks = []; let size = 0;
  for await (const chunk of r.body) { size += chunk.length; if (size > max) throw new Error('too big'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
// One public trace file: parsed JSON, 'gone' (404), or a thrown error. A 429 pauses all lookups.
async function getTrace(hex, kind) {
  const r = await fetch(`https://adsb.lol/data/traces/${hex.slice(-2)}/trace_${kind}_${hex}.json`,
    { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'see-who-fly/0.6' } });
  if (r.status !== 200) {
    r.body?.cancel().catch(() => {});
    if (r.status === 404) return 'gone';
    if (r.status === 429) originPauseUntil = Date.now() + 10 * 60_000;
    throw new Error(`HTTP ${r.status}`);
  }
  // fetch undoes a gzip Content-Encoding itself; the cap applies to what it hands back.
  let buf = await readCapped(r, 8_000_000);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf, { maxOutputLength: 8_000_000 });
  return JSON.parse(buf.toString('utf8'));
}
async function originWorker() {
  for (;;) {
    const [hex, queuedAt] = originQueue.entries().next().value || [];
    if (!hex || Date.now() < originPauseUntil) { await sleep(1000); continue; }
    originQueue.delete(hex);
    if (Date.now() - queuedAt > 60_000) continue; // queued before a pause or after the viewer left
    if (originFresh(hex) || !/^[0-9a-f]{6}$/.test(hex)) continue;
    let v = null, ttl = 5 * 60_000;
    try {
      const full = await getTrace(hex, 'full');
      const recent = await getTrace(hex, 'recent'); // a fresh takeoff may have no full trace yet
      if (full === 'gone' && recent === 'gone') ttl = 30 * 60_000;
      const o = originFromTrace(mergeTraces(full === 'gone' ? null : full, recent === 'gone' ? null : recent));
      // An answer holds for a while; "no answer yet" is retried soon.
      if (o) { v = { iata: clean(o.code, 4) }; ttl = 15 * 60_000; }
    } catch {}
    originCache.delete(hex);
    originCache.set(hex, { v, at: Date.now(), ttl });
    if (originCache.size > ORIGIN_MAX) originCache.delete(originCache.keys().next().value);
    await sleep(1500); // be polite to a free service
  }
}

// ---------- aircraft info + photo (adsbdb, cached; photos proxied so the page stays self-contained) ----------
const infoCache = new Map(); // hex -> { v: { owner, maker, model, photoUrl }, at, ttl }
const INFO_CACHE_MAX = 3000;
const infoFresh = (hex) => { const c = infoCache.get(hex); return c && Date.now() - c.at < c.ttl; };
const infoQueue = new Set();
const PHOTO_HOSTS = /^https:\/\/(image\.)?airport-data\.com\//;
function infoFor(hex) {
  const c = infoCache.get(hex)?.v;
  return c ? { owner: c.owner, maker: c.maker, model: c.model, photo: c.photoUrl ? `/photo/${hex}` : null } : null;
}
async function infoWorker() {
  for (;;) {
    const hex = infoQueue.values().next().value;
    if (!hex) { await sleep(700); continue; }
    infoQueue.delete(hex);
    if (infoFresh(hex)) continue;
    let v = null, failed = false;
    try {
      const a = (await getJson(`https://api.adsbdb.com/v0/aircraft/${hex}`))?.response?.aircraft;
      if (a && typeof a === 'object') {
        const photo = [a.url_photo_thumbnail, a.url_photo].find((u) => typeof u === 'string' && PHOTO_HOSTS.test(u)) || null;
        v = { owner: cleanText(a.registered_owner), maker: cleanText(a.manufacturer), model: cleanText(a.type), photoUrl: photo };
      }
    } catch { failed = true; }
    infoCache.delete(hex);
    infoCache.set(hex, { v, at: Date.now(), ttl: failed ? 10 * 60_000 : 24 * 3600_000 });
    if (infoCache.size > INFO_CACHE_MAX) infoCache.delete(infoCache.keys().next().value);
    await sleep(500);
  }
}
const photoCache = new Map(); // hex -> Buffer (small LRU)
async function photoFor(hex) {
  if (photoCache.has(hex)) return photoCache.get(hex);
  const url = infoCache.get(hex)?.v?.photoUrl;
  if (!url || !PHOTO_HOSTS.test(url)) return null;
  // No redirects (they could point anywhere); size checked before and while reading.
  const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'see-who-fly/0.5' } });
  if (r.status !== 200 || !/^image\/(jpeg|png|webp)/.test(r.headers.get('content-type') || '')) return null;
  if (Number(r.headers.get('content-length') || 0) > 800_000) return null;
  const chunks = []; let size = 0;
  for await (const chunk of r.body) { size += chunk.length; if (size > 800_000) return null; chunks.push(chunk); }
  const buf = Buffer.concat(chunks);
  photoCache.set(hex, buf);
  if (photoCache.size > 120) photoCache.delete(photoCache.keys().next().value);
  return buf;
}

// ---------- Flighty history (local only; newest export wins) ----------
let flighty = null;
function refreshFlighty() {
  const dir = process.env.SEE_WHO_FLY_FLIGHTY_DIR;
  const file = dir ? newestExport(dir) : process.env.SEE_WHO_FLY_FLIGHTY_CSV;
  if (!file || !fs.existsSync(file) || flighty?.file === file) return;
  try {
    flighty = loadFlighty(file);
    console.log(`flighty: ${path.basename(file)} — ${flighty.byTail.size} tails, ${flighty.byFlight.size} flight numbers`);
  } catch (e) { console.error('flighty load failed', e.message); }
}

// ---------- route enrichment (cached) ----------
// Legs: VRS standing data (multi-leg chains, vrs-standing-data.adsb.lol). Airline name, and a one-leg
// fallback when VRS has nothing: adsbdb. Either way the leg must fit the plane's state to be shown.
const routeCache = new Map(); // callsign -> { v: { airline, chain }, at, ttl }
const routeInFlight = new Set();
const ROUTE_TTL_MS = 6 * 3600_000, ROUTE_RETRY_MS = 5 * 60_000;
const routeQueue = new Set();
const cleanAirport = (a) => ({ ...a, iata: clean(a.iata, 4) || '?', name: cleanText(a.name) });
async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'see-who-fly/0.5' } });
  if (r.status === 404) return null;                 // genuinely not listed
  if (!r.ok) throw new Error(`HTTP ${r.status}`);    // try again later
  return r.json();
}
async function routeWorker() {
  for (;;) {
    const cs = routeQueue.values().next().value;
    if (!cs) { await sleep(500); continue; }
    routeQueue.delete(cs);
    const c = routeCache.get(cs);
    if (routeInFlight.has(cs) || (c && Date.now() - c.at < c.ttl)) continue;
    routeInFlight.add(cs);
    let chain = [], airline = null, failed = false;
    try {
      // Registrations (N123AB) are never in route lists; skip the lookup.
      if (!/^N\d/.test(cs)) {
        const vrs = await getJson(`https://vrs-standing-data.adsb.lol/routes/${cs.slice(0, 2)}/${cs}.json`);
        chain = chainFromVrs(vrs, frame);
      }
    } catch { failed = true; }
    try {
      const fr = (await getJson(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`))?.response?.flightroute;
      airline = cleanText(fr?.airline?.name);
      if (chain.length < 2 && fr?.origin && fr?.destination) {
        const ap = (a) => ({ iata: a.iata_code, location: a.municipality, lat: a.latitude, lon: a.longitude });
        chain = chainFromVrs({ _airports: [ap(fr.origin), ap(fr.destination)] }, frame);
      }
    } catch { failed = true; }
    // A network failure is retried in minutes; a real "unknown" is kept for hours.
    routeCache.set(cs, { at: Date.now(), ttl: failed ? ROUTE_RETRY_MS : ROUTE_TTL_MS,
      v: chain.length || airline ? { airline, chain: chain.map(cleanAirport) } : null });
    routeInFlight.delete(cs);
    await sleep(400); // be polite to free services
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- pass log (persistent, records whether or not anyone is watching) ----------
const dayKey = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: cfg.tz }).format(d);
const DATA_DIR = process.env.SEE_WHO_FLY_DATA_DIR || path.join(os.homedir(), '.see-who-fly', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const passLog = new PassLog(DATA_DIR, dayKey);
const tracker = new PassTracker({ logWithinM: cfg.log_within_mi * M_PER_MI, closeAfterS: 30, groundFt: cfg.ground_elev_ft, lookupDeg: cfg.lookup_deg, headsDeg: cfg.heads_deg });
const markLog = new MarkLog(DATA_DIR, dayKey);
const today = { day: dayKey(), passes: [], marks: [] };
today.passes = passLog.read(today.day);
today.marks = markLog.read(today.day);

function recordPasses(passes) {
  const k = dayKey();
  if (today.day !== k) { today.day = k; today.passes = passLog.read(k); today.marks = markLog.read(k); }
  for (const p of passes) {
    passLog.append(p);
    if (dayKey(new Date(p.at)) === today.day) today.passes.push(p);
  }
}

// ---------- feed polling ----------
const hold = new OverheadHold({ holdS: cfg.overhead_hold_s, headsDeg: cfg.heads_deg });
let state = { updated: null, aircraft: [], error: null };
let lastViewer = 0;

async function pollOnce() {
  const now = Date.now();
  let i = -1;
  for (let n = 0; n < FEEDS.length; n++) {
    const c = (feedTurn + n) % FEEDS.length;
    if (feedState[c].backoffUntil <= now) { i = c; break; }
  }
  if (i < 0) throw new Error('all feeds backing off');
  feedTurn = i + 1;
  const feed = FEEDS[i], fst = feedState[i];
  let j;
  try {
    const r = await fetch(feed.url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'see-who-fly/0.5' } });
    if (!r.ok) throw new Error(`${feed.name} HTTP ${r.status}`);
    j = await r.json();
    fst.fails = 0;
  } catch (e) {
    fst.fails++; fst.backoffUntil = now + Math.min(60_000, 2000 * 2 ** fst.fails);
    throw e;
  }
  const list = (feed.list(j) || []).map((a) => describe(a, now)).filter(Boolean);
  for (const a of list) {
    if (a.callsign && !a.onGround) {
      const c = routeCache.get(a.callsign);
      if (!c || now - c.at > c.ttl) routeQueue.add(a.callsign);
    }
  }
  for (const a of list) {
    // Look up every airborne plane in view, not only the ones headed overhead: a lookup pattern
    // limited to near-overhead planes would itself point at the house.
    if (!a.onGround && a.distM <= VIEW_RADIUS_M && !infoFresh(a.hex)) infoQueue.add(a.hex);
    // Origin lookups only while someone is watching, and only for planes no route list places
    // (every such plane in view alike, so the pattern says nothing about where the house is).
    const listed = a.route && a.route.from && a.route.to && !a.route.inferred;
    if (!a.onGround && !listed && a.distM <= VIEW_RADIUS_M && now - lastViewer < VIEWER_WINDOW_MS && !originFresh(a.hex) && !originQueue.has(a.hex)) originQueue.set(a.hex, now);
  }
  hold.track(list, now);
  recordPasses(tracker.update(list, now));
  list.sort((a, b) => (a.etaS ?? 1e9) - (b.etaS ?? 1e9) || a.distM - b.distM);
  state = { updated: now, aircraft: list, error: null, feed: feed.name };
}

async function pollForever() {
  for (;;) {
    const t0 = Date.now();
    try { await pollOnce(); } catch (e) {
      console.error('feed', String(e.message || e).slice(0, 200));
      state = { ...state, error: /HTTP \d+|backing off/.test(e.message) ? e.message.slice(0, 40) : 'bad response' };
    }
    const every = Date.now() - lastViewer < VIEWER_WINDOW_MS ? POLL_MS : IDLE_POLL_MS;
    await sleep(Math.max(0, every - (Date.now() - t0)));
  }
}

// ---------- HTTP ----------
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'" };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
const PUBLIC_DIR = path.join(ROOT, 'public') + path.sep;
const STALE_MS = 20_000;
const EXTRA_HOSTS = new Set((process.env.SEE_WHO_FLY_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));

// Only answer to IP addresses, localhost, or hostnames explicitly allowed (blocks DNS-rebinding pages).
function hostAllowed(hostHeader) {
  const h = String(hostHeader || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return h === 'localhost' || /^[0-9.]+$/.test(h) || /^[0-9a-f:]+$/.test(h) || EXTRA_HOSTS.has(h);
}

// A small global budget for marks: plenty for people tapping buttons, useless for flooding.
const markBudget = { windowStart: 0, n: 0 };
const MAX_MARKS_PER_MIN = 60, MAX_MARKS_PER_DAY = 5000;

function send(res, code, body, type = 'application/json') {
  if (res.headersSent) return res.end();
  res.writeHead(code, { ...SECURITY, 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function handleMark(req, res) {
  const origin = req.headers.origin;
  if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return send(res, 403, '{"ok":false}');
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 2000) req.destroy(); });
  req.on('end', () => {
    try {
      const now = Date.now();
      if (now - markBudget.windowStart > 60_000) { markBudget.windowStart = now; markBudget.n = 0; }
      let m = null;
      try { m = parseMark(JSON.parse(body), now); } catch {}
      if (!m) return send(res, 400, '{"ok":false}');
      if (++markBudget.n > MAX_MARKS_PER_MIN || today.marks.length >= MAX_MARKS_PER_DAY) return send(res, 429, '{"ok":false}');
      markLog.append(m);
      if (dayKey(new Date(m.at)) === today.day) today.marks.push(m);
      send(res, 200, JSON.stringify({ ok: true, mark: m }));
    } catch (e) { console.error('mark failed', e.message); send(res, 500, '{"ok":false}'); }
  });
}

function handleState(res) {
  lastViewer = Date.now();
  const stale = !state.updated || Date.now() - state.updated > STALE_MS;
  const live = stale ? [] : state.aircraft;
  for (const a of live) { a.route = a.onGround ? null : routeFor(a.callsign, a, a.hex); a.info = infoFor(a.hex); }
  hold.annotate(live, Date.now());
  const sum = summarize(today.passes);
  const marks = latestMarks(today.marks);
  const withMarks = (o) => ({ ...o, marks: marks.get(o.hex) || null });
  // The last few passes (any size, so "heard one it didn't flag" can be marked too).
  const recent = today.passes.slice(-8).reverse()
    .map(({ track, route, ...p }) => withMarks({ ...p, route: route && { from: route.from?.iata, to: route.to?.iata, inferred: route.inferred } }));
  send(res, 200, JSON.stringify({
    ...state,
    stale,
    build: BUILD,
    // The client gets thresholds and relative positions; it never needs the home coordinates.
    config: { viewRadiusM: VIEW_RADIUS_M, alertLeadS: cfg.alert_lead_s, holdS: cfg.overhead_hold_s, nearM: cfg.near_mi * M_PER_MI, lookupDeg: cfg.lookup_deg, headsDeg: cfg.heads_deg, tz: cfg.tz },
    aircraft: live.map(withMarks),
    recent,
    landmarks: LANDMARKS,
    today: { day: today.day, ...sum, last: sum.last && { ...sum.last, track: undefined }, marks: today.marks.length },
  }));
}

// Old smart-TV browsers (2018 Samsung = Chromium 56) get the /tv build: the same page, lowered to old
// JavaScript. So a TV bookmarked on / keeps working when the main page uses modern code.
const oldBrowser = (ua = '') => /Tizen|Web0S|SMART-TV|SmartTV/i.test(ua)
  || Number((/Chrome\/(\d+)/.exec(ua) || [])[1] || 999) < 80
  || (!/Chrome|CriOS|Firefox/.test(ua) && Number((/Version\/(\d+)[.\d]* (Mobile\/\S+ )?Safari/.exec(ua) || [])[1] || 999) < 14);
function handleStatic(url, res, method, ua) {
  const p = url.pathname.replace(/\/$/, '') || '/';
  const old = oldBrowser(ua);
  const page = p === '/favicon.ico' ? 'favicon-32.png' : p === '/tv' || (p === '/' && old) ? 'tv.html' : p === '/' ? 'index.html'
    : p === '/look' ? (old ? 'tv-look.html' : 'look.html') : url.pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, page);
  let st = null;
  try { st = fs.statSync(file); } catch {}
  if (!file.startsWith(PUBLIC_DIR) || !st || !st.isFile()) return send(res, 404, 'not found', 'text/plain');
  res.writeHead(200, { ...SECURITY, 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', vary: 'user-agent' });
  if (method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

http.createServer((req, res) => {
  try {
    if (!hostAllowed(req.headers.host)) return send(res, 421, 'misdirected', 'text/plain');
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'bad request', 'text/plain'); }
    if (url.pathname === '/api/mark' && req.method === 'POST') return handleMark(req, res);
    if (url.pathname === '/api/state') return handleState(res);
    const ph = /^\/photo\/(~?[0-9a-f]{6})$/.exec(url.pathname);
    if (ph) {
      photoFor(ph[1]).then((buf) => {
        if (!buf) return send(res, 404, 'no photo', 'text/plain');
        res.writeHead(200, { ...SECURITY, 'content-type': (buf[0] === 0x89 ? 'image/png' : buf[0] === 0x52 ? 'image/webp' : 'image/jpeg'), 'cache-control': 'max-age=86400' });
        res.end(buf);
      }, () => send(res, 404, 'no photo', 'text/plain'));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
    return handleStatic(url, res, req.method, req.headers['user-agent']);
  } catch (e) {
    console.error('request failed', e.message);
    send(res, 500, 'error', 'text/plain');
  }
}).listen(PORT, HOST, () => {
  refreshFlighty(); setInterval(refreshFlighty, 3600_000);
  routeWorker();
  infoWorker();
  originWorker();
  pollForever();
  console.log(`see-who-fly on http://${HOST}:${PORT}  (look-up ${cfg.lookup_deg}°/${cfg.heads_deg}°, view ${cfg.view_radius_nm} nm, ${LANDMARKS.length} places, log ${passLog.dir || 'off'})`);
});
