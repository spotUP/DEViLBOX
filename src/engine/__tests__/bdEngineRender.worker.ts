/**
 * Worker half of bdEngineMatchesUade.test.ts: runs BdEngine's real worklet +
 * WASM (public/bd, bd-wasm) in its own thread, so a render that never returns
 * is killed by the test's deadline instead of hanging the run.
 * Loaded as native ESM by Node's type stripping, hence the `.ts` import.
 *
 * workerData: { song, seconds, edits? } - `edits` are setInstrumentParam
 * messages sent after the load (the live instrument editor's path).
 * Posts { type: 'progress', block } as it goes and { type: 'done', ... }: the
 * 100 ms mono loudness envelope (what the UADE comparison correlates) and
 * level stats.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, startWorklet, stereoOutputs } from './workletHarness.ts';

type Edit = { instrument: number; param: string; value: number };
const { song, seconds, edits } = workerData as { song: string; seconds: number; edits?: Edit[] };
const port = parentPort!;
const b = readFileSync(resolve(ROOT, song));

const { proc, send, posted } = await startWorklet('bd', 'Bd');
await send({ type: 'loadModule', moduleData: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
await send({ type: 'getInstrumentCount' });
for (const e of edits ?? []) await send({ type: 'setInstrumentParam', ...e });

const SR = 48000, BLOCK = 128, WINDOW = SR / 10;
const blocks = Math.ceil((SR * seconds) / BLOCK);
const envelope: number[] = [];
let winSum = 0, winN = 0, peak = 0, sumSq = 0;
for (let block = 0; block < blocks; block++) {
  port.postMessage({ type: 'progress', block });
  const out = stereoOutputs(1);
  proc.process([], out);
  const [L, R] = out[0];
  for (let i = 0; i < BLOCK; i++) {
    const m = L[i] + R[i];
    winSum += m * m;
    if (++winN === WINDOW) { envelope.push(Math.sqrt(winSum / WINDOW)); winSum = 0; winN = 0; }
    sumSq += L[i] * L[i] + R[i] * R[i];
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
}

port.postMessage({
  type: 'done',
  envelope, peak,
  rms: Math.sqrt(sumSq / (blocks * BLOCK * 2)),
  instrumentCount: (posted.find((m) => m.type === 'instrumentCount') as { count?: number } | undefined)?.count ?? 0,
  loaded: posted.some((m) => m.type === 'moduleLoaded'),
  errors: posted.filter((m) => m.type === 'error').map((m) => m.message),
});
