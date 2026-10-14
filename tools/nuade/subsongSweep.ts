/**
 * Headless nuade subsong sweep, phase 1: for every row of the nuade table, the corpus songs (git-tracked under
 * public/data/songs, matched by the row's extensions / prefixes) on which nuade's own report says > 1 subsong.
 * Resumable: verdicts are written to thoughts/spot/nuade-subsong-sweep.json per row; recorded rows are skipped
 * (`--only <id>` re-runs one row).
 *   npx tsx tools/nuade/subsongSweep.ts [--only id]
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NuadeHeadless } from '../../src/engine/nuade/nuadeHeadless';
import { NUADE_FORMAT_LIST } from '../../src/engine/nuade/nuadeFormats';

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'thoughts/spot/nuade-subsong-sweep.json');
const only = process.argv.indexOf('--only') >= 0 ? process.argv[process.argv.indexOf('--only') + 1] : null;
const rec: Record<string, { songs: { file: string; subsongs: number }[]; multi: string | null }> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const files = execSync('git ls-files -z public/data/songs', { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);
const nu = await NuadeHeadless.create();
console.log(`rows: ${NUADE_FORMAT_LIST.length}`);
for (const row of NUADE_FORMAT_LIST) {
  if (rec[row.id] && only !== row.id) continue;
  const exts = row.extensions.map((e) => e.toLowerCase());
  const songs: { file: string; subsongs: number }[] = [];
  for (const f of files) {
    const base = f.slice(f.lastIndexOf('/') + 1).toLowerCase();
    if (!exts.some((e) => base.endsWith('.' + e) || base.startsWith(e + '.'))) continue;
    const bytes = new Uint8Array(readFileSync(join(ROOT, f)));
    if (bytes.length > 4 << 20) continue;
    try {
      nu.clearFiles();
      nu.open(bytes, f.slice(f.lastIndexOf('/') + 1), row.id);
      songs.push({ file: f, subsongs: nu.subsongCount });
      nu.close();
    } catch { /* not accepted by this player */ }
  }
  const multi = songs.filter((s) => s.subsongs > 1).sort((a, b) => b.subsongs - a.subsongs)[0];
  rec[row.id] = { songs: songs.map((s) => s), multi: multi?.file ?? null };
  writeFileSync(OUT, JSON.stringify(rec, null, 1));
  console.log(`${row.id}: ${songs.length} songs, multi ${multi ? `${multi.file} (${multi.subsongs})` : '-'}`);
}
