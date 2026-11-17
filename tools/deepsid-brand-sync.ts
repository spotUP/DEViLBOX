/**
 * Downloads the DeepSID composer brand images named by composers.sql (brand, branddark)
 * into server/data/deepsid-images/brand/. Resumable (skips existing files), sequential,
 * polite. Author permission covers brand images only; never fetch playlists.
 * Result: test-data/deepsid-brand-sync.json   Run: npx tsx tools/deepsid-brand-sync.ts
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SQL = path.join(ROOT, 'server/data/deepsid-import/composers.sql');
const OUT = path.join(ROOT, 'server/data/deepsid-images/brand');
const RESULT = path.join(ROOT, 'test-data/deepsid-brand-sync.json');
const BASE = 'https://deepsid.chordian.net/images/brands/';
const DELAY_MS = 250;

// Row tail: ..., 'brand', 'branddark', 'csdbtype', csdbid, 'imagesource'),
const TAIL = /'([^'\\]*)', '([^'\\]*)', '[A-Za-z]*', \d+, '[A-Z]*'\)/g;
const names = new Set<string>();
for (const m of fs.readFileSync(SQL, 'utf8').matchAll(TAIL)) {
  for (const n of [m[1], m[2]]) if (/^[\w.-]+\.(png|svg|jpg|gif)$/i.test(n)) names.add(n);
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(RESULT), { recursive: true });
const failed: Record<string, string> = {};
let fetched = 0;
let existing = 0;

async function main() {
  for (const n of names) {
    const dest = path.join(OUT, n);
    if (fs.existsSync(dest)) { existing++; continue; }
    try {
      const r = await fetch(BASE + n, { headers: { 'User-Agent': 'brand-sync/1.0' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      fetched++;
    } catch (e) {
      failed[n] = String(e);
    }
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }
  const result = { named: names.size, fetched, existing, failed: Object.keys(failed).length, failures: failed };
  fs.writeFileSync(RESULT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, failures: undefined }));
}
main();
