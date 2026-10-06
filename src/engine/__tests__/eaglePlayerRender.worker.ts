/**
 * Worker half of eaglePlayerPlaysFormats.test.ts: runs the real EaglePlayer
 * worklet + WASM (eagleplayer-wasm, UADE's score on the Musashi host) in its
 * own thread, so a 68k player that never returns can be killed by the test
 * (a synchronous WASM loop cannot be interrupted from the thread it runs on).
 * Loaded as native ESM by Node's type stripping, hence the `.ts` import.
 *
 * Posts { type: 'progress', block } as it goes and { type: 'done', ... } at
 * the end: the 100 ms mono loudness envelope (what the UADE comparison
 * correlates), the second the player reported its song end, and level stats.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, startWorklet, stereoOutputs } from './workletHarness.ts';

const { song, player, moduleName, seconds, companions = [] } = workerData as { song: string; player: string; moduleName: string; seconds: number; companions?: string[] };
const port = parentPort!;
const bytes = (p: string) => { const b = readFileSync(resolve(ROOT, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

const { proc, send, posted } = await startWorklet('eagleplayer', 'EaglePlayer');
await send({
  type: 'loadModule', moduleData: bytes(song), playerData: bytes(`public/eagleplayer/players/${player}`), moduleName,
  files: companions.map((c) => ({ name: c.split('/').pop(), data: bytes(c) })),
});
await send({ type: 'play' });

const SR = 48000, BLOCK = 128, WINDOW = SR / 10;
const blocks = Math.ceil((SR * seconds) / BLOCK);
const envelope: number[] = [];
let winSum = 0, winN = 0, peak = 0, sumSq = 0, audibleBlocks = 0, songEndAt = -1;
for (let block = 0; block < blocks; block++) {
  port.postMessage({ type: 'progress', block });
  const out = stereoOutputs(5);
  proc.process([], out);
  const [L, R] = out[0];
  let blockPeak = 0;
  for (let i = 0; i < BLOCK; i++) {
    const m = L[i] + R[i];
    winSum += m * m;
    if (++winN === WINDOW) { envelope.push(Math.sqrt(winSum / WINDOW)); winSum = 0; winN = 0; }
    sumSq += L[i] * L[i] + R[i] * R[i];
    blockPeak = Math.max(blockPeak, Math.abs(L[i]), Math.abs(R[i]));
  }
  if (blockPeak > 1e-3) audibleBlocks++;
  peak = Math.max(peak, blockPeak);
  if (songEndAt < 0 && posted.some((m) => m.type === 'songEnd')) songEndAt = ((block + 1) * BLOCK) / SR;
}

port.postMessage({
  type: 'done',
  blocks, peak, audibleBlocks, envelope, songEndAt,
  rms: Math.sqrt(sumSq / (blocks * BLOCK * 2)),
  loaded: posted.some((m) => m.type === 'moduleLoaded'),
  errors: posted.filter((m) => m.type === 'error').map((m) => m.message),
});
