/**
 * Build the bundled DJ seed playlists from HippoPlayer playlists (`.prg`).
 *
 *   npx tsx tools/convert-hippo-playlists.ts <dir-with-.prg-files> [--dry-run]
 *
 * Every URL entry becomes one track that keeps its source (see
 * src/lib/dj/hippoPlaylist.ts): Modland -> `modland:<path>`, HVSC ->
 * `hvsc:<path>`, anything else -> the URL itself. Playlists are written in
 * byte order of their file names to public/data/playlists/imported-prg.json.
 *
 * Modland URLs are partly %-escaped ("a prehistoric tale %28intro%29.hipc"):
 * the Modland index (server/data/devilbox.db, `modland_files`) decides
 * whether the decoded or the raw path is the archive's name. A path the index
 * holds in neither form was moved by Modland since the playlist was saved;
 * it is re-found by file name through `resolveBareFileName` (exact name,
 * ambiguity settled only by the playlist's own author dirs, else HVSC from
 * server/data/deepsid.db). Paths that stay unresolved keep the URL's path
 * and are listed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { playlistFromPrg, type SeedPlaylist } from '../src/lib/dj/hippoPlaylist';
import { resolveBareFileName, sourceBaseName, type SourceIndex } from '../src/lib/dj/playlistTrackSource';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'public/data/playlists/imported-prg.json');
// better-sqlite3 is a server dependency; load it from there.
const Database = createRequire(path.join(ROOT, 'server/package.json'))('better-sqlite3') as typeof import('better-sqlite3');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('usage: npx tsx tools/convert-hippo-playlists.ts <dir-with-.prg-files> [--dry-run]');
  process.exit(1);
}

const HVSC_ROOT = '_High Voltage SID Collection/';

function addTo(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Modland and HVSC by lower-cased file name, plus the set of Modland paths. */
function buildIndex(): SourceIndex & { modlandPaths: Set<string> } {
  const modland = new Map<string, string[]>();
  const modlandPaths = new Set<string>();
  const ml = new Database(path.join(ROOT, 'server/data/devilbox.db'), { readonly: true });
  for (const row of ml.prepare('SELECT full_path FROM modland_files').iterate() as Iterable<{ full_path: string }>) {
    modlandPaths.add(row.full_path);
    addTo(modland, row.full_path.slice(row.full_path.lastIndexOf('/') + 1).toLowerCase(), row.full_path);
  }
  ml.close();

  const hvsc = new Map<string, string[]>();
  const hv = new Database(path.join(ROOT, 'server/data/deepsid.db'), { readonly: true });
  for (const row of hv.prepare('SELECT fullname FROM hvsc_files WHERE fullname LIKE ?').iterate(`${HVSC_ROOT}%`) as Iterable<{ fullname: string }>) {
    const rel = row.fullname.slice(HVSC_ROOT.length);
    addTo(hvsc, rel.slice(rel.lastIndexOf('/') + 1).toLowerCase(), rel);
  }
  hv.close();
  return { modland, hvsc, modlandPaths };
}

const index = buildIndex();
const moved = new Set<string>();
function pickModlandPath(raw: string, decoded: string): string {
  if (index.modlandPaths.has(decoded)) return decoded;
  if (index.modlandPaths.has(raw)) return raw;
  moved.add(decoded);
  return decoded;
}

const files = fs.readdirSync(dir).filter((f) => /\.prg$/i.test(f)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const seed: SeedPlaylist[] = files.map((f) => playlistFromPrg(f, fs.readFileSync(path.join(dir, f)), pickModlandPath));

// Modland paths that moved since the playlist was saved: re-find by file name.
let relocated = 0;
const notInIndex: string[] = [];
for (const playlist of seed) {
  const context = playlist.tracks.map((t) => t.fileName);
  for (const track of playlist.tracks) {
    if (!track.fileName.startsWith('modland:') || !moved.has(track.fileName.slice('modland:'.length))) continue;
    const found = resolveBareFileName(sourceBaseName(track.fileName), index, context);
    if (found) {
      track.fileName = found;
      relocated++;
    } else {
      notInIndex.push(track.fileName);
    }
  }
}
console.log(`[convert] ${relocated} moved Modland paths re-found by file name`);

const kinds = new Map<string, number>();
for (const t of seed.flatMap((p) => p.tracks)) {
  const kind = /^(modland|hvsc):/.exec(t.fileName)?.[1] ?? new URL(t.fileName).host;
  kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
}
console.log(`[convert] ${seed.length} playlists, ${seed.reduce((n, p) => n + p.tracks.length, 0)} entries`);
for (const [kind, n] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${kind}`);
if (notInIndex.length) {
  console.log(`[convert] ${notInIndex.length} Modland paths not in the local index and not re-found (source kept):`);
  for (const p of notInIndex) console.log(`  ${p}`);
}
if (!dryRun) fs.writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n');
