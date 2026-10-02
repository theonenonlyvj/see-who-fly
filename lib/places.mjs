import fs from 'node:fs';

// Private reference points (e.g. friends' places) live in a file outside the repo:
// [{ "name": "...", "lat": .., "lon": .. }]. Missing or unreadable file -> no places.
export function loadPlaces(file) {
  if (!file) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).filter((p) => p && p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon)); }
  catch { return []; }
}

// Only points inside the plotted window are sent, and only as relative x/y.
export function placesInView(places, frame, radiusM) {
  return places
    .map(({ name, lat, lon }) => ({ name, ...frame.toLocal(lat, lon) }))
    .filter((p) => Math.hypot(p.x, p.y) <= radiusM);
}
