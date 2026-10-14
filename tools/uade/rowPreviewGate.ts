/**
 * Row-preview corpus gate for the UADE family: for every corpus song, rows at 10 %, 50 % and 90 % of the song (of its first
 * minute) rendered by the row-preview stream from a cold seek (RowPreviewStream over the engine's adapter) must equal
 * playback's render of the same frames - one linear pass in 128-frame quanta on a second private instance - for the stereo
 * mix and every voice, max diff 0.
 *
 *   --engine uade         (default) UADE.wasm over the sound-check corpus (test-data/uade-corpus-sweep.json, rows that PLAY):
 *                         each song's rows are named as frame ranges (the opaque player's and a clockless grid's naming) and,
 *                         where the player's interrupt count runs, as player-tick rows too (a row of 6 interrupts).
 *   --engine eagleplayer  EaglePlayer.wasm over the formats in eaglePlayerFormats.ts: rows named in player ticks.
 *
 * Resumable (global rule 6a): each song's verdict is written to test-data/<engine>-row-preview.json as it completes and
 * recorded songs are skipped.
 *   npm run uade-row-preview [-- --engine eagleplayer]               the songs without a verdict
 *   npm run uade-row-preview -- --only <part of a file path>         one song, re-run
 *   npm run uade-row-preview -- --failed                             the songs whose verdict is not 'pass'
 * Records per song: each row's frames, cold-seek ms (the stream's request time) and max diff.
 * Plan: thoughts/shared/plans/2026-10-14-engine-row-preview.md (U4).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { startWorklet } from '../../src/engine/__tests__/workletHarness';
import { UadeRowAdapter, type UadeRowArgs } from '../../src/engine/rowPreview/adapters/uadeAdapter';
import { EaglePlayerRowAdapter, type EaglePlayerWasm } from '../../src/engine/rowPreview/adapters/eaglePlayerAdapter';
import { EAGLE_PLAYER_FORMATS } from '../../src/engine/eagleplayer/eaglePlayerFormats';
import { RowPreviewStream, type RowRenderAdapter } from '../../src/engine/rowPreview/rowPreviewStream';
import { ROW_CHUNK_FRAMES, rowClipMinFrames, type RowChunk, type RowClip } from '../../src/engine/rowPreview/rowClip';
import { uadeMask } from '../../src/engine/uade/uadeLoadArgs';
import type { RowTarget } from '../../src/engine/rowPreview/rowTarget';
import type { UadeWasm } from '../../src/engine/uade/uadeWasmInstance';
import { refreshHeap } from '../uade-audit/uadeRenderCore';

const ROOT = join(import.meta.dirname, '../..');
const RATE = 48000;
const PCTS = [0.1, 0.5, 0.9];
const CAP_FRAMES = 60 * RATE;
const SCAN = 4096;
const ROW_FRAMES = 5292;

const arg = (name: string): string | null => { const i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] ?? '') : null; };
const engine = (arg('--engine') ?? 'uade') as 'uade' | 'eagleplayer';
const only = arg('--only');
const failedOnly = process.argv.includes('--failed');
const OUT = join(ROOT, `test-data/${engine}-row-preview.json`);

interface RowRecord { kind: string; target: RowTarget; startFrame: number; frames: number; coldMs: number; maxDiff: number }
interface Verdict { file: string; verdict: 'pass' | 'fail' | 'missed' | 'error'; songFrames?: number; rows?: RowRecord[]; note?: string; ms: number }
const record: Record<string, Verdict> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const buf = (path: string): ArrayBuffer => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

interface Song { file: string; args: (companions: Map<string, ArrayBuffer>) => unknown[]; companions: string[] }
const songs: Song[] = [];
if (engine === 'uade') {
  const sweep = JSON.parse(readFileSync(join(ROOT, 'test-data/uade-corpus-sweep.json'), 'utf8')) as Record<string, { verdict: string; companions?: string[] }>;
  for (const [key, row] of Object.entries(sweep)) {
    if (row.verdict !== 'PLAYS') continue;
    const file = `public/data/songs/formats/${key}`;
    if (!existsSync(join(ROOT, file))) continue;
    songs.push({ file, companions: (row.companions ?? []).map((c) => join(dirname(file), c)), args: (c) => [basename(file), 0, false, c.size ? c : undefined, { kind: 'player' }] });
  }
} else {
  for (const fmt of Object.values(EAGLE_PLAYER_FORMATS)) {
    if (!existsSync(join(ROOT, fmt.corpus))) continue;
    songs.push({ file: fmt.corpus, companions: fmt.companions ?? [], args: (c) => [fmt.id, basename(fmt.corpus), undefined, c.size ? c : undefined] });
  }
}

async function newUade(): Promise<UadeWasm> {
  const mod = await loadUADEModule(false);
  mod._uade_wasm_init(RATE);
  return new Proxy(mod, { get(t, k) { if (k === 'HEAPU8' || k === 'HEAPF32') refreshHeap(t); return Reflect.get(t, k); } }) as unknown as UadeWasm;
}
async function newEaglePlayer(): Promise<EaglePlayerWasm> {
  const { proc } = await startWorklet('eagleplayer', 'EaglePlayer');
  return (proc as unknown as { module: EaglePlayerWasm }).module;
}
const makeAdapter = async (): Promise<RowRenderAdapter & { prepare?(a: unknown[]): Promise<void> }> =>
  engine === 'uade'
    ? new UadeRowAdapter(await newUade(), RATE, newUade)
    : new EaglePlayerRowAdapter(await newEaglePlayer(), RATE, async (url) => buf(join(ROOT, 'public', decodeURIComponent(url))));

const maxDiff = (a: Float32Array, b: Float32Array): number => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!)); return m; };
const MASK = engine === 'uade' ? uadeMask(0xF, 0) : 0xF;

async function gate(adapter: RowRenderAdapter & { prepare?(a: unknown[]): Promise<void> }, ref: RowRenderAdapter & { prepare?(a: unknown[]): Promise<void> }, song: Song): Promise<Verdict> {
  const t0 = Date.now();
  const bytes = new Uint8Array(buf(join(ROOT, song.file)));
  const companions = new Map(song.companions.map((c) => [basename(c), buf(join(ROOT, c))] as [string, ArrayBuffer]));
  const args = song.args(companions);
  const base = { file: song.file };
  await adapter.prepare?.(args, bytes);
  await ref.prepare?.(args, bytes);

  // Pass 1: the song's length (to the cap) and the player's clock at every scan step.
  ref.open(bytes, args);
  let frames = 0;
  const ticks: number[] = [];
  for (;;) {
    const c = ref.renderChunk(SCAN, MASK);
    ticks.push(ref.positionAt(frames + c.frames - 1)?.tick ?? -1);
    frames += c.frames;
    if (c.flags & 3 || c.frames < SCAN || frames >= CAP_FRAMES) break;
  }
  if (frames < ROW_FRAMES * 2) return { ...base, verdict: 'missed', songFrames: frames, note: 'shorter than two rows', ms: Date.now() - t0 };

  const targets: { kind: string; target: RowTarget }[] = [];
  for (const pct of PCTS) {
    const f = Math.floor((frames * pct) / SCAN) * SCAN + 1234;
    if (engine === 'uade') targets.push({ kind: `frames ${pct}`, target: { kind: 'frames', from: f, to: f + ROW_FRAMES } });
    // The player's interrupt count, where it runs (EaglePlayer's tick count always does): a row of 6 ticks.
    const q = ticks[Math.floor(f / SCAN)] ?? -1;
    if (q >= 0) {
      const from = Math.floor(q / 6) * 6;
      targets.push({ kind: `ticks ${pct}`, target: { kind: 'ticks', from, to: from + 6 } });
    }
  }
  if (!targets.length) return { ...base, verdict: 'missed', songFrames: frames, note: 'no row to name', ms: Date.now() - t0 };

  // Pass 2: the stream, later rows first so the earlier ones are cold restarts.
  const stream = new RowPreviewStream(adapter);
  stream.ensureOpen(bytes, args);
  const clips: { kind: string; target: RowTarget; clip: RowClip; coldMs: number }[] = [];
  for (const t of targets.slice().sort((a, b) => rowStart(b.target) - rowStart(a.target))) {
    const c0 = performance.now();
    const res = await stream.request(t.target, MASK);
    const coldMs = Math.round(performance.now() - c0);
    if (res.kind !== 'clip') return { ...base, verdict: 'missed', songFrames: frames, note: `${t.kind}: ${res.kind}${res.kind === 'missed' ? ' ' + res.reason : ''}`, ms: Date.now() - t0 };
    clips.push({ ...t, clip: res.clip, coldMs });
  }

  // Pass 3: playback's render (linear, 128-frame quanta) over the clips' windows.
  ref.open(bytes, args);
  const wins = clips.map((c) => ({ ...c, st: new Float32Array(c.clip.frames * 2), vo: c.clip.voices ? c.clip.voices.map(() => new Float32Array(c.clip.frames)) : [] }));
  const end = Math.max(...clips.map((c) => c.clip.startFrame + c.clip.frames));
  for (let f = 0; f < end; f += ROW_CHUNK_FRAMES) {
    const r: RowChunk = ref.renderChunk(ROW_CHUNK_FRAMES, MASK);
    for (const w of wins) {
      const lo = Math.max(w.clip.startFrame, f), hi = Math.min(w.clip.startFrame + w.clip.frames, f + r.frames);
      if (hi <= lo) continue;
      w.st.set(r.stereo.subarray((lo - f) * 2, (hi - f) * 2), (lo - w.clip.startFrame) * 2);
      r.voices?.forEach((v, i) => w.vo[i]?.set(v.subarray(lo - f, hi - f), lo - w.clip.startFrame));
    }
  }
  let worst = 0;
  const rows: RowRecord[] = [];
  for (const w of wins) {
    let d = maxDiff(w.clip.stereo, w.st);
    w.clip.voices?.forEach((v, i) => { d = Math.max(d, maxDiff(v, w.vo[i]!)); });
    worst = Math.max(worst, d);
    // A clip is at least MIN_ROW_PREVIEW_MS long unless the song ends first.
    if (w.clip.frames < rowClipMinFrames(RATE) && w.clip.startFrame + w.clip.frames < frames) worst = Infinity;
    rows.push({ kind: w.kind, target: w.target, startFrame: w.clip.startFrame, frames: w.clip.frames, coldMs: w.coldMs, maxDiff: d });
  }
  return { ...base, verdict: worst === 0 ? 'pass' : 'fail', songFrames: frames, rows, ms: Date.now() - t0 };
}

const rowStart = (t: RowTarget): number => (t.kind === 'orderRow' ? t.order * 1e6 + t.row : t.from);

const todo = songs.filter(({ file }) => {
  if (only !== null) return file.includes(only);
  if (failedOnly) return record[file] !== undefined && record[file]!.verdict !== 'pass';
  return record[file] === undefined;
});
console.log(`[${engine}-row-preview] ${songs.length} corpus songs, ${todo.length} to run`);
mkdirSync(dirname(OUT), { recursive: true });
let adapter = await makeAdapter();
let ref = await makeAdapter();
let n = 0;
for (const song of todo) {
  let v: Verdict;
  try { v = await gate(adapter, ref, song); } catch (e) {
    v = { file: song.file, verdict: 'error', note: e instanceof Error ? e.message : String(e), ms: 0 };
    // A module that killed its instance (an unguarded exit) is replaced; the next song starts clean.
    adapter = await makeAdapter(); ref = await makeAdapter();
  }
  record[song.file] = v;
  writeFileSync(OUT, JSON.stringify(record, null, 1));
  const cold = v.rows ? `${Math.max(...v.rows.map((r) => r.coldMs))} ms` : '';
  console.log(`[${++n}/${todo.length}] ${v.verdict.padEnd(6)} ${basename(song.file)} ${v.note ?? ''} ${cold}`);
}
const all = Object.values(record);
console.log(`[${engine}-row-preview] recorded ${all.length}: pass ${all.filter((v) => v.verdict === 'pass').length}, fail ${all.filter((v) => v.verdict === 'fail').length}, missed ${all.filter((v) => v.verdict === 'missed').length}, error ${all.filter((v) => v.verdict === 'error').length}`);
