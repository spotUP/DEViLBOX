/**
 * Every format in eaglePlayerFormats.ts plays on EaglePlayerEngine - UADE's
 * own sound core `score` driving the format's eagleplayer on the shared
 * Musashi host (eagleplayer-wasm, musashi-host/) - and sounds like UADE.
 *
 * Six formats (Anders 0land, Ben Daglish, Core Design, Dave Lowe, Dave Lowe
 * New, Wally Beben) had transpiled-to-C scaffolds that trapped in
 * player_load: their players patch and call 68k code inside the module,
 * which only a CPU can run. Here the real players run, through the ABI UADE
 * uses. Per format:
 *  - the real worklet + WASM render the corpus song for 30 s in a worker
 *    with a deadline (a 68k loop that never returns must fail the test, not
 *    hang the run), audibly and without errors;
 *  - the 100 ms loudness envelope of the mono sum correlates > 0.95 with
 *    UADE's render of the same file (UADE renders mono: panning 1.0), up to
 *    the player's own song end. Ben Daglish's "motorhead" scored 0.66 before
 *    the host followed Paula's audio state machine (DMA off does not stop a
 *    channel; the start interrupt comes a line later) - its audio handler
 *    stopped every note the moment it started;
 *  - the default load (parseModuleToSong) of each switched format carries
 *    the module as eaglePlayerFileData and the router plays it on
 *    EaglePlayer, not UADE.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { ROOT, loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { EAGLE_PLAYER_FORMATS, eaglePlayerModuleName, type EaglePlayerFormat } from '../eagleplayer/eaglePlayerFormats';
import { renderFileToSamples } from '../../../tools/uade-audit/uadeRenderCore';
import { monoEnvelope, correlation, comparedWindows } from '../../../tools/eagleplayer/eagleCompare';

const WORKER = resolve(ROOT, 'src/engine/__tests__/eaglePlayerRender.worker.ts');
const SECONDS = 30;
/** 30 s of audio renders in about a second; a hang never finishes. */
const DEADLINE_MS = 30_000;

type Done = { type: 'done'; blocks: number; peak: number; rms: number; audibleBlocks: number; envelope: number[]; songEndAt: number; loaded: boolean; errors: string[] };
type Result = Done | { type: 'hung'; lastBlock: number };

function renderInWorker(fmt: EaglePlayerFormat): Promise<Result> {
  const worker = new Worker(WORKER, {
    workerData: { song: fmt.corpus, player: fmt.player, moduleName: eaglePlayerModuleName(fmt, basename(fmt.corpus)), seconds: SECONDS },
  });
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

const FORMATS = Object.values(EAGLE_PLAYER_FORMATS);

describe.each(FORMATS)('$label on the Musashi host', (fmt) => {
  let r: Result;
  beforeAll(async () => { r = await renderInWorker(fmt); }, DEADLINE_MS + 10_000);

  it(`plays 30 s of ${basename(fmt.corpus)} and every render call returns`, () => {
    expect(r, r.type === 'hung' ? `render never returned (hung in block ${r.lastBlock})` : '').toMatchObject({ type: 'done' });
    if (r.type !== 'done') return;
    expect(r.errors).toEqual([]);
    expect(r.loaded, 'the eagleplayer accepted the module').toBe(true);
    expect(r.blocks).toBe(Math.ceil((48000 * SECONDS) / 128));
    expect(r.peak, 'the song is audible').toBeGreaterThan(0.05);
    expect(r.rms, 'and plays at a real level').toBeGreaterThan(0.02);
  });

  it('sounds like UADE: loudness envelope correlation > 0.95 up to the song end', async () => {
    if (r.type !== 'done') throw new Error('render did not finish');
    const name = eaglePlayerModuleName(fmt, basename(fmt.corpus));
    const uade = await renderFileToSamples(new Uint8Array(readFileSync(resolve(ROOT, fmt.corpus))), name, { sampleRate: 48000, seconds: SECONDS });
    const ref = monoEnvelope(uade.samples, 48000);
    // After the player's song end UADE's frontend moves on to another
    // subsong (its policy, not the player's); compare the song itself.
    const windows = comparedWindows(SECONDS, r.songEndAt);
    const c = correlation(r.envelope.slice(0, windows), ref.slice(0, windows));
    expect(c, `${fmt.label}: envelope correlation ${c.toFixed(4)} over ${windows / 10} s`).toBeGreaterThan(0.95);
  }, 60_000);
});

describe('mixer mask and per-voice outputs', () => {
  const rmsOf = (bufs: Float32Array[]) => Math.sqrt(bufs.reduce((s, b) => s + b.reduce((t, v) => t + v * v, 0), 0) / bufs.reduce((n, b) => n + b.length, 0));

  async function render(mask: number | null, seconds: number) {
    loadSharedWorkletScripts();
    const fmt = EAGLE_PLAYER_FORMATS.WallyBeben;
    const { proc, send } = await startWorklet('eagleplayer', 'EaglePlayer');
    await send({ type: 'loadModule', moduleData: songBuffer(fmt.corpus), playerData: songBuffer(`public/eagleplayer/players/${fmt.player}`), moduleName: eaglePlayerModuleName(fmt, basename(fmt.corpus)) });
    await send({ type: 'dubChannelEnable', channel: 0 });
    await send({ type: 'dubChannelEnable', channel: 1 });
    if (mask !== null) await send({ type: 'setMuteMask', mask });
    await send({ type: 'play' });
    const main: Float32Array[] = [], dub0: Float32Array[] = [], dub1: Float32Array[] = [];
    for (let b = 0; b < Math.ceil((48000 * seconds) / 128); b++) {
      const out = stereoOutputs(7);
      proc.process([], out);
      main.push(out[0][0], out[0][1]); dub0.push(out[5][0]); dub1.push(out[6][0]);
    }
    return { main: rmsOf(main), dub0: rmsOf(dub0), dub1: rmsOf(dub1) };
  }

  it('bit set = voice audible: mask 0 silences the mix and every voice send', async () => {
    const all = await render(null, 4);
    expect(all.main).toBeGreaterThan(0.02);
    expect(all.dub0 + all.dub1, 'voices 0 and 1 have their own outputs').toBeGreaterThan(0.01);
    const none = await render(0, 4);
    expect(none.main).toBe(0);
    expect(none.dub0 + none.dub1).toBe(0);
    const onlyV0 = await render(0b0001, 4);
    expect(onlyV0.dub1, 'a muted voice sends nothing').toBe(0);
    expect(onlyV0.dub0).toBeCloseTo(all.dub0, 6);
  }, 60_000);
});

// UADE's scan needs a browser (an AudioContext); a format whose native parser
// draws no grid hands the grid to it. Stand in for it with a classic-UADE
// shaped song so the route's retargeting is what is tested.
vi.mock('@lib/import/formats/UADEParser', () => ({
  parseUADEFile: vi.fn(async (buf: ArrayBuffer, name: string) => ({
    name, format: 'MOD', patterns: [{ id: 'p0', name: 'p0', length: 1, channels: [{ id: 'c0', name: 'c0', rows: [{ note: 49, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }] }] }],
    instruments: [{ id: 1, name: 'UADE', type: 'synth', synthType: 'UADESynth', effects: [], volume: 0, pan: 0 }],
    songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buf.slice(0), uadeEditableFileName: name,
  })),
}));

describe('the default load plays on EaglePlayer', () => {
  beforeAll(async () => { await import('@/lib/import/parseModuleToSong'); }, 240_000);

  it.each(FORMATS.filter((f) => f.isDefault))('$label: parseModuleToSong carries the module, the router picks EaglePlayer', async (fmt) => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    const bytes = readFileSync(resolve(ROOT, fmt.corpus));
    const song = await parseModuleToSong(new File([new Uint8Array(bytes)], basename(fmt.corpus)));
    expect(song.eaglePlayerId).toBe(fmt.id);
    expect(song.eaglePlayerFileData?.byteLength).toBe(bytes.length);
    expect(song.uadeEditableFileData, 'UADE does not play it').toBeUndefined();
    expect(song.instruments.some((i) => i.synthType === 'UADESynth' || i.synthType === 'UADEEditableSynth')).toBe(false);
    expect(playingEngineFor(song)).toBe('EaglePlayer');
  }, 60_000);

  it('Ben Daglish stays on BdEngine until the owner moves it (heldBecause)', async () => {
    expect(EAGLE_PLAYER_FORMATS.BenDaglish.isDefault).toBe(false);
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    const song = await parseModuleToSong(new File([new Uint8Array(readFileSync(resolve(ROOT, EAGLE_PLAYER_FORMATS.BenDaglish.corpus)))], 'mickey_mouse.bd'));
    expect(playingEngineFor(song)).toBe('BenDaglish');
  }, 60_000);
});
