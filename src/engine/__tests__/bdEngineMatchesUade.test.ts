/**
 * Ben Daglish plays on BdEngine (bd-wasm, our C port with live instrument
 * editing) and must sound like the original 68k player: the loudness
 * envelope of BdEngine's real worklet + WASM correlates >= 0.99 with UADE on
 * both corpus songs (the Musashi eagleplayer runner, which runs the original
 * player, measures 0.9991 / 0.9982).
 *
 * Before the fix BdEngine measured 0.948 (mickey_mouse) / 0.984 (motorhead),
 * from two Paula/host-timing gaps found by diffing against the runner:
 *  - the first tick ran at sample 0; the Amiga runs the module's init and
 *    first calls the play routine from the NEXT VBlank, so every note sounded
 *    one 20 ms tick early (mickey 0.948 -> 0.999);
 *  - the period-to-step conversion truncated the frequency to whole Hz and
 *    kept 11 fraction bits, detuning voices by up to 0.2 % - voices playing in
 *    unison beat at the wrong rate (motorhead 0.995 -> 0.998).
 * Live instrument editing still reaches the playing song.
 *
 * Each render runs in a worker with a deadline (a render that never returns
 * fails the test instead of hanging the run).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { ROOT } from './workletHarness';
import { renderFileToSamples } from '../../../tools/uade-audit/uadeRenderCore';
import { monoEnvelope, correlation } from '../../../tools/eagleplayer/eagleCompare';

const WORKER = resolve(ROOT, 'src/engine/__tests__/bdEngineRender.worker.ts');
const SECONDS = 30;
const DEADLINE_MS = 30_000;

type Done = { type: 'done'; envelope: number[]; peak: number; rms: number; instrumentCount: number; loaded: boolean; errors: string[] };
type Result = Done | { type: 'hung'; lastBlock: number };
type Edit = { instrument: number; param: string; value: number };

function renderInWorker(song: string, seconds: number, edits?: Edit[]): Promise<Result> {
  const worker = new Worker(WORKER, { workerData: { song, seconds, edits } });
  let lastBlock = -1;
  return new Promise((done, fail) => {
    const deadline = setTimeout(() => { void worker.terminate(); done({ type: 'hung', lastBlock }); }, DEADLINE_MS);
    worker.on('message', (m: Result | { type: 'progress'; block: number }) => {
      if (m.type === 'progress') { lastBlock = m.block; return; }
      clearTimeout(deadline);
      void worker.terminate();
      done(m);
    });
    worker.on('error', (e) => { clearTimeout(deadline); void worker.terminate(); fail(e); });
  });
}

function finished(r: Result): Done {
  expect(r, r.type === 'hung' ? `render never returned (hung in block ${r.lastBlock})` : '').toMatchObject({ type: 'done' });
  const d = r as Done;
  expect(d.errors).toEqual([]);
  expect(d.loaded, 'BdEngine accepted the module').toBe(true);
  return d;
}

const SONGS = [
  'public/data/songs/formats/mickey_mouse.bd',
  'public/data/songs/ben-daglish/motorhead-titleandingame.bd',
];

describe.each(SONGS)('BdEngine plays %s like the original player', (song) => {
  let r: Result;
  beforeAll(async () => { r = await renderInWorker(song, SECONDS); }, DEADLINE_MS + 10_000);

  it('loudness envelope correlates >= 0.99 with UADE over 30 s', async () => {
    const d = finished(r);
    expect(d.rms, 'audible').toBeGreaterThan(0.02);
    const uade = await renderFileToSamples(new Uint8Array(readFileSync(resolve(ROOT, song))), basename(song), { sampleRate: 48000, seconds: SECONDS });
    const ref = monoEnvelope(uade.samples, 48000);
    const n = SECONDS * 10;
    const c = correlation(d.envelope.slice(0, n), ref.slice(0, n));
    expect(c, `${basename(song)}: envelope correlation ${c.toFixed(4)}`).toBeGreaterThanOrEqual(0.99);
  }, 60_000);
});

describe('live instrument editing on the fixed engine', () => {
  it('an instrument edit reaches the playing song: every volume 0 silences it', async () => {
    const song = SONGS[1];
    const plain = finished(await renderInWorker(song, 4));
    expect(plain.instrumentCount).toBeGreaterThan(0);
    const edits = Array.from({ length: plain.instrumentCount }, (_, inst) => ({ instrument: inst, param: 'volume', value: 0 }));
    const muted = finished(await renderInWorker(song, 4, edits));
    expect(plain.rms).toBeGreaterThan(0.02);
    expect(muted.rms, 'notes set up after the edit play at the edited volume').toBeLessThan(plain.rms * 0.01);
  }, 2 * DEADLINE_MS + 10_000);
});
