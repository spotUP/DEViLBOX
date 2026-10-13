#!/usr/bin/env npx tsx
/**
 * compare-batch.ts - the nuade vs UADE comparison batch (plan D8, NC-2). RESUMABLE: each (format, song) row goes to
 * tools/nuade/nuade-compare.json the moment it completes, recorded rows are skipped, and a run names what it runs.
 *
 *   npm run nuade-compare -- --only mmdc,robhubbard      formats by id (a recorded, unchanged row is skipped)
 *   npm run nuade-compare -- --only mmdc --failed        only the rows that failed
 *   npm run nuade-compare -- --fresh mmdc                forget one format's rows and measure it again
 *   npm run nuade-compare -- --all                       every format with no row yet (a full pass; say why)
 *
 *   --secs <n>   seconds rendered per song (default 30)
 *   --no-check   skip the instrument check (it runs when the file has none for this Nuade.wasm)
 *
 * No --jobs: the owner caps agent CPU at one test command at a time and a row takes about a second.
 * The pass rule itself is verdictRules.ts; tools/nuade/apply-verdicts.ts turns the rows into the table's fields.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NuadeHeadless } from '../../src/engine/nuade/nuadeHeadless';
import { NUADE_FORMAT_LIST, NUADE_FORMATS } from '../../src/engine/nuade/nuadeFormats';
import { compareSong, measureSwapMs, companionsOf, sha1, ROOT } from './nuadeCompare';
import { runBatch, loadResults, saveResults, type Job, type InstrumentCheck, type ResultsFile } from './batch';
import { songFailures } from './verdictRules';

export const RESULTS_PATH = join(ROOT, 'tools/nuade/nuade-compare.json');
const KNOWN_GOOD = { format: 'soundmon', song: 'public/data/songs/formats/antidust.bp3' };
const KNOWN_BAD = { format: 'davidwhittaker', song: 'public/data/songs/formats/apb.dw' };

const wasmSha = (): string => sha1(new Uint8Array(readFileSync(join(ROOT, 'public/nuade/Nuade.wasm'))));

export function jobsFor(): Job[] {
  const wasm = wasmSha();
  return NUADE_FORMAT_LIST.flatMap((f) => f.corpus.map((song, i) => ({
    format: f.id, song, first: i === 0, sha: sha1(new Uint8Array(readFileSync(join(ROOT, song)))) + wasm,
  })));
}

/**
 * NC-3: before any verdict is used, the instrument must give the two answers known from the research: antidust.bp3
 * passes the per-song rule, apb.dw does not.
 */
export async function instrumentCheck(nu: NuadeHeadless, secs: number): Promise<InstrumentCheck> {
  const run = async (k: { format: string; song: string }) => {
    const m = await compareSong(nu, NUADE_FORMATS[k.format]!, k.song, secs);
    return { song: k.song, correlation: m.correlation, pass: songFailures({ ...m, song: k.song }).length === 0 };
  };
  const known_good = await run(KNOWN_GOOD), known_bad = await run(KNOWN_BAD);
  return { wasm: wasmSha(), known_good, known_bad, ok: known_good.pass && !known_bad.pass };
}

async function main(): Promise<void> {
  const a = process.argv.slice(2);
  const val = (k: string) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const fresh = val('--fresh');
  const only = fresh ? [fresh] : val('--only')?.split(',').filter(Boolean);
  const secs = Number(val('--secs') ?? 30);
  if (!only?.length && !fresh && !a.includes('--all')) {
    console.error('Name what to run: --only <id,...>, --fresh <id>, or --all (a full pass over every format with no row yet; give a reason).');
    process.exit(2);
  }
  const unknown = [...(only ?? []), ...(fresh ? [fresh] : [])].filter((id) => !NUADE_FORMATS[id]);
  if (unknown.length) { console.error(`Unknown format id: ${unknown.join(', ')}`); process.exit(2); }

  const nu = await NuadeHeadless.create();
  const file: ResultsFile = loadResults(RESULTS_PATH);
  if (!a.includes('--no-check') && file.instrument?.wasm !== wasmSha()) {
    file.instrument = await instrumentCheck(nu, secs);
    saveResults(RESULTS_PATH, file);
  }
  const ic = file.instrument;
  if (ic) {
    console.log(`INSTRUMENT ${ic.ok ? 'OK' : 'BROKEN'}: ${ic.known_good.song.split('/').pop()} ${ic.known_good.correlation.toFixed(3)} (${ic.known_good.pass ? 'pass' : 'FAIL'}, must pass), ${ic.known_bad.song.split('/').pop()} ${ic.known_bad.correlation.toFixed(3)} (${ic.known_bad.pass ? 'PASS' : 'fail'}, must fail)`);
    if (!ic.ok) { console.error('The instrument does not reproduce the known answers; no verdict from this file may be used.'); process.exit(3); }
  }

  const res = await runBatch({
    jobs: jobsFor(), file, path: RESULTS_PATH, selection: { only, failedOnly: a.includes('--failed'), fresh },
    log: (l) => console.log(l),
    measure: async (job) => {
      const row = NUADE_FORMATS[job.format]!;
      const m = await compareSong(nu, row, job.song, secs);
      const swapMs = job.first
        ? await measureSwapMs(nu, new Uint8Array(readFileSync(join(ROOT, job.song))), job.song.split('/').pop()!, row.id, 120, companionsOf(row, job.song))
        : undefined;
      return { ...m, ...(swapMs !== undefined ? { swapMs } : {}) };
    },
  });
  console.log(`ran ${res.ran}, skipped ${res.skipped} already recorded`);
}

if (process.argv[1]?.endsWith('compare-batch.ts')) void main();
