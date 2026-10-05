/**
 * Worker half of pumatrackerRendersSong.test.ts: runs the real PumaTracker
 * worklet + WASM in its own thread, so a render that never returns can be
 * killed by the test (a synchronous WASM loop cannot be interrupted from the
 * thread it runs on). Loaded as native ESM by Node's type stripping, hence
 * the explicit `.ts` import.
 *
 * Posts { type: 'progress', block } as it goes and { type: 'done', ... } at
 * the end; the last progress message says how far a hung render got.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness.ts';

const { song, seconds } = workerData as { song: string; seconds: number };
const port = parentPort!;

const { proc, send, posted } = await startWorklet('pumatracker', 'PumaTracker', undefined, 'Pumatracker');
await send({ type: 'loadModule', moduleData: songBuffer(song) });

const blocks = Math.ceil((48000 * seconds) / 128);
let peak = 0;
let sumSq = 0;
let audibleBlocks = 0;
for (let block = 0; block < blocks; block++) {
  port.postMessage({ type: 'progress', block });
  const out = stereoOutputs(1);
  proc.process([], out);
  let blockPeak = 0;
  for (const ch of out[0]) for (const v of ch) { sumSq += v * v; blockPeak = Math.max(blockPeak, Math.abs(v)); }
  if (blockPeak > 1e-3) audibleBlocks++;
  peak = Math.max(peak, blockPeak);
}

port.postMessage({
  type: 'done',
  blocks,
  peak,
  rms: Math.sqrt(sumSq / (blocks * 128 * 2)),
  audibleBlocks,
  errors: posted.filter((m) => m.type === 'error').map((m) => m.message),
});
