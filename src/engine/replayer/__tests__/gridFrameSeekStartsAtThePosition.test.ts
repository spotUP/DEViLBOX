/**
 * Play / Play Pattern on a native WASM engine starts at the replayer position, not at position 01 (PLAY-FROM-POS-ALL).
 *
 * Wired: the transport start (startNativeEngines, as TrackerReplayer.play calls it) hands every engine whose registry
 * descriptor opts into GRID_FRAME_SEEK the grid row's output frame through startAt (instance.seekFrames) before play().
 * Sentinel: the mock engine's seekFrames / play calls, in order, per opted-in descriptor.
 * Behaviour of the worklet side (render and discard up to the frame, first audible block equals the target block) is in
 * src/engine/__tests__/seekFramesWorklet.test.ts, against the real WASM.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
const SAMPLE_RATE = 48000;
const engine = vi.hoisted(() => {
  // Web Audio stand-in: any member is a callable that returns another stand-in (routing after play() only wires nodes).
  const node = (extra: Record<string, unknown> = {}): unknown => new Proxy(function () {}, {
    get: (_t, p) => (p in extra ? extra[p as string] : p === 'then' ? undefined : node()),
    apply: () => node(),
  });
  const target: Record<string, unknown> = {
    ready: async () => {},
    loadTune: async () => {},
    loadSong: async () => {},
    seekFrames: (frame: number) => { calls.push(`seekFrames:${frame}`); },
    play: () => { calls.push('play'); },
    output: node({ context: node({ sampleRate: 48000 }) }),
  };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p as string] : (p === 'then' ? undefined : () => undefined)),
  });
});
vi.mock('@/engine/ToneEngine', () => {
  const t = { releaseAll: vi.fn(), getInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => t };
});

function makeSong(fileDataKey: string): never {
  const rows = (n: number) => Array.from({ length: n }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 }));
  const pattern = { id: 'p', name: 'p', length: 64, channels: [{ id: 'c', rows: rows(64) }] };
  return {
    name: 't', format: 'MOD', patterns: [pattern], instruments: [], songPositions: [0, 0, 0], songLength: 3,
    restartPosition: 0, numChannels: 1, initialSpeed: 6, initialBPM: 125,
    [fileDataKey]: new ArrayBuffer(16),
  } as never;
}

describe('grid frame seek at the transport start', () => {
  beforeEach(() => { calls.length = 0; });

  it('every opted-in descriptor seeks its engine to the row frame, then plays; position 0 row 0 plays plainly', async () => {
    const { WASM_ENGINES } = await import('@/engine/replayer/wasmEngineRegistry');
    const { gridStartFrame } = await import('@/engine/replayer/gridStartFrame');
    const { startNativeEngines, clearRunningEngineKeys } = await import('@/engine/replayer/NativeEngineRouting');
    const opted = WASM_ENGINES.filter((d) => d.startFrames === 'grid' && d.startAt);
    expect(opted.length).toBe(20);
    for (const desc of opted) {
      const song = makeSong(desc.fileDataKey as string);
      const expected = gridStartFrame(song, 2, 8, SAMPLE_RATE);
      expect(expected, desc.key).toBeGreaterThan(0);
      const real = desc.dynamicResolver;
      desc.dynamicResolver = async () => ({ hasInstance: () => true, getInstance: () => engine }) as never;
      try {
        clearRunningEngineKeys();
        calls.length = 0;
        await startNativeEngines(song, {} as never, false, false, new Set(), { songPos: 2, row: 8 });
        expect(calls, desc.key).toEqual([`seekFrames:${expected}`, 'play']);

        clearRunningEngineKeys();
        calls.length = 0;
        await startNativeEngines(song, {} as never, false, false, new Set(), { songPos: 0, row: 0 });
        expect(calls, desc.key).toEqual(['play']);
      } finally {
        desc.dynamicResolver = real;
        clearRunningEngineKeys();
      }
    }
  }, 60000);
});
