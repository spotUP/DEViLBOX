/**
 * An engine-played song replayed after Stop still feeds the dub bus.
 *
 * Reported 2026-10-06 on bomb jack.fred: the dub toggles (Wide, Wobble, ...)
 * did nothing while the master-side knobs worked. The toggles are return
 * processors, so they need the song in the bus; a native engine gets there
 * through a whole-mix tap that `startNativeEngines` registers when it routes
 * the engine. Stop unregisters the tap but the routed-engine set survives
 * until the next load, so Play after Stop skipped the routing block and the
 * tap was never registered again.
 *
 * Driven through the real start/stop functions with Fred's engine stood in and
 * a recording bus.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const taps = new Set<string>();
const isolation: Array<boolean | null> = [];
const fakeBus = {
  registerWholeMixTap: (key: string) => { taps.add(key); },
  unregisterWholeMixTap: (key: string) => { taps.delete(key); },
  setEngineIsolation: (v: boolean | null) => { isolation.push(v); },
};
vi.mock('../dub/DubBus', () => ({ getActiveDubBus: () => fakeBus }));

const fakeEngine = (() => {
  const analyser = {
    fftSize: 2048, context: { state: 'running' },
    getFloatTimeDomainData(buf: Float32Array) { buf.fill(0.1); },
    connect() {}, disconnect() {},
  };
  const context = { sampleRate: 48000, createAnalyser: () => analyser, state: 'running', currentTime: 0, destination: {}, createGain: () => ({ connect() {}, disconnect() {}, gain: { value: 1 } }) };
  const gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} };
  const output = { context, gain, connect() {}, disconnect() {} };
  return { output, ready: async () => {}, loadTune: async () => {}, play: vi.fn(), stop: vi.fn(), pause: vi.fn(), onPositionUpdate: () => () => {} };
})();

vi.mock('@/engine/fred-replayer/FredReplayerEngine', () => ({
  FredReplayerEngine: { getInstance: () => fakeEngine, hasInstance: () => true },
}));
vi.mock('../ToneEngine', () => ({
  getToneEngine: () => ({ getInstrument() {}, connectMeters() {}, stopNativeEngine() {}, getNativeEngineOutput: () => null }),
}));

const song = {
  name: 'bomb jack', format: 'FRED', patterns: [], instruments: [], songPositions: [0], songLength: 1,
  restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  fredReplayerFileData: new ArrayBuffer(16),
} as unknown as TrackerSong;

describe('a replayed engine song still feeds the dub bus', () => {
  beforeAll(async () => {
    await import('../replayer/NativeEngineRouting');
    await import('@stores/useTransportStore');
  }, 60_000);
  beforeEach(() => { taps.clear(); isolation.length = 0; });

  it('registers the whole-mix tap again when Play follows Stop', async () => {
    const routing = await import('../replayer/NativeEngineRouting');
    const routed = new Set<string>();
    routing.clearRunningEngineKeys();
    await routing.startNativeEngines(song, {} as never, false, false, routed);
    expect([...taps], 'first play').toEqual(['native:FredReplayerWasmSynth2']);

    routing.stopNativeEngines(song, routed, null);
    expect([...taps], 'stop takes the tap out').toEqual([]);

    await routing.startNativeEngines(song, {} as never, false, false, routed);
    expect([...taps], 'second play').toEqual(['native:FredReplayerWasmSynth2']);
  });
});
