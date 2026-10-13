/**
 * The resumable core of the nuade comparison batch (plan D8, NC-2). One row per (format, song) is written to the
 * results file the moment it completes; a recorded row is skipped on the next run unless its input changed (the
 * song's bytes or Nuade.wasm); `only` and `failedOnly` select, `fresh` forgets one format. The renderer is injected,
 * so the resume / selection rules are tested without rendering anything (nuadeCompareBatch.test.ts).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { SongMeasure } from './verdictRules';
import { songFailures } from './verdictRules';

export const RESULTS_VERSION = 1;

export interface ResultRow extends SongMeasure {
  format: string;
  windowSecs: number;
  voices: number;
  player: string;
  /** nuade open + seek to the 120 s mark in ms, measured on the format's first corpus song only. */
  swapMs?: number;
  /** Dual rows: why our engine could not be rendered for this song. */
  ownError?: string;
  /** Pass for this song alone (the per-song part of the rule). */
  songPass: boolean;
  ms: number;
  /** sha1 of the song bytes + Nuade.wasm: a row is stale when either changed. */
  sha: string;
}

export interface InstrumentCheck {
  /** sha of Nuade.wasm the check ran with. */
  wasm: string;
  known_good: { song: string; correlation: number; pass: boolean };
  known_bad: { song: string; correlation: number; pass: boolean };
  ok: boolean;
}

export interface ResultsFile { version: number; instrument: InstrumentCheck | null; rows: ResultRow[] }

export const emptyResults = (): ResultsFile => ({ version: RESULTS_VERSION, instrument: null, rows: [] });

export function loadResults(path: string): ResultsFile {
  if (!existsSync(path)) return emptyResults();
  const f = JSON.parse(readFileSync(path, 'utf8')) as ResultsFile;
  return f.version === RESULTS_VERSION ? f : emptyResults();
}

/** Write via a temp file and a rename, so an interrupted run never leaves half a file. */
export function saveResults(path: string, f: ResultsFile): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(f, null, 1) + '\n');
  renameSync(`${path}.tmp`, path);
}

export interface Job { format: string; song: string; first: boolean; sha: string }

export interface Selection {
  /** Format ids; empty = every format. */
  only?: string[];
  failedOnly?: boolean;
  /** One format id whose rows are forgotten first. */
  fresh?: string;
}

/** Rows that must be (re)measured: not recorded, stale, or (failedOnly) recorded as failing. */
export function pendingJobs(all: Job[], file: ResultsFile, sel: Selection): Job[] {
  const only = sel.only?.length ? new Set(sel.only) : null;
  return all.filter((j) => {
    if (only && !only.has(j.format)) return false;
    if (sel.fresh === j.format) return true;
    const rec = file.rows.find((r) => r.format === j.format && r.song === j.song);
    if (!rec || rec.sha !== j.sha) return !sel.failedOnly || !!only;
    return sel.failedOnly ? !rec.songPass : false;
  });
}

export interface BatchDeps {
  jobs: Job[];
  file: ResultsFile;
  path: string;
  selection: Selection;
  /** Measures one job into a row (without `format`/`song` bookkeeping fields the batch fills in). */
  measure: (job: Job) => Promise<Omit<ResultRow, 'format' | 'song' | 'songPass' | 'sha' | 'ms'>>;
  log?: (line: string) => void;
  /** Called after each row is on disk (tests use it to interrupt a run). */
  afterRow?: (row: ResultRow) => void;
}

export async function runBatch(d: BatchDeps): Promise<{ ran: number; skipped: number }> {
  const log = d.log ?? (() => undefined);
  if (d.selection.fresh) d.file.rows = d.file.rows.filter((r) => r.format !== d.selection.fresh);
  const todo = pendingJobs(d.jobs, d.file, d.selection);
  const selected = d.jobs.filter((j) => !d.selection.only?.length || d.selection.only.includes(j.format));
  for (const job of todo) {
    const t0 = Date.now();
    let m: Awaited<ReturnType<BatchDeps['measure']>>;
    try { m = await d.measure(job); } catch (e) {
      m = { error: e instanceof Error ? e.message : String(e), peak: 0, rms: 0, correlation: NaN, lagMs: 0, uadeEndAt: -1, nuadeEndAt: -1, windowSecs: 0, voices: 0, player: '' };
    }
    const row: ResultRow = { ...m, format: job.format, song: job.song, songPass: false, sha: job.sha, ms: Date.now() - t0 };
    row.songPass = songFailures(row).length === 0;
    d.file.rows = d.file.rows.filter((r) => !(r.format === job.format && r.song === job.song));
    d.file.rows.push(row);
    saveResults(d.path, d.file);
    log(`${row.songPass ? 'PASS' : 'FAIL'} ${job.format} ${job.song.slice(job.song.lastIndexOf('/') + 1)} corr ${Number.isFinite(row.correlation) ? row.correlation.toFixed(3) : 'n/a'} lag ${row.lagMs} ms end u${row.uadeEndAt > 0 ? row.uadeEndAt.toFixed(1) : '-'}/n${row.nuadeEndAt > 0 ? row.nuadeEndAt.toFixed(1) : '-'} (${row.ms} ms)`);
    d.afterRow?.(row);
  }
  return { ran: todo.length, skipped: selected.length - todo.length };
}
