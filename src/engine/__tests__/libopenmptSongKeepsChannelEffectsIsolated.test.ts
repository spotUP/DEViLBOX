/**
 * LIBOPENMPT-ISOLATION: a classic song playing on libopenmpt keeps the channel-targeted effects in the engine's slots.
 *
 * ONE wiring test through the product's entry point (TrackerReplayer.play / stop / loadSong) with the REAL replayer
 * and a stub LibopenmptEngine whose isPlaying() is false (the latched flag the old resolver trusted). Sentinel:
 * startWithCoordinator ran once. Numbers: the isolation engine is the stub while the song plays and null after stop,
 * after loadSong, and a DJ deck never registers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrackerReplayer } from '../TrackerReplayer';
import { getPlayingIsolationEngine, getActiveIsolationEngine, setPlayingIsolationEngine } from '../tone/ChannelRoutedEffects';
import type { TrackerSong } from '../TrackerReplayer';

const stub = vi.hoisted(() => ({
  startWithCoordinator: vi.fn(async () => ({ started: true })),
  addIsolation: vi.fn(), removeIsolation: vi.fn(),
  getWorkletNode: vi.fn(() => null), getAudioContext: vi.fn(() => null),
  isAvailable: vi.fn(() => true),
  isPlaying: vi.fn(() => false),
  stop: vi.fn(), onPosition: null, onPositionTick: null, onEnded: null,
}));

vi.mock('@engine/libopenmpt/LibopenmptEngine', () => ({ LibopenmptEngine: { getInstance: () => stub }, getLibopenmptSync: () => stub }));
// Tone needs a Web Audio context the test host lacks: the replayer's own nodes are inert stand-ins.
vi.mock('tone', async (orig) => {
  const transport = { bpm: { value: 125 }, state: 'stopped', stop() {}, start() {}, cancel() {}, pause() {} };
  const node = () => ({ connect() {}, disconnect() {}, dispose() {}, gain: { value: 1, rampTo() {} } });
  return { ...(await orig<object>()), Gain: function () { return node(); }, Player: function () { return { ...node(), stop() {}, volume: { value: 0 } }; }, Panner: function () { return { ...node(), pan: { value: 0 } }; }, getContext: () => ({}), start: async () => undefined, context: { rawContext: { state: 'running' }, resume: async () => undefined }, now: () => 0, getTransport: () => transport };
});
vi.mock('../StereoSeparationNode', () => ({
  StereoSeparationNode: function () { return { inputTone: {}, outputTone: { connect() {}, disconnect() {} }, setMode() {}, dispose() {} }; },
}));
vi.mock('@/utils/audio-context', async (orig) => ({ ...(await orig<object>()), getNativeAudioNode: () => null }));
vi.mock('../ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => undefined });
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useMixerStore', async (orig) => ({ ...(await orig<object>()), scheduleWasmEffectRebuild: vi.fn() }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const makeSong = (): TrackerSong => ({
  name: 'x', format: 'MOD', patterns: [{ id: 'p0', name: 'p0', length: 4, channels: [] }], instruments: [],
  songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125,
  libopenmptFileData: new ArrayBuffer(16),
} as unknown as TrackerSong);

describe('a libopenmpt song is the isolation engine while it plays', () => {
  beforeEach(() => { setPlayingIsolationEngine(null); stub.startWithCoordinator.mockClear(); });

  it('registers on play, unregisters on stop and on loadSong; a DJ deck never registers', async () => {
    const replayer = new TrackerReplayer();
    replayer.loadSong(makeSong());
    await replayer.play();
    expect(stub.startWithCoordinator, 'the libopenmpt branch ran').toHaveBeenCalledTimes(1);
    expect(stub.isPlaying()).toBe(false);
    expect(getPlayingIsolationEngine()).toBe(stub);
    expect(await getActiveIsolationEngine()).toBe(stub);

    replayer.stop();
    expect(getPlayingIsolationEngine()).toBeNull();

    await replayer.play();
    expect(getPlayingIsolationEngine()).toBe(stub);
    replayer.loadSong(makeSong());
    expect(getPlayingIsolationEngine()).toBeNull();
    replayer.dispose?.();

    const deck = new TrackerReplayer({ connect() {} } as never);
    deck.loadSong(makeSong());
    await deck.play();
    expect(stub.startWithCoordinator, 'the deck also started libopenmpt').toHaveBeenCalledTimes(3);
    expect(getPlayingIsolationEngine()).toBeNull();
    deck.stop();
  });
});
