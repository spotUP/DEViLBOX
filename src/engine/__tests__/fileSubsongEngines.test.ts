/**
 * The native engines of the command-stream formats play the subsong the song's grid shows
 * (lib/import/fileSubsongs). David Whittaker has its own test (dwPlaysSubsong); here Future Player,
 * Ben Daglish and the Hippel decoder, through their real worklets and WASM:
 *  - the registry hands each engine the tune as a load arg;
 *  - Future Player: the notes the Paula starts per voice are the notes the replayer's walk of THAT
 *    subsong starts (hybris.fp: subsong 0 is a three-voice tune, subsong 1 a four-voice one);
 *  - Ben Daglish: the worklet loaded on subsong N renders what the replayer renders after its own
 *    subsong switch to N, and not what subsong 0 renders (motorhead: three subsongs);
 *  - Hippel (the TFMX decoder): the track positions it reports lie in the bytes of the grid of that
 *    subsong (lethalxcess-intro.hip7: subsong 0 spans 207 steps, subsong 1 steps 155 to 183).
 * Music Assembler is wired the same way (registry load arg, worklet, layout of the tune) but the repo
 * holds no module with more than one sub-song, so it has the registry test only.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from '@/engine/__tests__/workletHarness';
import { installWasmNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { WASM_ENGINES } from '@/engine/replayer/wasmEngineRegistry';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { fpCodeSection, walkFuturePlayer, FP_WALK } from '@/lib/import/formats/fpWalk';
import { mapJochenHippel7VCells } from '@/lib/import/formats/JochenHippel7VParser';

const tuneOf = (n: number): TrackerSong => ({ fileSubsongs: { count: 9, current: n, fileName: 'x' } } as TrackerSong);

describe('the registry hands each engine the tune the grid shows', () => {
  it.each([['FuturePlayer'], ['MusicAssembler'], ['BenDaglish']])('%s: load args carry fileSubsongs.current', (key) => {
    const d = WASM_ENGINES.find((e) => e.key === key)!;
    expect(d.getLoadArgs!(tuneOf(4))).toEqual([4]);
    expect(d.getLoadArgs!({} as TrackerSong)).toEqual([0]);
  });
  it('Hippel: the TFMX decoder loads (module, no sample file, tune)', () => {
    const d = WASM_ENGINES.find((e) => e.key === 'Hippel')!;
    expect(d.getLoadArgs!(tuneOf(1))).toEqual([undefined, 1]);
    expect(d.getLoadArgs!({} as TrackerSong)).toEqual([undefined, 0]);
  });
});

describe('Future Player plays the subsong of the song', { timeout: 120_000 }, () => {
  const FILE = 'public/data/songs/formats/hybris.fp';
  const SECONDS = 8;

  /** Note starts per voice the software Paula counted after `SECONDS` of the song loaded on `subsong`. */
  async function noteStarts(subsong: number): Promise<number[]> {
    const { proc, send, posted } = await startWorklet('futureplayer', 'FuturePlayer');
    await send({ type: 'loadTune', buffer: songBuffer(FILE), subsong });
    await send({ type: 'play' });
    let last: number[] = [0, 0, 0, 0];
    for (let q = 0; q < Math.ceil((48000 * SECONDS) / 128); q++) {
      proc.process([], stereoOutputs(1));
      while (posted.length) {
        const m = posted.shift() as { type?: string; noteStarts?: number[] };
        if (m.type === 'chLevels' && m.noteStarts) last = m.noteStarts;
      }
    }
    return last;
  }

  it.each([0, 1, 3])('hybris.fp subsong %i starts the notes its walk starts, voice by voice', async (subsong) => {
    const walk = walkFuturePlayer(fpCodeSection(new Uint8Array(songBuffer(FILE))), subsong)!;
    const ticks = Math.floor(SECONDS * walk.tickHz);
    const expected = [0, 1, 2, 3].map((v) => walk.events.filter((e) => e.kind === FP_WALK.note && e.voice === v && e.tick <= ticks).length);
    const played = await noteStarts(subsong);
    // The audio is played a moment behind the render, so the last note or two of the window may not have started yet.
    played.forEach((n, v) => {
      expect(Math.abs(n - expected[v]), `voice ${v + 1}: played ${n}, walked ${expected[v]}`).toBeLessThanOrEqual(3);
    });
    expect(played.some((n) => n > 0)).toBe(true);
  });

  it('subsong 3 is not subsong 0: voice 4 sounds only in the tunes that use it', async () => {
    expect((await noteStarts(0))[3]).toBe(0);
    expect((await noteStarts(1))[3]).toBeGreaterThan(0);
  });
});

describe('Ben Daglish plays the subsong of the song', { timeout: 120_000 }, () => {
  const FILE = 'public/data/songs/ben-daglish/motorhead-titleandingame.bd';

  /** `seconds` of the song's left+right output, mono, after the module loaded (on `subsong` by the load, or switched to it after). */
  async function render(subsong: number, how: 'load' | 'switch'): Promise<Float32Array> {
    const restore = installWasmNodeFetch('bd', 'Bd');
    try {
      const { proc, send } = await startWorklet('bd', 'Bd');
      await send({ type: 'loadModule', moduleData: songBuffer(FILE), ...(how === 'load' ? { subsong } : {}) });
      if (how === 'switch') await send({ type: 'setSubsong', subsong });
      await send({ type: 'play' });
      const blocks = Math.ceil((48000 * 2) / 128);
      const out = new Float32Array(blocks * 128);
      for (let b = 0; b < blocks; b++) {
        const o = stereoOutputs(1);
        proc.process([], o);
        for (let i = 0; i < 128; i++) out[b * 128 + i] = o[0][0][i] + o[0][1][i];
      }
      return out;
    } finally { restore(); }
  }
  const same = (a: Float32Array, b: Float32Array): boolean => a.every((v, i) => v === b[i]);

  it.each([1, 2])('motorhead subsong %i: loading on it renders what switching to it renders, and not subsong 0', async (subsong) => {
    const loaded = await render(subsong, 'load');
    expect(loaded.some((v) => Math.abs(v) > 0.01), 'it sounds').toBe(true);
    expect(same(loaded, await render(subsong, 'switch'))).toBe(true);
    expect(same(loaded, await render(0, 'load'))).toBe(false);
  });
});

describe('the Hippel decoder plays the subsong of the song', { timeout: 120_000 }, () => {
  const FILE = 'public/data/songs/hippel-7v/lethalxcess-intro.hip7';

  /** Voice 0's reported (step, next pattern byte) pairs over `seconds` of the module loaded on `subsong`. */
  async function positions(subsong: number, seconds: number): Promise<Array<{ step: number; offset: number }>> {
    const { tfmxTransform } = await import('@/engine/tfmx/TFMXEngine');
    const { proc, send, posted } = await startWorklet('tfmx', 'TFMX', tfmxTransform);
    await send({ type: 'loadModule', mdatBuffer: songBuffer(FILE), smplBuffer: null, subsong });
    await send({ type: 'modulePlay' });
    const seen: Array<{ step: number; offset: number }> = [];
    for (let q = 0; q < Math.ceil((48000 * seconds) / 128); q++) {
      proc.process([], stereoOutputs(1));
      while (posted.length) {
        const m = posted.shift() as { type?: string; step?: number; patternOffset?: number };
        if (m.type === 'modulePosition' && m.step !== undefined && m.step >= 0 && m.patternOffset !== undefined && m.patternOffset >= 0) {
          seen.push({ step: m.step, offset: m.patternOffset });
        }
      }
    }
    return seen;
  }

  /** Does the reported position lie inside the bytes of voice 0's cells of that step in the grid of `subsong`? */
  function inGrid(subsong: number, p: { step: number; offset: number }): boolean {
    const spans = mapJochenHippel7VCells(new Uint8Array(songBuffer(FILE)), subsong);
    const cells = spans[p.step]?.[0]?.filter((c) => c) ?? [];
    if (cells.length === 0) return false;
    const lo = Math.min(...cells.map((c) => c!.offset));
    const hi = Math.max(...cells.map((c) => c!.offset + c!.length));
    return p.offset >= lo && p.offset <= hi;
  }

  it.each([0, 1])('lethalxcess-intro subsong %i reports positions inside the grid of that subsong', async (subsong) => {
    const seen = await positions(subsong, 8);
    expect(seen.length, 'the decoder reports positions').toBeGreaterThan(10);
    const inside = seen.filter((p) => inGrid(subsong, p)).length;
    expect(inside / seen.length).toBeGreaterThan(0.95);
  });

  it('subsong 1 reports positions the grid of subsong 0 does not hold', async () => {
    const seen = await positions(1, 8);
    const insideZero = seen.filter((p) => inGrid(0, p)).length;
    expect(insideZero / seen.length).toBeLessThan(0.5);
  });
});
