// see-who-fly: a real-time screen of the aircraft about to pass over one point.
// No dependencies. Node 18+ (global fetch).
//
// Personal data never lives in this repo:
//   SEE_WHO_FLY_HOME_CONFIG   path to { lat, lon, tz, ground_elev_ft, view_radius_nm, alert_lead_s, lookup_deg, heads_deg }
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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BUILD = String(Date.now()); // changes on every restart; open screens reload themselves
const cfgPath = process.env.SEE_WHO_FLY_HOME_CONFIG || path.join(ROOT, 'config.example.json');
const cfg = {
  ground_elev_ft: 0, view_radius_nm: 6, feed_radius_nm: 10, alert_lead_s: 90, log_within_mi: 2, lookup_deg: 2.0, heads_deg: 0.8,
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
const LANDMARKS = placesInView(loadPlaces(process.env.SEE_WHO_FLY_PLACES), frame, VIEW_RADIUS_M);

// ---------- per-aircraft description ----------
// "Worth looking up?" is decided by how big the plane will look (wingspan over 3-D distance), not by a
// fixed box: see lib/visibility.mjs. Tiers: 'lookup' (red) and 'heads' (amber); everything else is radar only.
const LOOK = { groundFt: cfg.ground_elev_ft, lookupDeg: cfg.lookup_deg, headsDeg: cfg.heads_deg, horizonS: 240 };

// Feed fields are third-party text: keep only what an ICAO field can contain.
const clean = (v, max = 10) => (v == null ? null : String(v).replace(/[^A-Za-z0-9-]/g, '').slice(0, max) || null);
const cleanText = (v) => (v == null ? null : String(v).replace(/[^A-Za-z0-9 .,'()/-]/g, '').slice(0, 60) || null);

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
    route: routeFor(callsign, { x: p.x, y: p.y, altFt, vrate, track: ac.track ?? null }),
    t: now,
  };
}

// Route = the leg of this flight number that fits what the plane is doing (lib/routes.mjs), or the
// airline alone when no leg fits. Never a guessed route.
function routeFor(callsign, st) {
  const c = routeCache.get(callsign)?.v;
  if (!c) return null;
  const l = pickLeg(c.chain, st);
  if (!l && !c.airline) return null;
  return { airline: c.airline, ...(l || {}) };
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
  const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'see-who-fly/0.4' } });
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
    const r = await fetch(feed.url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'see-who-fly/0.4' } });
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
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
  for (const a of live) a.route = routeFor(a.callsign, a);
  const sum = summarize(today.passes);
  const marks = latestMarks(today.marks);
  const withMarks = (o) => ({ ...o, marks: marks.get(o.hex) || null });
  // The last few passes (any size, so "heard one it didn't flag" can be marked too).
  const recent = today.passes.slice(-8).reverse()
    .map(({ track, route, ...p }) => withMarks({ ...p, route: route && { from: route.from?.iata, to: route.to?.iata } }));
  send(res, 200, JSON.stringify({
    ...state,
    stale,
    build: BUILD,
    // The client gets thresholds and relative positions; it never needs the home coordinates.
    config: { viewRadiusM: VIEW_RADIUS_M, alertLeadS: cfg.alert_lead_s, lookupDeg: cfg.lookup_deg, headsDeg: cfg.heads_deg, tz: cfg.tz },
    aircraft: live.map(withMarks),
    recent,
    landmarks: LANDMARKS,
    today: { day: today.day, ...sum, last: sum.last && { ...sum.last, track: undefined }, marks: today.marks.length },
  }));
}

function handleStatic(url, res, method) {
  const page = url.pathname === '/' || url.pathname === '/tv' || url.pathname === '/tv/' ? 'index.html' : url.pathname === '/look' ? 'look.html' : url.pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, page);
  let st = null;
  try { st = fs.statSync(file); } catch {}
  if (!file.startsWith(PUBLIC_DIR) || !st || !st.isFile()) return send(res, 404, 'not found', 'text/plain');
  res.writeHead(200, { ...SECURITY, 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
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
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
    return handleStatic(url, res, req.method);
  } catch (e) {
    console.error('request failed', e.message);
    send(res, 500, 'error', 'text/plain');
  }
}).listen(PORT, HOST, () => {
  refreshFlighty(); setInterval(refreshFlighty, 3600_000);
  routeWorker();
  pollForever();
  console.log(`see-who-fly on http://${HOST}:${PORT}  (look-up ${cfg.lookup_deg}°/${cfg.heads_deg}°, view ${cfg.view_radius_nm} nm, ${LANDMARKS.length} places, log ${passLog.dir || 'off'})`);
});
