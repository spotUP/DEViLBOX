/**
 * CHANGE-POSITION-WHILE-PLAYING: a position change while a native engine plays reaches that engine.
 *
 * TrackerReplayer.seekTo used to move only its own pointers (and forward to libopenmpt). A native engine that owns
 * the clock (Furnace's WASM sequencer, the registry engines) played on where it was, and its next position report
 * snapped the replayer and the order list back. Drives the real seekTo dispatch with the engine state set:
 * Furnace gets seqSeek(order, row), a registry engine with a start seam is restarted at the new position, one without
 * stays where it is and says so.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TrackerReplayer } from '../TrackerReplayer';
import type { TrackerSong } from '../TrackerReplayer';

const h = vi.hoisted(() => ({
  seqSeek: vi.fn(),
  seams: { running: false, withoutStartAt: [] as string[] },
  warning: vi.fn(),
}));

vi.mock('tone', async (orig) => {
  const transport = { bpm: { value: 125 }, state: 'stopped', stop() {}, start() {}, cancel() {}, pause() {} };
  const node = () => ({ connect() {}, disconnect() {}, dispose() {}, gain: { value: 1, rampTo() {}, setValueAtTime() {}, cancelScheduledValues() {} } });
  return { ...(await orig<object>()), Gain: function () { return node(); }, Player: function () { return { ...node(), stop() {}, volume: { value: 0 } }; }, Panner: function () { return { ...node(), pan: { value: 0 } }; }, getContext: () => ({}), start: async () => undefined, context: { rawContext: { state: 'running' }, resume: async () => undefined }, now: () => 10, getTransport: () => transport };
});
vi.mock('../StereoSeparationNode', () => ({
  StereoSeparationNode: function () { return { inputTone: {}, outputTone: { connect() {}, disconnect() {} }, setMode() {}, dispose() {} }; },
}));
vi.mock('../ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => undefined });
  return { getToneEngine: () => engine };
});
vi.mock('../dj/DeckScratchBuffer', () => ({
  DeckScratchBuffer: function () { return new Proxy({}, { get: (_t, key) => (key === 'then' ? undefined : () => undefined) }); },
  TRACKER_SCRATCH_BUFFER_ID: 'tracker',
}));
vi.mock('@lib/import/wasm/OpenMPTSoundlib', () => ({ destroyModule: async () => undefined, createNewModule: async () => false }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: h.warning, info: vi.fn() } }));
vi.mock('@engine/furnace-dispatch/FurnaceDispatchEngine', () => ({
  FurnaceDispatchEngine: { getInstance: () => ({ seqSeek: h.seqSeek }) },
}));
vi.mock('../replayer/NativeEngineRouting', async (orig) => ({
  ...(await orig<object>()),
  runningEngineStartSeams: () => h.seams,
}));

/** The replayer's engine-state flags seekTo dispatches on. */
interface EngineFlags { playing: boolean; useWasmSequencer: boolean }

const song = (): TrackerSong => ({
  name: 'x', format: 'XM', instruments: [], numChannels: 4, initialSpeed: 6, initialBPM: 125, restartPosition: 0,
  patterns: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `p${i}`, length: 64, channels: [] })),
  songPositions: [0, 1, 2, 3], songLength: 4,
} as unknown as TrackerSong);

function playingReplayer(flags: Partial<EngineFlags>): TrackerReplayer {
  const r = new TrackerReplayer();
  r.loadSong(song());
  Object.assign(r as unknown as EngineFlags, { playing: true, ...flags });
  return r;
}

describe('seek while playing reaches the native engine', () => {
  afterEach(() => {
    h.seqSeek.mockClear();
    h.warning.mockClear();
    h.seams = { running: false, withoutStartAt: [] };
    vi.restoreAllMocks();
  });

  it('Furnace WASM sequencer is seeked to the new order and row', async () => {
    const r = playingReplayer({ useWasmSequencer: true });
    r.seekTo(2, 5);
    await vi.dynamicImportSettled();
    expect(h.seqSeek).toHaveBeenCalledWith(2, 5);
    expect(r.getCurrentPosition()).toBe(2);
  });

  it('a registry engine with a start seam restarts at the new position', () => {
    h.seams = { running: true, withoutStartAt: [] };
    const stop = vi.spyOn(TrackerReplayer.prototype, 'stop').mockImplementation(function (this: TrackerReplayer) {
      (this as unknown as EngineFlags).playing = false;
    });
    const play = vi.spyOn(TrackerReplayer.prototype, 'play').mockResolvedValue(undefined);
    const r = playingReplayer({});
    r.seekTo(3, 0);
    expect(stop).toHaveBeenCalledWith(false);
    expect(play).toHaveBeenCalledTimes(1);
    expect(r.getCurrentPosition()).toBe(3);
  });

  it('a registry engine without a start seam stays where it plays and says so', () => {
    h.seams = { running: true, withoutStartAt: ['Klystrack'] };
    const play = vi.spyOn(TrackerReplayer.prototype, 'play').mockResolvedValue(undefined);
    const r = playingReplayer({});
    r.seekTo(3, 0);
    expect(play).not.toHaveBeenCalled();
    expect(r.getCurrentPosition()).toBe(0);
    expect(h.warning).toHaveBeenCalledWith(expect.stringContaining('Klystrack'));
  });
});
