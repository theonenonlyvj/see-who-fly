// Lookups kept on disk, so a restart (or a second copy of the server for another house) doesn't ask
// the free services again for planes and types it already knows. One small file per entry, written
// to a temp file and renamed, so two servers sharing the directory never clobber each other. Keys are
// hashed into file names; the key is stored inside and checked on read.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class DiskCache {
  constructor(dir, kind) {
    this.dir = dir ? path.join(dir, kind) : null;
    // A folder that can't be made just means no cache, never a server that won't start.
    try { if (this.dir) fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 }); } catch { this.dir = null; }
  }
  file(key, ext) { return path.join(this.dir, crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 20) + ext); }
  write(f, data) {
    const tmp = `${f}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try { fs.writeFileSync(tmp, data, { mode: 0o600 }); fs.renameSync(tmp, f); } catch { try { fs.unlinkSync(tmp); } catch {} }
  }
  // { v, at, ttl } as saved, fresh or not (the caller decides), or null.
  get(key) {
    if (!this.dir) return null;
    try {
      const e = JSON.parse(fs.readFileSync(this.file(key, '.json'), 'utf8'));
      return e && e.key === String(key) && typeof e.at === 'number' && typeof e.ttl === 'number' ? { v: e.v ?? null, at: e.at, ttl: e.ttl } : null;
    } catch { return null; }
  }
  set(key, { v, at, ttl }) {
    if (this.dir) this.write(this.file(key, '.json'), JSON.stringify({ key: String(key), v: v ?? null, at, ttl }));
  }
  getBytes(key, maxAgeMs, now = Date.now()) {
    if (!this.dir) return null;
    try {
      const f = this.file(key, '.bin');
      if (now - fs.statSync(f).mtimeMs > maxAgeMs) return null;
      return fs.readFileSync(f);
    } catch { return null; }
  }
  setBytes(key, buf) { if (this.dir) this.write(this.file(key, '.bin'), buf); }
  // Deletes entries not rewritten within maxAgeMs; returns how many.
  prune(maxAgeMs, now = Date.now()) {
    if (!this.dir) return 0;
    let n = 0, names = [];
    try { names = fs.readdirSync(this.dir); } catch { return 0; } // folder deleted or unmounted: nothing to do
    for (const name of names) {
      const f = path.join(this.dir, name);
      try { if (now - fs.statSync(f).mtimeMs > maxAgeMs) { fs.unlinkSync(f); n++; } } catch {}
    }
    return n;
  }
}
