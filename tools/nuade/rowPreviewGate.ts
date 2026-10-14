/**
 * Row-preview corpus gate for nuade: for every nuade corpus song, the rows at 10 %, 50 % and 90 % of the song rendered by
 * the row-preview stream from a cold seek (RowPreviewStream over NuadeRowAdapter) must equal playback's render of the same
 * frames - a linear render in 128-frame quanta - for the stereo mix and every voice, max diff 0.
 *
 * Resumable (global rule 6a): each song's verdict is written to test-data/nuade-row-preview.json as it completes and
 * recorded songs are skipped.
 *   npm run nuade-row-preview                      the songs without a verdict
 *   npm run nuade-row-preview -- --only <row id | part of a file path>
 *   npm run nuade-row-preview -- --failed          re-run the songs whose verdict is not 'pass'
 * Records per song: the row's frames, cold-seek ms (the stream's request time) and max diff.
 * Plan: thoughts/shared/plans/2026-10-14-engine-row-preview.md (N4).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { NuadeHeadless } from '../../src/engine/nuade/nuadeHeadless';
import { NUADE_FORMAT_LIST, type NuadeFormat } from '../../src/engine/nuade/nuadeFormats';
import { NuadeRowAdapter } from '../../src/engine/rowPreview/adapters/nuadeAdapter';
import { RowPreviewStream } from '../../src/engine/rowPreview/rowPreviewStream';
import { ROW_CHUNK_FRAMES, rowClipMinFrames } from '../../src/engine/rowPreview/rowClip';
import type { RowTarget } from '../../src/engine/rowPreview/rowTarget';

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'test-data/nuade-row-preview.json');
const RATE = 48000;
const ALL = 0xffffffff;
const PCTS = [0.1, 0.5, 0.9];
const CAP_FRAMES = 5 * 60 * RATE;
const SCAN = 4096;

const arg = (name: string): string | null => { const i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] ?? '') : null; };
const only = arg('--only');
const failedOnly = process.argv.includes('--failed');

interface RowRecord { pct: number; target: RowTarget; startFrame: number; frames: number; coldMs: number; maxDiff: number }
interface Verdict {
  row: string; file: string; followBy: string; verdict: 'pass' | 'fail' | 'missed' | 'error'; songFrames?: number;
  rows?: RowRecord[]; note?: string; ms: number;
}
const record: Record<string, Verdict> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const songs: { row: NuadeFormat; file: string }[] = [];
const seen = new Set<string>();
for (const row of NUADE_FORMAT_LIST) for (const file of row.corpus) {
  if (seen.has(file) || !existsSync(join(ROOT, file))) continue;
  seen.add(file);
  songs.push({ row, file });
}

const targetAt = (followBy: string, s: { order: number; row: number; tick: number; speed: number }): RowTarget => {
  if (followBy === 'orderRow') return { kind: 'orderRow', order: s.order, row: s.row };
  const speed = Math.max(1, s.speed), t = s.row * speed + s.tick;
  const from = Math.floor(t / speed) * speed;
  return { kind: 'ticks', from, to: from + speed };
};

const maxDiff = (a: Float32Array, b: Float32Array): number => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!)); return m; };

async function gate(nu: NuadeHeadless, row: NuadeFormat, file: string): Promise<Verdict> {
  const t0 = Date.now();
  const bytes = new Uint8Array(readFileSync(join(ROOT, file)));
  const name = basename(file);
  const companions = new Map<string, ArrayBuffer>();
  for (const c of row.companions?.[file] ?? []) {
    const b = readFileSync(join(ROOT, c));
    companions.set(basename(c), b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  }
  const loadArgs = [row.id, name, undefined, companions];
  const base = { row: row.id, file, followBy: row.followBy };
  const adapter = new NuadeRowAdapter(nu);

  // Pass 1: the song's length and the position at every scan step.
  adapter.open(bytes, loadArgs);
  const positions: ({ order: number; row: number; tick: number; speed: number } | null)[] = [];
  let frames = 0;
  for (;;) {
    const r = nu.render(SCAN, false);
    const s = nu.snapshot(frames);
    positions.push(s ? { order: s.order, row: s.row, tick: s.tick, speed: s.speed } : null);
    frames += r.frames;
    if (r.flags & 3 || r.frames < SCAN || frames >= CAP_FRAMES) break;
  }
  const targets = PCTS.map((pct) => {
    const pos = positions[Math.min(positions.length - 1, Math.floor((frames * pct) / SCAN))];
    return pos ? { pct, target: targetAt(row.followBy, pos) } : null;
  });
  if (targets.some((t) => !t)) return { ...base, verdict: 'missed', songFrames: frames, note: 'no position report at a scan step', ms: Date.now() - t0 };

  // Pass 2: the stream, later row first so the earlier ones are cold restarts.
  const stream = new RowPreviewStream(adapter);
  stream.ensureOpen(bytes, loadArgs);
  const rows: RowRecord[] = [];
  const clips = [];
  for (const t of targets.slice().reverse() as { pct: number; target: RowTarget }[]) {
    const c0 = performance.now();
    const res = await stream.request(t.target, ALL);
    const coldMs = Math.round(performance.now() - c0);
    if (res.kind !== 'clip') return { ...base, verdict: 'missed', songFrames: frames, note: `${t.pct}: ${res.kind}${res.kind === 'missed' ? ' ' + res.reason : ''}`, ms: Date.now() - t0 };
    clips.push({ ...t, clip: res.clip, coldMs });
  }

  // Pass 3: playback's render (linear, 128-frame quanta) over the clips' windows.
  adapter.open(bytes, loadArgs);
  nu.setMuteMask(ALL | 0);
  const wins = clips.map((c) => ({ ...c, st: new Float32Array(c.clip.frames * 2), vo: c.clip.voices ? c.clip.voices.map(() => new Float32Array(c.clip.frames)) : [] }));
  const end = Math.max(...clips.map((c) => c.clip.startFrame + c.clip.frames));
  for (let f = 0; f < end; f += ROW_CHUNK_FRAMES) {
    const r = nu.render(ROW_CHUNK_FRAMES, true);
    for (const w of wins) {
      const lo = Math.max(w.clip.startFrame, f), hi = Math.min(w.clip.startFrame + w.clip.frames, f + r.frames);
      if (hi <= lo) continue;
      w.st.set(r.stereo.subarray((lo - f) * 2, (hi - f) * 2), (lo - w.clip.startFrame) * 2);
      r.voices.forEach((v, i) => w.vo[i]?.set(v.subarray(lo - f, hi - f), lo - w.clip.startFrame));
    }
  }
  let worst = 0;
  for (const w of wins) {
    let d = maxDiff(w.clip.stereo, w.st);
    w.clip.voices?.forEach((v, i) => { d = Math.max(d, maxDiff(v, w.vo[i]!)); });
    worst = Math.max(worst, d);
    // A clip is at least MIN_ROW_PREVIEW_MS long unless the song ends first.
    if (w.clip.frames < rowClipMinFrames(RATE) && w.clip.startFrame + w.clip.frames < frames) worst = Infinity;
    rows.push({ pct: w.pct, target: w.target, startFrame: w.clip.startFrame, frames: w.clip.frames, coldMs: w.coldMs, maxDiff: d });
  }
  rows.sort((a, b) => a.pct - b.pct);
  return { ...base, verdict: worst === 0 ? 'pass' : 'fail', songFrames: frames, rows, ms: Date.now() - t0 };
}

const nu = await NuadeHeadless.create(RATE);
const todo = songs.filter(({ row, file }) => {
  if (only !== null) return row.id === only || file.includes(only);
  if (failedOnly) return record[file] !== undefined && record[file]!.verdict !== 'pass';
  return record[file] === undefined;
});
console.log(`[nuade-row-preview] ${songs.length} corpus songs, ${todo.length} to run`);
mkdirSync(dirname(OUT), { recursive: true });
let n = 0;
for (const { row, file } of todo) {
  let v: Verdict;
  try { v = await gate(nu, row, file); } catch (e) { v = { row: row.id, file, followBy: row.followBy, verdict: 'error', note: e instanceof Error ? e.message : String(e), ms: 0 }; }
  record[file] = v;
  writeFileSync(OUT, JSON.stringify(record, null, 1));
  const cold = v.rows ? `${Math.max(...v.rows.map((r) => r.coldMs))} ms` : '';
  console.log(`[${++n}/${todo.length}] ${v.verdict.padEnd(6)} ${row.id} ${basename(file)} ${v.note ?? ''} ${cold}`);
}
const all = Object.values(record);
console.log(`[nuade-row-preview] recorded ${all.length}: pass ${all.filter((v) => v.verdict === 'pass').length}, fail ${all.filter((v) => v.verdict === 'fail').length}, missed ${all.filter((v) => v.verdict === 'missed').length}, error ${all.filter((v) => v.verdict === 'error').length}`);
