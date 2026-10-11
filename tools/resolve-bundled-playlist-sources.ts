/**
 * Give every bare-named entry of the bundled seed playlists a loadable source.
 *
 *   npx tsx tools/resolve-bundled-playlist-sources.ts [--dry-run]
 *
 * Reads the Modland index (server/data/devilbox.db, `modland_files`) and the
 * HVSC index (server/data/deepsid.db, `hvsc_files`), resolves each bare entry
 * of public/data/playlists/imported-prg.json through `resolveBareFileName`,
 * and rewrites the file. Entries no archive holds stay bare and are listed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { isBareFileName, resolveBareFileName, type SourceIndex } from '../src/lib/dj/playlistTrackSource';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'public/data/playlists/imported-prg.json');
// better-sqlite3 is a server dependency; load it from there.
const Database = createRequire(path.join(ROOT, 'server/package.json'))('better-sqlite3') as typeof import('better-sqlite3');
const HVSC_ROOT = '_High Voltage SID Collection/';

function addTo(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function buildIndex(): SourceIndex {
  const modland = new Map<string, string[]>();
  const ml = new Database(path.join(ROOT, 'server/data/devilbox.db'), { readonly: true });
  for (const row of ml.prepare('SELECT full_path FROM modland_files').iterate() as Iterable<{ full_path: string }>) {
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
  return { modland, hvsc };
}

interface SeedPlaylist { id: string; tracks: { fileName: string }[] }

const dryRun = process.argv.includes('--dry-run');
const seed = JSON.parse(fs.readFileSync(SEED, 'utf8')) as SeedPlaylist[];
const index = buildIndex();

let resolved = 0;
const unresolved: string[] = [];
for (const playlist of seed) {
  const context = playlist.tracks.map((t) => t.fileName);
  for (const track of playlist.tracks) {
    if (!isBareFileName(track.fileName)) continue;
    const source = resolveBareFileName(track.fileName, index, context);
    if (source) {
      track.fileName = source;
      resolved++;
    } else {
      unresolved.push(`${playlist.id}\t${track.fileName}`);
    }
  }
}

console.log(`[resolve] resolved ${resolved}, still bare ${unresolved.length}`);
for (const line of unresolved) console.log(`  [bare] ${line}`);
if (!dryRun) fs.writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n');
