/**
 * The David Whittaker engine plays the subsong the song's grid shows.
 *
 * apb.dw holds 8 subsongs; subsong 0 is a two-voice tune, subsong 1 the four-voice one. The real
 * worklet and WASM load the module on a subsong (the load arg DavidWhittakerEngine.loadTune posts,
 * which the registry fills from song.fileSubsongs) and render it: the voices that sound are the
 * voices the replayer's walk of THAT subsong starts notes on, and a stop returns to it (it used to
 * return to subsong 0, so play after a stop played another tune).
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer } from '@/engine/__tests__/workletHarness';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { walkDavidWhittaker, DW_WALK } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { WASM_ENGINES } from '@/engine/replayer/wasmEngineRegistry';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const APB = 'public/data/songs/formats/apb.dw';

/** Peak per voice over `seconds` of playback of subsong `subsong`; `stopFirst` plays, stops and plays again. */
async function voicePeaks(subsong: number, seconds: number, stopFirst = false): Promise<number[]> {
  const { davidwhittakerTransform } = await import('@/engine/davidwhittaker/DavidWhittakerEngine');
  const { proc, send } = await startWorklet('davidwhittaker', 'DavidWhittaker', davidwhittakerTransform, 'DavidWhittaker');
  await send({ type: 'loadModule', moduleData: songBuffer(APB), subsong });
  await send({ type: 'play' });
  const peaks = [0, 0, 0, 0];
  const run = (blocks: number) => {
    for (let q = 0; q < blocks; q++) {
      const out = [[new Float32Array(128), new Float32Array(128)]];
      proc.process([], out);
      const ch = proc.chBufs as Float32Array[];
      for (let c = 0; c < 4; c++) for (let i = 0; i < 128; i++) peaks[c] = Math.max(peaks[c], Math.abs(ch[c][i]));
    }
  };
  if (stopFirst) {
    run(200);
    await send({ type: 'stop' });
    peaks.fill(0);
    await send({ type: 'play' });
  }
  run(Math.ceil((48000 * seconds) / 128));
  return peaks;
}

/** The voices the replayer's walk starts a note on in the first `ticks` ticks of subsong `subsong`. */
async function walkedVoices(subsong: number, ticks: number): Promise<number[]> {
  const walk = await walkDavidWhittaker(songBuffer(APB), 60_000, subsong);
  return [...new Set(walk.events.filter((e) => e.kind === DW_WALK.note && e.tick < ticks).map((e) => e.channel))].sort();
}

describe('DavidWhittakerEngine plays the subsong of the song', { timeout: 120_000 }, () => {
  it('the registry hands the engine the subsong the grid was built from', () => {
    const dw = WASM_ENGINES.find((e) => e.key === 'DavidWhittakerReplayer')!;
    expect(dw.getLoadArgs!({ fileSubsongs: { count: 8, current: 3, fileName: 'apb.dw' } } as TrackerSong)).toEqual([3]);
    expect(dw.getLoadArgs!({} as TrackerSong)).toEqual([0]);
  });

  it.each([0, 1, 4])('apb.dw subsong %i sounds on the voices its walk starts notes on', async (subsong) => {
    const restore = installDwNodeFetch();
    try {
      const seconds = 8;
      const expected = await walkedVoices(subsong, seconds * 50);
      const peaks = await voicePeaks(subsong, seconds);
      const sounding = peaks.map((p, c) => (p > 0.001 ? c : -1)).filter((c) => c >= 0);
      expect(sounding).toEqual(expected);
    } finally { restore(); }
  });

  it('subsong 1 is the four-voice tune and subsong 0 is not', async () => {
    const restore = installDwNodeFetch();
    try {
      expect(await walkedVoices(0, 400)).toEqual([0, 1]);
      expect(await walkedVoices(1, 400)).toEqual([0, 1, 2, 3]);
    } finally { restore(); }
  });

  it('play after a stop plays the subsong that was loaded, not subsong 0', async () => {
    const restore = installDwNodeFetch();
    try {
      const peaks = await voicePeaks(1, 8, true);
      expect(peaks[2]).toBeGreaterThan(0.001);
      expect(peaks[3]).toBeGreaterThan(0.001);
    } finally { restore(); }
  });
});
