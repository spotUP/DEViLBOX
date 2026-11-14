/**
 * Build a ProTracker song spec into a 4-channel M.K. .mod with the repo's MOD exporter.
 * Usage: npx tsx --tsconfig tsconfig.app.json tools/protracker-compose/run.ts <song-name> <out.mod>
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { exportSongToMOD } from '@/lib/export/modExport';
import { toTrackerSong, type ModSongSpec } from './compose';

const [name, out] = process.argv.slice(2);
if (!name || !out) {
  console.error('usage: run.ts <song-name> <out.mod>');
  process.exit(2);
}
const mod = await import(pathToFileURL(resolve(import.meta.dirname, 'songs', `${name}.ts`)).href);
const spec: ModSongSpec = mod.default();
const { blob, warnings } = await exportSongToMOD(toTrackerSong(spec), { moduleName: spec.title });
const bytes = new Uint8Array(await blob.arrayBuffer());

// Self-check: the file is the size the spec implies and carries the tag and order list.
const pcmBytes = spec.samples.reduce((n, s) => n + s.pcm.length + (s.pcm.length & 1), 0);
assert.equal(bytes.length, 1084 + spec.patterns.length * 1024 + pcmBytes, 'file size');
assert.equal(String.fromCharCode(...bytes.subarray(1080, 1084)), 'M.K.');
assert.deepEqual([...bytes.subarray(952, 952 + spec.order.length)], spec.order);

mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, bytes);
console.log(`[OK] ${out}: ${bytes.length} bytes, ${spec.patterns.length} patterns, order ${spec.order.join(' ')}`);
for (const w of warnings) console.log(`[EXPORT] ${w}`);
process.exit(warnings.length ? 1 : 0);
