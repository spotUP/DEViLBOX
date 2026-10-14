#!/usr/bin/env npx tsx
/**
 * Probe census (NUADE-10-UNMEASURED-RECHECK): runs EVERY tracked file under public/data/songs and every file under
 * server/data/modland-cache/files through nuade's own probe and records which player ids accept each file. Counted from
 * the structure (the probe), not from names. RESUMABLE: thoughts/spot/nuade-probe-census.json is flushed every 200
 * files, recorded files (same size) are skipped.   npx tsx --tsconfig tsconfig.app.json tools/nuade/probeCensus.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NuadeHeadless } from '../../src/engine/nuade/nuadeHeadless';

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'thoughts/spot/nuade-probe-census.json');
const MAX_BYTES = 3 * 1024 * 1024;
type Entry = { size: number; ids: string[] };
const done: Record<string, Entry> = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as { files: Record<string, Entry> }).files : {};

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}
const tracked = execFileSync('git', ['ls-files', 'public/data/songs'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\n').filter(Boolean);
const cache = existsSync(join(ROOT, 'server/data/modland-cache/files')) ? [...walk(join(ROOT, 'server/data/modland-cache/files'))].map((p) => p.slice(ROOT.length + 1)) : [];
const nu = await NuadeHeadless.create();
const ids = nu.playerIds();
const save = () => writeFileSync(OUT, JSON.stringify({ players: ids.length, files: done }, null, 0));
let n = 0, ran = 0;
for (const rel of [...tracked, ...cache]) {
  n++;
  const abs = join(ROOT, rel);
  let size: number;
  try { size = statSync(abs).size; } catch { continue; }
  if (done[rel]?.size === size) continue;
  if (size > MAX_BYTES || size === 0) { done[rel] = { size, ids: [] }; continue; }
  const bytes = new Uint8Array(readFileSync(abs));
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  done[rel] = { size, ids: ids.filter((id) => nu.probeWith(id, bytes, name) === 0) };
  if (++ran % 200 === 0) { save(); console.log(`${n}/${tracked.length + cache.length}`); }
}
save();
console.log(`done: ${Object.keys(done).length} files, ${ran} probed this run`);
