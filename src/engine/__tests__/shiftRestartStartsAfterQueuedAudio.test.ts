/**
 * SHIFT-RESTART: restarting the pattern while it plays starts row 00 where the queued audio ends.
 *
 * The scheduler hands ticks up to 250 ms ahead to the synths, and those cannot be recalled. forcePosition
 * (Shift) and seekTo used to rewind the timeline to Tone.now(), so the new row 00 was scheduled on top of
 * the queued old rows; ToneEngine.getSafeTime then clamped it onto the last queued trigger and a 909 snare
 * sounded 0.5 ms after the old one, phasing into half a snare. Drives the REAL replayer through play() and
 * forcePosition / seekTo on a classic song (no libopenmpt). Sentinel: processTick ran after the jump.
 * Numbers: no tick after the jump is scheduled earlier than one tick after the last queued tick.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TrackerReplayer } from '../TrackerReplayer';
import type { TrackerSong } from '../TrackerReplayer';

const clock = vi.hoisted(() => ({ t: 10 }));

vi.mock('tone', async (orig) => {
  const transport = { bpm: { value: 125 }, state: 'stopped', stop() {}, start() {}, cancel() {}, pause() {} };
  const node = () => ({ connect() {}, disconnect() {}, dispose() {}, gain: { value: 1, rampTo() {}, setValueAtTime() {}, cancelScheduledValues() {} } });
  return { ...(await orig<object>()), Gain: function () { return node(); }, Player: function () { return { ...node(), stop() {}, volume: { value: 0 } }; }, Panner: function () { return { ...node(), pan: { value: 0 } }; }, getContext: () => ({}), start: async () => undefined, context: { rawContext: { state: 'running' }, resume: async () => undefined }, now: () => clock.t, getTransport: () => transport };
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
vi.mock('../dj/DeckScratchBuffer', () => ({
  // No AudioWorklet in node: every scratch-buffer method is a no-op.
  DeckScratchBuffer: function () { return new Proxy({}, { get: (_t, key) => (key === 'then' ? undefined : () => undefined) }); },
  TRACKER_SCRATCH_BUFFER_ID: 'tracker',
}));
vi.mock('@lib/import/wasm/OpenMPTSoundlib', () => ({ destroyModule: async () => undefined, createNewModule: async () => false }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const makeSong = (): TrackerSong => ({
  name: 'x', format: 'XM', patterns: [{ id: 'p0', name: 'p0', length: 64, channels: [] }], instruments: [],
  songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125,
} as unknown as TrackerSong);

type Jump = (r: TrackerReplayer) => void;

async function tickTimesAroundJump(jump: Jump): Promise<{ before: number[]; after: number[] }> {
  vi.useFakeTimers();
  const times: number[] = [];
  const spy = vi.spyOn(TrackerReplayer.prototype as unknown as { processTick: (t: number) => void }, 'processTick')
    .mockImplementation(function (this: unknown, t: number) { times.push(t); });
  const replayer = new TrackerReplayer();
  replayer.loadSong(makeSong());
  await replayer.play();
  vi.advanceTimersByTime(20);
  const before = times.splice(0);
  clock.t += 0.01;
  jump(replayer);
  vi.advanceTimersByTime(20);
  const after = times.splice(0);
  replayer.stop();
  await vi.dynamicImportSettled();
  spy.mockRestore();
  vi.useRealTimers();
  return { before, after };
}

describe('a pattern restart while playing starts after the queued audio', () => {
  afterEach(() => { clock.t = 10; });

  const tick = 2.5 / 125;
  const cases: Array<[string, Jump]> = [
    ['Shift restart (forcePosition)', (r) => r.forcePosition(0, 0)],
    ['seek while playing (seekTo)', (r) => r.seekTo(0, 8)],
  ];

  it.each(cases)('%s never schedules a tick on top of already-queued ticks', async (_name, jump) => {
    const { before, after } = await tickTimesAroundJump(jump);
    expect(before.length, 'the lookahead queued ticks before the jump').toBeGreaterThan(5);
    expect(after.length, 'the scheduler ran after the jump').toBeGreaterThan(0);
    const lastQueued = Math.max(...before);
    expect(Math.min(...after)).toBeGreaterThanOrEqual(lastQueued + tick - 1e-9);
  });
});
