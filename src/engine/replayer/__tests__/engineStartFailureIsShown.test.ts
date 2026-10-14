/**
 * An engine that cannot start a song says so on screen.
 *
 * UADE rejected 'aquatic games.sng' (_uade_wasm_load ret=-1) and
 * startNativeEngines only logged it: the transport read "playing" over silence
 * (RJP-SNG-INS-SILENT, 2026-10-14). This drives a real play with the engine
 * stood in by one whose load fails, and asserts the error toast; a load the
 * app cancelled itself (AbortError) stays quiet.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const failure: { err: Error | null } = { err: null };
const errors: string[] = [];

const fakeEngine = (() => {
  const gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} };
  const context = { sampleRate: 48000, state: 'running', currentTime: 0, destination: {}, createAnalyser: () => ({ fftSize: 2048, context: { state: 'running' }, getFloatTimeDomainData(b: Float32Array) { b.fill(0); }, connect() {}, disconnect() {} }), createGain: () => ({ connect() {}, disconnect() {}, gain }) };
  return {
    output: { context, gain, connect() {}, disconnect() {} },
    ready: async () => {},
    loadTune: async () => { if (failure.err) throw failure.err; },
    play: vi.fn(), stop: vi.fn(), pause: vi.fn(), setGrid: vi.fn(), onPositionUpdate: () => () => {},
  };
})();

vi.mock('@/engine/nuade/NuadeEngine', () => ({ NuadeEngine: { getInstance: () => fakeEngine, hasInstance: () => true } }));
vi.mock('../../dub/DubBus', () => ({ getActiveDubBus: () => ({ registerWholeMixTap() {}, unregisterWholeMixTap() {}, setEngineIsolation() {} }) }));
vi.mock('../../ToneEngine', () => ({
  getToneEngine: () => ({ getInstrument() {}, connectMeters() {}, stopNativeEngine() {}, getNativeEngineOutput: () => null }),
}));
vi.mock('../editedModuleForPlay', () => ({ editedModuleForPlay: async () => null }));
vi.mock('@stores/useNotificationStore', () => ({
  notify: { error: (m: string) => { errors.push(m); }, success() {}, warning() {}, info() {} },
}));

const song = {
  name: 'aquatic games', format: 'NUADE', patterns: [], instruments: [], songPositions: [0], songLength: 1,
  restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  nuadeFileData: new Uint8Array([1, 2, 3, 4]).buffer, nuadePlayerId: 'richardjoseph', nuadeFileName: 'aquatic games.sng', nuadeSubsong: 0,
} as unknown as TrackerSong;

describe('a failed engine start', () => {
  beforeAll(async () => { await import('../NativeEngineRouting'); }, 60_000);
  beforeEach(() => { errors.length = 0; failure.err = null; });

  async function play() {
    const routing = await import('../NativeEngineRouting');
    routing.clearRunningEngineKeys();
    await routing.startNativeEngines(song, {} as never, false, false, new Set());
    routing.stopNativeEngines(song, new Set(), null);
  }

  it('shows an error toast naming the engine and the cause, without the diagnostics tail', async () => {
    failure.err = new Error('UADE could not play: aquatic games.sng (ret=-1) | uade: module check failed | /uade: x');
    await play();
    expect(errors).toEqual(['Nuade could not start this song: UADE could not play: aquatic games.sng (ret=-1)']);
  });

  it('stays quiet for a load the app cancelled itself', async () => {
    const cancelled = new Error('Scan cancelled');
    cancelled.name = 'AbortError';
    failure.err = cancelled;
    await play();
    expect(errors).toEqual([]);
  });

  it('shows nothing when the engine starts', async () => {
    await play();
    expect(errors).toEqual([]);
  });
});
