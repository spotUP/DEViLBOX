#!/usr/bin/env npx tsx
/**
 * Probe census (NUADE-10-UNMEASURED-RECHECK): runs EVERY tracked file under public/data/songs and every file under
 * server/data/modland-cache/files through nuade's own probe and records which player ids accept each file. Counted from
 * the structure (the probe), not from names. Records Supported (ids) and Unsure (unsure) separately.
 * --only <id,...> probes just those players for Unsure (merged into the entries, scope recorded). RESUMABLE: thoughts/spot/nuade-probe-census.json is flushed every 200
 * files, recorded files (same size) are skipped.   npx tsx --tsconfig tsconfig.app.json tools/nuade/probeCensus.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NuadeHeadless } from '../../src/engine/nuade/nuadeHeadless';
import { classifyProbes, mergeUnsure, unsureCovered, type CensusEntry } from '../../src/engine/nuade/nuadeProbeCensus';

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'thoughts/spot/nuade-probe-census.json');
const MAX_BYTES = 3 * 1024 * 1024;
type Entry = CensusEntry;
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
const allIds = nu.playerIds();
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',').filter(Boolean) : undefined;
if (only?.some((id) => !allIds.includes(id))) throw new Error(`unknown player id in --only: ${only.filter((id) => !allIds.includes(id)).join(',')}`);
const ids = only ?? allIds;
const save = () => writeFileSync(OUT, JSON.stringify({ players: allIds.length, files: done }, null, 0));
let n = 0, ran = 0;
for (const rel of [...tracked, ...cache]) {
  n++;
  const abs = join(ROOT, rel);
  let size: number;
  try { size = statSync(abs).size; } catch { continue; }
  if (done[rel]?.size === size && unsureCovered(done[rel], ids)) continue;
  if (size > MAX_BYTES || size === 0) { done[rel] = { size, ids: [], unsure: [], unsureScope: 'all' }; continue; }
  const bytes = new Uint8Array(readFileSync(abs));
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const r = classifyProbes(ids, (id) => nu.probeWith(id, bytes, name));
  const prev = done[rel]?.size === size ? done[rel] : { size, ids: [] };
  // Supported is only (re)written for the probed ids; a subset run keeps other players' Supported answers.
  const supported = only ? [...prev.ids.filter((id) => !only.includes(id)), ...r.supported] : r.supported;
  done[rel] = mergeUnsure({ ...prev, ids: supported }, ids, r.unsure, allIds);
  if (++ran % 200 === 0) { save(); console.log(`${n}/${tracked.length + cache.length}`); }
}
save();
if (only) for (const id of only) {
  const u = Object.entries(done).filter(([, e]) => e.unsure?.includes(id)).map(([f]) => f);
  console.log(`${id}: ${Object.values(done).filter((e) => e.ids.includes(id)).length} supported, ${u.length} unsure`);
  for (const f of u.slice(0, 12)) console.log(`  ${f}`);
}
console.log(`done: ${Object.keys(done).length} files, ${ran} probed this run`);
