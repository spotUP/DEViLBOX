/**
 * Build a Neo Geo song spec into a .fur with the repo's Furnace exporter, then lint it against the furtool palette.
 * Usage: npx tsx --tsconfig tsconfig.app.json tools/neogeo-compose/run.ts <song-name> <out.fur>
 * Exit code 1 when the builder or the lint reports a problem (the file is still written for inspection).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportFurnaceModule } from '@/lib/export/FurnaceModuleExporter';
import { lintNeoGeoSong, adpcmBSampleBytes, type NeoGeoSongBuilder } from '@/lib/export/neogeo/neoGeoCompose';

const [name, out] = process.argv.slice(2);
if (!name || !out) {
  console.error('usage: run.ts <song-name> <out.fur>');
  process.exit(2);
}
const repoRoot = resolve(import.meta.dirname, '../..');
const mod = await import(pathToFileURL(resolve(import.meta.dirname, 'songs', `${name}.ts`)).href);
const builder: NeoGeoSongBuilder = mod.default(repoRoot);
const song = builder.build();
const { bytes, warnings } = exportFurnaceModule(song);
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, bytes);

const lint = lintNeoGeoSong(song);
console.log(`[OK] ${out}: ${bytes.length} bytes, ${song.patterns.length} patterns, order ${song.songPositions.join(' ')}`);
for (const s of adpcmBSampleBytes(song)) console.log(`ADPCM-B sample "${s.name}": ${s.samples} samples, ${s.bytes} bytes of V ROM`);
for (const w of warnings) console.log(`[EXPORT] ${w}`);
for (const p of builder.problems) console.log(`[BUILD] ${p}`);
for (const l of lint) console.log(`[LINT] ${l}`);
process.exit(builder.problems.length || lint.length ? 1 : 0);
