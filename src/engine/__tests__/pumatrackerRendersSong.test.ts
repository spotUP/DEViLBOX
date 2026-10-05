/**
 * PumaTracker plays "liquid kids - lv1a.puma" for 30 seconds through its real
 * worklet and WASM, and every render call returns.
 *
 * It used to freeze the page: about 7 render blocks after load, the first
 * Mt_Music tick never returned. The transpiled 68k replayer waits for the
 * next raster line after stopping Paula DMA
 *   MOVE.B $DFF006,D0 / ADDQ.B #1,D0 / .w CMP.B $DFF006,D0 / BNE .w
 * and the C read VHPOSR as a plain linear-memory load, which never changes,
 * so the loop spun on the audio thread forever. Behind the hang the song was
 * also silent: ADD.L to an address register kept only the low word of the
 * module base (wrong sample pointers), BCLR/BSET and AND set no flags (every
 * volume/pitch slide stepped from zero, channel volume stayed 0), and Paula
 * applied LC/LEN writes at once instead of latching them for the next loop.
 *
 * The render runs in a worker thread with a deadline: a synchronous WASM loop
 * cannot be interrupted in-thread, so a hang must fail this test, not the run.
 */
import { describe, it, expect } from 'vitest';
import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { ROOT } from './workletHarness';

const SONG = resolve(ROOT, 'public/data/songs/pumatracker/liquid kids - lv1a.puma');
const WORKER = resolve(ROOT, 'src/engine/__tests__/pumatrackerRender.worker.ts');
const SECONDS = 30;
/** 30 s of audio renders in well under a second; a hang never finishes. */
const DEADLINE_MS = 20_000;

type Result =
  | { type: 'done'; blocks: number; peak: number; rms: number; audibleBlocks: number; errors: string[] }
  | { type: 'hung'; lastBlock: number };

function renderInWorker(): Promise<Result> {
  const worker = new Worker(WORKER, {
    workerData: { song: SONG, seconds: SECONDS },
  });
  let lastBlock = -1;
  return new Promise((done, fail) => {
    const deadline = setTimeout(() => {
      void worker.terminate();
      done({ type: 'hung', lastBlock });
    }, DEADLINE_MS);
    worker.on('message', (m: Result | { type: 'progress'; block: number }) => {
      if (m.type === 'progress') { lastBlock = m.block; return; }
      clearTimeout(deadline);
      void worker.terminate();
      done(m);
    });
    worker.on('error', (e) => { clearTimeout(deadline); void worker.terminate(); fail(e); });
  });
}

describe('PumaTracker worklet renders a real song', () => {
  it('plays 30 s of liquid kids - lv1a.puma and every render call returns', async () => {
    const r = await renderInWorker();
    expect(r, r.type === 'hung' ? `render never returned (hung in block ${r.lastBlock})` : '').toMatchObject({ type: 'done' });
    if (r.type !== 'done') return;
    expect(r.errors).toEqual([]);
    expect(r.blocks).toBe(Math.ceil((48000 * SECONDS) / 128));
    expect(r.peak, 'the song is audible').toBeGreaterThan(0.1);
    expect(r.rms, 'and plays at a real level').toBeGreaterThan(0.03);
    // a tune, not a click: most of the 30 s carries sound
    expect(r.audibleBlocks / r.blocks).toBeGreaterThan(0.8);
  }, DEADLINE_MS + 10_000);
});
