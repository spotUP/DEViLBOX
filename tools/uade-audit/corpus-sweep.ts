#!/usr/bin/env npx tsx
/**
 * corpus-sweep.ts — play EVERY song in the corpus headlessly and write a table.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  The HEADLESS half of DEViLBOX's sound test. No browser, no dev server, no
 *  AudioContext, and NO AUDIBLE OUTPUT — it renders to a buffer and measures
 *  it. The browser half is tools/playback-smoke-test.ts, which plays through
 *  the real engines and needs a tab open. Do not merge them: the whole value
 *  is the split.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npx tsx --tsconfig tsconfig.app.json tools/uade-audit/corpus-sweep.ts
 *
 * WHY THE SPLIT. "Song X sounds wrong" costs a browser round: start the dev
 * server, open a tab, unlock audio, load the file, listen. That is the right
 * instrument for "wrong" and a very expensive one for "not there at all". This
 * tool answers the machine-readable half — refused, silent, ends instantly,
 * ends early, crashes — over the whole corpus in one pass, so the ear is only
 * spent on the rows that actually need it. A file that plays here and not in
 * the browser is OURS (engine, worklet, routing); a file that fails here is
 * CONTENT (a broken module, a missing sample file).
 *
 * WHAT IT MEASURES, and why each one is the honest signal:
 *   verdict     see soundVerdict.ts — PLAYS / SILENT / INSTANT-END / SHORT /
 *               REFUSED / CRASHED / TIMEOUT, plus the not-judged rows
 *               (COMPANION, NOT-UADE, SKIPPED) so every file is accounted for.
 *   peak, rms   taken from the rendered samples themselves. This is the ground
 *               truth: we hold the audio, so nothing is inferred.
 *   dmaMax      how many of Paula's four channels ever had DMA on. A tune that
 *               PLAYS on one channel is usually a tune with three dead ones.
 *               DMA, not volume: on real hardware AUDxVOL is WRITE-ONLY and
 *               reads back junk, so the device-side twin can only report DMA,
 *               and the two tables have to compare.
 *   player      which eagleplayer accepted it, straight from the WASM.
 *   subsongs    the reported range. Its MINIMUM is frequently not 0 — a check
 *               that assumes subsong 0 reports healthy modules as empty.
 *   companions  the sidecars that were registered for it, resolved by the very
 *               function the app's drag-drop uses (src/lib/import/
 *               companionResolver.ts). Without them a two-file format dies
 *               exactly like a broken one.
 *   engine      for files DEViLBOX does not give to UADE, the engine that owns
 *               them, from the FormatRegistry. Named, never silently dropped.
 *
 * RESUMABLE. Every row is written to the results file the moment it completes,
 * so an interrupted run resumes where it stopped — `--fresh` starts over. A
 * module that kills the WASM is recorded as CRASHED and the worker restarts,
 * so one bad file cannot cost the whole sweep.
 *
 * OPTIONS
 *   --dir <path>     corpus root (default public/data/songs/formats)
 *   --only <a,b>     only paths containing one of these substrings
 *   --secs <n>       seconds to render per song (default 6)
 *   --jobs <n>       parallel worker processes (default 4)
 *   --timeout <s>    per-song deadline before TIMEOUT (default 60)
 *   --limit <n>      stop after n songs (for a quick look)
 *   --out <path>     results file (default test-data/uade-corpus-sweep.json)
 *   --fresh          ignore existing rows
 *   --quiet          only print the summary
 *
 * OTHER AUDIT SCRIPTS: see the header of tools/playback-smoke-test.ts.
 */

import { spawn } from 'child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'fs';
import { basename, dirname, join, relative } from 'path';
import { detectFormat, detectFormatFromContent } from '../../src/lib/import/FormatRegistry';
import {
  listingFromRelativePaths, resolveCompanions,
} from '../../src/lib/import/companionResolver';
import {
  addCompanions, channelsWithDma, loadUADEModule, readMeta, renderToSamples,
  PROJECT_ROOT, type UADEModule,
} from './uadeRenderCore';
import {
  classifyRender, isNonMusic, missingCompanion, refusalReason, routesToUADE,
  BAD_VERDICTS, type Verdict,
} from './soundVerdict';

const SAMPLE_RATE = 44100;
const DEFAULT_CORPUS = join(PROJECT_ROOT, 'public/data/songs/formats');
const DEFAULT_OUT = join(PROJECT_ROOT, 'test-data/uade-corpus-sweep.json');

// ── Row ───────────────────────────────────────────────────────────────────────

interface Row {
  verdict: Verdict;
  /** FormatRegistry key, or null when the registry does not know the name. */
  format: string | null;
  /** The engine that owns this format when it is not UADE. */
  engine?: string;
  player?: string;
  formatName?: string;
  subsongs?: [number, number];
  frames?: number;
  peak?: number;
  rms?: number;
  dmaMax?: number;
  companions?: string[];
  /** The sidecar a player asked for and did not get. */
  missing?: string;
  /** UADE's own words when it refused, or the thrown error. */
  why?: string;
  ms?: number;
}

type Rows = Record<string, Row>;

// ── Corpus walk ───────────────────────────────────────────────────────────────

function walk(root: string): string[] {
  const out: string[] = [];
  const recurse = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) recurse(p);
      else if (statSync(p).isFile()) out.push(relative(root, p));
    }
  };
  recurse(root);
  return out.sort();
}

/**
 * Which sidecars each file wants, and who claims whom.
 *
 * Resolved per directory, because a companion is named relative to its module's
 * directory — the same shape the app's folder drop produces.
 *
 * The claim is SYMMETRIC and cannot say which half is the song: `sjs.tim1` and
 * `smp.tim1` each name the other, and so do `mdat.x`/`smpl.x`. Guessing the
 * direction from a list of role words means keeping a second table beside
 * companionResolver's, and being wrong about it silently. So this returns the
 * claim graph and nothing else — the direction is settled afterwards by
 * measurement, in reconcileCompanions(): the sample half is the half no
 * eagleplayer will take.
 */
function companionMap(root: string, files: string[]): {
  wants: Map<string, string[]>;
  claimedBy: Map<string, string[]>;
} {
  const byDir = new Map<string, string[]>();
  for (const rel of files) {
    const dir = dirname(rel);
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(rel);
  }
  const wants = new Map<string, string[]>();
  const sourcesOf = new Map<string, Record<string, string>>();
  const claimedBy = new Map<string, string[]>();
  for (const [dir, inDir] of byDir) {
    // The listing a module in `dir` sees: its siblings, plus one level of
    // subdirectories (instr/, Samples/) named the way the player opens them.
    const subFiles = files.filter((f) => dirname(dirname(f)) === dir);
    const names = [
      ...inDir.map((f) => basename(f)),
      ...subFiles.map((f) => relative(dir, f)),
    ];
    const listing = listingFromRelativePaths(names);
    for (const rel of inDir) {
      const resolved = resolveCompanions(basename(rel), listing);
      if (resolved.companions.length === 0) continue;
      wants.set(rel, resolved.companions);
      sourcesOf.set(rel, resolved.sources);
      for (const c of resolved.companions) {
        const from = resolved.sources[c] ?? c;
        const target = dir === '.' ? from : join(dir, from);
        (claimedBy.get(target) ?? claimedBy.set(target, []).get(target)!).push(rel);
      }
    }
  }
  return { wants, claimedBy, sourcesOf };
}

/**
 * Turn "refused, and something else in the directory asked for it by name" into
 * COMPANION.
 *
 * A sample file is not a broken song, and 142 of them in the REFUSED column is
 * how a table stops being read. The guard is that the claimer must itself have
 * played: if BOTH halves refuse, the pair is a genuine failure and both rows
 * stay REFUSED, which is the case a curated role table would have buried.
 */
function reconcileCompanions(rows: Rows, claimedBy: Map<string, string[]>): void {
  for (const [rel, row] of Object.entries(rows)) {
    if (row.verdict !== 'REFUSED') continue;
    const claimers = claimedBy.get(rel);
    if (!claimers?.length) continue;
    const aClaimerPlayed = claimers.some((c) => {
      const v = rows[c]?.verdict;
      return v !== undefined && v !== 'REFUSED' && v !== 'CRASHED' && v !== 'COMPANION';
    });
    if (aClaimerPlayed) rows[rel] = { verdict: 'COMPANION', format: row.format, why: `claimed by ${claimers[0]}` };
  }
}

/**
 * Directories that hold the instrument half of a format, never songs.
 *
 * companionResolver names these when it collects sidecars, but it takes only
 * the files a player will ASK for — SunTronic's `instr/*.x`, and not the 46
 * other files sitting in the same instr/. Those are still instruments, and
 * rendering them produces 46 REFUSED rows about files nobody claimed. Location
 * settles it: nothing puts a song in instr/.
 */
const SAMPLE_DIRS = new Set(['instr', 'instruments', 'samples']);

function inSampleDirectory(rel: string): boolean {
  const dir = dirname(rel).split('/').pop() ?? '';
  return SAMPLE_DIRS.has(dir.toLowerCase());
}

// ── Worker: render one file ───────────────────────────────────────────────────

interface Job {
  rel: string;
  abs: string;
  /** name the player opens it by -> absolute path on disk */
  companions: { name: string; path: string }[];
  secs: number;
}

async function renderOne(job: Job): Promise<Row> {
  const t0 = Date.now();
  const said: string[] = [];
  const requestedFrames = SAMPLE_RATE * job.secs;
  let mod: UADEModule | null = null;
  try {
    mod = await loadUADEModule(false, (line) => { if (said.length < 24) said.push(line); });
    if (mod._uade_wasm_init(SAMPLE_RATE) !== 0) {
      return { verdict: 'CRASHED', format: null, why: 'uade_wasm_init failed', ms: Date.now() - t0 };
    }
    addCompanions(mod, job.companions.map((c) => ({ name: c.name, data: readFileSync(c.path) })));

    const snapshotPtr = mod._malloc(64);
    let dmaMax = 0;
    const result = await renderToSamples(mod, readFileSync(job.abs), basename(job.abs), {
      sampleRate: SAMPLE_RATE,
      seconds: job.secs,
      onChunk: (m) => {
        const on = channelsWithDma(m, snapshotPtr);
        if (on > dmaMax) dmaMax = on;
      },
    });
    mod._free(snapshotPtr);

    let peak = 0;
    let acc = 0;
    for (let i = 0; i < result.samples.length; i++) {
      const a = Math.abs(result.samples[i]);
      if (a > peak) peak = a;
      acc += result.samples[i] * result.samples[i];
    }
    const meta = readMeta(mod);
    return {
      verdict: classifyRender({ frames: result.frames, requestedFrames, peak }),
      format: null,
      player: meta.player,
      formatName: meta.formatName,
      subsongs: [meta.subsongMin, meta.subsongMax],
      frames: result.frames,
      peak: Number(peak.toFixed(5)),
      rms: Number(Math.sqrt(acc / Math.max(1, result.samples.length)).toFixed(5)),
      dmaMax,
      companions: job.companions.map((c) => c.name),
      ms: Date.now() - t0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A load that returns non-zero is a refusal, not a crash: no player took it.
    // And a player that asked for a file it did not get is neither — that is a
    // hole in the corpus, and it is named.
    const missing = missingCompanion(said);
    const verdict: Verdict = missing ? 'MISSING-COMPANION'
      : /_uade_wasm_load failed/.test(msg) ? 'REFUSED' : 'CRASHED';
    return {
      verdict,
      format: null,
      ...(missing ? { missing } : {}),
      why: refusalReason(said) || msg,
      companions: job.companions.map((c) => c.name),
      ms: Date.now() - t0,
    };
  } finally {
    try { mod?._uade_wasm_cleanup(); } catch { /* the module may already be dead */ }
  }
}

async function runWorker(slicePath: string): Promise<void> {
  const jobs = JSON.parse(readFileSync(slicePath, 'utf8')) as Job[];
  for (const job of jobs) {
    // Announced BEFORE the work, so a crash tells the parent which file did it.
    process.stdout.write(`${JSON.stringify({ t: 'begin', p: job.rel })}\n`);
    const row = await renderOne(job);
    process.stdout.write(`${JSON.stringify({ t: 'row', p: job.rel, row })}\n`);
  }
}

// ── Parent: pool, persistence, summary ────────────────────────────────────────

function writeRows(out: string, rows: Rows): void {
  const ordered: Rows = {};
  for (const k of Object.keys(rows).sort()) ordered[k] = rows[k];
  // Write-then-rename: an interrupt during the write must not truncate the
  // results file, or "resumable" means "resumable until the one time it matters".
  writeFileSync(`${out}.tmp`, JSON.stringify(ordered, null, 1));
  renameSync(`${out}.tmp`, out);
}

function engineOf(fmt: NonNullable<ReturnType<typeof detectFormat>>): string {
  switch (fmt.family) {
    case 'midi': return 'midi';
    case 'furnace': return 'furnace';
    case 'c64-chip': return 'sid';
    case 'chip-dump': return 'chip-dump';
    case 'libopenmpt': return fmt.nativeParser ? 'native+libopenmpt' : 'libopenmpt';
    case 'pc-tracker': return fmt.nativeParser ? 'native+libopenmpt' : 'libopenmpt';
    default: return fmt.nativeParser ? 'native' : fmt.family;
  }
}

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s.padEnd(n);
}

function runSlice(
  slicePath: string,
  timeoutMs: number,
  onRow: (rel: string, row: Row) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const jobs = JSON.parse(readFileSync(slicePath, 'utf8')) as Job[];
    const done = new Set<string>();

    const start = (): void => {
      const remaining = jobs.filter((j) => !done.has(j.rel));
      if (remaining.length === 0) { resolve(); return; }
      writeFileSync(slicePath, JSON.stringify(remaining));

      // process.argv[1] is this very script as the runner resolved it, and
      // execArgv carries tsx's loader — a child spawned any other way cannot
      // import TypeScript.
      const child = spawn(process.execPath, [...process.execArgv, process.argv[1], '--worker', slicePath], {
        stdio: ['ignore', 'pipe', 'inherit'],
        env: process.env,
      });
      let current = remaining[0].rel;
      let buf = '';
      let deadline = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      let timedOut = false;

      child.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.startsWith('{"t":')) continue;
          const msg = JSON.parse(line) as { t: string; p: string; row?: Row };
          if (msg.t === 'begin') {
            current = msg.p;
            clearTimeout(deadline);
            deadline = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
          } else if (msg.t === 'row' && msg.row) {
            done.add(msg.p);
            onRow(msg.p, msg.row);
          }
        }
      });

      child.on('exit', (code) => {
        clearTimeout(deadline);
        if (done.size === jobs.length) { resolve(); return; }
        if (code !== 0 || timedOut) {
          // The worker died on `current`. Record it so the next pass does not
          // walk into the same wall, then carry on with the rest.
          if (!done.has(current)) {
            done.add(current);
            onRow(current, {
              verdict: timedOut ? 'TIMEOUT' : 'CRASHED',
              format: null,
              why: timedOut ? `no result within ${timeoutMs / 1000}s` : `worker exited ${code}`,
            });
          }
        }
        start();
      });
    };
    start();
  });
}

async function runParent(argv: string[]): Promise<void> {
  const flag = (name: string, dflt: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  const has = (name: string): boolean => argv.includes(`--${name}`);

  const root = flag('dir', DEFAULT_CORPUS);
  const out = flag('out', DEFAULT_OUT);
  const secs = Number(flag('secs', '6'));
  const jobsN = Math.max(1, Number(flag('jobs', '4')));
  const timeoutMs = Number(flag('timeout', '60')) * 1000;
  const limit = Number(flag('limit', '0'));
  const only = flag('only', '').split(',').map((s) => s.trim()).filter(Boolean);
  const quiet = has('quiet');
  const fresh = has('fresh');

  if (!existsSync(root)) { console.error(`corpus-sweep: no such corpus dir: ${root}`); process.exit(1); }
  mkdirSync(dirname(out), { recursive: true });

  const files = walk(root);
  const { wants, claimedBy, sourcesOf } = companionMap(root, files);
  const rows: Rows = fresh || !existsSync(out) ? {} : JSON.parse(readFileSync(out, 'utf8')) as Rows;

  // Everything that can be settled without touching the WASM is settled here,
  // so the expensive pass only ever sees files that are actually songs for UADE.
  const todo: Job[] = [];
  for (const rel of files) {
    if (only.length && !only.some((s) => rel.toLowerCase().includes(s.toLowerCase()))) continue;
    // The two static facts are re-asserted on every run, recorded row or not:
    // they cost nothing and they are not measurements to preserve.
    if (isNonMusic(rel)) { rows[rel] = { verdict: 'SKIPPED', format: null }; continue; }
    if (inSampleDirectory(rel)) {
      rows[rel] = { verdict: 'COMPANION', format: null, why: `in ${dirname(rel).split('/').pop()}/` };
      continue;
    }
    if (rows[rel] && !fresh) continue;
    const fmt = detectFormatFromContent(basename(rel), readFileSync(join(root, rel)).subarray(0, 128));
    if (!routesToUADE(fmt)) {
      rows[rel] = { verdict: 'NOT-UADE', format: fmt!.key, engine: engineOf(fmt!) };
      continue;
    }
    todo.push({
      rel,
      abs: join(root, rel),
      companions: (wants.get(rel) ?? []).map((name) => {
        // Registered under `name`, read from the resolver's source when it differs.
        const from = sourcesOf.get(rel)?.[name] ?? name;
        return { name, path: join(root, dirname(rel) === '.' ? from : join(dirname(rel), from)) };
      }).filter((c) => existsSync(c.path)),
      secs,
    });
    if (limit && todo.length >= limit) break;
  }
  writeRows(out, rows);

  console.log(
    `corpus-sweep: ${files.length} files in ${root}\n`
    + `  ${todo.length} to render through UADE, ${Object.keys(rows).length} already settled `
    + `(${jobsN} workers, ${secs}s each)`,
  );

  const slices: Job[][] = Array.from({ length: jobsN }, () => []);
  todo.forEach((j, i) => slices[i % jobsN].push(j));

  let n = 0;
  const onRow = (rel: string, row: Row): void => {
    const fmt = detectFormatFromContent(basename(rel), readFileSync(join(root, rel)).subarray(0, 128));
    row.format = fmt?.key ?? null;
    rows[rel] = row;
    writeRows(out, rows);   // every row, immediately: an interrupt costs one song
    n++;
    const bad = (BAD_VERDICTS as readonly string[]).includes(row.verdict);
    if (!quiet && bad) {
      console.log(
        `${String(n).padStart(4)} ${pad(rel, 44)} ${pad(row.player ?? row.format ?? '', 22)} `
        + `${pad(row.verdict, 11)} dma=${row.dmaMax ?? '-'} peak=${row.peak ?? '-'}`
        + `${row.subsongs ? ` sub=${row.subsongs[0]}-${row.subsongs[1]}` : ''}`
        + `${row.missing ? ` missing=${row.missing}` : ''}`
        + `${row.why ? ` why=${row.why}` : ''}`,
      );
    }
  };

  const sliceFiles = slices.map((s, i) => {
    const p = `${out}.slice${i}.json`;
    writeFileSync(p, JSON.stringify(s));
    return p;
  });
  await Promise.all(sliceFiles.map((p) => runSlice(p, timeoutMs, onRow)));
  for (const p of sliceFiles) { try { rmSync(p, { force: true }); } catch { /* ignore */ } }

  // ── Summary ────────────────────────────────────────────────────────────────
  reconcileCompanions(rows, claimedBy);
  writeRows(out, rows);
  const tally = new Map<Verdict, string[]>();
  for (const [rel, row] of Object.entries(rows)) {
    (tally.get(row.verdict) ?? tally.set(row.verdict, []).get(row.verdict)!).push(rel);
  }
  const count = (v: Verdict): number => tally.get(v)?.length ?? 0;
  console.log(
    `\n${Object.keys(rows).length} files: ${count('PLAYS')} play, ${count('SILENT')} silent, `
    + `${count('INSTANT-END')} instant-end, ${count('SHORT')} short, `
    + `${count('MISSING-COMPANION')} missing a sidecar, ${count('REFUSED')} refused, `
    + `${count('CRASHED')} crashed, ${count('TIMEOUT')} timed out`,
  );
  console.log(
    `not judged here: ${count('NOT-UADE')} other engines, ${count('COMPANION')} sample files, `
    + `${count('SKIPPED')} not music`,
  );
  const oneVoice = Object.entries(rows).filter(([, r]) => r.verdict === 'PLAYS' && r.dmaMax === 1);
  if (oneVoice.length) console.log(`plays on ONE voice: ${oneVoice.length} (${oneVoice.slice(0, 6).map(([k]) => k).join(', ')}${oneVoice.length > 6 ? ', …' : ''})`);
  for (const v of BAD_VERDICTS) {
    const list = tally.get(v);
    if (list?.length) {
      console.log(`\n${v} (${list.length}):`);
      for (const rel of list) {
        const r = rows[rel];
        console.log(`  ${pad(rel, 48)} ${pad(r.format ?? '?', 16)} ${r.missing ?? r.why ?? ''}`);
      }
    }
  }
  console.log(`\nrows -> ${out}`);
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const workerAt = argv.indexOf('--worker');
if (workerAt >= 0) {
  void runWorker(argv[workerAt + 1]);
} else {
  void runParent(argv);
}
