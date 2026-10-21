/**
 * KLYS-EDITS-LOST-ON-PLAY: an edit made in the klystrack editor before Play must be what Play loads.
 *
 * Drives the transport's entry (startNativeEngines) with a klystrack song whose sequence was edited through the
 * view's one write path (klysSequenceChange). The engine's memory holds the edit; the file bytes do not. The
 * recorder standing in for KlysEngine must be loaded with the engine's serialisation (call-count sentinel on
 * serializeSong), and with the file bytes when nothing was edited.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const loads: Uint8Array[] = [];
const serializeCalls = { n: 0 };
const EDITED = new Uint8Array([0xED, 0x17, 0xED]);

const fakeEngine = (() => {
  const gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} };
  const context = { sampleRate: 48000, state: 'running', currentTime: 0, destination: {}, createAnalyser: () => ({ fftSize: 2048, context: { state: 'running' }, getFloatTimeDomainData(b: Float32Array) { b.fill(0); }, connect() {}, disconnect() {} }), createGain: () => ({ connect() {}, disconnect() {}, gain }) };
  return {
    output: { context, gain, connect() {}, disconnect() {} },
    ready: async () => {},
    loadSong: async (data: ArrayBuffer | Uint8Array) => { loads.push(new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data))); return {}; },
    serializeSong: async () => { serializeCalls.n++; return EDITED.slice().buffer; },
    setSequenceEntry: vi.fn(), setPatternStep: vi.fn(),
    play: vi.fn(), stop: vi.fn(), pause: vi.fn(), onPositionUpdate: () => () => {},
  };
})();

vi.mock('@/engine/klystrack/KlysEngine', () => ({ KlysEngine: { getInstance: () => fakeEngine, hasInstance: () => true } }));
vi.mock('../../dub/DubBus', () => ({ getActiveDubBus: () => ({ registerWholeMixTap() {}, unregisterWholeMixTap() {}, setEngineIsolation() {} }) }));
vi.mock('../../ToneEngine', () => ({
  getToneEngine: () => ({ getInstrument() {}, connectMeters() {}, stopNativeEngine() {}, getNativeEngineOutput: () => null }),
}));

function makeSong(): TrackerSong {
  return {
    name: 'k', format: 'KT', patterns: [], instruments: [], songPositions: [0], songLength: 1,
    restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    klysFileData: new Uint8Array([1, 2, 3, 4]).buffer,
  } as unknown as TrackerSong;
}

describe('klystrack Play loads the edited song', () => {
  beforeAll(async () => {
    await import('@stores/useFormatStore');
    await import('../NativeEngineRouting');
    await import('@stores/useTransportStore');
  }, 60_000);
  beforeEach(() => { loads.length = 0; serializeCalls.n = 0; });

  async function play(song: TrackerSong) {
    const routing = await import('../NativeEngineRouting');
    routing.clearRunningEngineKeys();
    await routing.startNativeEngines(song, {} as never, false, false, new Set());
    routing.stopNativeEngines(song, new Set(), null);
  }

  it('loads the file bytes when nothing was edited', async () => {
    const song = makeSong();
    const { useFormatStore } = await import('@stores/useFormatStore');
    useFormatStore.setState({ klysFileData: song.klysFileData as ArrayBuffer });
    await play(song);
    expect(serializeCalls.n).toBe(0);
    expect(loads).toHaveLength(1);
    expect(Array.from(loads[0]!)).toEqual([1, 2, 3, 4]);
  });

  it('loads the engine serialisation after a sequence edit', async () => {
    const song = makeSong();
    const { useFormatStore } = await import('@stores/useFormatStore');
    useFormatStore.setState({
      klysFileData: song.klysFileData as ArrayBuffer,
      klysNative: { patterns: [], instruments: [], sequences: [{ entries: [{ position: 0, pattern: 0, noteOffset: 0 }] }] } as never,
    });
    const { klysSequenceChange } = await import('@/components/klystrack/klysEdit');
    klysSequenceChange(0, 0, 'pattern', 5);
    await vi.waitFor(() => expect(fakeEngine.setSequenceEntry).toHaveBeenCalled());
    await play(song);
    expect(serializeCalls.n).toBe(1);
    expect(loads).toHaveLength(1);
    expect(Array.from(loads[0]!)).toEqual(Array.from(EDITED));
  });
});
