/**
 * The row preview renders the bytes and load arguments playback would load.
 *
 * `engineLoadArgs` is the one function both startNativeEngines and previewNativeRow read the engine's module and load
 * args from. This drives a real play (startNativeEngines, nuade's engine stood in by a recorder) and asserts the
 * recorder got exactly what engineLoadArgs returns, for a song as loaded and for one whose grid was edited since.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const loads: Array<{ data: ArrayBuffer | Uint8Array; args: unknown[] }> = [];
const edited: { bytes: Uint8Array | null } = { bytes: null };

const fakeEngine = (() => {
  const gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} };
  const context = { sampleRate: 48000, state: 'running', currentTime: 0, destination: {}, createAnalyser: () => ({ fftSize: 2048, context: { state: 'running' }, getFloatTimeDomainData(b: Float32Array) { b.fill(0); }, connect() {}, disconnect() {} }), createGain: () => ({ connect() {}, disconnect() {}, gain }) };
  return {
    output: { context, gain, connect() {}, disconnect() {} },
    ready: async () => {},
    loadTune: async (data: ArrayBuffer | Uint8Array, ...args: unknown[]) => { loads.push({ data, args }); },
    play: vi.fn(), stop: vi.fn(), pause: vi.fn(), setGrid: vi.fn(), onPositionUpdate: () => () => {},
  };
})();

vi.mock('@/engine/nuade/NuadeEngine', () => ({ NuadeEngine: { getInstance: () => fakeEngine, hasInstance: () => true } }));
vi.mock('../../dub/DubBus', () => ({ getActiveDubBus: () => ({ registerWholeMixTap() {}, unregisterWholeMixTap() {}, setEngineIsolation() {} }) }));
vi.mock('../../ToneEngine', () => ({
  getToneEngine: () => ({ getInstrument() {}, connectMeters() {}, stopNativeEngine() {}, getNativeEngineOutput: () => null }),
}));
vi.mock('../editedModuleForPlay', () => ({ editedModuleForPlay: async () => edited.bytes }));

const song = {
  name: 'wicked', format: 'NUADE', patterns: [], instruments: [], songPositions: [0], songLength: 1,
  restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  nuadeFileData: new Uint8Array([1, 2, 3, 4]).buffer, nuadePlayerId: 'wallybeben', nuadeFileName: 'wicked.wb', nuadeSubsong: 2,
  uadeCompanionFiles: new Map([['wicked.smp', new Uint8Array([9]).buffer]]),
} as unknown as TrackerSong;

describe('the engine load args are what a play loads', () => {
  beforeAll(async () => {
    await import('../NativeEngineRouting');
    await import('@stores/useTransportStore');
  }, 60_000);
  beforeEach(() => { loads.length = 0; edited.bytes = null; });

  async function descOf() {
    const { WASM_ENGINES } = await import('../wasmEngineRegistry');
    return WASM_ENGINES.find((d) => d.key === 'Nuade')!;
  }

  for (const grid of ['as loaded', 'edited since the load'] as const) {
    it(`gives the bytes and arguments startNativeEngines hands loadTune (${grid})`, async () => {
      if (grid !== 'as loaded') edited.bytes = new Uint8Array([7, 7, 7]);
      const routing = await import('../NativeEngineRouting');
      routing.clearRunningEngineKeys();
      await routing.startNativeEngines(song, {} as never, false, false, new Set());
      expect(loads).toHaveLength(1);

      const got = await routing.engineLoadArgs(song, await descOf(), false);
      expect(Array.from(new Uint8Array(got.data as ArrayBuffer))).toEqual(Array.from(new Uint8Array(loads[0]!.data as ArrayBuffer)));
      expect(got.args).toEqual(loads[0]!.args);
      expect(got.args.slice(0, 3)).toEqual(['wallybeben', 'wicked.wb', 2]);
      if (grid !== 'as loaded') expect(Array.from(new Uint8Array(got.data as ArrayBuffer))).toEqual([7, 7, 7]);
      else expect(Array.from(new Uint8Array(got.data as ArrayBuffer))).toEqual([1, 2, 3, 4]);
      routing.stopNativeEngines(song, new Set(), null);
    });
  }
});
