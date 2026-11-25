/**
 * Harvest real wavetables from the .fur and .dmf songs under public/data/songs
 * into public/data/wavetables/corpus-waves.json for the Waveform Studio preset
 * browser. Songs load through Furnace's own C++ loader (FurnaceFileOps WASM),
 * the same path the app imports them with. Dedupe and chip tagging live in
 * corpusWaves.ts (tested there).
 *
 *   npx tsx --tsconfig tsconfig.app.json tools/harvest-corpus-waves.ts [--only <path part>] [--failed]
 *
 * Resumable: each song's result is recorded in test-data/corpus-waves-harvest.json
 * as it completes and skipped on the next run; --failed re-runs the failed rows,
 * --only re-runs the songs whose path contains the given text. The bank is
 * rebuilt from every recorded row.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadFurFileWasm } from '../src/lib/import/wasm/FurnaceFileOps';
import { FILE_ID_TO_ENUM } from '../src/lib/import/formats/FurnaceSongParser';
import {
  harvestSongWaves, type CorpusWave, type HarvestWaveInput,
} from '../src/components/instruments/editors/wavetable/corpusWaves';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/data/songs');
const OUT = path.join(ROOT, 'public/data/wavetables/corpus-waves.json');
const RESULTS = path.join(ROOT, 'test-data/corpus-waves-harvest.json');

type Row = { ok: true; fileIds: number[]; waves: HarvestWaveInput[] } | { ok: false; error: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(fur|dmf)$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** FurnaceFileOps loads its glue through a <script> tag; answer that tag in Node. */
function installNodeLoader(): void {
  const dir = path.join(ROOT, 'public/furnace-fileops');
  const js = readFileSync(path.join(dir, 'FurnaceFileOps.js'), 'utf8');
  const wasmBinary = readFileSync(path.join(dir, 'FurnaceFileOps.wasm'));
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = {
    createElement: () => ({}),
    head: {
      appendChild: (node: { onload?: () => void }) => {
        (0, eval)(js);
        const factory = g.createFurnaceFileOps as (o: object) => Promise<unknown>;
        g.createFurnaceFileOps = () => factory({
          wasmBinary,
          instantiateWasm: (imports: WebAssembly.Imports, done: (i: WebAssembly.Instance) => void) => {
            void WebAssembly.instantiate(wasmBinary, imports).then((r) => done(r.instance));
            return {};
          },
        });
        queueMicrotask(() => node.onload?.());
      },
    },
  };
}

const ENUM_TO_FILE_ID = new Map(Object.entries(FILE_ID_TO_ENUM).map(([file, e]) => [e, Number(file)]));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
  const retryFailed = args.includes('--failed');
  installNodeLoader();
  const results: Record<string, Row> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
  const files = walk(SONGS).sort();
  const log = console.log;
  const save = (): void => { mkdirSync(path.dirname(RESULTS), { recursive: true }); writeFileSync(RESULTS, JSON.stringify(results)); };
  let done = 0;
  for (const file of files) {
    const rel = path.relative(SONGS, file);
    const prev = results[rel];
    const wanted = only ? rel.includes(only) : !prev || (retryFailed && !prev.ok);
    if (!wanted) continue;
    const raw = readFileSync(file);
    try {
      console.log = () => {}; // the loader logs per section
      const song = await loadFurFileWasm(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
      results[rel] = {
        ok: true,
        fileIds: song.chipIds.map((id) => ENUM_TO_FILE_ID.get(id) ?? -1),
        waves: song.wavetables.map((w) => ({ max: w.height, data: w.data })),
      };
    } catch (err) {
      results[rel] = { ok: false, error: (err as Error).message };
    } finally {
      console.log = log;
    }
    if (++done % 100 === 0) save();
  }
  save();

  const bank: CorpusWave[] = [];
  const seen = new Map<string, CorpusWave>();
  const failures: string[] = [];
  for (const file of files) {
    const rel = path.relative(SONGS, file);
    const row = results[rel];
    if (!row) continue;
    if (!row.ok) { failures.push(`${rel}: ${row.error}`); continue; }
    harvestSongWaves(bank, seen, path.basename(file), row.fileIds, row.waves);
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(bank));
  const perChip: Record<string, number> = {};
  for (const w of bank) for (const c of w.chips) perChip[c] = (perChip[c] ?? 0) + 1;
  console.log(`files ${files.length}, loaded now ${done}, failed ${failures.length}, waves ${bank.length}, bytes ${statSync(OUT).size}`);
  console.log(JSON.stringify(perChip));
  for (const f of failures.slice(0, 10)) console.log(`failed: ${f}`);
}

void main();
